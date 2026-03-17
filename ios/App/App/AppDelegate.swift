import UIKit
import Capacitor
import AVFoundation

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        CAPBridge.registerPlugins([MultiShotCameraPlugin.self])
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}

@objc(BridgeViewController)
public class BridgeViewController: CAPBridgeViewController {
    override public func viewDidLoad() {
        super.viewDidLoad()
        bridge?.registerPluginInstance(MultiShotCameraPlugin())
    }
}

@objc(MultiShotCamera)
public class MultiShotCameraPlugin: CAPPlugin {
    private var savedCall: CAPPluginCall?
    private var cameraController: MultiShotCameraViewController?

    @objc func open(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.savedCall = call
            let controller = MultiShotCameraViewController()
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
        let fileName = "capture_\\(Int(Date().timeIntervalSince1970 * 1000)).jpg"
        let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent(fileName)
        do {
            try data.write(to: tempURL)
            capturedURLs.append(tempURL.absoluteString)
            countLabel.text = "\\(capturedURLs.count)"
        } catch {
            // ignore write failures
        }
    }
}
