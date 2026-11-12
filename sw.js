// Keeps the app working with no signal: serves saved copies, refreshes them when online.
const CACHE = "nzcs-chargeout-v50";
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
  // "no-cache" makes the browser check GitHub for a newer copy instead of reusing one for up to 10 minutes.
  e.respondWith(fetch(e.request.url, {cache: "no-cache", credentials: "same-origin"}).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request).then(hit => hit || caches.match("index.html"))));
});

// Incident alerts: the server sends an empty "ping"; show a notification that opens the incident list.
self.addEventListener("push", e => {
  e.waitUntil(self.registration.showNotification("Incident reported", {
    body: "A new incident / accident report needs investigation. Tap to open it.",
    icon: "icon-192.png", badge: "icon-192.png", tag: "nzcs-incident", renotify: true,
    data: { url: self.registration.scope + "#incident-report" }
  }));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || self.registration.scope;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    for (const c of list) { if (c.url.startsWith(self.registration.scope) && "focus" in c) { c.navigate(url); return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});
