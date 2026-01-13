/**
 * BLE Adapter - Unified Bluetooth Low Energy API
 *
 * Provides a common interface for BLE scanning across:
 * - Cordova (cordova-plugin-ble-central)
 * - Web (Web Bluetooth API)
 */

const debug = require("debug")("rfparty:ble-adapter");
const EventEmitter = require("last-eventemitter");

import { detectPlatform } from "./index";

/**
 * Cordova BLE Implementation
 */
class CordovaBLE extends EventEmitter {
  constructor() {
    super();
    this.scanning = false;
    this.ble = null;
  }

  async initialize() {
    return new Promise((resolve, reject) => {
      if (!window.ble) {
        reject(new Error("Cordova BLE plugin not available"));
        return;
      }
      this.ble = window.ble;
      debug("Cordova BLE initialized");
      resolve();
    });
  }

  async startScan(options = {}) {
    if (this.scanning) return;

    const serviceUUIDs = options.serviceUUIDs || [];

    return new Promise((resolve, reject) => {
      this.ble.startScanWithOptions(
        serviceUUIDs,
        { reportDuplicates: true },
        (device) => {
          this.emit("device", this.normalizeDevice(device));
        },
        (error) => {
          debug("Scan error:", error);
          this.emit("error", error);
          reject(error);
        }
      );
      this.scanning = true;
      debug("Cordova BLE scan started");
      resolve();
    });
  }

  async stopScan() {
    if (!this.scanning) return;

    return new Promise((resolve) => {
      this.ble.stopScan(
        () => {
          this.scanning = false;
          debug("Cordova BLE scan stopped");
          resolve();
        },
        () => resolve()
      );
    });
  }

  normalizeDevice(device) {
    return {
      id: device.id,
      name: device.name || null,
      rssi: device.rssi,
      advertising: device.advertising,
      advertisingData:
        device.advertising instanceof ArrayBuffer ? device.advertising : null,
      timestamp: Date.now(),
      source: "cordova",
    };
  }

  async isAvailable() {
    return new Promise((resolve) => {
      if (!window.ble) {
        resolve(false);
        return;
      }
      window.ble.isEnabled(
        () => resolve(true),
        () => resolve(false)
      );
    });
  }
}

/**
 * Web Bluetooth Implementation
 *
 * Note: Web Bluetooth has limitations:
 * - Requires user gesture to start scanning
 * - Cannot do background scanning
 * - Limited browser support (Chrome, Edge, Opera)
 */
class WebBLE extends EventEmitter {
  constructor() {
    super();
    this.scanning = false;
    this.scanAbortController = null;
  }

  async initialize() {
    if (!navigator.bluetooth) {
      throw new Error(
        "Web Bluetooth API not available. Use Chrome, Edge, or Opera."
      );
    }
    debug("Web Bluetooth initialized");
  }

  async startScan(options = {}) {
    if (this.scanning) return;

    if (navigator.bluetooth.requestLEScan) {
      return this.startLEScan(options);
    } else {
      return this.startLegacyScan(options);
    }
  }

  async startLEScan(options = {}) {
    try {
      this.scanAbortController = new AbortController();

      const scanOptions = {
        acceptAllAdvertisements: true,
        signal: this.scanAbortController.signal,
      };

      await navigator.bluetooth.requestLEScan(scanOptions);

      navigator.bluetooth.addEventListener("advertisementreceived", (event) => {
        this.emit("device", this.normalizeWebDevice(event));
      });

      this.scanning = true;
      debug("Web Bluetooth LE scan started");
    } catch (error) {
      debug("Web Bluetooth scan error:", error);
      throw error;
    }
  }

  async startLegacyScan(options = {}) {
    debug("Using legacy requestDevice (limited functionality)");

    try {
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: options.serviceUUIDs || [],
      });

      this.emit("device", {
        id: device.id,
        name: device.name || null,
        rssi: null,
        advertising: null,
        advertisingData: null,
        timestamp: Date.now(),
        source: "web-legacy",
      });
    } catch (error) {
      if (error.name === "NotFoundError") {
        debug("User cancelled device selection");
      } else {
        throw error;
      }
    }
  }

  async stopScan() {
    if (!this.scanning) return;

    if (this.scanAbortController) {
      this.scanAbortController.abort();
      this.scanAbortController = null;
    }

    this.scanning = false;
    debug("Web Bluetooth scan stopped");
  }

  normalizeWebDevice(event) {
    const manufacturerData = {};
    if (event.manufacturerData) {
      event.manufacturerData.forEach((value, key) => {
        manufacturerData[key] = value;
      });
    }

    const serviceData = {};
    if (event.serviceData) {
      event.serviceData.forEach((value, key) => {
        serviceData[key] = value;
      });
    }

    return {
      id: event.device.id,
      name: event.device.name || event.name || null,
      rssi: event.rssi,
      txPower: event.txPower,
      advertising: {
        manufacturerData,
        serviceData,
        serviceUUIDs: event.uuids || [],
      },
      advertisingData: null,
      timestamp: Date.now(),
      source: "web",
    };
  }

  async isAvailable() {
    if (!navigator.bluetooth) {
      return false;
    }

    try {
      return await navigator.bluetooth.getAvailability();
    } catch {
      return false;
    }
  }
}

/**
 * Create the appropriate BLE adapter for the current platform
 */
export function createBLEAdapter() {
  const platform = detectPlatform();

  if (platform === "cordova") {
    return new CordovaBLE();
  } else {
    return new WebBLE();
  }
}

export { CordovaBLE, WebBLE };
