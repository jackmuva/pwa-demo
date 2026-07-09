"use client";
import { useEffect, useState } from "react";
import { BleClient, type BleDevice } from "@capacitor-community/bluetooth-le";

export default function Home() {
  const [devices, setDevices] = useState<BleDevice[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const pageDiv = document.getElementById("mainDiv");
    const handlePointerUp = async () => {
      try {
        // Safe to call repeatedly; sets up the BLE stack (CoreBluetooth on iOS,
        // Web Bluetooth in the browser).
        await BleClient.initialize();
        // No service/name filter => the plugin shows all nearby devices.
        const device = await BleClient.requestDevice();
        console.log(device);
        setDevices((prev) => [...prev, device]);
      } catch (err) {
        console.error(err);
        setError(err instanceof Error ? err.message : String(err));
      }
    };

    pageDiv?.addEventListener("pointerup", handlePointerUp);

    return () => {
      pageDiv?.removeEventListener("pointerup", handlePointerUp);
    };
  }, []);

  return (
    <div id="mainDiv" className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans text-black">
      Plaud PWA Demo
      {error && (
        <div className="mt-4 max-w-xs text-center text-sm text-red-600">{error}</div>
      )}
      {devices.map((device) => (
        <div key={device.deviceId}>{device.name ?? device.deviceId}</div>
      ))}
    </div>
  );
}
