"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import {
  PlaudSdk,
  type PlaudScanDevice,
  type PlaudFile,
} from "@/lib/plaud-sdk";
import { transcribeExportedFile } from "@/lib/transcribe";
import useSWR from "swr";

const PLAUD_DOMAIN = "platform-us.plaud.ai";
const USER_ID = "jackmu";

/* ---------- Thin-stroke line icons (Lucide-style, currentColor) ---------- */
type IconProps = { className?: string; size?: number };
const svg = (size: number, className?: string) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  className,
});
const RadarIcon = ({ className, size = 20 }: IconProps) => (
  <svg {...svg(size, className)}>
    <path d="M19.07 4.93A10 10 0 0 0 6.99 3.34" />
    <path d="M4 6h.01" />
    <path d="M2.29 9.62A10 10 0 1 0 21.31 8.35" />
    <path d="M16.24 7.76A6 6 0 1 0 8.23 16.67" />
    <path d="M12 18h.01" />
    <path d="M17.99 11.66A6 6 0 0 1 15.77 16.67" />
    <circle cx="12" cy="12" r="2" />
    <path d="m13.41 10.59 5.66-5.66" />
  </svg>
);
const UnlinkIcon = ({ className, size = 20 }: IconProps) => (
  <svg {...svg(size, className)}>
    <path d="m18.84 12.25 1.72-1.71a4.24 4.24 0 0 0-6-6l-1.71 1.72" />
    <path d="m5.17 11.75-1.71 1.71a4.24 4.24 0 0 0 6 6l1.71-1.71" />
    <path d="m2 2 20 20" />
  </svg>
);
const RefreshIcon = ({ className, size = 16 }: IconProps) => (
  <svg {...svg(size, className)}>
    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
    <path d="M21 3v5h-5" />
    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
    <path d="M8 16H3v5" />
  </svg>
);
const FileAudioIcon = ({ className, size = 18 }: IconProps) => (
  <svg {...svg(size, className)}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6" />
    <path d="M8 16a2 2 0 1 0 4 0V9l4 1.5" />
  </svg>
);
const CloseIcon = ({ className, size = 20 }: IconProps) => (
  <svg {...svg(size, className)}>
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);
const FileTextIcon = ({ className, size = 16 }: IconProps) => (
  <svg {...svg(size, className)}>
    <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z" />
    <path d="M14 2v5h5" />
    <path d="M10 9H8M16 13H8M16 17H8" />
  </svg>
);

/* Map a freeform status string to a tone + dot color. */
function statusTone(status: string): "ok" | "err" | "live" | "idle" {
  const s = status.toLowerCase();
  if (s.includes("record") || s.includes("scanning") || s.includes("connecting"))
    return "live";
  if (s.includes("fail") || s.includes("error") || s.includes("off")) return "err";
  if (s.includes("connected") || s.includes("depaired")) return "ok";
  return "idle";
}
const TONE_COLOR: Record<string, string> = {
  ok: "var(--status-ok)",
  err: "var(--dev-status-error)",
  live: "var(--dev-accent-blue)",
  idle: "var(--dev-text-faint)",
};

export default function Home() {
  const [devices, setDevices] = useState<PlaudScanDevice[]>([]);
  const [files, setFiles] = useState<PlaudFile[]>([]);
  const [status, setStatus] = useState("idle");
  const [connected, setConnected] = useState(false);
  const [recording, setRecording] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [exportInfo, setExportInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playback, setPlayback] = useState<{ sessionId: number; src: string } | null>(
    null,
  );
  const [transcribeStatus, setTranscribeStatus] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const initedRef = useRef(false);

  // Mint the per-user JWT the SDK needs for its handshake.
  const { data } = useSWR("api/user-token", async () => {
    const tokenRes = await fetch(`${window.location.origin}/api/user-token`, {
      method: "POST",
      body: JSON.stringify({ user_id: USER_ID }),
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
          setDevices((prev) => {
            const map = new Map(prev.map((d) => [d.serialNumber, d]));
            for (const d of devices) map.set(d.serialNumber, d);
            return [...map.values()];
          });
        }),
        await PlaudSdk.addListener("scanTimeout", ({ reason }) => {
          setScanning(false);
          setStatus(
            reason === "bluetoothNotPoweredOn"
              ? "Bluetooth is off or permission was denied"
              : "scan timed out",
          );
        }),
        await PlaudSdk.addListener("connectState", ({ connected, failed }) => {
          console.log("[Plaud] connectState", { connected, failed });
          setStatus(connected ? "connected" : failed ? "connection failed" : "disconnected");
          setConnected(connected);
          if (connected) setScanning(false);
          // Once connected, pull the on-device recording list.
          if (connected) PlaudSdk.getFileList({ startSessionId: 0 }).catch(() => {});
        }),
        await PlaudSdk.addListener("penState", (s) =>
          setStatus(`pen state ${s.state} (key ${s.keyState})`),
        ),
        await PlaudSdk.addListener("fileList", ({ files }) => {
          console.log("[Plaud] fileList", files);
          setFiles(files);
        }),
        await PlaudSdk.addListener("exportProgress", (p) => {
          console.log("[Plaud] exportProgress", p);
          setExportInfo(`session ${p.sessionId}: ${p.progress}% ${p.message}`);
        }),
        // Recording is driven by the physical device, not the app. Surface the
        // start/stop/pause/resume events so they're visible, and refresh the file
        // list once a recording stops so the new file shows up to export.
        await PlaudSdk.addListener("recordStart", (r) => {
          console.log("[Plaud] recordStart", r);
          setIsLive(true);
          setRecording(`Recording · session ${r.sessionId} · scene ${r.scene}`);
        }),
        await PlaudSdk.addListener("recordStop", (r) => {
          console.log("[Plaud] recordStop", r);
          setIsLive(false);
          setRecording(
            `Stopped · session ${r.sessionId} · ${(r.fileSize / 1024).toFixed(0)} KB` +
              (r.fileExist ? "" : " (no file)"),
          );
          // A fresh recording won't be in the list fetched at connect — refresh it.
          PlaudSdk.getFileList({ startSessionId: 0 }).catch(() => {});
        }),
        await PlaudSdk.addListener("recordPause", (r) => {
          console.log("[Plaud] recordPause", r);
          setIsLive(false);
          setRecording(`Paused · session ${r.sessionId}`);
        }),
        await PlaudSdk.addListener("recordResume", (r) => {
          console.log("[Plaud] recordResume", r);
          setIsLive(true);
          setRecording(`Recording · session ${r.sessionId} (resumed)`);
        }),
        await PlaudSdk.addListener("depair", ({ status }) => {
          console.log("[Plaud] depair", status);
          setStatus(`depaired (status ${status})`);
          setConnected(false);
          setFiles([]);
          setRecording(null);
          setIsLive(false);
        }),
      );
    })();
    return () => {
      handles.forEach((h) => h.remove());
    };
  }, []);

  const ensureNative = () => {
    if (!Capacitor.isNativePlatform()) {
      setError("Native Plaud SDK is only available inside the iOS app shell.");
      return false;
    }
    return true;
  };

  const handleScan = async () => {
    setError(null);
    if (!ensureNative()) return;
    const token = data?.access_token;
    if (!token) {
      setError("User token not ready yet — try again in a moment.");
      return;
    }
    try {
      if (!initedRef.current) {
        setStatus("initializing SDK…");
        await PlaudSdk.initSDK({
          userAccessToken: token,
          customDomain: PLAUD_DOMAIN,
          userId: USER_ID,
        });
        initedRef.current = true;
      }
      setScanning(true);
      setStatus("scanning…");
      await PlaudSdk.startScan();
    } catch (err) {
      setScanning(false);
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  };

  const handleConnect = async (d: PlaudScanDevice) => {
    setError(null);
    if (!ensureNative()) return;
    try {
      setStatus(`connecting to ${d.name || d.serialNumber}…`);
      await PlaudSdk.stopScan();
      setScanning(false);
      await PlaudSdk.connectBleDevice({ uuid: d.uuid, serialNumber: d.serialNumber });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDepair = async () => {
    setError(null);
    if (!ensureNative()) return;
    if (!window.confirm("Unpair this device and clear local pairing state?")) return;
    try {
      setStatus("depairing…");
      await PlaudSdk.depair({ clear: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleExport = async (f: PlaudFile) => {
    setError(null);
    setExportInfo(`session ${f.sessionId}: starting…`);
    setTranscribeStatus(null);
    setTranscript(null);
    console.log("[Plaud] exportAudio →", f.sessionId);
    try {
      const { outputPath } = await PlaudSdk.exportAudio({
        sessionId: f.sessionId,
        format: "mp3",
      });
      console.log("[Plaud] exportAudio done", f.sessionId, outputPath);
      setExportInfo(`session ${f.sessionId}: saved → ${outputPath}`);
      const src = Capacitor.convertFileSrc(outputPath);
      setPlayback({ sessionId: f.sessionId, src });
      await handleTranscribe(src);
    } catch (err) {
      console.error("[Plaud] exportAudio failed", f.sessionId, err);
      setError(err instanceof Error ? err.message : String(err));
      setExportInfo(null);
    }
  };

  // Upload the just-exported mp3 to Plaud's storage and run it through transcription.
  const handleTranscribe = async (fileSrc: string) => {
    const token = data?.access_token;
    if (!token) {
      setError("User token not ready — can't transcribe yet.");
      return;
    }
    try {
      const task = await transcribeExportedFile(fileSrc, "mp3", token, (p) => {
        setTranscribeStatus(
          p.phase === "uploading"
            ? `uploading to Plaud… ${p.percent ?? 0}%`
            : p.phase === "finalizing"
              ? "finalizing upload…"
              : p.phase === "submitting"
                ? "submitting for transcription…"
                : `transcribing… (${p.status})`,
        );
      });
      setTranscribeStatus("transcription complete");
      setTranscript(task.data.text ?? null);
    } catch (err) {
      console.error("[Plaud] transcription failed", err);
      setError(err instanceof Error ? err.message : String(err));
      setTranscribeStatus(null);
    }
  };

  const handleRefreshFiles = async () => {
    setError(null);
    if (!ensureNative()) return;
    try {
      console.log("[Plaud] getFileList refresh");
      await PlaudSdk.getFileList({ startSessionId: 0 });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const tone = statusTone(status);

  return (
    <div className="flex w-full flex-1 flex-col overflow-x-hidden">
      {/* Fixed frosted chrome */}
      <header
        className="sticky top-0 z-20 flex items-center justify-between border-b px-5 py-3.5"
        style={{
          borderColor: "var(--dev-border-subtle)",
          background: "rgba(15,15,15,0.72)",
          backdropFilter: "blur(var(--dev-blur-chrome))",
          WebkitBackdropFilter: "blur(var(--dev-blur-chrome))",
        }}
      >
        <div className="flex items-center gap-2.5">
          <Image
            src="/brand/logo-wordmark-white.png"
            alt="Plaud"
            width={78}
            height={20}
            priority
            style={{ height: 18, width: "auto" }}
          />
          <span className="overline" style={{ marginTop: 1 }}>
            Developer
          </span>
        </div>
        <span className="pill">
          <span
            className="rec-dot"
            style={{
              animation: tone === "live" ? undefined : "none",
              background: TONE_COLOR[tone],
              boxShadow: `0 0 0 4px color-mix(in srgb, ${TONE_COLOR[tone]} 18%, transparent)`,
            }}
          />
          {status}
        </span>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-5 py-8">
        {/* Intro */}
        <section className="reveal">
          <p className="overline">Plaud SDK · reference app</p>
          <h1 className="mt-2 text-[32px] leading-none">
            Connect. Record. Transcribe.
          </h1>
          <p
            className="mt-3 text-[15px]"
            style={{ color: "var(--dev-text-dim)", lineHeight: 1.4 }}
          >
            Pair a Plaud recorder over Bluetooth, capture on-device, then export
            and transcribe — straight from the native bridge.
          </p>
        </section>

        {/* Primary actions */}
        <section className="reveal delay-100 flex flex-wrap gap-3">
          <button
            onClick={handleScan}
            disabled={scanning}
            className="btn btn-primary flex-1"
          >
            <RadarIcon size={18} />
            {scanning ? "Scanning…" : connected ? "Rescan" : "Init & scan"}
          </button>
          {connected && (
            <button onClick={handleDepair} className="btn btn-destructive">
              <UnlinkIcon size={18} />
              Unpair
            </button>
          )}
        </section>

        {/* Live recording banner */}
        {recording && (
          <section
            className="dev-card flex items-center gap-3 px-5 py-4"
            style={
              isLive
                ? { borderColor: "rgba(241,80,66,0.45)" }
                : undefined
            }
          >
            {isLive ? (
              <div className="flex items-end gap-1" style={{ height: 22 }}>
                {[0, 1, 2, 3, 4].map((i) => (
                  <span
                    key={i}
                    className="wave-bar"
                    style={{ animationDelay: `${i * 120}ms` }}
                  />
                ))}
              </div>
            ) : (
              <FileAudioIcon size={20} className="shrink-0" />
            )}
            <div className="min-w-0">
              <p className="overline" style={{ marginBottom: 2 }}>
                {isLive ? "Live" : "Last capture"}
              </p>
              <p
                className="mono truncate text-[13px]"
                style={{ color: "var(--dev-text-light)" }}
              >
                {recording}
              </p>
            </div>
          </section>
        )}

        {error && (
          <div
            className="dev-card px-4 py-3 text-[13px]"
            style={{
              color: "var(--dev-status-error)",
              borderColor: "rgba(241,80,66,0.4)",
            }}
          >
            {error}
          </div>
        )}

        {/* Discovered devices — tap to connect. */}
        {devices.length > 0 && !connected && (
          <section className="reveal delay-200 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="overline">Devices</h2>
              <span className="caption mono" style={{ color: "var(--dev-text-faint)" }}>
                {devices.length} found
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {devices.map((d) => (
                <button
                  key={d.serialNumber || d.uuid}
                  onClick={() => handleConnect(d)}
                  className="dev-row"
                >
                  <span
                    className="truncate text-[15px]"
                    style={{ color: "var(--dev-text-light)" }}
                  >
                    {d.name || d.serialNumber || d.uuid}
                  </span>
                  <span
                    className="mono shrink-0 text-[12px]"
                    style={{ color: "var(--dev-text-faint)" }}
                  >
                    {d.rssi} dBm
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Recordings on the connected device — tap to export/decode. */}
        {connected && (
          <section className="reveal delay-200 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="overline">Recordings</h2>
              <button
                onClick={handleRefreshFiles}
                className="flex items-center gap-1.5 text-[12px]"
                style={{ color: "var(--dev-accent-blue)" }}
              >
                <RefreshIcon size={14} />
                Refresh
              </button>
            </div>
            {files.length === 0 ? (
              <div
                className="dev-card px-4 py-6 text-center text-[13px]"
                style={{ color: "var(--dev-text-dim)" }}
              >
                No recordings yet. Record on the device, then refresh.
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {files.map((f) => (
                  <button
                    key={f.sessionId}
                    onClick={() => handleExport(f)}
                    className="dev-row"
                  >
                    <span className="flex items-center gap-3 min-w-0">
                      <FileAudioIcon
                        size={18}
                        className="shrink-0"
                      />
                      <span
                        className="mono text-[14px]"
                        style={{ color: "var(--dev-text-light)" }}
                      >
                        #{f.sessionId}
                      </span>
                    </span>
                    <span
                      className="mono shrink-0 text-[12px]"
                      style={{ color: "var(--dev-text-faint)" }}
                    >
                      {f.duration}s · {(f.size / 1024).toFixed(0)} KB
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        {exportInfo && (
          <p
            className="mono break-all text-center text-[11px]"
            style={{ color: "var(--dev-text-faint)" }}
          >
            {exportInfo}
          </p>
        )}
      </main>

      {/* Footer band */}
      <footer
        className="flex items-center justify-between px-5 py-3"
        style={{
          background: "var(--dev-surface-footer)",
          borderTop: "1px solid var(--dev-border-subtle)",
        }}
      >
        <span className="caption mono" style={{ color: "var(--dev-text-faint)" }}>
          {USER_ID}@{PLAUD_DOMAIN}
        </span>
        <span className="pill">
          <span
            className="rec-dot"
            style={{
              animation: "none",
              background: data?.access_token
                ? "var(--status-ok)"
                : "var(--dev-text-faint)",
              boxShadow: "none",
            }}
          />
          token {data?.access_token ? "ready" : "loading…"}
        </span>
      </footer>

      {/* Playback modal — shown once a recording has finished exporting. */}
      {playback && (
        <div
          className="fixed inset-0 z-30 flex items-end justify-center p-4 sm:items-center"
          style={{ background: "rgba(0,0,0,0.6)" }}
          onClick={() => setPlayback(null)}
        >
          <div
            className="dev-card w-full max-w-md p-5"
            style={{ boxShadow: "var(--shadow-lg)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="overline">Playback</p>
                <h3 className="mono mt-1 text-[18px]">
                  Session #{playback.sessionId}
                </h3>
              </div>
              <button
                onClick={() => setPlayback(null)}
                aria-label="Close"
                style={{ color: "var(--dev-text-dim)" }}
              >
                <CloseIcon size={22} />
              </button>
            </div>

            <audio
              className="w-full"
              src={playback.src}
              controls
              autoPlay
              style={{ colorScheme: "dark" }}
            />

            {transcribeStatus && (
              <p
                className="mono mt-4 flex items-center gap-2 text-[12px]"
                style={{ color: "var(--dev-accent-blue)" }}
              >
                {transcribeStatus}
              </p>
            )}

            {transcript && (
              <div className="mt-3">
                <p className="overline mb-2 flex items-center gap-1.5">
                  <FileTextIcon size={14} />
                  Transcript
                </p>
                <div
                  className="max-h-48 overflow-y-auto rounded p-3 text-[13px]"
                  style={{
                    background: "var(--dev-surface-input)",
                    border: "1px solid var(--dev-border-subtle)",
                    color: "var(--dev-text-light)",
                    lineHeight: 1.5,
                  }}
                >
                  {transcript}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
