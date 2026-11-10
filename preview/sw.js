// Keeps the app working with no signal: serves saved copies, refreshes them when online.
const CACHE = "nzcs-chargeout-preview-v19";
const FILES = ["./", "index.html", "manifest.webmanifest", "icon-192.png", "icon-512.png", "vendor/jspdf.umd.min.js", "vendor/jspdf.plugin.autotable.min.js", "forms.js", "vendor/logo.js", "icon-192-maskable.png", "icon-512-maskable.png"];
self.addEventListener("install", e => {
  // Cache each file on its own so one missing file can't stop the rest.
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(FILES.map(f => c.add(f).catch(() => {})))));
  self.skipWaiting();
});
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  // Network first so updates show straight away; fall back to the saved copy when offline.
  e.respondWith(fetch(e.request).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request).then(hit => hit || caches.match("index.html"))));
});
