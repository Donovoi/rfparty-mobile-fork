/**
 * Storage Adapter - Unified Storage API
 *
 * Provides a common interface for data persistence across platforms.
 * Uses IndexedDB on both Cordova and Web.
 */

const debug = require("debug")("rfparty:storage-adapter");

import { detectPlatform } from "./index";

/**
 * IndexedDB-based storage (works on both Cordova and Web)
 */
class IndexedDBStorage {
  constructor(dbName = "rfparty-storage") {
    this.dbName = dbName;
    this.db = null;
    this.version = 1;
  }

  async initialize() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => {
        debug("IndexedDB error:", request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        debug("IndexedDB opened successfully");
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Create object stores
        if (!db.objectStoreNames.contains("keyvalue")) {
          db.createObjectStore("keyvalue", { keyPath: "key" });
        }

        if (!db.objectStoreNames.contains("blobs")) {
          db.createObjectStore("blobs", { keyPath: "id" });
        }

        debug("IndexedDB upgraded");
      };
    });
  }

  async get(key) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(["keyvalue"], "readonly");
      const store = transaction.objectStore("keyvalue");
      const request = store.get(key);

      request.onsuccess = () => {
        resolve(request.result ? request.result.value : null);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  async set(key, value) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(["keyvalue"], "readwrite");
      const store = transaction.objectStore("keyvalue");
      const request = store.put({ key, value });

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  async delete(key) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(["keyvalue"], "readwrite");
      const store = transaction.objectStore("keyvalue");
      const request = store.delete(key);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  async keys() {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(["keyvalue"], "readonly");
      const store = transaction.objectStore("keyvalue");
      const request = store.getAllKeys();

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  async clear() {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(["keyvalue"], "readwrite");
      const store = transaction.objectStore("keyvalue");
      const request = store.clear();

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  // Blob storage for larger data
  async saveBlob(id, blob, metadata = {}) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(["blobs"], "readwrite");
      const store = transaction.objectStore("blobs");
      const request = store.put({ id, blob, metadata, timestamp: Date.now() });

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  async getBlob(id) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(["blobs"], "readonly");
      const store = transaction.objectStore("blobs");
      const request = store.get(id);

      request.onsuccess = () => {
        resolve(request.result || null);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }
}

/**
 * Create storage adapter
 */
export function createStorageAdapter() {
  return new IndexedDBStorage();
}

export { IndexedDBStorage };
