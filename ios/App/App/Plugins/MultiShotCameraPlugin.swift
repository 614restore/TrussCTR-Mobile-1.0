import Foundation
import Capacitor
import AVFoundation
import UIKit
import Photos

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
                self.savedCall?.resolve(["photos": urls])
                self.savedCall = nil
                self.cameraController = nil
            }
            controller.onCancel = {
                self.savedCall?.resolve(["photos": []])
                self.savedCall = nil
                self.cameraController = nil
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

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        setupSession()
        setupUI()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        session.startRunning()
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        session.stopRunning()
    }

    private func setupSession() {
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
        let settings = AVCapturePhotoSettings()
        settings.flashMode = .off
        output.capturePhoto(with: settings, delegate: self)
    }

    @objc private func finish() {
        onDone?(capturedURLs)
        dismiss(animated: true)
    }

    @objc private func cancel() {
        onCancel?()
        dismiss(animated: true)
    }

    func photoOutput(_ output: AVCapturePhotoOutput, didFinishProcessingPhoto photo: AVCapturePhoto, error: Error?) {
        guard error == nil, let data = photo.fileDataRepresentation() else { return }
        let fileName = "capture_\(Int(Date().timeIntervalSince1970 * 1000)).jpg"
        let documentsURL = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first
        let storedURL = (documentsURL ?? FileManager.default.temporaryDirectory).appendingPathComponent(fileName)
        do {
            try data.write(to: storedURL, options: .atomic)
            capturedURLs.append(storedURL.absoluteString)
            countLabel.text = "\(capturedURLs.count)"
            if saveMode == "photo_library" {
                saveToPhotoLibrary(data: data)
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
