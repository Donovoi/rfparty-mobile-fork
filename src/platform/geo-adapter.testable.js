/**
 * Geolocation Adapter - Testable CommonJS version
 * This file exports classes for testing purposes.
 */

const debug = require("debug")("rfparty:geo-adapter");
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
 * Cordova Geolocation Implementation
 */
class CordovaGeo extends EventEmitter {
  constructor() {
    super();
    this.watching = false;
    this.watchId = null;
    this.bgGeo = null;
  }

  async initialize() {
    const win = getWindow();
    if (win && win.BackgroundGeolocation) {
      this.bgGeo = win.BackgroundGeolocation;
      debug("Using Cordova Background Geolocation");
    } else {
      debug("Using Cordova standard geolocation");
    }
  }

  async startWatching(options = {}) {
    if (this.watching) return;

    if (this.bgGeo) {
      return this.startBackgroundWatch(options);
    } else {
      return this.startStandardWatch(options);
    }
  }

  async startBackgroundWatch(options) {
    return new Promise((resolve, reject) => {
      this.bgGeo.configure({
        locationProvider: this.bgGeo.ACTIVITY_PROVIDER,
        desiredAccuracy: this.bgGeo.HIGH_ACCURACY,
        stationaryRadius: 10,
        distanceFilter: 10,
        notificationTitle: "RFParty",
        notificationText: "Scanning for BLE devices",
        debug: false,
        interval: 5000,
        fastestInterval: 2000,
        activitiesInterval: 10000,
        ...options,
      });

      this.bgGeo.on("location", (location) => {
        this.emit("location", this.normalizeLocation(location));
      });

      this.bgGeo.on("error", (error) => {
        this.emit("error", error);
      });

      this.bgGeo.start();
      this.watching = true;
      debug("Cordova background geolocation started");
      resolve();
    });
  }

  async startStandardWatch(options) {
    return new Promise((resolve, reject) => {
      const nav = getNavigator();
      this.watchId = nav.geolocation.watchPosition(
        (position) => {
          this.emit("location", this.normalizeLocation(position.coords));
        },
        (error) => {
          this.emit("error", error);
        },
        {
          enableHighAccuracy: true,
          timeout: 30000,
          maximumAge: 5000,
          ...options,
        }
      );
      this.watching = true;
      debug("Cordova standard geolocation started");
      resolve();
    });
  }

  async stopWatching() {
    if (!this.watching) return;

    if (this.bgGeo) {
      this.bgGeo.stop();
    } else if (this.watchId !== null) {
      const nav = getNavigator();
      if (nav && nav.geolocation) {
        nav.geolocation.clearWatch(this.watchId);
      }
      this.watchId = null;
    }

    this.watching = false;
    debug("Cordova geolocation stopped");
  }

  normalizeLocation(location) {
    return {
      latitude: location.latitude,
      longitude: location.longitude,
      accuracy: location.accuracy,
      altitude: location.altitude,
      altitudeAccuracy: location.altitudeAccuracy,
      heading: location.heading || location.bearing,
      speed: location.speed,
      timestamp: Date.now(),
      source: "cordova",
    };
  }

  async getCurrentPosition() {
    return new Promise((resolve, reject) => {
      const nav = getNavigator();
      nav.geolocation.getCurrentPosition(
        (position) => resolve(this.normalizeLocation(position.coords)),
        reject,
        { enableHighAccuracy: true, timeout: 30000 }
      );
    });
  }
}

/**
 * Web Geolocation Implementation
 */
class WebGeo extends EventEmitter {
  constructor() {
    super();
    this.watching = false;
    this.watchId = null;
  }

  async initialize() {
    const nav = getNavigator();
    if (!nav || !nav.geolocation) {
      throw new Error("Geolocation API not available");
    }
    debug("Web Geolocation initialized");
  }

  async startWatching(options = {}) {
    if (this.watching) return;

    return new Promise((resolve, reject) => {
      const nav = getNavigator();
      this.watchId = nav.geolocation.watchPosition(
        (position) => {
          this.emit("location", this.normalizeLocation(position.coords));
        },
        (error) => {
          debug("Geolocation error:", error);
          this.emit("error", error);
        },
        {
          enableHighAccuracy: true,
          timeout: 30000,
          maximumAge: 5000,
          ...options,
        }
      );
      this.watching = true;
      debug("Web geolocation watching started");
      resolve();
    });
  }

  async stopWatching() {
    if (!this.watching) return;

    if (this.watchId !== null) {
      const nav = getNavigator();
      if (nav && nav.geolocation) {
        nav.geolocation.clearWatch(this.watchId);
      }
      this.watchId = null;
    }

    this.watching = false;
    debug("Web geolocation stopped");
  }

  normalizeLocation(coords) {
    return {
      latitude: coords.latitude,
      longitude: coords.longitude,
      accuracy: coords.accuracy,
      altitude: coords.altitude,
      altitudeAccuracy: coords.altitudeAccuracy,
      heading: coords.heading,
      speed: coords.speed,
      timestamp: Date.now(),
      source: "web",
    };
  }

  async getCurrentPosition() {
    return new Promise((resolve, reject) => {
      const nav = getNavigator();
      nav.geolocation.getCurrentPosition(
        (position) => resolve(this.normalizeLocation(position.coords)),
        reject,
        { enableHighAccuracy: true, timeout: 30000 }
      );
    });
  }
}

/**
 * Create the appropriate Geo adapter for the current platform
 */
function createGeoAdapter() {
  const platform = detectPlatform();

  if (platform === "cordova") {
    return new CordovaGeo();
  } else {
    return new WebGeo();
  }
}

module.exports = {
  CordovaGeo,
  WebGeo,
  createGeoAdapter,
  detectPlatform,
};
