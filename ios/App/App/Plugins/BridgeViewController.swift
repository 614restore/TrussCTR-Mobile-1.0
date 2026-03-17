import Capacitor

@objc(BridgeViewController)
public class BridgeViewController: CAPBridgeViewController {
    override func viewDidLoad() {
        super.viewDidLoad()
        bridge?.registerPluginInstance(MultiShotCameraPlugin())
    }
}
