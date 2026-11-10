// WOS RST: the Backpack's Scan (reads game screenshots on the phone). Loaded by
// loadScanCode() in app.js the first time Scan is opened, after app.js, as a plain
// script: everything here can use app.js's functions and variables, and app.js
// reaches this file only through openBackpackScan() (the stub there calls
// openBackpackScanMain()). Keep it that way: anything another page uses belongs in
// app.js (SCAN_SIZE_COLORS, bpItemTab, SCAN_LEARNED, scanLearnedLoad …).
// Build id: checked by loadScanCode() (written by tools/stamp.js, don't edit).
window.SCAN_BUILD = "fbc3b6c82f";


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
// A purple / blue / green / grey gear tile's "+N" (top right; none = +0).
// Hero gear below Mythic counts as XP Component.
async function scanGearLevel(worker, td) {
  // The green "can upgrade" arrow at the top-right corner sits right after
  // the number ("+51" read as "+5") and with no number its light rim read as
  // "+4": its own pixels (and a 1 px rim) are blanked first; next to an arrow
  // only a number with its "+" counts, and it is marked "please check".
  const isArrow = (i) => td[i + 1] > 140 && td[i + 1] - td[i] > 50 && td[i + 1] - td[i + 2] > 50;
  const hit = [];
  for (let y = 0; y < 50; y++) for (let x = 95; x < 140; x++) if (isArrow((y * 140 + x) * 4)) hit.push(y * 140 + x);
  const arrow = hit.length >= 25;
  if (arrow) {
    td = new Uint8ClampedArray(td);
    hit.forEach((p) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const q = p + dy * 140 + dx; if (q >= 0 && q < 140 * 140) td[q * 4] = td[q * 4 + 1] = td[q * 4 + 2] = 0; } });
  }
  const lv = await scanGearLevelRead(worker, td);
  // Next to the arrow a number counts when all its digit shapes were read and
  // it has two digits or its "+" (a lone shape is the arrow's rim).
  if (arrow && lv.lvl !== null) return lv.lvl && lv.whole && (lv.plus || String(lv.lvl).length >= 2) ? { lvl: lv.lvl, sure: false } : { lvl: 0, sure: true };
  return { lvl: lv.lvl, sure: lv.sure };
}
async function scanGearLevelRead(worker, td) {
  const num = scanTextMask(td, 60, 2, 138, 50, true);
  if (!num) return { lvl: 0, sure: true };
  const r = await scanRead(worker, num, { tessedit_pageseg_mode: "7", tessedit_char_whitelist: "+0123456789" });
  let d = r.text.replace(/[^0-9]/g, "");
  // The "+" read as a digit ("480", "180"): drop it.
  if (d.length === 3 && Number(d) > 80) d = d.slice(1);
  const plus = r.text.includes("+");
  // A thin "1" lost beside the wide digits ("+51" read as "5"): put it back
  // at its shape, as the item amounts do.
  let fixed = false;
  if (num.thin && num.thin.some(Boolean) && d.length === num.thin.filter((x) => !x).length && d.length < num.count) {
    let k = 0; d = num.thin.map((x) => (x ? "1" : d[k++])).join(""); fixed = true;
  }
  if (d && (r.conf >= 50 || plus) && Number(d) <= 80) return { lvl: Number(d), sure: !fixed && (r.conf >= 70 || plus), plus, whole: d.length >= num.count };
  // One light shape read as nothing (or a stray digit): a bit of the gear's
  // picture in that corner, not a number (owner's screenshots: plain tiles).
  if (num.count <= 1) return { lvl: 0, sure: true };
  return { lvl: null, sure: false };
}
async function scanGearTiles(src, tiles, worker) {
  const t = scanCanvas(140, 140), tg = t.getContext("2d", { willReadFrequently: true });
  let badged = 0, orange = 0;
  const low = []; // pieces below Mythic: { colour, lvl, sure, n }
  const seq = []; // each gear tile's picture grid + orange, in reading order (to spot overlapping screenshots)
  const all = [];
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
    if (badge < 150) continue;
    // A light-blue tile is an item on the other tabs: it doesn't count towards
    // telling the Gear tab apart, but on the Gear tab it is a blue piece.
    const lightBlue = g > r + 30 && b > r + 60;
    if (!lightBlue) badged++;
    all.push({ td, r, g, b, lightBlue, box });
  }
  if (!(badged >= 3 && badged >= tiles.length * 0.6)) return null;
  // To find the same tile again in a scrolled screenshot, a second picture
  // (f2) is taken from one square size for every tile, anchored at the tile's
  // bottom-right corner and big enough to take in the troop badge at its
  // top-left: tile boxes sometimes take in that badge and sometimes not, and
  // then the same tile looked different (two screenshots' rows counted twice).
  const sides = all.map((a) => Math.max(a.box.w, a.box.h)).sort((x, y) => x - y);
  const side = Math.min(sides[sides.length - 1], sides[Math.floor(sides.length / 2)] * 1.15);
  const ft = scanCanvas(140, 140), fg = ft.getContext("2d", { willReadFrequently: true });
  const featOf = (box) => {
    fg.fillStyle = "#000"; fg.fillRect(0, 0, 140, 140);
    fg.drawImage(src, box.x + box.w - side, box.y + box.h - side, side, side, 0, 0, 140, 140);
    return scanTileFeature(fg.getImageData(0, 0, 140, 140).data);
  };
  for (const { td, r, g, b, lightBlue, box } of all) {
    const isOrange = !lightBlue && r > g + 25 && g > b + 25;
    if (isOrange) orange++;
    const colour = isOrange ? null : lightBlue ? "Blue"
      : b > g + 40 && r > g + 15 ? "Purple"
      : g > r + 30 && g > b + 20 ? "Green"
      : Math.max(r, g, b) - Math.min(r, g, b) < 25 ? "Grey" : null;
    let lo = null;
    if (colour && worker) {
      const lv = await scanGearLevel(worker, td);
      // Several pieces of one kind share a tile with their count bottom right ("2").
      let cnt = 1, sure = lv.sure;
      if (colour !== "Purple" && scanTextMask(td, 21, 87, 136, 136, true)) {
        const a = await scanTileAmount(worker, td);
        if (a.value > 1 && a.value < 1000) cnt = a.value;
        if (!a.sure) sure = false;
      }
      lo = { colour, lvl: lv.lvl, sure, n: cnt };
      low.push(lo);
    }
    seq.push({ f: scanTileFeature(td), f2: featOf(box), o: isOrange, lo });
  }
  return { orange, seq, low };
}
// Two Gear screenshots scrolled with some rows in both: how many orange
// pieces of the new one were already counted (the longest run of tiles at the
// end of one screenshot that matches the start of the other; a whole row at least).
function scanGearOverlap(prev, next) {
  const near = (a, b) => { let d = 0; for (let i = 0; i < a.length; i++) d += Math.abs(a[i] - b[i]); return d / a.length < 8; };
  const same = (a, b) => near(a.f, b.f) || (!!a.f2 && !!b.f2 && near(a.f2, b.f2));
  const run = (a, b) => {
    for (let k = Math.min(a.length, b.length); k >= 4; k--) {
      let ok = true;
      for (let i = 0; i < k && ok; i++) ok = same(a[a.length - k + i], b[i]);
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
  const near = (a, b) => { let d = 0; for (let i = 0; i < a.length; i++) d += Math.abs(a[i] - b[i]); return d / a.length < 8; };
  const same = (a, b) => near(a.f, b.f) || (!!a.f2 && !!b.f2 && near(a.f2, b.f2));
  const run = (a, b) => {
    for (let k = Math.min(a.length, b.length); k >= 4; k--) {
      let ok = true;
      for (let i = 0; i < k && ok; i++) ok = same(a[a.length - k + i], b[i]);
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

// The game's "My Island" screen: a green Life Essence crystal at the top right
// with the amount beside it (then a green "+"), and "My Island" at the top left.
// The island coins (gold hexagon) are not tracked. Returns null when it isn't
// that screen (the green crystal is looked for before any reading).
async function scanIslandShot(worker, src) {
  const W = src.width, H = src.height, bh = Math.round(H * 0.08);
  if (W < 100 || bh < 20) return null;
  const c = scanCanvas(W, bh), g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(src, 0, 0, W, bh, 0, 0, W, bh);
  const d = g.getImageData(0, 0, W, bh).data;
  const green = (i) => d[i + 1] > 120 && d[i + 1] - d[i] > 70 && d[i + 1] - d[i + 2] > 50;
  // Green clusters across the right half of the top band.
  const cols = [];
  for (let x = 0; x < W; x++) {
    let n = 0;
    if (x >= W * 0.5) for (let y = 0; y < bh; y++) if (green((y * W + x) * 4)) n++;
    cols.push(n);
  }
  const segs = [], gap = Math.max(2, Math.round(W * 0.01));
  cols.forEach((n, x) => {
    if (n < 2) return;
    const last = segs[segs.length - 1];
    if (last && x - last.b <= gap) { last.b = x; last.n += n; } else segs.push({ a: x, b: x, n });
  });
  const crys = segs.find((sg) => sg.b - sg.a >= W * 0.015 && sg.n >= W * 0.015 * bh * 0.15);
  if (!crys) return null;
  // The crystal's rows: the longest run of rows with green in its columns
  // (bushes lower down the band are another run).
  let y0 = 0, y1 = -1, ra = -1;
  const need = Math.max(2, Math.round((crys.b - crys.a + 1) * 0.1));
  for (let y = 0; y <= bh; y++) {
    let n = 0;
    if (y < bh) for (let x = crys.a; x <= crys.b; x++) if (green((y * W + x) * 4)) n++;
    if (n >= need) { if (ra < 0) ra = y; }
    else if (ra >= 0) { if (y - 1 - ra > y1 - y0) { y0 = ra; y1 = y - 1; } ra = -1; }
  }
  if (y1 - y0 < bh * 0.15) return null;
  const pad = Math.round((y1 - y0) * 0.3), ty0 = Math.max(0, y0 - pad), ty1 = Math.min(bh, y1 + pad + 1), th = ty1 - ty0;
  // The title on the left of the same row.
  const tc = scanCanvas(Math.round(W * 0.5), th);
  tc.getContext("2d").drawImage(c, 0, ty0, tc.width, th, 0, 0, tc.width, th);
  const title = (await scanRead(worker, tc, { tessedit_pageseg_mode: "6" })).text;
  if (!/island/i.test(title)) return null;
  // The amount: the white digits between the crystal and the next green (the "+").
  // (small green specks between them, e.g. the digits' edges, are passed over)
  const nxt = segs.find((sg) => sg.a > crys.b + gap && sg.n >= crys.n * 0.25);
  const x0 = crys.b + 1, x1 = nxt ? nxt.a : W, nw = x1 - x0;
  let value = null;
  if (nw > 4) {
    const white = (i) => { const mn = Math.min(d[i], d[i + 1], d[i + 2]), mx = Math.max(d[i], d[i + 1], d[i + 2]); return mn > 170 && mx - mn < 60; };
    const rowOn = (y) => { let n = 0; for (let x = x0; x < x1; x++) if (white((y * W + x) * 4)) n++; return n >= 2; };
    // The digits' own rows: from the crystal's middle up and down while rows hold white.
    let ra = Math.round((y0 + y1) / 2), rb = ra;
    while (ra > 0 && (rowOn(ra - 1) || (ra > 1 && rowOn(ra - 2)))) ra--;
    while (rb < bh - 1 && (rowOn(rb + 1) || (rb < bh - 2 && rowOn(rb + 2)))) rb++;
    const p2 = 3, cy0 = Math.max(0, ra - p2), ch = Math.min(bh, rb + p2 + 1) - cy0, k = 3;
    const nc = scanCanvas(nw * k + 30, ch * k + 30), ng = nc.getContext("2d", { willReadFrequently: true });
    ng.fillStyle = "#000"; ng.fillRect(0, 0, nc.width, nc.height);
    ng.imageSmoothingEnabled = true;
    ng.drawImage(c, x0, cy0, nw, ch, 15, 15, nw * k, ch * k);
    const out = ng.getImageData(0, 0, nc.width, nc.height), o = out.data;
    for (let i = 0; i < o.length; i += 4) {
      const mn = Math.min(o[i], o[i + 1], o[i + 2]), mx = Math.max(o[i], o[i + 1], o[i + 2]);
      o[i] = o[i + 1] = o[i + 2] = mn > 150 && mx - mn < 70 ? 0 : 255;
    }
    ng.putImageData(out, 0, 0);
    const t = (await scanRead(worker, nc, { tessedit_pageseg_mode: "7", tessedit_char_whitelist: "0123456789," })).text.replace(/\s/g, "");
    if (/^\d{1,3}(,\d{3})*$/.test(t) || /^\d+$/.test(t)) value = Number(t.replace(/,/g, ""));
  }
  return { kind: "island", items: [{ name: "Life Essence", value, sure: false }] };
}

async function scanShot(worker, file, marks, refs) {
  const src = await createImageBitmap(file);
  const lab = await scanLabShot(worker, src);
  if (lab) return lab;
  const island = await scanIslandShot(worker, src);
  if (island) return island;
  const tiles = scanFindTiles(src);
  if (tiles.length) {
    const gear = await scanGearTiles(src, tiles, worker);
    if (gear !== null) return { kind: "gear", items: [{ name: "Mythic Gear", part: "gear", value: gear.orange, seq: gear.seq, low: gear.low, sure: false }] };
    // Learned item pictures first (quick); speedup tiles match none of them.
    const known = await scanItemTiles(worker, src, tiles, refs);
    if (known.found.length) return { kind: "items", items: known.found, unknown: known.unknown, unk: known.unk, seq: known.seq };
    const items = await scanSpeedTiles(worker, src, tiles, marks);
    if (items.length) return { kind: "speedup", items };
  }
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
function openBackpackScanMain(groups, bp, done, more) {
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
  const results = new Map(); // name -> { value, sure }
  const notes = new Set();
  const skipped = new Set();
  // Everything seen in the screenshots, and which kinds of tiles were read:
  // items with an amount that weren't seen (opened chests, used items) are
  // offered as "set to 0".
  const seen = new Set();
  let sawItems = false, sawSpeed = false, sawIsland = false;
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
  const picker = () => {
    const input = document.createElement("input");
    input.type = "file"; input.accept = "image/*"; input.multiple = true;
    input.onchange = () => { if (input.files.length) readAll([...input.files]); };
    input.click();
  };
  const showStart = () => {
    modal.innerHTML = `<div class="modal-box" style="max-width:480px;">
      <h2 style="margin:0 0 4px; font-size:16px;">&#128247; ${esc(t("scan_title"))}</h2>
      <p class="desc" style="margin:0 0 12px;">${esc(t("scan_intro"))}</p>
      ${[["summary", "scan_summary", "scan_summary_hint"], ["speedup", "scan_speedup", "scan_speedup_hint"], ["items", "scan_items", "scan_items_hint"], ["lab", "scan_lab", "scan_lab_hint"]].map(([ex, head, hint], i) => `
      <div class="scan-step"><b>${i + 1}</b><div><div>${esc(t(head))}</div><div class="meta">${esc(t(hint))}</div></div>
        <button type="button" class="scan-ex" data-scanex="icons/scan-ex-${ex}.jpg" aria-label="${esc(t("scan_example"))}"><img src="icons/scan-ex-${ex}.jpg" alt="" loading="lazy" /><span>&#128269;</span></button></div>`).join("")}
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
      try { shot = await scanShot(worker, files[i], marks, refs); } catch (e) { shot = { kind: "unknown", items: [] }; }
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
      if (shot.kind === "island") sawIsland = true;
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
            (it.low || []).forEach((lo) => addLow(lo, lo.n || 1));
            dup.forEach((x) => { if (x.lo) addLow(x.lo, -(x.lo.n || 1)); });
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
    const tabsRead = [rng.res && "scan_tab_res", rng.other && "scan_tab_other", sawSpeed && "scan_tab_speed", mgParts.gear !== null && "scan_tab_gear", lab.seen && "scan_tab_lab", sawIsland && "scan_tab_island"].filter(Boolean).map((k) => t(k));
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
      if (known.has(n)) return materialDisplayName(known.get(n).name);
      const m = / (Shards|Widgets)$/.exec(n), hero = n.replace(/ (Shards|Widgets)$/, "");
      return m ? `${dataName(hero)} — ${t(m[1] === "Shards" ? "backpack_hero_shards" : "scan_learn_widgets")}` : n;
    };
    const learnModes = ["shards", "widgets", "items"];
    const learnPicker = (u, i) => {
      const r = u.mode === "widgets" ? "Legendary" : u.all ? null : u.rarity;
      const cells = u.mode === "items"
        ? [...known.values()].filter((it) => !/speedup/i.test(it.name) && scanItemTab(it.name) === u.tab && !SCAN_SUMMARY_ROWS.some(([, n]) => n === it.name)).map((it) => [it.name, bpIcon(it), materialDisplayName(itemShortName(it.name))])
        : heroList.filter((h) => !r || h.rarity === r).sort((a, b) => (Number(b.generation) || 0) - (Number(a.generation) || 0) || String(a.name).localeCompare(String(b.name)))
          .map((h) => [`${h.name} ${u.mode === "widgets" ? "Widgets" : "Shards"}`, h.image_url || "", dataName(h.name)]);
      return `<div class="scan-lpick">
        ${learnModes.length > 1 ? `<div class="scan-lchips">${learnModes.map((m) => `<button type="button" class="scan-lchip${u.mode === m ? " on" : ""}" data-lmode="${i}|${m}">${esc(t("scan_learn_" + m))}</button>`).join("")}</div>` : ""}
        <div class="scan-lgrid">${cells.map(([n, ic, lab]) => `<button type="button" class="scan-lg${u.pick === n ? " on" : ""}" data-lpick="${i}|${esc(n)}" title="${esc(lab)}">${ic ? `<img src="${esc(ic)}" alt="" loading="lazy" />` : `<i>${esc(String(lab).charAt(0))}</i>`}<span>${esc(lab)}</span></button>`).join("") || `<div class="meta">—</div>`}</div>
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
    // Hero gear below Mythic for XP read from the Gear tab (purple first, then blue, green, grey).
    const gxRank = (c) => GEAR_XP_COLOURS.findIndex((x) => x.key === c);
    const gxRows = gearLow ? gearXpOf(gearLow).rows.sort((a, b) => gxRank(a.colour) - gxRank(b.colour) || b.lvl - a.lvl) : [];
    const gearHtml = gearLow === null ? "" : `<div class="scan-row unsure" style="display:block;">
      <label style="display:flex; align-items:center; gap:8px;"><input type="checkbox" data-scangxtick checked /><b>${esc(t("gx_title"))}</b><em class="meta" style="font-size:11.5px;">${esc(t("scan_please_check"))}</em></label>
      <div class="meta" style="font-size:11.5px; margin:2px 0 4px;">${esc(t("scan_gx_hint"))}</div>
      ${gxRows.map((r) => `<div class="gx-line"><span class="gx-lv">+${r.lvl}</span><span class="meta" style="font-size:12px;">${esc(t("gx_" + r.colour))} · ${esc(t("gx_each").replace("{n}", r.each.toLocaleString()))}</span>
        <input type="text" inputmode="numeric" data-scangx="${esc(r.key)}" value="${r.n}" style="margin-inline-start:auto;" /></div>`).join("") || `<div class="meta" style="font-size:12px;">0</div>`}
      ${gearLowUnread ? `<div class="meta" style="font-size:11.5px; margin-top:4px;">&#9888; ${esc(t("scan_gx_unread").replace("{n}", gearLowUnread))}</div>` : ""}
      <div class="gx-sum" style="margin-top:6px;">&rarr; <b>${esc(t("gx_xp").replace("{n}", gearXpOf(gearLow).xp.toLocaleString()))}</b> (${esc(t("gx_pieces").replace("{n}", gearXpOf(gearLow).pieces.toLocaleString()))})</div>
    </div>`;
    const info = [unsure ? t("scan_flagged").replace("{n}", unsure) : "", ...notes, unknownTiles > unknownList.length ? t("scan_unknown_tiles").replace("{n}", unknownTiles - unknownList.length) : "", skipped.size ? t("scan_skipped").replace("{list}", [...skipped].join(", ")) : ""].filter(Boolean);
    modal.innerHTML = `<div class="modal-box" style="max-width:520px; max-height:86vh; overflow-y:auto;">
      <h2 style="margin:0 0 4px; font-size:16px;">${esc(t("scan_check_title"))}</h2>
      <p class="desc" style="margin:0 0 8px;">${esc(names.length || labHtml ? t("scan_check_desc") : t("scan_nothing"))}</p>
      ${info.map((x) => `<div class="meta" style="font-size:12px; margin-bottom:4px;">&#9888; ${esc(x)}</div>`).join("")}
      ${labHtml}
      ${labHtml && rows ? `<div class="scan-lab-h">${esc(t("scan_lab_items"))}</div>` : ""}
      <div style="margin-top:6px;">${rows}</div>
      ${gearHtml}
      ${tabsRead.length ? `<div class="meta scan-tabs">${esc(t("scan_tabs_read").replace("{list}", tabsRead.join(" · ")))}</div>` : ""}
      ${zeroRows ? `<div class="scan-zero-head"><b>${esc(t("scan_zero_title"))}</b><div class="meta">${esc(t("scan_zero_hint"))}</div></div>${zeroRows}` : ""}
      <div id="scanLearn">${learnHtml(false)}</div>
      <div style="display:flex; gap:8px; justify-content:flex-end; flex-wrap:wrap; margin-top:12px;">
        <button class="btn ghost" type="button" data-scanclose>${esc(t("cancel"))}</button>
        <button class="btn ghost" type="button" data-scanpick>${esc(t("scan_add_more"))}</button>
        ${names.length || zeroRows || unknownList.length || gearLow || labHtml ? `<button class="btn" type="button" data-scansave>${esc(t("save"))}</button>` : ""}
      </div></div>`;
    modal.querySelector("[data-scanclose]").onclick = close;
    modal.querySelector("[data-scanpick]").onclick = picker;
    const learnBox = modal.querySelector("#scanLearn");
    const redrawLearn = () => { const d = learnBox.querySelector("details"); learnBox.innerHTML = learnHtml(!d || d.open); };
    learnBox.onclick = async (ev) => {
      const o = ev.target.closest("[data-lopen]"), md = ev.target.closest("[data-lmode]"), al = ev.target.closest("[data-lall]"), pk = ev.target.closest("[data-lpick]");
      const sk = ev.target.closest("[data-lskip]");
      if (sk) { const u = unknownList[Number(sk.dataset.lskip)]; u.skip = !u.skip; u.open = false; redrawLearn(); return; }
      if (ev.target.closest("[data-lskipall]")) { unknownList.forEach((u) => { if (!u.pick) { u.skip = true; u.open = false; } }); redrawLearn(); return; }
      if (o) { const u = unknownList[Number(o.dataset.lopen)]; u.open = !u.open; if (!u.mode) u.mode = u.rarity ? "shards" : "items"; redrawLearn(); return; }
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
    modal.querySelectorAll("[data-scanval]").forEach((el) => el.addEventListener("change", () => {
      const r = results.get(el.dataset.scanval), v = el.value.replace(/\D/g, "");
      r.value = v ? Number(v) : null; r.sure = true;
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
        Object.keys(bp).forEach((k) => { if (GEAR_XP_RE.test(k)) delete bp[k]; });
        modal.querySelectorAll("[data-scangx]").forEach((el) => { const v = Number(el.value.replace(/\D/g, "")) || 0; if (v > 0) bp[el.dataset.scangx] = v; });
      }
      // Not seen in the screenshots and left ticked: opened or used, now 0.
      modal.querySelectorAll("[data-scanzero]").forEach((tick) => { if (tick.checked) delete bp[tick.dataset.scanzero]; });
      // Taught tiles: their amounts, and Scan remembers their pictures.
      const taught = unknownList.filter((u) => u.pick && !u.skip);
      taught.forEach((u) => { if (Number(u.amount) > 0) { bp[u.pick] = Number(u.amount); if (!known.has(u.pick) && !added.includes(u.pick)) added.push(u.pick); } });
      const skippedTiles = unknownList.filter((u) => u.skip);
      if (taught.length || skippedTiles.length) scanLearnedSave(taught.map((u) => ({ n: u.pick, f: scanFeatToB64(u.feat), tab: u.tab, after: u.after, gap: u.gap }))
        .concat(skippedTiles.map((u) => ({ n: SCAN_SKIP, f: scanFeatToB64(u.feat), tab: u.tab })))).catch((err) => toast(err.message || "Couldn't save", true));
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
