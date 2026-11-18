// WOS RST: the Backpack's Scan (reads game screenshots on the phone). Loaded by
// loadScanCode() in app.js the first time Scan is opened, after app.js, as a plain
// script: everything here can use app.js's functions and variables, and app.js
// reaches this file only through openBackpackScan() (the stub there calls
// openBackpackScanMain()). Keep it that way: anything another page uses belongs in
// app.js (SCAN_SIZE_COLORS, bpItemTab, SCAN_LEARNED, scanLearnedLoad …).
// Build id: checked by loadScanCode() (written by tools/stamp.js, don't edit).
window.SCAN_BUILD = "64a7ef20ff";


// ---- Backpack: read game screenshots ----
// Everything runs on the phone; screenshots are never uploaded. Text is read
// with Tesseract, downloaded from jsdelivr the first time Scan is used (the
// browser keeps it after that). Reads the "Resource & Speedup Summary"
// Resources tab and the Backpack Speedup tab.
const SCAN_CDN = "https://cdn.jsdelivr.net/npm/";
let SCAN_WORKER = null;
let SCAN_PROGRESS = null; // the open Scan box shows the download progress
function scanWorker() {
  if (!SCAN_WORKER) {
    SCAN_WORKER = new Promise((resolve, reject) => {
      // A download that stops moving (bad connection) ends with an error
      // instead of spinning forever.
      let last = Date.now();
      const stall = setInterval(() => { if (Date.now() - last > 120000) { clearInterval(stall); reject(new Error("stalled")); } }, 5000);
      const done = (fn) => (v) => { clearInterval(stall); fn(v); };
      resolve = done(resolve); reject = done(reject);
      const start = () => window.Tesseract.createWorker("eng", 1, {
        workerPath: `${SCAN_CDN}tesseract.js@5.1.1/dist/worker.min.js`,
        corePath: `${SCAN_CDN}tesseract.js-core@5.1.1`,
        langPath: `${SCAN_CDN}@tesseract.js-data/eng@1.0.0/4.0.0_best_int`,
        logger: (m) => { last = Date.now(); if (SCAN_PROGRESS) SCAN_PROGRESS(m); },
      }).then(resolve, reject);
      if (window.Tesseract) { start(); return; }
      // The reader file is checked against its fingerprint (a changed copy is
      // refused); if the CDN copy can't be used, this site's own copy is.
      const load = (src, sri, fail) => {
        const s = document.createElement("script");
        if (sri) { s.integrity = sri; s.crossOrigin = "anonymous"; }
        s.src = src;
        s.onload = start;
        s.onerror = fail;
        document.head.appendChild(s);
      };
      load(`${SCAN_CDN}tesseract.js@5.1.1/dist/tesseract.min.js`, "sha384-GJqSu7vueQ9qN0E9yLPb3Wtpd7OrgK8KmYzC8T1IysG1bcvxvIO4qtYR/D3A991F",
        () => load("vendor/tesseract-5.1.1.min.js", "", () => reject(new Error("load"))));
    });
    SCAN_WORKER.catch(() => { SCAN_WORKER = null; });
  }
  return SCAN_WORKER;
}
async function scanRead(worker, canvas, params) {
  await worker.setParameters(Object.assign({ tessedit_pageseg_mode: "3", tessedit_char_whitelist: "" }, params || {}));
  const r = await worker.recognize(canvas);
  return { text: r.data.text || "", conf: r.data.confidence || 0 };
}
const scanCanvas = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };

// Labelled blobs of a yes/no pixel mask: [{x, y, w, h, n, px}] (px = pixel indexes).
function scanBlobs(mask, w, h, keepPixels) {
  const seen = new Uint8Array(w * h), out = [], stack = [];
  for (let i = 0; i < w * h; i++) {
    if (!mask[i] || seen[i]) continue;
    let x0 = w, y0 = h, x1 = 0, y1 = 0, n = 0;
    const px = keepPixels ? [] : null;
    seen[i] = 1; stack.push(i);
    while (stack.length) {
      const p = stack.pop(), x = p % w, y = (p - x) / w;
      n++; if (px) px.push(p);
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny * w + nx;
        if (mask[q] && !seen[q]) { seen[q] = 1; stack.push(q); }
      }
    }
    out.push({ x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, n, px });
  }
  return out;
}

// Backpack item tiles: square, same-sized blocks on the dark blue panel.
// Returns boxes in the screenshot's own pixels, row by row.
function scanFindTiles(src) {
  const s = Math.min(1, 480 / src.width), w = Math.round(src.width * s), h = Math.round(src.height * s);
  const c = scanCanvas(w, h), g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(src, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data, mask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = d[i * 4], gr = d[i * 4 + 1], b = d[i * 4 + 2], lum = (r + gr + b) / 3;
    mask[i] = (b - r > 50 && lum < 110) || lum < 45 ? 0 : 1;
  }
  const boxes = scanBlobs(mask, w, h).filter((b) => b.w >= w * 0.08 && b.h >= w * 0.08 && b.w / b.h > 0.8 && b.w / b.h < 1.25 && b.n > b.w * b.h * 0.6);
  if (boxes.length < 2) return [];
  const sizes = boxes.map((b) => b.w).sort((a, b) => a - b), mid = sizes[Math.floor(sizes.length / 2)];
  const tiles = boxes.filter((b) => Math.abs(b.w - mid) < mid * 0.12 && Math.abs(b.h - mid) < mid * 0.15)
    .map((b) => ({ x: b.x / s, y: b.y / s, w: b.w / s, h: b.h / s }));
  tiles.sort((a, b) => (Math.abs(a.y - b.y) < a.h / 2 ? a.x - b.x : a.y - b.y));
  return tiles.length >= 2 ? tiles : [];
}

const SCAN_SIZES = { 1: "1m", 3: "3m", 5: "5m", 60: "1h", 180: "3h", 480: "8h" }; // as read from the label
// Type marks, in the order of icons/scan-marks.png (32px each).
const SCAN_MARKS = ["Construction", "Troop", "Research", "Healing", "Expert"];
let SCAN_MARK_DATA = null;
function scanMarkData() {
  if (!SCAN_MARK_DATA) {
    SCAN_MARK_DATA = new Promise((resolve, reject) => {
      const img = new Image();
      // Read with CORS: the preview host serves pictures from another address,
      // and a picture read without it can't be measured (the canvas is blocked).
      img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          const c = scanCanvas(img.width, img.height), g = c.getContext("2d", { willReadFrequently: true });
          g.drawImage(img, 0, 0);
          resolve(g.getImageData(0, 0, img.width, img.height));
        } catch (e) { reject(e); }
      };
      img.onerror = () => reject(new Error("marks"));
      setTimeout(() => reject(new Error("marks timeout")), 45000); // no answer at all: stop waiting
      img.src = "icons/scan-marks.png";
    });
    SCAN_MARK_DATA.catch(() => { SCAN_MARK_DATA = null; });
  }
  return SCAN_MARK_DATA;
}

// White game text with a dark outline, as black on white for the reader.
// `digits` keeps only the characters sitting on the number's baseline.
function scanTextMask(td, x0, y0, x1, y1, digits) {
  const w = x1 - x0, h = y1 - y0, mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = ((y0 + y) * 140 + x0 + x) * 4, r = td[i], g = td[i + 1], b = td[i + 2];
    // Near-white: bright, not bluish (ice arrows) and not orange (tile colour).
    mask[y * w + x] = (r + g + b) / 3 > 175 && r >= b - 8 && g >= b - 15 && Math.max(r, g, b) - Math.min(r, g, b) < 55 ? 1 : 0;
  }
  let blobs = scanBlobs(mask, w, h, true).filter((b) => b.n > 2);
  if (digits) {
    const big = blobs.filter((b) => b.h >= 12 && b.h <= 34 && b.w < 28);
    if (!big.length) return null;
    // The number is right-aligned: its line is the one of the rightmost character.
    const last = big.reduce((a, b) => (b.x + b.w > a.x + a.w ? b : a)), base = last.y + last.h;
    // Only the number's own band: a badge drawn above it (the shield on
    // protected chests) can touch a digit and make it look too tall.
    const top = base - last.h - 3;
    if (blobs.some((b) => b.y < top && b.y + b.h > top)) {
      for (let y = 0; y < Math.max(0, top); y++) for (let x = 0; x < w; x++) mask[y * w + x] = 0;
      blobs = scanBlobs(mask, w, h, true).filter((b) => b.n > 2);
    }
    const onLine = blobs.filter((b) => b.h >= 12 && b.h <= 34 && b.w < 28 && Math.abs(b.y + b.h - base) < 7);
    const left = Math.min(...onLine.map((b) => b.x));
    blobs = blobs.filter((b) => Math.abs(b.y + b.h - base) < 9 && b.x >= left - 2 && b.h <= 34);
  }
  if (!blobs.length) return null;
  // The reader can't see a lone "1" or "11" in the game font: thin blocks only.
  const ones = digits && blobs.every((b) => b.h >= 12 && b.w < b.h * 0.45) ? "1".repeat(blobs.length) : "";
  const draw = (ox, oy, cw, ch, k, pad) => {
    const c = scanCanvas(cw * k + pad * 2, ch * k + pad * 2), g = c.getContext("2d");
    g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.fillStyle = "#000";
    blobs.forEach((b) => b.px.forEach((p) => { const x = p % w; g.fillRect(pad + (x - ox) * k, pad + ((p - x) / w - oy) * k, k, k); }));
    return c;
  };
  const c = draw(0, 0, w, h, 2, 16);
  // Also cut tight and drawn bigger: the reader can miss a lone digit ("8")
  // in a wide empty strip.
  if (digits) {
    const ox = Math.min(...blobs.map((b) => b.x)), oy = Math.min(...blobs.map((b) => b.y));
    c.tight = draw(ox, oy, Math.max(...blobs.map((b) => b.x + b.w)) - ox, Math.max(...blobs.map((b) => b.y + b.h)) - oy, 4, 20);
  }
  c.ones = ones;
  // How many digits the number has (commas are shorter), to catch a digit the reader lost.
  if (digits) {
    // Digits stand on one line; a mark that ends higher (a badge's edge) is not a digit.
    const tall = Math.max(...blobs.map((b) => b.h)), foot = Math.max(...blobs.filter((b) => b.h >= tall * 0.6).map((b) => b.y + b.h));
    const shapes = blobs.filter((b) => b.h >= tall * 0.6 && b.y + b.h >= foot - 3).sort((a, b) => a.x - b.x);
    c.count = shapes.length;
    // Which digit shapes are thin "1"s, left to right (the reader can lose them: "171" → "7").
    c.thin = shapes.map((b) => b.w < b.h * 0.45);
  }
  return c;
}

function scanTileFeature(td) {
  const f = new Uint8Array(SCAN_FEAT_W * SCAN_FEAT_H * 3);
  for (let cy = 0; cy < SCAN_FEAT_H; cy++) for (let cx = 0; cx < SCAN_FEAT_W; cx++) {
    let r = 0, g = 0, b = 0;
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      const i = ((28 + cy * 4 + y) * 140 + 10 + cx * 4 + x) * 4;
      r += td[i]; g += td[i + 1]; b += td[i + 2];
    }
    const k = (cy * SCAN_FEAT_W + cx) * 3;
    f[k] = r / 16; f[k + 1] = g / 16; f[k + 2] = b / 16;
  }
  return f;
}

const scanFeatToB64 = (f) => btoa(String.fromCharCode(...f));
async function scanLearnedSave(entries) {
  if (!IS_OWNER) return;
  await ensureSiteConfigKey("scan_learned");
  await saveSiteConfig("scan_learned", { items: (((siteConfig("scan_learned", null) || {}).items) || []).concat(entries) });
}
const scanKnowsName = (n) => n !== SCAN_SKIP && (SCAN_ITEM_NAMES.includes(n) || SCAN_LEARNED.some((e) => e.n === n));
// A tab's item order with the taught items put after the item they followed
// (heroes' own shards have no fixed place, so they're left out).
function scanTabOrder(tab) {
  const list = (SCAN_TAB_ORDER[tab] || []).slice();
  SCAN_LEARNED.forEach((e) => {
    if (e.n === SCAN_SKIP || list.includes(e.n) || scanItemTab(e.n) !== tab || !e.after || (/ (Shards|Widgets)$/.test(e.n) && !/General Hero Shard/.test(e.n))) return;
    const k = list.indexOf(e.after);
    if (k >= 0) list.splice(k + 1, 0, e.n);
  });
  return list;
}
let SCAN_ITEM_DATA = null;
function scanItemData() {
  if (!SCAN_ITEM_DATA) {
    SCAN_ITEM_DATA = new Promise((resolve, reject) => {
      const img = new Image();
      // Read with CORS: the preview host serves pictures from another address,
      // and a picture read without it can't be measured (the canvas is blocked).
      img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          const c = scanCanvas(img.width, img.height), g = c.getContext("2d", { willReadFrequently: true });
          g.drawImage(img, 0, 0);
          resolve(g.getImageData(0, 0, img.width, img.height).data);
        } catch (e) { reject(e); }
      };
      img.onerror = () => reject(new Error("items"));
      setTimeout(() => reject(new Error("items timeout")), 45000); // no answer at all: stop waiting
      img.src = "icons/scan-items.png?v=6"; // bump when rows are added (icons are cached cache-first)
    });
    SCAN_ITEM_DATA.catch(() => { SCAN_ITEM_DATA = null; });
  }
  return SCAN_ITEM_DATA;
}
// Closest learned item and how far it is (average colour difference), and
// the closest different item, to tell a clear match from a close call.
function scanMatchItem(feat, refs) {
  const n = feat.length, best = new Map();
  SCAN_ITEM_NAMES.forEach((name, k) => {
    if ((k + 1) * (n / 3) * 4 > refs.length) return; // an older copy of the picture: no row yet
    let sum = 0;
    for (let i = 0, j = k * (n / 3) * 4; i < n; i += 3, j += 4) sum += Math.abs(feat[i] - refs[j]) + Math.abs(feat[i + 1] - refs[j + 1]) + Math.abs(feat[i + 2] - refs[j + 2]);
    const d = sum / n;
    if (!best.has(name) || d < best.get(name)) best.set(name, d);
  });
  SCAN_LEARNED.forEach((e) => {
    if (e.kind === "island") return; // Island Storehouse tiles (scanIslMatch)
    let sum = 0;
    for (let i = 0; i < n; i++) sum += Math.abs(feat[i] - e.g[i]);
    const d = sum / n;
    if (!best.has(e.n) || d < best.get(e.n)) best.set(e.n, d);
  });
  const [first, second] = [...best.entries()].sort((a, b) => a[1] - b[1]);
  return { name: first[0], dist: first[1], next: second ? second[1] : Infinity };
}
// A size label printed on top of the tile ("1K", "10K", "100", "1M", "10"):
// resource bundles (Meat / Wood / Coal / Iron / Gems), Hero XP bottles and
// Chief Stamina cans. Their totals come from the Summary screen, so Scan never
// asks about them. White digits across the top centre.
function scanTopLabel(td) {
  const x0 = 30, y0 = 2, w = 80, h = 30, mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = ((y0 + y) * 140 + x0 + x) * 4, r = td[i], g = td[i + 1], b = td[i + 2];
    mask[y * w + x] = r > 225 && g > 225 && b > 215 ? 1 : 0;
  }
  const blobs = scanBlobs(mask, w, h, false).filter((b) => b.h >= 10 && b.h <= 26 && b.w <= 22 && b.n > 12);
  if (blobs.length < 2 && !(blobs.length === 1 && blobs[0].w < blobs[0].h * 0.5)) return false;
  const bot = Math.max(...blobs.map((b) => b.y + b.h));
  const line = blobs.filter((b) => Math.abs(b.y + b.h - bot) <= 4);
  return line.length >= 1 && line.length === blobs.length && line.every((b) => b.y + b.h <= 28);
}
// The cream "S14" on a Gen's widget box (top left), as black digits on white;
// the "S" (first shape) is left out.
function scanGenLabel(td) {
  const x0 = 4, y0 = 14, w = 66, h = 40, mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = ((y0 + y) * 140 + x0 + x) * 4, r = td[i], g = td[i + 1], b = td[i + 2];
    mask[y * w + x] = r > 200 && g > 180 && b < 175 && r - b > 50 ? 1 : 0;
  }
  const blobs = scanBlobs(mask, w, h, true).filter((b) => b.h >= 12 && b.x + b.w < w - 1).sort((a, b) => a.x - b.x).slice(1);
  if (!blobs.length) return null;
  const k = 3, pad = 16, c = scanCanvas(w * k + pad * 2, h * k + pad * 2), g = c.getContext("2d");
  g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.fillStyle = "#000";
  blobs.forEach((b) => b.px.forEach((p) => { const x = p % w; g.fillRect(pad + x * k, pad + ((p - x) / w) * k, k, k); }));
  return c;
}
// The amount at a tile's bottom right, and whether it can be trusted.
async function scanTileAmount(worker, td) {
  const num = scanTextMask(td, 21, 87, 136, 136, true);
  if (!num) return { value: null, sure: false };
  const read = (c, mode) => scanRead(worker, c, { tessedit_pageseg_mode: mode, tessedit_char_whitelist: "0123456789,." });
  const got = (r) => r.text.replace(/\D/g, "").length;
  let res = await read(num, "7");
  // Very short numbers ("5", "11") sometimes read as nothing as a line, and a
  // thin "1" next to other digits can go missing ("31" read as "3"): then the
  // tight cut is read too and the one with all its digits is kept.
  for (const mode of ["8", "7"]) {
    if (got(res) >= num.count) break;
    const tight = await read(num.tight, mode);
    if (got(tight) > got(res) && got(tight) <= num.count) res = tight;
  }
  // Only thin "1" shapes: trust the count of shapes over the reader ("11" read as "1").
  if (num.ones && res.text.replace(/\D/g, "") !== num.ones) res = { text: num.ones, conf: 0 };
  // Some "1"s lost among other digits ("171" read as "7"): the reader gave
  // exactly the other digits, so put a "1" back at each thin shape.
  let rebuilt = false;
  if (!num.ones && num.thin && num.thin.some(Boolean)) {
    const d = res.text.replace(/\D/g, ""), wide = num.thin.filter((x) => !x).length;
    if (d.length < num.count && d.length === wide) {
      let k = 0;
      res = { text: num.thin.map((x) => (x ? "1" : d[k++])).join(""), conf: 0 };
      rebuilt = true;
    }
  }
  const raw = res.text.replace(/\s/g, "").replace(/\./g, ",");
  const digits = raw.replace(/\D/g, "");
  if (!digits) return { value: null, sure: false };
  return { value: Number(digits), sure: !rebuilt && /^\d{1,3}(,\d{3})*$/.test(raw) && res.conf >= 70 && (num.ones || digits.length >= num.count) };
}
// Other Backpack tabs: tiles that match a learned item, with their amounts.
async function scanItemTiles(worker, src, tiles, refs) {
  const found = [], unk = [];
  let unknown = 0;
  // A tile Scan doesn't know: kept (picture, colour, the item before it) so it
  // can be taught on the check screen.
  const keepUnknown = (td, feat) => {
    let r = 0, g = 0, b = 0;
    for (let y = 60; y < 80; y++) for (let x = 3; x < 9; x++) { const i = (y * 140 + x) * 4; r += td[i]; g += td[i + 1]; b += td[i + 2]; }
    r /= 120; g /= 120; b /= 120;
    const rarity = r > g + 30 && g > b + 20 ? "Legendary" : r > g + 30 && b > g + 30 ? "Epic" : b > r + 40 ? "Rare" : null;
    const c = scanCanvas(96, 96); c.getContext("2d").drawImage(t, 0, 0, 96, 96);
    // gap: tiles between the item before it and this one (to know later whether a
    // screenshot showed the spot where it sits).
    const last = found.length ? found[found.length - 1] : null;
    unk.push({ td: new Uint8ClampedArray(td), feat, rarity, after: last ? last.name : null, gap: last ? tileIdx - last.k - 1 : null, img: c.toDataURL("image/jpeg", 0.85) });
  };
  const t = scanCanvas(140, 140), tg = t.getContext("2d", { willReadFrequently: true });
  let tileIdx = -1;
  const seq = []; // each tile's item name in reading order (null = not read)
  for (const box of tiles) {
    tileIdx++; seq.push(null);
    tg.clearRect(0, 0, 140, 140);
    tg.drawImage(src, box.x, box.y, box.w, box.h, 0, 0, 140, 140);
    const td = tg.getImageData(0, 0, 140, 140).data;
    const feat = scanTileFeature(td), m = scanMatchItem(feat, refs);
    // A tile the owner marked "Skip — never ask again".
    if (m.name === SCAN_SKIP && m.dist <= 20) { unknown++; continue; }
    // A Gen's widget box with other things pictured inside (another Gen than the
    // learned S14 box): the cream "S15" in the corner still says what it is.
    if (m.dist > 20 && scanGenLabel(td)) { m.name = "Gen Widgets"; m.dist = 20; }
    // Bundles with a size label on top (Meat / Wood / Coal / Iron / Gems, Hero XP,
    // Chief Stamina): their totals come from the Summary screen, never asked about.
    if (m.dist > 20) { unknown++; if (!scanTopLabel(td)) keepUnknown(td, feat); continue; }
    let sure = m.dist <= 12 && m.next > m.dist * 1.4;
    // A hero's own shards: the faces are small, so another (not learned) hero
    // can come close. Only a near-exact match counts.
    if (/ Shards$/.test(m.name)) {
      if (m.dist > 11) { unknown++; keepUnknown(td, feat); continue; }
      sure = m.dist <= 8 && m.next > m.dist * 1.4;
    }
    // A Gen's widget box: the Gen number is on the box ("S14").
    if (m.name === "Gen Widgets") {
      const label = scanGenLabel(td);
      const g = label ? /\d+/.exec((await scanRead(worker, label, { tessedit_pageseg_mode: "7", tessedit_char_whitelist: "0123456789" })).text) : null;
      if (!g || Number(g[0]) < 1 || Number(g[0]) > 40) { unknown++; continue; }
      m.name = `Gen ${Number(g[0])} Widgets`;
      sure = false; // one example learned so far: always ask to check
    }
    // Custom Resource Chest Lv.1 and Lv.2 share a picture: green tile = Lv.1, blue = Lv.2.
    const lv = /^Custom Resource Chest Lv\.[12]( \(protected\))?$/.exec(m.name);
    if (lv) {
      let r = 0, g = 0, b = 0;
      for (let y = 60; y < 80; y++) for (let x = 3; x < 9; x++) { const i = (y * 140 + x) * 4; r += td[i]; g += td[i + 1]; b += td[i + 2]; }
      const level = g > r + 40 && g > b + 40 ? 1 : b > r + 40 && b >= g ? 2 : 0;
      if (level) { m.name = `Custom Resource Chest Lv.${level}${lv[1] || ""}`; sure = m.dist <= 12; }
    }
    const amount = await scanTileAmount(worker, td);
    const value = amount.value;
    if (!amount.sure) sure = false;
    found.push({ name: m.name, value, sure, k: tileIdx });
    seq[tileIdx] = m.name;
  }
  return { found, unknown, unk, seq };
}

async function scanSpeedTiles(worker, src, tiles, marks) {
  const found = [];
  const t = scanCanvas(140, 140), tg = t.getContext("2d", { willReadFrequently: true });
  const m = scanCanvas(32, 32), mg = m.getContext("2d", { willReadFrequently: true });
  for (const box of tiles) {
    tg.clearRect(0, 0, 140, 140);
    tg.drawImage(src, box.x, box.y, box.w, box.h, 0, 0, 140, 140);
    const td = tg.getImageData(0, 0, 140, 140).data;
    // Size: the label on top, with the tile colour as a check.
    const label = scanTextMask(td, 14, 0, 126, 36, false);
    if (!label) continue;
    const lt = (await scanRead(worker, label, { tessedit_pageseg_mode: "7", tessedit_char_whitelist: "0123456789minhrs()" })).text.replace(/\s/g, "");
    // The game's "1" and "5" often read as nothing, so the size comes from
    // the tile colour; the label must say "min" or "hr" and agree with it.
    const unit = /hr|h\(|hrs/.test(lt) ? "h" : /min|mi|in/.test(lt) ? "m" : null;
    if (!unit) continue; // not a speedup
    let r = 0, g = 0, b = 0;
    for (let y = 60; y < 80; y++) for (let x = 3; x < 9; x++) { const i = (y * 140 + x) * 4; r += td[i]; g += td[i + 1]; b += td[i + 2]; }
    r /= 120; g /= 120; b /= 120;
    const [size, off] = SCAN_SIZE_COLORS.map(([z, c]) => [z, Math.abs(c[0] - r) + Math.abs(c[1] - g) + Math.abs(c[2] - b)]).sort((a, z) => a[1] - z[1])[0];
    const lm = /(\d+)(min|hr)/.exec(lt), said = lm && SCAN_SIZES[Number(lm[1]) * (lm[2] === "hr" ? 60 : 1)];
    let sure = off < 90 && size.endsWith(unit) && (!said || said === size || said === "3m");
    // Kind: compare the bottom-left corner with each type mark.
    mg.clearRect(0, 0, 32, 32);
    mg.drawImage(t, 0, 70, 70, 70, 0, 0, 32, 32);
    const md = mg.getImageData(0, 0, 32, 32).data;
    let kind = "", best = Infinity;
    SCAN_MARKS.forEach((name, k) => {
      let sum = 0, n = 0;
      for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
        const j = (y * marks.width + k * 32 + x) * 4;
        if (marks.data[j + 3] < 128) continue;
        const i = (y * 32 + x) * 4;
        sum += Math.abs(md[i] - marks.data[j]) + Math.abs(md[i + 1] - marks.data[j + 1]) + Math.abs(md[i + 2] - marks.data[j + 2]);
        n++;
      }
      const score = n ? sum / n : Infinity;
      if (score < best) { best = score; kind = name; }
    });
    if (best > 150) kind = "";
    // Amount: the number at the bottom right.
    const amount = await scanTileAmount(worker, td);
    const value = amount.value;
    if (!amount.sure) sure = false;
    found.push({ name: `${kind ? kind + " " : ""}Speedup ${size}`, kind, value, sure, score: Math.round(best) });
  }
  return found;
}

function scanSummaryText(text) {
  // Rows in screen order; a row whose name wasn't read takes its place from
  // the named rows around it (and is marked to check).
  const rows = [];
  text.split("\n").forEach((line) => {
    const nums = [...line.matchAll(/(\d[\d,]*\.\d+|\d[\d,]*)(?:\s*[A-Za-z]?([KMB]))?/g)].filter((m) => m[2] || /\.\d{2}8$/.test(m[1]));
    if (!nums.length) return;
    const last = nums[nums.length - 1];
    let n = last[1].replace(/,/g, ""), unit = last[2] || "";
    // The reader sometimes sees "B" as "8" ("2.008" for 2.00B).
    if (!unit) { n = n.slice(0, -1); unit = "B"; }
    // Amounts always show two decimals; put back a dot the reader lost.
    let sure = !!last[2];
    if (!n.includes(".") && n.length >= 3) { n = `${n.slice(0, -2)}.${n.slice(-2)}`; sure = false; }
    const value = Math.round(Number(n) * { K: 1e3, M: 1e6, B: 1e9 }[unit]);
    if (!Number.isFinite(value)) return;
    const at = SCAN_SUMMARY_ROWS.findIndex(([re]) => re.test(line));
    rows.push({ at, value, sure: at !== -1 && sure });
  });
  rows.forEach((row, i) => {
    if (row.at !== -1) return;
    const before = rows.slice(0, i).map((x, j) => [x, i - j]).reverse().find(([x]) => x.at !== -1 && x.guess === undefined);
    const after = rows.slice(i + 1).map((x, j) => [x, j + 1]).find(([x]) => x.at !== -1 && x.guess === undefined);
    const guess = before ? before[0].at + before[1] : after ? after[0].at - after[1] : -1;
    if (guess >= 0 && guess < SCAN_SUMMARY_ROWS.length && (!after || guess < after[0].at) && (!before || guess > before[0].at)) { row.at = guess; row.guess = true; row.sure = false; }
  });
  return rows.filter((r) => r.at !== -1).map((r) => ({ name: SCAN_SUMMARY_ROWS[r.at][1], value: r.value, sure: r.sure }));
}

// The light blue Summary panel (phone screenshots show the dark, blurred
// Backpack around it); the whole picture if there is none.
function scanLightPanel(src) {
  const k = Math.min(1, 240 / src.width), w = Math.round(src.width * k), h = Math.round(src.height * k);
  const c = scanCanvas(w, h), g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(src, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data;
  const light = (x, y) => { const i = (y * w + x) * 4; return (d[i] + d[i + 1] + d[i + 2]) / 3 > 165 && d[i + 2] >= d[i]; };
  const rows = [];
  for (let y = 0; y < h; y++) { let n = 0; for (let x = 0; x < w; x++) if (light(x, y)) n++; rows.push(n > w * 0.4); }
  let best = [0, 0], start = -1;
  rows.concat(false).forEach((on, y) => {
    if (on && start < 0) start = y;
    if (!on && start >= 0) { if (y - start > best[1] - best[0]) best = [start, y]; start = -1; }
  });
  if (best[1] - best[0] < h * 0.2) return { x: 0, y: 0, w: src.width, h: src.height };
  let x0 = w, x1 = 0;
  for (let x = 0; x < w; x++) {
    let n = 0;
    for (let y = best[0]; y < best[1]; y++) if (light(x, y)) n++;
    if (n > (best[1] - best[0]) * 0.4) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
  }
  if (x1 <= x0) return { x: 0, y: 0, w: src.width, h: src.height };
  // A little extra on top for the title.
  const y0 = Math.max(0, best[0] - (best[1] - best[0]) * 0.15);
  return { x: x0 / k, y: y0 / k, w: (x1 - x0 + 1) / k, h: (best[1] - y0) / k };
}

// Backpack Gear tab: every hero gear tile has the light-blue troop badge at
// its top-left corner. Orange (Mythic) pieces count as 1 Mythic Gear each;
// red (worn / upgraded) and purple ones don't.
// Returns the number of orange pieces, or null when this isn't the Gear tab.
// A purple gear tile's "+N" (top right; none = +0). Hero gear below Mythic
// counts as XP Component. Only purple is read for now: no
// blue / green / grey tile has been seen in a screenshot yet.
// max: the highest "+" the colour has (purple 80, orange 100).
async function scanGearLevel(worker, td, max = 80) {
  const num = scanTextMask(td, 60, 2, 138, 50, true);
  if (!num) return { lvl: 0, sure: true };
  const r = await scanRead(worker, num, { tessedit_pageseg_mode: "7", tessedit_char_whitelist: "+0123456789" });
  let d = r.text.replace(/[^0-9]/g, "");
  // The "+" read as a digit ("480", "180", "4100"): drop it.
  if (d.length >= 3 && Number(d) > max) d = d.slice(1);
  const plus = r.text.includes("+");
  if (d && (r.conf >= 50 || plus) && Number(d) <= max) return { lvl: Number(d), sure: r.conf >= 70 || plus };
  // One light shape read as nothing (or a stray digit): a bit of the gear's
  // picture in that corner, not a number (owner's screenshots: plain tiles).
  if (num.count <= 1) return { lvl: 0, sure: true };
  return { lvl: null, sure: false };
}
// An orange gear tile's Mastery "Lv.N" (bottom right, yellow; none = Lv 0). The
// tile shows no stage. The text sits low (y 100+): a yellow belt buckle above it
// is left out. { lv, sure }, lv null = not read.
async function scanGearMastery(worker, td) {
  const x0 = 60, y0 = 100, x1 = 138, y1 = 138, w = x1 - x0, h = y1 - y0, mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = ((y0 + y) * 140 + x0 + x) * 4, r = td[i], g = td[i + 1], b = td[i + 2];
    // Yellow text: red and green both bright and close, blue well below (the orange tile has green well under red).
    mask[y * w + x] = r > 165 && g > 165 && Math.abs(r - g) < 28 && b < Math.min(r, g) - 50 ? 1 : 0;
  }
  const blobs = scanBlobs(mask, w, h, true).filter((b) => b.n > 4 && b.h >= 7);
  if (!blobs.length) return { lv: 0, sure: true };
  const ox = Math.max(0, Math.min(...blobs.map((b) => b.x)) - 2), oy = Math.max(0, Math.min(...blobs.map((b) => b.y)) - 2);
  const cw = Math.max(...blobs.map((b) => b.x + b.w)) - ox + 2, ch = Math.max(...blobs.map((b) => b.y + b.h)) - oy + 2, k = 4, pad = 20;
  const c = scanCanvas(cw * k + pad * 2, ch * k + pad * 2), g = c.getContext("2d");
  g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.fillStyle = "#000";
  blobs.forEach((b) => b.px.forEach((p) => { const x = p % w; g.fillRect(pad + (x - ox) * k, pad + ((p - x) / w - oy) * k, k, k); }));
  const r = await scanRead(worker, c, { tessedit_pageseg_mode: "7", tessedit_char_whitelist: "Lv.0123456789" });
  const m = /(\d+)\s*$/.exec(r.text.trim());
  if (m && Number(m[1]) >= 1 && Number(m[1]) <= 20) return { lv: Number(m[1]), sure: /L/i.test(r.text) && r.conf >= 60 };
  return { lv: null, sure: false };
}
async function scanGearTiles(src, tiles, worker) {
  const t = scanCanvas(140, 140), tg = t.getContext("2d", { willReadFrequently: true });
  let badged = 0, orange = 0;
  const low = []; // purple pieces: { colour, lvl, sure }
  const og = []; // orange pieces to reset (Mastery under 10): { enh, lv, sure }
  const seq = []; // each gear tile's picture grid + orange, in reading order (to spot overlapping screenshots)
  for (const box of tiles) {
    tg.clearRect(0, 0, 140, 140);
    tg.drawImage(src, box.x, box.y, box.w, box.h, 0, 0, 140, 140);
    const td = tg.getImageData(0, 0, 140, 140).data;
    let badge = 0, r = 0, g = 0, b = 0, n = 0;
    for (let y = 0; y < 35; y++) for (let x = 0; x < 35; x++) {
      const i = (y * 140 + x) * 4;
      if (td[i + 2] > 170 && td[i + 2] > td[i] + 50 && td[i + 1] > 120) badge++;
    }
    // Tile colour on the right edge, between the "+19" and the "Lv.10".
    for (let y = 50; y < 90; y++) for (let x = 120; x < 131; x++) { const i = (y * 140 + x) * 4; r += td[i]; g += td[i + 1]; b += td[i + 2]; n++; }
    r /= n; g /= n; b /= n;
    // A light-blue tile (an item, not gear) also lights up that corner.
    if (badge < 150 || (g > r + 30 && b > r + 60)) continue;
    badged++;
    const isOrange = r > g + 25 && g > b + 25;
    if (isOrange) orange++;
    const purple = !isOrange && b > g + 40 && r > g + 15;
    let lo = null;
    if (purple && worker) {
      const lv = await scanGearLevel(worker, td);
      lo = { colour: "Purple", lvl: lv.lvl, sure: lv.sure };
      low.push(lo);
    }
    let go = null;
    if (isOrange && worker) {
      // Orange: its "+" (Enhance, up to 100) and "Lv." (Mastery); Lv.10 and up give nothing back.
      const en = await scanGearLevel(worker, td, 100), ms = await scanGearMastery(worker, td);
      if (ms.lv === null || ms.lv < 10) { go = { enh: en.lvl, lv: ms.lv, sure: en.sure && ms.sure }; og.push(go); }
    }
    seq.push({ f: scanTileFeature(td), o: isOrange, lo, go });
  }
  return badged >= 3 && badged >= tiles.length * 0.6 ? { orange, seq, low, og } : null;
}
// Two Gear screenshots scrolled with some rows in both: how many orange
// pieces of the new one were already counted (the longest run of tiles at the
// end of one screenshot that matches the start of the other; a whole row at least).
function scanGearOverlap(prev, next) {
  const same = (a, b) => { let d = 0; for (let i = 0; i < a.length; i++) d += Math.abs(a[i] - b[i]); return d / a.length < 8; };
  const run = (a, b) => {
    for (let k = Math.min(a.length, b.length); k >= 4; k--) {
      let ok = true;
      for (let i = 0; i < k && ok; i++) ok = same(a[a.length - k + i].f, b[i].f);
      if (ok) return k;
    }
    return 0;
  };
  let best = 0;
  prev.forEach((p) => {
    const k1 = run(p, next), k2 = run(next, p);
    best = Math.max(best, next.slice(0, k1).filter((x) => x.o).length, next.slice(next.length - k2).filter((x) => x.o).length);
  });
  return best;
}

// The tiles of a Gear screenshot that an earlier one already showed (the
// longest matching run, as in scanGearOverlap), to count purple pieces once.
function scanGearOverlapTiles(prev, next) {
  const same = (a, b) => { let d = 0; for (let i = 0; i < a.length; i++) d += Math.abs(a[i] - b[i]); return d / a.length < 8; };
  const run = (a, b) => {
    for (let k = Math.min(a.length, b.length); k >= 4; k--) {
      let ok = true;
      for (let i = 0; i < k && ok; i++) ok = same(a[a.length - k + i].f, b[i].f);
      if (ok) return k;
    }
    return 0;
  };
  let best = [];
  prev.forEach((p) => {
    const k1 = run(p, next), k2 = run(next, p);
    if (k1 > best.length) best = next.slice(0, k1);
    if (k2 > best.length) best = next.slice(next.length - k2);
  });
  return best;
}

// The game's Research Lab screen: a dark red / orange
// machine with two blue "Super Refine" buttons near the bottom. Reads the
// "Weekly Super Refinements: N" line just above the buttons and, when they read
// cleanly, the Refined FC / Fire Crystal amounts in the top bar. Returns null
// when it isn't that screen (only the colours are checked before any reading).
async function scanLabShot(worker, src) {
  const k = Math.min(1, 300 / src.width), w = Math.round(src.width * k), h = Math.round(src.height * k);
  if (w < 50 || h < 50) return null;
  const c = scanCanvas(w, h), g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(src, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data;
  let red = 0, run = 0, btnTop = -1;
  for (let y = 0; y < h; y++) {
    let nb = 0;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4, r = d[i], gr = d[i + 1], b = d[i + 2];
      if (r > gr + 25 && r > b + 10 && r > 60) red++;
      if (b > 200 && r < 140 && gr > 110 && b > r + 80) nb++;
    }
    // The button pair: several rows in a row that are a third bright blue, in the lower half.
    if (y > h * 0.5 && nb > w * 0.3) { run++; if (run === 6 && btnTop < 0) btnTop = y - 5; } else run = 0;
  }
  if (red < w * h * 0.25 || btnTop < 0) return null;
  // The line above the buttons.
  const s = src.height / h, by = Math.round(btnTop * s), lh = Math.round(src.height * 0.06);
  const y0 = Math.max(0, by - lh), lc = scanCanvas(src.width, by - y0);
  lc.getContext("2d").drawImage(src, 0, y0, src.width, by - y0, 0, 0, src.width, by - y0);
  const text = (await scanRead(worker, lc, { tessedit_pageseg_mode: "6" })).text;
  if (!/super|weekly|refine/i.test(text)) return null;
  const m = /refine\w*\s*[:;.,]?\s*(\d{1,3})\b/i.exec(text) || /weekly[^\d]*(\d{1,3})\b/i.exec(text);
  const items = [];
  // Top bar: the two white numbers (Refined FC, then Fire Crystal) right of centre.
  const th = Math.round(src.height * 0.06), tw = src.width, tc = scanCanvas(tw, th), tg = tc.getContext("2d", { willReadFrequently: true });
  tg.drawImage(src, 0, 0, tw, th, 0, 0, tw, th);
  const td = tg.getImageData(0, 0, tw, th).data, cols = [];
  for (let x = 0; x < tw; x++) {
    let n = 0;
    for (let y = 0; y < th; y++) { const i = (y * tw + x) * 4; if (Math.min(td[i], td[i + 1], td[i + 2]) > 200 && Math.max(td[i], td[i + 1], td[i + 2]) - Math.min(td[i], td[i + 1], td[i + 2]) < 40) n++; }
    cols.push(n > 1);
  }
  const segs = [], gap = tw * 0.03;
  cols.forEach((on, x) => {
    if (!on || x < tw * 0.4) return;
    const last = segs[segs.length - 1];
    if (last && x - last[1] <= gap) last[1] = x; else segs.push([x, x]);
  });
  const nums = [];
  for (const [a, b] of segs) {
    if (b - a < tw * 0.008) continue;
    const pad = Math.round(th * 0.25), x0 = Math.max(0, a - pad), x1 = Math.min(tw, b + pad + 1);
    const nc = scanCanvas(x1 - x0, th); nc.getContext("2d").drawImage(tc, x0, 0, x1 - x0, th, 0, 0, x1 - x0, th);
    const r = await scanRead(worker, nc, { tessedit_pageseg_mode: "7", tessedit_char_whitelist: "0123456789," });
    const t = r.text.trim();
    // Only a clean number ("7", "2,567") with a fair confidence counts; the
    // Refined FC icon's light parts read as nothing and are passed over.
    if (/^\d{1,3}(,\d{3})*$/.test(t) && r.conf >= 60) nums.push(Number(t.replace(/,/g, "")));
    else if (t) nums.push(null);
  }
  // Exactly the two numbers, both clean: Refined FC first, then Fire Crystal.
  if (nums.length === 2 && nums[0] !== null && nums[1] !== null) {
    items.push({ name: "Refined FC", value: nums[0], sure: false });
    items.push({ name: "Fire Crystal", value: nums[1], sure: false });
  }
  return { kind: "lab", items, lab: m ? Number(m[1]) : null };
}

// ---- Islands: My Island (Life Essence) and the Island Storehouse ----
// Ingredients tab items known from the start (picture grids, scanIslTileFeature,
// from the owner's Storehouse screenshot). Mythic buildings are taught on the
// site by the owner (site_config scan_learned entries with kind "island").
const SCAN_ISL_BUILTIN = [
  ["Mythic Island Shards", "sWQrsWQrsWUrsWYssWYssmcssmctsmcts2gus2gul1klvJlO7cZuy65pooFHimArhU8enFwormYus2gus2gus2gus2ctsmctsmctsmYssWYssWUrsWUrsGUrsmUssmYssmcts2gus2gutGkutGkvtGkwtWoxsGgxhlwm9MZq+M+C9Mp99cl78sFm46pCsHgVh1cQfkwVjFEgpmEssmkwtGkvs2kvtGgus2ctsmctsmYssWUssmcts2gutGkvtGkvtWowtWoxtmsytmsztmw0g04g1qA+9sNp+9WL+9aN+9WM+Ml56apM3JEX3pAM4ZIJzoMJq2oHjVQMgkoXklUkq2UvtGkwtGgvs2gusmcttGkvtGkwtWoxtmsytmwztmw0tm01t202qGYzmmcZ97Ez+8hp+8+C+9OJ+s+E9sFv56VE2pQg1I4Mz4cEyX4AzX4C14AE2oIGv28Fh0kHnV0qtWoxtGkwtGkvtWoxtmsytmw0t201tm42t243uG84uXA5mFwts2sR23oL35c197Zf+MN2+MJ28LNf3JYs0owQzokGzYMCyYAAxn0Aw3sAwHEA4YAD0oMZeEcbtmw0tmsytWoxtmwzt201t242uG84uXA5uXE5unI7u3M8tHA7c0QbXjQNt3Qa5ZIu6aVS665g3p9H2qpb2a9owYEOxX8ExnoAw3gAwXcAznYB5IYLm2QZmFwtt243tm01tmwzt202uG84uXA5unE6unM7u3U9vHY+vXc+vXhAtXM/fkwb3oMP3ZpS7seX+uXA+OzN6t3A+fDS0axuv4Igu3cIv3QAv3AA4oEF1YEbe0obtW86uXA5t283tm02uG84uXE6unM7vHU9vXY/vXhAnWMznmU2vntFll8zq2EI0XIH1bJ4xal5v6Jyw6d3y6lxzKdv+OKq8dulq2sTvXABzXQC5H8MjFATkVsvu3Q+unM8uXE5uG84uXI6u3Q9vHY+vXhAvnlDq28+kk4JkFolilcum1UK2nUGvWcCuXsx89ui+t+i+d2f/d+fz6Zm6s2P4sKCsWsKvGwB4IEG3XkOqGIIj1UJpGc2vXc+u3Q8unI7vHU9vXc/vnlBvntEvXtGeEYa2HUF2n4UvWYF0GoDu2UAt2UF6b+C/duQuo1Hr3Ic3Ll0+NaOwZdV+duUtHonuW0CxXED2H8EzncD24sRgVInvnlCvXc/vHU9vXhAvnpDv3tGwH1InGU3sF8Gx2cCvmECuWEAt2YAuGYAxoM6/NiJ99F+tHkku3MW882F/NaDuIg7t4c+qWgHvHYBvXwAvX8Ayn8E5ZscgVgmvntGvnpDvXhAvnpDv3xGwX5Ju3xJiE8P2HUEtmUAtWUAtWcAt2cAt2YAtGkOwpVE7cRt+9F39ct4/dJ36sFpqGYHu3MAwnMBx3sBv4AAvoEA4pcO3q4sgFkpwH5Jv3xGvnpDwH1HwX5Jw4FMi1gtwmkH1G0CvmUAtWQAtWcAtmcAtWYAtmcAt2kBrGQGuoIr269V98truogyunMBvnEA5I8K55YM0YgG1pQM6rUvt6BCnms9w4JMwX9Kv3xHwYBKw4JMxYROmWU7ekAatmIe1XEN23UEyWoBt2YAtWcAtWcAt2kAuGsAuW0As2sDqGwOr2sCu3IA1X8F458Zsn4W5qQW6sFS2Mt9f18ywIJPxYROw4JMwYBKxIJNxYVPx4dSw4VTmmpCbEYpc0MimVEg0W4N03AAtWcAtWgAtmgAtmsAt20AuG4AuHAAunMAwHEC5JQOzawxXUIeqY9Fxrx6d2A4uH9QyIlVxodSxYVPw4JMxYVPx4dSyYpVy4xYyoxZxIpZkWU+fUUI1nAFwmcAtWcAumYA13YD03QCw20AuW0AuHEAuXEA2YII5a4ngmsmuYZZj2dAjWY9vYVVy41ay4xYyYpVx4dSxYVPx4hSyYpVy41YzY9czpJe0JRghVQn23UFul8AtGcAtWYAz3AD0WQEyF8N2HUM338G0ngCx3MC5JMOxagxkmtD0ZhlzpVjzZNg0JRgz5FezY9by41Yx4pWw4ZS"],
  ["General Accessory Construction Contract", "sWQqsWUrsWUssWYssmYssmctsmcts2cus2gus2gus2gvs2gvtGkvtGkvtGkwtGkwtGkvtGkvmVsoTTopV1haaGpocnNqeXlxbmFOllgnsWYssWUrsGUrsGUrsmYssmYssmcts2cts2gutGkvtGkvtWowtWoxtWoxtmsxtmsytmsztmsytmsytmsztmszsWkyRzUoWVlfZ2pugoaBl5uToqWbgIR8VT4nsmcusmctsmYssWYssmcts2gutGkvtGkvtWowtWoytmsytmwzt2w0t2w1t2w1t202t202t242t202t202t203iFUsloh12cept6mPgYJ6qa6km6CXcXVxUD8ssWcvs2gus2gusmcttGkvtGkwtWoxtmsytmwzt2w1tm01t202t243t244uG84uG84uXA5uHA5uHA5uHA5iFQri3tk2cmq4tSx6Nm1zLuZf3xzfYJ+YmdnUDsns2oytWoxtGkwtGgvtWoxtmsyt2w0tm01t242t243uG84uXA5uXE5uXI6unI6u3M7u3M7tnE7qWo3l18yeWpU1sWn39Cs5Nay5NWx38+qq5h8XWJgW15jU0Q3smo0tmwztmsytWoxt2wztm01t243uG84uXA5unE6unM7u3M9vHU9vHU9vHY/vXc+ll8yaVA4c2FKdWNLzrmV28qk4dKr4NGq3Mql1sKdxa6MYFhNUVFTUzgitm44t242tm00tmszt242uG44uXA5uXI6unM8u3Q9vHY/vXdAvXhAvXlBvnlDnmY5RTcsdmVbjHhntJ6AvKJ7z7eL2cWc2MOb0ruTxK2HnohsMSwlPzAgp2c3uXE6uHA4t243t202uG84unE6u3M8vHU9vXc+vnhBvnlCvnpDvntFv3xGv31Ib0oqUERCWEhEXkxEd2NWrZR1tJZuwaZ6x62EvaR+lX1gWkQxb1k/hHFTd0wou3U+unM7uXE6uG84unI6u3Q9vXY+vXhAvnlCvntEv3xHwH5IwX9Jwn9KwYBLYkMoeWpdsJp8rJRxe2VPZllRoJmHmJWHl4dwf2ZLX0kzX0o0cFw/Y0svj1sxvXhAvHY+u3Q9unI6vHU9vXc/vnlCvntEv3xHwH5JwYBKw4FLxIJMwoJNfVUzkoFl2MSd18GVw6l9kXhXYWJlfoF5f4B3X2FehHJagW5QbkorlGI4r3JCvHpFvnpEvXlBvXc/u3U9vXhAvnpDvnxGwH5IwYBKw4FMxINNxYRPwoNQimI+nI503Mul4dGo38yi0riKh29Ub3V8ZWple354ZmtoRjwujV85vH5LwoFMw4FLwn9KwH5IvntFvnlCvXhAvnpDv3xHwX9Kw4FLxINNxoVPxoZRvIBQdFg6t6iM3s2p5NSs5dat3s6j0rmPe2RKTEpKY2dneX56c3RuSzgniF05x4dTxoZRxYRPxINNwoFLwX9Jv3xGvnpDv31HwX9Kw4JMxYROxoZQt35NYUkzW0s7vKmN28qm4dKt5dWu4NCl2cWcxKyFg2pQMiUeU1FOWlNLcFlKcFdDUz4qrXdKyIlVx4dSxYZQxINOw4FMwX9Jvn1GwYBKw4JMxYRPxoZSxIZTb1A4TVFZYGd1q6KN1cOe4NGu38+p28mi1L6XqpJxWkMxYEw5OCkgW0QylXlbTDosdl1KclU7yItYyYpWyIlUxoZRxYROw4JMwX9Jw4JMxoVPx4dTyIlVkWRAVV1qdn6Hg4eFc3t9vrinz7uY2sih1b+ZvaKAZk05bldCXkwzdFQ3Tzwrs5ZzTD0yZlhPXFtWeVQ0zI1ZyoxXyIlUx4dSxYROw4JMxIVPx4hSyYpVy4xYonJLVFRaZnmUmKChu76ygoeEpZ6NybOPwauGdFxDYEk0gXFYjGhExZFiUD8xj4p7XFlPPkFBQTsypnZMzpBdzI5by4xXyYpVx4dRxYRPx4hTyYtWy41ZzY9cn3JMMzM2OUNVUl5ylZuZmp6WXWJifnJkdV1IVj8to45xZVE4yZVmz5ppT0Y/XGFmUFJTWEEppHdOzpRg0JRgz5JezY9cy41YyYpVxodR"]];
// Mythic buildings known from the start (owner confirmed the names on 16 Nov 2026, from
// the owner's Storehouse screenshot; Lv 1 look as the Storehouse shows it). Matched to the
// Islands buildings by name when a Storehouse screenshot is read.
const SCAN_ISL_BLD_BUILTIN = [
  ["Tundra Truck", "i3Vhk3dgkm5QsWYsjWhJp5qJq2Qusmcus2gus2gus2gutGkvtGkvtGkvtGkvtGkvr2cve00qS0NFeUsps2gvs2gus2cusmctsmctsmYssWUssWUrsWQrsWUroFwppWArp2Ers2gtpGArmVops2kvtGkwtWoxtmsytmsytmsytmszt2wztmszomEwX0k8SEZSP0FSVDostWoxtWoxtWowtGkvtGkvs2gvs2cusmctsmYssmYssmcts2gutGkvtGkvtWowtmsxtmsytmwztmw0t201t201t202t202s2w2fFM2TkhQT0dSRzg/WkZLZEtMilQvs2s0tmwztmsytmsxtWoxtGkwtGgvs2gus2cttGkvtGkwtWoxtmsytmw0tmw1tm02tm43t243uG84k1w0e1M4jlgyW0hCVEtVTD5CQjI2Z0tLeGdygGZsYktOcUQmtm43t202tWw1tmw0tmsytWoxtWowtGkvtWoxtmsytmw0tm01t243t284uW84sWw4ZEArYkAtXk5Ia2lzUVRiUEJGRTc6XEdKgVtVfVVNc1JNZ05RblBQdlZTcEgyiFYyUkA3n2Awtm01tmw0tmsytWoxtmwzt202t242uG84uXA5unI6unM7lV0zJiMtMyo2ZFVXcF5fbmhwX2Fxi4yfoZepiGJefFpbbE5QeVpbhmFgf2BialtmNDlIRjEnuHA6uG84t243tm01tmwzt202uG84uXA5unE6u3M8vHU+vHY/s3I9NScjIRgZWj4sWkdGeGJfcWhscXWFbnCCZ0xPbE9RfWRsfWhwdl5kUE9eJCk1OTg/Sz04klw0uXI6uXA5uG84t242uG84uXE6unM7vHU9vXc/vnhBvnlCvntEWDspJxwaXD8qUT07ZE1IeF5YdWFhYlhiT01haVRfeFldaVtpNjhKGxsmXVhacGlsS0tULCoxoWU3unM8uXE5uG84unI7u3Q9vXY+vXhAvnpDvntEv31HwH5Ig1o7XWNyNzVDST1FUD5ANyw2PjM6LSgyLDNJODlOP0BSJCY0GRghR0JGeG9vTUpRGRghISEsckorvXc/u3Q9unI6vHU9vXc/vnlCvntFv31HwX5JuXpIo25DYmRrbnqPUk5cMy48UExaNy0ySzg1Ih4mHCAyISY4Hh4qHRojGhYXaWBebWVmICAtGhslJyQriVo1vnlCvnc/vHU9vXhAvnpDv3xGwH5IwoBKoWxDWEpGNjI1a3WFc4CVb3yRXmV1UEtXRkZTUk5ZKBskNiwwFxYeJx8giF08YUUvXFNSWE9RPispZEtJUEBCqnBCv3xFvnpDvXhAvnpDv3xHwX9Kw4FLvH9MaFdNa2ZpICAnQENJaGt3bHSEeIOXcn2RbXuSQ05fExcfJiElLS88JicvoG9Ip3RJNSwoVEZEd1pbg2RifFxaaEg1v39Kv3xHvnpEv31HwX9Kw4JMxYNOiGA/eHByS0dPKi42en+IRklVZW9wYGZsYWd1TltuGSMxCgsSZV1cQ0NNHB4rb1A6voRVZ1NQXU9Na1dTb09MX0JAOyglvn9MwYBKv3xHwYBKw4JMxYRPw4ZSalZJb2doJiUtTllXUV1aWmlmXnJuWWtoR1FWLjhAERgnIB0db2dnHyIyHiAsdlU9d1RAin2IfWlwd2NnOywxNicqNSUkwYNPw4JMwYBKw4JMxoVPx4dSvoNSUkhESkVIGRgeSEo8OT42bmVhX2dlPVBSX29uLzM/VlJZTEpPSUdMGRsoIB4moXZRTDEqclJOeWNqWUdMMScqc1I7o3FHxohSxoVPw4JMxYVPx4hSyYpVyoxZd1Y8OS0mh2FCo3lPX0w0gHBWXFZQU2FXPUdLb2hsZF9lKi49ICY3HyAsbVI8x5NkWEM+fVxTZUxHNy41oHJNzY9cy41YyYtVx4hSxYVPx4hSyYtVy45ZzY9cz5NezZRh0Zdk0plm05potIVbcFU+Sk48SUpGeXFyNDRBERYkHyU2iWZH1J1r05xqoHhTj3JYbF5Wb1ZG0JVhz5NfzZBcy41YyYtVx4hS"],
  ["Fantasy Aquarium", "h2tUmYRwk2hGsWYsl3lfoI57sGcus2cus2gus2gus2gvs2kvr2Yvmlophk0khk0knFsqr2cvs2kvs2gvs2gus2gus2gtsmctsmctsmYssmYssWUrsWUrsGUro14ppF8rqGErsmctoV4rnFwqtGkvtWowtWoxtWoxl10xdVE+flBCe05Ff05EhVRIiVlOhlZHc08+ml4ytWoxtWoxtWowtGkvtGkvs2gus2cus2ctsmYssWYssmcts2gutGkvtGkwtWowtmsytmsytmwztmw0q2YzeV1ZVmJ6GRUYDw8SDxYdDxceFRQWPCsreXmNdldPrGczt2w0t2wztmsytmsxtWowtGkvtGgvs2gusmcttGkvtGowtWoxtmsytmwzt201t242t242t243hVI1aUdIMjk/KFFrJFBuIEtpIk5sKlZzJEhfbFVPlGhcglAytm44tW03t202tmw0tmwztmsytWoxtGkwtGkvtWoxtmsytmw0tm01t242t243uG84uXA5tG86gFRHTVhlYZCmO3iXaajFTYurL157J1ZzLHucXG+CUFJdg19LinREcFYuiVgtrWk1t243tm01tmwztmsytWoxt2wztm01t243uG84uXA5unI6unM7u3Q9tXE8glVKUnSPRZKyOZ3HYbvfUqjUY6PARXyWO5W0Vn2WWXqNfldJi4ZRj5dalZZal2EwuXA5uG84t242t201t2w0t242uG84uXA5unI6u3M8vHU+vHY/vXhAvXhBg11MfnWAOZm/QKfRYbnebqfMecTmMXyhNI+vQHKMfmx0blBCimk2j7xSVE8knGY1u3M8uXE6uXA5uG83t202uG84unE6u3M8vHU9vXc/vXhBt3ZBg2A2vHtGfHRvgn+Qa4WlU6/RiMrngsrqTMPpLIKlQICadIuqX2qESFBQZFUxXp5kQFg4o2s6vXc/vHU+unM7uXE6uG84unI7u3Q9vXY/vXhBu3lDrHE/nWs8fHBDq3NDg3p4ZYymfmlvmn9+lIqOjZifhZqli36EgGhrWVJha4inUFRXP001VYJbQEUpfV4zvXpDvXhBvXY/u3Q9unI6vHU9vXdAvnlCvntFsXRDbmZBclMsgJ5QVk83hoKSUoqmZHuGbcvjmLBxk5lQlptkd6O3o8ngW215YG6CcYOUaIKXUF1qTWpBaGQyunpGvntFvnlCvXc/vHU9vXhAvnpDvn1GwX5JwIBLgHdCXVs2YXdgh4eVZnSIc6K1Zm1udb6+q6pJpK5Lnqh7aqC5qrbGd2Nkl6qyd5upZ4WbRVt3LkNQhV09woBKwH5Iv3xGvnpDvXhAvXpDv3xHwX9Kw4JMjmg+a25EZXFcaFtWXGh/lXmAmJOafHJrfrrOt8zHssWphrXFUJOyYJixbWhpm7a2RVNnQFpzQld0V2eFS09irnZJw4FMwX9Jv31GvnpDv31HwYBKw4JMxYROvIFOhG5DoKKbgnp4eX6RjF9ajIGGa3lzh8TQfLXFhbrLfq2+o6GpirO+bHJwRVpxLyo5OlNnZZuKaYODiZWskWlJxYNOw4JMwX9Jv31GwYBKxINNxYVPx4dSyIlUuIBSu7q9q6qvioydeGx7lmtrd25ygqOrapaef6i1kLC9kaWueoKIbWRwTj1PUEhSapSHZ7KegqK2i4mOuoBRxodSxYRPw4JMwX9JxINNxoVPx4hTyYpVy4xYzI5am35mr6yxkY+ecnOJoHFqqWVXoWpjnXt6kHh8hnB5hGNpfEtMYjo8Z1tihoqemaemZXdZnnRSxIlZyoxXyIpUx4dSxYVPw4JMxYVQx4hTyYtWy41ZzY9czpFezpNgpoFgi4OBv8TRwcDLnYeNnG1pkllQjnyAiX2Cemt1fWtxenOAoKa2pKOpr4Jc0JZk0JRfzpFdzI5by41YyYpVx4dSxYVPx4hTyYtWy41azZBcz5Nf0ZVi0phk05lnz5hor4Vfn4t6ycjPuLnBl5ijmp2npaSqk5OfubCvaG+GmpuisYdh05to0pll0pdj0JVhz5JezY9cy41YyYpVxodR"],
  ["Mushroom Domain", "g2JIn459kmE7sGYtnYZvnYRssmcusmcus2gus2gugFo1SJavS7XmPqjkRa3pTqbnd63paJ7lRZLiNYLZLEqEhlUxsmcts2ctsmctsmYssWUssGUrsWUrsGQqpl8qo18rqmIrsmcunl0qn10qtGkvtWowtWoxoWIxS5quU77rTa7oT67qUq3rXqjoi7Doa5/jRpDgLnrWEEy3K2OjflQ2s2kvtGkvs2gus2ctsmctsmYssWUssmcts2gutGkvtGkvtWowtmsytmsztmwztWw1XHNrVcTnUbfqTa7oTqjnZaroeajmh67oZqDkPo7fIm/PDUu5Gl7DMHGzaVZHtGoytWowtGkvtGkvs2gusmcttGkvtWowtWoxtmsytmwztm00tm02t243tW44U4qOV8brTrbnTrHnW6voi7frnbnpdqjmVp7kNozdJHzWFVrDFVvEL3zSNYW0ll0yt2wztmsytWoxtGkws2gutWoxtmsytmw0t202t244uG84uG85uXA5uXE6gWNDT6a4WcnrULjnXrHndbbpm73rcKvmRp/kPJjhL47dJHfUJ3jTNI7aQazfd1U4t242t201tmwztmsytWoxtmw0t201t243uG85uXA6unI6unM8u3Q9vHU+vHY+mWg/XaOzUb7nSrTmUK/mdbPnbq/mTaXlP6DjOZ3iN5XfOZTfPZ/iPpnLglY0uXA5uG84t243t200t2wzt243uG84uXA5unI6u3Q8vHU+vXY/vXhAvXlBvXlCcGZRSKG+cNDuTb7oU7XmcrnoZrPnV6/mQajjRLLoPrHoRqvmRarlNoW0m2U6unM8unE6uXA5t284tm01uHA5uXE6u3Q8vHU+vXc/vnlBvXlDvntFv3xGhWdHPKTEXrvbfr3NVMTnY8PqZsLqWL/obsXsSLroa8vuT8ntTMHrN53SWVRQvXhBvXc+u3U9u3M7uXE6uG84unM8u3U9vXc/vnhBvnpDtXdEY2lqeV9MwX9KcWFLZZmqr6ymfl9Tg353X5WoX73bPZS/fs7rRrXePZG7Ra7TLnqbXVVOuXlGvntFvXlCvXhAvHY+u3Q8unI6vHY+vnhAvXpCvntFwH1IhWVKW6feMG+qb1ZHb1VBmoyBrpOEbE9JmWxOZUg/g4KAW1NVM01dI0pxGEuUFUyjJUN8dltPwH9LwX5Jv3xHvntEvXlBvXc/vHU9vXhBvnpDv3xHwH5JuHtIT3qEXbfpPJ3bUou6hYeSuqWUeVxPgVtEpHJTWT01XUdDVUA/MTQ8OYS7JGjHLGzQImjSI1y5c1xNv4BLwoBKwH5IvnxFvnlCvXc/vntFv31HwX9Kw4JMrHdJVqGylNjyZsTlU5CqcnJ7waiSpXlZsIFdZEY6Tzcwe1dMblRMTEFBbbHJZK3naajpQJHiImzTLGatUkE2kGE7woFLwX5Jv3xGvnpDwH5IwYBKw4JMxYRPnG5KoaOucH6EVVhcICo5NEFTwKWJn3VXmnBRYkk8ODE0WEpGWElEPjIxWYiQmNfyeL/uUKXoL4DYNH7FJDNMSTw4vX9Mw4FMwX9Jv3xGwYFKxINNxYVPxYZSiHRnpKWvhYGHjIF6XFhVIThRlnditYtqe2BPnIp4eHBodGZcaFlOQD5DX1JHkaGZcrrRaMHpVK7dLWCKJDFIN0tqmWpExYRPw4JMwX9JxINNxYZQx4hTxYdUkH1xsLC8kY+VjIuRhHpxW1pdm3dgqYNnrpeCz7yoy7ihxLCYp5aCVE5MinNhgWhUPUNPKk9wNFByTm2ZU3KcTE1Wt35PxodSxYRPwoJMxYZQx4lTyYtWzI1ay45dmnhfcmpre3qElpOap456kXZlgGRYe3Z10MCr1se11ca2yrilpJ6VYVdPSkhLb3J8S1htNkNaPU9mgWtbxIlayoxYyYpVxodSxIROx4lTyYxXzI5azpBcz5Ng0ZZivIpen52ktLK9pn9nj3VndV1ST1BYnZiPtqiVyrmkq8fGX8XmNW6UT1RhbG57j5OilJiqmXZZz5Vgz5JdzY9by41YyIpVxodR"],
  ["War Chariot", "nZCAj3JZlGxMsGUrj25RuK2eqWMtsmctsmctsmcus2gus2gus2gus2gus2gvs2gvs2gus2gus2gus2gusmctsmctsmctsmYtsmYssWYssGUrsGUrsGQqsGQqjFgvkVoxk1kusmctlFsviV06sWcvtGkvtGkwtWoxtWoxtWoxtmsxtmsxtmsytmsytWsxtmsxtWoxtWoxtWowtGkvtGkvtGkvs2gus2gts2ctsmYssmYssWUrsmYss2cts2gutGkutGkvtWowtWoxtmsyt2wytmwzt2w0tmw1t201t201t202m2A0jl06tmw2t2w0tmwztmwztmsztmsytWoytWowtGkwtGkvs2gus2ctsmcts2gutGkutWowtmoxtmsytmwztmw1tm01tm02t242t243uG84uG84uG85lF42f3Fkd3iBeVpIt244t243t242t242tm01t201t2wztmsytWsytWowtGkvs2gutWowtWsxtmsztmw0t202t243uG43uG84uXA5uHE6rGw6s3A8unI7uXM7i2pNjXRdcGRbSkhSo2Y3uXE6uXE5uXA5uG84uG84t243t202t2w0tmwytmoytWowtmsyt2w1t202t243uG84uXA5uXE6unI7u3Q8oGU4gnRrYllXalBCfVg+bl5Uf4WTeICWjJu1bXOIelM6unQ9u3Q8unM7uXE6uXA5uG85uG44t202t2w0tmsyt201t243uG84uXE6unI6u3Q9vHU+vHY/nmQ4a1VJrJF5nZGMtKaVmJ+tYnmkboClgZGylZCTe4ihS1hyjFs0rG48vXY+vHU+u3Q8unI6uXE5uG84t243tm01uG44uXA5unI7u3Q8vHY+vXdAvXhAqG09aWFnZnOSTGOMRVuCiHRnjHpqcoKgUGSKN0BWWlRcQ0tnUGSGZXGGdXiEmmhAvnlBvXc/vHU+u3Q8unI7uXA5uG84uXE6unM8vHU+vXc/vnlBvnpDvXpFjV46amVrW1RdQUJPJiY3WT8wsYxVzrOAOk50M0ZvOUltQlN4ZG+MNT5dV1VhWUY+s3VDvnpEvnlBvXc/vHU9u3M8uXE5u3Q8vXY+vXhBvXpDvnxFwH1IjWpPj4qIYF9kg19Ad2FRg29nZFhY26lWnZSMGyhPFSVJGCNGVDtAXTc4U1BZd3NxeHZ2enFtmmc/v3xGvnpEvXhBvXY+u3Q9vXc/vnlBvntFwH1IwX9KwoFLhWNJn5mYe3V7aWdwXlVVoWw9j3FV0at6MkBjHCxSJ0Z7IDFYOxweOSo3WVxnfXp6g35/eHuGd2hkwX5KwH1IvntFvnlCvXc/vnlCv3xFwH5IwYBKxIJMxYROvIBOlHxqkY6Rj42PX1xgX1ZWjGE8dWluFB06IC1QHixPGyhFGSY+UVdocHB2iYWGfX6HpKWsmndexIJNwoBLwH5Iv3xGvnpCvnxFwH5Iw4FLxINNxoVQx4dSyIlUxohWnXRTnJaRko6NcGhmc2toTk9dFRsyOVeNJjxiLjxTW2BtenqAg4KIhYCClHJYrXhMxYdSxYVPxINNwoFLwH9Jv3xGwH9Jw4JLxINOxoZRx4hTyYpVyoxYzI1azY5cqHtXvLi2pZ+dgXt4XltfKyk3Vm2aVFhleHV2iYmLcnN5cl1QtIBWzI1ay4xYyYpVyIhTxoZQxYNOw4FLwX9Jw4FLxYROxoZRyIlUyotXy41ZzY9bzpBdz5Jf0JNgq39bs6mj19bZqqWkn5qai4iQf3x9iYiMZWt/emRYzZJgz5JfzpBdzY9cy41ZyotWyIlUxodRxYROw4FLxYROxodRyIlUyotYzI5bzZBdz5Jf0JRh0ZZk0Zhl05hmxZBhpINntrGys7CznpuaXmRygYmclX5sz5dm0pdl0ZZj0ZVhz5NfzpBczI5byoxXyIlUxodRxIROxodRyIpVyoxYzI9bzpFd0JRg0ZZj0phl05lm1Jpo1Zxp1Z1r1Z1svI1ho4Jnd2tmcGJep4Rk0Ztp1Jxq1Jto05pm0phl0Zdi0JRgzpFdzI5byoxXyYpUxodR"],
  ["Dream Nest", "k4JwmX9plGZDsGUsn4Rrrp6MrmYusmctsmctsmctoV4pll4vo18qsmgvsmgvsmgvs2gus2gus2gus2gusmcusmctsmctsmYtsWYssWYssWUrsGUrsGQqsGQqkVgtj1s0llorsWctklwzi104s2gvtGkwtGkwtGowl2Y12ptXXTgfRjlASTU4YkM1hFgxlVcos2oytGoxr2gyrWcwtGkvs2gus2gus2cts2ctsmYtsmYssWUrsmYssmcts2gutGkutGkwtWowtWoxtmsytmsztmw0kV40r3ZJilxDoXRzqXBiw4dT45xaqHRRf1ZMflI6t4pOlWo2pmIutWoxtWowtGkvs2gus2gusmctsmcts2gutGkvtWowtmoxtmsytmwztm00tm01t243qGY1bVNIpoqB2Z1pwY1yyZBzyo1f87Rg25tnvoJp2Zdk1X9MrHU+nV0ttm00tmwztmsytWoxtGowtGkvs2gutWowtmsytmsztmw0t202t243uG84uG84g1k9aWVuu7vD5Nvd561l5a5wsHtx5a5n8bpe2ZZb35pi5qpc4KNWglMyrmo3uG84t242t202tmw0tmwztWoytWkwtmsztmw0t202t243uG84uXA5uXI6uXI8ZV1htrrD4OTn6uft1qBv6qxi04tR46dg6a5d77Je6qtc8rle77ded0s0qmk3uXE6uXA5uG84t243t201t2w0tmsyt201t243uG84uXE6unI7u3Q9vHU/tnM+X1lfv8fS4eXo3+Lo5d3hy4lky3Y8zo5bxYZO67Jk6a1gwIVK3aBgglQ5n2Q1vHU+u3Q8unI7uXA6uW85t242t201uG84uXA5unI7u3Q8vHY+t3VAoWY3hlcxXElHiI6g09rh4ufp4uXt5eLt4LWU3JJM66ZV5qNQ56NV66xc0JJXZ0EvhVUvs3I+vXc/vHY+u3Q8unI6uXA5t283uXE6u3M8vHU9vHc/ilk5j2FLgmRWYUpFjlo5h1lDg3l8vcXS3+Pn4uTs4Me27aNfw4hk6tPF162P2pdKunU+ZUhCXUlDd04unmY4vXhBvXc/vHU9unM7uXE5u3Q9vXY/vXlBrnA/jGJVr4Fno35xdE1FvX1clm1ji19JdV9Ym6Ky09nh29jbyH5rx6Oe6N/gxrGz44dRmWNDWFVhg2dBalQ5bVZEj143vnpDvnhAvXY+u3Q8vXc/vnlCvntFsnVDhV1Lt49dj2tiuYJd1Jlk1K6Uo393hVhKZUEvcXSGamp8b25+fXiFv7e7lpWhl3x8XV5vZVBFk3A7f2RAfGFNcVU+q3BBvntEvnlBvXc+vnpCv3xGwH5IwoBLmXhE5chxuItfi11Ou4Vm5uDnpIB6f1JKgFlNbEM0dDMUeDocPignR0JNQEhhSkFGVz84Vz84V0Q/aVpdZEo4ZUgxjl85wH5IvntFvnlCv3xGwX5Jw4FLxINOtXpIoHhEdk0zmGhVzpJw07OitZmWnX+Chmxyf2VnjXNzn4WEQDE7NzpgXGyeqIJCdlc2TTk2Pywrb1VIr3hJtnxLwYFNw4FLwX5JvntFwX9Jw4JMxYROxoZRyIhUyopWv4RTqnVLi11GtHpgrndjkGVPsJOExq6so4N+nH59VlV3cmiErX9a0alXYUcmaUgws31QyItYyYpVx4hTxoVQxIROw4JMwH9Jw4JMxYROxodRyIlUyotXy41ZzY9czpBdyY9eelE4m2xW0pVg3J1VwotnyKaMwZV7omtOz4pRtnZOZ0IwmGxHzpJezpBdzY9by41ZyotWyIlUxoZRxIROwoFLxIROxodSyIlUyoxYzI5bzpBdz5Jf0JVh0ZZjz5dlrHtTjF9Jt3xctHJOy4lLxYVRqmpNkV5GaUc0xI9g0phl0ZZj0JRgz5JezZBczI1ayoxXyIlUxoZRxIROxodSyIpVy41YzY9cz5Fe0JRg0Zdj0phm05ln1Jtp1ZtquYlfjV5SroN1coOkn8/mg5WoTGBwxJJm1Jxp1Jto05pn0phk0ZZi0JRgzpFdzI9byoxYyIpUxodR"],
  ["Icefire Way", "i3Vgn4l0lGA4sGUsqJN+qJJ8sWYusmctsmcts2gusmgum1sramx5aXeQfoicaHiWQFWBaUo8rmYus2gusmcusmctsmctsmYtsWYtsGUssGUrsGUrsGQqsGQqk1ksjVw2mloqsmctjl02jlw1s2gvtGkwtGkwtWowl1wvYmBqfISSkpqlYml3cn2POUhqSV6FhlUztWowtWkwtGkvtGkvs2kus2gus2ctsmctsmYssWUssWUrsmYtsmcts2gus2gutGkvtWowtWoxtmsytmszllsvSkRGZ3aXWmd3fIeXh5CciZCejJauSWKOWlltqGQytmwztmsztmsytWoxtWowtGkvs2gus2gusmctsmcts2gutGkvtWowtmoytmsytmw0t200tm02tm43hGpcXWR1h5CkfYaWY3KRVFxseH6JQEhYY3uiP05ynGAzt243t202t201t2w0t2w0tmsytWoxtWkwtGkvs2gutWowtmsytmwztmw1t202t242uG84uG84uHA6inRsl52uf4eciZGgXGd5cXeBQURMP0dTcXyOTVpzcUgvtXA6uXA5uG84t244t243tm01tmw1tmsztWoxtGkwt2w0tm00t202t243uG84uXA5uXI7unM7u3Q8nWU6hoKIdYGhf4eaiZOijpalgI+qg4+scX+WS1pzFyM5Uj86pWg5unM7uXE6uXA5uG84t243t201t2w0tmsytm02t243uG84uXE6unI7u3Q9vHU+vHc/vXdAu3dBd2ZehI6jg5Cqc32TUVlwR1FuSVRwMkFZGCY9DRkxTllteXZ9pGg4vHU+u3Q8unI7uXA5uG84t242tm01uG85uXE5unI7u3Q9vHY+vXdAvnlBvnpCvnpEvntGh14/fX+LioKvg4Oqdn2XTFJvRkxeOD9VMTxVX2mBbn6fTVh4hlg5vXhBvXc/vHU+u3Q9unI6uHA5t244uXE6unM7vHY+vXhAvXlBvnpEvntGv31HtXdGkWREiW5eg4aYSEllWFt8coCgY2uJg4eWkZirkpu0Y26IM0FlNDpVkmA8vntFvnpDvXhBvXc+vHU9unM8uXA6u3U9vXc+vXlBvXpDv3xGwH1Iq3JFlXBXn5qgj9Pqa9HwdoWbLC1IIilMVGKFV2OFjpSnl5ytf4mgMT9hKjdac1E/wYBKwX9JwH1IvntFvXpDvXhAvHY+u3Q8vHg/vnpCvnxFwH1IwYBJqHBFmJusWafrc9P4SN38UKXXb3aJKSxIISdLJjBWcoGiaW2DjpOnhZCwJzRXMjRKnWtFxYROxINNwoBLwX5Jv31HvntEvnlCvXc+vnpDv3xGwH5JwoBLxINNn3BMobPXJpDtOa34K7DyQpu9aG2CKCxHICNAJCdGaHiaYmJ3hYaYUVx6Iy9SNS87uH5Px4ZSxoVQxYROw4JMwoBKv35IvntFvnlCv31GwX9Jw4FMxINOxYVQnYR5u8XnOW7YHmvcMqb3Q8XzT3CRKyxIISI/JCVBX22PYmR6e4CWRE5uGydHHihIQzVCn25Jv4NRxoZSxoVPxIJNwoBLv35IvnxGwX9Jw4JMxYROxoZRwYRRi3Vsxs7mgrfqRJrnM43vKKj4YoeuLSpFJCE6QThLWmSFX2Fyd3uMVl96P05xFiFAMzZXUUZiaT5BhmBIxIZSxYVQxINNwoFLv35Jw4JMxYRPxodSyIlVlm9PiYyWo6Szt8LaxM/ojK7ncqvorrPKOTNIWk1Zfm1yWFh0WVZlc3aHXVdkbXeYHSlKWEBNUUJPS0NjMT1kjGVKx4lTxYZQxINNwoFLxYRPx4dSyYpVyoxYlnFVjI2blpagn6Crqau8pae6n6GzsrPLhoOMiH+Ej4GDnX5JbFpNam+FYFdtbltrQk1xbD0/aE5aYklaQk1yiWpXyotXyIlUxoZQxINNx4hTyIpVy41ZzY9cmHJTi4yYl5ihmJehlpagi4yXjo+ZkJGbkpKalJCVvIhXvYlBlnRLc2p2NUFhbUlKS1Z6Rz5UXUVYPj9eNjpSk2pMzI5ayotXyIlUxoZQ"],
  ["Furious Sea Fortress", "q6KUgF9FmXxksGUsjGA+xr+yoV4rsmcts2gts2gusmgusmgvs2gvs2gus2kvs2gvs2gus2gvs2gus2gus2gusmcusmctsmYtsmYssWYssWUssWQrsGQrsGQqh1Ammlopl1orsmctnlwqhFApr2YutGkwtGkwtWoxgVU1d08ztWsytmsytmsytmsytmsytmsytWoxtWoytWoxtWowtGkwtGkvtGgus2gus2ctsmYtsmYssWUrsmcts2gts2gutGkvtGkvtWoxtmsxtmszt2wzqGUygnR2Y1xpnWAzuG01uG02uG02uG01t202tm01t200tmw0tmwztmsztmsytWowtGkwtGkvs2gus2gtsmcts2gutGkvtWowtmsytmsztmw0tm00tGw2hVs9kXNtvIqKqn2DaFNXf19MrWk2uHA4uG85uG84uG84uG84t243t243t201t201tmw0tmwztmsytWowtGkvs2gutWowtmsyt2wztm00tm02t243uG84q2g3eWxvwJJ3rHt7x5WUrn5qaltmmF80u3Q8u3M7u3M8unM7unI7uXI6uXE6uXA5uG85t244t202tmw0tmwztmsytWowtmwzt2w0t202uG84uG85uXE6unI7uXM9gFQ+hGdeopCSmHh4e0UtVCsjsnI9vnc/vXc/vXdAvXc/vHY+vHU9u3Q9u3M8unI7uXE6uXA5uG84t202tm00tmwzt201t243uW84uXE6unI7u3Q8vHY+vHc/elZBjX6BiHN1Zz45Wj8+MR4dVjYhvHpEvntEvnpEvHlDtXRAvXlCvXhAvXc/vHY+u3U9unI7uXE6uHA5t243tm02t284uXE6unI7u3Q9vXY+vXhAvnlCvnpDhF5DvrOqv6ihj2xispOCMR0bOB0WnGc9wH5JnGhBfltDZVdRuHhFvntFvnpDvXlBvnhAvXY/u3Q9unM7uXE5uG84uXE6u3Q8vHU9vXdAvnlCvnpEpWw/XUIxZEg4in1vyLSmrIZymGpFLxoaSCkgUjQkuHtJtZWMuKGla2p9hF1BwH9KwH5Iv3xGvntEvnlCvXhAvXY+u3Q9uXE6u3U9vXc+vnlBvnpEvnxGwH1Jhlo3YFRDeVtWq5CDfmpeon5Pw4cwXz0wYEk9aEguhGlYpY6QvH58p4KNhWNveXBvpnBGwn9KwH5Jv3xHvntEvXlBvXc/u3U9vXc/vnlCvntFwH1IwYBKw4FLk2E7f1lJmYiMemJiZ05AqIFG67pR6LlrwZtzh29cbWBdnm5Xo29nsI6WtXd7WUxWmGhCxINNw4JMwoBKwH1IvntFvnpCvXc/vnpCv3xGwH5JwoFLxINNxYRPqnJGkGZKsZB/fGJRlnJcpYd04bBl4LVs4K5svpR4jXFngGRgiXV2lYybPCg0MScxrndLxoZRxYRPxINNwoFLwX5Jv3xGvnpDvnxGwX9Jw4FMxIROxoVQx4hTyIlUuoFRlm1Eo3BYYD8pYVFMn4l11KRvsZN3loFyzZ1vjntzj3p5Uz1CPT1SKycytX1PyIpVx4hTxoVQxYNOw4JMwX9Jv3xGwH9Jw4JMxYROxoZRyIhTyopWy4xZzI5byIxbkWNBwIhZyI5dp3pUgXNssI952qds3ahwmnFbnIR1d3N9ipamICY5PSsil2hDyotWyIlUxodRxYROw4JMwX9Jw4JMxYRPxodSyIpVyotXzI5azY9czpFe0JNg0ZVi0ZZj0pdl0phlv4pfim9drZR8rH1oqn90j15MbWptmYRLJyQyOjlGX0xCzI5ayoxXyIlUxodRxYROw4JMxIROxodSyIpVy4xYzI5bzpFdz5Rg0ZVi0pdl0phm05ln05pn1Jto1JtpxI9hblVIkHBqdG97mWNUZ1tH3bRCVDc7aU9AZ007zpFezI5byoxYyYpVx4dSxYROxodSyIpVy41YzY9cz5Je0ZVi0Zdk05lm05po1Jxp1Zxr1p5s1p5t159tnnNRnW9ZuJuGb2FlhlhMUkI+u4pKuoFhgFRAk2hF0ZVhz5JezY9cy41YyIpVxodR"],
  ["Glory Arena", "g2JIn459kmE7pF8rlIV10tDEtK6hlFots2gus2gutGkvs2kvs2kvs2kvtGkviFQta1A/k1grYUMvamt2bG14b3uOZ1BEpWAssmcssmYssWYssGUrsWUrsGQqpl8qol8rqmIss2gtpWEskVktm1wrtGkxtWoxtmsxtmsyr2gxcE43hFEttmwza048aGZyT0ZOW1VebE9Ig2Rce3N4Y22BYUQwsGcvs2gus2ctsmctsmYssWUssmcts2gutGkvtGkwtWoxtmsytmsztmwztmw0t201t201nF4weXduXUs6tm03dkosVDg0UEE+iXVqiV5HfV5SgGJacmZrYGd5U0E4rmcwtGkvtGkvs2gusmcttGkvtWowtWoxtmsyt2wztm00t202t243t243tm44pWU2mV0xV1JRQiwin2M2Yz4oXzcrZU9AbnxhpYxoknRoPzEwdFRGYGJuLCoyrWcytmsytWoxtGkws2gutWoxtmsytm00t201t243uG84uW85uXE5r2w4Z0UvS0VPakMoWz00LCYxOTVCVkhOYDovUUA2al9YdHdpboJ1OjA1akY0ZUdAUTUlt242t201tmwztmsytWoxtmw0t201t243uG84uXA5uXE6iFk3e1Eze1Q4UFFpSiQrNS02TTs/NCcsUj9DaE5OaElDYUtGb1pVdFpQj4FlPSgkRCgfb0c8XU9Qtm85uG84t243t200t2wzt243uG84uXA5unI6u3Q8t3I9cmVbX1dSXUQ1MzJVLSo7PzAxfVQ8WEdKc0pAj15QjXRzjHJuhWBUdlVIdlVMQikiSi0jZ0pGX2V3iVczunE6uXA5t284tm01uHA5uXE6u3Q8vHU+vXc/u3dBZFRLOzQ0UEA6ODVCWDs4i2FGkWdJXD81ZEpKgGRfkXBelmFQlmNQm2pTfVpSTjIrXz4wZEtKU1hmilo0vHU9unM7uXE6uG84unM8u3U9vXc/vnhBvnpDvXtGaEY2NSw3NzA6a0w7d1A9dlFAYUI3dF5elHJil3dtk2Zfn21Xw31OvG5KpWdQd1VKelhNclJKUjcxm2Q4vXhAvHY+u3Q8unI6vHY+vnhAvXpCvntGv31IvX1JbUc2TjItgl1Og15Gb0w7ZEdEdmNlnXdemnhqqGxdlG1osGpQvXNNuG1LtW1Nm2RQkXh1b2tuXj0xomo9vntEvXlBvXc/vHU9vXhBvnpDv3xHwH5JwoFLo2xBhFxSZE9QeWNnQC0sh19jdWZspXpgrX9elnpxuHJUsG5VnnJmrW9WrmhQn2hanmtXhGlgZ2BXT0tUjmA9wH1IvnxFvnlCvXc/vntFv31HwX9Kw4JMxIROjF06cU5Fa0tGgV1Xf2t3ZURPPy0ufl1LtoZiroVpm3VutnFXu29QrXRem21nh2xtc19jfV9ZPTpIOjdEelY7w4FLwX5Jv3xGvnpDwH5IwYBKxIJMxYRPxIVRflhEinVujGxijWdhdV1ePCstiGROtIZmuolhtodksYNoooBwl3dskW5ic2dvREJPX0hLb1ldNikuLS06dFQ7xYROw4FLwX9Jv3xGwYFKxINNxYRPxodSp3NJZlNQn5ugk4OAeG90Wl9wZ1NJrYFjs4dnt4pmrH5skHRxoIBtgHyBjXJoQj1KQDM8UklZKSErLyYuLy0zqXVIxodRxYROw4JMwX9JxINNxYZQx4hTyYpVyItZqXdOemJNe2ViUjs0jpudhIyYl390rIVqlHlyelhkRjA0Xk1Ib21fh25lZFdfLS1BKCEqJSAqKS8+c1Q8yoxXyYlVxodRxYROwoJMxYZQx4hTyYtWy41ZzY9cz5JexIxca1JAbGFcfZWWtMnNgI6aT0lXfVxWQzg7VkM9eWltVEJFZFhgKyYyJx8oJic1JCgyPzc1r3xRzI5byo1YyYpVxodSxIROx4lTyYtXzI5azpBcz5Nf0ZZi0phl0plniWpPcWllZoCDVFBTKBwheFJKUz5AdmBhglZKVTo2JyAoJSErJCYzMzE0nnRQypNh0JVgz5JdzY9by41YyIpUxodR"],
];
let SCAN_ISL_BLD_REFS = null;
async function scanIslBldRefsLoad() {
  if (SCAN_ISL_BLD_REFS) return;
  try {
    const b = await scanIslBuildings();
    SCAN_ISL_BLD_REFS = SCAN_ISL_BLD_BUILTIN.map(([n, f]) => { const r = b.list.find((s) => s.name === n); return r ? { n: r.name, id: r.id, kind: "island", g: scanB64ToFeat(f) } : null; })
      .filter((e) => e && e.g.length === SCAN_FEAT_W * SCAN_FEAT_H * 3);
  } catch (e) { SCAN_ISL_BLD_REFS = []; }
}
const scanIslRefs = () => SCAN_ISL_BUILTIN.map(([n, f]) => ({ n, g: scanB64ToFeat(f) })).filter((e) => e.g.length === SCAN_FEAT_W * SCAN_FEAT_H * 3)
  .concat(SCAN_ISL_BLD_REFS || []).concat(SCAN_LEARNED.filter((e) => e.kind === "island"));
// Key of a reference: a building lesson by its building ("isl:<id>"), else the item name.
const scanIslKey = (e) => (e.id != null && e.n !== SCAN_SKIP ? `isl:${e.id}` : e.n);
function scanIslMatch(feat) {
  const n = feat.length, best = new Map();
  scanIslRefs().forEach((e) => {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += Math.abs(feat[i] - e.g[i]);
    const d = sum / n, k = scanIslKey(e);
    if (!best.has(k) || d < best.get(k).d) best.set(k, { d, e });
  });
  const [first, second] = [...best.values()].sort((a, b) => a.d - b.d);
  return first ? { key: scanIslKey(first.e), e: first.e, dist: first.d, next: second ? second.d : Infinity } : { key: null, dist: Infinity, next: Infinity };
}
// The Storehouse's tiles: wide blocks (about 4 : 3) in a grid of 3 on the dark blue panel.
function scanFindWideTiles(src) {
  const s = Math.min(1, 480 / src.width), w = Math.round(src.width * s), h = Math.round(src.height * s);
  const c = scanCanvas(w, h), g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(src, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data, mask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = d[i * 4], gr = d[i * 4 + 1], b = d[i * 4 + 2], lum = (r + gr + b) / 3;
    mask[i] = (b - r > 50 && lum < 110) || lum < 45 ? 0 : 1;
  }
  const boxes = scanBlobs(mask, w, h).filter((b) => b.w >= w * 0.15 && b.w <= w * 0.4 && b.w / b.h > 1.25 && b.w / b.h < 1.6 && b.n > b.w * b.h * 0.85);
  if (!boxes.length) return [];
  const sizes = boxes.map((b) => b.w).sort((a, b) => a - b), mid = sizes[Math.floor(sizes.length / 2)];
  const tiles = boxes.filter((b) => Math.abs(b.w - mid) < mid * 0.08 && Math.abs(b.h - mid / 1.37) < mid * 0.1)
    .map((b) => ({ x: b.x / s, y: b.y / s, w: b.w / s, h: b.h / s }));
  tiles.sort((a, b) => (Math.abs(a.y - b.y) < a.h / 2 ? a.x - b.x : a.y - b.y));
  return tiles;
}
// A square of the tile (left / centre / right) as a 140 x 140 picture's pixels.
function scanIslSquare(src, box, where) {
  const c = scanCanvas(140, 140), g = c.getContext("2d", { willReadFrequently: true });
  const sx = box.x + (where === "right" ? box.w - box.h : (box.w - box.h) / 2);
  g.drawImage(src, sx, box.y, box.h, box.h, 0, 0, 140, 140);
  return { c, td: g.getImageData(0, 0, 140, 140).data };
}
// The tile's colour (left edge, under the "Lv. 1"): orange = Mythic, green / grey = decorations.
function scanIslColour(src, box) {
  const c = scanCanvas(40, 40), g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(src, box.x + box.w * 0.02, box.y + box.h * 0.45, box.w * 0.05, box.h * 0.2, 0, 0, 40, 40);
  const d = g.getImageData(0, 0, 40, 40).data;
  let r = 0, gr = 0, b = 0;
  for (let i = 0; i < d.length; i += 4) { r += d[i]; gr += d[i + 1]; b += d[i + 2]; }
  r /= 1600; gr /= 1600; b /= 1600;
  return r > gr + 40 && gr > b + 25 ? "orange" : gr > r + 40 && gr > b + 40 ? "green" : "grey";
}
// The count at a Storehouse tile's bottom right sits on a dark box; everything around
// that box (snow on the building's picture) is painted over, so the Backpack tiles'
// number reader (scanTileAmount) can read it.
function scanIslAmountTd(src, box) {
  const { c, td } = scanIslSquare(src, box, "right");
  const lum = (x, y) => { const i = (y * 140 + x) * 4; return (td[i] + td[i + 1] + td[i + 2]) / 3; };
  const white = (x, y) => { const i = (y * 140 + x) * 4, r = td[i], g = td[i + 1], b = td[i + 2]; return (r + g + b) / 3 > 175 && Math.max(r, g, b) - Math.min(r, g, b) < 55; };
  const on = (x, y) => lum(x, y) < 140 || white(x, y);
  const colOn = (x) => { let n = 0; for (let y = 100; y <= 128; y++) if (on(x, y)) n++; return n >= 29 * 0.7; };
  // The box = the widest run of such columns on the right (a thin dark line at the
  // tile's edge is not it).
  let left = 137, right = 137;
  for (let x = 137, run = -1; x >= 20; x--) {
    if (colOn(x)) { if (run < 0) run = x; if (run - x > right - left) { left = x; right = run; } }
    else { if (run >= 0 && x < 70) break; run = -1; }
  }
  const rowOn = (y) => { let n = 0; for (let x = left; x <= right; x++) if (on(x, y)) n++; return n >= (right - left + 1) * 0.7; };
  let top = 114, bot = 114;
  while (top > 80 && rowOn(top - 1)) top--;
  while (bot < 139 && rowOn(bot + 1)) bot++;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.fillStyle = "#2a1e14";
  g.fillRect(0, 0, 140, top); g.fillRect(0, bot + 1, 140, 140 - bot - 1);
  g.fillRect(0, top, left, bot - top + 1); g.fillRect(right + 1, top, 140 - right - 1, bot - top + 1);
  return g.getImageData(0, 0, 140, 140).data;
}
// The "Lv. N" printed at a Storehouse tile's top left. A tile above Lv 1 is a placed
// building the person took back into the Storehouse (to move it or to teach Scan), not
// spare copies: it is not counted as "In Storehouse" (owner, 16 Nov 2026).
async function scanIslTileLevel(worker, src, box) {
  const W = 200, H = 60, c = scanCanvas(W, H), g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(src, box.x + box.w * 0.03, box.y + box.h * 0.04, box.w * 0.42, box.h * 0.2, 0, 0, W, H);
  const d = g.getImageData(0, 0, W, H).data, out = scanCanvas(W, H), og = out.getContext("2d");
  og.fillStyle = "#fff"; og.fillRect(0, 0, W, H); og.fillStyle = "#000";
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4, r = d[i], gr = d[i + 1], b = d[i + 2];
    if (Math.min(r, gr, b) > 185 && Math.max(r, gr, b) - Math.min(r, gr, b) < 60) og.fillRect(x, y, 1, 1);
  }
  const text = (await scanRead(worker, out, { tessedit_pageseg_mode: "7" })).text;
  const m = /[Ll1I][vVy][.,:]?\s*(\d{1,2})/.exec(text.replace(/\s+/g, " "));
  return m ? Number(m[1]) : null;
}
const scanIslTileFeature = (src, box) => scanTileFeature(scanIslSquare(src, box, "centre").td);
// Island Storehouse (Decoration / Accessory / Ingredients tabs). Orange tiles: Mythic
// buildings (copies kept in the Storehouse) and the Ingredients items; green and grey
// ones (trees, roads, lamps, ponds) are left out without a word.
async function scanIslStoreShot(worker, src) {
  const tiles = scanFindWideTiles(src);
  if (tiles.length) await scanIslBldRefsLoad();
  // The title / tabs above the tiles say it is the Storehouse (no tiles: the Accessory
  // tab's lighthouse cards, so the top fifth of the screen).
  const y1 = Math.max(10, Math.round(tiles.length ? tiles[0].y : src.height * 0.2)), hc = scanCanvas(src.width, y1);
  hc.getContext("2d").drawImage(src, 0, 0, src.width, y1, 0, 0, src.width, y1);
  const head = (await scanRead(worker, hc, { tessedit_pageseg_mode: "6" })).text;
  if (!/storehouse|decoration|ingredient|accessory/i.test(head)) return null;
  // No tiles: the Accessory tab (its picture cards aren't plain tiles).
  if (!tiles.length) {
    const lights = await scanIslLightShot(worker, src, y1);
    return lights.length ? { kind: "islacc", items: [], lights } : null;
  }
  const items = [], isl = [], unk = [];
  let unknown = 0;
  for (const box of tiles) {
    if (scanIslColour(src, box) !== "orange") continue;
    const feat = scanIslTileFeature(src, box), m = scanIslMatch(feat), td = scanIslAmountTd(src, box);
    const lv = await scanIslTileLevel(worker, src, box), placed = lv != null && lv > 1 ? lv : null;
    // Every tile is orange, so different buildings can be only ~20 apart: a closer
    // match than the Backpack's (the same picture reads about 0–8 apart).
    if (m.key === SCAN_SKIP && m.dist <= 14) { unknown++; continue; }
    if (m.dist > 14) {
      unknown++;
      const sq = scanIslSquare(src, box, "centre").c, pic = scanCanvas(96, 96);
      pic.getContext("2d").drawImage(sq, 0, 0, 96, 96);
      unk.push({ td: new Uint8ClampedArray(td), feat, isl: true, placed, rarity: null, after: null, gap: null, img: pic.toDataURL("image/jpeg", 0.85) });
      continue;
    }
    if (placed && /^isl:/.test(m.key)) { isl.push({ id: String(m.e.id), name: m.e.n, placed, value: null, sure: true }); continue; }
    const amount = await scanTileAmount(worker, td);
    const sure = m.dist <= 9 && m.next > m.dist * 1.4 && amount.sure;
    if (/^isl:/.test(m.key)) isl.push({ id: String(m.e.id), name: m.e.n, value: amount.value, sure });
    else items.push({ name: m.key, value: amount.value, sure });
  }
  return { kind: "islstore", items, isl, unknown, unk };
}
// Storehouse Accessory tab: the lighthouses as big picture cards, "Starry Lighthouse Lv. 7"
// written in white along each card's bottom. Only the near-white letters are kept
// (black on white) and read line by line; [{ name: text read, value: level }].
async function scanIslLightShot(worker, src, top) {
  const W = src.width, H = src.height - top, k = Math.min(1, 900 / W), w = Math.round(W * k), h = Math.round(H * k);
  if (h < 20) return [];
  const c = scanCanvas(w, h), g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(src, 0, top, W, H, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data, out = scanCanvas(w, h), og = out.getContext("2d");
  og.fillStyle = "#fff"; og.fillRect(0, 0, w, h); og.fillStyle = "#000";
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, r = d[i], gr = d[i + 1], b = d[i + 2];
    if (Math.min(r, gr, b) > 200 && Math.max(r, gr, b) - Math.min(r, gr, b) < 40) og.fillRect(x, y, 1, 1);
  }
  const text = (await scanRead(worker, out, { tessedit_pageseg_mode: "11" })).text.replace(/\n+/g, "\n");
  // One card a line: "<name> Lv. 7" (the "L" sometimes reads lower-case).
  return text.split("\n").map((ln) => /([A-Za-z][A-Za-z' ]{3,}?)\s*[Ll][vVy][.,:]?\s*(\d{1,2})\b/.exec(ln))
    .filter(Boolean).map((m) => ({ name: m[1].trim(), value: Number(m[2]) }));
}
// A name read from the screen to a building of the list: the closest by letters
// (Levenshtein over lower-case letters only), at most a third of the name off.
function scanIslNameMatch(txt, list) {
  const norm = (x) => String(x).toLowerCase().replace(/[^a-z]/g, "");
  const a = norm(txt);
  let best = null, bd = Infinity;
  list.forEach((s) => {
    const b = norm(s.name), m = a.length, n = b.length, row = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      let prev = row[0]; row[0] = i;
      for (let j = 1; j <= n; j++) { const tmp = row[j]; row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = tmp; }
    }
    // The text before the name (bits of the picture) may add letters in front: compare the end too.
    let dd = row[n];
    if (m > n) { const tail = a.slice(m - n); let e = 0; for (let i = 0; i < n; i++) if (tail[i] !== b[i]) e++; dd = Math.min(dd, e); }
    if (dd < bd) { bd = dd; best = s; }
  });
  return best && bd <= Math.max(2, Math.floor(norm(best.name).length / 3)) ? best : null;
}
// My Island: the Life Essence amount beside the green leaf at the top right
// (the gold coins on the left are not read).
async function scanIslLifeShot(worker, src) {
  const W = src.width, H = src.height, k = Math.min(1, 400 / W), w = Math.round(W * k), h = Math.max(8, Math.round(H * 0.07 * k));
  const c = scanCanvas(w, h), g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(src, 0, 0, W, H * 0.07, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data, mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = Math.round(w * 0.55); x < w; x++) {
    const i = (y * w + x) * 4, r = d[i], gr = d[i + 1], b = d[i + 2];
    mask[y * w + x] = gr > 140 && gr > r + 80 && gr > b + 40 ? 1 : 0;
  }
  const blobs = scanBlobs(mask, w, h).filter((b) => b.n >= 6).sort((a, b) => a.x - b.x);
  const leaf = blobs.filter((b) => b.h >= h * 0.25 && b.n >= 40).sort((a, b) => b.n - a.n)[0];
  if (!leaf) return null;
  const plus = blobs.find((b) => b.x > leaf.x + leaf.w + w * 0.05);
  // The title (top left) says "My Island" (the "I" often reads as "l").
  const tc = scanCanvas(Math.round(W * 0.55), Math.round(H * 0.05));
  tc.getContext("2d").drawImage(src, 0, 0, tc.width, tc.height, 0, 0, tc.width, tc.height);
  if (!/s\s?[il1|]and/i.test((await scanRead(worker, tc, { tessedit_pageseg_mode: "7" })).text)) return null; // "Island" (read as "lsland" too)
  // The white number between the leaf and the green "+".
  const x0 = Math.round((leaf.x + leaf.w) / k + W * 0.005), x1 = Math.round(plus ? plus.x / k - W * 0.005 : W * 0.97);
  const y0 = Math.max(0, Math.round(leaf.y / k - H * 0.003)), y1 = Math.min(H, Math.round((leaf.y + leaf.h) / k + H * 0.003));
  if (x1 - x0 < 10 || y1 - y0 < 6) return null;
  const nc = scanCanvas(x1 - x0, y1 - y0), ng = nc.getContext("2d", { willReadFrequently: true });
  ng.drawImage(src, x0, y0, x1 - x0, y1 - y0, 0, 0, x1 - x0, y1 - y0);
  const nd = ng.getImageData(0, 0, nc.width, nc.height).data, pad = 16, out = scanCanvas(nc.width + pad * 2, nc.height + pad * 2), og = out.getContext("2d");
  og.fillStyle = "#fff"; og.fillRect(0, 0, out.width, out.height); og.fillStyle = "#000";
  for (let y = 0; y < nc.height; y++) for (let x = 0; x < nc.width; x++) {
    const i = (y * nc.width + x) * 4, r = nd[i], gr = nd[i + 1], b = nd[i + 2];
    if ((r + gr + b) / 3 > 185 && Math.max(r, gr, b) - Math.min(r, gr, b) < 45) og.fillRect(pad + x, pad + y, 1, 1);
  }
  const r = await scanRead(worker, out, { tessedit_pageseg_mode: "7", tessedit_char_whitelist: "0123456789,.KM" });
  const txt = r.text.replace(/\s/g, ""), unit = /[KM]$/.exec(txt);
  const num = Number(txt.replace(/[KM]$/, "").replace(/,/g, ""));
  const value = Number.isFinite(num) && txt && /\d/.test(txt) ? Math.round(num * (unit ? (unit[0] === "K" ? 1e3 : 1e6) : 1)) : null;
  return { kind: "island", items: [{ name: "Life Essence", value, sure: false }] };
}
// Mythic island buildings the Islands page plans (same list and request as that page),
// by category in the Islands order.
async function scanIslBuildings() {
  const cats = await islandCatRows(), catList = cats.length ? cats.map((c) => c.category) : ["Island"];
  const rows = await keptRows("skins",
    `skins?user_id=eq.${USER_ID}&category=in.(${catList.map((c) => encodeURIComponent(c)).join(",")})&select=id,category,name,image_url,bonus_type,bonus_value,bonus_level1,bonus_type2,bonus_value2,bonus_level2,bonus_type3,bonus_value3,bonus_level3,bonus_type4,bonus_value4,bonus_level4,display_group,owned,current_level,max_level&order=sort_order.asc`
  );
  const list = rows.filter((s) => islCatTracked(s.category) && !ISL_SKIP_NAMES.includes(s.name) && islIsMythic(s));
  return { cats: catList.filter((c) => list.some((s) => s.category === c)), list, lights: rows.filter((s) => s.category === "Lighthouse") };
}
// Storehouse copies read or typed on the check screen: { skinId: copies } replaces those
// buildings' "In Storehouse" (calc_state island_shards.store, the Islands page's box).
// light: { lighthouse skinId: level } from the Accessory tab → island_shards.light =
// { skinId: { now, to } } (the target kept, else the level read).
async function scanIslStoreSave(set, light) {
  const saved = ISL_SHARDS || (await loadCalcState("island_shards").catch(() => null)) || {};
  const st = { ...islDefault(), ...(saved && typeof saved === "object" ? saved : {}) };
  const store = { ...(st.store && typeof st.store === "object" ? st.store : {}) };
  Object.entries(set).forEach(([id, v]) => { if (Number(v) > 0) store[id] = Math.floor(Number(v)); else delete store[id]; });
  st.store = store;
  if (ISL_SHARDS) ISL_SHARDS.store = store;
  if (light && Object.keys(light).length) {
    const lt = { ...(st.light && typeof st.light === "object" ? st.light : {}) };
    Object.entries(light).forEach(([id, v]) => { const had = lt[id] && typeof lt[id] === "object" ? lt[id] : {}; lt[id] = { ...had, now: Math.floor(Number(v)), to: had.to != null ? had.to : Math.floor(Number(v)) }; });
    st.light = lt;
    if (ISL_SHARDS) ISL_SHARDS.light = lt;
  }
  delete st.essence; delete st.shards;
  saveCalcState("island_shards", st);
}

// mode "island" (the Islands page's Scan): only the island screens are read; the
// Backpack's Scan finds an island screen but leaves it (kind "islelse").
async function scanShot(worker, file, marks, refs, mode) {
  const src = await createImageBitmap(file);
  if (mode === "island") return (await scanIslStoreShot(worker, src)) || (await scanIslLifeShot(worker, src)) || { kind: "notisl", items: [] };
  const lab = await scanLabShot(worker, src);
  if (lab) return lab;
  const tiles = scanFindTiles(src);
  if (tiles.length) {
    const gear = await scanGearTiles(src, tiles, worker);
    if (gear !== null) return { kind: "gear", items: [{ name: "Mythic Gear", part: "gear", value: gear.orange, seq: gear.seq, low: gear.low, og: gear.og, sure: false }] };
    // Learned item pictures first (quick); speedup tiles match none of them.
    const known = await scanItemTiles(worker, src, tiles, refs);
    if (known.found.length) return { kind: "items", items: known.found, unknown: known.unknown, unk: known.unk, seq: known.seq };
    const items = await scanSpeedTiles(worker, src, tiles, marks);
    if (items.length) return { kind: "speedup", items };
  }
  // Island screens: the Island Storehouse (tiles about 4 : 3, never square) and My Island.
  if (visitorCan("islandscan") && ((await scanIslStoreShot(worker, src)) || (await scanIslLifeShot(worker, src)))) return { kind: "islelse", items: [] };
  // Text reads best on the light Summary panel alone, about 720 px wide.
  const p = scanLightPanel(src), s = 720 / p.w, c = scanCanvas(720, Math.round(p.h * s));
  c.getContext("2d").drawImage(src, p.x, p.y, p.w, p.h, 0, 0, c.width, c.height);
  const text = (await scanRead(worker, c, { tessedit_pageseg_mode: "6" })).text;
  const items = scanSummaryText(text);
  if (items.length) return { kind: "summary", items };
  // Squares but no speedups and no Summary rows: another Backpack tab.
  return { kind: /speedup/i.test(text) && /\bmin\b/i.test(text) ? "speedsummary" : tiles.length ? "other" : "unknown", items: [] };
}

// more.canAdd(name): a hero's shards or a Gen's widgets that aren't on the
// person's list yet ({ label, icon } or null); more.added(names) puts them on it.
// more.island: the Islands page's Scan (island screens only).
function openBackpackScanMain(groups, bp, done, more) {
  const islMode = !!(more && more.island);
  const known = new Map(groups.flatMap((g) => g.items).map((it) => [it.name, it]));
  const addable = new Map();
  let modal = document.getElementById("bpScanModal");
  if (!modal) { modal = document.createElement("div"); modal.id = "bpScanModal"; modal.className = "modal-overlay"; document.body.appendChild(modal); }
  modal.style.display = "flex";
  const close = () => { modal.style.display = "none"; };
  modal.onclick = (ev) => { if (ev.target === modal) close(); };
  // A newer Scan (or closing this one) stops an older reading from drawing here.
  const run = {};
  modal._scanRun = run;
  const live = () => modal._scanRun === run && modal.style.display !== "none";
  // Esc = its Cancel / Close button (the same click). Not while reading (no
  // Cancel there) and not when the check screen has changes (typed, ticked or
  // a tile taught / skipped): those stay, like the site's other pop-ups.
  modal._scanEsc = (e) => {
    const btn = modal.querySelector("[data-scanclose]"), box = modal.querySelector(".modal-box");
    if (!btn || !box || a11yDirty(box) || unknownList.some((u) => u.pick || u.skip)) return;
    e.preventDefault();
    btn.click();
  };
  if (!window.SCAN_ESC_WIRED) {
    window.SCAN_ESC_WIRED = true;
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape" || e.defaultPrevented || e.isComposing) return;
      const m = document.getElementById("bpScanModal");
      // An open example picture is closed first by the site's own Esc.
      if (!m || m.style.display === "none" || !m._scanEsc || m.querySelector(".scan-ex-view")) return;
      m._scanEsc(e);
    });
  }
  const results = new Map(); // name -> { value, sure }
  const notes = new Set();
  const skipped = new Set();
  // Everything seen in the screenshots, and which kinds of tiles were read:
  // items with an amount that weren't seen (opened chests, used items) are
  // offered as "set to 0".
  const seen = new Set();
  let sawItems = false, sawSpeed = false;
  let unknownTiles = 0;
  const unknownList = []; // tiles Scan didn't know: { td, feat, rarity, after, img, tab, pick, amount }
  // Mythic Gear = boxes (Other tab) + orange hero gear pieces (Gear tab).
  const mgParts = { box: null, gear: null };
  // Research Lab screen: the weekly super refinements go to
  // the Research Lab's "Game says" (calc_state rfc_lab.game), not the Backpack.
  const lab = { seen: false, count: null, saved: null };
  // Purple hero gear for XP from the Gear tab: { "Gear XP Purple +80": n }, null until read.
  let gearLow = null, gearLowUnread = 0;
  const gearSeqs = []; // the Gear screenshots read so far
  const shotSpans = []; // per item screenshot: { tab: { min, max } } in game order
  const shotSeqs = []; // per item screenshot: item names tile by tile (null = not read)
  // Island screens: Storehouse building copies by building id ({ name, value, sure }),
  // the Mythic buildings (for names, pictures and the teach picker) and the saved Storehouse.
  const islRes = new Map();
  const islPlaced = new Map(); // building id -> { name, img, lv }: a placed building taken back (tile above Lv 1), not spare copies
  const isl = { life: false, store: false, acc: false, bld: null, now: {}, light: {}, elsewhere: false };
  const islLight = new Map(); // lighthouse skin id -> { name, img, value } (Accessory tab)
  const islLoad = async () => {
    if (isl.bld) return;
    try { isl.bld = await scanIslBuildings(); } catch (e) { isl.bld = { cats: [], list: [], lights: [] }; }
    const st = ISL_SHARDS || (await loadCalcState("island_shards").catch(() => null)) || {};
    isl.now = (st && st.store) || {};
    isl.light = (st && st.light) || {};
  };
  const picker = () => {
    const input = document.createElement("input");
    input.type = "file"; input.accept = "image/*"; input.multiple = true;
    input.onchange = () => { if (input.files.length) readAll([...input.files]); };
    input.click();
  };
  const showStart = () => {
    modal.innerHTML = `<div class="modal-box" style="max-width:480px;">
      <h2 style="margin:0 0 4px; font-size:16px;">&#128247; ${esc(t(islMode ? "scan_isl_title" : "scan_title"))}</h2>
      <p class="desc" style="margin:0 0 12px;">${esc(t(islMode ? "scan_isl_intro" : "scan_intro"))}</p>
      ${(islMode ? [["", "scan_tab_isl", "scan_isl_life_hint"], ["", "scan_isl_ing", "scan_isl_ing_hint"], ["", "scan_isl_dec", "scan_isl_dec_hint"], ["", "scan_isl_acc", "scan_isl_acc_hint"]]
    : [["summary", "scan_summary", "scan_summary_hint"], ["speedup", "scan_speedup", "scan_speedup_hint"], ["items", "scan_items", "scan_items_hint"], ["lab", "scan_lab", "scan_lab_hint"]]).map(([ex, head, hint], i) => `
      <div class="scan-step"><b>${i + 1}</b><div><div>${esc(t(head))}</div><div class="meta">${esc(t(hint))}</div></div>
        ${ex ? `<button type="button" class="scan-ex" data-scanex="icons/scan-ex-${ex}.jpg" aria-label="${esc(t("scan_example"))}"><img src="icons/scan-ex-${ex}.jpg" alt="" loading="lazy" /><span>&#128269;</span></button>` : ""}</div>`).join("")}
      <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:14px;">
        <button class="btn ghost" type="button" data-scanclose>${esc(t("cancel"))}</button>
        <button class="btn" type="button" data-scanpick>${esc(t("scan_choose"))}</button>
      </div></div>`;
    modal.querySelector("[data-scanclose]").onclick = close;
    modal.querySelector("[data-scanpick]").onclick = picker;
    // Tap an example: see it full size; tap again to go back.
    modal.querySelectorAll("[data-scanex]").forEach((b) => b.onclick = () => {
      const view = document.createElement("div");
      view.className = "scan-ex-view";
      view.innerHTML = `<img src="${esc(b.dataset.scanex)}" alt="" /><div class="meta">${esc(t("scan_example_close"))}</div>`;
      view.onclick = (ev) => { ev.stopPropagation(); view.remove(); };
      modal.appendChild(view);
    });
  };
  const progress = (msg) => {
    modal.innerHTML = `<div class="modal-box" style="max-width:360px; text-align:center;"><div class="scan-spin"></div><div>${esc(msg)}</div><div class="meta" data-scanpct></div></div>`;
  };
  const readAll = async (files) => {
    progress(t("scan_loading"));
    // Download / start-up progress of the reader (its steps each go 0 → 100%).
    // What it is waiting for: the reader's own steps, then the item pictures.
    const steps = { reader: "", pics: 0 };
    const showSteps = () => {
      const el = live() && modal.querySelector("[data-scanpct]");
      if (el) el.textContent = [steps.reader, `${t("scan_step_pics")} ${steps.pics}/2`].filter(Boolean).join(" · ");
    };
    SCAN_PROGRESS = (m) => {
      if (!m || typeof m.progress !== "number") return;
      steps.reader = `${m.status || ""} ${Math.round(m.progress * 100)}%`;
      showSteps();
    };
    const pic = (pr) => pr.then((v) => { steps.pics++; showSteps(); return v; });
    let worker, marks, refs;
    try { [worker, marks, refs] = await Promise.all([scanWorker().then((w) => { steps.reader = `${t("scan_step_ready")} \u2713`; showSteps(); return w; }), pic(scanMarkData()), pic(scanItemData()), scanLearnedLoad().catch(() => [])]); SCAN_PROGRESS = null; }
    catch (e) {
      SCAN_PROGRESS = null;
      if (!live()) return; modal.innerHTML = `<div class="modal-box" style="max-width:360px;"><p>${esc(t("scan_failed"))}</p><div style="text-align:end;"><button class="btn" type="button" data-scanclose>${esc(t("close_button"))}</button></div></div>`; modal.querySelector("[data-scanclose]").onclick = close; return; }
    for (let i = 0; i < files.length; i++) {
      if (!live()) return;
      progress(t("scan_reading").replace("{n}", i + 1).replace("{m}", files.length));
      let shot;
      try { shot = await scanShot(worker, files[i], marks, refs, islMode ? "island" : ""); } catch (e) { shot = { kind: "unknown", items: [] }; }
      if (!live()) return;
      if (shot.kind === "speedsummary") notes.add(t("scan_speed_summary"));
      else if (shot.kind === "other") notes.add(t("scan_other_items"));
      if (shot.kind === "items") {
        sawItems = true;
        // The stretch of each tab this screenshot shows (game order).
        const sp = {}, tabCount = {};
        shot.items.forEach((it) => {
          const tab = scanItemTab(it.name), k = scanTabOrder(tab).indexOf(it.name);
          tabCount[tab] = (tabCount[tab] || 0) + 1;
          if (k < 0) return;
          const r = sp[tab] || (sp[tab] = { min: k, max: k });
          r.min = Math.min(r.min, k); r.max = Math.max(r.max, k);
        });
        shotSpans.push(sp);
        shotSeqs.push(shot.seq || []);
        // Tiles Scan didn't know, with this screenshot's tab, to teach on the check screen.
        const shotTab = Object.keys(tabCount).sort((a, b) => tabCount[b] - tabCount[a])[0] || "other";
        // Only the owner teaches Scan; visitors just see them counted as skipped.
        if (IS_OWNER) (shot.unk || []).forEach((u) => { u.tab = shotTab; unknownList.push(u); });
      }
      if (shot.kind === "speedup") sawSpeed = true;
      if (shot.kind === "island") isl.life = true;
      if (shot.kind === "islelse") isl.elsewhere = true;
      if (shot.kind === "notisl") notes.add(t("scan_not_isl"));
      if (shot.kind === "islacc") {
        isl.acc = true;
        await islLoad();
        if (!live()) return;
        shot.lights.forEach((l) => {
          const s = scanIslNameMatch(l.name, isl.bld.lights || []);
          if (s) islLight.set(String(s.id), { name: s.name, img: s.image_url || "", value: l.value });
        });
        if (shot.lights.length > islLight.size) notes.add(t("scan_isl_acc_unread"));
      }
      if (shot.kind === "islstore") {
        isl.store = true;
        if (!isl.bld) {
          await islLoad();
          if (!live()) return;
        }
        (shot.isl || []).forEach((b) => {
          const s = isl.bld.list.find((x) => String(x.id) === b.id) || isl.bld.list.find((x) => x.name === b.name);
          if (!s) return; // a building no longer in the Islands list
          const id = String(s.id), had = islRes.get(id);
          if (b.placed) { islPlaced.set(id, { name: s.name, img: s.image_url || "", lv: b.placed }); return; }
          if (!had || b.value !== null) islRes.set(id, { name: s.name, img: s.image_url || "", value: b.value, sure: b.sure && (!had || had.value === b.value) });
        });
        if (IS_OWNER) (shot.unk || []).forEach((u) => { u.tab = "island"; unknownList.push(u); });
      }
      if (shot.kind === "lab") {
        lab.seen = true;
        if (shot.lab !== null) lab.count = shot.lab;
        else if (lab.count === null) notes.add(t("scan_lab_unread"));
        if (!RFC_LAB_STATE && !lab.saved) { try { lab.saved = (await loadCalcState("rfc_lab")) || {}; } catch (e) { lab.saved = {}; } }
        if (!live()) return;
      }
      shot.items.forEach((it) => seen.add(it.name));
      if (shot.unknown) unknownTiles += shot.unknown;
      else if (shot.kind === "unknown") notes.add(t("scan_unknown"));
      else if (shot.kind === "summary") notes.add(t("scan_rounded"));
      shot.items.forEach((it) => {
        if (it.name === "Mythic Gear") {
          // Several Gear tab screenshots add up (scrolled further down); rows
          // that are in two screenshots count once (27 read as 35).
          if (it.part === "gear") {
            const dup = scanGearOverlapTiles(gearSeqs, it.seq || []);
            mgParts.gear = (mgParts.gear || 0) + it.value - scanGearOverlap(gearSeqs, it.seq || []); gearSeqs.push(it.seq || []);
            gearLow = gearLow || {};
            const addLow = (lo, d) => { if (lo.lvl === null) gearLowUnread += d; else { const k = gearXpKey(lo.colour, lo.lvl); gearLow[k] = (gearLow[k] || 0) + d; if (!gearLow[k]) delete gearLow[k]; } };
            (it.low || []).forEach((lo) => addLow(lo, 1));
            dup.forEach((x) => { if (x.lo) addLow(x.lo, -1); });
            // Orange pieces join the same list ("Gear Orange +20 Lv.3", start of that level); +0 Lv.0 gives nothing back.
            const addOr = (o, d) => { if (o.lv === null || o.enh === null) gearLowUnread += d; else if (o.enh || o.lv) { const k = gearOrangeKey(o.enh, o.lv, 0); gearLow[k] = (gearLow[k] || 0) + d; if (!gearLow[k]) delete gearLow[k]; } };
            (it.og || []).forEach((o) => addOr(o, 1));
            dup.forEach((x) => { if (x.go) addOr(x.go, -1); });
          }
          else if (it.value !== null) mgParts.box = it.value;
          it.value = mgParts.box === null && mgParts.gear === null ? null : (mgParts.box || 0) + (mgParts.gear || 0);
          it.sure = false;
        }
        if (!known.has(it.name)) {
          const add = more && more.canAdd(it.name);
          if (!add) { skipped.add(it.name.replace(/ Speedup /, " ")); return; }
          addable.set(it.name, add);
        }
        const had = results.get(it.name);
        if (had && had.value !== it.value) it.sure = false;
        if (!had || it.value !== null) results.set(it.name, { value: it.value, sure: it.sure });
      });
    }
    if (live()) showReview();
  };
  const showReview = () => {
    const names = [...results.keys()].sort((a, b) => {
      const rank = (n) => { const i = BP_GAME_ORDER.indexOf(n); return i !== -1 ? i : BP_GAME_ORDER.length + Math.max(0, BP_SPEEDUP_ORDER.indexOf(n)); };
      return rank(a) - rank(b);
    });
    const unsure = names.filter((n) => !results.get(n).sure).length;
    const label = (n) => { const it = known.get(n); return !it ? addable.get(n).label : /speedup/i.test(n) ? n.replace(/^Speedup/, "General Speedup") : materialDisplayName(it.name); };
    const rows = names.map((n) => {
      const r = results.get(n), old = Number(bp[n]) || 0, ic = known.has(n) ? bpIcon(known.get(n)) : addable.get(n).icon;
      return `<label class="scan-row${r.sure ? "" : " unsure"}">
        <input type="checkbox" data-scantick="${esc(n)}" checked />
        ${ic ? `<img src="${esc(ic)}" alt="" />` : `<span class="scan-img"></span>`}
        <span class="scan-name"><b>${esc(label(n))}</b><span class="meta">${esc(t("scan_now").replace("{n}", old.toLocaleString()))}${known.has(n) || addable.get(n).listed ? "" : ` · ${esc(t("scan_will_add"))}`}${n === "Mythic Gear" ? ` · ${esc(t("scan_mg_parts").replace("{box}", mgParts.box ?? "?").replace("{gear}", mgParts.gear ?? "?"))}` : ""}${r.sure ? "" : ` · <em>${esc(t("scan_please_check"))}</em>`}</span></span>
        <input type="text" inputmode="numeric" data-scanval="${esc(n)}" value="${r.value === null ? "" : r.value.toLocaleString("en-US")}" />
      </label>`;
    }).join("");
    // Items Scan can read that have an amount here but were in no screenshot.
    // "Set to 0?" only for items of the tabs you scanned, and inside a tab only
    // between the first and last item seen: scanning the
    // Resources tab no longer offers to zero Other-tab items.
    // Each item screenshot covers one stretch of its tab (first to last item it
    // showed); stretches that share items join up. A gap between two screenshots
    // (rows scrolled past) isn't covered, so items there are kept.
    const rng = {};
    shotSpans.forEach((sp) => Object.entries(sp).forEach(([tab, r]) => { (rng[tab] = rng[tab] || []).push({ ...r }); }));
    Object.keys(rng).forEach((tab) => {
      const list = rng[tab].sort((a, b) => a.min - b.min), out = [];
      list.forEach((r) => { const last = out[out.length - 1]; if (last && r.min <= last.max) last.max = Math.max(last.max, r.max); else out.push(r); });
      rng[tab] = out;
    });
    // A hero's own widgets or shards taught on the site have no fixed place, but
    // their lesson knows the item before them and how many tiles apart: a
    // screenshot showing that item and the tiles up to that spot covers it
    // (used widgets stayed at 285).
    const spotShown = (n) => SCAN_LEARNED.some((e) => e.n === n && e.after && e.gap != null && e.gap >= 0
      && shotSeqs.some((sq) => { const i = sq.indexOf(e.after); return i >= 0 && i + e.gap + 1 < sq.length; }));
    const readable = (n) => {
      if (/speedup/i.test(n)) return sawSpeed;
      if (/ (Widgets|Shards)$/.test(n) && !/^Gen \d+ Widgets$/.test(n) && !/General Hero Shard$/.test(n) && SCAN_LEARNED.some((e) => e.n === n)) return sawItems && spotShown(n);
      if (!sawItems || !scanKnowsName(n)) return false;
      // Mythic Gear = the box + the Gear tab's orange pieces: only with the Gear tab read too.
      if (n === "Mythic Gear" && mgParts.gear === null) return false;
      const tab = scanItemTab(n), k = scanTabOrder(tab).indexOf(n);
      return (rng[tab] || []).some((r) => k > r.min && k < r.max);
    };
    const tabsRead = [rng.res && "scan_tab_res", rng.other && "scan_tab_other", sawSpeed && "scan_tab_speed", mgParts.gear !== null && "scan_tab_gear", lab.seen && "scan_tab_lab", isl.life && "scan_tab_isl", isl.store && "scan_tab_islstore", isl.acc && "scan_isl_acc"].filter(Boolean).map((k) => t(k));
    // Island Storehouse: spare copies of each Mythic building read (Islands "In Storehouse").
    // Storehouse Accessory tab: each lighthouse's level (Islands page's Lighthouse plan).
    const lightHtml = !islLight.size ? "" : `<div class="scan-lab-h">&#128680; ${esc(t("scan_isl_acc_h"))}</div>${[...islLight.entries()].map(([id, r]) => `<label class="scan-row unsure">
        <input type="checkbox" data-scanlighttick="${esc(id)}" checked />
        ${r.img ? `<img src="${esc(r.img)}" alt="" />` : `<span class="scan-img"></span>`}
        <span class="scan-name"><b>${esc(dataName(r.name))}</b><span class="meta">${esc(t("scan_isl_acc_now").replace("{n}", r.value))}${isl.light[id] && isl.light[id].now != null && Number(isl.light[id].now) !== r.value ? ` · ${esc(t("scan_isl_acc_was").replace("{n}", isl.light[id].now))}` : ""} · <em>${esc(t("scan_please_check"))}</em></span></span>
        <input type="text" inputmode="numeric" data-scanlight="${esc(id)}" value="${r.value}" />
      </label>`).join("")}`;
    const placedHtml = [...islPlaced.entries()].filter(([id]) => !islRes.has(id)).map(([, r]) => `<div class="scan-row">
        ${r.img ? `<img src="${esc(r.img)}" alt="" />` : `<span class="scan-img"></span>`}
        <span class="scan-name"><b>${esc(dataName(r.name))}</b><span class="meta">${esc(t("scan_isl_placed").replace("{n}", r.lv))}</span></span>
      </div>`).join("");
    const islHtml = !islRes.size && !placedHtml ? "" : `<div class="scan-lab-h">&#127965; ${esc(t("scan_isl_store_h"))}</div>${placedHtml}${[...islRes.entries()].map(([id, r]) => `<label class="scan-row${r.sure ? "" : " unsure"}">
        <input type="checkbox" data-scanisltick="${esc(id)}" checked />
        ${r.img ? `<img src="${esc(r.img)}" alt="" />` : `<span class="scan-img"></span>`}
        <span class="scan-name"><b>${esc(dataName(r.name))}</b><span class="meta">${esc(t("scan_isl_store_now").replace("{n}", (Math.floor(Number(isl.now[id]) || 0)).toLocaleString()))}${r.sure ? "" : ` · <em>${esc(t("scan_please_check"))}</em>`}</span></span>
        <input type="text" inputmode="numeric" data-scanisl="${esc(id)}" value="${r.value === null ? "" : r.value.toLocaleString("en-US")}" />
      </label>`).join("")}`;
    // Research Lab: this week's count from the game, with the plan beside it.
    const labSt = () => { const s = lab.saved || {}; return RFC_LAB_STATE || { top: s.top, attempts: s.attempts, budget: Number(s.budget) || 0, mode: s.mode === "budget" ? "budget" : "schedule", labOpen: s.labOpen, game: s.game, weekPick: s.weekPick }; };
    let labWk = null;
    if (lab.count !== null) { try { labWk = rfcLabWeek(labSt()); } catch (e) { labWk = null; } }
    const labHtml = lab.count === null ? "" : `<div class="scan-lab-h">&#128300; ${esc(t("scan_lab_title"))}</div>
      <div class="scan-lab">
        <label class="scan-row unsure">
          <input type="checkbox" data-scanlabtick checked />
          <img src="${esc(materialIconSrc("Refined FC") || "icons/item_icon_100082.png")}" alt="" />
          <span class="scan-name"><b>${esc(t("scan_lab_weekly"))}</b><span class="meta"><em>${esc(t("scan_please_check"))}</em>${labWk ? ` · ${esc(t("rl_wk_plan_today").replace("{n}", labWk.planSoFar.toLocaleString()))}` : ""}</span></span>
          <input type="text" inputmode="numeric" data-scanlab value="${lab.count}" />
        </label>
        <div class="meta scan-lab-note">${esc(t("scan_lab_note"))}</div>
      </div>`;
    const order = (n) => { const k = BP_GAME_ORDER.indexOf(n); return k !== -1 ? k : BP_GAME_ORDER.length + Math.max(0, BP_SPEEDUP_ORDER.indexOf(n)); };
    const zeroNames = Object.keys(bp).filter((n) => Number(bp[n]) > 0 && !seen.has(n) && !results.has(n) && readable(n)).sort((a, b) => order(a) - order(b));
    const zeroRows = zeroNames.map((n) => {
      const ic = known.has(n) ? bpIcon(known.get(n)) : ((more && more.canAdd(n)) || {}).icon || "";
      return `<label class="scan-row scan-zero">
        <input type="checkbox" data-scanzero="${esc(n)}" checked />
        ${ic ? `<img src="${esc(ic)}" alt="" />` : `<span class="scan-img"></span>`}
        <span class="scan-name"><b>${esc(/speedup/i.test(n) ? n.replace(/^Speedup/, "General Speedup") : !known.has(n) && more && more.canAdd(n) ? more.canAdd(n).label : materialDisplayName(n))}</b><span class="meta">${esc(t("scan_now").replace("{n}", (Number(bp[n]) || 0).toLocaleString()))}</span></span>
        <span class="scan-zero-to">&rarr; 0</span>
      </label>`;
    }).join("");
    // Tiles Scan didn't know (owner only): pick what each is (a Backpack item or
    // a hero's shards / widgets); Scan remembers it for everyone.
    const heroList = (more && more.heroes) || [];
    const labelFor = (n) => {
      if (/^isl:/.test(n)) { const b = ((isl.bld && isl.bld.list) || []).find((x) => `isl:${x.id}` === n); return b ? `${dataName(b.name)} — ${t("scan_tab_islstore")}` : n; }
      if (known.has(n)) return materialDisplayName(known.get(n).name);
      const m = / (Shards|Widgets)$/.exec(n), hero = n.replace(/ (Shards|Widgets)$/, "");
      return m ? `${dataName(hero)} — ${t(m[1] === "Shards" ? "backpack_hero_shards" : "scan_learn_widgets")}` : n;
    };
    const learnModes = ["shards", "widgets", "items"];
    const islCells = (u) => u.mode === "islitems"
      ? BP_ISLAND_ITEMS.filter((n) => known.has(n)).map((n) => [n, bpIcon(known.get(n)), materialDisplayName(itemShortName(n))])
      : ((isl.bld && isl.bld.cats) || []).flatMap((c) => [[null, null, dataName(c)]].concat(isl.bld.list.filter((b) => b.category === c).map((b) => [`isl:${b.id}`, b.image_url || "", dataName(b.name)])));
    const learnPicker = (u, i) => {
      const r = u.mode === "widgets" ? "Legendary" : u.all ? null : u.rarity;
      const modes = u.isl ? ["buildings", "islitems"] : learnModes;
      const cells = u.isl ? islCells(u) : u.mode === "items"
        ? [...known.values()].filter((it) => !/speedup/i.test(it.name) && scanItemTab(it.name) === u.tab && !SCAN_SUMMARY_ROWS.some(([, n]) => n === it.name)).map((it) => [it.name, bpIcon(it), materialDisplayName(itemShortName(it.name))])
        : heroList.filter((h) => !r || h.rarity === r).sort((a, b) => (Number(b.generation) || 0) - (Number(a.generation) || 0) || String(a.name).localeCompare(String(b.name)))
          .map((h) => [`${h.name} ${u.mode === "widgets" ? "Widgets" : "Shards"}`, h.image_url || "", dataName(h.name)]);
      return `<div class="scan-lpick">
        ${modes.length > 1 ? `<div class="scan-lchips">${modes.map((m) => `<button type="button" class="scan-lchip${u.mode === m ? " on" : ""}" data-lmode="${i}|${m}">${esc(t("scan_learn_" + m))}</button>`).join("")}</div>` : ""}
        <div class="scan-lgrid">${cells.map(([n, ic, lab]) => n === null ? `<div class="scan-lgh">${esc(lab)}</div>` : `<button type="button" class="scan-lg${u.pick === n ? " on" : ""}" data-lpick="${i}|${esc(n)}" title="${esc(lab)}">${ic ? `<img src="${esc(ic)}" alt="" loading="lazy" />` : `<i>${esc(String(lab).charAt(0))}</i>`}<span>${esc(lab)}</span></button>`).join("") || `<div class="meta">—</div>`}</div>
        ${u.mode === "shards" && u.rarity && !u.all ? `<button type="button" class="linklike" data-lall="${i}" style="font-size:11.5px;">${esc(t("scan_learn_all"))}</button>` : ""}
      </div>`;
    };
    const learnHtml = (open) => !unknownList.length ? "" : `<details class="scan-learn"${open ? " open" : ""}><summary><b>${esc(t("scan_learn_title").replace("{n}", unknownList.length))}</b></summary>
      <div class="meta" style="margin:4px 0 6px; font-size:12px;">${esc(t("scan_learn_hint"))}</div>
      ${unknownList.some((u) => !u.pick && !u.skip) ? `<div style="text-align:end;"><button type="button" class="linklike" data-lskipall style="font-size:12px;">${esc(t("scan_learn_skipall"))}</button></div>` : ""}
      ${unknownList.map((u, i) => `<div class="scan-row scan-lrow${u.skip ? " skipped" : ""}">
        <img src="${esc(u.img)}" alt="" class="scan-ltile" />
        <span class="scan-name"><b>${esc(u.skip ? t("scan_learn_skipped") : u.pick ? labelFor(u.pick) : t("scan_learn_unknown"))}</b>${u.pick && u.amount === undefined ? `<span class="meta">${esc(t("scan_learn_reading"))}</span>` : ""}</span>
        ${u.pick && u.amount !== undefined ? `<input type="text" inputmode="numeric" data-lamt="${i}" value="${u.amount == null ? "" : Number(u.amount).toLocaleString("en-US")}" />` : ""}
        ${u.skip ? `<button type="button" class="btn ghost small" data-lskip="${i}">${esc(t("scan_learn_undo"))}</button>`
          : `<button type="button" class="btn ghost small" data-lopen="${i}">${u.pick ? "&#9998;" : esc(t("scan_learn_choose"))}</button>${u.pick ? "" : `<button type="button" class="btn ghost small" data-lskip="${i}" title="${esc(t("scan_learn_skip"))}">${esc(t("scan_learn_skip_short"))}</button>`}`}
      </div>${u.open && !u.skip ? learnPicker(u, i) : ""}`).join("")}</details>`;
    // Purple hero gear for XP read from the Gear tab.
    const gxRows = gearLow ? [
      ...gearOrangeOf(gearLow).rows.sort((a, b) => b.enh - a.enh || b.lv - a.lv).map((r) => ({ key: r.key, lab: `+${r.enh} Lv.${r.lv}`, colour: "Orange", n: r.n, each: r.xp, es: r.es })),
      ...gearXpOf(gearLow).rows.sort((a, b) => b.lvl - a.lvl).map((r) => ({ key: r.key, lab: `+${r.lvl}`, colour: r.colour, n: r.n, each: r.each })),
    ] : [];
    // An orange line's totals: "×2 pieces · 2,300 XP · 60 Essence Stones".
    const goLine = (n, xp, es) => t(n === 1 ? "go_line1" : "go_line").replace("{n}", n.toLocaleString()).replace("{xp}", (n * xp).toLocaleString()).replace("{es}", (n * es).toLocaleString());
    const gxSum = gxRows.reduce((a, r) => ({ n: a.n + r.n, xp: a.xp + r.n * r.each, es: a.es + r.n * (r.es || 0) }), { n: 0, xp: 0, es: 0 });
    const gearHtml = gearLow === null ? "" : `<div class="scan-row unsure" style="display:block;">
      <label style="display:flex; align-items:center; gap:8px;"><input type="checkbox" data-scangxtick checked /><b>${esc(t("gx_title"))}</b><em class="meta" style="font-size:11.5px;">${esc(t("scan_please_check"))}</em></label>
      <div class="meta" style="font-size:11.5px; margin:2px 0 4px;">${esc(t("scan_gx_hint"))}</div>
      ${gxRows.map((r) => `<div class="gx-line${r.colour === "Orange" ? " go" : ""}"><span class="gx-lv">${esc(r.lab)}</span>${r.colour === "Orange"
        ? `<span class="go-sc"><b data-gotot="${esc(r.key)}" data-goxp="${r.each}" data-goes="${r.es || 0}">${esc(goLine(r.n, r.each, r.es || 0))}</b><small class="meta">${esc(t("gx_Orange"))} · ${esc(t("go_each").replace("{xp}", r.each.toLocaleString()).replace("{es}", (r.es || 0).toLocaleString()))}</small></span>`
        : `<span class="meta" style="font-size:12px;">${esc(t("gx_" + r.colour))} · ${esc(t("gx_each").replace("{n}", r.each.toLocaleString()))}</span>`}
        <input type="text" inputmode="numeric" data-scangx="${esc(r.key)}" value="${r.n}" style="margin-inline-start:auto;" /></div>`).join("") || `<div class="meta" style="font-size:12px;">0</div>`}
      ${gearLowUnread ? `<div class="meta" style="font-size:11.5px; margin-top:4px;">&#9888; ${esc(t("scan_gx_unread").replace("{n}", gearLowUnread))}</div>` : ""}
      <div class="gx-sum" style="margin-top:6px;">&rarr; <b>${esc(gxSum.es ? t("go_tot").replace("{xp}", gxSum.xp.toLocaleString()).replace("{es}", gxSum.es.toLocaleString()) : t("gx_xp").replace("{n}", gxSum.xp.toLocaleString()))}</b> (${esc(t("gx_pieces").replace("{n}", gxSum.n.toLocaleString()))})</div>
    </div>`;
    const info = [unsure ? t("scan_flagged").replace("{n}", unsure) : "", ...notes, unknownTiles > unknownList.length ? t("scan_unknown_tiles").replace("{n}", unknownTiles - unknownList.length) : "", skipped.size ? t("scan_skipped").replace("{list}", [...skipped].join(", ")) : ""].filter(Boolean);
    modal.innerHTML = `<div class="modal-box" style="max-width:520px; max-height:86vh; overflow-y:auto;">
      <h2 style="margin:0 0 4px; font-size:16px;">${esc(t("scan_check_title"))}</h2>
      <p class="desc" style="margin:0 0 8px;">${esc(names.length || labHtml || islHtml || lightHtml ? t("scan_check_desc") : t("scan_nothing"))}</p>
      ${info.map((x) => `<div class="meta" style="font-size:12px; margin-bottom:4px;">&#9888; ${esc(x)}</div>`).join("")}
      ${isl.elsewhere ? `<div class="meta scan-islgo" style="font-size:12px; margin-bottom:6px;">&#127965; ${esc(t("scan_isl_elsewhere"))} <button type="button" class="linklike" data-scangoisl>${esc(t("scan_isl_open"))}</button></div>` : ""}
      ${labHtml}
      ${labHtml && rows ? `<div class="scan-lab-h">${esc(t("scan_lab_items"))}</div>` : ""}
      <div style="margin-top:6px;">${rows}</div>
      ${islHtml}
      ${lightHtml}
      ${gearHtml}
      ${tabsRead.length ? `<div class="meta scan-tabs">${esc(t("scan_tabs_read").replace("{list}", tabsRead.join(" · ")))}</div>` : ""}
      ${zeroRows ? `<div class="scan-zero-head"><b>${esc(t("scan_zero_title"))}</b><div class="meta">${esc(t("scan_zero_hint"))}</div></div>${zeroRows}` : ""}
      <div id="scanLearn">${learnHtml(false)}</div>
      <div style="display:flex; gap:8px; justify-content:flex-end; flex-wrap:wrap; margin-top:12px;">
        <button class="btn ghost" type="button" data-scanclose>${esc(t("cancel"))}</button>
        <button class="btn ghost" type="button" data-scanpick>${esc(t("scan_add_more"))}</button>
        ${names.length || zeroRows || unknownList.length || gearLow || labHtml || islHtml || lightHtml ? `<button class="btn" type="button" data-scansave>${esc(t("save"))}</button>` : ""}
      </div></div>`;
    modal.querySelector("[data-scanclose]").onclick = close;
    modal.querySelector("[data-scanpick]").onclick = picker;
    const goIsl = modal.querySelector("[data-scangoisl]");
    if (goIsl) goIsl.onclick = () => { close(); goToTab("islandgallery"); };
    const learnBox = modal.querySelector("#scanLearn");
    const redrawLearn = () => { const d = learnBox.querySelector("details"); learnBox.innerHTML = learnHtml(!d || d.open); };
    learnBox.onclick = async (ev) => {
      const o = ev.target.closest("[data-lopen]"), md = ev.target.closest("[data-lmode]"), al = ev.target.closest("[data-lall]"), pk = ev.target.closest("[data-lpick]");
      const sk = ev.target.closest("[data-lskip]");
      if (sk) { const u = unknownList[Number(sk.dataset.lskip)]; u.skip = !u.skip; u.open = false; redrawLearn(); return; }
      if (ev.target.closest("[data-lskipall]")) { unknownList.forEach((u) => { if (!u.pick) { u.skip = true; u.open = false; } }); redrawLearn(); return; }
      if (o) { const u = unknownList[Number(o.dataset.lopen)]; u.open = !u.open; if (!u.mode) u.mode = u.isl ? "buildings" : u.rarity ? "shards" : "items"; redrawLearn(); return; }
      if (md) { const [i, m] = md.dataset.lmode.split("|"); unknownList[Number(i)].mode = m; redrawLearn(); return; }
      if (al) { unknownList[Number(al.dataset.lall)].all = true; redrawLearn(); return; }
      if (!pk) return;
      const k = pk.dataset.lpick.indexOf("|"), u = unknownList[Number(pk.dataset.lpick.slice(0, k))];
      u.pick = pk.dataset.lpick.slice(k + 1); u.open = false;
      redrawLearn();
      if (u.amount === undefined) {
        try { u.amount = (await scanTileAmount(await scanWorker(), u.td)).value; } catch (e) { u.amount = null; }
        if (live() && modal.contains(learnBox)) redrawLearn();
      }
    };
    learnBox.addEventListener("change", (ev) => {
      const a = ev.target.closest("[data-lamt]");
      if (a) { const v = a.value.replace(/\D/g, ""); unknownList[Number(a.dataset.lamt)].amount = v ? Number(v) : null; }
    });
    const labIn = modal.querySelector("[data-scanlab]");
    if (labIn) labIn.addEventListener("change", () => { const v = labIn.value.replace(/\D/g, ""); if (v) lab.count = Number(v); });
    // Keep typed fixes if more screenshots are added.
    modal.querySelectorAll("[data-scanisl]").forEach((el) => el.addEventListener("change", () => {
      const r = islRes.get(el.dataset.scanisl), v = el.value.replace(/\D/g, "");
      r.value = v ? Number(v) : null; r.sure = true;
    }));
    modal.querySelectorAll("[data-scanval]").forEach((el) => el.addEventListener("change", () => {
      const r = results.get(el.dataset.scanval), v = el.value.replace(/\D/g, "");
      r.value = v ? Number(v) : null; r.sure = true;
    }));
    modal.querySelectorAll("[data-scangx]").forEach((el) => el.addEventListener("input", () => {
      const b = modal.querySelector(`[data-gotot="${window.CSS.escape(el.dataset.scangx)}"]`);
      if (b) b.textContent = goLine(Number(el.value.replace(/\D/g, "")) || 0, Number(b.dataset.goxp), Number(b.dataset.goes));
    }));
    const save = modal.querySelector("[data-scansave]");
    if (save) save.onclick = () => {
      const added = [];
      modal.querySelectorAll("[data-scantick]").forEach((tick) => {
        if (!tick.checked) return;
        const n = tick.dataset.scantick, v = modal.querySelector(`[data-scanval="${window.CSS.escape(n)}"]`).value.replace(/\D/g, "");
        if (v === "") return;
        if (Number(v)) bp[n] = Number(v); else delete bp[n];
        if (addable.has(n) && Number(v)) added.push(n);
      });
      // Hero gear for XP read from the Gear tab replaces what was saved.
      const gxTick = modal.querySelector("[data-scangxtick]");
      if (gxTick && gxTick.checked) {
        Object.keys(bp).forEach((k) => { if (GEAR_XP_RE.test(k) || GEAR_ORANGE_RE.test(k)) delete bp[k]; });
        modal.querySelectorAll("[data-scangx]").forEach((el) => { const v = Number(el.value.replace(/\D/g, "")) || 0; if (v > 0) bp[el.dataset.scangx] = v; });
      }
      // Not seen in the screenshots and left ticked: opened or used, now 0.
      modal.querySelectorAll("[data-scanzero]").forEach((tick) => { if (tick.checked) delete bp[tick.dataset.scanzero]; });
      // Taught tiles: their amounts, and Scan remembers their pictures.
      // Island Storehouse copies (ticked rows, then taught buildings) replace those buildings' "In Storehouse".
      const islSet = {};
      modal.querySelectorAll("[data-scanisltick]").forEach((tick) => {
        if (!tick.checked) return;
        const v = modal.querySelector(`[data-scanisl="${window.CSS.escape(tick.dataset.scanisltick)}"]`).value.replace(/\D/g, "");
        if (v !== "") islSet[tick.dataset.scanisltick] = Number(v);
      });
      const taught = unknownList.filter((u) => u.pick && !u.skip);
      const bldOf = (u) => (/^isl:/.test(u.pick) ? ((isl.bld && isl.bld.list) || []).find((b) => `isl:${b.id}` === u.pick) : null);
      taught.forEach((u) => {
        const b = bldOf(u);
        if (b) { if (u.amount != null && !u.placed) islSet[String(b.id)] = Number(u.amount); return; }
        if (Number(u.amount) > 0) { bp[u.pick] = Number(u.amount); if (!known.has(u.pick) && !added.includes(u.pick)) added.push(u.pick); }
      });
      const skippedTiles = unknownList.filter((u) => u.skip);
      const lesson = (u) => { const b = bldOf(u); return b ? { n: b.name, kind: "island", id: b.id, f: scanFeatToB64(u.feat), tab: "island" } : u.isl ? { n: u.pick, kind: "island", f: scanFeatToB64(u.feat), tab: "island" } : { n: u.pick, f: scanFeatToB64(u.feat), tab: u.tab, after: u.after, gap: u.gap }; };
      if (taught.length || skippedTiles.length) scanLearnedSave(taught.map(lesson)
        .concat(skippedTiles.map((u) => (u.isl ? { n: SCAN_SKIP, kind: "island", f: scanFeatToB64(u.feat), tab: "island" } : { n: SCAN_SKIP, f: scanFeatToB64(u.feat), tab: u.tab })))).catch((err) => toast(err.message || "Couldn't save", true));
      const lightSet = {};
      modal.querySelectorAll("[data-scanlighttick]").forEach((tick) => {
        const v = modal.querySelector(`[data-scanlight="${window.CSS.escape(tick.dataset.scanlighttick)}"]`).value.replace(/\D/g, "");
        if (tick.checked && v !== "") lightSet[tick.dataset.scanlighttick] = Number(v);
      });
      if (Object.keys(islSet).length || Object.keys(lightSet).length) scanIslStoreSave(islSet, lightSet);
      saveCalcState("backpack", bp);
      // Research Lab: only the game's weekly count, for this week (same key as the Lab page).
      const labTick = modal.querySelector("[data-scanlabtick]"), labV = labIn ? labIn.value.replace(/\D/g, "") : "";
      const labSave = !!(labTick && labTick.checked && labV !== "");
      if (labSave) {
        const game = { wk: rfcLabWeek(labSt()).wkKey, count: Number(labV), on: packDayKey(packStartOfToday()) };
        if (RFC_LAB_STATE) { RFC_LAB_STATE.game = game; saveCalcState("rfc_lab", RFC_LAB_STATE); }
        else { lab.saved = Object.assign({}, lab.saved || {}, { game }); saveCalcState("rfc_lab", lab.saved); if (RFC_LAB_RATE_ST) RFC_LAB_RATE_ST.game = game; }
      }
      budgetInvalidate(); // planner pages read these amounts
      close();
      if (added.length) more.added(added); else done();
      // The Backpack's Research Lab row shows the new count.
      if (labSave && document.getElementById("bpScan")) render();
    };
  };
  showStart();
}
