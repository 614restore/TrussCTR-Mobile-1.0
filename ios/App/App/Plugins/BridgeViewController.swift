import Capacitor

@objc(BridgeViewController)
public class BridgeViewController: CAPBridgeViewController {

    // With Capacitor 8, registerPluginType() is ignored when autoRegisterPlugins
    // is enabled. Registering an explicit plugin instance ensures this inline
    // app plugin is exported to JS alongside the package-based plugins.
    override public func capacitorDidLoad() {
        bridge?.registerPluginInstance(MultiShotCameraPlugin())
    }
}
