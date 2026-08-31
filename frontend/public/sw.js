// Deliberately does nothing.
//
// Chrome will only build a WebAPK — a real installed Android app, which is
// what makes the app appear in Funtouch OS's floating-window switcher — for
// a site that registers a service worker with a fetch handler. That's the
// only reason this file exists.
//
// It caches nothing on purpose. A caching worker on a prototype means the
// phone can serve yesterday's bundle during a demo, which is a far worse
// failure than having no offline support. The fetch listener is registered
// but falls through to the network for every request.

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('fetch', () => {
  // No respondWith() — the browser handles the request normally.
})
