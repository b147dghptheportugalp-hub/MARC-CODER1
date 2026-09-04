const CACHE_NAME = 'arcadesuite-dynamic-v4';

// Core files that get saved immediately when the app is installed
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

// Step 1: Install and save the core files
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(CORE_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => Promise.all(
      cacheNames
        .filter((cacheName) => cacheName !== CACHE_NAME)
        .map((cacheName) => caches.delete(cacheName))
    )).then(() => self.clients.claim())
  );
});

// Step 2: Intercept requests, ignore AI, and dynamically cache the rest
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }

  const requestUrl = event.request.url;

  // EXCLUSION: If the user is trying to load anything from the AI tool, DO NOT cache it.
  // It will only work with an active internet connection.
  if (requestUrl.includes('/ai/')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // DYNAMIC CACHING: For all other games, check the cache first. 
  // If it's not there, grab it from the internet and save it for next time.
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // Return the saved file if we have it
      if (cachedResponse) {
        return cachedResponse;
      }

      // Otherwise, go to the internet to get it
      return fetch(event.request).then((networkResponse) => {
        // Make sure it's a valid response before saving it
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }

        // Save a copy of the new file to the cache
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });

        return networkResponse;
      }).catch(() => {
        // Keep app navigation usable after the installed app is reopened offline.
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }

        return Response.error();
      });
    })
  );
});