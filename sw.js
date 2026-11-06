// WOS RST service worker: makes the site installable and keeps the app
// shell (page + icons) available offline. Game data still comes live from
// Supabase, so anything needing the database simply waits for a connection.
const VERSION = "wosrst-v2";
const SHELL = ["./", "./index.html", "./manifest.webmanifest"];

// The app's code and styles live in app.js / app.css, linked as "app.js?v=<hash>":
// a new version gets a new address, so they are kept cache-first by address and
// the older copies are dropped once a new one is stored. At install the ones the
// page links to are cached with it, so the site also opens offline after the
// first visit (the first page load happens before this worker is in control).
const VERSIONED = /\/(app|admin)\.(js|css)$/;
// A copy is kept only when it is the version its address names: the server ignores
// "?v=", so an old address can bring back a newer file. app.js / app.css: "v" = the
// start of the file's SHA-256 (tools/stamp.js); admin.js carries its id inside.
const isVersion = async (url, res) => {
  const u = new URL(url), v = u.searchParams.get("v");
  if (/\/admin\.js$/.test(u.pathname)) return (await res.clone().text()).includes(`window.ADMIN_BUILD = "${v}";`);
  if (!self.crypto || !crypto.subtle) return true;
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", await res.clone().arrayBuffer()));
  return [...d.slice(0, 5)].map((b) => b.toString(16).padStart(2, "0")).join("") === v;
};
const putVersioned = (req, res) => caches.open(VERSION).then(async (c) => {
  if (!(await isVersion(typeof req === "string" ? req : req.url, res))) return;
  await c.put(req, res);
  const url = new URL(typeof req === "string" ? req : req.url);
  for (const k of await c.keys()) { const u = new URL(k.url); if (u.pathname === url.pathname && u.search !== url.search) await c.delete(k); }
});
// Caches the app.js / app.css a copy of the page links to, when not cached yet.
const keepLinked = async (c, html) => {
  for (const l of new Set(html.match(/app\.(?:js|css)\?v=[0-9a-f]+/g) || [])) {
    const u = new URL("./" + l, self.location).href;
    if (!(await c.match(u))) { const res = await fetch(u); if (res.ok) await putVersioned(u, res); }
  }
};
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then(async (c) => {
    await c.addAll(SHELL);
    try {
      const page = await c.match("./index.html");
      if (page) await keepLinked(c, await page.text());
    } catch (err) { /* fetched again on first use */ }
  }).then(() => self.skipWaiting()));
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
  // A slow network (no answer within 3 s) shows the saved copy instead of a white
  // screen; the network answer still replaces the saved copy for next time.
  if (req.mode === "navigate" || url.pathname.endsWith("/index.html")) {
    let stored, savedShown = false;
    e.waitUntil(new Promise((r) => { stored = r; }));
    const net = fetch(req).then((res) => {
      if (res.ok) {
        // When the saved copy was shown, this copy's app.js / app.css weren't
        // loaded: keep them too, so it also opens offline next time.
        const copy = res.clone(), text = savedShown ? res.clone().text() : null;
        caches.open(VERSION).then(async (c) => { await c.put(req, copy); if (text) await keepLinked(c, await text); }).then(stored, stored);
      } else stored();
      return res;
    }, (err) => { stored(); throw err; });
    const saved = () => caches.match(req).then((r) => r || caches.match("./index.html"));
    e.respondWith(new Promise((resolve, reject) => {
      let done = false, timer = 0;
      const finish = (r) => { if (!done) { done = true; clearTimeout(timer); resolve(r); } };
      timer = setTimeout(() => saved().then((r) => { if (r && !done) { savedShown = true; finish(r); } }), 3000);
      net.then(finish, () => saved().then((r) => { if (r) finish(r); else if (!done) { done = true; clearTimeout(timer); reject(new TypeError("offline, no saved copy")); } }));
    }));
    return;
  }
  // app.js / app.css / admin.js at one "?v=<hash>": cache first, older versions dropped.
  if (VERSIONED.test(url.pathname) && url.searchParams.has("v")) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => { if (res.ok) putVersioned(req, res.clone()); return res; })));
    return;
  }
  // Icons and other static files: cache first, fetched once.
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); } return res; })));
});
