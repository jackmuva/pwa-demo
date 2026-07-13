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

/**
 * JS interface for the native `PlaudSdk` Capacitor plugin
 * (see ios/PlaudPlugin/Sources/PlaudPlugin/PlaudSdkPlugin.swift).
 *
 * The native side is only present inside the Capacitor iOS shell; in a plain
 * browser these calls reject with "not implemented". Guard with
 * `Capacitor.isNativePlatform()` at the call site.
 */
export interface PlaudSdkPlugin {
  /** Initialise the SDK with a per-user JWT. `customDomain` is domain-only (no https://). */
  initSDK(options: { userAccessToken: string; customDomain: string }): Promise<void>;
  startScan(): Promise<void>;
  stopScan(): Promise<void>;
  isConnected(): Promise<{ connected: boolean }>;

  addListener(
    eventName: "scanResult",
    listener: (data: PlaudScanResult) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "scanTimeout",
    listener: () => void,
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
}

export const PlaudSdk = registerPlugin<PlaudSdkPlugin>("PlaudSdk");
