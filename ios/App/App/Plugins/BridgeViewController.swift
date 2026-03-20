import Capacitor

@objc(BridgeViewController)
public class BridgeViewController: CAPBridgeViewController {

    // capacitorDidLoad() is called after the Capacitor bridge is fully
    // initialised and all npm plugins are registered. This is the correct
    // lifecycle point to register inline (non-npm) plugins such as
    // MultiShotCameraPlugin so that Capacitor.isPluginAvailable() always
    // returns true on the JS side.
    override public func capacitorDidLoad() {
        bridge?.registerPluginType(MultiShotCameraPlugin.self)
    }
}
