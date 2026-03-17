import Capacitor

@objc(BridgeViewController)
public class BridgeViewController: CAPBridgeViewController {
    override public func viewDidLoad() {
        super.viewDidLoad()
        if bridge == nil {
            NSLog("MultiShotCamera: bridge is nil in viewDidLoad")
        } else {
            NSLog("MultiShotCamera: registering in viewDidLoad")
            bridge?.registerPluginType(MultiShotCameraPlugin.self)
        }
    }

    override public func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        if bridge == nil {
            NSLog("MultiShotCamera: bridge is nil in viewDidAppear")
        } else {
            NSLog("MultiShotCamera: registering in viewDidAppear")
            bridge?.registerPluginType(MultiShotCameraPlugin.self)
        }
    }
}
