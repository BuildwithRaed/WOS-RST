// WOS RST service worker: makes the site installable and keeps the app
// shell (page + icons) available offline. Game data still comes live from
// Supabase, so anything needing the database simply waits for a connection.
const VERSION = "wosrst-v2";
const SHELL = ["./", "./index.html", "./manifest.webmanifest"];

// The app's code and styles are loaded from the packed copies app.min.js /
// app.min.css / admin.min.js / scan.min.js / packs.min.js / gallery.min.js /
// purchases.min.js / budgets.min.js (made from app.js / app.css / admin.js / scan.js /
// packs.js / gallery.js / purchases.js / budgets.js by
// tools/stamp.js), linked as "app.min.js?v=<hash>":
// a new version gets a new address, so they are kept cache-first by address and
// the older copies are dropped once a new one is stored. At install the ones the
// page links to are cached with it (also the page files packs / gallery / purchases / budgets, named in
// its small preload map), so the site also opens offline after the first visit (the
// first page load happens before this worker is in control).
const VERSIONED = /\/(app|admin|scan|packs|gallery|purchases|budgets)(\.min)?\.(js|css)$/;
// A copy is kept only when it is the version its address names: the server ignores
// "?v=", so an old address can bring back a newer file. app / app.css: "v" = the
// start of the file's SHA-256 (tools/stamp.js); the files app.js loads on demand
// carry their id inside (window.ADMIN_BUILD / SCAN_BUILD / PACKS_BUILD / GALLERY_BUILD /
// PURCHASES_BUILD / BUDGETS_BUILD
// = "<v>", written without spaces in the packed copy).
const BUILD_VAR = { admin: "ADMIN_BUILD", scan: "SCAN_BUILD", packs: "PACKS_BUILD", gallery: "GALLERY_BUILD", purchases: "PURCHASES_BUILD", budgets: "BUDGETS_BUILD" };
const isVersion = async (url, res) => {
  const u = new URL(url), v = u.searchParams.get("v");
  const m = u.pathname.match(/\/(admin|scan|packs|gallery|purchases|budgets)(\.min)?\.js$/);
  const build = m ? BUILD_VAR[m[1]] : null;
  if (build) { const text = await res.clone().text(); return text.includes(`window.${build}="${v}"`) || text.includes(`window.${build} = "${v}";`); }
  if (!self.crypto || !crypto.subtle) return true;
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", await res.clone().arrayBuffer()));
  return [...d.slice(0, 5)].map((b) => b.toString(16).padStart(2, "0")).join("") === v;
};
const putVersioned = (req, res) => caches.open(VERSION).then(async (c) => {
  if (!(await isVersion(typeof req === "string" ? req : req.url, res))) return;
  await c.put(req, res);
  const url = new URL(typeof req === "string" ? req : req.url);
  // Older versions go, also the unpacked "app.js?v=" copies kept before the packed ones.
  const base = (p) => p.replace(/\.min\.(js|css)$/, ".$1");
  for (const k of await c.keys()) { const u = new URL(k.url); if (VERSIONED.test(u.pathname) && base(u.pathname) === base(url.pathname) && u.href !== url.href) await c.delete(k); }
});
// Caches the app.min.js / app.min.css a copy of the page links to (and the page files
// packs.min.js / gallery.min.js / purchases.min.js / budgets.min.js its preload map names), when not cached yet.
// pagesOnly: only the page files (the page itself is loading app.min.js / app.min.css).
const keepLinked = async (c, html, pagesOnly) => {
  const re = pagesOnly ? /(?:packs|gallery|purchases|budgets)\.min\.js\?v=[0-9a-f]+/g : /(?:app(?:\.min)?\.(?:js|css)|(?:packs|gallery|purchases|budgets)\.min\.js)\?v=[0-9a-f]+/g;
  for (const l of new Set(html.match(re) || [])) {
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
  // The page now loads only the packed copies, so the unpacked app.js / app.css /
  // admin.js copies kept before them (~2.5 MB) are dropped.
  const dropUnpacked = () => caches.open(VERSION).then(async (c) => { for (const k of await c.keys()) if (/\/(app|admin)\.(js|css)$/.test(new URL(k.url).pathname)) await c.delete(k); }).catch(() => {});
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(dropUnpacked).then(() => self.clients.claim()));
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
        // loaded: keep them too, so it also opens offline next time. The page files
        // (packs / gallery / purchases / budgets) of a new version are kept either way (after 5 s, so they
        // don't slow the page's own downloads), so every page opens offline.
        const copy = res.clone(), text = res.clone().text();
        caches.open(VERSION).then(async (c) => {
          await c.put(req, copy);
          if (savedShown) await keepLinked(c, await text);
          else { await new Promise((r) => setTimeout(r, 5000)); await keepLinked(c, await text, true); }
        }).then(stored, stored);
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
  // app / app.css / admin / scan / packs / gallery / purchases / budgets (packed copies) at one "?v=<hash>": cache first, older versions dropped.
  if (VERSIONED.test(url.pathname) && url.searchParams.has("v")) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => { if (res.ok) putVersioned(req, res.clone()); return res; })));
    return;
  }
  // Language files at one "?v=N" (LANG_FILES_VERSION): cache first like any static
  // file, but storing a new version drops the older copies of the same file.
  if (/\/lang\/[^/]+\.json$/.test(url.pathname) && url.searchParams.has("v")) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(VERSION).then(async (c) => {
          await c.put(req, copy);
          for (const k of await c.keys()) { const u = new URL(k.url); if (u.pathname === url.pathname && u.href !== url.href) await c.delete(k); }
        });
      }
      return res;
    })));
    return;
  }
  // Icons and other static files: cache first, fetched once.
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); } return res; })));
});
