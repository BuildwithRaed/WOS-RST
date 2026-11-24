// WOS RST: Skin Gallery, Islands and Facility.
// Loaded by app.js the first time one of those pages opens (loadCode("gallery"),
// pageCodeReady), so visitors who never open them don't download it. A plain script:
// its functions and variables join app.js's. Only names used by these pages alone
// live here; anything another page (or admin.js / scan.js / the planner worker) uses
// stays in app.js. The site loads the packed copy gallery.min.js (tools/stamp.js).
window.GALLERY_BUILD = "28a7717641";

// The Islands page's "Scan Storehouse": the same Scan, island screens only; Save
// redraws the Islands page in place.
async function openIslandScan() {
  const bp = { ...((await loadCalcState("backpack").catch(() => null)) || {}) };
  // Redrawn once the Scan window has closed (and the page's scroll lock is off).
  const done = () => requestAnimationFrame(() => requestAnimationFrame(() => { if (TAB === "islandgallery") keepPlace(() => render()); }));
  return openBackpackScan(backpackItems(), bp, done, { island: true, heroes: [], canAdd: () => null, added: done });
}
let ISL_VIEW_DAYS = null;
// A pack used for Islands gives Mythic Island Shards (the trades above exist).
function islShardPacksOn() { return islShardTradesNow().length > 0; }
// The most shards the packs used for Islands can give by a day (days from today;
// default the planner's 3-year horizon): shards-only copies past that by the
// target date stay "can't be reached".
let ISL_SH_MAX = null;
function islShardSupplyMax(days) {
  const tabs = Array.isArray(PACK_TABLES_CACHE) ? PACK_TABLES_CACHE : null;
  if (!tabs) return 0;
  const d = Math.max(1, Number.isFinite(days) ? days : PACK_HORIZON_DAYS);
  if (!ISL_SH_MAX || ISL_SH_MAX.t !== tabs || ISL_SH_MAX.g !== PACK_GROUPS_GEN) {
    let groups = null;
    try { groups = packGroupsFor(tabs.filter((tb) => packTableServesPage(tb, "islands")), "islands"); } catch (e) { groups = null; }
    ISL_SH_MAX = { t: tabs, g: PACK_GROUPS_GEN, groups, by: {} };
  }
  if (ISL_SH_MAX.by[d] == null) { let n = 0; try { n = ISL_SH_MAX.groups ? Math.floor(Number(packMaxSupply(ISL_SH_MAX.groups, d)[ISL_SHARD_ITEM]) || 0) : 0; } catch (e) { n = 0; } ISL_SH_MAX.by[d] = n; }
  return ISL_SH_MAX.by[d];
}
// Free pack shards for Islands: shards in the Budgets plan's purchases that another
// page pays for (Islands' share of them is 0). { n, sig } from the last plan seen.
let ISL_FREE_SHARDS = null, ISL_FREE_LOADING = null;
function islFreeShardsOf(c) {
  if (!c || !c.chosen || !c.shares) return 0;
  const mine = (c.shares.islands && c.shares.islands.rows) || [];
  return (c.chosen.rows || []).reduce((a, r) => {
    const q = (Number((r.gives || {})[ISL_SHARD_ITEM]) || 0) * (r.count || 1);
    if (!(q > 0)) return a;
    const m = mine.find((x) => x.title === r.title && x.label === r.label);
    return a + (m ? 0 : q); // a step Islands pays part of is its own buy, not free
  }, 0);
}
// Reads the Budgets plan (the one on screen, else the suggestions' copy, worked out
// in the background when needed); calls `changed` once the number moves.
function islFreeShardsRefresh(changed) {
  const sel = BUDGET_SELECTED || {};
  if (!islShardPacksOn() || sel.islands === false || !BUDGET_TARGET) { if (ISL_FREE_SHARDS && ISL_FREE_SHARDS.n) { ISL_FREE_SHARDS = null; if (changed) changed(); } return; }
  const take = (c) => { const n = Math.floor(islFreeShardsOf(c)); const was = ISL_FREE_SHARDS ? ISL_FREE_SHARDS.n : 0; ISL_FREE_SHARDS = { n }; if (n !== was && changed) changed(); };
  const ready = BUDGET_DATA && BUDGET_DATA.combined && !BUDGET_DATA.combined.pending ? BUDGET_DATA.combined : PUR_GOAL_SRC && PUR_GOAL_SRC.combined;
  if (ready) { take(ready); return; }
  if (ISL_FREE_LOADING) return;
  ISL_FREE_LOADING = budgetSuggestedPlan().then(() => { const c = BUDGET_DATA && BUDGET_DATA.combined && !BUDGET_DATA.combined.pending ? BUDGET_DATA.combined : PUR_GOAL_SRC && PUR_GOAL_SRC.combined; if (c) take(c); }).catch(() => {}).finally(() => { ISL_FREE_LOADING = null; });
}
// The first day after `days` on which the shard packs give more shards (null = not within the horizon).
function islShardNextDay(days) {
  const base = islShardSupplyMax(days);
  let lo = Math.max(1, (Number(days) || 0) + 1), hi = PACK_HORIZON_DAYS;
  if (islShardSupplyMax(hi) <= base) return null;
  while (lo < hi) { const mid = Math.floor((lo + hi) / 2); if (islShardSupplyMax(mid) > base) hi = mid; else lo = mid + 1; }
  return lo;
}
async function setGalleryUncounted(id, uncounted) {
  id = String(id);
  if (uncounted) GALLERY_UNCOUNTED.add(id); else GALLERY_UNCOUNTED.delete(id);
  saveCalcState("gallery_uncounted", { ids: [...GALLERY_UNCOUNTED] });
}

// Wires the move buttons + desktop drag-and-drop between the two zones.
// onMove(id, toUncounted) persists and re-renders. cardSel = the picture tiles.
function wireGallerySplit(el, onMove, cardSel = ".gallery-card[data-gid]") {
  el.querySelectorAll("[data-move]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      onMove(btn.dataset.move, btn.dataset.down === "1");
    });
  });
  el.querySelectorAll(cardSel).forEach((card) => {
    card.setAttribute("draggable", "true");
    card.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", card.dataset.gid);
      e.dataTransfer.effectAllowed = "move";
      card.classList.add("dragging");
    });
    card.addEventListener("dragend", () => card.classList.remove("dragging"));
  });
  el.querySelectorAll("[data-zone]").forEach((zone) => {
    zone.addEventListener("dragover", (e) => { e.preventDefault(); zone.classList.add("drop-over"); });
    zone.addEventListener("dragleave", (e) => { if (!zone.contains(e.relatedTarget)) zone.classList.remove("drop-over"); });
    zone.addEventListener("drop", (e) => {
      e.preventDefault();
      zone.classList.remove("drop-over");
      const id = e.dataTransfer.getData("text/plain");
      if (!id) return;
      const toUncounted = zone.dataset.zone === "uncounted";
      if (GALLERY_UNCOUNTED.has(String(id)) === toUncounted) return;
      onMove(id, toUncounted);
    });
  });
}

let SKIN_FILTER = { search: "", category: "all", ownedFilter: "all" };

// ---- Skin Gallery A + Islands P2 ----
// Both pages: title with (i), an answer card (stats as 2 × 2 boxes with "+N left"),
// category chips with counts, All / Owned / Not owned + search, a 4-a-row picture
// grid (first GAL_FIRST, then "Show N more") and the dashed "Not counted in
// Dashboard" box (calc_state "gallery_uncounted", ↓ / ↑ in a picture's corner).
// Skin Gallery: one tap = owned ↔ not owned, with an Undo note. Islands: tap a
// picture or its level pill → a small pop-up there with 0 · − level + · Max.
const GAL_FIRST = 24;
const GAL_MORE = new Set(); // "<page>|<category>" opened with "Show N more", for the visit
const GAL_SEARCH_OPEN = {}; // page -> search row open, for the visit
const GAL_SEARCH_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21"/></svg>';
function galNum(v) { return String(Math.round(Number(v || 0) * 100) / 100); }
// "Attack" → ATK, "Infantry Defense" → "Infantry DEF".
function galStatShort(bt) {
  const s = String(bt || "");
  const st = /attack/i.test(s) ? "ATK" : /defen/i.test(s) ? "DEF" : /lethal/i.test(s) ? "LETH" : /health/i.test(s) ? "HP" : tStatLabel(s);
  const tr = /^infantry/i.test(s) ? "Infantry" : /^lancer/i.test(s) ? "Lancer" : /^marksm/i.test(s) ? "Marksman" : "";
  return tr ? `${troopDisplayName(tr)} ${st}` : st;
}
// Stat boxes of the answer card: label + amber "+N left" (green ✓ at max), the
// value big, "/ max" small, a bar along the bottom edge. list: [{ label, val, max }]
function galStatBoxesHtml(list) {
  // Planner stat style, in one row: label, value, "/ +max", a thin bar.
  return `<div class="plx-stats one hdr-st" style="--n:${list.length};">${list.map((s) => {
    const val = Number(s.val || 0), max = s.max == null ? null : Number(s.max);
    const pct = max > 0 ? Math.min(100, (val / max) * 100) : 0, done = max > 0 && max - val < 0.005;
    return `<div class="plx-stat"><span>${esc(s.label)}</span><b>${bidiNum(`+${galNum(val)}%`)}</b>${max != null ? `<small>${bidiNum(`/ +${galNum(max)}%`)}</small><div class="t12x-bar"><i style="width:${pct}%;${done ? " background:var(--good);" : ""}"></i></div>` : ""}</div>`;
  }).join("")}</div>`;
}
// All / Owned / Not owned + a search button that opens a search row.
function galToolsHtml(id, f, placeholder) {
  const open = !!(GAL_SEARCH_OPEN[id] || f.search);
  return `<div class="sg-tools"><span class="sg-menu" id="${id}MenuSlot"></span><div class="sg-seg" id="${id}OwnedSeg">${[["all", "all_label"], ["owned", "owned_label"], ["not", "not_owned_label"]].map(([k, l]) => `<button type="button" data-owned="${k}" class="${f.ownedFilter === k ? "on" : ""}" aria-pressed="${f.ownedFilter === k}">${esc(t(l))}</button>`).join("")}</div><button type="button" class="sg-ib${open ? " on" : ""}" id="${id}SearchBtn" aria-label="${esc(t("sg_search"))}" aria-expanded="${open}">${GAL_SEARCH_SVG}</button></div>
    <div class="sg-srch" id="${id}SearchRow"${open ? "" : " hidden"}><input id="${id}Search" type="search" autocomplete="off" placeholder="${esc(placeholder)}" value="${esc(f.search)}" /></div>`;
}
// The category switcher's menu button (with its list) sits first on the filter
// row (menu, All / Owned / Not owned and search on one row,
// the category chips scroll sideways under it).
function galMenuToTools(id, boxId) {
  const slot = document.getElementById(`${id}MenuSlot`), box = document.getElementById(boxId);
  const m = box && box.querySelector(".cat-switcher > div:first-child");
  if (slot && m) slot.replaceChildren(m);
}
function wireGalTools(id, f, onChange) {
  const seg = document.getElementById(`${id}OwnedSeg`), btn = document.getElementById(`${id}SearchBtn`);
  const row = document.getElementById(`${id}SearchRow`), inp = document.getElementById(`${id}Search`);
  seg.onclick = (e) => {
    const b = e.target.closest("[data-owned]");
    if (!b) return;
    f.ownedFilter = b.dataset.owned;
    seg.querySelectorAll("[data-owned]").forEach((x) => { x.classList.toggle("on", x === b); x.setAttribute("aria-pressed", String(x === b)); });
    onChange();
  };
  btn.onclick = () => {
    const open = row.hidden;
    row.hidden = !open;
    GAL_SEARCH_OPEN[id] = open;
    btn.classList.toggle("on", open);
    btn.setAttribute("aria-expanded", String(open));
    if (open) inp.focus();
    else if (f.search) { f.search = ""; inp.value = ""; onChange(); }
  };
  inp.oninput = () => { f.search = inp.value; onChange(); };
}
// One picture tile. o: { id, attr, cls, img, name, big, down, tick, pressed, extra }
function galTileHtml(o) {
  return `<div class="sg-t ${o.cls}" ${o.attr}="${esc(o.id)}" data-gid="${esc(o.id)}" role="button" tabindex="0"${o.pressed != null ? ` aria-pressed="${o.pressed}"` : ""} title="${esc(o.name)}">`
    + `<button type="button" class="sg-mv" data-move="${esc(o.id)}" data-down="${o.down ? 1 : 0}" title="${esc(t(o.down ? "move_to_uncounted" : "move_to_counted"))}" aria-label="${esc(t(o.down ? "move_to_uncounted" : "move_to_counted"))}">${o.down ? "&#8595;" : "&#8593;"}</button>`
    + (o.tick ? `<span class="sg-tick" aria-hidden="true">&#10003;</span>` : "")
    + `<span class="sg-pw${o.big ? " big" : ""}${o.pwExtra ? " has-x" : ""}">${o.img ? `<img src="${esc(o.img)}" alt="" loading="lazy" draggable="false" />` : `<span class="sg-ph">${esc(String(o.name || "?")[0])}</span>`}${o.pwExtra || ""}</span>`
    + `<span class="sg-nm">${esc(o.name)}</span>${o.extra || ""}</div>`;
}
// Counted grid (first GAL_FIRST unless `all`), "Show N more", then the dashed
// "Not counted in Dashboard" box. Zones carry data-zone for wireGallerySplit.
function galGridHtml({ counted, uncounted, all, tile, cat, ncDesc }) {
  const shown = all ? counted : counted.slice(0, GAL_FIRST), more = counted.length - shown.length;
  return `<div class="sg-grid" data-zone="counted">${shown.map((s) => tile(s, true)).join("")}</div>`
    + (more > 0 ? `<button type="button" class="sg-more" data-galmore>${esc(t("sg_show_more").replace("{n}", more))}</button>` : "")
    + `<div class="sg-nc"><div class="sg-k"><span>${esc(t("not_counted_divider"))}</span><span class="sg-kr">${esc(t("sg_nc_in").replace("{n}", uncounted.length).replace("{cat}", cat || ""))}</span></div>`
    + `<p>${esc(ncDesc)}</p><div class="sg-grid" data-zone="uncounted">${uncounted.length ? uncounted.map((s) => tile(s, false)).join("") : `<div class="sg-empty">${esc(t("sg_nc_empty"))}</div>`}</div></div>`;
}
// A short note at the bottom of the screen with Undo (gone after 5 s).
let GAL_TOAST_T = 0;
function galToast(html, onUndo) {
  let el = document.getElementById("sgToast");
  if (!el) {
    el = document.createElement("div");
    el.id = "sgToast";
    el.className = "sg-toast";
    el.setAttribute("role", "status");
    document.body.appendChild(el);
  }
  el.innerHTML = `<span class="sg-toast-m">${html}</span>${onUndo ? `<button type="button" class="sg-toast-u">${esc(t("sg_undo"))}</button>` : ""}`;
  el.classList.add("show");
  clearTimeout(GAL_TOAST_T);
  const hide = () => { clearTimeout(GAL_TOAST_T); el.classList.remove("show"); };
  GAL_TOAST_T = setTimeout(hide, 5000);
  const u = el.querySelector(".sg-toast-u");
  if (u) u.onclick = () => { hide(); onUndo(); };
}
function galToastHide() {
  const el = document.getElementById("sgToast");
  if (el) el.classList.remove("show");
}
// A short glow on the tile that was just changed.
function galFlash(root, id) {
  const el = root && root.querySelector(`.sg-t[data-gid="${window.CSS.escape(String(id))}"]`);
  if (!el) return;
  el.classList.add("flash");
  setTimeout(() => el.classList.remove("flash"), 700);
}
// Short form for the Skin Gallery row: "on now" when an event runs, else "next Dec 12" ("" = no date).
function shiningNextText(bare) {
  const sc = islShiningStarts(3), dur = Math.max(1, Number(ISL_RULES.shiningDays) || 5);
  if (!sc.known) return "";
  const today = packStartOfToday(), DAY = 86400000;
  if (sc.starts.some((d) => d <= today && d.getTime() + (dur - 1) * DAY >= today.getTime())) return t("sh_on_now");
  const nx = sc.starts.find((d) => d > today);
  if (!nx) return "";
  try { const ds = nx.toLocaleDateString(LANG === "en" ? undefined : LANG, { day: "numeric", month: "short", timeZone: "UTC" }); return bare ? ds : t("sh_next").replace("{date}", ds); } catch (e) { return ""; }
}
async function renderSkinGalleryMain() {
  const seq = RENDER_SEQ;
  const [ISLAND_CATEGORIES, , allSkinsRaw, galleryCats, shSaved, shBp] = await Promise.all([
    ensureIslandCategories(),
    ensureGalleryUncounted(),
    keptRows("skins", skinGalleryPath()),
    // The order set in Admin → Skins (drag the category chips).
    dashCached("gallery_cats", () => sb(`skin_page_categories?page=eq.gallery&select=category,sort_order&order=sort_order.asc`)).catch(() => []),
    IS_OWNER ? null : loadCalcState("shining_skins").catch(() => null),
    loadCalcState("backpack").catch(() => null),
    ensureBarHidden(),
  ]);
  const skins = allSkinsRaw.filter(
    (s) => !ISLAND_CATEGORIES.has(s.category) && s.category !== "Facility" && s.category !== "Alliance Tech"
  );
  const CATEGORY_ORDER = galleryCats && galleryCats.length ? galleryCats.map((c) => c.category) : ["City Skin", "Frame", "Teleport Skin", "Name Card", "Private Chat", "Chief Profile", "Rally"];
  const categories = [...new Set(skins.map((s) => s.category))].sort((a, b) => {
    const ia = CATEGORY_ORDER.indexOf(a);
    const ib = CATEGORY_ORDER.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });

  const globeLevelSaved = (await loadCalcState("skin_globe_level")) || { level: 0 };
  if (seq !== RENDER_SEQ) return;
  galToastHide();
  content.innerHTML = `
    <div class="page-head sg-head">
      <div>
        <h2>${esc(t("skin_gallery_title"))}</h2>
        <p class="desc">${esc(t("sg_desc"))}</p>
        <div class="sg-lg"><span>${esc(t("sg_lg_tap"))}</span><span style="color:var(--good)">${esc(t("sg_lg_owned"))}</span><span>${esc(t("sg_lg_faded"))}</span><span><i class="sg-mvk">&#8595;</i>${esc(t("sg_lg_move"))}</span></div>
      </div>
    </div>
    <div class="panel cg-ans sg-ans">
      <div class="sg-k"><span>${esc(t("troops_stats_title"))}</span><span class="sg-kr" id="skinSummaryLine"></span><button type="button" class="g1-fold g1-sq" data-g1fold="top:skingallery" aria-expanded="true"></button></div>
      <div id="skinTotals"></div>
      <div class="sg-fb">
        <button type="button" class="sg-rb" id="sgGlobeBtn" aria-haspopup="dialog"></button>
        <div class="shx" id="shSkins"></div>
      </div>
    </div>
    <div class="g1 isl-g1 sh-g1" id="shMkWrap" hidden><div class="t12x-card t12x-buy" id="shMkBuy"><div class="cg-sh-h"><b>${esc(t("pack_cost_title"))}</b>${closeXHtml("data-cgclose")}</div><div data-buybody id="shMkPacks"></div></div><div class="cg-bd" data-shbd hidden></div></div>
    ${galToolsHtml("skin", SKIN_FILTER, t("search_skins_placeholder"))}
    <div id="skinCatSwitcher" class="sg-cats"></div>
    <div id="skinSections"></div>
    <div class="modal-overlay sg-gl-ov" id="sgGlobeSheet" style="display:none;">
      <div class="modal-box sg-gl-box" role="dialog" aria-label="${esc(t("sg_globe_title"))}">
        <div class="sg-gl-h"><b>${esc(t("sg_globe_title"))}</b>${closeXHtml("data-glclose", "sg-x")}</div>
        <div class="sg-glv" id="sgGlobeLv"></div>
        <div id="globeInfo" class="globe-info"></div>
        <button type="button" class="btn sg-gl-done" data-glclose>${esc(t("sg_done"))}</button>
      </div>
    </div>
  `;

  // One Hide in the Troops Stats header (like Islands) folds only the
  // Shining City part; remembered in calc_state bar_hidden ("top:skingallery").
  g1FoldSync(content);

  // ---- Shining City skins: picked City Skins not owned yet, their Tomes and price ----
  let shList = shiningSkinsListOf(shSaved);
  const shTomeHave = () => shiningTomesIn(shBp);
  const shRows = () => shiningPicked(shList, skins).filter((s) => !s.owned);
  const shPriceLabel = () => (PACK_COST_SHOWN.shining_skins ? `\u2248 ${esc(PACK_COST_SHOWN.shining_skins)} &#8250;` : `${esc(t("pack_cost_title"))} &#8250;`);
  PACK_COST_HOOKS.shining_skins = () => document.querySelectorAll("[data-shprice]").forEach((el) => { el.innerHTML = shPriceLabel(); });
  let shSig = null;
  // The Pack cost card (design A) for the Tomes: worked out in the background so the
  // price shows on the total line; on phones it opens as a window from that button.
  function shPackCard() {
    const host = document.getElementById("shMkPacks"), wrap = document.getElementById("shMkWrap");
    if (!host) return;
    const need = shRows().length * shiningTomesPer(), have = shTomeHave(), sig = `${need}|${have}`;
    if (!need) { shSig = sig; host.innerHTML = ""; if (wrap) wrap.hidden = true; shPacksTo(false); packCostShown("shining_skins", null); return; }
    if (wrap) wrap.hidden = false;
    if (sig === shSig && host.innerHTML) return;
    shSig = sig;
    PACK_COST_OPEN.shining_skins = true;
    renderPackCostBlock(host, "shining_skins", [{ label: null, totals: { "Glorious Tome": need } }], { "Glorious Tome": have });
  }
  function shPacksTo(open) {
    const buy = document.getElementById("shMkBuy"), bd = document.querySelector("[data-shbd]");
    if (!buy) return;
    buy.classList.toggle("cg-open", !!open);
    buy.dataset.cgshow = open ? "packs" : "";
    if (bd) bd.hidden = !open;
    if (open) buy.scrollTop = 0;
  }
  {
    const w = document.getElementById("shMkWrap");
    if (w) w.onclick = (e) => { if (e.target.closest("[data-cgclose]") || e.target.closest("[data-shbd]")) shPacksTo(false); };
  }
  function drawShining() {
    const box = document.getElementById("shSkins");
    if (!box) return;
    const rows = shRows(), per = shiningTomesPer(), need = rows.length * per;
    // One gold-edged row; price = Pack cost. Skins are picked in each City Skin's pop-up. Nothing picked: a slim hint.
    if (!rows.length) { box.innerHTML = `<div class="s1b slim sh-hint"><span class="tx"><b>${esc(t("isl_sc_name"))}</b><em>${esc(t("sh_pick_hint"))}</em></span></div>`; shPackCard(); return; }
    const have = shTomeHave();
    const pic = (s) => `<span title="${esc(s.name)}">${s.image_url ? `<img class="sk" src="${esc(s.image_url)}" alt="" loading="lazy" />` : ""}<img class="tm" src="icons/glorious-tome.png" alt="" aria-hidden="true" /></span>`;
    const stack = `<span class="stk">${rows.slice(0, 4).map(pic).join("")}${rows.length > 4 ? `<span class="more">+${rows.length - 4}</span>` : ""}</span>`;
    const price = have >= need ? `<span class="shb ok">${esc(t("sh_have"))}</span>` : `<button type="button" class="shb" data-shpc data-shprice>${shPriceLabel()}</button>`;
    const when = shiningNextText(true);
    // Layout S1 (owner, 10 Nov 2026): picture stack left, "N skins · date" / "X Tomes", price right.
    box.innerHTML = `<div class="s1 sh-np" aria-label="${esc(t("sh_title"))}">${stack}<span class="tx"><b><span>${esc(t(rows.length === 1 ? "sh_n1" : "sh_n").replace("{n}", rows.length))}</span>${when ? `<span class="d">\u00b7 ${esc(when)}</span>` : ""}</b><em>${esc(t("sh_tomes").replace("{n}", need.toLocaleString()))}</em></span>${price}</div>`;
    shPackCard();
  }
  document.getElementById("shSkins").onclick = (e) => {
    if (e.target.closest("[data-shpc]")) {
      if (window.matchMedia("(max-width: 900px)").matches) shPacksTo(true);
      else { const c = document.getElementById("shMkBuy"); if (c) c.scrollIntoView({ behavior: "smooth", block: "start" }); }
    }
  };
  // The Shining City Pack's dates come with the pack list (loaded once, then redrawn).
  if (!ISL_PACKS) islLoadPacks().then(() => { if (seq === RENDER_SEQ) drawShining(); });
  // Shining City picks, one skin at a time (from the City Skin pop-up). Saves exactly what the
  // old pick sheet saved: owner → site_config shining_skins (everyone's first choice), visitor →
  // calc_state shining_skins { list } (starting from the owner's picks).
  function shPickSet(name, on) {
    const out = on ? [...shList.filter((n) => n !== name && shiningPickable(n)), name] : shList.filter((n) => n !== name && shiningPickable(n));
    if (JSON.stringify(out) === JSON.stringify(shList)) return;
    const prev = shList;
    shList = out;
    budgetInvalidate();
    computeAndRender();
    if (IS_OWNER) {
      if (!SITE_CONFIG) SITE_CONFIG = {};
      SITE_CONFIG.shining_skins = out; // shown at once (Budgets reads it too)
      saveSiteConfig("shining_skins", out).catch(() => { shList = prev; SITE_CONFIG.shining_skins = prev; budgetInvalidate(); toast("Couldn't save", true); if (document.getElementById("shSkins")) computeAndRender(); });
    }
    else saveCalcState("shining_skins", { list: out });
  }
  // City Skins (owner, 19 Nov 2026): a tap opens a small pop-up next to the skin with an
  // "Owned" switch (the same save and Undo note as one tap) and a "Shining City" switch
  // (picked for the Shining City event). Other categories keep one tap = owned.
  function skinPopOpen(id) {
    if (SK_POP) { const same = SK_POP.id === String(id); SK_POP.close(); if (same) return; }
    const sections = document.getElementById("skinSections"), tileOf = () => sections && sections.querySelector(`[data-skin="${window.CSS.escape(String(id))}"]`);
    const s = skins.find((x) => String(x.id) === String(id));
    if (!tileOf() || !s) return;
    const pop = document.createElement("div");
    pop.className = "sg-pop sk-pop";
    pop.setAttribute("role", "dialog");
    pop.setAttribute("aria-label", s.name);
    const draw = () => {
      const per = shiningTomesPer(), canSh = shiningPickable(s.name), on = shList.includes(s.name), bonus = skinBonusText(s);
      const shRow = canSh ? `<label class="skp-r${s.owned ? " off" : ""}"><span class="skp-i" aria-hidden="true"><img src="icons/glorious-tome.png" alt="" /></span><span class="skp-tx"><b>${esc(t("isl_sc_name"))}</b><small>${esc(s.owned ? t("skp_sh_owned") : t(on ? "skp_sh_on" : "skp_sh_off").replace("{n}", per.toLocaleString()))}</small></span><input type="checkbox" class="bset-sw" data-skpsh${on && !s.owned ? " checked" : ""}${s.owned ? " disabled" : ""} /></label>` : "";
      pop.innerHTML = `<span class="sg-pop-ar"></span><div class="skp-h">${s.image_url ? `<img src="${esc(s.image_url)}" alt="" />` : ""}<span class="skp-t"><b>${esc(s.name)}</b><small>${esc(s.category)}</small>${bonus ? `<em>${esc(bonus)}</em>` : ""}</span>${closeXHtml("data-skpx")}</div>
        <label class="skp-r"><span class="skp-i ok" aria-hidden="true">&#10003;</span><span class="skp-tx"><b>${esc(t("skp_owned"))}</b><small>${esc(t(s.owned ? "skp_owned_on" : "skp_owned_off"))}</small></span><input type="checkbox" class="bset-sw" data-skpown${s.owned ? " checked" : ""} /></label>${shRow}`;
    };
    const place = () => {
      const tileEl = tileOf();
      if (!pop.isConnected || !tileEl) return;
      pop.style.width = `${Math.min(330, sections.getBoundingClientRect().width)}px`;
      tileEl.classList.add("sel");
      placePop(pop, tileEl, { align: "center", gap: 8, away: () => { if (SK_POP && SK_POP.id === String(s.id)) SK_POP.close(); }, onPlace: ({ up, left, width }) => {
        pop.classList.toggle("up", up);
        const tr = tileEl.getBoundingClientRect();
        pop.querySelector(".sg-pop-ar").style.left = `${Math.max(10, Math.min(width - 24, tr.left + tr.width / 2 - left - 7))}px`;
      } });
    };
    pop.onclick = (e) => { if (e.target.closest("[data-skpx]")) SK_POP.close(); };
    pop.onchange = (e) => {
      if (e.target.matches("[data-skpown]")) toggleSkin(s.id);
      else if (e.target.matches("[data-skpsh]")) shPickSet(s.name, e.target.checked);
    };
    content.appendChild(pop);
    SK_POP = { id: String(s.id), place, refresh: () => { draw(); place(); }, close: () => { popForget(pop); pop.remove(); const te = tileOf(); if (te) te.classList.remove("sel"); if (SK_POP && SK_POP.id === String(s.id)) SK_POP = null; } };
    draw();
    place();
  }

  if (SKIN_FILTER.category === "all" || !categories.includes(SKIN_FILTER.category)) {
    SKIN_FILTER.category = categories[0] || "all";
  }
  function onSkinCatSelect(cat) {
    SKIN_FILTER.category = cat;
    computeAndRender();
  }

  // Each Globe Level's City Skin and extra skins (Admin → Globe Level).
  const namesForGlobeLevel = namesForGlobeLevelGlobal;
  // Every skin tied to the Globe Level selector, across all levels. These are
  // excluded from totals entirely until a globe level is picked, and only the
  // currently selected level's items count afterward (not a theoretical ceiling).
  const ALL_GLOBE_WIRED_NAMES = ALL_GLOBE_WIRED_NAMES_GLOBAL;
  // Regardless of the dropdown, if the user has manually toggled one or more
  // City Skin cards of a level owned directly, the HIGHEST owned level is what
  // actually counts toward current/max - not necessarily the dropdown value.
  function deriveEffectiveGlobeLevel() {
    return globeHighestOwnedLevel(skins) || globeLevelSaved.level;
  }
  // Every stat a skin gives, from its own bonuses ("+2% ATK").
  const skinBonusText = (sk, sign = "+") => (sk ? [["bonus_type", "bonus_value"], ["bonus_type2", "bonus_value2"], ["bonus_type3", "bonus_value3"], ["bonus_type4", "bonus_value4"]]
    .filter(([, v]) => sk[v] != null && Number(sk[v])).map(([k, v]) => `${sign}${galNum(sk[v])}% ${galStatShort(sk[k])}`).join(", ") : "");
  // The Globe Level picker (in a sheet opened from the answer card's Globe row):
  // the same rules as the old dropdown.
  async function setGlobeLevel(level) {
    const prevLevel = globeLevelSaved.level;
    saveCalcState("skin_globe_level", { level });
    globeLevelSaved.level = level;

    const changed = [];
    // Shown at once and saved in the background, all at the same time
    // (they used to be saved one after another before anything updated);
    // a skin whose save fails is put back.
    const setOwned = (matchingSkin, name, owned, label) => {
      matchingSkin.owned = owned;
      changed.push(label);
      patchSkinQueued(matchingSkin.id, { owned }).catch(() => {
        if (matchingSkin.owned === owned) { matchingSkin.owned = !owned; computeAndRender(); }
        toast(`Couldn't update ${name}`, true);
      });
    };
    // Un-own whatever the previous level auto-owned.
    if (prevLevel !== level) {
      for (const name of namesForGlobeLevel(prevLevel)) {
        const matchingSkin = skins.find((s) => s.name === name);
        if (matchingSkin && matchingSkin.owned) setOwned(matchingSkin, name, false, `-${name}`);
      }
    }
    // Own whatever the new level auto-owns.
    for (const name of namesForGlobeLevel(level)) {
      const matchingSkin = skins.find((s) => s.name === name);
      if (matchingSkin && !matchingSkin.owned) setOwned(matchingSkin, name, true, name);
    }
    if (changed.length) toast(`Updated: ${changed.join(", ")}`);
    computeAndRender();
  }
  const globeSheet = document.getElementById("sgGlobeSheet");
  function drawGlobeLevels() {
    // The level that counts (an owned Frost Sphere above the saved level wins).
    const cur = Number(deriveEffectiveGlobeLevel()) || 0;
    document.getElementById("sgGlobeLv").innerHTML = [{ level: 0 }, ...GLOBE_LEVELS].map((r) => `<button type="button" data-sglv="${r.level}" class="${r.level ? "" : "w"}${cur === r.level ? " on" : ""}" aria-pressed="${cur === r.level}">${r.level ? r.level : esc(t("no_globe"))}</button>`).join("");
  }
  globeSheet.onclick = (e) => {
    if (e.target === globeSheet || e.target.closest("[data-glclose]")) { globeSheet.style.display = "none"; return; }
    const b = e.target.closest("[data-sglv]");
    if (b) setGlobeLevel(Number(b.dataset.sglv));
  };
  document.getElementById("sgGlobeBtn").onclick = () => { drawGlobeLevels(); drawGlobeInfo(); globeSheet.style.display = "flex"; };

  // What the Globe Level gives (owner picked the message of mock-up A, 20 Oct
  // 2026), now inside the Globe Level sheet; "i" folds every level's skins.
  let globeInfoOpen = true;
  function drawGlobeInfo() {
    const box = document.getElementById("globeInfo");
    if (!box) return;
    const short = (bt) => (/attack/i.test(bt) ? "ATK" : /defen/i.test(bt) ? "DEF" : /lethal/i.test(bt) ? "LETH" : /health/i.test(bt) ? "HP" : tStatLabel(bt || ""));
    // Every stat a skin gives, from its own bonuses ("+2.5% LETH").
    const bonusOf = (n) => { const sk = skins.find((x) => x.name === n); if (!sk) return ""; return [["bonus_type", "bonus_value"], ["bonus_type2", "bonus_value2"], ["bonus_type3", "bonus_value3"], ["bonus_type4", "bonus_value4"]].filter(([, v]) => sk[v] != null).map(([k, v]) => `+${Number(sk[v])}% ${short(sk[k])}`).join(", "); };
    const catOf = (n) => { const sk = skins.find((x) => x.name === n); return sk && sk.category ? sk.category : ""; };
    const lv = deriveEffectiveGlobeLevel(), top = GLOBE_LEVELS.length ? GLOBE_LEVELS[GLOBE_LEVELS.length - 1] : null;
    const row = GLOBE_LEVELS.find((r) => r.level === lv);
    const hl = (x) => `<b class="gi-b">${esc(x)}</b>`;
    const named = (n) => hl(bonusOf(n) ? `${n} (${bonusOf(n)})` : n);
    let msg;
    if (!row) msg = esc(t("globe_msg_none")).replace("{max}", top && bonusOf(top.city) ? esc(t("globe_msg_upto")).replace("{max}", hl(bonusOf(top.city))) : "");
    else {
      msg = esc(t("globe_msg_lv")).replace("{n}", lv).replace("{city}", named(row.city))
        .replace("{extra}", row.extra.length ? esc(t("globe_msg_and")).replace("{names}", row.extra.map(named).join(", ")) : "");
      const above = GLOBE_LEVELS.filter((r) => r.level > lv).map((r) => r.level);
      msg += " " + (above.length ? esc(t("globe_msg_more")).replace("{levels}", above.length > 1 ? `${above[0]}–${above[above.length - 1]}` : String(above[0])) : esc(t("globe_msg_top")));
    }
    const extraLine = (n) => `<div class="gi-ex">+ ${esc(n)} <span class="meta">${catOf(n) ? `(${esc(catOf(n))})` : ""}${bonusOf(n) ? ` · ${esc(bonusOf(n))}` : ""}</span></div>`;
    const list = globeInfoOpen ? `<div class="gi-list">${GLOBE_LEVELS.map((r) => `<div class="gi-row${r.level === lv ? " on" : ""}"><b>Lv ${r.level}</b><span>${esc(r.city)}${bonusOf(r.city) ? ` <span class="meta">${esc(bonusOf(r.city))}</span>` : ""}${r.extra.map(extraLine).join("")}</span></div>`).join("")}<div class="meta gi-note">${esc(t("globe_msg_note"))}</div></div>` : "";
    box.innerHTML = `<div class="gi-line"><span>${msg}</span><button type="button" class="gi-i" data-globeinfo aria-expanded="${globeInfoOpen}" aria-label="${esc(t("set_info"))}">i</button></div>${list}`;
    box.querySelector("[data-globeinfo]").onclick = () => { globeInfoOpen = !globeInfoOpen; drawGlobeInfo(); };
  }
  // The Globe row in the answer card: picture, "Globe Level 3", what it counts.
  function drawGlobeRow() {
    const b = document.getElementById("sgGlobeBtn");
    if (!b) return;
    const lv = deriveEffectiveGlobeLevel(), row = GLOBE_LEVELS.find((r) => r.level === lv);
    const picName = row ? row.city : (GLOBE_LEVELS[0] && GLOBE_LEVELS[0].city);
    const pic = skins.find((x) => x.name === picName);
    const part = (n) => { const bo = skinBonusText(skins.find((x) => x.name === n)); return bo ? `${n} ${bo}` : n; };
    b.innerHTML = `<span class="sg-rb-p">${pic && pic.image_url ? `<img src="${esc(pic.image_url)}" alt="" />` : "&#127760;"}</span>`
      + `<span class="sg-rb-tx"><b>${esc(row ? t("sg_globe_lv").replace("{n}", lv) : t("sg_globe_none"))}</b><span>${esc(row ? [row.city, ...row.extra].map(part).join(" · ") : t("sg_globe_pick"))}</span></span><span class="sg-rb-ch" aria-hidden="true">&#8250;</span>`;
    if (globeSheet.style.display !== "none") drawGlobeLevels();
  }
  // One tap = owned ↔ not owned. Shown at once; put back if the save fails.
  function setSkinOwned(skin, owned) {
    skin.owned = owned;
    if (shList.includes(skin.name)) budgetInvalidate();
    computeAndRender();
    galFlash(document.getElementById("skinSections"), skin.id);
    patchSkinQueued(skin.id, { owned }).catch(() => {
      if (skin.owned === owned) { skin.owned = !owned; computeAndRender(); }
      toast("Couldn't update skin", true);
    });
  }
  // City Skins that can be picked for Shining City open the pop-up (Owned + Shining City); Globe
  // Level skins, skins outside the Admin allow list and every other category: one tap = owned.
  function skinTap(id) {
    const s = skins.find((x) => String(x.id) === String(id));
    if (s && s.category === SHINING_SKIN_CAT && shiningPickable(s.name)) skinPopOpen(id); else toggleSkin(id);
  }
  function toggleSkin(id) {
    const skin = skins.find((s) => String(s.id) === String(id));
    if (!skin) return;
    const owned = !skin.owned;
    setSkinOwned(skin, owned);
    // The bonus in the note only when the skin counts on this page.
    const counts = !GALLERY_UNCOUNTED.has(String(skin.id)) && !ALL_GLOBE_WIRED_NAMES.has(skin.name);
    const bo = counts ? skinBonusText(skin, owned ? "+" : "−") : "";
    galToast(`${owned ? `<b class="ok">&#10003;</b>` : `<b class="no">&#9675;</b>`} ${esc(t(owned ? "sg_toast_own" : "sg_toast_unown").replace("{name}", skin.name))}${bo ? ` · ${esc(bo)}` : ""}`, () => setSkinOwned(skin, !owned));
  }
  function computeAndRender() {
    if (!document.getElementById("skinSections")) return;
    drawGlobeInfo();
    drawGlobeRow();
    drawShining();
    const filtered = skins.filter((s) => {
      if (SKIN_FILTER.category !== "all" && s.category !== SKIN_FILTER.category) return false;
      if (SKIN_FILTER.ownedFilter === "owned" && !s.owned) return false;
      if (SKIN_FILTER.ownedFilter === "not" && s.owned) return false;
      if (SKIN_FILTER.search && !s.name.toLowerCase().includes(SKIN_FILTER.search.toLowerCase())) return false;
      return true;
    });

    const ownedCount = skins.filter((s) => s.owned).length;
    document.getElementById("skinSummaryLine").innerHTML = esc(t("sg_owned_of")).replace("{n}", `<b>${ownedCount}</b>`).replace("{total}", skins.length);
    // Category chips with "owned / all" in each.
    renderCategorySwitcher(document.getElementById("skinCatSwitcher"), categories.map((c) => {
      const inCat = skins.filter((s) => s.category === c);
      return { key: c, label: c, count: `${inCat.filter((s) => s.owned).length}/${inCat.length}` };
    }), SKIN_FILTER.category, onSkinCatSelect);
    galMenuToTools("skin", "skinCatSwitcher");

    // totals by bonus_type: current (owned only) vs max (everything, as if fully owned).
    // Skins sharing a display_group (e.g. Frost Sphere I-VI) are mutually
    // exclusive tiers of the same item, so max only counts the single
    // highest tier per group/stat, not the sum of every tier.
    const STAT_SLOTS = [
      ["bonus_type", "bonus_value"],
      ["bonus_type2", "bonus_value2"],
      ["bonus_type3", "bonus_value3"],
      ["bonus_type4", "bonus_value4"],
    ];
    const totalsByType = {};
    const maxByType = {};
    const maxByGroupType = {}; // { "Frost Sphere|Troops Attack": highestValueSoFar }
    const currentGlobeNames = new Set(namesForGlobeLevel(deriveEffectiveGlobeLevel()));
    for (const s of skins) {
      // Globe-wired skins (Frost Sphere tiers + per-level extras) don't count
      // toward totals at all until a globe level is picked, and only the
      // currently selected level's items count afterward - not every tier.
      if (ALL_GLOBE_WIRED_NAMES.has(s.name) && !currentGlobeNames.has(s.name)) continue;
      if (GALLERY_UNCOUNTED.has(String(s.id))) continue;
      const includeInMax = true;
      STAT_SLOTS.forEach(([tk, vk]) => {
        if (s[vk] == null) return;
        const key = bonusStatKey(s[tk]) || "Other";
        const val = Number(s[vk]);
        if (includeInMax) {
          if (s.display_group) {
            const groupKey = `${s.display_group}|${key}`;
            const prevMax = maxByGroupType[groupKey] || 0;
            if (val > prevMax) {
              maxByType[key] = (maxByType[key] || 0) - prevMax + val;
              maxByGroupType[groupKey] = val;
            }
          } else {
            maxByType[key] = (maxByType[key] || 0) + val;
          }
        }
        if (s.owned) totalsByType[key] = (totalsByType[key] || 0) + val;
      });
    }
    const STAT_ORDER = ["Attack", "Defense", "Lethality", "Health"];
    function statOrderIndex(label) {
      const bare = label.replace(/^Troops?\s+/i, "");
      return STAT_ORDER.indexOf(bare);
    }
    const totalEntries = Object.entries(maxByType).sort((a, b) => {
      const ia = statOrderIndex(a[0]);
      const ib = statOrderIndex(b[0]);
      if (ia === -1 && ib === -1) return a[0].localeCompare(b[0]);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
    const STAT_ABBR = { Attack: "ATK", Defense: "DEF", Lethality: "LETH", Health: "HP" };
    document.getElementById("skinTotals").innerHTML = totalEntries.length
      ? galStatBoxesHtml(totalEntries.map(([type, maxVal]) => {
          const bare = type.replace(/^Troops?\s+/i, "");
          return { label: STAT_ABBR[bare] || tStatLabel(type), val: totalsByType[type] || 0, max: maxVal };
        }))
      : `${galStatBoxesHtml([{ label: t("total_bonus"), val: 0 }])}<div class="meta" style="font-size:11px; margin-top:6px;">${esc(t("mark_skins_owned_hint"))}</div>`;

    const sections = document.getElementById("skinSections");
    // filtered is already scoped to the one selected category (plus search/
    // owned filters), so this renders a single flat grid.
    if (!filtered.length) {
      sections.innerHTML = `<div class="panel"><div class="empty"><div class="big">${esc(t("no_skins_match_filters"))}</div></div></div>`;
      return;
    }
    const moreKey = `skin|${SKIN_FILTER.category}`;
    const shPickedIds = new Set(shiningPicked(shList, skins).map((x) => String(x.id)));
    const tile = (s, down) => galTileHtml({
      id: s.id, attr: "data-skin", cls: s.owned ? "yes" : "no", img: s.image_url, name: s.name,
      big: GALLERY_BIG_THUMB.has(s.category), down, tick: false, pressed: !!s.owned,
      // Picked for the Shining City event: a small tome on the picture.
      pwExtra: shPickedIds.has(String(s.id)) ? `<span class="isl-mkc" title="${esc(t("sh_title"))}"><img src="icons/glorious-tome.png" alt="" aria-hidden="true" /></span>` : "",
    });
    sections.innerHTML = galGridHtml({
      counted: filtered.filter((s) => !GALLERY_UNCOUNTED.has(String(s.id))),
      uncounted: filtered.filter((s) => GALLERY_UNCOUNTED.has(String(s.id))),
      all: GAL_MORE.has(moreKey) || !!SKIN_FILTER.search, tile, cat: SKIN_FILTER.category, ncDesc: t("sg_nc_desc"),
    });
    wireGallerySplit(sections, async (id, toUncounted) => {
      await setGalleryUncounted(id, toUncounted);
      computeAndRender();
    }, ".sg-t[data-gid]");
    sections.onclick = (e) => {
      if (e.target.closest("[data-galmore]")) { GAL_MORE.add(moreKey); computeAndRender(); return; }
      const el = e.target.closest("[data-skin]");
      if (el && !e.target.closest("[data-move]")) skinTap(el.dataset.skin);
    };
    sections.onkeydown = (e) => {
      if ((e.key === "Enter" || e.key === " ") && e.target.matches("[data-skin]")) { e.preventDefault(); skinTap(e.target.dataset.skin); }
    };
    if (SK_POP) { if (sections.querySelector(`[data-skin="${window.CSS.escape(SK_POP.id)}"]`)) SK_POP.refresh(); else SK_POP.close(); }
  }

  wireGalTools("skin", SKIN_FILTER, computeAndRender);
  computeAndRender();
}
let ISLAND_FILTER = { search: "", bonusType: "all", ownedFilter: "all" };
const islLightUnlockMarks = (s) => Math.max(0, Number(ISL_LIGHT_UNLOCK[s && s.name]) || 0);
// Each lighthouse's levels, shared with Scan (Storehouse → Accessory): calc_state island_shards.light =
// { skinId: { now: 0..10 (0 = not unlocked), to: 0..10 } }. "now" is also written to the skin's level.
const islLightRec = (id) => { const l = ISL_SHARDS && ISL_SHARDS.light; const r = l && typeof l === "object" ? l[id] : null; return r && typeof r === "object" ? r : null; };
const ISL_COLLECT_H = 12; // income counts collecting every 12 hours
function islSave() { const rest = { ...ISL_SHARDS }; delete rest.essence; delete rest.shards; saveCalcState("island_shards", rest); }
// 6500 → "6.5K", 12000 → "12K" (Islands tile lines).
const islK = (n) => (n >= 1000 ? `${Math.round(n / 100) / 10}K` : String(n));
// Copies from level `from` to `to`; with lv1 the first copy (Lv 1) counts too (event buildings).
function islCopiesBetween(from, to, each = 0, lv1 = true) {
  let c = lv1 && from < 1 && to >= 1 ? 1 : 0;
  for (let l = Math.max(2, from + 1); l <= to; l++) c += islCopiesAt(l, each);
  return c;
}
// Island shops (owner, 9 Nov 2026): the Mark of Revival shop and the Shining City shop each
// sell copies of some Mythic shard buildings. site_config island_shops =
// { mark: [names], shining: [names], allow: { mark, shining } }
// = the owner's default for everyone (`allow`: which buildings get the pop-up switch, missing =
// every pickable one). Each person can keep their own lists in calc_state island_shards.shops
// (kept when the owner changes the default); no own list = the default. Missing mark default =
// the buildings with the old "Also in the Mark of Revival shop" switch on in island_sources.
const ISL_SHOPS = ["mark", "shining"];
const ISL_SHOP_ICON = { mark: "icons/mark-of-revival.png", shining: "icons/glorious-tome.png" };
function islUnitPrices() {
  if (ISL_UNIT && ISL_UNIT._t === PACK_TABLES_CACHE && ISL_UNIT._c === DISPLAY_CURRENCY) return Promise.resolve(ISL_UNIT);
  if (!ISL_UNIT_LOADING) {
    ISL_UNIT_LOADING = ensurePackTables().then((tables) => {
      const best = { mark: null, tome: null }, items = { mark: "Mark of Revival", tome: "Glorious Tome" };
      (tables || []).filter((tb) => packTableServesPage(tb, "islands")).forEach((tb) => {
        const link = packLinkFor(tb.id);
        packOffersFor(tb).forEach((o) => {
          const p = packConvert(o.price, link.currency).n;
          Object.entries(items).forEach(([k, n]) => { const q = Number(o.gives[n]) || 0; if (q > 0 && p > 0 && (best[k] == null || p / q < best[k])) best[k] = p / q; });
        });
      });
      best._t = tables; best._c = DISPLAY_CURRENCY;
      ISL_UNIT = best;
      return best;
    }).catch(() => ({ mark: null, tome: null })).finally(() => { ISL_UNIT_LOADING = null; });
  }
  return ISL_UNIT_LOADING;
}
const ISL_EV_WEEKS4 = 28; // own dates repeat every 4 weeks; also the no-dates fallback
// Next event of an event / ranked building: { off (days from today), every, known }.
// No dates set = every N days from today (the first copies after one cycle).
function islNextEvent(src) {
  // A game event: its real starts, as on the Pack calendar and the Dashboard.
  if (src.dates === "cal") {
    const g = islFindEvent(src.ev);
    if (g && packParseDay(gameEventAnchor(g))) {
      const today = packStartOfToday();
      // A league running now counts too: event copies come now, ranked ones on its last day.
      const st = gameEventStarts(g, today, new Date(today.getTime() + (g.every * 2 + 7) * 86400000))[0];
      if (st) {
        const len = Math.max(1, Number(g.days) || 1), end = new Date(st.getTime() + (len - 1) * 86400000);
        const off = st >= today ? Math.round((st - today) / 86400000) : src.kind === "ranked" ? Math.round((end - today) / 86400000) : 0;
        return { off, every: g.every, known: true, weeks4: g.every === 28, evName: g.name, running: st < today };
      }
    }
  }
  if (src.dates === "pack" && src.pack && ISL_PACKS && ISL_PACK_TABLES && ISL_PACK_TABLES.some((tb) => String(tb.id) === src.pack)) {
    const l = packLinkFor(src.pack);
    const offs = typeof l.reset === "number" ? packResetOffsets(l.reset, l.resetDay, 800, l.window) : [];
    const off = offs.find((o) => o >= 0);
    if (off != null) return { off, every: l.reset, known: true, monthly: l.reset === 30 };
  }
  // Own dates: the picked day, then every 4 weeks (like SvS on the calendar).
  if (src.dates === "own" && src.next) {
    const a = packParseDay(src.next), today = packStartOfToday(), every = ISL_EV_WEEKS4;
    if (a) { let off = Math.round((a - today) / 86400000); if (off < 0) off += Math.ceil(-off / every) * every; return { off, every, known: true, weeks4: true }; }
  }
  return { off: ISL_EV_WEEKS4, every: ISL_EV_WEEKS4, known: false };
}
const islDateShort = (d) => d.toLocaleDateString(LANG === "en" ? undefined : LANG, { month: "short", day: "numeric", timeZone: "UTC" });
// Timbermill workers: both Lumber Camps at the top level, else 0 (not built yet).
function islMillWorkers(st) {
  const top = ISL_CAMP.length - 1;
  if (!(st.camp1 >= top && st.camp2 >= top)) return 0;
  return (ISL_CAMP[st.camp1] ? ISL_CAMP[st.camp1].workers : 0) + (ISL_CAMP[st.camp2] ? ISL_CAMP[st.camp2].workers : 0);
}
// Life Essence a day: each building fills up to what it holds between collections.
function islIncome(st) {
  const h = ISL_COLLECT_H, n = 24 / h;
  const rate = Number(ISL_TREE[Math.max(0, Math.min(ISL_TREE.length - 1, st.tree || 0))]) || 0;
  const tree = Math.min(Number(ISL_RULES.treeCap) || Infinity, rate * h) * n;
  const w = islMillWorkers(st);
  const mill = Math.min(Number(ISL_RULES.millCap) || Infinity, (Number(ISL_RULES.millHour) || 0) * w * h) * n;
  const ally = Math.max(0, Math.min(Number(ISL_RULES.allyMax) || 0, st.ally || 0)) * (Number(ISL_RULES.allyEach) || 0);
  return { h, tree, mill, ally, workers: w, total: tree + mill + ally };
}
const islEssenceDay = (st) => islIncome(st).total;
// Free General Accessory Construction Contracts (owner, 16 Nov 2026): ISL_RULES.ctWeek a week, and
// ISL_RULES.ctEvent from each KOI and SvS (the minimum rewards) whose start falls within the days.
function islFreeContracts(days) {
  if (!(days > 0)) return 0;
  const today = packStartOfToday(), end = new Date(today.getTime() + days * 86400000);
  let ev = 0;
  (GAME_EVENTS || []).filter((g) => g.key === "svs" || g.key === "koi").forEach((g) => { try { ev += gameEventStarts(g, new Date(today.getTime() + 86400000), end).length; } catch (e) {} });
  return Math.floor(days / 7) * (Number(ISL_RULES.ctWeek) || 0) + ev * (Number(ISL_RULES.ctEvent) || 0);
}
// Days until free contracts alone cover n (null past 3 years or with no free income).
function islFreeContractsDays(n, max = 1095) {
  if (!(n > 0)) return 0;
  for (let d = 7; d <= max; d += 7) if (islFreeContracts(d) >= n) { for (let e = d - 6; e <= d; e++) if (islFreeContracts(e) >= n) return e; return d; }
  return null;
}
// Shards a day the income buys, held to the shop's weekly limit.
function islShardsDay(st) {
  const lim = Number(ISL_RULES.shopWeek) || 0;
  const d = islEssenceDay(st) / islEssencePerShard();
  return lim > 0 ? Math.min(d, lim / 7) : d;
}
const islHave = (st) => (st.shards || 0) + (st.essence || 0) / islEssencePerShard();
const islOne = (v) => (v >= 10 ? Math.round(v).toLocaleString() : (Math.round(v * 10) / 10).toLocaleString());
function islIncomeSheet(onChange) {
  const st = ISL_SHARDS;
  let m = document.getElementById("islIncSheet");
  if (!m) { m = document.createElement("div"); m.id = "islIncSheet"; m.className = "modal-overlay adm-sheet-wrap gs-wrap isl-ov"; document.body.appendChild(m); }
  const campTop = ISL_CAMP.length - 1;
  const step = (k, label, sub, lo, hi) => `<div class="r"><span>${esc(label)}${sub ? `<small>${esc(sub)}</small>` : ""}</span><span class="isl-st"><button type="button" data-islst="${k}|-1" ${st[k] <= lo ? "disabled" : ""} aria-label="&#8722;">&#8722;</button><span>${st[k]}</span><button type="button" data-islst="${k}|1" ${st[k] >= hi ? "disabled" : ""} aria-label="+">+</button></span></div>`;
  const campSel = (k, label) => `<div class="r"><span>${esc(label)}</span><select class="keep-w isl-ssel" data-islsel="${k}">${ISL_CAMP.map((c, i) => (c ? `<option value="${i}"${Number(st[k]) === i ? " selected" : ""}>${esc(t("sg_lv").replace("{n}", i))}</option>` : "")).join("")}</select></div>`;
  const draw = () => {
    const inc = islIncome(st), sd = islShardsDay(st), e = inc.total;
    m.innerHTML = `<div class="modal-box adm-sheet gs-box isl-sh" role="dialog" aria-modal="true" aria-label="${esc(t("isl_inc_title"))}"><div class="gs-head"><b style="flex:1;">${esc(t("isl_inc_title"))}</b>${closeXHtml("data-islx")}</div>
      ${step("tree", t("isl_tree"), t("isl_tree_d").replace("{n}", (Number(ISL_RULES.treeCap) || 0).toLocaleString()), 1, ISL_TREE.length - 1)}
      ${campSel("camp1", t("isl_camp1"))}${campSel("camp2", t("isl_camp2"))}
      <div class="r"><span>${esc(t("isl_mill"))}<small>${esc(inc.workers ? t("isl_mill_d").replace("{w}", inc.workers).replace("{n}", (Number(ISL_RULES.millHour) || 0).toLocaleString()).replace("{cap}", (Number(ISL_RULES.millCap) || 0).toLocaleString()) : t("isl_mill_none").replace("{n}", campTop))}</small></span><b class="isl-mw">${inc.workers ? esc(t("isl_workers_n").replace("{n}", inc.workers)) : "&mdash;"}</b></div>
      ${step("ally", t("isl_ally"), t("isl_ally_d").replace("{n}", (Number(ISL_RULES.allyEach) || 0).toLocaleString()), 0, Number(ISL_RULES.allyMax) || 0)}
      <table class="isl-tb"><tr><th></th><th>${esc(t("isl_day"))}</th><th>${esc(t("isl_week"))}</th><th>${esc(t("isl_month"))}</th></tr>
      <tr><td>${esc(t("isl_essence"))}</td><td>${bidiNum(Math.round(e).toLocaleString())}</td><td>${bidiNum(Math.round(e * 7).toLocaleString())}</td><td>${bidiNum(Math.round(e * 30).toLocaleString())}</td></tr>
      <tr><td>${esc(t("isl_island_shards"))}</td><td>${bidiNum(islOne(sd))}</td><td>${bidiNum(islOne(sd * 7))}</td><td>${bidiNum(islOne(sd * 30))}</td></tr></table>
      <div class="isl-split">${esc(t("isl_tip_12h"))}</div>
      <button type="button" class="btn isl-done" data-islx>${esc(t("isl_done"))}</button></div>`;
  };
  const close = () => { m.style.display = "none"; onChange(); };
  m.onclick = (ev) => {
    if (ev.target === m || ev.target.closest("[data-islx]")) { close(); return; }
    const b = ev.target.closest("[data-islst]");
    if (!b || b.disabled) return;
    const [k, d] = b.dataset.islst.split("|");
    st[k] = Math.max(0, (Number(st[k]) || 0) + Number(d));
    islSave();
    draw();
  };
  m.onchange = (ev) => {
    const sel = ev.target.closest("[data-islsel]");
    if (!sel) return;
    st[sel.dataset.islsel] = Number(sel.value);
    islSave();
    draw();
  };
  m.onkeydown = (ev) => { if (ev.key === "Escape") { ev.stopPropagation(); close(); } };
  draw();
  m.style.display = "flex";
}
async function renderIslandGalleryMain() {
  const seq = RENDER_SEQ;
  ISL_POP = null;
  // The ordered category list is kept for the visit (dashCached), so a
  // repeat visit only has to load the islands themselves.
  const [islandCats, , islSaved, islBp0] = await Promise.all([
    islandCatRows(),
    ensureGalleryUncounted(),
    loadCalcState("island_shards"),
    loadCalcState("backpack").catch(() => null),
    ensureBarHidden(),
  ]);
  if (seq !== RENDER_SEQ) return;
  let islBp = islBp0;
  // Glorious Tomes in the Backpack + Lucky Glorious Tome Chests at their average (owner: counted).
  const tomeHave = () => { const b = islBp || {}; return (Number(b["Glorious Tome"]) || 0) + (Number(b["Lucky Glorious Tome Chest"]) || 0) * (Number(chestGives("Lucky Glorious Tome Chest")["Glorious Tome"]) || 0); };
  ISL_SHARDS = { ...islDefault(), ...(islSaved && typeof islSaved === "object" ? islSaved : {}) };
  // The Budgets target date: Mark shop buildings use free shards first and Marks only for
  // the copies the shards can't bring by that date.
  if (BUDGET_TARGET === undefined) { const sv = await loadCalcState("pack_target_budgets").catch(() => null); if (seq !== RENDER_SEQ) return; if (BUDGET_TARGET === undefined) BUDGET_TARGET = (sv && sv.date) || ""; }
  if (!BUDGET_SELECTED) { const ss = await loadCalcState("budget_selected").catch(() => null); if (seq !== RENDER_SEQ) return; if (!BUDGET_SELECTED) BUDGET_SELECTED = ss || {}; }
  // Like every planner page: the page (and its Pack cost) plans by the Pack cost window's own
  // target row; Budgets' need by the Budgets target. The Budgets tick only decides whether
  // Islands counts in Budgets. No date = every target as soon as packs allow: only what you
  // have now is free, the rest is bought (shop copies, Tomes over the coming events, shards
  // from shard packs over the planner's horizon).
  if (PACK_TARGET_CACHE.islands === undefined) { const pt = await loadCalcState("pack_target_islands").catch(() => null); if (seq !== RENDER_SEQ) return; if (PACK_TARGET_CACHE.islands === undefined) PACK_TARGET_CACHE.islands = (pt && typeof pt.date === "string") ? pt.date : ""; }
  const islTgt = (forBud) => (forBud ? BUDGET_TARGET : PACK_TARGET_CACHE.islands) || "";
  // Event dates from a Packs-page pack: the pack list loads in the background
  // (always for the owner, who picks packs), then the page redraws with the dates.
  if (!ISL_PACKS) { // also gives the Shining City Pack's dates (islShiningStarts)
    islLoadPacks().then(() => { if (seq === RENDER_SEQ && document.getElementById("islandSections") && !ISL_POP) keepPlace(() => computeAndRender()); });
  }
  if (!ISL_SHARDS.targets || typeof ISL_SHARDS.targets !== "object") ISL_SHARDS.targets = {};
  if (!ISL_SHARDS.store || typeof ISL_SHARDS.store !== "object") ISL_SHARDS.store = {};
  if (!ISL_SHARDS.light || typeof ISL_SHARDS.light !== "object") ISL_SHARDS.light = {};
  ["every", "shop", "mill", "workers"].forEach((k) => { delete ISL_SHARDS[k]; }); // settings no longer used
  // Life Essence and Mythic Island Shards live in the Backpack (shared with the Backpack
  // page); amounts typed here before are moved there once.
  {
    const bp = { ...(islBp || {}) }, old = islSaved && typeof islSaved === "object" ? islSaved : {};
    let moved = false;
    [["essence", "Life Essence"], ["shards", "Mythic Island Shards"]].forEach(([k, n]) => {
      if (!(n in bp) && Number(old[k]) > 0) { bp[n] = Math.floor(Number(old[k])); moved = true; }
      ISL_SHARDS[k] = Number(bp[n]) || 0;
    });
    if (moved) { islBp = bp; saveCalcState("backpack", bp); islSave(); }
  }
  const catList = islandCats.length ? islandCats.map((c) => c.category) : ["Island"];
  const islands = await keptRows("skins",
    `skins?user_id=eq.${USER_ID}&category=in.(${catList.map((c) => encodeURIComponent(c)).join(",")})&select=id,category,name,image_url,bonus_type,bonus_value,bonus_level1,bonus_type2,bonus_value2,bonus_level2,bonus_type3,bonus_value3,bonus_level3,bonus_type4,bonus_value4,bonus_level4,display_group,owned,current_level,max_level&order=sort_order.asc`
  );
  // A lighthouse level saved in island_shards.light (e.g. by Scan) that the skin doesn't have yet
  // goes to the skin too, so the stats here and on the Dashboard follow it.
  islands.filter(islIsLight).forEach((s) => {
    const r = islLightRec(s.id), n = r && r.now != null && r.now !== "" ? Math.max(0, Math.min(Number(s.max_level ?? 10) || 10, Math.floor(Number(r.now)))) : null;
    const cur = s.owned ? Number(s.current_level) || 0 : 0;
    if (n == null || !Number.isFinite(n) || n === cur) return;
    const patch = { current_level: n, ...(!!s.owned !== n > 0 ? { owned: n > 0 } : {}) };
    Object.assign(s, patch);
    patchSkinQueued(s.id, patch).catch(() => {});
  });
  const TROOPS = ["Infantry", "Lancers", "Marksman"];
  const RAW_STATS = ["Attack", "Defense", "Lethality", "Health"];
  const STAT_SLOTS = [
    ["bonus_type", "bonus_value", "bonus_level1"],
    ["bonus_type2", "bonus_value2", "bonus_level2"],
    ["bonus_type3", "bonus_value3", "bonus_level3"],
    ["bonus_type4", "bonus_value4", "bonus_level4"],
  ];
  // Group by the same categories Admin uses (Attack / Defense / Lighthouse /
  // MVP / Islands Guide), in the same order, so this page and the Islands
  // admin tab always show buildings identically.
  const BONUS_ORDER = catList;

  function groupsFor(s) {
    return [s.category || "Other"];
  }

  const bonusTypes = [...new Set(islands.flatMap(groupsFor))].sort((a, b) => {
    const ia = BONUS_ORDER.indexOf(a);
    const ib = BONUS_ORDER.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });

  if (seq !== RENDER_SEQ) return;
  galToastHide();
  content.innerHTML = `
    <div class="page-head sg-head isl-head">
      <div>
        <h2>${esc(t("islandgallery_title"))}</h2>
        <p class="desc">${esc(t("isl_desc"))}</p>
        <div class="sg-lg"><span>${esc(t("isl_lg_tap"))}</span><span>${esc(t("isl_lg_faded"))}</span><span class="g">${esc(t("isl_lg_max"))}</span><span><i class="sg-mvk">&#8595;</i>${esc(t("sg_lg_move"))}</span></div>
      </div>
      ${visitorCan("islandscan") ? `<button type="button" class="cg-bpbtn isl-scanb isl-scant hd-btn" data-islscan title="${esc(t("scan_isl_btn"))}">&#128247; <span class="isl-scanw">${esc(t("scan_isl_btn"))}</span><span class="isl-scann">${esc(t("scan_short"))}</span></button>` : ""}
    </div>
    <div class="panel cg-ans sg-ans">
      <div class="sg-k"><span>${esc(t("troops_stats_title"))}</span><span class="sg-kr" id="islandSummaryLine"></span></div>
      <div id="islandTroopTotals"></div>
      <div id="islandShardPlan"></div>
    </div>
    <div class="g1 isl-g1" id="islMkWrap" hidden><div class="t12x-card t12x-buy" id="islMkBuy"><div class="cg-sh-h"><b data-cgbuyt>${esc(t("pack_cost_title"))}</b>${closeXHtml("data-cgclose")}</div><div data-buybody id="islMkPacks"></div></div><div class="cg-bd" data-islbd hidden></div></div>
    ${galToolsHtml("island", ISLAND_FILTER, t("search_islands_placeholder"))}
    <div id="islandCatSwitcher" class="sg-cats"></div>
    <div class="isl-lsth" id="islTargetAll"></div>
    <div id="islandSections" class="sg-isl"></div>
  `;
  { const sb = content.querySelector(".isl-head [data-islscan]"); if (sb) sb.onclick = () => openIslandScan(); }
  // One Hide in the Troops Stats header (like Heroes Gears' top card) folds the
  // Shards plan and its Backpack; remembered in calc_state bar_hidden ("top:islandgallery").
  g1FoldSync(content);
  ensureBarHidden().then(() => { if (seq === RENDER_SEQ) g1FoldSync(content); });

  if (ISLAND_FILTER.bonusType === "all" || !bonusTypes.includes(ISLAND_FILTER.bonusType)) {
    ISLAND_FILTER.bonusType = bonusTypes[0] || "all";
  }
  function onIslandCatSelect(cat) {
    ISLAND_FILTER.bonusType = cat;
    if (ISL_POP) ISL_POP.close(true);
    computeAndRender();
  }

  // A level shown / set here: not owned counts as 0 (as in the totals).
  const maxOf = (s) => s.max_level ?? 10;
  const lvOf = (s) => (s.owned ? (s.current_level ?? 0) : 0);
  const built = (s) => lvOf(s) > 0;
  // Each bonus at a level: [{ type, val, max }].
  const bonusAt = (s, lv) => STAT_SLOTS.filter(([tk, vk]) => s[tk] && s[vk] != null).map(([tk, vk, lk]) => {
    const full = Number(s[vk]), mx = maxOf(s), unlock = s[lk];
    const val = !lv || !mx ? 0 : unlock != null ? (lv >= unlock ? full : 0) : (full * lv) / mx;
    return { type: s[tk], val, max: full };
  });
  const bonusText = (s, lv) => bonusAt(s, lv).map((b) => `+${galNum(b.val)}% / ${galNum(b.max)}% ${galStatShort(b.type)}`).join(" · ");
  const pillHtml = (s) => {
    const lv = lvOf(s), mx = maxOf(s);
    if (!lv) return esc(t("sg_not_built"));
    if (lv >= mx) return esc(t("sg_max"));
    return `${esc(t("sg_lv").replace("{n}", lv))}<small>/ ${mx}</small>`;
  };
  const tileCls = (s) => `is${built(s) ? "" : " l0"}${lvOf(s) >= maxOf(s) ? " mx" : ""}`;
  // Shards plan: a target per building of the category (missing = max, never below
  // now / Lv 1). Buildings with a shop price are bought in Life Essence; other Mythic
  // "shop" buildings with shards; event / ranked from their events.
  const tracked = (s) => islCatTracked(s.category) && !ISL_SKIP_NAMES.includes(s.name);
  // The Life Essence shop sells only Islands Guide buildings (owner, 9 Nov 2026).
  const srcOf = (s) => { const src = islSource(s.name, islIsMythic(s)); return s.category === ISL_SHOP_CAT || !src.price ? src : { ...src, price: 0 }; };
  // Lighthouses can stay at 0 (not unlocked): their target may be 0 too; missing = max like the others.
  const tgtLo = (s) => (islIsLight(s) ? lvOf(s) : Math.max(1, lvOf(s)));
  const tgtOf = (s) => {
    const mx = maxOf(s), lo = tgtLo(s);
    const raw = islIsLight(s) ? (islLightRec(s.id) || {}).to : ISL_SHARDS.targets[s.id], v = Number(raw);
    const ok = islIsLight(s) ? raw != null && raw !== "" && Number.isFinite(v) && v >= 0 : Number.isFinite(v) && v > 0;
    return Math.max(lo, Math.min(mx, ok ? v : mx));
  };
  const setTgt = (s, v) => {
    const to = Math.max(tgtLo(s), Math.min(maxOf(s), v));
    if (islIsLight(s)) ISL_SHARDS.light = { ...ISL_SHARDS.light, [s.id]: { now: lvOf(s), ...(islLightRec(s.id) || {}), to } };
    else ISL_SHARDS.targets[s.id] = to;
  };
  const usesEssence = (s) => tracked(s) && srcOf(s).kind === "shop" && srcOf(s).price > 0;
  const usesShards = (s) => tracked(s) && srcOf(s).kind === "shop" && !srcOf(s).price;
  // Also in the Mark of Revival shop (an extra way to buy copies; free shards first).
  const usesMarks = (s) => usesShards(s) && islShopPickable(s) && !!srcOf(s).marks;
  // Also in the Shining City shop (Glorious Tomes, monthly Shining City Pack event).
  const usesTomes = (s) => usesShards(s) && islShopPickable(s) && !!srcOf(s).shining;
  // A coin / tome on the picture of buildings sold in the Mark of Revival / Shining City shop.
  const MK_COIN = '<img src="icons/mark-of-revival.png" alt="" aria-hidden="true">';
  const TM_ICON = '<img src="icons/glorious-tome.png" alt="" aria-hidden="true">';
  const coinHtml = (s) => (!tracked(s) ? "" : (usesMarks(s) ? `<span class="isl-mkc" title="${esc(t("isl_mk_chip"))}">${MK_COIN}</span>` : "") + (usesTomes(s) ? `<span class="isl-mkc tm${usesMarks(s) ? " two" : ""}" title="${esc(t("isl_sc_chip"))}">${TM_ICON}</span>` : ""));
  // Storehouse: spare Lv 1 copies the person already has, 1 copy each toward that building.
  const hasPlan = (s) => tracked(s) && srcOf(s).kind !== "none";
  const storeOf = (s) => Math.max(0, Math.floor(Number((ISL_SHARDS.store || {})[s.id]) || 0));
  // Shard buildings get Lv 1 elsewhere; shop / event buildings count that copy too.
  const copiesOf = (s) => { const src = srcOf(s); return islCopiesBetween(lvOf(s), tgtOf(s), src.each, !(src.kind === "shop" && !src.price)); };
  const copiesLeft = (s) => Math.max(0, copiesOf(s) - storeOf(s));
  const perCopy = () => Number(ISL_RULES.perCopy) || 0;
  // One plan for the whole page (owner, 9 Nov 2026): every tracked building of every category
  // to its target. Free first, then only what must be bought: by the target date the free pot
  // (shards and Life Essence you have + income up to then, in shards) pays first the buildings
  // nothing can buy (Life Essence shop copies and shards-only buildings), then the Mark of
  // Revival shop buildings; their copies still missing by the date become Marks (at most the
  // shop's limit). Whatever is left beyond the pot can't be reached by the date. No target
  // (or Islands unticked in Budgets) = everything on free shards, Marks only optional.
  // Shards from packs (Myriad Bazaar steps) the Budgets plan already buys for other
  // pages: free, added to the pot by the target date (only with Islands ticked in
  // Budgets, a pack used for Islands giving shards and that plan worked out).
  // sharedPlan(true) = with them (what the page shows); sharedPlan() / (false) =
  // without (the needs sent to Pack cost / Budgets: the planner itself spends those
  // free shards first, so the two agree).
  const freeShards = (days) => (days != null && islShardPacksOn() ? Math.max(0, Math.floor(Number((ISL_FREE_SHARDS || {}).n) || 0)) : 0);
  const SPC = {};
  let spSig = null;
  // forBud: true = by the Budgets target (Budgets' need); a number = by that many days from
  // today (Pack cost's Cheapest tries dates); else by the page's own target date, or (no date)
  // by the date of the Pack cost plan picked on screen (ISL_VIEW_DAYS), or as soon as packs allow.
  const modeKey = (m) => (m === true ? "b" : typeof m === "number" ? `d${m}` : "p");
  const sharedPlan = (withFree, forBud) => {
    if (forBud === undefined && withFree === true && !PACK_TARGET_CACHE.islands && ISL_VIEW_DAYS != null) forBud = ISL_VIEW_DAYS;
    const num = typeof forBud === "number";
    const tg = num ? "" : islTgt(forBud), tDay0 = num ? islDay(forBud) : tg ? packParseDay(packValidDay(tg)) : null, tDay = tDay0 || packStartOfToday();
    const days = Math.max(0, Math.round((tDay - packStartOfToday()) / 86400000));
    // What packs / events can bring: by the date, or with no date within the planner's horizon.
    const capDays = tDay0 ? days : PACK_HORIZON_DAYS, capDay = tDay0 ? tDay : islDay(PACK_HORIZON_DAYS);
    const F = withFree && forBud !== true ? freeShards(days) : 0, shOn = islShardPacksOn();
    const sk = `${F > 0 ? 1 : 0}${modeKey(forBud)}`;
    const slot = SPC[sk] || (SPC[sk] = { sig: null, P: null });
    const sig = `${F}|${shOn ? islShardSupplyMax() : "-"}|${days}|${tDay0 ? 1 : 0}|${JSON.stringify(ISL_SHARDS)}|${JSON.stringify(siteConfig("island_sources", {}) || {})}|${JSON.stringify(islShopsCfg())}|${tomeHave()}|${ISL_UNIT ? `${ISL_UNIT.mark}/${ISL_UNIT.tome}` : ""}|${(islShiningStarts(2).starts[0] || "").toString()}|${islands.map((x) => `${x.id}:${lvOf(x)}:${x.owned ? 1 : 0}`).join(",")}`;
    if (spSig === null) Object.values(SPC).forEach((x) => { x.P = null; });
    spSig = "set";
    if (sig === slot.sig && slot.P) return slot.P;
    slot.sig = sig;
    const pc = perCopy(), eps = ePS(), rate = islShardsDay(ISL_SHARDS), have = islHave(ISL_SHARDS);
    // Free pack shards pay copies first (shards-only buildings, then the shop ones).
    let fLeft = F;
    const fromFree = new Map();
    const takeFree = (x, left) => { if (!(fLeft > 0) || !(pc > 0) || !left) return 0; const n = Math.min(left, Math.floor(fLeft / pc + 1e-9)); if (n > 0) { fLeft -= n * pc; fromFree.set(x.id, n); } return n; };
    const shOnly = (x) => usesShards(x) && !usesMarks(x) && !usesTomes(x);
    let cantSh = 0;
    const pot = days == null ? Infinity : have + rate * days;
    const finDay = (c) => (c <= have + 1e-9 ? 0 : rate > 0 ? Math.ceil((c - have) / rate) : null);
    const all = islands.filter(tracked);
    const fin = new Map(), mk = new Map();
    let cum = 0, cant = 0;
    // 1) Buildings nothing can buy: Life Essence shop copies (price ÷ essence a shard) and shards-only.
    all.filter((x) => usesEssence(x) || (usesShards(x) && !usesMarks(x))).forEach((x) => {
      const left0 = copiesLeft(x), per = usesEssence(x) ? srcOf(x).price / eps : pc;
      if (!left0) return;
      const left = left0 - (days != null && shOnly(x) ? takeFree(x, left0) : 0);
      const room = Math.max(0, pot - cum), ok = per > 0 ? Math.min(left, Math.floor(room / per + 1e-9)) : left;
      cant += left - ok;
      if (shOnly(x)) cantSh += left - ok;
      cum += left * per;
      fin.set(x.id, finDay(cum));
    });
    // 2) Shop buildings (Mark of Revival / Shining City): free shards that are left, then the
    // cheaper shop per copy (store price of a Mark / a Tome from the Islands packs), each up to
    // its limit: Marks = the shop's total limit, Tomes = `tomeMax` copies an event that starts
    // by the target date (no known event date = none).
    const unit = ISL_UNIT || {}, tp = Number(ISL_RULES.tomePrice) || 600, tMax = Number(ISL_RULES.tomeMax) || 3;
    const sc = islShiningStarts();
    const nEv = sc.known ? sc.starts.filter((d) => d <= capDay).length : 0;
    const cost = (k, x) => (k === "mk" ? srcOf(x).markPrice * (unit.mark != null ? unit.mark : Infinity) : tp * (unit.tome != null ? unit.tome : Infinity));
    const tm = new Map();
    let evUsed = 0;
    all.filter((x) => usesMarks(x) || usesTomes(x)).forEach((x) => {
      const left0 = copiesLeft(x);
      if (!left0) return;
      const left = left0 - (days != null ? takeFree(x, left0) : 0);
      const room = Math.max(0, pot - cum), free = days == null ? left : pc > 0 ? Math.min(left, Math.floor(room / pc + 1e-9)) : left;
      let rest = left - free;
      const opts = [];
      if (usesMarks(x)) opts.push(["mk", srcOf(x).markLimit]);
      if (usesTomes(x)) opts.push(["tm", nEv * tMax]);
      opts.sort((a, b) => { const ca = cost(a[0], x), cb = cost(b[0], x); return ca === cb ? (a[0] === "mk" ? -1 : 1) : ca - cb; });
      opts.forEach(([k, cap]) => { const n = Math.max(0, Math.min(rest, cap)); if (n > 0) (k === "mk" ? mk : tm).set(x.id, n); rest -= n; });
      if (tm.get(x.id)) evUsed = Math.max(evUsed, Math.ceil(tm.get(x.id) / tMax));
      cant += rest;
      cum += (free + rest) * pc;
      fin.set(x.id, free + rest ? finDay(cum) : 0);
    });
    const marks = [...mk].reduce((a, [id, n]) => { const x = all.find((y) => String(y.id) === String(id)); return a + n * (x ? srcOf(x).markPrice : 0); }, 0);
    const mkCopiesAll = [...mk.values()].reduce((a, n) => a + n, 0);
    // Tomes: the free +tomeFreeDay of each event day's first buy is counted by the packs
    // planner (Pack cost / Budgets, packDayBonusList), not here.
    const tmCopiesAll = [...tm.values()].reduce((a, n) => a + n, 0);
    const tomes = tmCopiesAll * tp;
    // Shards-only copies still short by the date: a shards need for the packs (only when a
    // pack used for Islands gives shards; else they stay "can't be reached").
    const shNeed = shOn && days != null && pc > 0 ? Math.min(cantSh, Math.floor(Math.max(0, islShardSupplyMax(capDays) - F) / pc)) * pc : 0;
    const P = { days, tDay, noDate: !tDay0, capDays, capDay, pot, need: cum, fin, mk, marks, mkCopiesAll, tm, tmCopiesAll, tomes, evUsed, nEv, sc, cant, done: finDay(cum), cantDone: finDay(cum), cantSh, shNeed, free: F - fLeft, fromFree };
    slot.P = P;
    return P;
  };
  const mkAlloc = () => sharedPlan(true).mk;
  // Lighthouses (outside the shards plan): Blueprints → General Accessory Construction Contracts,
  // the Backpack's Contracts shared over them in page order. Unlocking (Lv 1) is paid with Life
  // Essence only when the free Life Essence left after every other building's plan covers it
  // (free first: in hand, plus the income up to the target date when there is one), else with
  // its Contracts like the other levels.
  const contractHave = () => Number((islBp || {})[ISL_CONTRACT]) || 0;
  let lpSig = null;
  const LPC = {};
  const lightPlan = (forBud) => {
    const P = sharedPlan(false, forBud), list = islands.filter(islIsLight), free = P.days != null ? islFreeContracts(P.days) : 0, have = contractHave() + free;
    const c = LPC[modeKey(forBud)] || (LPC[modeKey(forBud)] = { sig: null, P: null });
    const sig = `${SPC[`0${modeKey(forBud)}`].sig}|${JSON.stringify(ISL_LIGHT)}|${JSON.stringify(ISL_LIGHT_UNLOCK)}|${have}|${list.map((x) => `${x.id}:${lvOf(x)}:${tgtOf(x)}`).join(",")}`;
    if (sig === c.sig && c.P) { if (forBud === undefined || forBud === false) lpSig = sig; return c.P; }
    c.sig = sig;
    let spare = Math.max(0, ((P.days == null ? islHave(ISL_SHARDS) : P.pot) - P.need) * ePS());
    const per = new Map();
    let bp = 0, ct = 0, ess = 0, mkAll = 0;
    list.forEach((x) => {
      const from = lvOf(x), to = tgtOf(x), u = Number((ISL_LIGHT[0] || {}).ess) || 0;
      // Unlocked with Marks (Mark of Revival shop): Lv 1 costs only those Marks.
      const mku = from < 1 && to >= 1 ? islLightUnlockMarks(x) : 0;
      const useEss = !mku && from < 1 && to >= 1 && u > 0 && spare >= u;
      if (useEss) spare -= u;
      const c = islLightCost(mku ? 1 : from, to, useEss);
      const before = Math.max(0, ct - have);
      bp += c.bp; ct += c.ct; ess += c.ess; mkAll += mku;
      per.set(x.id, { ...c, mk: mku, short: Math.max(0, ct - have) - before });
    });
    c.P = { per, bp, ct, ess, mk: mkAll, have, free, short: Math.max(0, ct - have) };
    if (forBud === undefined || forBud === false) lpSig = sig;
    return c.P;
  };
  const lightOf = (s) => lightPlan().per.get(s.id) || { bp: 0, ct: 0, ess: 0, mk: 0, short: 0 };
  // Option C (owner, 16 Nov 2026): when each lighthouse level comes with free Contracts only
  // (no spending). Levels are done cheapest first over all lighthouses, paid from the Backpack's
  // Contracts, then from the weekly / KOI / SvS ones. { id: [{ lv, day | null }] } (null = over 20 years).
  let lfSig = null, LF = null;
  const lightFree = () => {
    const sig = `${lightPlan() && lpSig}|${contractHave()}|${ISL_RULES.ctWeek}|${ISL_RULES.ctEvent}`;
    if (sig === lfSig && LF) return LF;
    lfSig = sig;
    const steps = [];
    islands.filter(islIsLight).forEach((x) => { for (let L = lvOf(x) + 1; L <= tgtOf(x); L++) { if (L === 1 && islLightUnlockMarks(x)) continue; steps.push({ id: x.id, lv: L, ct: islLightCost(L - 1, L).ct }); } });
    steps.sort((a, b) => a.ct - b.ct || a.lv - b.lv);
    const out = new Map(), have = contractHave();
    let cum = 0;
    steps.forEach((st) => { cum += st.ct; const d = islFreeContractsDays(cum - have, 7300); if (!out.has(st.id)) out.set(st.id, []); out.get(st.id).push({ lv: st.lv, day: d }); });
    out.forEach((a) => a.sort((p, q) => p.lv - q.lv));
    LF = out;
    return LF;
  };
  const freeMon = (d) => (d == null ? t("isl_free_never") : islDay(d).toLocaleDateString(undefined, { month: "short", year: "numeric", timeZone: "UTC" }));
  const freeLast = (s) => { const a = lightFree().get(s.id); return a && a.length ? a[a.length - 1].day : 0; };
  // Contracts to buy (Pack cost): the shortfall, unless Islands is unticked in Budgets.
  const lightBuy = () => Math.max(0, lightPlan().ct - lightPlan().free);
  const CT_ICON = BP_EXTRA_ICONS[ISL_CONTRACT];
  const ctImg = `<img class="isl-im sq" src="${CT_ICON}" alt="" aria-hidden="true">`, bpImg = '<img class="isl-im sq" src="icons/lighthouse-blueprint.png" alt="" aria-hidden="true">';
  const mkCopies = (s) => (usesMarks(s) ? mkAlloc().get(s.id) || 0 : 0);
  const marksOf = (s) => mkCopies(s) * (usesMarks(s) ? srcOf(s).markPrice : 0);
  const tmCopies = (s) => (usesTomes(s) ? sharedPlan(true).tm.get(s.id) || 0 : 0);
  const tomesOf = (s) => tmCopies(s) * (Number(ISL_RULES.tomePrice) || 600);
  const needOf = (s) => (usesShards(s) ? Math.max(0, copiesLeft(s) - mkCopies(s) - tmCopies(s) - (sharedPlan(true).fromFree.get(s.id) || 0)) * perCopy() : 0);
  // Pop-up line under the shards: the copies Marks / Tomes pay for (after the free shards).
  const tmLine = (s) => {
    const n = tmCopies(s);
    if (!n) return "";
    const lead = n === copiesLeft(s) && !mkCopies(s) ? " &rarr; " : ` + ${esc(t("isl_nb_copies").replace("{n}", n))} &rarr; `;
    return `${lead}<b class="mk">${esc(t("isl_tm_after").replace("{m}", tomesOf(s).toLocaleString()))}</b>`;
  };
  const mkLine = (s) => {
    if (!usesMarks(s)) return tmLine(s);
    const src = srcOf(s), mk = mkCopies(s);
    if (!mk) return tmLine(s);
    const amt = mk * src.markPrice;
    const txt = t("isl_mk_after").replace("{m}", amt.toLocaleString());
    const lead = mk === copiesLeft(s) && !needOf(s) ? " &rarr; " : ` + ${esc(t("isl_nb_copies").replace("{n}", mk))} &rarr; `;
    return `${lead}<b class="mk">${esc(txt)}</b>${tmLine(s)}${mk ? ` &middot; <button type="button" class="isl-mkb" data-islmkopen><span data-islmkprice>${plxPriceLabel("islands")}</span></button>` : ""}${copiesLeft(s) > src.markLimit ? `<br><span class="isl-mklim">${esc(t("isl_mk_over").replace("{n}", src.markLimit))}</span>` : ""}`;
  };
  const essOf = (s) => (usesEssence(s) ? copiesLeft(s) * srcOf(s).price : 0);
  const ePS = () => islEssencePerShard();
  // Event / ranked buildings: copies to the target ÷ the person's copies a cycle → cycles → time.
  const evPerOf = (s, src) => { const v = Number((ISL_SHARDS.evPer || {})[s.id]); return src.choices.includes(v) ? v : src.choices[src.choices.length - 1]; };
  const evPlan = (s) => {
    const src = srcOf(s);
    if (src.kind !== "event" && src.kind !== "ranked") return null;
    const per = evPerOf(s, src), copies = copiesLeft(s);
    // Counted from the next event: its copies, then one more event every cycle.
    const nx = islNextEvent(src);
    const cycles = copies > 0 ? Math.ceil(copies / per) : 0;
    const days = cycles > 0 ? nx.off + (cycles - 1) * nx.every : 0;
    const d = packStartOfToday(); d.setUTCDate(d.getUTCDate() + days);
    return { src, per, copies, cycles, days, nx, at: d, date: d.toLocaleDateString(undefined, { month: "short", year: "numeric", timeZone: "UTC" }) };
  };
  const evShort = (days) => (days <= 0 ? t("isl_today_s") : days < 7 ? t(days === 1 ? "isl_dy1" : "isl_dy").replace("{n}", days) : days < 56 ? t("isl_wk").replace("{n}", Math.max(1, Math.ceil(days / 7))) : t("isl_mo").replace("{n}", Math.round(days / 30)));
  // Time for one building as if everything went to it: { days } or null without income.
  // When the building reaches its target in the shared plan (days from today), or null.
  const bTime = (s) => (usesShards(s) || usesEssence(s) ? (sharedPlan(true).fin.has(s.id) ? sharedPlan(true).fin.get(s.id) : 0) : null);
  // "Feb" within the next 11 months, else "Feb ’28".
  const finLabel = (d) => { const at = islDay(d); return at.toLocaleDateString(undefined, { month: "short", timeZone: "UTC" }) + (d > 330 ? ` \u2019${String(at.getUTCFullYear()).slice(2)}` : ""); };
  // Option C: "→10" badge on the picture and the cost under the pill.
  const tileBits = (s) => {
    if (islIsLight(s)) {
      if (lvOf(s) >= maxOf(s) || tgtOf(s) <= lvOf(s)) return { badge: "", line: "" };
      const c = lightOf(s), ct = c.ct ? `<span class="nw">${bidiNum(c.bp.toLocaleString())} ${bpImg}</span> <span class="nw">${bidiNum(c.ct.toLocaleString())} ${ctImg}</span>` : "";
      const tip = esc(t("isl_lh_tip").replace("{b}", c.bp.toLocaleString()).replace("{c}", c.ct.toLocaleString()));
      const fl = freeLast(s), free = `<span class="isl-free">${esc(t("isl_free_card").replace("{d}", fl ? freeMon(fl) : t("isl_free_now")))}</span>`;
      const mkU = c.mk ? `<span class="nw"><img class="isl-mki" src="icons/mark-of-revival.png" alt="" /> ${bidiNum(c.mk.toLocaleString())}${c.ct ? " +" : ""}</span> ` : "";
      const line = `<span class="isl-tsh lh two" title="${tip}">${mkU}${c.ess ? `<span class="nw">${bidiNum(shortAmount(c.ess))} <img class="isl-im" src="icons/life-essence.png" alt="" aria-hidden="true">${c.ct ? " +" : ""}</span> ` : ""}${ct}${c.ct ? free : ""}</span>`;
      return { badge: `<span class="isl-tbg">&#8594;${tgtOf(s)}</span>`, line };
    }
    if (!tracked(s) || lvOf(s) >= maxOf(s) || tgtOf(s) <= lvOf(s)) return { badge: "", line: "" };
    const kind = srcOf(s).kind;
    const st = storeOf(s) ? `<span class="nw"><span class="isl-sti">&#128230;</span>${storeOf(s)} &middot;</span> ` : "";
    const tail = ""; // no finish date on the cards (owner, 9 Nov 2026); the pop-up still has it
    const line = kind === "none" ? ""
      : marksOf(s) || tomesOf(s) ? `<span class="isl-tsh mk two">${needOf(s) ? `<span class="nw">${st}${bidiNum(needOf(s).toLocaleString())} <img class="isl-im" src="icons/island-shard.png" alt="" aria-hidden="true">${tail} +</span>` : st}${[marksOf(s) ? ` <span class="nw"><img class="isl-mki" src="icons/mark-of-revival.png" alt="" /> ${bidiNum(marksOf(s) >= 10000 ? islK(marksOf(s)) : marksOf(s).toLocaleString())}</span>` : "", tomesOf(s) ? ` <span class="nw"><img class="isl-mki" src="icons/glorious-tome.png" alt="" /> ${bidiNum(tomesOf(s) >= 10000 ? islK(tomesOf(s)) : tomesOf(s).toLocaleString())}</span>` : ""].filter(Boolean).join(" +")}</span>`
      : usesEssence(s) ? `<span class="isl-tsh ess${st ? " two" : ""}">${st}<span class="nw">${bidiNum(shortAmount(essOf(s)))} <img class="isl-im" src="icons/life-essence.png" alt="" aria-hidden="true">${tail}</span></span>`
      : kind === "shop" ? `<span class="isl-tsh${st ? " two" : ""}">${st}<span class="nw">${bidiNum(needOf(s).toLocaleString())} <img class="isl-im" src="icons/island-shard.png" alt="" aria-hidden="true">${tail}</span></span>`
      : `<span class="isl-tsh tag${st ? " two" : ""}">${st}${esc(t(kind === "event" ? "isl_tag_ev" : "isl_tag_rk").replace("{t}", evShort(evPlan(s).days)))}</span>`;
    return { badge: `<span class="isl-tbg">&#8594;${tgtOf(s)}</span>`, line };
  };
  // One plan for the whole page: every tracked building of every category (chips only filter the cards).
  const planList = () => islands.filter(tracked);
  // "Target all" also sets the lighthouses.
  const tgtAllList = () => islands.filter((s) => tracked(s) || islIsLight(s));
  // The category's plan in Life Essence: shop copies + shards × essence a shard.
  const planTotals = (list) => {
    const st = ISL_SHARDS, sh = list.reduce((a, s) => a + needOf(s), 0), ess = list.reduce((a, s) => a + essOf(s), 0);
    const left = ess + sh * ePS(), have = (st.essence || 0) + (st.shards || 0) * ePS(), short = Math.max(0, left - have);
    let days = 0;
    if (short > 0) {
      const day = islEssenceDay(st), lim = Number(ISL_RULES.copyLimit) || 0, wk = Number(ISL_RULES.shopWeek) || 0;
      if (!(day > 0)) days = null;
      else {
        days = Math.ceil(short / day);
        const shShort = Math.max(0, sh - (st.shards || 0));
        if (wk > 0 && shShort > 0) days = Math.max(days, Math.ceil(shShort / (wk / 7)));
        if (lim > 0) list.forEach((s) => { if (usesEssence(s) && copiesLeft(s)) days = Math.max(days, (Math.ceil(copiesLeft(s) / lim) - 1) * 7); });
      }
    }
    const at = days != null ? islDay(days) : null;
    return { sh, ess, left, have, short, days, weeks: days != null ? Math.ceil(days / 7) : null, at };
  };
  // One result line instead of "Done by" (owner, 9 Nov 2026): by the target date, all at
  // target ✓ / shards short → Marks · price / copies that can't be reached (shards only).
  const resultLine = () => {
    const P = sharedPlan(true), pc = perCopy();
    const day = (d) => esc(islDay(d).toLocaleDateString(undefined, { month: "short", year: "numeric", timeZone: "UTC" }));
    if (!(P.need > 0)) return `<div class="isl-done ok">&#10003; ${esc(t("isl_box_none"))}</div>`;
    if (P.days == null) return `<div class="isl-done">${P.done == null ? esc(t("isl_box_noinc")) : `${esc(t("isl_rs_done_c"))} <b>~${day(P.done)}</b> &middot; ${esc(t("isl_box_weeks").replace("{n}", Math.max(1, Math.ceil(P.done / 7))))}`}</div>`;
    // With no date the plan is "every target as soon as packs allow" (within the horizon).
    const by = esc(islDateShort(P.tDay) + (P.days > 300 ? ` ${P.tDay.getUTCFullYear()}` : "")), lead = (x) => (P.noDate ? esc(t("isl_rs_asap")) : esc(t("isl_rs_by").replace("{d}", x)));
    const capTxt = P.noDate ? day(P.capDays) : by;
    const lines = [];
    if (P.marks > 0 || P.tomes > 0) lines.push(`<div class="isl-done am">${lead(by)}: <b>${bidiNum(((P.mkCopiesAll + P.tmCopiesAll) * pc).toLocaleString())}</b> ${esc(t("isl_rs_short"))} &rarr; ${[P.marks > 0 ? `<b>${bidiNum(P.marks.toLocaleString())}</b> ${esc(t("isl_mk_name"))}` : "", P.tomes > 0 ? `<b>${bidiNum(P.tomes.toLocaleString())}</b> ${esc(t("isl_tm_name"))}` : ""].filter(Boolean).join(" + ")} &middot; <button type="button" class="isl-mkb" data-islpc><span data-islmkprice>${plxPriceLabel("islands")}</span></button></div>`);
    // Shards-only copies a shard pack can cover (a pack used for Islands gives shards).
    const buySh = P.shNeed > 0 ? Math.round(P.shNeed / pc) : 0;
    if (buySh > 0) lines.push(`<div class="isl-done am">${lead(by)}: ${esc(t("isl_rs_sh_buy").replace("{n}", buySh.toLocaleString()).replace("{s}", P.shNeed.toLocaleString()))} &middot; <button type="button" class="isl-mkb" data-islpc><span data-islmkprice>${plxPriceLabel("islands")}</span></button></div>`);
    // Shards-only copies the shard packs can't cover by the date: say why (none on sale by
    // then, e.g. this run is already bought, or they give too few) and when more come.
    if (islShardPacksOn() && P.cantSh > buySh) {
      const sup = Math.max(0, islShardSupplyMax(P.capDays) - (P.free || 0)), nx = P.noDate ? null : islShardNextDay(P.days);
      const nd = nx != null ? ` &middot; ${esc(t("isl_rs_sh_next").replace("{d}", islDateShort(islDay(nx))))}` : "";
      lines.push(`<div class="isl-done am">${esc(sup > 0 ? t("isl_rs_sh_more").replace("{s}", sup.toLocaleString()).replace("{d}", P.noDate ? capTxt : islDateShort(P.tDay)) : t("isl_rs_sh_none").replace("{d}", P.noDate ? capTxt : islDateShort(P.tDay)))}${nd}</div>`);
    }
    if (P.cant - buySh > 0) lines.push(`<div class="isl-done bad">${esc(t("isl_rs_cant").replace("{n}", P.cant - buySh).replace("{d}", capTxt))} &middot; ${esc(t("isl_rs_done"))} ~${P.done == null ? "?" : day(P.done)}</div>`);
    if (!lines.length) lines.push(`<div class="isl-done ok">&#10003; ${lead(by)}: ${esc(t("isl_rs_all"))}</div>`);
    if (P.free > 0) lines.unshift(`<div class="isl-done ok">&#10003; ${esc(t("isl_rs_free").replace("{n}", P.free.toLocaleString()).replace("{c}", Math.floor(P.free / pc).toLocaleString()))}</div>`);
    return lines.join("");
  };
  function drawPlan() {
    const host = document.getElementById("islandShardPlan");
    if (!host) return;
    const list = planList(), tAll = tgtAllList();
    const tHost = document.getElementById("islTargetAll");
    if (!tAll.length) { host.innerHTML = ""; if (tHost) tHost.innerHTML = ""; return; }
    const st = ISL_SHARDS;
    const P = planTotals(list), LPn = lightPlan(), left = P.left + LPn.ess, short = Math.max(0, P.left + LPn.ess - P.have);
    // The level last picked shows while every building still follows it (each one
    // capped at its own max and never below its level); else the shared target or Mixed.
    const follows = (v) => tAll.every((s) => tgtOf(s) === Math.max(tgtLo(s), Math.min(maxOf(s), v)));
    const tg = tAll.map(tgtOf);
    const same = st.allPick && follows(st.allPick) ? st.allPick : tg.every((v) => v === tg[0]) ? tg[0] : 0;
    const mxAll = Math.max(10, ...tAll.map(maxOf));
    const opts = [];
    for (let l = 1; l <= mxAll; l++) opts.push(`<option value="${l}"${same === l ? " selected" : ""}>${esc(t("sg_lv").replace("{n}", l))}</option>`);
    // Backpack boxes like the planner pages: Life Essence and Mythic Island Shards, each with
    // what you have, "need N" for the shown plan and short / ✓; tap = type the amount.
    const essNeed = Math.max(0, left - (st.shards || 0) * ePS()), shNeed = P.sh;
    const tile = (k, icon, label, have, need, sh) => { const ts = bsTileStatus(need, sh); return `<button type="button" class="bp-tile bs-tile${ts.off ? " off" : ""}" data-islhave="${k}" title="${esc(label)}"><span class="bs-mark">&#127890;</span><img src="${icon}" alt="" /><span class="bp-qty">${bidiNum(shortAmount(have))}</span><span class="bp-name">${esc(label)}</span>${ts.html}</button>`; };
    const tiles = [tile("essence", "icons/life-essence.png", t("isl_essence"), st.essence || 0, essNeed, short),
      tile("shards", "icons/island-shard.png", t("isl_shards"), st.shards || 0, shNeed, Math.max(0, shNeed - (st.shards || 0)))];
    // Mark of Revival (bought with packs, after the free shards): need = what the plan
    // buys with Marks, or with no Budgets target the optional amount.
    const mk = list.reduce((a, s) => a + marksOf(s), 0) + (lightPlan().mk || 0);
    // Always three slots so the card keeps one height on every category (faded "—" when not needed).
    tiles.push(tile("marks", "icons/mark-of-revival.png", t("isl_mk_name"), markHave(), mk, Math.max(0, mk - markHave())));
    // Glorious Tomes (Shining City shop): what the Backpack holds counts its Lucky Glorious Tome Chests at their average.
    const tmN = sharedPlan(true).tomes || 0;
    tiles.push(tile("tomes", "icons/glorious-tome.png", t("isl_tm_name"), tomeHave(), Math.max(0, tmN), Math.max(0, tmN - tomeHave())));
    // Lighthouse Blueprints as General Accessory Construction Contracts (owner, 16 Nov 2026).
    tiles.push(tile("contracts", CT_ICON, t("isl_lh_ct"), contractHave(), LPn.ct, LPn.short));
    const boxesOn = true, mkTotal = markSheetTotal() + (sharedPlan().tomes || 0) + (sharedPlan().shNeed || 0) + Math.max(0, lightBuy() - contractHave());
    // The Pack cost button sits on the Target row, always there (greyed when nothing to buy).
    const canBuy = mkTotal > 0 && visitorCan("packcost");
    const priceBtn = canBuy ? `<button type="button" class="cg-bpbtn ice isl-pcb" data-islpc data-islmkprice>${plxPriceLabel("islands")}</button>` : `<button type="button" class="cg-bpbtn isl-pcb off" disabled>${esc(t("isl_pc_none"))}</button>`;
    let res = `<div class="g1 cg-bp isl-bp${boxesOn ? "" : " bs-folded"}"><div class="bs-foot"><span>&#127890; ${esc(t("bs_from_backpack"))}</span><span class="cg-bpb plx-bpb">${priceBtn}</span><button type="button" class="g1-fold g1-sq" data-g1fold="top:islandgallery"></button></div>${boxesOn ? `<div class="bs-tiles isl-bst" style="--n:${Math.min(5, Math.max(3, tiles.length))}; --nm:${Math.min(5, Math.max(3, tiles.length))}; --ns:${Math.min(4, Math.max(3, tiles.length))};">${tiles.join("")}</div>` : ""}</div>`;
    const inc = islIncome(st), sd = islShardsDay(st);
    // Free Construction Contracts (owner, 16 Nov 2026): weekly + each KOI / SvS, counted before the pack.
    let ctLine = "";
    if (LPn.ct > 0) {
      const day = (d) => islDay(d).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" }), P0 = sharedPlan(), ctImg = `<img class="isl-im" src="${CT_ICON}" alt="" aria-hidden="true">`;
      const rate = esc(t("isl_ct_rate").replace("{w}", ISL_RULES.ctWeek).replace("{e}", ISL_RULES.ctEvent));
      const left = Math.max(0, LPn.ct - contractHave());
      let msg;
      if (!left) msg = esc(t("isl_needs_ok"));
      else if (P0.days != null) {
        const dt = day(P0.days);
        msg = LPn.short > 0 ? esc(t("isl_ct_short").replace("{d}", dt).replace("{f}", LPn.free.toLocaleString()).replace("{n}", LPn.short.toLocaleString())) : esc(t("isl_ct_free_ok").replace("{d}", dt).replace("{f}", LPn.free.toLocaleString()));
      } else {
        const dd = islFreeContractsDays(left);
        const yr = islFreeContracts(364); msg = dd == null ? esc(yr > 0 ? t("isl_ct_years").replace("{y}", Math.ceil(left / yr)) : t("isl_ct_never")) : esc(t("isl_ct_done").replace("{d}", day(dd)));
      }
      ctLine = `<div class="isl-ctl"><span class="isl-ic" aria-hidden="true">${ctImg}</span><span class="tx"><b>${rate}</b><small>${msg}</small></span></div>`;
    }
    const incLine = `<span class="isl-ic e" aria-hidden="true"><img class="isl-im" src="icons/life-essence.png" alt="" aria-hidden="true"></span><span class="tx"><b>${esc(t("isl_inc_day").replace("{s}", islOne(sd)))}</b><small>${esc(t("isl_inc_ess").replace("{e}", Math.round(inc.total).toLocaleString()))}</small></span><span class="ed">${esc(t("isl_inc_edit"))}</span>`;
    // "Target all" sits on the BUILDINGS list title under the card.
    if (tHost) tHost.innerHTML = `<span class="isl-lst">${esc(t("isl_buildings"))}</span><label class="isl-tl"><span>${esc(t("isl_target_all"))}</span><select class="isl-sel keep-w" data-isltall>${same ? "" : `<option value="" selected>${esc(t("isl_mixed"))}</option>`}${opts.join("")}</select></label>`;
    host.innerHTML = `<div class="isl-pl">
      ${res}
      <button type="button" class="isl-inc" data-islinc>${incLine}</button>${ctLine}</div>`;
    g1FoldSync(host);
    // The plan's details sit behind an (i) beside the Backpack title (owner, 9 Nov 2026); the income bar stays under the boxes.
    const why = document.createElement("div"); why.className = "isl-why"; why.innerHTML = resultLine();
    infoAttach(host.querySelector(".isl-bp .bs-foot > span:first-child"), why);
    bsSlideFit(host);
    islMarkCard();
  }
  function wirePlan() {
    const host = document.getElementById("islandShardPlan");
    if (!host) return;
    host.onclick = (e) => {
      const hv = e.target.closest("[data-islhave]");
      if (hv) {
        const k = hv.dataset.islhave;
        if (k === "tomes") {
          const nd = sharedPlan(true).tomes || 0, cur = Number((islBp || {})["Glorious Tome"]) || 0;
          plxAmountModal({ label: t("isl_tm_name"), icon: "icons/glorious-tome.png", value: cur, needBox: nd > 0 ? { need: nd, have: tomeHave() } : null, onSave: (v) => { loadCalcState("backpack").catch(() => null).then((b) => { islBp = { ...(b || islBp || {}), "Glorious Tome": Math.floor(v) }; saveCalcState("backpack", islBp); budgetInvalidate(); spSig = null; keepPlace(() => computeAndRender()); }); } });
          return;
        }
        if (k === "contracts") {
          const nd = lightPlan().ct;
          plxAmountModal({ label: t("isl_lh_ct"), icon: CT_ICON, value: contractHave(), needBox: nd > 0 ? { need: nd, have: contractHave() } : null, onSave: (v) => { loadCalcState("backpack").catch(() => null).then((b) => { islBp = { ...(b || islBp || {}), [ISL_CONTRACT]: Math.floor(v) }; saveCalcState("backpack", islBp); budgetInvalidate(); keepPlace(() => computeAndRender()); }); } });
          return;
        }
        if (k === "marks") {
          const nd = planList().reduce((a, s) => a + marksOf(s), 0);
          plxAmountModal({ label: t("isl_mk_name"), icon: "icons/mark-of-revival.png", value: markHave(), needBox: nd > 0 ? { need: nd, have: markHave() } : null, onSave: (v) => { loadCalcState("backpack").catch(() => null).then((b) => { islBp = { ...(b || islBp || {}), "Mark of Revival": Math.floor(v) }; saveCalcState("backpack", islBp); budgetInvalidate(); drawPlan(); }); } });
          return;
        }
        const P2 = planTotals(planList()), nd = k === "essence" ? Math.max(0, P2.left + lightPlan().ess - (ISL_SHARDS.shards || 0) * ePS()) : P2.sh;
        plxAmountModal({ label: t(k === "essence" ? "isl_essence" : "isl_shards"), icon: k === "essence" ? "icons/life-essence.png" : "icons/island-shard.png", value: ISL_SHARDS[k] || 0, needBox: nd > 0 ? { need: nd, have: ISL_SHARDS[k] || 0 } : null, onSave: (v) => { const n = k === "essence" ? "Life Essence" : "Mythic Island Shards", q = Math.floor(v); ISL_SHARDS[k] = q; loadCalcState("backpack").catch(() => null).then((b) => { islBp = { ...(b || islBp || {}), [n]: q }; saveCalcState("backpack", islBp); budgetInvalidate(); }); keepPlace(() => computeAndRender()); } });
        return;
      }
      if (e.target.closest("[data-islpc]")) { islOpenPacks(); return; }
      if (e.target.closest("[data-islscan]")) { openIslandScan(); return; }
      if (e.target.closest("[data-islinc]")) islIncomeSheet(() => { if (document.getElementById("islandShardPlan")) { drawPlan(); } });
    };
    const tHost = document.getElementById("islTargetAll");
    host.onchange = (e) => {
      const sel = e.target.closest("[data-isltall]");
      if (!sel || !sel.value) return;
      if (ISL_POP) ISL_POP.close(true);
      ISL_SHARDS.allPick = Number(sel.value);
      tgtAllList().forEach((s) => setTgt(s, ISL_SHARDS.allPick));
      islSave();
      keepPlace(() => computeAndRender());
    };
    if (tHost) tHost.onchange = host.onchange;
  }

  // Mark of Revival for Budgets: every tracked category's Mark-shop buildings together (the
  // Budgets "Islands" page's need); what the Backpack holds counts as had.
  const markNeedAll = () => islands.filter(usesMarks).reduce((a, s) => a + (sharedPlan(false, true).mk.get(s.id) || 0) * srcOf(s).markPrice, 0);
  // The Pack cost card: this category's Marks actually needed, else (no target) the optional amount.
  const markSheetTotal = () => planList().filter(usesMarks).reduce((a, s) => a + (sharedPlan().mk.get(s.id) || 0) * srcOf(s).markPrice, 0);
  const markHave = () => Number((islBp || {})["Mark of Revival"]) || 0;
  const buyTotals = () => { const o = {}, mk = markSheetTotal() + (lightPlan().mk || 0), tm = sharedPlan().tomes || 0, ct = lightBuy(), sh = sharedPlan().shNeed || 0; if (mk) o["Mark of Revival"] = mk; if (tm) o["Glorious Tome"] = tm; if (ct > contractHave()) o[ISL_CONTRACT] = ct; if (sh) o[ISL_SHARD_ITEM] = sh; return o; };
  const buyOwned = () => ({ "Mark of Revival": markHave(), "Glorious Tome": tomeHave(), [ISL_CONTRACT]: contractHave() });
  let mkSig = null;
  PACK_COST_HOOKS.islands = () => {
    document.querySelectorAll("[data-islmkprice]").forEach((el) => { el.innerHTML = plxPriceLabel("islands"); });
  };
  // Pack cost's Cheapest: what Islands still has to buy if every target only has to be
  // reached by `d` days from now (free income up to then first). `uncovered` = copies no
  // pack covers (a date is only good when it leaves no more of them than "as soon as possible").
  PACK_NEED_BY_DATE.islands = (d) => {
    const P = sharedPlan(false, d), L = lightPlan(d), o = {};
    const mk = planList().filter(usesMarks).reduce((a, s) => a + (P.mk.get(s.id) || 0) * srcOf(s).markPrice, 0) + (L.mk || 0), tm = P.tomes || 0, ct = Math.max(0, L.ct - L.free), sh = P.shNeed || 0;
    if (mk) o["Mark of Revival"] = mk; if (tm) o["Glorious Tome"] = tm; if (ct > contractHave()) o[ISL_CONTRACT] = ct; if (sh) o[ISL_SHARD_ITEM] = sh;
    const B = sharedPlan(false);
    const unc = (x) => Math.max(0, x.cant - Math.round((x.shNeed || 0) / (perCopy() || 1)));
    return { totals: o, ok: unc(P) <= unc(B) };
  };
  // The plan picked in Pack cost: the page's boxes and lines follow its date (Cheapest at a later date).
  PACK_PICK_HOOKS.islands = (days) => {
    const v = days == null ? null : days;
    if (v === ISL_VIEW_DAYS) return;
    ISL_VIEW_DAYS = v;
    if (document.getElementById("islandSections") && !ISL_POP) keepPlace(() => computeAndRender());
  };
  // A new date in the Pack cost window's target row: the page's plan follows it (free income
  // up to that day first), like the cost.
  PACK_TARGET_HOOKS.islands = () => { if (document.getElementById("islandSections")) { spSig = null; mkSig = null; keepPlace(() => computeAndRender()); } };
  // The Pack cost window, like the planner pages: on phones it opens over the page from
  // the "$ <price> ›" button on the Backpack line; on PC the card sits under the stats card.
  function islPacksTo(open) {
    const buy = document.getElementById("islMkBuy"), bd = document.querySelector("[data-islbd]");
    if (!buy) return;
    buy.classList.toggle("cg-open", !!open);
    buy.dataset.cgshow = open ? "packs" : "";
    if (bd) bd.hidden = !open;
    if (open) buy.scrollTop = 0;
  }
  function islOpenPacks() {
    if (ISL_POP) ISL_POP.close();
    if (window.matchMedia("(max-width: 900px)").matches) islPacksTo(true);
    else {
      // PC: the card sits under the folded top card, hidden while folded; the price
      // button still shows it (until the next Hide / Show).
      const w = document.getElementById("islMkWrap"), c = document.getElementById("islMkBuy");
      if (w) w.classList.add("isl-mk-shown");
      if (c) c.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }
  {
    const w = document.getElementById("islMkWrap");
    if (w) w.onclick = (e) => { if (e.target.closest("[data-cgclose]") || e.target.closest("[data-islbd]")) islPacksTo(false); };
  }
  // The Pack cost card (design A, like every planner page) for the Marks, its own card
  // under the Troops Stats card; shown when Marks are needed (or optional with no target).
  function islMarkCard() {
    const host = document.getElementById("islMkPacks");
    if (!host) return;
    const bt = buyTotals(), total = Object.values(bt).reduce((a, n) => a + n, 0), sig = `${JSON.stringify(bt)}|${markHave()}|${tomeHave()}|${contractHave()}`;
    const wrap = document.getElementById("islMkWrap");
    if (!total) { mkSig = sig; host.innerHTML = ""; if (wrap) wrap.hidden = true; islPacksTo(false); packCostShown("islands", null); return; }
    if (wrap) wrap.hidden = false;
    if (sig === mkSig && host.innerHTML) return;
    mkSig = sig;
    PACK_COST_OPEN.islands = true;
    renderPackCostBlock(host, "islands", [{ label: null, totals: bt }], buyOwned());
  }


  function drawStats() {
    const builtCount = islands.filter(built).length;
    document.getElementById("islandSummaryLine").innerHTML = esc(t("sg_built_of")).replace("{n}", `<b>${builtCount}</b>`).replace("{total}", islands.length);
    // Total Attack/Defense/Lethality/Health per troop: raw-stat islands count
    // toward every troop (they buff all troops equally); display_group
    // islands (MVP, Lighthouses) count toward every troop too, since their
    // stats are still real Attack/Defense/Lethality/Health values.
    // All troops: general (troop-agnostic) totals from islands with a plain
    // Attack/Defense/Lethality/Health stat (these buff every troop equally).
    // Each troop: totals from islands whose stat is already troop-specific
    // (Infantry Attack, Lancers Defense, etc. - the Island Guide buildings).
    const generalTotals = {}; // stat -> {cur, max}
    const specificTotals = {}; // "Troop Stat" -> {cur, max}
    for (const s of islands) {
      if (GALLERY_UNCOUNTED.has(String(s.id))) continue;
      const lvl = s.current_level ?? 0;
      const maxLvl = s.max_level ?? 10;
      STAT_SLOTS.forEach(([typeKey, valKey, levelKey]) => {
        const stat = bonusStatKey(s[typeKey]);
        if (s[valKey] == null || !stat) return;
        const unlockLvl = s[levelKey];
        const effective = !s.owned || !lvl || !maxLvl ? 0 : unlockLvl != null ? (lvl >= unlockLvl ? Number(s[valKey]) : 0) : (Number(s[valKey]) * lvl) / maxLvl;
        if (RAW_STATS.includes(stat)) {
          generalTotals[stat] = generalTotals[stat] || { cur: 0, max: 0 };
          generalTotals[stat].max += Number(s[valKey]);
          generalTotals[stat].cur += effective;
        } else {
          const isTroopStat = TROOPS.some((tr) => stat.startsWith(tr));
          if (!isTroopStat) return;
          specificTotals[stat] = specificTotals[stat] || { cur: 0, max: 0 };
          specificTotals[stat].max += Number(s[valKey]);
          specificTotals[stat].cur += effective;
        }
      });
    }
    const STAT_ABBR2 = { Attack: "ATK", Defense: "DEF", Lethality: "LETH", Health: "HP" };
    // Troop tabs like Alliance Tech: all troops, then each troop's own.
    const box = (label, tot) => ({ label, val: tot ? tot.cur : 0, max: tot ? tot.max : 0 });
    const troopTab = { Infantry: "Infantry", Lancers: "Lancer", Marksman: "Marksman" };
    document.getElementById("islandTroopTotals").innerHTML = plxStatTabsHtml("islands", [
      { key: "all", label: t("plx_all_troops"), html: galStatBoxesHtml(RAW_STATS.map((stat) => box(STAT_ABBR2[stat] || stat, generalTotals[stat]))) },
      ...["Infantry", "Lancers", "Marksman"].map((tr) => ({
        key: tr, label: troopDisplayName(troopTab[tr]), color: PLX_TROOP_COLORS[troopTab[tr]],
        html: galStatBoxesHtml(["Attack", "Defense"].map((stat) => box(STAT_ABBR2[stat], specificTotals[`${tr} ${stat}`]))),
      })),
    ]);
  }

  // The small level pop-up under an island: 0 · − level + · Max. It stays open
  // while tapping (holding + / − repeats); a tap outside or Esc closes it.
  function openPop(id) {
    if (ISL_POP) ISL_POP.close();
    const sections = document.getElementById("islandSections");
    const tileEl = sections && sections.querySelector(`[data-island="${window.CSS.escape(String(id))}"]`);
    const s = islands.find((x) => String(x.id) === String(id));
    if (!tileEl || !s) return;
    const pop = document.createElement("div");
    pop.className = "sg-pop isl-pop";
    pop.setAttribute("role", "dialog");
    pop.setAttribute("aria-label", s.name);
    pop.innerHTML = `<span class="sg-pop-ar"></span><div class="sg-pop-h">${s.image_url ? `<img class="isl-pic" src="${esc(s.image_url)}" alt="" />` : ""}<b>${esc(s.name)}</b><span class="isl-chip" data-popchip hidden></span><span data-popbn></span></div>
      <div class="sg-pop-bt"><button type="button" class="sg-pop-sm" data-ipset="0" aria-label="${esc(t("sg_not_built"))}">0</button><button type="button" class="sg-pop-pm" data-ipstep="-1" aria-label="&#8722;">&#8722;</button><span class="sg-pop-num" data-popnum aria-live="polite"></span><button type="button" class="sg-pop-pm" data-ipstep="1" aria-label="+">+</button><button type="button" class="sg-pop-mx" data-ipset="max">${esc(t("sg_max"))}</button></div>
      ${tracked(s) ? `<div class="isl-tg"><span class="l">${esc(t("isl_target"))}</span><button type="button" class="sg-pop-pm" data-iptg="-1" aria-label="&#8722;">&#8722;</button><span class="n" data-poptg aria-live="polite"></span><button type="button" class="sg-pop-pm" data-iptg="1" aria-label="+">+</button><button type="button" class="sg-pop-mx" data-iptg="max">${esc(t("sg_max"))}</button></div><div class="isl-tg isl-store" data-popstw hidden><span class="l2">&#128230; ${esc(t("isl_store"))}<small>${esc(t("isl_store_d"))}</small></span><button type="button" class="sg-pop-pm" data-ipst="-1" aria-label="&#8722;">&#8722;</button><span class="n" data-popst aria-live="polite"></span><button type="button" class="sg-pop-pm" data-ipst="1" aria-label="+">+</button></div><div class="isl-get" data-popget hidden>${esc(t("isl_get_first"))}</div><div class="isl-need" data-popneed></div>${IS_OWNER && !islIsMythic(s) && s.category === ISL_SHOP_CAT ? `<div class="isl-src"><div class="isl-osl">${esc(t("isl_owner_set"))}</div><label data-ippricew><span>${esc(t("isl_src_price_s"))}</span><input type="number" inputmode="numeric" min="0" step="500" data-ipprice /></label></div>` : ""}${IS_OWNER && islIsMythic(s) ? `<div class="isl-src"><div class="isl-osl">${esc(t("isl_owner_set"))}</div><label><span>${esc(t("isl_src"))}</span><select class="keep-w" data-ipsrc><option value="shop">${esc(t("isl_src_shop"))}</option><option value="event">${esc(t("isl_src_event"))}</option><option value="ranked">${esc(t("isl_src_ranked"))}</option></select></label><label data-ipsrceachw><span>${esc(t("isl_src_each"))}</span><span class="isl-eachr"><select class="keep-w" data-ipsrceach><option value="0">${esc(t("isl_src_table"))}</option><option value="1">${esc(t("isl_src_same"))}</option></select><input type="number" inputmode="numeric" min="1" max="99" data-ipsrceachn hidden /></span></label><label data-ippricew><span>${esc(t("isl_src_price_s"))}</span><input type="number" inputmode="numeric" min="0" step="500" data-ipprice /></label><div class="isl-dt" data-ipsrcev hidden><div class="isl-dl">${esc(t("isl_dates_from"))}</div><div class="isl-seg"><button type="button" data-ipdates="pack">${esc(t("isl_dates_pack"))}</button><button type="button" data-ipdates="own">${esc(t("isl_dates_own"))}</button></div>
        <div class="isl-dpk" data-ipdpk hidden><div class="isl-dl">${esc(t("isl_dates_pick"))}</div><select class="keep-w" data-ippack></select><div class="isl-dsm" data-ippacknote></div></div>
        <div class="isl-dow"><label data-ipdown hidden><span>${esc(t("isl_dates_next"))}</span><input type="date" class="keep-w" data-ipnext /></label></div></div><label data-ipsrcev hidden><span>${esc(t("isl_src_choices"))}</span><input type="text" inputmode="numeric" autocomplete="off" data-ipsrcch /></label></div>` : ""}` : ""}${!tracked(s) && islIsLight(s) ? `<div class="isl-tg"><span class="l">${esc(t("isl_target"))}</span><button type="button" class="sg-pop-pm" data-iptg="-1" aria-label="&#8722;">&#8722;</button><span class="n" data-poptg aria-live="polite"></span><button type="button" class="sg-pop-pm" data-iptg="1" aria-label="+">+</button><button type="button" class="sg-pop-mx" data-iptg="max">${esc(t("sg_max"))}</button></div><div class="isl-need" data-popneed></div>` : ""}
      <div class="isl-wb" data-popwb hidden></div>
      <div class="sg-pop-ft"><span>${esc(t("isl_pop_hold"))}</span><span>${esc(t("isl_pop_out"))}</span></div>`;
    sections.appendChild(pop);
    tileEl.classList.add("sel");
    let changed = false, hold = 0, rep = 0;
    const draw = () => {
      const lv = lvOf(s), mx = maxOf(s);
      pop.querySelector("[data-popnum]").innerHTML = `${lv}<small> / ${mx}</small>`;
      // Event / ranked: a chip beside the name, and the bonus without its max so both fit.
      const kd = tracked(s) ? srcOf(s).kind : "none", chip = pop.querySelector("[data-popchip]");
      chip.hidden = kd !== "event" && kd !== "ranked";
      chip.className = `isl-chip ${kd === "ranked" ? "rk" : "ev"}`;
      chip.innerHTML = kd === "event" ? esc(t("isl_chip_ev")) : kd === "ranked" ? esc(t("isl_chip_rk")) : "";
      pop.querySelector("[data-popbn]").textContent = chip.hidden ? bonusText(s, lv) : bonusAt(s, lv).map((b) => `+${galNum(b.val)}% ${galStatShort(b.type)}`).join(" · ");
      pop.querySelector('[data-ipstep="-1"]').disabled = lv <= 0;
      pop.querySelector('[data-ipset="0"]').disabled = lv <= 0;
      pop.querySelector('[data-ipstep="1"]').disabled = lv >= mx;
      pop.querySelector('[data-ipset="max"]').disabled = lv >= mx;
      if (tracked(s)) {
        const tg = tgtOf(s), lo = Math.max(1, lv), need = needOf(s);
        pop.querySelector("[data-poptg]").textContent = tg;
        pop.querySelector('[data-iptg="-1"]').disabled = tg <= lo;
        pop.querySelector('[data-iptg="1"]').disabled = tg >= mx;
        pop.querySelector('[data-iptg="max"]').disabled = tg >= mx;
        const src = srcOf(s);
        pop.querySelector("[data-popget]").hidden = lv > 0 || !usesShards(s);
        const ev = evPlan(s);
        const stw = pop.querySelector("[data-popstw]");
        stw.hidden = !hasPlan(s);
        pop.querySelector("[data-popst]").textContent = storeOf(s);
        pop.querySelector('[data-ipst="-1"]').disabled = storeOf(s) <= 0;
        const all = copiesOf(s), store = storeOf(s), left = copiesLeft(s);
        const box = (label, big, small) => `<div class="sg-sb isl-bx"><div class="sg-sbt"><span>${esc(label)}</span></div><b>${big}</b><small>${small}</small></div>`;
        pop.querySelector("[data-popneed]").innerHTML = ev ? `<div class="isl-s3 isl-pb">${box(t("isl_pb_next"), ev.nx.known ? esc(islDateShort(islDay(ev.nx.off))) : "&mdash;", esc(ev.nx.known ? islEveryText(ev.nx.every, ev.nx.monthly) : t(ev.src.dates === "cal" ? "isl_pick_event" : "isl_no_dates")))}${box(t("isl_pb_get"), `<select class="keep-w" data-ipevn>${ev.src.choices.map((n) => `<option value="${n}"${n === ev.per ? " selected" : ""}>${n}</option>`).join("")}</select>`, esc(t("isl_pb_each")))}${box(t("isl_pb_done"), left ? `<span class="gd">~${esc(ev.date)}</span>` : "&#10003;", esc(left ? t(store ? "isl_pb_left" : "isl_pb_copies").replace("{n}", left) : t("isl_box_none")))}</div>`
          : !all || src.kind !== "shop" ? "" : usesEssence(s) ? (() => { const d = bTime(s), ess = essOf(s); return `<div class="isl-nbox">${left}${store ? ` <span class="g">(${esc(t("isl_nb_store").replace("{n}", store))})</span>` : ""} &times; ${bidiNum(src.price.toLocaleString())} = <b class="gd">${bidiNum(shortAmount(ess))} <img class="isl-im" src="icons/life-essence.png" alt="" aria-hidden="true"></b>${ess ? ` &middot; ${d == null ? "?" : d ? `~${esc(finLabel(d))}` : esc(t("isl_needs_ok"))}` : ""}</div>`; })() : `<div class="isl-nbox">${esc(t("isl_nb_copies").replace("{n}", need && (mkCopies(s) || tmCopies(s)) ? left - mkCopies(s) - tmCopies(s) : all))}${store ? ` <span class="g">(${esc(t("isl_nb_store").replace("{n}", store))})</span>` : ""}${need || !(mkCopies(s) || tmCopies(s)) ? ` = <b class="gd">${bidiNum(need.toLocaleString())} <img class="isl-im" src="icons/island-shard.png" alt="" aria-hidden="true"></b>${need ? ` &middot; ${(() => { const d = bTime(s); return d == null ? "?" : d ? `~${esc(finLabel(d))}` : esc(t("isl_needs_ok")); })()}` : ""}` : ""}${mkLine(s)}</div>`;
        const pi = pop.querySelector("[data-ipprice]");
        if (pi) {
          if (document.activeElement !== pi) pi.value = src.price || "";
          pop.querySelector("[data-ippricew]").hidden = src.kind === "event" || src.kind === "ranked" || s.category !== ISL_SHOP_CAT;
        }
        const sel = pop.querySelector("[data-ipsrc]");
        if (sel) {
          if (document.activeElement !== sel) sel.value = src.kind;
          pop.querySelectorAll("[data-ipsrcev]").forEach((w) => { w.hidden = src.kind !== "event" && src.kind !== "ranked"; });
          pop.querySelector("[data-ipsrceachw]").hidden = src.kind === "none";
          const grp = src.dates === "cal" ? "pack" : src.dates;
          pop.querySelectorAll("[data-ipdates]").forEach((b) => b.classList.toggle("on", b.dataset.ipdates === grp));
          pop.querySelector("[data-ipdpk]").hidden = grp !== "pack";
          pop.querySelector("[data-ipdown]").hidden = src.dates !== "own";
          const nxi = pop.querySelector("[data-ipnext]");
          if (src.dates === "own" && document.activeElement !== nxi) nxi.value = packDayKey(islDay(islNextEvent(src).off));
          if (grp === "pack") {
            const ps = pop.querySelector("[data-ippack]");
            if (document.activeElement !== ps) ps.innerHTML = `<option value="">${esc(t("isl_dates_choose"))}</option><optgroup label="${esc(t("isl_dates_events"))}">${GAME_EVENTS.map((g) => `<option value="ev:${esc(g.key)}"${src.dates === "cal" && src.ev === g.key ? " selected" : ""}>${esc(g.name)}</option>`).join("")}</optgroup>${(ISL_PACKS || []).length ? `<optgroup label="${esc(t("isl_dates_packs"))}">${ISL_PACKS.map((x) => `<option value="${esc(x.id)}"${src.dates === "pack" && x.id === src.pack ? " selected" : ""}>${x.lead ? "&#128279; " : ""}${esc(x.name)}</option>`).join("")}</optgroup>` : ""}`;
            const nx = islNextEvent(src), pk = src.dates === "pack" ? (ISL_PACKS || []).find((x) => x.id === src.pack) : null;
            pop.querySelector("[data-ippacknote]").textContent = !nx.known ? t(src.dates === "cal" ? "isl_pick_event" : "isl_dates_nopack") : src.dates === "cal" ? t("isl_dates_follows_ev").replace("{name}", nx.evName).replace("{date}", islDateShort(islDay(nx.off))).replace("{every}", islEveryText(nx.every)) : t("isl_dates_follows").replace("{name}", pk ? pk.name : "").replace("{date}", islDateShort(islDay(nx.off))).replace("{every}", islEveryText(nx.every, nx.monthly));
          }
          const ci = pop.querySelector("[data-ipsrcch]");
          if (document.activeElement !== ci) ci.value = (src.choices || ISL_EV_CHOICES).join(",");
          const es = pop.querySelector("[data-ipsrceach]"), en = pop.querySelector("[data-ipsrceachn]");
          if (document.activeElement !== es) es.value = src.each ? "1" : "0";
          en.hidden = es.value !== "1";
          if (document.activeElement !== en) en.value = src.each || 1;
        }
        const bits = tileBits(s);
        const bg = tileEl.querySelector(".isl-tbg"), ln = tileEl.querySelector(".isl-tsh");
        if (bg) bg.outerHTML = bits.badge || "<span class=\"isl-tbg\" hidden></span>";
        else if (bits.badge) tileEl.insertAdjacentHTML("beforeend", bits.badge);
        if (ln) ln.outerHTML = bits.line || "<span class=\"isl-tsh\" hidden></span>";
        else if (bits.line) tileEl.insertAdjacentHTML("beforeend", bits.line);
        const pw = tileEl.querySelector(".sg-pw"), coin = coinHtml(s);
        if (pw && [...pw.querySelectorAll(".isl-mkc")].map((x) => x.outerHTML).join("") !== coin) { pw.querySelectorAll(".isl-mkc").forEach((x) => x.remove()); if (coin) pw.insertAdjacentHTML("beforeend", coin); pw.classList.toggle("has-x", !!coin); }
        drawPlan();
        requestAnimationFrame(() => place());
      } else if (islIsLight(s)) {
        // Lighthouse: Now / Target and the Blueprints → Contracts it still needs.
        const tg = tgtOf(s), lo = tgtLo(s), c = lightOf(s);
        pop.querySelector("[data-poptg]").textContent = tg;
        pop.querySelector('[data-iptg="-1"]').disabled = tg <= lo;
        pop.querySelector('[data-iptg="1"]').disabled = tg >= mx;
        pop.querySelector('[data-iptg="max"]').disabled = tg >= mx;
        pop.querySelector("[data-popneed]").innerHTML = tg <= lv ? "" : `<div class="isl-nbox">${c.bp ? esc(t("isl_lh_need")).replace("{b}", `<b class="gd">${bidiNum(c.bp.toLocaleString())} ${bpImg}</b>`).replace("{c}", `<b class="gd">${bidiNum(c.ct.toLocaleString())} ${ctImg}</b>`) : ""}${c.bp ? ` &middot; ${c.short ? `<span class="bs-sw">${esc(t("isl_lh_short").replace("{n}", c.short.toLocaleString()))}</span>` : esc(t("isl_needs_ok"))}` : ""}${c.ess ? `${c.bp ? "<br>" : ""}${esc(t("isl_lh_ess").replace("{e}", c.ess.toLocaleString()))}` : ""}<br><small class="isl-lhn">${esc(t("isl_lh_note"))}</small></div>${c.ct ? (() => { const a = (lightFree().get(s.id) || []); return a.length ? `<div class="isl-freebox"><b>${esc(t("isl_free_title"))}</b> ${a.map((x, i) => `<span class="nw">${esc(t("isl_free_lv").replace("{n}", x.lv).replace("{d}", x.day ? freeMon(x.day) : t("isl_free_now")))}${i === a.length - 1 ? " &#10003;" : ""}</span>`).join(" &middot; ")}</div>` : ""; })() : ""}`;
        const bits = tileBits(s);
        const bg = tileEl.querySelector(".isl-tbg"), ln = tileEl.querySelector(".isl-tsh");
        if (bg) bg.outerHTML = bits.badge || "<span class=\"isl-tbg\" hidden></span>";
        else if (bits.badge) tileEl.insertAdjacentHTML("beforeend", bits.badge);
        if (ln) ln.outerHTML = bits.line || "<span class=\"isl-tsh\" hidden></span>";
        else if (bits.line) tileEl.insertAdjacentHTML("beforeend", bits.line);
        drawPlan();
        requestAnimationFrame(() => place());
      }
    };
    // Where to buy copies: one switch per shop this building can be in (owner: the default
    // list for everyone, site_config island_shops; others: their own list, calc_state
    // island_shards.shops). Shining City also shows its next event date.
    const shopKs = () => (tracked(s) && islShopPickable(s) ? ISL_SHOPS.filter((k) => { const al = islShopAllow(k); return !al || al.includes(s.name); }) : []);
    const drawShops = () => {
      const host = pop.querySelector("[data-popwb]"), ks = shopKs();
      host.hidden = !ks.length;
      if (!ks.length) { host.innerHTML = ""; return; }
      const row = (k) => `<label class="bset-row isl-wbr"><span class="l"><img src="${ISL_SHOP_ICON[k]}" alt="" aria-hidden="true" /><span>${esc(t(k === "mark" ? "isl_wb_mark" : "isl_sc_name"))}</span></span><input type="checkbox" class="bset-sw" data-ipshop="${k}"${islInShop(s.name, k) ? " checked" : ""} /></label>`;
      host.innerHTML = `<div class="isl-wbt">${esc(t("isl_wb_title"))}</div>${ks.map(row).join("")}<div class="isl-wbn">${esc(t(IS_OWNER ? "isl_wb_note_owner" : "isl_wb_note"))}</div>`;
    };
    // Same save as the old ⚙ Shops sheet: the page's building order, and buildings outside
    // the allowed list kept as they were.
    const saveShop = (k, on) => {
      const al = islShopAllow(k), cands = islands.filter((x) => islShopPickable(x) && (!al || al.includes(x.name)));
      const base = IS_OWNER ? islShopDefault(k) : islShopOwn(k) || islShopDefault(k);
      const draft = new Set(IS_OWNER ? base : islShopList(k));
      if (on) draft.add(s.name); else draft.delete(s.name);
      const kept = base.filter((x) => !cands.some((c) => c.name === x));
      const out = [...new Set([...cands.filter((x) => draft.has(x.name)).map((x) => x.name), ...kept])];
      changed = true;
      const after = () => { budgetInvalidate(); spSig = null; if (ISL_POP && ISL_POP.id === String(s.id)) { drawShops(); draw(); } else drawPlan(); };
      if (IS_OWNER) saveSiteConfig("island_shops", { ...islShopsCfg(), [k]: out }).then(after).catch(() => { toast("Couldn't save", true); drawShops(); });
      else { ISL_SHARDS.shops = { ...(ISL_SHARDS.shops || {}), [k]: out }; islSave(); after(); }
    };
    // Opens under the tile, or above it when there's no room below (placePop).
    const place = () => {
      if (!pop.isConnected || !tileEl.isConnected) return;
      const w = Math.min(tracked(s) || islIsLight(s) ? 360 : 300, sections.getBoundingClientRect().width);
      pop.style.width = `${w}px`;
      placePop(pop, tileEl, { align: "center", gap: 8, onPlace: ({ up, left, width }) => {
        pop.classList.toggle("up", up);
        const tr = tileEl.getBoundingClientRect();
        pop.querySelector(".sg-pop-ar").style.left = `${Math.max(10, Math.min(width - 24, tr.left + tr.width / 2 - left - 7))}px`;
      } });
    };
    // Same save path as before (patchSkinQueued); setting a level means you have
    // the island, 0 means not built.
    const setLv = (want) => {
      const mx = maxOf(s), lv = Math.max(0, Math.min(mx, want));
      if (lv === lvOf(s)) return false;
      const patch = { current_level: lv };
      if (!!s.owned !== lv > 0) patch.owned = lv > 0;
      const before = Object.fromEntries(Object.keys(patch).map((k) => [k, s[k]]));
      Object.assign(s, patch);
      changed = true;
      // Raising the level past its target takes the target along.
      if (tracked(s) && ISL_SHARDS.targets[s.id] != null && Number(ISL_SHARDS.targets[s.id]) < lv) { setTgt(s, lv); islSave(); }
      // Lighthouse: Now is also kept in island_shards.light (shared with Scan); the target never stays below it.
      if (islIsLight(s)) { const r = islLightRec(s.id) || {}; ISL_SHARDS.light = { ...ISL_SHARDS.light, [s.id]: { ...r, now: lv, to: r.to != null && r.to !== "" && Number.isFinite(Number(r.to)) ? Math.max(lv, Number(r.to)) : maxOf(s) } }; islSave(); }
      patchSkinQueued(s.id, patch).catch(() => {
        if (Object.keys(patch).every((k) => s[k] === patch[k])) {
          Object.assign(s, before);
          if (ISL_POP && ISL_POP.id === String(s.id)) ISL_POP.close();
          else if (document.getElementById("islandSections")) computeAndRender();
        }
        toast("Couldn't update island", true);
      });
      tileEl.className = `sg-t ${tileCls(s)} sel`;
      tileEl.querySelector(".sg-lvp").innerHTML = pillHtml(s);
      draw();
      drawStats();
      return true;
    };
    const stop = () => {
      clearTimeout(hold); clearInterval(rep); hold = rep = 0;
      document.removeEventListener("pointerup", stop, true);
      document.removeEventListener("pointercancel", stop, true);
    };
    pop.addEventListener("pointerdown", (e) => {
      const b = e.target.closest("[data-ipstep]");
      if (!b || b.disabled) return;
      e.preventDefault();
      const d = Number(b.dataset.ipstep);
      stop();
      setLv(lvOf(s) + d);
      document.addEventListener("pointerup", stop, true);
      document.addEventListener("pointercancel", stop, true);
      hold = setTimeout(() => { rep = setInterval(() => { if (!setLv(lvOf(s) + d)) stop(); }, 110); }, 420);
    });
    pop.addEventListener("click", (e) => {
      const st = e.target.closest("[data-ipstep]");
      if (st) { if (e.detail === 0) setLv(lvOf(s) + Number(st.dataset.ipstep)); return; } // keyboard
      const z = e.target.closest("[data-ipset]");
      if (z) { setLv(z.dataset.ipset === "max" ? maxOf(s) : 0); return; }
      if (e.target.closest("[data-islmkopen]")) { islOpenPacks(); return; }
      const stb = e.target.closest("[data-ipst]");
      if (stb && !stb.disabled) {
        ISL_SHARDS.store = { ...(ISL_SHARDS.store || {}), [s.id]: Math.max(0, storeOf(s) + Number(stb.dataset.ipst)) };
        if (!ISL_SHARDS.store[s.id]) delete ISL_SHARDS.store[s.id];
        islSave(); changed = true; draw();
        return;
      }
      const dtb = e.target.closest("[data-ipdates]");
      if (dtb && IS_OWNER) {
        const cur = srcOf(s), dates = dtb.dataset.ipdates;
        if (cur.dates === dates || (dates === "pack" && cur.dates === "cal")) return;
        const next = cur.next || packDayKey(islDay(islNextEvent(cur).off));
        changed = true;
        Promise.all([dates === "pack" ? islLoadPacks() : null, islSaveSource(s.name, { ...cur, dates, next }, islIsMythic(s))])
          .then(() => { if (ISL_POP && ISL_POP.id === String(s.id)) draw(); else drawPlan(); }).catch(() => toast("Couldn't save", true));
        return;
      }
      const tgb = e.target.closest("[data-iptg]");
      if (tgb && !tgb.disabled) {
        setTgt(s, tgb.dataset.iptg === "max" ? maxOf(s) : tgtOf(s) + Number(tgb.dataset.iptg));
        islSave();
        changed = true;
        draw();
      }
    });
    pop.addEventListener("contextmenu", (e) => e.preventDefault());
    // Owner: how this building is got (saved for everyone right away).
    pop.addEventListener("change", (e) => {
      if (e.target.matches("[data-ipshop]")) { saveShop(e.target.dataset.ipshop, e.target.checked); return; }
      if (e.target.matches("[data-ipprice]") && IS_OWNER) {
        changed = true;
        islSaveSource(s.name, { ...srcOf(s), price: Math.max(0, Number(e.target.value) || 0) }, islIsMythic(s)).then(() => { if (ISL_POP && ISL_POP.id === String(s.id)) draw(); else drawPlan(); }).catch(() => toast("Couldn't save", true));
        return;
      }
      if (e.target.matches("[data-ipevn]")) {
        ISL_SHARDS.evPer = { ...(ISL_SHARDS.evPer || {}), [s.id]: Number(e.target.value) };
        islSave(); changed = true; draw();
        return;
      }
      const sel = pop.querySelector("[data-ipsrc]");
      if (!sel || !(e.target === sel || e.target.matches("[data-ipsrcch], [data-ipsrceach], [data-ipsrceachn], [data-ippack], [data-ipnext]"))) return;
      // A new kind starts from its own defaults (event 1–5, ranked 1, every 30 days).
      const kindChanged = e.target === sel;
      const kind = sel.value, every = 30, choices = kindChanged ? null : pop.querySelector("[data-ipsrcch]").value;
      const same = pop.querySelector("[data-ipsrceach]").value === "1";
      const each = same ? Math.max(1, Number(pop.querySelector("[data-ipsrceachn]").value) || 1) : 0;
      changed = true;
      const cur = srcOf(s);
      let dates = kindChanged ? "" : cur.dates, ev = cur.ev, pack = cur.pack;
      const pv = pop.querySelector("[data-ippack]").value, next = pop.querySelector("[data-ipnext]").value || cur.next;
      if (!kindChanged && e.target.matches("[data-ippack]") && pv) {
        if (pv.startsWith("ev:")) { dates = "cal"; ev = pv.slice(3); } else { dates = "pack"; pack = pv; }
      }
      // Mark price / limit are set in Admin → Islands; kept as they are.
      islSaveSource(s.name, { kind, every, choices, each, dates, ev, pack, next, price: cur.price, ownPrice: cur.ownPrice, markLimit: cur.markLimit }, islIsMythic(s)).then(() => { if (ISL_POP && ISL_POP.id === String(s.id)) draw(); else drawPlan(); }).catch(() => toast("Couldn't save", true));
    });
    ISL_POP = {
      id: String(s.id), place,
      close: (noRedraw) => {
        stop();
        popForget(pop);
        pop.remove();
        tileEl.classList.remove("sel");
        if (ISL_POP && ISL_POP.id === String(s.id)) ISL_POP = null;
        // Chips, filters and the grid follow the new levels once it closes.
        if (changed && !noRedraw && document.getElementById("islandSections")) computeAndRender();
      },
    };
    drawShops();
    draw();
    place();
    if (!ISL_PACKS && IS_OWNER && shopKs().includes("shining")) islLoadPacks().then(() => { if (ISL_POP && ISL_POP.id === String(s.id)) { drawShops(); place(); } });
  }

  function computeAndRender() {
    const sections = document.getElementById("islandSections");
    if (!sections) return;
    const filtered = islands.filter((s) => {
      const groups = groupsFor(s);
      if (ISLAND_FILTER.bonusType !== "all" && !groups.includes(ISLAND_FILTER.bonusType)) return false;
      if (ISLAND_FILTER.ownedFilter === "owned" && !s.owned) return false;
      if (ISLAND_FILTER.ownedFilter === "not" && s.owned) return false;
      if (ISLAND_FILTER.search && !s.name.toLowerCase().includes(ISLAND_FILTER.search.toLowerCase())) return false;
      return true;
    });
    drawStats();
    // Category chips with "built / all" in each.
    renderCategorySwitcher(document.getElementById("islandCatSwitcher"), bonusTypes.map((c) => {
      const inCat = islands.filter((s) => groupsFor(s).includes(c));
      return { key: c, label: c, count: `${inCat.filter(built).length}/${inCat.length}` };
    }), ISLAND_FILTER.bonusType, onIslandCatSelect);
    drawPlan();
    // Budgets' Islands page: the Marks every Mark-shop building still needs (only saved when it changed).
    const mkAll = markNeedAll() + (lightPlan(true).mk || 0), tmAll = sharedPlan(false, true).tomes || 0;
    // Goals per upgrade: each Mark / Shining City shop building with copies to buy, one
    // level at a time; the free copies come first, the bought ones (Marks, then Tomes) last.
    {
      const SPg = sharedPlan(false, true), tp = Number(ISL_RULES.tomePrice) || 600;
      setPageUpgrades("islands", islands.filter((s) => usesMarks(s) || usesTomes(s)).map((s) => {
        const mkN = SPg.mk.get(s.id) || 0, tmN = SPg.tm.get(s.id) || 0, now = lvOf(s), to = tgtOf(s);
        if (to <= now || !(mkN + tmN)) return null;
        const src = srcOf(s), lv1 = !(src.kind === "shop" && !src.price), store = storeOf(s), mp = src.markPrice || 0;
        const free = Math.max(0, copiesLeft(s) - mkN - tmN), lv = [];
        for (let L = now + 1; L <= to; L++) {
          const b = Math.max(0, Math.max(0, islCopiesBetween(now, L, src.each, lv1) - store) - free);
          const m = Math.min(b, mkN), tm = Math.min(Math.max(0, b - mkN), tmN);
          lv.push({ label: String(L), totals: { ...(m ? { "Mark of Revival": m * mp } : {}), ...(tm ? { "Glorious Tome": tm * tp } : {}) } });
        }
        return { k: String(s.id), n: s.name, img: s.image_url || "", a: String(now), lv };
      }).filter(Boolean).concat(islands.filter(islIsLight).map((s) => {
        // Lighthouses: the Contracts to each level (an unlock paid in Life Essence costs none).
        const now = lvOf(s), to = tgtOf(s), c = lightOf(s);
        if (to <= now || !(c.ct || c.mk)) return null;
        const lv = [];
        for (let L = now + 1; L <= to; L++) { const n = islLightCost(c.mk ? 1 : now, L, c.ess > 0).ct; lv.push({ label: String(L), totals: { ...(n ? { [ISL_CONTRACT]: n } : {}), ...(c.mk ? { "Mark of Revival": c.mk } : {}) } }); }
        return { k: String(s.id), n: s.name, img: s.image_url || "", a: String(now), lv };
      }).filter(Boolean)));
    }
    const ctAll = Math.max(0, lightPlan(true).ct - lightPlan(true).free);
    const shAll = sharedPlan(false, true).shNeed || 0;
    recordBudgetNeeds("islands", [{ label: null, totals: { ...(mkAll ? { "Mark of Revival": mkAll } : {}), ...(tmAll ? { "Glorious Tome": tmAll } : {}), ...(ctAll ? { [ISL_CONTRACT]: ctAll } : {}), ...(shAll ? { [ISL_SHARD_ITEM]: shAll } : {}) } }]);
    islFreeShardsRefresh(() => { if (document.getElementById("islandSections") && !ISL_POP) keepPlace(() => computeAndRender()); });
    islMarkCard();
    galMenuToTools("island", "islandCatSwitcher");

    // filtered is already scoped to the one selected category, so render a
    // single flat grid instead of stacked per-category panels.
    if (!filtered.length) {
      sections.innerHTML = `<div class="panel"><div class="empty"><div class="big">No islands match your filters.</div></div></div>`;
      return;
    }
    const moreKey = `island|${ISLAND_FILTER.bonusType}`;
    const tile = (s, down) => galTileHtml({
      id: s.id, attr: "data-island", cls: tileCls(s), img: s.image_url, name: s.name, down, pwExtra: coinHtml(s),
      extra: (() => { const b = tileBits(s); return `<button type="button" class="sg-lvp" data-islv="${esc(s.id)}" aria-haspopup="dialog">${pillHtml(s)}</button>${b.line}${b.badge}`; })(),
    });
    const counted = filtered.filter((s) => !GALLERY_UNCOUNTED.has(String(s.id)));
    // Shards categories: two sections, shard buildings first, then event / ranked ones.
    const split = islCatTracked(ISLAND_FILTER.bonusType) && counted.some(tracked);
    const shardList = split ? counted.filter((s) => srcOf(s).kind !== "event" && srcOf(s).kind !== "ranked") : counted;
    // Playable event buildings first, then ranked ones (page order kept within each).
    const otherList = split ? [...counted.filter((s) => srcOf(s).kind === "event"), ...counted.filter((s) => srcOf(s).kind === "ranked")] : [];
    let html = galGridHtml({
      counted: shardList,
      uncounted: filtered.filter((s) => GALLERY_UNCOUNTED.has(String(s.id))),
      all: split || GAL_MORE.has(moreKey) || !!ISLAND_FILTER.search, tile, cat: ISLAND_FILTER.bonusType, ncDesc: t("isl_nc_desc"),
    });
    if (split) {
      html = html.replace('<div class="sg-nc">', `${otherList.length ? `<div class="isl-sh2 two"><span>${esc(t("isl_sec_other"))}</span><span class="n">${esc(t("isl_sec_n").replace("{n}", otherList.length))}</span></div><div class="isl-shs">${esc(t("isl_sec_other_d"))}</div><div class="sg-grid" data-zone="counted">${otherList.map((s) => tile(s, true)).join("")}</div>` : ""}<div class="sg-nc">`);
    }
    sections.innerHTML = html;
    wireGallerySplit(sections, async (id, toUncounted) => {
      if (ISL_POP) ISL_POP.close(true);
      await setGalleryUncounted(id, toUncounted);
      computeAndRender();
    }, ".sg-t[data-gid]");
    sections.onclick = (e) => {
      if (e.target.closest(".sg-pop")) return;
      if (e.target.closest("[data-galmore]")) { GAL_MORE.add(moreKey); computeAndRender(); return; }
      const el = e.target.closest("[data-island]");
      if (!el || e.target.closest("[data-move]")) return;
      if (ISL_POP && ISL_POP.id === el.dataset.island) ISL_POP.close();
      else openPop(el.dataset.island);
    };
    sections.onkeydown = (e) => {
      if ((e.key === "Enter" || e.key === " ") && e.target.matches("[data-island]")) { e.preventDefault(); openPop(e.target.dataset.island); }
    };
  }

  wireGalTools("island", ISLAND_FILTER, () => { if (ISL_POP) ISL_POP.close(true); computeAndRender(); });
  wirePlan();
  computeAndRender();
  // With buildings in both shops the cheaper one per copy needs the packs' prices: loaded
  // in the background, then the plan is worked out again.
  if (islands.some((x) => usesTomes(x) && usesMarks(x))) {
    const before = ISL_UNIT;
    islUnitPrices().then((u) => { if (seq === RENDER_SEQ && u !== before && document.getElementById("islandSections") && !ISL_POP) { spSig = null; keepPlace(() => computeAndRender()); } });
  }
  // Whether a pack used for Islands gives shards (and how many it can) needs the pack
  // tables: drawn again once they are in when that changes the plan.
  {
    const shBefore = `${islShardPacksOn()}|${islShardSupplyMax()}`;
    ensurePackTables().then(() => { if (seq === RENDER_SEQ && `${islShardPacksOn()}|${islShardSupplyMax()}` !== shBefore && document.getElementById("islandSections") && !ISL_POP) { spSig = null; keepPlace(() => computeAndRender()); } }).catch(() => {});
  }
}
async function renderFacilityPageMain() {
  const seq = RENDER_SEQ;
  const [buildings] = await Promise.all([keptRows("skins", `skins?user_id=eq.${USER_ID}&category=eq.Facility&select=id,name,bonus_type,bonus_value,owned,image_url&order=sort_order.asc`), maxBeforeLoad("facility")]);
  if (seq !== RENDER_SEQ) return;
  content.innerHTML = `<div class="t12x bn-pg">
      ${bnTitleHtml(t("facility_title"), t("fac_desc"), buildings.length ? "facilityMaxAllBtn" : "")}
      <div id="facilityBody"></div>
    </div>`;
  const body = document.getElementById("facilityBody");
  // "Lv. 4 Weapons Facility" -> "Weapons Facility"
  const groupOf = (b) => String(b.name || "").replace(/^\s*Lv\.?\s*\d+\s*/i, "").trim() || (b.bonus_type || "");
  const groups = [];
  buildings.forEach((b) => { const g = groupOf(b); let e = groups.find((x) => x.name === g); if (!e) groups.push((e = { name: g, list: [] })); e.list.push(b); });

  function draw() {
    const owned = buildings.filter((b) => b.owned).length;
    const totals = {}, maxes = {};
    buildings.forEach((b) => {
      if (b.bonus_value == null) return;
      const k = bonusStatKey(b.bonus_type) || "Other";
      maxes[k] = (maxes[k] || 0) + Number(b.bonus_value);
      if (b.owned) totals[k] = (totals[k] || 0) + Number(b.bonus_value);
    });
    const types = Object.keys(maxes).sort((a, b) => { const r = (x) => { const i = BN_STAT_ORDER.indexOf(x); return i === -1 ? 99 : i; }; return r(a) - r(b); });
    const row = (b) => `<button type="button" class="bn-rw ${b.owned ? "yes" : "no"}" data-facility="${esc(b.id)}" role="switch" aria-checked="${!!b.owned}">
        <span class="bn-pi">${b.image_url ? `<img src="${esc(b.image_url)}" alt="" loading="lazy" />` : ""}</span>
        <span class="bn-tx"><b>${esc(dataName(b.name))}</b><span>${b.bonus_value != null ? `<em>${bidiNum(`+${bnFmt(b.bonus_value)}%`)} ${esc(bnAbbr(bonusStatKey(b.bonus_type) || ""))}</em> · ${esc(t("bn_all_troops"))}` : esc(t("bonus_unknown"))}${b.owned ? ` · <span class="ok">${esc(t("bn_owned"))}</span>` : ""}</span></span>
        <span class="bn-sw${b.owned ? " on" : ""}"></span></button>`;
    body.innerHTML = `<div class="t12x-card bn-card">${bnHeadHtml(t("troops_stats_title"), bnCountHtml(owned, "bn_of_owned", buildings.length))}
        ${types.length ? bnBoxesHtml(types.map((k) => ({ label: bnAbbr(k), val: totals[k] || 0, max: maxes[k] }))) : bnBoxesHtml([{ label: t("total_bonus"), val: 0, max: 0 }])}</div>
      ${groups.map((g) => { const ts = [...new Set(g.list.map((b) => bonusStatKey(b.bonus_type)).filter(Boolean))]; return `<div class="t12x-card bn-card">${bnHeadHtml(dataName(g.name), ts.length ? `<i>${esc(ts.map(bnAbbr).join(" · "))}</i>` : "")}${g.list.map(row).join("")}</div>`; }).join("")}`;
  }
  const setOwned = (list) => {
    list.forEach(([b, on]) => {
      if (!!b.owned === on) return;
      // Show it at once; undo it if the save fails.
      b.owned = on;
      patchSkinQueued(b.id, { owned: on }).catch(() => {
        if (b.owned === on) { b.owned = !on; draw(); }
        toast("Couldn't update building", true);
      });
    });
    draw();
  };
  body.onclick = (e) => {
    const card = e.target.closest("[data-facility]");
    if (!card) return;
    const b = buildings.find((x) => x.id === card.dataset.facility);
    if (b) setOwned([[b, !b.owned]]);
  };
  draw();
  if (buildings.length) wirePageMax({
    btnId: "facilityMaxAllBtn", key: "facility",
    allMax: () => buildings.every((b) => b.owned),
    snap: () => Object.fromEntries(buildings.map((b) => [b.id, !!b.owned])),
    max: () => setOwned(buildings.map((b) => [b, true])),
    reset: (kept) => setOwned(buildings.filter((b) => kept && kept[b.id] != null).map((b) => [b, !!kept[b.id]])),
    save: () => {},
    after: () => {},
  });
}
