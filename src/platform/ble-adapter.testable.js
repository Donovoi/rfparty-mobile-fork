/**
 * BLE Adapter - Testable CommonJS version
 * This file exports classes for testing purposes.
 */

const debug = require("debug")("rfparty:ble-adapter");
const EventEmitter = require("last-eventemitter");

// Helper to get navigator object (works in browser and Node.js tests)
// In tests, we use Object.defineProperty to mock navigator properly
function getNavigator() {
  if (typeof navigator !== "undefined") return navigator;
  return null;
}

// Helper to get window object (works in browser and Node.js tests)
function getWindow() {
  if (typeof window !== "undefined") return window;
  if (typeof global !== "undefined" && global.window) return global.window;
  return null;
}

/**
 * Detect the current runtime platform
 */
function detectPlatform() {
  const win = getWindow();
  if (!win) {
    return "node";
  }
  if (win.cordova) {
    return "cordova";
  }
  return "web";
}

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
      const win = getWindow();
      if (!win || !win.ble) {
        reject(new Error("Cordova BLE plugin not available"));
        return;
      }
      this.ble = win.ble;
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
      const win = getWindow();
      if (!win || !win.ble) {
        resolve(false);
        return;
      }
      win.ble.isEnabled(
        () => resolve(true),
        () => resolve(false)
      );
    });
  }
}

/**
 * Web Bluetooth Implementation
 */
class WebBLE extends EventEmitter {
  constructor() {
    super();
    this.scanning = false;
    this.scanAbortController = null;
  }

  async initialize() {
    const nav = getNavigator();
    if (!nav || !nav.bluetooth) {
      throw new Error(
        "Web Bluetooth API not available. Use Chrome, Edge, or Opera."
      );
    }
    debug("Web Bluetooth initialized");
  }

  async startScan(options = {}) {
    if (this.scanning) return;

    const nav = getNavigator();
    if (nav && nav.bluetooth && nav.bluetooth.requestLEScan) {
      return this.startLEScan(options);
    } else {
      return this.startLegacyScan(options);
    }
  }

  async startLEScan(options = {}) {
    const nav = getNavigator();
    try {
      this.scanAbortController = new AbortController();

      const scanOptions = {
        acceptAllAdvertisements: true,
        signal: this.scanAbortController.signal,
      };

      await nav.bluetooth.requestLEScan(scanOptions);

      nav.bluetooth.addEventListener("advertisementreceived", (event) => {
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
    const nav = getNavigator();

    try {
      const device = await nav.bluetooth.requestDevice({
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
    const nav = getNavigator();
    if (!nav || !nav.bluetooth) {
      return false;
    }

    try {
      return await nav.bluetooth.getAvailability();
    } catch {
      return false;
    }
  }
}

/**
 * Create the appropriate BLE adapter for the current platform
 */
function createBLEAdapter() {
  const platform = detectPlatform();

  if (platform === "cordova") {
    return new CordovaBLE();
  } else {
    return new WebBLE();
  }
}

module.exports = {
  CordovaBLE,
  WebBLE,
  createBLEAdapter,
  detectPlatform,
};
