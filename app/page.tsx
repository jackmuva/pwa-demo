"use client";
import { useEffect, useRef, useState } from "react";
import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import { PlaudSdk, type PlaudScanDevice } from "@/lib/plaudSdk";
import useSWR from "swr";

const PLAUD_DOMAIN = "platform-us.plaud.ai";

export default function Home() {
  const [devices, setDevices] = useState<PlaudScanDevice[]>([]);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState<string | null>(null);
  const initedRef = useRef(false);

  // Mint the per-user JWT the SDK needs for its handshake.
  const { data } = useSWR("api/user-token", async () => {
    const tokenRes = await fetch(`${window.location.origin}/api/user-token`, {
      method: "POST",
      body: JSON.stringify({ user_id: "jackmu" }),
    });
    const { access_token } = await tokenRes.json();
    return { access_token: access_token as string };
  });

  // Wire the native SDK's delegate events to React state. Native-only.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const handles: PluginListenerHandle[] = [];
    (async () => {
      handles.push(
        await PlaudSdk.addListener("scanResult", ({ devices }) => {
          // De-dupe by serial number as the SDK re-emits the growing list.
          setDevices((prev) => {
            const map = new Map(prev.map((d) => [d.serialNumber, d]));
            for (const d of devices) map.set(d.serialNumber, d);
            return [...map.values()];
          });
        }),
        await PlaudSdk.addListener("scanTimeout", () => setStatus("scan timed out")),
        await PlaudSdk.addListener("connectState", ({ connected }) =>
          setStatus(connected ? "connected" : "disconnected"),
        ),
        await PlaudSdk.addListener("penState", (s) =>
          setStatus(`pen state ${s.state} (key ${s.keyState})`),
        ),
      );
    })();
    return () => {
      handles.forEach((h) => h.remove());
    };
  }, []);

  const handleScan = async () => {
    setError(null);
    if (!Capacitor.isNativePlatform()) {
      setError("Native Plaud SDK is only available inside the iOS app shell.");
      return;
    }
    const token = data?.access_token;
    if (!token) {
      setError("User token not ready yet — try again in a moment.");
      return;
    }
    try {
      if (!initedRef.current) {
        setStatus("initializing SDK…");
        await PlaudSdk.initSDK({ userAccessToken: token, customDomain: PLAUD_DOMAIN });
        initedRef.current = true;
      }
      setStatus("scanning…");
      await PlaudSdk.startScan();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  };

  return (
    <div className="flex flex-col flex-1 items-center justify-center gap-3 bg-zinc-50 p-6 font-sans text-black">
      <h1 className="text-lg font-semibold">Plaud PWA Demo</h1>

      <button
        onClick={handleScan}
        className="rounded-lg bg-blue-600 px-4 py-2 text-white active:bg-blue-700"
      >
        Init &amp; Scan
      </button>

      <div className="text-sm text-zinc-600">status: {status}</div>

      {error && (
        <div className="mt-2 max-w-xs text-center text-sm text-red-600">{error}</div>
      )}

      <div className="mt-2 flex w-full max-w-sm flex-col gap-1">
        {devices.map((d) => (
          <div
            key={d.serialNumber || d.uuid}
            className="flex justify-between rounded border border-zinc-200 bg-white px-3 py-2 text-sm"
          >
            <span>{d.name || d.serialNumber || d.uuid}</span>
            <span className="text-zinc-400">{d.rssi} dBm</span>
          </div>
        ))}
      </div>

      <div className="mt-4 text-xs text-zinc-400">
        token: {data?.access_token ? "ready" : "loading…"}
      </div>
    </div>
  );
}
