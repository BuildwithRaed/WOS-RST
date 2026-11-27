// WOS RST: the Budgets page.
// Loaded by app.js the first time Budgets opens (loadCode("budgets"), pageCodeReady),
// so visitors who never open it don't download it. A plain script: its functions and
// variables join app.js's. Only names used by this page alone live here; the planner
// code and the Budgets state other pages read (My Purchases, the Menu, the Dashboard,
// recordBudgetNeeds / budgetInvalidate, admin.js / scan.js / the planner worker) stay
// in app.js. The site loads the packed copy budgets.min.js (tools/stamp.js).
window.BUDGETS_BUILD = "9097fd485c";

// Order of the Budgets page tiles (owner picked A, 22 Nov 2026): per person in
// calc_state budget_page_order = { order: [calcKeys] }; display only. Pages
// not in it keep their built-in place after the saved ones.
let BUDGET_PAGE_ORDER = null;
const B3_ARR_KEY = "budget_pages";
function b3PageOrdered(list) {
  const ord = (BUDGET_PAGE_ORDER && Array.isArray(BUDGET_PAGE_ORDER.order)) ? BUDGET_PAGE_ORDER.order : [];
  if (!ord.length) return list;
  const at = new Map(ord.map((k, i) => [k, i]));
  const saved = list.filter((x) => at.has(x.pg.calcKey)).sort((a, b) => at.get(a.pg.calcKey) - at.get(b.pg.calcKey));
  return saved.concat(list.filter((x) => !at.has(x.pg.calcKey)));
}
async function cdaEnsure() {
  if (!visitorCan("cando")) return;
  await Promise.all([ensureUpgradeOrder(), cdaLoadSettings()]);
  if (CDA_BUILD_P) return CDA_BUILD_P;
  CDA_BUILT = {}; CDA_LOADED = 0; CDA_PLAN_MEMO = null; CDA_NOTE = null;
  let p = null;
  p = CDA_BUILD_P = (async () => {
    const t0 = performance.now();
    const jobs = CDA_PAGES.map((pg) => cdaBuildPage(pg).catch((e) => { console.warn("cando", pg.key, e); return { err: true }; }).then((r) => {
      if (CDA_BUILD_P !== p) return;
      CDA_BUILT[pg.key] = r; CDA_LOADED++;
      cdaDrawBar();
    }));
    const packs = CDA_SET.packs ? cdaWeekPacks().catch(() => null) : null;
    await Promise.all(jobs);
    if (packs) { const wp = await packs; if (CDA_BUILD_P === p) CDA_PACKS = wp; }
    if (CDA_BUILD_P !== p) return;
    window.CDA_LOAD_MS = Math.round(performance.now() - t0);
    p.done = true;
  })();
  return p;
}
// Called after each Budgets draw: starts the build once, then fills the tile, the sheet and the goal chips.
function cdaBudgetsAfterDraw() {
  if (!visitorCan("cando") || TAB !== "budgets") return;
  if (cdaReady()) { cdaFillBudgets(); return; }
  const seq = RENDER_SEQ;
  // A moment later, so the page shows first.
  setTimeout(() => {
    if (seq !== RENDER_SEQ || TAB !== "budgets") return;
    cdaEnsure().then(() => { if (seq === RENDER_SEQ && TAB === "budgets" && cdaReady()) cdaFillBudgets(); }).catch((e) => console.warn("cando", e));
  }, 60);
}
function cdaTileHtml() {
  return visitorCan("cando") ? `<button type="button" class="b3-tile b3-free" data-cdatile data-b3sheet="cando">${cdaTileInner()}</button>` : "";
}
// Budgets plan lines: the pack's own name only (no category, no option list); full title in the tooltip.
function budPackNameHtml(title) {
  const full = String(title || "");
  const n = packDisplayTitle(full, purShortName(purPackName(full, PACK_TABLES_CACHE))) || full;
  return n === full ? esc(full) : `<span title="${esc(full)}">${esc(n)}</span>`;
}
// Plan rows grouped per pack: one line per pack (runs, cost, cadence) and
// the tier/option breakdown underneath - far easier to read than one line
// per option sequence.
function packPlanRowsHtml(plan, resetText) {
  const qty = (v) => Math.round(v).toLocaleString();
  const byPack = [];
  plan.rows.forEach((r) => {
    let g = byPack.find((x) => x.title === r.title);
    if (!g) { g = { title: r.title, count: 0, subtotal: 0, currency: r.currency, reset: r.reset, resetDay: r.resetDay, cycles: r.cycles, perCycle: r.perCycle, lines: [] }; byPack.push(g); }
    g.count += r.count; g.subtotal += packRowLocal(r); g.sample = g.sample || r.price; g.cycles = Math.max(g.cycles, r.cycles);
    g.lines.push(r);
  });
  return byPack.map((g) => `
    <div style="padding:6px 0; border-top:1px solid var(--line);">
      <div style="display:flex; align-items:baseline; gap:8px; flex-wrap:wrap;">
        <span style="font-size:11.5px; font-weight:700;">${budPackNameHtml(g.title)}</span>
        <span style="font-size:11px; color:var(--ice);">&times; ${qty(g.count)}</span>
        ${packStackInfo(g.reset) ? `<span class="meta" style="font-size:10px;">${esc(packStackText(g.reset))}${g.count > packStackInfo(g.reset).atOnce * g.perCycle ? ` · ${esc(t("pack_stack_later").replace("{n}", packStackInfo(g.reset).atOnce * g.perCycle))}` : ""}</span>` : typeof g.reset === "number" ? `<span class="meta" style="font-size:10px;">${esc(resetText(g.reset, g.resetDay))}${g.reset >= PACK_ONE_TIME_DAYS ? "" : ` · ${g.cycles} ${esc(t("pack_resets"))}`}</span>` : ""}
        <span style="margin-inline-start:auto; font-size:12px; font-weight:700;">${packFmtLocal(g.subtotal, g.currency, false, g.sample)}</span>
      </div>
      <div style="margin-top:3px; padding-inline-start:10px; font-size:10.5px; line-height:1.55;">
        ${g.lines.sort((a, b) => b.count - a.count).map((r) => `<div style="display:flex; gap:6px; align-items:baseline;"><span style="color:var(--ice); min-width:34px; text-align:end;">${qty(r.count)}&times;</span><span>${esc(r.label)}</span><span class="meta" style="margin-inline-start:auto;">${packFmtLocal(packRowLocal(r), r.currency, false, r.price)}</span></div>`).join("")}
      </div>
    </div>`).join("");
}
// The currency a viewer picked on the Packs page (row 2 of the price strip),
// remembered even while they look at US dollars.
function packsPageCurrency() {
  try { return localStorage.getItem("packs_currency") || ""; } catch (e) { return ""; }
}
// Budgets only offers the two currencies from the Packs page: US dollars and
// the one picked there (with the store prices typed for it).
function currencyOptionsHtml(c, showingMine) {
  return `<option value="" ${showingMine ? "" : "selected"}>USD $</option>
      ${c ? `<option value="${c.code}" ${showingMine ? "selected" : ""}>${c.code} ${esc(c.symbol)}</option>` : ""}`;
}
// Just the currency dropdown (Budgets Settings rows put the label themselves).
function currencySelectHtml(attr) {
  const mine = packsPageCurrency() || (DISPLAY_CURRENCY && DISPLAY_CURRENCY !== "USD" ? DISPLAY_CURRENCY : "");
  const c = PACK_CURRENCIES.find((x) => x.code === mine);
  return `<select ${attr}>${currencyOptionsHtml(c, !!c && DISPLAY_CURRENCY === mine)}</select>`;
}
// Budgets: the levels of a page's target that aren't open in the person's
// state yet (Chief Charm / Chief Gear / Hero Gear), e.g. "Lv 12 – 18".
function budgetNotOpenText(calcKey) {
  if (calcKey === "charm" && CHARM_LEVELS.length) {
    const cap = charmCapIdx();
    let hi = -1;
    CHARM_PIECES.forEach((p) => (CHARM_CALC_STATE[p.key] || []).forEach((sl) => { const c = CHARM_LEVELS.indexOf(String(sl.current)), tg = CHARM_LEVELS.indexOf(String(sl.target)); if (tg > c && tg > cap) hi = Math.max(hi, tg); }));
    return hi > cap ? `${t("goal_lv")} ${bidiNum(`${CHARM_LEVELS[cap + 1]} – ${CHARM_LEVELS[hi]}`)}` : "";
  }
  if (calcKey === "chief_gear" && CHIEF_GEAR_ROWS && CHIEF_GEAR_ROWS.length) {
    const cap = chiefGearCapIdx(), last = CHIEF_GEAR_ROWS.length - 1;
    let hi = -1;
    CHIEF_GEAR_PIECES.forEach((p) => { const st = CHIEF_GEAR_STATE[p.key], to = Math.min(st.to ?? 0, last); if (to > st.from && to > cap) hi = Math.max(hi, to); });
    return hi > cap ? `${chiefGearRowLabel(CHIEF_GEAR_ROWS[cap + 1])} – ${chiefGearRowLabel(CHIEF_GEAR_ROWS[hi])}` : "";
  }
  if (calcKey === "hero_gear" && HERO_GEAR_TABLES_CACHE) {
    const out = [];
    GEAR_LEVELING_TABLES.forEach((tn) => {
      const rows = HERO_GEAR_TABLES_CACHE[tn] || [], cap = heroTrackCapIdx(tn);
      let hi = -1;
      budgetHgSetStates().forEach((setState) => HERO_GEAR_TROOPS.forEach((tr) => HERO_GEAR_PIECE_NAMES.forEach((pc) => { const st = setState[tr][pc][tn]; if (st && st.to > st.from && st.to > cap) hi = Math.max(hi, st.to); })));
      if (hi > cap && rows[cap + 1] && rows[hi]) out.push(`${trackDisplayName(tn)} ${rowLabel(rows[cap + 1])} – ${rowLabel(rows[hi])}`);
    });
    return out.join(", ");
  }
  return "";
}
function budgetPlansForget() {
  try {
    budgetPlansIndex().forEach((e) => localStorage.removeItem(BUDGET_PLAN_ITEM + e.key));
    // (also any plan left without its list entry)
    for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (k && k.startsWith(BUDGET_PLAN_ITEM)) localStorage.removeItem(k); }
    localStorage.removeItem(BUDGET_PLANS_INDEX);
    localStorage.removeItem(BUDGET_PLAN_STORE);
  } catch (e) { /* storage blocked */ }
}
// "Recalculate": forget every kept copy and work everything out again.
function budgetForceRecalc() {
  budgetPlansForget();
  // (the goals' dated plan too: its kept copy is dropped, so it is worked out again)
  budgetDeadlineDrop();
  BUDGET_DEADLINE = { key: null, res: null, running: null, req: null, onReady: null };
  try { localStorage.removeItem(BUDGET_DEADLINE_STORE); } catch (e) { /* storage blocked */ }
  // The Budgets plan being worked out is dropped (a new one starts); other
  // requests (Pack cost, widget prices, My Purchases) go on in the fresh worker.
  if (BUDGET_PLAN_TRACK.req) { budgetTrackDrop(BUDGET_PLAN_TRACK); BUDGET_PLAN_TRACK = {}; }
  plannerRestart();
  if (typeof PACK_PLAN_CACHE !== "undefined") { PACK_PLAN_CACHE.clear(); PACK_EARLIEST_CACHE.clear(); }
  if (typeof TRADE_EXTRA_SIG !== "undefined") TRADE_EXTRA_SIG = "";
  PACK_TABLES_CACHE = PACK_TABLES_STASH = null;
  TRADE_RATES_CACHE = null;
  BUDGET_NEEDS_SNAPSHOT = null;
  BUDGET_PLAN_RUNNING = null;
  BUDGET_PLAN_FAILED = null;
  budgetInvalidate();
  dashDataChanged();
}
let BUDGET_VIEW = "main";      // which plan card is shown: "main" | "fastest" | "cheapest" (saved: budgetFollowView, also followed by My Purchases)
let BUDGET_GOALS_OPEN = true; // the card's fold (kept for the visit)
let BUDGET_GOAL_ADD = null;   // { page } while "+ Add mini target" is open
// Upcoming dates a goal can be "By" (about 6 months): game events (SvS, KOI, the admin's),
// Lucky Wheels (day 2–4 of each) and new heroes; { v (saved value), kind, a, b (Dates), name, col }.
function goalByEvents() {
  const t0 = packStartOfToday(), end = new Date(t0.getTime() + 183 * 86400000), DAY = 86400000, out = [];
  GAME_EVENTS.forEach((ev) => gameEventStarts(ev, t0, end).filter((d) => d > t0 && d <= end).forEach((d) => out.push({ v: `ev:${ev.key}:${packDayKey(d)}`, kind: ev.key, a: d, b: new Date(d.getTime() + (ev.days - 1) * DAY), name: ev.name, col: gameEventColor(ev.key) })));
  heroWheels(new Date(t0.getTime() + DAY), end).filter((w) => Number(w.ev.wheelDay) > 0).forEach((w) => out.push({ v: `ev:wheel:${packDayKey(w.day)}`, kind: "wheel", a: w.day, b: new Date(w.day.getTime() + Math.max(0, (w.ev.wheelDays || 1) - 1) * DAY), name: `${t("pack_cal_wheel")} \u00b7 ${w.ev.name}`, col: PACK_CAL_COL.wheel }));
  newGenStarts(newGenBaseDay(), 6).filter((d) => d > t0 && d <= end).forEach((d) => out.push({ v: `ev:gen:${packDayKey(d)}`, kind: "gen", a: d, b: d, name: t("pack_cal_new_heroes"), col: "#facc15", star: true }));
  return out.sort((x, y) => x.a - y.a || x.name.localeCompare(y.name));
}
// K4: the small pop-over under a goal's By chip: the event list, or a month to pick any day.
// `no` (a goal of a hero not out yet): { gen, rel, forge } — days before the release
// can't be picked (greyed, struck), the release and its Forge pack are offered.
function goalByPopHtml(myBy, mainDay, no) {
  const t0 = packStartOfToday(), DAY = 86400000, loc = LANG === "en" ? undefined : LANG;
  const relD = no ? new Date(t0.getTime() + no.rel * DAY) : null;
  const md = (d) => d.toLocaleDateString(loc, { day: "numeric", month: "short", timeZone: "UTC" });
  const rng = (a, b) => (b.getTime() === a.getTime() ? md(a) : a.getUTCMonth() === b.getUTCMonth() ? `${md(a)} \u2013 ${b.getUTCDate()}` : `${md(a)} \u2013 ${md(b)}`);
  const evs = goalByEvents(), myD = goalDeadlineDay(myBy), myK = goalByKind(myBy);
  // Old values ("svs", "koi", "gen") light the next one of their kind.
  const lit = (e) => e.v === myBy || (!String(myBy).startsWith("ev:") && myK === e.kind && myD != null && Math.round((e.a - t0) / DAY) === myD);
  const tgt = mainDay != null ? new Date(t0.getTime() + mainDay * DAY) : null;
  if (BUDGET_BY_CAL) {
    const C = BUDGET_BY_CAL, [y, m] = C.m.split("-").map(Number), first = new Date(Date.UTC(y, m - 1, 1));
    const start = new Date(first.getTime() - ((first.getUTCDay() + 6) % 7) * DAY), cells = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start.getTime() + i * DAY), key = packDayKey(d);
      if (i >= 35 && d.getUTCMonth() !== m - 1) break;
      const dots = evs.filter((e) => d >= e.a && d <= e.b).slice(0, 3).map((e) => `<i style="background:${e.col}"></i>`).join("");
      const cls = [d.getUTCMonth() !== m - 1 ? "out" : "", d.getTime() === t0.getTime() ? "today" : "", tgt && d.getTime() === tgt.getTime() ? "tg" : "", C.sel === key ? "on" : ""].filter(Boolean).join(" ");
      cells.push(`<button type="button" class="${cls}" data-gbpday="${key}" ${d < t0 || (relD && d < relD) ? "disabled" : ""}><b>${d.getUTCDate()}</b><span>${dots}</span></button>`);
    }
    const sd = C.sel ? packParseDay(C.sel) : null, n = sd ? Math.round((sd - t0) / DAY) : 0;
    const mon = first.toLocaleDateString(loc, { month: "long", year: "numeric", timeZone: "UTC" });
    const canPrev = first > new Date(Date.UTC(t0.getUTCFullYear(), t0.getUTCMonth(), 1));
    const wk = [0, 1, 2, 3, 4, 5, 6].map((i) => new Date(Date.UTC(2024, 0, 1 + i)).toLocaleDateString(loc, { weekday: "narrow", timeZone: "UTC" }));
    return `<div class="gbp cal" role="dialog" aria-label="${esc(t("gbp_pick_date"))}">
      <div class="gbp-ch"><button type="button" class="gbp-back" data-gbpback>&#8249; ${esc(t("gbp_back"))}</button><small>${esc(t("gbp_today").replace("{d}", md(t0)))}</small></div>
      <div class="gbp-mh"><button type="button" data-gbpmon="-1" ${canPrev ? "" : "disabled"} aria-label="&#8249;">&#8249;</button><b>${esc(mon)}</b><button type="button" data-gbpmon="1" aria-label="&#8250;">&#8250;</button></div>
      <div class="gbp-grid">${wk.map((w) => `<em>${esc(w)}</em>`).join("")}${cells.join("")}</div>
      <div class="gbp-leg"><span><i style="background:${gameEventColor("svs")}"></i>SvS</span><span><i style="background:${gameEventColor("koi")}"></i>KOI</span><span><i style="background:${PACK_CAL_COL.wheel}"></i>${esc(t("pack_cal_wheel"))}</span><span><i style="background:#facc15"></i>${esc(t("gu_by_gen_s"))}</span>${GAME_EVENTS.filter((e) => e.key !== "svs" && e.key !== "koi").map((e) => `<span><i style="background:${gameEventColor(e.key)}"></i>${esc(e.name)}</span>`).join("")}<span>&#9733; ${esc(t("gu_by_tg_s"))}</span></div>
      <div class="gbp-use"><span>${sd ? `<b>${esc(md(sd))}</b> \u00b7 ${esc(t("gbp_in_days").replace("{n}", n))}` : esc(t("gbp_tap_day"))}</span><button type="button" class="btn small" data-gbpuse ${sd ? "" : "disabled"}>${esc(sd ? t("gbp_use").replace("{d}", md(sd)) : t("gbp_use_x"))}</button></div>
    </div>`;
  }
  const row = (v, dot, name, when, on, off, sub) => `<button type="button" class="gbp-r${on ? " on" : ""}${off ? " off" : ""}" data-goalbyset="${esc(v)}"${off ? " disabled" : ""}>${dot}<span class="gbp-n">${esc(name)}${sub ? ` <small>${esc(sub)}</small>` : ""}</span><span class="gbp-w">${esc(when)}</span>${on ? '<span class="gbp-ok">&#10003;</span>' : ""}</button>`;
  let h = "", early = "";
  if (myK === "date" && myD != null) h += row(myBy, '<span class="gbp-ic">&#128197;</span>', t("gbp_your_date"), md(new Date(t0.getTime() + myD * DAY)), true, no && myD < no.rel);
  const mainRow = row("", '<span class="gbp-ic st">&#9733;</span>', t("goal_by_main"), tgt ? md(tgt) : "\u2014", !myBy, no && mainDay != null && mainDay < no.rel);
  // Not out yet: what comes before the release is listed first, greyed and struck.
  if (no && mainDay != null && mainDay < no.rel) early += mainRow; else h += `<div class="gbp-hd">${esc(t("gbp_targets"))}</div>` + mainRow;
  const list = evs.slice();
  if (no) {
    const fd = new Date(t0.getTime() + no.forge * DAY);
    if (no.forge <= 200) list.push({ v: `ev:forge:${packDayKey(fd)}`, kind: "forge", a: fd, b: fd, name: t("gbp_forge"), sub: t("ht_widgets"), col: "#e8b44c" });
    list.sort((x, y) => x.a - y.a || x.name.localeCompare(y.name));
  }
  let mon = "";
  const earlyEv = [];
  list.forEach((e) => {
    const isRel = no && e.kind === "gen" && relD && e.a.getTime() === relD.getTime();
    const dot = e.star ? '<span class="gbp-ic st">&#11088;</span>' : `<i class="gbp-dot" style="background:${e.col}"></i>`;
    if (no && e.a < relD) { earlyEv.push(row(e.v, dot, e.name, rng(e.a, e.b), lit(e), true)); return; }
    const mm = e.a.toLocaleDateString(loc, { month: "long", ...(e.a.getUTCFullYear() !== t0.getUTCFullYear() ? { year: "numeric" } : {}), timeZone: "UTC" });
    if (mm !== mon) { mon = mm; h += `<div class="gbp-hd">${esc(mm)}</div>`; }
    h += row(e.v, dot, isRel ? t("gbp_release") : e.name, rng(e.a, e.b), lit(e), false, isRel ? `Gen ${no.gen}` : e.sub);
  });
  early += earlyEv.slice(-2).join(""); // (the last two before the release are enough to show why)
  const lock = no ? `<div class="gbp-lock">&#128274; <b>${esc(t("gbp_lock_b").replace("{g}", no.gen).replace("{d}", md(relD)))}</b> ${esc(t("gbp_lock"))}</div>` : "";
  return `<div class="gbp${no ? " no" : ""}" role="dialog" aria-label="${esc(t("goal_by_title"))}"><div class="gbp-t">${esc(t("gbp_upcoming"))}</div><div class="gbp-l">${lock}${early ? `<div class="gbp-early">${early}</div>` : ""}${h}</div><button type="button" class="gbp-pick" data-gbpcal>&#128197; ${esc(t("gbp_pick_date"))}</button></div>`;
}
// ---- Budgets Settings sheet = T2 "Summary first" ----
// "Your plan" card on top, then folds that open one at a time (kept for the
// visit): Target date (quick chips, the K4-style list and a mini month),
// Currency, My budget (admin unless Visibility opens it), New hero packs first.
let BUDGET_SET_OPEN = "target"; // the open fold: "target" | "cur" | "spend" | "ngf" | null
let BUDGET_TGT_POP = null;      // the date list under "Done by": { cal: null | { m, sel } }
let BUDGET_SET_SAVED = 0;       // when the target was last saved here (the green "Saved" pill)
function bstMd(d) { return d.toLocaleDateString(LANG === "en" ? undefined : LANG, { day: "numeric", month: "short", timeZone: "UTC" }); }
// The new heroes "New hero packs first" covers (faces), whether it is on or not.
function bstNgHeroes() {
  const seen = new Set(), out = [];
  ngFirstVirtual(true).forEach((p) => { if (!seen.has(p.hero)) { seen.add(p.hero); out.push(p.hero); } });
  return out;
}
function bstFacesHtml(names) {
  return names.length ? `<div class="bst-faces">${names.map((n) => { const im = HERO_IMG_BY_NAME[n]; return `<span>${im ? `<img src="${esc(im)}" alt="" loading="lazy" />` : ""}${esc(n)}</span>`; }).join("")}</div>` : "";
}
function bstNextDays() {
  const t0 = packStartOfToday(), DAY = 86400000, end = new Date(t0.getTime() + 200 * DAY);
  const sv = (GAME_EVENTS || []).find((e) => e.key === "svs");
  const svs = sv ? gameEventStarts(sv, t0, end).find((d) => d > t0) : null;
  const gen = (newGenStarts(newGenBaseDay(), 6) || []).find((d) => d > t0) || null;
  return { svs, gen };
}
function bstTargetPopHtml(targetDays) {
  const t0 = packStartOfToday(), DAY = 86400000;
  const P = BUDGET_TGT_POP || {};
  if (P.cal) {
    const keep = BUDGET_BY_CAL;
    BUDGET_BY_CAL = P.cal;
    let h;
    try { h = goalByPopHtml("", targetDays, null); } finally { BUDGET_BY_CAL = keep; }
    const sd = P.cal.sel ? packParseDay(P.cal.sel) : null, n = sd ? Math.round((sd - t0) / DAY) : 0;
    const use = `<div class="gbp-use"><span>${sd ? `<b>${esc(bstMd(sd))}</b> · ${esc(t("gbp_in_days").replace("{n}", n))}` : esc(t("gbp_tap_day"))}</span><span class="bst-use-b"><button type="button" class="btn small ghost" data-bstback>${esc(t("bst_cancel"))}</button><button type="button" class="btn small" data-bstuse ${sd ? "" : "disabled"}>${esc(sd ? t("bst_set_d").replace("{d}", bstMd(sd)) : t("gbp_use_x"))}</button></span></div>`;
    return h.replace(/<div class="gbp-use">[\s\S]*?<\/div>\s*<\/div>\s*$/, use + "</div>")
      .replace('class="gbp cal"', 'class="gbp cal bst-pop"')
      .replace(/data-gbpday=/g, "data-bstday=").replace(/data-gbpmon=/g, "data-bstmon=").replace(/data-gbpback/g, "data-bstback");
  }
  const tg = targetDays != null ? new Date(t0.getTime() + targetDays * DAY) : null;
  const row = (key, dot, name, when, on, sub) => `<button type="button" class="gbp-r${on ? " on" : ""}" data-bstset="${esc(key)}">${dot}<span class="gbp-n">${esc(name)}${sub ? ` <small>${esc(sub)}</small>` : ""}</span><span class="gbp-w">${esc(when)}</span>${on ? '<span class="gbp-ok">&#10003;</span>' : ""}</button>`;
  let h = "";
  if (tg) h += row(packDayKey(tg), '<span class="gbp-ic">&#128197;</span>', t("gbp_your_date"), bstMd(tg), true);
  h += `<div class="bst-wks">${[2, 4, 8].map((w) => { const d = new Date(t0.getTime() + w * 7 * DAY); return `<button type="button" data-bstset="${packDayKey(d)}"><b>${esc(t("bst_plus_w").replace("{n}", w))}</b><small>${esc(bstMd(d))}</small></button>`; }).join("")}</div>`;
  const rng = (a, b) => (b.getTime() === a.getTime() ? bstMd(a) : a.getUTCMonth() === b.getUTCMonth() ? `${bstMd(a)} – ${b.getUTCDate()}` : `${bstMd(a)} – ${bstMd(b)}`);
  const list = goalByEvents().slice();
  // The next Exclusive Gear Forge (widgets) after each new heroes day.
  const gens = list.filter((e) => e.kind === "gen");
  gens.forEach((e) => { const fd = new Date(e.a.getTime() + ngForgeDays() * DAY); list.push({ kind: "forge", a: fd, b: fd, name: t("bst_forge_opens"), sub: t("ht_widgets"), col: "#e8b44c" }); });
  const cut = new Date(t0.getTime() + 183 * DAY);
  let mon = "";
  list.filter((e) => e.a <= cut).sort((x, y) => x.a - y.a || x.name.localeCompare(y.name)).forEach((e) => {
    const mm = e.a.toLocaleDateString(LANG === "en" ? undefined : LANG, { month: "long", ...(e.a.getUTCFullYear() !== t0.getUTCFullYear() ? { year: "numeric" } : {}), timeZone: "UTC" });
    if (mm !== mon) { mon = mm; h += `<div class="gbp-hd">${esc(mm)}</div>`; }
    const dot = e.star ? '<span class="gbp-ic st">&#11088;</span>' : `<i class="gbp-dot" style="background:${e.col}"></i>`;
    const gen = e.kind === "gen" ? (() => { const g = newGenGen(); const k = (newGenStarts(newGenBaseDay(), 6) || []).findIndex((d) => d.getTime() === e.a.getTime()); return g && k >= 0 ? `Gen ${g + k}` : ""; })() : e.sub;
    h += row(packDayKey(e.a), dot, e.name, rng(e.a, e.b), false, gen);
  });
  return `<div class="gbp bst-pop" role="dialog" aria-label="${esc(t("bst_upcoming"))}"><div class="gbp-t">${esc(t("bst_upcoming"))}</div><div class="gbp-l">${h}</div><button type="button" class="gbp-pick" data-bstcal>&#128197; ${esc(t("gbp_pick_date"))}</button></div>`;
}
function budgetSettingsHtml(targetDays) {
  const t0 = packStartOfToday(), DAY = 86400000;
  const tg = targetDays != null ? new Date(t0.getTime() + targetDays * DAY) : null;
  const saved = Date.now() - BUDGET_SET_SAVED < 6000;
  const cur = DISPLAY_CURRENCY || "USD";
  const spOn = spendFeatureOn(), sp = spOn ? spendSettings() : null, amt = spOn ? spendAmountLocal() : 0;
  const perTxt = (sp && sp.per === "week") ? t("spend_week_s") : t("spend_month_s");
  const ngOn = ngFirstOn(), ngH = bstNgHeroes();
  const pills = [`<span>${esc(cur)}</span>`];
  if (spOn && amt > 0) pills.push(`<span>${esc(t("bst_budget_pill").replace("{v}", Math.round(amt).toLocaleString()).replace("{per}", perTxt))}</span>`);
  if (ngOn) pills.push(`<span>${esc(t("bst_ngf_pill"))} &#10003;</span>`);
  const sumTitle = tg ? (targetDays < 0 ? t("bst_planning_over").replace("{d}", bstMd(tg)) : t("bst_planning_to").replace("{d}", bstMd(tg)).replace("{n}", targetDays)) : t("pack_no_date");
  const sum = `<div class="bst-sum"><div class="bst-k">${esc(t("bst_your_plan"))}</div><div class="bst-v${saved ? " ok" : ""}">${esc(sumTitle)}</div><div class="bst-pills">${pills.join("")}</div></div>`;
  const fold = (key, ic, title, sub, body, tag) => {
    const open = BUDGET_SET_OPEN === key;
    return `<div class="bst-f${open ? " open" : ""}" data-bstfold="${key}"><button type="button" class="bst-fh" data-bstf="${key}" aria-expanded="${open}"><span class="bst-ic">${ic}</span><span class="bst-ft"><b>${esc(title)}${tag || ""}</b><small>${sub}</small></span><span class="bst-ar">${open ? "&#9652;" : "&#9662;"}</span></button>${open ? `<div class="bst-fb">${body}</div>` : ""}</div>`;
  };
  // Target date
  const nx = bstNextDays();
  const dateTxt = tg ? tg.toLocaleDateString(LANG === "en" ? "en-GB" : LANG, { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }) : "—";
  const tgSub = tg ? `${esc(tg.toLocaleDateString(LANG === "en" ? undefined : LANG, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }))} · ${targetDays < 0 ? esc(t("pack_overdue")) : `${targetDays} ${esc(t("pack_days_left"))}`}` : esc(t("pack_no_date"));
  const chip = (cls, d, label) => (d ? `<button type="button" class="bst-chip ${cls}" data-bstset="${packDayKey(d)}" title="${esc(bstMd(d))}">${esc(label)}</button>` : "");
  const tgBody = `<div class="bset-row bst-dr"><span class="bset-l">${esc(t("bst_done_by"))}</span><span class="bset-c"><button type="button" class="bst-date${BUDGET_TGT_POP ? " on" : ""}" data-bstdate aria-expanded="${!!BUDGET_TGT_POP}">${esc(dateTxt)} <span aria-hidden="true">&#128197;</span></button>${BUDGET_TARGET ? `<button type="button" class="btn small ghost bset-x" data-budgettargetclear title="${esc(t("pack_no_date"))}">&times;</button>` : ""}</span></div>
    ${BUDGET_TGT_POP ? bstTargetPopHtml(targetDays) : ""}
    <div class="bst-chips">${chip("sv", nx.svs, t("bst_next_svs"))}${chip("gen", nx.gen, t("bst_new_gen"))}${chip("", new Date(t0.getTime() + 28 * DAY), t("bst_plus_w").replace("{n}", 4))}</div>`;
  let h = sum + fold("target", "&#127919;", t("bst_target"), tgSub, tgBody, saved ? ` <span class="bst-saved">&#10003; ${esc(t("bst_saved"))}</span>` : "");
  // Currency
  h += fold("cur", "&#128177;", t("bst_currency"), esc(cur), `<div class="bset-row"><span class="bset-l">${esc(t("show_prices_in"))}</span><span class="bset-c">${currencySelectHtml(`id="budgetsCurrency" aria-label="${esc(t("show_prices_in"))}"`)}</span></div><div class="meta bset-note">${esc(t("bst_cur_note"))}</div>`);
  // My budget
  if (spOn) {
    const visitorsToo = !!((siteConfig("visitor_access", {}) || {}).spendbudget === true);
    const adminOnly = IS_OWNER && !visitorsToo;
    const tag = adminOnly ? ` <span class="bset-tag" title="${esc(t("spend_admin_only"))}">&#128274; ${esc(t("spend_admin_tag"))}</span>` : "";
    const sub = amt > 0 ? esc(t("bst_spend_sub").replace("{v}", `${Math.round(amt).toLocaleString()} ${packLocalCode("USD", 4.99)}`).replace("{per}", perTxt)) + (sp.carry ? ` · ${esc(t("bst_spend_keep"))}` : "") : esc(t("bst_spend_off"));
    const body = `<div class="bud-spend">
      <div class="bset-row"><span class="bset-l">${esc(t("spend_amount"))}</span><span class="bset-c"><input type="number" min="0" step="1" inputmode="decimal" data-spendamt value="${amt > 0 ? Math.round(amt) : ""}" placeholder="0" aria-label="${esc(t("spend_title"))}" /><span class="meta">${esc(packLocalCode("USD", 4.99))}</span><span class="bud-spend-per"><button type="button" data-spendper="week" class="${sp.per === "week" ? "on" : ""}">${esc(t("spend_week_s"))}</button><button type="button" data-spendper="month" class="${sp.per === "month" ? "on" : ""}">${esc(t("spend_month_s"))}</button></span></span></div>
      <label class="bset-row" style="cursor:pointer;"><span class="bset-l">${esc(t("spend_carry_short"))}<small>${esc(t("spend_carry_sub"))}</small></span><input type="checkbox" class="bset-sw" data-spendcarry ${sp.carry ? "checked" : ""} aria-label="${esc(t("spend_carry"))}" /></label>
      ${amt > 0 ? "" : `<div class="meta bset-note">${esc(t("spend_hint"))}</div>`}
      ${adminOnly ? `<div class="meta bset-note">${esc(t("spend_visitors_note"))}</div>` : ""}
    </div>`;
    h += fold("spend", "&#128176;", t("spend_title"), sub, body, tag);
  }
  // New hero packs first
  const ngSub = `${esc(ngOn ? t("bst_ngf_on") : t("bst_ngf_off"))}${ngH.length ? ` · ${esc(ngH.join(" · "))}` : ""}`;
  const ngBody = `<label class="bset-row" style="cursor:pointer;"><span class="bset-l">${esc(t("bst_ngf_row"))}<small>${esc(t("bst_ngf_desc"))}</small></span><input type="checkbox" class="bset-sw" data-bstngf ${ngOn ? "checked" : ""} aria-label="${esc(t("bst_ngf"))}" /></label>${ngH.length ? bstFacesHtml(ngH) : `<div class="meta bset-note">${esc(t("bst_ngf_none"))}</div>`}`;
  h += fold("ngf", "&#129464;", t("bst_ngf"), ngSub, ngBody, ` <span class="bst-new">${esc(t("bst_new"))}</span>`);
  h += `<button type="button" class="bst-rc" data-budgetrecalc>&#8635; ${esc(t("bst_recalc"))}</button>`;
  return `<div class="t12x-settings b3-set bst">${h}</div>`;
}
// The sheet's own taps (the date list, the folds, the switch); the rest keep their handlers.
function wireBudgetSettings(content, redraw) {
  const box = content.querySelector(".bst");
  if (!box) return;
  const saveTarget = (v) => {
    BUDGET_TARGET = v || "";
    saveCalcState("pack_target_budgets", { date: BUDGET_TARGET });
    BUDGET_TGT_POP = null; BUDGET_SET_SAVED = Date.now();
    redraw();
  };
  box.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b || !box.contains(b)) return;
    if (b.dataset.bstf) { BUDGET_SET_OPEN = BUDGET_SET_OPEN === b.dataset.bstf ? null : b.dataset.bstf; if (BUDGET_SET_OPEN !== "target") BUDGET_TGT_POP = null; redraw(); return; }
    if (b.hasAttribute("data-bstdate")) { BUDGET_TGT_POP = BUDGET_TGT_POP ? null : { cal: null }; redraw(); return; }
    if (b.dataset.bstset) { saveTarget(b.dataset.bstset); return; }
    if (b.hasAttribute("data-bstcal")) { const sel = BUDGET_TARGET || null; BUDGET_TGT_POP = { cal: { m: (sel || packDayKey(packStartOfToday())).slice(0, 7), sel } }; redraw(); return; }
    if (b.hasAttribute("data-bstback")) { BUDGET_TGT_POP = { cal: null }; redraw(); return; }
    if (b.dataset.bstmon && BUDGET_TGT_POP && BUDGET_TGT_POP.cal) { const [y, m] = BUDGET_TGT_POP.cal.m.split("-").map(Number), d = new Date(Date.UTC(y, m - 1 + Number(b.dataset.bstmon), 1)); BUDGET_TGT_POP = { cal: { ...BUDGET_TGT_POP.cal, m: packDayKey(d).slice(0, 7) } }; redraw(); return; }
    if (b.dataset.bstday && BUDGET_TGT_POP && BUDGET_TGT_POP.cal) { BUDGET_TGT_POP = { cal: { ...BUDGET_TGT_POP.cal, sel: b.dataset.bstday } }; redraw(); return; }
    if (b.hasAttribute("data-bstuse") && BUDGET_TGT_POP && BUDGET_TGT_POP.cal && BUDGET_TGT_POP.cal.sel) { saveTarget(BUDGET_TGT_POP.cal.sel); return; }
  });
  const ng = box.querySelector("[data-bstngf]");
  if (ng) ng.addEventListener("change", () => {
    saveCalcState("budget_prefs", { ...budgetPrefs(), ngFirst: ng.checked });
    if (typeof PACK_PLAN_CACHE !== "undefined") { PACK_PLAN_CACHE.clear(); PACK_EARLIEST_CACHE.clear(); }
    budgetInvalidate();
    redraw();
  });
}
// Heroes page window: what "New hero packs first" counted as bought.
function ngFirstNoteHtml() {
  if (!ngFirstOn()) return "";
  const v = ngFirstVirtual();
  if (!v.length) return "";
  const hs = [...new Set(v.map((p) => p.hero))];
  const fw = v.find((p) => p.kind === "w"), parts = [];
  if (fw) parts.push(t("bud_ngf_forge").replace("{n}", (Number(fw.row) || 0) + 1));
  if (v.some((p) => p.kind === "s")) parts.push(t("bud_ngf_value"));
  return `<div class="bud-vip bud-ngf">&#129464; ${esc(t("bud_ngf_note").replace("{h}", hs.join(", ")).replace("{w}", parts.join(" + ")))}</div>`;
}
let BUDGET_TR_TAB = "free";    // a page sheet's trades tab: "free" | "packs" (for the visit)
let BUDGET_HT_OPEN = false;     // Hero targets fold (for the visit)
let BUDGET_HT_DONE_OPEN = false; // its "N heroes at target" line (for the visit)
function saveBudgetGoals() {
  saveCalcState("budget_goals", BUDGET_GOALS);
  // The hero goals' order decides which hero the free General shards / Gen widgets go to first.
  if (HERO_GOAL_ORDER_SIG != null && heroGoalOrderSig() !== HERO_GOAL_ORDER_SIG) { HERO_GOAL_ORDER_SIG = heroGoalOrderSig(); budgetInvalidate(); }
}
// Pages whose upgrades aren't known yet (saved before per-upgrade goals): open them once.
function goalUpMissing(keys) {
  return keys.filter((k) => GOAL_UP_SAVED.includes(k) && BUDGET_NEEDS_SNAPSHOT && BUDGET_NEEDS_SNAPSHOT[k] && !("ups" in BUDGET_NEEDS_SNAPSHOT[k]));
}
// The kind of a "By" value: "svs" / "koi" / another event key / "wheel" / "gen" / "date" / "" (main target).
function goalByKind(by) {
  if (!by) return "";
  const b = String(by);
  if (b.startsWith("ev:")) return b.split(":")[1] || "";
  if (b.startsWith("date:")) return "date";
  return b;
}
// Short name for the By chip: "SvS", "KOI", "Lucky Wheel", "New Gen", the event's name, "Target", "" for a date.
function goalByShort(by) {
  const k = goalByKind(by);
  if (!k) return t("gu_by_tg_s");
  if (k === "date") return "";
  if (k === "svs") return "SvS";
  if (k === "koi") return "KOI";
  if (k === "gen") return t("gu_by_gen_s");
  if (k === "wheel") return t("pack_cal_wheel");
  if (k === "forge") return t("gbp_forge");
  const ev = GAME_EVENTS.find((e) => e.key === k);
  return ev ? ev.name : k;
}
function goalByIcon(by) { const k = goalByKind(by); return !k ? "\u2605" : k === "date" ? "\uD83D\uDCC5" : k === "gen" ? "\u2B50" : k === "wheel" ? "\uD83C\uDFA1" : k === "forge" ? "\u2692" : "\u2694"; }
function goalByName(by) {
  if (by && String(by).startsWith("ev:")) return goalByShort(by);
  if (by === "svs") return t("goal_by_svs");
  if (by === "koi") return t("goal_by_koi");
  if (by === "gen") return t("goal_by_gen");
  return by && String(by).startsWith("date:") ? "" : t("goal_by_main");
}
// Each page's share of the dated plan (worked out here once per plan, the way
// the planner does it for the plain plan: budgetShares).
const BUDGET_DATED_SHARES = new WeakMap();
function budgetDatedShares(plan, pages, incKeys) {
  if (!BUDGET_DATED_SHARES.has(plan)) {
    const inc = budgetCombinedInput(pages, BUDGET_SELECTED || {}).pages.filter((pg) => incKeys.includes(pg.calcKey)).map((pg) => ({ ...pg, supplied: new Set(pg.supplied || []) }));
    BUDGET_DATED_SHARES.set(plan, budgetShares(plan, inc));
  }
  return BUDGET_DATED_SHARES.get(plan);
}
// The Order of goals card's buttons: fold, drag ⋮⋮ (saved order),
// ✕ on a mini, and the "+ Add mini target" form.
function wireBudgetGoals(box) {
  const redraw = () => keepPlace(() => renderBudgetsPage());
  const ids = () => [...box.querySelectorAll("[data-goal]")].map((li) => li.dataset.goal);
  // The picked goals in the order shown (goals not shown — another page
  // unticked, already reached — keep their place after them).
  const saveOrder = (list) => {
    const byId = new Map((BUDGET_GOALS.goals || []).map((e) => ["up:" + e.id, e]));
    const shown = list.map((id) => byId.get(id)).filter(Boolean);
    BUDGET_GOALS.goals = shown.concat((BUDGET_GOALS.goals || []).filter((e) => !shown.includes(e)));
    saveBudgetGoals();
    return redraw();
  };
  const entryOf = (gid) => (BUDGET_GOALS.goals || []).find((e) => "up:" + e.id === gid);
  // The "+ Add goal" sheet: ticks, levels, search and page chips change the
  // sheet in place (no redraw), Save adds the ticked ones.
  const sheet = () => box.querySelector("[data-gusheet]");
  const pkSync = (row) => {
    const lvs = JSON.parse(row.dataset.lvs || "[]"), li = Number(row.dataset.li) || 0;
    row.querySelector(".gu-ps b").textContent = goalLvTxt(lvs[li] || "");
    row.querySelector('[data-gupkstep="-1"]').disabled = li <= 0;
    row.querySelector('[data-gupkstep="1"]').disabled = li >= lvs.length - 1;
  };
  const saveSync = () => {
    const sh = sheet(), n = sh ? sh.querySelectorAll(".gu-pk.on").length : 0, btn = sh && sh.querySelector("[data-gusave]");
    if (btn) { btn.disabled = !n; btn.textContent = t("gu_save").replace("{n}", n); }
  };
  const filterSync = () => {
    const sh = sheet();
    if (!sh) return;
    const q = ((sh.querySelector("[data-guq]") || {}).value || "").trim().toLowerCase(), on = sh.querySelector("[data-gupage].on"), pg = on ? on.dataset.gupage : "";
    const words = q.split(/\s+/).filter(Boolean);
    sh.querySelectorAll(".gu-pk").forEach((r) => { r.hidden = !!(pg && r.dataset.gupg !== pg) || !words.every((w) => r.dataset.q.includes(w)); });
    sh.querySelectorAll("[data-gugh]").forEach((h) => { h.hidden = !!(pg && pg !== "hero_shards") || words.length > 0; });
  };
  box.addEventListener("input", (e) => { if (e.target.hasAttribute("data-guq")) filterSync(); });
  box.onclick = (e) => {
    const b = e.target.closest("button");
    if (!b || b.disabled) return;
    if (b.hasAttribute("data-goalsfold")) { BUDGET_GOALS_OPEN = !BUDGET_GOALS_OPEN; redraw(); return; }
    if (b.hasAttribute("data-goalrm")) {
      const gid = b.closest("[data-goal]").dataset.goal;
      BUDGET_GOALS.goals = (BUDGET_GOALS.goals || []).filter((e) => "up:" + e.id !== gid);
      if (BUDGET_GOALS.by && BUDGET_GOALS.by[gid]) { BUDGET_GOALS.by = { ...BUDGET_GOALS.by }; delete BUDGET_GOALS.by[gid]; }
      saveBudgetGoals(); redraw();
      return;
    }
    if (b.dataset.gustep) {
      const gid = b.closest("[data-goal]").dataset.goal, en = entryOf(gid);
      const u = en && budgetGoalList(BUDGET_DATA ? BUDGET_DATA.pages || [] : [], [en.page]).find((g) => g.id === gid);
      if (!u) return;
      const li = Math.max(0, Math.min(u.up.levels.length - 1, u.li + Number(b.dataset.gustep)));
      en.level = li >= u.up.levels.length - 1 ? null : u.up.levels[li].label;
      saveBudgetGoals(); redraw();
      return;
    }
    if (b.hasAttribute("data-goalby")) {
      const gid = b.closest("[data-goal]").dataset.goal; BUDGET_GOAL_BY_OPEN = BUDGET_GOAL_BY_OPEN === gid ? null : gid; BUDGET_BY_CAL = null;
      // (Opened: its list starts at the picked choice.)
      Promise.resolve(redraw()).then(() => setTimeout(() => { const l = document.querySelector(".gbp .gbp-l"), on = l && l.querySelector(".gbp-r.on"); const y = on ? on.getBoundingClientRect().top - l.getBoundingClientRect().top : 0; if (y > l.clientHeight - 40) l.scrollTop += y - l.clientHeight / 2; }, 30));
      return;
    }
    // By pop-over: month view, its arrows, a day, Use.
    if (b.hasAttribute("data-gbpcal")) { const t0 = packStartOfToday(), my = (BUDGET_GOALS.by || {})[b.closest("[data-goal]").dataset.goal] || ""; const sel = my.startsWith("date:") ? my.slice(5) : null; BUDGET_BY_CAL = { m: (sel || packDayKey(t0)).slice(0, 7), sel }; redraw(); return; }
    if (b.hasAttribute("data-gbpback")) { BUDGET_BY_CAL = null; redraw(); return; }
    if (b.dataset.gbpmon) { const [y, m] = BUDGET_BY_CAL.m.split("-").map(Number), d = new Date(Date.UTC(y, m - 1 + Number(b.dataset.gbpmon), 1)); BUDGET_BY_CAL = { ...BUDGET_BY_CAL, m: packDayKey(d).slice(0, 7) }; redraw(); return; }
    if (b.dataset.gbpday) { BUDGET_BY_CAL = { ...BUDGET_BY_CAL, sel: b.dataset.gbpday }; redraw(); return; }
    if (b.hasAttribute("data-gbpuse") && BUDGET_BY_CAL && BUDGET_BY_CAL.sel) {
      const gid = b.closest("[data-goal]").dataset.goal;
      BUDGET_GOALS.by = { ...(BUDGET_GOALS.by || {}), [gid]: "date:" + BUDGET_BY_CAL.sel };
      BUDGET_GOAL_BY_OPEN = null; BUDGET_BY_CAL = null; saveBudgetGoals(); redraw(); return;
    }
    if (b.dataset.goalbyset != null) {
      const gid = b.closest("[data-goal]").dataset.goal;
      BUDGET_GOALS.by = { ...(BUDGET_GOALS.by || {}) };
      // (A page's rest keeps "main" when the main target is picked, so the date it once had as a whole page doesn't come back.)
      if (b.dataset.goalbyset) BUDGET_GOALS.by[gid] = b.dataset.goalbyset; else if (gid.startsWith("rest:")) BUDGET_GOALS.by[gid] = "main"; else delete BUDGET_GOALS.by[gid];
      BUDGET_GOAL_BY_OPEN = null; BUDGET_BY_CAL = null; saveBudgetGoals(); redraw(); return;
    }
    if (b.hasAttribute("data-goaladd")) { BUDGET_GOAL_ADD = {}; redraw(); return; }
    if (b.hasAttribute("data-goalcancel")) { BUDGET_GOAL_ADD = null; redraw(); return; }
    if (b.hasAttribute("data-gutick")) {
      const row = b.closest(".gu-pk"), on = !row.classList.contains("on");
      row.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on));
      saveSync(); return;
    }
    if (b.dataset.gupkstep) {
      const row = b.closest(".gu-pk"), n = JSON.parse(row.dataset.lvs || "[]").length;
      row.dataset.li = String(Math.max(0, Math.min(n - 1, (Number(row.dataset.li) || 0) + Number(b.dataset.gupkstep))));
      pkSync(row); return;
    }
    if (b.dataset.gupage != null) {
      sheet().querySelectorAll("[data-gupage]").forEach((x) => x.classList.toggle("on", x === b));
      filterSync(); return;
    }
    if (b.hasAttribute("data-gusave")) {
      const add = [...sheet().querySelectorAll(".gu-pk.on")].map((row, i) => {
        const lvs = JSON.parse(row.dataset.lvs || "[]"), li = Number(row.dataset.li) || 0, id = row.dataset.gupk, page = row.dataset.gupg, key = id.slice(page.length + 1);
        // (a level that is already a goal of this upgrade isn't added again)
        const lastL = lvs[lvs.length - 1], same = (BUDGET_GOALS.goals || []).some((e) => e.page === page && e.key === key && (e.level == null ? lastL : String(e.level)) === lvs[li]);
        return same ? null : { id: Date.now().toString(36) + i, page, key, level: li >= lvs.length - 1 ? null : lvs[li] };
      }).filter(Boolean);
      BUDGET_GOALS.goals = (BUDGET_GOALS.goals || []).concat(add);
      BUDGET_GOAL_ADD = null;
      saveBudgetGoals(); redraw();
    }
  };
  // Hero targets: saved at once; Budgets works the hero shards out again.
  const htSave = () => { saveCalcState("hero_targets", HERO_TARGETS); budgetInvalidate(); keepPlace(() => renderBudgetsPage()); };
  const htBox = box.querySelector(".bud-ht");
  if (htBox) htBox.addEventListener("toggle", () => { BUDGET_HT_OPEN = htBox.open; const f = htBox.querySelector(".ht-fold"); if (f) f.innerHTML = htBox.open ? `&#9652; ${esc(t("g1_hide"))}` : `&#9662; ${esc(t("g1_show"))}`; });
  box.addEventListener("change", (e) => {
    const el = e.target, row = el.closest("[data-hthero]"), id = row && row.dataset.hthero;
    if (el.hasAttribute("data-htadd")) {
      const hid = el.value;
      if (hid && !HERO_TARGETS.extra.includes(hid)) {
        HERO_TARGETS.extra = [...HERO_TARGETS.extra, hid];
        // (starts at the targets already set for its Gen's other heroes; none = 5★ / widgets max)
        const P = HERO_PLAN_LAST || {}, h = (P.heroes || []).find((x) => x.id === hid);
        if (h && !HERO_TARGETS.heroes[hid]) {
          const T = (P.rows || []).filter((r) => r.hero.id !== hid && Number(r.hero.generation) === Number(h.generation)).map((r) => HERO_TARGETS.heroes[r.hero.id]).find((x) => x && !x.later && (x.stars != null || x.widget != null));
          if (T) HERO_TARGETS.heroes = { ...HERO_TARGETS.heroes, [hid]: { ...(T.stars != null ? { stars: T.stars } : {}), ...(T.widget != null ? { widget: T.widget } : {}) } };
        }
      }
      htSave(); return;
    }
    if (!id || !el.hasAttribute("data-htlater")) return;
    HERO_TARGETS.heroes = { ...HERO_TARGETS.heroes, [id]: { ...(HERO_TARGETS.heroes[id] || {}), later: el.checked } };
    htSave();
  });
  box.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b || b.disabled || !box.contains(b)) return;
    // Stars / widgets target − / +.
    if (b.dataset.htstep) {
      const id = b.closest("[data-hthero]").dataset.hthero, [k, d] = b.dataset.htstep.split("|"), T = { ...(HERO_TARGETS.heroes[id] || {}) };
      if (k === "s") T.stars = Math.max(1, Math.min(5, (T.stars != null ? Number(T.stars) : 5) + Number(d)));
      else T.widget = Math.max(0, Math.min(widgetMaxLevel(), (T.widget != null ? Number(T.widget) : widgetMaxLevel()) + Number(d)));
      HERO_TARGETS.heroes = { ...HERO_TARGETS.heroes, [id]: T };
      htSave(); return;
    }
    if (b.hasAttribute("data-htdone")) { BUDGET_HT_DONE_OPEN = !BUDGET_HT_DONE_OPEN; redraw(); return; }
    // "+ Add as goals": the heroes' stars and widgets goals (at their targets) after the list.
    if (b.dataset.htaddgoals) {
      const t0 = Date.now().toString(36);
      BUDGET_GOALS.goals = (BUDGET_GOALS.goals || []).concat(b.dataset.htaddgoals.split(",").filter(Boolean).map((key, i) => ({ id: `${t0}h${i}`, page: "hero_shards", key, level: null })));
      saveBudgetGoals(); redraw();
    }
  });
  box.querySelectorAll("[data-htrm]").forEach((b) => b.addEventListener("click", () => {
    const id = b.closest("[data-hthero]").dataset.hthero;
    HERO_TARGETS.extra = HERO_TARGETS.extra.filter((x) => x !== id);
    htSave();
  }));
  // Drag a row by its ⋮⋮ handle (dragSort): the only way to move a goal
  // ↑ / ↓ on the focused handle move it too.
  box.querySelectorAll("[data-goaldrag]").forEach((h) => dragSort(h, {
    row: "[data-goal]", arrange: "goals",
    done: () => saveOrder(ids()),
    refocus: (li) => { const gid = li.dataset.goal, row = [...content.querySelectorAll("[data-goal]")].find((x) => x.dataset.goal === gid), nh = row && row.querySelector("[data-goaldrag]"); if (nh) nh.focus(); },
  }));
}
// A picture for a page: its first needed item's.
// A Budgets page's picture: its Menu page's quick picture; Hero shards & widgets (whose page is
// the Backpack, an emoji there) the Mythic General Hero Shard.
// Shorter names on the Budgets page tiles only (full name in the tile's title / aria-label).
let B3_START_MORE = false; // "Start here": every page chip shown (for the visit)
const B3_TILE_SHORT = { research_center: "b3_tile_research_center", hero_shards: "b3_tile_hero_shards" };
let BUDGET_PLAN_RUNNING = null; // "targetDays|ticks|cands|data gen" of the packs plan being worked out in the background
let BUDGET_PLAN_FAILED = null; // the same key when that plan failed (cleared by ↻ Recalculate)
let BUDGET_PLAN_TRACK = {}; // { req }: that plan's planner request, dropped when a newer plan starts
function budTab() { return TAB === "budgets"; }
async function renderBudgetsPageMain(opts = {}) {
  const dataReady = BUDGET_DATA && !opts.reload;
  if (!dataReady) {
    plannerWarm();
    content.innerHTML = `
      <div class="page-head"><div><h2>${esc(t("budgets_title"))}</h2><p class="desc">${esc(t("budgets_desc"))}</p></div></div>
      <div class="panel" style="margin-top:12px;"><div class="empty"><div class="big">${esc(t("budgets_loading"))}</div><div class="meta" style="font-size:11.5px; margin-top:6px;">${esc(t("pack_calc_wait"))}</div></div></div>`;
  }
  // Load every calculator's saved plan plus the dashboard's current totals
  // (computed exactly the way the Dashboard page does, without drawing it).
  // The Dashboard stats are only needed for the "stat increase" lines, so
  // they're worked out alongside the page plans, not before them. Pack
  // tables, trade rates, marks rates and the pages' saved needs all start
  // loading now too (each page used to wait for them one after another).
  const dashStatsPromise = dataReady ? Promise.resolve(BUDGET_DATA.dashStats) : renderOverview({ computeOnly: true }).catch((e) => { console.error("dashboard stats failed", e); return null; });
  const [, , , , savedSel, savedTarget] = await Promise.all([
    ensureCharmData(), loadChiefGearRows(), ensureHeroGearData(), ensurePackLinks(),
    BUDGET_SELECTED ? Promise.resolve(BUDGET_SELECTED) : loadCalcState("budget_selected"),
    BUDGET_TARGET !== undefined ? Promise.resolve({ date: BUDGET_TARGET }) : loadCalcState("pack_target_budgets"),
    dataReady ? null : ensurePackTables(), dataReady ? null : ensureTradeRates(), dataReady ? null : ensurePetMarksState(), dataReady ? null : ensureBudgetNeedsSnapshot(),
    ensureBudgetSpend(),
    visitorCan("goals") ? ensureBudgetGoals() : null,
    ensureBarHidden(),
    BUDGET_PAGE_ORDER ? null : loadCalcState("budget_page_order").then((v) => { if (!BUDGET_PAGE_ORDER) BUDGET_PAGE_ORDER = v && Array.isArray(v.order) ? v : { order: [] }; }),
  ]);
  if (!budTab()) return;
  BUDGET_SELECTED = BUDGET_SELECTED || savedSel || {};
  BUDGET_TARGET = BUDGET_TARGET !== undefined ? BUDGET_TARGET : ((savedTarget && savedTarget.date) || "");
  const included = (k) => BUDGET_SELECTED[k] !== false;

  const today = packStartOfToday();
  let targetDays = null;
  if (BUDGET_TARGET) { const d = packParseDay(BUDGET_TARGET); if (d) targetDays = Math.round((d - today) / 86400000); }
  const fmtDate = (days) => { const d = new Date(today.getTime() + days * 86400000); try { return d.toLocaleDateString(LANG === "en" ? undefined : LANG, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }); } catch (e) { return d.toDateString(); } };
  const qty = (v) => Math.round(v).toLocaleString();
  const pct = (v) => `${(Math.round(v * 10) / 10).toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;

  // Page plans are reused unless the target date changed (it affects the
  // plans) or the data was invalidated.
  const [pages, dashStats] = await Promise.all([
    (dataReady && BUDGET_DATA.targetDays === targetDays) ? BUDGET_DATA.pages : Promise.all(BUDGET_PAGES.map((p) => budgetForPage(p.key, targetDays, { noPlan: true, stats: true }))),
    dashStatsPromise,
  ]);
  if (!budTab()) return;
  // Hero targets need the last hero plan even when the Heroes page has nothing to buy.
  if (visitorCan("goals") && included("hero_shards") && (!HERO_PLAN_LAST || !HERO_TARGETS)) { await heroShardBudget().catch(() => null); if (!budTab()) return; }
  const selSig = JSON.stringify(BUDGET_PAGES.map((p) => included(p.key)));
  // The page (settings, pages, materials) is drawn at once; the packs plan is
  // worked out in the background and the prices fill in when it's ready.
  // "My budget" needs plans for several finish dates (worked out only when an amount is set).
  const wantCands = spendActive();
  // PACK_GROUPS_GEN (bumped by budgetInvalidate): a data change while the plan is
  // worked out gives a new key, so the old plan is dropped and a new one starts.
  const planKey = `${targetDays}|${selSig}|${wantCands ? 1 : 0}|${PACK_GROUPS_GEN}`;
  const haveCombined = dataReady && BUDGET_DATA.targetDays === targetDays && BUDGET_DATA.combined && !BUDGET_DATA.combined.pending && BUDGET_DATA.selSig === selSig && (!wantCands || !!BUDGET_DATA.combined.budgetCands);
  // The parts of the plan that are in while the rest is still being worked out (budgetCombinedPlanAsync's onPart).
  const partPlan = !haveCombined && dataReady && BUDGET_DATA.targetDays === targetDays && BUDGET_DATA.selSig === selSig && BUDGET_DATA.combined && BUDGET_DATA.combined.pending && BUDGET_DATA.combined.partKey === planKey ? BUDGET_DATA.combined : null;
  const combinedRaw = haveCombined ? BUDGET_DATA.combined : partPlan || { pending: true, chosen: null, shares: {}, dropped: [], inc: [], views: {}, split: null, byTarget: null };
  if (!haveCombined && BUDGET_PLAN_RUNNING !== planKey && BUDGET_PLAN_FAILED !== planKey) {
    BUDGET_PLAN_RUNNING = planKey;
    // A plan for other ticks / another date still being worked out is no
    // longer wanted: it's dropped, so the new one doesn't wait behind it.
    budgetTrackDrop(BUDGET_PLAN_TRACK);
    budgetDeadlineDrop(); // (the goals' dated plan for those ticks / that date too)
    const track = (BUDGET_PLAN_TRACK = {});
    // A redraw as the plan's parts come in: open lines stay open, an open window
    // (and every scroll box) keeps its scroll, and when the total card (which
    // grows as it fills in) ends in the top half of the screen or above it, the
    // page tile on screen below it stays where it is.
    const partRedraw = () => {
      const y = window.scrollY, sq = RENDER_SEQ, hd = content.querySelector(".b3-hd");
      // (only once the person has scrolled: at the top the page stays at the top)
      const below = y > 0 && !!hd && hd.getBoundingClientRect().bottom < window.innerHeight / 2;
      const tile = below ? [...content.querySelectorAll("[data-b3page]")].find((el) => { const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < window.innerHeight; }) : null;
      const key = tile ? tile.dataset.b3page : null, top0 = tile ? tile.getBoundingClientRect().top : 0, h0 = hd ? hd.offsetHeight : 0;
      const putBoxes = saveBoxScroll(content); // an open window stays scrolled where it was
      keepFolds(content, () => renderBudgetsPage()).then(() => {
        infoize(content); // the description goes into its (i) now, not a frame later (it made the page 78 px taller while measured)
        putBoxes();
        const t2 = key ? [...content.querySelectorAll("[data-b3page]")].find((el) => el.dataset.b3page === key) : null, h2 = content.querySelector(".b3-hd");
        window.scrollTo(0, y);
        if (t2) window.scrollTo(0, y + (t2.getBoundingClientRect().top - top0));
        else if (below && h2) window.scrollTo(0, y + (h2.offsetHeight - h0));
      }).catch((e) => pageRedrawFailed(e, sq));
    };
    // A part of the plan is in: shown at once, the rest follows.
    const onPart = (part) => {
      if (BUDGET_PLAN_TRACK !== track || BUDGET_PLAN_RUNNING !== planKey) return;
      if (!BUDGET_DATA || BUDGET_DATA.targetDays !== targetDays || BUDGET_DATA.selSig !== selSig || BUDGET_DATA.pages !== pages) return;
      BUDGET_DATA.combined = { ...part, partKey: planKey };
      // (Not while a row is being dragged, or a box is being typed in / picked from:
      // a redraw would cut that short. The next part or the finished plan shows it.)
      const ae = document.activeElement;
      const busy = !!document.querySelector(".ds-lift") || (!!ae && content.contains(ae) && /^(INPUT|SELECT|TEXTAREA)$/.test(ae.tagName) && ae.type !== "checkbox");
      if (budTab() && !busy) partRedraw();
    };
    budgetCombinedPlanAsync(pages, BUDGET_SELECTED, targetDays, { spendCands: wantCands, track, onPart }).then((real) => {
      if (BUDGET_PLAN_TRACK === track) BUDGET_PLAN_TRACK = {};
      if (BUDGET_PLAN_RUNNING === planKey) BUDGET_PLAN_RUNNING = null;
      // Only if nothing changed meanwhile (date, ticks, data).
      if (!BUDGET_DATA || BUDGET_DATA.targetDays !== targetDays || BUDGET_DATA.selSig !== selSig || BUDGET_DATA.pages !== pages) return;
      const hadPart = !!(BUDGET_DATA.combined && BUDGET_DATA.combined.partKey === planKey);
      BUDGET_DATA.combined = real;
      if (budTab()) { if (hadPart) partRedraw(); else { const y = window.scrollY, sq = RENDER_SEQ, putBoxes = saveBoxScroll(content); renderBudgetsPage().then(() => { putBoxes(); window.scrollTo(0, y); }).catch((e) => pageRedrawFailed(e, sq)); } }
    }).catch((e) => {
      if (e && e.superseded) return; // a newer plan took its place
      if (BUDGET_PLAN_TRACK === track) BUDGET_PLAN_TRACK = {};
      console.error("budget plan failed", e); if (BUDGET_PLAN_RUNNING === planKey) BUDGET_PLAN_RUNNING = null;
      // Not tried again by itself (↻ Recalculate does): the page says so
      // instead of "Working out…" for ever.
      BUDGET_PLAN_FAILED = planKey;
      if (!BUDGET_DATA || BUDGET_DATA.targetDays !== targetDays || BUDGET_DATA.selSig !== selSig || BUDGET_DATA.pages !== pages) return;
      if (budTab()) { const y = window.scrollY, sq = RENDER_SEQ; renderBudgetsPage().then(() => window.scrollTo(0, y)).catch((err) => pageRedrawFailed(err, sq)); }
    });
  }
  // While the plan is being worked out its parts come in one by one (`have`,
  // null once everything is in): the plan itself, the Fastest / Cheapest cards,
  // the split around the target. Each view is shown as soon as its own parts
  // are in; planPending (set below) is about the view on screen.
  const pendingAll = !!combinedRaw.pending;
  const have = pendingAll ? (combinedRaw.have || {}) : null;
  // The plan failed: "Couldn't work it out · ↻ Recalculate" where "Working out…" was.
  const planFailed = pendingAll && BUDGET_PLAN_FAILED === planKey;
  const workHtml = (tag, cls) => planFailed
    ? `<${tag} class="bud-fail${cls ? " " + cls : ""}">${esc(t("budgets_plan_failed"))} · <button type="button" class="bud-fail-b" data-budgetrecalc>&#8635; ${esc(t("budgets_recalc"))}</button></${tag}>`
    : `<${tag} class="bud-pending${cls ? " " + cls : ""}">${esc(t("budgets_working"))}</${tag}>`;
  const pagesRaw = pages;
  // Pages the combined plan had to leave out get their own plan.
  combinedRaw.dropped.forEach((k) => { const pg = pages.find((x) => x.calcKey === k); if (pg && !pg.chosen && pg.earliest == null && combinedRaw.droppedPlans && combinedRaw.droppedPlans[k]) Object.assign(pg, combinedRaw.droppedPlans[k]); });
  BUDGET_DATA = { dashStats, pages: pagesRaw, targetDays, combined: combinedRaw, selSig };
  // Fastest / By your target / Cheapest cards: "main" is the plan Budgets
  // picks (by the target when reachable, otherwise the cheapest). Tapping a
  // card only changes what's shown below; nothing is saved.
  const split = combinedRaw.split && combinedRaw.split.target && combinedRaw.split.late ? combinedRaw.split : null;
  const splitLate = split ? (split.late[BUDGET_SPLIT_LATE] || split.late.cheapest) : null;
  const splitMain = split ? budgetSplitMain(combinedRaw) : null;
  // The target is out of every page's reach and only the Fastest card is in so
  // far (the plan itself, the Cheapest card, is still being worked out): the
  // split around the target is the plan to show, as soon as it is in.
  const startOnly = !!have && !have.set && !!combinedRaw.noTarget && (combinedRaw.inc || []).length > 1 && !(combinedRaw.dropped || []).length;
  // The plan is in but the target is out of every page's reach: the "by target"
  // view waits for the split (the second planner is still on it).
  const splitWait = !!have && have.split !== true && targetDays != null && !combinedRaw.byTarget && (combinedRaw.inc || []).length > 1 && (have.set ? !!combinedRaw.chosen : startOnly);
  const viewsWait = !!have && (!!have.set || !!have.fast) && !have.views; // the Fastest / Cheapest cards are still coming
  const viewReady = (k) => !have || (k === "main" ? (have.set ? !splitWait : startOnly && have.split === true && !!split) : k === "budget" ? false : k === "fastest" ? !!have.views || !!have.fast : !!have.views);
  const reachable = targetDays != null && (!!combinedRaw.byTarget || !!split || splitWait);
  const views = combinedRaw.views || {};
  const spendBest = wantCands && !have ? budgetSpendBest(combinedRaw) : null;
  const viewKeys = ["fastest", "main"].concat(reachable ? ["cheapest"] : []).filter((k) => k === "main" ? !!combinedRaw.chosen || startOnly : viewsWait || !!(views[k] && views[k].plan)).concat(spendBest ? ["budget"] : []);
  // The saved plan (one for Budgets and My Purchases, budgetFollowView);
  // (kept on "My budget" while its plans are still being worked out)
  BUDGET_VIEW = budgetFollowView();
  if (!viewKeys.includes(BUDGET_VIEW) && !(BUDGET_VIEW === "budget" && wantCands && pendingAll)) BUDGET_VIEW = "main";
  const planPending = pendingAll && !viewReady(BUDGET_VIEW);
  const pickDropped = (pg, k) => k === "fastest" ? (pg.fastest || pg.chosen) : k === "cheapest" ? (pg.cheapest || pg.chosen) : pg.chosen;
  const viewDataPlain = (k) => {
    const v = k === "main" ? (splitMain || { plan: combinedRaw.chosen, shares: combinedRaw.shares }) : k === "budget" ? (spendBest && spendBest.ok ? { plan: spendBest.plan, shares: spendBest.shares } : null) : views[k];
    const dropPlans = combinedRaw.dropped.map((dk) => pagesRaw.find((x) => x.calcKey === dk)).filter((pg) => pg && included(pg.calcKey)).map((pg) => pickDropped(pg, k)).filter(Boolean);
    const plans = (v && v.plan ? [v.plan] : []).concat(dropPlans);
    return { plan: v && v.plan, shares: (v && v.shares) || {}, total: plans.reduce((a, pl) => a + packPlanLocal(pl), 0), days: Math.max(0, ...plans.map((pl) => pl.days || 0)), sample: plans[0] && plans[0].rows[0] };
  };
  // Goals / pages with their own dates (owner): the plan bought for those dates
  // leads the main view ("By your dates") as soon as it is worked out; until
  // then the plain plan shows. It is asked for once what it is made from is in
  // (budgetDatedAskable); the second planner works it out while the first
  // finishes the rest. One plan whatever view is on screen.
  const datedSetup = budgetDatedAskable(combinedRaw, targetDays) ? budgetDatedSetup(pagesRaw, combinedRaw, targetDays) : null;
  const dl = datedSetup ? budgetDeadlineFor(pagesRaw, BUDGET_SELECTED, datedSetup.goals, datedSetup.due, datedSetup.mainDay, datedSetup.incKeys, () => { if (budTab()) keepPlace(() => renderBudgetsPage()); }, datedSetup.lateKeys) : null;
  const dlPlan = dl && !dl.failed && dl.plan ? dl.plan : null;
  const datedShares = dlPlan ? budgetDatedShares(dlPlan, pagesRaw, datedSetup.incKeys) : null;
  // (the day a goal is bought for: its own date, else the main target; null = on a page that can't make the target)
  const datedDay = (g, i) => (datedSetup.due[i] != null ? datedSetup.due[i] : g.page && datedSetup.lateKeys.includes(g.page) ? null : datedSetup.mainDay);
  const viewData = (k) => (k === "main" && dlPlan
    ? { plan: dlPlan, shares: datedShares, total: packPlanLocal(dlPlan), days: dlPlan.days || 0, sample: dlPlan.rows[0], dated: true }
    : viewDataPlain(k));
  const shownView = viewData(BUDGET_VIEW);
  const datedLead = !planPending && BUDGET_VIEW === "main" && !!dlPlan;
  // (While the view on screen is still being worked out, everything below sees
  // "no plan yet", as before; only the plan cards and the split's lines show the parts that are in.)
  const combined = planPending ? { ...combinedRaw, chosen: null, shares: {}, inc: [], dropped: [] }
    : datedLead ? { ...combinedRaw, chosen: dlPlan, shares: datedShares, inc: datedSetup.incKeys, dropped: [] }
    : { ...combinedRaw, chosen: shownView.plan || combinedRaw.chosen, shares: shownView.shares };
  const pages_ = pagesRaw.map((pg) => combinedRaw.dropped.includes(pg.calcKey) && BUDGET_VIEW !== "main" ? { ...pg, chosen: pickDropped(pg, BUDGET_VIEW) } : pg);
  const curStat = (troop, stat) => { const x = (dashStats || []).find((s) => s.troop === troop && s.stat === stat); return x ? x.total : null; };
  const STAT_KEYS = ["ATT", "DEF", "DMG", "HP"];
  const STAT_RAW = { ATT: "Attack", DEF: "Defense", DMG: "Lethality", HP: "Health" };
  const TROOPS = ["Infantry", "Lancers", "Marksman"];

  // Stat increase: troop tabs, one box per stat (green gain, "now → after"
  // under it), so phones see every stat without a hidden sideways scroll.
  const statTableHtml = (deltas, id, noteFor) => {
    if (!deltas.length) return "";
    const by = {}; deltas.forEach((d) => { by[`${d.troop}|${d.stat}`] = (by[`${d.troop}|${d.stat}`] || 0) + d.delta; });
    const stats = STAT_KEYS.filter((s) => TROOPS.some((tr) => by[`${tr}|${s}`]));
    const troops = TROOPS.filter((tr) => stats.some((s) => by[`${tr}|${s}`]));
    const tabColor = { Infantry: PLX_TROOP_COLORS.Infantry, Lancers: PLX_TROOP_COLORS.Lancer, Marksman: PLX_TROOP_COLORS.Marksman };
    return plxStatTabsHtml("bud_stat_" + id, troops.map((tr) => ({
      key: tr, label: troopDisplayName(tr), color: tabColor[tr],
      // All stats in one row; "now →" and "after" on two short lines.
      html: `<div class="plx-stats one bud-st" style="--n:${stats.length};">${stats.map((s) => {
        const d = by[`${tr}|${s}`] || 0, cur = curStat(tr, s);
        return `<div class="plx-stat"><span>${esc(tStatLabel(STAT_RAW[s]))}</span>${d
          ? `<b style="color:var(--good);">${esc(bidiNum("+" + pct(d)))}</b>${cur == null ? "" : `<small>${esc(bidiNum(`${pct(cur)} \u2192`))}<br>${esc(bidiNum(pct(cur + d)))}</small>`}`
          : `<b class="meta">&mdash;</b>`}</div>`;
      }).join("")}</div>${noteFor ? noteFor(tr) : ""}`,
    })));
  };
  const budgetResetText = (r, day) => {
    if (r === "unlimited") return t("pack_reset_unlimited");
    if (r === "once" || r >= PACK_ONE_TIME_DAYS) return t("pack_reset_once");
    if (packStackInfo(r)) return packStackText(r);
    const preset = PACK_RESET_PRESETS.find((p) => p.days === r);
    return preset ? t("pack_reset_" + preset.key) : `${t("pack_reset_every")} ${r}${t("pack_days_short")}`;
  };
  const packRowsHtml = (plan) => packPlanRowsHtml(plan, budgetResetText);
  // Same chips as "Materials still needed": picture + amount still needed
  // (green ✓ when covered), the full amount small after it; exact numbers in the title.
  const matsHtml = (needFull, needStill) => `<div class="bud-mats">` + Object.keys(needFull).filter((n) => needFull[n] > 0).map((n) => {
    const still = needStill[n] || 0, mins = /\(minutes\)$/.test(n);
    const fmt = (v) => (mins ? t12FormatTime(v / 60) : shortAmount(v));
    const icon = itemRegIcon(n) || (/^Research Speedups/.test(n) ? "icons/speedup-research.png" : bpIcon({ name: n.replace(/ \(minutes\)$/, "") }));
    const nm = materialDisplayName(n).replace(/\s*\((minutes|min)\)$/, "");
    const label = `${nm}: ${qty(still)} / ${qty(needFull[n])}`;
    return `<span class="bud-mat" title="${esc(label)}" aria-label="${esc(label)}">${icon ? `<img src="${esc(icon)}" alt="" loading="lazy" />` : `<i>${esc(nm.charAt(0))}</i>`}${heroItemMark(n)}<b style="color:${still > 0 ? "var(--danger)" : "var(--good)"};">${still > 0 ? esc(fmt(still)) : "&#10003;"}</b><span class="meta" style="font-size:11px;">/ ${esc(fmt(needFull[n]))}</span></span>`;
  }).join("") + `</div>`;

  // Heroes Gears: which sets Budgets plans, tick chips
  // under the page's row; a set with nothing left is faded.
  const hgSetsHtml = () => `<div class="bud-hgsets"><span class="meta">${esc(t("bud_hg_sets"))}</span>${HERO_GEAR_SET_NAMES.map((n) => {
    const on = BUDGET_HG_SETS.includes(n), left = heroGearSetLeft(n);
    return `<label class="bud-hgset${on ? " on" : ""}${left ? "" : " done"}"><input type="checkbox" data-budhgset="${esc(n)}"${on ? " checked" : ""} /><span>${esc(gearSetDisplayName(n))}${left ? "" : ` · ${esc(t("bud_hg_nothing"))}`}</span></label>`;
  }).join("")}</div>`;
  const hgOther = BUDGET_HG_SETS.filter((n) => n !== "Set 1");
  // A page's packs in its sheet, cut by date like the plan on screen: one group per
  // dated part ("By Dec 21", "After your target"), or the split's part the page is
  // in; each row is this page's own part of the purchase ("3× of 122 for all pages")
  // with its buying dates. The groups add up to the page's share.
  const shKey = (r) => [r.title, r.label, r.price, r.row, r.from, (r.tables || []).join(",")].join("|");
  const shSched = new Map();
  const schedOf = (pl) => { if (!shSched.has(pl)) shSched.set(pl, packPlanSchedule(pl.rows || [])); return shSched.get(pl); };
  const shDay = (d) => { const x = new Date(packStartOfToday().getTime() + d * 86400000), s0 = x.toLocaleDateString(LANG === "en" ? undefined : LANG, { day: "numeric", month: "short", timeZone: "UTC" }); return x.getUTCFullYear() !== packStartOfToday().getUTCFullYear() ? `${s0} \u2019${String(x.getUTCFullYear()).slice(2)}` : s0; };
  // Buying days of `n` units of plan row `j`, after the first `skip` units.
  const unitDays = (pl, j, skip, n) => {
    const sl = j >= 0 ? schedOf(pl)[j] || [] : [];
    const out = []; let k = 0;
    for (const x of sl) for (let c = 0; c < (x.count || 1); c++) { if (k >= skip && out.length < n) out.push(x.off); k++; }
    return out;
  };
  const shareGroups = (calcKey, sh) => {
    const pieces = (r, parts) => parts.map((p) => ({ r, c: p.c, frac: r.count > 0 ? p.c / r.count : 1, days: p.days, gi: p.gi }));
    if (datedLead && combined.chosen === dlPlan) {
      const ps = dl.parts.map((p, i) => ({ p, i })).filter(({ p }) => (p.rows || []).length);
      const groups = ps.map(({ p }) => ({ title: p.late ? t("bud_line_after") : t("bud_line_by").replace("{date}", shDay(p.day)), late: !!p.late, items: [] }));
      sh.rows.forEach((r) => {
        const k = shKey(r), j = dlPlan.rows.findIndex((x) => shKey(x) === k);
        const parts = []; let skip = 0;
        ps.forEach(({ p }, gi) => { const pr = p.rows.find((x) => shKey(x) === k); if (pr && pr.count > 0) { parts.push({ c: pr.count, gi, days: unitDays(dlPlan, j, skip, pr.count) }); skip += pr.count; } });
        const sum = parts.reduce((a, x) => a + x.c, 0);
        if (!parts.length || Math.abs(sum - r.count) > 1e-6) { (groups[groups.length - 1] || groups[0]).items.push(...pieces(r, [{ c: r.count, days: unitDays(dlPlan, j, 0, r.count) }])); return; }
        pieces(r, parts).forEach((pc) => groups[pc.gi].items.push(pc));
      });
      return groups.filter((g) => g.items.length);
    }
    const inSplit = split && BUDGET_VIEW === "main" && combined.chosen === splitMain.plan;
    const late = inSplit && split.late.keys.includes(calcKey);
    const pl = inSplit ? (late ? splitLate.plan : split.target.plan) : combined.chosen;
    const items = sh.rows.map((r) => { const j = (pl.rows || []).findIndex((x) => shKey(x) === shKey(r)); return { r, c: r.count, frac: 1, days: unitDays(pl, j, 0, r.count) }; });
    return [{ title: inSplit ? (late ? t("bud_line_after") : t("bud_line_by").replace("{date}", shDay(targetDays))) : "", late, items }];
  };
  const shareListHtml = (calcKey, sh, total, cur, smp) => {
    const groups = shareGroups(calcKey, sh);
    const val = (pc) => packShareLocal(pc.r) * pc.frac;
    // (whole amounts that add up to the page's total: the spare units go to the largest fractions)
    const vs = groups.map((g) => g.items.reduce((a, pc) => a + val(pc), 0)), whole = vs.map((v) => Math.floor(v));
    let spare = total - whole.reduce((a, v) => a + v, 0);
    vs.map((v, i) => [v - Math.floor(v), i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (spare > 0) { whole[i]++; spare--; } });
    const when = (ds) => (!ds.length ? "" : ds[0] === ds[ds.length - 1] ? shDay(ds[0]) : `${shDay(ds[0])} \u2192 ${shDay(ds[ds.length - 1])}`);
    const row = (pc) => {
      const r = pc.r, all = pc.c, part = r.share < 0.995;
      const mine = part ? Math.max(1, Math.round(all * r.share)) : all;
      const w = when(pc.days);
      const of = part ? (mine < all ? t("bud_of_all").replace("{n}", qty(all)) : `${t("combined_part")} ${Math.round(r.share * 100)}%`) : "";
      return `<div class="bud-shr"><span class="bud-shr-n">${qty(mine)}&times;</span><span style="min-width:0;"><b>${budPackNameHtml(r.title)}</b>${of ? ` <small class="bud-shr-of">${esc(of)}</small>` : ""}<br><span class="meta" style="font-size:10.5px;">${esc(r.label)}${w ? ` \u00b7 ${esc(w)}` : ""}</span></span><span style="margin-inline-start:auto; white-space:nowrap;">${packFmtLocal(val(pc), r.currency, false, r.price)}</span></div>`;
    };
    const n = groups.reduce((a, g) => a + g.items.length, 0);
    return `<details style="margin-top:4px;"><summary class="meta" style="cursor:pointer; font-size:11px;">${esc(t("budgets_packs_detail"))} (${n})</summary>
      ${groups.map((g, i) => `${g.title ? `<div class="bud-shg"><span class="bud-line-bar" style="background:${g.late ? "var(--danger)" : "var(--good)"};"></span><b>${esc(g.title)}</b><span>${packFmtLocal(whole[i], cur, true, smp)}</span></div>` : ""}${g.items.map(row).join("")}`).join("")}</details>`;
  };
  // ---- A page's details sheet: "What's being upgraded", trades (Free | From packs) ----
  const icOf = (n) => itemRegIcon(n) || (/^Research Speedups/.test(n) ? "icons/speedup-research.png" : bpIcon({ name: String(n).replace(/ \(minutes\)$/, "") }));
  const icHtml = (n) => { const ic = icOf(n); return `<span class="bud-tri">${ic ? `<img src="${esc(ic)}" alt="" loading="lazy" />` : `<i>${esc(String(materialDisplayName(n)).charAt(0))}</i>`}${heroItemMark(n)}</span>`; };
  const heroRows = () => (HERO_PLAN_LAST && HERO_PLAN_LAST.rows) || [];
  const troopKeyOf = (x) => (/^lanc/i.test(String(x || "")) ? "Lancers" : /^mark/i.test(String(x || "")) ? "Marksman" : /^inf/i.test(String(x || "")) ? "Infantry" : "");
  // One row per upgrade: { img, face, name, troop, text }.
  const upRowsOf = (calcKey) => {
    const out = [];
    try {
      if (calcKey === "chief_gear" && CHIEF_GEAR_ROWS) {
        CHIEF_GEAR_PIECES.forEach((p) => {
          const st = CHIEF_GEAR_STATE[p.key], to = Math.min(st.to, chiefGearLastIdx());
          if (to > st.from) out.push({ img: chiefGearIcon(p.key, st.from), name: pieceDisplayName(p.name), troop: troopDisplayName(p.troop), text: `${chiefGearRowLabel(CHIEF_GEAR_ROWS[st.from])} → ${chiefGearRowLabel(CHIEF_GEAR_ROWS[to])}` });
        });
      } else if (calcKey === "charm") {
        CHARM_PIECES.forEach((p) => {
          const sts = CHARM_CALC_STATE[p.key] || [], ups = sts.map((x) => (Number(x.target) > Number(x.current) ? `${x.current} → ${x.target}` : null)).filter(Boolean);
          const first = sts.find((x) => Number(x.target) > Number(x.current));
          if (ups.length) out.push({ img: charmIconSrc(p.troop, first ? first.current : 1), name: pieceDisplayName(p.name || p.key), troop: troopDisplayName(p.troop), suf: t("bud_up_charm"), text: ups.join(", ") });
        });
      } else if (calcKey === "hero_gear" && HERO_GEAR_TABLES_CACHE) {
        BUDGET_HG_SETS.forEach((sn) => {
          const setState = HERO_GEAR_SETS[sn], pre = BUDGET_HG_SETS.length > 1 ? `${gearSetDisplayName(sn)} · ` : "";
          if (!setState) return;
          HERO_GEAR_TROOPS.forEach((tr) => HERO_GEAR_PIECE_NAMES.forEach((piece) => {
            const ups = GEAR_LEVELING_TABLES.map((tname) => { const st = setState[tr][piece][tname]; return st.to > st.from ? `${st.from} → ${st.to}` : null; }).filter(Boolean);
            if (ups.length) out.push({ img: `icons/hero-gear-icons/hero-gear-${String(tr).toLowerCase()}-${String(piece).toLowerCase()}.png`, name: `${pre}${piece}`, troop: troopDisplayName(tr), text: ups.join(" / ") });
          }));
        });
      } else if (calcKey === "hero_shards") {
        const st = (s) => (s % 6 ? `${Math.floor(s / 6)}.${s % 6}★` : `${s / 6}★`);
        heroRows().forEach((r) => {
          if (!r || !r.hero) return;
          const un = r.unlock > 0 && r.step === 0, starsUp = r.tStep > r.step || un, wUp = r.hasWidget && r.wNeed > 0;
          if (!starsUp && !wUp) return;
          const parts = [];
          if (starsUp) parts.push(`${un ? t("bud_up_unlock") : st(r.step)} → ${st(r.tStep)}`);
          if (wUp) parts.push(t("bud_up_widget").replace("{a}", r.wLevel).replace("{b}", r.tW));
          const tk = troopKeyOf(r.troop || r.hero.troop_type);
          out.push({ img: r.hero.image_url || HERO_IMG_BY_NAME[r.hero.name] || "", face: true, name: r.hero.name, troop: tk ? troopDisplayName(tk) : "", text: parts.join(" · ") });
        });
      } else {
        goalUpgrades(calcKey).forEach((u) => {
          const last = u.levels[u.levels.length - 1];
          if (!last) return;
          const nw = u.now != null && u.now !== "" ? goalLvTxt(u.now) : "";
          out.push({ img: u.img || "", face: !!u.face, name: u.name, troop: "", text: nw ? `${nw} → ${goalLvTxt(last.label)}` : `→ ${goalLvTxt(last.label)}` });
        });
      }
    } catch { return []; }
    return out;
  };
  const upFoldHtml = (calcKey) => {
    const rows = upRowsOf(calcKey);
    if (!rows.length) return "";
    const pic = budgetPagePic(calcKey);
    const row = (r) => `<div class="bud-upr"><span class="bud-upi${r.face ? " face" : ""}">${r.img || pic ? `<img src="${esc(r.img || pic)}" alt="" loading="lazy" />` : ""}</span><span class="bud-upt"><b>${esc(r.name)}</b>${r.troop ? ` <span class="meta">(${esc(r.troop)})</span>` : ""}${r.suf ? ` ${esc(r.suf)}` : ""}: ${esc(r.text)}</span></div>`;
    const CAP = 12, more = rows.length - CAP;
    return `<details class="bud-up" open><summary>${esc(t("budgets_plan_detail"))} (${rows.length})</summary><div class="bud-upl">${rows.slice(0, CAP).map(row).join("")}${more > 0 ? `<details class="bud-upm"><summary class="meta">${esc(t("bud_up_more").replace("{n}", more))}</summary>${rows.slice(CAP).map(row).join("")}</details>` : ""}</div></details>`;
  };
  // The trades a page's plan counts, as { free, packs } lists of { from, to, giveQty, getQty }:
  // free = made from items you own (the page's free trades; heroes: General shards and a
  // Gen's widgets in the Backpack, the hidden rules), packs = items the packs give that are
  // then traded. A pack-side trade whose source you partly own is split: the part your own
  // items pay goes to free (what you own, minus what the item itself and the free trades use).
  const tradeListsOf = (pg, sh) => {
    const merge = (list) => { const m = new Map(); list.forEach((x) => { if (!(x.giveQty > 0)) return; const k = x.from + "|" + x.to, e = m.get(k); if (e) { e.giveQty += x.giveQty; e.getQty += x.getQty; } else m.set(k, { from: x.from, to: x.to, giveQty: x.giveQty, getQty: x.getQty }); }); return [...m.values()]; };
    const free = [], packs = [];
    (pg.trades || []).forEach((x) => free.push(x));
    if (pg.calcKey === "hero_shards") {
      heroRows().forEach((r) => {
        // (from the Backpack's pools, handed out before planning: not part of the page's owned amounts)
        if (r.fromGeneral > 0) free.push({ from: HERO_GENERAL_SHARD[r.rarity] || "Mythic General Hero Shard", to: `${r.hero.name} Shards`, giveQty: r.fromGeneral, getQty: r.fromGeneral, pool: true });
        const wg = (r.wOwn || 0) - (r.wMine || 0);
        if (wg > 0) free.push({ from: r.gKey, to: `${r.hero.name} Widgets`, giveQty: wg, getQty: wg, pool: true });
      });
    }
    // Hidden rules made from what you own (General Sigils → an expert's, chests …; not the Research Lab).
    (pg.hiddenTrades || []).forEach((x) => { if (!x.lab && !x.isl) free.push(x); });
    ((pg.viaTrades && pg.viaTrades.conversions) || []).forEach((c) => packs.push({ from: c.from, to: c.item, giveQty: c.fromQty, getQty: c.qty }));
    // The hidden rules the plan makes with what this page's share of the packs gives.
    if (sh && sh.rows.length && combined.chosen) {
      const rem = { ...(pg.need || {}) };
      sh.rows.forEach((r) => Object.entries(r.gives || {}).forEach(([n, v]) => { rem[n] = (rem[n] || 0) - v * r.count * (r.share || 0); }));
      const ctx = packTradeCtx(pg.calcKey, combined.chosen.days || 0);
      if (ctx) packShortAfterTrades(rem, ctx).trades.filter((x) => x.silent && !x.lab && !x.isl && (Number((pg.needFull || {})[x.to]) || 0) > 0).forEach((x) => packs.push(x));
    }
    const fr = merge(free), pk = merge(packs);
    const left = {};
    const ownLeft = (n) => {
      if (!(n in left)) {
        const used = free.filter((x) => x.from === n && !x.pool).reduce((a, x) => a + (Number(x.giveQty) || 0), 0);
        left[n] = Math.max(0, (Number((pg.owned || {})[n]) || 0) - (Number((pg.needFull || {})[n]) || 0) - used);
      }
      return left[n];
    };
    const outPk = [];
    pk.forEach((x) => {
      const give = Math.floor(Math.min(ownLeft(x.from), x.giveQty));
      if (give > 0) {
        const get = Math.floor((x.getQty * give) / x.giveQty);
        left[x.from] -= give;
        fr.push({ from: x.from, to: x.to, giveQty: give, getQty: get, split: true });
        if (x.giveQty - give > 0) outPk.push({ ...x, giveQty: x.giveQty - give, getQty: Math.max(0, x.getQty - get) });
      } else outPk.push(x);
    });
    return { free: merge(fr), packs: outPk.filter((x) => x.giveQty > 0) };
  };
  const tradesHtml = (pg, sh) => {
    const { free, packs } = tradeListsOf(pg, sh);
    if (!free.length && !packs.length) return "";
    const heroOf = new Map(heroRows().flatMap((r) => [[`${r.hero.name} Shards`, r.hero.name], [`${r.hero.name} Widgets`, r.hero.name]]));
    const full = (n) => heroOf.has(n) ? (/Widgets$/.test(n) ? t("bud_tr_widgets").replace("{h}", heroOf.get(n)) : `${heroOf.get(n)} ${t("bud_tr_shards_s")}`) : Object.values(HERO_GENERAL_SHARD).includes(n) ? t("bud_tr_general") : materialDisplayName(n);
    const row = (x, kind) => {
      const tip = `${qty(x.giveQty)} ${full(x.from)} → ${qty(x.getQty)} ${full(x.to)}`;
      return `<div class="bud-trr" title="${esc(tip)}" aria-label="${esc(tip)}">${icHtml(x.from)}<b>${esc(qty(x.giveQty))}</b><span class="bud-tra">→</span>${icHtml(x.to)}<b>${esc(qty(x.getQty))}</b><span class="bud-trn">${heroOf.has(x.to) ? esc(heroOf.get(x.to)) : ""}</span><span class="bud-trp ${kind}">${esc(t(kind === "free" ? "bud_tr_pill_free" : "bud_tr_pill_packs"))}</span></div>`;
    };
    const tab = BUDGET_TR_TAB === "packs" ? (packs.length ? "packs" : "free") : free.length ? "free" : "packs";
    const note = (k) => {
      if (k === "free") return packs.length ? t(packs.length === 1 ? "bud_tr_more_packs1" : "bud_tr_more_packs").replace("{n}", packs.length) : t("bud_tr_none_packs");
      return free.length ? t(free.length === 1 ? "bud_tr_more_free1" : "bud_tr_more_free").replace("{n}", free.length) : t("bud_tr_none_free");
    };
    const pane = (k, list) => `<div class="bud-trp-pane" data-budtrpane="${k}"${k === tab ? "" : " hidden"}>${list.length ? `<div class="bud-trl">${list.map((x) => row(x, k)).join("")}</div>` : ""}<div class="meta bud-trnote">${esc(note(k))}</div></div>`;
    return `<div class="bud-tr"><div class="bud-trh">&#8644; ${esc(t("bud_tr_title"))}</div>
      <div class="bud-trsw" role="tablist"><button type="button" role="tab" data-budtrtab="free" class="${tab === "free" ? "on" : ""}" aria-selected="${tab === "free"}"${free.length ? "" : " disabled"}>${esc(t("bud_tr_free"))} (${free.length})</button><button type="button" role="tab" data-budtrtab="packs" class="${tab === "packs" ? "on" : ""}" aria-selected="${tab === "packs"}"${packs.length ? "" : " disabled"}>${esc(t("bud_tr_packs"))} (${packs.length})</button></div>
      ${pane("free", free)}${pane("packs", packs)}</div>`;
  };
  // Per-page cards.
  let grandTotal = 0, grandCurrency = null, grandDays = 0, anyPlan = false;
  const grandMats = {}, grandDeltas = [];
  // Design B3: each page is a tile; its details
  // (materials, pack cost, stat increase) open in a sheet.
  const B3_PAGES = [];
  pages_.forEach((pg, i) => {
    const label = packPageLabel(pg.calcKey);
    const grp = packGroupOf(pg.calcKey);
    const inc = included(pg.calcKey);
    const pageRow = (right, body, dim, more) => { B3_PAGES.push({ pg, i, inc, label, glabel: grp && grp.group ? packGroupLabel(grp) : "", right, body, dim, ...(more || {}) }); return ""; };
    if (pg.missing) return pageRow(`<span class="meta" style="font-size:11px;">${esc(t(pg.notCounted ? "budgets_not_counted" : pg.stale ? "budgets_open_again" : "budgets_open_once"))}</span>`, "", true);
    const hasNeed = Object.keys(pg.needFull).some((n) => pg.needFull[n] > 0);
    if (!hasNeed) return pageRow(`<span style="color:var(--good); font-size:12px;">&#10003; ${esc(t("budgets_nothing_planned"))}</span>`, "", true);
    if (inc) {
      Object.keys(pg.needStill).forEach((n) => { if (pg.needStill[n] > 0) grandMats[n] = (grandMats[n] || 0) + pg.needStill[n]; });
      pg.deltas.forEach((d) => grandDeltas.push(d));
      if (combined.dropped.includes(pg.calcKey) && pg.chosen) { anyPlan = true; grandTotal += packPlanLocal(pg.chosen); grandCurrency = grandCurrency || (pg.packGroups[0] && pg.packGroups[0].offers[0].currency); grandDays = Math.max(grandDays, pg.chosen.days); }
    }
    let costHtml;
    if (!pg.tables.length) costHtml = `<div class="meta" style="font-size:11px;">${esc(t("budgets_no_packs"))}</div>`;
    else if (!Object.keys(pg.need).length) costHtml = `<div class="meta" style="font-size:11px; color:var(--good);">${esc(t("pack_nothing_needed"))}</div>`;
    else if (inc && combined.inc.includes(pg.calcKey) && combined.chosen) {
      const sh = combined.shares[pg.calcKey] || { total: 0, rows: [] };
      const cur = combined.chosen.rows[0]?.currency;
      costHtml = `
        <div style="display:flex; align-items:baseline; gap:8px; flex-wrap:wrap;">
          <span style="font-size:20px; font-weight:700;">${packFmtLocal(Math.ceil(packSharesLocal(sh)), cur, true, combined.chosen.rows[0]?.price)}</span>
          <span class="meta" style="font-size:11px;">${esc(t("combined_share"))}</span>
        </div>
        ${sh.rows.length ? shareListHtml(pg.calcKey, sh, Math.ceil(packSharesLocal(sh)), cur, combined.chosen.rows[0]?.price) : `<div class="meta" style="font-size:11px;">${esc(t("combined_no_share"))}</div>`}`;
    }
    else if (inc && planPending) costHtml = workHtml("div", "small");
    else if (inc && combined.inc.includes(pg.calcKey)) costHtml = `<div class="meta" style="font-size:11px; color:var(--danger);">${esc(t("pack_cant_cover"))}</div>`;
    else if (!pg.chosen) costHtml = `<div class="meta" style="font-size:11px; color:var(--danger);">${inc ? esc(t("pack_cant_cover")) : "—"}</div>`;
    else {
      const c = pg.chosen;
      const late = targetDays != null && c.days > targetDays;
      const alt = [pg.fastest && `${t("pack_plan_fastest")}: ${packFmtLocal(Math.ceil(packPlanLocal(pg.fastest)), c.rows[0]?.currency, true, c.rows[0]?.price)} · ${fmtDate(pg.fastest.days)}`,
                   pg.cheapest && `${t("pack_plan_cheapest")}: ${packFmtLocal(Math.ceil(packPlanLocal(pg.cheapest)), c.rows[0]?.currency, true, c.rows[0]?.price)} · ${fmtDate(pg.cheapest.days)}`].filter(Boolean);
      costHtml = `
        <div style="display:flex; align-items:baseline; gap:8px; flex-wrap:wrap;">
          <span style="font-size:20px; font-weight:700;">${packFmtLocal(Math.ceil(packPlanLocal(c)), c.rows[0]?.currency, true, c.rows[0]?.price)}</span>
          <span class="meta" style="font-size:11px;">${esc(pg.byTarget ? t("pack_plan_by_target") : t("pack_plan_cheapest"))}</span>
          <span class="meta" style="font-size:11px; color:${late ? "var(--danger)" : "var(--good)"};">${c.days === 0 ? esc(t("pack_ready_now")) : `${esc(fmtDate(c.days))} · ${c.days} ${esc(t("pack_days_short_long"))}`}</span>
        </div>
        ${targetDays != null && !pg.byTarget ? `<div class="meta" style="font-size:10.5px; color:var(--danger);">${esc(t("pack_not_reachable"))} ${esc(t("pack_earliest"))} ${esc(fmtDate(pg.earliest))}</div>` : ""}
        <details style="margin-top:4px;"><summary class="meta" style="cursor:pointer; font-size:11px;">${esc(t("budgets_packs_detail"))} (${c.rows.length})</summary>${packRowsHtml(c)}
          ${(c.trades || []).length ? `<div class="meta" style="font-size:10px; margin-top:4px; color:var(--ice);">${esc(t("trade_then"))}: ${c.trades.map((x) => `${qty(x.giveQty)} ${esc(materialDisplayName(x.from))} → ${qty(x.getQty)} ${esc(materialDisplayName(x.to))}${x.lab ? ` (${esc(t("rfc_title"))}, ${x.lots} ${esc(t("rfc_weeks"))})` : ""}`).join(" &middot; ")}</div>` : ""}
          <div class="meta" style="font-size:10px; margin-top:4px;">${alt.map(esc).join(" &nbsp;&middot;&nbsp; ")}</div></details>`;
    }
    const shareOf = inc && combined.inc.includes(pg.calcKey) && combined.chosen ? (combined.shares[pg.calcKey] || { total: 0, rows: [] }) : null;
    // Ticked, nothing still needed after the Backpack and trades, no plan: the Backpack covers it.
    const bpCovers = inc && !shareOf && !pg.chosen && !(planPending && Object.keys(pg.need).length) && !Object.values(pg.needStill || {}).some((v) => v > 0);
    const rowCost = !inc ? "&nbsp;" : bpCovers ? "" : planPending && Object.keys(pg.need).length ? `<span class="bud-pending small">…</span>` : shareOf ? `<b>${packFmtLocal(Math.ceil(packSharesLocal(shareOf)), combined.chosen.rows[0]?.currency, true, combined.chosen.rows[0]?.price)}</b>` : pg.chosen ? `<b>${packFmtLocal(Math.ceil(packPlanLocal(pg.chosen)), pg.chosen.rows[0]?.currency, true, pg.chosen.rows[0]?.price)}</b>` : `<span style="color:var(--danger);">!</span>`;
    // Heroes beyond the roster: who'd take each troop's roster place (stat increase note).
    const swapNote = pg.calcKey === "hero_shards" ? (tr) => {
      const w = BUDGET_HERO_SWAPS && BUDGET_HERO_SWAPS[tr];
      if (!w) return "";
      const st = (v) => { const s0 = Math.round(v * 6); return s0 % 6 ? `${Math.floor(s0 / 6)}.${s0 % 6}\u2605` : `${s0 / 6}\u2605`; };
      const lv = (o) => `${st(o.stars)}${o.widget != null ? ` \u00b7 ${t("bud_swap_w").replace("{w}", o.widget)}` : ""}`;
      const face = (h) => { const im = h && (h.image_url || HERO_IMG_BY_NAME[h.name]); return im ? `<img src="${esc(im)}" alt="" loading="lazy" />` : ""; };
      const txt = w.from ? t("bud_swap").replace("{h}", w.hero.name).replace("{lv}", lv(w)).replace("{f}", w.from.hero.name).replace("{g}", w.from.hero.generation).replace("{flv}", lv(w.from)) : t("bud_swap_empty").replace("{h}", w.hero.name).replace("{lv}", lv(w));
      return `<div class="bud-swap">${face(w.hero)}<span>${esc(txt)}</span>${w.from ? face(w.from.hero) : ""}</div><div class="meta bud-swapn">${esc(t("bud_swap_note"))}</div>`;
    } : null;
    return pageRow(rowCost, `
      ${upFoldHtml(pg.calcKey)}
      ${!pg.live ? `<div class="meta" style="font-size:10px; margin-top:6px;">${esc(t("budgets_snapshot_note"))}</div>` : ""}
      ${((x) => (x ? `<div class="bud-partial">&#128274; ${esc(t("bud_not_open").replace("{what}", x))}</div>` : ""))(budgetNotOpenText(pg.calcKey))}
      ${pg.calcKey === "hero_shards" ? ngFirstNoteHtml() : ""}
      ${pg.vip ? `<div class="bud-vip">&#127873; ${esc(t("bud_vip_note").replace("{tier}", pg.vip.tier).replace("{n}", qty(pg.vip.total)).replace("{when}", BUDGET_TARGET ? t("vip_bundle_by").replace("{date}", fmtDate(pg.vip.days)) : t("vip_bundle_30d")).replace("{d}", pg.vip.daily))}</div>` : ""}
      <div style="margin-top:10px;"><div class="meta" style="font-size:10.5px; font-weight:600; margin-bottom:4px;">${esc(t("budgets_materials"))} <span style="font-weight:400;">(${esc(t("pack_mode_still"))} / ${esc(t("pack_mode_full"))})</span></div>${matsHtml(pg.needFull, pg.needStill, pg.owned)}
        ${tradesHtml(pg, shareOf)}</div>
      <div style="margin-top:10px;"><div class="meta" style="font-size:10.5px; font-weight:600; margin-bottom:4px;">${esc(t("pack_cost_title"))}</div>${costHtml}</div>
      ${pg.deltas.length ? `<div style="margin-top:10px;"><div class="meta" style="font-size:10.5px; font-weight:600; margin-bottom:4px;">${esc(t("budgets_stat_increase"))}${pg.calcKey === "hero_gear" ? ` · ${esc(t("bud_hg_set1").replace("{set}", gearSetDisplayName("Set 1")))}` : ""}</div>${statTableHtml(pg.deltas, pg.calcKey, swapNote)}</div>` : ""}
      ${pg.calcKey === "hero_gear" && hgOther.length ? `<div class="meta bud-hgnote">${esc(t("bud_hg_note").replace("{sets}", hgOther.map(gearSetDisplayName).join(" / ")))}</div>` : ""}`, false, { bpCovers });
  });

  if (combined.chosen) {
    anyPlan = true;
    grandTotal += packPlanLocal(combined.chosen);
    grandCurrency = grandCurrency || combined.chosen.rows[0]?.currency;
    grandDays = Math.max(grandDays, combined.chosen.days);
  }
  if (BUDGET_VIEW === "budget" && !(spendBest && spendBest.ok)) anyPlan = false;
  const droppedHtml = combined.dropped.length ? `<div class="meta" style="font-size:10.5px; margin-top:4px;">${esc(t("combined_dropped"))}: ${combined.dropped.map((k) => esc(packPageLabel(k))).join(", ")}</div>` : "";
  // "My budget": one line per month (or week): spent of what was there, money
  // kept for the next one, and that period's packs (design C).
  const spendHtml = () => {
    if (!spendBest || !spendBest.ok) return `<div class="meta" style="font-size:11.5px; margin-top:10px; color:var(--danger);">${esc(t("spend_cant"))}</div>`;
    const pl = spendBest.plan, cur = pl.rows[0]?.currency, smp = pl.rows[0]?.price;
    const money = (v) => packFmtLocal(Math.round(v), cur, true, smp);
    const label = (pd) => {
      const d = new Date(packStartOfToday().getTime() + pd.start * 86400000);
      if (spendBest.per === "month") return d.toLocaleDateString(LANG === "en" ? undefined : LANG, { month: "long", ...(d.getUTCFullYear() !== new Date().getUTCFullYear() ? { year: "numeric" } : {}), timeZone: "UTC" });
      const e = new Date(packStartOfToday().getTime() + (spendPeriodStart(pd.p + 1, "week") - 1) * 86400000);
      const f = (x) => x.toLocaleDateString(LANG === "en" ? undefined : LANG, { day: "numeric", month: "short", timeZone: "UTC" });
      return `${f(d)} – ${f(e)}`;
    };
    const lastP = spendBest.periods.length - 1;
    const one = (pd) => {
      // (no "Weekly · N resets": that's the whole plan's, not this month's)
      const rows = pd.items.map((it) => ({ ...pl.rows[it.i], count: it.count, subtotal: pl.rows[it.i].price * it.count, reset: null }));
      const fill = pd.avail > 0 ? Math.min(100, (pd.spent / pd.avail) * 100) : 0;
      const sub = pd.p === lastP ? t("spend_all_done") : spendBest.carry && pd.kept > 0.5 ? t(spendBest.per === "week" ? "spend_kept_week" : "spend_kept_month").replace("{v}", money(pd.kept)) : t("spend_of").replace("{v}", money(pd.avail));
      const fixed = pd.fixed > 0.5 ? ` · ${esc(t("spend_fixed").replace("{v}", money(pd.fixed)))}` : "";
      return `<details class="bud-line bud-spend-p"><summary><span class="bud-line-bar" style="background:${pd.p === lastP ? "var(--good)" : "var(--ice)"};"></span>
        <span class="bud-line-t"><b>${esc(label(pd))}</b>${pd.p === 0 ? ` <span class="meta">· ${esc(t("pur_sug_now"))}</span>` : ""}<span class="bud-spend-bar"><i style="width:${fill.toFixed(1)}%;"></i></span><span class="meta" style="color:${pd.p === lastP || pd.kept > 0.5 ? "var(--good)" : ""};">${esc(sub)}</span>${fixed ? `<span class="meta">${fixed}</span>` : ""}</span>
        <span class="bud-line-v"><b>${money(pd.spent)}</b><span class="meta">${esc(t("bud_line_packs").replace("{n}", rows.length))} <span class="bud-line-arrow">&#9656;</span></span></span></summary>
        <div class="bud-line-body">${rows.length ? packRowsHtml({ rows }) : ""}</div></details>`;
    };
    const ps = spendBest.periods;
    return ps.slice(0, 8).map(one).join("") + (ps.length > 8 ? `<details class="bud-spend-more"><summary class="meta">${esc(t("spend_show_all").replace("{n}", ps.length))}</summary>${ps.slice(8).map(one).join("")}</details>` : "");
  };
  // The plan cards under the big total.
  const viewCardsHtml = (() => {
    if ((!combinedRaw.chosen && !startOnly) || viewKeys.length < 2) return "";
    const title = (k) => k === "budget" ? t("budgets_view_budget") : k === "fastest" ? t("budgets_view_fastest") : k === "cheapest" ? t("budgets_view_cheapest") : dlPlan ? t("budgets_view_dates") : (reachable ? t("budgets_view_target") : t("budgets_view_cheapest"));
    const shortDate = (d) => { const x = new Date(packStartOfToday().getTime() + d * 86400000); return x.toLocaleDateString(LANG === "en" ? undefined : LANG, x.getUTCFullYear() !== new Date().getUTCFullYear() ? { month: "short", year: "numeric", timeZone: "UTC" } : { day: "numeric", month: "short", timeZone: "UTC" }); };
    const seg = (k) => {
      if (!viewReady(k)) return `<button type="button" data-budgetview="${k}" class="${k === BUDGET_VIEW ? "on" : ""}" title="${esc(`${title(k)} · ${t("budgets_working")}`)}">${esc(title(k))}<b class="bud-pending small">&hellip;</b><span>&nbsp;</span></button>`;
      if (k === "budget" && !(spendBest && spendBest.ok)) return `<button type="button" data-budgetview="budget" class="${k === BUDGET_VIEW ? "on" : ""} late">${esc(title(k))}<b>—</b><span>&nbsp;</span></button>`;
      const v = viewData(k), late = targetDays != null && v.days > targetDays;
      return `<button type="button" data-budgetview="${k}" class="${k === BUDGET_VIEW ? "on" : ""}${late ? " late" : ""}" title="${esc(`${title(k)} · ${fmtDate(v.days)}`)}">${esc(title(k))}<b>${packFmtLocal(Math.ceil(v.total), v.sample?.currency, true, v.sample?.price)}</b><span>${v.days === 0 ? esc(t("pack_ready_now")) : esc(shortDate(v.days))}</span></button>`;
    };
    // My Purchases follows the plan picked here (one plan for both pages).
    const fol = BUDGET_FOCUS_VIEW ? `<div class="meta b3-fol pick">&#8593; ${esc(t("b3_follow_both"))}</div>` : `<div class="meta b3-fol"><span class="good">&#10003; ${esc(t("b3_follow"))}</span> · ${esc(t("b3_follow_pick"))}</div>`;
    return `${targetDays != null && !reachable ? `<div class="meta" style="font-size:11px; margin-top:8px; color:var(--danger);">${esc(t("budgets_cant_target").replace("{date}", fmtDate(targetDays)))}</div>` : ""}
      <div class="bud-seg${BUDGET_FOCUS_VIEW ? " flash" : ""}">${viewKeys.map(seg).join("")}</div>${fol}`;
  })();
  // Items shared by pages from one Backpack amount count it once (see budgetSharedOwnedExtra).
  Object.values(budgetSharedOwnedExtra(pagesRaw.filter((pg) => !pg.missing && included(pg.calcKey)))).forEach((m) => Object.entries(m).forEach(([n, q]) => { grandMats[n] = (grandMats[n] || 0) + q; }));
  // "Materials still needed": picture + short amount; the name and exact number show on hover / long press.
  const grandMatChip = (n) => {
    const icon = itemRegIcon(n) || (/^Research Speedups/.test(n) ? "icons/speedup-research.png" : bpIcon({ name: n.replace(/ \(minutes\)$/, "") }));
    const short = /\(minutes\)$/.test(n) ? t12FormatTime(grandMats[n] / 60) : shortAmount(grandMats[n]);
    const label = `${materialDisplayName(n).replace(/\s*\((minutes|min)\)$/, "")}: ${qty(grandMats[n])}`;
    return `<span class="bud-mat" title="${esc(label)}" aria-label="${esc(label)}">${icon ? `<img src="${esc(icon)}" alt="" loading="lazy" />` : `<i>${esc(materialDisplayName(n).charAt(0))}</i>`}${heroItemMark(n)}<b>${esc(short)}</b></span>`;
  };

  // Order of goals (admin): see budgetGoalList / budgetGoalDates.
  let goalsCardHtml = "", goalFlagsHtml = "", goalsInfoHtml = "";
  BUDGET_GOAL_MATCH = null;
  void (() => {
    if (!visitorCan("goals")) return "";
    const planKeys = split ? split.target.keys.concat(split.late.keys) : (combinedRaw.inc || []);
    // Pages the combined plan had to plan on their own are goals too (their
    // own plan's packs join the dates below).
    const droppedKeys = (combinedRaw.dropped || []).filter((k) => included(k) && !planKeys.includes(k));
    const incKeys = planKeys.concat(droppedKeys);
    const keys0 = planPending ? pagesRaw.filter((pg) => included(pg.calcKey) && !pg.missing && Object.keys(pg.need || {}).length).map((pg) => pg.calcKey) : incKeys;
    // Ticked pages with nothing to buy (the Backpack covers them): their picked goals are listed too, reached "Now".
    const covKeys = pagesRaw.filter((pg) => included(pg.calcKey) && !pg.missing && !keys0.includes(pg.calcKey) && !Object.values(pg.needStill || {}).some((v) => v > 0) && !(planPending && Object.keys(pg.need || {}).length)).map((pg) => pg.calcKey);
    const keys = keys0.concat(covKeys);
    const goals = budgetGoalList(pagesRaw, keys0, false, covKeys);
    const nGoals = goals.filter((g) => !g.rest).length;
    if (!nGoals && !keys.length && !included("hero_shards")) return "";
    const ck = "__budget:" + incKeys.join(",");
    // Pages the plan knows can't make the main target: without a date of their own they are bought the cheapest way after it.
    const lateKeys = split ? split.late.keys : [];
    // (the plain plan of the view on screen: with the goals' dates the main view shows the dated one)
    const basePlan0 = BUDGET_VIEW === "budget" ? (splitMain ? splitMain.plan : combinedRaw.chosen) : planPending ? null : (viewDataPlain(BUDGET_VIEW).plan || combinedRaw.chosen);
    const dropPlans = droppedKeys.map((k) => pagesRaw.find((x) => x.calcKey === k)).filter(Boolean).map((pg) => pickDropped(pg, BUDGET_VIEW === "budget" ? "main" : BUDGET_VIEW)).filter(Boolean);
    const basePlan = !dropPlans.length ? basePlan0 : [basePlan0, ...dropPlans].filter(Boolean).reduce((a, pl) => ({ rows: a.rows.concat(pl.rows || []), total: a.total + (pl.total || 0), days: Math.max(a.days, pl.days || 0), trades: a.trades.concat(pl.trades || []) }), { rows: [], total: 0, days: 0, trades: [] });
    const by = BUDGET_GOALS.by || {}, due = budgetGoalDue(goals);
    // Goals with their own dates: the plan bought for those dates (asked for
    // above, see datedSetup; one plan whatever view is on screen).
    const mainDay = datedSetup ? datedSetup.mainDay : targetDays != null ? targetDays : basePlan ? basePlan.days || 0 : null;
    const dlPending = !planPending && basePlan && due.some((d) => d != null) && !dl;
    const plan = dlPlan || basePlan;
    // The day a goal is bought for: its own date, else the main target; null =
    // on a page that can't make the target (bought after it, no day of its own).
    const stageDay = (g, i) => (due[i] != null ? due[i] : g.page && lateKeys.includes(g.page) ? null : mainDay);
    const partOf = (g, i) => { const sd = stageDay(g, i); return dlPlan && sd != null ? dl.parts.find((x) => !x.late && x.day === sd) : null; };
    // The plain plan with a part after the target: its other pages are bought by the target.
    const splitPlan = !!splitMain && basePlan0 === splitMain.plan;
    // With a dated plan the goals take what the packs give in the order of
    // their days, as the plan was bought (same day: their order on the list;
    // the pages that can't make the target last).
    const takeOrder = dlPlan ? goals.map((g, i) => i).sort((a, b) => { const da = stageDay(goals[a], a), db = stageDay(goals[b], b); return (da == null ? Infinity : da) - (db == null ? Infinity : db) || a - b; }) : null;
    // (with a dated plan, how much of each goal is there by its part's day: own date or the main target)
    const dates = !planPending && plan ? budgetGoalDates(goals, pagesRaw, plan, ck, dlPlan ? goals.map((g, i) => stageDay(g, i)) : due, takeOrder) : null;
    // The planner's own answer wins over the dates worked out from the buying
    // days (those are a close guess: trades are spread over the whole plan).
    // Without a dated plan, a page the plan buys by the target is done by it.
    if (dates && !dlPlan) goals.forEach((g, i) => {
      if (stageDay(g, i) == null || !dates[i] || dates[i].done) return;
      if (splitPlan && due[i] == null && targetDays != null && dates[i].day > targetDays) dates[i] = { ...dates[i], day: targetDays, approx: false };
    });
    // With one, each goal belongs to a part planned for its day (or, when it
    // can't make it, for its earliest day; the pages that can't make the target
    // come last). A goal has what it needs once its part is bought - and the
    // parts of the goals before it (see takeOrder) that need the same items.
    if (dates && dlPlan) {
      const segsD = budgetGoalSegs(goals, pagesRaw), latePart = dl.parts.find((x) => x.late);
      const boughtBy = goals.map((g, i) => {
        if (stageDay(g, i) == null) return latePart && latePart.done != null ? latePart.done : null;
        const part = partOf(g, i);
        return !part ? null : part.ok ? (part.done != null ? part.done : part.day) : part.earliest;
      });
      takeOrder.forEach((i, pos) => {
        if (!dates[i] || dates[i].done || boughtBy[i] == null) return;
        const mine = Object.keys(segsD.get(goals[i].id) || {});
        let by = boughtBy[i];
        for (let q = 0; q < pos && by != null; q++) {
          const j = takeOrder[q], sj = segsD.get(goals[j].id) || {};
          if (mine.some((n) => sj[n] > 1e-9)) by = boughtBy[j] == null ? null : Math.max(by, boughtBy[j]);
        }
        if (by == null) return;
        const part = partOf(goals[i], i), cant = !!part && !part.ok;
        let day = cant ? by : Math.min(dates[i].day, by);
        // (In the part bought after the target, a goal reached in that part's last
        // week shows the part's own last day: the day the total card says it is all done.)
        if (stageDay(goals[i], i) == null && by > day && by - day < 7) day = by;
        dates[i] = { ...dates[i], day, approx: cant || day !== dates[i].day ? false : dates[i].approx };
      });
    }
    // A goal of a hero not out yet is never reached before its release.
    // (Nothing left to buy for it - e.g. the Backpack's General shards pay its unlock - is still its release day, not "Now".)
    if (dates) goals.forEach((g, i) => { const o = g.up && g.up.notOut; if (o && dates[i] && o.rel > 0 && (dates[i].done || dates[i].day < o.rel)) dates[i] = { ...dates[i], done: false, day: o.rel, approx: false }; });
    // A page isn't finished before its own goals: its rest is done no sooner than they are.
    if (dates) goals.forEach((g, i) => {
      if (!g.rest || !dates[i] || dates[i].done) return;
      const last = Math.max(-1, ...goals.map((h, j) => (h.up && h.page === g.page && dates[j] && !dates[j].done ? dates[j].day : -1)));
      if (last > dates[i].day) dates[i] = { ...dates[i], day: last, afterGoal: true };
    });
    const cur = plan && plan.rows[0] ? plan.rows[0].currency : grandCurrency, smp = plan && plan.rows[0] ? plan.rows[0].price : undefined;
    const money = (v) => packFmtLocal(Math.ceil(v), cur, true, smp);
    // B3 goal flags header (the flags follow once the dates are worked out).
    const railHead = `<div class="b3-rail-l"><span class="b3-lbl">${esc(t("b3_flags"))}</span><button type="button" class="b3-a" data-b3sheet="goals">&#8645; ${esc(t("b3_goals_n").replace("{n}", nGoals))} &#8250;</button></div>`;
    goalFlagsHtml = `<div class="b3-rail">${railHead}${workHtml("div", "small")}</div>`;
    // (with the goals' dates, the plan beside it is the plain main one, whatever view is on screen)
    const total = plan ? packPlanLocal(plan) : 0, baseTotal = dlPlan ? viewDataPlain("main").total : basePlan ? packPlanLocal(basePlan) : 0;
    const shortD = (d) => (d === 0 ? t("pcl_today") : fmtDate(d));
    const nameOf = budgetGoalName;
    const byText = (b, d) => { const nm = goalByName(b); return `${goalByIcon(b)} ${nm}${nm && d != null ? " · " : ""}${d != null ? fmtDate(d) : ""}`; };
    const y0g = packStartOfToday().getUTCFullYear(), locG = LANG === "en" ? undefined : LANG;
    const gdTxt = (dt) => {
      if (!dt) return "—";
      if (dt.done) return t("goal_now");
      if (dt.day <= 0) return t("pcl_today"); // (today's packs reach it: not "Now", it still has to be bought)
      const x = new Date(packStartOfToday().getTime() + dt.day * 86400000), s0 = x.toLocaleDateString(locG, { day: "numeric", month: "short", timeZone: "UTC" });
      return (dt.approx ? "~" : "") + (x.getUTCFullYear() !== y0g ? `${s0} ’${String(x.getUTCFullYear()).slice(2)}` : s0);
    };
    // A date for a card: one with a year takes two short lines ("Mar 5" over "’27").
    const gdCard = (dt) => { const tx = gdTxt(dt), m = tx.match(/^(.*) (\u2019\d\d)$/); return m ? { h: `${esc(m[1])}<br>${esc(m[2])}`, y2: true } : { h: esc(tx), y2: false }; };
    // Goals of a hero not out yet: which source the plan uses for them (best effort
    // from the plan's packs: Mystery Points bought before the release, the hero's
    // Forge / Value Hero Pack, General shards).
    let segsAll = null, schedAll = null;
    const srcLine = (g, i) => {
      const u = g.up, o = u && u.notOut;
      if (!o || !plan || !plan.rows || planPending) return null;
      if (!schedAll) schedAll = packPlanSchedule(plan.rows);
      if (!segsAll) segsAll = budgetGoalSegs(goals, pagesRaw);
      const names = u.group ? u.group.map((x) => x.name) : [u.hero];
      const gives = (r, n) => Number((r.gives || {})[n]) > 0;
      const dueI = due[i] != null ? due[i] : mainDay;
      const rel = goalDayShort(o.rel);
      if (u.kind === "w") {
        // The Forge pack counts only when it comes by the goal's day; Mystery Points
        // only when what the goal needs is more than the Forge packs give.
        const seg = segsAll.get(g.id) || {}, n = Object.entries(seg).filter(([k]) => / Widgets$/.test(k)).reduce((a, [, v]) => a + v, 0);
        const forgeOk = dueI == null || dueI >= o.forge;
        const forgeGive = !forgeOk ? 0 : plan.rows.reduce((a, r) => a + names.reduce((b, h) => b + (Number((r.gives || {})[`${h} Widgets`]) || 0) * (r.count || 1), 0), 0);
        const mp = plan.rows.some((r, k) => gives(r, "Mystery Points") && (schedAll[k] || []).some((x) => x.off < o.rel));
        const needMp = n > forgeGive + 0.5;
        if (forgeGive > 0 && needMp && mp) return { ic: HERO_ITEM_ICON.widget, tx: t("gu_src_both") };
        if (forgeGive > 0) return { ic: HERO_ITEM_ICON.widget, tx: t("gu_src_forge").replace("{d}", goalDayShort(o.forge)), forge: true };
        if (mp) return { ic: BP_EXTRA_ICONS["Mystery Points"], tx: t("gu_src_mp").replace("{d}", rel).replace("{n}", Math.round(n).toLocaleString()) };
        return null;
      }
      const own = plan.rows.some((r) => names.some((h) => gives(r, `${h} Shards`)));
      const gen = plan.rows.some((r) => ["Mythic General Hero Shard", "Marks of Valor", "Mythic General Hero Lucky Box"].some((n) => gives(r, n)));
      const ic = BP_SHARD_ICONS["Mythic General Hero Shard"];
      return own && gen ? { ic, tx: t("gu_src_gen_own") } : own ? { ic, tx: t("gu_src_own") } : gen ? { ic, tx: t("gu_src_gen") } : null;
    };
    // (Its source decides its day too: a goal paid by the Forge pack alone is reached when that pack comes.)
    const srcOf = new Map();
    goals.forEach((g, i) => {
      const sl = g.up && g.up.notOut ? srcLine(g, i) : null;
      srcOf.set(g.id, sl);
      if (sl && sl.forge && dates && dates[i] && !dates[i].done && dates[i].day < g.up.notOut.forge) dates[i] = { ...dates[i], day: g.up.notOut.forge, approx: false };
    });
    // One picked upgrade: picture, name + page, now → goal level (− / +, any
    // level up to the page's target), the page's target, "By", date ✓ / ⚠.
    const rowHtml = (g, i) => {
      if (g.rest) return "";
      const u = g.up, dt = (dates && dates[i]) || (covKeys.includes(g.page) && !planPending ? { day: 0, spent: 0, done: true } : null), d = due[i], myBy = by[g.id] || "", dIn = goalDeadlineDay(myBy);
      const own = !planPending && !incKeys.includes(g.page) && !covKeys.includes(g.page), lim = d != null ? d : targetDays, last = u.levels.length - 1;
      const pending = planPending || (dlPending && d != null);
      const dTxt = pending ? workHtml("span", "small") : own ? esc(t("gd_own")) : esc(gdTxt(dt));
      const kind = goalByKind(myBy) === "date" ? " date" : myBy ? " ev" : "";
      const lock = u.lockAt >= 0 && g.li >= u.lockAt ? `<small class="gu-lk">&#9888; ${esc(t("gu_lock").replace("{x}", u.lockTxt))}</small>` : "";
      // A goal that can't make its date: how far it gets by then (not the later day it is done).
      const partTxt = (() => {
        if (pending || own || !dt || dt.done || lim == null || !(dt.day > lim) || !(dt.needDue > 0) || dt.gotDue == null) return "";
        const it = dt.items || [], unit = it.length && it.every((n) => / Shards$/.test(n)) ? t("gu_u_shards") : it.length && it.every((n) => / Widgets$/.test(n)) ? t("gu_u_widgets") : it.length === 1 ? itemShortName(it[0]) : "";
        const dd = gdTxt({ day: lim });
        // (and the day it is fully done, when the plan gets there)
        const fully = dt.day > lim ? ` · ${t("gu_part_fully").replace("{d}", gdTxt(dt))}` : "";
        return (unit ? t("gu_part_by").replace("{d}", dd).replace("{a}", Math.floor(dt.gotDue + 1e-6).toLocaleString()).replace("{b}", Math.round(dt.needDue).toLocaleString()).replace("{u}", unit)
          : t("gu_part_pct").replace("{d}", dd).replace("{p}", Math.floor(100 * dt.gotDue / dt.needDue))) + fully;
      })();
      const partH = partTxt ? `<small class="gu-part">&#9888; ${esc(partTxt)}</small>` : "";
      const no = u.notOut || null;
      const picker = BUDGET_GOAL_BY_OPEN === g.id ? goalByPopHtml(myBy, mainDay, no) : "";
      const ic = budgetGoalIcon(g, pagesRaw);
      const src = srcOf.get(g.id), heroGoal = !!(u.hero || u.group);
      const pic = u.group ? `<span class="c3-pic c3-grp">${u.group.slice(0, 3).map((x) => (x.img ? `<img src="${esc(x.img)}" alt="" loading="lazy" />` : `<i>${esc(x.name.charAt(0))}</i>`)).join("")}</span>`
        : ic.src ? `<img class="c3-pic${ic.face ? " face" : ""}" src="${esc(ic.src)}" alt="" loading="lazy" />` : `<i class="c3-pic">${esc(u.name.charAt(0))}</i>`;
      // Card C: 1: ⋮⋮, number, picture, the name over the can-do status as small
      // text (cdaPatchGoals puts it there), the date at the right end (amber ⚠
      // after its By / the target). 2: − level +, short By chip, ✕.
      const isLate = !pending && !own && dt && !dt.done && lim != null && dt.day > lim;
      // (done on or before its By / the target: the date in green with ✓)
      const isOk = !pending && !own && !!dt && lim != null && (dt.done || dt.day <= lim);
      // (a goal that only gets part of the way shows its own day with ⚠, the line under it says how far)
      const dc = pending || own ? null : gdCard(partTxt ? { day: lim } : dt);
      // (A hero not out yet: the day it is really due, never before its release.)
      const byD = no && d != null ? d : myBy ? dIn : mainDay;
      const bs = goalByShort(myBy), byShort = `${goalByIcon(myBy)} ${bs}${byD != null ? `${bs ? " " : ""}${gdTxt({ day: byD })}` : ""}`;
      const nmH = `${esc(u.name)}${heroGoal ? ` <em>${esc(goalLvTxt(g.lv.label))}</em>` : ""}${no ? ` <span class="gu-out">${esc(t("gu_out").replace("{d}", goalDayShort(no.rel)))}</span>` : ""}`;
      return `<li class="bud-g gu c3${no ? " no" : ""}" data-goal="${esc(g.id)}">
        <span class="bud-g-h" data-goaldrag role="button" tabindex="0" aria-label="${esc(t("goals_desc_drag"))}" title="${esc(t("goals_desc_drag"))}">&#8942;&#8942;</span>
        <span class="c3-b">
          <span class="c3-l1${dc && dc.y2 ? " y2" : ""}${src ? " has-cd" : ""}${u.group ? " grp" : ""}"><span class="c3-no">${i + 1}</span>${pic}<b class="c3-nm" title="${esc(`${u.name} · ${packPageLabel(g.page)} · ${u.now} → ${goalLvTxt(g.lv.label)}`)}">${nmH}</b><span class="c3-dt${isLate ? " late" : isOk ? " ok" : ""}${pending ? " wk" : ""}" title="${pending ? esc(t("budgets_working")) : ""}">${isLate ? "&#9888; " : isOk ? "&#10003; " : ""}${pending ? "&hellip;" : dc ? dc.h : dTxt}</span>${src ? `<span class="gu-src"><img src="${esc(src.ic)}" alt="" />${esc(src.tx)}</span>` : ""}</span>
          <span class="c3-l2 gu-r2"><span class="gu-st"><button type="button" data-gustep="-1" ${g.li <= 0 ? "disabled" : ""} aria-label="&minus;">&minus;</button><b>${esc(goalLvTxt(g.lv.label))}</b><button type="button" data-gustep="1" ${g.li >= last ? "disabled" : ""} aria-label="+">+</button></span><button type="button" class="bud-g-by${kind}${BUDGET_GOAL_BY_OPEN === g.id ? " open" : ""}" data-goalby aria-expanded="${BUDGET_GOAL_BY_OPEN === g.id}" title="${esc(byText(myBy, byD))}">${esc(byShort)} ${BUDGET_GOAL_BY_OPEN === g.id ? "&#9652;" : "&#9662;"}</button>${u.group ? `<span class="gu-n3">${esc(t("gu_grp_n").replace("{n}", u.group.length))}</span>` : ""}<button type="button" class="gu-rm" data-goalrm aria-label="${esc(t("goal_remove"))}" title="${esc(t("goal_remove"))}">&times;</button></span>
          ${partH}${lock}
        </span>
        ${picker}</li>`;
    };
    // "Rest of the plan" (By-1): what is left of each page after the goals, one
    // row per page: picture, name, when it is done (amber ⚠ after its date) and
    // its own "By" (the goals' pop-over); under it a line when the dates change the total.
    const restHtml = () => {
      const segsR = budgetGoalSegs(goals, pagesRaw);
      const list = goals.map((g, i) => ({ g, i })).filter(({ g }) => g.rest && Object.keys(segsR.get(g.id) || {}).length);
      if (!list.length) return "";
      const rowR = ({ g, i }) => {
        const dt = dates && dates[i], d = due[i], myBy = by[g.id] && by[g.id] !== "main" ? by[g.id] : "", dIn = goalDeadlineDay(myBy);
        const own = !planPending && !incKeys.includes(g.page), lim = d != null ? d : targetDays;
        const pending = planPending || (dlPending && d != null);
        const isLate = !pending && !own && dt && !dt.done && lim != null && dt.day > lim;
        const isOk = !pending && !own && !!dt && lim != null && (dt.done || dt.day <= lim);
        const kind = goalByKind(myBy) === "date" ? " date" : myBy ? " ev" : "";
        const byD = myBy ? dIn : mainDay;
        const bs = goalByShort(myBy), byShort = `${goalByIcon(myBy)} ${bs}${byD != null ? `${bs ? " " : ""}${gdTxt({ day: byD })}` : ""}`;
        const ic = budgetGoalIcon(g, pagesRaw), open = BUDGET_GOAL_BY_OPEN === g.id;
        // Why it is late, only where the plan says so itself: a page that can't make
        // the target is bought the cheapest way after it; a part that can't make
        // its day is bought as fast as possible; a goal of the page has a later date.
        const afterTarget = d == null && lateKeys.includes(g.page) && (!!dlPlan || splitPlan), part = partOf(g, i);
        const note = !isLate ? "" : (afterTarget ? t("gu_rest_cant") : part && !part.ok ? t("gu_rest_cant_own") : dt.afterGoal ? t("gu_rest_goal_later") : "").replace("{date}", gdTxt({ day: lim }));
        return `<div class="gu-rr" data-goal="${esc(g.id)}">${ic.src ? `<img src="${esc(ic.src)}" alt="" loading="lazy" />` : `<i></i>`}<span class="gu-rr-n">${esc(packPageLabel(g.page))}</span><span class="c3-dt${isLate ? " late" : isOk ? " ok" : ""}${pending ? " wk" : ""}" title="${pending ? esc(t("budgets_working")) : ""}">${isLate ? "&#9888; " : isOk ? "&#10003; " : ""}${pending ? "&hellip;" : own ? esc(t("gd_own")) : esc(gdTxt(dt))}</span><span class="c3-l2"><button type="button" class="bud-g-by${kind}${open ? " open" : ""}" data-goalby aria-expanded="${open}" title="${esc(byText(myBy, byD))}">${esc(byShort)} ${open ? "&#9652;" : "&#9662;"}</button></span>${open ? goalByPopHtml(myBy, mainDay) : ""}</div>${note ? `<div class="gu-rr-note">${esc(note)}</div>` : ""}`;
      };
      const diff = total - baseTotal;
      const sum = !plan || planPending || !dlPlan ? ""
        : `<div class="gu-sum${diff > 0.5 ? " more" : ""}"><b>${esc(t("gu_sum_with").replace("{v}", money(total)))}</b> \u00b7 ${esc((diff < -0.5 ? t("gu_sum_less") : diff > 0.5 ? t("gu_sum_more") : t("gu_sum_same")).replace("{d}", money(Math.abs(diff))).replace("{w}", money(baseTotal)).replace("{what}", targetDays != null ? t("gu_sum_what").replace("{date}", gdTxt({ day: targetDays })) : t("gu_sum_what_none")))}</div>`;
      return `<div class="gu-restbox"><div class="gu-rest-h"><b>${esc(t("gu_rest_name"))}</b><small>${esc(t("gu_rest_sub"))}</small></div>${list.map(rowR).join("")}${sum}</div>`;
    };
    const missing = goalUpMissing(keys);
    const missingHtml = missing.length ? `<div class="meta bud-g-note">${esc(t("gu_open").replace("{p}", missing.map((k) => packPageLabel(k)).join(", ")))}</div>` : "";
    // "+ Add goal": every upgrade set on the ticked pages that isn't a goal
    // yet; tick it and pick its goal level (default = the page's target).
    const addHtml = () => {
      if (!BUDGET_GOAL_ADD) return `<button type="button" class="bud-g-add" data-goaladd>${esc(t("gu_add"))}</button>${missingHtml}`;
      const picked = new Set(goals.filter((g) => g.up).map((g) => g.up.id));
      // (A hero's stars / widgets and the Gen groups can be goals again at another level: they stay on the list.)
      const twice = (u) => u.page === "hero_shards" && goals.filter((g) => g.up && g.up.id === u.id).length < u.levels.length;
      const pickedAt = (u) => goals.filter((g) => g.up && g.up.id === u.id).map((g) => g.lv.label);
      const keysAll = keys.includes("hero_shards") || !included("hero_shards") ? keys : keys.concat("hero_shards");
      const list = keysAll.flatMap((k) => goalUpgrades(k)).filter((u) => !picked.has(u.id) || twice(u));
      const pgs = [...new Set(list.map((u) => u.page))];
      let genHd = null;
      const rowsH = list.map((u) => {
        const last = u.levels.length - 1, lbls = u.levels.map((l) => l.label), at = pickedAt(u);
        // (starts on the highest level that isn't a goal yet)
        let def = last;
        while (def > 0 && at.includes(lbls[def])) def--;
        // The next Gen's heroes (not out yet) under a heading of their own.
        const hd = u.notOut && genHd !== u.notOut.gen ? `<div class="gu-gh" data-gupg="hero_shards" data-gugh>Gen ${esc(String(u.notOut.gen))} <span class="gu-out">${esc(t("gu_out").replace("{d}", goalDayShort(u.notOut.rel)))}</span></div>` : "";
        if (u.notOut) genHd = u.notOut.gen;
        const pic = u.group ? `<span class="gu-grp">${u.group.slice(0, 3).map((x) => (x.img ? `<img src="${esc(x.img)}" alt="" loading="lazy" />` : `<i>${esc(x.name.charAt(0))}</i>`)).join("")}</span>`
          : u.img ? `<img class="${u.face ? "face" : ""}" src="${esc(u.img)}" alt="" loading="lazy" />` : `<i>${esc(u.name.charAt(0))}</i>`;
        return `${hd}<div class="gu-pk" data-gupk="${esc(u.id)}" data-gupg="${esc(u.page)}" data-q="${esc(`${u.name} ${packPageLabel(u.page)}${u.group ? " " + u.group.map((x) => x.name).join(" ") : ""}`.toLowerCase())}" data-lvs="${esc(JSON.stringify(lbls))}" data-li="${def}">
          <button type="button" class="gu-cb" data-gutick aria-pressed="false" aria-label="${esc(u.name)}">&#10003;</button>
          ${pic}
          <span class="gu-pt"><b>${esc(u.name)}</b><small>${esc(t("gu_on_page").replace("{a}", u.now).replace("{b}", goalLvTxt(lbls[last])))} · ${esc(packPageLabel(u.page))}${u.group ? ` · ${esc(t("gu_grp_n").replace("{n}", u.group.length))}` : ""}${at.length ? ` · ${esc(t("gu_goal_at").replace("{x}", at.map(goalLvTxt).join(", ")))}` : ""}</small></span>
          <span class="gu-st gu-ps"><button type="button" data-gupkstep="-1" aria-label="&minus;" ${def <= 0 ? "disabled" : ""}>&minus;</button><b>${esc(goalLvTxt(lbls[def]))}</b><button type="button" data-gupkstep="1" aria-label="+" ${def >= last ? "disabled" : ""}>+</button></span>
          <span class="gu-pv">${esc(goalLvTxt(lbls[def]))}</span></div>`;
      }).join("");
      return `<div class="gu-sheet" data-gusheet>
        <div class="gu-grab"></div>
        <div class="gu-sh"><b>${esc(t("gu_add_title").replace("{n}", list.length))}</b>${closeXHtml("data-goalcancel", "gu-x")}</div>
        ${list.length ? `<input type="search" class="gu-q" data-guq placeholder="${esc(t("gu_search"))}" aria-label="${esc(t("gu_search"))}" autocomplete="off" />
        <div class="gu-chips"><button type="button" class="on" data-gupage="">${esc(t("gu_all"))} ${list.length}</button>${pgs.map((k) => `<button type="button" data-gupage="${esc(k)}">${esc(packPageLabel(k))} ${list.filter((u) => u.page === k).length}</button>`).join("")}</div>
        <div class="gu-list">${rowsH}</div>` : `<div class="meta">${esc(t("gu_none"))}</div>`}
        ${missingHtml}
        <button type="button" class="btn gu-save" data-gusave disabled>${esc(t("gu_save").replace("{n}", 0))}</button>
      </div>`;
    };
    // Hero targets: each hero's stars and widgets target (− / +), heroes at their
    // targets folded into one green line, the next Gen's heroes (not out yet) under
    // their own heading with "+ Add as goals", "+ Add a hero". (No push / pick-2
    // any more: saved `push` / `pushGen` are left as they are and not read.)
    const heroEdHtml = () => {
      // Shown while the Heroes page is ticked, even with nothing to buy (to add heroes).
      if (!included("hero_shards") || !HERO_PLAN_LAST || !HERO_TARGETS) return "";
      const HT = HERO_TARGETS, rows = HERO_PLAN_LAST.rows, heroes = HERO_PLAN_LAST.heroes || [], wMax = widgetMaxLevel();
      const face = (h) => { const img = h.image_url || HERO_IMG_BY_NAME[h.name]; return img ? `<img src="${esc(img)}" alt="" loading="lazy" />` : `<i>${esc(h.name.charAt(0))}</i>`; };
      const atTarget = (r) => r.step >= r.tStep && (!r.hasWidget || r.wLevel >= r.tW);
      const stepper = (attr, v, lo, hi, fmt, dis, lab) => `<span class="gu-st ht-st"><button type="button" data-htstep="${attr}|-1" ${dis || v <= lo ? "disabled" : ""} aria-label="${esc(lab)} &minus;">&minus;</button><b>${esc(fmt(v))}</b><button type="button" data-htstep="${attr}|1" ${dis || v >= hi ? "disabled" : ""} aria-label="${esc(lab)} +">+</button></span>`;
      const line = (r) => {
        const h = r.hero, T = HT.heroes[h.id] || {}, st = T.stars != null ? Number(T.stars) : 5, w = T.widget != null ? Number(T.widget) : wMax;
        const hall = HALL_OF_HEROES_HERO[Number(h.generation)] === h.name, src = heroSourceLabel(heroSource(h.name, h.generation));
        const sub = [troopDisplayName(r.troop || h.troop_type || ""), !hall ? src : "", r.unlock > 0 ? t("ht_unlock").replace("{n}", r.unlock) : "", !r.inRoster && !r.notOut ? t("ht_added") : ""].filter(Boolean).join(" \u00b7 ");
        const later = !r.notOut ? `<label class="bud-ht-c"><input type="checkbox" data-htlater ${T.later ? "checked" : ""} /> ${esc(t("ht_later"))}</label>` : "";
        return `<div class="bud-ht-r ht2" data-hthero="${esc(h.id)}">
          <div class="ht2-h">${face(h)}<span class="bud-ht-n"><b>${esc(h.name)}${hall ? ` <span class="ht-hall">&#9733; ${esc(t("tl_src_hall"))}</span>` : ""}</b><small>${esc(sub)}</small></span>${later}${r.inRoster ? "" : `<button type="button" class="bud-ht-x" data-htrm aria-label="${esc(t("goal_remove"))}">&times;</button>`}</div>
          <div class="ht2-c"><span class="ht2-k"><span>${esc(t("ht_stars_t"))}</span>${stepper("s", st, 1, 5, (n) => `${n}\u2605`, T.later, t("ht_stars_t"))}</span>${r.hasWidget ? `<span class="ht2-k"><span>${esc(t("ht_widgets_t"))}</span>${stepper("w", w, 0, wMax, (n) => String(n), T.later, t("ht_widgets_t"))}</span>` : ""}</div>
        </div>`;
      };
      const isDone = (r) => !r.notOut && atTarget(r) && !(HT.heroes[r.hero.id] || {}).later;
      const done = rows.filter(isDone), open = rows.filter((r) => !r.notOut && !isDone(r)), next = rows.filter((r) => r.notOut);
      const gens = [...new Set(done.map((r) => Number(r.hero.generation)).filter(Boolean))].sort((a, b) => b - a);
      const doneHtml = done.length ? `<button type="button" class="ht-done" data-htdone aria-expanded="${BUDGET_HT_DONE_OPEN}"><span class="ht-faces">${done.slice(0, 3).map((r) => face(r.hero)).join("")}</span><span class="ht-done-t"><b>&#10003; ${esc(t(done.length === 1 ? "ht_done_1" : "ht_done_n").replace("{n}", done.length))}</b><small>${esc(done.map((r) => r.hero.name).join(", "))}${gens.length ? ` \u00b7 ${gens.map((g) => `Gen ${g}`).join(", ")}` : ""}</small></span><span class="ht-done-a">${BUDGET_HT_DONE_OPEN ? "&#9662;" : "&#9656;"}</span></button>${BUDGET_HT_DONE_OPEN ? done.map(line).join("") : ""}` : "";
      // The next Gen's heroes, by Gen, with "+ Add as goals" (stars + widgets of each, not already goals).
      const nextGens = [...new Set(next.map((r) => Number(r.hero.generation)))].sort((a, b) => a - b);
      const goalKeys = new Set(((BUDGET_GOALS && BUDGET_GOALS.goals) || []).filter((e) => e.page === "hero_shards").map((e) => e.key));
      const nextHtml = nextGens.map((g) => {
        const list = next.filter((r) => Number(r.hero.generation) === g), info = goalNotOutInfo(g);
        // Two goals for the whole Gen (all heroes' stars, all heroes' widgets); one hero
        // alone (no group) gets its own. A hero to rush is added from "+ Add goal".
        const ups = goalUpgrades("hero_shards"), has = (k) => ups.some((u) => u.key === k);
        const add = ["s", "w"].flatMap((kd) => (has(`gen${g}|${kd}`) ? [`gen${g}|${kd}`]
          : list.filter((r) => (kd === "s" ? r.tStep > r.step || (r.unlock > 0 && r.step === 0) : r.hasWidget && r.tW > r.wLevel)).map((r) => `${r.hero.id}|${kd}`))).filter((k) => !goalKeys.has(k) && has(k));
        return `<div class="ht-gh"><b>Gen ${esc(String(g))}</b>${info ? `<span class="gu-out">${esc(t("gu_out").replace("{d}", goalDayShort(info.rel)))}</span>` : ""}</div>${list.map(line).join("")}
          ${add.length ? `<button type="button" class="btn ht-addg" data-htaddgoals="${esc(add.join(","))}">${esc(t("ht_add_goals"))}</button><div class="meta ht-addg-n">${esc(t("ht_add_goals_n").replace("{n}", add.length))}</div>` : ""}`;
      }).join("");
      const listed = new Set(rows.map((r) => r.hero.id));
      const addable = heroes.filter((h) => !listed.has(h.id) && !heroGenNotOut(h.generation));
      // The next Gen's heroes (not out yet) can be planned ahead; later Gens stay hidden.
      const nextGen = newGenGen() ? newGenGen() + 1 : null;
      const addNext = nextGen ? heroes.filter((h) => !listed.has(h.id) && Number(h.generation) === nextGen && heroGenNotOut(h.generation)) : [];
      const nextInfo = addNext.length ? heroGenNotOut(nextGen) : null;
      const optH = (h, soon) => `<option value="${esc(h.id)}">Gen ${esc(String(h.generation || "?"))} \u00b7 ${esc(h.name)}${soon ? ` \u00b7 ${esc(t("ht_not_out"))}${nextInfo && nextInfo.date ? ` \u00b7 ${esc(heroGenNotOutShort(nextInfo))}` : ""}` : ""}</option>`;
      return `<details class="bud-ht ht2-box"${BUDGET_HT_OPEN ? " open" : ""}><summary><span>${esc(t("ht_title"))}</span><span class="ht-fold">${BUDGET_HT_OPEN ? `&#9652; ${esc(t("g1_hide"))}` : `&#9662; ${esc(t("g1_show"))}`}</span></summary>
        ${doneHtml}${open.length ? `<div class="ht-gh"><b>${esc(t("ht_to_go"))}</b></div>${open.map(line).join("")}` : ""}${nextHtml}
        ${addable.length || addNext.length ? `<div class="bud-ht-add"><select data-htadd aria-label="${esc(t("ht_add"))}"><option value="">${esc(t("ht_add"))}</option>${addNext.length ? `<optgroup label="${esc(t("ht_add_next").replace("{g}", nextGen).replace("{date}", nextInfo && nextInfo.date ? heroGenNotOutShort(nextInfo) : ""))}">${addNext.map((h) => optH(h, true)).join("")}</optgroup>` : ""}${addable.length && addNext.length ? `<optgroup label="${esc(t("ht_add_out"))}">` : ""}${addable.map((h) => optH(h, false)).join("")}${addable.length && addNext.length ? "</optgroup>" : ""}</select></div>` : ""}
      </details>`;
    };
    const next = dates ? goals.findIndex((g, i) => dates[i] && !dates[i].done) : -1;
    const foldLine = next >= 0 ? t("goal_next").replace("{n}", nGoals).replace("{goal}", nameOf(goals[next])).replace("{date}", shortD(dates[next].day)) : t("goal_count").replace("{n}", nGoals);
    // (The part bought after the target has no date of its own to miss.)
    const cantMeet = !!dlPlan && dl.parts.some((x) => !x.ok && !x.late);
    const sumHtml = !plan || planPending ? ""
      : dlPlan ? `<div class="bud-g-sum${cantMeet ? " warn" : ""}">${esc(t("goal_with_dates").replace("{v}", money(total)).replace("{d}", (total - baseTotal >= 0.5 ? "+" : "") + money(total - baseTotal)).replace("{w}", money(baseTotal)))}${cantMeet ? `<br>${esc(t("goal_dates_cant"))}` : ""}</div>`
      : `<div class="bud-g-sum">${esc(t("goal_same_path").replace("{v}", money(total)).replace("{date}", fmtDate(plan.days || 0)))}</div>`;
    // A goal of a hero not out yet: what the plan does before the release.
    const relFirst = Math.min(...goals.filter((g) => g.up && g.up.notOut).map((g) => g.up.notOut.rel));
    const outInfoHtml = isFinite(relFirst) ? `<div class="gu-info"><i>i</i><span>${esc(t("gu_out_info").replace("{d}", goalDayShort(relFirst)))}</span></div>` : "";
    const goalsCard = `<div class="t12x-card bud-goals" style="margin-top:12px;">
      <button type="button" class="bud-g-head" data-goalsfold aria-expanded="${BUDGET_GOALS_OPEN}"><span class="t12x-title" style="margin:0;">${esc(t("goals_title"))}</span>${adminOnlyTagOn("goals") ? `<span class="bset-tag">&#128274; ${esc(t("spend_admin_tag"))}</span>` : ""}<span class="bud-g-arrow">${BUDGET_GOALS_OPEN ? "&#9662;" : "&#9656;"}</span></button>
      ${BUDGET_GOALS_OPEN ? `${outInfoHtml}${nGoals ? `${goals.filter((g) => !g.rest).length > 1 ? arrangeBarHtml("goals", "", "bud-g-arr") : ""}<ol class="bud-g-list"${arrangeHostAttr("goals")}>${goals.map(rowHtml).join("")}</ol>` : `<div class="meta gu-empty">${esc(t("gu_empty"))}</div>`}
      ${restHtml()}
      ${addHtml()}
      ${heroEdHtml()}`
      : `<div class="meta bud-g-fold">${esc(foldLine)}</div>`}
    </div>`;

    goalsCardHtml = goalsCard;
    // The explanations sit behind the (i) beside the sheet's title (C3).
    goalsInfoHtml = `<p>${esc(t("gu_desc"))}</p><p>${esc(t("gu_info_date"))}</p>${sumHtml}`;
    if (planPending || !plan || !dates) return goalsCard;
    // My Purchases tags its lines with the goal each pack is bought for.
    BUDGET_GOAL_MATCH = budgetGoalMatcher(goals, dates, pagesRaw, plan);
    // B3: the goals as flags on one line, grouped by the day they're reached,
    // the target day marked; tap a flag → the Order of goals sheet.
    {
      const stops = new Map();
      goals.forEach((g, i) => {
        const dt = dates[i];
        if (!dt || (g.rest && dt.done)) return; // (a page with nothing left after its goals is no flag)
        const day = dt.done ? -1 : Math.max(0, dt.day); // (-1 = nothing left to buy: "✓ Now"; 0 = with today's packs)
        if (!stops.has(day)) stops.set(day, { day, gs: [] });
        stops.get(day).gs.push(g);
      });
      if (targetDays != null && targetDays > 0) { if (!stops.has(targetDays)) stops.set(targetDays, { day: targetDays, gs: [] }); stops.get(targetDays).tg = true; }
      const list = [...stops.values()].sort((a, b) => a.day - b.day);
      const y0 = packStartOfToday().getUTCFullYear();
      const lbl = (d) => {
        if (d <= 0) return d < 0 ? t("goal_now") : t("pcl_today");
        const x = new Date(packStartOfToday().getTime() + d * 86400000), loc = LANG === "en" ? undefined : LANG;
        return x.getUTCFullYear() !== y0 ? `${x.toLocaleDateString(loc, { month: "short", timeZone: "UTC" })} \u2019${String(x.getUTCFullYear()).slice(2)}` : x.toLocaleDateString(loc, { day: "numeric", month: "short", timeZone: "UTC" });
      };
      const stopHtml = (st) => {
        const ics = st.gs.slice(0, 2).map((g) => { const ic = budgetGoalIcon(g, pagesRaw); return ic.src ? `<img class="${ic.face ? "" : "ct"}" src="${esc(ic.src)}" alt="" loading="lazy" />` : `<i>${esc(nameOf(g).charAt(0))}</i>`; }).join("") + (st.gs.length > 2 ? `<em>+${st.gs.length - 2}</em>` : "");
        const cls = st.day < 0 ? " ok" : !st.gs.length ? " tg" : targetDays != null && st.day > targetDays ? " later" : "";
        return `<button type="button" class="b3-stop${cls}${st.tg ? " has-tg" : ""}" data-b3sheet="goals" title="${esc(st.gs.map(nameOf).join(" \u00b7 ") || t("b3_target"))}"><span class="b3-ics">${st.gs.length ? ics : "<b>&#127919;</b>"}</span><small>${st.day < 0 ? "&#10003; " : st.tg && st.gs.length ? "&#127919; " : ""}${esc(lbl(st.day))}</small></button>`;
      };
      goalFlagsHtml = list.length ? `<div class="b3-rail">${railHead}<div class="b3-stops">${list.map(stopHtml).join("")}</div></div>` : "";
    }
    return goalsCard;
  })();

  // Design B3: one screen — the total card, the
  // goals as flags (admin), the pages as tiles, then Settings and This week.
  // The details (materials, stat gain, goal order, settings, a page's packs)
  // open in a sheet over the page (BUDGET_SHEET, kept across redraws).
  if (BUDGET_FOCUS_SPEND === true && spendFeatureOn()) { BUDGET_SHEET = "settings"; BUDGET_SET_OPEN = "spend"; }
  const ticked = pagesRaw.filter((pg) => included(pg.calcKey));
  // The phone Menu's Budgets tile shows this total (mmBudgetSet; nothing worked out for it).
  if (!planPending) mmBudgetSet(anyPlan ? packFmtLocal(Math.ceil(grandTotal), grandCurrency, true) : null);
  const lateAll = targetDays != null && grandDays > targetDays;
  const shortDay = (d) => { const x = new Date(packStartOfToday().getTime() + d * 86400000); return x.toLocaleDateString(LANG === "en" ? undefined : LANG, x.getUTCFullYear() !== new Date().getUTCFullYear() ? { month: "short", year: "numeric", timeZone: "UTC" } : { day: "numeric", month: "short", timeZone: "UTC" }); };
  // The plan's parts as compact lines (bar, title, price, "N packs ▸"); which
  // pages are in each part shows on the tiles (and in the line's tooltip).
  const b3Line = (color, title, names, pl, shown) => {
    const money = packFmtLocal(shown != null ? shown : Math.ceil(packPlanLocal(pl)), pl.rows[0]?.currency, true, pl.rows[0]?.price);
    const trades = (pl.trades || []).length ? `<div class="meta" style="font-size:10px; margin-top:4px; color:var(--ice);">${esc(t("trade_then"))}: ${pl.trades.map((x) => `${qty(x.giveQty)} ${esc(materialDisplayName(x.from))} → ${qty(x.getQty)} ${esc(materialDisplayName(x.to))}${x.lab ? ` (${esc(t("rfc_title"))}, ${x.lots} ${esc(t("rfc_weeks"))})` : ""}`).join(" &middot; ")}</div>` : "";
    return `<details class="bud-line b3-sl"><summary title="${esc(names)}"><span class="bud-line-bar" style="background:${color};"></span><span class="bud-line-t">${title}</span><span class="bud-line-v"><b>${money}</b><span class="meta">${esc(t("bud_line_packs").replace("{n}", pl.rows.length))} <span class="bud-line-arrow">&#9656;</span></span></span></summary><div class="bud-line-body">${packRowsHtml(pl)}${trades}</div></details>`;
  };
  const plainNames = (keys) => keys.map((k) => packPageLabel(k)).join(" · ");
  let b3Lines = "", b3Split = "", b3After = ""; // b3Lines = the plan's lines (fold with Hide / Show), b3Split = the coloured bar, b3After = notes under the lines (always shown)
  // A short date for the lines and tiles: "Nov 30", with the year when it isn't this one ("Mar 27 ’27").
  const dShort = (d) => { const x = new Date(packStartOfToday().getTime() + d * 86400000), s0 = x.toLocaleDateString(LANG === "en" ? undefined : LANG, { day: "numeric", month: "short", timeZone: "UTC" }); return x.getUTCFullYear() !== packStartOfToday().getUTCFullYear() ? `${s0} \u2019${String(x.getUTCFullYear()).slice(2)}` : s0; };
  // The plain plan beside the dated one: "Everything by Dec 5 instead: QAR 40,246 · QAR 4,470 more".
  const datedVsHtml = () => {
    const v = viewDataPlain("main"), diff = v.total - packPlanLocal(dlPlan);
    const money = (x) => packFmtLocal(Math.ceil(x), dlPlan.rows[0]?.currency, true, dlPlan.rows[0]?.price);
    return `<div class="meta b3-vs">${esc(targetDays != null ? t("bud_dates_vs").replace("{date}", dShort(targetDays)) : t("bud_dates_vs_none"))} <b>${money(v.total)}</b> \u00b7 ${esc(t(diff > 0.5 ? "bud_dates_more" : diff < -0.5 ? "bud_dates_less" : "bud_dates_same").replace("{d}", money(Math.abs(diff))))}</div>`;
  };
  // (the goals' dated plan is still being worked out: the plain plan shows until it is in)
  const datedWaitHtml = BUDGET_VIEW === "main" && !planPending && datedSetup && !dl ? `<div class="meta b3-vs"><span class="bud-pending small">${esc(t("bud_dates_wait"))}</span></div>` : "";
  if (BUDGET_VIEW === "budget") { if (spendBest && spendBest.ok) b3Lines = spendHtml(); else b3After = spendHtml(); }
  else if (datedLead) {
    // Goals / pages with their own dates: one line per date (its packs inside),
    // the pages that can't make the target last; the bar is cut the same way.
    const S = datedSetup, EV = "#a78bfa";
    const info = dl.parts.filter((p) => (p.rows || []).length).map((p) => {
      const gs = S.goals.filter((g, i) => (p.late ? datedDay(g, i) == null : datedDay(g, i) === p.day));
      const kinds = [...new Set(gs.map((g) => { const b = (BUDGET_GOALS.by || {})[g.id]; return b && b !== "main" ? goalByKind(b) : ""; }))];
      const ev = !p.late && kinds.length === 1 && kinds[0] && kinds[0] !== "date" ? goalByShort((BUDGET_GOALS.by || {})[gs[0].id]) : "";
      const color = p.late ? "var(--danger)" : ev ? EV : p.day === targetDays && kinds.every((k) => !k) ? "var(--good)" : "var(--ice)";
      // ("· N days" only where it fits beside the name: a long event name goes without it)
      // (a part that only gets part of the way by its day: how much, the rest is in a later line)
      const pctOf = (x) => { const ks = Object.keys(x.need || {}); return ks.length ? Math.floor(100 * ks.reduce((a, n) => a + Math.min(1, (x.got[n] || 0) / x.need[n]), 0) / ks.length) : 0; };
      const meta = p.late ? "" : p.ok ? (p.day > 0 && ev.length <= 10 ? ` <span class="meta">\u00b7 ${p.day} ${esc(t("pack_days_short_long"))}</span>` : "") : p.partial ? ` <span class="meta" style="color:var(--amber);">\u00b7 ${esc(t("bud_dates_part").replace("{p}", pctOf(p)))}</span>` : ` <span class="meta" style="color:var(--amber);">\u00b7 ${esc(t("bud_dates_cant").replace("{date}", dShort(p.earliest != null ? p.earliest : p.done || 0)))}</span>`;
      const title = p.late ? `<b>${esc(t("bud_line_after"))}</b>` : `<b>${esc(t("bud_line_by").replace("{date}", (ev ? ev + " \u00b7 " : "") + dShort(p.day)))}</b>${meta}`;
      const names = gs.map((g) => budgetGoalName(g)), shown = names.slice(0, 6).join(" \u00b7 ") + (names.length > 6 ? " \u2026" : "");
      return { p, color, title, names: shown, v: packPlanLocal({ rows: p.rows }) };
    });
    const tot = info.reduce((a, x) => a + x.v, 0);
    // (whole amounts that add up to the total above: the spare units go to the largest fractions)
    const whole = info.map((x) => Math.floor(x.v));
    let spare = Math.ceil(tot - 1e-6) - whole.reduce((a, v) => a + v, 0);
    info.map((x, i) => [x.v - Math.floor(x.v), i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (spare > 0) { whole[i]++; spare--; } });
    b3Split = info.length > 1 ? `<div class="b3-split">${info.map((x, i) => `<i style="${i === info.length - 1 ? "flex:1" : `width:${Math.max(3, tot > 0 ? (x.v / tot) * 100 : 0).toFixed(1)}%`}; background:${x.color};"></i>`).join("")}</div>` : "";
    b3Lines = info.map((x, i) => b3Line(x.color, x.title, x.names, { rows: x.p.rows, trades: x.p.trades || [] }, whole[i])).join("");
    b3After = datedVsHtml();
  } else if (split && BUDGET_VIEW === "main") {
    const tp = split.target.plan, lp = splitLate.plan, tv = packPlanLocal(tp), tot = tv + packPlanLocal(lp);
    const gw = tot > 0 ? Math.max(4, Math.min(96, (tv / tot) * 100)) : 50;
    b3Split = `<div class="b3-split"><i style="width:${gw.toFixed(1)}%; background:var(--good);"></i><i style="flex:1; background:var(--danger);"></i></div>`;
    b3Lines = b3Line("var(--good)", `<b>${esc(t("bud_line_by").replace("{date}", fmtDate(targetDays)))}</b>${tp.days ? ` <span class="meta">· ${tp.days} ${esc(t("pack_days_short_long"))}</span>` : ""}`, plainNames(split.target.keys), tp)
      + b3Line("var(--danger)", `<b>${esc(t("bud_line_after"))}</b>`, `${plainNames(split.late.keys)} · ${t("bud_line_by").replace("{date}", fmtDate(lp.days))}`, lp);
    b3After = droppedHtml + datedWaitHtml;
  } else if (planPending && BUDGET_VIEW === "main" && combinedRaw.split && combinedRaw.split.target && combinedRaw.split.target.plan) {
    // Only the by-target part of the split is in: its line now; the pages after the target are still being worked out.
    const tg = combinedRaw.split.target, tp = tg.plan;
    b3Lines = b3Line("var(--good)", `<b>${esc(t("bud_line_by").replace("{date}", fmtDate(targetDays)))}</b>${tp.days ? ` <span class="meta">· ${tp.days} ${esc(t("pack_days_short_long"))}</span>` : ""}`, plainNames(tg.keys || []), tp)
      + `<details class="bud-line b3-sl"><summary style="cursor:default;" title="${esc(t("budgets_working"))}"><span class="bud-line-bar" style="background:var(--danger);"></span><span class="bud-line-t"><b>${esc(t("bud_line_after"))}</b></span><span class="bud-line-v"><span class="bud-pending small">&hellip;</span></span></summary></details>`;
  } else if (combined.inc.length) {
    if (combined.chosen) b3Lines = b3Line(lateAll ? "var(--danger)" : "var(--good)", `<b>${esc(t("bud_line_all"))}</b>`, plainNames(combined.inc), combined.chosen);
    else b3After = `<div class="meta" style="font-size:11px; margin-top:8px; color:var(--danger);">${esc(t("pack_cant_cover"))}</div>`;
    b3After += droppedHtml + datedWaitHtml;
  }
  // Hide / Show for the plan's lines, the same choice in every view (owner, 26 Nov 2026; was the
  // dated list's only, 11 Nov): the site's usual button at the end of the coloured bar, or at the right
  // of a slim row in its place when the view has no bar. Hidden, the total, the plan switch, the
  // "My Purchases follows" line, the bar and the notes under the list stay; only the lines fold.
  // Remembered with the other Hide choices (calc_state "bar_hidden", key "bud:dates": its old name,
  // kept so an earlier choice still counts).
  const linesHid = !!b3Lines && BAR_SHOW_ALL["bud:dates"] === false;
  if (b3Lines) {
    const btn = `<button type="button" class="g1-fold" data-g1fold="bud:dates" aria-expanded="${!linesHid}">${esc(t(linesHid ? "g1_show" : "g1_hide"))} ${linesHid ? "&#9662;" : "&#9652;"}</button>`;
    b3Split = `<div class="b3-splitrow${b3Split ? "" : " b3-foldrow"}">${b3Split}${btn}</div>`;
    b3Lines = `<div class="b3-lns">${b3Lines}</div>`;
  }
  const matsN = Object.keys(grandMats).length;
  const partialHtml = (() => { const noPlan = ticked.filter((pg) => pg.missing).length; return noPlan && !planPending ? `<div class="meta bud-partial">${esc(t("budgets_total_partial").replace("{n}", ticked.length - noPlan).replace("{m}", ticked.length))}</div>` : ""; })();
  const comingHtml = (() => { const n = (PACK_PURCHASES.list || []).filter(purPlannedCounts).length; return n ? `<button type="button" class="b3-a b3-coming" data-gototab="purchases">&#128722; ${esc(t("pur_budget_line").replace("{n}", n))}</button>` : ""; })();
  const totalHtml = `<div class="b3-tile b3-hd${linesHid ? " g1-folded" : ""}">
      <div class="b3-hd-l"><span>${esc(t("b3_total_ticked").replace("{n}", ticked.length))}</span>${matsN ? `<button type="button" class="b3-a" data-b3sheet="mats">${esc(t("b3_materials").replace("{n}", matsN))} &#8250;</button>` : ""}${grandDeltas.length ? `<button type="button" class="b3-a" data-b3sheet="stats">${esc(t("b3_stat_gain"))} &#8250;</button>` : ""}</div>
      <div class="b3-hd-t"><b>${planPending ? workHtml("span") : anyPlan ? packFmtLocal(Math.ceil(grandTotal), grandCurrency, true) : "—"}</b>${anyPlan && !planPending ? `<div><span class="${lateAll ? "rd" : "ok"}">${grandDays === 0 ? esc(t("pack_ready_now")) : `${esc(t("bud_done_by"))} ${esc(fmtDate(grandDays))}`}</span>${grandDays ? `<small>${grandDays} ${esc(t("pack_days_short_long"))}</small>` : ""}</div>` : ""}</div>
      ${partialHtml}${comingHtml}
      ${viewCardsHtml}
      ${b3Split}${b3Lines}${b3After}
    </div>`;
  // Each page as a tile: picture, name, tick, its price, when it's done (by
  // the target / after it) and a ring = how much of what it needs you
  // already have (Backpack + trades). Tap → its details in a sheet.
  const pageIcon = (x) => (x.pg.sh && x.pg.sh.img) || budgetPagePic(BUDGET_PAGES[x.i].key) || goalPageIcon(x.pg);
  const datedSegs = datedLead ? budgetGoalSegs(datedSetup.goals, pagesRaw) : null; // (what each goal still needs: a page with nothing left has no date)
  const timing = (x) => {
    const k = x.pg.calcKey;
    if (!x.inc) return ["mu", ""];
    if (planPending) return ["mu", "…"];
    // With the goals' dates: the day this page is planned for (its last date), "after target"
    // for a page that can't make the target, the day it is done when it can't make its own date.
    if (datedLead) {
      const mine = datedSetup.goals.map((g, i) => ({ g, d: datedDay(g, i) })).filter((y) => y.g.page === k && Object.keys(datedSegs.get(y.g.id) || {}).length);
      if (mine.length) {
        if (mine.some((y) => y.d == null)) return ["rd", t("b3_after")];
        // (the page's last day: a part that can't make its date counts with the day it is done)
        const days = mine.map((y) => { const p = dl.parts.find((q) => !q.late && q.day === y.d); return p && !p.ok ? { d: p.partial ? y.d : p.earliest != null ? p.earliest : p.done || y.d, bad: true } : { d: y.d, bad: false }; });
        const last = Math.max(...days.map((z) => z.d));
        return days.some((z) => z.bad) ? ["rd", "\u26A0 " + dShort(last)] : ["ok", t("b3_by").replace("{date}", dShort(last))];
      }
    }
    if (split && BUDGET_VIEW === "main") {
      if (split.target.keys.includes(k)) return ["ok", t("b3_by").replace("{date}", shortDay(targetDays))];
      if (split.late.keys.includes(k)) return ["rd", t("b3_after")];
    }
    const pl = combined.dropped.includes(k) ? x.pg.chosen : combined.inc.includes(k) ? combined.chosen : null;
    if (!pl) return ["mu", ""];
    if (targetDays != null) return pl.days <= targetDays ? ["ok", t("b3_by").replace("{date}", shortDay(targetDays))] : ["rd", t("b3_after")];
    return ["mu", pl.days === 0 ? t("pack_ready_now") : t("b3_done_on").replace("{date}", shortDay(pl.days))];
  };
  const covered = (pg) => {
    const ks = Object.keys(pg.needFull || {}).filter((n) => pg.needFull[n] > 0);
    if (!ks.length) return 100;
    return Math.round((ks.reduce((a, n) => a + Math.max(0, Math.min(1, 1 - (pg.needStill[n] || 0) / pg.needFull[n])), 0) / ks.length) * 100);
  };
  const ringHtml = (p, ok, green) => {
    const sz = 34, r = sz / 2 - 3, c = 2 * Math.PI * r, h = sz / 2;
    return `<span class="b3-ring${green ? " ok" : ""}" title="${esc(ok ? t("budgets_nothing_planned") : t("b3_ring_tip").replace("{p}", p))}"><svg width="${sz}" height="${sz}" viewBox="0 0 ${sz} ${sz}" aria-hidden="true"><circle cx="${h}" cy="${h}" r="${r}" fill="none" style="stroke:rgba(255,255,255,.1)" stroke-width="3.5"/><circle cx="${h}" cy="${h}" r="${r}" fill="none" style="stroke:${ok || green ? "var(--good)" : "var(--ice)"}" stroke-width="3.5" stroke-linecap="round" stroke-dasharray="${((c * (ok ? 100 : p)) / 100).toFixed(2)} ${c.toFixed(2)}" transform="rotate(-90 ${h} ${h})"/></svg><b>${ok ? "&#10003;" : p}</b></span>`;
  };
  // "✓ Backpack covers it" ("✓ Covered" on narrow phones): ticked, nothing left to buy.
  const b3CovHtml = `<span class="b3-cov" title="${esc(t("b3_covered"))}">&#10003; <span class="l">${esc(t("b3_covered"))}</span><span class="s">${esc(t("b3_covered_s"))}</span></span>`;
  const isNothing = (x) => !x.pg.missing && !Object.keys(x.pg.needFull || {}).some((n) => x.pg.needFull[n] > 0);
  const tileHtml = (x) => {
    const k = x.pg.calcKey, ic = pageIcon(x), nothing = isNothing(x);
    const [cls, sub] = nothing ? ["mu", k === "hero_gear" ? BUDGET_HG_SETS.map(gearSetDisplayName).join(" · ") : ""] : timing(x);
    return `<div class="b3-tile b3-pt${x.inc ? "" : " off"}" data-b3page="${esc(k)}" role="button" tabindex="0" aria-label="${esc(x.label)}">
      <div class="b3-pt-h">${dsHandleHtml("data-b3drag")}${ic ? `<img src="${esc(ic)}" alt="" loading="lazy" />` : ""}<b${B3_TILE_SHORT[k] ? ` title="${esc(x.label)}"` : ""}>${esc(B3_TILE_SHORT[k] ? t(B3_TILE_SHORT[k]) : x.label)}</b><label class="b3-tk" title="${esc(t("b3_tick"))}"><input type="checkbox" data-budgetinc="${esc(k)}" ${x.inc ? "checked" : ""} aria-label="${esc(t("b3_tick"))}" /></label></div>
      ${nothing ? `<div class="b3-pt-p nothing">&#10003; ${esc(t("b3_nothing"))}</div>` : x.bpCovers ? `<div class="b3-pt-p">&nbsp;</div>` : `<div class="b3-pt-p">${x.right}</div>`}
      ${x.bpCovers ? `<div class="b3-pt-m cov">${b3CovHtml}</div>` : `<div class="b3-pt-m ${cls}">${sub ? esc(sub) : "&nbsp;"}</div>`}${nothing ? ringHtml(100, true) : x.bpCovers ? ringHtml(100, false, true) : x.inc ? ringHtml(covered(x.pg), false) : ""}</div>`;
  };
  // Pages the person hasn't set up (no own levels / picks, `budgetPageSetUp`) join the pages
  // with no saved plan in one line; with none set up the "Start here" card shows instead.
  const setUp = (x) => budgetPageSetUp(x.pg.calcKey);
  const startMode = !B3_PAGES.some(setUp);
  const missing = B3_PAGES.filter((x) => x.pg.missing || !setUp(x));
  const missLabel = t(missing.every((x) => x.pg.missing) ? "b3_missing" : "b3_not_setup").replace("{n}", missing.length);
  const tilesHtml = `<div class="b3-pgw"${arrangeHostAttr(B3_ARR_KEY)}><div class="b3-pgh"><span class="b3-lbl">${esc(t("b3_pages"))}</span>${arrangeBtnHtml(B3_ARR_KEY)}</div><div class="arr-hint b3-pghint">${esc(t("b3_arrange_hint"))}</div><div class="b3-pg">${b3PageOrdered(B3_PAGES.filter((x) => !x.pg.missing && setUp(x))).map(tileHtml).join("")}</div></div>`;
  const missHtml = missing.length ? `<button type="button" class="b3-tile b3-np" data-b3sheet="missing"><span>${esc(missLabel)}</span><span class="b3-ics">${missing.slice(0, 6).map((x) => { const ic = pageIcon(x); return ic ? `<img src="${esc(ic)}" alt="" loading="lazy" />` : ""; }).join("")}</span><span class="b3-go">&#8250;</span></button>` : "";
  // This week (Monday – Sunday): the shown plan's packs; opens My Purchases.
  // The same numbers as My Purchases' answer card (budgetWeekSums of the followed plan).
  const wkData = planPending ? null : budgetWeekSums(budgetSuggestOf(combinedRaw, dlPlan ? { res: dl, setup: datedSetup } : null, BUDGET_VIEW));
  const wkTab = "purchases";
  const wkMoney = (v) => { const r0 = combined.chosen && combined.chosen.rows[0]; return packFmtLocal(v, (r0 && r0.currency) || grandCurrency, false, r0 ? r0.price : undefined); };
  // Settings sits beside ↻ at the top; This week has the bottom row.
  // Title-row button: "⚙ <target date> · <currency>", opens the Settings sheet.
  // No target yet: amber "⚙ Set a target · USD"; it opens Settings on the target fold.
  const setBtnHtml = `<button type="button" class="b3-setb hd-btn${targetDays == null ? " need" : ""}" data-b3sheet="settings"${targetDays == null ? " data-b3settarget" : ""} title="${esc(t("t12x_settings"))}" aria-label="${esc(t("t12x_settings"))}">&#9881; ${esc(targetDays != null ? shortDay(targetDays) : t("b3_set_a_target"))} · ${esc(DISPLAY_CURRENCY || "USD")}</button>`;
  const lrHtml = `<div class="b3-lr">
      <button type="button" class="b3-tile wk" data-gototab="${wkTab}"><img src="${esc(QUICK_ICONS[wkTab])}" alt="" /><span class="b3-lr-t"><b>${esc(t("b3_week_todo").replace("{v}", wkData ? wkMoney(wkData.todo) : "…"))}</b><small>${esc(t("b3_week_sub").replace("{n}", wkData ? wkData.todoN : "…").replace("{v}", wkData ? wkMoney(wkData.bought) : "…"))} · ${esc(navLabel(wkTab))}</small></span><span class="b3-go">&#8250;</span></button>
    </div>`;
  // "Start here" (owner picked V1, 26 Nov 2026): while no page is set up, one card with three
  // steps replaces the total, Free now, goal flags, This week and the page tiles.
  const startHtml = (() => {
    if (!startMode) return "";
    const chipPages = B3_PAGES.filter((x) => x.pg.calcKey !== "shining_skins");
    const nSet = chipPages.filter(setUp).length;
    const goalsOn = visitorCan("goals");
    const nGoals = goalsOn && BUDGET_GOALS ? (BUDGET_GOALS.goals || []).length : 0;
    const step = (n, done, title, sub, body) => `<div class="b3-st-s${done ? " done" : ""}"><span class="b3-st-n">${done ? "&#10003;" : n}</span><div class="b3-st-b"><b>${title}</b><small>${esc(sub)}</small>${body || ""}</div></div>`;
    const chip = (x) => { const ic = pageIcon(x), k = x.pg.calcKey; return `<button type="button" class="b3-st-c" data-gototab="${esc(BUDGET_PAGES[x.i].tab)}">${ic ? `<img src="${esc(ic)}" alt="" loading="lazy" />` : ""}<b>${esc(B3_TILE_SHORT[k] ? t(B3_TILE_SHORT[k]) : x.label)}</b>${setUp(x) ? "" : `<em>${esc(t("b3_not_setup_s"))}</em>`}</button>`; };
    const sh = B3_PAGES.find((x) => x.pg.calcKey === "shining_skins");
    const shPic = sh ? pageIcon(sh) : "";
    return `<div class="b3-start">
      <div class="b3-tile b3-st">
        <div class="b3-st-h"><b>${esc(t("b3_st_title"))}</b><small>${esc(t("b3_st_sub"))}</small></div>
        ${step(1, targetDays != null, esc(t("b3_st1")), targetDays != null ? t("b3_st1_done").replace("{d}", shortDay(targetDays)) : t("b3_st1_sub"), `<button type="button" class="btn small b3-st-go" data-b3sheet="settings" data-b3settarget>&#9881; ${esc(t("b3_st1_btn"))}</button>`)}
        ${step(2, nSet > 0, esc(t("b3_st2")), t("b3_st2_sub").replace("{n}", nSet).replace("{m}", chipPages.length), `<div class="b3-st-cs">${(B3_START_MORE ? chipPages : chipPages.slice(0, 6)).map(chip).join("")}${!B3_START_MORE && chipPages.length > 6 ? `<button type="button" class="b3-st-c more" data-b3startmore>+ ${esc(t("b3_st_more").replace("{n}", chipPages.length - 6))} &#8250;</button>` : ""}</div>`)}
        ${goalsOn ? step(3, nGoals > 0, `${esc(t("b3_st3"))} <span class="b3-st-o">· ${esc(t("b3_st3_opt"))}</span>`, t("b3_st3_sub"), `<button type="button" class="btn small ghost b3-st-go" data-b3startgoal>${esc(t("gu_add"))}</button>`) : ""}
      </div>
      ${sh ? `<button type="button" class="b3-tile b3-st-l" data-gototab="${esc(BUDGET_PAGES[sh.i].tab)}">${shPic ? `<img src="${esc(shPic)}" alt="" loading="lazy" />` : ""}<span class="b3-st-t"><b>${esc(sh.label)}</b> · ${esc(t("b3_st_sh_none"))}</span><span class="b3-st-a">${esc(t("b3_st_sh_pick"))} &#8250;</span></button>` : ""}
      <button type="button" class="b3-tile b3-st-l" data-gototab="backpack"><span class="b3-st-em" aria-hidden="true">&#127890;</span><span class="b3-st-t"><b>${esc(t("b3_st_bp"))}</b> · ${esc(t("b3_st_bp_sub"))}</span><span class="b3-go">&#8250;</span></button>
      <div class="meta b3-st-f">${esc(t("b3_st_foot"))}</div>
    </div>`;
  })();
  // The sheet's content.
  const settingsHtml = budgetSettingsHtml(targetDays);
  const missRow = (x) => { const ic = pageIcon(x); return `<div class="b3-mrow"><label><input type="checkbox" data-budgetinc="${esc(x.pg.calcKey)}" ${x.inc ? "checked" : ""} aria-label="${esc(t("b3_tick"))}" />${ic ? `<img src="${esc(ic)}" alt="" loading="lazy" />` : ""}<span><b>${esc(x.label)}</b>${x.pg.missing ? x.right : `<span class="meta" style="font-size:11px;">${esc(t("b3_not_setup_s"))}</span>`}</span></label><button type="button" class="btn small ghost" data-gototab="${esc(BUDGET_PAGES[x.i].tab)}">${esc(t("budgets_open_page"))}</button></div>`; };
  const pageSheet = (x) => `<div class="b3-ps-top"><label class="b3-ps-inc"><input type="checkbox" data-budgetinc="${esc(x.pg.calcKey)}" ${x.inc ? "checked" : ""} /> ${esc(t("b3_tick"))}</label><span class="b3-ps-v">${isNothing(x) ? `<span style="color:var(--good); font-size:12px;">&#10003; ${esc(t("budgets_nothing_planned"))}</span>` : x.bpCovers ? b3CovHtml : x.right || ""}</span><button type="button" class="btn small" data-gototab="${esc(BUDGET_PAGES[x.i].tab)}">${esc(t("budgets_open_page"))} &#8250;</button></div>
      ${x.pg.calcKey === "hero_gear" ? hgSetsHtml() : ""}
      ${x.pg.sh ? shiningSkinsSheetHtml(x.pg.sh) : ""}
      ${x.body || ""}`;
  const sheet = (() => {
    const sh = BUDGET_SHEET;
    if (!sh) return null;
    if (sh === "mats" && matsN) return { title: t("budgets_materials_total"), html: `<div class="bud-mats">${Object.keys(grandMats).map(grandMatChip).join("")}</div>` };
    if (sh === "stats" && grandDeltas.length) return { title: t("budgets_stat_increase_total"), html: statTableHtml(grandDeltas, "all") + (dashStats ? "" : `<div class="meta" style="font-size:10px; margin-top:6px; color:var(--danger);">${esc(t("budgets_stats_unavailable"))}</div>`) };
    if (sh === "goals" && visitorCan("goals") && goalsCardHtml) return { title: t("goals_title"), info: goalsInfoHtml, html: goalsCardHtml };
    if (sh === "settings") return { title: t("t12x_settings"), html: settingsHtml };
    if (sh === "cando" && visitorCan("cando")) return { title: t("cdb_sheet_title"), html: `<div data-cdasheet>${cdaSheetInner()}</div>` };
    if (sh === "missing" && missing.length && !startMode) return { title: missLabel, html: missing.map(missRow).join("") };
    if (sh.startsWith("page:")) { const x = B3_PAGES.find((y) => "page:" + y.pg.calcKey === sh); if (x) return { title: x.pg.calcKey === "shining_skins" ? t("sh_title") : (x.glabel ? `${x.glabel} · ` : "") + x.label, html: pageSheet(x) }; }
    return null;
  })();
  if (BUDGET_SHEET && !sheet) BUDGET_SHEET = null;
  const sheetHtml = sheet ? `<div class="modal-overlay adm-sheet-wrap b3-sheet-wrap" data-b3bg><div class="modal-box adm-sheet b3-sheet" role="dialog" aria-modal="true" aria-label="${esc(sheet.title)}"><div class="gs-head"><b style="flex:1; font-size:16px;">${sheet.info ? `<span class="has-info">${esc(sheet.title)}<button type="button" class="cg-i" data-info aria-expanded="false" aria-label="${esc(t("info_more"))}">${INFO_SVG}</button><span class="cg-tip" role="tooltip" data-infotip hidden>${sheet.info}</span></span>` : esc(sheet.title)}</b>${closeXHtml("data-b3close")}</div>${sheet.html}</div></div>` : "";
  if (planPending) holdPageHeight(true);
  keepFolds(content, () => { content.innerHTML = `
    <div class="budget-wrap b3">
      <div class="plx-head b3-head"><h2>${esc(t("budgets_title"))}</h2>${setBtnHtml}<button type="button" class="b3-sq hd-btn" data-budgetrecalc title="${esc(t("budgets_recalc_hint"))}" aria-label="${esc(t("budgets_recalc"))}">&#8635;</button></div>
      <p class="desc">${esc(t("budgets_desc"))}</p>
      <div class="b3-cols">
        ${startMode ? startHtml : `<div class="b3-left">${totalHtml}${cdaTileHtml()}${goalFlagsHtml}${lrHtml}</div>
        <div class="b3-right">${tilesHtml}${missHtml}</div>`}
      </div>
      ${sheetHtml}
    </div>`; });
  if (!planPending) holdPageHeight(false);
  // My Purchases' "Following: … change ›": the plan switch, scrolled to once.
  if (BUDGET_FOCUS_VIEW === true) {
    const sg = content.querySelector(".bud-seg");
    if (sg) { sg.scrollIntoView({ block: "center" }); BUDGET_FOCUS_VIEW = "scrolled"; }
  }
  if (BUDGET_FOCUS_SPEND) {
    const sb = content.querySelector(".bud-spend");
    if (sb) {
      // Scroll once; flash again when the packs plan redraws the page.
      if (BUDGET_FOCUS_SPEND === true) sb.scrollIntoView({ block: "center" });
      BUDGET_FOCUS_SPEND = planPending ? "scrolled" : false;
      sb.classList.add("flash");
      setTimeout(() => sb.classList.remove("flash"), 1700);
    }
  }

  // A page sheet's trades: Free | From packs switch in place (kept for the visit).
  content.querySelectorAll("[data-budtrtab]").forEach((b) => b.addEventListener("click", () => {
    if (b.disabled) return;
    BUDGET_TR_TAB = b.dataset.budtrtab;
    const box = b.closest(".bud-tr");
    box.querySelectorAll("[data-budtrtab]").forEach((x) => { const on = x === b; x.classList.toggle("on", on); x.setAttribute("aria-selected", String(on)); });
    box.querySelectorAll("[data-budtrpane]").forEach((x) => { x.hidden = x.dataset.budtrpane !== BUDGET_TR_TAB; });
  }));
  content.querySelectorAll("[data-budgetview]").forEach((b) => b.addEventListener("click", () => {
    BUDGET_VIEW = b.dataset.budgetview;
    BUDGET_FOCUS_VIEW = false;
    budgetFollowSet(BUDGET_VIEW);
    const y = window.scrollY;
    { const sq = RENDER_SEQ; renderBudgetsPage().then(() => window.scrollTo(0, y)).catch((e) => pageRedrawFailed(e, sq)); }
  }));
  // Heroes Gears sets in Budgets: saved on the account, then the plan is worked out again.
  content.querySelectorAll("[data-budhgset]").forEach((cb) => cb.addEventListener("change", () => {
    const on = new Set(BUDGET_HG_SETS);
    if (cb.checked) on.add(cb.dataset.budhgset); else on.delete(cb.dataset.budhgset);
    BUDGET_HG_SETS = HERO_GEAR_SET_NAMES.filter((n) => on.has(n));
    saveCalcState("budget_hg_sets", { sets: BUDGET_HG_SETS });
    CDA_BUILD_P = null; // Free now follows the ticked sets
    budgetInvalidate();
    keepPlace(() => renderBudgetsPage());
  }));
  content.querySelectorAll("[data-budgetinc]").forEach((cb) => cb.addEventListener("change", async () => {
    // Each page has its own tick.
    BUDGET_SELECTED[cb.dataset.budgetinc] = cb.checked;
    keepPlace(() => renderBudgetsPage()); // instant redraw from the cached data
    saveCalcState("budget_selected", BUDGET_SELECTED);
  }));
  const curEl = content.querySelector("#budgetsCurrency");
  if (curEl) curEl.addEventListener("change", () => { setDisplayCurrency(curEl.value); keepPlace(() => renderBudgetsPage()); });
  // My budget: saved at once; a new amount only re-checks the plans already worked out.
  const spendSave = (patch, show) => {
    BUDGET_SPEND = { ...(BUDGET_SPEND || {}), ...patch };
    saveCalcState("budget_spend", BUDGET_SPEND);
    PUR_SUGGEST = null;
    if (show && spendActive()) { BUDGET_VIEW = "budget"; budgetFollowSet("budget"); }
    const y = window.scrollY;
    { const sq = RENDER_SEQ; renderBudgetsPage().then(() => window.scrollTo(0, y)).catch((e) => pageRedrawFailed(e, sq)); }
  };
  const amtEl = content.querySelector("[data-spendamt]");
  if (amtEl) amtEl.addEventListener("change", () => { const v = Math.max(0, Number(amtEl.value) || 0); spendSave({ amount: v, cur: DISPLAY_CURRENCY || "USD" }, v > 0); });
  content.querySelectorAll("[data-spendper]").forEach((b) => b.addEventListener("click", () => spendSave({ per: b.dataset.spendper }, true)));
  const carryEl = content.querySelector("[data-spendcarry]");
  if (carryEl) carryEl.addEventListener("change", () => spendSave({ carry: carryEl.checked }, true));
  const dateEl = content.querySelector("[data-budgettarget]");
  if (dateEl) dateEl.addEventListener("change", async () => {
    BUDGET_TARGET = dateEl.value || "";
    saveCalcState("pack_target_budgets", { date: BUDGET_TARGET });
    keepPlace(() => renderBudgetsPage());
  });
  content.querySelectorAll("[data-budgetrecalc]").forEach((el) => el.addEventListener("click", () => { const sq = RENDER_SEQ; budgetForceRecalc(); renderBudgetsPage().catch((e) => pageRedrawFailed(e, sq)); }));
  const clearEl = content.querySelector("[data-budgettargetclear]");
  if (clearEl) clearEl.addEventListener("click", async () => {
    BUDGET_TARGET = "";
    saveCalcState("pack_target_budgets", { date: "" });
    keepPlace(() => renderBudgetsPage());
  });
  content.querySelectorAll("[data-gototab]").forEach((b) => b.addEventListener("click", () => {
    const btn = document.querySelector(`.topnav-groups [data-tab="${b.dataset.gototab}"]`);
    if (btn) btn.click();
  }));
  wireBudgetSettings(content, () => keepPlace(() => renderBudgetsPage()));
  const goalsBox = content.querySelector(".bud-goals");
  if (goalsBox) wireBudgetGoals(goalsBox);
  // B3: sheets, page tiles, goal flags.
  const b3Redraw = () => keepPlace(() => renderBudgetsPage());
  content.querySelectorAll("[data-b3sheet]").forEach((b) => b.addEventListener("click", () => { BUDGET_SHEET = b.dataset.b3sheet; if (b.hasAttribute("data-b3settarget")) BUDGET_SET_OPEN = "target"; b3Redraw(); }));
  // "Start here" step 3: the Order of goals sheet with its add-goal form open.
  content.querySelectorAll("[data-b3startmore]").forEach((b) => b.addEventListener("click", () => { B3_START_MORE = true; b3Redraw(); }));
  content.querySelectorAll("[data-b3startgoal]").forEach((b) => b.addEventListener("click", () => { BUDGET_SHEET = "goals"; BUDGET_GOAL_ADD = {}; b3Redraw(); }));
  const b3bg = content.querySelector("[data-b3bg]");
  if (b3bg) b3bg.addEventListener("click", (e) => { if (e.target === b3bg || e.target.closest("[data-b3close]")) { BUDGET_SHEET = null; b3bg.remove(); } });
  content.querySelectorAll("[data-b3page]").forEach((el) => {
    const open = (e) => { if (arrangeOn(B3_ARR_KEY) || e.target.closest("input, label, button, a, .ds-h")) return; BUDGET_SHEET = "page:" + el.dataset.b3page; b3Redraw(); };
    el.addEventListener("click", open);
    el.addEventListener("keydown", (e) => { if (e.target === el && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); open(e); } });
  });
  // Page tiles order: drag ⋮⋮ while Arrange is on; saved per person, display only.
  content.querySelectorAll(".b3-pg .ds-h[data-b3drag]").forEach((h) => dragSort(h, {
    arrange: B3_ARR_KEY,
    row: ".b3-pt",
    grid: true,
    done: (el) => {
      const keys = [...el.parentElement.querySelectorAll(":scope > .b3-pt")].map((x) => x.dataset.b3page);
      const old = (BUDGET_PAGE_ORDER && Array.isArray(BUDGET_PAGE_ORDER.order)) ? BUDGET_PAGE_ORDER.order : [];
      BUDGET_PAGE_ORDER = { order: keys.concat(old.filter((k) => !keys.includes(k))) };
      saveCalcState("budget_page_order", BUDGET_PAGE_ORDER);
      dsSaved();
    },
    refocus: (el) => { const nh = content.querySelector(`.b3-pt[data-b3page="${window.CSS.escape(el.dataset.b3page)}"] .ds-h`); if (nh) nh.focus(); },
  }));
  // "Free now" (owner): wire the sheet, then work the pages out after the draw.
  const cdaHost = content.querySelector("[data-cdasheet]");
  if (cdaHost) { cdaWire(cdaHost); if (!cdaReady()) cdaDrawBar(); }
  cdaBudgetsAfterDraw();
}
// 🧩 / ⚙ next to a hero's picture, so shards and widgets of one hero differ.
function heroItemMark(name) {
  const hm = /^(.+) (Shards|Widgets)$/.exec(String(name));
  return hm && HERO_IMG_BY_NAME[hm[1]] && !heroOwnShardIcon(name) ? `<img class="bud-face" src="${esc(HERO_IMG_BY_NAME[hm[1]])}" alt="" loading="lazy" />` : "";
}
// "every month · 5 days · next Dec 12" (or "on now"), from the Shining City Pack's dates.
function shiningWhenText() {
  const sc = islShiningStarts(3), dur = Math.max(1, Number(ISL_RULES.shiningDays) || 5);
  const base = t("sh_when").replace("{every}", islEveryText(sc.every || 30, (sc.every || 30) === 30)).replace("{d}", dur);
  if (!sc.known) return `${base} \u00b7 ${t("sh_no_date")}`;
  const today = packStartOfToday(), DAY = 86400000;
  const fmt = (d) => { try { return d.toLocaleDateString(LANG === "en" ? undefined : LANG, { day: "numeric", month: "short", timeZone: "UTC" }); } catch (e) { return packDayKey(d); } };
  const run = sc.starts.find((d) => d <= today && d.getTime() + (dur - 1) * DAY >= today.getTime());
  const nx = sc.starts.find((d) => d > today);
  return [base, run ? t("sh_on_now") : "", nx ? t("sh_next").replace("{date}", fmt(nx)) : ""].filter(Boolean).join(" \u00b7 ");
}
const shiningRowHtml = (r, attr) => `<${attr ? `button type="button" ${attr}` : "div"} class="shr"><span class="p">${r.img ? `<img class="sk" src="${esc(r.img)}" alt="" loading="lazy" />` : ""}<img class="tm" src="icons/glorious-tome.png" alt="" aria-hidden="true" /></span><span class="tx"><b>${esc(r.name)}</b><em>${esc(t("sh_tomes").replace("{n}", shiningTomesPer().toLocaleString()))}</em></span>${attr ? `<span class="ch" aria-hidden="true">&#8250;</span>` : ""}</${attr ? "button" : "div"}>`;
// The Budgets page sheet's skin list.
function shiningSkinsSheetHtml(sh) {
  if (!sh.rows.length) return `<div class="meta sh-bud-none">${esc(t("sh_none"))}</div>`;
  return `<div class="sh-bud"><div class="meta sh-bud-h">${esc(t("sh_skins_n").replace("{n}", sh.rows.length))} \u00b7 ${esc(shiningWhenText())}</div>${sh.rows.map((r) => shiningRowHtml(r)).join("")}</div>`;
}
// "Admin only" tag: shown to the owner while visitors don't have it yet.
function adminOnlyTagOn(what) { return IS_OWNER && !visitorAccessOn(what); }
