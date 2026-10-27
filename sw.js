// WOS RST service worker: makes the site installable and keeps the app
// shell (page + icons) available offline. Game data still comes live from
// Supabase, so anything needing the database simply waits for a connection.
const VERSION = "wosrst-v2";
const SHELL = ["./", "./index.html", "./manifest.webmanifest"];

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
  // The Supabase library at its exact (never-changing) version: cache-first,
  // so repeat visits skip the download and the app still opens offline.
  // Same for the Budgets planner's solver (HiGHS, exact version, about 1 MB).
  // The page loads them with a fingerprint check (CORS), so only a good copy
  // (status 200) is kept; an old unreadable copy (opaque, saved before the
  // check) is fetched again and replaced.
  if (url.hostname === "cdn.jsdelivr.net" && (url.pathname.startsWith("/npm/@supabase/supabase-js@2.117.3/") || url.pathname.startsWith("/npm/highs@1.15.3/build/"))) {
    e.respondWith(caches.match(req).then((hit) => (hit && hit.type !== "opaque" ? hit : fetch(req).then((res) => { if (res.ok && res.type !== "opaque") { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); } return res; }).catch((err) => hit || Promise.reject(err)))));
    return;
  }
  if (url.origin !== location.origin) return; // Supabase, other CDNs: straight to network
  // The page itself: network first so updates show up right away, cache if offline.
  if (req.mode === "navigate" || url.pathname.endsWith("/index.html")) {
    e.respondWith(fetch(req).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); } return res; })
      .catch(() => caches.match(req).then((r) => r || caches.match("./index.html"))));
    return;
  }
  // Icons and other static files: cache first, fetched once.
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); } return res; })));
});
