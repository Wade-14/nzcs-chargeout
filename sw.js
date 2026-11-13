// Keeps the app working with no signal: serves saved copies, refreshes them when online.
const CACHE = "nzcs-chargeout-v52";
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

// Manager alerts: the server sends an empty "ping", then the app asks what it was about
// (an incident report, or the monthly "check Jobs in progress" reminder) and shows the right notification.
const API = /^(localhost|127\.0\.0\.1)$/.test(self.location.hostname) ? "http://localhost:8787" : "https://nzcs-chargeout-api.royal-dawn-9e17.workers.dev";
const NOTE = {
  incident: () => ({title: "Incident reported", body: "A new incident / accident report needs investigation. Tap to open it.", url: "#incident-report"}),
  jobs: n => ({title: "Charge Outs in progress", body: `${n} Charge Out job${n === 1 ? " is" : "s are"} in progress. Check whether any can be finished and sent for end-of-month invoicing.`, url: "#folder-chargeout"}),
};
async function showNotices(){
  let notices = [];
  try{
    const sub = await self.registration.pushManager.getSubscription();
    const r = await fetch(API + "/api/push/notices", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({endpoint: sub ? sub.endpoint : ""})});
    if (r.ok) notices = (await r.json()).notices || [];
  }catch(e){}
  if (!notices.length) notices = [{id: "latest", type: "incident", count: 0}];   // can't tell: incidents are the urgent case
  const shown = await self.registration.getNotifications();
  for (const n of notices){
    const tag = "nzcs-" + n.id;
    if (shown.some(x => x.tag === tag)) continue;
    const t = (NOTE[n.type] || NOTE.incident)(n.count);
    await self.registration.showNotification(t.title, {body: t.body, icon: "icon-192.png", badge: "icon-192.png", tag, data: {url: self.registration.scope + t.url}});
  }
}
self.addEventListener("push", e => { e.waitUntil(showNotices()); });
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || self.registration.scope;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    for (const c of list) { if (c.url.startsWith(self.registration.scope) && "focus" in c) { c.navigate(url); return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});
