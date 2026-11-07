// Makes the packed (minified) copies the site loads and keeps their "?v=<hash>" links
// in step with them. Not part of the site (nothing loads it); run it with Node after
// editing app.js / app.css / admin.js:
//   (once) cd tools && npm ci   -> installs the pinned minifiers (terser, csso)
//   node tools/stamp.js          -> writes admin.min.js, app.min.css, app.min.js and
//                                   updates the links in admin.js / app.js / index.html
//   node tools/stamp.js --check  -> only says whether the copies and links are right
//                                   (exit code 1 if a copy is stale or a link is wrong)
// The readable files are the source; the .min copies are committed so the site still
// deploys without a build step. Never edit a .min file by hand.
// Packing keeps every top-level name (functions, let / const, classes): the planner
// worker is built from functions' source text by name (PLANNER_FN_NAMES, window[n]),
// admin.js and app.js share globals, and HTML strings call globals by name. Only names
// inside functions are shortened; comments and spaces go. Function / class names are
// kept too (keep_fnames), so fn.name stays the same.
// The hash is the first 10 hex digits of the file's SHA-256 (sw.js checks it before
// keeping a copy). admin.min.js carries its own build id (window.ADMIN_BUILD): the id
// is the hash of admin.min.js with that value as "0000000000", written into admin.js
// too. admin.min.js is done first (app.js links to it), then app.min.js and
// app.min.css (index.html links to them).
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const ROOT = path.join(__dirname, "..");
const check = process.argv.includes("--check");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const readOr = (f) => (fs.existsSync(path.join(ROOT, f)) ? read(f) : null);
const sha = (text) => crypto.createHash("sha256").update(Buffer.from(text)).digest("hex").slice(0, 10);
let terser, csso;
try {
  terser = require("./node_modules/terser");
  csso = require("./node_modules/csso");
} catch (e) {
  console.log("The minifiers aren't installed: run `npm ci` in the tools folder first.");
  process.exit(1);
}
const banner = (src) => `/* Packed copy of ${src}, made by tools/stamp.js. Edit ${src}, not this file. */\n`;
const packJs = async (src, text) => {
  const r = await terser.minify(text, {
    ecma: 2020, module: false, toplevel: false,
    compress: { keep_fnames: true, keep_classnames: true },
    mangle: { keep_fnames: true, keep_classnames: true },
    format: { comments: false, preamble: banner(src).trim() },
  });
  return r.code + "\n";
};
const packCss = (src, text) => banner(src) + csso.minify(text, { restructure: false, comments: false }).css + "\n";

let bad = 0;
const put = (f, next, why) => {
  if (readOr(f) === next) return;
  bad++;
  if (check) { console.log(`${f}: ${why}`); return; }
  fs.writeFileSync(path.join(ROOT, f), next);
  console.log(`${f}: written`);
};
const link = (text, name, h) => text.replace(new RegExp(name.replace(/\./g, "\\.") + "\\?v=[0-9a-f]+", "g"), `${name}?v=${h}`);

(async () => {
  // 1. admin.js -> admin.min.js with its build id.
  const ADMIN_ID_RE = /^window\.ADMIN_BUILD = "[0-9a-f]*";$/m;
  let admin = read("admin.js");
  if (!ADMIN_ID_RE.test(admin)) { console.log("admin.js: the window.ADMIN_BUILD line is missing"); process.exit(1); }
  const ZERO = "0000000000";
  const adminZero = await packJs("admin.js", admin.replace(ADMIN_ID_RE, `window.ADMIN_BUILD = "${ZERO}";`));
  const slot = `window.ADMIN_BUILD="${ZERO}"`;
  if (adminZero.split(slot).length !== 2) { console.log(`admin.min.js: expected one ${slot} in the packed copy`); process.exit(1); }
  const id = sha(adminZero);
  admin = admin.replace(ADMIN_ID_RE, `window.ADMIN_BUILD = "${id}";`);
  put("admin.js", admin, `window.ADMIN_BUILD should be "${id}"`);
  put("admin.min.js", adminZero.replace(slot, `window.ADMIN_BUILD="${id}"`), "stale (run node tools/stamp.js)");

  // 2. app.js links to admin.min.js; then app.js -> app.min.js.
  let app = read("app.js");
  if (!/admin\.min\.js\?v=[0-9a-f]+/.test(app)) { console.log("app.js: the admin.min.js?v= link is missing"); process.exit(1); }
  app = link(app, "admin.min.js", id);
  put("app.js", app, `admin.min.js?v= should be ${id}`);
  const appMin = await packJs("app.js", app);
  put("app.min.js", appMin, "stale (run node tools/stamp.js)");

  // 3. app.css -> app.min.css.
  const cssMin = packCss("app.css", read("app.css"));
  put("app.min.css", cssMin, "stale (run node tools/stamp.js)");

  // 4. index.html links to the packed copies.
  let page = read("index.html");
  for (const [name, text] of [["app.min.js", appMin], ["app.min.css", cssMin]]) {
    if (!page.includes(`${name}?v=`)) { console.log(`index.html: the ${name}?v= link is missing`); process.exit(1); }
    page = link(page, name, sha(text));
  }
  put("index.html", page, "app.min.js / app.min.css links out of date");

  if (check) { console.log(bad ? "out of date: run node tools/stamp.js" : "packed copies and links up to date"); process.exit(bad ? 1 : 0); }
  if (!bad) console.log("packed copies and links up to date");
})().catch((e) => { console.error(e); process.exit(1); });
