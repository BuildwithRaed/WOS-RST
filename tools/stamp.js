// Keeps the "?v=<hash>" on app.js / app.css / admin.js in step with their contents.
// Not part of the site (nothing loads it); run it with Node after editing those files:
//   node tools/stamp.js          -> updates the links in admin.js / app.js / index.html
//   node tools/stamp.js --check  -> only says whether they are right (exit code 1 if not)
// The hash is the first 10 hex digits of the file's SHA-256. admin.js is done first
// (app.js links to it), then app.js and app.css (index.html links to them).
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const ROOT = path.join(__dirname, "..");
const check = process.argv.includes("--check");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const hashOf = (f) => crypto.createHash("sha256").update(fs.readFileSync(path.join(ROOT, f))).digest("hex").slice(0, 10);
let bad = 0;
const fix = (host, name) => {
  if (!fs.existsSync(path.join(ROOT, name))) return;
  const h = hashOf(name);
  const text = read(host);
  const re = new RegExp(name.replace(".", "\\.") + "\\?v=[0-9a-f]+", "g");
  const found = text.match(re) || [];
  if (!found.length) return;
  const next = text.replace(re, `${name}?v=${h}`);
  if (next === text) return;
  bad++;
  if (check) { console.log(`${host}: ${found[0]} should be ${name}?v=${h}`); return; }
  fs.writeFileSync(path.join(ROOT, host), next);
  console.log(`${host}: ${name}?v=${h}`);
};
fix("app.js", "admin.js");
fix("index.html", "app.js");
fix("index.html", "app.css");
if (check) { console.log(bad ? "out of date" : "all links up to date"); process.exit(bad ? 1 : 0); }
if (!bad) console.log("all links up to date");
