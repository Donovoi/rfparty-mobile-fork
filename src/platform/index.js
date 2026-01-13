/**
 * Platform Abstraction Layer
 *
 * Detects runtime environment and provides unified APIs that work
 * across Cordova (mobile) and Web (browser PWA).
 */

const debug = require("debug")("rfparty:platform");

/**
 * Detect the current runtime platform
 */
export function detectPlatform() {
  if (typeof window === "undefined") {
    return "node";
  }

  if (window.cordova) {
    return "cordova";
  }

  return "web";
}

export const platform = detectPlatform();
export const isCordova = platform === "cordova";
export const isWeb = platform === "web";

debug(`Platform detected: ${platform}`);

// Re-export platform-specific modules
export { BLEAdapter } from "./ble-adapter";
export { GeoAdapter } from "./geo-adapter";
export { StorageAdapter } from "./storage-adapter";
