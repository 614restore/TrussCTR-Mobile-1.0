import Capacitor

class BridgeViewController: CAPBridgeViewController {
    override func viewDidLoad() {
        super.viewDidLoad()
        bridge?.registerPluginInstance(MultiShotCameraPlugin())
    }
}
