// WOS RST service worker: makes the site installable and keeps the app
// shell (page + icons) available offline. Game data still comes live from
// Supabase, so anything needing the database simply waits for a connection.
const VERSION = "wosrst-v1";
const SHELL = ["./", "./index.html", "./pwa/manifest.json"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // Supabase, CDNs: straight to network
  // The page itself: network first so updates show up right away, cache if offline.
  if (req.mode === "navigate" || url.pathname.endsWith("/index.html")) {
    e.respondWith(fetch(req).then((res) => { caches.open(VERSION).then((c) => c.put(req, res.clone())); return res; })
      .catch(() => caches.match(req).then((r) => r || caches.match("./index.html"))));
    return;
  }
  // Icons and other static files: cache first, fetched once.
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => { if (res.ok) caches.open(VERSION).then((c) => c.put(req, res.clone())); return res; })));
});
