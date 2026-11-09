// WOS RST: the Admin page (owner only). Loaded by loadAdminCode() in app.js the
// first time Admin opens, after app.js, as a plain script: everything here can
// use app.js's functions and variables, and app.js reaches these only through
// renderAdminPage() (the stub there calls renderAdminPageMain()).
// Keep it that way: a function other pages call belongs in app.js.
// Build id: checked by loadAdminCode() (written by tools/stamp.js, don't edit).
window.ADMIN_BUILD = "51a6a9b7e5";

// ============================================================
// ADMIN PAGE
// Direct editor for the underlying database tables that drive
// Experts (roster/affinity/skills/research) and Pets. Lets the
// user add brand-new experts/pets and fix any stat data without
// needing to ask Claude to run SQL.
// ============================================================
// Admin sections, grouped. icon / desc / words feed the cards and the search.
const ADMIN_GROUPS = [
  { key: "site", label: "Site" },
  { key: "game", label: "Game data" },
  { key: "packs", label: "Packs & Budgets" },
  { key: "rules", label: "Rules & Timeline" },
];
const ADMIN_TABLES = {
  visibility: { label: "Visibility", group: "site", icon: "👁", desc: "Hide pages, experts, pets", words: "hide unhide visitor access" },
  backup: { label: "Backup & Restore", group: "site", icon: "💾", desc: "Download all Admin data, restore it", words: "backup restore save file export import undo" },
  languages: { label: "Languages & Texts", group: "site", icon: "🌐", desc: "Languages, translations, download / upload", words: "language translate translation text arabic korean csv upload download" },
  menu: { label: "Menu & pages", group: "site", icon: "☰", desc: "Names, order, groups, notes", words: "menu nav rename order group note page" },
  contact: { label: "Contact us", group: "site", icon: "✉", desc: "Email and message", words: "email" },
  currencies: { label: "Currencies", group: "site", icon: "¤", desc: "Rates and store prices", words: "money qar usd price" },
  experts: { label: "Experts", group: "game", icon: "🧠", desc: "Roster, affinity, skills, research", words: "expert sigil affinity skill" },
  pets: { label: "Pets", group: "game", icon: "🐾", desc: "Pets, refine, marks", words: "pet refine marks" },
  chiefgears: { label: "Chief Gear", group: "game", icon: "🛡", desc: "Tiers and set bonus", words: "chief gear alloy polish design" },
  charm: { label: "Chief Charm", group: "game", icon: "💎", desc: "Charm levels", words: "charm guides designs secrets" },
  herogearprog: { label: "Heroes Gears", group: "game", icon: "🔧", desc: "Mastery, enhance, mithril", words: "hero gear mastery enhance mithril" },
  heroes: { label: "Heroes", group: "game", icon: "⚔", desc: "Heroes, Gen, shards", words: "hero gen rarity shards widgets stars" },
  herostars: { label: "Heroes Special Skills", group: "game", icon: "✨", desc: "Special skill bonuses", words: "skill" },
  dashsources: { label: "Dashboard sources", group: "game", icon: "📊", desc: "What the Dashboard adds up, new bonus sources", words: "dashboard source stat buff bonus category count order breakdown total" },
  vip: { label: "VIP", group: "game", icon: "👑", desc: "VIP tiers", words: "vip" },
  alliance: { label: "Alliance", group: "game", icon: "🏰", desc: "Facility and tech", words: "facility alliance tech" },
  centerresearch: { label: "Research", group: "game", icon: "🔬", desc: "Research Center, T11, T12", words: "research t11 t12 helios" },
  skins: { label: "Skins", group: "game", icon: "🎨", desc: "Gallery, album, skins, islands", words: "skin gallery album islands" },
  // Opens the "Globe Level extra skins" rule on its own.
  globe: { label: "Globe Level", group: "game", icon: "🔮", desc: "Skins that come with each Globe Level", words: "globe level frost sphere skin cosmetics" },
  rules: { label: "Rules & Timeline", group: "rules", icon: "📅", desc: "State days, Gen, events, trades, chests", words: "rules timeline state day unlock gen svs koi trade chest widget hall heroes gems lab advanced marks" },
  // Research unlock rules have their own screen.
  reslocks: { label: "Research unlock rules", group: "rules", icon: "🔓", desc: "Which research needs which first", words: "research unlock rule need prerequisite before t12 t11 order can reach" },
  // These are full pages of their own; the Admin entry just opens them.
  packs: { label: "Packs", group: "packs", icon: "📦", desc: "Pack tables (opens the page)", tab: "packs", words: "pack" },
  packres: { label: "Pack Resources", group: "packs", icon: "🧺", desc: "Columns used in packs", words: "resource column chest" },
  backpackitems: { label: "Backpack Items", group: "packs", icon: "🎒", desc: "Items in the Backpack", words: "backpack item" },
  items: { label: "Items", group: "packs", icon: "🏷", desc: "Pictures, short names, pages, speedup minutes", words: "item picture icon short name page link speedup minutes chest counts gives sigils" },
  budgets: { label: "Budgets", group: "packs", icon: "💰", desc: "Opens the page", tab: "budgets", words: "budget" },
  backpack: { label: "Backpack", group: "packs", icon: "🎒", desc: "Opens the page", tab: "backpack", words: "inventory" },
};
function admPushSection(key) {
  if (history.state && history.state.tab === "adminpage" && history.state.adm === key) return;
  history.pushState({ tab: "adminpage", adm: key }, "", location.pathname + location.search);
}
let ADMIN_SEARCH = "";
let ADMIN_DRAWING = Promise.resolve(); // one section draws at a time
let ADMIN_ACTIVE_EXPERT = null;
let ADMIN_ACTIVE_PET = null;
let ADMIN_ACTIVE_PROGRESSION = null;
let ADMIN_ACTIVE_HERO_STAR_COL = null;
let ADMIN_HERO_GEN = null; // Admin → Heroes: the Gen shown
let ADMIN_ACTIVE_EXPERTS_SUBTAB = "roster";
let ADMIN_ACTIVE_PETS_SUBTAB = "pets";
let ADMIN_ACTIVE_CHIEFGEARS_SUBTAB = "chiefgearprog";
let ADMIN_ACTIVE_SKINS_SUBTAB = "skingallery";
let ADMIN_ACTIVE_ALLIANCE_SUBTAB = "facility";

// Admin home = design A1: a "Needs you" card (cheap facts
// only: backup age from this browser, untranslated texts counted the last time
// Languages & Texts was opened, rules changed from built-in), search, small
// 2-a-row cards with the page's picture, a short line and a health dot (amber =
// something to look at), game data first ("Show N more"), Site folded, and the
// sections that open a page as one chip row.
const ADMIN_PIC = {
  experts: "icons/quick/experts.png", pets: "icons/quick/pets.png", chiefgears: "icons/quick/chief-gear.png", charm: "icons/charms/charm-infantry-16.webp",
  herogearprog: "icons/quick/hero-gear.png", heroes: "icons/quick/heroes.png", herostars: "icons/quick/heroes.png", vip: "icons/quick/vip.png",
  alliance: "icons/quick/facility.png", centerresearch: "icons/quick/research.png", skins: "icons/quick/castle.png", globe: "icons/quick/decoration.png",
  dashsources: "icons/logo-64.webp", rules: "icons/quick/events.png", reslocks: "icons/quick/microscope.png", packs: "icons/quick/gift.png",
  budgets: "icons/quick/calculator.png",
};
const ADMIN_SHORT = {
  visibility: "Pages, experts, pets", backup: "Download · restore", languages: "Texts · CSV", menu: "Names · order · notes", contact: "Email · message", currencies: "Rates · store prices",
  experts: "Roster · skills · research", pets: "Pets · refine · marks", chiefgears: "Tiers · set bonus", charm: "Charm levels", herogearprog: "Mastery · Enhance",
  heroes: "Gen · shards · stars", herostars: "Skill bonuses", dashsources: "What it adds up", vip: "VIP tiers", alliance: "Facility · tech", centerresearch: "RC · T11 · T12",
  skins: "Gallery · islands", globe: "Globe skins", rules: "State days · trades", reslocks: "Research needs", packres: "Pack columns", backpackitems: "Backpack list", items: "Pictures · minutes",
};
// Sections whose level tables can have "Upcoming" rows (site_config upcoming_levels).
const ADMIN_UP_MATCH = { charm: /^charm/, pets: /^pet/, experts: /expert/, chiefgears: /chief/, herogearprog: /hero_gear|progression/, vip: /vip/, centerresearch: /research|t11|t12/ };
function adminBackupAge() {
  let last = null; try { last = localStorage.getItem("admin_last_backup"); } catch (e) { /* blocked */ }
  if (!last) return null;
  const d = Math.floor((Date.now() - new Date(last).getTime()) / 86400000);
  return isFinite(d) ? Math.max(0, d) : null;
}
function adminLangMissing() { try { const o = JSON.parse(localStorage.getItem("admin_lang_missing") || "null"); return o && typeof o.n === "number" ? o : null; } catch (e) { return null; } }
// Line + dot for one section card (cheap: settings already loaded).
function adminCardInfo(k) {
  const up = siteConfig("upcoming_levels", {}) || {};
  let line = ADMIN_SHORT[k] || ADMIN_TABLES[k].desc, warn = false;
  if (k === "rules") { const n = Object.keys(gameRulesSaved()).length; if (n) line = t("admh_n_changed").replace("{n}", n); }
  if (k === "backup") { const d = adminBackupAge(); line = d == null ? t("admh_bk_never") : d === 0 ? t("admh_bk_today") : t("admh_bk_days").replace("{n}", d); warn = d == null || d > 7; }
  if (k === "languages") { const m = adminLangMissing(); const shown = languageList(true).filter((l) => !l.hidden).length; line = t("admh_n_langs").replace("{n}", shown); if (m && m.n > 0) { line = t("admh_n_missing").replace("{n}", m.n.toLocaleString()); warn = true; } }
  if (k === "visibility" && typeof UI_HIDDEN === "object" && UI_HIDDEN) { const n = Object.keys(UI_HIDDEN).filter((x) => UI_HIDDEN[x]).length; if (n) line = t("admh_n_hidden").replace("{n}", n); }
  if (ADMIN_UP_MATCH[k]) {
    let n = 0; Object.keys(up).forEach((tb) => { if (ADMIN_UP_MATCH[k].test(tb) && Array.isArray(up[tb])) n += up[tb].length; });
    if (k === "pets") { const p = siteConfig("upcoming_pets", []); if (Array.isArray(p) && p.length) { line = t("admh_n_up_pets").replace("{n}", p.length); warn = true; } }
    if (n) { line = t("admh_n_up_rows").replace("{n}", n); warn = true; }
  }
  return { line, warn };
}
function adminHomeHtml() {
  const pic = (k) => ADMIN_PIC[k] ? `<img src="${ADMIN_PIC[k]}" alt="" loading="lazy" />` : `<span>${ADMIN_TABLES[k].icon}</span>`;
  const card = (k, extra) => { const e = ADMIN_TABLES[k], i = adminCardInfo(k); return `<button type="button" class="admh-c${extra ? " " + extra : ""}" data-admintable="${k}" title="${esc(e.desc)}"><span class="admh-pic">${pic(k)}</span><span class="admh-t"><b>${esc(e.label)}</b><small>${esc(i.line)}</small></span><i class="admh-dot${i.warn ? " warn" : ""}" aria-hidden="true"></i></button>`; };
  const keys = (g) => Object.keys(ADMIN_TABLES).filter((k) => ADMIN_TABLES[k].group === g && !ADMIN_TABLES[k].tab);
  const gl = (g) => (ADMIN_GROUPS.find((x) => x.key === g) || {}).label || g;
  // Needs you
  const rows = [];
  const bk = adminBackupAge();
  rows.push({ warn: bk == null || bk > 7, b: bk == null ? t("admh_need_bk_none") : bk === 0 ? t("admh_need_bk_today") : t("admh_need_bk").replace("{n}", bk), s: t("admh_need_bk_sub"), go: "backup", btn: t("admh_backup_btn") });
  const lm = adminLangMissing();
  if (lm && lm.n > 0) rows.push({ warn: true, b: t("admh_need_texts").replace("{n}", lm.n.toLocaleString()), s: lm.lang ? t("admh_need_texts_sub").replace("{lang}", lm.lang) : "", go: "languages", btn: t("admh_texts_btn") });
  const rc = Object.keys(gameRulesSaved()).length;
  if (rc) rows.push({ warn: false, b: t("admh_need_rules").replace("{n}", rc), s: t("admh_need_rules_sub"), go: "rules", btn: t("admh_rules_btn") });
  const needs = `<div class="admh-needs"><div class="admh-k">${esc(t("admh_needs"))}</div>${rows.map((r) => `<div class="admh-nr"><i class="admh-dot${r.warn ? " warn" : ""}" aria-hidden="true"></i><span class="admh-nt"><b>${esc(r.b)}</b>${r.s ? `<small>${esc(r.s)}</small>` : ""}</span><button type="button" class="admh-nb${r.warn ? " warn" : ""}" data-admintable="${r.go}">${esc(r.btn)} &#8250;</button></div>`).join("")}</div>`;
  // Main game data first (owner's mock-up); every section is shown.
  const MAIN = ["experts", "pets", "chiefgears", "charm", "herogearprog", "heroes", "centerresearch", "vip"];
  const game = keys("game").sort((a, b) => (MAIN.indexOf(a) < 0 ? 99 : MAIN.indexOf(a)) - (MAIN.indexOf(b) < 0 ? 99 : MAIN.indexOf(b)));
  const grid = (g, list) => `<div class="admh-g" data-admhg="${g}"><div class="admh-gk">${esc(gl(g))} <span>${list.length}</span></div><div class="admh-cards">${list.map((k) => card(k)).join("")}</div></div>`;
  const site = keys("site");
  const pages = Object.keys(ADMIN_TABLES).filter((k) => ADMIN_TABLES[k].tab);
  return `<div class="admh">${needs}<div class="admh-sslot"></div>
    ${grid("game", game)}${grid("packs", keys("packs"))}${grid("rules", keys("rules"))}
    <div class="admh-g admh-site" data-admhg="site"><div class="admh-gk">${esc(gl("site"))} <span>${site.length}</span></div><div class="admh-cards">${site.map((k) => card(k)).join("")}</div></div>
    <div class="admh-g admh-pages" data-admhg="pages"><div class="admh-gk">${esc(t("admh_open_page"))}</div><div class="admh-chips">${pages.map((k) => `<button type="button" class="admh-chip" data-admintable="${k}">${ADMIN_PIC[k] ? `<img src="${ADMIN_PIC[k]}" alt="" />` : `<span>${ADMIN_TABLES[k].icon}</span>`}${esc(ADMIN_TABLES[k].label)} &#8599;</button>`).join("")}</div></div>
    <div class="meta admh-none" hidden>No match</div></div>`;
}
function adminHomeFilter(root, qq) {
  const h = root.querySelector(".admh"); if (!h) return;
  h.classList.toggle("q", !!qq);
  let any = false;
  h.querySelectorAll(".admh-g").forEach((g) => { const vis = [...g.querySelectorAll(".admh-cards [data-admintable], .admh-chips [data-admintable]")].some((b) => !b.hidden); g.hidden = !vis; if (vis) any = true; });
  h.querySelector(".admh-needs").hidden = !!qq;
  h.querySelector(".admh-none").hidden = any;
}
async function renderAdminPageMain() {
  // Admin edits the data other pages keep in memory for the visit.
  dropKeptGameData();
  const cur = ADMIN_ACTIVE_TABLE && ADMIN_TABLES[ADMIN_ACTIVE_TABLE] ? ADMIN_ACTIVE_TABLE : null;
  const q = ADMIN_SEARCH.trim().toLowerCase();
  const match = (k) => { const e = ADMIN_TABLES[k]; return !q || `${e.label} ${e.desc} ${e.words || ""}`.toLowerCase().includes(q); };
  const keysOf = (g) => Object.keys(ADMIN_TABLES).filter((k) => ADMIN_TABLES[k].group === g && match(k));
  const side = ADMIN_GROUPS.map((g) => { const ks = keysOf(g.key); return ks.length ? `<div class="adm-gk">${esc(g.label)}</div>${ks.map((k) => `<button type="button" class="adm-it${k === cur ? " on" : ""}" data-admintable="${k}"><i>${ADMIN_TABLES[k].icon}</i>${esc(ADMIN_TABLES[k].label)}${ADMIN_TABLES[k].tab ? ` <span class="adm-ext">&#8599;</span>` : ""}</button>`).join("")}` : ""; }).join("") || `<div class="meta" style="padding:8px;">No match</div>`;
  const home = cur ? "" : adminHomeHtml();
  const grp = cur ? ADMIN_GROUPS.find((g) => g.key === ADMIN_TABLES[cur].group) : null;
  content.innerHTML = `
    <div class="adm${cur ? " adm-open" : ""}">
      <div class="adm-top">
        ${cur ? `<button type="button" class="adm-back" data-adminhome aria-label="back">&#8249;</button>` : ""}
        <h2>${cur ? `<span class="adm-title-sec">${esc(ADMIN_TABLES[cur].label)}</span><span class="adm-title-main">&#9881; Admin</span>` : "&#9881; Admin"}</h2>
        ${cur ? "" : `<p class="desc adm-desc">${esc(t("admh_desc"))}</p>`}
        <input type="search" class="adm-search" data-adminsearch placeholder="Search admin…" value="${esc(ADMIN_SEARCH)}" />
        <button type="button" class="btn ghost small adm-bkbtn" data-admintable="backup">&#8615; Backup</button>
      </div>
      <div class="adm-layout">
        <nav class="adm-side">${side}</nav>
        <div class="adm-main">
          <div class="meta adm-nomatch" hidden>No match</div>
          ${cur ? `<div class="adm-crumb">${esc(grp ? grp.label : "")} &rsaquo;</div><div class="adm-h">${esc(ADMIN_TABLES[cur].label)}</div><div id="adminBody"></div>` : `<div class="adm-home">${home}</div>`}
        </div>
      </div>
    </div>`;
  const open = (key) => {
    const entry = ADMIN_TABLES[key];
    if (entry && entry.tab) { goToTab(entry.tab); return; }
    if (!admConfirmLeave()) return;
    admPushSection(key);
    ADMIN_ACTIVE_TABLE = key;
    renderAdminPage();
    window.scrollTo(0, 0);
  };
  content.querySelectorAll("[data-admintable]").forEach((btn) => btn.addEventListener("click", () => open(btn.dataset.admintable)));
  const home_ = content.querySelector("[data-adminhome]");
  if (home_) home_.addEventListener("click", () => {
    if (!admConfirmLeave()) return;
    // The section has its own history step: going back to it is the same as the browser's Back.
    if (history.state && history.state.tab === "adminpage" && history.state.adm === ADMIN_ACTIVE_TABLE) { ADMIN_SKIP_CONFIRM = true; history.back(); return; }
    ADMIN_ACTIVE_TABLE = null; renderAdminPage(); window.scrollTo(0, 0);
  });
  const search = content.querySelector("[data-adminsearch]");
  const sslot = content.querySelector(".admh-sslot");
  if (sslot) sslot.appendChild(search);
  if (!cur && ADMIN_SEARCH.trim()) adminHomeFilter(content, ADMIN_SEARCH.trim().toLowerCase());
  search.addEventListener("input", () => {
    ADMIN_SEARCH = search.value;
    // Redraw only the lists, so typing keeps the focus.
    const qq = ADMIN_SEARCH.trim().toLowerCase();
    content.querySelectorAll(".adm-side [data-admintable], .adm-home [data-admintable]").forEach((b) => { const e = ADMIN_TABLES[b.dataset.admintable]; b.hidden = !!qq && !`${e.label} ${e.desc} ${e.words || ""}`.toLowerCase().includes(qq); });
    adminHomeFilter(content, qq);
    content.querySelectorAll(".adm-side .adm-gk").forEach((h) => { const next = h.nextElementSibling; const list = next && next.classList.contains("adm-cards") ? [...next.children] : (() => { const a = []; let n = h.nextElementSibling; while (n && !n.classList.contains("adm-gk")) { a.push(n); n = n.nextElementSibling; } return a; })(); h.hidden = list.length > 0 && list.every((x) => x.hidden); });
    const nm = content.querySelector(".adm-nomatch");
    if (nm) nm.hidden = !qq || [...content.querySelectorAll(".adm-side [data-admintable]")].some((b) => !b.hidden);
  });
  search.addEventListener("keydown", (e) => { if (e.key !== "Enter") return; const first = [...content.querySelectorAll(".adm-side [data-admintable]")].find((b) => !b.hidden); if (first) open(first.dataset.admintable); });
  if (!cur) return;
  const body = document.getElementById("adminBody");
  // A slow section finishes before the next one draws, so it can't draw or
  // wire buttons over the section that was opened after it.
  const prev = ADMIN_DRAWING;
  let done; ADMIN_DRAWING = new Promise((r) => { done = r; });
  try { await prev; } catch (e) { /* ignore */ }
  try {
    if (!body.isConnected) return;
    await drawAdminSection(cur, body);
  } finally { done(); }
}
// "Add a …" boxes in Admin sections fold into one "+ Add …" button; they open on tap. Watches #adminBody, since sections
// redraw themselves after adding.
function foldAdminAddPanels(root) {
  root.querySelectorAll(".panel").forEach((pnl) => {
    if (pnl.dataset.addfold) return;
    const h = pnl.querySelector(":scope > h2");
    if (!h || !/^Add\b/.test(h.textContent.trim()) || !pnl.querySelector("form, input")) return;
    pnl.dataset.addfold = "1";
    const d = document.createElement("details"); d.className = "adm-addfold";
    const sm = document.createElement("summary"); sm.textContent = "+ " + h.textContent.trim().replace(/^Add (a |an )?(new )?/i, "Add ");
    d.appendChild(sm);
    [...pnl.childNodes].forEach((n) => { if (n !== h) d.appendChild(n); });
    h.remove(); pnl.appendChild(d);
    pnl.classList.add("adm-addpanel");
  });
}
const ADMIN_ADD_OBSERVER = typeof MutationObserver !== "undefined" ? new MutationObserver(() => { const b = document.getElementById("adminBody"); if (b) foldAdminAddPanels(b); }) : null;
async function drawAdminSection(key, body) {
  ADM_EDIT_DIRTY = 0; // a fresh section has no unsaved edits
  if (ADMIN_ADD_OBSERVER) { ADMIN_ADD_OBSERVER.disconnect(); ADMIN_ADD_OBSERVER.observe(body, { childList: true, subtree: true }); }
  if (key === "visibility") await renderAdminVisibility(body);
  else if (key === "menu") await renderAdminMenu(body);
  else if (key === "languages") await renderAdminLanguages(body);
  else if (key === "backup") await renderAdminBackup(body);
  else if (key === "rules") await renderAdminRules(body);
  else if (key === "globe") await renderAdminGlobe(body);
  else if (key === "reslocks") await renderAdminResearchLocks(body);
  else if (key === "experts") await renderAdminExpertsGroup(body);
  else if (key === "pets") await renderAdminPetsGroup(body);
  else if (key === "chiefgears") await renderAdminChiefGearsGroup(body);
  else if (key === "charm") await renderAdminFlatLevels(body, { table: "charm_levels", title: "Chief Charm levels", cols: [
    { key: "level_label", label: "Level", type: "text" },
    { key: "guides_cost", label: "Guides (step)", type: "number" },
    { key: "designs_cost", label: "Designs (step)", type: "number" },
    { key: "secrets_cost", label: "Secrets (step)", type: "number" },
    { key: "cumulative_pct", label: "Cumulative %", type: "number" },
    { key: "sort_order", label: "Order", type: "number" },
  ], orderCol: "sort_order", onSave: () => { CHARM_LEVELS_LOADED = false; } });
  else if (key === "herogearprog") await renderAdminProgression(body, ["Hero Gear Mastery Forging", "Hero Gear Enhancement", "Hero Gear Mithril"]);
  else if (key === "vip") await renderAdminVip(body);
  else if (key === "alliance") await renderAdminAllianceGroup(body);
  else if (key === "centerresearch") await renderAdminResearch(body);
  else if (key === "heroes") await renderAdminHeroes(body);
  else if (key === "packres") await renderAdminPackResources(body);
  else if (key === "backpackitems") await renderAdminBackpackItems(body);
  else if (key === "items") await renderAdminItems(body);
  else if (key === "contact") await renderAdminContact(body);
  else if (key === "currencies") await renderAdminCurrencies(body);
  else if (key === "skins") await renderAdminSkinsGroup(body);
  else if (key === "herostars") await renderAdminHeroStars(body);
  else if (key === "dashsources") await renderAdminDashSources(body);
}

// ---- Menu & pages: rename, order, move between groups, page notes ----
async function renderAdminMenu(body) {
  await ensureSiteConfig();
  const m = menuLayout(), LL = languageList(true), L = LL.map((l) => l.code), LN = Object.fromEntries(LL.map((l) => [l.code, l.name]));
  // Draft of the menu as it is now (DOM order, current names).
  const defKeys = menuDefaults().map((g) => g.key);
  const draft = [...document.querySelectorAll("#topnavGroups .topnav-group")].filter((g) => g.id !== "adminNavGroup").map((g) => ({
    key: g.dataset.group, custom: !defKeys.includes(g.dataset.group),
    label: { ...(NAV_GROUP_LABELS[g.dataset.group] || { en: g.dataset.group }) },
    pages: [...g.querySelectorAll("button[data-tab]")].map((b) => ({ tab: b.dataset.tab, label: { ...(NAV_PAGE_LABELS[b.dataset.tab] || { en: b.dataset.tab }) }, note: { ...((m.notes || {})[b.dataset.tab] || {}) } })),
  }));
  let openNote = null, dirty = false;
  const langInputs = (obj, attr) => `<details class="mn-langs"><summary>${esc(L.filter((k) => k !== "en").map((k) => k.toUpperCase()).join(" · "))}</summary>${L.filter((k) => k !== "en").map((k) => `<label><span>${esc(LN[k])}</span><input type="text" ${attr}="${esc(k)}" value="${esc(obj[k] || "")}" dir="${langDir(k)}" /></label>`).join("")}</details>`;
  const draw = () => {
    body.innerHTML = `
      <p class="desc" style="margin:0 0 12px;">Rename menu groups and pages, change their order, move a page to another group, and add a note under a page's title. To hide a page from visitors use <a href="#" data-admingo="visibility">Visibility</a>. Nothing changes until you press Save.</p>
      ${draft.map((g, gi) => `<div class="mn-group">
        <div class="mn-ghead">
          ${dsHandleHtml(`data-gdrag="${gi}"`)}
          <input type="text" class="mn-gname" data-gname="${gi}" value="${esc(g.label.en || g.key)}" aria-label="Group name" />
          ${g.custom && !g.pages.length ? `<span class="mn-btns"><button type="button" data-gdel="${gi}" aria-label="delete">&#128465;</button></span>` : ""}
        </div>
        <div data-glangs="${gi}">${langInputs(g.label, "data-glang")}</div>
        ${g.pages.length ? g.pages.map((pg, pi) => `<div class="mn-page">
          <div class="mn-prow">
            ${dsHandleHtml(`data-pdrag="${gi}"`)}
            <input type="text" data-pname="${gi}|${pi}" value="${esc(pg.label.en || pg.tab)}" aria-label="Page name" />
            <select data-pgroup="${gi}|${pi}" aria-label="Group">${draft.map((x, xi) => `<option value="${xi}" ${xi === gi ? "selected" : ""}>${esc(x.label.en || x.key)}</option>`).join("")}</select>
            <span class="mn-btns"><button type="button" data-pnote="${esc(pg.tab)}" class="${Object.values(pg.note).some((v) => v) ? "on" : ""}" title="Page note">&#128221;</button></span>
          </div>
          <div data-plangs="${gi}|${pi}">${langInputs(pg.label, "data-plang")}</div>
          ${openNote === pg.tab ? `<div class="mn-note">${L.map((k) => `<label><span>Note · ${LN[k]}</span><textarea rows="2" data-pnotetext="${gi}|${pi}|${k}" dir="${langDir(k)}">${esc(pg.note[k] || "")}</textarea></label>`).join("")}<div class="meta" style="font-size:11px;">Shown in a box under the page title. Empty = no note.</div></div>` : ""}
        </div>`).join("") : `<div class="meta" style="font-size:12px; padding:6px 0;">No pages — move pages here or delete the group.</div>`}
      </div>`).join("")}
      <div class="mn-foot">
        <button type="button" class="btn ghost small" data-gadd>+ Add group</button>
        <span style="flex:1"></span>
        <button type="button" class="btn ghost small" data-menureset>Reset to default</button>
        <button type="button" class="btn small" data-menusave>Save</button>
      </div>`;
    const go = body.querySelector("[data-admingo]");
    if (go) go.addEventListener("click", (e) => { e.preventDefault(); if (!admConfirmLeave()) return; admPushSection("visibility"); ADMIN_ACTIVE_TABLE = "visibility"; renderAdminPage(); });
    body.querySelectorAll("[data-gname]").forEach((inp) => inp.addEventListener("input", () => { draft[+inp.dataset.gname].label.en = inp.value; dirty = true; }));
    body.querySelectorAll("[data-glangs]").forEach((w) => w.querySelectorAll("[data-glang]").forEach((inp) => inp.addEventListener("input", () => { draft[+w.dataset.glangs].label[inp.dataset.glang] = inp.value; dirty = true; })));
    body.querySelectorAll("[data-pname]").forEach((inp) => inp.addEventListener("input", () => { const [gi, pi] = inp.dataset.pname.split("|").map(Number); draft[gi].pages[pi].label.en = inp.value; dirty = true; }));
    body.querySelectorAll("[data-plangs]").forEach((w) => w.querySelectorAll("[data-plang]").forEach((inp) => inp.addEventListener("input", () => { const [gi, pi] = w.dataset.plangs.split("|").map(Number); draft[gi].pages[pi].label[inp.dataset.plang] = inp.value; dirty = true; })));
    body.querySelectorAll("[data-pnotetext]").forEach((ta) => ta.addEventListener("input", () => { const [gi, pi, k] = ta.dataset.pnotetext.split("|"); draft[+gi].pages[+pi].note[k] = ta.value; dirty = true; }));
    // Drag ⋮⋮ to change the order of groups / of pages in a group (saved with Save).
    const reorder = (list, from, to) => { const [x] = list.splice(from, 1); list.splice(to, 0, x); dirty = true; draw(); };
    body.querySelectorAll("[data-gdrag]").forEach((h) => dragSort(h, { row: ".mn-group", done: (r, from, to) => reorder(draft, from, to), refocus: (r, to) => body.querySelectorAll("[data-gdrag]")[to]?.focus() }));
    body.querySelectorAll("[data-pdrag]").forEach((h) => dragSort(h, { row: ".mn-page", done: (r, from, to) => reorder(draft[+h.dataset.pdrag].pages, from, to), refocus: (r, to) => body.querySelectorAll(`[data-pdrag="${h.dataset.pdrag}"]`)[to]?.focus() }));
    body.querySelectorAll("[data-gdel]").forEach((b) => b.addEventListener("click", () => { draft.splice(+b.dataset.gdel, 1); dirty = true; draw(); }));
    body.querySelectorAll("[data-pgroup]").forEach((sel) => sel.addEventListener("change", () => { const [gi, pi] = sel.dataset.pgroup.split("|").map(Number); const [x] = draft[gi].pages.splice(pi, 1); draft[+sel.value].pages.push(x); dirty = true; draw(); }));
    body.querySelectorAll("[data-pnote]").forEach((b) => b.addEventListener("click", () => { openNote = openNote === b.dataset.pnote ? null : b.dataset.pnote; draw(); }));
    body.querySelector("[data-gadd]").addEventListener("click", () => {
      const name = (prompt("Name of the new menu group:") || "").trim();
      if (!name) return;
      if (draft.some((g) => g.key === name || g.label.en === name) || name === "Admin") { toast("A group with that name already exists", true); return; }
      draft.push({ key: name, custom: true, label: { en: name }, pages: [] }); dirty = true; draw();
    });
    body.querySelector("[data-menusave]").addEventListener("click", async (ev) => {
      const btn = ev.currentTarget; btn.disabled = true;
      const keep = (l, d) => { const o = {}; L.forEach((k) => { const v = String(l[k] || "").trim(); if (v && v !== String((d || {})[k] || "")) o[k] = v; }); return o; };
      const value = { groups: draft.map((g) => { const l = keep(g.label, NAV_GROUP_LABELS_DEFAULT[g.key] || (g.custom ? {} : { en: g.key })); return Object.keys(l).length ? { key: g.key, label: l } : { key: g.key }; }), pages: {}, order: [], notes: {} };
      draft.forEach((g) => g.pages.forEach((pg) => {
        value.order.push(pg.tab);
        const l = keep(pg.label, NAV_PAGE_LABELS_DEFAULT[pg.tab]);
        const defGroup = (menuDefaults().find((x) => x.pages.includes(pg.tab)) || {}).key;
        if (Object.keys(l).length || g.key !== defGroup) value.pages[pg.tab] = { ...(g.key !== defGroup ? { group: g.key } : {}), ...(Object.keys(l).length ? { label: l } : {}) };
        const n = {}; L.forEach((k) => { const v = String(pg.note[k] || "").trim(); if (v) n[k] = v; });
        if (Object.keys(n).length) value.notes[pg.tab] = n;
      }));
      try {
        await saveSiteConfig("menu_layout", value);
        afterMenuChange(); dirty = false; toast("Menu saved");
      } catch (err) { toast(err.message || "Couldn't save", true); }
      btn.disabled = false;
    });
    body.querySelector("[data-menureset]").addEventListener("click", async () => {
      if (!confirm("Put the menu back to the built-in names, order and groups, and remove all page notes?")) return;
      try { await saveSiteConfig("menu_layout", {}); afterMenuChange(); toast("Menu reset"); renderAdminMenu(body); } catch (err) { toast(err.message || "Couldn't save", true); }
    });
  };
  draw();
  void dirty;
}
function afterMenuChange() {
  applyMenuLayout(); applyNavLanguage(); applyPageVisibility();
  document.querySelectorAll("button[data-tab]").forEach((x) => x.classList.toggle("active", x.dataset.tab === TAB));
}
const GAME_RULE_GROUPS = [
  { key: "timeline", label: "State timeline" },
  { key: "heroes", label: "Heroes, shards & widgets" },
  { key: "trades", label: "Trades & chests" },
  { key: "packs", label: "Packs & lab" },
  { key: "research", label: "Research trees" },
  { key: "pages", label: "Pages" },
  { key: "islands", label: "Islands" },
];
// Saves one rule from another Admin screen (same as its Save in Rules & Timeline).
async function saveGameRule(key, value) {
  const r = gameRules().find((x) => x.key === key);
  if (!r) return;
  const next = { ...gameRulesSaved() };
  if (JSON.stringify(value) === JSON.stringify(r.def)) delete next[key]; else next[key] = value;
  await saveSiteConfig("game_rules", next);
  afterGameRulesChange();
}
// After a rule changes: drop everything worked out from the old numbers.
function afterGameRulesChange() {
  applyGameRules();
  NEW_GEN_BASE_MEMO = null;
  if (typeof NEW_GEN_MEMO !== "undefined") NEW_GEN_MEMO.clear();
  if (typeof PACK_PLAN_CACHE !== "undefined") { PACK_PLAN_CACHE.clear(); PACK_EARLIEST_CACHE.clear(); }
  if (typeof TRADE_EXTRA_SIG !== "undefined") TRADE_EXTRA_SIG = "";
  plannerRestart(); // a fresh worker (requests still waiting are sent to it again)
  if (typeof budgetInvalidate === "function") budgetInvalidate();
  if (typeof PACK_GROUPS_CACHE !== "undefined") { PACK_GROUPS_GEN++; PACK_GROUPS_CACHE = { tables: null, map: new Map(), perTable: new Map() }; }
  dropKeptGameData();
}

// ---- Admin editor ----
let ADMIN_RULE_OPEN = null;
// Admin → Globe Level: one row per
// level (City Skin + extra skins), ✎ opens a sheet to pick them from the skins
// list, "+ Add level" for levels the game adds. Saved as rule "globeLevels".
async function renderAdminGlobe(body) {
  // Skin gallery skins only (its categories in their page order), not Islands / Alliance Tech.
  let cat = [];
  try {
    const [rows, pcs] = await Promise.all([sb(`skins_catalog?select=name,category,image_url&order=name.asc`), sb(`skin_page_categories?page=eq.gallery&select=category,sort_order&order=sort_order.asc`)]);
    const order = pcs.map((c) => c.category);
    cat = rows.filter((x) => order.includes(x.category)).sort((x, y) => order.indexOf(x.category) - order.indexOf(y.category) || x.name.localeCompare(y.name));
  } catch (e) { cat = []; }
  const byName = new Map(cat.map((x) => [x.name, x]));
  const builtIn = new Set(((gameRules().find((r) => r.key === "globeLevels") || {}).def || []).map((r) => r.level));
  const pic = (n, cls = "gl-pic") => { const x = byName.get(n); return x && x.image_url ? `<img class="${cls}" src="${esc(x.image_url)}" alt="" loading="lazy" />` : `<span class="${cls} gl-nopic">?</span>`; };
  const nameHtml = (n) => `${esc(n)}${cat.length && !byName.has(n) ? ` <span class="gl-miss" title="No skin with this name in Admin → Skins">not found</span>` : ""}`;
  const chip = (n, x) => `<span class="gl-chip">${pic(n, "gl-cpic")}<span>${nameHtml(n)}</span>${x ? `<button type="button" data-glx="${esc(n)}" aria-label="Remove">&#10005;</button>` : ""}</span>`;
  const store = async (rows, msg) => {
    try { await saveGameRule("globeLevels", rows); toast(msg || "Saved"); } catch (err) { toast(err.message || "Couldn't save", true); }
    draw();
  };
  const current = () => GLOBE_LEVELS.map((r) => ({ level: r.level, city: r.city, extra: r.extra.slice() }));
  const draw = () => {
    const changed = gameRulesSaved().globeLevels != null;
    body.innerHTML = `<div class="gl-card">
      <p class="desc" style="margin:0 0 10px;">Each level gives its City Skin plus any extra skins. Picking a level on Skin gallery counts them as owned.</p>
      ${GLOBE_LEVELS.map((r) => `<div class="gl-row">
        <span class="gl-lv">Lv ${r.level}</span>
        <span class="gl-main"><span class="gl-city">${r.city ? `${pic(r.city)}<b>${nameHtml(r.city)}</b>` : `<span class="gl-miss">No City Skin picked</span>`}</span>
          <span class="gl-extra">${r.extra.length ? r.extra.map((n) => chip(n)).join("") : `<span class="meta">— no extra skins</span>`}</span></span>
        <button type="button" class="gl-ed" data-gled="${r.level}" aria-label="Edit level ${r.level}">&#9998;</button>
      </div>`).join("")}
      <button type="button" class="gl-add" data-gladd>+ Add level</button>
      <div class="gl-foot"><button type="button" class="btn ghost small" data-glreset ${changed ? "" : "disabled"}>Reset to built-in</button><span class="meta" style="font-size:11.5px;">${changed ? "Changed · saved for everyone" : "Built-in levels"}</span></div>
      <div class="gl-note meta">New levels show in Skin gallery's Globe Level list for everyone after Save.</div>
    </div>`;
    body.querySelectorAll("[data-gled]").forEach((b) => b.addEventListener("click", () => openLevel(Number(b.dataset.gled))));
    body.querySelector("[data-gladd]").addEventListener("click", () => openLevel(Math.max(0, ...GLOBE_LEVELS.map((r) => r.level)) + 1, true));
    body.querySelector("[data-glreset]").addEventListener("click", async () => {
      if (!confirm("Put the built-in Globe Levels back (Frost Sphere I–VI and their extra skins)?")) return;
      const next = { ...gameRulesSaved() }; delete next.globeLevels;
      try { await saveSiteConfig("game_rules", next); afterGameRulesChange(); toast("Reset to built-in"); } catch (err) { toast(err.message || "Couldn't save", true); }
      draw();
    });
  };
  const sheet = (id) => {
    let m = document.getElementById(id);
    if (!m) { m = document.createElement("div"); m.id = id; m.className = "modal-overlay adm-sheet-wrap gs-wrap"; document.body.appendChild(m); }
    m.style.display = "flex";
    return m;
  };
  // One level: its City Skin and extra skins; Save saves for everyone at once.
  const openLevel = (level, isNew) => {
    const r0 = GLOBE_LEVELS.find((r) => r.level === level);
    const ed = { city: r0 ? r0.city : "", extra: r0 ? r0.extra.slice() : [] };
    const m = sheet("glSheet");
    const close = () => { m.style.display = "none"; };
    const drawSheet = () => {
      const canDel = !isNew && !builtIn.has(level);
      m.innerHTML = `<div class="modal-box adm-sheet gs-box gl-sheet" role="dialog" aria-modal="true">
        <div class="gs-head"><b style="flex:1; font-size:17px;">Globe Level ${level}</b><button type="button" class="rfa-x" data-glclose aria-label="Close">&#10005;</button></div>
        <div class="gl-lab">City Skin</div>
        <button type="button" class="gl-citybtn" data-glcity>${ed.city ? `${pic(ed.city)}<b>${nameHtml(ed.city)}</b>` : `<span class="meta">Pick the City Skin</span>`}<i>&#9662;</i></button>
        <div class="gl-lab">Extra skins</div>
        <div class="gl-extra">${ed.extra.map((n) => chip(n, true)).join("")}<button type="button" class="gl-addskin" data-gladdskin>+ Add skin</button></div>
        <div class="gl-sfoot"><button type="button" class="btn ghost small gl-del" data-gldel ${canDel ? "" : "disabled"}>Delete level</button><span style="flex:1"></span><button type="button" class="btn ghost small" data-glclose>Cancel</button><button type="button" class="btn small" data-glsave ${ed.city ? "" : "disabled"}>Save</button></div>
        ${canDel ? "" : `<div class="meta" style="font-size:11.5px; margin-top:6px;">${isNew ? "Pick its City Skin, then Save." : "Built-in levels can't be deleted (Delete shows only for levels you added)."}</div>`}
      </div>`;
      m.onclick = async (ev) => {
        if (ev.target === m || ev.target.closest("[data-glclose]")) { close(); return; }
        const x = ev.target.closest("[data-glx]");
        if (x) { ed.extra = ed.extra.filter((n) => n !== x.dataset.glx); drawSheet(); return; }
        if (ev.target.closest("[data-glcity]")) { pickSkins({ single: true, chosen: ed.city ? [ed.city] : [], cat: "City Skin", onDone: (l) => { ed.city = l[0] || ed.city; drawSheet(); } }); return; }
        if (ev.target.closest("[data-gladdskin]")) { pickSkins({ chosen: [], skip: [ed.city, ...ed.extra], onDone: (l) => { ed.extra = [...ed.extra, ...l.filter((n) => !ed.extra.includes(n))]; drawSheet(); } }); return; }
        if (ev.target.closest("[data-gldel]")) {
          if (!confirm(`Delete Globe Level ${level}?`)) return;
          close(); await store(current().filter((r) => r.level !== level), `Globe Level ${level} deleted`); return;
        }
        if (ev.target.closest("[data-glsave]")) {
          if (!ed.city) return;
          const rows = current().filter((r) => r.level !== level).concat([{ level, city: ed.city, extra: ed.extra.filter((n) => n !== ed.city) }]);
          close(); await store(rows, `Globe Level ${level} saved`);
        }
      };
    };
    drawSheet();
  };
  // Skin picker: search, category chips, picture tiles to tick.
  const pickSkins = ({ single, chosen, cat: cat0, skip = [], onDone }) => {
    const m = sheet("glPick");
    const picked = new Set(chosen);
    const cats = [...new Set(cat.map((x) => x.category).filter(Boolean))];
    let q = "", c = cats.includes(cat0) ? cat0 : "all";
    const wiredAt = new Map();
    GLOBE_LEVELS.forEach((r) => [r.city, ...r.extra].forEach((n) => { if (n && !wiredAt.has(n)) wiredAt.set(n, r.level); }));
    const close = () => { m.style.display = "none"; };
    const tiles = () => cat.filter((x) => (c === "all" || x.category === c) && (!q || x.name.toLowerCase().includes(q)) && !skip.includes(x.name)).map((x) => `<button type="button" class="gl-tile${picked.has(x.name) ? " on" : ""}" data-glpick="${esc(x.name)}">${pic(x.name, "gl-tpic")}<span>${esc(x.name)}</span>${wiredAt.has(x.name) ? `<em>Lv ${wiredAt.get(x.name)}</em>` : ""}</button>`).join("") || `<div class="meta" style="grid-column:1/-1; padding:10px 0;">No skins found.</div>`;
    m.innerHTML = `<div class="modal-box adm-sheet gs-box gl-sheet" role="dialog" aria-modal="true">
      <div class="gs-head"><b style="flex:1; font-size:17px;">${single ? "Pick the City Skin" : "Pick a skin"}</b><button type="button" class="rfa-x" data-glpclose aria-label="Close">&#10005;</button></div>
      <input type="search" class="gl-search" placeholder="Search skins…" data-glq />
      <div class="gl-cats">${["all", ...cats].map((k) => `<button type="button" data-glcat="${esc(k)}" class="${k === c ? "on" : ""}">${esc(k === "all" ? "All" : k)}</button>`).join("")}</div>
      <div class="gl-grid">${tiles()}</div>
      <button type="button" class="btn gl-pickok" data-glpok>${single ? "Use" : `Add (${picked.size})`}</button>
    </div>`;
    const grid = m.querySelector(".gl-grid"), ok = m.querySelector("[data-glpok]");
    const sync = () => { grid.innerHTML = tiles(); ok.textContent = single ? "Use" : `Add (${picked.size})`; ok.disabled = !picked.size; };
    ok.disabled = !picked.size;
    m.querySelector("[data-glq]").addEventListener("input", (e) => { q = e.target.value.trim().toLowerCase(); sync(); });
    m.onclick = (ev) => {
      if (ev.target === m || ev.target.closest("[data-glpclose]")) { close(); return; }
      const cb = ev.target.closest("[data-glcat]");
      if (cb) { c = cb.dataset.glcat; m.querySelectorAll("[data-glcat]").forEach((b) => b.classList.toggle("on", b === cb)); sync(); return; }
      const tl = ev.target.closest("[data-glpick]");
      if (tl) { const n = tl.dataset.glpick; if (single) { picked.clear(); picked.add(n); } else if (picked.has(n)) picked.delete(n); else picked.add(n); sync(); return; }
      if (ev.target.closest("[data-glpok]") && picked.size) { close(); onDone([...picked]); }
    };
  };
  draw();
}
// Admin → Research unlock rules: page
// chips, one card per group with its rules in plain words, ✎ / "+ Add rule"
// open a sheet (which levels, what they need, All / Any). Saved for everyone
// as game rule "researchLocks"; nothing is locked on the pages, "can reach"
// does the research before a step first.
let RLK_PAGE = "t12";
async function renderAdminResearchLocks(body) {
  await ensureSiteConfig();
  await Promise.all([ensureT11StateData().catch(() => null), ensureRCData().catch(() => null)]);
  const defOf = (pg) => (((gameRules().find((r) => r.key === "researchLocks") || {}).def || {})[pg]) || [];
  const store = async (pg, list, msg) => {
    const all = JSON.parse(JSON.stringify(RESEARCH_LOCKS));
    all[pg] = list;
    try { await saveGameRule("researchLocks", all); toast(msg || "Saved"); } catch (err) { toast(err.message || "Couldn't save", true); }
    draw();
  };
  const ctx = () => {
    const pg = RLK_PAGE, nodes = researchLockNodes(pg), list = RESEARCH_LOCKS[pg] || [];
    const nodeOf = (key) => nodes.find((n) => n.key === key);
    const groupOf = (tg) => (/^group:/.test(tg) ? tg.slice(6) : (nodeOf(tg) || {}).group);
    const inGroup = (g) => nodes.filter((n) => n.group === g);
    const maxOf = (tg) => (/^group:/.test(tg) ? Math.max(0, ...inGroup(tg.slice(6)).map((n) => n.max)) : (nodeOf(tg) || {}).max || 0);
    const nameOf = (tg) => researchNeedName(pg, nodes, tg);
    const gName = (g) => (pg === "t12" ? tT12Group(g) : g);
    // A rule runs until the next rule of the same node starts.
    const endOf = (r, rules) => { const nx = rules.filter((x) => x.node === r.node && x.from > r.from).map((x) => x.from); return nx.length ? Math.min(...nx) - 1 : maxOf(r.node); };
    const rangeTxt = (r, rules) => { const e = endOf(r, rules); return e > r.from ? `Lv ${r.from}–${e}` : `Lv ${r.from}`; };
    const optsHtml = (sel, skip) => researchLockGroups(nodes).map((g) => {
      const ns = inGroup(g);
      return `<optgroup label="${esc(gName(g))}">${ns.length > 1 ? `<option value="group:${esc(g)}" ${sel === `group:${g}` ? "selected" : ""}>All of ${esc(gName(g))} (${ns.length} nodes)</option>` : ""}${ns.filter((n) => n.key !== skip).map((n) => `<option value="${esc(n.key)}" ${sel === n.key ? "selected" : ""}>${esc(n.label)}</option>`).join("")}</optgroup>`;
    }).join("");
    return { pg, nodes, list, nodeOf, groupOf, inGroup, maxOf, nameOf, gName, endOf, rangeTxt, optsHtml };
  };
  const draw = () => {
    const c = ctx(), { pg, nodes, list } = c;
    const changed = JSON.stringify(list) !== JSON.stringify(defOf(pg));
    const groups = researchLockGroups(nodes);
    const line = (r, i) => {
      const multi = c.inGroup(c.groupOf(r.node)).length > 1;
      const pre = !/^group:/.test(r.node) && multi ? `${(c.nodeOf(r.node) || {}).short || r.node} · ` : "";
      return `<div class="rlk-line"><span class="rlk-chip">${esc(pre + c.rangeTxt(r, list))}</span><span class="rlk-txt">needs <b>${esc(researchNeedsText(pg, nodes, r))}</b></span><button type="button" class="rlk-ed" data-rlked="${i}" aria-label="Edit rule">&#9998;</button></div>`;
    };
    const order = (r) => (/^group:/.test(r.node) ? -1 : nodes.findIndex((n) => n.key === r.node));
    const cards = groups.map((g) => {
      const ns = c.inGroup(g), rules = list.map((r, i) => ({ r, i })).filter((x) => c.groupOf(x.r.node) === g).sort((a, b) => order(a.r) - order(b.r) || a.r.from - b.r.from);
      return `<div class="rlk-card${rules.length ? "" : " rlk-empty"}">
        <div class="rlk-h"><b>${esc(c.gName(g))}</b><span class="meta">${ns.length} node${ns.length > 1 ? "s" : ""} · max ${Math.max(0, ...ns.map((n) => n.max))}</span></div>
        ${rules.length ? rules.map((x) => line(x.r, x.i)).join("") : `<div class="meta rlk-none">No rules · open from the start</div>`}
        <button type="button" class="rlk-add" data-rlkadd="${esc(g)}">+ Add rule</button>
      </div>`;
    }).join("");
    body.innerHTML = `<div class="rlk">
      <div class="rlk-top"><span class="rlk-pill">&#10003; Same rules for all troops</span><span style="flex:1"></span><button type="button" class="btn ghost small" data-rlkreset ${changed ? "" : "disabled"}>Reset to built-in</button></div>
      <div class="rlk-pages">${RESEARCH_LOCK_PAGES.map(([k, l]) => `<button type="button" data-rlkpg="${k}" class="${k === pg ? "on" : ""}">${esc(l)}</button>`).join("")}</div>
      <p class="desc rlk-desc">Which levels of a node wait for other research. Nothing is locked on the pages: <b>"can reach"</b> (My order / Best value) does the research before a step first, and a node it stops shows what it waits for.${pg === "t12" ? "" : ` <b>${esc(RESEARCH_LOCK_PAGES.find((x) => x[0] === pg)[1])}:</b> saved now, used once "can reach" is on this page.`}${changed ? ` <span class="rl-chg">changed</span>` : ""}</p>
      ${nodes.length ? `<div class="rlk-grid">${cards}</div>` : `<div class="meta">This page's research couldn't be loaded. Try again.</div>`}
    </div>`;
  };
  // Edit / add one rule.
  const openRule = (idx, group) => {
    const c = ctx(), { pg, nodes } = c;
    const ns = c.inGroup(group || c.groupOf(c.list[idx].node));
    const first = ns.length > 1 ? `group:${ns[0].group}` : (ns[0] || {}).key;
    // A new rule starts with the group before it (the research done earlier).
    const gs = researchLockGroups(nodes), gi = gs.indexOf((ns[0] || {}).group), pg0 = gs[gi > 0 ? gi - 1 : gi + 1];
    const other = nodes.find((n) => n.group === pg0) || nodes.find((n) => n.group !== (ns[0] || {}).group) || nodes[0] || {};
    const ed = idx != null ? JSON.parse(JSON.stringify(c.list[idx])) : { node: first, from: 1, needs: [{ node: c.inGroup(other.group || "").length > 1 ? `group:${other.group}` : other.key, lv: 1 }] };
    let m = document.getElementById("rlkSheet");
    if (!m) { m = document.createElement("div"); m.id = "rlkSheet"; m.className = "modal-overlay adm-sheet-wrap gs-wrap"; document.body.appendChild(m); }
    m.style.display = "flex";
    const close = () => { m.style.display = "none"; };
    const rest = () => c.list.filter((r, i) => i !== idx);
    const preview = () => {
      const all = rest().concat([ed]), e = c.endOf(ed, all);
      return `"Can reach" does <b>${esc(researchNeedsText(pg, nodes, ed))}</b> before <b>${esc(c.nameOf(ed.node))} ${e > ed.from ? `Lv ${ed.from}–${e}` : `Lv ${ed.from}`}</b>.`;
    };
    const drawSheet = () => {
      const all = rest().concat([ed]), e = c.endOf(ed, all);
      m.innerHTML = `<div class="modal-box adm-sheet gs-box rlk-sheet" role="dialog" aria-modal="true">
        <div class="gs-head"><b style="flex:1; font-size:17px;">${idx != null ? "Edit rule" : "New rule"} · ${esc(c.gName(c.groupOf(ed.node) || ""))}</b><button type="button" class="rfa-x" data-rlkclose aria-label="Close">&#10005;</button></div>
        <div class="meta" style="font-size:11.5px; margin:-4px 0 8px;">${esc(RESEARCH_LOCK_PAGES.find((x) => x[0] === pg)[1])} · works the same for Infantry, Lancer and Marksman</div>
        <div class="rlk-lab">Which levels</div>
        <select class="rlk-sel" data-rlknode>${c.optsHtml(ed.node)}</select>
        <div class="rlk-row"><span>from Lv</span><input type="number" min="1" max="${c.maxOf(ed.node)}" inputmode="numeric" value="${ed.from}" data-rlkfrom class="rlk-num" /><span class="meta">to Lv ${e}${e === c.maxOf(ed.node) ? " (max)" : " (next rule starts after)"}</span></div>
        <div class="rlk-lab">Needs</div>
        <div class="rlk-row"><span>Done when</span><span style="flex:1"></span><div class="rch-seg"><button type="button" data-rlkany="0" class="${ed.any ? "" : "on"}">All needs</button><button type="button" data-rlkany="1" class="${ed.any ? "on" : ""}">Any one</button></div></div>
        ${ed.needs.map((n, i) => `<div class="rlk-need"><select class="rlk-sel" data-rlkneed="${i}">${c.optsHtml(n.node, /^group:/.test(ed.node) ? null : ed.node)}</select><span class="meta" style="white-space:nowrap;">at Lv</span><input type="number" min="1" max="${c.maxOf(n.node)}" inputmode="numeric" value="${n.lv}" data-rlkneedlv="${i}" class="rlk-num" /><button type="button" class="rlk-x" data-rlkdel="${i}" aria-label="Remove" ${ed.needs.length > 1 ? "" : "disabled"}>&#10005;</button></div>`).join("")}
        <button type="button" class="rlk-add" data-rlkmore>+ Add another need</button>
        <div class="rlk-prev" data-rlkprev>${preview()}</div>
        <div class="rlk-err" data-rlkerr></div>
        <div class="gl-sfoot"><button type="button" class="btn ghost small gl-del" data-rlkremove ${idx != null ? "" : "disabled"}>Delete</button><span style="flex:1"></span><button type="button" class="btn ghost small" data-rlkclose>Cancel</button><button type="button" class="btn small" data-rlksave>Save</button></div>
      </div>`;
    };
    const err = () => {
      if (!(ed.from >= 1 && ed.from <= c.maxOf(ed.node))) return `"from Lv" must be 1 – ${c.maxOf(ed.node)}.`;
      if (!ed.needs.length) return "Add at least one need.";
      for (const n of ed.needs) {
        if (n.node === ed.node) return "A node can't need itself.";
        if (!(n.lv >= 1 && n.lv <= c.maxOf(n.node))) return `${c.nameOf(n.node)} goes up to Lv ${c.maxOf(n.node)}.`;
      }
      if (rest().some((r) => r.node === ed.node && r.from === ed.from)) return `There is already a rule for ${c.nameOf(ed.node)} from Lv ${ed.from}.`;
      return "";
    };
    drawSheet();
    m.oninput = (ev) => {
      const el = ev.target;
      if (el.matches("[data-rlkfrom]")) ed.from = Math.round(Number(el.value) || 0);
      else if (el.matches("[data-rlkneedlv]")) ed.needs[Number(el.dataset.rlkneedlv)].lv = Math.round(Number(el.value) || 0);
      else return;
      const pv = m.querySelector("[data-rlkprev]"); if (pv) pv.innerHTML = preview();
    };
    m.onchange = (ev) => {
      const el = ev.target;
      if (el.matches("[data-rlknode]")) { ed.node = el.value; drawSheet(); }
      else if (el.matches("[data-rlkneed]")) { ed.needs[Number(el.dataset.rlkneed)].node = el.value; drawSheet(); }
    };
    m.onclick = async (ev) => {
      if (ev.target === m || ev.target.closest("[data-rlkclose]")) { close(); return; }
      const a = ev.target.closest("[data-rlkany]");
      if (a) { if (a.dataset.rlkany === "1") ed.any = true; else delete ed.any; drawSheet(); return; }
      const d = ev.target.closest("[data-rlkdel]");
      if (d) { ed.needs.splice(Number(d.dataset.rlkdel), 1); drawSheet(); return; }
      if (ev.target.closest("[data-rlkmore]")) { const last = ed.needs[ed.needs.length - 1] || { node: other.key, lv: 1 }; ed.needs.push({ node: last.node, lv: last.lv }); drawSheet(); return; }
      if (ev.target.closest("[data-rlkremove]") && idx != null) {
        if (!confirm("Delete this rule?")) return;
        close(); await store(pg, rest(), "Rule deleted"); return;
      }
      if (ev.target.closest("[data-rlksave]")) {
        const e = err();
        if (e) { m.querySelector("[data-rlkerr]").textContent = e; return; }
        const out = { node: ed.node, from: ed.from, ...(ed.any ? { any: true } : {}), needs: ed.needs.map((n) => ({ node: n.node, lv: n.lv })) };
        const list = c.list.slice();
        if (idx != null) list[idx] = out; else list.push(out);
        close(); await store(pg, list, "Rule saved");
      }
    };
  };
  body.onclick = async (ev) => {
    const pgb = ev.target.closest("[data-rlkpg]");
    if (pgb) { RLK_PAGE = pgb.dataset.rlkpg; draw(); return; }
    const e = ev.target.closest("[data-rlked]");
    if (e) { openRule(Number(e.dataset.rlked)); return; }
    const a = ev.target.closest("[data-rlkadd]");
    if (a) { openRule(null, a.dataset.rlkadd); return; }
    if (ev.target.closest("[data-rlkreset]")) {
      const pg = RLK_PAGE;
      if (!confirm(`Put the built-in rules for ${RESEARCH_LOCK_PAGES.find((x) => x[0] === pg)[1]} back?`)) return;
      await store(pg, JSON.parse(JSON.stringify(defOf(pg))), "Reset to built-in");
    }
  };
  draw();
}
async function renderAdminRules(body) {
  await ensureSiteConfig();
  const rules = gameRules(), saved = gameRulesSaved();
  const pages = visitorPageList ? [{ tab: "", label: "—" }, ...visitorPageList(), { tab: "overview", label: "Dashboard" }] : [];
  const changed = (r) => saved[r.key] != null;
  const cell = (c, v, ri, row) => {
    const a = `data-rcell="${ri}|${c.key}"`;
    if (row && c.when && !c.when(row)) return `<span class="meta">—</span>`;
    if (row && c.locked && c.locked(row)) return `<span class="meta" title="Built-in: the site reads this one by its id">${esc(String(v == null ? "" : v))}</span>`;
    if (c.type === "auto") return `<span class="meta">${esc(String(v))}</span>`;
    if (c.type === "check") return `<input type="checkbox" ${a} ${v ? "checked" : ""} />`;
    if (c.type === "select") {
      const opts = typeof c.options === "function" ? c.options(row || {}) : c.options;
      if (!opts) return `<input ${a} type="text" value="${esc(v == null ? "" : String(v))}" />`;
      const pair = (o) => (Array.isArray(o) ? o : [o, o]);
      const has = opts.some((o) => String(pair(o)[0]) === String(v));
      return `<select ${a}>${!has && v != null && v !== "" ? `<option selected>${esc(String(v))}</option>` : ""}${opts.map((o) => { const [ov, ol] = pair(o); return `<option value="${esc(String(ov))}" ${String(ov) === String(v) ? "selected" : ""}>${esc(String(ol))}</option>`; }).join("")}</select>`;
    }
    if (c.type === "page") return `<select ${a}>${pages.map((p) => `<option value="${esc(p.tab)}" ${p.tab === v ? "selected" : ""}>${esc(p.label)}</option>`).join("")}</select>`;
    return `<input ${a} type="${c.type === "num" ? "number" : c.type === "date" ? "date" : "text"}" ${c.type === "num" ? 'step="any" inputmode="decimal"' : ""} value="${esc(v == null ? "" : String(v))}" />`;
  };
  const listHtml = () => GAME_RULE_GROUPS.map((g) => `<div class="adm-gk">${esc(g.label)}</div>
    <div class="rl-list">${rules.filter((r) => r.group === g.key).map((r) => `<button type="button" class="rl-item${ADMIN_RULE_OPEN === r.key ? " on" : ""}" data-ruleopen="${r.key}"><span><b>${esc(r.label)}</b>${changed(r) ? ` <span class="rl-chg">changed</span>` : ""}<br><small>${esc(r.help || "")}</small></span><i>&#8250;</i></button>`).join("")}</div>`).join("");
  const draw = () => {
    const r = rules.find((x) => x.key === ADMIN_RULE_OPEN);
    if (!r) {
      body.innerHTML = `<p class="desc" style="margin:0 0 10px;">Game rules the site calculates with. Each one starts with the built-in value; your changes apply to everyone. "Reset" puts the built-in value back.</p>${listHtml()}`;
      body.querySelectorAll("[data-ruleopen]").forEach((b) => b.addEventListener("click", () => {
        const lk = (rules.find((x) => x.key === b.dataset.ruleopen) || {}).link;
        if (lk) { admPushSection(lk); ADMIN_ACTIVE_TABLE = lk; renderAdminPage(); window.scrollTo(0, 0); return; } // edited on its own Admin screen
        ADMIN_RULE_OPEN = b.dataset.ruleopen; draw(); window.scrollTo(0, body.getBoundingClientRect().top + scrollY - 80); }));
      return;
    }
    let val = JSON.parse(JSON.stringify(saved[r.key] != null ? saved[r.key] : r.def));
    if (r.key === "unlocks" && Array.isArray(val)) val.sort((a, b) => (Number(a.day) || 0) - (Number(b.day) || 0)); // by state day
    const drawEditor = () => {
      const ed = body.querySelector(".rl-ed");
      if (r.type === "fields") {
        ed.innerHTML = `<div class="rl-fields">${r.fields.map((f) => `<label><span>${esc(f.label)}</span><input type="number" step="any" inputmode="decimal" data-rfield="${f.key}" value="${esc(String(val[f.key] != null ? val[f.key] : ""))}" />${r.def[f.key] !== val[f.key] ? `<small class="meta">built-in ${esc(String(r.def[f.key]))}</small>` : ""}</label>`).join("")}</div>`;
        ed.querySelectorAll("[data-rfield]").forEach((inp) => inp.addEventListener("input", () => { val[inp.dataset.rfield] = inp.value === "" ? "" : Number(inp.value); }));
        return;
      }
      ed.innerHTML = `<div class="rl-table-wrap"><table class="rl-table"><thead><tr><th></th>${r.cols.map((c) => `<th>${esc(c.label)}</th>`).join("")}<th></th></tr></thead><tbody>
        ${val.map((row, ri) => `<tr data-rrow="${ri}"><td class="rl-dragcell">${dsHandleHtml("data-rdrag")}</td>${r.cols.map((c) => `<td>${cell(c, row[c.key], ri, row)}</td>`).join("")}<td class="rl-rowbtns"><button type="button" data-rdel="${ri}" aria-label="delete">&#10005;</button></td></tr>`).join("")}
        </tbody></table></div><button type="button" class="btn ghost small" data-radd style="margin-top:8px;">+ Add row</button>`;
      ed.querySelectorAll("[data-rcell]").forEach((inp) => inp.addEventListener(inp.type === "checkbox" || inp.tagName === "SELECT" ? "change" : "input", () => {
        const [ri, k] = inp.dataset.rcell.split("|"); const c = r.cols.find((x) => x.key === k);
        val[+ri][k] = inp.type === "checkbox" ? inp.checked : c.type === "num" ? (inp.value === "" ? "" : Number(inp.value)) : inp.value;
        if (c.after) c.after(val[+ri]);
        if (c.redraw) drawEditor();
      }));
      // Drag ⋮⋮ to change the order (saved with Save).
      ed.querySelectorAll("[data-rdrag]").forEach((h) => dragSort(h, { row: "tr[data-rrow]", refocus: (tr, to) => ed.querySelectorAll("[data-rdrag]")[to]?.focus(), done: (tr, from, to) => { const [x] = val.splice(from, 1); val.splice(to, 0, x); if (r.cols.some((c) => c.type === "auto")) val.forEach((row, i) => { r.cols.filter((c) => c.type === "auto").forEach((c) => { row[c.key] = i + 1; }); }); drawEditor(); } }));
      ed.querySelectorAll("[data-rdel]").forEach((b) => b.addEventListener("click", () => { val.splice(+b.dataset.rdel, 1); r.cols.filter((c) => c.type === "auto").forEach((c) => val.forEach((row, i) => { row[c.key] = i + 1; })); drawEditor(); }));
      ed.querySelector("[data-radd]").addEventListener("click", () => {
        const row = {}; r.cols.forEach((c) => { const first = c.type === "select" ? ((typeof c.options === "function" ? c.options(row) : c.options) || [""])[0] : ""; row[c.key] = c.type === "auto" ? val.length + 1 : c.type === "check" ? false : c.type === "select" ? (Array.isArray(first) ? first[0] : first) : ""; });
        val.push(row); drawEditor();
      });
    };
    body.innerHTML = `
      <button type="button" class="btn ghost small" data-ruleback style="margin-bottom:10px;">&#8249; All rules</button>
      <div class="rl-card"><div class="rl-h"><b>${esc(r.label)}</b>${changed(r) ? ` <span class="rl-chg">changed</span>` : ` <span class="meta" style="font-size:11.5px;">built-in values</span>`}</div>
        <p class="desc" style="margin:4px 0 10px;">${esc(r.help || "")}</p>
        <div class="rl-ed">${r.prepare ? `<div class="meta" style="font-size:12px;">Loading…</div>` : ""}</div>
        <div class="rl-foot"><button type="button" class="btn ghost small" data-rulereset ${changed(r) ? "" : "disabled"}>Reset to built-in</button><span style="flex:1"></span><button type="button" class="btn small" data-rulesave>Save</button></div>
      </div>`;
    if (r.prepare) {
      // Lists to pick from load first (the editor falls back to typing).
      const ed0 = body.querySelector(".rl-ed");
      Promise.resolve().then(() => r.prepare()).catch(() => {}).then(() => { if (ADMIN_RULE_OPEN === r.key && body.contains(ed0)) drawEditor(); });
    } else drawEditor();
    body.querySelector("[data-ruleback]").addEventListener("click", () => { ADMIN_RULE_OPEN = null; draw(); });
    const store = async (next, msg) => {
      try {
        await saveSiteConfig("game_rules", next);
        Object.keys(saved).forEach((k) => { delete saved[k]; }); Object.assign(saved, next);
        afterGameRulesChange(); toast(msg); draw();
      } catch (err) { toast(err.message || "Couldn't save", true); }
    };
    body.querySelector("[data-rulesave]").addEventListener("click", async () => {
      // Try it first: a value the page can't use is not saved.
      try { r.set(JSON.parse(JSON.stringify(val))); } catch (e) { toast("Check the values: " + e.message, true); applyGameRules(); return; }
      const same = JSON.stringify(val) === JSON.stringify(r.def);
      const next = { ...gameRulesSaved() };
      if (same) delete next[r.key]; else next[r.key] = val;
      await store(next, same ? "Saved (same as built-in)" : "Rule saved");
    });
    body.querySelector("[data-rulereset]").addEventListener("click", async () => {
      if (!confirm(`Put "${r.label}" back to the built-in values?`)) return;
      const next = { ...gameRulesSaved() }; delete next[r.key];
      await store(next, "Back to built-in");
    });
  };
  draw();
}

// ---- Languages & Texts (Admin) ----
// The English base of every text key (what a translation file translates).
const LANG_EN_WORDS = { "w:stat.ATK": "ATK", "w:stat.ATT": "ATT", "w:stat.DEF": "DEF", "w:stat.LETH": "LETH", "w:stat.HP": "HP", "w:stat.DMG": "DMG",
  "w:troop.Troops": "Troops", "w:troop.Inf": "Inf", "w:troop.INF": "INF", "w:troop.Lan": "Lan", "w:troop.LAN": "LAN", "w:troop.Mark": "Mark", "w:troop.MAR": "MAR",
  "w:color.Green": "Green", "w:color.Blue": "Blue", "w:color.Purple": "Purple", "w:color.Gold": "Gold", "w:color.Red": "Red", "w:color.Grey": "Grey", "w:color.Orange": "Orange",
  "w:speed.Research": "Research", "w:speed.Troop": "Troop", "w:speed.Construction": "Construction", "w:speed.Expert": "Expert", "w:unit.h": "h", "w:unit.m": "m", "w:total": "total",
  "p:speedup": "{kind}Speedup {n}{unit}", "p:statTroop": "{troop} {stat}", "p:rowsFor": "Rows for {name}", "p:rows": "{x} rows", "p:addItem": "Add a {x} item" };
function englishTexts() {
  const out = [];
  Object.entries(T).forEach(([k, v]) => { if (v && v.en) out.push(["t:" + k, enBuiltinText(k)]); });
  Object.entries(NAV_GROUP_LABELS_DEFAULT).forEach(([k, v]) => { if (v && v.en) out.push(["nav.g:" + k, v.en]); });
  Object.entries(NAV_PAGE_LABELS_DEFAULT).forEach(([k, v]) => { if (v && v.en) out.push(["nav.p:" + k, v.en]); });
  Object.keys(DATA_NAME_I18N).forEach((k) => out.push(["data:" + k, k]));
  Object.keys(UI_TEXT_I18N).forEach((k) => out.push(["ui:" + k, k]));
  Object.entries(LANG_EN_WORDS).forEach(([k, v]) => out.push([k, v]));
  return out;
}
function gameNameTexts() {
  if (GAME_NAME_TEXTS) return GAME_NAME_TEXTS;
  const get = (q) => sb(q).catch(() => []);
  const own = `user_id=eq.${PROGRESSION_OWNER_ID}`;
  GAME_NAME_TEXTS = Promise.all([
    get(`heroes?select=name`), get(`experts?select=key,skill1,skill2,skill3,skill4,talent`),
    get(`${PET_LEVELS_TABLE}?select=pet`), get(`pet_refine_nodes?select=pet`),
    get(`skins_catalog?select=name,category`), get(`skin_page_categories?select=category`),
    get(`pack_tables?${own}&select=title`), get(`buff_columns?select=name,category`), get(`buff_rows?select=name`),
  ]).then((lists) => {
    const names = [];
    lists.flat().forEach((r) => Object.values(r || {}).forEach((v) => names.push(v)));
    try { packAllResourceNames().forEach((n) => names.push(n)); } catch (e) { /* pack items not ready */ }
    try { backpackItems().forEach((g) => { names.push(g.title); g.items.forEach((x) => names.push(x.name)); }); } catch (e) { /* default list */ }
    // Research trees set in Rules & Timeline (built-in names already have texts).
    T12_ITEM_DEFS.forEach((d) => { if (!T12_GROUP_KEYS[d.group]) names.push(d.group); if (!T12_LABEL_KEYS[d.label] && !statLabelKey(d.label)) names.push(d.label); });
    Object.values(RC_BASE_CATEGORIES).flat().forEach((n) => names.push(n));
    const seen = new Set(), out = [];
    names.forEach((v) => {
      const n = typeof v === "string" ? v.trim() : "";
      if (!n || n.length > 80 || !/[A-Za-z]{2}/.test(n) || seen.has(n) || n in DATA_NAME_I18N) return;
      // Already translated another way (item words, on-screen texts, "<expert> Sigils", speedups).
      if (MATERIAL_LABEL_KEYS[n.toLowerCase()] || n in UI_TEXT_I18N || / Sigils$/i.test(n) || /Speedups? \d+[mh]$/i.test(n)) return;
      seen.add(n); out.push(["data:" + n, n]);
    });
    return out.sort((a, b) => a[1].localeCompare(b[1]));
  }).catch(() => { GAME_NAME_TEXTS = null; return []; });
  return GAME_NAME_TEXTS;
}
// The texts a language can have: built-in ones plus the game names. English
// itself can change its page texts (T keys) and on-screen texts (ui:) only.
async function textsFor(code) {
  const base = englishTexts();
  if (code === "en") return base.filter(([k]) => EN_EDIT_KINDS.includes(k.slice(0, k.indexOf(":"))));
  const have = new Set(base.map(([k]) => k));
  return base.concat((await gameNameTexts()).filter(([k]) => !have.has(k)));
}
// A language's texts (English: only the admin's changes, kept with the settings).
function langPackFor(code, fresh) {
  if (code !== "en") return loadLangPack(code, fresh);
  const o = siteConfig("lang_en", null), over = o && typeof o === "object" ? o : {};
  return Promise.resolve({ pack: over, file: {}, over });
}
const textPlaceholders = (x) => (String(x).match(/\{[a-zA-Z_]+\}/g) || []).sort().join(",");
function csvCell(v) { const s = String(v == null ? "" : v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }
function csvParse(text) {
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; continue; }
    if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
function downloadTextFile(name, text, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
let ADMIN_LANG_OPEN = null, ADMIN_TEXT_Q = "", ADMIN_TEXT_FILTER = "all", ADMIN_TEXT_PAGE = 0;
async function saveLangOverrides(code, over) {
  await saveSiteConfig("lang_" + code, over);
  if (code === "en") { applyEnglishOverrides(over); if (LANG === "en") localizeDom(document.body); return; } // kept with the settings
  if (SITE_CONFIG) delete SITE_CONFIG["lang_" + code]; // not kept with the other settings
  delete LANG_PACKS[code];
  if (code === LANG) { await useLanguage(code); applyMenuLayout(); applyNavLanguage(); }
}
async function renderAdminLanguages(body) {
  await ensureSiteConfig();
  const saveList = async (list) => { await saveSiteConfig("languages", list.filter((l) => l.code !== "en").map((l) => ({ code: l.code, name: l.name, ...(l.dir === "rtl" ? { dir: "rtl" } : {}), hidden: !!l.hidden }))); renderLanguageSwitcher(); };
  if (ADMIN_LANG_OPEN) { await renderAdminTexts(body, ADMIN_LANG_OPEN); return; }
  const list = languageList(true);
  body.innerHTML = `<p class="desc" style="margin:0 0 10px;">English is the base. Every other language is a list of translated texts: edit them here, or download the file, translate it in any spreadsheet app, and upload it back. Texts that aren't translated show in English. Hidden languages are only in your own language menu. Names from the game data (heroes, pets, experts, skins, packs, items…) are in the list too, so new ones can be translated here. English texts can be changed under English → Texts.</p>
    <div class="lg-list"><div class="meta" style="font-size:12px;">Counting translated texts…</div></div>
    <div class="lg-add"><b>Add a language</b>
      <div class="lg-addrow"><input type="text" data-lgcode placeholder="Code, e.g. fr or pt-BR" maxlength="10" /><input type="text" data-lgname placeholder="Name people see, e.g. Français" maxlength="40" /><label><input type="checkbox" data-lgrtl /> Right-to-left</label><button type="button" class="btn small" data-lgadd>Add</button></div>
      <div class="meta" style="font-size:11px;">New languages start hidden, so you can translate before visitors see them.</div></div>`;
  const counts = {};
  const en = await textsFor(""), total = en.length;
  if (!body.isConnected) return;
  await Promise.all(list.filter((l) => l.code !== "en").map(async (l) => { const e = await loadLangPack(l.code, true); counts[l.code] = { n: en.filter(([k]) => e.pack[k]).length, over: Object.keys(e.over).length }; }));
  const enOver = Object.keys((await langPackFor("en")).over).length;
  try {
    const shown = list.filter((l) => l.code !== "en" && !l.hidden && counts[l.code]);
    const worst = shown.reduce((m, l) => (!m || counts[l.code].n < counts[m.code].n ? l : m), null);
    localStorage.setItem("admin_lang_missing", JSON.stringify(worst ? { n: total - counts[worst.code].n, lang: worst.name, at: Date.now() } : { n: 0, at: Date.now() }));
  } catch (e) { /* storage blocked */ }
  body.querySelector(".lg-list").innerHTML = list.map((l) => `<div class="lg-row">
      <div class="lg-name"><b>${esc(l.name)}</b> <span class="meta">${esc(l.code)}${l.dir === "rtl" ? " · right-to-left" : ""}${l.builtin ? "" : " · added by you"}</span><br>
        <span class="meta" style="font-size:11.5px;">${l.code === "en" ? `Base language${enOver ? ` · ${enOver} changed by you` : ""}` : `${counts[l.code].n.toLocaleString()} / ${total.toLocaleString()} texts translated (${Math.floor(counts[l.code].n * 100 / total)}%)${counts[l.code].over ? ` · ${counts[l.code].over} changed by you` : ""}`}</span></div>
      ${l.code === "en" ? `<div class="lg-btns">
        <button type="button" class="btn ghost small" data-lgtexts="en">Texts</button>
        <button type="button" class="btn ghost small" data-lgdown="en">&#8615; Download</button>
        <label class="btn ghost small lg-up" role="button">&#8613; Upload<input type="file" accept=".csv,text/csv" data-lgup="en" hidden /></label></div>` : `<div class="lg-btns">
        <label class="lg-show"><input type="checkbox" data-lgshow="${esc(l.code)}" ${l.hidden ? "" : "checked"} /> Shown</label>
        <button type="button" class="btn ghost small" data-lgtexts="${esc(l.code)}">Texts</button>
        <button type="button" class="btn ghost small" data-lgdown="${esc(l.code)}">&#8615; Download</button>
        <label class="btn ghost small lg-up" role="button">&#8613; Upload<input type="file" accept=".csv,text/csv" data-lgup="${esc(l.code)}" hidden /></label>
        ${l.builtin ? "" : `<button type="button" class="btn ghost small" data-lgdel="${esc(l.code)}" title="Remove">&#128465;</button>`}</div>`}
    </div>`).join("");
  body.querySelectorAll("[data-lgshow]").forEach((cb) => cb.addEventListener("change", async () => {
    const all = languageList(true); const l = all.find((x) => x.code === cb.dataset.lgshow); l.hidden = !cb.checked;
    try { await saveList(all); toast(cb.checked ? "Visitors can pick this language" : "Hidden from visitors"); } catch (err) { toast(err.message || "Couldn't save", true); cb.checked = !cb.checked; }
  }));
  body.querySelectorAll("[data-lgtexts]").forEach((b) => b.addEventListener("click", () => { ADMIN_LANG_OPEN = b.dataset.lgtexts; ADMIN_TEXT_PAGE = 0; renderAdminLanguages(body); }));
  body.querySelectorAll("[data-lgdown]").forEach((b) => b.addEventListener("click", async () => {
    const code = b.dataset.lgdown, e = await langPackFor(code), name = code === "en" ? "Your English" : (languageList(true).find((x) => x.code === code) || {}).name || code;
    const texts = code === "en" ? await textsFor("en") : en;
    const lines = [["key", "English", name].map(csvCell).join(","), ...texts.map(([k, v]) => [k, v, e.pack[k] || ""].map(csvCell).join(","))];
    downloadTextFile(`wosrst-texts-${code}.csv`, "﻿" + lines.join("\r\n"), "text/csv;charset=utf-8");
  }));
  body.querySelectorAll("[data-lgup]").forEach((inp) => inp.addEventListener("change", async () => {
    const f = inp.files && inp.files[0]; inp.value = "";
    if (f) openTextUpload(inp.dataset.lgup, await f.text(), body);
  }));
  body.querySelectorAll("[data-lgdel]").forEach((b) => b.addEventListener("click", async () => {
    const code = b.dataset.lgdel;
    if (!confirm(`Remove the language "${code}" and its texts?`)) return;
    try { await saveLangOverrides(code, {}); await saveList(languageList(true).filter((x) => x.code !== code)); renderAdminLanguages(body); toast("Language removed"); } catch (err) { toast(err.message || "Couldn't save", true); }
  }));
  body.querySelector("[data-lgadd]").addEventListener("click", async () => {
    const code = body.querySelector("[data-lgcode]").value.trim(), name = body.querySelector("[data-lgname]").value.trim();
    if (!/^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(code)) { toast("Use a language code like fr, pt-BR or zh-Hans", true); return; }
    if (!name) { toast("Give the language a name", true); return; }
    const all = languageList(true);
    if (all.some((x) => x.code === code)) { toast("That language is already in the list", true); return; }
    all.push({ code, name, dir: body.querySelector("[data-lgrtl]").checked ? "rtl" : "ltr", hidden: true });
    try { await saveList(all); toast("Language added (hidden until you show it)"); renderAdminLanguages(body); } catch (err) { toast(err.message || "Couldn't save", true); }
  });
}
// Upload: read the CSV, show what it changes, save on OK.
async function openTextUpload(code, text, body) {
  const rows = csvParse(text.replace(/^﻿/, "")).filter((r) => r.some((c) => c.trim()));
  const head = rows[0] || [];
  const hasHead = /^key$/i.test((head[0] || "").trim());
  const col = 2; // key, English, translation
  const en = new Map(await textsFor(code));
  const e0 = await langPackFor(code, true);
  // English: the built-in text counts as "the file" (same text = no change).
  const e = code === "en" ? { ...e0, pack: { ...Object.fromEntries(en), ...e0.pack }, file: Object.fromEntries(en) } : e0;
  const changes = {}, problems = [], unknown = []; let read = 0, empty = 0, same = 0;
  (hasHead ? rows.slice(1) : rows).forEach((r) => {
    const k = (r[0] || "").trim(), v0 = r[col] || "", v = v0.trim() ? v0 : ""; // keep spaces the text really has
    if (!k) return;
    if (!en.has(k)) { unknown.push(k); return; }
    read++;
    if (!v) { empty++; return; }
    if (textPlaceholders(v) !== textPlaceholders(en.get(k))) { problems.push([k, en.get(k), v]); return; }
    if (v === (e.pack[k] || "")) { same++; return; }
    changes[k] = v;
  });
  const n = Object.keys(changes).length;
  let modal = document.getElementById("textUploadModal");
  if (!modal) { modal = document.createElement("div"); modal.id = "textUploadModal"; modal.className = "modal-overlay"; document.body.appendChild(modal); }
  modal.innerHTML = `<div class="modal-box" style="max-width:560px; max-height:88vh; overflow-y:auto;">
    <h2 style="margin:0 0 8px;">Upload texts · ${esc(code)}</h2>
    <div class="lg-sum"><div><b>${read.toLocaleString()}</b><span>texts read</span></div><div><b>${n.toLocaleString()}</b><span>new or changed</span></div><div><b>${same.toLocaleString()}</b><span>same as now</span></div><div><b>${empty.toLocaleString()}</b><span>still empty</span></div></div>
    ${problems.length ? `<div class="lg-warn"><b>${problems.length} not saved — a {placeholder} is missing or changed:</b>${problems.slice(0, 8).map(([k, a, b]) => `<div class="meta">${esc(k)}: “${esc(a)}” → “${esc(b)}”</div>`).join("")}${problems.length > 8 ? `<div class="meta">…and ${problems.length - 8} more</div>` : ""}</div>` : ""}
    ${unknown.length ? `<div class="meta" style="font-size:11.5px; margin-top:6px;">${unknown.length} rows with an unknown key are skipped (${esc(unknown.slice(0, 4).join(", "))}${unknown.length > 4 ? "…" : ""}).</div>` : ""}
    ${!hasHead || head.length < 3 ? `<div class="lg-warn">This doesn't look like a texts file (expected columns: key, English, translation).</div>` : ""}
    <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:12px;"><button type="button" class="btn ghost small" data-upclose>Cancel</button><button type="button" class="btn small" data-upsave ${n ? "" : "disabled"}>Save ${n.toLocaleString()} texts</button></div>
  </div>`;
  modal.style.display = "flex";
  const close = () => { modal.style.display = "none"; };
  modal.onclick = (ev) => { if (ev.target === modal || ev.target.closest("[data-upclose]")) close(); };
  modal.querySelector("[data-upsave]").addEventListener("click", async (ev) => {
    ev.currentTarget.disabled = true;
    const over = { ...e.over };
    Object.entries(changes).forEach(([k, v]) => { if (e.file[k] === v) delete over[k]; else over[k] = v; });
    try { await saveLangOverrides(code, over); toast(`${n} texts saved`); close(); renderAdminLanguages(body); } catch (err) { toast(err.message || "Couldn't save", true); ev.currentTarget.disabled = false; }
  });
}
// Texts editor for one language: search, untranslated / changed filter, 40 a page.
async function renderAdminTexts(body, code) {
  const en = await textsFor(code), e = await langPackFor(code, true), isEn = code === "en";
  const l = languageList(true).find((x) => x.code === code) || { name: code };
  const backTxt = isEn ? "Back to built-in" : "Back to the file's text";
  if (isEn && ADMIN_TEXT_FILTER !== "changed") ADMIN_TEXT_FILTER = "all";
  const draft = {};
  const draw = () => {
    const q = ADMIN_TEXT_Q.trim().toLowerCase();
    const cur = (k) => (k in draft ? draft[k] : (e.pack[k] || ""));
    let rows = en.filter(([k, v]) => !q || k.toLowerCase().includes(q) || v.toLowerCase().includes(q) || cur(k).toLowerCase().includes(q));
    if (ADMIN_TEXT_FILTER === "missing") rows = rows.filter(([k]) => !cur(k));
    if (ADMIN_TEXT_FILTER === "changed") rows = rows.filter(([k]) => k in e.over || k in draft);
    if (ADMIN_TEXT_FILTER === "names") rows = rows.filter(([k]) => k.startsWith("data:"));
    const per = 40, pages = Math.max(1, Math.ceil(rows.length / per));
    ADMIN_TEXT_PAGE = Math.min(ADMIN_TEXT_PAGE, pages - 1);
    const shown = rows.slice(ADMIN_TEXT_PAGE * per, ADMIN_TEXT_PAGE * per + per);
    const dirty = Object.keys(draft).length;
    body.innerHTML = `<button type="button" class="btn ghost small" data-txback style="margin-bottom:10px;">&#8249; Languages</button>
      <div class="rl-card"><div class="rl-h"><b>${esc(l.name)} texts</b> <span class="meta" style="font-size:11.5px;">${esc(code)}</span></div>
      <div class="tx-tools"><input type="search" data-txq placeholder="Search English or ${esc(l.name)}…" value="${esc(ADMIN_TEXT_Q)}" />
        <div class="seg">${(isEn ? [["all", "All"], ["changed", "Changed by you"]] : [["all", "All"], ["missing", "Not translated"], ["changed", "Changed by you"], ["names", "Game names"]]).map(([k, n]) => `<button type="button" data-txf="${k}" class="${ADMIN_TEXT_FILTER === k ? "active" : ""}">${n}</button>`).join("")}</div></div>
      <div class="meta" style="font-size:11.5px; margin:6px 0;">${rows.length.toLocaleString()} texts · page ${ADMIN_TEXT_PAGE + 1} / ${pages}</div>
      <div class="tx-list">${shown.map(([k, v]) => `<div class="tx-row${k in e.over ? " chg" : ""}"><div class="tx-en"><small>${esc(k)}</small>${esc(v)}</div><textarea rows="${v.length > 70 ? 3 : 1}" data-txkey="${esc(k)}" dir="${langDir(code)}" placeholder="${isEn ? "(built-in text)" : "(shows in English)"}">${esc(cur(k))}</textarea>${k in e.over ? `<button type="button" class="tx-reset" data-txreset="${esc(k)}" title="${backTxt}">&#8634;</button>` : ""}</div>`).join("") || `<div class="meta">Nothing here.</div>`}</div>
      <div class="rl-foot"><button type="button" class="btn ghost small" data-txpage="-1" ${ADMIN_TEXT_PAGE ? "" : "disabled"}>&#8249; Prev</button><button type="button" class="btn ghost small" data-txpage="1" ${ADMIN_TEXT_PAGE < pages - 1 ? "" : "disabled"}>Next &#8250;</button><span style="flex:1"></span><button type="button" class="btn small" data-txsave ${dirty ? "" : "disabled"}>Save ${dirty || ""}</button></div></div>`;
    body.querySelector("[data-txback]").addEventListener("click", () => { if (dirty && !confirm("Leave without saving your changes?")) return; ADMIN_LANG_OPEN = null; renderAdminLanguages(body); });
    const qi = body.querySelector("[data-txq]");
    qi.addEventListener("input", () => { ADMIN_TEXT_Q = qi.value; ADMIN_TEXT_PAGE = 0; clearTimeout(qi._t); qi._t = setTimeout(() => { draw(); const q2 = body.querySelector("[data-txq]"); q2.focus(); q2.setSelectionRange(q2.value.length, q2.value.length); }, 250); });
    body.querySelectorAll("[data-txf]").forEach((b) => b.addEventListener("click", () => { ADMIN_TEXT_FILTER = b.dataset.txf; ADMIN_TEXT_PAGE = 0; draw(); }));
    body.querySelectorAll("[data-txpage]").forEach((b) => b.addEventListener("click", () => { ADMIN_TEXT_PAGE += Number(b.dataset.txpage); draw(); window.scrollTo(0, body.getBoundingClientRect().top + scrollY - 80); }));
    body.querySelectorAll("[data-txkey]").forEach((ta) => ta.addEventListener("input", () => {
      const k = ta.dataset.txkey; draft[k] = ta.value;
      const sb_ = body.querySelector("[data-txsave]"); sb_.disabled = false; sb_.textContent = `Save ${Object.keys(draft).length}`;
    }));
    body.querySelectorAll("[data-txreset]").forEach((b) => b.addEventListener("click", async () => {
      const over = { ...e.over }; delete over[b.dataset.txreset];
      try { await saveLangOverrides(code, over); toast(backTxt); renderAdminTexts(body, code); } catch (err) { toast(err.message || "Couldn't save", true); }
    }));
    body.querySelector("[data-txsave]").addEventListener("click", async () => {
      const enMap = new Map(en);
      const bad = Object.entries(draft).filter(([k, v]) => v.trim() && textPlaceholders(v) !== textPlaceholders(enMap.get(k)));
      if (bad.length) { toast(`Keep the {placeholders} as in English: ${bad[0][0]}`, true); return; }
      const over = { ...e.over };
      Object.entries(draft).forEach(([k, v]) => { if (!v.trim()) v = ""; if (isEn) { if (!v || v === enMap.get(k)) delete over[k]; else over[k] = v; return; } if (!v || v === (e.file[k] || "")) { if (!v && e.file[k]) over[k] = ""; else delete over[k]; } else over[k] = v; });
      try { await saveLangOverrides(code, over); toast(`${Object.keys(draft).length} texts saved`); renderAdminTexts(body, code); } catch (err) { toast(err.message || "Couldn't save", true); }
    });
  };
  draw();
}

// ---- Backup & Restore (Admin) ----
// Everything the admin controls, in one file: site settings (incl. languages,
// rules, menu), visibility, the owner's saved states (pack links, trade
// rates…) and every game-data table. Listed parents first (restore order).
const BACKUP_TABLES = [
  { t: "site_config", pk: ["key"] }, { t: "ui_visibility", pk: ["key"] },
  { t: "calc_state", pk: ["user_id", "calc_name"], q: () => `user_id=eq.${PROGRESSION_OWNER_ID}`, drop: ["id"] },
  { t: "pack_tables", pk: ["id"] },
  { t: "experts", pk: ["id"] }, { t: "expert_affinity_nodes", pk: ["id"] }, { t: "expert_skill_nodes", pk: ["id"] }, { t: "expert_research_nodes", pk: ["id"] },
  { t: "pets_nodes", pk: ["id"] }, { t: PET_LEVELS_TABLE, pk: ["id"] }, { t: "pet_refine_nodes", pk: ["id"] },
  { t: "heroes", pk: ["id"] }, { t: "hero_gen_star_stats", pk: ["generation", "step"] }, { t: "hero_gen_widget_stats", pk: ["generation", "level"] },
  { t: "progression_tables", pk: ["id"] }, { t: "progression_rows", pk: ["id"] },
  { t: "charm_levels", pk: ["id"] }, { t: "chief_gear_set_bonus", pk: ["id"] },
  { t: "research_center_nodes", pk: ["id"] }, { t: "t11_helios_nodes", pk: ["id"] }, { t: "t12_nodes", pk: ["id"] },
  { t: "skin_page_categories", pk: ["id"] }, { t: "skins_catalog", pk: ["id"] },
  { t: "collection_gallery_levels", pk: ["id"] }, { t: "tundra_album_levels", pk: ["id"] },
  { t: "buff_tables", pk: ["id"], q: () => `user_id=eq.${PROGRESSION_OWNER_ID}` }, { t: "buff_columns", pk: ["id"] }, { t: "buff_rows", pk: ["id"] }, { t: "buff_cells", pk: ["id"] },
];
const backupKey = (spec, row) => spec.pk.map((k) => String(row[k])).join("|");
// A restore file is checked before anything is written: each row must be a
// plain object with its key filled, only the table's own columns, the owner's
// id where the table has one, and no text that could run as page code
// (script tags, on…= handlers, javascript: / data:text links). Rows that fail
// are left out and counted in the preview.
const BACKUP_UNSAFE = /<\s*\/?\s*(script|iframe|object|embed|svg|math|link|meta|style|base|form)\b|\bon[a-z]+\s*=|^\s*(javascript|vbscript)\s*:|^\s*data\s*:\s*text\/html/i;
function backupValueSafe(v, depth) {
  if (v == null || typeof v === "number" || typeof v === "boolean") return true;
  if (typeof v === "string") return !BACKUP_UNSAFE.test(v);
  if ((depth || 0) > 40 || typeof v !== "object") return false;
  return Object.entries(v).every(([k, x]) => !BACKUP_UNSAFE.test(k) && backupValueSafe(x, (depth || 0) + 1));
}
function backupRowOk(spec, row, cols) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return false;
  if (spec.pk.some((k) => row[k] == null || row[k] === "")) return false;
  if (cols && cols.size && Object.keys(row).some((k) => !cols.has(k))) return false;
  if ("user_id" in row && (spec.t === "calc_state" || spec.t === "buff_tables") && row.user_id !== PROGRESSION_OWNER_ID) return false;
  return backupValueSafe(row);
}
async function makeBackup(onStep) {
  const out = { app: "WOS RST", kind: "admin-backup", version: 1, made: new Date().toISOString(), tables: {} };
  for (const spec of BACKUP_TABLES) {
    if (onStep) onStep(spec.t);
    const q = spec.q ? spec.q() + "&" : "";
    out.tables[spec.t] = await sb(`${spec.t}?${q}select=*&order=${spec.pk.map((k) => k + ".asc").join(",")}`);
  }
  return out;
}
function backupFileName(prefix) { const d = new Date(); const z = (n) => String(n).padStart(2, "0"); return `${prefix}-${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}.json`; }
async function downloadBackup(prefix, onStep) {
  const data = await makeBackup(onStep);
  downloadTextFile(backupFileName(prefix || "wosrst-backup"), JSON.stringify(data), "application/json");
  try { localStorage.setItem("admin_last_backup", data.made); } catch (e) { /* storage blocked */ }
  return data;
}
async function renderAdminBackup(body) {
  let last = null; try { last = localStorage.getItem("admin_last_backup"); } catch (e) { /* none */ }
  body.innerHTML = `
    <div class="rl-card">
      <div class="rl-h"><b>Backup</b></div>
      <p class="desc" style="margin:4px 0 10px;">Downloads everything you control in Admin as one file: site settings (menu, rules, languages, contact, currencies, visibility), your pack tables and pack settings, and all game data (experts, pets, heroes, gear, charms, research, skins, VIP, alliance). Keep it somewhere safe — on your phone, PC or cloud drive.</p>
      <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;"><button type="button" class="btn small" data-bkdown>&#8615; Download backup</button><span class="meta" data-bkstatus style="font-size:12px;">${last ? `Last backup from this browser: ${esc(new Date(last).toLocaleString())}` : "No backup made from this browser yet."}</span></div>
    </div>
    <div class="rl-card" style="margin-top:12px;">
      <div class="rl-h"><b>Restore</b></div>
      <p class="desc" style="margin:4px 0 10px;">Pick a backup file. Nothing changes yet: you'll see what's different for each part first, choose what to put back, and a copy of today's data is downloaded automatically before anything is restored.</p>
      <label class="btn ghost small lg-up" role="button">&#8613; Choose backup file<input type="file" accept=".json,application/json" data-bkfile hidden /></label>
      <div data-bkpreview style="margin-top:12px;"></div>
    </div>`;
  const status = body.querySelector("[data-bkstatus]");
  body.querySelector("[data-bkdown]").addEventListener("click", async (ev) => {
    const btn = ev.currentTarget; btn.disabled = true;
    try { const d = await downloadBackup("wosrst-backup", (t) => { status.textContent = `Reading ${t}…`; }); status.textContent = `Backup downloaded (${Object.values(d.tables).reduce((n, r) => n + r.length, 0).toLocaleString()} rows).`; }
    catch (err) { status.textContent = "Backup failed: " + (err.message || err); toast("Backup failed", true); }
    btn.disabled = false;
  });
  body.querySelector("[data-bkfile]").addEventListener("change", async (ev) => {
    const f = ev.target.files && ev.target.files[0]; ev.target.value = "";
    if (!f) return;
    let file;
    try { file = JSON.parse(await f.text()); } catch (e) { toast("That isn't a backup file", true); return; }
    if (!file || file.kind !== "admin-backup" || !file.tables) { toast("That isn't a WOS RST backup file", true); return; }
    showRestorePreview(body.querySelector("[data-bkpreview]"), file);
  });
}
async function showRestorePreview(el, file) {
  el.innerHTML = `<div class="meta">Comparing with today's data…</div>`;
  const now = await makeBackup();
  const plan = BACKUP_TABLES.filter((spec) => Array.isArray(file.tables[spec.t])).map((spec) => {
    const cur = new Map(now.tables[spec.t].map((r) => [backupKey(spec, r), r]));
    const cols = new Set(); now.tables[spec.t].forEach((r) => Object.keys(r).forEach((k) => cols.add(k)));
    const okRows = file.tables[spec.t].filter((r) => backupRowOk(spec, r, cols));
    const bad = file.tables[spec.t].length - okRows.length;
    const inFile = new Map(okRows.map((r) => [backupKey(spec, r), r]));
    const put = [], extra = [];
    inFile.forEach((r, k) => { const c = cur.get(k); if (!c || JSON.stringify(c) !== JSON.stringify(r)) put.push(r); });
    cur.forEach((r, k) => { if (!inFile.has(k)) extra.push(r); });
    return { spec, put, extra, bad, back: put.filter((r) => !cur.has(backupKey(spec, r))).length };
  });
  const changed = plan.filter((p) => p.put.length || p.extra.length || p.bad);
  const badRows = plan.reduce((a, p) => a + p.bad, 0);
  el.innerHTML = `<div class="meta" style="font-size:12px; margin-bottom:6px;">Backup from <b>${esc(new Date(file.made).toLocaleString())}</b>. ${changed.length ? `${changed.length} part(s) differ from today:` : "Everything is the same as today — nothing to restore."}</div>
    ${changed.length ? `<div class="bk-list">${changed.map((p) => `<label class="bk-row"><input type="checkbox" data-bkpart="${p.spec.t}" checked /><span><b>${esc(p.spec.t)}</b><br><small>${p.put.length - p.back ? `${p.put.length - p.back} changed` : ""}${p.put.length - p.back && p.back ? " · " : ""}${p.back ? `${p.back} deleted since — put back` : ""}${p.extra.length ? `${p.put.length ? " · " : ""}${p.extra.length} added since` : ""}${p.bad ? `${p.put.length || p.extra.length ? " · " : ""}<span style="color:var(--danger,#e66);">${p.bad} row(s) left out (not valid)</span>` : ""}</small></span></label>`).join("")}</div>
      ${badRows ? `<div class="meta" style="font-size:12px; color:var(--danger,#e66); margin-top:6px;">${badRows} row(s) in this file don't match the tables (unknown columns, missing key, another user's data or page code) and won't be restored.</div>` : ""}
      <label class="bk-row" style="margin-top:6px;"><input type="checkbox" data-bkremove /><span>Also delete rows added since the backup<br><small>Off: rows added later are kept.</small></span></label>
      <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:10px;"><button type="button" class="btn small" data-bkgo>Restore ticked parts</button></div>` : ""}`;
  const go = el.querySelector("[data-bkgo]");
  if (!go) return;
  go.addEventListener("click", async () => {
    const parts = plan.filter((p) => { const cb = el.querySelector(`[data-bkpart="${p.spec.t}"]`); return cb && cb.checked; });
    const removeExtra = el.querySelector("[data-bkremove]").checked;
    if (!parts.length) { toast("Tick at least one part", true); return; }
    if (!confirm(`Restore ${parts.length} part(s) from the backup${removeExtra ? " and delete rows added since" : ""}? A copy of today's data is downloaded first.`)) return;
    go.disabled = true;
    try {
      downloadTextFile(backupFileName("wosrst-before-restore"), JSON.stringify(now), "application/json"); // safety copy
      for (const p of parts) { // parents first
        const rows = p.spec.drop ? p.put.map((r) => { const c = { ...r }; p.spec.drop.forEach((k) => { delete c[k]; }); return c; }) : p.put;
        for (let i = 0; i < rows.length; i += 300) await sb(`${p.spec.t}?on_conflict=${p.spec.pk.join(",")}`, { method: "POST", prefer: "resolution=merge-duplicates,return=minimal", body: JSON.stringify(rows.slice(i, i + 300)) });
      }
      if (removeExtra) for (const p of parts.slice().reverse()) { // children first
        for (let i = 0; i < p.extra.length; i += 100) {
          const chunk = p.extra.slice(i, i + 100);
          const filter = p.spec.pk.length === 1 ? `${p.spec.pk[0]}=in.(${chunk.map((r) => encodeURIComponent(JSON.stringify(String(r[p.spec.pk[0]])))).join(",")})` : `or=(${chunk.map((r) => `and(${p.spec.pk.map((k) => `${k}.eq.${encodeURIComponent(r[k])}`).join(",")})`).join(",")})`;
          await sb(`${p.spec.t}?${filter}`, { method: "DELETE", prefer: "return=minimal" });
        }
      }
      toast("Restored — reloading the page");
      setTimeout(() => location.reload(), 1200);
    } catch (err) { toast("Restore stopped: " + (err.message || err), true); go.disabled = false; }
  });
}

// ---- Pack Resources: the Packs page column dropdown ----
// Built-in names can be hidden and ordered; custom names can be added with
// an icon and, optionally, what one of them opens into (so a custom chest
// counts toward the real materials in Pack cost).
async function renderAdminPackResources(body) {
  await ensureSiteConfig();
  const cfg = packResourceConfig();
  // A custom item with a built-in item's name (an "FC Crate" added before it
  // was built in) showed twice; the built-in one (and its contents) is kept.
  const builtinLower = new Set(PACK_RESOURCE_NAMES.map((n) => n.toLowerCase()));
  const custom = cfg.custom.filter((x) => !builtinLower.has(String(x.name).toLowerCase())).map((x) => ({ name: x.name, icon: x.icon || "", contents: x.contents || {} }));
  const hidden = new Set(cfg.hidden.map((n) => String(n).toLowerCase()));
  let removed = cfg.removed.slice();
  const removedLower = new Set(removed.map((n) => String(n).toLowerCase()));
  const builtin = PACK_RESOURCE_NAMES.filter((n) => !PACK_RESOURCE_HIDDEN.has(n) && !removedLower.has(n.toLowerCase()));
  let seq = 0;
  const all = [...builtin.map((n) => ({ name: n, builtin: true, contents: cfg.gives[n] || PACK_BUNDLES[n] || {} })), ...custom.map((c) => ({ ...c, builtin: false }))].map((x) => ({ ...x, id: "r" + (++seq), hidden: hidden.has(x.name.toLowerCase()) }));
  const orderIdx = (n) => { const i = cfg.order.findIndex((o) => String(o).toLowerCase() === n.toLowerCase()); return i === -1 ? Infinity : i; };
  all.sort((a, b) => { const oa = orderIdx(a.name), ob = orderIdx(b.name); if (oa !== ob) return oa - ob; return materialDisplayName(a.name).localeCompare(materialDisplayName(b.name), undefined, { numeric: true, sensitivity: "base" }); });
  const contentsText = (c) => Object.entries(c || {}).map(([k, v]) => `${k}: ${v}`).join(", ");
  const parseContents = (txt) => { const out = {}; String(txt || "").split(",").forEach((part) => { const m = part.split(":"); if (m.length < 2) return; const k = m[0].trim(), v = Number(String(m[1]).replace(/,/g, "").trim()); if (k && v > 0) out[k] = v; }); return out; };
  // Every change is saved right away (the whole list is one setting).
  const save = async (msg) => {
    const same = (a, b) => JSON.stringify(a || {}) === JSON.stringify(b || {});
    const gives = {};
    all.filter((x) => x.builtin).forEach((x) => { if (!same(x.contents, PACK_BUNDLES[x.name] || {})) gives[x.name] = x.contents; });
    await saveSiteConfig("pack_resources", { removed, gives, custom: all.filter((x) => !x.builtin).map((x) => ({ name: x.name, icon: (x.icon || "").trim(), contents: x.contents })), hidden: all.filter((x) => x.hidden).map((x) => x.name), order: all.map((x) => x.name) });
    PACK_TABLES_CACHE = PACK_TABLES_STASH = null; if (msg) toast(msg);
  };
  const draw = () => {
    body.innerHTML = `<p class="desc" style="margin:0 0 8px;">The names offered in the column dropdown on the Packs page, in this order. "Gives" says what one of the item counts as (a chest or bundle).</p>`
      + admListHtml(all, { title: "Pack resources", attr: "data-resrow", sortable: true, img: (r) => (r.builtin ? bpIcon({ name: r.name }) : r.icon), name: (r) => materialDisplayName(r.name), sub: (r) => [r.builtin ? "built-in" : "your item", r.hidden ? "hidden" : "", Object.keys(r.contents || {}).length ? "= " + contentsText(r.contents) : ""].filter(Boolean).join(" · ") })
      + (removed.length ? `<div style="margin-top:14px;"><div class="meta" style="font-size:11.5px; font-weight:600; margin-bottom:6px;">Removed (not in the dropdown) — tap to put back</div><div style="display:flex; gap:6px; flex-wrap:wrap;">${removed.map((n) => `<button class="btn ghost small" data-resrestore="${esc(n)}" type="button">${esc(materialDisplayName(n))} &#8634;</button>`).join("")}</div></div>` : "");
    wireAdminReorder(body, "data-resrow", async (ids) => {
      const byId = new Map(all.map((x) => [x.id, x])); all.splice(0, all.length, ...ids.map((id) => byId.get(id)).filter(Boolean));
      try { await save(); } catch (err) { toast(err.message || "Couldn't save", true); }
    });
    body.querySelectorAll("[data-resrestore]").forEach((b) => b.addEventListener("click", async () => {
      const name = b.dataset.resrestore;
      removed = removed.filter((n) => n.toLowerCase() !== name.toLowerCase());
      const bn = PACK_RESOURCE_NAMES.find((n) => n.toLowerCase() === name.toLowerCase());
      if (bn && !PACK_RESOURCE_HIDDEN.has(bn)) all.push({ id: "r" + (++seq), name: bn, builtin: true, contents: PACK_BUNDLES[bn] || {}, hidden: false });
      try { await save("Put back"); draw(); } catch (err) { toast(err.message || "Couldn't save", true); }
    }));
    const fields = (r) => [
      ...(r.builtin ? [] : [{ key: "icon", label: "Picture", type: "img", value: r.icon }, { key: "name", label: "Name", value: r.name }]),
      { key: "contents", label: "Gives per 1 (e.g. Design Plan: 1, Polishing Solution: 4) — empty = a plain item", value: contentsText(r.contents) },
      { key: "hidden", label: "Hide from the dropdown", type: "check", value: r.hidden },
    ];
    wireAdmList(body, {
      onEdit: (id) => {
        const r = all.find((x) => x.id === id);
        openAdmSheet({ title: `Edit · ${materialDisplayName(r.name)}${r.builtin ? " (built-in)" : ""}`, fields: fields(r),
          onSave: async (v) => {
            if (!r.builtin) { if (!v.name) throw new Error("Enter a name"); if (all.some((x) => x !== r && x.name.toLowerCase() === v.name.toLowerCase())) throw new Error("That name is already in the list"); r.name = v.name; r.icon = v.icon || ""; }
            r.contents = parseContents(v.contents); r.hidden = !!v.hidden;
            await save("Saved"); draw();
          },
          onDelete: async () => { all.splice(all.indexOf(r), 1); if (r.builtin) removed.push(r.name); await save(r.builtin ? "Removed (you can put it back below)" : "Deleted"); draw(); },
          deleteText: r.builtin ? `Remove "${materialDisplayName(r.name)}" from the dropdown? You can put it back later.` : `Delete "${r.name}"?` });
      },
      onAdd: () => openAdmSheet({ title: "Add a resource", fields: fields({ builtin: false, contents: {}, hidden: false }),
        onSave: async (v) => {
          if (!v.name) throw new Error("Enter a name");
          if (all.some((x) => x.name.toLowerCase() === v.name.toLowerCase())) throw new Error("That name is already in the list");
          all.push({ id: "r" + (++seq), name: v.name, icon: v.icon || "", contents: parseContents(v.contents), hidden: !!v.hidden, builtin: false });
          await save("Resource added"); draw();
        } }),
    });
  };
  draw();
}

// ---- Items: one place for each item's picture, short
// name, the planner pages it fills, speedup minutes and what it counts as.
// Saved in site_config "item_registry" (only changes; see itemPageMaps);
// "Counts as" is the same setting as Pack Resources "Gives".
function afterItemRegistryChange() {
  ITEM_REG_MEMO = null;
  PACK_TABLES_CACHE = PACK_TABLES_STASH = null;
  afterGameRulesChange();
}
async function saveItemRegistry(next) {
  await saveSiteConfig("item_registry", next);
  afterItemRegistryChange();
}
// Is this name (or the box it stands for) used by a planner page?
function itemIsLinked(name) {
  const m = itemPageMaps(), box = (itemReg(name) || {}).from || name;
  return [m.links, m.chests, m.fixed].some((map) => Object.values(map).some((l) => l.includes(box))) || !!itemReg(name);
}
async function itemRegistryRename(oldName, newName) {
  const reg = { ...itemRegistry() }, old = reg[oldName] || {};
  const box = old.from || oldName;
  const icon = old.icon || bpIcon({ name: oldName }) || "";
  delete reg[oldName];
  reg[newName] = { ...old, ...(icon ? { icon } : {}), ...(box !== newName ? { from: box } : {}) };
  if (box === newName) delete reg[newName].from;
  if (!Object.keys(reg[newName]).length) delete reg[newName];
  await saveItemRegistry(reg);
}
let ADMIN_ITEMS_GROUP = null, ADMIN_ITEMS_Q = "";
async function renderAdminItems(body) {
  await ensureSiteConfig();
  const names = new Map();
  const add = (n, g) => { if (n && !names.has(n)) names.set(n, g); };
  const maps = itemPageMaps();
  backpackItems().forEach((g) => g.items.forEach((it) => add(it.name, g.title)));
  [maps.links, maps.chests, maps.fixed].forEach((map) => Object.values(map).forEach((l) => l.forEach((n) => { if (!maps.alias[n]) add(n, "Page boxes"); })));
  PACK_RESOURCE_NAMES.filter((n) => !PACK_RESOURCE_HIDDEN.has(n)).forEach((n) => add(n, "Pack items"));
  packResourceConfig().custom.forEach((c) => add(c.name, "Pack items"));
  Object.keys(itemRegistry()).forEach((n) => add(n, "Other"));
  let seq = 0;
  const all = [...names].map(([name, group]) => ({ id: "i" + (++seq), name, group }));
  const groups = [...new Set(all.map((x) => x.group))];
  if (!groups.includes(ADMIN_ITEMS_GROUP)) ADMIN_ITEMS_GROUP = groups[0] || "";
  const contentsText = (c) => Object.entries(c || {}).map(([k, v]) => `${k}: ${v}`).join(", ");
  const parseContents = (txt) => { const out = {}; String(txt || "").split(",").forEach((part) => { const m = part.split(":"); if (m.length < 2) return; const k = m[0].trim(), v = Number(String(m[1]).replace(/,/g, "").trim()); if (k && v > 0) out[k] = v; }); return out; };
  const boxOf = (name) => (itemReg(name) || {}).from || name;
  const defIn = (def, k, box) => (def[k] || []).includes(box);
  const pagesOf = (r) => ITEM_PAGE_KEYS.filter(([k]) => (maps.links[k] || []).includes(boxOf(r.name))).map(([, l]) => l);
  const isSpeed = (n) => /^(Research |Troop |Construction |Expert )?Speedup \S+$/.test(n);
  const draw = () => {
    const q = ADMIN_ITEMS_Q.trim().toLowerCase();
    const list = q ? all.filter((x) => x.name.toLowerCase().includes(q)) : all.filter((x) => x.group === ADMIN_ITEMS_GROUP);
    body.innerHTML = `<p class="desc" style="margin:0 0 8px;">Every item the site knows. Change its picture (shown everywhere: Backpack, planner tiles, Budgets, My Purchases, Packs), its short name on the planner tiles, which planner pages fill their box of this name from the Backpack, and the minutes of a speedup (so a new size counts). Nothing changed = the site's own values. To rename an item, use Backpack Items: its page links move with it.</p>
      <input type="search" data-itemq placeholder="Search items" value="${esc(ADMIN_ITEMS_Q)}" style="width:100%; max-width:320px; margin-bottom:8px;" />
      ${q ? "" : `<div class="adm-chips"><div class="adm-chips-row">${groups.map((g) => `<button type="button" class="adm-chip${g === ADMIN_ITEMS_GROUP ? " on" : ""}" data-itemgroup="${esc(g)}">${esc(g)} <span class="meta">${all.filter((x) => x.group === g).length}</span></button>`).join("")}</div></div>`}`
      + admListHtml(list, { title: q ? "Search" : ADMIN_ITEMS_GROUP, attr: "data-itemrow", add: false, img: (r) => bpIcon({ name: r.name }) || materialIconSrc(r.name), name: (r) => r.name,
        sub: (r) => [itemReg(r.name) ? "changed" : "", pagesOf(r).join(", "), itemMinutes(r.name) && isSpeed(r.name) ? `${itemMinutes(r.name)} min` : ""].filter(Boolean).join(" · ") });
    const qi = body.querySelector("[data-itemq]");
    qi.addEventListener("input", () => { ADMIN_ITEMS_Q = qi.value; const pos = qi.selectionStart; draw(); const n = body.querySelector("[data-itemq]"); n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) { /* search box */ } });
    body.querySelectorAll("[data-itemgroup]").forEach((b) => b.addEventListener("click", () => { ADMIN_ITEMS_GROUP = b.dataset.itemgroup; keepBoxes(body, draw); }));
    wireAdmList(body, {
      onEdit: (id) => {
        const r = all.find((x) => x.id === id), name = r.name, box = boxOf(name), cur = itemReg(name) || {};
        const sigils = / Sigils$/.test(box);
        const cfg = packResourceConfig(), custom = packCustomResource(name);
        const givesNow = custom ? (custom.contents || {}) : (cfg.gives[name] || PACK_BUNDLES[name] || {});
        const fields = [
          { key: "icon", label: "Picture (empty = the site's own)", type: "img", value: cur.icon || "" },
          { key: "short", label: `Short name on planner tiles (empty = ${MATERIAL_NAME_SHORT[box] || "full name"})`, value: cur.short || "", half: true },
          ...(isSpeed(name) || cur.minutes ? [{ key: "minutes", label: "Minutes (speedups)", type: "num", value: cur.minutes || itemMinutes(name) || null, half: true }] : []),
          { key: "pgnote", type: "note", label: box !== name ? `Fills the page box "${box}" on:` : "Fills its box from the Backpack on:" },
          ...ITEM_PAGE_KEYS.map(([k, l]) => ({ key: "pg_" + k, label: l + (k === "experts" && sigils ? " (sigils: always)" : ""), type: "check", half: true, value: (maps.links[k] || []).includes(box) })),
          { key: "chnote", type: "note", label: "Shown read-only as a chest on:", more: true },
          ...ITEM_PAGE_KEYS.map(([k, l]) => ({ key: "ch_" + k, label: l, type: "check", half: true, more: true, value: (maps.chests[k] || []).includes(box) })),
          { key: "ctnote", type: "note", label: "…and counted as its contents (below) on:", more: true },
          ...ITEM_PAGE_KEYS.map(([k, l]) => ({ key: "ct_" + k, label: l, type: "check", half: true, more: true, value: (maps.fixed[k] || []).includes(box) })),
          { key: "gives", label: "Counts as, per 1 (e.g. Design Plan: 1, Polishing Solution: 4) — same as Pack Resources \"Gives\"", value: contentsText(givesNow), more: true },
        ];
        openAdmSheet({ title: `Item · ${name}`, fields, noFocus: true, deleteLabel: "Reset to built-in",
          deleteText: `Put "${name}" back to the site's own picture, short name, pages and minutes? ("Counts as" stays.)`,
          onSave: async (v) => {
            const e = { ...cur };
            const setOr = (k, val, def) => { if (val == null || val === "" || val === def) delete e[k]; else e[k] = val; };
            setOr("icon", v.icon, "");
            setOr("short", v.short, MATERIAL_NAME_SHORT[box] || "");
            if ("minutes" in v) { const defMin = (() => { const m = /speedup (\d+[mh])$/i.exec(name); return (m && BP_MINUTES[m[1]]) || 0; })(); setOr("minutes", Number(v.minutes) > 0 ? Number(v.minutes) : null, defMin); }
            [["pages", "pg_", BACKPACK_PAGE_LINKS], ["chests", "ch_", BACKPACK_PAGE_CHESTS], ["count", "ct_", BACKPACK_FIXED_CHESTS]].forEach(([field, pre, def]) => {
              const on = ITEM_PAGE_KEYS.map(([k]) => k).filter((k) => v[pre + k]);
              const same = ITEM_PAGE_KEYS.every(([k]) => !!v[pre + k] === defIn(def, k, box));
              if (same) delete e[field]; else e[field] = on;
            });
            const reg = { ...itemRegistry() };
            if (Object.keys(e).length) reg[name] = e; else delete reg[name];
            // "Counts as" lives in Pack Resources (one setting for packs and pages).
            const g = parseContents(v.gives);
            if (JSON.stringify(g) !== JSON.stringify(givesNow)) {
              const c = { ...(siteConfig("pack_resources", {}) || {}) };
              if (custom) c.custom = (c.custom || []).map((x) => (String(x.name).toLowerCase() === name.toLowerCase() ? { ...x, contents: g } : x));
              else {
                const gv = { ...(c.gives || {}) };
                if (JSON.stringify(g) === JSON.stringify(PACK_BUNDLES[name] || {})) delete gv[name]; else gv[name] = g;
                c.gives = gv;
              }
              await saveSiteConfig("pack_resources", c);
            }
            await saveItemRegistry(reg);
            toast("Saved"); renderAdminItems(body);
          },
          onDelete: async () => {
            const reg = { ...itemRegistry() };
            if (cur.from) reg[name] = { from: cur.from }; else delete reg[name];
            await saveItemRegistry(reg); toast("Back to built-in"); renderAdminItems(body);
          } });
      },
    });
  };
  draw();
}

// ---- Backpack Items: the item list on the Backpack page ----
// Saved in site_config "backpack_items" as { items: [{ group, name, icon }] };
// row order = order on the page, groups in order of first appearance.
let ADMIN_BP_GROUP = null;
async function renderAdminBackpackItems(body) {
  await ensureSiteConfig();
  let seq = 0;
  const savedTabs = new Map((((siteConfig("backpack_items", null) || {}).items) || []).filter((x) => x && x.tab).map((x) => [x.name, x.tab]));
  const items = backpackItems().flatMap((g) => g.items.map((it) => ({ id: "b" + (++seq), group: g.title, name: it.name, icon: it.icon || "", tab: savedTabs.get(it.name) || "" })));
  await scanLearnedLoad().catch(() => []);
  // Game tab (where the item is in the game's Backpack): helps Scan.
  const TAB_LABEL = { res: "Resources", speed: "Speedup", gear: "Gear", other: "Other", none: "Not in the game Backpack" };
  const tabOf = (r) => r.tab || bpItemTabBuiltin(r.name);
  const taughtCount = (n) => SCAN_LEARNED.filter((e) => e.n === n).length;
  const groups = () => [...new Set(items.map((x) => x.group))];
  if (!groups().includes(ADMIN_BP_GROUP)) ADMIN_BP_GROUP = groups()[0] || "";
  const save = async (msg) => { await saveSiteConfig("backpack_items", { items: items.map((x) => ({ group: x.group, name: x.name, icon: (x.icon || "").trim(), ...(x.tab ? { tab: x.tab } : {}) })) }); if (msg) toast(msg); };
  const draw = () => {
    const list = items.filter((x) => x.group === ADMIN_BP_GROUP);
    body.innerHTML = `<p class="desc" style="margin:0 0 8px;">The items on the Backpack page, by tab. Leave the picture empty to use the site's own picture for that name. Renaming an item starts its saved amounts from zero for everyone (amounts are kept by name).</p>
      <div class="adm-chips"><div class="adm-chips-row">${groups().map((g) => `<button type="button" class="adm-chip${g === ADMIN_BP_GROUP ? " on" : ""}" data-bpgroup="${esc(g)}">${esc(g)} <span class="meta">${items.filter((x) => x.group === g).length}</span></button>`).join("")}</div></div>`
      + admListHtml(list, { title: ADMIN_BP_GROUP, attr: "data-bprow", sortable: true, img: (r) => bpIcon(r), name: (r) => r.name, sub: (r) => [r.icon ? "own picture" : "", tabOf(r) ? `game tab: ${TAB_LABEL[tabOf(r)]}` : "game tab: not set", taughtCount(r.name) ? `Scan taught ${taughtCount(r.name)}×` : ""].filter(Boolean).join(" · ") })
      + `<div style="margin-top:12px; display:flex; gap:8px; flex-wrap:wrap; align-items:center;"><button class="btn ghost small" data-bpreset type="button">Reset to the default list</button>
        ${SCAN_LEARNED.some((e) => e.n === SCAN_SKIP) ? `<span class="meta">Scan skips ${SCAN_LEARNED.filter((e) => e.n === SCAN_SKIP).length} tile picture(s) you marked "never ask again".</span><button class="btn ghost small" data-bpunskip type="button">Ask about them again</button>` : ""}</div>`;
    body.querySelectorAll("[data-bpgroup]").forEach((b) => b.addEventListener("click", () => { ADMIN_BP_GROUP = b.dataset.bpgroup; keepBoxes(body, draw); }));
    wireAdminReorder(body, "data-bprow", async (ids) => {
      // New order inside this tab; other tabs keep their places.
      const byId = new Map(items.map((x) => [x.id, x])), slots = items.map((x, i) => (x.group === ADMIN_BP_GROUP ? i : -1)).filter((i) => i >= 0);
      ids.forEach((id, k) => { items[slots[k]] = byId.get(id); });
      try { await save(); } catch (err) { toast(err.message || "Couldn't save", true); }
    });
    const fields = (r) => [
      { key: "icon", label: "Picture (empty = the site's own)", type: "img", value: r.icon },
      { key: "name", label: "Name", value: r.name },
      { key: "group", label: "Tab (group)", type: "select", options: [...new Set([...groups(), r.group].filter(Boolean))], value: r.group, half: true },
      { key: "newgroup", label: "…or a new tab", value: "", half: true },
      { key: "tab", label: "Game tab (where it is in the game's Backpack; helps Scan)", type: "select", value: r.tab || "",
        options: [["", `Not set${r.name && bpItemTabBuiltin(r.name) ? ` (Scan: ${TAB_LABEL[bpItemTabBuiltin(r.name)]})` : ""}`], ...Object.entries(TAB_LABEL)] },
      ...(r.name && taughtCount(r.name) ? [{ key: "forget", label: `Forget the ${taughtCount(r.name)} picture(s) Scan was taught for this item`, type: "check", value: false }] : []),
    ];
    const apply = (r, v) => {
      if (!v.name) throw new Error("Enter a name");
      if (items.some((x) => x !== r && x.name.toLowerCase() === v.name.toLowerCase())) throw new Error(`Duplicate name: ${v.name}`);
      r.name = v.name; r.icon = v.icon || ""; r.group = v.newgroup || v.group || ADMIN_BP_GROUP; r.tab = v.tab || "";
    };
    // "Forget": drop the pictures Scan was taught on the site for this item.
    const forgetTaught = async (n) => {
      await ensureSiteConfigKey("scan_learned");
      const cur = ((siteConfig("scan_learned", null) || {}).items) || [];
      await saveSiteConfig("scan_learned", { items: cur.filter((e) => e.n !== n) });
      await scanLearnedLoad().catch(() => []);
    };
    // A renamed item keeps its page links and picture (Admin → Items).
    const keepLinks = async (oldName, newName) => {
      if (!oldName || oldName === newName || !itemIsLinked(oldName)) return;
      if (!confirm(`"${oldName}" fills boxes on planner pages. Keep those links for "${newName}"? (Amounts saved under the old name still start from zero.)`)) return;
      await itemRegistryRename(oldName, newName);
    };
    wireAdmList(body, {
      onEdit: (id) => {
        const r = items.find((x) => x.id === id);
        openAdmSheet({ title: `Edit · ${r.name}`, fields: fields(r),
          onSave: async (v) => { const old = r.name; apply(r, v); await save("Saved"); if (v.forget) await forgetTaught(old); await keepLinks(old, r.name); ADMIN_BP_GROUP = r.group; draw(); },
          onDelete: async () => { items.splice(items.indexOf(r), 1); await save("Removed"); draw(); },
          deleteText: `Remove "${r.name}" from the Backpack? Amounts people saved are kept.` });
      },
      onAdd: () => openAdmSheet({ title: `Add an item`, fields: fields({ group: ADMIN_BP_GROUP }),
        onSave: async (v) => { const r = { id: "b" + (++seq) }; apply(r, v); const last = items.map((x) => x.group).lastIndexOf(r.group); items.splice(last >= 0 ? last + 1 : items.length, 0, r); await save("Item added"); ADMIN_BP_GROUP = r.group; draw(); } }),
    });
    const unskip = body.querySelector("[data-bpunskip]");
    if (unskip) unskip.addEventListener("click", async () => {
      if (!confirm("Forget every \"never ask again\" tile? Scan will list them again as tiles it doesn't know.")) return;
      try { await forgetTaught(SCAN_SKIP); toast("Scan will ask about them again"); draw(); } catch (err) { toast(err.message || "Couldn't save", true); }
    });
    body.querySelector("[data-bpreset]").addEventListener("click", async () => {
      if (!confirm("Replace the list with the default items? Amounts people saved are kept.")) return;
      try { await saveSiteConfig("backpack_items", {}); toast("Default list restored"); renderAdminBackpackItems(body); } catch (err) { toast(err.message || "Couldn't save", true); }
    });
  };
  draw();
}

// ---- Currency rates (site-wide, stored in site_config "currency_rates") ----
async function renderAdminCurrencies(body) {
  await ensureSiteConfig();
  const rates = currencyRates();
  body.innerHTML = `
    <div class="panel" style="max-width:620px;">
      <h2>Currencies</h2>
      <p class="desc">How many units of each currency equal 1 US dollar. Used when someone picks "Show prices in" on the Budgets page, unless a store price below covers that exact price point. Update these whenever you like; there is no automatic feed.</p>
      <div class="adm-scroll" style="max-height:60vh;">
        <table style="width:100%; border-collapse:collapse; font-size:12.5px;">
          <thead><tr>${ADMIN_TH}Currency</th>${ADMIN_TH}Per 1 USD</th></tr></thead>
          <tbody>${PACK_CURRENCIES.map((c) => `<tr><td style="padding:4px 8px;">${c.code} <span class="meta">${esc(c.symbol)}</span>${c.custom ? ` <button class="btn small ghost" type="button" data-curdel="${c.code}" title="Remove this currency" style="padding:1px 7px; margin-inline-start:6px;">×</button>` : ""}</td><td style="padding:4px 8px;"><input type="number" step="any" min="0" data-rate="${c.code}" value="${rates[c.code] ?? ""}" ${c.code === "USD" ? "disabled" : ""} style="width:130px;" /></td></tr>`).join("")}</tbody>
        </table>
      </div>
      <div style="margin-top:12px; display:flex; gap:8px; flex-wrap:wrap;"><button class="btn small" id="adminRatesSave" type="button">Save</button><button class="btn small ghost" id="adminRatesReset" type="button">Reset to defaults</button></div>
      <div style="margin-top:14px; padding-top:12px; border-top:1px solid var(--line);">
        <div class="meta" style="margin-bottom:6px;">Add a currency</div>
        <div class="adm-cur-add">
          <label><span>Code</span><input id="adminCurCode" placeholder="e.g. PKR" maxlength="5" /></label>
          <label><span>Symbol</span><input id="adminCurSymbol" placeholder="e.g. Rs" maxlength="6" /></label>
          <label><span>Per 1 USD</span><input id="adminCurRate" type="number" step="any" min="0" placeholder="e.g. 280" /></label>
          <button class="btn small" id="adminCurAdd" type="button">Add</button>
        </div>
      </div>
    </div>
    <div class="panel" style="max-width:620px; margin-top:14px;">
      <h2>Store prices</h2>
      <p class="desc">What each USD price point really costs in a store, per currency (tax, rounding, regional pricing). When someone shows prices in that currency, a pack priced at one of these USD points uses the value you type here; an empty slot keeps using the rate above. Totals that are not an exact price point always use the rate.</p>
      <label style="display:inline-flex; align-items:center; gap:8px; font-size:12px; margin-bottom:10px;"><span class="meta">Currency</span>
        <select id="adminPriceCur" style="font-size:12px; padding:4px 8px;">${PACK_CURRENCIES.filter((c) => c.code !== "USD").map((c) => `<option value="${c.code}">${c.code} ${esc(c.symbol)}</option>`).join("")}</select></label>
      <div class="adm-scroll" style="max-height:60vh;">
        <table style="width:100%; border-collapse:collapse; font-size:12.5px;">
          <thead><tr>${ADMIN_TH}USD price</th>${ADMIN_TH}By rate</th>${ADMIN_TH}Store price</th></tr></thead>
          <tbody id="adminPriceSlots"></tbody>
        </table>
      </div>
      <div style="margin-top:12px; display:flex; gap:8px; flex-wrap:wrap;"><button class="btn small" id="adminPricesSave" type="button">Save store prices</button><button class="btn small ghost" id="adminPricesClear" type="button">Clear this currency</button></div>
      <div style="margin-top:14px; padding-top:12px; border-top:1px solid var(--line);">
        <div class="meta" style="margin-bottom:6px;">Add a USD price point (applies to every currency)</div>
        <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
          <input id="adminSlotAdd" type="number" step="0.01" min="0" placeholder="e.g. 14.99" style="width:130px;" />
          <button class="btn small" id="adminSlotAddBtn" type="button">Add</button>
        </div>
      </div>
    </div>`;
  const curSel = document.getElementById("adminPriceCur");
  const slotsBody = document.getElementById("adminPriceSlots");
  let priceDraft = JSON.parse(JSON.stringify(currencyPrices()));
  const readSlots = (code) => {
    const cur = {};
    slotsBody.querySelectorAll("[data-slot]").forEach((inp) => { const v = Number(inp.value); if (v > 0) cur[inp.dataset.slot] = v; });
    if (Object.keys(cur).length) priceDraft[code] = cur; else delete priceDraft[code];
  };
  let renderSlots = () => {
    const code = curSel.value, cur = priceDraft[code] || {}, rate = Number(body.querySelector(`[data-rate="${code}"]`)?.value) || currencyRates()[code] || 0;
    slotsBody.innerHTML = currencyPriceSlots().map((s) => `<tr>
      <td style="padding:4px 8px;">$${s}${` <button class="btn small ghost" type="button" data-slotdel="${s}" title="Remove this price point" style="padding:1px 7px; margin-inline-start:6px;">\u00d7</button>`}</td>
      <td style="padding:4px 8px;" class="meta">${rate > 0 ? (Number(s) * rate).toFixed(2) : "—"}</td>
      <td style="padding:4px 8px;"><input type="number" step="any" min="0" data-slot="${s}" value="${cur[s] ?? ""}" placeholder="${rate > 0 ? (Number(s) * rate).toFixed(2) : ""}" class="keep-w" style="width:100%; max-width:130px; min-width:64px;" /></td></tr>`).join("");
  };
  let lastCode = curSel.value;
  curSel.addEventListener("change", () => { readSlots(lastCode); lastCode = curSel.value; renderSlots(); });
  const wireSlotDel = () => slotsBody.querySelectorAll("[data-slotdel]").forEach((b) => b.addEventListener("click", async () => {
    const key = b.dataset.slotdel;
    if (!confirm(`Remove the $${key} price point from every currency?`)) return;
    readSlots(curSel.value);
    Object.keys(priceDraft).forEach((c) => { delete priceDraft[c][key]; if (!Object.keys(priceDraft[c]).length) delete priceDraft[c]; });
    try { await saveSiteConfig("currency_prices", priceDraft); await savePackPricePoints(currencyPriceSlots().filter((x) => x !== key)); toast(`$${key} removed`); renderSlots(); } catch (err) { toast(err.message || "Couldn't save", true); }
  }));
  const renderSlotsWired = renderSlots;
  renderSlots = () => { renderSlotsWired(); wireSlotDel(); };
  renderSlots();
  document.getElementById("adminSlotAddBtn").addEventListener("click", async () => {
    const n = Number(document.getElementById("adminSlotAdd").value);
    if (!(n > 0)) { toast("Enter a USD price like 14.99", true); return; }
    const key = n.toFixed(2);
    if (currencyPriceSlots().includes(key)) { toast(`$${key} is already there`, true); return; }
    readSlots(curSel.value);
    try { await saveSiteConfig("currency_prices", priceDraft); await savePackPricePoints([...currencyPriceSlots(), key].sort((a, b) => Number(a) - Number(b))); toast(`$${key} added`); document.getElementById("adminSlotAdd").value = ""; renderSlots(); } catch (err) { toast(err.message || "Couldn't save", true); }
  });
  document.getElementById("adminPricesSave").addEventListener("click", async () => {
    readSlots(curSel.value);
    try { await saveSiteConfig("currency_prices", priceDraft); toast("Store prices saved"); } catch (err) { toast(err.message || "Couldn't save", true); }
  });
  document.getElementById("adminPricesClear").addEventListener("click", () => {
    delete priceDraft[curSel.value]; renderSlots();
  });
  document.getElementById("adminRatesSave").addEventListener("click", async () => {
    const out = {};
    body.querySelectorAll("[data-rate]").forEach((inp) => { const v = Number(inp.value); if (v > 0) out[inp.dataset.rate] = v; });
    out.USD = 1;
    try { await saveSiteConfig("currency_rates", out); toast("Rates saved"); } catch (err) { toast(err.message || "Couldn't save", true); }
  });
  document.getElementById("adminCurAdd").addEventListener("click", async () => {
    const code = document.getElementById("adminCurCode").value.trim().toUpperCase();
    const symbol = document.getElementById("adminCurSymbol").value.trim() || code;
    const rate = Number(document.getElementById("adminCurRate").value);
    if (!/^[A-Z]{3,5}$/.test(code)) { toast("Code must be 3-5 letters (e.g. PKR)", true); return; }
    if (PACK_CURRENCIES.some((c) => c.code === code)) { toast(`${code} is already in the list`, true); return; }
    if (!(rate > 0)) { toast("Enter how many units equal 1 USD", true); return; }
    const custom = (siteConfig("currency_custom", []) || []).filter((c) => c && c.code !== code);
    custom.push({ code, symbol });
    const ratesOut = { ...currencyRates(), [code]: rate, USD: 1 };
    readSlots(curSel.value);
    try { await saveSiteConfig("currency_custom", custom); await saveSiteConfig("currency_rates", ratesOut); await saveSiteConfig("currency_prices", priceDraft); toast(`${code} added`); renderAdminCurrencies(body); } catch (err) { toast(err.message || "Couldn't save", true); }
  });
  body.querySelectorAll("[data-curdel]").forEach((b) => b.addEventListener("click", async () => {
    const code = b.dataset.curdel;
    if (!confirm(`Remove ${code}? Its rate and store prices will be dropped.`)) return;
    const custom = (siteConfig("currency_custom", []) || []).filter((c) => c && c.code !== code);
    const ratesOut = { ...currencyRates() }; delete ratesOut[code];
    readSlots(curSel.value);
    const prices = { ...priceDraft }; delete prices[code];
    const i = PACK_CURRENCIES.findIndex((c) => c.code === code); if (i >= 0) PACK_CURRENCIES.splice(i, 1);
    if (DISPLAY_CURRENCY === code) setDisplayCurrency("");
    try { await saveSiteConfig("currency_custom", custom); await saveSiteConfig("currency_rates", ratesOut); await saveSiteConfig("currency_prices", prices); toast(`${code} removed`); renderAdminCurrencies(body); } catch (err) { toast(err.message || "Couldn't save", true); }
  }));
  document.getElementById("adminRatesReset").addEventListener("click", async () => {
    if (!confirm("Put every rate back to the built-in defaults?")) return;
    const cur = currencyRates(), keep = { ...CURRENCY_DEFAULT_RATES };
    PACK_CURRENCIES.filter((c) => c.custom && cur[c.code] > 0).forEach((c) => { keep[c.code] = cur[c.code]; });
    try { await saveSiteConfig("currency_rates", keep); toast("Rates reset"); renderAdminCurrencies(body); } catch (err) { toast("Couldn't save", true); }
  });
}

// ---- Contact us settings (site-wide, stored in site_config "contact") ----
// ---- Dashboard sources: order of the breakdown + simple bonus sources ----
// A new bonus from the game can be added as a "flat" source: a buff column of
// its own whose numbers (per troop and stat) count on everyone's Dashboard as
// they are. Saved in site_config "dashboard_sources" = { extra, order }.
const DASH_SOURCE_KIND = { "Roster Heroes": "Heroes roster", Skins: "Skin Gallery page", Islands: "Islands page" };
async function renderAdminDashSources(body) {
  await ensureSiteConfig();
  await ensureBuffTable();
  if (!BUFF_TABLE_ID) { body.innerHTML = `<p class="desc">The buff table isn't there yet.</p>`; return; }
  const [columns, rows] = await Promise.all([
    sb(`buff_columns?table_id=eq.${BUFF_TABLE_ID}&select=id,name,category,sort_order&order=sort_order.asc`),
    sb(`buff_rows?table_id=eq.${BUFF_TABLE_ID}&select=id,name,sort_order,buff_cells(id,value,column_id)&order=sort_order.asc`),
  ]);
  const cfg = dashSourcesConfig();
  const catOf = (c) => c.category || c.name;
  const heroes = specialSkillHeroNames(columns.map(catOf));
  const newHeroes = heroes.filter((h) => !SPECIAL_HERO_META[h]);
  let extra = cfg.extra.slice();
  let order = dashSourceOrder(heroes, extra);
  let open = null;
  const TROOPS = ["Infantry", "Lancers", "Marksman"], STATS = [["ATT", "Attack"], ["DEF", "Defense"], ["DMG", "Lethality"], ["HP", "Health"]];
  const kindOf = (k) => (extra.includes(k) ? "flat bonus (counted as typed)" : heroes.includes(k) ? "special-skill hero (by stars)" : DASH_SOURCE_KIND[k] || "page (its own data)");
  const save = async (msg) => {
    const sameOrder = JSON.stringify(order) === JSON.stringify(dashSourceOrderBase(heroes, extra));
    const value = { ...(extra.length ? { extra } : {}), ...(sameOrder ? {} : { order }) };
    await saveSiteConfig("dashboard_sources", value);
    dashDataChanged(); dropKeptGameData(); if (typeof budgetInvalidate === "function") budgetInvalidate();
    loadBuffCategories().catch(() => {});
    toast(msg);
  };
  const draw = () => {
    body.innerHTML = `<p class="desc" style="margin:0 0 10px;">The Dashboard adds these up for each troop and stat (top numbers and the breakdown pop-up). Pages count from their own data; special-skill heroes by their stars. When the game adds a new kind of bonus, add it below as a simple bonus source and type its numbers: it counts on everyone's Dashboard.</p>
      <div class="rl-card"><div class="rl-h"><b>Sources, in breakdown order</b></div>
        <div style="margin-top:6px;">${order.map((k) => `<div class="ds-row">${dsHandleHtml("data-dsdrag")}<span class="ds-n"><b>${esc(displaySourceName(k))}</b>${displaySourceName(k) !== k ? ` <span class="meta">(${esc(k)})</span>` : ""}<small>${esc(kindOf(k))}</small></span>
          <span class="rl-rowbtns">${extra.includes(k) ? `<button type="button" data-dsedit="${esc(k)}" title="Numbers" aria-label="numbers">&#9998;</button><button type="button" data-dsoff="${esc(k)}" title="Stop counting" aria-label="stop counting">&#10005;</button>` : ""}</span></div>
          ${open === k ? numbersHtml(k) : ""}`).join("")}</div>
        <div class="rl-foot"><span class="meta" style="font-size:11.5px;">${esc(t("drag_order_hint"))}</span><span style="flex:1"></span><button type="button" class="btn ghost small" data-dsreset ${cfg.order.length ? "" : "disabled"}>Built-in order</button></div>
      </div>
      <div class="rl-card" style="margin-top:12px;"><div class="rl-h"><b>Add a simple bonus source</b></div>
        <p class="desc" style="margin:4px 0 8px;">A new bonus with fixed numbers per troop and stat (e.g. a new building or event buff). After adding it, tap &#9998; to type its numbers.</p>
        <div style="display:flex; gap:8px; flex-wrap:wrap;"><input type="text" data-dsname placeholder="Name, e.g. Frost Star" maxlength="40" style="flex:1 1 200px; min-width:0;" /><button type="button" class="btn small" data-dsadd>Add</button></div>
        ${newHeroes.length ? `<p class="meta" style="font-size:11.5px; margin:8px 0 0;">Columns added in Admin count as special-skill heroes (by stars). Tick one to count it as a flat bonus instead: ${newHeroes.map((h) => `<label style="margin-inline-end:8px;"><input type="checkbox" data-dsflat="${esc(h)}" /> ${esc(h)}</label>`).join("")}</p>` : ""}
      </div>`;
    // Drag ⋮⋮ to change the order; it saves by itself ("✓ Order saved").
    body.querySelectorAll("[data-dsdrag]").forEach((h) => dragSort(h, {
      row: ".ds-row", place: () => {},
      refocus: (r, to) => body.querySelectorAll("[data-dsdrag]")[to]?.focus(),
      done: async (r, from, to) => {
        const [x] = order.splice(from, 1); order.splice(to, 0, x); draw();
        try { await save("\u2713 " + t("order_saved")); cfg.order = order.slice(); draw(); } catch (err) { toast(err.message || t("order_not_saved"), true); }
      },
    }));
    body.querySelector("[data-dsreset]").addEventListener("click", async () => { order = dashSourceOrderBase(heroes, extra); try { await save("Built-in order"); cfg.order = []; draw(); } catch (err) { toast(err.message || "Couldn't save", true); } });
    body.querySelectorAll("[data-dsedit]").forEach((b) => b.addEventListener("click", () => { open = open === b.dataset.dsedit ? null : b.dataset.dsedit; draw(); }));
    body.querySelectorAll("[data-dsoff]").forEach((b) => b.addEventListener("click", async () => {
      const k = b.dataset.dsoff;
      if (!confirm(`Stop counting "${k}" on the Dashboard? Its numbers stay (add it again with the same name to count them).`)) return;
      extra = extra.filter((x) => x !== k); order = order.filter((x) => x !== k);
      try { await save("Not counted any more"); } catch (err) { toast(err.message || "Couldn't save", true); }
      renderAdminDashSources(body);
    }));
    body.querySelectorAll("[data-dsflat]").forEach((cb) => cb.addEventListener("change", async () => {
      const k = cb.dataset.dsflat;
      if (!confirm(`Count "${k}" as a flat bonus (its numbers as typed) instead of a special-skill hero?`)) { cb.checked = false; return; }
      extra.push(k);
      try { await save("Counted as a flat bonus"); } catch (err) { toast(err.message || "Couldn't save", true); }
      renderAdminDashSources(body);
    }));
    body.querySelector("[data-dsadd]").addEventListener("click", async () => {
      const name = body.querySelector("[data-dsname]").value.trim();
      if (!name) { toast("Enter a name", true); return; }
      const taken = new Set([...columns.map(catOf), ...DASH_SOURCE_ORDER_DEFAULT, "Pets Level", "Pets Refine", "VIP", "Roster Heroes"]);
      if (ADMIN_RESERVED_BUFF_CATEGORIES.has(name) || [...taken].some((x) => x.toLowerCase() === name.toLowerCase())) { toast("That name is already used — pick another", true); return; }
      try {
        const maxOrder = columns.reduce((m, c) => Math.max(m, c.sort_order || 0), 0);
        await sb(`buff_columns`, { method: "POST", body: JSON.stringify({ table_id: BUFF_TABLE_ID, name, category: name, sort_order: maxOrder + 1 }) });
        extra.push(name); order.push(name);
        await save("Source added — now type its numbers");
        open = name;
      } catch (err) { toast(err.message || "Couldn't add", true); return; }
      renderAdminDashSources(body).then(() => { const b = [...body.querySelectorAll("[data-dsedit]")].find((x) => x.dataset.dsedit === name); if (b && !body.querySelector("[data-dsgrid]")) b.click(); });
    });
    const grid = body.querySelector("[data-dsgrid]");
    if (grid) grid.querySelector("[data-dsgridsave]").addEventListener("click", async (ev) => {
      const btn = ev.currentTarget, col = columns.find((c) => catOf(c) === grid.dataset.dsgrid);
      if (!col) { toast("Column not found", true); return; }
      btn.disabled = true;
      try {
        for (const inp of grid.querySelectorAll("[data-dscell]")) {
          if (inp.value === inp.dataset.orig) continue;
          const rowName = inp.dataset.dscell, v = inp.value === "" ? null : Number(inp.value);
          let row = rows.find((r) => r.name.toLowerCase() === rowName.toLowerCase());
          if (!row) {
            if (v == null) continue;
            const maxOrder = rows.reduce((m, r) => Math.max(m, r.sort_order || 0), 0);
            [row] = await sb(`buff_rows`, { method: "POST", body: JSON.stringify({ table_id: BUFF_TABLE_ID, name: rowName, sort_order: maxOrder + 1 }) });
            row.buff_cells = []; rows.push(row);
          }
          const cell = (row.buff_cells || []).find((c) => c.column_id === col.id);
          if (cell) { await sb(`buff_cells?id=eq.${cell.id}`, { method: "PATCH", body: JSON.stringify({ value: v }) }); cell.value = v; }
          else if (v != null) { const [made] = await sb(`buff_cells`, { method: "POST", body: JSON.stringify({ row_id: row.id, column_id: col.id, value: v }) }); row.buff_cells.push(made || { column_id: col.id, value: v }); }
          inp.dataset.orig = inp.value;
        }
        dashDataChanged(); dropKeptGameData(); if (typeof budgetInvalidate === "function") budgetInvalidate();
        toast("Numbers saved");
      } catch (err) { toast(err.message || "Couldn't save", true); }
      btn.disabled = false;
    });
  };
  // The numbers of one flat source: troops × stats.
  function numbersHtml(k) {
    const col = columns.find((c) => catOf(c) === k);
    const valOf = (rowName) => { const r = rows.find((x) => x.name.toLowerCase() === rowName.toLowerCase()); const c = r && col && r.buff_cells.find((x) => x.column_id === col.id); return c && c.value != null ? String(c.value) : ""; };
    return `<div class="ds-grid" data-dsgrid="${esc(k)}">${col ? "" : `<p class="meta">No column named "${esc(k)}" in the buff table.</p>`}
      <div class="ds-cells"><span></span>${STATS.map(([s]) => `<span class="meta">${esc(s)} %</span>`).join("")}
      ${TROOPS.map((tr) => `<b>${esc(tr)}</b>${STATS.map(([s]) => { const n = `${tr} ${s}`, v = valOf(n); return `<input type="number" step="any" inputmode="decimal" data-dscell="${esc(n)}" data-orig="${esc(v)}" value="${esc(v)}" aria-label="${esc(n)}" />`; }).join("")}`).join("")}</div>
      <div class="rl-foot"><span class="meta" style="font-size:11.5px;">Empty = doesn't change that stat.</span><span style="flex:1"></span><button type="button" class="btn small" data-dsgridsave>Save numbers</button></div></div>`;
  }
  draw();
}
async function renderAdminContact(body) {
  await ensureSiteConfig();
  const cfg = siteConfig("contact", {}) || {};
  body.innerHTML = `
    <div class="panel" style="max-width:620px;">
      <h2>Contact us</h2>
      <p class="desc">Shown on the Contact us page (linked from the footer on every page). Leave the email empty to show "Contact details will be added soon." instead.</p>
      <div style="display:grid; grid-template-columns:140px 1fr; gap:10px 12px; align-items:center; margin-top:12px;">
        <span class="meta" style="font-size:12px;">Email</span><input id="adminContactEmail" type="email" value="${esc(cfg.email || "")}" placeholder="e.g. hello@wosrst.com" style="width:100%;" />
        <span class="meta" style="font-size:12px;">Message (optional)</span><input id="adminContactMsg" value="${esc(cfg.message || "")}" placeholder="${esc(t("contact_default_msg"))}" style="width:100%;" />
      </div>
      <div style="display:flex; gap:8px; margin-top:12px;">
        <button class="btn small" id="adminContactSave" type="button">Save</button>
        <button class="btn small ghost" id="adminContactPreview" type="button">Open Contact page</button>
      </div>
    </div>`;
  document.getElementById("adminContactSave").addEventListener("click", async () => {
    const email = document.getElementById("adminContactEmail").value.trim();
    const message = document.getElementById("adminContactMsg").value.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast("That doesn't look like an email address", true); return; }
    try { await saveSiteConfig("contact", { email, message }); toast("Contact details saved"); }
    catch (err) { toast(err.message || "Couldn't save", true); }
  });
  document.getElementById("adminContactPreview").addEventListener("click", () => { goToTab("contactpage"); window.scrollTo(0, 0); });
}

// ---- Visibility: what visitors can see (pages, experts, pets) ----
// Same ui_visibility store as the per-card buttons; keys are "<kind>:<name>".
function visitorPageList() {
  const out = [];
  document.querySelectorAll("#topnavGroups .topnav-group").forEach((g) => {
    const group = g.dataset.group;
    g.querySelectorAll("button[data-tab]").forEach((b) => {
      const tab = b.dataset.tab;
      if (b.hasAttribute("data-ownertab") || tab === "adminpage" || tab === "overview") return; // owner-only / always on
      const lbl = NAV_PAGE_LABELS[tab];
      out.push({ tab, group, label: lbl ? (lbl[LANG] || lbl.en) : tab });
    });
  });
  return out;
}
async function renderAdminVisibility(body) {
  await ensureUiVisibility();
  await Promise.all([ensureExpertsRosterGlobal(), ensurePetsData()]);
  const pages = visitorPageList();
  const experts = EXPERTS_IN_ORDER_GLOBAL.slice();
  const pets = [...new Set([...Object.keys(PETS_NODES_CACHE || {}), ...Object.keys(PET_REFINE_CACHE || {})])];
  const row = (kind, name, label, sub) => `
    <label style="display:flex; align-items:center; gap:10px; padding:6px 0; border-top:1px solid var(--line); cursor:pointer; font-size:13px;">
      <span style="flex:1 1 0; min-width:0;">${esc(label)}${sub ? ` <span class="meta" style="font-size:11px;">· ${esc(sub)}</span>` : ""}</span>
      <span class="meta" data-visstate style="font-size:11px; color:${isHiddenFromVisitors(kind, name) ? "var(--amber)" : "var(--good)"};">${esc(isHiddenFromVisitors(kind, name) ? t("vis_hidden") : t("vis_visible"))}</span>
      <input type="checkbox" class="bset-sw" data-visitem="${esc(kind)}|${esc(name)}" ${isHiddenFromVisitors(kind, name) ? "" : "checked"} />
    </label>`;
  // Big lists fold away: the heading says how many are hidden.
  const section = (title, desc, rowsHtml, list) => list ? `
    <details class="panel adm-visfold" style="margin-bottom:12px;">
      <summary><h2 style="margin:0;">${esc(title)}</h2><span class="meta adm-viscount">${esc(t("admh_n_hidden").replace("{n}", list.filter(([k, n]) => isHiddenFromVisitors(k, n)).length))} · ${list.length}</span><i aria-hidden="true">&#9662;</i></summary>
      <p class="desc" style="margin:0 0 8px;">${esc(desc)}</p>
      ${rowsHtml || `<div class="meta">—</div>`}
    </details>` : `
    <div class="panel" style="margin-bottom:16px;">
      <h2 style="margin-bottom:4px;">${esc(title)}</h2>
      <p class="desc" style="margin:0 0 8px;">${esc(desc)}</p>
      ${rowsHtml || `<div class="meta">—</div>`}
    </div>`;
  await ensureSiteConfig();
  const va = siteConfig("visitor_access", {}) || {};
  const accessRow = (key, label, sub) => `
    <label style="display:flex; align-items:center; gap:10px; padding:6px 0; border-top:1px solid var(--line); cursor:pointer; font-size:13px;">
      <span style="flex:1 1 0; min-width:0;">${esc(label)} <span class="meta" style="font-size:11px;">· ${esc(sub)}</span></span>
      <input type="checkbox" class="bset-sw" data-visaccess="${key}" ${va[key] === true ? "checked" : ""} />
    </label>`;
  body.innerHTML = `
    <p class="desc" style="margin:0 0 12px;">${esc(t("vis_admin_intro"))}</p>
    ${section("Visitor access (read-only)", "Owner-only areas visitors may open. They see your pack tables and prices exactly as you set them, with no way to edit, add or delete anything, and no \"Used for\" settings. Their own Backpack amounts and target dates stay private to them.", [
      accessRow("packcost", "Pack cost block", "the collapsible Pack cost under each page's Backpack"),
      accessRow("packs", "Packs page", "the pack tables, read-only"),
      accessRow("budgets", "Budgets page", "their own monthly plan against your packs"),
      accessRow("backpack", "Backpack page", "their own inventory overview"),
      accessRow("spendbudget", "My budget (spending limit)", "the \"My budget\" box and plan on Budgets, and the weekly budget bar on My Purchases"),
      accessRow("quickpages", "Quick pages row", "the row of page shortcuts on the Dashboard; each visitor pins their own"),
      accessRow("cando", "Can do now", "the \"Can do now\" button and the green marks of what their Backpack can upgrade (Chief Gear, Chief Charm, Heroes Gears, Pets, T12, Experts)"),
      accessRow("goals", "Order of goals & Roadmap", "goal flags, Order of goals, hero targets and mini targets on Budgets, and the Roadmap page; saved per visitor"),
    ].join(""))}
    ${section(t("vis_pages"), t("vis_pages_desc"), pages.map((p) => row("page", p.tab, p.label, p.group)).join(""), pages.map((p) => ["page", p.tab]))}
    ${section(t("vis_experts"), t("vis_experts_desc"), experts.map((e) => row("experts", e, dataName(e))).join(""), experts.map((e) => ["experts", e]))}
    ${section(t("vis_pets"), t("vis_pets_desc"), pets.map((p) => row("pets", p, dataName(p))).join(""), pets.map((p) => ["pets", p]))}`;
  body.querySelectorAll("[data-visaccess]").forEach((cb) => cb.addEventListener("change", async () => {
    cb.disabled = true;
    try {
      const cur = { ...(siteConfig("visitor_access", {}) || {}) };
      cur[cb.dataset.visaccess] = cb.checked;
      await saveSiteConfig("visitor_access", cur);
      toast(cb.checked ? "Visitors can now open this" : "Hidden from visitors again");
    } catch (err) { toast(err.message || "Couldn't save", true); cb.checked = !cb.checked; }
    cb.disabled = false;
  }));
  body.querySelectorAll("[data-visitem]").forEach((cb) => cb.addEventListener("change", async () => {
    const [kind, name] = cb.dataset.visitem.split("|");
    cb.disabled = true;
    try {
      await setHiddenFromVisitors(kind, name, !cb.checked);
      const st = cb.closest("label").querySelector("[data-visstate]");
      const hidden = !cb.checked;
      st.textContent = hidden ? t("vis_hidden") : t("vis_visible");
      st.style.color = hidden ? "var(--amber)" : "var(--good)";
      const fold = cb.closest(".adm-visfold"), cnt = fold && fold.querySelector(".adm-viscount");
      if (cnt) { const all = [...fold.querySelectorAll("[data-visitem]")]; cnt.textContent = `${t("admh_n_hidden").replace("{n}", all.filter((x) => !x.checked).length)} · ${all.length}`; }
      toast(hidden ? t("vis_now_hidden") : t("vis_now_visible"));
      applyPageVisibility();
    } catch (err) { toast(err.message || "Couldn't save", true); cb.checked = !cb.checked; }
    cb.disabled = false;
  }));
}

// ---- Roster editor ----
async function renderAdminRoster(body) {
  const rows = await sb(`experts?select=id,key,img,skill1,skill2,skill3,skill4,talent,main_stat,main_stat_troop,sort_order,upcoming&order=sort_order.asc`);
  const STAT_OPTS = [["ATK", "Attack"], ["DEF", "Defense"], ["DMG", "Lethality"], ["HP", "Health"]];
  const TROOP_OPTS = [["", "All troops"], ["Lancers", "Lancers only"], ["Infantry", "Infantry only"], ["Marksman", "Marksman only"]];
  body.innerHTML = admListHtml(rows, {
    title: "Roster", attr: "data-rosterrow", sortable: true,
    img: (r) => r.img, name: (r) => r.key,
    sub: (r) => [(STAT_OPTS.find((x) => x[0] === r.main_stat) || [, r.main_stat])[1], r.main_stat_troop ? `${r.main_stat_troop} only` : "", r.upcoming ? "Upcoming" : ""].filter(Boolean).join(" · "),
  }) + `<p class="desc" style="font-size:11.5px; margin-top:8px;">After adding an expert, fill its stat data in Affinity / Skills / Research.</p>`;
  wireAdminReorder(body, "data-rosterrow", async (orderedIds) => {
    try { await saveAdminRowOrderInPlace(body, "data-rosterrow", "experts", rows, orderedIds); EXPERTS_ROSTER_LOADED = false; }
    catch (err) { toast("Couldn't reorder", true); renderAdminRoster(body); }
  });
  const fields = (r, isNew) => [
    { key: "img", label: "Portrait", type: "img", value: r.img },
    ...(isNew ? [{ key: "key", label: "Name", value: r.key }] : []),
    { key: "main_stat", label: "Main stat", type: "select", options: STAT_OPTS, value: r.main_stat || "ATK", half: true },
    { key: "main_stat_troop", label: "Troops", type: "select", options: TROOP_OPTS, value: r.main_stat_troop || "", half: true },
    ...[1, 2, 3, 4].map((k) => ({ key: "skill" + k, label: `Skill ${k}`, value: r["skill" + k], half: true })),
    { key: "talent", label: "Talent", value: r.talent },
    { key: "upcoming", label: "Upcoming (badge on its cards; not counted until people tick it)", type: "check", value: r.upcoming },
  ];
  wireAdmList(body, {
    onEdit: (id) => {
      const r = rows.find((x) => String(x.id) === id);
      openAdmSheet({ title: `Edit · ${r.key}`, fields: fields(r),
        onSave: async (v) => {
          // A renamed skill: its level rows (Skills tab) are renamed too and
          // everyone's saved levels move to the new name (like a pet rename).
          const renames = [1, 2, 3, 4].map((k) => ({ from: r["skill" + k], to: v["skill" + k] })).filter((x) => x.from && x.to && x.from !== x.to);
          if (renames.length) {
            const used = new Set([1, 2, 3, 4].map((k) => r["skill" + k]).filter(Boolean));
            expertSkillRenameList().filter((x) => x.hero === r.key).forEach((x) => { used.add(x.from); used.add(x.to); });
            const clash = renames.find((x) => used.has(x.to) || renames.filter((y) => y.to === x.to).length > 1);
            if (clash) throw new Error(`"${clash.to}" was already used by ${r.key}; pick a name it never had (saved levels are moved by name)`);
            if (!confirm(`Rename ${renames.map((x) => `"${x.from}" → "${x.to}"`).join(", ")}?\n\nThe skill's level rows in Experts → Skills get the new name too, and everyone's saved levels for it move to the new name the next time they open the site.`)) throw new Error("Not saved");
          }
          await sb(`experts?id=eq.${r.id}`, { method: "PATCH", body: JSON.stringify({ ...v, upcoming: !!v.upcoming }) });
          if (renames.length) {
            for (const x of renames) await sb(`expert_skill_nodes?expert=eq.${encodeURIComponent(r.key)}&skill=eq.${encodeURIComponent(x.from)}`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ skill: x.to }) });
            const list = Array.isArray(siteConfig("expert_skill_renames", null)) ? siteConfig("expert_skill_renames", null).slice() : [];
            renames.forEach((x) => list.push({ hero: r.key, from: x.from, to: x.to, at: new Date().toISOString().slice(0, 10) }));
            await saveSiteConfig("expert_skill_renames", list);
            EXPERTS_STATE_GLOBAL = null; dropKeptGameData(); if (typeof budgetInvalidate === "function") budgetInvalidate();
          }
          EXPERTS_ROSTER_LOADED = false; toast(renames.length ? "Saved · skill renamed" : "Saved"); renderAdminRoster(body);
        },
        onDelete: async () => { await sb(`experts?id=eq.${r.id}`, { method: "DELETE" }); EXPERTS_ROSTER_LOADED = false; toast("Deleted"); renderAdminPage(); },
        deleteText: `Delete ${r.key} from the roster? Their affinity / skill / research rows stay but won't be used.` });
    },
    onAdd: () => openAdmSheet({ title: "Add an expert", fields: fields({}, true),
      onSave: async (v) => {
        if (!v.key) throw new Error("Enter a name");
        if (rows.some((r) => r.key === v.key)) throw new Error("That expert already exists");
        const maxOrder = rows.reduce((m, r) => Math.max(m, r.sort_order || 0), 0);
        await sb(`experts`, { method: "POST", body: JSON.stringify({ ...v, upcoming: !!v.upcoming, sort_order: maxOrder + 1 }) });
        EXPERTS_ROSTER_LOADED = false; toast("Expert added"); renderAdminPage();
      } }),
  });
}

// ---- Affinity / Skills / Research editors (shared shape: pick expert, edit rows) ----
const ADMIN_EXPERT_TABLE_CONFIG = {
  affinity: {
    table: "expert_affinity_nodes",
    cols: [
      { key: "level", label: "Level", type: "number" },
      { key: "stat_type", label: "Stat", type: "text" },
      { key: "stat_value", label: "Value %", type: "number" },
      { key: "stat_type2", label: "Stat 2", type: "text" },
      { key: "stat_value2", label: "Value 2 %", type: "number" },
      { key: "affinity_cost", label: "Affinity cost", type: "number" },
      { key: "sigil_cost", label: "Sigil cost", type: "number" },
    ],
    orderCol: "level",
  },
  skills: {
    table: "expert_skill_nodes",
    cols: [
      { key: "skill", label: "Skill", type: "text" },
      { key: "level", label: "Level", type: "number" },
      { key: "stat_type", label: "Stat", type: "text" },
      { key: "stat_value", label: "Value %", type: "number" },
      { key: "exp_cost", label: "EXP cost", type: "number" },
      { key: "book_cost", label: "Book cost", type: "number" },
    ],
    orderCol: "skill,level",
  },
  research: {
    table: "expert_research_nodes",
    cols: [
      { key: "path_number", label: "Path #", type: "number" },
      { key: "path_name", label: "Path name", type: "text" },
      { key: "level", label: "Level", type: "number" },
      { key: "stat_type", label: "Stat", type: "text" },
      { key: "stat_value", label: "Value %", type: "number" },
      { key: "sigil_cost", label: "Sigils at this level (lump)", type: "number" },
      { key: "sigil_per_level", label: "Sigils per level (whole block)", type: "number" },
    ],
    orderCol: "path_number,level",
  },
};
async function renderAdminExpertTable(body, tableKey) {
  const cfg = ADMIN_EXPERT_TABLE_CONFIG[tableKey];
  await ensureExpertsRosterGlobal();
  const experts = EXPERTS_IN_ORDER_GLOBAL;
  if (!ADMIN_ACTIVE_EXPERT || !experts.includes(ADMIN_ACTIVE_EXPERT)) ADMIN_ACTIVE_EXPERT = experts[0];

  body.innerHTML = `
    <div class="panel" style="margin-bottom:16px;">
      <h2>Pick an expert</h2>
      <select id="adminExpertPicker" style="width:220px;">
        ${experts.map((e) => `<option value="${esc(e)}" ${e === ADMIN_ACTIVE_EXPERT ? "selected" : ""}>${esc(e)}</option>`).join("")}
      </select>
    </div>
    <div class="panel" style="margin-bottom:16px;">
      <h2>Add a row</h2>
      <form class="inline" id="adminAddRowForm">
        ${cfg.cols.map((c) => `<input class="field-num" name="${c.key}" placeholder="${esc(c.label)}" ${c.type === "number" ? 'type="number" step="any"' : ""} style="width:120px;" />`).join("")}
        <button class="btn" type="submit">Add row</button>
      </form>
      <div class="err" id="adminAddRowErr"></div>
    </div>
    ${tableKey === "research" ? `
    <div class="panel" style="margin-bottom:16px;">
      <h2>Quick fill a path</h2>
      <p class="desc">Builds a whole path in one go: a milestone every N levels, the stat cycling through your pattern, one value % (or a list), and sigils per level. Preview first, then create. Creating replaces that path's existing rows for this expert.</p>
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(150px, 1fr)); gap:10px 12px; align-items:end;">
        <label style="font-size:12px;">Path #<select id="qfPath" style="width:100%; margin-top:4px;">${[1, 2, 3, 4, 5, 6].map((n) => `<option value="${n}">Path ${n}</option>`).join("")}<option value="page1">Paths 1–3</option><option value="page2">Paths 4–6</option><option value="all">All 6 paths</option></select></label>
        <label style="font-size:12px;">Path name (optional)<input id="qfName" placeholder="e.g. Hunting Skill" style="width:100%; margin-top:4px;" /></label>
        <label style="font-size:12px;">Milestone every<input id="qfStep" type="number" min="1" value="20" style="width:100%; margin-top:4px;" /></label>
        <label style="font-size:12px;">Max level<input id="qfMax" type="number" min="1" value="200" style="width:100%; margin-top:4px;" /></label>
        <label style="font-size:12px; grid-column:span 2;">Stat pattern (repeats)<input id="qfStats" value="DMG, ATK, DEF" placeholder="DMG, ATK, DEF, HP …" style="width:100%; margin-top:4px;" /></label>
        <label style="font-size:12px; grid-column:span 2;">Value % (one number, or a list per milestone)<input id="qfValues" value="1.8" placeholder="1.8  or  1.8, 1.8, 2, 2 …" style="width:100%; margin-top:4px;" /></label>
        <label style="font-size:12px;">Sigils per level<input id="qfSigils" type="number" step="any" value="10" style="width:100%; margin-top:4px;" /></label>
        <label style="font-size:12px;">2nd stat (optional)<input id="qfStat2" placeholder="e.g. HP" style="width:100%; margin-top:4px;" /></label>
        <label style="font-size:12px;">2nd value %<input id="qfValue2" type="number" step="any" placeholder="" style="width:100%; margin-top:4px;" /></label>
      </div>
      <div style="display:flex; gap:8px; margin-top:12px; flex-wrap:wrap; align-items:center;">
        <button class="btn small ghost" id="qfPreview" type="button">Preview</button>
        <button class="btn small" id="qfCreate" type="button">Create rows</button>
        <span class="meta" id="qfStatus" style="font-size:11px;"></span>
      </div>
      <div id="qfPreviewWrap" style="margin-top:10px;"></div>
    </div>
    ` : ""}
    <div class="panel">
      <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:8px;">
        <h2 id="adminRowsHeading" style="margin:0;">Rows</h2>
        <button class="btn small" id="adminExpRowsSaveAll">Save all</button>
      </div>
      <div id="adminRowsWrap" class="adm-scroll"></div>
    </div>
  `;

  document.getElementById("adminExpRowsSaveAll").addEventListener("click", () => saveAllRows());
  if (tableKey === "research") {
    // ---- Quick fill ----
    const qfRows = () => {
      const step = Math.max(1, Math.round(Number(document.getElementById("qfStep").value) || 20));
      const max = Math.max(step, Math.round(Number(document.getElementById("qfMax").value) || 200));
      const stats = document.getElementById("qfStats").value.split(/[\s,;]+/).map((x) => x.trim().toUpperCase()).filter(Boolean);
      const values = document.getElementById("qfValues").value.split(/[\s,;]+/).map((x) => x.trim()).filter((x) => x !== "").map(Number).filter((n) => Number.isFinite(n));
      const sigils = Number(document.getElementById("qfSigils").value);
      const stat2 = document.getElementById("qfStat2").value.trim().toUpperCase() || null;
      const value2raw = document.getElementById("qfValue2").value;
      const value2 = value2raw === "" ? null : Number(value2raw);
      const name = document.getElementById("qfName").value.trim() || null;
      if (!stats.length) throw new Error("Enter at least one stat in the pattern");
      if (!values.length) throw new Error("Enter a value %");
      const out = [];
      for (let lvl = step, i = 0; lvl <= max; lvl += step, i++) {
        out.push({ level: lvl, stat_type: stats[i % stats.length], stat_value: values[Math.min(i, values.length - 1)], sigil_per_level: Number.isFinite(sigils) ? sigils : null, sigil_cost: null, stat_type2: stat2, stat_value2: stat2 ? value2 : null, path_name: name });
      }
      return out;
    };
    const qfPaths = () => { const v = document.getElementById("qfPath").value; return v === "page1" ? [1, 2, 3] : v === "page2" ? [4, 5, 6] : v === "all" ? [1, 2, 3, 4, 5, 6] : [Number(v)]; };
    document.getElementById("qfPreview").addEventListener("click", () => {
      const status = document.getElementById("qfStatus");
      try {
        const rows = qfRows();
        document.getElementById("qfPreviewWrap").innerHTML = `<div class="adm-scroll" style="max-height:260px;"><table style="width:100%; border-collapse:collapse; font-size:12px;"><thead><tr>${["Level", "Stat", "Value %", "2nd stat", "Sigils / level"].map((h) => `${ADMIN_TH}${h}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr><td style="padding:3px 8px;">${r.level}</td><td style="padding:3px 8px;">${esc(r.stat_type)}</td><td style="padding:3px 8px;">${r.stat_value}</td><td style="padding:3px 8px;">${r.stat_type2 ? esc(r.stat_type2) + " " + (r.stat_value2 ?? "") : "—"}</td><td style="padding:3px 8px;">${r.sigil_per_level ?? "—"}</td></tr>`).join("")}</tbody></table></div>`;
        status.textContent = `${rows.length} milestones per path × ${qfPaths().length} path(s) for ${ADMIN_ACTIVE_EXPERT}.`;
      } catch (err) { status.textContent = err.message; }
    });
    document.getElementById("qfCreate").addEventListener("click", async () => {
      const status = document.getElementById("qfStatus");
      let rows;
      try { rows = qfRows(); } catch (err) { status.textContent = err.message; return; }
      const paths = qfPaths();
      if (!confirm(`Replace ${ADMIN_ACTIVE_EXPERT}'s rows on path(s) ${paths.join(", ")} with ${rows.length} new milestone rows each?`)) return;
      const btn = document.getElementById("qfCreate");
      btn.disabled = true;
      try {
        // Add the new rows first and only then remove the old ones, so a failed
        // save never leaves the path empty.
        for (const pathNum of paths) {
          const old = await sb(`expert_research_nodes?expert=eq.${encodeURIComponent(ADMIN_ACTIVE_EXPERT)}&path_number=eq.${pathNum}&select=id`);
          const payload = rows.map((r) => ({ ...r, expert: ADMIN_ACTIVE_EXPERT, path_number: pathNum, sort_order: pathNum * 1000 + r.level }));
          await sb(`expert_research_nodes`, { method: "POST", prefer: "return=minimal", body: JSON.stringify(payload) });
          if (old.length) await sb(`expert_research_nodes?id=in.(${old.map((x) => encodeURIComponent(x.id)).join(",")})`, { method: "DELETE", prefer: "return=minimal" });
        }
        EXPERTS_RESEARCH_NODES_GLOBAL = null;
        dropKeptGameData();
        toast("Path rows created");
        status.textContent = `Created ${rows.length} rows on ${paths.length} path(s).`;
        loadRows();
      } catch (err) { toast("Couldn't create rows", true); status.textContent = String(err && err.message || err); }
      btn.disabled = false;
    });
  }

  document.getElementById("adminExpertPicker").addEventListener("change", (e) => {
    ADMIN_ACTIVE_EXPERT = e.target.value;
    renderAdminExpertTable(body, tableKey);
  });

  let currentRows = [];
  const saveExpRow = async (id) => {
    const wrap = document.getElementById("adminRowsWrap");
    const tr = wrap.querySelector(`tr[data-exprow="${id}"]`);
    const patch = admRowPatch(tr, cfg.cols);
    await sb(`${cfg.table}?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(patch) });
  };
  const saveAllRows = () => admSaveAllRows(document.getElementById("adminExpRowsSaveAll"), () => currentRows, (r) => saveExpRow(r.id));

  async function loadRows() {
    const cols = ["id", ...cfg.cols.map((c) => c.key)].join(",");
    const rows = await sb(`${cfg.table}?select=${cols}&expert=eq.${encodeURIComponent(ADMIN_ACTIVE_EXPERT)}&order=${cfg.orderCol}`);
    currentRows = rows;
    document.getElementById("adminRowsHeading").textContent = `Rows for ${ADMIN_ACTIVE_EXPERT} (${rows.length})`;
    const wrap = document.getElementById("adminRowsWrap");
    wrap.innerHTML = `
      <table style="width:100%; border-collapse:collapse; font-size:12.5px;">
        <thead><tr>
          ${cfg.cols.map((c) => `<th style="text-align:start; padding:6px 8px; border-bottom:1px solid var(--line); color:var(--muted); font-weight:600;">${esc(c.label)}</th>`).join("")}
          <th></th>
        </tr></thead>
        <tbody>
          ${rows
            .map(
              (r) => `
            <tr data-exprow="${r.id}">
              ${cfg.cols
                .map(
                  (c) =>
                    `<td style="padding:4px;"><input data-f="${c.key}" ${c.type === "number" ? 'type="number" step="any"' : ""} value="${esc(r[c.key] ?? "")}" style="width:100px;" /></td>`
                )
                .join("")}
              <td style="padding:4px; white-space:nowrap;">
                <button class="btn small ghost" data-exprowsave="${r.id}">Save</button>
                <button class="btn small ghost" data-exprowdel="${r.id}" style="color:var(--danger);">Delete</button>
              </td>
            </tr>`
                )
            .join("")}
        </tbody>
      </table>
    `;

    wireAdmEditBar(wrap, { rowAttr: "data-exprow", table: cfg.table, upTable: cfg.table, saveRow: (id) => saveExpRow(id), after: () => { EXPERTS_RESEARCH_NODES_GLOBAL = null; dropKeptGameData(); }, hide: ["#adminExpRowsSaveAll", "[data-exprowsave]"],
      addForm: "#adminAddRowForm", reload: () => loadRows(),
      create: async (tr) => { await sb(`${cfg.table}`, { method: "POST", body: JSON.stringify({ expert: ADMIN_ACTIVE_EXPERT, ...admNewRowPayload(tr, null) }) }); } });
    admWireRowSave(wrap, "data-exprowsave", saveExpRow);
    admWireRowDelete(wrap, "data-exprowdel", cfg.table, null, () => loadRows());
  }

  document.getElementById("adminAddRowForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    const errEl = document.getElementById("adminAddRowErr");
    errEl.textContent = "";
    const payload = { expert: ADMIN_ACTIVE_EXPERT };
    cfg.cols.forEach((c) => {
      let v = f[c.key].value;
      if (c.type === "number") v = v === "" ? null : Number(v);
      else if (v.trim() === "") v = null;
      payload[c.key] = v;
    });
    try {
      await sb(`${cfg.table}`, { method: "POST", body: JSON.stringify(payload) });
      toast("Row added");
      f.reset();
      loadRows();
    } catch (err) {
      errEl.textContent = "Couldn't add row";
    }
  });

  await loadRows();
}

// ---- Pets editor ----
let ADMIN_PET_ORDER_OPEN = false;
async function renderAdminPets(body) {
  const rows = await sb(`${PET_LEVELS_TABLE}?select=pet&order=pet`);
  const pets = Array.from(new Set(rows.map((r) => r.pet)));
  if (!ADMIN_ACTIVE_PET || !pets.includes(ADMIN_ACTIVE_PET)) ADMIN_ACTIVE_PET = pets[0] || null;

  body.innerHTML = `
    <div class="panel" style="margin-bottom:16px;">
      <h2>Add a new pet</h2>
      <p class="desc">Creates the pet with a single Level 1 row \u2014 add more level rows below afterward.</p>
      <form class="inline" id="adminAddPetForm">
        <input class="flex1" name="pet" placeholder="Pet name" required />
        <button class="btn" type="submit">Add pet</button>
      </form>
      <div class="err" id="adminAddPetErr"></div>
    </div>
    <div class="panel" style="margin-bottom:16px;">
      <h2>Pick a pet</h2>
      <select id="adminPetPicker" style="width:220px;">
        ${pets.map((p) => `<option value="${esc(p)}" ${p === ADMIN_ACTIVE_PET ? "selected" : ""}>${esc(p)}</option>`).join("")}
      </select>
      ${ADMIN_ACTIVE_PET ? `<div class="adm-petedit">
        <div class="adm-petpic">${petImage(ADMIN_ACTIVE_PET) ? `<img src="${esc(petImage(ADMIN_ACTIVE_PET))}" alt="" />` : `<i>${esc(ADMIN_ACTIVE_PET.charAt(0))}</i>`}</div>
        <div style="flex:1 1 260px; min-width:0;">
          <label class="meta" style="font-size:11.5px;">Picture (link or upload)</label>
          <div style="display:flex; gap:6px; align-items:center;"><input type="text" id="adminPetImg" value="${esc(((siteConfig("pet_images", {}) || {})[ADMIN_ACTIVE_PET]) || "")}" placeholder="${esc(petImage(ADMIN_ACTIVE_PET) || "no picture yet")}" style="flex:1; min-width:0;" />${uploadBtnHtml()}<button type="button" class="btn small" id="adminPetImgSave">Save picture</button></div>
          <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:8px;"><button type="button" class="btn ghost small" id="adminPetRename">Rename pet</button><button type="button" class="btn ghost small" id="adminPetDelete" style="color:var(--danger);">Delete pet</button></div>
          <label class="t12x-check" style="margin-top:8px;"><span>Upcoming pet (not in the game yet: marked, and not counted until people tick it)</span><input type="checkbox" id="adminPetUpcoming" ${petIsUpcoming(ADMIN_ACTIVE_PET) ? "checked" : ""} /></label>
        </div></div>` : ""}
    </div>
    <details class="panel" id="adminPetOrder" style="margin-bottom:16px;"${ADMIN_PET_ORDER_OPEN ? " open" : ""}>
      <summary style="cursor:pointer; font-weight:600;">Pet order on the Pets pages${Array.isArray(siteConfig("pet_order", null)) && siteConfig("pet_order", null).length ? ` <span class="rl-chg">changed</span>` : ""}</summary>
      <p class="desc" style="margin:6px 0 8px;">The order of the pets on Pets Level and Pet Refine. Hold &#8942;&#8942; and drag a pet to move it. A new pet goes last until you move it.</p>
      <div id="adminPetOrderList"></div>
      <button type="button" class="btn ghost small" id="adminPetOrderReset" style="margin-top:8px;">Reset to the built-in order</button>
    </details>
    <div class="panel" style="margin-bottom:16px;">
      <h2>Add a level row</h2>
      <form class="inline" id="adminAddPetRowForm">
        <input class="field-num" name="level_label" placeholder="Level label" style="width:100px;" />
        <input class="field-num" name="food" type="number" step="any" placeholder="Food" style="width:100px;" />
        <input class="field-num" name="manual" type="number" step="any" placeholder="Manual" style="width:100px;" />
        <input class="field-num" name="potion" type="number" step="any" placeholder="Potion" style="width:100px;" />
        <input class="field-num" name="serum" type="number" step="any" placeholder="Serum" style="width:100px;" />
        <input class="field-num" name="atk_def_pct" type="number" step="any" placeholder="ATK/DEF %" style="width:100px;" />
        <button class="btn" type="submit">Add row</button>
      </form>
      <div class="err" id="adminAddPetRowErr"></div>
    </div>
    <div class="panel">
      <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:8px;">
        <h2 id="adminPetRowsHeading" style="margin:0;">Rows</h2>
        <button class="btn small" id="adminPetRowsSaveAll">Save all</button>
      </div>
      <div id="adminPetRowsWrap" class="adm-scroll"></div>
    </div>
  `;

  document.getElementById("adminPetRowsSaveAll").addEventListener("click", () => saveAllPetRows());
  // Pet order (site_config pet_order): starts from the Pets Level page's order.
  const orderBox = document.getElementById("adminPetOrder");
  orderBox.addEventListener("toggle", () => { ADMIN_PET_ORDER_OPEN = orderBox.open; });
  const drawPetOrder = async () => {
    try { await ensurePetsData(); } catch (e) { /* fall back to the Admin list */ }
    const base = PETS_NODES_CACHE ? Object.keys(PETS_NODES_CACHE) : pets;
    const order = petOrderSort([...base, ...pets.filter((p) => !base.includes(p))]);
    const items = order.map((p) => ({ id: p, name: p }));
    const host = document.getElementById("adminPetOrderList");
    if (!host) return;
    host.innerHTML = admListHtml(items, { title: "Pets", attr: "data-petord", sortable: true, add: false, img: (r) => petImage(r.name), name: (r) => r.name, sub: (r) => (petIsUpcoming(r.name) ? "upcoming" : "") });
    wireAdmList(host, { onEdit: (id) => { ADMIN_ACTIVE_PET = id; renderAdminPets(body); } });
    wireAdminReorder(host, "data-petord", async (ids) => {
      try { await saveSiteConfig("pet_order", ids); PETS_NODES_CACHE = null; PET_REFINE_CACHE = null; dropKeptGameData(); }
      catch (err) { toast(err.message || "Couldn't save", true); drawPetOrder(); }
    });
  };
  drawPetOrder();
  document.getElementById("adminPetOrderReset").addEventListener("click", async () => {
    try { await saveSiteConfig("pet_order", []); PETS_NODES_CACHE = null; PET_REFINE_CACHE = null; dropKeptGameData(); toast("Built-in order"); renderAdminPets(body); }
    catch (err) { toast(err.message || "Couldn't save", true); }
  });
  // Picture / rename / delete the whole pet (its level rows and refine rows).
  const petImgSave = document.getElementById("adminPetImgSave");
  if (petImgSave) petImgSave.addEventListener("click", async () => {
    const v = document.getElementById("adminPetImg").value.trim();
    const cur = { ...(siteConfig("pet_images", {}) || {}) };
    if (v) cur[ADMIN_ACTIVE_PET] = v; else delete cur[ADMIN_ACTIVE_PET];
    try { await saveSiteConfig("pet_images", cur); toast(v ? "Picture saved" : "Back to the built-in picture"); renderAdminPets(body); } catch (err) { toast(err.message || "Couldn't save", true); }
  });
  const petUp = document.getElementById("adminPetUpcoming");
  if (petUp) petUp.addEventListener("change", async () => {
    const list = new Set(siteConfig("upcoming_pets", []) || []);
    if (petUp.checked) list.add(ADMIN_ACTIVE_PET); else list.delete(ADMIN_ACTIVE_PET);
    try { await saveSiteConfig("upcoming_pets", [...list]); afterUpcomingChange(); toast("Saved"); }
    catch (err) { petUp.checked = !petUp.checked; toast(err.message || "Couldn't save", true); }
  });
  const petRename = document.getElementById("adminPetRename");
  if (petRename) petRename.addEventListener("click", async () => {
    const old = ADMIN_ACTIVE_PET;
    const name = (prompt(`New name for "${old}":\n\nNote: everyone's saved levels, refine numbers and ticks for this pet are stored under its name, so they will start from zero under the new name.`, old) || "").trim();
    if (!name || name === old) return;
    if (pets.includes(name)) { toast("A pet with that name already exists", true); return; }
    try {
      await sb(`pets_nodes?pet=eq.${encodeURIComponent(old)}`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ pet: name }) });
      await sb(`${PET_LEVELS_TABLE}?pet=eq.${encodeURIComponent(old)}`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ pet: name }) });
      await sb(`pet_refine_nodes?pet=eq.${encodeURIComponent(old)}`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ pet: name }) });
      const imgs = { ...(siteConfig("pet_images", {}) || {}) };
      if (imgs[old]) { imgs[name] = imgs[old]; delete imgs[old]; await saveSiteConfig("pet_images", imgs); }
      PETS_NODES_CACHE = null; PET_REFINE_CACHE = null; ADMIN_ACTIVE_PET = name;
      toast("Pet renamed"); renderAdminPets(body);
    } catch (err) { toast(err.message || "Couldn't rename", true); }
  });
  const petDelete = document.getElementById("adminPetDelete");
  if (petDelete) petDelete.addEventListener("click", async () => {
    const pet = ADMIN_ACTIVE_PET;
    const typed = prompt(`Delete "${pet}" with all its level rows and refine rows? This can't be undone.\n\nType the pet's name to confirm:`);
    if (typed == null) return;
    if (typed.trim() !== pet) { toast("The name didn't match — nothing deleted", true); return; }
    try {
      await sb(`pet_refine_nodes?pet=eq.${encodeURIComponent(pet)}`, { method: "DELETE", prefer: "return=minimal" });
      await sb(`pets_nodes?pet=eq.${encodeURIComponent(pet)}`, { method: "DELETE", prefer: "return=minimal" });
      await sb(`${PET_LEVELS_TABLE}?pet=eq.${encodeURIComponent(pet)}`, { method: "DELETE", prefer: "return=minimal" });
      PETS_NODES_CACHE = null; PET_REFINE_CACHE = null; ADMIN_ACTIVE_PET = null;
      toast("Pet deleted"); renderAdminPets(body);
    } catch (err) { toast(err.message || "Couldn't delete", true); }
  });

  document.getElementById("adminAddPetForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    const errEl = document.getElementById("adminAddPetErr");
    errEl.textContent = "";
    const pet = f.pet.value.trim();
    if (!pet) { errEl.textContent = "Enter a pet name"; return; }
    if (pets.includes(pet)) { errEl.textContent = "That pet already exists"; return; }
    try {
      await sb(`${PET_LEVELS_TABLE}`, {
        method: "POST",
        body: JSON.stringify({ pet, level_label: "1", food: 0, manual: 0, potion: 0, serum: 0, atk_def_pct: 0, sort_order: 0 }),
      });
      PETS_NODES_CACHE = null;
      toast("Pet added");
      ADMIN_ACTIVE_PET = pet;
      renderAdminPets(body);
    } catch (err) {
      errEl.textContent = "Couldn't add pet";
    }
  });

  if (!ADMIN_ACTIVE_PET) {
    document.getElementById("adminPetRowsHeading").textContent = "No pets yet \u2014 add one above";
    return;
  }

  document.getElementById("adminPetPicker").addEventListener("change", (e) => {
    ADMIN_ACTIVE_PET = e.target.value;
    renderAdminPets(body);
  });

  const petCols = [
    { key: "level_label", label: "Level", type: "text" },
    { key: "food", label: "Food", type: "number" },
    { key: "manual", label: "Manual", type: "number" },
    { key: "potion", label: "Potion", type: "number" },
    { key: "serum", label: "Serum", type: "number" },
    { key: "atk_def_pct", label: "ATK/DEF %", type: "number" },
    { key: "sort_order", label: "Sort order", type: "number" },
  ];

  let currentPetRows = [];
  const saveAllPetRows = async () => {
    const btn = document.getElementById("adminPetRowsSaveAll");
    btn.disabled = true;
    btn.textContent = "Saving\u2026";
    try {
      const wrap = document.getElementById("adminPetRowsWrap");
      await Promise.all(currentPetRows.map(async (r) => {
        const tr = wrap.querySelector(`tr[data-petrow="${r.id}"]`);
        const patch = admRowPatch(tr, petCols, false);
        await sb(`${PET_LEVELS_TABLE}?id=eq.${r.id}`, { method: "PATCH", body: JSON.stringify(patch) });
      }));
      PETS_NODES_CACHE = null;
      toast(`Saved ${currentPetRows.length} row${currentPetRows.length === 1 ? "" : "s"}`);
    } catch (err) {
      toast("Couldn't save all", true);
    }
    btn.disabled = false;
    btn.textContent = "Save all";
  };

  async function loadPetRows() {
    const cols = ["id", ...petCols.map((c) => c.key)].join(",");
    const rows = await sb(`${PET_LEVELS_TABLE}?select=${cols}&pet=eq.${encodeURIComponent(ADMIN_ACTIVE_PET)}&order=sort_order`);
    document.getElementById("adminPetRowsHeading").textContent = `Rows for ${ADMIN_ACTIVE_PET} (${rows.length})`;
    const wrap = document.getElementById("adminPetRowsWrap");
    wrap.innerHTML = `
      <table style="width:100%; border-collapse:collapse; font-size:12.5px;">
        <thead><tr>
          ${adminColHeadHtml(petCols, true)}
          <th></th>
        </tr></thead>
        <tbody>
          ${rows
            .map(
              (r, idx) => `
            <tr data-petrow="${r.id}">
              ${adminReorderCellHtml(r.id)}
              ${petCols.map((c) => adminColCellHtml(c, r, "90px")).join("")}
              <td style="padding:4px; white-space:nowrap;">
                <button class="btn small ghost" data-petrowsave="${r.id}">Save</button>
                <button class="btn small ghost" data-petrowdel="${r.id}" style="color:var(--danger);">Delete</button>
              </td>
            </tr>`
                )
            .join("")}
        </tbody>
      </table>
    `;

    const savePetRow = async (id) => {
      const tr = wrap.querySelector(`tr[data-petrow="${id}"]`);
      const patch = admRowPatch(tr, petCols, false);
      await sb(`${PET_LEVELS_TABLE}?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(patch) });
      PETS_NODES_CACHE = null;
    };
    currentPetRows = rows;
    wireAdminReorder(wrap, "data-petrow", async (orderedIds) => {
      try { await saveAdminRowOrderInPlace(wrap, "data-petrow", PET_LEVELS_TABLE, rows, orderedIds); PETS_NODES_CACHE = null; }
      catch (err) { toast("Couldn't reorder", true); loadPetRows(); }
    });
    wireAdmEditBar(wrap, { rowAttr: "data-petrow", table: PET_LEVELS_TABLE, upTable: PET_LEVELS_TABLE, saveRow: (id) => savePetRow(id), after: () => { PETS_NODES_CACHE = null; }, hide: ["#adminPetRowsSaveAll", "[data-petrowsave]"],
      addForm: "#adminAddPetRowForm", reload: () => loadPetRows(),
      create: async (tr) => {
        const payload = { pet: ADMIN_ACTIVE_PET, ...admNewRowPayload(tr, 0) };
        if (payload.level_label == null) payload.level_label = "";
        payload.sort_order = await admNextOrder(`${PET_LEVELS_TABLE}?pet=eq.${encodeURIComponent(ADMIN_ACTIVE_PET)}`);
        await sb(`${PET_LEVELS_TABLE}`, { method: "POST", body: JSON.stringify(payload) });
      } });
    admWireRowSave(wrap, "data-petrowsave", savePetRow);
    admWireRowDelete(wrap, "data-petrowdel", PET_LEVELS_TABLE, () => { PETS_NODES_CACHE = null; }, () => loadPetRows());
  }

  document.getElementById("adminAddPetRowForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    const errEl = document.getElementById("adminAddPetRowErr");
    errEl.textContent = "";
    try {
      const existing = await sb(`${PET_LEVELS_TABLE}?pet=eq.${encodeURIComponent(ADMIN_ACTIVE_PET)}&select=sort_order&order=sort_order.desc&limit=1`);
      const nextOrder = existing.length ? (existing[0].sort_order || 0) + 1 : 0;
      const payload = { pet: ADMIN_ACTIVE_PET, sort_order: nextOrder };
      petCols.forEach((c) => {
        if (c.key === "sort_order") return;
        let v = f[c.key] ? f[c.key].value : "";
        if (c.type === "number") v = v === "" ? 0 : Number(v);
        payload[c.key] = v;
      });
      await sb(`${PET_LEVELS_TABLE}`, { method: "POST", body: JSON.stringify(payload) });
      PETS_NODES_CACHE = null;
      toast("Row added");
      f.reset();
      loadPetRows();
    } catch (err) {
      errEl.textContent = "Couldn't add row";
    }
  });

  await loadPetRows();
}

// ---- Generic flat-table editor (small tables, no expert/pet grouping) ----
// Used for Chief Charm levels, Tundra Album tiers, Collection Gallery tiers.
// ---- Reorder rows by moving them (drag the ⋮⋮ handle, dragSort) ----
// Every admin table with an order uses this instead of a typed number:
// the row is moved in place, then the caller gets the new id order and
// writes sort_order = position.
const ADMIN_TH = `<th style="text-align:start; padding:6px 8px; border-bottom:1px solid var(--line); color:var(--muted); font-weight:600;">`;
function adminReorderCellHtml(id) {
  return `<td class="adm-dragcell">${dsHandleHtml(`data-grip="${esc(String(id))}"`)}</td>`;
}
// Admin design C: every row with an order has its ⋮⋮
// handle showing all the time (no "⇅ Sort" mode, no ▲▼); dragging it
// (dragSort) moves the row, then onReorder gets the new id order and the
// order saves by itself with a short "✓ Order saved" note.
function wireAdminReorder(container, rowAttr, onReorder) {
  const st = container.__reorder || (container.__reorder = { q: Promise.resolve() });
  const rowsOf = () => [...container.querySelectorAll(`[${rowAttr}]`)].filter((x) => !x.matches("[data-grip]"));
  const idOf = (tr) => tr.getAttribute(rowAttr);
  // Safe to call again after rows are added: already-wired handles are skipped.
  [...container.querySelectorAll("[data-grip]")].filter((el) => !el.dataset.rw && (el.dataset.rw = "1")).forEach((g) => dragSort(g, {
    item: (h) => h.closest(`[${rowAttr}]`),
    items: () => rowsOf(),
    refocus: (tr) => { const g2 = tr.querySelector("[data-grip]"); if (g2) g2.focus(); },
    done: () => {
      if (!onReorder) return null;
      // One save at a time, in drop order, so quick moves can't overlap.
      const ids = rowsOf().map(idOf);
      st.q = st.q.then(async () => {
        const errs = TOAST_ERRS;
        await onReorder(ids);
        if (TOAST_ERRS === errs) dsSaved();
      }).catch(() => dsSaved(false));
      return st.q;
    },
  }));
}
// sort_order = position, written only for rows whose position changed.
async function saveAdminRowOrder(table, rows, orderedIds) {
  const byId = new Map(rows.map((r) => [String(r.id), r]));
  // Keep the table's existing numbers and just hand them out in the new
  // order (so only the rows that actually moved get written); fall back to
  // plain positions when the numbers aren't unique.
  const existing = rows.map((r) => Number(r.sort_order)).filter((v) => Number.isFinite(v)).sort((x, y) => x - y);
  const unique = existing.length === rows.length && existing.every((v, i) => i === 0 || v !== existing[i - 1]);
  const patches = [];
  const changed = [];
  orderedIds.forEach((id, idx) => {
    const r = byId.get(String(id));
    const val = unique ? existing[idx] : idx;
    if (r && Number(r.sort_order) !== val) {
      changed.push([r, val]);
      patches.push(sb(`${table}?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ sort_order: val }) }));
    }
  });
  await Promise.all(patches);
  // Keep the in-memory rows current, so the next move starts from here.
  changed.forEach(([r, val]) => { r.sort_order = val; });
}
// Saves a new row order without reloading the table: the rows were
// already moved on screen, so only their hidden order fields need the new
// numbers. Reloading would throw away edits not saved yet in other rows.
async function saveAdminRowOrderInPlace(container, rowAttr, table, rows, orderedIds) {
  await saveAdminRowOrder(table, rows, orderedIds);
  rows.forEach((r) => {
    const tr = [...container.querySelectorAll(`[${rowAttr}]`)].find((x) => x.getAttribute(rowAttr) === String(r.id));
    const input = tr && tr.querySelector('input[data-f="sort_order"]');
    if (input) input.value = r.sort_order ?? "";
  });
}
// Generic cell for a column: the order column becomes a hidden field
// (kept so Save still sends it), everything else a normal input.
function adminColCellHtml(c, r, width) {
  if (c.key === "sort_order") return `<input type="hidden" data-f="sort_order" value="${esc(r.sort_order ?? "")}" />`;
  return `<td style="padding:4px;"><input data-f="${c.key}" ${c.type === "number" ? 'type="number" step="any"' : ""} value="${esc(r[c.key] ?? "")}" style="width:${width};" /></td>`;
}
function adminColHeadHtml(cols, withReorder) {
  return (withReorder ? `<th></th>` : "") + cols.filter((c) => c.key !== "sort_order").map((c) => `${ADMIN_TH}${esc(c.label)}</th>`).join("");
}
// New rows: the row's boxes as a database row.
// Empty number boxes become numEmpty (0 or null, like each old Add form), empty
// text null; an empty sort_order is left out (the caller sets the next one).
function admNewRowPayload(tr, numEmpty = null) {
  const out = {};
  tr.querySelectorAll("[data-f]").forEach((el) => {
    const k = el.dataset.f, v = el.value;
    if (k === "sort_order" && v === "") return;
    out[k] = el.type === "number" ? (v === "" ? numEmpty : Number(v)) : (v.trim() === "" ? null : v.trim());
  });
  return out;
}
async function admNextOrder(path) {
  const r = await sb(`${path}${path.includes("?") ? "&" : "?"}select=sort_order&order=sort_order.desc&limit=1`);
  return r.length ? (r[0].sort_order || 0) + 1 : 0;
}
const firstTrSort = (rows) => rows.length && rows[0].tagName === "TR" && rows[0].querySelector("[data-grip]");
// Admin level tables on phones = design B: one slim
// read-only row per level (its name + 3 main columns), folded by major level,
// summary boxes on top and range chips to jump; tapping a row opens a sheet
// with every box of that row. The sheet types into the table's own boxes (and
// fires their input / change events), so wireAdmEditBar's changed marks, Save
// bar, Undo and new rows work exactly as on PC. "Reorder" shows the table with
// its ⋮⋮ handles. PC keeps the table.
const ADM_PL_MQ = window.matchMedia("(max-width: 700px)");
function admPlLabel(el) { if (!el) return ""; return el.tagName === "SELECT" ? (el.selectedOptions[0] ? el.selectedOptions[0].text : "") : String(el.value == null ? "" : el.value); }
function admPlFmt(el) {
  if (!el) return "";
  if (el.type === "checkbox") return el.checked ? "✓" : "—";
  const v = admPlLabel(el);
  if (el.type === "number" && v !== "" && isFinite(Number(v))) return Number(v).toLocaleString(undefined, { maximumFractionDigits: 3 });
  return v;
}
function admPhoneList(wrap, o, rows, fieldSel, count) {
  const tr0 = rows()[0];
  if (!tr0 || tr0.tagName !== "TR") return;
  const table = tr0.closest("table");
  let pl = wrap.__pl;
  if (!pl || !pl.isConnected) { pl = document.createElement("div"); pl.className = "admpl"; wrap.before(pl); wrap.__pl = pl; }
  wrap.classList.add("adm-pl");
  const st = wrap.__plSt || (wrap.__plSt = { open: null, tbl: false });
  const head = (el) => { const td = el.closest("td"), hr = table.tHead && table.tHead.rows[0]; const th = td && hr ? hr.cells[td.cellIndex] : null; return th ? th.textContent.trim() : (el.dataset.f || ""); };
  const boxes = (tr) => [...tr.querySelectorAll(fieldSel)].filter((el) => el.type !== "hidden" && el.dataset.up == null && el.closest("td"));
  const parts = (tr) => {
    const b = boxes(tr), lab = b[0];
    const main = b.slice(1).filter((el) => el.type !== "checkbox" && el.dataset.f !== "sort_order").slice(0, 3);
    return { lab, main, all: b };
  };
  // Groups: by major level ("4", "4.1" … "4.3"), else by name without its last
  // number ("Mythic T1 ★0" … "★3"); mostly single rows → blocks of 10.
  const groupsOf = (list) => {
    const labs = list.map((tr) => admPlLabel(parts(tr).lab).trim());
    const num = labs.every((l) => l === "" || /^(?:lv\.?\s*)?-?\d+(?:\.\d+)?$/i.test(l));
    const keyOf = (l, i) => (num ? (l === "" ? "new" + i : String(parseInt(l.replace(/^\D+/, ""), 10))) : (l.replace(/[\s.]*[★☆]?\s*\d+(?:\.\d+)?$/, "") || "row" + i));
    const out = [];
    list.forEach((tr, i) => { const k = tr.hasAttribute("data-newrow") ? "__new" : keyOf(labs[i], i); const g = out.at(-1); if (g && g.k === k) g.rows.push(tr); else out.push({ k, rows: [tr] }); });
    if (out.length > 12 && list.length / out.length < 1.6) {
      const blocks = [];
      list.forEach((tr, i) => { if (i % 10 === 0) blocks.push({ k: "b" + i, rows: [] }); blocks.at(-1).rows.push(tr); });
      return blocks;
    }
    return out;
  };
  const draw = () => {
    if (!pl.isConnected) return;
    const list = rows();
    if (!list.length) { pl.innerHTML = ""; return; }
    const groups = groupsOf(list);
    if (st.open == null) { const g = groups.find((x) => x.rows.length > 1); st.open = new Set(g ? [g.k] : []); }
    const p0 = parts(list[0]);
    const cols = p0.main.map(head);
    const upEls = list.map((tr) => tr.querySelector("[data-up]"));
    const hasUp = upEls.some(Boolean);
    const firstUp = upEls.findIndex((x) => x && x.checked);
    const relIdx = firstUp < 0 ? list.length - 1 : firstUp - 1;
    const rel = relIdx >= 0 ? admPlLabel(parts(list[relIdx]).lab) : "—";
    const nOld = list.filter((tr) => !tr.hasAttribute("data-newrow")).length;
    const rowHtml = (tr) => {
      const p = parts(tr), i = list.indexOf(tr);
      const chg = tr.hasAttribute("data-newrow") || !!tr.querySelector(".chg");
      const up = !!(tr.querySelector("[data-up]") || {}).checked;
      return `<button type="button" class="admpl-r${chg ? " chg" : ""}${up ? " up" : ""}" data-plrow="${i}" style="--n:${cols.length}"><b>${esc(admPlLabel(p.lab) || (tr.hasAttribute("data-newrow") ? t("admpl_new") : "—"))}</b>${p.main.map((el) => `<span class="${el.classList.contains("chg") ? "chg" : ""}">${esc(admPlFmt(el))}</span>`).join("")}<i aria-hidden="true">&#8250;</i></button>`;
    };
    const gLabel = (g) => { const a = admPlLabel(parts(g.rows[0]).lab), b = admPlLabel(parts(g.rows.at(-1)).lab); return g.k === "__new" ? t("admpl_new") : a === b ? a : bidiNum(`${a} – ${b}`); };
    // Range chips: the folds split into up to 5 runs.
    const big = groups.length > 4;
    const per = Math.ceil(groups.length / 5);
    const chips = big ? Array.from({ length: Math.ceil(groups.length / per) }, (_, c) => { const gs = groups.slice(c * per, c * per + per); const a = admPlLabel(parts(gs[0].rows[0]).lab), b = admPlLabel(parts(gs.at(-1).rows.at(-1)).lab); return `<button type="button" class="admpl-chip" data-plchip="${c * per}|${gs.length}">${esc(a === b ? a : `${a}–${b}`)}</button>`; }).join("") : "";
    const drag = wrap.classList.contains("adm-hasdrag");
    pl.innerHTML = `<div class="admpl-sum"><div><small>${esc(t("admpl_levels"))}</small><b>${nOld}</b></div><div><small>${esc(t("admpl_released"))}</small><b>${esc(hasUp ? rel : admPlLabel(parts(list[list.length - 1]).lab))}</b></div><div class="${count() ? "warn" : ""}"><small>${esc(t("admpl_unsaved"))}</small><b>${count()}</b></div></div>
      ${chips || drag ? `<div class="admpl-chips">${chips}${drag ? `<button type="button" class="admpl-chip admpl-ro" data-plreorder>${st.tbl ? esc(t("admpl_list")) : "&#8942;&#8942; " + esc(t("admpl_reorder"))}</button>` : ""}</div>` : ""}
      <div class="admpl-list"><div class="admpl-h" style="--n:${cols.length}"><b>${esc(head(p0.lab))}</b>${cols.map((c) => `<span title="${esc(c)}">${esc(c.replace(/\s*\([^)]*\)/g, "") || c)}</span>`).join("")}<i></i></div>
      ${groups.map((g, gi) => g.rows.length === 1 && g.k !== "__new" ? rowHtml(g.rows[0]) : `<details class="admpl-g" data-plg="${gi}" ${st.open.has(g.k) || g.k === "__new" ? "open" : ""}><summary><b>${esc(gLabel(g))}</b><span>${esc(t("admpl_rows").replace("{n}", g.rows.length))}</span><i aria-hidden="true">&#9662;</i></summary>${g.rows.map(rowHtml).join("")}</details>`).join("")}</div>`;
    pl.querySelectorAll("details.admpl-g").forEach((d) => d.addEventListener("toggle", () => { const g = groups[+d.dataset.plg]; if (g) { if (d.open) st.open.add(g.k); else st.open.delete(g.k); } }));
    pl.__groups = groups;
  };
  let q = 0;
  wrap.__plDraw = () => { if (q) return; q = requestAnimationFrame(() => { q = 0; draw(); }); };
  const apply = () => { pl.hidden = !ADM_PL_MQ.matches; wrap.classList.toggle("adm-pl-tbl", !!st.tbl); };
  apply();
  if (!wrap.__plMq) { wrap.__plMq = () => { if (!wrap.isConnected) { ADM_PL_MQ.removeEventListener("change", wrap.__plMq); return; } apply(); }; ADM_PL_MQ.addEventListener("change", wrap.__plMq); }
  // Sheet for one row.
  const openRow = (tr) => {
    document.querySelectorAll(".admpl-ov").forEach((x) => x.remove());
    if (!tr || !tr.isConnected) return;
    const list = rows(), i = list.indexOf(tr), p = parts(tr);
    const prev = list[i - 1], next = list[i + 1];
    const up = tr.querySelector("[data-up]");
    const del = tr.hasAttribute("data-newrow") ? tr.querySelector("[data-ebdrop]") : [...tr.querySelectorAll("button")].find((b) => [...b.attributes].some((a) => /^data-[a-z]*del/.test(a.name)));
    const ov = document.createElement("div");
    ov.className = "modal-overlay admpl-ov";
    const lab0 = admPlLabel(p.lab).trim(), lab = lab0 || t("admpl_new");
    // "Level 4.1"; a name shared by several rows gets its next box ("Common · Stars 0").
    const dup = lab0 && list.filter((r) => admPlLabel(parts(r).lab).trim() === lab0).length > 1;
    const title = /^(?:lv\.?\s*)?-?\d+(?:\.\d+)?$/i.test(lab0) ? t("admpl_level").replace("{l}", lab0) : dup && p.all[1] ? `${lab} · ${head(p.all[1]).replace(/\s*\([^)]*\)/g, "")} ${admPlFmt(p.all[1])}` : lab;
    const field = (el, k) => {
      const was = el.classList.contains("chg") ? `<em data-plwas="${k}">${esc(t("admpl_was").replace("{v}", el.dataset.orig === "" ? "—" : el.dataset.orig))}</em>` : `<em data-plwas="${k}"></em>`;
      const ctl = el.tagName === "SELECT" ? `<select data-plf="${k}">${el.innerHTML}</select>`
        : el.type === "checkbox" ? `<input type="checkbox" class="bset-sw" data-plf="${k}" ${el.checked ? "checked" : ""} />`
        : `<input data-plf="${k}" type="${el.type === "number" ? "number" : el.type || "text"}" ${el.type === "number" ? 'step="any" inputmode="decimal"' : ""} value="${esc(el.value)}" />`;
      return `<label class="admpl-f${el.classList.contains("chg") ? " chg" : ""}${el.type === "checkbox" ? " ck" : ""}"><span>${esc(head(el))}</span>${ctl}${was}</label>`;
    };
    ov.innerHTML = `<div class="modal-box admpl-sh" role="dialog" aria-label="${esc(title)}">
      <div class="admpl-sh-h"><button type="button" class="admpl-nav" data-plgo="-1" ${prev ? "" : "disabled"} aria-label="previous">&#8249;</button><b>${esc(title)}</b><button type="button" class="admpl-nav" data-plgo="1" ${next ? "" : "disabled"} aria-label="next">&#8250;</button><button type="button" class="admpl-nav admpl-x" data-plclose aria-label="close">&#10005;</button></div>
      <div class="admpl-fs">${p.all.map(field).join("")}</div>
      ${up ? `<label class="admpl-op"><span><b>${esc(t("upcoming_col"))}</b><small>${esc(t("admpl_up_sub"))}</small></span><input type="checkbox" class="bset-sw" data-plup ${up.checked ? "checked" : ""} /></label>` : ""}
      ${prev ? `<div class="admpl-op"><span>${esc(t("admpl_copy").replace("{l}", admPlLabel(parts(prev).lab) || "—"))}</span><button type="button" class="btn ghost small" data-plcopy>${esc(t("admpl_copy_btn"))}</button></div>` : ""}
      <div class="admpl-ft">${del ? `<button type="button" class="btn ghost admpl-del" data-pldel>${esc(t("admpl_delete"))}</button>` : ""}<button type="button" class="btn" data-plclose>${esc(t("admpl_done"))}</button></div>
    </div>`;
    document.body.appendChild(ov);
    const sync = () => p.all.forEach((el, k) => {
      const f = ov.querySelector(`[data-plf="${k}"]`), w = ov.querySelector(`[data-plwas="${k}"]`);
      if (!f) return;
      if (el.type === "checkbox") f.checked = el.checked; else if (document.activeElement !== f) f.value = el.value;
      const c = el.classList.contains("chg");
      f.closest(".admpl-f").classList.toggle("chg", c);
      if (w) w.textContent = c ? t("admpl_was").replace("{v}", el.dataset.orig === "" ? "—" : el.dataset.orig) : "";
    });
    const fire = (el, type) => el.dispatchEvent(new Event(type, { bubbles: true }));
    ov.addEventListener("input", (e) => {
      const f = e.target.closest("[data-plf]"); if (!f) return;
      const el = p.all[+f.dataset.plf]; if (!el) return;
      if (el.type === "checkbox") { el.checked = f.checked; fire(el, "change"); } else { el.value = f.value; fire(el, el.tagName === "SELECT" ? "change" : "input"); }
      sync();
    });
    ov.addEventListener("change", (e) => {
      if (e.target.matches("[data-plup]")) { up.checked = e.target.checked; fire(up, "change"); return; }
      const f = e.target.closest("[data-plf]"); if (!f) return;
      const el = p.all[+f.dataset.plf]; if (!el) return;
      if (el.type === "checkbox") el.checked = f.checked; else el.value = f.value;
      fire(el, "change"); sync();
    });
    const close = () => { ov.remove(); document.removeEventListener("keydown", onKey); };
    const onKey = (e) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    ov.addEventListener("click", (e) => {
      if (e.target === ov || e.target.closest("[data-plclose]")) { close(); return; }
      const go = e.target.closest("[data-plgo]");
      if (go) { const n = rows()[rows().indexOf(tr) + Number(go.dataset.plgo)]; if (n) { close(); openRow(n); } return; }
      if (e.target.closest("[data-plcopy]")) {
        const src = parts(prev).all;
        p.all.slice(1).forEach((el) => {
          if (el.dataset.f === "sort_order" || el.type === "checkbox") return;
          const s = src.find((x) => x.dataset.f && x.dataset.f === el.dataset.f) || src[p.all.indexOf(el)];
          if (!s || s.tagName !== el.tagName || el.value === s.value) return;
          el.value = s.value; fire(el, el.tagName === "SELECT" ? "change" : "input");
        });
        sync(); return;
      }
      if (e.target.closest("[data-pldel]")) { close(); del.click(); }
    });
  };
  wrap.__plOpenRow = (tr) => { if (ADM_PL_MQ.matches && !st.tbl) openRow(tr); };
  if (!pl.__wired) {
    pl.__wired = true;
    pl.addEventListener("click", (e) => {
      const r = e.target.closest("[data-plrow]");
      if (r) { openRow(rows()[+r.dataset.plrow]); return; }
      if (e.target.closest("[data-plreorder]")) { st.tbl = !st.tbl; apply(); draw(); return; }
      const c = e.target.closest("[data-plchip]");
      if (c) {
        const [a, n] = c.dataset.plchip.split("|").map(Number), gs = (pl.__groups || []).slice(a, a + n);
        gs.forEach((g) => st.open.add(g.k));
        if (st.tbl) { st.tbl = false; apply(); }
        draw();
        const r0 = gs[0] && pl.querySelector(`[data-plrow="${rows().indexOf(gs[0].rows[0])}"]`);
        const el = r0 && (r0.closest("details") || r0);
        if (el) window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 70);
      }
    });
  }
  draw();
}
// ---- Level tables: the old per-row Save / Delete and "Save all" buttons ----
// (hidden by wireAdmEditBar once a table has rows; kept working the same way)
// A row's boxes as a PATCH body: numbers as numbers (empty = null); with
// blankText, empty text is null too.
function admRowPatch(tr, cols, blankText = true) {
  const patch = {};
  tr.querySelectorAll("[data-f]").forEach((el) => {
    const c = cols.find((c) => c.key === el.dataset.f);
    let v = el.value;
    if (c.type === "number") v = v === "" ? null : Number(v);
    else if (blankText && v.trim() === "") v = null;
    patch[el.dataset.f] = v;
  });
  return patch;
}
// "Save all": every row at once (rows() read when it starts and when it's done), then after().
async function admSaveAllRows(btn, rows, saveOne, after) {
  btn.disabled = true;
  btn.textContent = "Saving\u2026";
  try {
    await Promise.all(rows().map((r) => saveOne(r)));
    if (after) after();
    toast(`Saved ${rows().length} row${rows().length === 1 ? "" : "s"}`);
  } catch (err) {
    toast("Couldn't save all", true);
  }
  btn.disabled = false;
  btn.textContent = "Save all";
}
// Each row's Save button (attr holds the row id): saveOne(id), then after().
function admWireRowSave(root, attr, saveOne, after) {
  root.querySelectorAll(`[${attr}]`).forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        await saveOne(btn.getAttribute(attr));
        if (after) after();
        toast("Saved");
      } catch (err) {
        toast("Couldn't save", true);
      }
    });
  });
}
// Each row's Delete button: asks, deletes the row from table, after(), then reload().
function admWireRowDelete(root, attr, table, after, reload) {
  root.querySelectorAll(`[${attr}]`).forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Delete this row?")) return;
      try {
        await sb(`${table}?id=eq.${btn.getAttribute(attr)}`, { method: "DELETE" });
        if (after) after();
        toast("Deleted");
        reload();
      } catch (err) {
        toast("Couldn't delete", true);
      }
    });
  });
}

function wireAdmEditBar(scope, o) {
  const first = scope && scope.querySelector(`[${o.rowAttr}]`);
  const wrap = (first && first.closest(".adm-scroll")) || scope;
  if (!wrap) return;
  const sel = (o.fields || "[data-f]") + ",[data-up]";
  const rows = () => [...wrap.querySelectorAll(`[${o.rowAttr}]`)];
  const inputsOf = (tr) => [...tr.querySelectorAll(sel)].filter((el) => el.type !== "hidden");
  const val = (el) => (el.type === "checkbox" ? String(el.checked) : el.value);
  rows().forEach((tr) => inputsOf(tr).forEach((el) => { el.dataset.orig = val(el); el.classList.remove("chg"); }));
  wrap.classList.add("adm-b");
  // "Upcoming" tick per row (o.upTable): saved in site_config
  // "upcoming_levels" with the same Save bar.
  if (o.upTable && first && first.tagName === "TR" && !wrap.querySelector("th.adm-upth")) {
    const ids = upcomingIds(o.upTable);
    const hr = first.closest("table").tHead && first.closest("table").tHead.rows[0];
    if (hr) { const th = document.createElement("th"); th.className = "adm-upth"; th.textContent = t("upcoming_col"); hr.insertBefore(th, hr.lastElementChild); }
    rows().forEach((tr) => {
      const id = tr.getAttribute(o.rowAttr), td = document.createElement("td");
      td.className = "adm-upcell";
      td.innerHTML = `<input type="checkbox" data-up="${esc(id)}" data-orig="${ids.has(String(id))}" ${ids.has(String(id)) ? "checked" : ""} aria-label="${esc(t("upcoming_col"))}" />`;
      tr.insertBefore(td, tr.lastElementChild);
    });
  }
  wrap.querySelectorAll("tr").forEach((tr) => { const up = tr.querySelector("[data-up]"); tr.classList.toggle("adm-uprow", !!(up && up.checked)); });
  // Compact boxes: "keep-w" opts out of the phone rule that stretches every
  // fixed-width box (the widths come from the .adm-b CSS).
  wrap.querySelectorAll("table input, table select").forEach((el) => el.classList.add("keep-w"));
  // The ⋮⋮ order column shows all the time and stays
  // in view, with the name box beside it, when the table scrolls sideways.
  if (firstTrSort(rows())) {
    const tr0 = rows()[0], gi = [...tr0.cells].findIndex((td) => td.querySelector("[data-grip]"));
    if (gi >= 0) [...tr0.closest("table").rows].forEach((r) => { const c = r.cells[gi]; if (c) c.classList.add("adm-sortcell"); });
    wrap.classList.add("adm-hasdrag");
  }
  // Keep the row's first box (its name / level) in view when the table
  // scrolls sideways on a phone.
  const firstTr = rows()[0];
  if (firstTr && firstTr.tagName === "TR") {
    const cells = [...firstTr.cells];
    const ci = cells.findIndex((td) => td.querySelector(sel) && !td.querySelector("input[type=hidden]:only-child"));
    if (ci >= 0) {
      const table = firstTr.closest("table");
      [...table.rows].forEach((r) => { const c = r.cells[ci]; if (c) c.classList.add("adm-stick"); });
      // Wide enough for the longest name in the column (owner: names show fully).
      const boxes = [...table.querySelectorAll("td.adm-stick input:not([type=hidden]), td.adm-stick select")];
      if (boxes.length) {
        const ctx = document.createElement("canvas").getContext("2d");
        const cs = getComputedStyle(boxes[0]); ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
        const longest = boxes.reduce((m, el) => Math.max(m, ctx.measureText(el.tagName === "SELECT" ? (el.selectedOptions[0]?.text || "") : el.value).width), 0);
        wrap.style.setProperty("--stickw", Math.ceil(Math.min(280, Math.max(96, longest + 22 + (boxes[0].tagName === "SELECT" ? 18 : 0)))) + "px");
      }
    }
  }
  (o.hide || []).forEach((h) => document.querySelectorAll(h).forEach((x) => { x.style.display = "none"; }));
  let nx = wrap.nextElementSibling; if (nx && nx.classList.contains("adm-newrow")) nx = nx.nextElementSibling;
  let bar = nx && nx.classList.contains("adm-ebar") ? nx : null;
  if (!bar) { bar = document.createElement("div"); bar.className = "adm-ebar"; wrap.after(bar); }
  const newRows = () => [...wrap.querySelectorAll("tr[data-newrow]")];
  const count = () => wrap.querySelectorAll("tr:not([data-newrow]) .chg").length + newRows().length;
  // "+ New row": an empty copy of the last row at the end of the table; it is
  // added with the same Save bar (o.create(tr) adds it, o.reload() redraws).
  // The old "Add a row" form is hidden (o.addForm) once the table has a row.
  if (o.create && firstTr && firstTr.tagName === "TR") {
    if (o.addForm) { const f = document.querySelector(o.addForm); const box = f && (f.closest(".adm-addpanel, .panel:not(:has(.adm-scroll))") || f.parentElement); if (box) box.style.display = "none"; }
    let nb = bar.previousElementSibling && bar.previousElementSibling.classList.contains("adm-newrow") ? bar.previousElementSibling : null;
    if (!nb) { nb = document.createElement("button"); nb.type = "button"; nb.className = "adm-newrow"; nb.textContent = "+ New row"; bar.before(nb); }
    nb.onclick = () => {
      const src = rows().at(-1); if (!src) return;
      const tr = src.cloneNode(true);
      [...tr.attributes].forEach((a) => { if (a.name.startsWith("data-")) tr.removeAttribute(a.name); });
      tr.setAttribute("data-newrow", "1");
      [...tr.cells].forEach((td, i, all) => {
        if (td.querySelector("[data-grip]")) td.innerHTML = "";
        else if (i === all.length - 1 && td.querySelector("button")) td.innerHTML = `<button type="button" class="btn small ghost" data-ebdrop title="Remove this new row" style="color:var(--danger);">&#10005;</button>`;
      });
      tr.querySelectorAll("[data-up]").forEach((el) => { el.closest("td").innerHTML = ""; });
      tr.classList.remove("adm-uprow");
      tr.querySelectorAll("input, select").forEach((el) => {
        el.classList.remove("chg");
        if (el.tagName === "SELECT") { el.dataset.orig = el.value; return; }
        if (el.type === "checkbox") { el.checked = false; el.dataset.orig = "false"; return; }
        el.value = ""; el.dataset.orig = "";
      });
      src.after(tr);
      refresh();
      if (wrap.__plOpenRow && ADM_PL_MQ.matches && !wrap.classList.contains("adm-pl-tbl")) { wrap.__plOpenRow(tr); return; }
      const firstBox = tr.querySelector(`${sel}:not([type=hidden])`.split(",").join(":not([type=hidden]),"));
      if (firstBox) { firstBox.focus({ preventScroll: true }); tr.scrollIntoView({ block: "center" }); }
    };
  }
  const refresh = () => {
    const n = count(); ADM_EDIT_DIRTY = n;
    bar.hidden = !n;
    // Floats at the bottom of the screen over this table's column (the body
    // clips sideways scroll, so a sticky bar would not stick).
    if (n) { const shown = wrap.offsetParent || !wrap.__pl || !wrap.__pl.offsetParent ? wrap : wrap.__pl; const r = shown.getBoundingClientRect(); bar.style.left = Math.max(8, r.left) + "px"; bar.style.width = Math.min(r.width, innerWidth - 16) + "px"; }
    wrap.style.paddingBottom = n ? "64px" : "";
    if (wrap.__pl) { wrap.__pl.style.paddingBottom = n ? "64px" : ""; if (wrap.__plDraw) wrap.__plDraw(); }
    const nn = newRows().length, nc = n - nn;
    const what = [nc ? `${nc} change${nc === 1 ? "" : "s"}` : "", nn ? `${nn} new row${nn === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · ");
    bar.innerHTML = n ? `<span><b>${what}</b> not saved</span><button type="button" class="btn ghost small" data-ebundo>Undo</button><button type="button" class="btn small" data-ebsave>Save</button>` : "";
  };
  const onEdit = (ev) => {
    const el = ev.target; if (!el.matches || !el.matches(sel) || el.dataset.orig == null) return;
    el.classList.toggle("chg", val(el) !== el.dataset.orig);
    if (el.dataset.up != null) el.closest("tr").classList.toggle("adm-uprow", el.checked);
    refresh();
  };
  if (!wrap.__ebWired) {
    wrap.__ebWired = true; wrap.addEventListener("input", onEdit); wrap.addEventListener("change", onEdit);
    wrap.addEventListener("click", (ev) => { const x = ev.target.closest("[data-ebdrop]"); if (x) { x.closest("tr").remove(); wrap.__ebRefresh(); } });
  }
  wrap.__ebRefresh = refresh;
  admPhoneList(wrap, o, rows, o.fields || "[data-f]", count);
  bar.onclick = async (ev) => {
    if (ev.target.closest("[data-ebundo]")) {
      newRows().forEach((tr) => tr.remove());
      wrap.querySelectorAll(".chg").forEach((el) => { if (el.type === "checkbox") el.checked = el.dataset.orig === "true"; else el.value = el.dataset.orig; el.classList.remove("chg"); });
      wrap.querySelectorAll("tr").forEach((tr) => { const up = tr.querySelector("[data-up]"); tr.classList.toggle("adm-uprow", !!(up && up.checked)); });
      refresh(); return;
    }
    const btn = ev.target.closest("[data-ebsave]"); if (!btn) return;
    btn.disabled = true; btn.textContent = "Saving…";
    const changed = rows().filter((tr) => [...tr.querySelectorAll(".chg")].some((el) => el.dataset.up == null));
    const upChanged = !!wrap.querySelector("[data-up].chg");
    try {
      for (const tr of changed) {
        const id = tr.getAttribute(o.rowAttr);
        if (o.saveRow) await o.saveRow(id);
        else {
          const patch = {};
          inputsOf(tr).filter((el) => el.classList.contains("chg") && el.dataset.f).forEach((el) => {
            const k = el.dataset.f;
            patch[k] = el.type === "checkbox" ? el.checked : el.type === "number" ? (el.value === "" ? null : Number(el.value)) : (el.value.trim() === "" ? null : el.value.trim());
          });
          await sb(`${o.table}?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(patch) });
        }
        inputsOf(tr).filter((el) => el.dataset.up == null).forEach((el) => { el.dataset.orig = val(el); el.classList.remove("chg"); });
      }
      if (upChanged && o.upTable) {
        const all = { ...(siteConfig("upcoming_levels", {}) || {}) };
        const keep = new Set(upcomingIds(o.upTable));
        wrap.querySelectorAll("[data-up]").forEach((el) => { if (el.checked) keep.add(String(el.dataset.up)); else keep.delete(String(el.dataset.up)); });
        if (keep.size) all[o.upTable] = [...keep]; else delete all[o.upTable];
        await saveSiteConfig("upcoming_levels", all);
        wrap.querySelectorAll("[data-up]").forEach((el) => { el.dataset.orig = val(el); el.classList.remove("chg"); });
        afterUpcomingChange();
      }
      let added = 0;
      for (const tr of newRows()) {
        if (!inputsOf(tr).some((el) => el.type !== "checkbox" && el.tagName !== "SELECT" && el.value.trim() !== "")) { tr.remove(); continue; }
        await o.create(tr);
        tr.remove(); added++;
      }
      if (o.after) o.after();
      const parts = [changed.length ? `${changed.length} row${changed.length === 1 ? "" : "s"} saved` : "", upChanged ? "Upcoming saved" : "", added ? `${added} added` : ""].filter(Boolean);
      toast(parts.join(", ") || "Nothing to save");
      if (added && o.reload) { ADM_EDIT_DIRTY = 0; await admRedrawKeep(() => o.reload()); return; }
    } catch (err) { toast("Couldn't save: " + (err.message || err), true); }
    refresh();
  };
  refresh();
}
async function renderAdminFlatLevels(body, cfg) {
  const cols = ["id", ...cfg.cols.map((c) => c.key)].join(",");
  const rows = await sb(`${cfg.table}?select=${cols}&order=${cfg.orderCol}.asc`);
  const canReorder = cfg.orderCol === "sort_order";

  body.innerHTML = `
    <div class="panel" style="margin-bottom:16px;">
      <h2>Add a row</h2>
      <form class="inline" id="adminFlatAddForm">
        ${cfg.cols.map((c) => `<input class="field-num" name="${c.key}" placeholder="${esc(c.label)}" ${canReorder && c.key === "sort_order" ? 'type="hidden"' : c.type === "number" ? 'type="number" step="any"' : ""} style="width:130px;" />`).join("")}
        <button class="btn" type="submit">Add row</button>
      </form>
      <div class="err" id="adminFlatAddErr"></div>
    </div>
    <div class="panel">
      <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:8px;">
        <h2 style="margin:0;">${esc(cfg.title)} (${rows.length})</h2>
        <button class="btn small" id="adminFlatSaveAll">Save all</button>
      </div>
      <div class="adm-scroll">
        <table style="width:100%; border-collapse:collapse; font-size:12.5px;">
          <thead><tr>
            ${canReorder ? adminColHeadHtml(cfg.cols, true) : cfg.cols.map((c) => `${ADMIN_TH}${esc(c.label)}</th>`).join("")}
            <th></th>
          </tr></thead>
          <tbody>
            ${rows
              .map(
                (r, idx) => `
              <tr data-flatrow="${r.id}">
                ${canReorder ? adminReorderCellHtml(r.id) : ""}
                ${cfg.cols
                  .map((c) => (canReorder ? adminColCellHtml(c, r, "110px") : `<td style="padding:4px;"><input data-f="${c.key}" ${c.type === "number" ? 'type="number" step="any"' : ""} value="${esc(r[c.key] ?? "")}" style="width:110px;" /></td>`))
                  .join("")}
                <td style="padding:4px; white-space:nowrap;">
                  <button class="btn small ghost" data-flatsave="${r.id}">Save</button>
                  <button class="btn small ghost" data-flatdel="${r.id}" style="color:var(--danger);">Delete</button>
                </td>
              </tr>`
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;

  wireAdmEditBar(body, { rowAttr: "data-flatrow", table: cfg.table, upTable: cfg.table, after: () => { if (cfg.onSave) cfg.onSave(); }, hide: ["#adminFlatSaveAll", "[data-flatsave]"],
    addForm: "#adminFlatAddForm", reload: () => renderAdminFlatLevels(body, cfg),
    create: async (tr) => {
      const payload = admNewRowPayload(tr, 0);
      if (canReorder && payload.sort_order == null) payload.sort_order = rows.reduce((m, r) => Math.max(m, r.sort_order || 0), -1) + 1;
      await sb(`${cfg.table}`, { method: "POST", body: JSON.stringify(payload) });
    } });
  const saveRow = async (id) => {
    const tr = body.querySelector(`tr[data-flatrow="${id}"]`);
    const patch = admRowPatch(tr, cfg.cols, false);
    await sb(`${cfg.table}?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(patch) });
  };
  admWireRowSave(body, "data-flatsave", saveRow, () => { if (cfg.onSave) cfg.onSave(); });
  const saveAllBtn = document.getElementById("adminFlatSaveAll");
  if (saveAllBtn) saveAllBtn.addEventListener("click", () => admSaveAllRows(saveAllBtn, () => rows, (r) => saveRow(r.id), () => { if (cfg.onSave) cfg.onSave(); }));
  if (canReorder) {
    wireAdminReorder(body, "data-flatrow", async (orderedIds) => {
      try {
        await saveAdminRowOrderInPlace(body, "data-flatrow", cfg.table, rows, orderedIds);
        if (cfg.onSave) cfg.onSave();
      } catch (err) {
        toast("Couldn't reorder", true);
        renderAdminFlatLevels(body, cfg);
      }
    });
  }
  admWireRowDelete(body, "data-flatdel", cfg.table, () => { if (cfg.onSave) cfg.onSave(); }, () => renderAdminFlatLevels(body, cfg));

  document.getElementById("adminFlatAddForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    const errEl = document.getElementById("adminFlatAddErr");
    errEl.textContent = "";
    const payload = {};
    cfg.cols.forEach((c) => {
      let v = f[c.key].value;
      if (c.key === "sort_order" && v === "") {
        const maxOrder = rows.reduce((m, r) => Math.max(m, r.sort_order || 0), -1);
        v = maxOrder + 1;
      } else if (c.type === "number") {
        v = v === "" ? 0 : Number(v);
      }
      payload[c.key] = v;
    });
    try {
      await sb(`${cfg.table}`, { method: "POST", body: JSON.stringify(payload) });
      if (cfg.onSave) cfg.onSave();
      toast("Row added");
      renderAdminFlatLevels(body, cfg);
    } catch (err) {
      errEl.textContent = "Couldn't add row";
    }
  });
}

// ---- VIP editor (buff matrix: rows = tiers, columns = Attack/Defense/Lethality/Health) ----
async function renderAdminVip(body) {
  let [table] = await sb(`buff_tables?name=eq.VIP Tier&user_id=eq.${PROGRESSION_OWNER_ID}&select=id`);
  if (!table) {
    const [created] = await sb(`buff_tables`, { method: "POST", body: JSON.stringify({ user_id: USER_ID, name: "VIP Tier", sort_order: 0 }) });
    table = created;
  }
  let columns = await sb(`buff_columns?table_id=eq.${table.id}&select=id,name&order=sort_order.asc`);
  const STAT_NAMES = ["Attack", "Defense", "Lethality", "Health"];
  // Auto-create the 4 stat columns if missing.
  for (const statName of STAT_NAMES) {
    if (!columns.find((c) => c.name === statName)) {
      const [created] = await sb(`buff_columns`, { method: "POST", body: JSON.stringify({ table_id: table.id, name: statName, category: statName, sort_order: STAT_NAMES.indexOf(statName) }) });
      columns.push(created);
    }
  }
  const colByName = Object.fromEntries(columns.map((c) => [c.name, c.id]));
  const rows = await sb(`buff_rows?table_id=eq.${table.id}&select=id,name,sort_order,buff_cells(id,value,column_id)&order=sort_order.asc`);

  body.innerHTML = `
    <div class="panel" style="margin-bottom:16px;">
      <h2>Add a VIP tier</h2>
      <form class="inline" id="adminVipAddForm">
        <input class="flex1" name="name" placeholder="Tier name (e.g. VIP 12)" required />
        <button class="btn" type="submit">Add tier</button>
      </form>
      <div class="err" id="adminVipAddErr"></div>
    </div>
    <div class="panel">
      <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:8px;">
        <h2 style="margin:0;">VIP tiers (${rows.length})</h2>
        <button class="btn small" id="adminVipSaveAll">Save all</button>
      </div>
      <div class="adm-scroll">
        <table style="width:100%; border-collapse:collapse; font-size:12.5px;">
          <thead><tr>
            <th></th>
            <th style="text-align:start; padding:6px 8px; border-bottom:1px solid var(--line); color:var(--muted); font-weight:600;">Tier</th>
            ${STAT_NAMES.map((s) => `<th style="text-align:start; padding:6px 8px; border-bottom:1px solid var(--line); color:var(--muted); font-weight:600;">${s} %</th>`).join("")}
            <th></th>
          </tr></thead>
          <tbody>
            ${rows
              .map((r, idx) => {
                const cellByCol = Object.fromEntries(r.buff_cells.map((c) => [c.column_id, c.value]));
                return `
              <tr data-viprow="${r.id}">
                ${adminReorderCellHtml(r.id)}
                <td style="padding:4px;"><input data-vipname value="${esc(r.name)}" style="width:100px;" /></td>
                ${STAT_NAMES.map((s) => `<td style="padding:4px;"><input data-vipstat="${esc(s)}" type="number" step="any" value="${cellByCol[colByName[s]] ?? ""}" style="width:90px;" /></td>`).join("")}
                <td style="padding:4px; white-space:nowrap;">
                  <button class="btn small ghost" data-vipsave="${r.id}">Save</button>
                  <button class="btn small ghost" data-vipdel="${r.id}" style="color:var(--danger);">Delete</button>
                </td>
              </tr>`;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;

  const saveVipRow = async (id) => {
    const tr = body.querySelector(`tr[data-viprow="${id}"]`);
    const name = tr.querySelector("[data-vipname]").value.trim();
    await sb(`buff_rows?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ name }) });
    for (const s of STAT_NAMES) {
      const v = tr.querySelector(`[data-vipstat="${s}"]`).value;
      const colId = colByName[s];
      const existing = await sb(`buff_cells?row_id=eq.${id}&column_id=eq.${colId}&select=id`);
      if (existing.length) {
        await sb(`buff_cells?id=eq.${existing[0].id}`, { method: "PATCH", body: JSON.stringify({ value: v === "" ? null : Number(v) }) });
      } else if (v !== "") {
        await sb(`buff_cells`, { method: "POST", body: JSON.stringify({ row_id: id, column_id: colId, value: Number(v) }) });
      }
    }
    VIP_ROWS_CACHE = null;
  };
  wireAdminReorder(body, "data-viprow", async (orderedIds) => {
    try { await saveAdminRowOrderInPlace(body, "data-viprow", "buff_rows", rows, orderedIds); VIP_ROWS_CACHE = null; }
    catch (err) { toast("Couldn't reorder", true); renderAdminVip(body); }
  });
  wireAdmEditBar(body, { rowAttr: "data-viprow", upTable: "buff_rows", fields: "[data-vipname],[data-vipstat]", saveRow: (id) => saveVipRow(id), after: () => { VIP_ROWS_CACHE = null; dropKeptGameData(); }, hide: ["#adminVipSaveAll", "[data-vipsave]"],
    addForm: "#adminVipAddForm", reload: () => renderAdminVip(body),
    create: async (tr) => {
      const name = tr.querySelector("[data-vipname]").value.trim();
      if (!name) throw new Error("a new VIP tier needs a name");
      const maxOrder = rows.reduce((m, r) => Math.max(m, r.sort_order || 0), 0);
      const [created] = await sb(`buff_rows`, { method: "POST", body: JSON.stringify({ table_id: table.id, name, sort_order: maxOrder + 1 }) });
      tr.setAttribute("data-viprow", created.id); await saveVipRow(created.id);
    } });
  admWireRowSave(body, "data-vipsave", saveVipRow);
  document.getElementById("adminVipSaveAll").addEventListener("click", () => admSaveAllRows(document.getElementById("adminVipSaveAll"), () => rows, (r) => saveVipRow(r.id)));
  body.querySelectorAll("[data-vipdel]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Delete this VIP tier?")) return;
      try {
        await sb(`buff_rows?id=eq.${btn.dataset.vipdel}`, { method: "DELETE" });
        VIP_ROWS_CACHE = null;
        toast("Deleted");
        renderAdminVip(body);
      } catch (err) {
        toast("Couldn't delete", true);
      }
    });
  });

  document.getElementById("adminVipAddForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    const errEl = document.getElementById("adminVipAddErr");
    errEl.textContent = "";
    const name = f.name.value.trim();
    if (!name) { errEl.textContent = "Enter a tier name"; return; }
    try {
      const maxOrder = rows.reduce((m, r) => Math.max(m, r.sort_order || 0), 0);
      await sb(`buff_rows`, { method: "POST", body: JSON.stringify({ table_id: table.id, name, sort_order: maxOrder + 1 }) });
      VIP_ROWS_CACHE = null;
      toast("Tier added");
      renderAdminVip(body);
    } catch (err) {
      errEl.textContent = "Couldn't add tier";
    }
  });
}

// ---- Facility / Alliance Tech editor (skins table, filtered by category) ----
// ---- Admin item lists, design A ----
// Each item is one row: picture, name and a short line; tapping the row (or
// "+ Add") opens an edit sheet. Sortable lists have a
// ⋮⋮ handle on every row, always showing: drag it to move (wireAdminReorder).
function admListHtml(items, o) {
  return `<div class="admc-bar"><span class="admc-t">${esc(o.title || "")}${o.count !== false ? ` <span class="meta">(${items.length})</span>` : ""}</span>${o.add !== false ? `<button type="button" class="btn small admc-add" data-admcadd>+ Add</button>` : ""}</div>
    ${o.sortable && items.length > 1 ? `<div class="admc-hint meta">${DS_HANDLE} ${esc(t("admc_sort_hint"))}</div>` : ""}
    <div class="admc-list">${items.map((r) => `<div class="admc-row" ${o.attr}="${esc(String(r.id))}">
      <button type="button" class="admc-open" data-admcedit="${esc(String(r.id))}" aria-label="${esc(t("admc_edit").replace("{name}", o.name(r) || ""))}"><span class="admc-pic">${o.img && o.img(r) ? `<img src="${esc(o.img(r))}" alt="" loading="lazy" />` : `<i>${esc(String(o.name(r) || "?").charAt(0))}</i>`}</span>
      <span class="admc-txt"><b>${esc(o.name(r) || "—")}</b>${o.sub && o.sub(r) ? `<small>${esc(o.sub(r))}</small>` : ""}</span></button>
      ${o.sortable ? dsHandleHtml(`data-grip="${esc(String(r.id))}"`) : ""}</div>`).join("") || `<div class="meta" style="padding:8px;">Nothing here yet.</div>`}</div>`;
}
function wireAdmList(body, o) {
  const add = body.querySelector("[data-admcadd]");
  if (add && o.onAdd) add.addEventListener("click", o.onAdd);
  body.querySelectorAll("[data-admcedit]").forEach((b) => b.addEventListener("click", () => o.onEdit(b.dataset.admcedit)));
}
// The edit sheet. fields: [{ key, label, type: text|num|check|img|select|area, value, options, more }]
function openAdmSheet(o) {
  let m = document.getElementById("admSheet");
  if (!m) { m = document.createElement("div"); m.id = "admSheet"; m.className = "modal-overlay adm-sheet-wrap"; document.body.appendChild(m); }
  const f = (x) => {
    const id = `admf_${x.key}`, v = x.value == null ? "" : x.value;
    if (x.type === "check") return `<label class="admf admf-chk${x.half ? " half" : ""}"><input type="checkbox" id="${id}" ${v ? "checked" : ""} /> ${esc(x.label)}</label>`;
    if (x.type === "pick") {
      const known = x.options.some((op) => String(Array.isArray(op) ? op[0] : op) === String(v));
      const custom = !known;
      return `<label class="admf${x.cls ? " " + x.cls : ""}"><span>${esc(x.label)}</span><select id="${id}" data-admpick>${x.options.map((op) => { const [val, lab] = Array.isArray(op) ? op : [op, op || "—"]; return `<option value="${esc(String(val))}" ${!custom && String(val) === String(v) ? "selected" : ""}>${esc(lab)}</option>`; }).join("")}<option value="${ADM_PICK_CUSTOM}" ${custom ? "selected" : ""}>Custom…</option></select><input type="text" id="${id}_c" class="admf-custom" value="${esc(custom ? String(v) : "")}" placeholder="Type the word" ${custom ? "" : "hidden"} /></label>`;
    }
    if (x.type === "note") return `<div class="admf meta" style="font-size:11.5px;">${esc(x.label)}</div>`;
    if (x.type === "select") return `<label class="admf${x.cls ? " " + x.cls : ""}"><span>${esc(x.label)}</span><select id="${id}">${x.options.map((op) => { const [val, lab] = Array.isArray(op) ? op : [op, op || "—"]; return `<option value="${esc(String(val))}" ${String(val) === String(v) ? "selected" : ""}>${esc(lab)}</option>`; }).join("")}</select></label>`;
    if (x.type === "img") return `<div class="admf admf-img"><span class="admc-pic big" data-admimgprev>${v ? `<img src="${esc(v)}" alt="" />` : `<i>?</i>`}</span><label class="admf" style="flex:1; min-width:0;"><span>${esc(x.label)}</span><span class="admf-line"><input type="text" id="${id}" value="${esc(v)}" placeholder="link, or upload" />${uploadBtnHtml()}</span></label></div>`;
    if (x.type === "area") return `<label class="admf"><span>${esc(x.label)}</span><textarea id="${id}" rows="3">${esc(v)}</textarea></label>`;
    return `<label class="admf${x.half ? " half" : ""}"><span>${esc(x.label)}</span><input id="${id}" ${x.type === "num" ? 'type="number" step="any" inputmode="decimal"' : 'type="text"'} value="${esc(String(v))}" /></label>`;
  };
  const main = o.fields.filter((x) => !x.more), more = o.fields.filter((x) => x.more);
  m.innerHTML = `<div class="modal-box adm-sheet"><div class="adm-sheet-h"><b>${esc(o.title)}</b><button type="button" class="rfa-x" data-admsclose aria-label="close">&#10005;</button></div>
    <div class="admf-grid">${main.map(f).join("")}</div>
    ${more.length ? `<details class="admf-more"><summary>More</summary><div class="admf-grid">${more.map(f).join("")}</div></details>` : ""}
    <div class="adm-sheet-foot">${o.onDelete ? `<button type="button" class="btn ghost small" data-admsdel style="color:var(--danger);">${esc(o.deleteLabel || "Delete")}</button>` : ""}<span style="flex:1"></span><button type="button" class="btn ghost small" data-admsclose>Cancel</button><button type="button" class="btn small" data-admssave>Save</button></div></div>`;
  m.style.display = "flex";
  const close = () => { m.style.display = "none"; };
  m.onclick = (ev) => { if (ev.target === m || ev.target.closest("[data-admsclose]")) close(); };
  const img = o.fields.find((x) => x.type === "img");
  if (img) { const inp = m.querySelector(`#admf_${img.key}`), prev = m.querySelector("[data-admimgprev]"); inp.addEventListener("input", () => { prev.innerHTML = inp.value.trim() ? `<img src="${esc(inp.value.trim())}" alt="" />` : `<i>?</i>`; }); }
  m.querySelectorAll("select[data-admpick]").forEach((sel) => sel.addEventListener("change", () => { const c = m.querySelector(`#${sel.id}_c`); c.hidden = sel.value !== ADM_PICK_CUSTOM; if (!c.hidden) c.focus(); }));
  const values = () => { const out = {}; o.fields.forEach((x) => { const el = m.querySelector(`#admf_${x.key}`); if (!el) return; if (x.type === "pick") { const raw = el.value === ADM_PICK_CUSTOM ? m.querySelector(`#admf_${x.key}_c`).value : el.value; out[x.key] = raw.trim() === "" ? null : raw.trim(); } else if (x.type === "check") out[x.key] = el.checked; else if (x.type === "num") out[x.key] = el.value === "" ? null : Number(el.value); else out[x.key] = el.value.trim() === "" ? null : el.value.trim(); }); return out; };
  m.querySelector("[data-admssave]").addEventListener("click", async (ev) => {
    const btn = ev.currentTarget; btn.disabled = true;
    try { await o.onSave(values()); close(); } catch (err) { toast(err.message || "Couldn't save", true); }
    btn.disabled = false;
  });
  const del = m.querySelector("[data-admsdel]");
  if (del) del.addEventListener("click", async () => { if (!confirm(o.deleteText || "Delete this item?")) return; try { await o.onDelete(); close(); } catch (err) { toast(err.message || "Couldn't delete", true); } });
  const first = m.querySelector("input[type=text], input[type=number]"); if (first && !o.noFocus) setTimeout(() => first.focus(), 50);
}

// Bonus stat words (owner, 7 Nov 2026): the plain "Attack" / "Defense" /
// "Lethality" / "Health" first (the readers in app.js count "Troops X" and "X"
// as the same stat, `bonusStatKey`), Islands also the troop-only words its
// Islands Guide uses, then "Custom…" with a text box for any other word; a
// saved word not in the list opens as Custom with its text, so an unchanged
// Save sends the same value.
const ADM_PICK_CUSTOM = "__custom__";
const ADM_BONUS_STATS = ["Attack", "Defense", "Lethality", "Health"];
function admBonusOptions(kind, optional) {
  const ops = kind === "islands"
    ? [...ADM_BONUS_STATS.map((st) => [st, `${st} (all troops)`]), ...["Infantry", "Lancers", "Marksman"].flatMap((tr) => ["Attack", "Defense"].map((st) => `${tr} ${st}`))]
    : ADM_BONUS_STATS;
  return [["", optional ? "— none —" : "— choose —"], ...ops];
}
async function renderAdminSkinsCategory(body, category, kind) {
  const bKind = kind === "islands" ? "islands" : "plain";
  const bonusSel = (key, label, value, optional, more) => ({ key, label, type: "pick", options: admBonusOptions(bKind, optional), value: value == null ? "" : value, cls: "half", half: true, more });
  const rows = await sb(
    `skins?user_id=eq.${USER_ID}&category=eq.${encodeURIComponent(category)}&select=id,name,image_url,bonus_type,bonus_value,bonus_type2,bonus_value2,bonus_type3,bonus_value3,bonus_type4,bonus_value4,bonus_level1,bonus_level2,bonus_level3,bonus_level4,display_group,current_level,max_level,owned,sort_order,show_count_toggle&order=sort_order.asc`
  );
  const pct = (v) => (v == null ? "" : `+${v}%`);
  body.innerHTML = admListHtml(rows, {
    title: category, attr: "data-skinrow", sortable: true,
    img: (r) => r.image_url, name: (r) => r.name,
    sub: (r) => [r.bonus_type ? `${pct(r.bonus_value)} ${r.bonus_type}` : "", r.bonus_type2 ? `${pct(r.bonus_value2)} ${r.bonus_type2}` : "", r.max_level ? `max ${r.max_level}` : ""].filter(Boolean).join(" · "),
  });
  wireAdminReorder(body, "data-skinrow", async (orderedIds) => {
    try { await saveAdminRowOrderInPlace(body, "data-skinrow", "skins", rows, orderedIds); dashDataChanged("skins"); }
    catch (err) { toast("Couldn't reorder", true); renderAdminSkinsCategory(body, category, kind); }
  });
  const fields = (r) => [
    { key: "image_url", label: "Picture", type: "img", value: r.image_url },
    { key: "name", label: "Name", value: r.name },
    bonusSel("bonus_type", "Bonus stat", r.bonus_type, false),
    { key: "bonus_value", label: "Bonus %", type: "num", value: r.bonus_value, half: true },
    { key: "max_level", label: "Max level", type: "num", value: r.max_level, half: true },
    ...[2, 3, 4].flatMap((k) => [bonusSel("bonus_type" + k, `Bonus ${k} stat`, r["bonus_type" + k], true, true), { key: "bonus_value" + k, label: `Bonus ${k} %`, type: "num", value: r["bonus_value" + k], half: true, more: true }]),
    ...[1, 2, 3, 4].map((k) => ({ key: "bonus_level" + k, label: `Bonus ${k} from level`, type: "num", value: r["bonus_level" + k], half: true, more: true })),
    { key: "display_group", label: "Group", value: r.display_group, more: true },
    { key: "show_count_toggle", label: "Has count trigger (a \"Count in max\" tick on the card, below the divider)", type: "check", value: r.show_count_toggle, more: true },
    { key: "current_level", label: "My current level", type: "num", value: r.current_level, half: true, more: true },
    { key: "owned", label: "I own it", type: "check", value: r.owned, more: true },
    // Islands: how the building is got (site_config island_sources, for everyone;
    // only "Mythic shards" buildings count in the Islands Shards plan).
    ...(kind === "islands" ? [
      { key: "isl_src", label: "How to get", type: "select", options: [["shop", "Mythic shards"], ["event", "Playable event"], ["ranked", "Ranked event or purchase"]], value: r.name ? islSource(r.name).kind : "shop", half: true },
      { key: "isl_src_every", label: "Event: every (days)", type: "num", value: r.name ? (islSource(r.name).every || 30) : 30, half: true },
      { key: "isl_src_choices", label: "Event: copies a cycle (e.g. 1,3,5)", value: (r.name && islSource(r.name).choices || ISL_EV_CHOICES).join(","), half: true },
    ] : []),
  ];
  // Splits the How to get fields off the row and saves them into island_sources
  // (a renamed building keeps its entry).
  const takeSrc = (v) => { const src = { kind: v.isl_src, every: v.isl_src_every, choices: v.isl_src_choices }; delete v.isl_src; delete v.isl_src_every; delete v.isl_src_choices; return src; };
  const saveSrc = async (name, src, oldName) => {
    if (kind !== "islands" || !src.kind) return;
    if (oldName && oldName !== name) {
      const cur = { ...(siteConfig("island_sources", {}) || {}) };
      if (cur[oldName]) { delete cur[oldName]; await saveSiteConfig("island_sources", cur); }
    }
    await islSaveSource(name, src);
  };
  wireAdmList(body, {
    onEdit: (id) => {
      const r = rows.find((x) => String(x.id) === id);
      openAdmSheet({ title: `Edit · ${r.name}`, fields: fields(r),
        onSave: async (v) => {
          if (!v.name) throw new Error("Enter a name");
          const src = takeSrc(v);
          await sb(`skins?id=eq.${r.id}`, { method: "PATCH", body: JSON.stringify(v) });
          await saveSrc(v.name, src, r.name);
          // A Globe Level extra skin keeps its link under the new name.
          if (v.name !== r.name && ALL_GLOBE_WIRED_NAMES_GLOBAL.has(r.name)) await saveGameRule("globeLevels", GLOBE_LEVELS.map((g) => ({ level: g.level, city: g.city === r.name ? v.name : g.city, extra: g.extra.map((x) => (x === r.name ? v.name : x)) })));
          dashDataChanged("skins"); toast("Saved"); renderAdminSkinsCategory(body, category, kind);
        },
        onDelete: async () => { await sb(`skins?id=eq.${r.id}`, { method: "DELETE" }); dashDataChanged("skins"); toast("Deleted"); renderAdminSkinsCategory(body, category, kind); },
        deleteText: `Delete "${r.name}"?` });
    },
    onAdd: () => openAdmSheet({ title: `Add a ${category} item`, fields: fields({}),
      onSave: async (v) => {
        if (!v.name) throw new Error("Enter a name");
        const maxOrder = rows.reduce((m, r) => Math.max(m, r.sort_order || 0), 0);
        const src = takeSrc(v);
        await sb(`skins`, { method: "POST", body: JSON.stringify({ ...v, user_id: USER_ID, category, current_level: v.current_level || 0, owned: !!v.owned, sort_order: maxOrder + 1 }) });
        await saveSrc(v.name, src);
        dashDataChanged("skins"); toast("Item added"); renderAdminSkinsCategory(body, category, kind);
      } }),
  });
}

// ---- Progression Tables editor (Chief Gear, Hero Gear Mastery Forging/Enhancement/Empowerment) ----
async function renderAdminProgression(body, nameFilter) {
  let tables = await sb(`progression_tables?select=id,name&order=name.asc`);
  if (nameFilter) tables = tables.filter((t) => nameFilter.includes(t.name));
  if (!ADMIN_ACTIVE_PROGRESSION || !tables.find((t) => t.id === ADMIN_ACTIVE_PROGRESSION)) {
    ADMIN_ACTIVE_PROGRESSION = tables[0] ? tables[0].id : null;
  }
  const activeTableName = tables.find((t) => t.id === ADMIN_ACTIVE_PROGRESSION)?.name || "";
  const isChiefGear = activeTableName === "Chief Gear";
  const isHeroGear = activeTableName.startsWith("Hero Gear");
  const materialCols = isChiefGear
    ? [
        { key: "hardened_alloy", label: "Hardened Alloy", type: "number" },
        { key: "polishing_solution", label: "Polishing Solution", type: "number" },
        { key: "design_plan", label: "Design Plan", type: "number" },
        { key: "amber", label: "Amber", type: "number" },
      ]
    : isHeroGear
    ? [
        { key: "mithril", label: "Mithril", type: "number" },
        { key: "mythic_gear", label: "Mythic Gear", type: "number" },
        { key: "xp_component", label: "XP Component", type: "number" },
        { key: "essence_stones", label: "Essence Stones", type: "number" },
      ]
    : [{ key: "materials", label: "Materials", type: "text" }];
  const cols = [
    { key: "sort_order", label: "Order", type: "number" },
    // Tier / Stars are Chief Gear's (Gold ★2.3); Hero Gear rows go by Level.Stage.
    ...(isHeroGear ? [] : [{ key: "tier", label: "Tier", type: "text" }, { key: "stars", label: "Stars", type: "number" }]),
    { key: "level", label: "Level", type: "number" },
    { key: "stage", label: "Stage", type: "text" },
    { key: "stat", label: "Stat", type: "text" },
    ...(isChiefGear ? [] : [{ key: "stat2", label: "Stat 2", type: "text" }]),
    ...materialCols,
    { key: "power", label: "Power", type: "number" },
    { key: "display_label", label: "Dropdown text (override)", type: "text" },
  ];

  body.innerHTML = `
    <div class="panel" style="margin-bottom:16px;">
      <h2>Pick a table</h2>
      <select id="adminProgPicker" style="width:260px;">
        ${tables.map((t) => `<option value="${t.id}" ${t.id === ADMIN_ACTIVE_PROGRESSION ? "selected" : ""}>${esc(t.name)}</option>`).join("")}
      </select>
    </div>
    <div class="panel" style="margin-bottom:16px;">
      <h2>Add a row</h2>
      <form class="inline" id="adminProgAddForm">
        ${cols.map((c) => `<input class="field-num" name="${c.key}" placeholder="${esc(c.label)}" ${c.key === "sort_order" ? 'type="hidden"' : c.type === "number" ? 'type="number" step="any"' : ""} style="width:100px;" />`).join("")}
        <button class="btn" type="submit">Add row</button>
      </form>
      <div class="err" id="adminProgAddErr"></div>
    </div>
    <div class="panel">
      <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:8px;">
        <h2 id="adminProgHeading" style="margin:0;">Rows</h2>
        <button class="btn small" id="adminProgSaveAll">Save all</button>
      </div>
      <div id="adminProgWrap" class="adm-scroll"></div>
    </div>
  `;

  document.getElementById("adminProgSaveAll").addEventListener("click", () => saveAllProgRows());

  document.getElementById("adminProgPicker").addEventListener("change", (e) => {
    ADMIN_ACTIVE_PROGRESSION = e.target.value;
    renderAdminProgression(body, nameFilter);
  });

  function invalidateCaches() {
    CHIEF_GEAR_ROWS = null;
    HERO_GEAR_TABLES_CACHE = null;
  }

  let currentProgRows = [];
  const saveProgRow = async (id) => {
    const wrap = document.getElementById("adminProgWrap");
    const tr = wrap.querySelector(`tr[data-progrow="${id}"]`);
    const patch = admRowPatch(tr, cols);
    await sb(`progression_rows?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(patch) });
  };
  const saveAllProgRows = () => admSaveAllRows(document.getElementById("adminProgSaveAll"), () => currentProgRows, (r) => saveProgRow(r.id), () => { invalidateCaches(); });

  async function loadRows() {
    const selectCols = ["id", ...cols.map((c) => c.key)].join(",");
    const rows = await sb(`progression_rows?table_id=eq.${ADMIN_ACTIVE_PROGRESSION}&select=${selectCols}&order=sort_order.asc`);
    currentProgRows = rows;
    document.getElementById("adminProgHeading").textContent = `Rows (${rows.length})`;
    const wrap = document.getElementById("adminProgWrap");
    wrap.innerHTML = `
      <table style="width:100%; border-collapse:collapse; font-size:12.5px;">
        <thead><tr>
          ${adminColHeadHtml(cols, true)}
          <th></th>
        </tr></thead>
        <tbody>
          ${rows
            .map(
              (r, idx) => `
            <tr data-progrow="${r.id}">
              ${adminReorderCellHtml(r.id)}
              ${cols.map((c) => adminColCellHtml(c, r, c.key === "materials" ? "220px" : "90px")).join("")}
              <td style="padding:4px; white-space:nowrap;">
                <button class="btn small ghost" data-progsave="${r.id}">Save</button>
                <button class="btn small ghost" data-progdel="${r.id}" style="color:var(--danger);">Delete</button>
              </td>
            </tr>`
                )
            .join("")}
        </tbody>
      </table>
    `;

    wireAdminReorder(wrap, "data-progrow", async (orderedIds) => {
      try { await saveAdminRowOrderInPlace(wrap, "data-progrow", "progression_rows", rows, orderedIds); invalidateCaches(); }
      catch (err) { toast("Couldn't reorder", true); loadRows(); }
    });
    wireAdmEditBar(wrap, { rowAttr: "data-progrow", table: "progression_rows", upTable: "progression_rows", saveRow: (id) => saveProgRow(id), after: () => invalidateCaches(), hide: ["#adminProgSaveAll", "[data-progsave]"],
      addForm: "#adminProgAddForm", reload: () => loadRows(),
      create: async (tr) => {
        const payload = { table_id: ADMIN_ACTIVE_PROGRESSION, ...admNewRowPayload(tr, null) };
        if (payload.sort_order == null) payload.sort_order = await admNextOrder(`progression_rows?table_id=eq.${ADMIN_ACTIVE_PROGRESSION}`);
        await sb(`progression_rows`, { method: "POST", body: JSON.stringify(payload) });
      } });
    admWireRowSave(wrap, "data-progsave", saveProgRow, () => { invalidateCaches(); });
    admWireRowDelete(wrap, "data-progdel", "progression_rows", () => { invalidateCaches(); }, () => loadRows());
  }

  document.getElementById("adminProgAddForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    const errEl = document.getElementById("adminProgAddErr");
    errEl.textContent = "";
    const payload = { table_id: ADMIN_ACTIVE_PROGRESSION };
    cols.forEach((c) => {
      let v = f[c.key].value;
      if (c.key === "sort_order" && v === "") {
        v = null;
      } else if (c.type === "number") {
        v = v === "" ? null : Number(v);
      } else if (v.trim() === "") {
        v = null;
      }
      payload[c.key] = v;
    });
    try {
      if (payload.sort_order == null) {
        const existing = await sb(`progression_rows?table_id=eq.${ADMIN_ACTIVE_PROGRESSION}&select=sort_order&order=sort_order.desc&limit=1`);
        payload.sort_order = existing.length ? (existing[0].sort_order || 0) + 1 : 0;
      }
      await sb(`progression_rows`, { method: "POST", body: JSON.stringify(payload) });
      invalidateCaches();
      toast("Row added");
      f.reset();
      loadRows();
    } catch (err) {
      errEl.textContent = "Couldn't add row";
    }
  });

  await loadRows();
}

// ---- Research editor (Research Center / T11 Helios / T12) ----
const ADMIN_RESEARCH_CONFIG = {
  "Research Center": {
    table: "research_center_nodes",
    cols: [
      { key: "track", label: "Track", type: "text" },
      { key: "level", label: "Level", type: "number" },
      { key: "troop", label: "Troop", type: "text" },
      { key: "stat", label: "Stat", type: "text" },
      { key: "stat_pct", label: "Stat %", type: "number" },
      { key: "meat", label: "Meat", type: "number" },
      { key: "wood", label: "Wood", type: "number" },
      { key: "coal", label: "Coal", type: "number" },
      { key: "iron", label: "Iron", type: "number" },
      { key: "steel", label: "Steel", type: "number" },
      { key: "time_hours", label: "Time (hrs)", type: "number" },
      { key: "power", label: "Power", type: "number" },
      { key: "buff_text", label: "Buff text", type: "text" },
      { key: "sort_order", label: "Order", type: "number" },
    ],
    invalidate: () => { RC_NODES_CACHE = null; },
  },
  "T11 Helios": {
    table: "t11_helios_nodes",
    cols: [
      { key: "track", label: "Track", type: "text" },
      { key: "troop", label: "Troop", type: "text" },
      { key: "level", label: "Level", type: "number" },
      { key: "stat", label: "Stat", type: "text" },
      { key: "stat_pct", label: "Stat %", type: "number" },
      { key: "meat", label: "Meat", type: "number" },
      { key: "wood", label: "Wood", type: "number" },
      { key: "coal", label: "Coal", type: "number" },
      { key: "iron", label: "Iron", type: "number" },
      { key: "steel", label: "Steel", type: "number" },
      { key: "refined_fc", label: "Refined FC", type: "number" },
      { key: "fc_shard", label: "FC Shard", type: "number" },
      { key: "time_hours", label: "Time (hrs)", type: "number" },
      { key: "sort_order", label: "Order", type: "number" },
    ],
    invalidate: () => { T11_NODES_CACHE = null; },
  },
  T12: {
    table: "t12_nodes",
    cols: [
      { key: "tier", label: "Tier", type: "text" },
      { key: "level", label: "Level", type: "number" },
      { key: "steel", label: "Steel", type: "number" },
      { key: "refined_fc", label: "Refined FC", type: "number" },
      { key: "fc_shard", label: "FC Shard", type: "number" },
      { key: "meat_wood", label: "Meat / Wood (each)", type: "number" },
      { key: "coal", label: "Coal", type: "number" },
      { key: "iron", label: "Iron", type: "number" },
      { key: "time_hours", label: "Time (hrs)", type: "number" },
      { key: "sort_order", label: "Order", type: "number" },
    ],
    invalidate: () => { T12_NODES_CACHE = null; },
  },
};
let ADMIN_ACTIVE_RESEARCH = "Research Center";
async function renderAdminResearch(body) {
  const cfg = ADMIN_RESEARCH_CONFIG[ADMIN_ACTIVE_RESEARCH];

  body.innerHTML = `
    <div class="panel" style="margin-bottom:16px;">
      <div style="display:flex; gap:8px;">
        ${Object.keys(ADMIN_RESEARCH_CONFIG)
          .map((k) => `<button class="btn ${k === ADMIN_ACTIVE_RESEARCH ? "" : "ghost"} small" data-researchsub="${esc(k)}">${esc(k)}</button>`)
          .join("")}
      </div>
    </div>
    <div class="panel" style="margin-bottom:16px;">
      <h2>Add a row</h2>
      <form class="inline" id="adminResearchAddForm">
        ${cfg.cols.map((c) => `<input class="field-num" name="${c.key}" placeholder="${esc(c.label)}" ${c.key === "sort_order" ? 'type="hidden"' : c.type === "number" ? 'type="number" step="any"' : ""} style="width:100px;" />`).join("")}
        <button class="btn" type="submit">Add row</button>
      </form>
      <div class="err" id="adminResearchAddErr"></div>
    </div>
    <div class="panel">
      <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:8px;">
        <h2 id="adminResearchHeading" style="margin:0;">Rows</h2>
        <button class="btn small" id="adminResearchSaveAll">Save all</button>
      </div>
      <div id="adminResearchWrap" class="adm-scroll"></div>
    </div>
  `;

  document.getElementById("adminResearchSaveAll").addEventListener("click", () => saveAllResRows());

  body.querySelectorAll("[data-researchsub]").forEach((btn) => {
    btn.addEventListener("click", () => {
      ADMIN_ACTIVE_RESEARCH = btn.dataset.researchsub;
      renderAdminResearch(body);
    });
  });

  let currentResRows = [];
  const saveResRow = async (id) => {
    const wrap = document.getElementById("adminResearchWrap");
    const tr = wrap.querySelector(`tr[data-resrow="${id}"]`);
    const patch = admRowPatch(tr, cfg.cols);
    await sb(`${cfg.table}?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(patch) });
  };
  const saveAllResRows = () => admSaveAllRows(document.getElementById("adminResearchSaveAll"), () => currentResRows, (r) => saveResRow(r.id), () => { cfg.invalidate(); });

  async function loadRows() {
    const selectCols = ["id", ...cfg.cols.map((c) => c.key)].join(",");
    const rows = await sb(`${cfg.table}?select=${selectCols}&order=sort_order.asc`);
    currentResRows = rows;
    document.getElementById("adminResearchHeading").textContent = `${ADMIN_ACTIVE_RESEARCH} rows (${rows.length})`;
    const wrap = document.getElementById("adminResearchWrap");
    wrap.innerHTML = `
      <table style="width:100%; border-collapse:collapse; font-size:12.5px;">
        <thead><tr>
          ${adminColHeadHtml(cfg.cols, true)}
          <th></th>
        </tr></thead>
        <tbody>
          ${rows
            .map(
              (r, idx) => `
            <tr data-resrow="${r.id}">
              ${adminReorderCellHtml(r.id)}
              ${cfg.cols.map((c) => adminColCellHtml(c, r, c.key === "buff_text" ? "180px" : "90px")).join("")}
              <td style="padding:4px; white-space:nowrap;">
                <button class="btn small ghost" data-ressave="${r.id}">Save</button>
                <button class="btn small ghost" data-resdel="${r.id}" style="color:var(--danger);">Delete</button>
              </td>
            </tr>`
                )
            .join("")}
        </tbody>
      </table>
    `;

    wireAdminReorder(wrap, "data-resrow", async (orderedIds) => {
      try { await saveAdminRowOrderInPlace(wrap, "data-resrow", cfg.table, rows, orderedIds); cfg.invalidate(); }
      catch (err) { toast("Couldn't reorder", true); loadRows(); }
    });
    wireAdmEditBar(wrap, { rowAttr: "data-resrow", table: cfg.table, upTable: cfg.table, saveRow: (id) => saveResRow(id), after: () => cfg.invalidate(), hide: ["#adminResearchSaveAll", "[data-ressave]"],
      addForm: "#adminResearchAddForm", reload: () => loadRows(),
      create: async (tr) => {
        const payload = admNewRowPayload(tr, null);
        if (payload.sort_order == null) payload.sort_order = await admNextOrder(cfg.table);
        await sb(`${cfg.table}`, { method: "POST", body: JSON.stringify(payload) });
      } });
    admWireRowSave(wrap, "data-ressave", saveResRow, () => { cfg.invalidate(); });
    admWireRowDelete(wrap, "data-resdel", cfg.table, () => { cfg.invalidate(); }, () => loadRows());
  }

  document.getElementById("adminResearchAddForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    const errEl = document.getElementById("adminResearchAddErr");
    errEl.textContent = "";
    const payload = {};
    cfg.cols.forEach((c) => {
      let v = f[c.key].value;
      if (c.key === "sort_order" && v === "") {
        v = null;
      } else if (c.type === "number") {
        v = v === "" ? null : Number(v);
      } else if (v.trim() === "") {
        v = null;
      }
      payload[c.key] = v;
    });
    try {
      if (payload.sort_order == null) {
        const existing = await sb(`${cfg.table}?select=sort_order&order=sort_order.desc&limit=1`);
        payload.sort_order = existing.length ? (existing[0].sort_order || 0) + 1 : 0;
      }
      await sb(`${cfg.table}`, { method: "POST", body: JSON.stringify(payload) });
      cfg.invalidate();
      toast("Row added");
      f.reset();
      loadRows();
    } catch (err) {
      errEl.textContent = "Couldn't add row";
    }
  });

  await loadRows();
}

// ---- Heroes catalog editor ----
async function renderAdminHeroes(body) {
  let selectedGen = 0;
  const rows = await sb(`heroes?select=id,name,image_url,max_level,max_stars,troop_type,generation,rarity,exp_attack,exp_defense,widget_lethality,widget_health&order=generation.desc.nullslast,name.asc`);
  const gens = [...new Set(rows.map((r) => r.generation ?? -1))].sort((a, b) => b - a);
  if (!gens.includes(ADMIN_HERO_GEN)) ADMIN_HERO_GEN = gens[0] ?? -1;
  const listWrap = document.createElement("div");
  body.innerHTML = "";
  body.appendChild(listWrap);
  const fields = (r) => [
    { key: "image_url", label: "Picture", type: "img", value: r.image_url },
    { key: "name", label: "Name", value: r.name },
    { key: "generation", label: "Gen", type: "num", value: r.generation, half: true },
    { key: "troop_type", label: "Class", type: "select", options: [["", "—"], "Infantry", "Lancer", "Marksman"], value: r.troop_type || "", half: true },
    { key: "rarity", label: "Rarity", type: "select", options: [["", "—"], "Rare", "Epic", "Legendary"], value: r.rarity || "", half: true },
    { key: "max_stars", label: "Max stars", type: "num", value: r.max_stars ?? 5, half: true },
    { key: "exp_attack", label: "Max ATK & DEF %", type: "num", value: r.exp_attack, half: true },
    { key: "widget_lethality", label: "Max widget LETH & HP %", type: "num", value: r.widget_lethality, half: true },
    { key: "max_level", label: "Max level", type: "num", value: r.max_level ?? 80, half: true, more: true },
    // Where the hero comes from (State Timeline tags); saved in site_config
    // hero_sources, not in the heroes table. Empty = the built-in guess
    // (the Gen's Hall of Heroes hero), "none" = no tag.
    { key: "source", label: "How to get", type: "select", options: [["", `Auto (${heroSourceLabel(heroSourceAuto(r.name, r.generation)) || "none"})`], ["hall", heroSourceLabel("hall")], ["wheel", heroSourceLabel("wheel")], ["event", heroSourceLabel("event")], ["packs", heroSourceLabel("packs")], ["signin", heroSourceLabel("signin")], ["recruit", heroSourceLabel("recruit")], ["none", "No tag"]], value: (siteConfig("hero_sources", {}) || {})[r.name] || "", half: true },
  ];
  // ATK/DEF and widget LETH/HP are always equal - one box each.
  const mirror = (v) => { const o = { ...v, exp_defense: v.exp_attack, widget_health: v.widget_lethality }; delete o.source; return o; };
  const saveSource = async (name, src, oldName) => {
    const cur = { ...(siteConfig("hero_sources", {}) || {}) };
    if (oldName && oldName !== name) delete cur[oldName];
    if (src) cur[name] = src; else delete cur[name];
    if (JSON.stringify(cur) !== JSON.stringify(siteConfig("hero_sources", {}) || {})) await saveSiteConfig("hero_sources", cur);
  };
  function drawHeroes() {
    const list = rows.filter((r) => (r.generation ?? -1) === ADMIN_HERO_GEN);
    listWrap.innerHTML = `<div class="adm-chips"><div class="adm-chips-row">${gens.map((g) => `<button type="button" class="adm-chip${g === ADMIN_HERO_GEN ? " on" : ""}" data-herogen="${g}">${g < 0 ? "No gen" : `Gen ${g}`} <span class="meta">· ${((n) => `${n} ${n === 1 ? "hero" : "heroes"}`)(rows.filter((r) => (r.generation ?? -1) === g).length)}</span></button>`).join("")}</div></div>`
      + admListHtml(list, { title: ADMIN_HERO_GEN < 0 ? "No gen" : `Gen ${ADMIN_HERO_GEN} heroes`, attr: "data-herorow", img: (r) => r.image_url, name: (r) => r.name, sub: (r) => [r.troop_type, r.rarity === "Legendary" ? "Mythic" : r.rarity].filter(Boolean).join(" · ") });
    listWrap.querySelectorAll("[data-herogen]").forEach((b) => b.addEventListener("click", () => { ADMIN_HERO_GEN = Number(b.dataset.herogen); keepBoxes(listWrap, drawHeroes); }));
    wireAdmList(listWrap, {
      onEdit: (id) => {
        const r = rows.find((x) => String(x.id) === id);
        openAdmSheet({ title: `Edit · ${r.name}`, fields: fields(r),
          onSave: async (v) => {
            if (!v.name) throw new Error("Enter a name");
            const patch = mirror(v);
            await sb(`heroes?id=eq.${r.id}`, { method: "PATCH", body: JSON.stringify(patch) });
            await saveSource(v.name, v.source, r.name);
            Object.assign(r, patch); toast("Saved");
            if ((r.generation ?? -1) !== ADMIN_HERO_GEN) renderAdminHeroes(body); else drawHeroes();
          },
          onDelete: async () => { await sb(`heroes?id=eq.${r.id}`, { method: "DELETE" }); toast("Deleted"); renderAdminHeroes(body); },
          deleteText: `Delete ${r.name} from the hero list?` });
      },
      onAdd: () => openAdmSheet({ title: "Add a hero", fields: fields({ generation: ADMIN_HERO_GEN < 0 ? null : ADMIN_HERO_GEN }),
        onSave: async (v) => {
          if (!v.name) throw new Error("Enter a name");
          if (rows.some((r) => r.name === v.name)) throw new Error("That hero already exists");
          await sb(`heroes`, { method: "POST", body: JSON.stringify({ ...mirror(v), max_level: v.max_level || 80, max_stars: v.max_stars || 5 }) });
          await saveSource(v.name, v.source);
          toast("Hero added"); if (v.generation != null) ADMIN_HERO_GEN = v.generation; renderAdminHeroes(body);
        } }),
    });
    selectedGen = ADMIN_HERO_GEN;
    if (selectedGen >= 0) renderGenStats(); else statsWrap.innerHTML = `<p class="desc" style="margin-top:12px;">Pick a Gen to edit its star shard &amp; widget stats.</p>`;
  }

  // ---- Per-generation star-shard stats & widget-level stats editors ----
  // Stats are identical for every hero in a generation, so these are edited
  // once per generation and apply to all heroes of that generation.
  const statsWrap = document.createElement("div");
  body.appendChild(statsWrap);

  async function renderGenStats() {
    // The generation this table is for: if another one is picked while
    // loading, this (older) load stops instead of showing or saving its
    // stats under the new generation.
    const gen = selectedGen;
    const [starRows, widgetRows] = await Promise.all([
      sb(`hero_gen_star_stats?generation=eq.${gen}&select=step,atk_pct,def_pct,shards&order=step`),
      sb(`hero_gen_widget_stats?generation=eq.${gen}&select=level,leth_pct,hp_pct&order=level`),
    ]);
    if (gen !== selectedGen) return;
    const starBy = {}; starRows.forEach((r) => (starBy[r.step] = r));
    const widgetBy = {}; widgetRows.forEach((r) => (widgetBy[r.level] = r));
    const th = (h) => `<th style="text-align:start; padding:6px 8px; border-bottom:1px solid var(--line); color:var(--muted); font-weight:600;">${h}</th>`;
    const genHeroes = rows.filter((r) => r.generation === gen).map((r) => r.name).join(", ");
    statsWrap.innerHTML = `
      <div class="panel" style="margin-top:16px;">
        <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap; margin-bottom:6px;">
          <h2 style="margin:0;">Star shard & widget stats</h2>
          <span class="meta" style="font-size:12px; font-weight:600; color:var(--frost);">Gen ${gen}</span>
          <button class="btn small" id="adminGenStatsSave">Save all</button>
          <span style="display:inline-flex; align-items:center; flex-wrap:wrap; gap:6px; margin-left:auto;">
            <span class="meta" style="font-size:11px;">Max ATK&amp;DEF %</span>
            <input id="adminGenMaxAtk" type="number" step="any" class="keep-w" style="width:120px;" placeholder="e.g. 1621.3" />
            <span class="meta" style="font-size:11px;">Max widget %</span>
            <input id="adminGenMaxWidget" type="number" step="any" class="keep-w" style="width:110px;" placeholder="e.g. 482" />
            <button class="btn small ghost" id="adminGenGenerate" title="Fills all 30 shard steps and 10 widget levels from the max values using the standard curve">Generate from max</button>
          </span>
        </div>
        <p class="desc">Applies to every hero of this generation: ${esc(genHeroes) || "\u2014"}. Star steps 1\u201330 = 5 stars \u00d7 6 shards (step 6 = 1\u2605, 12 = 2\u2605, \u2026 30 = 5\u2605).</p>
        <div class="grid g2" style="gap:16px;">
          <div class="adm-scroll">
            <table style="width:100%; border-collapse:collapse; font-size:12.5px;">
              <thead><tr>${["Step", "Star", "ATK & DEF %", "Shards"].map(th).join("")}</tr></thead>
              <tbody>
                ${Array.from({ length: 30 }, (_, i) => i + 1).map((step) => {
                  const r = starBy[step] || {};
                  const star = Math.floor((step - 1) / 6) + 1, shard = ((step - 1) % 6) + 1;
                  return `<tr data-starstep="${step}">
                    <td style="padding:3px 8px;">${step}</td>
                    <td style="padding:3px 8px;" class="meta">${star}\u2605 ${shard}/6</td>
                    <td style="padding:3px;"><input data-sf="atk_pct" type="number" step="any" value="${r.atk_pct ?? ""}" class="keep-w" style="width:100%; max-width:110px; min-width:64px;" /></td>
                    <td style="padding:3px;"><input data-sf="shards" type="number" value="${r.shards ?? ""}" class="keep-w" style="width:100%; max-width:80px; min-width:52px;" /></td>
                  </tr>`;
                }).join("")}
              </tbody>
            </table>
          </div>
          <div class="adm-scroll">
            <table style="width:100%; border-collapse:collapse; font-size:12.5px;">
              <thead><tr>${["Widget Lv", "LETH & HP %"].map(th).join("")}</tr></thead>
              <tbody>
                ${Array.from({ length: 10 }, (_, i) => i + 1).map((lvl) => {
                  const r = widgetBy[lvl] || {};
                  return `<tr data-widgetlvl="${lvl}">
                    <td style="padding:3px 8px;">${lvl}</td>
                    <td style="padding:3px;"><input data-wf="leth_pct" type="number" step="any" value="${r.leth_pct ?? ""}" class="keep-w" style="width:100%; max-width:110px; min-width:64px;" /></td>
                  </tr>`;
                }).join("")}
              </tbody>
            </table>
          </div>
        </div>
      </div>`;

    // Standard per-shard curve is defined globally (STAR_CURVE, near HERO_SHARD_CHART).
    statsWrap.querySelector("#adminGenGenerate").addEventListener("click", () => {
      const maxAtk = Number(statsWrap.querySelector("#adminGenMaxAtk").value);
      const maxW = Number(statsWrap.querySelector("#adminGenMaxWidget").value);
      if (maxAtk > 0) statsWrap.querySelectorAll("tr[data-starstep]").forEach((tr) => {
        const step = Number(tr.dataset.starstep);
        tr.querySelector('[data-sf="atk_pct"]').value = (maxAtk * STAR_CURVE[step - 1]).toFixed(2);
        const shIn = tr.querySelector('[data-sf="shards"]');
        if (!shIn.value) shIn.value = HERO_SHARD_CHART[Math.floor((step - 1) / 6) + 1][(step - 1) % 6];
      });
      if (maxW > 0) statsWrap.querySelectorAll("tr[data-widgetlvl]").forEach((tr) => {
        tr.querySelector('[data-wf="leth_pct"]').value = (maxW * Number(tr.dataset.widgetlvl) / 10).toFixed(2);
      });
      toast("Filled \u2014 review, then Save all");
    });
    statsWrap.querySelector("#adminGenStatsSave").addEventListener("click", async () => {
      const num = (v) => (v === "" || v == null ? null : Number(v));
      const starPayload = [], widgetPayload = [];
      statsWrap.querySelectorAll("tr[data-starstep]").forEach((tr) => {
        const g = (f) => num(tr.querySelector(`[data-sf="${f}"]`).value);
        const atk = g("atk_pct"), sh = g("shards");
        if (atk != null || sh != null) starPayload.push({ generation: gen, step: Number(tr.dataset.starstep), atk_pct: atk, def_pct: atk, shards: sh });
      });
      statsWrap.querySelectorAll("tr[data-widgetlvl]").forEach((tr) => {
        const g = (f) => num(tr.querySelector(`[data-wf="${f}"]`).value);
        const le = g("leth_pct");
        if (le != null) widgetPayload.push({ generation: gen, level: Number(tr.dataset.widgetlvl), leth_pct: le, hp_pct: le });
      });
      try {
        if (starPayload.length) await sb(`hero_gen_star_stats`, { method: "POST", body: JSON.stringify(starPayload), prefer: "resolution=merge-duplicates,return=minimal" });
        if (widgetPayload.length) await sb(`hero_gen_widget_stats`, { method: "POST", body: JSON.stringify(widgetPayload), prefer: "resolution=merge-duplicates,return=minimal" });
        // keep hero max fields in sync with the 5★ / level-10 rows
        const maxStar = starPayload.find((p) => p.step === 30), maxW = widgetPayload.find((p) => p.level === 10);
        const heroPatch = {};
        if (maxStar) { heroPatch.exp_attack = maxStar.atk_pct; heroPatch.exp_defense = maxStar.def_pct; }
        if (maxW) { heroPatch.widget_lethality = maxW.leth_pct; heroPatch.widget_health = maxW.hp_pct; }
        if (Object.keys(heroPatch).length) await sb(`heroes?generation=eq.${gen}`, { method: "PATCH", body: JSON.stringify(heroPatch), prefer: "return=minimal" });
        rows.forEach((r) => { if (r.generation === gen) Object.assign(r, heroPatch); });
        toast(`Gen ${gen} stats saved`);
      } catch (err) {
        toast("Couldn't save stats", true);
      }
    });
  }
  drawHeroes();
}


// ---- Skin Gallery editor (multi-category, uses renderAdminSkinsCategory per category) ----
let ADMIN_ACTIVE_SKIN_CAT = null;
let ADMIN_ACTIVE_ISLAND_CAT = null;
async function renderAdminIslands(body) {
  const cats = await sb(`skin_page_categories?page=eq.islands&select=id,category,sort_order&order=sort_order.asc`);
  const catNames = cats.map((c) => c.category);
  if (!ADMIN_ACTIVE_ISLAND_CAT || !catNames.includes(ADMIN_ACTIVE_ISLAND_CAT)) ADMIN_ACTIVE_ISLAND_CAT = catNames[0];

  body.innerHTML = `
    ${adminCatHeaderHtml(cats, ADMIN_ACTIVE_ISLAND_CAT)}
    <div id="adminIslandsBody"></div>
  `;

  body.querySelectorAll("[data-catselect]").forEach((btn) => {
    btn.addEventListener("click", () => {
      ADMIN_ACTIVE_ISLAND_CAT = btn.dataset.catselect;
      renderAdminIslands(body);
    });
  });
  wireAdminCategoryReorder(body, "islands", cats, () => renderAdminIslands(body));
  await renderAdminSkinsCategory(document.getElementById("adminIslandsBody"), ADMIN_ACTIVE_ISLAND_CAT, "islands");
}

// Skin Gallery / Islands categories (design A): one row of chips + a
// "⋯ Category" menu (new, rename, move, delete — wired by
// wireAdminCategoryReorder). cats = [{ id, category, sort_order }] in order.
function adminCatHeaderHtml(cats, activeCat, opts = {}) {
  const act = cats.find((c) => c.category === activeCat);
  return `<div class="admc-cats"><div class="adm-chips-row">${cats.map((c) => `<button type="button" class="adm-chip admc-catchip${c.category === activeCat ? " on" : ""}" data-catselect="${esc(c.category)}" data-catid="${esc(String(c.id))}" title="${esc(t("cat_drag_hint"))}">${esc(c.category)}</button>`).join("")}</div>
    <details class="admc-catmenu"><summary class="btn ghost small">&#8943; Category</summary><div class="admc-catpop">
      <button type="button" data-catadd>+ New category</button>
      ${act ? `<button type="button" data-catrename="${act.id}">Rename "${esc(act.category)}"</button>
      ${opts.big ? `<button type="button" data-catbig="${esc(act.category)}">Big pictures: ${GALLERY_BIG_THUMB.has(act.category) ? "on &#10003;" : "off"}</button>` : ""}
      <button type="button" data-catdelete="${act.id}" style="color:var(--danger);">Delete "${esc(act.category)}"</button>` : ""}
    </div></details></div>`;
}
function wireAdminCategoryReorder(container, page, cats, onChange) {
  // Drag a category chip sideways (hold it on a phone) to move it; then
  // they are all numbered 1…n again (two equal numbers used to make a swap
  // do nothing). The order saves by itself.
  const move = async (from, to) => {
    const list = cats.slice();
    const [x] = list.splice(from, 1); list.splice(to, 0, x);
    let ok = true;
    try {
      await Promise.all(list.map((c, k) => (c.sort_order === k + 1 ? null : sb(`skin_page_categories?id=eq.${c.id}`, { method: "PATCH", body: JSON.stringify({ sort_order: k + 1 }) }))).filter(Boolean));
    } catch (err) { ok = false; toast(err.message || t("order_not_saved"), true); }
    if (ok) dsSaved();
    onChange();
  };
  container.querySelectorAll(".admc-cats [data-catid]").forEach((chip) => dragSort(chip, {
    hold: true, axis: "x", item: (h) => h, row: "[data-catid]",
    done: (r, from, to) => move(from, to),
    refocus: (r) => { const c = container.querySelector(`.admc-cats [data-catid="${window.CSS.escape(r.dataset.catid)}"]`); if (c) c.focus(); },
  }));
  // Rename / delete the chosen category (its items move with a rename).
  container.querySelectorAll("[data-catadd]").forEach((btn) => btn.addEventListener("click", async () => {
    const name = (prompt("Name of the new category:") || "").trim();
    if (!name) return;
    if (cats.some((x) => x.category === name)) { toast("That category already exists", true); return; }
    try {
      const maxOrder = cats.reduce((m, c) => Math.max(m, c.sort_order || 0), 0);
      await sb(`skin_page_categories`, { method: "POST", body: JSON.stringify({ page, category: name, sort_order: maxOrder + 1 }) });
      if (page === "islands") ADMIN_ACTIVE_ISLAND_CAT = name; else ADMIN_ACTIVE_SKIN_CAT = name;
      toast("Category added");
    } catch (err) { toast(err.message || "Couldn't add", true); }
    onChange();
  }));
  container.querySelectorAll("[data-catrename]").forEach((btn) => btn.addEventListener("click", async () => {
    const c = cats.find((x) => x.id === btn.dataset.catrename); if (!c) return;
    const name = (prompt(`New name for the "${c.category}" category:`, c.category) || "").trim();
    if (!name || name === c.category) return;
    if (cats.some((x) => x.category === name)) { toast("That category already exists", true); return; }
    try {
      await sb(`skins?user_id=eq.${USER_ID}&category=eq.${encodeURIComponent(c.category)}`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ category: name }) });
      await sb(`skin_page_categories?id=eq.${c.id}`, { method: "PATCH", body: JSON.stringify({ category: name }) });
      // The "big pictures" setting follows the new name.
      if (page === "gallery" && GALLERY_BIG_THUMB.has(c.category)) await saveGameRule("galleryBig", [...GALLERY_BIG_THUMB].map((x) => ({ category: x === c.category ? name : x })));
      dashDataChanged("skins"); toast("Category renamed");
      if (page === "islands") ADMIN_ACTIVE_ISLAND_CAT = name; else ADMIN_ACTIVE_SKIN_CAT = name;
    } catch (err) { toast(err.message || "Couldn't rename", true); }
    onChange();
  }));
  container.querySelectorAll("[data-catbig]").forEach((btn) => btn.addEventListener("click", async () => {
    const cat = btn.dataset.catbig, set = new Set(GALLERY_BIG_THUMB);
    if (set.has(cat)) set.delete(cat); else set.add(cat);
    try { await saveGameRule("galleryBig", [...set].map((x) => ({ category: x }))); toast("Saved"); } catch (err) { toast(err.message || "Couldn't save", true); }
    onChange();
  }));
  container.querySelectorAll("[data-catdelete]").forEach((btn) => btn.addEventListener("click", async () => {
    const c = cats.find((x) => x.id === btn.dataset.catdelete); if (!c) return;
    try {
      const items = await sb(`skins?user_id=eq.${USER_ID}&category=eq.${encodeURIComponent(c.category)}&select=id&limit=1`);
      if (items.length) { toast("Delete or move its items first — only an empty category can be deleted", true); return; }
      if (!confirm(`Delete the empty "${c.category}" category?`)) return;
      await sb(`skin_page_categories?id=eq.${c.id}`, { method: "DELETE" });
      toast("Category deleted");
    } catch (err) { toast(err.message || "Couldn't delete", true); }
    onChange();
  }));
}

async function renderAdminSkinGallery(body) {
  const cats = await sb(`skin_page_categories?page=eq.gallery&select=id,category,sort_order&order=sort_order.asc`);
  const catNames = cats.map((c) => c.category);
  if (!ADMIN_ACTIVE_SKIN_CAT || !catNames.includes(ADMIN_ACTIVE_SKIN_CAT)) ADMIN_ACTIVE_SKIN_CAT = catNames[0];

  body.innerHTML = `
    ${adminCatHeaderHtml(cats, ADMIN_ACTIVE_SKIN_CAT, { big: true })}
    <div id="adminSkinGalleryBody"></div>
  `;

  body.querySelectorAll("[data-catselect]").forEach((btn) => {
    btn.addEventListener("click", () => {
      ADMIN_ACTIVE_SKIN_CAT = btn.dataset.catselect;
      renderAdminSkinGallery(body);
    });
  });
  wireAdminCategoryReorder(body, "gallery", cats, () => renderAdminSkinGallery(body));
  await renderAdminSkinsCategory(document.getElementById("adminSkinGalleryBody"), ADMIN_ACTIVE_SKIN_CAT);
}
async function renderAdminHeroStars(body) {
  await ensureBuffTable();
  const columns = await sb(`buff_columns?table_id=eq.${BUFF_TABLE_ID}&select=id,name,sort_order&order=sort_order.asc`);
  const flatSources = new Set(dashSourcesConfig().extra); // Admin → Dashboard sources (not heroes)
  const heroCols = columns.filter((c) => !ADMIN_RESERVED_BUFF_CATEGORIES.has(c.name) && !flatSources.has(c.name));
  if (!ADMIN_ACTIVE_HERO_STAR_COL || !heroCols.find((c) => c.id === ADMIN_ACTIVE_HERO_STAR_COL)) {
    ADMIN_ACTIVE_HERO_STAR_COL = (heroCols.find((c) => c.name === "Jero") || heroCols[0])?.id;
  }

  const rows = await sb(`buff_rows?table_id=eq.${BUFF_TABLE_ID}&select=id,name,sort_order,buff_cells(id,value,column_id)&order=sort_order.asc`);
  const activeCol = heroCols.find((c) => c.id === ADMIN_ACTIVE_HERO_STAR_COL);
  const relevantRows = rows.filter((r) => r.buff_cells.some((c) => c.column_id === ADMIN_ACTIVE_HERO_STAR_COL && c.value != null));

  body.innerHTML = `
    <div class="panel" style="margin-bottom:16px;">
      <h2>Add a new hero</h2>
      <p class="desc">Creates a new hero column so you can fill in its star-level bonuses below.</p>
      <form class="inline" id="adminAddHeroStarForm">
        <input class="flex1" name="name" placeholder="Hero name" required />
        <button class="btn" type="submit">Add hero</button>
      </form>
      <div class="err" id="adminAddHeroStarErr"></div>
    </div>
    <div class="panel" style="margin-bottom:16px;">
      <h2>Pick a hero</h2>
      <select id="adminHeroStarPicker" style="width:220px;">
        ${heroCols.map((c) => `<option value="${c.id}" ${c.id === ADMIN_ACTIVE_HERO_STAR_COL ? "selected" : ""}>${esc(c.name)}</option>`).join("")}
      </select>
      ${activeCol ? `<button type="button" class="btn ghost small" id="adminHeroStarDelHero" style="margin-inline-start:8px; color:var(--danger);">Delete this hero</button>` : ""}
    </div>
    <div class="panel">
      <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:8px;">
        <h2 style="margin:0;">${esc(activeCol ? activeCol.name : "")} star-level bonuses (${relevantRows.length})</h2>
        <button class="btn small" id="adminHeroStarSaveAll">Save all</button>
      </div>
      <p class="desc">Row names follow the pattern "N ATT/DEF/DMG/HP" (star level + stat code). Values are the max % at that star level.</p>
      <div class="adm-scroll">
        <table style="width:100%; border-collapse:collapse; font-size:12.5px;">
          <thead><tr>
            <th style="text-align:start; padding:6px 8px; border-bottom:1px solid var(--line); color:var(--muted); font-weight:600;">Row name</th>
            <th style="text-align:start; padding:6px 8px; border-bottom:1px solid var(--line); color:var(--muted); font-weight:600;">Value %</th>
            <th></th>
          </tr></thead>
          <tbody>
            ${relevantRows
              .map((r) => {
                const cell = r.buff_cells.find((c) => c.column_id === ADMIN_ACTIVE_HERO_STAR_COL);
                return `
              <tr data-herostarrow="${r.id}" data-cellid="${cell ? cell.id : ""}">
                <td style="padding:4px;"><input data-f="name" value="${esc(r.name)}" style="width:160px;" /></td>
                <td style="padding:4px;"><input data-f="value" type="number" step="any" value="${cell && cell.value != null ? cell.value : ""}" style="width:100px;" /></td>
                <td style="padding:4px; white-space:nowrap;"><button class="btn small ghost" data-herostarsave="${r.id}">Save</button> <button class="btn small ghost" data-herostardel="${r.id}" style="color:var(--danger);" title="Remove this row from this hero">&#10005;</button></td>
              </tr>`;
              })
              .join("")}
          </tbody>
        </table>
      </div>
      <div style="margin-top:14px;">
        <h2 style="font-size:14px;">Add a row</h2>
        <form class="inline" id="adminHeroStarAddForm">
          <input class="field-num" name="name" placeholder="Row name (e.g. 1 ATT)" required style="width:160px;" />
          <input class="field-num" name="value" type="number" step="any" placeholder="Value %" required style="width:100px;" />
          <button class="btn" type="submit">Add row</button>
        </form>
        <div class="err" id="adminHeroStarAddErr"></div>
      </div>
    </div>
  `;

  document.getElementById("adminAddHeroStarForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    const errEl = document.getElementById("adminAddHeroStarErr");
    errEl.textContent = "";
    const name = f.name.value.trim();
    if (!name) { errEl.textContent = "Enter a hero name"; return; }
    if (ADMIN_RESERVED_BUFF_CATEGORIES.has(name) || flatSources.has(name)) { errEl.textContent = "That name is reserved by the app \u2014 pick another"; return; }
    try {
      const maxOrder = columns.reduce((m, c) => Math.max(m, c.sort_order || 0), 0);
      const [newCol] = await sb(`buff_columns`, { method: "POST", body: JSON.stringify({ table_id: BUFF_TABLE_ID, name, category: name, sort_order: maxOrder + 1 }) });
      toast("Hero added");
      ADMIN_ACTIVE_HERO_STAR_COL = newCol.id;
      renderAdminHeroStars(body);
    } catch (err) {
      errEl.textContent = "Couldn't add hero \u2014 name may already exist";
    }
  });

  document.getElementById("adminHeroStarPicker").addEventListener("change", (e) => {
    ADMIN_ACTIVE_HERO_STAR_COL = e.target.value;
    renderAdminHeroStars(body);
  });

  const saveHeroStarRow = async (rowId) => {
    let id = rowId;
    const tr = body.querySelector(`tr[data-herostarrow="${rowId}"]`);
    const name = tr.querySelector('[data-f="name"]').value.trim();
    const value = tr.querySelector('[data-f="value"]').value;
    let cellId = tr.dataset.cellid;
    const row = rows.find((x) => x.id === id);
    if (row && name && name !== row.name) {
      // Rows are shared by all heroes: renaming one hero's row moves only this
      // hero's value to a row with the new name (other heroes keep theirs).
      const shared = row.buff_cells.some((c) => c.column_id !== ADMIN_ACTIVE_HERO_STAR_COL && c.value != null);
      if (shared) {
        let target = rows.find((x) => x.name === name);
        if (!target) { const maxOrder = rows.reduce((m, r) => Math.max(m, r.sort_order || 0), 0); [target] = await sb(`buff_rows`, { method: "POST", body: JSON.stringify({ table_id: BUFF_TABLE_ID, name, sort_order: maxOrder + 1 }) }); target.buff_cells = []; rows.push(target); }
        const exists = (target.buff_cells || []).find((c) => c.column_id === ADMIN_ACTIVE_HERO_STAR_COL);
        if (cellId) {
          if (exists) { await sb(`buff_cells?id=eq.${cellId}`, { method: "DELETE" }); cellId = exists.id; }
          else await sb(`buff_cells?id=eq.${cellId}`, { method: "PATCH", body: JSON.stringify({ row_id: target.id }) });
        }
        id = target.id; tr.dataset.cellid = cellId || "";
      } else await sb(`buff_rows?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ name }) });
    }
    if (cellId) {
      await sb(`buff_cells?id=eq.${cellId}`, { method: "PATCH", body: JSON.stringify({ value: value === "" ? null : Number(value) }) });
    } else if (value !== "") {
      await sb(`buff_cells`, { method: "POST", body: JSON.stringify({ row_id: id, column_id: ADMIN_ACTIVE_HERO_STAR_COL, value: Number(value) }) });
    }
  };
  admWireRowSave(body, "data-herostarsave", saveHeroStarRow);
  wireAdmEditBar(body, { rowAttr: "data-herostarrow", saveRow: (id) => saveHeroStarRow(id), after: () => { dropKeptGameData(); admRedrawKeep(() => renderAdminHeroStars(body)); }, hide: ["#adminHeroStarSaveAll", "[data-herostarsave]"],
    addForm: "#adminHeroStarAddForm", reload: () => renderAdminHeroStars(body),
    create: async (tr) => {
      const name = tr.querySelector('[data-f="name"]').value.trim();
      if (!name) throw new Error("a new row needs a name");
      const maxOrder = rows.reduce((m, r) => Math.max(m, r.sort_order || 0), 0);
      const [created] = await sb(`buff_rows`, { method: "POST", body: JSON.stringify({ table_id: BUFF_TABLE_ID, name, sort_order: maxOrder + 1 }) });
      created.buff_cells = []; rows.push(created);
      tr.setAttribute("data-herostarrow", created.id); tr.dataset.cellid = ""; await saveHeroStarRow(created.id);
    } });
  body.querySelectorAll("[data-herostardel]").forEach((btn) => btn.addEventListener("click", async () => {
    const tr = btn.closest("tr"), row = rows.find((x) => x.id === btn.dataset.herostardel);
    if (!confirm(`Remove "${row ? row.name : ""}" from ${activeCol ? activeCol.name : "this hero"}?`)) return;
    try {
      if (tr.dataset.cellid) await sb(`buff_cells?id=eq.${tr.dataset.cellid}`, { method: "DELETE" });
      // The row itself goes too when no other hero uses it.
      if (row && !row.buff_cells.some((c) => c.column_id !== ADMIN_ACTIVE_HERO_STAR_COL && c.value != null)) await sb(`buff_rows?id=eq.${row.id}`, { method: "DELETE" });
      dropKeptGameData(); toast("Row removed"); admRedrawKeep(() => renderAdminHeroStars(body));
    } catch (err) { toast(err.message || "Couldn't remove", true); }
  }));
  const delHero = document.getElementById("adminHeroStarDelHero");
  if (delHero) delHero.addEventListener("click", async () => {
    const typed = prompt(`Delete ${activeCol.name} and all its special-skill bonuses? This can't be undone.\n\nType the hero's name to confirm:`);
    if (typed == null) return;
    if (typed.trim() !== activeCol.name) { toast("The name didn't match — nothing deleted", true); return; }
    try {
      await sb(`buff_cells?column_id=eq.${activeCol.id}`, { method: "DELETE" });
      await sb(`buff_columns?id=eq.${activeCol.id}`, { method: "DELETE" });
      ADMIN_ACTIVE_HERO_STAR_COL = null; dropKeptGameData(); toast("Hero deleted"); renderAdminHeroStars(body);
    } catch (err) { toast(err.message || "Couldn't delete", true); }
  });
  document.getElementById("adminHeroStarSaveAll").addEventListener("click", async () => {
    const btn = document.getElementById("adminHeroStarSaveAll");
    btn.disabled = true;
    btn.textContent = "Saving\u2026";
    try {
      for (const r of relevantRows) await saveHeroStarRow(r.id); // one at a time: a rename may add a row
      dropKeptGameData();
      toast(`Saved ${relevantRows.length} row${relevantRows.length === 1 ? "" : "s"}`);
      renderAdminHeroStars(body); return;
    } catch (err) {
      toast("Couldn't save all", true);
    }
    btn.disabled = false;
    btn.textContent = "Save all";
  });

  document.getElementById("adminHeroStarAddForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    const errEl = document.getElementById("adminHeroStarAddErr");
    errEl.textContent = "";
    const name = f.name.value.trim();
    if (!name) { errEl.textContent = "Enter a row name"; return; }
    try {
      const maxOrder = rows.reduce((m, r) => Math.max(m, r.sort_order || 0), 0);
      const [newRow] = await sb(`buff_rows`, { method: "POST", body: JSON.stringify({ table_id: BUFF_TABLE_ID, name, sort_order: maxOrder + 1 }) });
      await sb(`buff_cells`, { method: "POST", body: JSON.stringify({ row_id: newRow.id, column_id: ADMIN_ACTIVE_HERO_STAR_COL, value: Number(f.value.value) }) });
      toast("Row added");
      renderAdminHeroStars(body);
    } catch (err) {
      errEl.textContent = "Couldn't add row";
    }
  });
}

// ---- Pets Refine editor ----
let ADMIN_ACTIVE_PET_REFINE = null;
async function renderAdminPetsRefine(body) {
  const [refineRows, levelRows] = await Promise.all([
    sb(`pet_refine_nodes?select=pet&order=pet&limit=5000`),
    sb(`${PET_LEVELS_TABLE}?select=pet&order=pet&limit=5000`),
  ]);
  const petSet = new Set();
  refineRows.forEach((r) => { const p = (r.pet || "").trim(); if (p) petSet.add(p); });
  levelRows.forEach((r) => { const p = (r.pet || "").trim(); if (p) petSet.add(p); });
  const pets = Array.from(petSet).sort((a, b) => a.localeCompare(b));
  if (!ADMIN_ACTIVE_PET_REFINE || !pets.includes(ADMIN_ACTIVE_PET_REFINE)) ADMIN_ACTIVE_PET_REFINE = pets[0] || null;

  body.innerHTML = `
    <div class="panel" style="margin-bottom:16px;">
      <h2>Add a new pet's refine data</h2>
      <p class="desc">Creates the pet with a single Grey-stage row \u2014 add more stage rows below afterward. Only needed if the pet doesn't already exist on the Pets tab.</p>
      <form class="inline" id="adminAddPetRefineForm">
        <input class="flex1" name="pet" placeholder="Pet name" required />
        <input class="field-num" name="category" placeholder="Category (First/N/R/SR/SRR/UR)" style="width:200px;" />
        <button class="btn" type="submit">Add pet</button>
      </form>
      <div class="err" id="adminAddPetRefineErr"></div>
    </div>
    <div class="panel" style="margin-bottom:16px;">
      <h2>Pick a pet (${pets.length} total)</h2>
      <select id="adminPetRefinePicker" style="width:220px;">
        ${pets.map((p) => `<option value="${esc(p)}" ${p === ADMIN_ACTIVE_PET_REFINE ? "selected" : ""}>${esc(p)}</option>`).join("")}
      </select>
    </div>
    <div class="panel" style="margin-bottom:16px;">
      <h2>Add a stage row</h2>
      <p class="desc">One % value is applied to all 6 troop/stat fields (Infantry/Lancer/Marksman \u00d7 Lethality/Health).</p>
      <form class="inline" id="adminAddPetRefineRowForm">
        <input class="field-num" name="stage" placeholder="Stage label" style="width:120px;" />
        <input class="field-num" name="all_pct" type="number" step="any" placeholder="Bonus %" style="width:120px;" />
        <button class="btn" type="submit">Add row</button>
      </form>
      <div class="err" id="adminAddPetRefineRowErr"></div>
    </div>
    <div class="panel">
      <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:8px;">
        <h2 id="adminPetRefineRowsHeading" style="margin:0;">Rows</h2>
        <button class="btn small" id="adminPetRefineSaveAll">Save all</button>
      </div>
      <div id="adminPetRefineRowsWrap" class="adm-scroll"></div>
    </div>
  `;

  document.getElementById("adminPetRefineSaveAll").addEventListener("click", () => saveAllRefineRows());

  document.getElementById("adminAddPetRefineForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    const errEl = document.getElementById("adminAddPetRefineErr");
    errEl.textContent = "";
    const pet = f.pet.value.trim();
    const category = f.category.value.trim() || null;
    if (!pet) { errEl.textContent = "Enter a pet name"; return; }
    if (pets.includes(pet)) { errEl.textContent = "That pet already has refine data"; return; }
    try {
      await sb(`pet_refine_nodes`, {
        method: "POST",
        body: JSON.stringify({ pet, category, stage: "Grey", infantry_lethality_pct: 0, infantry_health_pct: 0, lancer_lethality_pct: 0, lancer_health_pct: 0, marksman_lethality_pct: 0, marksman_health_pct: 0, sort_order: 0 }),
      });
      PET_REFINE_CACHE = null;
      toast("Pet added");
      ADMIN_ACTIVE_PET_REFINE = pet;
      renderAdminPetsRefine(body);
    } catch (err) {
      errEl.textContent = "Couldn't add pet";
    }
  });

  if (!ADMIN_ACTIVE_PET_REFINE) {
    document.getElementById("adminPetRefineRowsHeading").textContent = "No pets yet \u2014 add one above";
    return;
  }

  document.getElementById("adminPetRefinePicker").addEventListener("change", (e) => {
    ADMIN_ACTIVE_PET_REFINE = e.target.value;
    renderAdminPetsRefine(body);
  });

  const refineCols = [
    { key: "category", label: "Category", type: "text" },
    { key: "stage", label: "Stage", type: "text" },
    { key: "infantry_lethality_pct", label: "Inf. Lethality %", type: "number" },
    { key: "infantry_health_pct", label: "Inf. Health %", type: "number" },
    { key: "lancer_lethality_pct", label: "Lancer Lethality %", type: "number" },
    { key: "lancer_health_pct", label: "Lancer Health %", type: "number" },
    { key: "marksman_lethality_pct", label: "Marksman Lethality %", type: "number" },
    { key: "marksman_health_pct", label: "Marksman Health %", type: "number" },
    { key: "sort_order", label: "Order", type: "number" },
  ];

  let currentRefineRows = [];
  const saveAllRefineRows = async () => {
    const btn = document.getElementById("adminPetRefineSaveAll");
    btn.disabled = true;
    btn.textContent = "Saving\u2026";
    try {
      const wrap = document.getElementById("adminPetRefineRowsWrap");
      await Promise.all(currentRefineRows.map(async (r) => {
        const tr = wrap.querySelector(`tr[data-petrefinerow="${r.id}"]`);
        const patch = admRowPatch(tr, refineCols);
        await sb(`pet_refine_nodes?id=eq.${r.id}`, { method: "PATCH", body: JSON.stringify(patch) });
      }));
      PET_REFINE_CACHE = null;
      toast(`Saved ${currentRefineRows.length} row${currentRefineRows.length === 1 ? "" : "s"}`);
    } catch (err) {
      toast("Couldn't save all", true);
    }
    btn.disabled = false;
    btn.textContent = "Save all";
  };

  async function loadRefineRows() {
    const cols = ["id", ...refineCols.map((c) => c.key)].join(",");
    const rows = await sb(`pet_refine_nodes?select=${cols}&pet=eq.${encodeURIComponent(ADMIN_ACTIVE_PET_REFINE)}&order=sort_order`);
    currentRefineRows = rows;
    document.getElementById("adminPetRefineRowsHeading").textContent = `Rows for ${ADMIN_ACTIVE_PET_REFINE} (${rows.length})`;
    const wrap = document.getElementById("adminPetRefineRowsWrap");
    wrap.innerHTML = `
      <table style="width:100%; border-collapse:collapse; font-size:12.5px;">
        <thead><tr>
          ${adminColHeadHtml(refineCols, true)}
          <th></th>
        </tr></thead>
        <tbody>
          ${rows
            .map(
              (r, idx) => `
            <tr data-petrefinerow="${r.id}">
              ${adminReorderCellHtml(r.id)}
              ${refineCols.map((c) => adminColCellHtml(c, r, "90px")).join("")}
              <td style="padding:4px; white-space:nowrap;">
                <button class="btn small ghost" data-petrefinesave="${r.id}">Save</button>
                <button class="btn small ghost" data-petrefinedel="${r.id}" style="color:var(--danger);">Delete</button>
              </td>
            </tr>`
                )
            .join("")}
        </tbody>
      </table>
    `;

    wireAdminReorder(wrap, "data-petrefinerow", async (orderedIds) => {
      try { await saveAdminRowOrderInPlace(wrap, "data-petrefinerow", "pet_refine_nodes", rows, orderedIds); PET_REFINE_CACHE = null; }
      catch (err) { toast("Couldn't reorder", true); loadRefineRows(); }
    });
    wireAdmEditBar(wrap, { rowAttr: "data-petrefinerow", table: "pet_refine_nodes", upTable: "pet_refine_nodes", after: () => { PET_REFINE_CACHE = null; }, hide: ["#adminPetRefineSaveAll", "[data-petrefinesave]"],
      addForm: "#adminAddPetRefineRowForm", reload: () => loadRefineRows(),
      create: async (tr) => {
        const last = rows[rows.length - 1];
        const payload = { pet: ADMIN_ACTIVE_PET_REFINE, ...admNewRowPayload(tr, 0) };
        if (payload.category == null && last) payload.category = last.category ?? null;
        payload.sort_order = await admNextOrder(`pet_refine_nodes?pet=eq.${encodeURIComponent(ADMIN_ACTIVE_PET_REFINE)}`);
        await sb(`pet_refine_nodes`, { method: "POST", body: JSON.stringify(payload) });
      } });
    wrap.querySelectorAll("[data-petrefinesave]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.petrefinesave;
        const tr = wrap.querySelector(`tr[data-petrefinerow="${id}"]`);
        const patch = admRowPatch(tr, refineCols);
        try {
          await sb(`pet_refine_nodes?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(patch) });
          PET_REFINE_CACHE = null;
          toast("Saved");
        } catch (err) {
          toast("Couldn't save", true);
        }
      });
    });
    admWireRowDelete(wrap, "data-petrefinedel", "pet_refine_nodes", () => { PET_REFINE_CACHE = null; }, () => loadRefineRows());
  }

  document.getElementById("adminAddPetRefineRowForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    const errEl = document.getElementById("adminAddPetRefineRowErr");
    errEl.textContent = "";
    const allPct = f.all_pct.value === "" ? 0 : Number(f.all_pct.value);
    try {
      const existing = await sb(`pet_refine_nodes?pet=eq.${encodeURIComponent(ADMIN_ACTIVE_PET_REFINE)}&select=sort_order,category&order=sort_order.desc&limit=1`);
      const nextOrder = existing.length ? (existing[0].sort_order || 0) + 1 : 0;
      const category = existing.length ? existing[0].category : null;
      const payload = {
        pet: ADMIN_ACTIVE_PET_REFINE,
        category,
        stage: f.stage.value.trim() || null,
        infantry_lethality_pct: allPct,
        infantry_health_pct: allPct,
        lancer_lethality_pct: allPct,
        lancer_health_pct: allPct,
        marksman_lethality_pct: allPct,
        marksman_health_pct: allPct,
        sort_order: nextOrder,
      };
      await sb(`pet_refine_nodes`, { method: "POST", body: JSON.stringify(payload) });
      PET_REFINE_CACHE = null;
      toast("Row added");
      f.reset();
      loadRefineRows();
    } catch (err) {
      errEl.textContent = "Couldn't add row";
    }
  });

  await loadRefineRows();
}


// ---- Experts group page (sub-tabs: Roster / Affinity / Skills / Research) ----
async function renderAdminExpertsGroup(body) {
  const SUBTABS = {
    roster: { label: "Experts Roster" },
    affinity: { label: "Experts Affinity" },
    skills: { label: "Experts Skills" },
    research: { label: "Experts Research" },
  };
  body.innerHTML = `
    <div class="adm-chips">
      <div class="adm-chips-row">
        ${Object.entries(SUBTABS)
          .map(([key, t]) => `<button class="adm-chip${key === ADMIN_ACTIVE_EXPERTS_SUBTAB ? " on" : ""}" data-expertssubtab="${key}">${esc(t.label)}</button>`)
          .join("")}
      </div>
    </div>
    <div id="adminExpertsGroupBody"></div>
  `;
  body.querySelectorAll("[data-expertssubtab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      ADMIN_ACTIVE_EXPERTS_SUBTAB = btn.dataset.expertssubtab;
      renderAdminExpertsGroup(body);
    });
  });
  const sub = document.getElementById("adminExpertsGroupBody");
  if (ADMIN_ACTIVE_EXPERTS_SUBTAB === "roster") await renderAdminRoster(sub);
  else await renderAdminExpertTable(sub, ADMIN_ACTIVE_EXPERTS_SUBTAB);
}

// ---- Pets group page (sub-tabs: Pets / Pets Refine) ----
async function renderAdminPetsGroup(body) {
  const SUBTABS = { pets: { label: "Pets" }, petsrefine: { label: "Pets Refine" }, marks: { label: "Marks Calculation" } };
  body.innerHTML = `
    <div class="adm-chips">
      <div class="adm-chips-row">
        ${Object.entries(SUBTABS)
          .map(([key, t]) => `<button class="adm-chip${key === ADMIN_ACTIVE_PETS_SUBTAB ? " on" : ""}" data-petssubtab="${key}">${esc(t.label)}</button>`)
          .join("")}
      </div>
    </div>
    <div id="adminPetsGroupBody"></div>
  `;
  body.querySelectorAll("[data-petssubtab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      ADMIN_ACTIVE_PETS_SUBTAB = btn.dataset.petssubtab;
      renderAdminPetsGroup(body);
    });
  });
  const sub = document.getElementById("adminPetsGroupBody");
  if (ADMIN_ACTIVE_PETS_SUBTAB === "pets") await renderAdminPets(sub);
  else if (ADMIN_ACTIVE_PETS_SUBTAB === "marks") await renderAdminMarksCalc(sub);
  else await renderAdminPetsRefine(sub);
}

// ---- Marks calculation: visitors' rates vs the owner's test rates ----
async function renderAdminMarksCalc(body) {
  PET_MARKS_STATE = null;
  const st = await ensurePetMarksState();
  const STAGES = ["Grey", "Green", "Blue", "Purple", "Orange", "Red"];
  const colors = { Grey: "#9aa4b2", Green: "#7ee6a8", Blue: "var(--ice)", Purple: "#c9a0ff", Orange: "#f0a35a", Red: "#ff7b7b" };
  const col = (title, key, editable) => `
    <div class="panel" style="flex:1 1 260px; min-width:240px;">
      <h2 style="font-size:14px;">${title}</h2>
      <div style="display:flex; flex-direction:column; gap:6px; margin-top:8px;">
        ${STAGES.map((sg) => `<label style="display:flex; align-items:center; gap:8px; font-size:12px;">
          <span style="min-width:60px; font-weight:600; color:${colors[sg]};">${sg}</span>
          <input type="text" inputmode="decimal" data-mrate="${key}|${sg}" value="${st[key][sg]}" style="width:90px; text-align:center;" />
          <span class="meta" style="font-size:10.5px;">Common Marks per 1%</span>
        </label>`).join("")}
      </div>
      <div style="margin-top:10px;"><button class="btn small" data-msave="${key}" type="button">Save ${key === "published" ? "for visitors" : "my test rates"}</button></div>
    </div>`;
  body.innerHTML = `
    <div class="panel" style="margin-bottom:16px;">
      <h2>Marks calculation</h2>
      <p class="desc">Two sets of "Common Marks per 1%" rates. Visitors always use the left set. Tick the switch below to try the right set yourself on the Pets Refine page (and in your Dashboard, packs and budgets) without changing what visitors see; when you're happy, copy it over to visitors.</p>
      <label style="display:flex; align-items:center; gap:8px; font-size:13px; cursor:pointer; padding:10px 12px; border:1px solid ${st.testMode ? "#e0a030" : "var(--line)"}; border-radius:8px; max-width:520px;">
        <input type="checkbox" id="mTestMode" ${st.testMode ? "checked" : ""} />
        <span><b>Use my test rates on the site (only me)</b><br><span class="meta" style="font-size:11px;">${st.testMode ? "On: you see the test rates everywhere; visitors keep the published ones." : "Off: you see the same rates as visitors."}</span></span>
      </label>
    </div>
    <div style="display:flex; gap:16px; flex-wrap:wrap; align-items:stretch;">
      ${col("Visitors (published)", "published")}
      ${col("My test rates", "testRates")}
    </div>
    <div class="panel" style="margin-top:16px;">
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        <button class="btn small" id="mPublish" type="button">Copy my test rates \u2192 visitors</button>
        <button class="btn small ghost" id="mCopyDown" type="button">Copy visitors \u2192 my test rates</button>
        <button class="btn small ghost" id="mDefaults" type="button">Reset my test rates to the built-in defaults</button>
      </div>
      <p class="desc" style="margin-top:8px;">Grey/Green/Blue rates are an average over all stats; Purple/Orange/Red are per 1% of one stat. The Adjustment % on the Refine page is separate and per person.</p>
    </div>`;
  const read = (key) => { const out = {}; STAGES.forEach((sg) => { const v = Number(String(body.querySelector(`[data-mrate="${key}|${sg}"]`).value).replace(/[^0-9.]/g, "")); out[sg] = Number.isFinite(v) ? Math.max(0, v) : st[key][sg]; }); return out; };
  const persist = async () => {
    saveCalcState("pet_refine_marks", { adjust: st.adjust, packGems: st.packGems, testMode: st.testMode, testRates: st.testRates });
    PET_MARKS_STATE = null; PACK_PLAN_CACHE.clear(); budgetInvalidate();
  };
  body.querySelectorAll("[data-msave]").forEach((b) => b.addEventListener("click", async () => {
    const key = b.dataset.msave;
    try {
      if (key === "published") { await saveSiteConfig("pet_marks_rates", read("published")); toast("Visitors' rates saved"); }
      else { st.testRates = read("testRates"); await persist(); toast("Test rates saved"); }
      renderAdminMarksCalc(body);
    } catch (err) { toast("Couldn't save", true); }
  }));
  document.getElementById("mTestMode").addEventListener("change", async (e) => { st.testMode = e.target.checked; await persist(); renderAdminMarksCalc(body); });
  document.getElementById("mPublish").addEventListener("click", async () => {
    if (!confirm("Give visitors your test rates?")) return;
    st.testRates = read("testRates");
    await saveSiteConfig("pet_marks_rates", st.testRates); await persist(); toast("Published to visitors"); renderAdminMarksCalc(body);
  });
  document.getElementById("mCopyDown").addEventListener("click", async () => { st.testRates = read("published"); await persist(); renderAdminMarksCalc(body); });
  document.getElementById("mDefaults").addEventListener("click", async () => { st.testRates = { ...PET_MARKS_DEFAULT_RATES }; await persist(); renderAdminMarksCalc(body); });
}

// ---- Chief Gears group page (sub-tabs: Chief Gear / Chief Bonus) ----
async function renderAdminChiefGearsGroup(body) {
  const SUBTABS = { chiefgearprog: { label: "Chief Gear" }, chiefbonus: { label: "Chief Bonus" } };
  body.innerHTML = `
    <div class="adm-chips">
      <div class="adm-chips-row">
        ${Object.entries(SUBTABS)
          .map(([key, t]) => `<button class="adm-chip${key === ADMIN_ACTIVE_CHIEFGEARS_SUBTAB ? " on" : ""}" data-chiefgearssubtab="${key}">${esc(t.label)}</button>`)
          .join("")}
      </div>
    </div>
    <div id="adminChiefGearsGroupBody"></div>
  `;
  body.querySelectorAll("[data-chiefgearssubtab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      ADMIN_ACTIVE_CHIEFGEARS_SUBTAB = btn.dataset.chiefgearssubtab;
      renderAdminChiefGearsGroup(body);
    });
  });
  const sub = document.getElementById("adminChiefGearsGroupBody");
  if (ADMIN_ACTIVE_CHIEFGEARS_SUBTAB === "chiefgearprog") await renderAdminProgression(sub, ["Chief Gear"]);
  else {
    await renderAdminFlatLevels(sub, { table: "chief_gear_set_bonus", title: "Chief Gear set bonus (3-piece Defense / 6-piece Attack)", cols: [
      { key: "tier", label: "Tier", type: "text" },
      { key: "bonus_pct", label: "Bonus %", type: "number" },
      { key: "sort_order", label: "Order", type: "number" },
    ], orderCol: "sort_order", onSave: () => { CHIEF_GEAR_SET_BONUS_LOADED = false; } });
  }
}

// ---- Skins group page (sub-tabs: Collection Gallery / Tundra Album / Skin Gallery / Islands) ----
async function renderAdminSkinsGroup(body) {
  const SUBTABS = {
    gallery: { label: "Collection Gallery" },
    tundra: { label: "Tundra Album" },
    skingallery: { label: "Skin Gallery" },
    islands: { label: "Islands" },
  };
  body.innerHTML = `
    <div class="adm-chips">
      <div class="adm-chips-row">
        ${Object.entries(SUBTABS)
          .map(([key, t]) => `<button class="adm-chip${key === ADMIN_ACTIVE_SKINS_SUBTAB ? " on" : ""}" data-skinssubtab="${key}">${esc(t.label)}</button>`)
          .join("")}
      </div>
    </div>
    <div id="adminSkinsGroupBody"></div>
  `;
  body.querySelectorAll("[data-skinssubtab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      ADMIN_ACTIVE_SKINS_SUBTAB = btn.dataset.skinssubtab;
      renderAdminSkinsGroup(body);
    });
  });
  const sub = document.getElementById("adminSkinsGroupBody");
  if (ADMIN_ACTIVE_SKINS_SUBTAB === "gallery") {
    await renderAdminFlatLevels(sub, { table: "collection_gallery_levels", title: "Collection Gallery tiers", cols: [
      { key: "stat_type", label: "Stat", type: "text" },
      { key: "value_pct", label: "Value %", type: "number" },
      { key: "sort_order", label: "Order", type: "number" },
    ], orderCol: "sort_order" });
  } else if (ADMIN_ACTIVE_SKINS_SUBTAB === "tundra") {
    await renderAdminFlatLevels(sub, { table: "tundra_album_levels", title: "Tundra Album tiers", cols: [
      { key: "stat_type", label: "Stat", type: "text" },
      { key: "value_pct", label: "Value %", type: "number" },
      { key: "sort_order", label: "Order", type: "number" },
    ], orderCol: "sort_order" });
  } else if (ADMIN_ACTIVE_SKINS_SUBTAB === "skingallery") {
    await renderAdminSkinGallery(sub);
  } else {
    await renderAdminIslands(sub);
  }
}

// ---- Alliance group page (sub-tabs: Facility / Alliance Tech) ----
async function renderAdminAllianceGroup(body) {
  const SUBTABS = { facility: { label: "Facility" }, alliancetech: { label: "Alliance Tech" } };
  body.innerHTML = `
    <div class="adm-chips">
      <div class="adm-chips-row">
        ${Object.entries(SUBTABS)
          .map(([key, t]) => `<button class="adm-chip${key === ADMIN_ACTIVE_ALLIANCE_SUBTAB ? " on" : ""}" data-alliancesubtab="${key}">${esc(t.label)}</button>`)
          .join("")}
      </div>
    </div>
    <div id="adminAllianceGroupBody"></div>
  `;
  body.querySelectorAll("[data-alliancesubtab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      ADMIN_ACTIVE_ALLIANCE_SUBTAB = btn.dataset.alliancesubtab;
      renderAdminAllianceGroup(body);
    });
  });
  const sub = document.getElementById("adminAllianceGroupBody");
  if (ADMIN_ACTIVE_ALLIANCE_SUBTAB === "facility") await renderAdminSkinsCategory(sub, "Facility");
  else await renderAdminSkinsCategory(sub, "Alliance Tech");
}
