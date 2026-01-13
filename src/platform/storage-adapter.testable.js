/**
 * Storage Adapter - Testable CommonJS version
 * This file exports classes for testing purposes.
 */

const debug = require("debug")("rfparty:storage-adapter");

/**
 * IndexedDB-based storage (works on both Cordova and Web)
 */
class IndexedDBStorage {
  constructor(dbName = "rfparty-storage") {
    this.dbName = dbName;
    this.db = null;
    this.version = 1;
    this._data = {}; // In-memory fallback for testing
  }

  async initialize() {
    // Use in-memory storage for testing environment
    if (typeof indexedDB === "undefined" || !indexedDB.open) {
      debug("Using in-memory storage (no IndexedDB)");
      this.db = { inMemory: true };
      return;
    }

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
    // In-memory fallback
    if (this.db && this.db.inMemory) {
      return this._data[key] || null;
    }

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
    // In-memory fallback
    if (this.db && this.db.inMemory) {
      this._data[key] = value;
      return;
    }

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
    // In-memory fallback
    if (this.db && this.db.inMemory) {
      delete this._data[key];
      return;
    }

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
    // In-memory fallback
    if (this.db && this.db.inMemory) {
      return Object.keys(this._data).filter((k) => !k.startsWith("_blob_"));
    }

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
    // In-memory fallback
    if (this.db && this.db.inMemory) {
      const blobKeys = Object.keys(this._data).filter((k) =>
        k.startsWith("_blob_")
      );
      this._data = {};
      blobKeys.forEach((k) => {
        this._data[k] = undefined;
      });
      return;
    }

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

  async saveBlob(id, blob, metadata = {}) {
    // In-memory fallback
    if (this.db && this.db.inMemory) {
      this._data["_blob_" + id] = { id, blob, metadata, timestamp: Date.now() };
      return;
    }

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
    // In-memory fallback
    if (this.db && this.db.inMemory) {
      return this._data["_blob_" + id] || null;
    }

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
function createStorageAdapter() {
  return new IndexedDBStorage();
}

module.exports = {
  IndexedDBStorage,
  createStorageAdapter,
};
