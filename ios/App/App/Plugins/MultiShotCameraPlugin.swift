import Foundation
import Capacitor
import AVFoundation
import UIKit
import Photos
import CoreGraphics

@objc(MultiShotCameraPlugin)
public class MultiShotCameraPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "MultiShotCameraPlugin"
    public let jsName = "MultiShotCamera"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "open", returnType: CAPPluginReturnPromise)
    ]
    private var cameraController: MultiShotCameraViewController?
    private var savedCall: CAPPluginCall?

    @objc public func open(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.savedCall = call
            let controller = MultiShotCameraViewController()
            controller.saveMode = call.getString("saveMode") ?? "app_files"
            controller.onDone = { urls in
                controller.dismiss(animated: true) {
                    self.savedCall?.resolve(["photos": urls])
                    self.savedCall = nil
                    self.cameraController = nil
                }
            }
            controller.onCancel = {
                controller.dismiss(animated: true) {
                    self.savedCall?.resolve(["photos": []])
                    self.savedCall = nil
                    self.cameraController = nil
                }
            }

            self.cameraController = controller
            if let presenting = self.bridge?.viewController {
                controller.modalPresentationStyle = .fullScreen
                presenting.present(controller, animated: true)
            } else {
                call.reject("No presenting view controller")
            }
        }
    }
}

@objc(LightCompressorPlugin)
public class LightCompressorPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LightCompressorPlugin"
    public let jsName = "LightCompressor"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "compressImage", returnType: CAPPluginReturnPromise)
    ]

    @objc public func compressImage(_ call: CAPPluginCall) {
        guard let base64 = call.getString("base64"), !base64.isEmpty else {
            call.reject("Missing required base64 image payload")
            return
        }

        let maxWidth = max(call.getInt("maxWidth") ?? 2048, 1)
        let maxHeight = max(call.getInt("maxHeight") ?? 1536, 1)
        let quality = min(max(call.getFloat("quality") ?? 0.84, 0.1), 1.0)

        DispatchQueue.global(qos: .userInitiated).async {
            do {
                let decodedData = Data(base64Encoded: base64) ?? Data(base64Encoded: Self.stripDataUrlPrefix(base64))
                guard let imageData = decodedData, let image = UIImage(data: imageData) else {
                    DispatchQueue.main.async {
                        call.reject("Invalid image data")
                    }
                    return
                }

                let resized = Self.resizeImage(image, maxWidth: CGFloat(maxWidth), maxHeight: CGFloat(maxHeight))
                guard let jpeg = resized.jpegData(compressionQuality: CGFloat(quality)) else {
                    DispatchQueue.main.async {
                        call.reject("Failed to compress image")
                    }
                    return
                }

                DispatchQueue.main.async {
                    call.resolve([
                        "base64": jpeg.base64EncodedString(),
                        "width": Int(resized.size.width),
                        "height": Int(resized.size.height),
                        "size": jpeg.count
                    ])
                }
            }
        }
    }

    private static func stripDataUrlPrefix(_ value: String) -> String {
        if let comma = value.firstIndex(of: ",") {
            return String(value[value.index(after: comma)...])
        }
        return value
    }

    private static func resizeImage(_ image: UIImage, maxWidth: CGFloat, maxHeight: CGFloat) -> UIImage {
        let sourceSize = image.size
        guard sourceSize.width > 0 && sourceSize.height > 0 else { return image }

        let widthRatio = maxWidth / sourceSize.width
        let heightRatio = maxHeight / sourceSize.height
        let scale = min(widthRatio, heightRatio, 1.0)

        if scale >= 1.0 {
            return image
        }

        let targetSize = CGSize(
            width: floor(sourceSize.width * scale),
            height: floor(sourceSize.height * scale)
        )
        let format = UIGraphicsImageRendererFormat.default()
        format.opaque = true
        format.scale = 1
        let renderer = UIGraphicsImageRenderer(size: targetSize, format: format)
        return renderer.image { _ in
            image.draw(in: CGRect(origin: .zero, size: targetSize))
        }
    }
}

final class MultiShotCameraViewController: UIViewController, AVCapturePhotoCaptureDelegate {
    var onDone: (([String]) -> Void)?
    var onCancel: (() -> Void)?
    var saveMode: String = "app_files"

    private let session = AVCaptureSession()
    private let output = AVCapturePhotoOutput()
    private var previewLayer: AVCaptureVideoPreviewLayer?
    private var capturedURLs: [String] = []

    private let captureButton = UIButton(type: .custom)
    private let doneButton = UIButton(type: .system)
    private let countLabel = UILabel()
    private var isCaptureInFlight = false

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        setupUI()
        configureSession()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        if !session.isRunning {
            session.startRunning()
        }
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        if session.isRunning {
            session.stopRunning()
        }
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        previewLayer?.frame = view.bounds
    }

    private func configureSession() {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            setupSession()
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
                guard granted else { return }
                DispatchQueue.main.async {
                    self?.setupSession()
                }
            }
        default:
            break
        }
    }

    private func setupSession() {
        guard session.inputs.isEmpty else { return }
        session.beginConfiguration()
        session.sessionPreset = .photo

        guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back),
              let input = try? AVCaptureDeviceInput(device: device),
              session.canAddInput(input) else {
            return
        }
        session.addInput(input)

        if session.canAddOutput(output) {
            session.addOutput(output)
        }

        session.commitConfiguration()

        let preview = AVCaptureVideoPreviewLayer(session: session)
        preview.videoGravity = .resizeAspectFill
        preview.frame = view.bounds
        view.layer.insertSublayer(preview, at: 0)
        previewLayer = preview
    }

    private func setupUI() {
        captureButton.translatesAutoresizingMaskIntoConstraints = false
        captureButton.backgroundColor = .white
        captureButton.layer.cornerRadius = 32
        captureButton.layer.borderWidth = 4
        captureButton.layer.borderColor = UIColor.lightGray.cgColor
        captureButton.addTarget(self, action: #selector(capturePhoto), for: .touchUpInside)

        doneButton.translatesAutoresizingMaskIntoConstraints = false
        doneButton.setTitle("Done", for: .normal)
        doneButton.setTitleColor(.white, for: .normal)
        doneButton.titleLabel?.font = .boldSystemFont(ofSize: 16)
        doneButton.addTarget(self, action: #selector(finish), for: .touchUpInside)

        countLabel.translatesAutoresizingMaskIntoConstraints = false
        countLabel.textColor = .white
        countLabel.font = .boldSystemFont(ofSize: 14)
        countLabel.text = "0"

        let cancelButton = UIButton(type: .system)
        cancelButton.translatesAutoresizingMaskIntoConstraints = false
        cancelButton.setTitle("Cancel", for: .normal)
        cancelButton.setTitleColor(.white, for: .normal)
        cancelButton.titleLabel?.font = .systemFont(ofSize: 14)
        cancelButton.addTarget(self, action: #selector(cancel), for: .touchUpInside)

        view.addSubview(captureButton)
        view.addSubview(doneButton)
        view.addSubview(countLabel)
        view.addSubview(cancelButton)

        NSLayoutConstraint.activate([
            captureButton.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            captureButton.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -24),
            captureButton.widthAnchor.constraint(equalToConstant: 64),
            captureButton.heightAnchor.constraint(equalToConstant: 64),

            doneButton.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -16),
            doneButton.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 12),

            cancelButton.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 16),
            cancelButton.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 12),

            countLabel.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            countLabel.bottomAnchor.constraint(equalTo: captureButton.topAnchor, constant: -12),
        ])
    }

    @objc private func capturePhoto() {
        guard !isCaptureInFlight else { return }
        isCaptureInFlight = true
        captureButton.isEnabled = false
        let settings = AVCapturePhotoSettings()
        settings.flashMode = .off
        output.capturePhoto(with: settings, delegate: self)
    }

    @objc private func finish() {
        onDone?(capturedURLs)
    }

    @objc private func cancel() {
        onCancel?()
    }

    func photoOutput(_ output: AVCapturePhotoOutput, didFinishProcessingPhoto photo: AVCapturePhoto, error: Error?) {
        defer {
            DispatchQueue.main.async {
                self.isCaptureInFlight = false
                self.captureButton.isEnabled = true
            }
        }

        guard error == nil, let data = photo.fileDataRepresentation() else { return }
        let fileName = "capture_\(UUID().uuidString).jpg"
        let cachesURL = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first
        let storedURL = (cachesURL ?? FileManager.default.temporaryDirectory).appendingPathComponent(fileName)
        let storedData: Data

        if let image = UIImage(data: data), let compressedData = image.jpegData(compressionQuality: 0.82) {
            storedData = compressedData
        } else {
            storedData = data
        }

        do {
            try storedData.write(to: storedURL, options: .atomic)
            DispatchQueue.main.async {
                self.capturedURLs.append(storedURL.path)
                self.countLabel.text = "\(self.capturedURLs.count)"
            }
            if saveMode == "photo_library" {
                saveToPhotoLibrary(data: storedData)
            }
        } catch {
            // ignore write failures
        }
    }

    private func saveToPhotoLibrary(data: Data) {
        let saveBlock = {
            PHPhotoLibrary.shared().performChanges({
                let request = PHAssetCreationRequest.forAsset()
                request.addResource(with: .photo, data: data, options: nil)
            })
        }

        let status = PHPhotoLibrary.authorizationStatus(for: .addOnly)
        switch status {
        case .authorized, .limited:
            saveBlock()
        case .notDetermined:
            PHPhotoLibrary.requestAuthorization(for: .addOnly) { newStatus in
                if newStatus == .authorized || newStatus == .limited {
                    saveBlock()
                }
            }
        default:
            break
        }
    }
}
