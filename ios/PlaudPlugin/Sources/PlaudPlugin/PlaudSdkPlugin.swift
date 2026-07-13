import Foundation
import Capacitor
import PlaudDeviceBasicSDK

/// Capacitor bridge over Plaud's native iOS SDK.
///
/// Capacitor auto-registers any class that is `@objc`, subclasses `CAPPlugin`, and
/// conforms to `CAPBridgedPlugin` — the same mechanism the bluetooth-le plugin uses.
/// The JS side reaches this via `registerPlugin('PlaudSdk')`.
///
/// This first cut wires the connection lifecycle round-trip: `initSDK` → `startScan`,
/// with the SDK's delegate callbacks forwarded to JS as plugin events. File listing,
/// download/export, and WiFi transfer are deliberately left out until this is proven
/// on-device.
@objc(PlaudSdk)
public class PlaudSdkPlugin: CAPPlugin, CAPBridgedPlugin, PlaudDeviceAgentProtocol {
    public let identifier = "PlaudSdk"
    public let jsName = "PlaudSdk"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "initSDK", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startScan", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopScan", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isConnected", returnType: CAPPluginReturnPromise)
    ]

    // MARK: - Methods exposed to JS

    @objc func initSDK(_ call: CAPPluginCall) {
        guard let token = call.getString("userAccessToken"), !token.isEmpty else {
            call.reject("userAccessToken is required")
            return
        }
        guard let domain = call.getString("customDomain"), !domain.isEmpty else {
            call.reject("customDomain is required (domain only, no https://)")
            return
        }
        DispatchQueue.main.async {
            let agent = PlaudDeviceAgent.shared
            agent.delegate = self
            agent.initSDK(userAccessToken: token, customDomain: domain)
            call.resolve()
        }
    }

    @objc func startScan(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            PlaudDeviceAgent.shared.startScan()
            call.resolve()
        }
    }

    @objc func stopScan(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            PlaudDeviceAgent.shared.stopScan()
            call.resolve()
        }
    }

    @objc func isConnected(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            call.resolve(["connected": PlaudDeviceAgent.shared.isConnected()])
        }
    }

    // MARK: - PlaudDeviceAgentProtocol

    // Required member of the protocol. Surfaces the handshake/pen state to JS.
    public func blePenState(state: Int, privacy: Int, keyState: Int, uDisk: Int,
                            findMyToken: Int, hasSndpKey: Int, deviceAccessToken: Int) {
        notify("penState", [
            "state": state,
            "privacy": privacy,
            "keyState": keyState,
            "uDisk": uDisk,
            "findMyToken": findMyToken,
            "hasSndpKey": hasSndpKey,
            "deviceAccessToken": deviceAccessToken
        ])
    }

    public func bleScanResult(bleDevices: [BleDevice]) {
        let devices = bleDevices.map { d -> [String: Any] in
            [
                "name": d.name,
                "uuid": d.uuid,
                "serialNumber": d.serialNumber,
                "rssi": d.rssi,
                "supportWiFi": d.supportWiFi
            ]
        }
        notify("scanResult", ["devices": devices])
    }

    public func bleScanOverTime() {
        notify("scanTimeout", [:])
    }

    public func bleConnectState(state: Int) {
        // 1 = connected, 0 = disconnected
        notify("connectState", ["connected": state == 1, "state": state])
    }

    public func bleBind(sn: String?, status: Int, protVersion: Int, timezone: Int) {
        notify("bind", ["sn": sn as Any, "status": status, "protVersion": protVersion])
    }

    // MARK: - Helpers

    private func notify(_ event: String, _ data: [String: Any]) {
        DispatchQueue.main.async { [weak self] in
            self?.notifyListeners(event, data: data)
        }
    }
}
