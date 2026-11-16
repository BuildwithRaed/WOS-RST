// WOS RST: the Backpack's Scan (reads game screenshots on the phone). Loaded by
// loadScanCode() in app.js the first time Scan is opened, after app.js, as a plain
// script: everything here can use app.js's functions and variables, and app.js
// reaches this file only through openBackpackScan() (the stub there calls
// openBackpackScanMain()). Keep it that way: anything another page uses belongs in
// app.js (SCAN_SIZE_COLORS, bpItemTab, SCAN_LEARNED, scanLearnedLoad …).
// Build id: checked by loadScanCode() (written by tools/stamp.js, don't edit).
window.SCAN_BUILD = "fff9346477";


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
async function scanGearLevel(worker, td) {
  const num = scanTextMask(td, 60, 2, 138, 50, true);
  if (!num) return { lvl: 0, sure: true };
  const r = await scanRead(worker, num, { tessedit_pageseg_mode: "7", tessedit_char_whitelist: "+0123456789" });
  let d = r.text.replace(/[^0-9]/g, "");
  // The "+" read as a digit ("480", "180"): drop it.
  if (d.length === 3 && Number(d) > 80) d = d.slice(1);
  const plus = r.text.includes("+");
  if (d && (r.conf >= 50 || plus) && Number(d) <= 80) return { lvl: Number(d), sure: r.conf >= 70 || plus };
  // One light shape read as nothing (or a stray digit): a bit of the gear's
  // picture in that corner, not a number (owner's screenshots: plain tiles).
  if (num.count <= 1) return { lvl: 0, sure: true };
  return { lvl: null, sure: false };
}
async function scanGearTiles(src, tiles, worker) {
  const t = scanCanvas(140, 140), tg = t.getContext("2d", { willReadFrequently: true });
  let badged = 0, orange = 0;
  const low = []; // purple pieces: { colour, lvl, sure }
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
    seq.push({ f: scanTileFeature(td), o: isOrange, lo });
  }
  return badged >= 3 && badged >= tiles.length * 0.6 ? { orange, seq, low } : null;
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
    if (gear !== null) return { kind: "gear", items: [{ name: "Mythic Gear", part: "gear", value: gear.orange, seq: gear.seq, low: gear.low, sure: false }] };
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
    const gxRows = gearLow ? gearXpOf(gearLow).rows.sort((a, b) => b.lvl - a.lvl) : [];
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


// =====================================================================
// ---- Scan pack: fill a pack table from a game screenshot ----
// (Packs page "📷 Scan pack" / a pack window's "Fill from screenshot", and
// My packs for visitors' own packs.) Same reader as the Backpack's Scan, all
// on the phone. openPackScanMain(opts) is called by openPackScan() in app.js.
// Kept in its own block so it merges apart from the Backpack Scan above.
// =====================================================================
const SCAN_PK_W = 1248; // screenshots are worked on at this width (the game's tiles are ~120 px then)

// The screenshot at the working width, with its pixels.
function scanPkImage(src) {
  const k = SCAN_PK_W / src.width, w = SCAN_PK_W, h = Math.max(1, Math.round(src.height * k));
  const c = scanCanvas(w, h), g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(src, 0, 0, w, h);
  return { c, w, h, d: g.getImageData(0, 0, w, h).data };
}

// Item tiles: each has a rounded frame drawn as a closed outline, so the
// outline (with the picture inside joined to it) is one patch of strong
// colour edges whose box is a square. Worked out on a 520 px copy.
function scanPkEdges(img) {
  const s = 520 / img.w, w = 520, h = Math.round(img.h * s), W = img.w, d = img.d;
  const R = new Float32Array(w * h), G = new Float32Array(w * h), B = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const sy = Math.floor(y / s), ey = Math.max(sy + 1, Math.min(img.h, Math.floor((y + 1) / s)));
    for (let x = 0; x < w; x++) {
      const sx = Math.floor(x / s), ex = Math.max(sx + 1, Math.min(W, Math.floor((x + 1) / s)));
      let r = 0, g = 0, b = 0, c = 0;
      for (let yy = sy; yy < ey; yy++) for (let xx = sx; xx < ex; xx++) { const i = (yy * W + xx) * 4; r += d[i]; g += d[i + 1]; b += d[i + 2]; c++; }
      R[y * w + x] = r / c; G[y * w + x] = g / c; B[y * w + x] = b / c;
    }
  }
  const mask = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    let m = 0;
    for (const A of [R, G, B]) { const v = Math.abs(A[y * w + x + 1] - A[y * w + x - 1]) + Math.abs(A[(y + 1) * w + x] - A[(y - 1) * w + x]); if (v > m) m = v; }
    mask[y * w + x] = m > 40 ? 1 : 0;
  }
  return { mask, w, h, s };
}
// How much of a box's four sides lies on edges (0–1 for the weakest side).
function scanPkFrame(E, b) {
  const x0 = Math.round(b.x * E.s), y0 = Math.round(b.y * E.s), x1 = Math.round((b.x + b.w) * E.s) - 1, y1 = Math.round((b.y + b.h) * E.s) - 1;
  if (x0 < 1 || y0 < 1 || x1 >= E.w - 1 || y1 >= E.h - 1) return 0;
  const hit = (x, y) => { for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < E.w && yy < E.h && E.mask[yy * E.w + xx]) return 1; } return 0; };
  const side = (pts) => pts.reduce((a, p) => a + hit(p[0], p[1]), 0) / pts.length;
  const xs = [], ys = [];
  // the corners are rounded: only the middle 70% of each side counts
  for (let x = x0 + Math.round((x1 - x0) * 0.15); x <= x1 - Math.round((x1 - x0) * 0.15); x++) xs.push(x);
  for (let y = y0 + Math.round((y1 - y0) * 0.15); y <= y1 - Math.round((y1 - y0) * 0.15); y++) ys.push(y);
  return Math.min(side(xs.map((x) => [x, y0])), side(xs.map((x) => [x, y1])), side(ys.map((y) => [x0, y])), side(ys.map((y) => [x1, y])));
}
function scanPkFindTiles(img) {
  const E = scanPkEdges(img), w = E.w;
  let boxes = scanBlobs(E.mask, E.w, E.h, true).filter((b) => b.w >= w * 0.045 && b.w <= w * 0.17 && b.w / b.h > 0.8 && b.w / b.h < 1.25).filter((b) => {
    const side = [0, 0, 0, 0];
    b.px.forEach((p) => { const x = p % w, y = (p - x) / w; if (x - b.x <= 2) side[0]++; if (b.x + b.w - 1 - x <= 2) side[1]++; if (y - b.y <= 2) side[2]++; if (b.y + b.h - 1 - y <= 2) side[3]++; });
    return Math.min(side[0] / b.h, side[1] / b.h, side[2] / b.w, side[3] / b.w) >= 0.9;
  }).map((b) => ({ x: b.x / E.s, y: b.y / E.s, w: b.w / E.s, h: b.h / E.s }));
  // a box inside another one is part of that tile
  boxes = boxes.filter((b) => !boxes.some((o) => o !== b && o.w > b.w && b.x >= o.x - 2 && b.y >= o.y - 2 && b.x + b.w <= o.x + o.w + 2 && b.y + b.h <= o.y + o.h + 2));
  // Rows: tiles of one size side by side. A tile whose outline joined
  // something next to it (a picture touching it) is found by stepping along
  // its row by the row's spacing and checking the frame is there.
  const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const rows = [];
  boxes.slice().sort((a, b) => a.x - b.x).forEach((b) => {
    const r = rows.find((r) => Math.abs(r.y - b.y) < b.h * 0.25 && Math.abs(r.sz - b.w) < b.w * 0.15);
    if (r) r.list.push(b); else rows.push({ y: b.y, sz: b.w, list: [b] });
  });
  rows.forEach((r) => {
    const gaps = [];
    for (let i = 1; i < r.list.length; i++) gaps.push(r.list[i].x - r.list[i - 1].x);
    const ok = gaps.filter((g) => g < r.sz * 1.6).sort((a, b) => a - b);
    const pitch = ok.length ? ok[Math.floor(ok.length / 2)] : r.sz * 1.12;
    const h = r.list.reduce((a, b) => a + b.h, 0) / r.list.length;
    for (const dir of [-1, 1]) {
      let from = dir < 0 ? r.list[0] : r.list[r.list.length - 1];
      for (let k = 0; k < 8; k++) {
        const c = { x: from.x + dir * pitch, y: from.y, w: from.w, h };
        if (c.x < 0 || c.x + c.w > img.w || boxes.some((o) => overlaps(o, c))) break;
        if (scanPkFrame(E, c) < 0.6) break;
        boxes.push(c); from = c;
      }
    }
  });
  // Tiles on a busy panel (their outline joins the panel's own edges) are
  // found by sliding a square of each size already seen over the picture and
  // keeping the places where all four sides lie on edges.
  const sizes = [];
  boxes.forEach((b) => { if (!sizes.some((z) => Math.abs(z - b.w) < b.w * 0.08)) sizes.push(b.w); });
  if (sizes.length) {
    const dil = new Uint8Array(E.w * E.h);
    for (let y = 0; y < E.h; y++) for (let x = 0; x < E.w; x++) {
      if (!E.mask[y * E.w + x]) continue;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < E.w && yy < E.h) dil[yy * E.w + xx] = 1; }
    }
    // running sums along rows and columns: a side's coverage in O(1)
    const rowS = new Uint32Array((E.w + 1) * E.h), colS = new Uint32Array(E.w * (E.h + 1));
    for (let y = 0; y < E.h; y++) for (let x = 0; x < E.w; x++) { rowS[y * (E.w + 1) + x + 1] = rowS[y * (E.w + 1) + x] + dil[y * E.w + x]; colS[(y + 1) * E.w + x] = colS[y * E.w + x] + dil[y * E.w + x]; }
    const hRun = (y, x0, x1) => (rowS[y * (E.w + 1) + x1 + 1] - rowS[y * (E.w + 1) + x0]) / (x1 - x0 + 1);
    const vRun = (x, y0, y1) => (colS[(y1 + 1) * E.w + x] - colS[y0 * E.w + x]) / (y1 - y0 + 1);
    const found = [];
    sizes.forEach((sz) => {
      const S = Math.round(sz * E.s), m = Math.round(S * 0.15), cands = [];
      for (let y = 1; y + S < E.h - 1; y++) for (let x = 1; x + S < E.w - 1; x++) {
        const sc = Math.min(hRun(y, x + m, x + S - 1 - m), hRun(y + S - 1, x + m, x + S - 1 - m), vRun(x, y + m, y + S - 1 - m), vRun(x + S - 1, y + m, y + S - 1 - m));
        if (sc < 0.9) continue;
        // inside the frame the tile is mostly smooth fill; busy art is edges all over
        const ring = (hRun(y + Math.round(S * 0.08), x + m, x + S - 1 - m) + vRun(x + Math.round(S * 0.08), y + m, y + S - 1 - m) + vRun(x + S - 1 - Math.round(S * 0.08), y + m, y + S - 1 - m)) / 3;
        if (ring > 0.55) continue;
        cands.push({ x, y, S, sc: sc - ring * 0.2 });
      }
      cands.sort((a, b) => b.sc - a.sc);
      cands.forEach((c) => {
        const b = { x: c.x / E.s, y: c.y / E.s, w: c.S / E.s, h: c.S / E.s };
        const pad = b.w * 0.2;
        if (boxes.concat(found).some((o) => b.x < o.x + o.w - pad && o.x < b.x + b.w - pad && b.y < o.y + o.h - pad && o.y < b.y + b.h - pad)) return;
        found.push(b);
      });
    });
    found.forEach((b) => boxes.push(b));
  }
  boxes.sort((a, b) => (Math.abs(a.y - b.y) < a.h / 2 ? a.x - b.x : a.y - b.y));
  return boxes;
}

// Text lines of the whole screenshot ({ text, x, y, w, h }). Two reads: the
// game's white outlined text (titles, prices, gems, tile labels) as black on
// white, and the plain picture (dark text on light lists and pop-ups).
async function scanPkText(worker, img) {
  const lines = (r) => {
    const out = [];
    (r.data.blocks || []).forEach((b) => (b.paragraphs || []).forEach((p) => (p.lines || []).forEach((l) => {
      const text = String(l.text || "").replace(/\s+/g, " ").trim();
      if (text) out.push({ text, x: l.bbox.x0, y: l.bbox.y0, w: l.bbox.x1 - l.bbox.x0, h: l.bbox.y1 - l.bbox.y0, conf: l.confidence || 0 });
    })));
    return out;
  };
  const c = scanCanvas(img.w, img.h), g = c.getContext("2d"), id = g.createImageData(img.w, img.h), d = img.d, o = id.data;
  for (let i = 0; i < img.w * img.h; i++) {
    const r = d[i * 4], gg = d[i * 4 + 1], b = d[i * 4 + 2];
    const v = (r + gg + b) / 3 > 200 && Math.max(r, gg, b) - Math.min(r, gg, b) < 60 ? 0 : 255;
    o[i * 4] = o[i * 4 + 1] = o[i * 4 + 2] = v; o[i * 4 + 3] = 255;
  }
  g.putImageData(id, 0, 0);
  await worker.setParameters({ tessedit_pageseg_mode: "11", tessedit_char_whitelist: "" });
  const white = lines(await worker.recognize(c, {}, { blocks: true, text: true }));
  const plain = lines(await worker.recognize(img.c, {}, { blocks: true, text: true }));
  return { white, plain };
}
const SCAN_PK_CUR = () => (typeof PACK_CURRENCIES !== "undefined" ? PACK_CURRENCIES.map((c) => c.code) : ["USD", "QAR", "SAR", "AED", "EUR", "GBP"]);
// Prices: a line naming a currency ("QAR 17.99", "US$4.99", "$4.99"), and the
// game's orange buy buttons; each is read again on its own (the first read
// often cuts the last digit). Store prices end in .99 almost always.
async function scanPkReadPrice(worker, img, x0, y0, x1, y1, codes) {
  x0 = Math.max(0, Math.round(x0)); y0 = Math.max(0, Math.round(y0)); x1 = Math.min(img.w, Math.round(x1)); y1 = Math.min(img.h, Math.round(y1));
  for (const th of [200, 170]) {
    const cw = x1 - x0, ch = y1 - y0;
    if (cw < 10 || ch < 6) return null;
    const k = 2, c = scanCanvas(cw * k + 32, ch * k + 32), g = c.getContext("2d");
    g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.fillStyle = "#000";
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      const i = ((y0 + y) * img.w + x0 + x) * 4, r = img.d[i], gg = img.d[i + 1], b = img.d[i + 2];
      if ((r + gg + b) / 3 > th && Math.max(r, gg, b) - Math.min(r, gg, b) < 70) g.fillRect(16 + x * k, 16 + y * k, k, k);
    }
    const tx = (await scanRead(worker, c, { tessedit_pageseg_mode: "7", tessedit_char_whitelist: `${codes.join("")}US$0123456789., ` })).text.replace(/\s/g, "");
    const nm = /(\d{1,4})[.,](\d{1,2})/.exec(tx);
    if (!nm) continue;
    const cm = new RegExp(`(${codes.join("|")})`, "i").exec(tx);
    return { value: scanPkCents(nm[1], nm[2]), cur: cm ? cm[1].toUpperCase() : /\$/.test(tx) ? "USD" : null };
  }
  return null;
}
function scanPkCents(whole, cents) {
  let c = String(cents);
  if (c.length === 1) c += "9";
  if (c !== "99" && (c[1] === "9" || c[0] === "9")) c = "99";
  return Number(`${whole}.${c}`);
}
// The orange buy buttons: wide rounded bars of the game's orange-yellow.
function scanPkButtons(img) {
  const s = 312 / img.w, w = 312, h = Math.round(img.h * s), mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (Math.floor(y / s) * img.w + Math.floor(x / s)) * 4, r = img.d[i], g = img.d[i + 1], b = img.d[i + 2];
    mask[y * w + x] = r > 215 && g > 130 && g < 215 && b < 100 && r - g > 30 ? 1 : 0;
  }
  return scanBlobs(mask, w, h).filter((b) => b.w >= w * 0.15 && b.w <= w * 0.5 && b.h >= w * 0.03 && b.h <= w * 0.1 && b.w / b.h >= 1.8 && b.n > b.w * b.h * 0.45)
    .map((b) => ({ x: b.x / s, y: b.y / s, w: b.w / s, h: b.h / s }));
}
async function scanPkPrices(worker, img, text) {
  const codes = SCAN_PK_CUR(), re = new RegExp(`\\b(${codes.join("|")})\\b|US\\$|\\$\\s*\\d`, "i");
  const found = [];
  const near = (x, y) => found.some((p) => Math.abs(p.cx - x) < 140 && Math.abs(p.cy - y) < 40);
  for (const l of text.white.concat(text.plain)) {
    if (!re.test(l.text) || /remaining|limit/i.test(l.text) || near(l.x + l.w / 2, l.y + l.h / 2)) continue;
    const m = re.exec(l.text);
    let got = await scanPkReadPrice(worker, img, l.x - 20, l.y - l.h * 0.35, l.x + l.w * 1.45 + 30, l.y + l.h * 1.35, codes);
    if (!got) { const nm = /(\d{1,4})[.,:](\d{1,2})/.exec(l.text.replace(/\s/g, "")); if (nm) got = { value: scanPkCents(nm[1], nm[2]), cur: null }; }
    if (!got || !(got.value > 0)) continue;
    found.push({ cur: got.cur || (m[1] || "USD").toUpperCase(), value: got.value, x: l.x, y: l.y, w: l.w, h: l.h, cy: l.y + l.h / 2, cx: l.x + l.w / 2 });
  }
  for (const b of scanPkButtons(img)) {
    if (near(b.x + b.w / 2, b.y + b.h / 2)) continue;
    const got = await scanPkReadPrice(worker, img, b.x + b.w * 0.06, b.y + b.h * 0.12, b.x + b.w * 0.94, b.y + b.h * 0.88, codes);
    if (!got || !(got.value > 0) || !got.cur) continue;
    found.push({ cur: got.cur, value: got.value, x: b.x, y: b.y, w: b.w, h: b.h, cy: b.y + b.h / 2, cx: b.x + b.w / 2 });
  }
  // a crossed-out old price ("QAR 22.99" over the real one) sits just above another price
  return found.filter((p) => !found.some((q) => q !== p && Math.abs(q.cx - p.cx) < 140 && q.y > p.y && q.y - p.y < p.h * 1.6));
}
// A store price back to its US $ step: the site's own store prices first,
// then the exchange rate. { usd, sure }.
function scanPkUsd(value, cur) {
  if (!(value > 0)) return { usd: null, sure: false };
  if (!cur || cur === "USD") return { usd: value, sure: true };
  const slots = (typeof currencyPriceSlots === "function" ? currencyPriceSlots() : ["0.99", "1.99", "2.99", "4.99", "9.99", "19.99", "49.99", "99.99"]).map(Number);
  const rate = typeof currencyRates === "function" ? Number(currencyRates()[cur]) || 0 : 0;
  const mine = typeof myStorePrices === "function" ? (myStorePrices()[cur] || {}) : {};
  let best = null;
  slots.forEach((u) => {
    const sp = Number(mine[u.toFixed(2)]) || (typeof currencySlotPrice === "function" ? currencySlotPrice(u, cur) : null) || (rate > 0 ? u * rate : null);
    if (!sp) return;
    const off = Math.abs(sp - value) / value;
    if (!best || off < best.off) best = { usd: u, off };
  });
  if (best && best.off < 0.08) return { usd: best.usd, sure: best.off < 0.03 };
  if (rate > 0) { const u = value / rate; return { usd: Math.max(0.99, Math.round(u) - 0.01), sure: false }; }
  return { usd: null, sure: false };
}
// A game name ("Charm Guide", "100K Meat", "Fire Crystal Chest") as a Packs
// item, with the bundle size it carries ({ name, mult }) or null.
function scanPkNameItem(raw) {
  let s = String(raw || "").replace(/[^A-Za-z0-9 ,.'’-]/g, " ").replace(/\s+/g, " ").trim();
  let mult = 1;
  const bm = /^(\d[\d,.]*)\s*([KM])?\s+(.+)$/i.exec(s);
  if (bm) { mult = Number(bm[1].replace(/,/g, "")) * ({ k: 1e3, m: 1e6 }[(bm[2] || "").toLowerCase()] || 1); s = bm[3]; }
  s = s.replace(/^[^A-Za-z]+/, "").replace(/\s+[a-z]$/i, "").trim();
  if (s.length < 3) return null;
  const tryName = (x) => (typeof packResourceByName === "function" ? packResourceByName(x) : "");
  let n = tryName(s) || tryName(s + "s") || tryName(s.replace(/s$/i, ""));
  if (!n) {
    const norm = (x) => String(x).toLowerCase().replace(/[^a-z ]/g, "").split(" ").filter(Boolean).map((w) => w.replace(/s$/, "")).join(" ");
    const want = norm(s);
    const all = typeof packAllResourceNames === "function" ? packAllResourceNames() : [];
    n = all.find((x) => norm(x) === want || norm(materialDisplayName(x)) === want) || "";
  }
  return n ? { name: n, mult } : null;
}

// Pack items Scan was taught (site_config scan_learned entries with k: "pack").
let SCAN_PK_LEARNED = [];
async function scanPkLearnedLoad() {
  try { await ensureSiteConfigKey("scan_learned"); } catch (e) { return SCAN_PK_LEARNED; }
  SCAN_PK_LEARNED = (((siteConfig("scan_learned", null) || {}).items) || []).filter((e) => e && e.k === "pack" && e.n && e.f)
    .map((e) => ({ ...e, g: scanB64ToFeat(e.f) })).filter((e) => e.g.length === SCAN_FEAT_W * SCAN_FEAT_H * 3);
  return SCAN_PK_LEARNED;
}
// Closest picture among the Backpack Scan's learned tiles and the pack lessons
// (a Backpack "Skip" lesson isn't a reason to skip here: packs show other things).
function scanPkMatchRefs(feat, refs) {
  const n = feat.length, best = new Map();
  const put = (name, d, extra) => { const b = best.get(name); if (!b || d < b.d) best.set(name, { d, ...extra }); };
  const dist = (g, off, step) => { let sum = 0; for (let i = 0, j = off; i < n; i += 3, j += step) sum += Math.abs(feat[i] - g[j]) + Math.abs(feat[i + 1] - g[j + 1]) + Math.abs(feat[i + 2] - g[j + 2]); return sum / n; };
  SCAN_ITEM_NAMES.forEach((name, k) => { if ((k + 1) * (n / 3) * 4 <= refs.length) put(name, dist(refs, k * (n / 3) * 4, 4)); });
  SCAN_LEARNED.forEach((e) => { if (e.n !== SCAN_SKIP) put(e.n, dist(e.g, 0, 3)); });
  SCAN_PK_LEARNED.forEach((e) => put(e.n, dist(e.g, 0, 3), { mult: e.mult || 1, taught: true }));
  const list = [...best.entries()].sort((a, b) => a[1].d - b[1].d);
  if (!list.length) return { name: null, dist: Infinity, next: Infinity };
  return { name: list[0][0], dist: list[0][1].d, next: list[1] ? list[1][1].d : Infinity, mult: list[0][1].mult || 1, taught: !!list[0][1].taught };
}
// The site's own item pictures (the Packs item list), as 10 × 10 colour grids
// at three sizes, to compare with tiles no lesson knows.
let SCAN_PK_ICONS = null;
// Only Backpack items (owner, 16 Nov 2026): like the other Scans, a pack scan keeps
// items that are in the Backpack list and can be a pack column; resources read from the
// Summary screen (Meat, Wood, Coal, Iron) and anything else (VIP points, …) are left out;
// Steel and Pet Food are kept (owner: the pages use them). Gems are read on their own.
function scanPkAllowed() {
  const bp = new Set((typeof backpackItems === "function" ? backpackItems() : []).flatMap((g) => g.items.map((x) => x.name)).concat(typeof BP_ISLAND_ITEMS !== "undefined" ? BP_ISLAND_ITEMS : []));
  const res = new Set(["Meat", "Wood", "Coal", "Iron", "Meat/Wood"]); // Steel and Pet Food stay (owner)
  const key = (n) => (typeof bpKeyFor === "function" ? bpKeyFor(n) : n);
  return (typeof packResourceChoices === "function" ? packResourceChoices() : []).filter((n) => !res.has(n) && (bp.has(n) || bp.has(key(n))));
}
function scanPkIconSrc(name) {
  if (typeof itemRegIcon === "function" && itemRegIcon(name)) return itemRegIcon(name);
  if (String(name).toLowerCase() === "gems" && typeof MATERIAL_ICONS !== "undefined") return MATERIAL_ICONS.gems;
  return (typeof bpIcon === "function" && bpIcon({ name })) || (typeof materialIconSrc === "function" && materialIconSrc(name)) || "";
}
function scanPkIcons() {
  if (SCAN_PK_ICONS) return SCAN_PK_ICONS;
  // every pack item's picture is compared (a Meat tile must match Meat, not the nearest
  // Backpack item); the ones that aren't Backpack items are dropped after.
  const names = (typeof packResourceChoices === "function" ? packResourceChoices() : []).filter((n) => !/speedup/i.test(n)).concat(["Gems"]);
  const bySrc = new Map();
  names.forEach((n) => { const s = scanPkIconSrc(n); if (!s) return; if (!bySrc.has(s)) bySrc.set(s, []); bySrc.get(s).push(n); });
  SCAN_PK_ICONS = Promise.all([...bySrc.entries()].map(([src, list]) => new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    const t = setTimeout(() => resolve(null), 20000);
    img.onload = () => {
      clearTimeout(t);
      try {
        const sizes = [0.62, 0.74, 0.86].map((sc) => {
          const S = 60, c = scanCanvas(S, S), g = c.getContext("2d", { willReadFrequently: true });
          const k = Math.min(S * sc / img.width, S * sc / img.height), dw = img.width * k, dh = img.height * k;
          g.drawImage(img, (S - dw) / 2, S * 0.47 - dh / 2, dw, dh);
          const d = g.getImageData(0, 0, S, S).data, cell = new Float32Array(100 * 4);
          for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
            const i = (y * S + x) * 4, a = d[i + 3] / 255, k2 = (Math.floor(y / 6) * 10 + Math.floor(x / 6)) * 4;
            cell[k2] += d[i] * a; cell[k2 + 1] += d[i + 1] * a; cell[k2 + 2] += d[i + 2] * a; cell[k2 + 3] += a;
          }
          for (let j = 0; j < 400; j++) cell[j] /= 36;
          return cell;
        });
        resolve({ names: list, sizes });
      } catch (e) { resolve(null); }
    };
    img.onerror = () => { clearTimeout(t); resolve(null); };
    img.src = src;
  }))).then((all) => all.filter(Boolean));
  return SCAN_PK_ICONS;
}
// A tile (140 × 140) against the item pictures: { name, dist, next }.
function scanPkMatchIcons(td, icons) {
  const cell = new Float32Array(300);
  for (let y = 0; y < 140; y++) for (let x = 0; x < 140; x++) {
    const i = (y * 140 + x) * 4, k = (Math.min(9, Math.floor(y / 14)) * 10 + Math.min(9, Math.floor(x / 14))) * 3;
    cell[k] += td[i]; cell[k + 1] += td[i + 1]; cell[k + 2] += td[i + 2];
  }
  for (let j = 0; j < 300; j++) cell[j] /= 196;
  // the tile's own colour behind the picture, row by row (its inner left / right edge)
  const bg = [];
  for (let r = 0; r < 10; r++) bg.push([0, 1, 2].map((c) => (cell[(r * 10 + 1) * 3 + c] + cell[(r * 10 + 8) * 3 + c]) / 2));
  const scores = [];
  icons.forEach((ic) => {
    let best = Infinity;
    ic.sizes.forEach((sz) => {
      let sum = 0, n = 0;
      for (let r = 1; r < 9; r++) for (let c = 1; c < 9; c++) {
        if (r >= 7 && c >= 5) continue; // the amount
        const k = (r * 10 + c), a = sz[k * 4 + 3];
        for (let ch = 0; ch < 3; ch++) sum += Math.abs(sz[k * 4 + ch] + (1 - a) * bg[r][ch] - cell[k * 3 + ch]);
        n += 3;
      }
      if (sum / n < best) best = sum / n;
    });
    scores.push([ic.names[0], best, ic.names.length > 1]);
  });
  scores.sort((a, b) => a[1] - b[1]);
  const first = scores[0] || [null, Infinity, false], second = scores[1] || [null, Infinity];
  return { name: first[0], dist: first[1], next: second[1], shared: first[2] };
}
// White text across a pack tile's top (a size label: "10 K", "100", "5 min"),
// found by its shapes, so a label the reader misses still counts: two or more
// letter-sized white shapes standing on one line in the top quarter.
function scanPkTopText(td) {
  const x0 = 8, y0 = 1, w = 124, h = 38, mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = ((y0 + y) * 140 + x0 + x) * 4, r = td[i], g = td[i + 1], b = td[i + 2];
    mask[y * w + x] = Math.min(r, g, b) > 200 && Math.max(r, g, b) - Math.min(r, g, b) < 45 ? 1 : 0;
  }
  const blobs = scanBlobs(mask, w, h, false).filter((b) => b.h >= 9 && b.h <= 30 && b.w <= 30 && b.n >= 14 && b.y + b.h <= 36);
  if (blobs.length < 2) return false;
  const bot = blobs.map((b) => b.y + b.h).sort((a, z) => a - z);
  const mid = bot[Math.floor(bot.length / 2)];
  const line = blobs.filter((b) => Math.abs(b.y + b.h - mid) <= 4 && b.h >= 0.6 * Math.max(...blobs.map((z) => z.h)));
  if (line.length < 2) return false;
  const span = Math.max(...line.map((b) => b.x + b.w)) - Math.min(...line.map((b) => b.x));
  return span >= 18 && span <= 110;
}
// The size label on top of a tile ("1 hr(s)", "5 min", "10 K", "100"):
// { unit: "h" | "m", n } for speedups, { mult } for bundles, or null.
function scanPkParseLabel(lt) {
  lt = String(lt || "").replace(/\s/g, "").replace(/[{\[]/g, "(");
  if (!lt) return null;
  if (/hr|\(s|r\(|hris/i.test(lt)) { const m = /(\d+)/.exec(lt); return { unit: "h", n: m ? Number(m[1]) : null, text: lt }; }
  if (/min|mi$|in$/i.test(lt)) { const m = /(\d+)/.exec(lt); return { unit: "m", n: m ? Number(m[1]) : null, text: lt }; }
  const nm = /^\W*(\d[\d,.]*)\s*([KM])?\W*$/i.exec(lt.replace(/O/g, "0"));
  if (nm) { const v = Number(nm[1].replace(/[,.]/g, "")) * ({ k: 1e3, m: 1e6 }[(nm[2] || "").toLowerCase()] || 1); if (v >= 10) return { mult: v, text: lt }; }
  return null;
}
async function scanPkTopLabel(worker, td) {
  const label = scanTextMask(td, 10, 0, 130, 38, false);
  if (!label) return null;
  return scanPkParseLabel((await scanRead(worker, label, { tessedit_pageseg_mode: "7", tessedit_char_whitelist: "0123456789KMkminhrs(),. " })).text);
}
// The amount at a tile's bottom right ("25", "8,000", "10K"). Pack tiles read
// best cut tight (a lone "5" read as a line can come out as "3").
async function scanPkAmount(worker, td) {
  const num = scanTextMask(td, 21, 87, 136, 136, true);
  if (!num) return { value: null, sure: false };
  const wl = { tessedit_char_whitelist: "0123456789,.KM" };
  let res = null;
  for (const [c, mode] of [[num.tight, "7"], [num.tight, "8"], [num, "7"]]) {
    const r = await scanRead(worker, c, { ...wl, tessedit_pageseg_mode: mode });
    if (/\d/.test(r.text)) { res = r; break; }
  }
  if (!res) return scanTileAmount(worker, td);
  let raw = res.text.replace(/\s/g, "");
  if (num.ones && raw.replace(/\D/g, "") !== num.ones && !/[KM]/.test(raw)) raw = num.ones;
  const m = /(\d[\d,.]*)([KM])?/.exec(raw);
  if (!m) return { value: null, sure: false };
  const digits = m[1].replace(/\D/g, "");
  let value = Number(digits);
  if (m[2]) value = Number(m[1].replace(/,/g, "")) * (m[2] === "K" ? 1e3 : 1e6);
  const shapes = digits.length + (m[2] ? 1 : 0);
  return { value, sure: res.conf >= 65 && shapes === num.count && /^\d{1,3}([,.]\d{3})*[KM]?$|^\d+(\.\d)?[KM]$/.test(m[0]) };
}
const SCAN_PK_SPEED = { 1: "1m", 3: "3m", 5: "5m", 60: "1h", 180: "3h", 480: "8h" };
// One tile: what it is and how many. { name, value, sure, why, img, feat, label }.
async function scanPkTile(worker, img, box, ctx) {
  const t = scanCanvas(140, 140), tg = t.getContext("2d", { willReadFrequently: true });
  tg.drawImage(img.c, box.x, box.y, box.w, box.h, 0, 0, 140, 140);
  const td = tg.getImageData(0, 0, 140, 140).data;
  const feat = scanTileFeature(td);
  const pic = scanCanvas(96, 96); pic.getContext("2d").drawImage(t, 0, 0, 96, 96);
  const out = { feat, img: pic.toDataURL("image/jpeg", 0.85), name: null, value: null, sure: false };
  const amount = await scanPkAmount(worker, td);
  out.value = amount.value; out.amount0 = amount.value;
  if (!amount.value) {
    // no number read (a busy picture behind it): still named when the picture is
    // a close match, so a saved pack can give its amount to check
    out.skip = "noamount";
    const m0 = scanPkMatchRefs(feat, ctx.refs);
    if (m0.dist <= 15 && m0.next > m0.dist * 1.5 && m0.name !== SCAN_SKIP) out.name = m0.name;
    else if (ctx.icons) { const im = scanPkMatchIcons(td, ctx.icons); if (im.name && im.dist < 17 && im.next - im.dist > 4) out.name = im.name; }
    if (out.name) { out.noAmt = true; out.value = null; }
    return out;
  }
  // white digits across the top centre: a size label ("10K", "100"), even when
  // the reader didn't make it out (a tile half under the buy button)
  out.top = scanTopLabel(td) || scanPkTopText(td);
  // the label: as the whole-screen read saw it, else read on the tile
  const label = scanPkParseLabel(box.label) || (box.label ? null : await scanPkTopLabel(worker, td));
  out.label = label ? label.text : "";
  const m = scanPkMatchRefs(feat, ctx.refs);
  if (m.name === SCAN_SKIP && m.taught && m.dist <= 14) {
    out.skip = "skip"; return out;
  } else if (m.dist <= 14) {
    out.name = m.name; out.sure = amount.sure && m.dist <= 10 && m.next > m.dist * 1.3; out.why = m.taught ? "taught" : "picture";
    if (m.mult > 1) out.value *= m.mult;
  } else if (label && label.unit) {
    // A speedup: hours or minutes from the label, the size from the tile's
    // colour (the game's size colours; the small "1" / "5" often don't read),
    // the kind from the corner mark.
    let r = 0, g = 0, b = 0;
    for (let y = 60; y < 80; y++) for (let x = 3; x < 9; x++) { const i = (y * 140 + x) * 4; r += td[i]; g += td[i + 1]; b += td[i + 2]; }
    r /= 120; g /= 120; b /= 120;
    const said = label.n ? SCAN_PK_SPEED[label.n * (label.unit === "h" ? 60 : 1)] : null;
    const fits = SCAN_SIZE_COLORS.filter(([z]) => z.endsWith(label.unit)).map(([z, c]) => [z, Math.abs(c[0] - r) + Math.abs(c[1] - g) + Math.abs(c[2] - b)]).sort((a, z) => a[1] - z[1]);
    const size = fits.length ? fits[0][0] : said;
    let kind = "", best = Infinity;
    if (ctx.marks) {
      const mc = scanCanvas(32, 32), mg = mc.getContext("2d", { willReadFrequently: true });
      mg.drawImage(t, 0, 70, 70, 70, 0, 0, 32, 32);
      const md = mg.getImageData(0, 0, 32, 32).data, marks = ctx.marks;
      SCAN_MARKS.forEach((name, k) => {
        let sum = 0, n = 0;
        for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
          const j = (y * marks.width + k * 32 + x) * 4;
          if (marks.data[j + 3] < 128) continue;
          const i = (y * 32 + x) * 4;
          sum += Math.abs(md[i] - marks.data[j]) + Math.abs(md[i + 1] - marks.data[j + 1]) + Math.abs(md[i + 2] - marks.data[j + 2]);
          n++;
        }
        const sc = n ? sum / n : Infinity;
        if (sc < best) { best = sc; kind = name; }
      });
      if (best > 150 || kind === "Healing") kind = "";
    }
    out.name = size ? `${kind ? kind + " " : ""}Speedup ${size}` : null;
    out.sure = !!size && amount.sure && (!said || said === size) && fits.length > 0 && fits[0][1] < 90;
    out.why = "speedup";
  } else if (ctx.icons) {
    const im = scanPkMatchIcons(td, ctx.icons);
    out.guess = im.name; out.gdist = Math.round(im.dist);
    if (im.name && im.dist < 17 && im.next - im.dist > 1.5) { out.name = im.name; out.why = "icon"; }
    out.sure = false;
  }
  // a size label on a bundle (10 K Meat × 1,000)
  if (label && label.mult && out.name && /^(Meat|Wood|Coal|Iron|Steel|Gems|Food)$/.test(out.name)) out.value *= label.mult;
  else if (label && label.mult && !out.name) out.mult = label.mult;
  return out;
}

// One screenshot: { title, groups: [{ title, price: { cur, value, usd, sure }, gems, items: [...] }], skipped }.
const SCAN_PK_NOT_TITLE = /remaining|limit|claimed|contains|purchase|event ends|buy to get|login daily|select items|confirm|great value|weekly\/monthly|get gems|pick up|traveling|brought you|customize|support the|level up|all over|^\W*\d/i;
async function scanPackShot(worker, file, ctx) {
  const src = await createImageBitmap(file);
  const img = scanPkImage(src);
  const text = await scanPkText(worker, img);
  const prices = await scanPkPrices(worker, img, text);
  // tiles, minus anything sitting on a price button
  let tiles = scanPkFindTiles(img).filter((b) => !prices.some((p) => b.x < p.x + p.w * 1.3 && p.x - 20 < b.x + b.w && b.y < p.y + p.h && p.y < b.y + b.h));
  // each tile's size label as the whole-screen read saw it (top of the tile)
  tiles.forEach((b) => {
    const ls = text.white.filter((l) => l.x + l.w / 2 > b.x && l.x + l.w / 2 < b.x + b.w && l.y + l.h / 2 > b.y - b.h * 0.08 && l.y + l.h / 2 < b.y + b.h * 0.33 && l.h < b.h * 0.3);
    b.label = ls.map((l) => l.text).join("");
  });
  const read = [];
  for (const b of tiles) {
    const r = await scanPkTile(worker, img, b, ctx);
    r.box = b;
    read.push(r);
    if (ctx.progress) ctx.progress(read.length, tiles.length);
  }
  // Lists that write each item's name ("Fire Crystal Chest   x10", "Charm Guide X24").
  const all = text.plain.concat(text.white);
  const bands = [];
  all.forEach((l) => {
    const cy = l.y + l.h / 2, b = bands.find((x) => x.parts.some((p) => Math.abs(p.y + p.h / 2 - cy) < Math.max(12, Math.min(p.h, l.h) * 0.6)));
    if (b) { if (!b.parts.some((p) => Math.min(p.x + p.w, l.x + l.w) - Math.max(p.x, l.x) > Math.min(p.w, l.w) * 0.5)) b.parts.push(l); } else bands.push({ cy, parts: [l] });
  });
  const named = [];
  bands.forEach((b) => {
    const parts = b.parts.sort((a, c) => a.x - c.x), line = parts.map((p) => p.text).join(" ");
    const m = /([A-Za-z][A-Za-z0-9 ,.'’-]*?[A-Za-z])\s*[xX×]\s?(\d[\d,]*)\s*$/.exec(line.replace(/\b(\d[\d,.]*)\s*([KM])\b/g, "$1$2"));
    if (!m) return;
    const pre = /(\d[\d,.]*[KM]?)\s+[A-Za-z][^]*$/.exec(line.slice(0, m.index + m[1].length));
    const nameRaw = (pre && /[KM]$/.test(pre[1]) ? pre[0] : m[1]).trim();
    const it = scanPkNameItem(nameRaw);
    const count = Number(m[2].replace(/,/g, ""));
    if (!(count > 0)) return;
    named.push({ raw: nameRaw.replace(/^[^A-Za-z0-9]+/, ""), name: it ? it.name : null, value: count * (it ? it.mult : 1), sure: !!it, why: "name", cy: b.cy, y: Math.min(...parts.map((p) => p.y)) });
  });
  // Gems: a big number on its own (not inside a tile, not the top bar).
  const gemsLines = text.white.filter((l) => l.h >= 30 && l.y > img.h * 0.06 && !/%/.test(l.text) && /^\W{0,3}\d{1,3}([,.]\d{3})+\W{0,2}$|^\W{0,3}\d{3,6}\W{0,2}$/.test(l.text)
    && !tiles.some((b) => l.x < b.x + b.w && b.x < l.x + l.w && l.y < b.y + b.h && b.y < l.y + l.h));
  const titles = text.white.concat(text.plain).filter((l) => l.h >= 34 && l.conf >= 55 && !named.some((n) => Math.abs(n.cy - (l.y + l.h / 2)) < l.h * 0.6) && /[A-Za-z]{3,}.*[A-Za-z]{3,}/.test(l.text) && !SCAN_PK_NOT_TITLE.test(l.text) && l.y > img.h * 0.04);
  // Groups: each price with the tile rows (and named lines) around it.
  const unitH = tiles.length ? tiles.reduce((a, b) => a + b.h, 0) / tiles.length : img.w * 0.1;
  const groups = prices.sort((a, b) => a.cy - b.cy).map((p) => ({ price: p, items: [], top: p.y, bottom: p.y + p.h }));
  const home = (cy) => {
    let best = null, bd = Infinity;
    groups.forEach((g) => {
      const dy = g.price.cy - cy; // the price sits level with or under its items
      if (dy < -unitH * 1.3 || dy > unitH * 4.5) return;
      const d = dy < 0 ? -dy * 2 : dy;
      if (d < bd) { bd = d; best = g; }
    });
    return best;
  };
  if (!groups.length) groups.push({ price: null, items: [], top: img.h, bottom: 0 });
  const useNames = named.filter((n) => n.name || n.raw).length >= 2;
  const skipped = { noamount: 0, unknown: 0, notlisted: [] };
  const lost = [];
  if (useNames) {
    named.forEach((n) => { const g = groups.length === 1 && !groups[0].price ? groups[0] : home(n.cy) || groups[0]; g.items.push(n); g.top = Math.min(g.top, n.y); });
  }
  read.forEach((r) => {
    if (r.skip && !r.noAmt) { if (r.skip === "noamount") skipped.noamount++; return; }
    const cy = r.box.y + r.box.h / 2;
    // with names, the small pictures at the start of each named line are those items
    if (useNames && named.some((n) => Math.abs(n.cy - cy) < r.box.h * 0.7)) return;
    const g = groups.length === 1 && !groups[0].price ? groups[0] : home(cy);
    if (!g) { skipped.unknown++; lost.push(r); return; }
    g.items.push(r); g.top = Math.min(g.top, r.box.y);
  });
  groups.forEach((g) => { g.bottom = Math.max(g.bottom, ...g.items.map((it) => (it.box ? it.box.y + it.box.h : it.y + 20))); });
  // One pack is one block of rows: a row far from the others (more than ~1.7
  // tiles of space) belongs to something else on the screen (a free gift above).
  groups.forEach((g) => {
    if (g.items.length < 2 || !g.price || useNames) return;
    const yOf = (it) => (it.box ? it.box.y + it.box.h / 2 : it.cy);
    const rows = [];
    g.items.slice().sort((a, b) => yOf(a) - yOf(b)).forEach((it) => { const r = rows.find((x) => Math.abs(x.y - yOf(it)) < unitH * 0.5); if (r) r.list.push(it); else rows.push({ y: yOf(it), list: [it] }); });
    let k = rows.reduce((bi, r, i) => (Math.abs(r.y - g.price.cy) < Math.abs(rows[bi].y - g.price.cy) ? i : bi), 0), lo = k, hi = k;
    while (lo > 0 && rows[lo].y - rows[lo - 1].y < unitH * 1.7) lo--;
    while (hi < rows.length - 1 && rows[hi + 1].y - rows[hi].y < unitH * 1.7) hi++;
    const keep = new Set(rows.slice(lo, hi + 1).flatMap((r) => r.list));
    g.items = g.items.filter((it) => keep.has(it));
    g.top = Math.min(g.price.y, ...g.items.map((it) => (it.box ? it.box.y : it.y)));
  });
  // Myriad Bazaar: under the paid step's shelf come shelves with "Claim For Free"
  // that go with it; their tiles join its price row (the game's table keeps a step's
  // free rewards on the same row). A shelf with no Claim button under it (the next
  // paid step, cut off) is left out.
  const claims = all.filter((l) => /claim\s*for\s*fr/i.test(l.text)).map((l) => ({ cy: l.y + l.h / 2, claim: true }));
  if (claims.length && groups.some((g) => g.price)) {
    const marks = claims.concat(groups.filter((g) => g.price).map((g) => ({ cy: g.price.cy, claim: false })));
    lost.forEach((r) => {
      const cy = r.box.y + r.box.h / 2;
      const next = marks.filter((x) => x.cy > cy && x.cy - cy < unitH * 2.6).sort((a, b) => a.cy - b.cy)[0];
      if (!next || !next.claim) return;
      const g = groups.filter((x) => x.price && x.price.cy < cy).sort((a, b) => b.price.cy - a.price.cy)[0];
      if (!g) return;
      g.items.push(r); g.free = (g.free || 0) + 1; g.bazaar = true;
      g.bottom = Math.max(g.bottom, r.box.y + r.box.h);
      skipped.unknown--;
    });
  }
  const usedGems = new Set();
  groups.forEach((g, gi) => {
    const above = gi > 0 ? groups[gi - 1].bottom : 0;
    if (g.price) Object.assign(g.price, scanPkUsd(g.price.value, g.price.cur));
    // the title: the nearest big text line above the items, not past the group before
    const cands = titles.filter((l) => l.y + l.h <= g.top + 4 && l.y >= Math.max(above - 4, g.top - unitH * 3.6) && l.h >= 30);
    const tl = cands.sort((a, b) => b.y - a.y)[0];
    g.title = tl ? tl.text.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9)'’!]+$/g, "").replace(/[|\\/]/g, " ").replace(/\s+/g, " ").trim() : "";
    // gems: the big number in this pack (the one that fits the price first)
    const want = g.price && g.price.usd ? mpGems(g.price.usd) : null;
    const gl = gemsLines.filter((l) => !usedGems.has(l) && l.y > Math.max(above, g.top - unitH * 4) - 10 && l.y < Math.max(g.bottom, g.price ? g.price.y + g.price.h : 0) + 4)
      .map((l) => ({ l, v: Number(l.text.replace(/\D/g, "")) })).filter((x) => !want || x.v === want).sort((a, b) => b.l.h - a.l.h)[0];
    if (gl) { usedGems.add(gl.l); g.gems = gl.v; g.gemsSure = gl.v === want; }
    else if (want) { g.gems = want; g.gemsSure = false; }
    g.items.sort((a, b) => ((a.box ? a.box.y : a.y) - (b.box ? b.box.y : b.y)) || ((a.box ? a.box.x : 0) - (b.box ? b.box.x : 0)));
  });
  const out = groups.filter((g) => g.items.length || groups.length === 1);
  // the screenshot's own title (the biggest line in its upper part) for a lone pack
  const upper = titles.filter((l) => l.y < img.h * 0.45), big = (upper.some((l) => l.y > img.h * 0.135) ? upper.filter((l) => l.y > img.h * 0.135) : upper).sort((a, b) => b.h - a.h)[0];
  const tidy = (x) => String(x || "").replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9)'’!]+$/g, "").replace(/[|\\/]/g, " ").replace(/\s+/g, " ").trim();
  if (out.length === 1 && !out[0].title && big) out[0].title = tidy(big.text);
  return { title: big ? tidy(big.text) : "", groups: out, skipped, tiles: tiles.length, names: useNames };
}

// ---- Scan pack: the sheet (design B+D, owner 16 Nov 2026) ----
// One card per pack found. A card matched to a saved pack compares Item |
// Saved | Screenshot; a new pack gets a name, category and its items.
// opts: { target: { id, title, saved, when, group, onPage, mine, myPack } | null (a pack's own
//   window: only that pack's card), canNew, categories: [names], category,
//   match(title) → same shape as target | null, packs() → [same shape] (the "Which pack is
//   this?" list), onSave(result) → { undo } | undefined }.
// saved = the pack's rows ([{ usd, gems, items }]); onPage = a Packs-page pack;
// mine = a visitor's own copy of its amounts; myPack = a visitor's own pack (My packs).
// result = { to: "this" | "new" | "match", id, title, category, rows: [{ usd, gems, items: { name: amount } }], learn: [entries] }.
// Nothing is saved here; onSave (app.js) writes the pack the way its editor does,
// and its undo puts back what was there before.
const SCAN_PK_LADDER = [[4.99, 1], [9.99, 2], [19.99, 4], [49.99, 10], [99.99, 20]];
const SCAN_PK_BUNDLE = /^(Meat|Wood|Coal|Iron|Steel|Gems|Food)$/;
// Which read tiles a card lists (owner, 16 Nov 2026). Speedups (a time label)
// always stay; a named tile stays when its item is a Backpack item. A tile with
// no name is offered ("What is this?") only when its nearest picture is a
// Backpack item and close (SCAN_PK_GUESS_MAX); resource bundles, VIP points,
// chests that aren't Backpack items … are left out and counted on the card.
const SCAN_PK_RES_GUESS = /^(Meat|Wood|Coal|Iron|Meat\/Wood|VIP.*)$/i;
const SCAN_PK_GUESS_MAX = 16;
function scanPkKeep(it, ok) {
  if (it.why === "speedup") return true;
  if (it.name) return ok.has(it.name);
  if (it.why === "name") return false;
  if (it.mult || it.top || (it.guess && SCAN_PK_RES_GUESS.test(it.guess))) return false;
  return !!it.guess && ok.has(it.guess) && Number(it.gdist) <= SCAN_PK_GUESS_MAX;
}
function openPackScanMain(opts) {
  opts = opts || {};
  let modal = document.getElementById("pkScanModal");
  if (!modal) { modal = document.createElement("div"); modal.id = "pkScanModal"; modal.className = "modal-overlay"; document.body.appendChild(modal); }
  modal.style.display = "flex";
  const run = {};
  modal._scanRun = run;
  const live = () => modal._scanRun === run && modal.style.display !== "none";
  const onKey = (e) => {
    if (e.key !== "Escape" || !live()) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (st.sheet) { st.sheet = null; draw(); } else close();
  };
  const close = () => { modal.style.display = "none"; modal.innerHTML = ""; window.removeEventListener("keydown", onKey, true); if (modal._scanRun === run) modal._scanRun = null; };
  window.addEventListener("keydown", onKey, true);
  modal.onclick = (ev) => { if (ev.target === modal) close(); };
  const st = {
    cards: [], files: 0, noamount: 0, learn: true,
    phase: "start", // start | read | cards
    sheet: null, // the "Which pack is this?" sheet: { ci, q }
    addTo: null, // the card whose "+ Add screenshot" was tapped
  };
  const names = () => scanPkAllowed().concat(["Gems"]).filter((n, i, a) => a.indexOf(n) === i);
  const disp = (n) => (/^Speedup /.test(n) ? n.replace(/^Speedup/, "General Speedup") : materialDisplayName(n) || n);
  const shortName = (n) => (/^Speedup /.test(n) ? n : typeof itemShortName === "function" && itemShortName(n) !== n ? itemShortName(n) : disp(n));
  const iconOf = (n) => scanPkIconSrc(n);
  const money = (v, cur) => (typeof packFmtMoney === "function" ? packFmtMoney(v, cur || "USD") : `$${v}`);
  const amt = (v) => (v >= 1e5 && typeof shortAmount === "function" ? shortAmount(v) : Math.round(v).toLocaleString());
  const key = (x) => String(x || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const num = (v) => { const n = parseFloat(String(v).replace(/,/g, "").replace(/[^0-9.]/g, "")); return Number.isFinite(n) ? n : null; };
  const closeX = `<button type="button" class="pks-x" data-pksclose aria-label="${esc(t("close_button"))}">&times;</button>`;
  const ladderOf = (usd) => {
    const i = SCAN_PK_LADDER.findIndex(([p]) => Math.abs(p - usd) < 0.005);
    return i < 0 ? null : SCAN_PK_LADDER.slice(i).map(([p, m]) => [p, m / SCAN_PK_LADDER[i][1]]);
  };
  const exampleSvg = `<svg viewBox="0 0 74 92" width="74" height="92" aria-hidden="true"><rect width="74" height="92" fill="#4b2a6e"/><rect x="5" y="6" width="64" height="14" rx="3" fill="#f0c46a"/><text x="37" y="16" font-size="7" text-anchor="middle" fill="#3a1d00" font-weight="700">Charm Craftsman</text>
    <rect x="6" y="44" width="18" height="18" rx="3" fill="#a65fe0"/><rect x="28" y="44" width="18" height="18" rx="3" fill="#a65fe0"/><rect x="50" y="44" width="18" height="18" rx="3" fill="#4d9de0"/>
    <text x="22" y="60" font-size="5" text-anchor="end" fill="#fff">18</text><text x="44" y="60" font-size="5" text-anchor="end" fill="#fff">6</text><text x="66" y="60" font-size="5" text-anchor="end" fill="#fff">2500</text>
    <rect x="14" y="70" width="46" height="12" rx="6" fill="#44c06a"/><text x="37" y="79" font-size="7" text-anchor="middle" fill="#fff" font-weight="700">$4.99</text></svg>`;

  // ---- first window: the screenshot only ----
  const showStart = () => {
    st.phase = "start";
    modal.innerHTML = `<div class="modal-box pks-box" role="dialog" aria-label="${esc(t("pks_title"))}">
      <div class="pks-h"><div><h2>${esc(t("pks_title"))}</h2><div class="pks-sub">${esc(t("pks_intro"))}</div></div>${closeX}</div>
      <div class="pks-st1"><div class="pks-st1-t"><b>${esc(t("pks_s1"))}</b><small>${esc(t("pks_s1_hint"))}</small></div>
        <span class="scan-ex pks-ex" aria-hidden="true">${exampleSvg}</span></div>
      <button class="btn pks-big" type="button" data-pkspick>${esc(t("pks_choose"))}</button>
      <div class="pks-tip">${esc(t("pks_long"))}</div>
    </div>`;
    modal.querySelector("[data-pksclose]").onclick = close;
    modal.querySelector("[data-pkspick]").onclick = () => picker(null);
  };
  const picker = (ci) => {
    const input = document.createElement("input");
    input.type = "file"; input.accept = "image/*"; input.multiple = true;
    input.onchange = () => { if (input.files.length) { st.addTo = ci; readAll([...input.files]); } };
    input.click();
  };

  // ---- reading: thumbnail, bar, Cancel ----
  let thumbUrl = "";
  const showRead = (pct, sub) => {
    if (!live()) return;
    const bar = modal.querySelector("[data-pksbar]");
    if (bar) { bar.style.width = `${pct}%`; modal.querySelector("[data-pkspct]").textContent = t("pks_reading_pct").replace("{n}", Math.round(pct)); if (sub != null) modal.querySelector("[data-pksrsub]").textContent = sub; return; }
    modal.innerHTML = `<div class="modal-box pks-box" role="dialog" aria-label="${esc(t("pks_title"))}">
      <div class="pks-h"><div><h2>${esc(t("pks_title"))}</h2><div class="pks-sub">${esc(t("pks_intro"))}</div></div>${closeX}</div>
      <div class="pks-rd">${thumbUrl ? `<img src="${esc(thumbUrl)}" alt="" />` : ""}<div class="pks-rd-t"><b data-pkspct>${esc(t("pks_reading_pct").replace("{n}", Math.round(pct)))}</b>
        <div class="pks-prog"><i data-pksbar style="width:${pct}%"></i></div><small data-pksrsub>${esc(sub || t("pks_reading_sub"))}</small></div></div>
      <div class="pks-sk" aria-hidden="true"><i></i><i></i><i></i></div>
      <button class="btn ghost pks-big" type="button" data-pkscancel>${esc(t("cancel"))}</button>
    </div>`;
    modal.querySelector("[data-pksclose]").onclick = close;
    // Cancel: back to the cards when there are some, else close
    modal.querySelector("[data-pkscancel]").onclick = () => { run.cancel = (run.cancel || 0) + 1; if (st.cards.length) draw(); else close(); };
  };
  let shotNo = 0;
  const readAll = async (files) => {
    const cancelAt = run.cancel || 0;
    const cancelled = () => !live() || (run.cancel || 0) !== cancelAt;
    thumbUrl = "";
    try { const bm = await createImageBitmap(files[0]), k = 124 / bm.width, c = scanCanvas(124, Math.max(1, Math.min(240, Math.round(bm.height * k)))); c.getContext("2d").drawImage(bm, 0, 0, 124, Math.round(bm.height * k)); thumbUrl = c.toDataURL("image/jpeg", 0.7); } catch (e) { thumbUrl = ""; }
    st.phase = "read";
    showRead(2, t("scan_loading"));
    SCAN_PROGRESS = (m) => { if (!cancelled() && m && typeof m.progress === "number") showRead(2 + m.progress * 8, `${m.status || ""}`); };
    let ctx;
    try {
      const [worker, marks, refs, icons] = await Promise.all([scanWorker(), scanMarkData(), scanItemData(), scanPkIcons(), scanLearnedLoad().catch(() => []), scanPkLearnedLoad()]);
      ctx = { worker, marks, refs, icons };
    } catch (e) {
      SCAN_PROGRESS = null;
      if (!live()) return;
      if (st.cards.length) { toast(t("scan_failed"), true); draw(); return; }
      modal.innerHTML = `<div class="modal-box pks-box"><p>${esc(t("scan_failed"))}</p><div style="text-align:end;"><button class="btn" type="button" data-pksclose>${esc(t("close_button"))}</button></div></div>`;
      modal.querySelector("[data-pksclose]").onclick = close;
      return;
    }
    SCAN_PROGRESS = null;
    const shots = [];
    for (let i = 0; i < files.length; i++) {
      if (cancelled()) return;
      const base = 10 + (90 * i) / files.length, span = 90 / files.length;
      showRead(base, files.length > 1 ? t("pks_reading").replace("{n}", i + 1).replace("{m}", files.length) : t("pks_reading_sub"));
      ctx.progress = (k, n) => { if (!cancelled()) showRead(base + span * (0.25 + 0.75 * k / n)); };
      let s;
      try { s = await scanPackShot(ctx.worker, files[i], ctx); } catch (e) { s = { groups: [], skipped: { noamount: 0, unknown: 0 }, title: "" }; }
      shots.push(s);
    }
    if (cancelled()) return;
    const add = st.addTo;
    st.addTo = null;
    shots.forEach((s) => ingest(s, ++shotNo));
    st.files += files.length;
    // the pack window: only its own pack
    if (opts.target && st.cards.length > 1 && !add) {
      const want = key(opts.target.title).slice(0, 12);
      const k = want ? st.cards.findIndex((c) => key(c.title).includes(want)) : -1;
      st.cards = [st.cards[k >= 0 ? k : 0]];
    }
    if (opts.target && st.cards[0]) st.cards[0].m = opts.target;
    st.cards.forEach(prep);
    draw();
  };

  // ---- screenshots → cards ----
  // Several screenshots of one pack (a row that scrolls) add up: same price and
  // name → one pack, a tile in both counts once. Another price of a pack already
  // found (same name) is another row of it.
  const samePrice = (a, b) => (a.price && b.price ? Math.abs(a.price.value - b.price.value) < 0.01 : !a.price && !b.price);
  const titleOk = (a, b) => !key(a) || !key(b) || key(a) === key(b);
  const near = (a, b) => { if (!a.feat || !b.feat) return false; let d = 0; for (let i = 0; i < a.feat.length; i++) d += Math.abs(a.feat[i] - b.feat[i]); return d / a.feat.length < 12; };
  const mergeInto = (c, x, g, si) => {
    g.items.forEach((it) => { if (!x.items.some((o) => o.value === it.value && ((o.name && o.name === it.name) || near(o, it)))) x.items.push(it); });
    g.dropped.forEach((it) => { if (!x.dropped.some((o) => o.value === it.value && near(o, it))) x.dropped.push(it); });
    if (!x.gems && g.gems) { x.gems = g.gems; x.gemsSure = g.gemsSure; }
    if (!x.title && g.title) x.title = g.title;
    if (!c.title && g.title) c.title = g.title;
    x.shots.add(si); c.shots.add(si);
  };
  const ingest = (s, si) => {
    st.noamount += (s.skipped && s.skipped.noamount) || 0;
    const ok = new Set(names());
    (s.groups || []).forEach((g) => {
      const kept = [], dropped = [];
      g.items.forEach((it) => (scanPkKeep(it, ok) ? kept : dropped).push(it));
      g.items = kept.map((it) => ({ ...it, auto: it.name, tick: true }));
      g.dropped = dropped;
      g.shots = new Set([si]);
      if (!g.title && s.groups.length === 1 && s.title) g.title = s.title;
      const pool = g.bazaar ? [] : st.addTo != null && st.cards[st.addTo] ? [st.cards[st.addTo]] : st.cards.filter((c) => !c.bazaar);
      // same price (another screenshot of it)
      for (const c of pool) for (const x of c.groups) if (!x.shots.has(si) && samePrice(x, g) && titleOk(x.title || c.title, g.title)) { mergeInto(c, x, g, si); c.changed = true; return; }
      // another price of a pack already found (same name, or the card it was added to)
      const c2 = pool.find((c) => !c.groups.some((x) => samePrice(x, g)) && g.price && c.groups.every((x) => x.price) && (pool.length === 1 && st.addTo != null ? true : key(c.title) && key(c.title) === key(g.title)));
      if (c2) { c2.groups.push(g); c2.shots.add(si); c2.changed = true; c2.groups.sort((a, b) => (a.price.usd || a.price.value) - (b.price.usd || b.price.value)); return; }
      if (opts.target && st.cards.length && st.files > 0) return; // a pack window only keeps its own pack
      st.cards.push({ groups: [g], bazaar: !!g.bazaar, shots: new Set([si]), title: g.title || "", titleTyped: false, category: opts.category || (opts.categories || [])[0] || "", fresh: true, open: false, status: "", m: null, asNew: false });
    });
  };
  const cmpOf = (c) => (c.asNew ? null : c.m);
  const prep = (c) => {
    if (c.fresh) {
      if (!opts.target && c.bazaar) c.m = bazaarMatch(c);
      if (!opts.target && !c.m && typeof opts.match === "function" && c.title) c.m = opts.match(c.title);
      c.fresh = false;
      fillFromSaved(c); scaleDefault(c);
      c.open = needsLook(c);
      return;
    }
    if (c.changed) { c.changed = false; fillFromSaved(c); scaleDefault(c); if (needsLook(c)) c.open = true; }
  };
  // Myriad Bazaar: the option table whose row at this price has the most of these items.
  const BAZ = /baz+a+r/i;
  const bazaarMatch = (c) => {
    if (typeof opts.packs !== "function") return null;
    const g = c.groups[0], usd = g.price && g.price.usd;
    const mine = new Set(g.items.filter((it) => it.tick && it.name).map((it) => it.name.toLowerCase()));
    let best = null, bs = 0;
    (opts.packs() || []).filter((p) => BAZ.test(p.title || "")).forEach((p) => {
      const rows = (p.saved || []).filter((r) => !usd || (r.usd != null && Math.abs(r.usd - usd) < 0.005));
      const have = new Set(rows.flatMap((r) => Object.keys(r.items || {}).map((n) => n.toLowerCase())));
      const sc = [...mine].filter((n) => have.has(n)).length;
      if (sc > bs) { bs = sc; best = p; }
    });
    return best;
  };
  // "Scale to the next prices" (the price steps) starts on unless the pack it
  // saves into is known not to be a Regular Packs ladder. A tap on the switch wins.
  const scaleDefault = (c) => {
    if (c.groups.length > 1 || c.bazaar) { c.scale = false; return; }
    if (c.scaleTouched) return;
    const m = cmpOf(c), g = c.groups[0];
    const lad = (v) => v != null && SCAN_PK_LADDER.some(([p]) => Math.abs(p - v) < 0.005);
    const saved = m && Array.isArray(m.saved) ? m.saved.filter((r) => r.usd != null) : [];
    if (!saved.length) { c.scale = true; return; }
    const usd = g && g.price && g.price.usd;
    c.scale = saved.filter((r) => lad(r.usd)).length >= 2 || (/regular/i.test(m.group || "") && usd != null && Math.abs(usd - 4.99) < 0.005);
  };
  // A pack already saved: a tile Scan couldn't name gets the saved item the scan
  // is missing, when that tile has the saved amount for this price or its nearest
  // picture is that item (owner, 16 Nov 2026: the pet food bag of "Pet Food Pack").
  // Also a left-out tile with exactly that amount. Marked "please check".
  const fillFromSaved = (c) => {
    c.groups.forEach((g) => {
      g.items.forEach((it) => { if (it.fill) { it.name = null; it.fill = false; it.sure = false; it.ok = false; } });
      const back = g.items.filter((it) => it.fromDrop && !it.name);
      g.items = g.items.filter((it) => !back.includes(it));
      back.forEach((it) => { it.fromDrop = false; g.dropped.push(it); });
    });
    const m = cmpOf(c);
    c.groups.forEach((g) => g.items.forEach((it) => { if (it.bySaved) { it.bySaved = false; it.sure = false; } if (it.fillAmt) { it.fillAmt = false; it.value = null; it.ok = false; } }));
    if (!m || !Array.isArray(m.saved) || !m.saved.length) return;
    const allowed = new Map(names().map((n) => [n.toLowerCase(), n]));
    // an item read by its picture with the saved pack's amount for this price is taken as right
    c.groups.forEach((g) => {
      const usd = g.price && g.price.usd, row = usd && m.saved.find((r) => r.usd != null && Math.abs(r.usd - usd) < 0.005);
      if (!row) return;
      const b = lc(row.items), tot = totOf(g);
      // a tile with no number read: the saved amount, to check
      g.items.forEach((it) => { const v = it.name && b[it.name.toLowerCase()]; if (v && it.noAmt && it.value == null && !it.typed) { it.value = Math.round(v.v - (tot[it.name.toLowerCase()] || 0)); if (it.value > 0) it.fillAmt = true; else it.value = null; } });
      g.items.forEach((it) => { const v = it.name && b[it.name.toLowerCase()]; if (v && !it.sure && !it.ok && !it.fill && !it.fillAmt && it.value != null && Math.round(v.v) === Math.round(tot[it.name.toLowerCase()] || 0)) { it.sure = true; it.bySaved = true; } });
    });
    c.groups.forEach((g) => {
      const usd = g.price && g.price.usd;
      const row = (usd && m.saved.find((r) => r.usd != null && Math.abs(r.usd - usd) < 0.005)) || (m.saved.length === 1 ? m.saved[0] : null);
      if (!row) return;
      const have = new Set(g.items.filter((it) => it.name).map((it) => it.name.toLowerCase()));
      const missing = Object.entries(row.items || {}).filter(([n]) => !have.has(n.toLowerCase()) && allowed.has(n.toLowerCase()));
      const open = g.items.filter((it) => it.tick && !it.name && it.why !== "name");
      const claimed = new Set();
      missing.forEach(([n, v]) => {
        const sameV = (it) => Number(it.value) > 0 && Math.round(it.value) === Math.round(v);
        let cand = open.filter((it) => !claimed.has(it) && (sameV(it) || String(it.guess || "").toLowerCase() === n.toLowerCase()));
        let fromDrop = false;
        if (!cand.length) { cand = g.dropped.filter((it) => !it.name && !it.skip && sameV(it)); fromDrop = true; }
        if (cand.length !== 1) return;
        claimed.add(cand[0]);
        Object.assign(cand[0], { name: allowed.get(n.toLowerCase()), fill: true, sure: false, ok: false, tick: true });
        if (fromDrop) { g.dropped = g.dropped.filter((x) => x !== cand[0]); cand[0].fromDrop = true; g.items.push(cand[0]); }
      });
    });
  };

  // ---- what a card would save ----
  const unsureIt = (it) => it.tick && (!it.name || (!it.sure && !it.ok));
  const priceUnsure = (g) => !g.price || !(g.price.usd > 0) || (!g.price.sure && !g.priceOk);
  const toCheck = (c) => c.groups.reduce((a, g) => a + g.items.filter(unsureIt).length + (priceUnsure(g) ? 1 : 0), 0);
  // rows: [{ usd, gems, items, fromShot, kept, was }] — kept = a worked-out price step the saved
  // pack already has: its saved numbers stay (owner, 16 Nov 2026), shown as "saved".
  const rowsOf = (c) => {
    const rows = c.groups.map((g) => {
      const items = {};
      let gems = Number(g.gems) || 0;
      g.items.forEach((it) => { if (!it.tick || !it.name || !(Number(it.value) > 0)) return; if (it.name === "Gems") gems += Number(it.value); else items[it.name] = (items[it.name] || 0) + Number(it.value); });
      return { usd: g.price && g.price.usd ? g.price.usd : null, gems, items, fromShot: true };
    });
    if (rows.length === 1 && c.scale && rows[0].usd) {
      const lad = ladderOf(rows[0].usd), m = cmpOf(c);
      const saved = m && Array.isArray(m.saved) ? m.saved : [];
      if (lad) lad.slice(1).forEach(([p, k]) => {
        const was = saved.find((s) => s.usd != null && Math.abs(s.usd - p) < 0.005);
        if (was) { rows.push({ usd: p, gems: was.gems, items: { ...was.items }, kept: true }); return; }
        const items = {};
        Object.entries(rows[0].items).forEach(([n, v]) => { items[n] = Math.round(v * k); });
        rows.push({ usd: p, gems: typeof mpGems === "function" ? mpGems(p) : Math.round(rows[0].gems * k), items, fromShot: false });
      });
    }
    return rows;
  };
  // a group's ticked, named amounts by item (the same item twice, e.g. a Bazaar step's paid and free shelves, adds up)
  const totOf = (g) => { const o = {}; g.items.forEach((it) => { if (it.tick && it.name && Number(it.value) > 0) { const k = it.name.toLowerCase(); o[k] = (o[k] || 0) + Number(it.value); } }); return o; };
  const lc = (o) => { const out = {}; Object.entries(o || {}).forEach(([n, v]) => { const k = String(n).toLowerCase(); if (!out[k]) out[k] = { n, v: 0 }; out[k].v += Number(v) || 0; }); return out; };
  // What saving changes in the saved pack: changed / new amounts (a visitor's copy
  // only changes amounts the pack already has).
  const changesOf = (c) => {
    const m = cmpOf(c);
    if (!m || !Array.isArray(m.saved)) return 0;
    let n = 0;
    rowsOf(c).forEach((r) => {
      if (r.kept) return;
      const s = r.usd ? m.saved.find((x) => x.usd != null && Math.abs(x.usd - r.usd) < 0.005) : null;
      if (!s) { if (!m.mine) n += Object.keys(r.items).length; return; }
      const a = lc(r.items), b = lc(s.items);
      Object.keys(a).forEach((k) => { if (!b[k]) { if (!m.mine) n++; } else if (Math.round(b[k].v) !== Math.round(a[k].v)) n++; });
      if (!m.mine && Math.round(s.gems || 0) !== Math.round(r.gems || 0) && r.gems) n++;
    });
    return n;
  };
  const isNew = (c) => !cmpOf(c);
  const canNew = () => opts.canNew !== false;
  const canSave = (c) => !(isNew(c) && !canNew()) && c.groups.length && toCheck(c) === 0 && c.groups.every((g) => g.price && g.price.usd > 0) && c.groups.some((g) => g.items.some((it) => it.tick && it.name && it.name !== "Gems"));
  const needsLook = (c) => toCheck(c) > 0 || isNew(c) || changesOf(c) > 0;
  const shotGroup = (c) => c.groups[0];
  const titleOf = (c) => (cmpOf(c) ? cmpOf(c).title : c.title) || t("pks_new");
  const toOwnCopy = (c) => { const m = cmpOf(c); return !!(m && m.mine); };
  const status = (c) => {
    if (c.status === "saved") return ["done", t("pks_st_saved")];
    if (c.status === "skipped") return ["done", t("pks_st_skipped")];
    const n = toCheck(c);
    if (n) return ["amb", t("pks_st_check").replace("{n}", n)];
    if (isNew(c)) return ["ice", t("pks_st_new")];
    const ch = changesOf(c);
    if (ch) return ["ice", t(ch === 1 ? "pks_st_change1" : "pks_st_changes").replace("{n}", ch)];
    if (c.hadCheck) return ["good", t("pks_st_ready")];
    return ["good", t("pks_st_same")];
  };
  const saveText = (c) => {
    const n = toCheck(c);
    if (n) return t(n === 1 ? "pks_check_first1" : "pks_check_first").replace("{n}", n);
    if (isNew(c)) return t("pks_save_new");
    if (toOwnCopy(c)) return t("pks_save_mine");
    const ch = changesOf(c);
    return ch ? t(ch === 1 ? "pks_save_upd1" : "pks_save_upd").replace("{n}", ch) : t("pks_save_same");
  };

  // ---- drawing ----
  const ringOf = (n) => { const m = /speedup\s*(\d+)\s*(m|h)\b/i.exec(String(n || "")); if (!m) return ""; const tm = m[1] + m[2].toLowerCase(), c = ((typeof SCAN_SIZE_COLORS !== "undefined" ? SCAN_SIZE_COLORS : []).find(([z]) => z === tm) || [null, [155, 161, 164]])[1]; return ` style="--ring:rgb(${c.join(",")})" data-tm="${tm}"`; };
  const icHtml = (n, cls) => { const ic = n && iconOf(n), rg = n ? ringOf(n) : ""; return ic ? `<span class="pks-ic ${rg ? "ring " : ""}${cls || ""}"${rg}><img src="${esc(ic)}" alt="" />${rg ? `<i class="pks-tm">${esc(/data-tm="([^"]+)"/.exec(rg)[1])}</i>` : ""}</span>` : `<span class="pks-ic pks-q ${cls || ""}">?</span>`; };
  const tileIc = (it, cls) => (it.name ? icHtml(it.name, cls) : it.img ? `<span class="pks-ic pks-tile ${cls || ""}"><img src="${esc(it.img)}" alt="" /></span>` : icHtml(null, cls));
  const gemsIc = () => (iconOf("Gems") ? `<img class="pks-gi" src="${esc(iconOf("Gems"))}" alt="Gems" />` : "Gems");
  const headSub = (c) => {
    const g = shotGroup(c);
    if (c.groups.length > 1) return esc(t("pks_n_prices").replace("{n}", c.groups.length));
    return `${g.price ? esc(money(g.price.value, g.price.cur)) : esc(t("pks_price_none_s"))}${g.gems ? ` · ${gemsIc()} ${Math.round(g.gems).toLocaleString()}` : ""}`;
  };
  const stripHtml = (c) => {
    const its = [];
    c.groups.forEach((g) => g.items.forEach((it) => { if (it.tick && it.name && it.name !== "Gems") its.push(it); }));
    return its.length ? `<div class="pks-strip">${its.slice(0, 8).map((it) => `<span title="${esc(disp(it.name))}">${tileIc(it, "sm")}<b>${esc(amt(Number(it.value) || 0))}</b></span>`).join("")}${its.length > 8 ? `<span class="meta">+${its.length - 8}</span>` : ""}</div>` : "";
  };
  // The picture picker: the likely items first, "…" opens every Backpack item.
  const pickerHtml = (c, ci, it, ik) => {
    const m = cmpOf(c), sug = [];
    const put = (n) => { if (n && !sug.includes(n) && names().includes(n)) sug.push(n); };
    put(it.name);
    if (m && Array.isArray(m.saved)) m.saved.forEach((r) => Object.keys(r.items || {}).forEach(put));
    put(it.guess);
    c.groups.forEach((g) => g.items.forEach((x) => put(x.name)));
    const all = c.pickAll === ik;
    const list = all ? sug.concat(names().filter((n) => !sug.includes(n))) : sug.slice(0, 5);
    return `<div class="pks-pick${all ? " all" : ""}">${list.map((n) => `<button type="button" class="pks-pk${n === it.name ? " on" : ""}" data-pkspk="${ci}|${ik}|${esc(n)}" title="${esc(disp(n))}" aria-label="${esc(disp(n))}">${iconOf(n) ? `<img src="${esc(iconOf(n))}" alt="" />` : `<small>${esc(disp(n).slice(0, 8))}</small>`}</button>`).join("")}${all ? "" : `<button type="button" class="pks-pk more" data-pksall="${ci}|${ik}" aria-label="${esc(t("pks_more_items"))}">&hellip;</button>`}</div>`;
  };
  const askHtml = (ci, ik, it) => `<div class="pks-ask"><span>${esc(it.value == null ? t("pks_no_number") : it.fillAmt ? t("pks_saved_q").replace("{n}", Number(it.value).toLocaleString()) : t("pks_read_q").replace("{n}", Number(it.value || 0).toLocaleString()))}</span>${it.value == null ? "" : `<button type="button" class="cg-bpbtn pks-yes" data-pksyes="${ci}|${ik}">&#10003; ${esc(t("pks_yes"))}</button>`}<button type="button" class="cg-bpbtn" data-pksedit="${ci}|${ik}">&#9998; ${esc(t("pks_edit"))}</button></div>`;
  const editHtml = (c, ci, ik, it) => `<div class="pks-ed">
      <label class="pks-edr"><span class="pks-edl">${esc(t("pks_amount"))}</span><input type="text" inputmode="numeric" class="pks-in" data-pksv="${ci}|${ik}" value="${it.value == null ? "" : Number(it.value).toLocaleString("en-US")}" aria-label="${esc(t("pks_amount"))}" autocomplete="off" /></label>
      <div class="pks-edr"><span class="pks-edl">${esc(t("pks_item"))}</span>${pickerHtml(c, ci, it, ik)}</div>
      <div class="pks-edr end"><span class="pks-sel">${it.name ? `${esc(disp(it.name))} &#10003;` : ""}</span><button type="button" class="cg-bpbtn" data-pksout="${ci}|${ik}">${esc(t("pks_leave_out"))}</button><button type="button" class="cg-bpbtn pks-yes" data-pksdone="${ci}|${ik}" ${it.name ? "" : "disabled"}>${esc(t("pks_done"))}</button></div></div>`;
  const unknownHtml = (c, ci, ik, it) => `<div class="pks-ask"><span>${esc(t("pks_what"))}</span></div>${pickerHtml(c, ci, it, ik)}<div class="pks-ask"><button type="button" class="cg-bpbtn" data-pksout="${ci}|${ik}">${esc(t("pks_leave_out"))}</button></div>`;
  const nameCell = (inner, n) => `<td><span class="pks-tn">${inner}<span>${esc(n)}</span></span></td>`;
  // A card matched to a saved pack: Item | Saved | Screenshot, per price.
  const compareHtml = (c, ci) => {
    const m = cmpOf(c);
    let body = "";
    c.groups.forEach((g, gi) => {
      const usd = g.price && g.price.usd;
      const s = (usd && m.saved.find((r) => r.usd != null && Math.abs(r.usd - usd) < 0.005)) || null;
      const b = s ? lc(s.items) : {}, tot = totOf(g);
      const cnt = {}, last = {};
      g.items.forEach((it, ii) => { if (it.tick && it.name) { const k = it.name.toLowerCase(); cnt[k] = (cnt[k] || 0) + 1; last[k] = ii; } });
      const seen = new Set();
      if (c.groups.length > 1 || !s) body += `<tr class="pks-pr"><td colspan="3">${usd ? "$" + usd : "?"}${g.price ? ` · ${esc(money(g.price.value, g.price.cur))}` : ""}${s ? "" : ` · <em>${esc(t(m.mine ? "pks_diff_newprice_mine" : "pks_diff_newprice"))}</em>`}</td></tr>`;
      g.items.forEach((it, ii) => {
        const ik = `${gi}|${ii}`;
        const k = it.name ? it.name.toLowerCase() : null;
        const again = k && seen.has(k) && it.tick;
        if (k) seen.add(k);
        const sv = k && b[k] && !again ? b[k].v : null;
        if (!it.tick) { body += `<tr class="pks-off">${nameCell(tileIc(it, "xs"), it.name ? disp(it.name) : t("pks_unknown_t"))}<td>${sv != null ? amt(sv) : "—"}</td><td><button type="button" class="cg-bpbtn" data-pksuse="${ci}|${ik}">${esc(t("pks_left_out"))}</button></td></tr>`; return; }
        if (!it.name) { body += `<tr class="pks-unk">${nameCell(tileIc(it, "xs"), t("pks_unknown_t"))}<td>—</td><td>&times;${esc(amt(Number(it.value) || 0))}</td></tr><tr class="pks-unk2"><td colspan="3">${unknownHtml(c, ci, ik, it)}</td></tr>`; return; }
        const editing = c.edit === ik, unsure = unsureIt(it), sk = b[k] ? b[k].v : null, diff = sk != null ? Math.round(sk) !== Math.round(tot[k] || 0) : !m.mine;
        const sum = cnt[k] > 1 && last[k] === ii ? ` <small class="pks-sum">= ${esc(amt(tot[k] || 0))}</small>` : "";
        const cls = editing || unsure ? "pks-q" : diff ? "pks-chg" : "";
        body += `<tr class="${cls}">${nameCell(tileIc(it, "xs"), shortName(it.name))}<td>${sv != null ? amt(sv) : again ? "" : "—"}</td><td>${editing ? "&#9998;" : `<b>${it.value == null ? "?" : esc(amt(Number(it.value) || 0)) + (unsure ? " ?" : "")}</b>${sum}`}${!editing && !unsure ? ` <button type="button" class="pks-pen" data-pksedit="${ci}|${ik}" aria-label="${esc(t("pks_edit"))}">&#9998;</button>` : ""}</td></tr>`;
        if (editing) body += `<tr class="pks-q2"><td colspan="3">${editHtml(c, ci, ik, it)}</td></tr>`;
        else if (unsure) body += `<tr class="pks-q2"><td colspan="3">${askHtml(ci, ik, it)}</td></tr>`;
      });
      if (s) Object.keys(b).forEach((k) => { if (!seen.has(k)) body += `<tr class="pks-miss">${nameCell(icHtml(b[k].n, "xs"), shortName(b[k].n))}<td>${amt(b[k].v)}</td><td><small>${esc(t("pks_diff_notin"))}</small></td></tr>`; });
      const g0 = s ? Math.round(s.gems || 0) : null, g1 = Math.round(g.gems || 0);
      body += `<tr class="${s && g0 !== g1 && !m.mine ? "pks-chg" : ""}">${nameCell(`<span class="pks-ic xs">${gemsIc()}</span>`, "Gems")}<td>${g0 != null ? (g0 ? g0.toLocaleString() : "—") : "—"}</td><td><b>${g1 ? g1.toLocaleString() : "—"}</b></td></tr>`;
    });
    return `<table class="pks-tb"><thead><tr><th>${esc(t("pks_item"))}</th><th>${esc(t("pks_diff_saved"))}</th><th>${esc(t("pks_diff_scan"))}</th></tr></thead><tbody>${body}</tbody></table>`;
  };
  // A new pack: name, category, its items (picture, name, amount).
  const newHtml = (c, ci) => {
    const cats = (opts.categories || []).filter(Boolean);
    let rows = "";
    c.groups.forEach((g, gi) => {
      if (c.groups.length > 1) rows += `<div class="pks-nh">${g.price && g.price.usd ? "$" + g.price.usd : "?"}${g.price ? ` · ${esc(money(g.price.value, g.price.cur))}` : ""}</div>`;
      g.items.forEach((it, ii) => {
        const ik = `${gi}|${ii}`;
        if (!it.tick) { rows += `<div class="pks-nr off">${tileIc(it, "sm")}<span class="pks-nn">${esc(it.name ? disp(it.name) : t("pks_unknown_t"))}</span><button type="button" class="cg-bpbtn" data-pksuse="${ci}|${ik}">${esc(t("pks_left_out"))}</button></div>`; return; }
        const open = c.edit === ik || !it.name;
        rows += `<div class="pks-nr${unsureIt(it) ? " q" : ""}">${tileIc(it, "sm")}<button type="button" class="pks-nn" data-pksedit="${ci}|${ik}" aria-expanded="${open ? "true" : "false"}">${esc(it.name ? shortName(it.name) : t("pks_unknown_t"))} <small>&#9662;</small></button>
          <input type="text" inputmode="numeric" class="pks-in" data-pksv="${ci}|${ik}" value="${it.value == null ? "" : Number(it.value).toLocaleString("en-US")}" aria-label="${esc(t("pks_amount"))}" autocomplete="off" /></div>`;
        if (open) rows += `<div class="pks-nrp">${!it.name ? `<div class="pks-ask"><span>${esc(t("pks_what"))}</span></div>` : ""}${pickerHtml(c, ci, it, ik)}<div class="pks-ask end"><button type="button" class="cg-bpbtn" data-pksout="${ci}|${ik}">${esc(t("pks_leave_out"))}</button>${it.name ? `<button type="button" class="cg-bpbtn pks-yes" data-pksdone="${ci}|${ik}">${esc(t("pks_done"))}</button>` : ""}</div></div>`;
        else if (unsureIt(it)) rows += askHtml(ci, ik, it);
      });
    });
    return `<div class="pks-new">
      <label class="pks-lab" for="pksName${ci}">${esc(t("pks_name"))}</label><input type="text" id="pksName${ci}" class="pks-name" data-pksname="${ci}" maxlength="60" value="${esc(c.title)}" placeholder="${esc(t("pks_name_ph"))}" autocomplete="off" />
      ${cats.length ? `<label class="pks-lab" for="pksCat${ci}">${esc(t("pks_cat"))}</label><select id="pksCat${ci}" class="pks-name keep-w" data-pkscat="${ci}">${cats.map((x) => `<option value="${esc(x)}" ${x === c.category ? "selected" : ""}>${esc(x)}</option>`).join("")}</select>` : ""}
      <div class="pks-lab">${esc(t("pks_items_h"))}</div>${rows}
      <button type="button" class="pks-addit" data-pksadd="${ci}">+ ${esc(t("pks_missing"))}</button></div>`;
  };
  // The price: asked when not sure, typed when not read.
  const priceAskHtml = (c, ci) => c.groups.map((g, gi) => {
    if (!priceUnsure(g) && !(c.priceEdit === gi)) return "";
    const read = g.price && g.price.value && !c.priceEdit && c.priceEdit !== gi && g.price.usd > 0;
    return `<div class="pks-pq">${read ? `<div class="pks-ask"><span>${esc(t("pks_price_q").replace("{p}", money(g.price.value, g.price.cur)).replace("{usd}", "$" + g.price.usd))}</span><button type="button" class="cg-bpbtn pks-yes" data-pkspyes="${ci}|${gi}">&#10003; ${esc(t("pks_yes"))}</button><button type="button" class="cg-bpbtn" data-pkspedit="${ci}|${gi}">&#9998; ${esc(t("pks_edit"))}</button></div>`
      : `<label class="pks-edr"><span>${esc(g.price && g.price.value ? t("pks_store").replace("{p}", money(g.price.value, g.price.cur)) : t("pks_price_none"))}</span><span class="pks-usd">US $<input type="text" inputmode="decimal" class="pks-in" data-pksusd="${ci}|${gi}" value="${g.price && g.price.usd ? g.price.usd : ""}" placeholder="4.99" aria-label="US $" autocomplete="off" /></span></label>`}</div>`;
  }).join("");
  // One row per price: price, every item (picture + amount), Gems.
  const rowsTableHtml = (rows, savedTag) => {
    const cols = [];
    rows.forEach((r) => Object.keys(r.items).forEach((n) => { if (!cols.includes(n)) cols.push(n); }));
    return `<div class="pks-pv-wrap"><table class="pks-pv"><thead><tr><th>${esc(t("pks_price_h"))}</th>${cols.map((n) => { const ic = iconOf(n); return `<th title="${esc(disp(n))}">${ic ? `<img src="${esc(ic)}" alt="${esc(disp(n))}" />` : esc(disp(n).slice(0, 4))}</th>`; }).join("")}<th title="Gems">${gemsIc()}</th></tr></thead>
      <tbody>${rows.map((r) => `<tr class="${r.fromShot ? "shot" : r.kept ? "kept" : ""}"><td><b>${r.usd ? "$" + r.usd : "?"}</b>${savedTag && r.kept ? ` <small>${esc(t("pks_kept_tag"))}</small>` : ""}</td>${cols.map((n) => `<td>${r.items[n] ? esc(amt(r.items[n])) : "—"}</td>`).join("")}<td>${r.gems ? Math.round(r.gems).toLocaleString() : "—"}</td></tr>`).join("")}</tbody></table></div>`;
  };
  // The price steps: one line with the switch; tapped, the 5 prices and the rows it fills.
  const ladderHtml = (c, ci) => {
    if (c.groups.length !== 1 || c.bazaar) return "";
    const usd = c.groups[0].price && c.groups[0].price.usd, k = SCAN_PK_LADDER.findIndex(([p]) => usd && Math.abs(p - usd) < 0.005);
    if (k < 0) return "";
    const last = SCAN_PK_LADDER[SCAN_PK_LADDER.length - 1];
    const line = `<div class="pks-ll"><button type="button" class="pks-llb" data-pkslad="${ci}" aria-expanded="${c.ladOpen ? "true" : "false"}">$${usd} &times;1 &rarr; $${last[0]} &times;${Math.round(last[1] / SCAN_PK_LADDER[k][1])} <small>${c.ladOpen ? "&#9652;" : "&#9662;"}</small></button>
      <label class="pks-sw">${esc(t(c.scale ? "pks_on" : "pks_off"))} <input type="checkbox" class="bset-sw" data-pksscale="${ci}" ${c.scale ? "checked" : ""} aria-label="${esc(t("pks_scale"))}" /></label></div>`;
    if (!c.ladOpen) return line;
    const rows = rowsOf(c);
    return `${line}<div class="pks-lad">${SCAN_PK_LADDER.map(([p, mm], i) => `<button type="button" data-pksstep="${ci}|${p}" class="${i === k ? "on" : i < k || !c.scale ? "pre" : ""}" aria-pressed="${i === k ? "true" : "false"}"><b>$${p}</b><small>&times;${Math.round(mm / SCAN_PK_LADDER[k][1] * 100) / 100 || ""}</small>${i === k ? `<small>${esc(t("pks_screenshot_tag"))}</small>` : ""}</button>`).join("")}</div>
      <div class="pks-lab">${esc(t("pks_rows"))}</div>${rowsTableHtml(rows, true)}
      <div class="meta pks-pv-n">${esc(t(rows.some((r) => r.kept) ? "pks_rows_kept" : c.scale && rows.length > 1 ? "pks_rows_note" : "pks_rows_note1"))}</div>`;
  };
  const savedHtml = (c) => {
    const m = cmpOf(c);
    if (!m || !c.savedOpen || !Array.isArray(m.saved)) return "";
    return `<div class="pks-lab">${esc(t("pks_saved_pack"))}${m.group ? ` · ${esc(m.group)}` : ""}</div>${m.saved.length ? rowsTableHtml(m.saved) : `<div class="meta">${esc(t("pks_saved_empty"))}</div>`}`;
  };
  const matchLine = (c, ci) => `<div class="pks-ml">${matchText(c, ci)} · <button type="button" class="pks-lk" data-pksaddshot="${ci}">+ ${esc(t("pks_add_shot"))}</button></div>`;
  const matchText = (c, ci) => {
    const m = cmpOf(c), canPick = typeof opts.packs === "function";
    if (m) return `${esc(t(m.myPack ? "pks_in_mine" : m.mine ? "pks_on_page_v" : "pks_on_page"))}${canPick ? ` · <button type="button" class="pks-lk" data-pkschange="${ci}">${esc(t(c.bazaar ? "pks_not_table" : "pks_not_this"))}</button>` : ""}${Array.isArray(m.saved) ? ` · <button type="button" class="pks-lk" data-pkssaved="${ci}" aria-expanded="${c.savedOpen ? "true" : "false"}">${esc(t(c.savedOpen ? "pks_saved_hide" : "pks_saved_see"))}</button>` : ""}`;
    return `${esc(t(canNew() ? "pks_not_on_page" : "pks_not_on_page_v"))}${canPick ? ` · <button type="button" class="pks-lk" data-pkschange="${ci}">${esc(t("pks_one_of_mine"))}</button>` : ""}`;
  };
  const cardHtml = (c, ci) => {
    const [sk, sl] = status(c), done = c.status === "saved" || c.status === "skipped";
    const open = c.open && !done;
    const head = `<div class="pks-ch"><button type="button" class="pks-cht" data-pkstoggle="${ci}" aria-expanded="${open ? "true" : "false"}"><b>${esc(titleOf(c))}</b><small>${headSub(c)}${c.shots.size > 1 ? ` · ${esc(t("pks_n_shots").replace("{n}", c.shots.size))}` : ""}</small></button>
      <span class="pks-st ${sk}">${esc(sl)}</span>${done && (c.status === "skipped" || c.undo) ? `<button type="button" class="pks-lk pks-undo" data-pksundo="${ci}">${esc(t("pks_undo"))}</button>` : `<button type="button" class="pks-car" data-pkstoggle="${ci}" aria-label="${esc(titleOf(c))}">${open ? "&#9652;" : "&#9662;"}</button>`}</div>`;
    if (!open) return `<div class="pks-card${done ? " done" : ""}" data-pkscard="${ci}">${head}${stripHtml(c)}</div>`;
    const drop = c.groups.reduce((a, g) => a + g.dropped.length, 0);
    const learnable = IS_OWNER && c.groups.some((g) => g.items.some((it) => it.feat && it.tick && it.ok && it.name && it.name !== it.auto));
    const sv = canSave(c);
    return `<div class="pks-card open${toCheck(c) ? " amb" : ""}" data-pkscard="${ci}">${head}
      ${matchLine(c, ci)}
      ${savedHtml(c)}
      ${priceAskHtml(c, ci)}
      ${isNew(c) ? newHtml(c, ci) : compareHtml(c, ci)}
      ${drop ? `<div class="meta pks-drop">${esc(t(drop === 1 ? "pks_dropped1" : "pks_dropped").replace("{n}", drop))}</div>` : ""}
      ${ladderHtml(c, ci)}
      ${learnable ? `<label class="pks-learn"><input type="checkbox" data-pkslearn ${st.learn ? "checked" : ""} /><span>${esc(t("pks_learn"))}<small class="meta">${esc(t("pks_learn_d"))}</small></span></label>` : ""}
      <div class="pks-cf"><span></span><button type="button" class="cg-bpbtn" data-pksskip="${ci}">${esc(t("pks_skip"))}</button><button type="button" class="cg-bpbtn pks-save" data-pkssave="${ci}" ${sv && c.status !== "saving" ? "" : "disabled"}>${esc(saveText(c))}</button></div>
    </div>`;
  };
  const pending = () => st.cards.filter((c) => c.status !== "saved" && c.status !== "skipped");
  const savedN = () => st.cards.filter((c) => c.status === "saved").length;
  const barHtml = () => {
    const left = pending(), ready = left.filter(canSave), chk = left.reduce((a, c) => a + toCheck(c), 0);
    const addBtn = `<button class="btn ghost" type="button" data-pksaddshot="">+ ${esc(t("pks_add_shot"))}</button>`;
    if (!left.length && st.cards.length) {
      const n = savedN();
      return `${n ? `<div class="pks-toast"><span>&#10003; ${esc(t(n === 1 ? "pks_saved_n1" : "pks_saved_n").replace("{n}", n))}</span>${opts.openPacks ? `<button type="button" class="pks-lk" data-pksopen>${esc(t("pks_open_packs"))}</button>` : ""}</div>` : ""}
        <div class="pks-bar2">${addBtn}<button class="btn pks-p" type="button" data-pksclose>${esc(t("pks_done"))}</button></div>`;
    }
    let txt;
    if (chk) txt = t(chk === 1 ? "pks_check_first1" : "pks_check_first").replace("{n}", chk);
    else if (!IS_OWNER && ready.length && ready.every(toOwnCopy)) txt = t("pks_save_mine");
    else if (savedN()) txt = t("pks_save_other").replace("{n}", ready.length);
    else txt = t(ready.length === 1 ? "pks_save_one" : "pks_save_all").replace("{n}", ready.length);
    return `<div class="pks-bar2">${addBtn}<button class="btn pks-p" type="button" data-pkssaveall ${chk || !ready.length || st.saving ? "disabled" : ""}>${esc(txt)}</button></div>`;
  };
  const subLine = () => {
    const n = st.cards.length, left = pending();
    if (!n) return t("pks_none_found");
    if (!left.length && savedN()) return t(savedN() === 1 ? "pks_sub_saved_all1" : "pks_sub_saved_all").replace("{n}", savedN());
    const parts = [t(n === 1 ? "pks_found1" : "pks_found").replace("{n}", n)];
    const chk = left.reduce((a, c) => a + toCheck(c), 0), ch = left.reduce((a, c) => a + changesOf(c), 0);
    if (opts.target && cmpOf(st.cards[0]) === opts.target && n === 1 && !chk) parts[0] = opts.target.title;
    if (savedN()) parts.push(t("pks_sub_saved").replace("{n}", savedN()));
    else if (chk) parts.push(t("pks_sub_check").replace("{n}", chk));
    else if (ch) parts.push(t(ch === 1 ? "pks_sub_change1" : "pks_sub_changes").replace("{n}", ch));
    else if (st.cards.length === 1 && isNew(st.cards[0])) parts.push(t("pks_sub_new"));
    else parts.push(t("pks_sub_ready"));
    return parts.join(" · ");
  };
  const sheetHtml = () => {
    const sh = st.sheet;
    if (!sh) return "";
    const c = st.cards[sh.ci];
    const cur = cmpOf(c);
    const q = key(sh.q);
    const all = (opts.packs() || []).filter((p) => p && p.title);
    const first = (p) => (cur && String(p.id) === String(cur.id) ? 0 : c.bazaar && BAZ.test(p.title) ? 1 : 2);
    const list = all.filter((p) => !q || key(p.title).includes(q)).sort((a, b) => first(a) - first(b) || String(a.title).localeCompare(String(b.title))).slice(0, 40);
    const firstIc = (p) => { const r = (p.saved || [])[0]; const n = r && Object.keys(r.items || {})[0]; return icHtml(n || null, "pk"); };
    return `<div class="pks-shov" data-pksshbd><div class="pks-sh" role="dialog" aria-label="${esc(t("pks_which"))}">
      <div class="pks-h"><div><h2>${esc(t("pks_which"))}</h2><div class="pks-sub">${esc(t(IS_OWNER ? "pks_which_d" : "pks_which_dv"))}</div></div><button type="button" class="pks-x" data-pksshclose aria-label="${esc(t("close_button"))}">&times;</button></div>
      <label class="pks-srch"><span aria-hidden="true">&#128269;</span><input type="search" data-pksq value="${esc(sh.q)}" placeholder="${esc(t("pkb_search"))}" autocomplete="off" /></label>
      <div class="pks-li-w">${list.map((p) => { const on = cur && String(p.id) === String(cur.id); return `<button type="button" class="pks-li${on ? " on" : ""}" data-pkspack="${esc(String(p.id))}">${firstIc(p)}<span><b>${esc(p.title)}</b><small>${esc([p.myPack ? t("pks_in_mine") : p.group, on ? t("pks_now_matched") : p.when].filter(Boolean).join(" · "))}</small></span>${on ? "<em>&#10003;</em>" : "<em class=\"g\">&rsaquo;</em>"}</button>`; }).join("") || `<div class="meta">${esc(t("pks_which_none"))}</div>`}</div>
      ${canNew() ? `<button type="button" class="pks-li pks-li-new" data-pksasnew><span class="pks-plus">+</span><span><b>${esc(t("pks_as_new"))}</b><small>${esc(t(IS_OWNER ? "pks_as_new_d" : "pks_as_new_dv"))}</small></span></button>` : ""}
    </div></div>`;
  };
  const draw = () => {
    if (!live()) return;
    st.phase = "cards";
    const box0 = modal.querySelector(".pks-box"), y = box0 ? box0.scrollTop : 0;
    const act = document.activeElement, actKey = act && modal.contains(act) ? [...act.attributes].find((a) => a.name.startsWith("data-pks")) : null;
    const sel = actKey ? `[${actKey.name}="${window.CSS.escape(actKey.value)}"]` : "";
    const caret = act && typeof act.selectionStart === "number" ? act.selectionStart : null;
    const visitorNote = !IS_OWNER && st.cards.some((c) => toOwnCopy(c) && c.status !== "saved") ? `<div class="pks-vn">${esc(t("pks_visitor_note"))}</div>` : "";
    modal.innerHTML = `<div class="modal-box pks-box pks-cards" role="dialog" aria-label="${esc(t("pks_title"))}">
      <div class="pks-h"><div><h2>${esc(t("pks_title"))}</h2><div class="pks-sub">${esc(subLine())}</div></div>${closeX}</div>
      ${visitorNote}
      ${st.cards.length ? st.cards.map(cardHtml).join("") : `<p class="desc">${esc(t("pks_nothing"))}</p>`}
      ${st.noamount ? `<div class="meta pks-skip">${esc(t("pks_skipped").replace("{n}", st.noamount))}</div>` : ""}
      <div class="pks-bar">${barHtml()}</div>
    </div>${sheetHtml()}`;
    const box = modal.querySelector(".pks-box");
    box.scrollTop = y;
    if (sel) { const el = modal.querySelector(sel); if (el) { try { el.focus({ preventScroll: true }); if (caret != null && el.setSelectionRange) el.setSelectionRange(caret, caret); } catch (e) {} } }
    wire();
  };
  // Typing: the state follows at once; the chip, Save buttons and line above follow without a redraw.
  const light = (ci) => {
    const c = st.cards[ci], el = modal.querySelector(`[data-pkscard="${ci}"]`);
    if (el) {
      const [sk, sl] = status(c), chip = el.querySelector(".pks-st");
      if (chip) { chip.className = `pks-st ${sk}`; chip.textContent = sl; }
      const sb = el.querySelector("[data-pkssave]");
      if (sb) { sb.textContent = saveText(c); sb.disabled = !canSave(c); }
    }
    const bar = modal.querySelector(".pks-bar");
    if (bar) { bar.innerHTML = barHtml(); wireBar(); }
    const sub = modal.querySelector(".pks-h .pks-sub");
    if (sub) sub.textContent = subLine();
  };
  const itemAt = (s) => { const [ci, gi, ii] = s.split("|").map(Number); const c = st.cards[ci]; return { c, ci, g: c.groups[gi], it: c.groups[gi].items[ii], ik: `${gi}|${ii}` }; };
  const markCheck = (c) => { if (toCheck(c)) c.hadCheck = true; };

  // ---- saving ----
  const learnOf = (c) => (IS_OWNER && st.learn ? c.groups.flatMap((g) => g.items.filter((it) => it.feat && it.tick && it.ok && it.name && it.name !== it.auto).map((it) => ({ k: "pack", n: it.name, f: scanFeatToB64(it.feat) }))) : []);
  const saveCard = async (c) => {
    if (!canSave(c) || c.status === "saving") return false;
    const m = cmpOf(c);
    const to = !m ? "new" : m === opts.target ? "this" : "match";
    const learn = learnOf(c);
    const res = { to, id: m ? m.id : null, title: (to === "new" ? c.title : m.title || c.title || "").trim(), category: c.category, rows: rowsOf(c).filter((r) => !r.kept).map(({ usd, gems, items }) => ({ usd, gems, items })), learn };
    c.status = "saving";
    try {
      const out = await opts.onSave(res);
      c.status = "saved"; c.open = false;
      c.undo = out && typeof out.undo === "function" ? out.undo : null;
      if (learn.length) { try { await scanLearnedSave(learn); await scanPkLearnedLoad(); } catch (err) { toast(t("pks_learn_failed"), true); } }
      return true;
    } catch (err) { c.status = ""; toast((err && err.message) || "Couldn't save", true); return false; }
  };
  const wireBar = () => {
    modal.querySelectorAll(".pks-bar [data-pksclose]").forEach((b) => b.onclick = close);
    modal.querySelectorAll(".pks-bar [data-pksaddshot]").forEach((b) => b.onclick = () => picker(null));
    const op = modal.querySelector("[data-pksopen]");
    if (op) op.onclick = () => { close(); opts.openPacks(); };
    const all = modal.querySelector("[data-pkssaveall]");
    if (all) all.onclick = async () => {
      if (st.saving) return;
      st.saving = true; all.disabled = true;
      for (const c of pending().filter(canSave)) { if (!live()) break; await saveCard(c); }
      st.saving = false;
      draw();
    };
  };
  const wire = () => {
    modal.querySelector(".pks-h [data-pksclose]").onclick = close;
    wireBar();
    const on = (attr, fn) => modal.querySelectorAll(`[${attr}]`).forEach((b) => b.addEventListener(b.tagName === "INPUT" || b.tagName === "SELECT" ? (b.type === "checkbox" || b.tagName === "SELECT" ? "change" : "input") : "click", (e) => fn(b.getAttribute(attr), b, e)));
    on("data-pkstoggle", (v) => { const c = st.cards[Number(v)]; if (c.status === "saved" || c.status === "skipped") return; c.open = !c.open; draw(); });
    on("data-pksyes", (v) => { const { c, it } = itemAt(v); markCheck(c); it.ok = true; it.sure = true; c.edit = null; draw(); });
    on("data-pksedit", (v) => { const { c, ik } = itemAt(v); markCheck(c); c.edit = c.edit === ik ? null : ik; draw(); });
    on("data-pksdone", (v) => { const { c, it } = itemAt(v); it.ok = true; it.sure = true; c.edit = null; draw(); });
    on("data-pksout", (v) => { const { c, g, it } = itemAt(v); markCheck(c); if (it.added && !it.name) g.items.splice(g.items.indexOf(it), 1); else it.tick = false; c.edit = null; draw(); });
    on("data-pksuse", (v) => { const { c, it } = itemAt(v); it.tick = true; c.edit = it.name ? null : c.edit; draw(); });
    on("data-pksall", (v) => { const [ci, gi, ii] = v.split("|"); st.cards[Number(ci)].pickAll = `${gi}|${ii}`; draw(); });
    on("data-pkspk", (v) => {
      const [ci, gi, ii, ...rest] = v.split("|");
      const { c, it } = itemAt(`${ci}|${gi}|${ii}`), n = rest.join("|");
      markCheck(c);
      it.name = n; it.tick = true; it.fill = false; it.ok = true; it.sure = true;
      // a bundle tile (10 K Meat): the label times the number on the tile
      if (it.mult && SCAN_PK_BUNDLE.test(n) && !it.typed) it.value = it.amount0 != null ? it.amount0 * it.mult : it.value * it.mult;
      c.pickAll = null;
      if (isNew(c) || c.edit !== `${gi}|${ii}`) c.edit = null;
      draw();
    });
    on("data-pksv", (v, el) => { const { c, ci, it } = itemAt(v); markCheck(c); it.value = num(el.value); it.typed = true; if (it.name) { it.sure = true; it.ok = true; } light(ci); });
    on("data-pksname", (v, el) => { const c = st.cards[Number(v)]; c.title = el.value; c.titleTyped = true; light(Number(v)); });
    on("data-pkscat", (v, el) => { st.cards[Number(v)].category = el.value; });
    on("data-pksadd", (v) => { const c = st.cards[Number(v)], g = c.groups[0]; g.items.push({ name: null, value: null, tick: true, sure: false, added: true }); c.edit = `0|${g.items.length - 1}`; draw(); });
    on("data-pkspyes", (v) => { const [ci, gi] = v.split("|").map(Number), c = st.cards[ci]; markCheck(c); c.groups[gi].priceOk = true; c.priceEdit = null; draw(); });
    on("data-pkspedit", (v) => { const [ci, gi] = v.split("|").map(Number); st.cards[ci].priceEdit = gi; draw(); });
    on("data-pksusd", (v, el) => {
      const [ci, gi] = v.split("|").map(Number), c = st.cards[ci], g = c.groups[gi];
      markCheck(c);
      g.price = g.price || { cur: "USD", value: null };
      g.price.usd = num(el.value); g.priceOk = g.price.usd > 0;
      if (!g.gemsTyped && typeof mpGems === "function" && g.price.usd) g.gems = mpGems(g.price.usd);
      light(ci);
    });
    on("data-pkslad", (v) => { const c = st.cards[Number(v)]; c.ladOpen = !c.ladOpen; draw(); });
    on("data-pksscale", (v, el) => { const c = st.cards[Number(v)]; c.scale = el.checked; c.scaleTouched = true; draw(); });
    on("data-pksstep", (v) => {
      const [ci, p] = v.split("|"), c = st.cards[Number(ci)], g = c.groups[0], usd = Number(p);
      g.price = g.price || { cur: "USD", value: null };
      g.price.usd = usd; g.priceOk = true;
      if (!g.gemsTyped && typeof mpGems === "function") g.gems = mpGems(usd);
      fillFromSaved(c);
      draw();
    });
    on("data-pkssaved", (v) => { const c = st.cards[Number(v)]; c.savedOpen = !c.savedOpen; draw(); });
    on("data-pkschange", (v) => { st.sheet = { ci: Number(v), q: "" }; draw(); const q = modal.querySelector("[data-pksq]"); if (q && matchMedia("(hover:hover)").matches) q.focus(); });
    on("data-pkslearn", (v, el) => { st.learn = el.checked; });
    on("data-pksaddshot", (v) => picker(v === "" ? null : Number(v)));
    on("data-pksskip", (v) => { const c = st.cards[Number(v)]; c.status = "skipped"; c.open = false; draw(); });
    on("data-pkssave", async (v, el) => { const c = st.cards[Number(v)]; el.disabled = true; await saveCard(c); draw(); });
    on("data-pksundo", async (v, el) => {
      const c = st.cards[Number(v)];
      if (c.status === "skipped") { c.status = ""; c.open = true; draw(); return; }
      if (!c.undo) return;
      el.disabled = true;
      try { await c.undo(); c.status = ""; c.undo = null; c.open = true; } catch (err) { toast((err && err.message) || "Couldn't undo", true); }
      draw();
    });
    // the "Which pack is this?" sheet
    const shbd = modal.querySelector("[data-pksshbd]");
    if (shbd) {
      shbd.onclick = (e) => { if (e.target === shbd || e.target.closest("[data-pksshclose]")) { st.sheet = null; draw(); } };
      const q = shbd.querySelector("[data-pksq]");
      q.oninput = () => { st.sheet.q = q.value; const pos = q.selectionStart; draw(); const q2 = modal.querySelector("[data-pksq]"); if (q2) { q2.focus(); try { q2.setSelectionRange(pos, pos); } catch (e) {} } };
      shbd.querySelectorAll("[data-pkspack]").forEach((b) => b.onclick = () => {
        const c = st.cards[st.sheet.ci];
        const p = (opts.packs() || []).find((x) => String(x.id) === b.dataset.pkspack);
        if (p) {
          c.m = opts.target && String(opts.target.id) === String(p.id) ? opts.target : p;
          c.asNew = false; c.scaleTouched = false; c.savedOpen = false; c.edit = null;
          fillFromSaved(c); scaleDefault(c);
        }
        st.sheet = null; draw();
      });
      const asNew = shbd.querySelector("[data-pksasnew]");
      if (asNew) asNew.onclick = () => {
        const c = st.cards[st.sheet.ci];
        c.asNew = true; c.scaleTouched = false; c.edit = null;
        if (!c.titleTyped && !c.title && c.m) c.title = c.m.title;
        fillFromSaved(c); scaleDefault(c);
        st.sheet = null; draw();
      };
    }
  };
  showStart();
}
