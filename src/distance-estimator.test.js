/**
 * Unit tests for the RSSI Distance Estimator module
 */

const {
  SignalModels,
  KalmanFilter,
  DistanceEstimator,
  MultiRadioEstimator,
} = require("./distance-estimator");

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    return true;
  } catch (err) {
    console.error(`✗ ${name}: ${err.message}`);
    return false;
  }
}

function assertEqual(actual, expected, tolerance = 0) {
  if (tolerance > 0) {
    if (Math.abs(actual - expected) > tolerance) {
      throw new Error(`Expected ${expected} (±${tolerance}), got ${actual}`);
    }
  } else if (actual !== expected) {
    throw new Error(`Expected ${expected}, got ${actual}`);
  }
}

function assertInRange(value, min, max, name = "value") {
  if (value < min || value > max) {
    throw new Error(`${name} ${value} not in range [${min}, ${max}]`);
  }
}

console.log("\n=== Distance Estimator Tests ===\n");

let passed = 0;
let total = 0;

// Test 1: Kalman Filter basic operation
total++;
if (
  test("Kalman filter smooths noisy data", () => {
    const kf = new KalmanFilter(0.125, 4, -60, 1);

    // Feed in consistent values
    for (let i = 0; i < 10; i++) {
      kf.update(-55);
    }

    // Estimate should converge toward -55
    assertInRange(kf.estimate, -57, -53, "estimate");
  })
)
  passed++;

// Test 2: Kalman Filter handles noise
total++;
if (
  test("Kalman filter reduces noise variance", () => {
    const kf = new KalmanFilter(0.125, 4, -60, 1);

    // Feed in noisy data around -60
    const readings = [-58, -63, -57, -65, -59, -62, -58, -64, -60, -59];
    let lastEstimate;
    for (const rssi of readings) {
      lastEstimate = kf.update(rssi);
    }

    // Estimate should be close to mean (-60.5)
    assertInRange(lastEstimate, -63, -58, "filtered estimate");
  })
)
  passed++;

// Test 3: Distance estimation at reference point
total++;
if (
  test("Distance at reference RSSI equals reference distance", () => {
    const estimator = new DistanceEstimator("BLE");

    // At reference RSSI, distance should be reference distance (1m)
    const result = estimator.estimateDistance(-59, false);
    assertEqual(result.distance, 1, 0.1);
  })
)
  passed++;

// Test 4: Distance increases with weaker signal
total++;
if (
  test("Weaker RSSI gives larger distance", () => {
    const estimator = new DistanceEstimator("BLE");

    const close = estimator.estimateDistance(-50, false);
    const far = estimator.estimateDistance(-70, false);

    if (far.distance <= close.distance) {
      throw new Error(
        `Far distance ${far.distance} should be > close distance ${close.distance}`
      );
    }
  })
)
  passed++;

// Test 5: Path loss model accuracy
total++;
if (
  test("Distance estimate follows log-distance model", () => {
    const estimator = new DistanceEstimator("BLE");

    // At -59 dBm (ref), d = 1m
    // At -69 dBm (ref - 10), d should be ~3.16m (10^(10/(10*2)) = 10^0.5 ≈ 3.16)
    const result = estimator.estimateDistance(-69, false);
    assertInRange(result.distance, 2.8, 3.5, "distance at -69 dBm");
  })
)
  passed++;

// Test 6: Invalid RSSI handling
total++;
if (
  test("Invalid RSSI returns null distance", () => {
    const estimator = new DistanceEstimator("BLE");

    const tooWeak = estimator.estimateDistance(-110, false);
    assertEqual(tooWeak.distance, null);

    const tooStrong = estimator.estimateDistance(-10, false);
    assertEqual(tooStrong.distance, null);
  })
)
  passed++;

// Test 7: Confidence calculation
total++;
if (
  test("Confidence increases with more samples", () => {
    const estimator = new DistanceEstimator("BLE");

    // First sample
    const first = estimator.estimateDistance(-60, true);
    const firstConf = first.confidence;

    // Add more stable readings
    for (let i = 0; i < 10; i++) {
      estimator.estimateDistance(-60, true);
    }

    const later = estimator.estimateDistance(-60, true);
    if (later.confidence <= firstConf) {
      throw new Error(
        `Later confidence ${later.confidence} should be > first ${firstConf}`
      );
    }
  })
)
  passed++;

// Test 8: Statistics calculation
total++;
if (
  test("Statistics correctly calculated", () => {
    const estimator = new DistanceEstimator("BLE");

    // Add known values
    const values = [-55, -60, -65, -60, -60];
    for (const v of values) {
      estimator.estimateDistance(v, false);
    }

    const stats = estimator.getStats();
    assertEqual(stats.samples, 5);
    assertEqual(stats.mean, -60, 0.1);
    assertEqual(stats.min, -65);
    assertEqual(stats.max, -55);
    assertEqual(stats.range, 10);
  })
)
  passed++;

// Test 9: Calibration
total++;
if (
  test("Calibration updates reference RSSI", () => {
    const estimator = new DistanceEstimator("BLE");

    // Calibrate at 1 meter with stronger signal
    const samples = [-50, -51, -49, -50, -52, -50, -51, -49, -50, -51];
    estimator.calibrate(1.0, samples);

    assertEqual(estimator.model.referenceRssi, -50, 1);

    // Now distance at -50 should be ~1m
    const result = estimator.estimateDistance(-50, false);
    assertEqual(result.distance, 1, 0.1);
  })
)
  passed++;

// Test 10: Different radio types
total++;
if (
  test("Different radio types have different models", () => {
    const ble = new DistanceEstimator("BLE");
    const wifi = new DistanceEstimator("WIFI_2G");
    const lora = new DistanceEstimator("LORA");

    // Same RSSI, different distances due to different models
    const bleResult = ble.estimateDistance(-60, false);
    const wifiResult = wifi.estimateDistance(-60, false);
    const loraResult = lora.estimateDistance(-60, false);

    // They should be different due to different path loss exponents and reference values
    if (bleResult.distance === wifiResult.distance) {
      throw new Error("BLE and WiFi should have different distance estimates");
    }
  })
)
  passed++;

// Test 11: Multi-radio estimator
total++;
if (
  test("Multi-radio estimator fuses multiple sources", () => {
    const multi = new MultiRadioEstimator();

    // Add readings from multiple sources
    multi.addReading("BLE", -60);
    multi.addReading("BLE", -61);
    multi.addReading("BLE", -59);

    multi.addReading("WIFI_2G", -50);
    multi.addReading("WIFI_2G", -51);

    const fused = multi.getFusedEstimate();

    assertEqual(fused.sources, 2);
    if (fused.distance === null) {
      throw new Error("Fused distance should not be null");
    }
    assertInRange(fused.confidence, 0, 1, "confidence");
  })
)
  passed++;

// Test 12: Reset functionality
total++;
if (
  test("Reset clears history and filter", () => {
    const estimator = new DistanceEstimator("BLE");

    // Add readings
    for (let i = 0; i < 20; i++) {
      estimator.estimateDistance(-60, true);
    }

    const statsBefore = estimator.getStats();
    assertEqual(statsBefore.samples, 20);

    estimator.reset();

    const statsAfter = estimator.getStats();
    assertEqual(statsAfter.samples, 0);
  })
)
  passed++;

// Summary
console.log(`\n=== Results: ${passed}/${total} tests passed ===\n`);

if (passed < total) {
  process.exit(1);
}
