// WOS RST: the My Purchases page.
// Loaded by app.js the first time My Purchases opens (loadCode("purchases"),
// pageCodeReady), so visitors who never open it don't download it. A plain script:
// its functions and variables join app.js's. Only names used by this page alone
// live here; anything another page (Budgets, the Menu, the Dashboard, admin.js /
// scan.js / the planner worker) uses stays in app.js. The site loads the packed copy
// purchases.min.js (tools/stamp.js).
window.PURCHASES_BUILD = "f77230a2de";

function packOpenSettingsOnPacks(id) {
  PACK_SETTINGS_FOCUS = String(id);
  const g = packLinkFor(id).group;
  try { localStorage.setItem("packs_filter", g ? "cat:" + g : "all"); } catch (e) { /* blocked */ }
  goToTab("packs");
}
// How many of a plan row's pack the game lets you buy on date s0[d] (the
// Will buy pop-up's "How many"), not the plan's count. Stacking cards: the
// room left in the stack that day ((cap − reward days still running) ÷ card
// days), after the days left now (Weekly cards) and the cards planned before
// it (My Purchases and the pop-up's earlier dates). Other packs: their limit
// for that run minus what is bought / planned in it. Never below 1 or the plan.
function purGameMax(r, tb, s0, d) {
  const plan = Math.max(1, Number(s0[d].count) || 1), id = String(tb.id), off = Number(s0[d].off) || 0;
  const base = packLinkForBase(tb.id), st = packStackInfo(base.reset);
  const todayKey = packDayKey(packStartOfToday()), dayKey = (o) => packDayKey(new Date(packStartOfToday().getTime() + o * 86400000));
  let n;
  if (st) {
    const at = dayKey(off);
    const cards = (PACK_PURCHASES.list || []).filter((p) => String(p.table) === id && (purPlannedCounts(p) || (p.status === "bought" && p.date >= todayKey)) && p.date <= at).map((p) => ({ off: Math.max(0, Math.round((packParseDay(p.date) - packStartOfToday()) / 86400000)), n: Math.max(1, Math.floor(Number(p.count) || 1)) }));
    s0.forEach((x, k) => { if (k !== d && (Number(x.off) || 0) < off) cards.push({ off: Math.max(0, Number(x.off) || 0), n: Math.max(1, Number(x.count) || 1) }); });
    cards.sort((a, b) => a.off - b.off);
    let end = IS_OWNER || base.visitorDate ? Math.min(packActiveDays(tb.id), st.cap) : 0;
    cards.forEach((c) => { end = Math.max(end, c.off) + c.n * st.days; });
    n = Math.floor((st.cap - Math.max(0, end - off)) / st.days);
  } else if (typeof r.reset === "number" && r.reset > 0) {
    const offs = packResetOffsets(r.reset, r.resetDay, PACK_HORIZON_DAYS, r.window);
    const runOf = (o) => offs.filter((x) => x <= o).pop();
    const at = runOf(off), usedAt = r.usedAt || { 0: r.usedNow || 0 };
    const others = s0.reduce((a, x, k) => a + (k !== d && runOf(Number(x.off) || 0) === at ? Number(x.count) || 0 : 0), 0);
    n = (r.perCycle || 1) - ((at != null && usedAt[at]) || 0) - others;
  } else if (r.reset === "once") {
    const used = (PACK_PURCHASES.list || []).filter((p) => String(p.table) === id && (r.row == null || p.row == null || Number(p.row) === Number(r.row)) && packPurchaseUsesLimit(p, base)).reduce((a, p) => a + Math.max(1, Math.floor(Number(p.count) || 1)), 0);
    n = (r.perCycle || 1) - used - s0.reduce((a, x, k) => a + (k !== d ? Number(x.count) || 0 : 0), 0);
  } else n = 99;
  if (!Number.isFinite(n)) n = 99;
  return Math.max(1, plan, Math.floor(n));
}
// The day the running copy of a repeating pack came out (null when it
// can't be told, e.g. calendar-month packs).
// Bought packs stay in Bought while that copy of the pack is on sale
// { until: "yyyy-mm-dd" (last day), once: one-time
// packs that stay }. New-heroes packs end when the next Gen's packs come, or
// when that hero is already maxed; triggered packs once the expert is past
// that pack's level.
function purBoughtUntil(p) {
  const l = packLinkFor(p.table), d = packParseDay(p.date), DAY = 86400000;
  if (!d) return { until: null, once: true };
  const minus1 = (x) => packDayKey(new Date(x.getTime() - DAY));
  const trig = packTriggerOf(l);
  if (trig) return packTriggerRowStatus(trig, Number(p.row) || 0).state === "done" ? { until: minus1(packStartOfToday()) } : { until: null, once: true };
  const ng = /^ng-([sw])-\d+-(.+)$/.exec(String(p.table));
  if (ng || packIsNewGen(l)) {
    const rows = (typeof HERO_PLAN_LAST !== "undefined" && HERO_PLAN_LAST && HERO_PLAN_LAST.rows) || [];
    const r = ng ? rows.find((x) => x.hero && String(x.hero.id) === ng[2]) : null;
    if (r && (ng[1] === "s" ? r.step >= 30 : !r.hasWidget || r.wLevel >= widgetMaxLevel())) return { until: minus1(packStartOfToday()), maxed: true };
    // On sale for its own weeks after each new-heroes day (Training: weeks 1–4,
    // Forge: weeks 5–8); it leaves when those end.
    const base = newGenBaseDay();
    if (!base) return { until: null, once: true };
    const off = (ng ? (ng[1] === "w" ? ngForgeDays((NG_HERO_LINKS[String(p.table)] || {}).tpl) : 0) : packNewGenOffset(p.table)) * DAY;
    const win = Number(l.window) > 0 ? Math.round(Number(l.window)) : 28;
    const starts = newGenStarts(base, 12).map((g) => new Date(g.getTime() + off));
    const at = starts.filter((x) => x <= d).pop();
    if (at && d < new Date(at.getTime() + win * DAY)) return { until: packDayKey(new Date(at.getTime() + (win - 1) * DAY)) };
    const next = starts.find((x) => x > d);
    return next ? { until: minus1(next) } : { until: null, once: true };
  }
  const r = l.reset;
  if (typeof r !== "number" || !(r > 0)) return r === "unlimited" ? { until: p.date } : { until: null, once: true };
  if (r >= PACK_ONE_TIME_DAYS) return { until: null, once: true };
  if (r === 30) return { until: packDayKey(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))) };
  const anchor = packParseDay(l.resetDay);
  let start;
  if (anchor) start = new Date(anchor.getTime() + Math.floor(Math.round((d - anchor) / DAY) / r) * r * DAY);
  else start = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * DAY);
  // The copy ends when the pack leaves the shop: after its "Lasts" days when
  // set (Hall of Heroes Sun–Tue), else when the next copy comes.
  const win = Number(l.window) > 0 ? Math.min(r, Math.round(Number(l.window))) : r;
  return { until: packDayKey(new Date(start.getTime() + (win - 1) * DAY)) };
}
// Amounts of 1,000+ short (5K, 1.2K, 12K, 1.2M) so pack table columns stay narrow.
function purShortAmt(n) {
  const a = Math.abs(n), fx = (v) => (v < 10 ? (Math.round(v * 10) / 10) : Math.round(v)).toString().replace(/\.0$/, "");
  if (a >= 1e6) return fx(n / 1e6) + "M";
  if (a >= 1e3) return fx(n / 1e3) + "K";
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
// A pack column's head: the item's picture only (speedups with their size ring
// and time badge; a hero's shards / widgets with the face), full name in the title.
function purColHeadHtml(name, label) {
  const tm = pkSpeedTime(name), icon = pkItemIcon(name);
  const hm = /^(.+) (Shards|Widgets)$/.exec(String(name || "")), hImg = hm && !heroOwnShardIcon(name) && HERO_IMG_BY_NAME[hm[1]];
  const pic = icon ? `<img src="${esc(icon)}" alt="" loading="lazy" />${tm ? `<u class="pk-tm">${esc(tm)}</u>` : ""}` : `<b>${esc(String(label || name || "?").slice(0, 3))}</b>`;
  return `<span class="pur-t-hi${tm ? " ring" : ""}"${tm ? ` style="--ring:${pkTimeRing(tm)}"` : ""} title="${esc(label || name)}" aria-label="${esc(label || name)}">${pic}${hImg ? `<img class="pk-hface" src="${esc(hImg)}" alt="" loading="lazy" />` : ""}</span>`;
}
function purTablePopup(tb, opts) {
  const link = packLinkFor(tb.id);
  const cols = packEffectiveCols(tb);
  const pc = link.priceCol || 0;
  const all = PACK_TABLES_CACHE || [];
  const mode = link.pickCols > 0 ? "pick" : link.colOptions ? "cols" : link.option ? "set" : "rows";
  const choiceType = mode !== "rows";
  const freeSteps = link.linkSet ? !!packLinkFor(link.linkSet).freeSteps : false;
  const ladder = mode === "pick" ? !!link.pickOrder : mode === "cols" ? true : mode === "set" ? !freeSteps : !!link.sequential;
  const money = (v) => packFmtMoney(v, link.currency);
  const add = (a, b, k) => { Object.entries(b || {}).forEach(([n, v]) => { a[n] = (a[n] || 0) + v * (k == null ? 1 : k); }); return a; };
  const colName = (ci) => (cols[ci] ? materialDisplayName(cols[ci]) : String(tb.columns[ci] || ""));
  const colGive = (cells, ci) => { const out = {}; const q = packParseNum(cells[ci]) * packColMultiplier(link, ci); if (q > 0 && cols[ci]) { const c = packBundleContents(cols[ci]); Object.keys(c).forEach((n) => { out[n] = (out[n] || 0) + q * c[n]; }); } return out; };
  const short = (g) => Object.entries(g || {}).filter(([n]) => n !== "Gems").slice(0, 2).map(([n, v]) => `${/\(minutes\)$/.test(n) ? t12FormatTime(v / 60) : shortAmount(v)} ${materialDisplayName(n).replace(/\s*\((minutes|min)\)$/, "")}`).join(", ");
  // Rows: { ri, price, max, opts: [{ name, label, gives }], n (dropdowns), gives (plain) }
  let R = [];
  const optCols = (tb.columns || []).map((c, ci) => ci).filter((ci) => ci !== pc && cols[ci] && cols[ci] !== "Gems");
  let defSel = 0;
  if (mode === "set") {
    // The option tables: a linked set, or the option packs of the same category.
    let members = link.linkSet ? packLinkSetMembers(link.linkSet) : all.filter((x) => { const l = packLinkFor(x.id); return l.option && !l.linkSet && (l.group || "") === (link.group || ""); });
    if (!members.some((x) => String(x.id) === String(tb.id))) members = [tb].concat(members);
    const tags = link.linkSet ? packLinkSetTags(members) : members.map(packOptionTag);
    const offs = members.map((m) => packOffersFor(m, true));
    const tiers = Math.min(...offs.map((o) => o.length));
    defSel = Math.max(0, members.findIndex((x) => String(x.id) === String(tb.id)));
    for (let k = 0; k < tiers; k++) {
      const o0 = offs[defSel][k];
      R.push({ ri: o0.row, price: o0.price, max: Number((link.rowMax || {})[o0.row]) || 0, n: 1, opts: members.map((m, mi) => ({ name: tags[mi], label: `${tags[mi]}${short(offs[mi][k].gives) ? " · " + short(offs[mi][k].gives) : ""}`, gives: offs[mi][k].gives })) });
    }
  } else {
    const offerOf = new Map(packOffersFor(tb, true).map((o) => [o.row, o]));
    (tb.rows || []).forEach((r, ri) => {
      const cells = r.cells || [], price = packParseNum(cells[pc]);
      if (!(price > 0)) return;
      const base = { ri, price, max: Number((link.rowMax || {})[ri]) || 0 };
      if (mode === "rows") { const o = offerOf.get(ri); R.push({ ...base, n: 0, opts: [], gives: o ? o.gives : {} }); return; }
      const ops = optCols.map((ci) => ({ name: colName(ci), label: `${colName(ci)} · ${String(cells[ci] == null ? "" : cells[ci])}`, gives: colGive(cells, ci) })).filter((o) => Object.keys(o.gives).length);
      if (ops.length) R.push({ ...base, n: mode === "pick" ? link.pickCols : 1, opts: ops });
    });
  }
  if (!R.length) { toast(t("pur_tbl_empty")); return; }
  // The pack's name, the same one the suggestions use.
  const g0 = choiceType ? packGroupsFor(all, "__purchases").find((g) => (g.tables || []).includes(String(tb.id))) : null;
  let name = (g0 && g0.offers && g0.offers[0] && purPackName(g0.offers[0].tableTitle, all)) || opts.name || tb.title || "";
  // Option sets end with their option list ("… · Chief & Charms / Heroes"); the choice shows that already.
  if (mode === "set" && name.includes(" · ")) name = name.slice(0, name.lastIndexOf(" · "));
  // state: S.sel[i] = chosen option per dropdown of row i
  // Every dropdown starts empty (-1) until you choose.
  const S = { counts: {}, upTo: -1, sel: R.map((r) => Array.from({ length: r.n }, () => -1)) };
  // Picks made before the phone reloaded the page come back (same table and rows).
  const rs = opts.restore;
  if (rs && Array.isArray(rs.sel) && rs.sel.length === S.sel.length && rs.sel.every((x, i) => Array.isArray(x) && x.length === S.sel[i].length)) { S.counts = rs.counts || {}; S.upTo = Number.isInteger(rs.upTo) ? rs.upTo : -1; S.sel = rs.sel; }
  const keepDraft = () => { try { sessionStorage.setItem("pur_tbl_draft", JSON.stringify({ table: String(tb.id), S })); } catch (e) { /* blocked */ } };
  const dropDraft = () => { try { sessionStorage.removeItem("pur_tbl_draft"); } catch (e) { /* blocked */ } };
  const rowDone = (i) => S.sel[i].every((oi) => oi >= 0);
  const rowGives = (i) => (R[i].n ? S.sel[i].reduce((g, oi) => (oi >= 0 ? add(g, R[i].opts[oi].gives) : g), {}) : { ...R[i].gives });
  const rowText = (i) => { const cnt = {}; S.sel[i].forEach((oi) => { const nm = oi >= 0 ? R[i].opts[oi].name : "?"; cnt[nm] = (cnt[nm] || 0) + 1; }); return Object.entries(cnt).sort((a, b) => b[1] - a[1]).map(([nm, k]) => (R[i].n > 1 ? `${k}× ${nm}` : nm)).join(" + "); };
  // Ticked / counted rows still waiting for a choice.
  const missing = () => R.map((r, i) => i).filter((i) => (ladder ? i <= S.upTo : S.counts[i] > 0) && !rowDone(i)).length;
  // What will be added: [{ row, count, label, price, gives }]
  const lines = () => {
    if (ladder) {
      if (S.upTo < 0) return [];
      const idx = R.map((r, i) => i).filter((i) => i <= S.upTo);
      const pr = idx.reduce((a, i) => a + R[i].price, 0), g = {};
      idx.forEach((i) => add(g, rowGives(i)));
      const k = idx.length, pt = idx.map(rowText);
      const what = !choiceType ? "" : pt.every((x) => x === pt[0]) ? ` · ${k > 1 ? t("pk_each_step") + ": " : ""}${pt[0]}` : ` · ${idx.map((i, j) => `${money(R[i].price)}: ${pt[j]}`).join("; ")}`;
      return [{ row: R[S.upTo].ri, count: Math.max(1, opts.count || 1), price: pr, gives: g, label: `${k > 1 ? t("pack_up_to") + " " : ""}${money(R[S.upTo].price)}${R.length > 1 ? ` (${t("pack_steps_of").replace("{k}", k).replace("{n}", R.length)})` : ""}${what}` }];
    }
    return R.map((r, i) => i).filter((i) => S.counts[i] > 0).map((i) => ({ row: R[i].ri, count: S.counts[i], price: R[i].price, gives: rowGives(i), label: `${money(R[i].price)}${choiceType ? ` · ${rowText(i)}` : ""}` }));
  };
  let modal = document.getElementById("purTblModal");
  if (!modal) { modal = document.createElement("div"); modal.id = "purTblModal"; modal.className = "modal-overlay"; document.body.appendChild(modal); }
  const close = () => { modal.style.display = "none"; dropDraft(); };
  const showCols = (tb.columns || []).map((c, ci) => ci).filter((ci) => ci !== pc && !packIsNonResourceColumn(tb.columns[ci]));
  const draw = () => {
    const ls = lines(), total = ls.reduce((a, l) => a + l.price * l.count, 0), miss = missing();
    // The tick / − + column comes first so it stays in view on phones.
    const head = choiceType
      ? `<tr><th></th><th>${esc(t("pur_tbl_price"))}</th><th>${esc(mode === "pick" ? t("pur_tbl_items_n").replace("{n}", link.pickCols) : t("pur_choice"))}</th></tr>`
      : `<tr><th></th><th class="pur-t-pr">${esc(t("pur_tbl_price"))}</th>${showCols.map((ci) => `<th>${purColHeadHtml(cols[ci] || String(tb.columns[ci] || ""), colName(ci))}</th>`).join("")}</tr>`;
    const body = R.map((r, i) => {
      const on = ladder ? i <= S.upTo : S.counts[i] > 0;
      const ctl = ladder ? `<button type="button" class="pur-t-tick${on ? " on" : ""}" data-tup="${i}" aria-pressed="${on}">${on ? "&#10003;" : ""}</button>`
        : `<span class="pur-t-n3"><button type="button" data-tct="${i}|1" aria-label="+" ${r.max && (S.counts[i] || 0) >= r.max ? "disabled" : ""}>&#9650;</button><i>${S.counts[i] || 0}</i><button type="button" data-tct="${i}|-1" aria-label="&minus;" ${(S.counts[i] || 0) <= 0 ? "disabled" : ""}>&#9660;</button></span>`;
      const pr = `<td class="pur-t-pr">${esc(money(r.price))}${r.max ? `${choiceType ? " " : "<br>"}<span class="meta">${bidiNum("×" + r.max)}</span>` : ""}</td>`;
      if (choiceType) return `<tr class="${on ? "on" : ""}"><td class="pur-t-ctl">${ctl}</td>${pr}<td class="pur-t-pk"><div class="pur-t-picks3">${S.sel[i].map((sel, k) => `<select class="pur-t-sel${sel < 0 ? " unset" : ""}" data-tsel="${i}|${k}" aria-label="${esc(t("pur_tbl_item_n").replace("{n}", k + 1))}"><option value="-1" ${sel < 0 ? "selected" : ""} disabled>${esc(t("pur_tbl_pick"))}</option>${r.opts.map((o, oi) => `<option value="${oi}" ${oi === sel ? "selected" : ""}>${esc(o.label)}</option>`).join("")}</select>`).join("")}</div></td></tr>`;
      const cells = (tb.rows[r.ri] || {}).cells || [];
      const cell = (ci) => { const raw = String(cells[ci] == null ? "" : cells[ci]).trim(), q = packParseNum(raw); if (!raw) return `<td><span class="pur-t-e">&ndash;</span></td>`; return q >= 1000 ? `<td title="${esc(raw)}">${esc(purShortAmt(q))}</td>` : `<td>${esc(raw)}</td>`; };
      return `<tr class="${on ? "on" : ""}"><td class="pur-t-ctl">${ctl}</td>${pr}${showCols.map(cell).join("")}</tr>`;
    }).join("");
    const hint = t(ladder ? "pur_tbl_hint_ladder" : "pur_tbl_hint_rows") + (mode === "pick" ? " " + t("pur_tbl_hint_pick").replace("{n}", link.pickCols) : choiceType ? " " + t("pur_tbl_hint_opt") : "");
    // A tap redraws the pop-up: its table keeps its scroll.
    const putBoxes = modal.style.display === "flex" ? saveBoxScroll(modal) : () => {};
    modal.innerHTML = `<div class="modal-box pur-t-box">
      <h2>${esc(name)}</h2>
      <div class="meta" style="font-size:11.5px; margin-bottom:8px;">${esc(hint)}</div>
      <div class="pur-t-wrap"><table class="pur-t${choiceType ? "" : " pur-t-c"}"${choiceType ? "" : ` style="min-width:${88 + 30 * showCols.length}px"`}>${choiceType ? "" : `<colgroup><col style="width:32px"><col style="width:56px">${showCols.map(() => "<col>").join("")}</colgroup>`}${head}${body}</table></div>
      ${miss ? `<div class="pur-t-miss">${esc(t("pur_tbl_missing").replace("{n}", miss))}</div>` : ""}
      <div class="pur-m-foot"><span><b>${esc(money(total))}</b> <span class="meta">${ls.length ? esc(ls.map((l) => (l.count > 1 ? bidiNum(l.count + "×") + " " : "") + l.label).join(" · ")) : esc(t("pur_tbl_nothing"))}</span></span><span style="display:flex; gap:8px;"><button type="button" class="btn ghost small" data-tclose>${esc(t("close_button"))}</button><button type="button" class="btn small" data-tadd ${ls.length && !miss ? "" : "disabled"}>+ ${esc(t("pur_add_btn"))}</button></span></div>
    </div>`;
    modal.style.display = "flex";
    putBoxes();
    keepDraft();
    modal.onclick = (ev) => { if (ev.target === modal || ev.target.closest("[data-tclose]")) close(); };
    modal.querySelectorAll("[data-tct]").forEach((b) => b.addEventListener("click", () => { const [i, d] = b.dataset.tct.split("|").map(Number); S.counts[i] = Math.max(0, (S.counts[i] || 0) + d); draw(); }));
    modal.querySelectorAll("[data-tup]").forEach((b) => b.addEventListener("click", () => { const i = Number(b.dataset.tup); S.upTo = S.upTo === i ? -1 : i; draw(); }));
    modal.querySelectorAll("[data-tsel]").forEach((sl) => sl.addEventListener("change", () => { const [i, k] = sl.dataset.tsel.split("|").map(Number); S.sel[i][k] = Number(sl.value); draw(); }));
    const addBtn = modal.querySelector("[data-tadd]");
    if (addBtn) addBtn.addEventListener("click", () => {
      const ls2 = lines();
      if (!ls2.length || missing()) return;
      opts.onAdd(ls2.map((l) => ({ row: l.row, count: l.count, ...(choiceType ? { choice: { name, label: l.label, price: l.price, gives: l.gives } } : {}) })));
      close();
    });
  };
  draw();
}
const PUR_MON = new Map(); // My Purchases: Bought month folds opened / closed ("m2026-10" -> bool), kept for the visit
// The Add a pack form survives the phone reloading the page (sessionStorage).
let PUR_SUG_ROW = null;   // My Purchases (admin): the suggested pack line opened ("week|row")
const PUR_SUG_TICK = new Map(); // "week|row" -> ticked to buy (default: the followed plan's packs), for the visit
const PUR_SUG_VER = new Set();  // "week|row" using the other plan's version of that pack
let PUR_SUG_WEEK = 0; // My Purchases: the suggestions' chosen week tab (0 = this week, "after"), kept for the visit
let PUR_SUG_KEEP = null; // My Purchases: the suggestions box's height / scroll before a redraw
// The pack picker's All tab: category groups folded (kept for the visit and in this browser).
const PUR_PICK_FOLD = new Set((() => { try { const v = JSON.parse(localStorage.getItem("pur_pick_fold") || "[]"); return Array.isArray(v) ? v.map(String) : []; } catch { return []; } })());
let PUR_PICK_TAB = "on"; // Add a pack: the pack picker's tab ("on" / "soon" / "all"), kept for the visit
// My Purchases lists = O1: one switch Next weeks | Coming | Bought
// under the checklist, the chosen list on the page (kept in this browser).
// Box 1: the week strip moved into the This week box,
// so this switch is Will buy | Bought only ("next" from before reads as Will buy).
let PUR_TAB = (() => { try { const v = localStorage.getItem("pur_tab"); if (v === "coming" || v === "bought") return v; } catch (e) { /* blocked */ } return "coming"; })();
const PUR_LIST_ALL = new Set(); // "n" / "c" / "b": that list shows every line (else the first 5), for the visit
let PUR_CHK_ALL = false; // My Purchases: this week's list shows all packs (for the visit)
const PUR_A2_OPEN = new Set(); // My Purchases: this week's grouped packs opened (table ids, for the visit)
// My Purchases' "change ›": the same New heroes window over My Purchases
// (no page change); closing it leaves the page where it was. `onClose(changed)`.
function openNewHeroesWindow(onClose) {
  document.getElementById("purNgSheet")?.remove();
  const ov = document.createElement("div");
  ov.className = "pkb-ov";
  ov.id = "purNgSheet";
  ov.innerHTML = `<div class="pkb-sheet" role="dialog" aria-label="${esc(t("pkb_new_heroes"))}"><div class="pkb-sh-h"><button type="button" class="pkb-back" data-ngclose aria-label="${esc(t("close_button"))}">&#8249;</button><b class="ng-wt">${esc(t("pkb_new_heroes"))}</b></div><div class="pkb-sh-b"><div class="ng-body"><div class="empty">${esc(t("pur_loading"))}</div></div></div></div>`;
  document.body.appendChild(ov);
  ngTitleInfo(ov.querySelector(".ng-wt"));
  let changed = false;
  const tab = TAB;
  const close = () => {
    if (!ov.isConnected) return;
    ov.remove();
    document.removeEventListener("keydown", onKey);
    if (onClose && TAB === tab) onClose(changed);
  };
  const onKey = (e) => { if (e.key === "Escape" && !document.querySelector(".modal-overlay[style*='flex']")) { e.preventDefault(); close(); } };
  document.addEventListener("keydown", onKey);
  ov.addEventListener("click", (e) => { if (e.target === ov || e.target.closest("[data-ngclose]")) close(); });
  ensurePackTables().then((all) => {
    const body = ov.querySelector(".ng-body");
    if (!body || !ov.isConnected) return;
    renderPurNewGen(body, all, () => { changed = true; });
  }).catch(() => { const body = ov.querySelector(".ng-body"); if (body) body.innerHTML = `<div class="empty">${esc(t("no_connection_retry"))}</div>`; });
  return close;
}
async function renderPurchasesPageMain() {
  const seq = RENDER_SEQ;
  // Redrawn after a tap: the suggestions box keeps its height while it's
  // worked out again, and its rows / list keep their scroll.
  // (Redrawn again before the box was filled: what the last filled one had.)
  const oldSug = document.getElementById("purSuggest"), oldCl = oldSug && oldSug.querySelector(".pur-cl-list");
  if (!oldSug) { PUR_SUG_KEEP = null; PUR_SHEET = null; PUR_GRP_OPEN = null; }
  else if (oldSug.dataset.drawn) PUR_SUG_KEEP = { h: oldSug.offsetHeight, boxes: saveBoxScroll(oldSug), cl: oldCl ? { week: oldCl.dataset.week, top: oldCl.scrollTop } : null, html: oldSug.innerHTML };
  const sugH = PUR_SUG_KEEP ? PUR_SUG_KEEP.h : 0, sugBoxes = PUR_SUG_KEEP ? PUR_SUG_KEEP.boxes : () => {};
  const oldClTop = PUR_SUG_KEEP && PUR_SUG_KEEP.cl;
  // "Loading…" only on the first draw; a redraw keeps the page until it's ready.
  if (!oldSug) content.innerHTML = `<div class="plx-head"><h2>${esc(t("pur_title"))}</h2></div><div class="meta">${esc(t("pur_loading"))}</div>`;
  const tables = await ensurePackTables();
  if (seq !== RENDER_SEQ) return;
  await Promise.all([ensureBarHidden(), visitorCan("goals") ? ensureBudgetGoals() : null]);
  if (seq !== RENDER_SEQ) return;
  const today = packDayKey(packStartOfToday());
  const fmtDay = (k) => { const d = packParseDay(k); if (!d) return k || ""; try { return d.toLocaleDateString(LANG === "en" ? undefined : LANG, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }); } catch (e) { return k; } };
  const byId = new Map(tables.map((tb) => [String(tb.id), tb]));
  // Tables joined as one pack ("Same pack, several tables": Dawn Market,
  // Dawn of Wisdom, Myriad Bazaar, Benefit Cards…) are one entry in the pack
  // list; which table each tier comes from is picked in the pack table.
  const setLead = (tb) => { const l = packLinkFor(tb.id); if (!l.option || !l.linkSet) return null; const lead = tables.find((x) => String(x.id) === String(l.linkSet)) || tables.find((x) => packLinkSetOf(x.id) === l.linkSet); return lead || null; };
  const setName = (tb) => {
    const g = packGroupsFor(tables, "__purchases").find((x) => (x.tables || []).includes(String(tb.id)));
    let n = g && g.offers && g.offers[0] ? purPackName(g.offers[0].tableTitle, tables) : (tb.title || "");
    if (n.includes(" · ")) n = n.slice(0, n.lastIndexOf(" · "));
    return n;
  };
  const buyable = tables.filter((tb) => packOffersFor(tb, true).length && (!setLead(tb) || setLead(tb) === tb));
  if (byId.has(String(PUR_FORM.table)) && setLead(byId.get(String(PUR_FORM.table)))) PUR_FORM.table = String(setLead(byId.get(String(PUR_FORM.table))).id);
  if (!byId.has(String(PUR_FORM.table))) PUR_FORM.table = buyable[0] ? String(buyable[0].id) : "";
  if (!PUR_FORM.date) PUR_FORM.date = today;
  const formTb = byId.get(String(PUR_FORM.table));
  const formOffers = formTb ? packOffersFor(formTb, true) : [];
  if (!formOffers.some((o) => o.row === PUR_FORM.row)) PUR_FORM.row = formOffers[0] ? formOffers[0].row : 0;
  // Packs where you choose what you get (Benefit Card, Mix & Match, Myriad
  // Bazaar...): chosen in the pack's table (purTablePopup), which saves the
  // choice with the purchase. (The old one-long-list dropdown is gone.)
  const isChoicePack = (tb) => { const l = packLinkFor(tb.id); return !!(l.option || l.pickCols > 0 || l.colOptions); };
  const formChoice = !!(formTb && isChoicePack(formTb));
  const tierLabel = (tb, row, from) => {
    const link = packLinkFor(tb.id), o = packOffersFor(tb, true).find((x) => x.row === row);
    if (!o) return `#${row + 1}`;
    // The rest of a ladder bought part way: only those steps.
    if (link.sequential && from > 0) return `${t("pur_tier")} ${from === row ? row + 1 : `${from + 1}–${row + 1}`} (${packFmtMoney(packPurchasePrice(tb, row, from), link.currency)})`;
    return link.sequential ? t("pur_upto").replace("{tier}", row + 1).replace("{price}", packFmtMoney(packPurchasePrice(tb, row), link.currency)) : packFmtMoney(o.price, link.currency);
  };
  // The same without money:
  // "Tiers 1–3", "Tier 4", or the choice's label without its price.
  const purTierText = (tb, row, from, choice, extra) => {
    if (choice) {
      const s = String(choice.label || "").replace(/[⁦-⁩]/g, "")
        .replace(/(?:[A-Z]{3}|[$€£¥₩₹])\s?\d[\d,]*(?:\.\d+)?|\d[\d,]*(?:\.\d+)?\s?(?:[A-Z]{3}|[$€£¥₩₹])/g, "")
        .replace(/\s*·\s*(?=·|$)/g, "").replace(/^\s*·\s*/, "").replace(/\s{2,}/g, " ").trim();
      return s || (choice.name ? purShortName(choice.name) : "");
    }
    const link = packLinkFor(tb.id);
    // The last step bought more times ("Last step ×N" packs): "+ 2×".
    const more = Number(extra) > 0 ? ` + ${Math.floor(Number(extra))}\u00d7` : "";
    if (link.sequential && from > 0) return `${t("pur_tier")} ${from === row ? row + 1 : `${from + 1}–${row + 1}`}${more}`;
    return (link.sequential && row > 0 ? t("pur_tiers_upto").replace("{tier}", row + 1) : `${t("pur_tier")} ${row + 1}`) + more;
  };

  // Pack picker grouped like the Packs page.
  const groups = [];
  buyable.forEach((tb) => { const g = packLinkFor(tb.id).group || t("packs_title"); let e = groups.find((x) => x.g === g); if (!e) { e = { g, items: [] }; groups.push(e); } e.items.push(tb); });
  const packOpts = groups.map(({ g, items }) => `<optgroup label="${esc(g)}">${items.map((tb) => `<option value="${esc(String(tb.id))}" ${String(tb.id) === String(PUR_FORM.table) ? "selected" : ""}>${esc(setLead(tb) ? setName(tb) : (tb.title || ""))}</option>`).join("")}</optgroup>`).join("");
  // Add a pack = P4: the Pack box is a button with the picked pack (picture,
  // name, ★ plan / on now, its price on a second line); it opens a picker
  // window (search, On now / Coming / All, planned packs first then A–Z). A
  // pick sets the hidden select above and fires its change, as before.
  const pkLoc = LANG === "en" ? undefined : LANG;
  const pkDay = (off) => { try { return new Date(packStartOfToday().getTime() + off * 86400000).toLocaleDateString(pkLoc, { day: "numeric", month: "short", timeZone: "UTC" }); } catch { return ""; } };
  const purPackInfo = (tb) => {
    const link = packLinkFor(tb.id), cols = packEffectiveCols(tb), pc = link.priceCol || 0;
    let icon = "";
    for (let ci = 0; ci < (tb.columns || []).length && !icon; ci++) {
      if (ci === pc) continue;
      const n = cols[ci] || String(tb.columns[ci] || "").trim();
      if (!n || /^gems$/i.test(n) || packIsNonResourceColumn(n)) continue;
      icon = pkIconHtml(n) || (/^hero shards?$/i.test(n) ? pkIconHtml("Mythic General Hero Shard") : /^hero widgets?$/i.test(n) ? `<img src="${esc(HERO_ITEM_ICON.widget)}" alt="" loading="lazy" />` : "");
    }
    const prices = packOffersFor(tb, true).map((o) => o.price).filter((x) => x > 0);
    let price = "—";
    if (prices.length) { const lo = Math.min(...prices), hi = Math.max(...prices), plain = (x) => String(x).replace(/[⁦-⁩]/g, ""); price = plain(packFmtMoney(lo, link.currency)); if (hi > lo) price += "–" + plain(packFmtMoney(hi, link.currency)).replace(/^[^\d]*/, "").replace(/[^\d.,]*$/, ""); }
    const r = link.reset, st = packStackInfo(r);
    let on = false, next = null;
    if (st || r === "unlimited" || r === "once" || r === 1) on = true;
    else if (typeof r === "number" && r > 0) { const offs = packResetOffsets(r, link.resetDay, 400, link.window); on = offs[0] === 0; const nx = offs.find((o) => o > 0); if (nx != null) next = nx; }
    if (link.trigger) { on = false; next = null; }
    if (link.firstBuy) on = !vipFirstBuyDone();
    const name = setLead(tb) ? setName(tb) : (tb.title || "");
    const words = [name, tb.title || "", ...(tb.columns || []).map((c, ci) => (ci === pc ? "" : `${cols[ci] || c} ${materialDisplayName(cols[ci] || c) || ""}`))].join(" ").toLowerCase();
    return { id: String(tb.id), name, cat: link.group || "", icon, price, on, next, stack: !!st, words };
  };
  const purPlanTables = () => {
    const out = new Set(), plan = PUR_SUG_SHOWN && PUR_SUG_SHOWN.plan;
    const rows = [].concat(plan && plan.rows ? plan.rows : [], plan && plan.targetPlan && plan.targetPlan.rows ? plan.targetPlan.rows : []).filter((x) => x.count > 0);
    rows.forEach((x) => (x.tables || []).forEach((id) => { const tb = byId.get(String(id)); const lead = tb && setLead(tb); out.add(String(lead ? lead.id : id)); }));
    return out;
  };
  const pkStatus = (i, tab) => (i.on ? (i.stack ? esc(t("pur_pk_stacks")) : tab === "on" ? esc(i.cat) : `<span class="pur-pk-on">&#9679; ${esc(t("pur_pk_on_now"))}</span>`) : i.next != null ? `${esc(t("pur_pk_next").replace("{date}", pkDay(i.next)))}${tab === "soon" || tab === "allg" ? "" : ` · ${esc(i.cat)}`}` : tab === "allg" ? "" : esc(i.cat));
  const purPickedHtml = (tb) => {
    const i = purPackInfo(tb), star = purPlanTables().has(i.id);
    return `<button type="button" class="pur-pk-pick" data-purpick aria-haspopup="dialog"><span class="pur-pk-ic">${i.icon || "&#127873;"}</span><span class="pur-pk-tx"><b>${esc(i.name)}</b><small>${star ? `<span class="pur-pk-star">&#9733; ${esc(t("pur_pk_plan"))}</span>` : ""}${pkStatus(i, "all")}</small><small class="pur-pk-pp">${esc(i.price)}</small></span><span class="pur-pk-chg">${esc(t("pur_pk_change"))} &rsaquo;</span></button>`;
  };
  const tierOpts = formTb ? formOffers.map((o) => `<option value="${o.row}" ${o.row === PUR_FORM.row ? "selected" : ""}>${esc(tierLabel(formTb, o.row))}</option>`).join("") : "";
  const formFor = formTb ? packUsedForNames(formTb) : [];
  const addCard = `
    ${buyable.length ? `<div class="pur-form">
      <div class="pur-f pur-f-wide"><span class="meta">${esc(t("pur_pack"))}</span><select data-purf="table" hidden aria-hidden="true" tabindex="-1">${packOpts}</select>${formTb ? purPickedHtml(formTb) : ""}</div>
      ${formChoice
        ? `<div class="pur-f pur-f-wide"><span class="meta">${esc(t("pur_choice"))}</span><button type="button" class="btn" data-purtable>&#128203; ${esc(t("pur_tbl_choose"))}</button></div>`
        : `<label class="pur-f"><span class="meta">${esc(t("pur_tier"))}</span><select data-purf="row">${tierOpts}</select></label>`}
      <label class="pur-f pur-f-sm"><span class="meta">${esc(t("pur_count"))}</span><input type="number" min="1" step="1" data-purf="count" value="${PUR_FORM.count}" /></label>
      <label class="pur-f"><span class="meta">${esc(t("pur_date"))}</span><input type="date" data-purf="date" value="${esc(PUR_FORM.date)}" /></label>
      <div class="pur-f" style="flex:0 1 auto;"><span class="meta">${esc(t("pur_status"))}</span><div class="pur-seg">${["planned", "bought"].map((s) => `<button type="button" data-purstatus="${s}" class="${PUR_FORM.status === s ? "on" : ""}">${esc(t(s === "planned" ? "pur_will_buy" : "pur_bought"))}</button>`).join("")}</div></div>
      ${formChoice ? "" : `<button type="button" class="btn" data-puradd>${esc(t("pur_add_btn"))}</button>`}
    </div>
    <div class="pur-form-f"><span class="meta" style="font-size:11px;">${esc(t("pack_used_for"))}: ${formFor.length ? esc(formFor.join(" · ")) : esc(t("pur_for_none"))}</span>${formChoice ? "" : `<button type="button" class="btn small ghost" data-purtable>&#128203; ${esc(t("pur_tbl_btn"))}</button>`}</div>` : `<div class="meta">${esc(t("pur_no_tables"))}</div>`}`;

  // Bought packs whose copy is over leave the list (purBoughtUntil); their data
  // is erased once their week and month are over too, so My budget's spending
  // for the running week / month stays right.
  const untilOf = new Map();
  const untilFor = (p) => { if (!untilOf.has(p.id)) untilOf.set(p.id, purBoughtUntil(p)); return untilOf.get(p.id); };
  {
    const t0 = packStartOfToday(), monthKey = today.slice(0, 7) + "-01", weekKey = packDayKey(new Date(t0.getTime() - ((t0.getUTCDay() + 6) % 7) * 86400000));
    const keep = (PACK_PURCHASES.list || []).filter((p) => { if (p.status !== "bought") return true; const u = untilFor(p); return u.once || !u.until || u.until >= today || p.date >= monthKey || p.date >= weekKey; });
    if (keep.length !== (PACK_PURCHASES.list || []).length) { PACK_PURCHASES.list = keep; savePackPurchases(); }
  }
  const boughtShown = (p) => { if (p.hidden) return false; const u = untilFor(p); return u.once || !u.until || u.until >= today; };
  // Purchase lists
  const list = (PACK_PURCHASES.list || []).filter((p) => byId.has(String(p.table)) && (p.status !== "bought" || boughtShown(p)));
  const coming = list.filter((p) => p.status !== "bought").sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const bought = list.filter((p) => p.status === "bought").sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const cost = (p) => { const tb = byId.get(String(p.table)); return purchasePrice(p, tb) * Math.max(1, Math.floor(Number(p.count) || 1)); };
  const sumCost = (arr) => arr.reduce((a, p) => a + packConvert(cost(p), packLinkFor(p.table).currency || "USD").n, 0);
  const sample = list[0] ? packLinkFor(list[0].table).currency : "USD";
  const chipsFor = (gives, n, max) => Object.keys(gives).filter((k) => k !== "Gems" && Math.round(gives[k] * n) > 0).slice(0, max || 99).map((k) => {
    const v = gives[k] * n, icon = bpIcon({ name: k.replace(/ \(minutes\)$/, "") });
    const short = /\(minutes\)$/.test(k) ? t12FormatTime(v / 60) : shortAmount(v);
    const label = `${materialDisplayName(k).replace(/\s*\((minutes|min)\)$/, "")}: ${Math.round(v).toLocaleString()}`;
    return `<span class="bud-mat" title="${esc(label)}" aria-label="${esc(label)}">${icon ? `<img src="${esc(icon)}" alt="" loading="lazy" />` : `<i>${esc(materialDisplayName(k).charAt(0))}</i>`}<b>${esc(short)}</b></span>`;
  }).join("");
  // Compact lists: one short line per pack
  // (picture, name × count, date, price, ✓), tap it for its items, Used for and
  // dates; Coming grouped by week, Bought by month (older months folded); each
  // list scrolls inside its own box.
  const purGroupKey = (p) => `${p.table}~${p.choice ? "c:" + p.choice.label : p.row}${p.from > 0 ? "f" + p.from : ""}${!p.choice && p.extra > 0 ? "x" + p.extra : ""}`;
  const monIdx = (packStartOfToday().getUTCDay() + 6) % 7;
  const dOff = (k) => { const d = packParseDay(k); return d ? Math.round((d - packStartOfToday()) / 86400000) : 0; };
  const bucketOf = (kind, k) => (kind === "c" ? "w" + (dOff(k) < 0 ? -1 : Math.floor((dOff(k) + monIdx) / 7)) : "m" + String(k || "").slice(0, 7));
  // Triggered packs still waiting have their own heading; ✓ / × find a row's dates by the same key.
  const bucketFor = (kind, p) => (kind === "c" && purTriggerWaiting(p) ? "w-2" : bucketOf(kind, p.date));
  const groupBy = (arr) => {
    const out = [];
    arr.forEach((p) => { const k = purGroupKey(p); let g = out.find((x) => x.key === k); if (!g) { g = { key: k, tb: byId.get(String(p.table)), row: p.row, first: p, items: [] }; out.push(g); } g.items.push(p); });
    return out;
  };
  const shortDay = (k) => fmtDay(k).replace(/,? \d{4}$/, "");
  // What a purchase gives as the pack table shows it (Lucky Gear Chest stays a
  // chest; the planner's gives count it as 0.016 Mythic Gear). Owner, 20 Oct
  // 2026: the Gear Weekly Card / Hero Ascension Training showed the Mythic Gear box.
  const rawOf = (p, tb) => {
    if (p.choice && p.choice.gives) return { ...p.choice.gives };
    const link = packLinkFor(tb.id), cols = packEffectiveCols(tb), out = {};
    const rows = link.sequential ? (tb.rows || []).map((_, i) => i).filter((i) => i >= (Number(p.from) || 0) && i <= (Number(p.row) || 0)) : [Number(p.row) || 0];
    // The last step bought more times: that row again.
    if (link.sequential && Number(p.extra) > 0) { const last = packOffersFor(tb, true).pop(); if (last && last.row === (Number(p.row) || 0)) for (let k = 0; k < Math.floor(Number(p.extra)); k++) rows.push(last.row); }
    rows.forEach((ri) => {
      const cells = ((tb.rows || [])[ri] || {}).cells || [];
      Object.keys(cols).forEach((ci) => { if (!cols[ci]) return; const q = packParseNum(cells[ci]) * packColMultiplier(link, ci); if (q > 0) out[cols[ci]] = (out[cols[ci]] || 0) + q; });
    });
    return Object.keys(out).length ? out : purchaseGives(p, tb);
  };
  const mainIcon = (gives) => { for (const k of Object.keys(gives || {})) { if (k === "Gems") continue; const ic = bpIcon({ name: k.replace(/ \(minutes\)$/, "") }); if (ic) return ic; } return ""; };
  // The plan a "will buy" came from (older ones have none).
  const planTagOf = (g) => { const k = g.items[0].plan; return ["both", "target", "budget"].includes(k) && g.items.every((p) => p.plan === k) ? k : ""; };
  const untilHtml = (g) => {
    const us = g.items.map(untilFor);
    if (us.every((u) => u.once || !u.until)) return `<span class="pur-until once">&infin; ${esc(t("pur_until_once"))}</span>`;
    const last = us.filter((u) => u.until).map((u) => u.until).sort().pop();
    const left = Math.round((packParseDay(last) - packStartOfToday()) / 86400000);
    const when = left <= 0 ? t("pur_until_today") : left === 1 ? t("pur_until_tomorrow") : t("pur_until_days").replace("{n}", left);
    return `<span class="pur-until${left <= 2 ? " soon" : ""}">${esc(t("pur_until").replace("{date}", shortDay(last)))} · ${esc(when)}</span>`;
  };
  const cntNow = (p) => Math.max(1, Math.floor(Number(p.count) || 1));
  // Lists = O1: one short line per pack (picture, name ×
  // count, plan tag + dates, price, then ✓ on Coming / "Until …" on Bought);
  // tapping a line opens a small sheet with its items, Used for and dates
  // (✓ / ↺ / ✕ per date, Remove all / All bought). Group id = "<c|b>|<bucket>|<pack key>",
  // so ✓ / ✕ act on that week's / month's dates only.
  const GROUPS = new Map(); // id -> { g, kind, bk }
  const grpInfo = (g, kind) => {
    const tb = g.tb, link = packLinkFor(tb.id);
    const n = g.items.reduce((a, p) => a + cntNow(p), 0);
    const total = g.items.reduce((a, p) => a + cost(p), 0);
    const dates = g.items.map((p) => p.date);
    const when = dates.length === 1 ? shortDay(dates[0]) : dates.length === 2 ? `${shortDay(dates[0])}, ${shortDay(dates[1])}` : `${shortDay(dates[0])} → ${shortDay(dates[dates.length - 1])}`;
    const late = kind === "c" && g.items.some((p) => p.date < today && !purTriggerWaiting(p));
    const gives = rawOf(g.first, tb), ic = mainIcon(gives);
    const name = purShortName((g.first.choice && g.first.choice.name) || tb.title || "");
    return { tb, link, n, total, dates, when, late, gives, ic, name, tag: planTagOf(g) };
  };
  const tagChip = (k) => (k ? `<span class="pur-cmp pur-cmp-${k}">${esc(t("pur_tag_" + k))}</span> ` : "");
  // Bought: a short label of how long the line stays.
  const untilShort = (g) => {
    const us = g.items.map(untilFor);
    if (us.every((u) => u.once || !u.until)) return `<span class="pur-o1-until once">&infin; ${esc(t("pur_o1_stays"))}</span>`;
    const last = us.filter((u) => u.until).map((u) => u.until).sort().pop();
    const left = Math.round((packParseDay(last) - packStartOfToday()) / 86400000);
    const txt = left <= 0 ? t("pur_until_today") : left === 1 ? t("pur_until_tomorrow") : t("pur_until").replace("{date}", shortDay(last));
    return `<span class="pur-o1-until${left <= 2 ? " soon" : ""}" title="${esc(t("pur_until").replace("{date}", shortDay(last)))}">${esc(txt)}</span>`;
  };
  const lineHtml = (g, kind, bk) => {
    const id = `${kind}|${bk}|${g.key}`;
    const I = grpInfo(g, kind);
    const tier = kind === "b" ? purTierText(I.tb, g.row, Number(g.first.from) || 0, g.first.choice, g.first.extra) : "";
    const sub = kind === "c"
      ? `${tagChip(I.tag)}${esc(I.when)}${I.late ? ` <span class="pur-late">&#9888;</span>` : ""}`
      : `${tagChip(I.tag)}${esc([t("pur_a2_bought_on").replace("{day}", I.when), tier].filter(Boolean).join(" · "))}`;
    const allBought = t(g.items.length > 1 ? "pur_all_bought" : "pur_mark_bought");
    return `<div class="pur-a2-it pur-o1-ln" data-purgrp="${esc(id)}" role="button" tabindex="0">
      <span class="pur-pic">${I.ic ? `<img src="${esc(I.ic)}" alt="" loading="lazy" />` : `<i>${esc(I.name.charAt(0))}</i>`}</span>
      <span class="pur-a2-tx"><b>${esc(I.name)}${I.n > 1 ? ` <span class="pur-a2-x">${bidiNum("×" + I.n)}</span>` : ""}</b><small>${sub}</small></span>
      <span class="pur-o1-r"><b class="pur-a2-pr">${esc(packFmtMoney(I.total, I.link.currency))}</b>${kind === "b" ? untilShort(g) : ""}</span>
      ${kind === "c" ? `<button type="button" class="pur-a2-ck" data-purgmove="bought" title="${esc(allBought)}" aria-label="${esc(allBought)}">&#10003;</button>` : ""}
    </div>`;
  };
  // The small sheet of one line.
  const grpSheetHtml = (id) => {
    const G = GROUPS.get(id);
    if (!G) return "";
    const { g, kind } = G, I = grpInfo(g, kind);
    const names = packUsedForNames(I.tb);
    const tier = purTierText(I.tb, g.row, Number(g.first.from) || 0, g.first.choice, g.first.extra);
    const dateRow = (p) => `<div class="pur-o1-dt" data-purid="${esc(p.id)}"><span class="pur-o1-dtt"><b>${esc(shortDay(p.date))}${p.date < today && kind === "c" && !purTriggerWaiting(p) ? " &#9888;" : ""}</b><small class="meta">${bidiNum("× " + cntNow(p))} · ${esc(packFmtMoney(cost(p), I.link.currency))}</small></span><button type="button" class="pur-o1-b ed" data-puredit="${esc(p.id)}" title="${esc(t("pur_ed_date_tip"))}" aria-label="${esc(t("pur_ed_date_tip"))}">&#9998;</button>${kind === "c"
      ? `<button type="button" class="pur-o1-b ok" data-purmove="bought" title="${esc(t("pur_mark_bought"))}" aria-label="${esc(t("pur_mark_bought"))}">&#10003;</button>`
      : `<button type="button" class="pur-o1-b" data-purmove="planned" title="${esc(t("pur_mark_planned"))}" aria-label="${esc(t("pur_mark_planned"))}">&#8634;</button>`}<button type="button" class="pur-o1-b" data-purdel title="${esc(t("pur_remove"))}" aria-label="${esc(t("pur_remove"))}">&times;</button></div>`;
    return `<div class="modal-box adm-sheet gs-box pur-o1-sh" role="dialog" aria-modal="true" aria-label="${esc(I.name)}">
      <div class="pur-o1-shh"><span class="pur-pic">${I.ic ? `<img src="${esc(I.ic)}" alt="" />` : `<i>${esc(I.name.charAt(0))}</i>`}</span>
        <span class="pur-o1-sht"><b>${esc(I.name)}${I.n > 1 ? ` <span class="pur-a2-x">${bidiNum("×" + I.n)}</span>` : ""}</b><small>${tagChip(I.tag)}<span class="meta">${esc([packFmtMoney(I.total, I.link.currency), tier].filter(Boolean).join(" · "))}</span></small>${kind === "b" ? untilHtml(g) : ""}</span>
        <button type="button" class="pur-o1-edit" data-puredit="" title="${esc(t("pur_ed_tip"))}">&#9998; ${esc(t("pur_ed_btn"))}</button>
        ${closeXHtml("data-gsx")}</div>
      <div class="pur-ed" data-pureditor hidden></div>
      <div class="pur-o1-lb">${esc(t("pur_o1_gives"))}</div>
      <div class="bud-mats pur-chips">${chipsFor(I.gives, I.n, 8)}</div>
      <div class="meta pur-o1-for">${esc(t("pack_used_for"))}: ${names.length ? esc(names.join(" · ")) : esc(t("pur_for_none"))}</div>
      ${I.late ? `<div class="pur-o1-warn">${esc(t("pur_past_note"))}</div>` : ""}
      ${G.bk === "w-2" ? `<div class="meta pur-o1-for">${esc(t("pur_wk_waiting"))} · ${esc(t("pur_wait_note"))}</div>` : ""}
      <div class="pur-o1-lb">${esc(t("pur_o1_dates"))}</div>
      <div class="pur-o1-dts">${g.items.map(dateRow).join("")}</div>
      <div class="pur-o1-foot"><button type="button" class="btn ghost pur-o1-rm" data-purgdel>&#10005; ${esc(t(g.items.length > 1 ? "pur_o1_remove_all" : "pur_remove"))}</button>${kind === "c" ? `<button type="button" class="btn pur-o1-ok" data-purgall>&#10003; ${esc(t(g.items.length > 1 ? "pur_all_bought" : "pur_mark_bought"))}</button>` : ""}</div>
    </div>`;
  };
  // Week / month headings with their totals.
  const wkStart = (w) => new Date(packStartOfToday().getTime() + (w * 7 - monIdx) * 86400000);
  const bucketHead = (kind, bk, arr) => {
    const tot = esc(packFmtLocal(sumCost(arr), sample, false));
    if (kind === "c") {
      const w = Number(bk.slice(1));
      const name = w === -2 ? t("pur_wk_waiting") : w < 0 ? t("pur_wk_past") : w === 0 ? t("pur_wk_this") : w === 1 ? t("pur_wk_next") : t("pur_wk_n").replace("{n}", w + 1);
      const range = w < 0 ? "" : `${shortDay(packDayKey(w === 0 ? packStartOfToday() : wkStart(w)))} – ${shortDay(packDayKey(new Date(wkStart(w).getTime() + 6 * 86400000)))}`;
      return `<div class="pur-bh${w === -2 ? " wait" : w < 0 ? " late" : ""}"><b>${esc(name)}</b>${w === -2 ? ` <span class="meta">${esc(t("pur_wait_note"))}</span>` : ""} <span class="meta">${esc(range)}</span><b class="pur-bh-t">${tot}</b></div>`;
    }
    const d = packParseDay(bk.slice(1) + "-01");
    let name = bk.slice(1);
    try { if (d) name = d.toLocaleDateString(LANG === "en" ? undefined : LANG, { month: "long", ...(bk.slice(1, 5) !== today.slice(0, 4) ? { year: "numeric" } : {}), timeZone: "UTC" }); } catch (e) { /* keep yyyy-mm */ }
    return { name, tot };
  };
  const LIST_N = 5;
  const listHtml = (kind, arr) => {
    const bks = [];
    const byB = new Map();
    arr.forEach((p) => { const bk = bucketFor(kind, p); if (!byB.has(bk)) { byB.set(bk, []); bks.push(bk); } byB.get(bk).push(p); });
    if (kind === "c") bks.sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
    const all = PUR_LIST_ALL.has(kind);
    let shown = 0, over = 0; // lines drawn / lines past the first 5
    const html = bks.map((bk, i) => {
      const part = byB.get(bk), gs = groupBy(part);
      gs.forEach((g) => GROUPS.set(`${kind}|${bk}|${g.key}`, { g, kind, bk }));
      if (kind === "c") {
        // First 5 lines, then "Show N more".
        over += Math.max(0, gs.length - Math.max(0, LIST_N - shown));
        const take = all ? gs : gs.slice(0, Math.max(0, LIST_N - shown));
        shown += take.length;
        return take.length ? bucketHead(kind, bk, part) + take.map((g) => lineHtml(g, kind, bk)).join("") : "";
      }
      // Bought: months fold (the newest open with its first 5 lines; older months as one line).
      const h = bucketHead(kind, bk, part), on = PUR_MON.has(bk) ? PUR_MON.get(bk) : i === 0;
      if (i === 0) over = Math.max(0, gs.length - LIST_N);
      const take = i === 0 && !all ? gs.slice(0, LIST_N) : gs;
      return `<details class="pur-mon" data-purmon="${esc(bk)}" ${on ? "open" : ""}><summary class="pur-bh"><b>${esc(h.name)}</b> <span class="meta">${part.length === 1 ? esc(t("pur_1_pack")) : `${bidiNum(String(part.length))} ${esc(t("pk_preview_packs"))}`}</span><b class="pur-bh-t">${h.tot}</b></summary>${take.map((g) => lineHtml(g, kind, bk)).join("")}</details>`;
    }).join("");
    const more = over > 0 ? purMoreBtnHtml(`data-purlmore="${kind}"`, all, over) : "";
    return `<div class="pur-o1-list" data-purscroll="${kind}">${html}</div>${more}`;
  };
  const listBody = (k, arr) => (k === "c"
    ? (arr.length ? listHtml("c", arr) + `<div class="meta pur-o1-hint">${esc(t("pur_o1_c_hint"))}</div>` : `<div class="meta pur-a2-none">${esc(t(coming.length ? "pur_o1_none_later" : "pur_none_coming"))}</div>`)
    : (arr.length ? listHtml("b", arr) + `<div class="meta pur-o1-hint">${esc(t("pur_o1_b_hint"))}</div>` : `<div class="meta pur-a2-none">${esc(t("pur_none_bought"))}</div>`));

  // Weekly cards (A2 box with Hide / Show, 4 Nov
  // 2026): the stacking weekly / monthly cards. One box each, "Reward days
  // left" (calc_state my_cards_active, the same numbers the planner reads in
  // packLinkFor); the line under the name works out the rest. They start today.
  const wcCards = tables.filter((tb) => { const l = packLinkForBase(tb.id); return !!packStackInfo(l.reset) && !l.template && (IS_OWNER || (l.visitorDate && !l.hideVisitors)); });
  const wcFmt = (d) => { try { return d.toLocaleDateString(LANG === "en" ? undefined : LANG, { day: "numeric", month: "short", timeZone: "UTC" }); } catch (e) { return packDayKey(d); } };
  const wcRun = wcCards.filter((tb) => packLinkFor(tb.id).activeDaysLeft > 0).length;
  // Hide / Show kept on the account with the other folds (calc_state bar_hidden).
  // Starts folded (the page was a long scroll). bar_hidden only keeps
  // keys set to false, so this key means "opened": false here = the person opened it.
  const WC_KEY = "pur:weekly-opened";
  const wcFolded = BAR_SHOW_ALL[WC_KEY] !== false;
  const wcFoldHtml = (f) => `${esc(t(f ? "g1_show" : "g1_hide"))} ${f ? "&#9662;" : "&#9652;"}`;
  const wcCard = wcCards.length ? `<div class="t12x-card pur-wc pur-a2-wc${wcFolded ? " folded" : ""}" data-purwc>
    <div class="pur-wc-hd"><span class="t12x-title">${esc(t("pur_wc_title"))}</span><span class="meta pur-wc-sum">${esc([wcRun ? t("pur_wc_running_n").replace("{n}", wcRun) : "", wcCards.length - wcRun ? t("pur_wc_notbought_n").replace("{n}", wcCards.length - wcRun) : ""].filter(Boolean).join(" · "))}</span><button type="button" class="g1-fold pur-wc-fold" data-purwcfold aria-expanded="${!wcFolded}">${wcFoldHtml(wcFolded)}</button></div>
    <p class="desc">${esc(t("pur_wc_desc"))}</p>
    <div class="pur-wc-bd">
    ${wcCards.map((tb) => {
      const base = packLinkForBase(tb.id), st = packStackInfo(base.reset), l = packLinkFor(tb.id);
      const offer = packOffersFor(tb, true)[0], ic = offer ? mainIcon(rawOf({ row: offer.row }, tb)) : "";
      const run = l.activeDaysLeft > 0;
      const line = run
        ? t("pur_wc_running").replace("{date}", wcFmt(l.activeUntil)).replace("{next}", wcFmt(new Date(l.activeUntil.getTime() + 86400000))).replace("{more}", Math.max(0, st.cap - l.activeDaysLeft))
        : t("pur_wc_idle").replace("{n}", st.cap);
      return `<div class="pur-wc-row">
        <span class="pur-pic">${ic ? `<img src="${esc(ic)}" alt="" loading="lazy" />` : `<i>${esc(String(tb.title || "?").charAt(0))}</i>`}</span>
        <span class="pur-wc-t"><b>${esc(tb.title || "")}</b><small class="${run ? "on" : ""}">${esc(line)}</small></span>
        <label class="pur-wc-days"><input type="number" min="0" step="1" inputmode="numeric" class="keep-w pur-wc-in" data-wcdays="${esc(String(tb.id))}" value="${packActiveDays(tb.id) || 0}" aria-label="${esc(t("pk_active_label"))}" /><small>${esc(t("pur_a2_days_unit"))}</small></label>
        ${IS_OWNER ? `<button type="button" class="pkd-gear" data-wcopen="${esc(String(tb.id))}" title="${esc(t("pk_preview_open"))}" aria-label="${esc(t("pk_preview_open"))}">&#9881;</button>` : ""}
      </div>`;
    }).join("")}
    <div class="pkd-foot"><span class="meta">${(() => { const st = packStackInfo(packLinkForBase(wcCards[0].id).reset); return esc(t("pur_wc_foot").replace("{d}", st.days).replace("{cap}", st.cap)); })()}</span>${wcCards.some((tb) => MY_CARDS_ACTIVE[String(tb.id)]) ? `<button type="button" class="linklike" data-wcresetall>${esc(t("pk_reset_all_dates"))}</button>` : ""}</div>
    </div>
  </div>` : "";

  // One line about the next new heroes; "change ›" opens the Packs page's
  // Pack dates & prices window at its New heroes section.
  const ngLine = (() => {
    if (!purNewGenTables(tables).length) return "";
    const nx = purNextNewGen();
    const face = nx && nx.hall ? HERO_IMG_BY_NAME[nx.hall] : "";
    const txt = !nx ? t("pur_a2_gen_set") : (nx.gen ? t("pur_a2_gen").replace("{gen}", nx.gen) : t("pur_a2_gen_nogen")).replace("{date}", shortDay(packDayKey(nx.date)));
    return `<button type="button" class="pur-a2-ng" data-purngopen><span class="pur-a2-ngpic">${face ? `<img src="${esc(face)}" alt="" loading="lazy" />` : "&#11088;"}</span><span class="pur-a2-ngt"><b>${esc(txt)}</b>${nx ? ` <span class="meta">· ${esc(t("pur_a2_gen_moves"))}</span>` : ""}</span><span class="pur-a2-lk">${esc(t("pur_a2_change"))} &#8250;</span></button>`;
  })();

  // O1: one switch under the checklist, the chosen list on the
  // page. The Next weeks sub-line is filled in by drawWeek.
  const monthKey0 = today.slice(0, 7) + "-01";
  const boughtMonth = bought.filter((p) => p.date >= monthKey0);
  // Coming leaves out this week: this week's packs (and dates
  // that have passed) are only in the "This week" checklist; the tab lists later
  // weeks and the triggered packs still waiting.
  const sunKey0 = (() => { const t0 = packStartOfToday(); return packDayKey(new Date(t0.getTime() + (6 - ((t0.getUTCDay() + 6) % 7)) * 86400000)); })();
  const comingLater = coming.filter((p) => purTriggerWaiting(p) || p.date > sunKey0);
  // This week's "will buy" lines aren't drawn in Coming, but the checklist opens their sheet (✎ Edit, dates).
  {
    const byB = new Map();
    coming.filter((p) => !comingLater.includes(p)).forEach((p) => { const bk = bucketFor("c", p); if (!byB.has(bk)) byB.set(bk, []); byB.get(bk).push(p); });
    byB.forEach((part, bk) => groupBy(part).forEach((g) => GROUPS.set(`c|${bk}|${g.key}`, { g, kind: "c", bk })));
  }
  const nPacks = (arr) => arr.reduce((a, p) => a + cntNow(p), 0);
  const sheetHtml = (k, title, body) => `<div class="modal-overlay adm-sheet-wrap gs-wrap pur-shw" data-pursh="${k}"${PUR_SHEET === k ? "" : ` style="display:none;"`}><div class="modal-box adm-sheet gs-box pur-sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="gs-head"><b style="flex:1;">${esc(title)}</b>${closeXHtml("data-purshx")}</div>${body}</div></div>`;
  const tabBtn = (k, title, sub, id) => `<button type="button" role="tab" class="pur-o1-tab${PUR_TAB === k ? " on" : ""}" data-purtab="${k}" aria-selected="${PUR_TAB === k}"><b>${esc(title)}</b><small${id ? ` id="${id}"` : ""}>${esc(sub)}</small></button>`;
  const boughtSub = boughtMonth.length ? packFmtLocal(sumCost(boughtMonth), sample, false) : bought.length ? packFmtLocal(sumCost(bought), sample, false) : t("pur_o1_none");
  const tabsHtml = `<div class="pur-o1-tabs" role="tablist">
      ${tabBtn("coming", t("pur_o1_coming"), comingLater.length ? t("pur_o1_n_v").replace("{n}", nPacks(comingLater)).replace("{v}", packFmtLocal(sumCost(comingLater), sample, false)) : t("pur_o1_none"))}
      ${tabBtn("bought", t("pur_bought_list"), boughtSub)}
    </div>`;
  const pane = (k, body) => `<div class="pur-o1-pane" data-purpane="${k}"${PUR_TAB === k ? "" : " hidden"}>${body}</div>`;

  content.innerHTML = `
    <div class="plx-head pur-a2-head"><h2>${esc(t("pur_title"))}</h2><button type="button" class="btn pur-a2-add hd-btn" data-pursheet="add">+ ${esc(t("pur_a2_add"))}</button></div>
    <p class="desc">${esc(t("pur_desc"))} ${esc(t("pur_how"))}</p>
    <div class="pur-a2">
      <div class="pur-a2-l">
        <div class="t12x-card pur-ans" id="purAns"><div id="purAnsTop"></div>${ngLine}</div>
        ${wcCard}
      </div>
      <div class="pur-a2-r">
        <div class="t12x-card pur-chk pur-b1" id="purBox1">
          <div class="pur-sug-in" id="purSuggest"${sugH ? ` style="min-height:${sugH}px;"` : ""}>${PUR_SUG_KEEP && PUR_SUG_KEEP.html
            // While it's worked out again, the last strip / list stays (faded) instead of a blank box.
            ? `<div class="pur-upd bud-pending small">${esc(t("pur_updating"))}</div><div class="pur-stale" aria-hidden="true" inert>${PUR_SUG_KEEP.html}</div>`
            : PUR_SUG_WEEK !== 0 ? `<div class="bud-pending small">${esc(t("budgets_working"))}</div>` : ""}</div>
          <div class="pur-b1-chk" id="purChk"${PUR_SUG_WEEK === 0 ? "" : " hidden"}></div>
        </div>
        <div class="t12x-card pur-o1-card" data-purlists>
          <div class="pur-wc-hd pur-o1-hd"><span class="t12x-title">${esc(t("pur_o1_box"))}</span></div>
          <div class="pur-o1-bd">
          ${tabsHtml}
          ${pane("coming", listBody("c", comingLater))}
          ${pane("bought", listBody("b", bought))}
          </div>
        </div>
      </div>
    </div>
    ${sheetHtml("add", t("pur_add_title"), addCard)}
    <div class="modal-overlay adm-sheet-wrap gs-wrap pur-o1-shw" id="purGrpSheet" style="display:none;"></div>`;

  // ---- This week (answer card + checklist), drawn from the followed plan ----
  const t0w = packStartOfToday(), monW = (t0w.getUTCDay() + 6) % 7;
  const wkMonD = new Date(t0w.getTime() - monW * 86400000), wkSunD = new Date(wkMonD.getTime() + 6 * 86400000);
  const monKeyW = packDayKey(wkMonD), sunKeyW = packDayKey(wkSunD);
  const wdName = (d) => { try { return d.toLocaleDateString(LANG === "en" ? undefined : LANG, { weekday: "short", timeZone: "UTC" }); } catch (e) { return packDayKey(d); } };
  const offDate = (off) => new Date(t0w.getTime() + off * 86400000);
  const optOfLabel = (lb) => { const m = /^[^·]*\d[^·]*·\s*([^·]+)$/.exec(String(lb || "")); return m && !/\d/.test(m[1]) ? m[1].trim() : ""; };
  // The pack's running copy ends this week (before Sunday): "Ends Thu".
  const endsOf = (reset, resetDay, win) => {
    if (typeof reset !== "number" || !(win > 0)) return null;
    let st0 = null;
    try { st0 = packCurrentCycleStart(reset, resetDay); } catch (e) { st0 = null; }
    if (!st0) return null;
    const end = new Date(st0.getTime() + (win - 1) * 86400000);
    return end >= t0w && end < wkSunD ? end : null;
  };
  const whenOf = (offs, ends) => {
    const o = [...new Set(offs.map((x) => Math.max(0, x)))].sort((a, b) => a - b);
    if (!o.length) return { tag: "", txt: "" };
    let tag = "";
    if (o[0] <= 0) tag = ends ? `<span class="pur-a2-tag end">${esc(t("pur_a2_ends").replace("{day}", wdName(ends)))}</span>` : `<span class="pur-a2-tag today">${esc(t("pur_a2_today"))}</span>`;
    const run = o.every((x, i) => i === 0 || x === o[i - 1] + 1);
    let txt = "";
    if (o.length > 1 && run && o[0] <= 0) txt = t("pur_a2_daily").replace("{day}", wdName(offDate(o[o.length - 1])));
    else if (o[0] > 0) txt = o.length === 1 ? wdName(offDate(o[0])) : run ? `${wdName(offDate(o[0]))} – ${wdName(offDate(o[o.length - 1]))}` : o.map((x) => wdName(offDate(x))).join(", ");
    return { tag, txt };
  };
  const showSheet = (k) => {
    PUR_SHEET = k || null;
    content.querySelectorAll("[data-pursh]").forEach((x) => { x.style.display = x.dataset.pursh === PUR_SHEET ? "" : "none"; });
  };
  // O1: pick the list shown under the checklist (no redraw).
  const setTab = (k, scroll) => {
    PUR_TAB = k;
    try { localStorage.setItem("pur_tab", k); } catch (e) { /* blocked */ }
    content.querySelectorAll("[data-purtab]").forEach((b) => { const on = b.dataset.purtab === k; b.classList.toggle("on", on); b.setAttribute("aria-selected", String(on)); });
    content.querySelectorAll("[data-purpane]").forEach((x) => { x.hidden = x.dataset.purpane !== k; });
    const tabs = content.querySelector(".pur-o1-tabs");
    if (scroll && tabs) tabs.scrollIntoView({ block: "start", behavior: "smooth" });
  };
  let sugCtl = null; // { draw, keys, open(i) } from the drawn plan
  // P = { plan, cmp, follow, rows, sched, nFollow, buckets, keys, money, wkName, sugTable, plainPack, sugName, takeAsPlanned, planTag } or null.
  const drawWeek = (P, pending) => {
    const ans = document.getElementById("purAnsTop"), chk = document.getElementById("purChk");
    if (seq !== RENDER_SEQ || !ans || !chk) return;
    const cur0 = P && P.rows && P.rows[0] ? P.rows[0].currency : sample, smp = P && P.rows && P.rows[0] ? P.rows[0].price : undefined;
    const fmt = (v) => packFmtLocal(v, cur0, false, smp);
    const items = []; // { done, tb, name, pic, n, local, tag, step, when, coming: [p], sugg: [{ i, r, xs }], day }
    const pLocal = (p) => packConvert(cost(p), packLinkFor(p.table).currency || "USD").n;
    // "for: <goal>" (owner): what each line gives, matched to the Order of goals.
    const gm = purGoalMatch();
    const addGv = (it, gives, n) => { if (!gm) return; it.gv = it.gv || {}; Object.entries(gives || {}).forEach(([k, v]) => { it.gv[k] = (it.gv[k] || 0) + (Number(v) || 0) * (n || 1); }); };
    // Bought this week (Mon – today).
    const bw = (PACK_PURCHASES.list || []).filter((p) => p.status === "bought" && !p.hidden && byId.has(String(p.table)) && p.date >= monKeyW && p.date <= today);
    groupBy(bw).forEach((g) => {
      const tb = g.tb, last = g.items.map((p) => p.date).sort().pop();
      const it = { done: true, ids: g.items.map((p) => p.id), tb, name: purShortName((g.first.choice && g.first.choice.name) || tb.title || ""), pic: mainIcon(rawOf(g.first, tb)), n: nPacks(g.items), local: g.items.reduce((a, p) => a + pLocal(p), 0), day: last };
      g.items.forEach((p) => addGv(it, purchaseGives(p, tb), cntNow(p)));
      items.push(it);
    });
    // Still to buy: "will buy" dated this week (or passed) and the plan's buys this week.
    const rest = new Map();
    const restOf = (key, mk) => { if (!rest.has(key)) rest.set(key, mk()); return rest.get(key); };
    coming.filter((p) => p.date <= sunKeyW && !purTriggerWaiting(p)).forEach((p) => {
      const tb = byId.get(String(p.table));
      const it = restOf(purGroupKey(p), () => ({ done: false, tb, first: p, name: purShortName((p.choice && p.choice.name) || tb.title || ""), pic: mainIcon(rawOf(p, tb)), n: 0, local: 0, offs: [], coming: [], sugg: [], step: link0Seq(tb) ? purTierText(tb, p.row, Number(p.from) || 0, p.choice, p.extra) : (p.choice ? purTierText(tb, p.row, 0, p.choice) : "") }));
      it.coming.push(p); it.n += cntNow(p); it.local += pLocal(p); it.offs.push(dOff(p.date));
      addGv(it, purchaseGives(p, tb), cntNow(p));
    });
    if (P && P.rows && P.sched) {
      for (let i = 0; i < P.nFollow; i++) {
        const xs = (P.sched[i] || []).filter((x) => Math.max(0, x.off) <= 6 - monW);
        if (!xs.length) continue;
        const r = P.rows[i], tb = P.sugTable(r);
        if (!tb) continue;
        const plain = P.plainPack(tb), key = `${tb.id}~${plain ? (r.row != null ? r.row : 0) : "c:" + r.label}${r.from > 0 ? "f" + r.from : ""}${plain && r.extra > 0 ? "x" + r.extra : ""}`;
        const choice = plain ? null : { name: P.sugName(r), label: r.label, price: r.price, gives: r.gives };
        const it = restOf(key, () => ({ done: false, tb, first: null, name: purShortName(P.sugName(r)) + (optOfLabel(r.label) ? ` · ${optOfLabel(r.label)}` : ""), pic: mainIcon(rawOf({ row: r.row != null ? r.row : 0, from: r.from, extra: r.extra, ...(choice ? { choice } : {}) }, tb)), n: 0, local: 0, offs: [], coming: [], sugg: [], step: plain ? (link0Seq(tb) ? purTierText(tb, r.row != null ? r.row : 0, r.from || 0, null, r.extra) : "") : purTierText(tb, r.row != null ? r.row : 0, 0, choice) }));
        const n = xs.reduce((a, x) => a + x.count, 0);
        it.sugg.push({ i, r, xs, choice, plain });
        addGv(it, r.gives, xs.reduce((a, x) => a + x.count, 0));
        it.n += n; it.local += packRowLocalUnits(r).reduce((a, x) => a + x, 0) * n;
        xs.forEach((x) => it.offs.push(x.off));
        if (!it.endsR) it.endsR = r;
      }
    }
    const restList = [...rest.values()].sort((a, b) => Math.min(...a.offs) - Math.min(...b.offs));
    restList.forEach((it) => {
      const l = packLinkFor(it.tb.id), r = it.endsR;
      const ends = endsOf(r ? r.reset : l.reset, r ? r.resetDay : l.resetDay, Number(r ? r.window : l.window) || 0);
      const w = whenOf(it.offs, ends);
      it.tag = w.tag; it.when = w.txt;
      // The option already in the name ("· all Classic") isn't repeated; "(1 of 5 steps)" loses its brackets.
      const opt = (/ · ([^·]+)$/.exec(it.name) || [])[1];
      let st = String(it.step || "");
      if (opt) st = st.split(" · ").filter((x) => x.trim() !== opt.trim()).join(" · ");
      it.step = st.replace(/^\((.*)\)/, "$1").trim();
    });
    const all = items.concat(restList);
    const total = all.reduce((a, x) => a + x.local, 0), doneV = items.reduce((a, x) => a + x.local, 0);
    const nAll = all.length, nDone = items.length;
    // Answer card
    const left = 6 - monW;
    const leftTxt = left <= 0 ? t("pur_a2_last_day") : left === 1 ? t("pur_a2_day_left") : t("pur_a2_days_left").replace("{n}", left);
    const range = `${shortDay(monKeyW)} – ${shortDay(sunKeyW)}`;
    const plan = P && P.plan, cmp = P && P.cmp, follow = P ? P.follow : "budget";
    const pl = plan ? (cmp && follow === "target" ? cmp.targetPlan : plan) : null;
    const doneDay = pl && pl.days != null && (pl.rows || []).length ? fmtDay(packDayKey(offDate(Math.max(0, pl.days)))) : "";
    const per = plan && plan.spend ? t(plan.spend.per === "week" ? "pur_a2_per_week" : "pur_a2_per_month") : "";
    const tDay = packValidDay(BUDGET_TARGET);
    const sw = cmp ? `<div class="pur-a2-sw" role="group">${["budget", "target"].map((k) => `<button type="button" data-purfollow="${k}" class="${follow === k ? "on" : ""}" aria-pressed="${follow === k}">${esc(k === "budget" ? t("pur_a2_budget_sw").replace("{v}", packFmtLocal(plan.spend.amount, cur0, true, smp) + per) : (cmp.targetPlan.dated ? (cmp.targetPlan.nextDay != null ? t("pur_a2_dates_sw").replace("{date}", shortDay(packDayKey(offDate(cmp.targetPlan.nextDay))).replace(/ /g, "\u00a0")) : t("budgets_view_dates")) : t("pur_a2_target_sw").replace("{date}", tDay ? shortDay(tDay) : "—")))}</button>`).join("")}</div>`
      : plan && plan.spend ? `<div class="pur-following" data-purgospend role="button" tabindex="0">${esc(t("pur_following"))} <b>${esc(t("budgets_view_budget"))}</b> <span class="meta">(${esc(packFmtLocal(plan.spend.amount, cur0, true, smp))}${esc(per)})</span> <span class="pur-go">${esc(t("pur_go_spend"))}</span></div>` : "";
    const pct = nAll ? Math.round((nDone / nAll) * 100) : 0;
    ans.innerHTML = `<div class="pur-a2-wk"><span>${esc(t("pur_a2_week").replace("{range}", range))}</span><span class="meta">${esc(leftTxt)}</span></div>
      <div class="pur-a2-big">${pending && !nAll ? `<span class="bud-pending small">${esc(t("budgets_working"))}</span>` : `<b>${nAll ? esc(fmt(total)) : "—"}</b><span class="meta">${esc(t("pur_n_packs").replace("{n}", nAll))}</span>`}</div>
      <span class="pur-a2-bar"><i style="width:${pct}%;"></i></span>
      <div class="pur-a2-sub">${nDone ? `<span class="good">&#10003; ${esc(t("pur_a2_bought_of").replace("{a}", nDone).replace("{b}", nAll).replace("{v}", fmt(doneV)))}</span>` : nAll ? `<span class="meta">${esc(t("pur_a2_bought_of").replace("{a}", 0).replace("{b}", nAll).replace("{v}", fmt(0)))}</span>` : "<span></span>"}${doneDay ? `<span class="meta">${esc(t("pur_a2_done").replace("{date}", doneDay))}</span>` : pending ? `<span class="meta bud-pending small">${esc(t("budgets_working"))}</span>` : ""}</div>
      ${sw}`;
    // Checklist
    const rowHtml = (it, k) => {
      const nm = `${esc(it.name)}${it.n > 1 ? ` <span class="pur-a2-x">${bidiNum("×" + it.n)}</span>` : ""}`;
      const sub = it.done
        ? esc(it.day === today ? t("pur_a2_bought_today") : t("pur_a2_bought_on").replace("{day}", wdName(packParseDay(it.day))))
        : `${it.tag || ""}${[it.step, it.when].filter(Boolean).map(esc).join(" · ")}`;
      return `<div class="pur-a2-it${it.done ? " done" : ""}" data-pura2="${k}" ${it.done ? "" : `role="button" tabindex="0"`}>
        <span class="pur-pic">${it.pic ? `<img src="${esc(it.pic)}" alt="" loading="lazy" />` : `<i>${esc(it.name.charAt(0))}</i>`}</span>
        <span class="pur-a2-tx"><b>${nm}</b><small>${sub}</small>${purGoalTagHtml(gm, it.gv, 0)}</span>
        <b class="pur-a2-pr">${esc(fmt(it.local))}</b>
        ${it.done ? `<button type="button" class="pur-a2-ck on" data-pura2un="${k}" title="${esc(t("pur_a2_unmark"))}" aria-label="${esc(t("pur_a2_unmark"))}">&#10003;</button>` : `<button type="button" class="pur-a2-ck" data-pura2ck="${k}" title="${esc(t("pur_a2_mark"))}" aria-label="${esc(t("pur_a2_mark"))}">&#10003;</button>`}
      </div>`;
    };
    // Several prices of one pack still to buy (Hall of Heroes: $4.99 + $19.99 +
    // $99.99 on one day) are one line; tapping it shows each price's own line.
    const units = [];
    const unitOf = new Map();
    all.forEach((it, k) => {
      const gk = it.done ? "" : `${it.tb.id}|${it.name}`;
      if (gk && unitOf.has(gk)) { unitOf.get(gk).kids.push(k); return; }
      const u = { gk, kids: [k] };
      if (gk) unitOf.set(gk, u);
      units.push(u);
    });
    const unitHtml = (u) => {
      if (u.kids.length < 2) return rowHtml(all[u.kids[0]], u.kids[0]);
      const kids = u.kids.map((k) => all[k]), it0 = kids[0], open = PUR_A2_OPEN.has(u.gk);
      const n = kids.reduce((a, x) => a + x.n, 0), local = kids.reduce((a, x) => a + x.local, 0);
      const offs = kids.flatMap((x) => x.offs || []);
      const sameWhen = kids.every((x) => x.when === it0.when);
      const gv = {};
      kids.forEach((x) => Object.entries(x.gv || {}).forEach(([k, v]) => { gv[k] = (gv[k] || 0) + v; }));
      const sub = `${sameWhen ? it0.tag || "" : ""}${[t("pur_a2_n_prices").replace("{n}", kids.length), sameWhen ? it0.when : ""].filter(Boolean).map(esc).join(" · ")}`;
      return `<div class="pur-a2-it pur-a2-g${open ? " open" : ""}" data-pura2g="${esc(u.gk)}" role="button" tabindex="0" aria-expanded="${open}" >
        <span class="pur-pic">${it0.pic ? `<img src="${esc(it0.pic)}" alt="" loading="lazy" />` : `<i>${esc(it0.name.charAt(0))}</i>`}</span>
        <span class="pur-a2-tx"><b>${esc(it0.name)} <span class="pur-a2-x">${bidiNum("×" + n)}</span></b><small>${sub}</small>${purGoalTagHtml(gm, gv, 0)}</span>
        <b class="pur-a2-pr">${esc(fmt(local))}</b>
        <span class="pur-a2-gch" aria-hidden="true">${open ? "&#9652;" : "&#9662;"}</span>
      </div>${open ? `<div class="pur-a2-kids">${u.kids.map((k) => rowHtml(all[k], k)).join("")}</div>` : ""}`;
    };
    // First 5 packs, then "Show N more" (the list made a long scroll).
    const CHK_N = 5, extra = units.length - CHK_N;
    const shown = PUR_CHK_ALL || extra <= 1 ? units : units.slice(0, CHK_N);
    chk.innerHTML = all.length ? shown.map(unitHtml).join("") + (extra > 1 ? purMoreBtnHtml("data-pura2more", PUR_CHK_ALL, extra) : "") : `<div class="meta pur-a2-none">${pending ? esc(t("budgets_working")) : esc(t("pur_a2_none"))}</div>`;
    chk.querySelectorAll("[data-pura2g]").forEach((g) => {
      const tog = () => { const k = g.dataset.pura2g; if (PUR_A2_OPEN.has(k)) PUR_A2_OPEN.delete(k); else PUR_A2_OPEN.add(k); drawWeek(P, pending); };
      g.addEventListener("click", tog);
      g.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); tog(); } });
    });
    const moreB = chk.querySelector("[data-pura2more]");
    if (moreB) moreB.addEventListener("click", () => { PUR_CHK_ALL = !PUR_CHK_ALL; drawWeek(P, pending); });
    // Taps
    ans.querySelectorAll("[data-purfollow]").forEach((b) => b.addEventListener("click", () => { if (b.classList.contains("on")) return; try { localStorage.setItem("pur_follow", b.dataset.purfollow); } catch (e) { /* blocked */ } redraw(); }));
    ans.querySelectorAll("[data-purgospend]").forEach((b) => {
      const go = () => { BUDGET_FOCUS_SPEND = true; goToTab("budgets"); };
      b.addEventListener("click", go);
      b.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
    });
    const markBought = (it) => {
      const tb = it.tb;
      const total = it.n;
      const asPlanned = !it.coming.length;
      const s0 = it.sugg[0];
      const base = it.coming[0] || null;
      const proto = base
        ? { table: String(tb.id), row: base.row, ...(base.from != null ? { from: base.from } : {}), ...(base.extra > 0 ? { extra: base.extra } : {}), ...(base.choice ? { choice: base.choice } : {}), ...(base.plan ? { plan: base.plan } : {}) }
        : { table: String(tb.id), row: s0.r.row != null ? s0.r.row : 0, ...(s0.r.from != null ? { from: s0.r.from } : {}), ...(s0.r.extra > 0 ? { extra: s0.r.extra } : {}), ...(s0.choice ? { choice: s0.choice } : {}), plan: P ? P.planTag(s0.i) : undefined };
      const ids = new Set(it.coming.map((p) => p.id));
      const took = () => it.sugg.flatMap((sg) => sg.xs.map((x) => ({ i: sg.i, off: x.off, count: x.count })));
      const save = (n, day, whole) => {
        PACK_PURCHASES.list = (PACK_PURCHASES.list || []).filter((p) => !ids.has(p.id)).concat([{ id: "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ...proto, count: n, date: day, status: "bought" }]);
        savePackPurchases();
        if (asPlanned && whole && P) P.takeAsPlanned(took());
        toast(t("pur_a2_bought_mark") + " ✓");
        redraw();
      };
      // One of a "will buy": the same as ✓ on the Coming row.
      if (total === 1 && it.coming.length === 1) { PACK_PURCHASES.list = PACK_PURCHASES.list.map((p) => (p.id === it.coming[0].id ? toBought(p) : p)); savePackPurchases(); redraw(); return; }
      if (total === 1) { save(1, today, true); return; }
      // Several: how many did you buy, and when? (the How many sheet)
      openBoughtSheet({ id: "", ...proto, count: total, date: today, status: "planned" }, (n, day) => save(n, day, n === total));
    };
    // ✓ on a bought line: back to "will buy" (same as ↺ in the Bought list).
    chk.querySelectorAll("[data-pura2un]").forEach((b) => b.addEventListener("click", (e) => {
      e.stopPropagation();
      const ids = new Set(all[Number(b.dataset.pura2un)].ids || []);
      PACK_PURCHASES.list = (PACK_PURCHASES.list || []).map((p) => (ids.has(p.id) ? { ...p, status: "planned" } : p));
      savePackPurchases(); redraw();
    }));
    chk.querySelectorAll("[data-pura2ck]").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); markBought(all[Number(b.dataset.pura2ck)]); }));
    chk.querySelectorAll(".pur-a2-it[role=button]:not(.pur-a2-g)").forEach((rw) => {
      const go = () => {
        const it = all[Number(rw.dataset.pura2)];
        // A "will buy" of this week: its sheet (items, dates, ✎ Edit); a plan pack: the Will buy pop-up.
        if (it.coming.length) { openGrp(`c|${bucketFor("c", it.coming[0])}|${purGroupKey(it.coming[0])}`); return; }
        const sg = it.sugg[0];
        if (sg && sugCtl) sugCtl.open(sg.i);
      };
      rw.addEventListener("click", (e) => { if (!e.target.closest("button")) go(); });
      rw.addEventListener("keydown", (e) => { if ((e.key === "Enter" || e.key === " ") && !e.target.closest("button")) { e.preventDefault(); go(); } });
    });
  };
  const link0Seq = (tb) => !!packLinkFor(tb.id).sequential;
  drawWeek(null, true);
  // Suggested packs: the Budgets plan (it already counts the packs listed
  // here), each with "Add" to put it under Coming.
  // Pack helpers shared by the Will buy pop-up and the Edit card (O1).
  // A pick pack's prices, each with the items you can pick (amounts per row).
  const pickRows = (tb, lk) => {
    const cols = packEffectiveCols(tb), pc = lk.priceCol || 0;
    const optCols = (tb.columns || []).map((c, ci) => ci).filter((ci) => ci !== pc && cols[ci] && cols[ci] !== "Gems");
    const steps = [];
    (tb.rows || []).forEach((row, ri) => {
      const cells = row.cells || [], price = packParseNum(cells[pc]);
      if (!(price > 0)) return;
      const opts = optCols.map((ci) => {
        const g = {}, q = packParseNum(cells[ci]) * packColMultiplier(lk, ci);
        if (q > 0) { const c = packBundleContents(cols[ci]); Object.keys(c).forEach((n) => { g[n] = (g[n] || 0) + q * c[n]; }); }
        return { tag: materialDisplayName(cols[ci]), name: cols[ci], q, gives: g };
      });
      steps.push({ price, row: ri, opts });
    });
    return steps;
  };
  // Item pictures (the site's own: speedups, expert items, materials).
  const speedIc = (n) => (/speed/i.test(n) ? `icons/speedup-${/constr/i.test(n) ? "construction" : /troop/i.test(n) ? "troop" : /research/i.test(n) ? "research" : /expert/i.test(n) ? "expert" : "general"}.png` : "");
  const itemIc = (n) => itemRegIcon(n) || speedIc(String(n)) || EXPERT_INVENTORY_ICONS[n] || materialIconSrc(n) || (/sigil/i.test(n) ? "icons/item_icon_570000.png" : /book/i.test(n) ? EXPERT_INVENTORY_ICONS["Books of Knowledge"] : /essence/i.test(n) ? MATERIAL_ICONS["essence stone"] : /^XP 10/.test(n) ? MATERIAL_ICONS["xp component"] : "");
  const drawPlan = (plan, taken, updating) => {
    const box = document.getElementById("purSuggest");
    if (seq !== RENDER_SEQ || !box) return;
    PUR_SUG_SHOWN = { plan, taken };
    const titleOf = (tb) => { const l = packLinkFor(tb.id); return l.group && l.group !== (tb.title || "") ? l.group + " · " + (tb.title || t("packs_title")) : (tb.title || t("packs_title")); };
    const byTitle = new Map(tables.map((tb) => [titleOf(tb), tb]));
    // Just the pack name: the category in front ("Weekly/Monthly Calendar Packs · ") is dropped.
    const sugName = (r) => purPackName(r.title, tables);
    const sugTable = (r) => (r.tables && r.tables.length ? byId.get(String(r.tables[0])) : null) || byTitle.get(r.title) || null;
    // "Will buy" only for plain tables (option / pick-your-items packs give
    // what you choose, which a purchase line can't record).
    const plainPack = (tb) => { const l = packLinkFor(tb.id); return !l.option && !(l.pickCols > 0) && !l.colOptions; };
    // Admin: with My budget and a target both set, the list
    // follows one plan (switch, kept in this browser) and labels every pack
    // "both" / "target" / "budget"; the other plan's packs are listed too.
    const cmp = plan && plan.spend && plan.targetPlan && (plan.targetPlan.rows || []).length ? plan : null;
    let follow = "budget";
    try { if (localStorage.getItem("pur_follow") === "target") follow = "target"; } catch (e) { /* blocked */ }
    if (!cmp) follow = "budget";
    const budRows = plan && plan.rows ? plan.rows.filter((r) => r.count > 0) : [];
    const tgtRows = cmp ? cmp.targetPlan.rows.filter((r) => r.count > 0) : [];
    const followRows = follow === "target" ? tgtRows : budRows, otherRows = follow === "target" ? budRows : tgtRows;
    const nFollow = followRows.length;
    const rows = followRows.concat(otherRows);
    if (!rows.length) {
      // Nothing planned: box 1 is just this week's checklist (no week strip).
      box.innerHTML = plan ? "" : `<div class="meta pur-a2-none">${esc(t("pur_sug_fail"))}</div>`;
      box.style.minHeight = ""; box.classList.remove("pur-upding"); box.dataset.drawn = "1";
      const chk0 = document.getElementById("purChk"); if (chk0) chk0.hidden = false;
      sugCtl = null; drawWeek(plan ? { plan, rows: [], sched: [], nFollow: 0 } : null); return;
    }
    // Packs come on the calendar, so each suggestion is spread over the days it
    // can actually be bought (Now, then each time the pack comes back).
    // With "My budget" set, the days come from that plan (never over the limit).
    const budSched = plan.spendSched || packPlanSchedule(budRows), tgtSched = cmp ? packPlanSchedule(tgtRows) : [];
    let sched = follow === "target" ? tgtSched.concat(budSched) : budSched.concat(tgtSched);
    // Each row as "<plan>:<row>" (b = My budget / main plan, t = By target), so
    // picks stay matched when the list follows the other plan.
    const rowRef = (i) => (i < nFollow ? (follow === "target" ? "t:" : "b:") + i : (follow === "target" ? "b:" : "t:") + (i - nFollow));
    // Packs already picked from this same plan (PUR_SUG_OVERLAY) are left out.
    if (taken && taken.length) {
      const left = taken.map((x) => ({ ...x }));
      sched = sched.map((xs, i) => {
        const ref = rowRef(i);
        return xs.map((x) => {
          let c = x.count;
          left.forEach((tk) => { if (c > 0 && tk.count > 0 && tk.ref === ref && tk.off === x.off) { const d = Math.min(c, tk.count); c -= d; tk.count -= d; } });
          return c === x.count ? x : { ...x, count: c };
        }).filter((x) => x.count > 0);
      });
    }
    // Picked exactly as suggested: draw the rest at once from this plan.
    const takeAsPlanned = (entries) => { PUR_SUG_OVERLAY = { plan, taken: (taken || []).concat(entries.map((e) => ({ ref: rowRef(e.i), off: e.off, count: e.count }))) }; };
    const dayOf = (off) => packDayKey(new Date(packStartOfToday().getTime() + off * 86400000));
    const whenTxt = (off) => off <= 0 ? t("pur_sug_now") : fmtDay(dayOf(off)).replace(/,? \d{4}$/, "");
    // Short "when" (the full list of days was too long):
    // days in a row → "Dec 7 → Feb 21 · every day (77 days)"; evenly spaced →
    // "every 4 weeks (4×)"; a few dates or runs as they are; else first → last · N dates.
    const whenShort = (list) => {
      const offs = [...new Set(list.map((x) => Math.max(0, x.off)))].sort((a, b) => a - b);
      if (offs.length <= 2) return offs.map(whenTxt).join(", ");
      const n = offs.length, span = `${whenTxt(offs[0])} → ${whenTxt(offs[n - 1])}`;
      const gaps = offs.slice(1).map((o, i) => o - offs[i]);
      const same = gaps.every((g) => g === gaps[0]) ? gaps[0] : 0;
      if (same === 1) return `${span} · ${t("pur_when_daily").replace("{n}", n)}`;
      if (same && same % 7 === 0) return `${span} · ${t(same === 7 ? "pur_when_weekly" : "pur_when_weeks").replace("{w}", same / 7).replace("{n}", n)}`;
      const runs = [];
      offs.forEach((o) => { const r = runs[runs.length - 1]; if (r && o === r[1] + 1) r[1] = o; else runs.push([o, o]); });
      return runs.length <= 3 ? runs.map(([a, b]) => (a === b ? whenTxt(a) : `${whenTxt(a)} – ${whenTxt(b)}`)).join(", ") : `${span} · ${t("pur_when_dates").replace("{n}", n)}`;
    };
    // Week tabs: this week, then each week (Mon–Sun)
    // until the Budgets target, then what comes after it; without a target the
    // next 8 weeks, then "Later".
    const monIdx = (packStartOfToday().getUTCDay() + 6) % 7;
    const weekOf = (off) => Math.floor((Math.max(0, off) + monIdx) / 7);
    const tDay = packParseDay(packValidDay(BUDGET_TARGET));
    const tOff = tDay ? Math.round((tDay - packStartOfToday()) / 86400000) : null;
    const lastWeek = tOff != null && tOff >= 0 ? weekOf(tOff) : 7;
    const bucketOf = (off) => (tOff != null && tOff >= 0 && off > tOff) || weekOf(off) > lastWeek ? "after" : weekOf(off);
    // (in store prices, step by step, like the lines under each week: a week's box is the sum of its list)
    const conv = (r, n) => packRowLocalUnits(r).reduce((a, x) => a + x, 0) * n;
    const buckets = new Map(); // key -> { key, cost, alt (other plan's cost), items: Map(i -> [entries]), match: Map(follow i -> other i) }
    const rowKey = (r) => `${r.title}|${r.label}`;
    rows.forEach((r, i) => sched[i].forEach((x) => {
      const k = bucketOf(x.off);
      if (!buckets.has(k)) buckets.set(k, { key: k, cost: 0, alt: 0, items: new Map(), match: new Map() });
      const b = buckets.get(k);
      if (i < nFollow) b.cost += conv(r, x.count); else b.alt += conv(r, x.count);
      if (!b.items.has(i)) b.items.set(i, []);
      b.items.get(i).push(x);
    }));
    // The same pack in the other plan in the same week is one line, "both" (the
    // same step first, then any step of that pack; a different step is noted).
    if (cmp) buckets.forEach((b) => {
      const others = [...b.items.keys()].filter((i) => i >= nFollow);
      const pair = (same) => others.forEach((j) => {
        if (!b.items.has(j)) return;
        const i = [...b.items.keys()].find((x) => x < nFollow && !b.match.has(x) && rows[x].title === rows[j].title && (!same || rowKey(rows[x]) === rowKey(rows[j])));
        if (i == null) return;
        b.match.set(i, { n: b.items.get(j).reduce((a, x) => a + x.count, 0), label: rows[j].label, same: rowKey(rows[i]) === rowKey(rows[j]), j, xs: b.items.get(j) });
        b.items.delete(j);
      });
      pair(true); pair(false);
    });
    const keys = [...buckets.keys()].filter((k) => k !== "after").sort((a, b) => a - b).concat(buckets.has("after") ? ["after"] : []);
    if (!keys.includes(0)) keys.unshift(0);
    // Pack calendar "+ Will buy" (PUR_FOCUS): the week this pack is next bought
    // in (nearest the picked day), then its Will buy pop-up (below).
    let focusI = null;
    if (PUR_FOCUS && !updating) {
      const f = PUR_FOCUS; PUR_FOCUS = null;
      let best = null;
      if (Date.now() - f.at < 120000) rows.forEach((r, i) => {
        const tb = sugTable(r);
        if (!(tb && String(tb.id) === f.table) && !(r.tables || []).map(String).includes(f.table)) return;
        (sched[i] || []).forEach((x) => { const d = Math.abs(Math.max(0, x.off) - f.off) + (i < nFollow ? 0 : 1000); if (!best || d < best.d) best = { d, i, k: bucketOf(x.off) }; });
      });
      if (best && keys.includes(best.k)) { PUR_SUG_WEEK = best.k; focusI = best.i; } else if (Date.now() - f.at < 120000) toast(t("pcl_wb_none"));
    }
    const money = (v) => packFmtLocal(v, rows[0].currency, true, rows[0].price);
    const wkStart = (w) => new Date(packStartOfToday().getTime() + (w * 7 - monIdx) * 86400000);
    const wkName = (k) => (k === "after" ? t(tOff != null && tOff >= 0 ? "pur_wk_after" : "pur_wk_later") : k === 0 ? t("pur_wk_this") : k === 1 ? t("pur_wk_next") : tOff != null && k === lastWeek ? t("pur_wk_target") : t("pur_wk_n").replace("{n}", k + 1));
    const short = (d) => fmtDay(packDayKey(d)).replace(/,? \d{4}$/, "");
    const wkRange = (k) => {
      if (k === "after") return tOff != null && tOff >= 0 ? `${short(new Date(tDay.getTime() + 86400000))} →` : `${short(wkStart(lastWeek + 1))} →`;
      const a = k === 0 ? packStartOfToday() : wkStart(k);
      let e = new Date(wkStart(k).getTime() + 6 * 86400000);
      if (tDay && k === lastWeek && tDay < e) e = tDay;
      return `${short(a)} – ${short(e)}`;
    };
    // Box 1: This week (0) = the ✓ checklist under the strip; kept for the visit.
    // A week emptied by a pick goes on to the next week with packs (else This week).
    if (!keys.includes(PUR_SUG_WEEK)) PUR_SUG_WEEK = (typeof PUR_SUG_WEEK === "number" && keys.find((k) => k === "after" || k > PUR_SUG_WEEK)) || keys[0];
    let sugAll = false; // every line drawn (the checklist opening a pack's Will buy pop-up)
    let firstDraw = true;
    const drawSug = () => {
    // Keep the pack list where it was scrolled when it's redrawn for the same
    // week (opening a pack line, ticking all); another week starts at the top.
    const oldList = box.querySelector(".pur-cl-list");
    const was = oldList ? { week: oldList.dataset.week, top: oldList.scrollTop } : firstDraw ? oldClTop : null;
    const keepTop = was && was.week === String(PUR_SUG_WEEK) ? was.top : 0;
    const putBoxes = firstDraw ? sugBoxes : saveBoxScroll(box);
    const sel = buckets.get(PUR_SUG_WEEK);
    const otherName = follow === "target" ? "budget" : "target";
    // (With the goals' own dates the "target" plan is the one bought for those dates: it is called "dates".)
    const datedT = !!(cmp && cmp.targetPlan.dated);
    const tagTxt = (k) => (k === "target" && datedT ? t("pur_tag_dates") : t("pur_tag_" + k));
    // Both plans first, then this plan only, then the other plan only.
    const rank = (i) => (i >= nFollow ? 2 : sel.match.has(i) ? 0 : 1);
    const list = sel ? [...sel.items.entries()].sort((a, b) => (cmp ? rank(a[0]) - rank(b[0]) : 0) || Math.min(...a[1].map((x) => x.off)) - Math.min(...b[1].map((x) => x.off))) : [];
    // Which plan a pick came from, kept on the purchase so Coming shows it
    // "both" / "target" / "budget".
    const planTag = (i) => (cmp ? (i >= nFollow ? otherName : sel && sel.match.has(i) ? "both" : follow) : plan && plan.spend ? "budget" : "target");
    const tagHtml = (i, n) => {
      if (!cmp) return "";
      if (i >= nFollow) return `<span class="pur-cmp pur-cmp-${otherName}">${esc(tagTxt(otherName))}</span> `;
      if (!sel.match.has(i)) return `<span class="pur-cmp pur-cmp-${follow}">${esc(tagTxt(follow))}</span> `;
      const m = sel.match.get(i);
      const note = !m.same ? `${tagTxt(otherName)}: ${m.label} ×${m.n}` : m.n !== n ? t("pur_tag_counts").replace("{a}", tagTxt(follow)).replace("{n}", n).replace("{b}", tagTxt(otherName)).replace("{m}", m.n) : "";
      return `<span class="pur-cmp pur-cmp-both">${esc(t("pur_tag_both"))}</span> ${note ? `<span class="pur-cmp-note">${esc(note)}</span> ` : ""}`;
    };
    // Admin: a short summary of the chosen
    // week; "Show packs" opens big week boxes and one line per pack (tap a line
    // for its items, dates and the other plan's version; ＋ = Will buy).
    // Ticks (default: the followed plan's packs) and the version picked for a
    // pack both plans buy differently, per week.
    const tickOf = (i) => { const k = `${PUR_SUG_WEEK}|${i}`; return PUR_SUG_TICK.has(k) ? PUR_SUG_TICK.get(k) : i < nFollow; };
    const verOf = (i) => {
      const xs = (sel && sel.items.get(i)) || [], m = cmp && sel && sel.match.get(i);
      if (m && PUR_SUG_VER.has(`${PUR_SUG_WEEK}|${i}`)) return { r: rows[m.j], xs: m.xs, n: m.n };
      return { r: rows[i], xs, n: xs.reduce((a, x) => a + x.count, 0) };
    };
    const compactHtml = () => {
      // A pack you pick one option of ("QAR 17.99 · Chief Gear"): its option on the line.
      const optOf = (r) => { const m = /^[^·]*\d[^·]*·\s*([^·]+)$/.exec(String(r.label || "")); return m && !/\d/.test(m[1]) ? m[1].trim() : ""; };
      const bi = (() => {
        const sp = plan.spend;
        if (!sp || PUR_SUG_WEEK === "after" || follow !== "budget") return null;
        const startOff = PUR_SUG_WEEK === 0 ? 0 : PUR_SUG_WEEK * 7 - monIdx;
        const pd = sp.periods.find((x) => x.p === spendPeriodOf(startOff, sp.per)) || { spent: 0, avail: sp.amount };
        const name = sp.per === "week" ? t("pur_wk_this") : new Date(packStartOfToday().getTime() + startOff * 86400000).toLocaleDateString(LANG === "en" ? undefined : LANG, { month: "long", timeZone: "UTC" });
        return { name, spent: pd.spent, avail: pd.avail || sp.amount };
      })();
      const followName = cmp || plan.spend ? t(follow === "target" ? (datedT ? "pur_follow_dates" : "budgets_view_target") : "budgets_view_budget") : "";
      // Following your dates with My budget set: what this month (or week) costs with
      // those dates - the plan's packs on their days plus what is already in My
      // Purchases - beside the limit, amber when it goes over.
      const di = (() => {
        const sp = plan.spend;
        if (!sp || !datedT || follow !== "target" || PUR_SUG_WEEK === "after") return null;
        const startOff = PUR_SUG_WEEK === 0 ? 0 : PUR_SUG_WEEK * 7 - monIdx, p = spendPeriodOf(startOff, sp.per);
        let spent = 0;
        for (let i = 0; i < nFollow; i++) { const unit = packRowLocalUnits(rows[i]).reduce((a, x) => a + x, 0); (sched[i] || []).forEach((x) => { if (spendPeriodOf(x.off, sp.per) === p) spent += unit * x.count; }); }
        budgetSpendFixed().forEach((x) => { if (spendPeriodOf(x.off, sp.per) === p) spent += x.amount; });
        const name = sp.per === "week" ? t("pur_wk_this") : new Date(packStartOfToday().getTime() + startOff * 86400000).toLocaleDateString(LANG === "en" ? undefined : LANG, { month: "long", timeZone: "UTC" });
        return { name, spent, avail: sp.amount };
      })();
      const canBuy = (i) => { const tb = sugTable(rows[i]); return !!tb && (rows[i].row != null || !plainPack(tb)); };
      const gm = purGoalMatch(), dowG = (packStartOfToday().getUTCDay() + 6) % 7;
      // O1: a line's picture is its main item, the one
      // this pack covers the biggest share of (of everything the plan buys);
      // "+N" = the other items it gives.
      // T1: each item of an opened line is tagged main / needed / extra
      // (extra = the plan doesn't need it, directly, through a trade or inside a chest).
      const planTot = {};
      rows.forEach((x) => Object.entries(x.gives || {}).forEach(([k, v]) => { planTot[k] = (planTot[k] || 0) + v * (x.count || 1); }));
      const needMap = plan.need || null;
      // Items the plan can use: needed ones plus everything a trade rule of a
      // planned page turns into them silently (chained). plan.trades leaves out
      // those silent ones (General Sigils, Mythic General Hero Shards, Widget
      // Chests, General Speedups …), so the rules are read here.
      const tradeFrom = new Set((plan.trades || []).map((x) => x.from));
      if (needMap) {
        const rules = BUDGET_PAGES.filter((pg) => !BUDGET_SELECTED || BUDGET_SELECTED[pg.key] !== false).flatMap((pg) => { try { return tradeRatesFor(pg.key).filter((x) => x.silent); } catch (e) { return []; } });
        const want = new Set([...Object.keys(needMap).filter((k) => needMap[k] > 0), ...tradeFrom]);
        for (let grew = true; grew;) { grew = false; rules.forEach((x) => { if (want.has(x.to) && !want.has(x.from)) { want.add(x.from); grew = true; } }); }
        want.forEach((k) => tradeFrom.add(k));
      }
      const isNeeded = (k, d = 0) => !needMap || (needMap[k] || 0) > 0 || tradeFrom.has(k) || (d < 2 && PACK_BUNDLES[k] && Object.keys(PACK_BUNDLES[k]).some((c) => isNeeded(c, d + 1)));
      // The items an opened line shows (same filter and limit as its chips),
      // with the main item always among them.
      const shownOf = (r, n) => {
        const ks = Object.keys(r.gives || {}).filter((k) => k !== "Gems" && Math.round(r.gives[k] * n) > 0);
        const pool = ks.filter((k) => isNeeded(k));
        let best = (pool[0] || ks[0]) || null, bs = -1;
        (pool.length ? pool : ks).forEach((k) => { const sh = planTot[k] > 0 ? (r.gives[k] * (r.count || 1)) / planTot[k] : 0; if (sh > bs + 1e-9) { bs = sh; best = k; } });
        let keys = ks.slice(0, 6);
        if (best && !keys.includes(best)) keys = [...ks.slice(0, 5), best];
        return { main: best, keys, more: Math.max(0, keys.length - 1) };
      };
      // O1: one line per pack — tick, main item picture,
      // short name × count, plan tag + dates under it, price, ＋ (Will buy pop-up).
      const rowHtml = ([i, xs]) => {
        const r = rows[i], n = xs.reduce((a, x) => a + x.count, 0);
        const { main: first, keys: chipKeys, more } = shownOf(r, n);
        const icon = first ? bpIcon({ name: first.replace(/ \(minutes\)$/, "") }) : null;
        const open = PUR_SUG_ROW === `${PUR_SUG_WEEK}|${i}`;
        const tk = tickOf(i), vr = verOf(i);
        const kind = cmp ? (i >= nFollow ? otherName : sel.match.has(i) ? "both" : follow) : null;
        const m = kind === "both" ? sel.match.get(i) : null;
        const star = m && (!m.same || m.n !== n) ? "*" : "";
        const tagged = chipKeys.length > 1 && !!needMap;
        const chips = chipKeys.map((k) => {
          const v = r.gives[k] * n, ic = bpIcon({ name: k.replace(/ \(minutes\)$/, "") });
          const sh = /\(minutes\)$/.test(k) ? t12FormatTime(v / 60) : shortAmount(v);
          const role = k === first ? "main" : isNeeded(k) ? "needed" : "extra";
          const chip = `<span class="bud-mat${tagged || k === first ? ` pur-${role}` : ""}" title="${esc(materialDisplayName(k))}">${ic ? `<img src="${esc(ic)}" alt="" loading="lazy" />` : `<i>${esc(materialDisplayName(k).charAt(0))}</i>`}<b>${esc(sh)}</b></span>`;
          return tagged ? `<span class="pur-tagc">${chip}<small class="pur-tag-${role}">${esc(t("pur_role_" + role))}</small></span>` : chip;
        }).join("");
        return `<div class="pur-cl-row pur-o1-sr${open ? " open" : ""}${tk ? " on" : ""}" data-purrow="${i}">
          ${canBuy(i) ? `<input type="checkbox" class="pur-cl-tick" data-purtick="${i}" ${tk ? "checked" : ""} aria-label="${esc(t("pur_will_buy"))}" />` : `<span class="pur-cl-tick"></span>`}
          <span class="pur-cl-ic" title="${first ? esc(materialDisplayName(first.replace(/ \(minutes\)$/, ""))) : ""}">${icon ? `<img src="${esc(icon)}" alt="" loading="lazy" />` : ""}${more ? `<u class="pur-cl-more">+${more}</u>` : ""}</span>
          <span class="pur-cl-n"><b>${esc(purShortName(sugName(r)))}${optOf(r) ? ` · ${esc(optOf(r))}` : ""} <span class="pur-a2-x">${bidiNum("×" + n)}</span></b><small>${kind ? `<span class="pur-cmp pur-cmp-${kind}">${esc(tagTxt(kind))}${star}</span> ` : ""}${esc(whenShort(vr.xs))}</small>${gm ? purGoalTagHtml(gm, r.gives, Math.floor((Math.max(0, Math.min(...xs.map((x) => x.off))) + dowG) / 7)) : ""}</span>
          <span class="pur-cl-p" data-purprice="${i}">${esc(packFmtLocal(packRowLocalUnits(vr.r).reduce((a, x) => a + x, 0) * vr.n, vr.r.currency, false, vr.r.price))}</span>
          ${canBuy(i) ? `<button type="button" class="pur-cl-add" data-pursug="${i}" aria-label="${esc(t("pur_will_buy"))}">+</button>` : `<span class="pur-cl-add off"></span>`}
        </div>${open ? `<div class="pur-cl-ex">${chips ? `<div class="bud-mats pur-chips">${chips}</div>` : ""}<div>${esc(whenShort(vr.xs))} · ${esc(vr.r.label)}</div>${cmp ? `<div>${tagHtml(i, n)}</div>` : ""}</div>` : ""}`;
      };
      // Week strip (box 1, Option 1): This week · Next week · Week 3 … This week = the ✓ checklist below.
      const boxes = `<div class="pur-wbs pur-o1-wbs">${keys.map((k) => { const b = buckets.get(k); return `<button type="button" class="pur-wb${k === PUR_SUG_WEEK ? " on" : ""}" data-purwk="${k}"><span>${tOff != null && k === lastWeek ? "&#127919; " : ""}${esc(wkName(k))}</span><b>${b && b.cost ? esc(money(b.cost)) : "—"}</b><small>${esc(wkRange(k))}</small>${cmp ? `<i class="pur-cmp-${otherName}">${esc(tagTxt(otherName))} ${b && b.alt ? esc(money(b.alt)) : "—"}</i>` : ""}</button>`; }).join("")}</div>`;
      const per = plan.spend ? t(plan.spend.per === "week" ? "spend_week" : "spend_month") : "";
      const followLine = cmp
        ? `<div class="pur-o1-fl"><span class="pur-o1-flt">${esc(t("pur_o1_following"))} <b>${esc(followName)}</b> <span class="meta">· ${esc(t("pur_o1_other_plan").replace("{plan}", tagTxt(otherName)).replace("{v}", money(sel ? sel.alt || 0 : 0)))}</span></span><button type="button" class="pur-o1-sw" data-purfollow="${otherName}" title="${esc(t("pur_follow_line"))}">&#8644; ${esc(t("pur_o1_switch"))}</button></div>`
        : plan.spend ? `<div class="pur-o1-fl" data-purgospend role="button" tabindex="0"><span class="pur-o1-flt">${esc(t("pur_o1_following"))} <b>${esc(followName)}</b> <span class="meta">(${esc(money(plan.spend.amount))} ${esc(per)})</span></span><span class="pur-go">${esc(t("pur_go_spend"))}</span></div>` : "";
      const budLine = bi ? `<div class="pur-o1-bud"><span style="color:${bi.spent > bi.avail + 0.5 ? "var(--danger)" : "var(--good)"};">${bi.spent > bi.avail + 0.5 ? "&#9888;" : "&#10003;"} ${esc(bi.name)}</span> <span class="meta">${esc(money(bi.spent))} / ${esc(money(bi.avail))}</span></div>`
        : di ? `<div class="pur-o1-bud"><span style="color:${di.spent > di.avail + 0.5 ? "var(--amber)" : "var(--good)"};">${di.spent > di.avail + 0.5 ? "&#9888;" : "&#10003;"} ${esc(di.name)}</span> <span class="meta">${esc(money(di.spent))} / ${esc(money(di.avail))}${di.spent > di.avail + 0.5 ? ` \u00b7 ${esc(t("pur_o1_over").replace("{v}", money(di.spent - di.avail)))}` : ""}</span></div>` : "";
      // First 5 lines, then "Show N more" (the + Will buy button counts every ticked pack).
      // This week shows the ✓ checklist instead (drawWeek), unless the checklist is opening a pack's pop-up.
      if (PUR_SUG_WEEK === 0 && !sugAll) return `${boxes}${followLine}${budLine}`;
      const lim = sugAll || PUR_LIST_ALL.has("n") ? list : list.slice(0, 5);
      const moreN = list.length - 5;
      const listPart = list.length
        ? `<div class="pur-cl-list" data-week="${esc(String(PUR_SUG_WEEK))}">${lim.map(rowHtml).join("")}</div>${moreN > 0 ? purMoreBtnHtml('data-purlmore="n"', PUR_LIST_ALL.has("n"), moreN) : ""}`
        : `<div class="meta pur-a2-none">${esc(t("pur_wk_none"))}</div>`;
      const buyBtn = list.some(([i]) => canBuy(i)) ? `<button type="button" class="btn pur-wk-all" data-purtickbuy></button>` : "";
      const hint = list.length ? `<div class="meta pur-o1-hint"><span>${esc(t("pur_o1_n_hint"))}</span>${list.some(([i]) => canBuy(i)) ? ` <button type="button" class="linklike" data-purtickall>${esc(t(list.every(([i]) => !canBuy(i) || tickOf(i)) ? "pur_sug_pick_none" : "pur_sug_pick_all"))}</button>` : ""}</div>` : "";
      return `${boxes}${followLine}${budLine}${listPart}${buyBtn}${hint}`;
    };
    box.innerHTML = compactHtml();
    {
      const chkEl = document.getElementById("purChk");
      if (chkEl) chkEl.hidden = !(PUR_SUG_WEEK === 0 && !sugAll);
    }
    box.querySelectorAll("[data-purwk]").forEach((b) => b.addEventListener("click", () => { const k = b.dataset.purwk; PUR_SUG_WEEK = k === "after" ? k : Number(k); drawSug(); }));
    box.querySelectorAll("[data-purfollow]").forEach((b) => b.addEventListener("click", () => { try { localStorage.setItem("pur_follow", b.dataset.purfollow); } catch (e) { /* blocked */ } redraw(); }));
    // "Following: My budget" opens Budgets at the My budget box.
    box.querySelectorAll("[data-purgospend]").forEach((b) => {
      const go = () => { BUDGET_FOCUS_SPEND = true; goToTab("budgets"); };
      b.addEventListener("click", go);
      b.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
    });
    // Admin list: tick what you'll buy, then one "Will buy" adds every date of
    // the ticked packs this week.
    const tickBuy = box.querySelector("[data-purtickbuy]");
    const tickedNow = () => list.filter(([i]) => { const tb = sugTable(rows[i]); return tb && (rows[i].row != null || !plainPack(tb)) && tickOf(i); });
    const syncTick = () => {
      if (!tickBuy) return;
      const pk = tickedNow(), sum = pk.reduce((a, [i]) => { const v = verOf(i); return a + packRowLocalUnits(v.r).reduce((x, y) => x + y, 0) * v.n; }, 0);
      tickBuy.textContent = pk.length ? `+ ${t("pur_will_buy")} (${pk.length}) · ${money(sum)}` : t("pur_tick_none");
      tickBuy.disabled = !pk.length;
    };
    syncTick();
    box.querySelectorAll("[data-purtick]").forEach((cb) => cb.addEventListener("change", () => {
      PUR_SUG_TICK.set(`${PUR_SUG_WEEK}|${cb.dataset.purtick}`, cb.checked);
      cb.closest(".pur-cl-row").classList.toggle("on", cb.checked);
      syncTick();
    }));
    const tickAll = box.querySelector("[data-purtickall]");
    const moreN = box.querySelector('[data-purlmore="n"]');
    if (moreN) moreN.addEventListener("click", () => { if (PUR_LIST_ALL.has("n")) PUR_LIST_ALL.delete("n"); else PUR_LIST_ALL.add("n"); drawSug(); });
    if (tickAll) tickAll.addEventListener("click", () => {
      const on = !list.every(([i]) => tickOf(i) || !sugTable(rows[i]));
      list.forEach(([i]) => PUR_SUG_TICK.set(`${PUR_SUG_WEEK}|${i}`, on));
      drawSug();
    });
    box.querySelectorAll("[data-purver]").forEach((vb) => vb.addEventListener("click", () => {
      const [i, v] = vb.dataset.purver.split("|"), k = `${PUR_SUG_WEEK}|${i}`;
      if (v) PUR_SUG_VER.add(k); else PUR_SUG_VER.delete(k);
      drawSug();
    }));
    if (tickBuy) tickBuy.addEventListener("click", () => {
      const adds = [], took = [];
      let asPlanned = true;
      tickedNow().forEach(([i]) => {
        const { r, xs } = verOf(i), tb = sugTable(r);
        if (!tb) return;
        if (r !== rows[i] || i >= nFollow) asPlanned = false;
        xs.forEach((x) => took.push({ i, off: x.off, count: x.count }));
        xs.forEach((x, k) => adds.push({ id: "p" + Date.now().toString(36) + i + "_" + k + Math.random().toString(36).slice(2, 6), table: String(tb.id), row: r.row != null ? r.row : 0, ...(r.from != null ? { from: r.from } : {}), ...(r.extra > 0 ? { extra: r.extra } : {}), count: x.count, date: dayOf(Math.max(0, x.off)), status: "planned", plan: r !== rows[i] ? otherName : planTag(i), ...(plainPack(tb) ? {} : { choice: { name: sugName(r), label: r.label, price: r.price, gives: r.gives } }) }));
      });
      if (!adds.length) return;
      PACK_PURCHASES.list = (PACK_PURCHASES.list || []).concat(adds);
      savePackPurchases();
      if (asPlanned) takeAsPlanned(took);
      toast(t("pur_added_dates").replace("{n}", adds.length));
      redraw();
    });
    box.querySelectorAll("[data-purrow]").forEach((rw) => rw.addEventListener("click", (e) => {
      if (e.target.closest("[data-pursug], [data-purtick], [data-purver]")) return;
      const k = `${PUR_SUG_WEEK}|${rw.dataset.purrow}`;
      PUR_SUG_ROW = PUR_SUG_ROW === k ? null : k;
      drawSug();
    }));
    // "+ Will buy" opens a small window: tick the dates to buy on (all ticked).
    box.querySelectorAll("[data-pursug]").forEach((b) => b.addEventListener("click", () => {
      const i0 = Number(b.dataset.pursug);
      // A pack both plans buy differently (another step or count): pick which
      // plan's version to add.
      const m = cmp && sel && sel.match.get(i0);
      const vers = [{ key: i0 >= nFollow ? otherName : follow, r: rows[i0], s0: (sel && sel.items.get(i0)) || sched[i0] }];
      if (m && (!m.same || m.n !== (sel.items.get(i0) || []).reduce((a, x) => a + x.count, 0))) vers.push({ key: otherName, r: rows[m.j], s0: m.xs });
      let modal = document.getElementById("purSugModal");
      if (!modal) { modal = document.createElement("div"); modal.id = "purSugModal"; modal.className = "modal-overlay"; document.body.appendChild(modal); }
      const close = () => { modal.style.display = "none"; };
      // Packs bought in steps: one line
      // per step with a tick (bought in order) and, for option packs, a switch
      // of the step's versions (Classic / Exquisite / Sublime …) with all the
      // items it gives. Fewer steps or other versions than the plan: Budgets
      // plans the rest again. Pick-one packs (Benefit Card) switch the card.
      // "Any price" packs (Mix & Match) list every price with its own tick and
      // item picks. Each date can buy other steps / prices (design A).
      const stepModel = (r, tb) => {
        if (Array.isArray(r.steps) && r.steps.some((st) => st.k)) return null;
        const tbs = (r.tables || []).map((id) => byId.get(String(id))).filter(Boolean);
        const tagsOf = () => (packLinkFor(tbs[0].id).linkSet ? packLinkSetTags(tbs) : tbs.map(packOptionTag));
        // Nearest version to what the plan's step gives (gems left out).
        const pickOf = (opts, gives) => {
          let best = 0, bd = Infinity;
          opts.forEach((o, j) => {
            const ks = new Set([...Object.keys(o.gives || {}), ...Object.keys(gives || {})].filter((n) => n !== "Gems"));
            let d = 0; ks.forEach((n) => { const a = (o.gives || {})[n] || 0, b = (gives || {})[n] || 0; d += Math.abs(a - b) / Math.max(1, a, b); });
            if (d < bd) { bd = d; best = j; }
          });
          return best;
        };
        const lk = packLinkFor(tb.id);
        // "Pick N items" packs in order (Mix & Match): every step takes the
        // same items, picked once.
        if (lk.pickCols > 0 && lk.pickOrder && Array.isArray(r.steps) && tbs.length <= 1) {
          const steps = pickRows(tb, lk);
          if (steps.length < 2 || r.steps.length > steps.length) return null;
          const each = String(r.label || "").split(`${t("pk_each_step")}: `)[1] || "";
          const want = [];
          each.split(" + ").forEach((part) => { const m = /^(\d+)× (.+)$/.exec(part.trim()); if (!m) return; const j = steps[0].opts.findIndex((o) => o.tag === m[2]); if (j >= 0) for (let i = 0; i < Number(m[1]); i++) want.push(j); });
          return { kind: "pickladder", n: lk.pickCols, steps, planK: r.steps.length, planPick: steps.map(() => 0), planPP: want.length === lk.pickCols ? want : Array(lk.pickCols).fill(0) };
        }
        if (lk.pickCols > 0 && !lk.pickOrder && !r.steps && r.row != null) {
          // Every price of the table, each with `pickCols` item picks.
          const steps = pickRows(tb, lk);
          const k0 = steps.findIndex((st) => st.row === r.row);
          if (k0 < 0) return null;
          // The plan's items, from its label ("$4.99 · 2× Fire Crystal").
          const want = [];
          String(r.label || "").split(" · ").slice(1).join(" · ").split(" + ").forEach((part) => {
            const m = /^(\d+)× (.+)$/.exec(part.trim()); if (!m) return;
            const j = steps[k0].opts.findIndex((o) => o.tag === m[2]);
            if (j >= 0) for (let i = 0; i < Number(m[1]); i++) want.push(j);
          });
          const n = lk.pickCols, base = want.length === n ? want : Array(n).fill(0);
          const picks = steps.map((st) => base.map((j) => Math.min(j, st.opts.length - 1)));
          return { kind: "pick", n, steps, planSet: steps.map((st, k) => k === k0), planPicks: picks, planRowK: k0 };
        }
        // Ladders with the last step repeated ("+ 3× …") keep the plain pop-up.
        if (/\+ \d+× /.test(String(r.label || "").split(`${t("pk_each_step")}: `)[0]) && !(lk.pickCols > 0)) return null;
        if (Array.isArray(r.steps) && r.steps.length && tbs.length > 1) {
          const perTable = tbs.map((x) => packOffersFor(x, true)), tags = tagsOf();
          const tiers = Math.min(...perTable.map((o) => o.length));
          if (!tiers || r.steps.length > tiers) return null;
          const steps = [];
          for (let k = 0; k < tiers; k++) steps.push({ price: perTable[0][k].price, opts: perTable.map((offs, j) => ({ tag: tags[j], gives: offs[k].gives || {} })) });
          return { kind: "opt", steps, planK: r.steps.length, planPick: steps.map((st, k) => (k < r.steps.length ? pickOf(st.opts, r.steps[k].gives) : 0)) };
        }
        if (!r.steps && tbs.length > 1 && r.row != null) {
          const tags = tagsOf(), opts = tbs.map((x, j) => { const o = packOffersFor(x, true)[r.row]; return o ? { tag: tags[j], gives: o.gives || {} } : null; });
          if (opts.some((o) => !o)) return null;
          return { kind: "card", steps: [{ price: r.price, opts }], planK: 1, planPick: [pickOf(opts, r.gives)] };
        }
        if (!r.steps && lk.sequential && r.row != null) {
          const offs = packOffersFor(tb, true).filter((o) => o.row >= (r.from || 0));
          if (offs.length > 1) return { kind: "plain", steps: offs.map((o) => ({ price: o.price, row: o.row, opts: [{ tag: "", gives: o.gives || {} }] })), planK: Math.max(1, offs.filter((o) => o.row <= r.row).length), planPick: offs.map(() => 0) };
        }
        return null;
      };
      const nSteps = (n) => (n === 1 ? t("pur_ms_1step") : t("pur_ms_nsteps").replace("{n}", n));
      const givesHtml = (g) => Object.entries(g || {}).filter(([n, v]) => n !== "Gems" && v > 0 && shortAmount(v) !== "0").map(([n, v]) => { const ic = itemIc(n); return `<span title="${esc(materialDisplayName(n))}">${ic ? `<img src="${esc(ic)}" alt="" loading="lazy" />` : `<i>${esc(materialDisplayName(n))}</i>`}${esc(shortAmount(v))}</span>`; }).join("");
      const openVer = (vi, keep) => {
      const { r, s0 } = vers[vi], tb = sugTable(r);
      if (!tb) return;
      const M = stepModel(r, tb), isPick = !!M && M.kind === "pick";
      const ordered = !!M && (M.kind === "opt" || M.kind === "plain" || M.kind === "pickladder");
      const isPL = !!M && M.kind === "pickladder";
      // Top list = "Set all dates": kk steps (in order) or a set of prices (any price).
      const kk = M && !isPick ? (keep ? keep.kk : M.planK) : 0;
      const tset = isPick ? (keep ? keep.tset : M.planSet.slice()) : null;
      const pick = M && !isPick ? (keep ? keep.pick : M.planPick.slice()) : [];
      const pp = isPick ? (keep ? keep.pp : M.planPicks.map((x) => x.slice())) : null;
      const pp0 = isPL ? (keep ? keep.pp0 : M.planPP.slice()) : null;
      const plGives = (k) => { const g = {}; pp0.forEach((j) => Object.entries(M.steps[k].opts[j].gives).forEach(([n, v]) => { g[n] = (g[n] || 0) + v; })); return g; };
      const plText = () => { const cnt = {}; pp0.forEach((j) => { const nm = M.steps[0].opts[j].tag; cnt[nm] = (cnt[nm] || 0) + 1; }); return Object.entries(cnt).sort((a, b) => b[1] - a[1]).map(([nm, c]) => `${c}× ${nm}`).join(" + "); };
      // Dates set apart from the top: { date index: steps (number) | prices (bool[]) }.
      const dsel = keep && keep.dsel ? keep.dsel : {};
      const openDay = keep ? keep.openDay : -1;
      const local = (usd) => packConvert(usd, r.currency).n;
      const pickText = (k) => { const cnt = {}; pp[k].forEach((j) => { const nm = M.steps[k].opts[j].tag; cnt[nm] = (cnt[nm] || 0) + 1; }); return Object.entries(cnt).sort((a, b) => b[1] - a[1]).map(([nm, c]) => `${c}× ${nm}`).join(" + "); };
      // What one date buys: [{ row, label, price (pack currency), local, gives }].
      const partsOf = (sel) => {
        if (!M) return [{ row: r.row != null ? r.row : 0, label: r.label, price: r.price, local: packRowLocalUnits(r).reduce((a, x) => a + x, 0), gives: r.gives, plain: true, ...(r.extra > 0 ? { extra: r.extra } : {}) }];
        if (isPick) return sel.map((on, k) => (on ? k : -1)).filter((k) => k >= 0).map((k) => {
          const st = M.steps[k], g = {};
          pp[k].forEach((j) => Object.entries(st.opts[j].gives).forEach(([n, v]) => { g[n] = (g[n] || 0) + v; }));
          const asPlan = k === M.planRowK && pp[k].join() === M.planPicks[k].join();
          return { row: st.row, label: asPlan ? r.label : `${packFmtMoney(st.price, r.currency)} · ${pickText(k)}`, price: st.price, local: local(st.price), gives: asPlan ? r.gives : g, ...(M.planSet[k] ? {} : { isExtra: true }) };
        });
        const m = sel;
        if (!m) return [];
        // Steps past the plan's (its own steps unchanged): the plan's part as
        // planned, then the next steps as their own purchase ("extra").
        if (ordered && m > M.planK && (isPL ? pp0.join() === M.planPP.join() : pick.slice(0, M.planK).every((j, k) => j === M.planPick[k]))) {
          const ex = M.steps.slice(M.planK, m).map((st, k0) => { const k = M.planK + k0; return { price: st.price, row: st.row, tag: isPL ? "" : st.opts[pick[k]].tag, gives: isPL ? plGives(k) : st.opts[pick[k]].gives }; });
          const g = {}; ex.forEach((st) => Object.entries(st.gives).forEach(([n, v]) => { g[n] = (g[n] || 0) + v; }));
          const label = M.kind === "plain" ? ex.map((st) => packFmtMoney(st.price, r.currency)).join(" · ") : isPL ? `${ex.map((st) => packFmtMoney(st.price, r.currency)).join(" · ")} · ${t("pk_each_step")}: ${plText()}` : ex.map((st) => `${packFmtMoney(st.price, r.currency)} ${st.tag}`).join(" · ");
          const part = { row: M.kind === "plain" ? ex[ex.length - 1].row : m - 1, from: M.kind === "plain" ? ex[0].row : M.planK, label, price: Math.round(ex.reduce((a, st) => a + st.price, 0) * 100) / 100, local: ex.reduce((a, st) => a + local(st.price), 0), gives: g, plain: M.kind === "plain", isExtra: true };
          return partsOf(M.planK).concat([part]);
        }
        const same = m === M.planK && (isPL ? pp0.join() === M.planPP.join() : pick.slice(0, m).every((j, k) => j === M.planPick[k]));
        const ch = M.steps.slice(0, m).map((st, k) => ({ price: st.price, row: st.row, tag: isPL ? "" : st.opts[pick[k]].tag, gives: isPL ? plGives(k) : st.opts[pick[k]].gives }));
        const g = {}; ch.forEach((st) => Object.entries(st.gives).forEach(([n, v]) => { g[n] = (g[n] || 0) + v; }));
        const label = same ? r.label : isPL ? `${m === 1 ? "" : t("pack_up_to") + " "}${packFmtMoney(M.steps[m - 1].price, r.currency)}${M.steps.length > 1 ? ` (${t("pack_steps_of").replace("{k}", m).replace("{n}", M.steps.length)})` : ""} · ${t("pk_each_step")}: ${plText()}` : M.kind === "plain" ? ch.map((st) => packFmtMoney(st.price, r.currency)).join(" · ") : M.kind === "card" ? ch.map((st) => `${packFmtMoney(st.price, r.currency)} · ${st.tag}`).join("") : ch.map((st) => `${packFmtMoney(st.price, r.currency)} ${st.tag}`).join(" · ");
        const row = same ? (r.row != null ? r.row : 0) : M.kind === "plain" ? ch[m - 1].row : M.kind === "card" ? r.row : m - 1;
        return [{ row, label, price: same ? r.price : Math.round(ch.reduce((a, st) => a + st.price, 0) * 100) / 100, local: ch.reduce((a, st) => a + local(st.price), 0), gives: same ? r.gives : g, plain: M.kind === "plain" }];
      };
      const topSel = isPick ? tset : kk;
      const selOf = (d) => (dsel[d] !== undefined ? dsel[d] : topSel);
      const localOf = (sel) => partsOf(sel).reduce((a, p) => a + p.local, 0);
      const fmtL = (v) => packFmtLocal(v, r.currency, false, r.price);
      const fmtN = (cnt, sel = topSel) => (M ? fmtL(localOf(sel) * cnt) : packFmtMoney(r.price * cnt, r.currency));
      const differ = Object.keys(dsel).length > 0;
      // Item picks as picture slots: tap a slot,
      // a strip of every item's picture opens under it to choose from.
      const openSlot = keep ? keep.openSlot || "" : "";
      const picOf = (o) => { const ic = itemIc(o.name || "") || itemIc(Object.keys(o.gives || {})[0] || ""); return ic ? `<img src="${esc(ic)}" alt="" loading="lazy" />` : `<i>${esc(o.tag.slice(0, 2))}</i>`; };
      const slotsHtml = (key, opts, sel) => `<span class="pur-slots">${sel.map((sj, p) => { const o = opts[sj]; return `<button type="button" class="pur-slot${openSlot === key + "|" + p ? " open" : ""}" data-pmslot="${key}|${p}" title="${esc(o.tag)}">${picOf(o)}<small>${esc(shortAmount(o.q))}</small></button>`; }).join("")}</span>`;
      const stripHtml = (key, opts, sel) => { const m = /^(.*)\|(\d+)$/.exec(openSlot); if (!m || m[1] !== key) return ""; const p = Number(m[2]); return `<div class="pur-slot-strip">${opts.map((o, oj) => (o.q > 0 ? `<button type="button" class="pur-slot${oj === sel[p] ? " on" : ""}" data-pmslotopt="${key}|${p}|${oj}" title="${esc(o.tag)}">${picOf(o)}<small>${esc(shortAmount(o.q))}</small></button>` : "")).join("")}</div>`; };
      const plHtml = isPL ? `<div class="pur-ms-plpick"><div class="pur-ms-l"><span class="meta">${esc(t("pur_ms_each_items").replace("{n}", M.n))}</span>${slotsHtml("all", M.steps[0].opts, pp0)}</div>${stripHtml("all", M.steps[0].opts, pp0)}</div>` : "";
      // The plan's part (blue edge, "plan") and what is added to it (gold
      // edge, "extra · Budgets plans with it"): next steps of a ladder, other
      // prices of an "any price" pack.
      const isPlanK = (k) => (isPick ? !!M.planSet[k] : k < M.planK);
      const opTag = (k, on) => (isPlanK(k) ? (on ? `<span class="pur-op-tag plan">${esc(t("pur_op_tag_plan"))}</span>` : "") : on ? `<span class="pur-op-tag extra">${esc(t("pur_op_tag_extra"))}</span>` : ordered ? `<span class="pur-op-tag step">${esc(t("pur_op_tag_step"))}</span>` : "");
      const opHead = (k) => {
        if (!M || isPick) return "";
        if (k === 0) return `<div class="pur-op-h ice"><span>${esc(M.kind === "card" ? t("pur_op_plan_card") : t("pur_op_plan_steps").replace("{n}", M.planK === 1 ? "1" : `1–${M.planK}`))}</span></div>`;
        return ordered && k === M.planK ? `<div class="pur-op-h gold"><span>${esc(t("pur_op_next"))}</span></div><div class="meta pur-op-d">${esc(t("pur_op_next_d"))}</div>` : "";
      };
      const stepsHtml = M ? `${plHtml}${s0.length > 1 && M.kind !== "card" ? `<div class="pur-ms-head"><span class="meta">${esc(t("pur_ms_setall"))}</span>${differ ? `<span class="pur-ms-differ">${esc(t("pur_ms_differ"))}</span>` : ""}</div>` : ""}<div class="pur-ms">${M.steps.map((st, k) => {
        const on = isPick ? tset[k] : k < kk, j = isPick || isPL ? 0 : pick[k], swt = !isPick && !isPL && st.opts.length > 1;
        const tag = opTag(k, on);
        const items = isPL ? `<div class="pur-ms-g">${givesHtml(plGives(k))}${tag}</div>` : isPick
          ? (on ? stripHtml(String(k), st.opts, pp[k]) : "")
          : `<div class="pur-ms-g">${givesHtml(st.opts[j].gives)}${swt ? tag : ""}</div>`;
        return `${opHead(k)}<div class="pur-ms-row${on ? " on" : ""}${M.kind === "card" ? " card" : ""}${isPlanK(k) ? " op-plan" : on ? " op-extra" : ""}"><div class="pur-ms-l">
          <button type="button" class="pur-ms-tick" data-pmtick="${k}" aria-pressed="${on}">${on ? "&#10003;" : ""}</button>
          ${M.kind === "card" || isPick ? "" : `<b class="pur-ms-n">${k + 1}</b>`}<b class="pur-ms-pr">${esc(fmtL(local(st.price)))}</b>
          ${swt ? `<span class="pur-ms-sw">${st.opts.map((o, oj) => `<button type="button" data-pmopt="${k}|${oj}" class="${oj === j ? "on" : ""}">${esc(o.tag)}</button>`).join("")}</span>` : ""}
          ${isPick && !on ? `<span class="meta pur-ms-pickn">${esc(t("pur_ms_pickn").replace("{n}", M.n))}</span>` : ""}${isPick && on ? slotsHtml(String(k), st.opts, pp[k]) : ""}${swt || isPL ? "" : tag}</div>
          ${items}</div>`;
      }).join("")}</div>${M.kind !== "card" ? `<div class="meta" style="font-size:10.5px; margin:-4px 0 8px;">${esc(t(isPick ? "pur_ms_any" : "pur_ms_order"))}</div>` : ""}` : "";
      const notes = [];
      const range = (a, b) => (a === b ? String(a) : `${a}–${b}`);
      if (M && !isPick && kk < M.planK) notes.push(t("pur_ms_left").replace("{a}–{b}", range(kk + 1, M.planK)));
      if (M && !isPick && kk > M.planK) notes.push(t("pur_ms_added").replace("{a}–{b}", range(M.planK + 1, kk)));
      if (M && !isPick) pick.slice(0, Math.min(kk, M.planK)).forEach((j, k) => { if (j !== M.planPick[k]) notes.push(t(M.kind === "card" ? "pur_ms_card" : "pur_ms_step").replace("{k}", k + 1).replace("{tag}", M.steps[k].opts[j].tag)); });
      if (isPL && pp0.join() !== M.planPP.join()) notes.push(t("pur_ms_pick_changed"));
      if (isPick && (tset.join() !== M.planSet.join() || tset.some((on, k) => on && pp[k].join() !== M.planPicks[k].join()))) notes.push(t("pur_ms_pick_changed"));
      if (differ) notes.push(t(isPick ? "pur_ms_dates_differ_p" : "pur_ms_dates_differ"));
      const noteHtml = notes.length ? `<div class="pur-ms-note">${esc(notes.join(" · "))}. ${esc(t("pur_ms_replan"))}</div>` : "";
      // My budget / By your target: two boxes, price and steps only.
      const verHtml = vers.length > 1 ? `<div class="pur-ms-vers">${vers.map((v, k) => { const vm = stepModel(v.r, sugTable(v.r) || tb), vLocal = vm && vm.kind === "plain" ? vm.steps.slice(0, vm.planK).reduce((a, st) => a + packConvert(st.price, v.r.currency).n, 0) : packRowLocalUnits(v.r).reduce((a, x) => a + x, 0); return `<button type="button" data-pmver="${k}" class="${k === vi ? "on" : ""}"><span class="pur-vb-k">${esc(t(v.key === "target" ? (datedT ? "budgets_view_dates" : "budgets_view_target") : "budgets_view_budget"))}</span><b>${esc(packFmtLocal(vLocal, v.r.currency, false, v.r.price))}</b><span class="pur-vb-s">${vm && vm.kind !== "card" && vm.kind !== "pick" ? esc(nSteps(vm.planK)) : ""}${v.s0.length ? `${vm && vm.kind !== "card" && vm.kind !== "pick" ? " · " : ""}×${v.s0.reduce((a, x) => a + x.count, 0)}` : ""}</span></button>`; }).join("")}</div>` : "";
      // The button on each date: "up to N" (in order) or the prices it buys.
      const priceShort2 = (loc) => fmtL(loc).replace(/[^\d.,]/g, "");
      const priceShort = (usd) => priceShort2(local(usd));
      const dayCtl = (d) => {
        if (!M || M.kind === "card" || s0.length < 2) return "";
        const sel = selOf(d);
        if (ordered) return `<select class="pur-dsel${dsel[d] !== undefined ? " on" : ""}" data-pmdk="${d}" aria-label="${esc(t("pur_ms_upto_n").replace("{n}", ""))}">${M.steps.map((st, k) => `<option value="${k + 1}" ${k + 1 === sel ? "selected" : ""}>${esc(t("pur_ms_upto_n").replace("{n}", k + 1))} · ${esc(priceShort2(M.steps.slice(0, k + 1).reduce((a, x) => a + local(x.price), 0)))}</option>`).join("")}</select>`;
        const ks = sel.map((on, k) => (on ? k : -1)).filter((k) => k >= 0);
        return `<button type="button" class="pur-dsel${dsel[d] !== undefined ? " on" : ""}" data-pmdopen="${d}">${esc(ks.length ? ks.map((k) => priceShort(M.steps[k].price)).join(" + ") : "—")} &#9662;</button>`;
      };
      const dayMenu = (d) => (isPick && openDay === d ? `<div class="pur-dmenu">${M.steps.map((st, k) => `<label><input type="checkbox" data-pmdt="${d}|${k}" ${selOf(d)[k] ? "checked" : ""} /> ${esc(fmtL(local(st.price)))}<span class="meta">${tset[k] ? esc(pickText(k)) : ""}</span></label>`).join("")}<div class="meta" style="font-size:10.5px;">${esc(t("pur_ms_items_above"))}</div></div>` : "");
      const daysOn = keep && keep.days ? keep.days : null;
      // How many on each date: 1 … what the game allows that date (purGameMax).
      const cnt = keep && keep.cnt ? keep.cnt : {};
      const cntOf = (d) => (cnt[d] != null ? cnt[d] : s0[d].count);
      const maxes = s0.map((x, d) => purGameMax(r, tb, s0, d));
      const cntNote = (d) => t(cntOf(d) > s0[d].count ? "pur_cnt_plan_more" : "pur_cnt_plan").replace("{n}", s0[d].count);
      // Stacking cards: "How many" always (also when the plan buys 1), up to the stack limit.
      const stackSt = packStackInfo(packLinkForBase(tb.id).reset);
      const cntPill = (d) => (cntOf(d) > s0[d].count ? esc(t("pur_cnt_extra").replace("{n}", cntOf(d) - s0[d].count)) : "");
      const cntHtml = (d) => (s0[d].count > 1 || stackSt ? `<div class="pur-cnt" data-pmcnt="${d}"><span class="pur-cnt-l">${esc(t("pur_cnt_will"))}</span>${purStepHtml("pmstep", cntOf(d), maxes[d])}<button type="button" class="pur-cnt-max" data-pmcmax${cntOf(d) >= maxes[d] ? " disabled" : ""}>${esc(t("pur_cnt_max").replace("{n}", maxes[d]))}</button><small class="pur-cnt-note"><span class="pur-op-tag extra" data-pmxpill${cntPill(d) ? "" : " hidden"}>${cntPill(d)}</span> <span data-pmcntnote>${esc(cntNote(d))}</span></small></div>` : "");
      // "Other prices in this pack": the pack's other rows (plain packs) or
      // other cards (pick-one sets like the Benefit Card), each up to its own
      // limit for that run minus what is bought / planned (the planner's
      // groups after My Purchases, packGroupsFor). Each pick is bought on
      // every ticked date and saved as its own purchase ("extra").
      const ex = keep && keep.ex ? { ...keep.ex } : {};
      const opKind = !M ? (!stackSt && plainPack(tb) && !packLinkFor(tb.id).sequential && r.row != null && !Array.isArray(r.steps) ? "rows" : "") : M.kind === "card" ? "cards" : "";
      const OP = [];
      if (opKind) {
        const pgs = packGroupsFor(tables, "__purchases").filter((g) => !g.ladder && (g.tables || []).includes(String(tb.id)));
        const gOf = (row) => pgs.find((g) => g.offers.some((o) => o.row === row)) || null;
        if (opKind === "rows") packOffersFor(tb, true).forEach((o) => { if (o.row !== r.row && Object.keys(o.gives || {}).length && gOf(o.row)) OP.push({ key: "r" + o.row, row: o.row, price: o.price, gives: o.gives, g: gOf(o.row), planRow: r.row }); });
        else {
          const tbs = (r.tables || []).map((id) => byId.get(String(id))).filter(Boolean);
          const tags = tbs.length && packLinkFor(tbs[0].id).linkSet ? packLinkSetTags(tbs) : tbs.map(packOptionTag);
          tbs.forEach((x, j) => packOffersFor(x, true).forEach((o) => {
            if (!Object.keys(o.gives || {}).length || !gOf(o.row)) return;
            OP.push({ key: `c${j}|${o.row}`, card: j, tag: tags[j], row: o.row, price: o.price, gives: o.gives, g: gOf(o.row), planRow: r.row });
          }));
        }
      }
      const runAt = (g, off) => { if (typeof g.reset === "number" && g.reset > 0 && g.reset < PACK_ONE_TIME_DAYS) return packResetOffsets(g.reset, g.resetDay, PACK_HORIZON_DAYS, g.window).filter((x) => x <= off).pop(); return "all"; };
      const roomAt = (g, off) => { if (g.reset === "unlimited") return 99; const at = runAt(g, off); if (at === undefined) return 0; const used = at === "all" ? g.used || 0 : (g.usedAt || {})[at] || 0; return (g.perCycle || 1) - used; };
      const planCard = M && M.kind === "card" ? (kk > 0 ? pick[0] : -1) : null;
      const isPlanItem = (it) => (opKind === "cards" ? it.card === planCard && it.row === it.planRow : false);
      // What is still free for an item: the lowest over the pack's dates (dates in one run share it).
      const opMax = (it) => {
        let best = 99;
        s0.forEach((x, d) => {
          const at = runAt(it.g, x.off), same = s0.filter((y) => runAt(it.g, y.off) === at);
          const planUse = it.g.offers.some((o) => o.row === it.planRow) && (opKind === "rows" || planCard != null && planCard >= 0) ? same.reduce((a, y) => a + (cnt[s0.indexOf(y)] != null ? cnt[s0.indexOf(y)] : y.count), 0) : 0;
          const others = OP.filter((o2) => o2 !== it && o2.g === it.g).reduce((a, o2) => a + (ex[o2.key] || 0), 0) * same.length;
          best = Math.min(best, Math.floor((roomAt(it.g, x.off) - planUse - others) / Math.max(1, same.length)));
        });
        return Math.max(0, Math.min(99, best));
      };
      const exParts = () => OP.filter((it) => (ex[it.key] || 0) > 0 && !isPlanItem(it)).map((it) => ({ row: it.row, label: opKind === "cards" ? `${packFmtMoney(it.price, r.currency)} · ${it.tag}` : packFmtMoney(it.price, r.currency), price: it.price, local: local(it.price), gives: it.gives, count: ex[it.key], isExtra: true }));
      const exLocal = () => exParts().reduce((a, p) => a + p.local * p.count, 0);
      const opHtml = () => {
        if (!OP.length) return "";
        if (opKind === "rows") return `<div class="pur-op-h gold"><span>${esc(t("pur_op_other"))}</span></div><div class="meta pur-op-d">${esc(t("pur_op_other_d"))}</div><div class="pur-op-list">${OP.map((it) => {
          const n = ex[it.key] || 0, mx = Math.max(n, opMax(it));
          return `<div class="pur-op${n ? " on" : ""}" data-pmexi="${esc(it.key)}"><div class="pur-ms-l"><b class="pur-ms-pr">${esc(fmtL(local(it.price)))}</b>${mx > 0 ? `${purStepHtml("pmex", n, mx, 0)}<span class="meta pur-op-up">${esc(t("pur_op_upto").replace("{n}", mx))}</span>` : `<span class="meta pur-op-up">${esc(t("pur_op_none_left"))}</span>`}${n ? `<span class="pur-op-tag extra">${esc(t("pur_op_tag_extra"))}</span>` : ""}</div><div class="pur-ms-g">${givesHtml(it.gives)}</div></div>`;
        }).join("")}</div>`;
        const cards = [...new Set(OP.map((it) => it.card))];
        return `<div class="pur-op-h gold"><span>${esc(t("pur_op_cards"))}</span></div><div class="meta pur-op-d">${esc(t("pur_op_cards_d"))}</div><div class="pur-op-list">${cards.map((j) => {
          const its = OP.filter((it) => it.card === j), onIt = its.find((it) => ex[it.key] > 0 && !isPlanItem(it));
          const shown = onIt || its.find((it) => !isPlanItem(it)) || its[0];
          return `<div class="pur-op card${onIt ? " on" : ""}"><div class="pur-ms-l"><b class="pur-op-cn">${esc(its[0].tag)}</b><span class="pur-op-chips">${its.map((it) => { const pl = isPlanItem(it), on = !pl && ex[it.key] > 0, dis = pl || (!on && opMax(it) < 1); return `<button type="button" data-pmexc="${esc(it.key)}" class="${on ? "on" : ""}${pl ? " pl" : ""}" aria-pressed="${on}"${dis ? " disabled" : ""}>${esc(fmtL(local(it.price)))}</button>`; }).join("")}</span>${onIt ? `<span class="pur-op-tag extra">${esc(t("pur_op_tag_extra1"))}</span>` : ""}</div><div class="pur-ms-g">${givesHtml(shown.gives)}</div></div>`;
        }).join("")}</div>`;
      };
      const planBox = M ? "" : `<div class="pur-op-h ice"><span>${esc(t("pur_op_plan_pick"))}</span></div><div class="pur-op plan"><div class="pur-ms-l"><b class="pur-ms-pr">${esc(fmtN(1))}</b>${r.label !== fmtN(1) ? `<span class="meta pur-op-lb">${esc(r.label)}</span>` : ""}<span class="pur-op-tag plan">${esc(t("pur_op_tag_plan"))}</span></div><div class="pur-ms-g">${givesHtml(r.gives)}</div></div>`;
      // A date's price with what is added to it.
      const baseLocal = () => packConvert(r.price, r.currency).n;
      const dayPrice = (d) => { const xl = exLocal(); if (!xl) return fmtN(cntOf(d), selOf(d)); return fmtL((M ? localOf(selOf(d)) : baseLocal()) * cntOf(d) + xl); };
      modal.innerHTML = `<div class="modal-box pur-modal">
        <div class="pur-m-head"><h2>${esc(M ? purShortName(sugName(r)) : sugName(r))}</h2>${closeXHtml("data-pmclose")}</div>${verHtml}${stepsHtml}${noteHtml}${planBox}${opHtml()}
        ${s0.length > 1 ? `<div class="pur-m-top"><span class="meta">${esc(t("pur_pick_dates"))}</span><button type="button" class="linklike" data-pmall>${esc(t("pur_sug_pick_none"))}</button></div>` : ""}
        <div class="pur-m-list">${s0.map((x, k) => `<label class="pur-m-row${dayCtl(k) ? " has-dsel" : ""}"><input type="checkbox" data-pmday="${k}" ${!daysOn || daysOn.has(k) ? "checked" : ""} /><span>${esc(whenTxt(x.off))}</span>${dayCtl(k)}${dayCtl(k) && x.count === 1 ? "<span></span>" : `<span class="meta" data-pmx>${bidiNum("× " + cntOf(k))}</span>`}<b data-pmpr>${esc(dayPrice(k))}</b></label>${cntHtml(k)}${dayMenu(k)}`).join("")}</div>
        <div class="pur-m-foot"><span data-pmsum></span><div class="pur-op-sum" data-pmexsum hidden></div><span style="display:flex; gap:8px;"><button type="button" class="btn ghost small" data-pmclose>${esc(t("close_button"))}</button><button type="button" class="btn small" data-pmadd>+ ${esc(t("pur_will_buy"))}</button></span></div>
      </div>`;
      modal.style.display = "flex";
      modal.onclick = (ev) => { if (ev.target === modal || ev.target.closest("[data-pmclose]")) close(); };
      const boxes = [...modal.querySelectorAll("[data-pmday]")];
      const pickedIdx = () => boxes.filter((c) => c.checked).map((c) => Number(c.dataset.pmday));
      const sync = () => {
        const ix = pickedIdx(), xl = exLocal(), tot = ix.reduce((a, d) => a + (M ? localOf(selOf(d)) : xl ? baseLocal() : r.price) * cntOf(d) + xl, 0);
        const empty = ix.some((d) => (M ? !partsOf(selOf(d)).length : false));
        // Plan + extra: what the plan picked and what was added to it.
        const exTot = ix.reduce((a, d) => a + (M ? partsOf(selOf(d)).filter((p) => p.isExtra).reduce((b, p) => b + p.local, 0) * cntOf(d) : 0) + xl, 0);
        const exN = (M && isPick ? tset.filter((on, k) => on && !M.planSet[k]).length : M && ordered && kk > M.planK && partsOf(kk).length > 1 ? kk - M.planK : 0) + exParts().reduce((a, p) => a + p.count, 0) + ix.reduce((a, d) => a + Math.max(0, cntOf(d) - s0[d].count), 0);
        modal.querySelector("[data-pmsum]").innerHTML = `<b>${esc(M || xl ? fmtL(tot) : packFmtMoney(tot, r.currency))}</b> <span class="meta">${exTot > 0 ? esc(t("pur_op_sum").replace("{a}", fmtL(tot - exTot)).replace("{b}", fmtL(exTot))) : `${ordered && !differ ? esc(nSteps(kk)) + " · " : ""}${esc(t("pur_sug_n_of").replace("{n}", ix.length).replace("{m}", s0.length))}`}</span>`;
        const es = modal.querySelector("[data-pmexsum]");
        es.hidden = !exN; es.textContent = exN ? t("pur_op_note").replace("{n}", exN) : "";
        modal.querySelector("[data-pmadd]").disabled = !ix.length || empty;
        const all = modal.querySelector("[data-pmall]"); if (all) all.textContent = ix.length === s0.length ? t("pur_sug_pick_none") : t("pur_sug_pick_all");
      };
      boxes.forEach((c) => c.addEventListener("change", sync));
      // − / + / Max on a date: the number, its price and the total change in place.
      modal.querySelectorAll("[data-pmcnt]").forEach((row) => {
        const d = Number(row.dataset.pmcnt), max = maxes[d], lab = boxes[d] && boxes[d].closest("label");
        const set = (n) => {
          cnt[d] = Math.max(1, Math.min(max, n));
          row.querySelector("[data-pmstep-n]").textContent = cnt[d];
          row.querySelector('[data-pmstep="-1"]').disabled = cnt[d] <= 1;
          row.querySelector('[data-pmstep="1"]').disabled = cnt[d] >= max;
          row.querySelector("[data-pmcmax]").disabled = cnt[d] >= max;
          row.querySelector("[data-pmcntnote]").textContent = cntNote(d);
          const pill = row.querySelector("[data-pmxpill]"); if (pill) { pill.textContent = cntPill(d); pill.hidden = !cntPill(d); }
          if (lab) { const x = lab.querySelector("[data-pmx]"); if (x) x.textContent = bidiNum("× " + cnt[d]); lab.querySelector("[data-pmpr]").textContent = dayPrice(d); }
          if (boxes[d] && !boxes[d].checked) boxes[d].checked = true;
          sync();
        };
        row.querySelectorAll("[data-pmstep]").forEach((b) => b.addEventListener("click", () => set(cntOf(d) + Number(b.dataset.pmstep))));
        row.querySelector("[data-pmcmax]").addEventListener("click", () => set(max));
      });
      const allBtn = modal.querySelector("[data-pmall]");
      if (allBtn) allBtn.addEventListener("click", () => { const on = pickedIdx().length !== s0.length; boxes.forEach((c) => { c.checked = on; }); sync(); });
      sync();
      modal.querySelector("[data-pmadd]").addEventListener("click", () => {
        const ix = pickedIdx();
        if (!ix.length) return;
        // One purchase per date (and per price for "any price" packs). Changed
        // steps: an option pack saves its steps as the choice; a plain ladder
        // saves the last step bought (from where its run starts).
        const adds = [];
        // What was added to the plan's part (next steps, other prices / cards)
        // is its own purchase, tagged "extra".
        ix.forEach((d) => partsOf(selOf(d)).concat(exParts()).forEach((p) => adds.push({ id: "p" + Date.now().toString(36) + d + "_" + adds.length + Math.random().toString(36).slice(2, 6), table: String(tb.id), row: p.row, ...(p.from != null ? { from: p.from } : r.from != null && !p.isExtra ? { from: r.from } : {}), ...(p.extra > 0 ? { extra: p.extra } : {}), count: p.count != null ? p.count : cntOf(d), date: dayOf(Math.max(0, s0[d].off)), status: "planned", plan: p.isExtra ? "extra" : vers.length > 1 ? vers[vi].key : planTag(i0), ...(plainPack(tb) ? {} : { choice: { name: sugName(r), label: p.label, price: p.price, gives: p.gives } }) })));
        if (!adds.length) return;
        PACK_PURCHASES.list = (PACK_PURCHASES.list || []).concat(adds);
        savePackPurchases();
        // The plan's own pack, step and choice on some of its dates: the rest stays as planned.
        const ri = rows.indexOf(r), base = r.row != null ? r.row : 0;
        if (ri >= 0 && ri < nFollow && !exParts().length && ix.every((d) => { const ps = partsOf(selOf(d)); return cntOf(d) === s0[d].count && ps.length === 1 && ps[0].label === r.label && ps[0].row === base; })) takeAsPlanned(ix.map((d) => ({ i: ri, off: s0[d].off, count: s0[d].count })));
        close();
        toast(ix.length > 1 ? t("pur_added_dates").replace("{n}", ix.length) : t("pur_added"));
        redraw();
      });
      const state = (patch) => ({ kk, tset, pick, pp, pp0, dsel, openDay, openSlot, cnt, ex, days: new Set(pickedIdx()), ...patch });
      // Other prices: ▲ / ▼ per row, a tap per card price.
      modal.querySelectorAll("[data-pmexi]").forEach((row) => row.querySelectorAll("[data-pmex]").forEach((b) => b.addEventListener("click", () => {
        const k = row.dataset.pmexi, it = OP.find((o) => o.key === k);
        if (!it) return;
        const n = Math.max(0, Math.min(Math.max(ex[k] || 0, opMax(it)), (ex[k] || 0) + Number(b.dataset.pmex)));
        openVer(vi, state({ ex: { ...ex, [k]: n } }));
      })));
      modal.querySelectorAll("[data-pmexc]").forEach((b) => b.addEventListener("click", () => {
        const k = b.dataset.pmexc;
        openVer(vi, state({ ex: { ...ex, [k]: ex[k] > 0 ? 0 : 1 } }));
      }));
      modal.querySelectorAll("[data-pmver]").forEach((v) => v.addEventListener("click", () => openVer(Number(v.dataset.pmver))));
      // Set all dates. Bought in order: ticking a step ticks the ones before
      // it; unticking one unticks the ones after it. Any price: each on its own.
      modal.querySelectorAll("[data-pmtick]").forEach((v) => v.addEventListener("click", () => {
        const k = Number(v.dataset.pmtick);
        if (isPick) { const t2 = tset.slice(); t2[k] = !t2[k]; openVer(vi, state({ tset: t2, dsel: {} })); return; }
        openVer(vi, state({ kk: k < kk ? (M.kind === "card" ? 0 : k) : k + 1, dsel: {} }));
      }));
      modal.querySelectorAll("[data-pmopt]").forEach((v) => v.addEventListener("click", () => { const [k, j] = v.dataset.pmopt.split("|").map(Number); const p2 = pick.slice(); p2[k] = j; openVer(vi, state({ kk: Math.max(kk, k + 1), pick: p2, dsel: k + 1 > kk ? {} : dsel })); }));
      modal.querySelectorAll("[data-pmslot]").forEach((v) => v.addEventListener("click", () => openVer(vi, state({ openSlot: openSlot === v.dataset.pmslot ? "" : v.dataset.pmslot }))));
      modal.querySelectorAll("[data-pmslotopt]").forEach((v) => v.addEventListener("click", () => {
        const [key, p, oj] = v.dataset.pmslotopt.split("|");
        if (key === "all") { const p2 = pp0.slice(); p2[Number(p)] = Number(oj); openVer(vi, state({ pp0: p2, openSlot: "" })); return; }
        const p2 = pp.map((x) => x.slice()); p2[Number(key)][Number(p)] = Number(oj); openVer(vi, state({ pp: p2, openSlot: "" }));
      }));
      // Each date: its own steps / prices (the same as the top drops the override).
      const setDay = (d, sel) => { const ds = { ...dsel }; if (JSON.stringify(sel) === JSON.stringify(topSel)) delete ds[d]; else ds[d] = sel; return ds; };
      modal.querySelectorAll("[data-pmdk]").forEach((v) => {
        ["click", "pointerdown"].forEach((ev) => v.addEventListener(ev, (e) => e.stopPropagation()));
        v.addEventListener("change", () => openVer(vi, state({ dsel: setDay(Number(v.dataset.pmdk), Number(v.value)) })));
      });
      modal.querySelectorAll("[data-pmdopen]").forEach((v) => v.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); const d = Number(v.dataset.pmdopen); openVer(vi, state({ openDay: openDay === d ? -1 : d })); }));
      modal.querySelectorAll("[data-pmdt]").forEach((v) => v.addEventListener("change", () => { const [d, k] = v.dataset.pmdt.split("|").map(Number); const s2 = selOf(d).slice(); s2[k] = v.checked; openVer(vi, state({ dsel: setDay(d, s2) })); }));
      };
      openVer(0);
    }));
      // Show the top 3 packs; the rest scroll inside the box.
      const listEl = box.querySelector(".pur-sug-list"), items = listEl ? [...listEl.children] : [];
      if (items.length > 3) listEl.style.maxHeight = `${items[3].offsetTop + 1}px`; // the list is the cards' offset parent
      // Admin list: about 4½ pack lines, the rest scroll inside the box.
      const clEl = box.querySelector(".pur-cl-list");
      if (clEl && keepTop) clEl.scrollTop = keepTop;
      putBoxes(box);
      firstDraw = false;
      box.style.minHeight = "";
      // The last plan stays tappable while the new one is worked out.
      if (updating) box.insertAdjacentHTML("afterbegin", `<div class="pur-upd bud-pending small">${esc(t("pur_updating"))}</div>`);
      box.classList.toggle("pur-upding", !!updating);
      box.dataset.drawn = "1";
    };
    sugCtl = {
      draw: drawSug, keys,
      // The checklist's row: the Will buy pop-up of that pack (this week's dates).
      // (drawn for this week with every line, then back to the week shown).
      open: (i) => {
        const prev = PUR_SUG_WEEK;
        PUR_SUG_WEEK = 0; sugAll = true; drawSug();
        const b = box.querySelector(`[data-pursug="${i}"]`);
        if (b) b.click();
        PUR_SUG_WEEK = prev; sugAll = false; drawSug();
        return !!b;
      },
    };
    drawSug();
    const b0 = buckets.get(0);
    drawWeek({ plan, cmp, follow, rows, sched, nFollow, buckets, keys, money, wkName, sugTable, plainPack, sugName, takeAsPlanned,
      planTag: (i) => (cmp ? (b0 && b0.match.has(i) ? "both" : follow) : plan && plan.spend ? "budget" : "target") }, !!updating);
    // From the Pack calendar's "+ Will buy": open that pack's Will buy pop-up.
    if (focusI != null) {
      const b = box.querySelector(`[data-pursug="${focusI}"]`);
      if (b) b.click(); else if (PUR_SUG_WEEK === 0 && sugCtl) sugCtl.open(focusI);
    }
  };
  const sugFail = (e) => { if (e && e.superseded) return; const box = document.getElementById("purSuggest"); if (box && seq === RENDER_SEQ) { box.style.minHeight = ""; box.innerHTML = `<div class="meta pur-a2-none">${esc(t("pur_sug_fail"))}</div>`; const chk0 = document.getElementById("purChk"); if (chk0) chk0.hidden = false; drawWeek(null); } };
  const ov = PUR_SUG_OVERLAY;
  if (ov) {
    // Drawn at once from the same plan; the new plan replaces it quietly when ready.
    drawPlan(ov.plan, ov.taken);
    budgetSuggestedPlan().then(() => { if (seq !== RENDER_SEQ || PUR_SUG_OVERLAY !== ov) return; PUR_SUG_OVERLAY = null; redraw(); }).catch((e) => { if (e && e.superseded) return; if (PUR_SUG_OVERLAY === ov) PUR_SUG_OVERLAY = null; });
  } else if (PUR_SUGGEST && PUR_SUGGEST_DONE && PUR_SUGGEST_DONE.p === PUR_SUGGEST) drawPlan(PUR_SUGGEST_DONE.plan);
  else {
    // Redrawn on this page while a new plan is worked out: the last plan stays, tappable, with "Updating…".
    const last = PUR_SUG_KEEP && PUR_SUG_KEEP.html && PUR_SUG_SHOWN;
    if (last) drawPlan(last.plan, last.taken, true);
    budgetSuggestedPlan().then((p) => drawPlan(p)).catch(sugFail);
  }

  const redraw = () => { const y = window.scrollY, put = saveBoxScroll(content), sq = RENDER_SEQ; renderPurchasesPage().then(() => { window.scrollTo(0, y); put(content); }).catch((e) => pageRedrawFailed(e, sq)); };
  content.querySelectorAll("[data-purf]").forEach((inp) => inp.addEventListener("change", () => {
    const k = inp.dataset.purf;
    if (k === "table") { PUR_FORM.table = inp.value; PUR_FORM.row = -1; redraw(); return; }
    if (k === "row") PUR_FORM.row = Number(inp.value);
    else if (k === "count") PUR_FORM.count = Math.max(1, Math.floor(Number(inp.value) || 1));
    else if (k === "date") PUR_FORM.date = inp.value || today;
  }));
  content.querySelectorAll("[data-purstatus]").forEach((b) => b.addEventListener("click", () => {
    PUR_FORM.status = b.dataset.purstatus;
    content.querySelectorAll("[data-purstatus]").forEach((x) => x.classList.toggle("on", x === b));
  }));
  const addBtn = content.querySelector("[data-puradd]");
  if (addBtn) addBtn.addEventListener("click", () => {
    if (!formTb) return;
    const dateEl = content.querySelector('[data-purf="date"]'), countEl = content.querySelector('[data-purf="count"]');
    let date = packValidDay(dateEl && dateEl.value) || today;
    if (PUR_FORM.status === "bought" && date > today) date = today; // can't have bought it yet
    const count = Math.max(1, Math.floor(Number(countEl && countEl.value) || 1));
    PACK_PURCHASES.list = (PACK_PURCHASES.list || []).concat([{ id: "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), table: String(formTb.id), row: PUR_FORM.row, count, date, status: PUR_FORM.status }]);
    PUR_FORM.count = 1;
    savePackPurchases();
    toast(t("pur_added"));
    PUR_SHEET = null;
    redraw();
  });
  const tblBtn = content.querySelector("[data-purtable]");
  if (tblBtn) tblBtn.addEventListener("click", () => {
    if (!formTb) return;
    const dateEl = content.querySelector('[data-purf="date"]'), countEl = content.querySelector('[data-purf="count"]');
    let restore = null;
    try { const d = JSON.parse(sessionStorage.getItem("pur_tbl_draft") || "null"); if (d && d.table === String(formTb.id)) restore = d.S; } catch (e) { /* none */ }
    purTablePopup(formTb, {
      name: formTb.title || "", restore,
      count: Math.max(1, Math.floor(Number(countEl && countEl.value) || 1)),
      onAdd: (adds) => {
        let date = packValidDay(dateEl && dateEl.value) || today;
        if (PUR_FORM.status === "bought" && date > today) date = today;
        PACK_PURCHASES.list = (PACK_PURCHASES.list || []).concat(adds.map((a, k) => ({ id: "p" + Date.now().toString(36) + k + Math.random().toString(36).slice(2, 6), table: String(formTb.id), date, status: PUR_FORM.status, ...a })));
        savePackPurchases();
        toast(t("pur_added"));
        PUR_SHEET = null;
        redraw();
      },
    });
  });
  const pickBtn = content.querySelector("[data-purpick]");
  if (pickBtn) pickBtn.addEventListener("click", () => {
    const sel = content.querySelector('[data-purf="table"]');
    // Per-hero copies of New Gen packs only up to the next Gen (heroes already out + the next ones).
    const curGen = newGenGen();
    const keepNg = (tb) => { const m = /^ng-[sw]-(\d+)-/.exec(String(tb.id)); return !m || !curGen || Number(m[1]) <= curGen + 1; };
    const infos = buyable.filter(keepNg).map(purPackInfo), plans = purPlanTables(), ngHidden = buyable.length - infos.length;
    infos.forEach((i) => { i.plan = plans.has(i.id); });
    infos.sort((a, b) => (b.plan ? 1 : 0) - (a.plan ? 1 : 0) || a.name.localeCompare(b.name, pkLoc));
    let modal = document.getElementById("purPickModal");
    if (!modal) { modal = document.createElement("div"); modal.id = "purPickModal"; modal.className = "modal-overlay pur-pk-ov"; document.body.appendChild(modal); }
    let q = "";
    const close = () => { modal.style.display = "none"; };
    const inTab = (i, tab) => (tab === "on" ? i.on : tab === "soon" ? !i.on && i.next != null : true);
    const match = (i) => !q || i.words.includes(q);
    // All: grouped by category in the Packs page's order (saved order first,
    // then first appearance; "Not assigned" last).
    const catOrder = (() => {
      const seen = [];
      tables.forEach((tb) => { const g = String(packLinkFor(tb.id).group || ""); if (g && !seen.includes(g)) seen.push(g); });
      const saved = PACK_LINKS && PACK_LINKS.__order && Array.isArray(PACK_LINKS.__order.categories) ? PACK_LINKS.__order.categories : [];
      return [...saved.filter((g) => seen.includes(g)), ...seen.filter((g) => !saved.includes(g)), ""];
    })();
    const rowHtml = (i, tab) => `<button type="button" class="pur-pk-row${i.id === String(PUR_FORM.table) ? " on" : ""}" data-ppkid="${esc(i.id)}"><span class="pur-pk-ic">${i.icon || "&#127873;"}</span><span class="pur-pk-tx"><b>${esc(i.name)}</b><small>${i.plan ? `<span class="pur-pk-star">&#9733; ${esc(t("pur_pk_plan"))}</span>` : ""}${pkStatus(i, tab)}</small></span><span class="pur-pk-pr">${esc(i.price)}</span></button>`;
    const listHtml = () => {
      const tab = PUR_PICK_TAB, list = infos.filter((i) => match(i) && inTab(i, tab));
      if (tab === "all" && list.length) {
        const ngNote = ngHidden ? `<div class="pur-pk-ngnote">${esc(t("pur_pk_ng_later"))}</div>` : "";
        // Each heading folds its group (kept for the visit and in this browser); searching opens every group with matches.
        const groups = catOrder.map((g) => ({ g, its: list.filter((i) => (catOrder.includes(i.cat) ? i.cat : "") === g) })).filter((x) => x.its.length);
        const folded = (g) => !q && PUR_PICK_FOLD.has(g);
        const allShut = groups.every((x) => folded(x.g));
        const bar = q ? "" : `<div class="pur-pk-allbar"><button type="button" data-ppkall>${esc(t(allShut ? "pur_pk_show_all" : "pur_pk_hide_all"))}</button></div>`;
        return bar + groups.map(({ g, its }) => { const f = folded(g); return `<button type="button" class="pur-pk-gh" data-ppkgrp="${esc(g)}" aria-expanded="${!f}"><span>${esc(g || t("packs_filter_none"))} <small>${its.length}</small></span><i aria-hidden="true">${f ? "&#9656;" : "&#9662;"}</i></button>${f ? "" : its.map((i) => rowHtml(i, "allg")).join("")}`; }).join("") + ngNote;
      }
      const ngNote = ngHidden ? `<div class="pur-pk-ngnote">${esc(t("pur_pk_ng_later"))}</div>` : "";
      return (list.length ? list.map((i) => rowHtml(i, tab)).join("") : `<div class="meta pur-pk-none">${esc(t("pur_pk_none"))}</div>`) + ngNote;
    };
    const segHtml = () => ["on", "soon", "all"].map((k) => `<button type="button" data-ppktab="${k}" class="${PUR_PICK_TAB === k ? "on" : ""}" aria-pressed="${PUR_PICK_TAB === k}">${esc(t("pur_pk_tab_" + k))} · ${infos.filter((i) => match(i) && inTab(i, k)).length}</button>`).join("");
    const fill = () => {
      modal.querySelector(".pur-pk-seg").innerHTML = segHtml();
      modal.querySelector(".pur-pk-note").textContent = t("pur_pk_note_" + PUR_PICK_TAB);
      const l = modal.querySelector(".pur-pk-list"); l.innerHTML = listHtml(); l.scrollTop = 0;
    };
    modal.innerHTML = `<div class="modal-box pur-pk-box"><div class="pur-m-head"><h2>${esc(t("pur_pk_title"))}</h2>${closeXHtml("data-ppkclose")}</div>
      <label class="pur-pk-search"><span aria-hidden="true">&#128269;</span><input type="search" data-ppkq placeholder="${esc(t("pur_pk_search"))}" aria-label="${esc(t("pur_pk_search"))}" autocomplete="off" /></label>
      <div class="pur-pk-seg" role="group"></div><div class="meta pur-pk-note"></div><div class="pur-pk-list"></div></div>`;
    modal.style.display = "flex";
    fill();
    modal.onclick = (ev) => {
      if (ev.target === modal || ev.target.closest("[data-ppkclose]")) { close(); return; }
      const gh = ev.target.closest("[data-ppkgrp]"), ab = ev.target.closest("[data-ppkall]");
      if (gh || ab) {
        const l = modal.querySelector(".pur-pk-list"), top = l.scrollTop;
        if (gh) { const g = gh.dataset.ppkgrp; if (PUR_PICK_FOLD.has(g)) PUR_PICK_FOLD.delete(g); else PUR_PICK_FOLD.add(g); }
        else { const gs = catOrder.filter((g) => infos.some((i) => (catOrder.includes(i.cat) ? i.cat : "") === g)); if (gs.every((g) => PUR_PICK_FOLD.has(g))) PUR_PICK_FOLD.clear(); else gs.forEach((g) => PUR_PICK_FOLD.add(g)); }
        try { localStorage.setItem("pur_pick_fold", JSON.stringify([...PUR_PICK_FOLD])); } catch { /* blocked */ }
        l.innerHTML = listHtml(); l.scrollTop = top;
        return;
      }
      const tb2 = ev.target.closest("[data-ppktab]");
      if (tb2) { PUR_PICK_TAB = tb2.dataset.ppktab; fill(); return; }
      const row = ev.target.closest("[data-ppkid]");
      if (row && sel) { close(); if (sel.value !== row.dataset.ppkid) { sel.value = row.dataset.ppkid; sel.dispatchEvent(new Event("change", { bubbles: true })); } }
    };
    modal.querySelector("[data-ppkq]").addEventListener("input", (ev) => { q = String(ev.target.value || "").trim().toLowerCase(); fill(); });
  });
  // The phone reloaded the page while the pack table was open: open it again.
  try { const d = JSON.parse(sessionStorage.getItem("pur_tbl_draft") || "null"); if (d && tblBtn && formTb && d.table === String(formTb.id) && !document.querySelector("#purTblModal[style*='flex']")) tblBtn.click(); } catch (e) { /* none */ }
  const toBought = (p) => ({ ...p, status: "bought", date: p.date > today ? today : p.date });
  content.querySelectorAll("[data-purmon]").forEach((d) => { const sm = d.querySelector("summary"); if (sm) sm.addEventListener("click", () => PUR_MON.set(d.dataset.purmon, !d.open)); });
  // Weekly cards: reward days left → the plan (same as the old "My pack dates" box).
  const wcSave = () => {
    Object.keys(MY_CARDS_ACTIVE).forEach((k) => { if (!packActiveDaysSaved(MY_CARDS_ACTIVE[k])) delete MY_CARDS_ACTIVE[k]; });
    PACK_PLAN_CACHE.clear(); PACK_EARLIEST_CACHE.clear();
    if (typeof budgetInvalidate === "function") budgetInvalidate();
    PACK_TABLES_CACHE = PACK_TABLES_STASH = null;
    saveCalcState("my_cards_active", MY_CARDS_ACTIVE);
    setTimeout(redraw, 0); // not while the input is still handling its change
  };
  content.querySelectorAll("[data-wcdays]").forEach((inp) => inp.addEventListener("change", () => {
    const n = Math.max(0, Math.floor(Number(inp.value) || 0));
    if (n) MY_CARDS_ACTIVE[inp.dataset.wcdays] = packActiveEntry(n); else delete MY_CARDS_ACTIVE[inp.dataset.wcdays];
    wcSave();
  }));
  const wcReset = content.querySelector("[data-wcresetall]");
  if (wcReset) wcReset.addEventListener("click", () => { wcCards.forEach((tb) => { delete MY_CARDS_ACTIVE[String(tb.id)]; }); wcSave(); });
  content.querySelectorAll("[data-wcopen]").forEach((b) => b.addEventListener("click", () => packOpenSettingsOnPacks(b.dataset.wcopen)));
  // ✕ on a Bought pack: are its items in the
  // Backpack already? Yes → off the list but still counted as bought until
  // its copy ends (p.hidden); "Add them" → added to the Backpack, then the
  // same; No → removed, the plan needs the items again.
  const rawGives = rawOf;

  const openBoughtRemove = (items) => {
    if (!items.length) return;
    const tb = byId.get(String(items[0].table));
    if (!tb) return;
    const n = items.reduce((a, p) => a + Math.max(1, Math.floor(Number(p.count) || 1)), 0);
    const gives = {};
    items.forEach((p) => { const c = Math.max(1, Math.floor(Number(p.count) || 1)); Object.entries(rawGives(p, tb)).forEach(([k, v]) => { gives[k] = (gives[k] || 0) + v * c; }); });
    const addable = Object.keys(gives).filter((k) => k !== "Gems" && gives[k] > 0);
    const name = purShortName((items[0].choice && items[0].choice.name) || tb.title || "");
    const lastBuy = items.map((p) => p.date).sort().pop();
    const bpAt = CALC_STATE_UPDATED.backpack ? CALC_STATE_UPDATED.backpack.slice(0, 10) : null;
    const old = !bpAt || bpAt < lastBuy;
    const ends = items.map(untilFor).filter((u) => u.until).map((u) => u.until).sort().pop();
    const total = items.reduce((a, p) => a + cost(p), 0);
    const ic = mainIcon(purchaseGives(items[0], tb));
    let m = document.getElementById("purRmSheet");
    if (!m) { m = document.createElement("div"); m.id = "purRmSheet"; m.className = "modal-overlay adm-sheet-wrap gs-wrap"; document.body.appendChild(m); }
    const yesLine = ends ? t("pur_rm_yes_d").replace("{date}", shortDay(ends)) : t("pur_rm_yes_d_once");
    m.innerHTML = `<div class="modal-box adm-sheet gs-box pur-rm" role="dialog" aria-modal="true">
      <div class="gs-head"><b style="flex:1;">${esc(t("pur_rm_title"))}</b>${closeXHtml("data-rmx")}</div>
      ${old && addable.length ? `<div class="pur-rm-warn">&#9888; ${esc(bpAt ? t("pur_rm_old").replace("{date}", shortDay(bpAt)) : t("pur_rm_never"))}</div>` : ""}
      <div class="pur-rm-pk"><span class="pur-pic">${ic ? `<img src="${esc(ic)}" alt="" />` : `<i>${esc(name.charAt(0))}</i>`}</span><span><b>${esc(name)} ${bidiNum("×" + n)}</b><span class="meta">${esc(packFmtMoney(total, packLinkFor(tb.id).currency))} · ${esc(t("pur_rm_bought").replace("{date}", shortDay(lastBuy)))}</span></span></div>
      <div class="bud-mats pur-chips">${chipsFor(gives, 1, 8)}</div>
      <div class="pur-rm-q">${esc(t("pur_rm_q"))}</div>
      ${addable.length ? `<button type="button" class="pur-rm-b add" data-rm="add"><b>${esc(t("pur_rm_add"))}</b><span>${esc(t("pur_rm_add_d"))}</span></button>` : ""}
      <button type="button" class="pur-rm-b yes" data-rm="yes"><b>${esc(t("pur_rm_yes"))}</b><span>${esc(yesLine)}</span></button>
      <button type="button" class="pur-rm-b no" data-rm="no"><b>${esc(t("pur_rm_no"))}</b><span>${esc(t("pur_rm_no_d"))}</span></button>
      <button type="button" class="btn ghost pur-rm-cancel" data-rmx>${esc(t("pur_rm_cancel"))}</button>
    </div>`;
    const close = () => { m.style.display = "none"; };
    m.onclick = async (ev) => {
      if (ev.target === m || ev.target.closest("[data-rmx]")) { close(); return; }
      const b = ev.target.closest("[data-rm]");
      if (!b) return;
      const ids = new Set(items.map((p) => p.id));
      if (b.dataset.rm === "add") {
        const bp = cloneState((await loadCalcState("backpack").catch(() => null)) || {});
        addable.forEach((k) => {
          // Speedups counted in minutes go in as 1-minute speedups (same total time).
          const sp = /^(Research |Troop |Construction |Expert )?Speedups \(minutes\)$/.exec(k);
          const key = sp ? `${sp[1] || ""}Speedup 1m` : bpKeyFor(k);
          bp[key] = Math.round((Number(bp[key]) || 0) + gives[k]);
        });
        saveCalcState("backpack", bp);
      }
      if (b.dataset.rm === "no") PACK_PURCHASES.list = PACK_PURCHASES.list.filter((p) => !ids.has(p.id));
      else PACK_PURCHASES.list = PACK_PURCHASES.list.map((p) => (ids.has(p.id) ? { ...p, hidden: true } : p));
      close();
      savePackPurchases();
      toast(t(b.dataset.rm === "no" ? "pur_rm_done_no" : b.dataset.rm === "add" ? "pur_rm_done_add" : "pur_rm_done_yes"));
      redraw();
    };
    m.style.display = "flex";
  };
  // ✓ on a "will buy" of several: how many did you
  // really buy, and when? Fewer: the rest is dropped and Budgets plans it again.
  const openBoughtSheet = (p0, onOk) => {
    const tb = byId.get(String(p0.table));
    if (!tb) return;
    const cur = packLinkFor(tb.id).currency, each = purchasePrice(p0, tb), max = cntNow(p0);
    const name = purShortName((p0.choice && p0.choice.name) || tb.title || ""), ic = mainIcon(purchaseGives(p0, tb));
    let n = max;
    let m = document.getElementById("purBsSheet");
    if (!m) { m = document.createElement("div"); m.id = "purBsSheet"; m.className = "modal-overlay adm-sheet-wrap gs-wrap"; document.body.appendChild(m); }
    const btnText = () => t("pur_bs_btn").replace("{n}", n).replace("{price}", packFmtMoney(each * n, cur));
    m.innerHTML = `<div class="modal-box adm-sheet gs-box pur-rm" role="dialog" aria-modal="true">
      <div class="gs-head"><b style="flex:1;">${esc(t("pur_bs_title"))}</b>${closeXHtml("data-bsx")}</div>
      <div class="pur-rm-pk"><span class="pur-pic">${ic ? `<img src="${esc(ic)}" alt="" />` : `<i>${esc(name.charAt(0))}</i>`}</span><span><b>${esc(name)}</b><span class="meta">${esc(t("pur_bs_planned").replace("{n}", max).replace("{price}", packFmtMoney(each, cur)))}</span></span></div>
      <div class="pur-bs-row"><span>${esc(t("pur_bs_how"))}</span>${purStepHtml("bsstep", n, max)}</div>
      <div class="pur-bs-row"><span>${esc(t("pur_bs_on"))}</span><input type="date" data-bsday value="${esc(p0.date > today ? today : p0.date)}" max="${esc(today)}" /></div>
      <div class="pur-bs-note">${esc(t("pur_bs_note"))}</div>
      <div class="pur-bs-foot"><button type="button" class="btn" data-bsok>${esc(btnText())}</button><button type="button" class="btn ghost" data-bsx>${esc(t("pur_rm_cancel"))}</button></div>
    </div>`;
    const close = () => { m.style.display = "none"; };
    const sync = () => {
      m.querySelector("[data-bsstep-n]").textContent = n;
      m.querySelector('[data-bsstep="-1"]').disabled = n <= 1;
      m.querySelector('[data-bsstep="1"]').disabled = n >= max;
      m.querySelector("[data-bsok]").textContent = btnText();
    };
    m.onclick = (ev) => {
      if (ev.target === m || ev.target.closest("[data-bsx]")) { close(); return; }
      const st = ev.target.closest("[data-bsstep]");
      if (st) { n = Math.max(1, Math.min(max, n + Number(st.dataset.bsstep))); sync(); return; }
      if (!ev.target.closest("[data-bsok]")) return;
      const v = m.querySelector("[data-bsday]").value, day = packValidDay(v) && v <= today ? v : (p0.date > today ? today : p0.date);
      if (onOk) { close(); onOk(n, day); return; }
      PACK_PURCHASES.list = PACK_PURCHASES.list.map((p) => { if (p.id !== p0.id) return p; return { ...p, status: "bought", count: n, date: day }; });
      close();
      savePackPurchases();
      redraw();
    };
    m.style.display = "flex";
  };
  // O1: the list switch, "Show N more", and the Coming / Bought lines.
  content.querySelectorAll("[data-purtab]").forEach((b) => b.addEventListener("click", () => setTab(b.dataset.purtab)));
  content.querySelectorAll("[data-purlmore]").forEach((b) => {
    if (b.dataset.purlmore === "n") return; // wired by the Next weeks list
    b.addEventListener("click", () => { const k = b.dataset.purlmore; if (PUR_LIST_ALL.has(k)) PUR_LIST_ALL.delete(k); else PUR_LIST_ALL.add(k); redraw(); });
  });
  // The purchases of a line (group id "<c|b>|<bucket>|<pack key>"), read fresh at each tap.
  const grpParts = (id) => { const kind = id.slice(0, 1), rest = id.slice(2), bk = rest.slice(0, rest.indexOf("|")), gkey = rest.slice(rest.indexOf("|") + 1); return { kind, bk, gkey }; };
  const grpItems = (id) => {
    const { kind, bk, gkey } = grpParts(id);
    return (PACK_PURCHASES.list || []).filter((p) => purGroupKey(p) === gkey && (kind === "c" ? p.status !== "bought" : p.status === "bought" && boughtShown(p)) && bucketFor(kind, p) === bk);
  };
  // ✓ on a Coming line / "All bought": one "will buy" of several asks how many (and the day).
  const grpAllBought = (id) => {
    const its = grpItems(id);
    if (its.length === 1 && cntNow(its[0]) > 1) { openBoughtSheet(its[0]); return; }
    const ids = new Set(its.map((p) => p.id));
    PACK_PURCHASES.list = PACK_PURCHASES.list.map((p) => (ids.has(p.id) ? toBought(p) : p));
    savePackPurchases(); redraw();
  };
  const grpRemoveAll = (id) => {
    const { kind } = grpParts(id), its = grpItems(id);
    if (kind === "b") { openBoughtRemove(its); return; }
    if (its.length > 1 && !confirm(t("pur_remove_all_q").replace("{n}", its.length))) return;
    const ids = new Set(its.map((p) => p.id));
    PACK_PURCHASES.list = PACK_PURCHASES.list.filter((p) => !ids.has(p.id)); savePackPurchases(); redraw();
  };
  const grpEl = document.getElementById("purGrpSheet");
  // ✎ Edit a coming or bought purchase: in a line's sheet,
  // "✎ Edit" (the whole pack, all its dates) or ✎ on a date (that date only).
  // Date, How many, step / tier (buy-in-order ladders and option ladders), item
  // picks (pick packs: picture slots), the card (Benefit Card), Coming | Bought.
  // Saved like the Will buy pop-up / How-many sheet save (row = last step,
  // from, choice { name, label, price, gives }); Budgets plans the rest again.
  const optGroupOf = (tb) => { try { return packGroupsFor(tables, "__purchases").find((g) => (g.tables || []).length > 1 && g.tables.includes(String(tb.id))) || null; } catch (e) { return null; } };
  const sumGives = (list) => { const g = {}; list.forEach((x) => Object.entries(x || {}).forEach(([n, v]) => { g[n] = (g[n] || 0) + v; })); return g; };
  const picksText = (opts, sel) => { const cnt = {}; sel.forEach((j) => { const nm = opts[j].tag; cnt[nm] = (cnt[nm] || 0) + 1; }); return Object.entries(cnt).sort((a, b) => b[1] - a[1]).map(([nm, c]) => `${c}× ${nm}`).join(" + "); };
  const parsePicks = (txt, opts, n) => {
    const want = [];
    String(txt || "").split(" + ").forEach((part) => { const m = /^(\d+)× (.+)$/.exec(part.trim()); if (!m) return; const j = opts.findIndex((o) => o.tag === m[2]); if (j >= 0) for (let i = 0; i < Number(m[1]); i++) want.push(j); });
    if (want.length === n) return want;
    const first = Math.max(0, opts.findIndex((o) => o.q > 0));
    return Array(n).fill(first);
  };
  // What can change for this pack: { kind, steps, ... } built from its table(s).
  const editModel = (p, tb) => {
    const lk = packLinkFor(tb.id), lab = String((p.choice && p.choice.label) || "");
    if (lk.pickCols > 0) {
      const steps = pickRows(tb, lk);
      if (!steps.length) return null;
      const at = Math.max(0, steps.findIndex((st) => st.row === Number(p.row)));
      if (lk.pickOrder && steps.length > 1) {
        const each = lab.split(`${t("pk_each_step")}: `)[1] || "";
        const k = steps.findIndex((st) => st.row === Number(p.row)) >= 0 ? at + 1 : Math.min(steps.length, (Number(p.row) || 0) + 1);
        return { kind: "pickladder", n: lk.pickCols, steps, k, pp: parsePicks(each, steps[0].opts, lk.pickCols) };
      }
      return { kind: "pick", n: lk.pickCols, steps, k: at, pp: parsePicks(lab.split(" · ").slice(1).join(" · "), steps[at].opts, lk.pickCols) };
    }
    const grp = lk.option ? optGroupOf(tb) : null;
    if (grp) {
      const tbs = grp.tables.map((id) => byId.get(String(id))).filter(Boolean);
      if (tbs.length > 1) {
        const tags = packLinkFor(tbs[0].id).linkSet ? packLinkSetTags(tbs) : tbs.map(packOptionTag);
        const perTable = tbs.map((x) => packOffersFor(x, true));
        const parts = lab.split(" · ");
        const tagIdx = (s) => { const j = tags.findIndex((tg) => String(s || "").trim().endsWith(tg)); return j < 0 ? 0 : j; };
        if (lk.sequential) {
          const tiers = Math.min(...perTable.map((o) => o.length));
          if (!tiers) return null;
          const steps = [];
          for (let k = 0; k < tiers; k++) steps.push({ price: perTable[0][k].price, opts: perTable.map((offs, j) => ({ tag: tags[j], gives: offs[k].gives || {} })) });
          const k = Math.max(1, Math.min(tiers, p.choice ? parts.length : (Number(p.row) || 0) + 1));
          return { kind: "opt", steps, k, pick: steps.map((st, i) => (i < parts.length ? tagIdx(parts[i]) : 0)) };
        }
        const rows0 = perTable[0];
        if (!rows0.length) return null;
        const ri = Math.max(0, rows0.findIndex((o) => o.row === Number(p.row)));
        return { kind: "card", tbs, tags, perTable, k: ri, card: tagIdx(parts.slice(1).join(" · ")) };
      }
    }
    if (lk.sequential && !lk.option && !lk.colOptions) {
      const offs = packOffersFor(tb, true).filter((o) => o.row >= (Number(p.from) || 0));
      if (offs.length > 1) return { kind: "plain", steps: offs, k: Math.max(1, offs.filter((o) => o.row <= Number(p.row)).length) };
    }
    return null;
  };
  // The row / choice one edit state buys: { row, choice | null }.
  const editBuys = (E, tb) => {
    const M = E.M, cur = packLinkFor(tb.id).currency, name = (E.p.choice && E.p.choice.name) || purShortName(setName(tb) || tb.title || "");
    if (!M) return { row: E.p.row, choice: E.p.choice || null };
    if (M.kind === "plain") return { row: M.steps[E.k - 1].row, choice: null };
    if (M.kind === "pickladder") {
      const ch = M.steps.slice(0, E.k);
      const gives = sumGives(ch.map((st) => sumGives(E.pp.map((j) => st.opts[j].gives))));
      const label = `${E.k === 1 ? "" : t("pack_up_to") + " "}${packFmtMoney(M.steps[E.k - 1].price, cur)}${M.steps.length > 1 ? ` (${t("pack_steps_of").replace("{k}", E.k).replace("{n}", M.steps.length)})` : ""} · ${t("pk_each_step")}: ${picksText(M.steps[0].opts, E.pp)}`;
      return { row: ch[ch.length - 1].row, choice: { name, label, price: Math.round(ch.reduce((a, st) => a + st.price, 0) * 100) / 100, gives } };
    }
    if (M.kind === "pick") {
      const st = M.steps[E.k];
      return { row: st.row, choice: { name, label: `${packFmtMoney(st.price, cur)} · ${picksText(st.opts, E.pp)}`, price: st.price, gives: sumGives(E.pp.map((j) => st.opts[j].gives)) } };
    }
    if (M.kind === "opt") {
      const ch = M.steps.slice(0, E.k).map((st, i) => ({ price: st.price, tag: st.opts[E.pick[i]].tag, gives: st.opts[E.pick[i]].gives }));
      return { row: E.k - 1, choice: { name, label: ch.map((st) => `${packFmtMoney(st.price, cur)} ${st.tag}`).join(" · "), price: Math.round(ch.reduce((a, st) => a + st.price, 0) * 100) / 100, gives: sumGives(ch.map((st) => st.gives)) } };
    }
    const o = M.perTable[E.card][E.k] || M.perTable[0][E.k];
    return { row: o.row, choice: { name, label: `${packFmtMoney(o.price, cur)} · ${M.tags[E.card]}`, price: o.price, gives: o.gives || {} } };
  };
  const editTarget = (E) => {
    const its = grpItems(E.id);
    return E.scope === "one" ? its.filter((p) => p.id === E.pid) : its;
  };
  const openEdit = (id, pid) => {
    const its = grpItems(id);
    if (!its.length) return;
    const p = its.find((x) => x.id === pid) || its[0], tb = byId.get(String(p.table));
    if (!tb) return;
    const M = editModel(p, tb);
    PUR_EDIT = { id, pid: p.id, scope: pid || its.length === 1 ? "one" : "all", date: p.date, count: cntNow(p), status: p.status === "bought" ? "bought" : "planned", M, k: M ? M.k : 0, pick: M && M.pick ? M.pick.slice() : [], pp: M && M.pp ? M.pp.slice() : [], card: M && M.card != null ? M.card : 0, slot: "", p };
    PUR_EDIT.k0 = PUR_EDIT.k; PUR_EDIT.pick0 = PUR_EDIT.pick.join(); PUR_EDIT.pp0 = PUR_EDIT.pp.join(); PUR_EDIT.card0 = PUR_EDIT.card;
    drawEdit();
  };
  function drawEdit() {
    const host = grpEl && grpEl.querySelector("[data-pureditor]");
    if (!host) return;
    const E = PUR_EDIT;
    grpEl.querySelectorAll("[data-purid]").forEach((x) => x.classList.toggle("editing", !!E && E.scope === "one" && x.dataset.purid === E.pid));
    if (!E) { host.innerHTML = ""; host.hidden = true; return; }
    const its = grpItems(E.id), target = editTarget(E);
    if (!target.length) { PUR_EDIT = null; host.innerHTML = ""; host.hidden = true; return; }
    const tb = byId.get(String(E.p.table)), link = packLinkFor(tb.id), cur = link.currency, M = E.M;
    const lk0 = packLinkForBase(tb.id);
    const max = Math.max(...target.map(cntNow), Number(lk0.buys) > 0 ? Number(lk0.buys) : 1);
    E.count = Math.max(1, Math.min(max, E.count));
    const buys = editBuys(E, tb);
    const stepChanged = !!M && (E.k !== E.k0 || E.pick.join() !== E.pick0 || E.pp.join() !== E.pp0 || E.card !== E.card0);
    const unit = purchasePrice({ row: buys.row, from: E.p.from, ...(!stepChanged && E.p.extra > 0 ? { extra: E.p.extra } : {}), ...(buys.choice ? { choice: buys.choice } : {}) }, tb);
    const oldV = target.reduce((a, p) => a + cost(p), 0), newV = unit * E.count * target.length;
    const changed = stepChanged || target.some((p) => cntNow(p) !== E.count) || (E.scope === "one" && E.date !== E.p.date);
    const row = (label, ctl, cls) => `<div class="pur-ed-r${cls ? " " + cls : ""}"><span class="pur-ed-l">${esc(label)}</span><span class="pur-ed-c">${ctl}</span></div>`;
    const picOf = (o) => { const ic = itemIc(o.name || "") || itemIc(Object.keys(o.gives || {})[0] || ""); return ic ? `<img src="${esc(ic)}" alt="" loading="lazy" />` : `<i>${esc(String(o.tag || "").slice(0, 2))}</i>`; };
    const slots = (opts) => `<span class="pur-slots">${E.pp.map((sj, i) => { const o = opts[sj] || opts[0]; return `<button type="button" class="pur-slot${E.slot === String(i) ? " open" : ""}" data-edslot="${i}" title="${esc(o.tag)}">${picOf(o)}<small>${esc(shortAmount(o.q))}</small></button>`; }).join("")}</span>`;
    const strip = (opts) => (E.slot === "" ? "" : `<div class="pur-slot-strip">${opts.map((o, oj) => (o.q > 0 ? `<button type="button" class="pur-slot${oj === E.pp[Number(E.slot)] ? " on" : ""}" data-edslotopt="${oj}" title="${esc(o.tag)}">${picOf(o)}<small>${esc(shortAmount(o.q))}</small></button>` : "")).join("")}</div>`);
    const upTo = (steps, k) => steps.slice(0, k).reduce((a, st) => a + st.price, 0);
    let stepHtml = "";
    if (M && (M.kind === "plain" || M.kind === "opt" || M.kind === "pickladder")) {
      stepHtml = row(t("pur_ed_step"), `<select class="pur-ed-sel" data-edk aria-label="${esc(t("pur_ed_step"))}">${M.steps.map((st, i) => `<option value="${i + 1}"${i + 1 === E.k ? " selected" : ""}>${esc(t("pur_ed_upto").replace("{n}", i + 1).replace("{v}", packFmtMoney(upTo(M.steps, i + 1), cur)))}${i + 1 === E.k0 && E.k !== E.k0 ? ` · ${esc(t("pur_ed_was"))}` : ""}</option>`).join("")}</select>`);
      if (M.kind === "opt") stepHtml += `<div class="pur-ed-opts">${M.steps.slice(0, E.k).map((st, i) => `<div class="pur-ed-ov"><span class="meta">${bidiNum(String(i + 1))} · ${esc(packFmtMoney(st.price, cur))}</span><span class="pur-ed-chips">${st.opts.map((o, j) => `<button type="button" class="pur-ed-chip${j === E.pick[i] ? " on" : ""}" data-edopt="${i}|${j}">${esc(o.tag)}</button>`).join("")}</span></div>`).join("")}</div>`;
      if (M.kind === "pickladder") stepHtml += row(t("pur_ed_items_each"), slots(M.steps[0].opts), "pur-ed-slots") + strip(M.steps[0].opts);
    } else if (M && M.kind === "pick") {
      stepHtml = row(t("pur_ed_price"), `<select class="pur-ed-sel" data-edprice aria-label="${esc(t("pur_ed_price"))}">${M.steps.map((st, i) => `<option value="${i}"${i === E.k ? " selected" : ""}>${esc(packFmtMoney(st.price, cur))}</option>`).join("")}</select>`)
        + row(t("pur_ed_items"), slots(M.steps[E.k].opts), "pur-ed-slots") + strip(M.steps[E.k].opts);
    } else if (M && M.kind === "card") {
      stepHtml = row(t("pur_ed_price"), `<select class="pur-ed-sel" data-edprice aria-label="${esc(t("pur_ed_price"))}">${M.perTable[0].map((o, i) => `<option value="${i}"${i === E.k ? " selected" : ""}>${esc(packFmtMoney(o.price, cur))}</option>`).join("")}</select>`)
        + `<div class="pur-ed-ov"><span class="meta">${esc(t("pur_ed_card"))}</span><span class="pur-ed-chips">${M.tags.map((tg, j) => `<button type="button" class="pur-ed-chip${j === E.card ? " on" : ""}" data-edcard="${j}">${esc(tg)}</button>`).join("")}</span></div>`;
    }
    const scopeHtml = its.length > 1 ? `<div class="pur-ed-scope" role="group">${["all", "one"].map((s) => `<button type="button" data-edscope="${s}" class="${E.scope === s ? "on" : ""}" aria-pressed="${E.scope === s}"><b>${esc(t(s === "all" ? "pur_ed_all" : "pur_ed_one"))}</b><small>${esc(s === "all" ? (its.length === 2 ? `${shortDay(its[0].date)}, ${shortDay(its[1].date)}` : `${shortDay(its[0].date)} – ${shortDay(its[its.length - 1].date)}`) : `${shortDay(E.p.date)} · ${t("pur_ed_others")}`)}</small></button>`).join("")}</div>` : "";
    host.hidden = false;
    host.innerHTML = `<div class="pur-ed-h">&#9998; ${esc(t("pur_ed_title"))}${E.scope === "one" ? ` <span class="meta">· ${esc(shortDay(E.p.date))}</span>` : ""}</div>
      ${scopeHtml}
      ${E.scope === "one" ? row(t("pur_ed_date"), `<input type="date" class="pur-ed-date" data-eddate value="${esc(E.date)}"${E.status === "bought" ? ` max="${esc(today)}"` : ""} />`) : ""}
      ${row(t("pur_ed_count"), `${purStepHtml("edcnt", E.count, max)}${max > 1 ? ` <small class="meta">${esc(t("pur_ed_max").replace("{n}", max))}</small>` : ""}`)}
      ${stepHtml}
      ${row(t("pur_ed_status"), `<span class="pur-seg pur-ed-st">${["planned", "bought"].map((s) => `<button type="button" data-edstatus="${s}" class="${E.status === s ? "on" : ""}">${s === "bought" ? "&#10003; " : ""}${esc(t(s === "planned" ? "pur_o1_coming" : "pur_bought_list"))}</button>`).join("")}</span>`)}
      <div class="pur-ed-tot">${Math.abs(newV - oldV) > 0.004 ? `<s class="meta">${esc(packFmtMoney(oldV, cur))}</s> &rarr; ` : ""}<b>${esc(packFmtMoney(newV, cur))}</b><small class="meta">${esc(t(E.scope === "all" && its.length > 1 ? "pur_ed_whole" : "pur_ed_this"))}</small></div>
      ${changed ? `<div class="pur-o1-warn">${esc(t("pur_ed_replan"))}</div>` : ""}
      <div class="pur-ed-foot"><button type="button" class="btn ghost pur-ed-del" data-eddel>${esc(t(E.scope === "one" && its.length > 1 ? "pur_ed_del_date" : "pur_ed_delete"))}</button><button type="button" class="btn ghost" data-edcancel>${esc(t("pur_rm_cancel"))}</button><button type="button" class="btn" data-edsave>${esc(t("pur_ed_save"))}</button></div>`;
    host.onclick = (e) => {
      const b = (sel) => e.target.closest(sel);
      let x;
      if ((x = b("[data-edscope]"))) { E.scope = x.dataset.edscope; drawEdit(); return; }
      if ((x = b("[data-edcnt]"))) { E.count = Math.max(1, Math.min(max, E.count + Number(x.dataset.edcnt))); drawEdit(); return; }
      if ((x = b("[data-edstatus]"))) { E.status = x.dataset.edstatus; if (E.status === "bought" && E.date > today) E.date = today; drawEdit(); return; }
      if ((x = b("[data-edopt]"))) { const [i, j] = x.dataset.edopt.split("|").map(Number); E.pick[i] = j; drawEdit(); return; }
      if ((x = b("[data-edcard]"))) { E.card = Number(x.dataset.edcard); drawEdit(); return; }
      if ((x = b("[data-edslot]"))) { E.slot = E.slot === x.dataset.edslot ? "" : x.dataset.edslot; drawEdit(); return; }
      if ((x = b("[data-edslotopt]"))) { E.pp[Number(E.slot)] = Number(x.dataset.edslotopt); E.slot = ""; drawEdit(); return; }
      if (b("[data-edcancel]")) { PUR_EDIT = null; drawEdit(); return; }
      if (b("[data-eddel]")) {
        const tg = editTarget(E);
        if (E.p.status === "bought") { openBoughtRemove(tg); return; }
        if (tg.length > 1 && !confirm(t("pur_remove_all_q").replace("{n}", tg.length))) return;
        const ids = new Set(tg.map((p) => p.id));
        PUR_EDIT = null;
        PACK_PURCHASES.list = PACK_PURCHASES.list.filter((p) => !ids.has(p.id)); savePackPurchases(); redraw(); return;
      }
      if (b("[data-edsave]")) {
        const ids = new Set(editTarget(E).map((p) => p.id));
        const bu = editBuys(E, tb);
        PACK_PURCHASES.list = PACK_PURCHASES.list.map((p) => {
          if (!ids.has(p.id)) return p;
          const q = { ...p, count: E.count, status: E.status };
          if (E.scope === "one") q.date = packValidDay(E.date) || p.date;
          if (q.status === "bought" && q.date > today) q.date = today;
          if (stepChanged) { q.row = bu.row; delete q.extra; if (bu.choice) q.choice = bu.choice; else delete q.choice; }
          return q;
        });
        PUR_EDIT = null;
        savePackPurchases(); // also budgetInvalidate(): Budgets plans the rest again
        toast(t("pur_ed_saved"));
        redraw();
      }
    };
    const k = host.querySelector("[data-edk]");
    if (k) k.onchange = () => { E.k = Number(k.value); drawEdit(); };
    const pr = host.querySelector("[data-edprice]");
    if (pr) pr.onchange = () => {
      E.k = Number(pr.value);
      if (M.kind === "pick") E.pp = E.pp.map((j) => Math.min(j, M.steps[E.k].opts.length - 1));
      drawEdit();
    };
    const dt = host.querySelector("[data-eddate]");
    if (dt) dt.onchange = () => { if (packValidDay(dt.value)) E.date = dt.value; drawEdit(); };
  }
  const closeGrp = () => { PUR_GRP_OPEN = null; PUR_EDIT = null; if (grpEl) { grpEl.style.display = "none"; grpEl.innerHTML = ""; } };
  const openGrp = (id) => {
    if (!grpEl || !GROUPS.has(id)) { closeGrp(); return; }
    PUR_GRP_OPEN = id;
    grpEl.innerHTML = grpSheetHtml(id);
    grpEl.style.display = "flex";
    if (PUR_EDIT && PUR_EDIT.id === id) drawEdit();
  };
  if (grpEl) grpEl.onclick = (e) => {
    const id = PUR_GRP_OPEN;
    if (!id) return;
    if (e.target === grpEl || e.target.closest("[data-gsx]")) { closeGrp(); return; }
    if (e.target.closest("[data-pureditor]")) return; // the edit card wires its own buttons
    const { kind } = grpParts(id);
    const ed = e.target.closest("[data-puredit]");
    if (ed) { openEdit(id, ed.dataset.puredit || ""); return; }
    if (e.target.closest("[data-purgall]")) { grpAllBought(id); return; }
    if (e.target.closest("[data-purgdel]")) { grpRemoveAll(id); return; }
    const row0 = e.target.closest("[data-purid]");
    if (!row0) return;
    const pid = row0.dataset.purid, p1 = PACK_PURCHASES.list.find((p) => p.id === pid);
    if (!p1) return;
    const mv = e.target.closest("[data-purmove]");
    if (mv) {
      if (mv.dataset.purmove === "bought" && cntNow(p1) > 1) { openBoughtSheet(p1); return; }
      PACK_PURCHASES.list = PACK_PURCHASES.list.map((p) => (p.id === pid ? (mv.dataset.purmove === "bought" ? toBought(p) : { ...p, status: "planned" }) : p));
      savePackPurchases(); redraw(); return;
    }
    if (e.target.closest("[data-purdel]")) {
      // Bought: the Backpack question (Yes hide / No remove / Add the items).
      if (kind === "b") { openBoughtRemove([p1]); return; }
      PACK_PURCHASES.list = PACK_PURCHASES.list.filter((p) => p.id !== pid); savePackPurchases(); redraw();
    }
  };
  content.querySelectorAll("[data-purgrp]").forEach((ln) => {
    const id = ln.dataset.purgrp;
    ln.addEventListener("click", (e) => { if (e.target.closest("[data-purgmove]")) { e.stopPropagation(); grpAllBought(id); return; } if (!e.target.closest("button")) openGrp(id); });
    ln.addEventListener("keydown", (e) => { if ((e.key === "Enter" || e.key === " ") && !e.target.closest("button")) { e.preventDefault(); openGrp(id); } });
  });
  // Redrawn with a line's sheet open: open it again with the new numbers (gone → closed).
  if (PUR_GRP_OPEN) openGrp(PUR_GRP_OPEN);
  // A2: rows / "+ Add" open their sheet; ✕, the dim edge (or Esc) close it.
  content.querySelectorAll("[data-pursheet]").forEach((b) => b.addEventListener("click", () => showSheet(b.dataset.pursheet)));
  content.querySelectorAll("[data-pursh]").forEach((ov) => ov.addEventListener("click", (e) => { if (e.target === ov || e.target.closest("[data-purshx]")) showSheet(null); }));
  // Weekly cards: Hide / Show (saved on the account, calc_state bar_hidden).
  content.querySelectorAll("[data-purwcfold]").forEach((b) => b.addEventListener("click", () => {
    const f = BAR_SHOW_ALL[WC_KEY] === false; // open now → fold it
    if (f) delete BAR_SHOW_ALL[WC_KEY]; else BAR_SHOW_ALL[WC_KEY] = false;
    saveBarHidden();
    const box = b.closest("[data-purwc]");
    if (box) box.classList.toggle("folded", f);
    b.innerHTML = wcFoldHtml(f);
    b.setAttribute("aria-expanded", String(!f));
  }));
  // "Gen 15 heroes Dec 21 · change ›": the New heroes window over this page (Packs page's same content).
  content.querySelectorAll("[data-purngopen]").forEach((b) => b.addEventListener("click", () => openNewHeroesWindow((changed) => { if (changed) redraw(); })));
}
// − n + stepper. `attr` names the buttons' data attribute.
function purStepHtml(attr, n, max, min = 1) {
  return `<span class="pur-step"><button type="button" data-${attr}="-1" aria-label="−"${n <= min ? " disabled" : ""}>&minus;</button><b data-${attr}-n>${n}</b><button type="button" data-${attr}="1" aria-label="+"${n >= max ? " disabled" : ""}>+</button></span>`;
}
// The same, worked out from a combined plan (My Purchases opened before Budgets drew its goals).
function budgetGoalMatchFrom(pages, combined) {
  if (!combined || combined.pending || !combined.chosen || !pages) return null;
  const sp = combined.split && combined.split.target && combined.split.late ? combined.split : null;
  const inc = sp ? sp.target.keys.concat(sp.late.keys) : (combined.inc || []);
  const keys = inc.concat((combined.dropped || []).filter((k) => (!BUDGET_SELECTED || BUDGET_SELECTED[k] !== false) && !inc.includes(k)));
  const goals = budgetGoalList(pages, keys);
  if (!goals.length) return null;
  const dates = budgetGoalDates(goals, pages, combined.chosen, "__budget:" + keys.join(","), budgetGoalDue(goals));
  return budgetGoalMatcher(goals, dates, pages, combined.chosen);
}
const GOAL_MATCH_MEMO = new WeakMap();
// My Purchases: the matcher for its "for: <goal>" tags (goals are the owner's; null for others).
function purGoalMatch() {
  if (!visitorCan("goals") || !BUDGET_GOALS) return null;
  if (BUDGET_GOAL_MATCH) return BUDGET_GOAL_MATCH;
  const src = BUDGET_DATA && BUDGET_DATA.combined && !BUDGET_DATA.combined.pending ? BUDGET_DATA : PUR_GOAL_SRC;
  if (!src || !src.combined) return null;
  if (!GOAL_MATCH_MEMO.has(src.combined)) {
    let m = null;
    try { m = budgetGoalMatchFrom(src.pages, src.combined); } catch (e) { console.error("goal tags failed", e); }
    GOAL_MATCH_MEMO.set(src.combined, m);
  }
  return GOAL_MATCH_MEMO.get(src.combined);
}
function purGoalTagHtml(gm, gives, w) {
  const g = gm && gm(gives, w);
  if (!g) return "";
  return `<span class="pur-for" title="${esc(t("pur_for").replace("{goal}", g.name))}">${g.ic.src ? `<img class="${g.ic.face ? "face" : ""}" src="${esc(g.ic.src)}" alt="" loading="lazy" />` : ""}<span>${esc(t("pur_for").replace("{goal}", g.short))}</span></span>`;
}
