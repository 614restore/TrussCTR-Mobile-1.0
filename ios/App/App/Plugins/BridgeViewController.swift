import Capacitor

@objc(BridgeViewController)
public class BridgeViewController: CAPBridgeViewController {
    override public func viewDidLoad() {
        super.viewDidLoad()
        bridge?.registerPluginType(MultiShotCameraPlugin.self)
    }
}
