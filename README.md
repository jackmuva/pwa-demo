## iOS (Capacitor) — Bluetooth wrapper

Web Bluetooth (`navigator.bluetooth`) does not exist in any iOS browser or home-screen
PWA, because every iOS web context runs on WebKit. To get Bluetooth on iPhone we wrap the
web app in a thin [Capacitor](https://capacitorjs.com) native shell that loads the live
Vercel URL and bridges BLE calls to native CoreBluetooth via
[`@capacitor-community/bluetooth-le`](https://github.com/capacitor-community/bluetooth-le).

After the Capacitor packages are installed
(`@capacitor/core`, `@capacitor/cli`, `@capacitor/ios` — all v8 to match the BLE plugin),
the iOS project was generated with these steps:

**1. Create `capacitor.config.ts`** — the native shell loads the remote Vercel site and
Capacitor injects the bridge, so `webDir` is required but unused at runtime:

```ts
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ai.plaud.pwademo',
  appName: 'Plaud PWA Demo',
  webDir: 'public',
  server: {
    url: 'https://pwa-demo-plaud.vercel.app',
    cleartext: false,
  },
};

export default config;
```

**2. Generate the native iOS project** (must run *after* the config exists):

```bash
npx cap add ios
```

This scaffolds the `ios/` Xcode project and registers the BLE plugin. Re-run
`npx cap sync ios` any time the config or installed plugins change.

**3. Add the Bluetooth capability keys to `ios/App/App/Info.plist`** — without the usage
description the app crashes on first Bluetooth use. Add `bluetooth-central` to
`UIBackgroundModes` only if BLE must run while the app is backgrounded:

```xml
<key>NSBluetoothAlwaysUsageDescription</key>
<string>Uses Bluetooth to connect and interact with peripheral BLE devices.</string>
<key>UIBackgroundModes</key>
<array>
    <string>bluetooth-central</string>
</array>
```

To build and run: `npx cap open ios`, set a signing Team in Xcode, and run on a **physical
device** (BLE does not work in the Simulator). Because `server.url` points at Vercel, the
app runs whatever is currently deployed there — deploy web changes before testing on device.

**3. Running on XCode**
```bash
npx cap open ios
```
