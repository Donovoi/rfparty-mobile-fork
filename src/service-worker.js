/**
 * RFParty Service Worker
 *
 * Enables offline functionality for the PWA.
 */

const CACHE_NAME = "rfparty-v1";
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/rfparty-mobile-fork.b16a743c.js",
  "/rfparty-mobile-fork.a7b1b781.css",
  "/rfparty-mobile-fork.9b8697d6.css",
  "/rfparty-mobile-fork.69c37f14.css",
  "/dataparty-browser.js",
  "/PermanentMarker-Regular.fcad48d9.ttf",
  "/RobotoCondensed-Regular.30b36dd2.ttf",
];

// Map tile cache (separate, with limits)
const TILE_CACHE_NAME = "rfparty-tiles-v1";
const MAX_TILE_CACHE_SIZE = 500; // Max number of tiles to cache

// Install event - cache static assets
self.addEventListener("install", (event) => {
  console.log("[SW] Installing service worker...");

  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        console.log("[SW] Caching static assets");
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        console.log("[SW] Static assets cached");
        return self.skipWaiting();
      })
      .catch((err) => {
        console.error("[SW] Cache error:", err);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener("activate", (event) => {
  console.log("[SW] Activating service worker...");

  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME && name !== TILE_CACHE_NAME)
            .map((name) => {
              console.log("[SW] Deleting old cache:", name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log("[SW] Service worker activated");
        return self.clients.claim();
      })
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Handle map tile requests separately
  if (url.hostname.includes("mapbox") || url.hostname.includes("tile")) {
    event.respondWith(handleTileRequest(event.request));
    return;
  }

  // For other requests, try cache first
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request)
        .then((response) => {
          // Don't cache non-success responses or non-GET requests
          if (
            !response ||
            response.status !== 200 ||
            event.request.method !== "GET"
          ) {
            return response;
          }

          // Clone the response
          const responseToCache = response.clone();

          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });

          return response;
        })
        .catch(() => {
          // Return offline fallback if available
          if (event.request.destination === "document") {
            return caches.match("/index.html");
          }
          return new Response("Offline", { status: 503 });
        });
    })
  );
});

// Handle map tile caching with size limits
async function handleTileRequest(request) {
  const cache = await caches.open(TILE_CACHE_NAME);
  const cachedResponse = await cache.match(request);

  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const response = await fetch(request);

    if (response && response.status === 200) {
      // Cache the tile
      const responseToCache = response.clone();

      // Check cache size and evict old tiles if needed
      const keys = await cache.keys();
      if (keys.length >= MAX_TILE_CACHE_SIZE) {
        // Delete oldest 10% of tiles
        const toDelete = keys.slice(0, Math.floor(MAX_TILE_CACHE_SIZE * 0.1));
        await Promise.all(toDelete.map((key) => cache.delete(key)));
      }

      await cache.put(request, responseToCache);
    }

    return response;
  } catch (error) {
    console.log("[SW] Tile fetch failed:", error);
    // Return a placeholder or cached fallback
    return new Response("", { status: 503 });
  }
}

// Handle messages from main thread
self.addEventListener("message", (event) => {
  if (event.data === "skipWaiting") {
    self.skipWaiting();
  }

  if (event.data === "clearCache") {
    caches.keys().then((names) => {
      names.forEach((name) => caches.delete(name));
    });
  }
});
