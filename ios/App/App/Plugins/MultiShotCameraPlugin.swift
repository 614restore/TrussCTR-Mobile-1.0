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

    // Dedicated serial queue for all AVCaptureSession work — never run
    // session operations on the main thread or it will block the UI and
    // can cause a blank/frozen preview.
    private let sessionQueue = DispatchQueue(label: "com.trussctrl.camera.session")
    private let session = AVCaptureSession()
    private let photoOutput = AVCapturePhotoOutput()
    private var previewLayer: AVCaptureVideoPreviewLayer?
    private var capturedURLs: [String] = []

    private let captureButton = UIButton(type: .custom)
    private let doneButton   = UIButton(type: .system)
    private let cancelButton = UIButton(type: .system)
    private let countLabel   = UILabel()

    // Hiding the status bar removes the overlap entirely — no need to
    // guess about inset sizes across different device families.
    override var prefersStatusBarHidden: Bool { true }
    override var prefersHomeIndicatorAutoHidden: Bool { false }

    // MARK: - Lifecycle

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        setupUI()
        // Configure the capture session on the background queue so the
        // main thread stays free for UI updates.
        sessionQueue.async { [weak self] in self?.configureSession() }
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        // The preview layer uses a CALayer frame (not Auto Layout), so we
        // must update it manually whenever the view's bounds change —
        // including the first real layout after presentation.
        previewLayer?.frame = view.bounds
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        sessionQueue.async { [weak self] in self?.session.startRunning() }
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        sessionQueue.async { [weak self] in self?.session.stopRunning() }
    }

    // MARK: - Session setup

    private func configureSession() {
        session.beginConfiguration()
        session.sessionPreset = .photo

        guard
            let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back),
            let input  = try? AVCaptureDeviceInput(device: device),
            session.canAddInput(input)
        else {
            session.commitConfiguration()
            DispatchQueue.main.async { [weak self] in self?.showCameraUnavailableAlert() }
            return
        }

        session.addInput(input)
        if session.canAddOutput(photoOutput) {
            session.addOutput(photoOutput)
        }
        session.commitConfiguration()

        // The preview layer must be created and attached on the main thread.
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            let layer = AVCaptureVideoPreviewLayer(session: self.session)
            layer.videoGravity = .resizeAspectFill
            layer.frame = self.view.bounds          // will be corrected in viewDidLayoutSubviews
            self.view.layer.insertSublayer(layer, at: 0)
            self.previewLayer = layer
        }
    }

    private func showCameraUnavailableAlert() {
        let alert = UIAlertController(
            title: "Camera Unavailable",
            message: "Could not access the camera. Please check Settings → Privacy → Camera.",
            preferredStyle: .alert
        )
        alert.addAction(UIAlertAction(title: "OK", style: .default) { [weak self] _ in
            self?.onCancel?()
            self?.dismiss(animated: true)
        })
        present(alert, animated: true)
    }

    // MARK: - UI setup

    private func setupUI() {
        // --- Shutter button ---
        captureButton.translatesAutoresizingMaskIntoConstraints = false
        captureButton.backgroundColor = .white
        captureButton.layer.cornerRadius = 36
        captureButton.layer.borderWidth  = 4
        captureButton.layer.borderColor  = UIColor(white: 0.75, alpha: 1).cgColor
        captureButton.addTarget(self, action: #selector(takePicture), for: .touchUpInside)

        // --- Done ---
        doneButton.translatesAutoresizingMaskIntoConstraints = false
        doneButton.setTitle("Done", for: .normal)
        doneButton.setTitleColor(.white, for: .normal)
        doneButton.titleLabel?.font = .boldSystemFont(ofSize: 17)
        addTextShadow(to: doneButton)
        doneButton.addTarget(self, action: #selector(finish), for: .touchUpInside)

        // --- Cancel ---
        cancelButton.translatesAutoresizingMaskIntoConstraints = false
        cancelButton.setTitle("Cancel", for: .normal)
        cancelButton.setTitleColor(.white, for: .normal)
        cancelButton.titleLabel?.font = .systemFont(ofSize: 17)
        addTextShadow(to: cancelButton)
        cancelButton.addTarget(self, action: #selector(cancelTapped), for: .touchUpInside)

        // --- Photo count ---
        countLabel.translatesAutoresizingMaskIntoConstraints = false
        countLabel.textColor = .white
        countLabel.font      = .boldSystemFont(ofSize: 15)
        countLabel.text      = "0 photos"
        countLabel.layer.shadowColor   = UIColor.black.cgColor
        countLabel.layer.shadowOpacity = 0.8
        countLabel.layer.shadowRadius  = 3
        countLabel.layer.shadowOffset  = CGSize(width: 0, height: 1)

        view.addSubview(captureButton)
        view.addSubview(doneButton)
        view.addSubview(cancelButton)
        view.addSubview(countLabel)

        // Anchored to safeAreaLayoutGuide so they stay clear of the
        // Dynamic Island / notch at the top and the home indicator at
        // the bottom. The 44-pt minimum heights ensure the tap targets
        // are always reachable.
        NSLayoutConstraint.activate([
            // Shutter: centred, well above the home-indicator area
            captureButton.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            captureButton.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -32),
            captureButton.widthAnchor.constraint(equalToConstant: 72),
            captureButton.heightAnchor.constraint(equalToConstant: 72),

            // Count: just above shutter
            countLabel.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            countLabel.bottomAnchor.constraint(equalTo: captureButton.topAnchor, constant: -14),

            // Cancel: top-left, safe-area + 16 pt extra breathing room
            cancelButton.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 20),
            cancelButton.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 16),
            cancelButton.heightAnchor.constraint(greaterThanOrEqualToConstant: 44),

            // Done: top-right, mirror of Cancel
            doneButton.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -20),
            doneButton.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 16),
            doneButton.heightAnchor.constraint(greaterThanOrEqualToConstant: 44),
        ])
    }

    /// Adds a subtle drop-shadow so button text is legible over any camera scene.
    private func addTextShadow(to button: UIButton) {
        button.layer.shadowColor   = UIColor.black.cgColor
        button.layer.shadowOffset  = CGSize(width: 0, height: 1)
        button.layer.shadowOpacity = 0.7
        button.layer.shadowRadius  = 2
    }

    // MARK: - Actions

    @objc private func takePicture() {
        let settings = AVCapturePhotoSettings()
        settings.flashMode = .auto
        photoOutput.capturePhoto(with: settings, delegate: self)
    }

    @objc private func finish() {
        onDone?(capturedURLs)
        dismiss(animated: true)
    }

    @objc private func cancelTapped() {
        onCancel?()
        dismiss(animated: true)
    }

    // MARK: - AVCapturePhotoCaptureDelegate

    func photoOutput(_ output: AVCapturePhotoOutput,
                     didFinishProcessingPhoto photo: AVCapturePhoto,
                     error: Error?) {
        guard error == nil, let data = photo.fileDataRepresentation() else { return }

        let fileName  = "capture_\(Int(Date().timeIntervalSince1970 * 1000)).jpg"
        let baseURL   = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first
                        ?? FileManager.default.temporaryDirectory
        let storedURL = baseURL.appendingPathComponent(fileName)

        do {
            try data.write(to: storedURL, options: .atomic)
            capturedURLs.append(storedURL.absoluteString)
            DispatchQueue.main.async { [weak self] in
                guard let self = self else { return }
                self.countLabel.text = "\(self.capturedURLs.count) photo\(self.capturedURLs.count == 1 ? "" : "s")"
            }
            if saveMode == "photo_library" { saveToPhotoLibrary(data: data) }
        } catch {
            // Silently skip write failures — photo simply won't appear in the list
        }
    }

    // MARK: - Photo library save

    private func saveToPhotoLibrary(data: Data) {
        let saveBlock = {
            PHPhotoLibrary.shared().performChanges {
                let request = PHAssetCreationRequest.forAsset()
                request.addResource(with: .photo, data: data, options: nil)
            }
        }

        let status = PHPhotoLibrary.authorizationStatus(for: .addOnly)
        switch status {
        case .authorized, .limited:
            saveBlock()
        case .notDetermined:
            PHPhotoLibrary.requestAuthorization(for: .addOnly) { newStatus in
                if newStatus == .authorized || newStatus == .limited { saveBlock() }
            }
        default:
            break
        }
    }
}
