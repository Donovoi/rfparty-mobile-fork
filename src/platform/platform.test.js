/**
 * Platform Adapters Test Suite
 *
 * Tests for BLE, Geo, and Storage adapters with mocked browser/Cordova APIs.
 * Run with: node src/platform/platform.test.js
 */

// Test utilities
let passed = 0;
let failed = 0;
const tests = [];

function test(name, fn) {
  tests.push({ name, fn, async: false });
}

function asyncTest(name, fn) {
  tests.push({ name, fn, async: true });
}

function assertEqual(actual, expected, message = "") {
  if (actual !== expected) {
    throw new Error(`${message} Expected ${expected}, got ${actual}`);
  }
}

function assertDeepEqual(actual, expected, message = "") {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${message} Expected ${JSON.stringify(expected)}, got ${JSON.stringify(
        actual
      )}`
    );
  }
}

function assertTrue(value, message = "") {
  if (!value) {
    throw new Error(message || "Expected true, got false");
  }
}

function assertFalse(value, message = "") {
  if (value) {
    throw new Error(message || "Expected false, got true");
  }
}

async function assertThrowsAsync(fn, message = "") {
  try {
    await fn();
    throw new Error(message || "Expected function to throw");
  } catch (err) {
    if (err.message === (message || "Expected function to throw")) {
      throw err;
    }
    // Expected to throw, test passes
  }
}

// ============================================
// Mock Setup
// ============================================

// Mock global window object
global.window = {
  cordova: null,
  ble: null,
  BackgroundGeolocation: null,
};

// Mock navigator
global.navigator = {
  bluetooth: null,
  geolocation: null,
};

// Mock AbortController
global.AbortController = class AbortController {
  constructor() {
    this.signal = { aborted: false };
  }
  abort() {
    this.signal.aborted = true;
  }
};

// Clear require cache for fresh imports
function clearCache() {
  Object.keys(require.cache).forEach((key) => {
    if (key.includes("platform")) {
      delete require.cache[key];
    }
  });
}

// Helper to mock navigator in Node.js 21+ where navigator is a getter
function mockNavigator(mockValue) {
  // Delete the getter-based navigator property
  delete globalThis.navigator;
  // Define our mock
  Object.defineProperty(globalThis, "navigator", {
    value: mockValue,
    writable: true,
    configurable: true,
  });
  // Also set on global for compatibility
  global.navigator = mockValue;
}

// ============================================
// Platform Detection Tests
// ============================================

test('detectPlatform returns "web" when no cordova', () => {
  clearCache();
  global.window = { cordova: null };

  const { detectPlatform } = require("./ble-adapter.testable");
  const result = detectPlatform();

  assertEqual(result, "web");
});

test('detectPlatform returns "cordova" when cordova present', () => {
  clearCache();
  global.window = { cordova: { version: "1.0.0" } };

  const { detectPlatform } = require("./ble-adapter.testable");
  const result = detectPlatform();

  assertEqual(result, "cordova");
});

test('detectPlatform returns "node" when no window', () => {
  clearCache();
  const originalWindow = global.window;
  delete global.window;

  const { detectPlatform } = require("./ble-adapter.testable");
  const result = detectPlatform();

  assertEqual(result, "node");

  global.window = originalWindow;
});

// ============================================
// BLE Adapter Tests
// ============================================

// Reset to web mode
test("WebBLE constructor initializes correctly", () => {
  clearCache();
  global.window = { cordova: null, ble: null };

  const { WebBLE } = require("./ble-adapter.testable");
  const webBle = new WebBLE();

  assertFalse(webBle.scanning);
  assertEqual(webBle.scanAbortController, null);
});

asyncTest("WebBLE initialize throws when no navigator.bluetooth", async () => {
  clearCache();
  mockNavigator({ bluetooth: null });

  const { WebBLE } = require("./ble-adapter.testable");
  const webBle = new WebBLE();

  await assertThrowsAsync(async () => {
    await webBle.initialize();
  });
});

asyncTest(
  "WebBLE initialize succeeds when navigator.bluetooth available",
  async () => {
    clearCache();
    mockNavigator({
      bluetooth: { getAvailability: () => Promise.resolve(true) },
    });

    const { WebBLE } = require("./ble-adapter.testable");
    const webBle = new WebBLE();

    await webBle.initialize();
    assertTrue(true);
  }
);

asyncTest("WebBLE isAvailable returns false when no bluetooth", async () => {
  clearCache();
  mockNavigator({ bluetooth: null });

  const { WebBLE } = require("./ble-adapter.testable");
  const webBle = new WebBLE();

  const available = await webBle.isAvailable();
  assertFalse(available);
});

asyncTest(
  "WebBLE isAvailable returns true when bluetooth available",
  async () => {
    clearCache();
    mockNavigator({
      bluetooth: {
        getAvailability: () => Promise.resolve(true),
      },
    });

    const { WebBLE } = require("./ble-adapter.testable");
    const webBle = new WebBLE();

    const available = await webBle.isAvailable();
    assertTrue(available);
  }
);

test("WebBLE normalizeWebDevice formats device correctly", () => {
  clearCache();
  const { WebBLE } = require("./ble-adapter.testable");
  const webBle = new WebBLE();

  const mockEvent = {
    device: { id: "test-id", name: "Test Device" },
    rssi: -65,
    txPower: -20,
    manufacturerData: new Map([[0x004c, new Uint8Array([1, 2, 3])]]),
    serviceData: new Map([["180f", new Uint8Array([100])]]),
    uuids: ["180f", "1800"],
  };

  const normalized = webBle.normalizeWebDevice(mockEvent);

  assertEqual(normalized.id, "test-id");
  assertEqual(normalized.name, "Test Device");
  assertEqual(normalized.rssi, -65);
  assertEqual(normalized.txPower, -20);
  assertEqual(normalized.source, "web");
  assertTrue(normalized.timestamp > 0);
});

test("WebBLE normalizeWebDevice handles missing manufacturerData", () => {
  clearCache();
  const { WebBLE } = require("./ble-adapter.testable");
  const webBle = new WebBLE();

  const mockEvent = {
    device: { id: "test-id" },
    rssi: -65,
  };

  const normalized = webBle.normalizeWebDevice(mockEvent);

  assertEqual(normalized.id, "test-id");
  assertEqual(normalized.name, null);
  assertDeepEqual(normalized.advertising.manufacturerData, {});
});

asyncTest("WebBLE stopScan does nothing when not scanning", async () => {
  clearCache();
  const { WebBLE } = require("./ble-adapter.testable");
  const webBle = new WebBLE();

  await webBle.stopScan();
  assertFalse(webBle.scanning);
});

asyncTest("WebBLE stopScan aborts controller when scanning", async () => {
  clearCache();
  const { WebBLE } = require("./ble-adapter.testable");
  const webBle = new WebBLE();

  webBle.scanning = true;
  webBle.scanAbortController = new AbortController();

  await webBle.stopScan();
  assertFalse(webBle.scanning);
  assertEqual(webBle.scanAbortController, null);
});

asyncTest("WebBLE startScan returns early if already scanning", async () => {
  clearCache();
  const { WebBLE } = require("./ble-adapter.testable");
  const webBle = new WebBLE();

  webBle.scanning = true;
  await webBle.startScan();
  assertTrue(webBle.scanning);
});

// CordovaBLE tests
test("CordovaBLE constructor initializes correctly", () => {
  clearCache();
  const { CordovaBLE } = require("./ble-adapter.testable");
  const cordovaBle = new CordovaBLE();

  assertFalse(cordovaBle.scanning);
  assertEqual(cordovaBle.ble, null);
});

asyncTest("CordovaBLE initialize rejects when no window.ble", async () => {
  clearCache();
  global.window = { ble: null };

  const { CordovaBLE } = require("./ble-adapter.testable");
  const cordovaBle = new CordovaBLE();

  await assertThrowsAsync(async () => {
    await cordovaBle.initialize();
  });
});

asyncTest(
  "CordovaBLE initialize succeeds when window.ble available",
  async () => {
    clearCache();
    global.window = { ble: { startScanWithOptions: () => {} } };

    const { CordovaBLE } = require("./ble-adapter.testable");
    const cordovaBle = new CordovaBLE();

    await cordovaBle.initialize();
    assertEqual(cordovaBle.ble, global.window.ble);
  }
);

test("CordovaBLE normalizeDevice formats device correctly", () => {
  clearCache();
  const { CordovaBLE } = require("./ble-adapter.testable");
  const cordovaBle = new CordovaBLE();

  const mockDevice = {
    id: "AA:BB:CC:DD:EE:FF",
    name: "Test BLE Device",
    rssi: -70,
    advertising: new ArrayBuffer(10),
  };

  const normalized = cordovaBle.normalizeDevice(mockDevice);

  assertEqual(normalized.id, "AA:BB:CC:DD:EE:FF");
  assertEqual(normalized.name, "Test BLE Device");
  assertEqual(normalized.rssi, -70);
  assertEqual(normalized.source, "cordova");
  assertTrue(normalized.advertisingData instanceof ArrayBuffer);
});

test("CordovaBLE normalizeDevice handles missing name", () => {
  clearCache();
  const { CordovaBLE } = require("./ble-adapter.testable");
  const cordovaBle = new CordovaBLE();

  const mockDevice = {
    id: "AA:BB:CC:DD:EE:FF",
    rssi: -70,
    advertising: {},
  };

  const normalized = cordovaBle.normalizeDevice(mockDevice);
  assertEqual(normalized.name, null);
  assertEqual(normalized.advertisingData, null);
});

asyncTest(
  "CordovaBLE isAvailable returns false when no window.ble",
  async () => {
    clearCache();
    global.window = { ble: null };

    const { CordovaBLE } = require("./ble-adapter.testable");
    const cordovaBle = new CordovaBLE();

    const available = await cordovaBle.isAvailable();
    assertFalse(available);
  }
);

asyncTest("CordovaBLE stopScan does nothing when not scanning", async () => {
  clearCache();
  const { CordovaBLE } = require("./ble-adapter.testable");
  const cordovaBle = new CordovaBLE();

  await cordovaBle.stopScan();
  assertFalse(cordovaBle.scanning);
});

asyncTest(
  "CordovaBLE startScan returns early if already scanning",
  async () => {
    clearCache();
    const { CordovaBLE } = require("./ble-adapter.testable");
    const cordovaBle = new CordovaBLE();

    cordovaBle.scanning = true;
    await cordovaBle.startScan();
    assertTrue(cordovaBle.scanning);
  }
);

// ============================================
// Geo Adapter Tests
// ============================================

test("WebGeo constructor initializes correctly", () => {
  clearCache();
  const { WebGeo } = require("./geo-adapter.testable");
  const webGeo = new WebGeo();

  assertFalse(webGeo.watching);
  assertEqual(webGeo.watchId, null);
});

asyncTest(
  "WebGeo initialize throws when no navigator.geolocation",
  async () => {
    clearCache();
    mockNavigator({ geolocation: null });

    const { WebGeo } = require("./geo-adapter.testable");
    const webGeo = new WebGeo();

    await assertThrowsAsync(async () => {
      await webGeo.initialize();
    });
  }
);

asyncTest("WebGeo initialize succeeds when geolocation available", async () => {
  clearCache();
  mockNavigator({ geolocation: { watchPosition: () => 1 } });

  const { WebGeo } = require("./geo-adapter.testable");
  const webGeo = new WebGeo();

  await webGeo.initialize();
  assertTrue(true);
});

test("WebGeo normalizeLocation formats coords correctly", () => {
  clearCache();
  const { WebGeo } = require("./geo-adapter.testable");
  const webGeo = new WebGeo();

  const mockCoords = {
    latitude: 37.7749,
    longitude: -122.4194,
    accuracy: 10,
    altitude: 50,
    altitudeAccuracy: 5,
    heading: 90,
    speed: 1.5,
  };

  const normalized = webGeo.normalizeLocation(mockCoords);

  assertEqual(normalized.latitude, 37.7749);
  assertEqual(normalized.longitude, -122.4194);
  assertEqual(normalized.accuracy, 10);
  assertEqual(normalized.altitude, 50);
  assertEqual(normalized.heading, 90);
  assertEqual(normalized.speed, 1.5);
  assertEqual(normalized.source, "web");
  assertTrue(normalized.timestamp > 0);
});

asyncTest("WebGeo stopWatching does nothing when not watching", async () => {
  clearCache();
  const { WebGeo } = require("./geo-adapter.testable");
  const webGeo = new WebGeo();

  await webGeo.stopWatching();
  assertFalse(webGeo.watching);
});

asyncTest("WebGeo stopWatching clears watch when watching", async () => {
  clearCache();
  let clearedId = null;
  mockNavigator({
    geolocation: {
      watchPosition: () => 123,
      clearWatch: (id) => {
        clearedId = id;
      },
    },
  });

  const { WebGeo } = require("./geo-adapter.testable");
  const webGeo = new WebGeo();

  webGeo.watching = true;
  webGeo.watchId = 123;

  await webGeo.stopWatching();

  assertFalse(webGeo.watching);
  assertEqual(webGeo.watchId, null);
  assertEqual(clearedId, 123);
});

asyncTest(
  "WebGeo startWatching returns early if already watching",
  async () => {
    clearCache();
    const { WebGeo } = require("./geo-adapter.testable");
    const webGeo = new WebGeo();

    webGeo.watching = true;
    await webGeo.startWatching();
    assertTrue(webGeo.watching);
  }
);

// CordovaGeo tests
test("CordovaGeo constructor initializes correctly", () => {
  clearCache();
  const { CordovaGeo } = require("./geo-adapter.testable");
  const cordovaGeo = new CordovaGeo();

  assertFalse(cordovaGeo.watching);
  assertEqual(cordovaGeo.watchId, null);
  assertEqual(cordovaGeo.bgGeo, null);
});

asyncTest(
  "CordovaGeo initialize uses BackgroundGeolocation when available",
  async () => {
    clearCache();
    global.window = { BackgroundGeolocation: { ACTIVITY_PROVIDER: 1 } };

    const { CordovaGeo } = require("./geo-adapter.testable");
    const cordovaGeo = new CordovaGeo();

    await cordovaGeo.initialize();
    assertEqual(cordovaGeo.bgGeo, global.window.BackgroundGeolocation);
  }
);

asyncTest(
  "CordovaGeo initialize works without BackgroundGeolocation",
  async () => {
    clearCache();
    global.window = { BackgroundGeolocation: null };

    const { CordovaGeo } = require("./geo-adapter.testable");
    const cordovaGeo = new CordovaGeo();

    await cordovaGeo.initialize();
    assertEqual(cordovaGeo.bgGeo, null);
  }
);

test("CordovaGeo normalizeLocation handles bearing field", () => {
  clearCache();
  const { CordovaGeo } = require("./geo-adapter.testable");
  const cordovaGeo = new CordovaGeo();

  const mockLocation = {
    latitude: 37.7749,
    longitude: -122.4194,
    accuracy: 10,
    altitude: 50,
    bearing: 180,
    speed: 2.0,
  };

  const normalized = cordovaGeo.normalizeLocation(mockLocation);

  assertEqual(normalized.heading, 180);
  assertEqual(normalized.source, "cordova");
});

test("CordovaGeo normalizeLocation prefers heading over bearing", () => {
  clearCache();
  const { CordovaGeo } = require("./geo-adapter.testable");
  const cordovaGeo = new CordovaGeo();

  const mockLocation = {
    latitude: 37.7749,
    longitude: -122.4194,
    accuracy: 10,
    heading: 90,
    bearing: 180,
  };

  const normalized = cordovaGeo.normalizeLocation(mockLocation);
  assertEqual(normalized.heading, 90);
});

asyncTest("CordovaGeo stopWatching stops bgGeo when available", async () => {
  clearCache();
  let stopped = false;
  global.window = {
    BackgroundGeolocation: {
      stop: () => {
        stopped = true;
      },
    },
  };

  const { CordovaGeo } = require("./geo-adapter.testable");
  const cordovaGeo = new CordovaGeo();
  cordovaGeo.bgGeo = global.window.BackgroundGeolocation;
  cordovaGeo.watching = true;

  await cordovaGeo.stopWatching();

  assertTrue(stopped);
  assertFalse(cordovaGeo.watching);
});

asyncTest("CordovaGeo stopWatching clears watchId when no bgGeo", async () => {
  clearCache();
  let clearedId = null;
  mockNavigator({
    geolocation: {
      clearWatch: (id) => {
        clearedId = id;
      },
    },
  });

  const { CordovaGeo } = require("./geo-adapter.testable");
  const cordovaGeo = new CordovaGeo();
  cordovaGeo.watching = true;
  cordovaGeo.watchId = 456;
  cordovaGeo.bgGeo = null;

  await cordovaGeo.stopWatching();

  assertFalse(cordovaGeo.watching);
  assertEqual(cordovaGeo.watchId, null);
  assertEqual(clearedId, 456);
});

asyncTest(
  "CordovaGeo startWatching returns early if already watching",
  async () => {
    clearCache();
    const { CordovaGeo } = require("./geo-adapter.testable");
    const cordovaGeo = new CordovaGeo();

    cordovaGeo.watching = true;
    await cordovaGeo.startWatching();
    assertTrue(cordovaGeo.watching);
  }
);

// ============================================
// Storage Adapter Tests
// ============================================

test("IndexedDBStorage constructor initializes correctly", () => {
  clearCache();
  const { IndexedDBStorage } = require("./storage-adapter.testable");
  const storage = new IndexedDBStorage("test-db");

  assertEqual(storage.dbName, "test-db");
  assertEqual(storage.db, null);
  assertEqual(storage.version, 1);
});

test("IndexedDBStorage uses default db name", () => {
  clearCache();
  const { IndexedDBStorage } = require("./storage-adapter.testable");
  const storage = new IndexedDBStorage();

  assertEqual(storage.dbName, "rfparty-storage");
});

asyncTest("IndexedDBStorage initialize opens database", async () => {
  clearCache();
  const { IndexedDBStorage } = require("./storage-adapter.testable");
  const storage = new IndexedDBStorage("test-init-db");

  await storage.initialize();

  assertTrue(storage.db !== null);
});

asyncTest("IndexedDBStorage set and get work correctly", async () => {
  clearCache();
  const { IndexedDBStorage } = require("./storage-adapter.testable");
  const storage = new IndexedDBStorage("test-setget-db");

  await storage.initialize();
  await storage.set("testKey", { foo: "bar" });

  const result = await storage.get("testKey");

  assertDeepEqual(result, { foo: "bar" });
});

asyncTest("IndexedDBStorage get returns null for missing key", async () => {
  clearCache();
  const { IndexedDBStorage } = require("./storage-adapter.testable");
  const storage = new IndexedDBStorage("test-missing-db");

  await storage.initialize();

  const result = await storage.get("nonexistent");

  assertEqual(result, null);
});

asyncTest("IndexedDBStorage delete removes key", async () => {
  clearCache();
  const { IndexedDBStorage } = require("./storage-adapter.testable");
  const storage = new IndexedDBStorage("test-delete-db");

  await storage.initialize();
  await storage.set("toDelete", "value");
  await storage.delete("toDelete");

  const result = await storage.get("toDelete");

  assertEqual(result, null);
});

asyncTest("IndexedDBStorage keys returns all keys", async () => {
  clearCache();
  const { IndexedDBStorage } = require("./storage-adapter.testable");
  const storage = new IndexedDBStorage("test-keys-db");

  await storage.initialize();
  await storage.set("key1", "value1");
  await storage.set("key2", "value2");

  const keys = await storage.keys();

  assertTrue(keys.includes("key1"));
  assertTrue(keys.includes("key2"));
});

asyncTest("IndexedDBStorage clear removes all keys", async () => {
  clearCache();
  const { IndexedDBStorage } = require("./storage-adapter.testable");
  const storage = new IndexedDBStorage("test-clear-db");

  await storage.initialize();
  await storage.set("key1", "value1");
  await storage.set("key2", "value2");
  await storage.clear();

  const keys = await storage.keys();

  assertEqual(keys.length, 0);
});

asyncTest("IndexedDBStorage saveBlob and getBlob work correctly", async () => {
  clearCache();
  const { IndexedDBStorage } = require("./storage-adapter.testable");
  const storage = new IndexedDBStorage("test-blob-db");

  await storage.initialize();

  const testBlob = new Uint8Array([1, 2, 3, 4, 5]);
  await storage.saveBlob("blob1", testBlob, { type: "test" });

  const result = await storage.getBlob("blob1");

  assertEqual(result.id, "blob1");
  assertDeepEqual(result.metadata, { type: "test" });
});

asyncTest(
  "IndexedDBStorage getBlob returns null for missing blob",
  async () => {
    clearCache();
    const { IndexedDBStorage } = require("./storage-adapter.testable");
    const storage = new IndexedDBStorage("test-missing-blob-db");

    await storage.initialize();

    const result = await storage.getBlob("nonexistent");

    assertEqual(result, null);
  }
);

// ============================================
// createAdapter Factory Tests
// ============================================

test("createBLEAdapter returns WebBLE in web mode", () => {
  clearCache();
  global.window = { cordova: null };

  const { createBLEAdapter, WebBLE } = require("./ble-adapter.testable");
  const adapter = createBLEAdapter();

  assertTrue(adapter instanceof WebBLE);
});

test("createBLEAdapter returns CordovaBLE in cordova mode", () => {
  clearCache();
  global.window = { cordova: { version: "1.0" }, ble: {} };

  const { createBLEAdapter, CordovaBLE } = require("./ble-adapter.testable");
  const adapter = createBLEAdapter();

  assertTrue(adapter instanceof CordovaBLE);
});

test("createGeoAdapter returns WebGeo in web mode", () => {
  clearCache();
  global.window = { cordova: null };

  const { createGeoAdapter, WebGeo } = require("./geo-adapter.testable");
  const adapter = createGeoAdapter();

  assertTrue(adapter instanceof WebGeo);
});

test("createGeoAdapter returns CordovaGeo in cordova mode", () => {
  clearCache();
  global.window = { cordova: { version: "1.0" } };

  const { createGeoAdapter, CordovaGeo } = require("./geo-adapter.testable");
  const adapter = createGeoAdapter();

  assertTrue(adapter instanceof CordovaGeo);
});

test("createStorageAdapter returns IndexedDBStorage", () => {
  clearCache();
  const {
    createStorageAdapter,
    IndexedDBStorage,
  } = require("./storage-adapter.testable");
  const adapter = createStorageAdapter();

  assertTrue(adapter instanceof IndexedDBStorage);
});

// ============================================
// Run Tests
// ============================================

async function runTests() {
  console.log("\n=== Platform Adapter Tests ===\n");

  for (const t of tests) {
    try {
      if (t.async) {
        await t.fn();
      } else {
        t.fn();
      }
      passed++;
      console.log(`✓ ${t.name}`);
    } catch (err) {
      failed++;
      console.error(`✗ ${t.name}: ${err.message}`);
    }
  }

  const total = passed + failed;
  const coverage = Math.round((passed / total) * 100);

  console.log(
    `\n=== Results: ${passed}/${total} tests passed (${coverage}% pass rate) ===\n`
  );

  if (failed > 0) {
    console.log(`❌ ${failed} test(s) failed`);
    process.exit(1);
  } else {
    console.log("✅ All tests passed!");
    process.exit(0);
  }
}

runTests();
