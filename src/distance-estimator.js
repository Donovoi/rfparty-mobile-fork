/**
 * Multi-Radio RSSI Distance Estimation Module
 *
 * Uses the log-distance path loss model with Kalman filtering for
 * signal smoothing. Supports multiple radio types (BLE, WiFi, LoRa).
 *
 * Formula: RSSI = RSSI₀ - 10 × n × log₁₀(d/d₀)
 * Solved for distance: d = d₀ × 10^((RSSI₀ - RSSI) / (10 × n))
 *
 * Where:
 *   RSSI₀ = Reference RSSI at distance d₀ (typically 1 meter)
 *   n = Path loss exponent (environment-dependent)
 *   d = Estimated distance
 *   d₀ = Reference distance (typically 1 meter)
 */

const debug = require("debug")("rfparty:distance-estimator");

/**
 * Signal model configurations for different radio types
 * These are starting values that should be calibrated per-device
 */
const SignalModels = {
  // Bluetooth Low Energy
  BLE: {
    name: "Bluetooth Low Energy",
    referenceRssi: -59, // Typical RSSI at 1 meter
    referenceDistance: 1.0, // Reference distance in meters
    pathLossExponent: 2.0, // Free space = 2.0, indoor = 2.5-4.0
    minRssi: -100, // Minimum valid RSSI
    maxRssi: -20, // Maximum valid RSSI (very close)
    maxReliableDistance: 30, // Beyond this, estimates are unreliable
  },

  // WiFi 2.4GHz
  WIFI_2G: {
    name: "WiFi 2.4GHz",
    referenceRssi: -40,
    referenceDistance: 1.0,
    pathLossExponent: 2.7, // Higher due to 2.4GHz characteristics
    minRssi: -100,
    maxRssi: -10,
    maxReliableDistance: 50,
  },

  // WiFi 5GHz
  WIFI_5G: {
    name: "WiFi 5GHz",
    referenceRssi: -42,
    referenceDistance: 1.0,
    pathLossExponent: 3.0, // Higher path loss at 5GHz
    minRssi: -95,
    maxRssi: -10,
    maxReliableDistance: 40,
  },

  // LoRa (Long Range, low power)
  LORA: {
    name: "LoRa",
    referenceRssi: -30,
    referenceDistance: 1.0,
    pathLossExponent: 2.3,
    minRssi: -140, // LoRa can work with very weak signals
    maxRssi: -10,
    maxReliableDistance: 2000, // LoRa has very long range
  },
};

/**
 * Simple 1D Kalman Filter for RSSI smoothing
 * Reduces noise in RSSI readings to improve distance accuracy
 */
class KalmanFilter {
  /**
   * @param {number} processNoise - How much we expect the signal to change (Q)
   * @param {number} measurementNoise - How noisy are our measurements (R)
   * @param {number} initialEstimate - Starting estimate
   * @param {number} initialError - Initial error covariance
   */
  constructor(
    processNoise = 0.125,
    measurementNoise = 4,
    initialEstimate = -60,
    initialError = 1
  ) {
    this.Q = processNoise; // Process noise covariance
    this.R = measurementNoise; // Measurement noise covariance
    this.estimate = initialEstimate;
    this.errorCovariance = initialError;
    this.sampleCount = 0;
  }

  /**
   * Update the filter with a new measurement
   * @param {number} measurement - New RSSI reading
   * @returns {number} Filtered RSSI estimate
   */
  update(measurement) {
    // Prediction step
    // For stationary devices, prediction = previous estimate
    const predictedEstimate = this.estimate;
    const predictedError = this.errorCovariance + this.Q;

    // Update step
    const kalmanGain = predictedError / (predictedError + this.R);
    this.estimate =
      predictedEstimate + kalmanGain * (measurement - predictedEstimate);
    this.errorCovariance = (1 - kalmanGain) * predictedError;

    this.sampleCount++;

    return this.estimate;
  }

  /**
   * Reset the filter to initial state
   */
  reset(initialEstimate = -60) {
    this.estimate = initialEstimate;
    this.errorCovariance = 1;
    this.sampleCount = 0;
  }

  /**
   * Get current confidence (lower error = higher confidence)
   * @returns {number} Confidence value 0-1
   */
  getConfidence() {
    // Confidence increases as error covariance decreases
    // After many samples, error should stabilize around Q
    const maxError = 10; // Maximum expected error
    const confidence = 1 - Math.min(this.errorCovariance / maxError, 1);
    return Math.max(0, confidence);
  }
}

/**
 * Distance Estimator class for a single signal source
 */
class DistanceEstimator {
  /**
   * @param {string} radioType - One of: 'BLE', 'WIFI_2G', 'WIFI_5G', 'LORA'
   * @param {object} customModel - Optional custom signal model to override defaults
   */
  constructor(radioType = "BLE", customModel = null) {
    this.model = customModel || SignalModels[radioType] || SignalModels.BLE;
    this.kalmanFilter = new KalmanFilter(0.125, 4, this.model.referenceRssi);
    this.rawHistory = []; // Raw RSSI history for analysis
    this.maxHistoryLength = 50; // Keep last N samples
  }

  /**
   * Estimate distance from RSSI using log-distance path loss model
   * @param {number} rssi - RSSI value in dBm
   * @param {boolean} useFilter - Whether to apply Kalman filtering
   * @returns {object} Distance estimate with confidence
   */
  estimateDistance(rssi, useFilter = true) {
    // Validate RSSI
    if (rssi < this.model.minRssi || rssi > this.model.maxRssi) {
      debug(
        `RSSI ${rssi} out of valid range [${this.model.minRssi}, ${this.model.maxRssi}]`
      );
      return {
        distance: null,
        confidence: 0,
        filteredRssi: rssi,
        rawRssi: rssi,
        error: "RSSI out of valid range",
      };
    }

    // Store raw value
    this.rawHistory.push({
      rssi,
      timestamp: Date.now(),
    });

    // Trim history
    if (this.rawHistory.length > this.maxHistoryLength) {
      this.rawHistory.shift();
    }

    // Apply Kalman filter if requested
    const filteredRssi = useFilter ? this.kalmanFilter.update(rssi) : rssi;

    // Calculate distance using log-distance path loss model
    // d = d₀ × 10^((RSSI₀ - RSSI) / (10 × n))
    const exponent =
      (this.model.referenceRssi - filteredRssi) /
      (10 * this.model.pathLossExponent);
    const distance = this.model.referenceDistance * Math.pow(10, exponent);

    // Calculate confidence based on multiple factors
    const confidence = this.calculateConfidence(filteredRssi, distance);

    const result = {
      distance: Math.round(distance * 100) / 100, // Round to 2 decimal places
      confidence,
      filteredRssi: Math.round(filteredRssi * 10) / 10,
      rawRssi: rssi,
      model: this.model.name,
      reliable: distance <= this.model.maxReliableDistance,
    };

    debug(
      `Distance estimate: ${result.distance}m @ ${confidence.toFixed(
        2
      )} confidence from RSSI ${rssi} (filtered: ${result.filteredRssi})`
    );

    return result;
  }

  /**
   * Calculate confidence score for the distance estimate
   * @param {number} filteredRssi - Kalman-filtered RSSI
   * @param {number} distance - Estimated distance
   * @returns {number} Confidence score 0-1
   */
  calculateConfidence(filteredRssi, distance) {
    // Factor 1: Kalman filter convergence
    const filterConfidence = this.kalmanFilter.getConfidence();

    // Factor 2: Sample count (more samples = more confidence)
    const sampleConfidence = Math.min(this.rawHistory.length / 10, 1);

    // Factor 3: RSSI stability (low variance = high confidence)
    const varianceConfidence = this.calculateRssiStability();

    // Factor 4: Distance reliability (closer = more reliable)
    const distanceConfidence =
      distance <= this.model.maxReliableDistance
        ? 1 - (distance / this.model.maxReliableDistance) * 0.5
        : 0.1;

    // Weighted average of confidence factors
    const confidence =
      filterConfidence * 0.25 +
      sampleConfidence * 0.25 +
      varianceConfidence * 0.3 +
      distanceConfidence * 0.2;

    return Math.round(confidence * 100) / 100;
  }

  /**
   * Calculate RSSI stability from history
   * @returns {number} Stability score 0-1
   */
  calculateRssiStability() {
    if (this.rawHistory.length < 3) {
      return 0.5; // Default for insufficient data
    }

    // Calculate standard deviation
    const values = this.rawHistory.map((h) => h.rssi);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance =
      values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
      values.length;
    const stdDev = Math.sqrt(variance);

    // Lower standard deviation = higher stability
    // Typical RSSI stddev is 3-6 dBm in stable conditions
    const maxStdDev = 10; // dBm
    const stability = 1 - Math.min(stdDev / maxStdDev, 1);

    return stability;
  }

  /**
   * Update the signal model (for calibration)
   * @param {object} updates - Properties to update
   */
  updateModel(updates) {
    this.model = { ...this.model, ...updates };
    debug(`Model updated:`, this.model);
  }

  /**
   * Calibrate reference RSSI at known distance
   * Call this when the device is at a known distance
   * @param {number} knownDistance - Known distance in meters
   * @param {number[]} rssiSamples - Array of RSSI readings at that distance
   */
  calibrate(knownDistance, rssiSamples) {
    if (rssiSamples.length < 5) {
      debug("Calibration requires at least 5 samples");
      return false;
    }

    // Calculate mean RSSI
    const meanRssi =
      rssiSamples.reduce((a, b) => a + b, 0) / rssiSamples.length;

    // If calibrating at 1 meter, directly update reference
    if (Math.abs(knownDistance - 1.0) < 0.1) {
      this.model.referenceRssi = Math.round(meanRssi);
      debug(`Calibrated reference RSSI to ${this.model.referenceRssi} at 1m`);
    } else {
      // Calculate what the reference RSSI would be at 1m
      // RSSI₀ = RSSI + 10 × n × log₁₀(d)
      const estimatedRssiAt1m =
        meanRssi + 10 * this.model.pathLossExponent * Math.log10(knownDistance);
      this.model.referenceRssi = Math.round(estimatedRssiAt1m);
      debug(
        `Calibrated reference RSSI to ${
          this.model.referenceRssi
        } from ${Math.round(meanRssi)} at ${knownDistance}m`
      );
    }

    // Reset Kalman filter with new reference
    this.kalmanFilter.reset(meanRssi);

    return true;
  }

  /**
   * Get statistics about recent readings
   * @returns {object} Statistics
   */
  getStats() {
    if (this.rawHistory.length === 0) {
      return { samples: 0 };
    }

    const values = this.rawHistory.map((h) => h.rssi);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const variance =
      values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
      values.length;

    return {
      samples: values.length,
      mean: Math.round(mean * 10) / 10,
      min,
      max,
      range: max - min,
      stdDev: Math.round(Math.sqrt(variance) * 10) / 10,
      filteredRssi: Math.round(this.kalmanFilter.estimate * 10) / 10,
      filterConfidence: this.kalmanFilter.getConfidence(),
    };
  }

  /**
   * Reset the estimator state
   */
  reset() {
    this.rawHistory = [];
    this.kalmanFilter.reset(this.model.referenceRssi);
  }
}

/**
 * Multi-source distance estimator that combines readings from multiple radios
 */
class MultiRadioEstimator {
  constructor() {
    this.estimators = {};
    this.fusionWeights = {
      BLE: 1.0,
      WIFI_2G: 0.8,
      WIFI_5G: 0.7,
      LORA: 0.5,
    };
  }

  /**
   * Get or create an estimator for a radio type
   * @param {string} radioType
   * @returns {DistanceEstimator}
   */
  getEstimator(radioType) {
    if (!this.estimators[radioType]) {
      this.estimators[radioType] = new DistanceEstimator(radioType);
    }
    return this.estimators[radioType];
  }

  /**
   * Add an RSSI reading for a specific radio type
   * @param {string} radioType
   * @param {number} rssi
   * @returns {object} Distance estimate
   */
  addReading(radioType, rssi) {
    return this.getEstimator(radioType).estimateDistance(rssi);
  }

  /**
   * Get fused distance estimate from all available sources
   * Uses weighted average based on confidence and radio type weights
   * @returns {object} Fused distance estimate
   */
  getFusedEstimate() {
    const estimates = [];

    for (const [radioType, estimator] of Object.entries(this.estimators)) {
      const stats = estimator.getStats();
      if (stats.samples > 0) {
        const estimate = estimator.estimateDistance(stats.filteredRssi, false);
        if (estimate.distance !== null) {
          estimates.push({
            radioType,
            distance: estimate.distance,
            confidence: estimate.confidence,
            weight: this.fusionWeights[radioType] || 0.5,
          });
        }
      }
    }

    if (estimates.length === 0) {
      return {
        distance: null,
        confidence: 0,
        sources: 0,
        error: "No valid estimates available",
      };
    }

    // Weighted average
    let totalWeight = 0;
    let weightedDistance = 0;
    let maxConfidence = 0;

    for (const est of estimates) {
      const effectiveWeight = est.weight * est.confidence;
      weightedDistance += est.distance * effectiveWeight;
      totalWeight += effectiveWeight;
      maxConfidence = Math.max(maxConfidence, est.confidence);
    }

    const fusedDistance =
      totalWeight > 0 ? weightedDistance / totalWeight : null;

    return {
      distance: fusedDistance ? Math.round(fusedDistance * 100) / 100 : null,
      confidence:
        Math.round(((maxConfidence * estimates.length) / 3) * 100) / 100, // Bonus for multiple sources
      sources: estimates.length,
      breakdown: estimates,
    };
  }

  /**
   * Reset all estimators
   */
  reset() {
    for (const estimator of Object.values(this.estimators)) {
      estimator.reset();
    }
  }
}

// Export everything
module.exports = {
  SignalModels,
  KalmanFilter,
  DistanceEstimator,
  MultiRadioEstimator,
};
