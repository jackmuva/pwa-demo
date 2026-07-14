import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";

/** A device surfaced by the SDK's `bleScanResult` callback. */
export interface PlaudScanDevice {
  name: string;
  uuid: string;
  serialNumber: string;
  rssi: number;
  supportWiFi: boolean;
}

export interface PlaudScanResult {
  devices: PlaudScanDevice[];
}

export interface PlaudConnectState {
  connected: boolean;
  /** True for connection/handshake failure (state 2/-1/-2), vs. a normal disconnect. */
  failed: boolean;
  state: number;
}

export interface PlaudPenState {
  state: number;
  privacy: number;
  keyState: number;
  uDisk: number;
  findMyToken: number;
  hasSndpKey: number;
  deviceAccessToken: number;
}

/** A recording stored on the device, from the `fileList` event. */
export interface PlaudFile {
  sn: string;
  sessionId: number;
  size: number;
  scenes: number;
  channels: number;
  isOgg: boolean;
  isMusic: boolean;
  /** Duration in seconds. */
  duration: number;
}

export interface PlaudFileList {
  files: PlaudFile[];
}

export interface PlaudExportProgress {
  sessionId: number;
  progress: number;
  message: string;
}

/** Device-initiated recording started (physical button / VAD). */
export interface PlaudRecordStart {
  sessionId: number;
  start: number;
  status: number;
  scene: number;
  startTime: number;
  reason: number;
}

/** Device-initiated recording stopped/paused, with the resulting file info. */
export interface PlaudRecordStop {
  sessionId: number;
  reason: number;
  fileExist: boolean;
  fileSize: number;
}

/** Device-initiated recording resumed. */
export interface PlaudRecordResume {
  sessionId: number;
  start: number;
  status: number;
  scene: number;
  startTime: number;
}

export type PlaudAudioFormat = "pcm" | "mp3" | "wav" | "opus";

/**
 * JS interface for the native `PlaudSdk` Capacitor plugin
 * (see ios/PlaudPlugin/Sources/PlaudPlugin/PlaudSdkPlugin.swift).
 *
 * The native side is only present inside the Capacitor iOS shell; in a plain
 * browser these calls reject with "not implemented". Guard with
 * `Capacitor.isNativePlatform()` at the call site.
 */
export interface PlaudSdkPlugin {
  /**
   * Initialise the SDK with a per-user JWT. `customDomain` is domain-only (no https://).
   * `userId` is the app-level user identifier used as the default connect `deviceToken`
   * (the native app passes it on every connect to bind the device to the user).
   */
  initSDK(options: {
    userAccessToken: string;
    customDomain: string;
    userId?: string;
  }): Promise<void>;
  startScan(): Promise<void>;
  stopScan(): Promise<void>;
  /**
   * Connect to a device from a prior `scanResult`, identified by `uuid` (preferred) or
   * `serialNumber`. Progress arrives via the `connectState` and `penState` events.
   */
  connectBleDevice(options: {
    uuid?: string;
    serialNumber?: string;
    deviceToken?: string;
  }): Promise<void>;
  disconnect(): Promise<void>;
  /**
   * Unpair the device. With `clear: true` (default) the SDK also clears local pairing
   * state so the next connect re-runs the handshake. Result arrives via the `depair` event.
   */
  depair(options?: { clear?: boolean }): Promise<void>;
  isConnected(): Promise<{ connected: boolean }>;
  /** Request the recording list; results arrive via the `fileList` event. */
  getFileList(options?: { startSessionId?: number }): Promise<void>;
  /**
   * Decode a recording to a file in the app's Documents/PlaudExports dir. Resolves with
   * the written path; emits `exportProgress` events. `format` defaults to "mp3".
   */
  exportAudio(options: {
    sessionId: number;
    format?: PlaudAudioFormat;
    channels?: number;
  }): Promise<{ sessionId: number; outputPath: string }>;

  addListener(
    eventName: "scanResult",
    listener: (data: PlaudScanResult) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "scanTimeout",
    listener: (data: { reason?: string }) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "connectState",
    listener: (data: PlaudConnectState) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "penState",
    listener: (data: PlaudPenState) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "bind",
    listener: (data: { sn: string | null; status: number; protVersion: number }) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "fileList",
    listener: (data: PlaudFileList) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "exportProgress",
    listener: (data: PlaudExportProgress) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "recordStart",
    listener: (data: PlaudRecordStart) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "recordStop",
    listener: (data: PlaudRecordStop) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "recordPause",
    listener: (data: PlaudRecordStop) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "recordResume",
    listener: (data: PlaudRecordResume) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "depair",
    listener: (data: { status: number }) => void,
  ): Promise<PluginListenerHandle>;
}

export const PlaudSdk = registerPlugin<PlaudSdkPlugin>("PlaudSdk");
