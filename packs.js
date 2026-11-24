// WOS RST: the Packs page, My packs and the Pack calendar.
// Loaded by app.js the first time one of those pages opens (loadCode("packs"),
// pageCodeReady), so visitors who never open them don't download it. A plain script:
// its functions and variables join app.js's. Only names used by these pages alone
// live here; anything another page (or admin.js / scan.js / the planner worker) uses
// stays in app.js. The site loads the packed copy packs.min.js (tools/stamp.js).
window.PACKS_BUILD = "f248b1fa8f";

// A one-time flag ("…_seeded"): like loadCalcState, but a failed read counts
// as "already done", so a network error can never make the Packs pages
// create the starter tables / templates a second time.
async function calcFlagSet(calcName) {
  await preloadCalcStates();
  if (CALC_STATE_CACHE && CALC_STATE_CACHE_USER === USER_ID && (CALC_STATE_CACHE[calcName] != null || !calcNotPreloaded(calcName))) return CALC_STATE_CACHE[calcName] != null;
  try {
    const rows = await sb(`calc_state?user_id=eq.${USER_ID}&calc_name=eq.${encodeURIComponent(calcName)}&select=calc_name`);
    return !Array.isArray(rows) || rows.length > 0;
  } catch (err) {
    return true;
  }
}




// ============================================================
// PACKS PAGE
// ============================================================
// Visitors: the dates of the packs the admin lets them change (their state's
// calendar, or when they start a card). Saved to their account.
let MY_DATES_PREVIEW_OPEN = (() => { try { return localStorage.getItem("my_pack_dates_open") === "1"; } catch (e) { return false; } })();
// ---- My packs -------------------------------------------------------------
const MP_PRICE_STEPS = [0.99, 2.99, 4.99, 9.99, 19.99, 49.99, 99.99];
function mpNum(v) { const n = parseFloat(String(v == null ? "" : v).replace(/[^0-9.-]/g, "")); return Number.isFinite(n) ? n : 0; }
function mpGems(price) { const k = Math.round(price * 100) / 100; return MP_GEMS[k] != null ? MP_GEMS[k] : Math.round((price + 0.01) * 500); }
let MY_PACKS_OPEN = new Set();
let MY_PACKS_SAVE_T = null;
function mpSaveSoon() { clearTimeout(MY_PACKS_SAVE_T); MY_PACKS_SAVE_T = setTimeout(() => { saveMyPacks(); }, 400); }
// Admin, once: copies Wishfull, Mix & Match and Lunar Amber Pack into the
// "Pack templates" category (a snapshot; your real tables stay separate).
async function packSeedTemplates(tables) {
  let made = 0, order = tables.length;
  for (const src of PACK_TEMPLATE_SOURCES) {
    const from = tables.find((tb) => src.from.some((n) => String(tb.title || "").trim().toLowerCase() === n.toLowerCase()));
    if (!from) continue;
    const payload = { title: src.title, columns: from.columns.slice(), rows: from.rows.map((r) => ({ ...r, cells: (r.cells || []).slice() })), sort_order: order++, scale_enabled: false, updated_at: new Date().toISOString() };
    try {
      const [saved] = await sb(`pack_tables`, { method: "POST", body: JSON.stringify({ user_id: USER_ID, ...payload }) });
      const l = JSON.parse(JSON.stringify(PACK_LINKS[String(from.id)] || { priceCol: 0, cols: {} }));
      delete l.linkSet; delete l.visitorDate; delete l.hideVisitors; delete l.dateWith; delete l.eventName;
      PACK_LINKS[String(saved.id)] = { ...l, group: PACK_TEMPLATE_GROUP, pages: [] };
      made++;
    } catch (e) { /* skip this one */ }
  }
  if (made) await savePackLinks();
  return made;
}
let PKB_OPEN_PENDING = null; // admin: the Packs page opens this pack's window once drawn
function mpIconHtml(name) {
  if (!name) return "";
  const icon = itemRegIcon(name) || (String(name).toLowerCase() === "gems" ? MATERIAL_ICONS.gems : "") || bpIcon({ name }) || materialIconSrc(name) || "";
  return icon ? `<img src="${esc(icon)}" alt="" loading="lazy" />` : "";
}
function mpRowIcon(names) { for (const n of names) { const h = mpIconHtml(n); if (h) return h; } return "&#127873;"; }
// The columns that are items (not the price, not Gems).
function mpItemCols(columns, link) {
  const pc = typeof link.priceCol === "number" ? link.priceCol : 0;
  const gc = columns.findIndex((c) => /gem/i.test(String(c || "")));
  return columns.map((_, ci) => ci).filter((ci) => ci !== pc && ci !== gc);
}
function mpWhenText(link) {
  const r = link.reset;
  if (r == null || r === "") return "";
  if (r === "unlimited") return t("pack_reset_unlimited");
  if (r === "once" || r >= PACK_ONE_TIME_DAYS) return t("pack_reset_once");
  if (packStackInfo(r)) return packStackText(r);
  const p = PACK_RESET_PRESETS.find((x) => x.days === r);
  return p ? t("pack_reset_" + p.key) : `${t("pack_reset_every")} ${r}${t("pack_days_short")}`;
}
// "QAR 18.99–364.99" in the shown currency (like the Packs rows).
function mpPriceText(rows, link) {
  const pc = typeof link.priceCol === "number" ? link.priceCol : 0, nums = [];
  (rows || []).forEach((r) => { const n = mpNum((r.cells || [])[pc]); if (n > 0) nums.push(n); });
  if (!nums.length) return "—";
  const lo = Math.min(...nums), hi = Math.max(...nums), plain = (x) => String(x).replace(/[⁦-⁩]/g, "");
  let txt = plain(packFmtMoney(lo, link.currency));
  if (hi > lo) { const c = packConvert(hi, link.currency); txt += `–${Number(c.n).toLocaleString(LANG === "en" ? undefined : LANG, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
  return bidiNum(txt);
}
function mpKindText(link) { return t("mp_kind_" + packTemplateKind(link)); }
// Plain names for the kinds (the person never sees the word "template").
const MP_KIND_KEYS = { regular: ["mpn_ladder", "mpn_ladder_d"], wishful: ["mpn_wishful", "mpn_wishful_d"], mixmatch: ["mpn_mix", "mpn_mix_d"] };
function mpKindName(link) { return t(MP_KIND_KEYS[packTemplateKind(link)][0]); }
function mpPagesUsed(link) {
  const pages = Array.isArray(link.pages) ? link.pages : [];
  const names = PACK_PAGE_GROUPS.filter((g) => g.pages.some((k) => pages.includes(k))).map(packGroupLabel);
  return names.length ? names : [t("mp_all_pages")];
}
function mpRowHtml(o) {
  return `<div class="pkb-row mpk-row${o.inB ? "" : " pkb-off"}" data-mprow="${esc(o.id)}" role="button" tabindex="0">
    <span class="pkb-ic">${mpRowIcon(o.names)}</span>
    <span class="pkb-m"><b>${esc(o.title)}</b><small>${esc([mpWhenText(o.link), mpKindText(o.link)].filter(Boolean).join(" · "))}</small><small class="mpk-used">${esc(o.used.join(" · "))}</small></span>
    <span class="pkb-r"><b>${esc(o.price)}</b></span>
    <label class="pkb-tk" title="${esc(t("pk_in_budgets_hint"))}"><input type="checkbox" data-mpbud="${esc(o.id)}" ${o.inB ? "checked" : ""} aria-label="${esc(t("pk_in_budgets"))}" /></label>
  </div>`;
}
// A copy of a template with the chosen items: the price and Gems columns stay
// (with every row's price and Gems), the item columns become `items` (amounts
// kept for an item that stays, empty for a new one).
function mpBuildFromTemplate(tb, link, items) {
  const pc = typeof link.priceCol === "number" ? link.priceCol : 0;
  const gc = tb.columns.findIndex((c) => /gem/i.test(String(c || "")));
  const itemIdx = tb.columns.map((_, ci) => ci).filter((ci) => ci !== pc && ci !== gc);
  const at = itemIdx.length ? itemIdx[0] : (gc >= 0 ? gc : tb.columns.length);
  const out = [];
  let put = false;
  const putItems = () => { if (put) return; put = true; items.forEach((it) => out.push({ name: it.name, src: it.from != null && it.from >= 0 ? it.from : -1 })); };
  tb.columns.forEach((c, ci) => { if (ci === pc || ci === gc) { if (ci >= at) putItems(); out.push({ name: c, src: ci }); } });
  putItems();
  const map = {};
  out.forEach((o, i) => { if (o.src >= 0) map[o.src] = i; });
  const l = { ...link, priceCol: map[pc] != null ? map[pc] : 0, cols: {} };
  if (l.daily && Array.isArray(l.daily.cols)) l.daily = { ...l.daily, cols: l.daily.cols.filter((n) => map[n] != null).map((n) => map[n]) };
  return {
    columns: out.map((o) => o.name),
    rows: tb.rows.map((r) => ({ ...r, cells: out.map((o) => (o.src >= 0 ? String((r.cells || [])[o.src] ?? "") : "")) })),
    link: l,
  };
}
// Admin: a pack of yours opens in the Packs window (its editor lives there).
// The window takes the Packs page's history entry, so Back returns to My packs.
function mpOpenOnPacks(id) {
  PKB_OPEN_PENDING = String(id);
  const g = packLinkFor(id).group;
  try { localStorage.setItem("packs_filter", g ? "cat:" + g : "all"); } catch (e) { /* blocked */ }
  goToTab("packs");
}
async function renderMyPacksPageMain() {
  const seq = RENDER_SEQ;
  const hs = history.state;
  MPW_OPEN = hs && hs.tab === "mypacks" && hs.mpw ? String(hs.mpw) : null;
  content.innerHTML = `
    <div class="page-head"><div><h2>${esc(t("mp_title"))}</h2><p class="desc">${esc(IS_OWNER ? t("mp_page_desc_admin") : t("mpk_desc"))}</p></div></div>
    <div id="myPacksBody"><div class="empty">Loading&hellip;</div></div>`;
  const [loaded] = await Promise.all([
    packTablesRows(),
    ensurePackLinks(),
  ]);
  if (seq !== RENDER_SEQ || TAB !== "mypacks") return;
  let all = (loaded || []).filter((tb) => IS_OWNER || !packLinkFor(tb.id).hideVisitors);
  let templates = all.filter((tb) => packLinkFor(tb.id).template);
  if (IS_OWNER && !templates.length && !(await calcFlagSet("pack_templates_seeded"))) {
    if (seq !== RENDER_SEQ) return;
    const made = await packSeedTemplates(all);
    saveCalcState("pack_templates_seeded", { at: Date.now(), made });
    if (seq !== RENDER_SEQ) return;
    if (made) { toast(`${made} ${t("mp_templates_added")}`); return renderMyPacksPage(); }
  }
  PACK_TABLES_ALL = PACK_TABLES_ALL || all;
  renderMyPacks(document.getElementById("myPacksBody"), templates, renderMyPacksPage, all);
}
function renderMyPacks(el, templates, rerenderPage, allTables) {
  if (!el) return;
  const own = IS_OWNER;
  const limit = packMyPacksLimit();
  const mine = own ? (allTables || []).filter((tb) => packLinkForBase(tb.id).group === PACK_MINE_GROUP) : MY_PACKS;
  const used = mine.length, full = !own && used >= limit;
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 100;
  if (MPW_OPEN && (own || !packMineFind(MPW_OPEN))) MPW_OPEN = null;
  const rowsHtml = mine.map((tb) => {
    const link = own ? packLinkForBase(tb.id) : (tb.link || {});
    const eff = own ? packEffectiveCols(tb) : [];
    const names = mpItemCols(tb.columns, link).map((ci) => eff[ci] || String(tb.columns[ci] || ""));
    return mpRowHtml({ id: String(tb.id), title: tb.title, names, link, used: mpPagesUsed(link), price: mpPriceText(tb.rows, link), inB: packInBudgets(tb.id) });
  }).join("");
  const tplHtml = templates.map((tb) => {
    const link = packLinkForBase(tb.id), eff = packEffectiveCols(tb);
    const names = mpItemCols(tb.columns, link).map((ci) => eff[ci] || String(tb.columns[ci] || ""));
    return `<div class="mpk-tpl-r"><span class="pkb-ic">${mpRowIcon(names)}</span>
      <span class="pkb-m"><b>${esc(mpKindName(link))}</b><small>${esc(tb.title)} · ${esc(mpKindText(link))}</small></span>
      <span class="mpk-tpl-b">${own
        ? `<button type="button" class="btn small ghost" data-mpaedit>${esc(t("pk_edit"))}</button><button type="button" class="btn small ghost" data-mpadup="${esc(tb.id)}">${esc(t("mp_duplicate"))}</button>`
        : `<button type="button" class="btn small ghost" data-mpdup="${esc(tb.id)}" ${full ? "disabled" : ""}>${esc(t("mp_duplicate"))}</button>`}</span></div>`;
  }).join("");
  const tplOpen = (() => { try { return localStorage.getItem("mpk_tpl_open") === "1"; } catch (e) { return false; } })();
  el.innerHTML = `<div class="panel mpk-top">
      <div class="mpk-k"><span>${esc(t("mp_your_tables"))}</span><span class="mpk-cnt">${own || !limit
        ? esc(used === 1 ? t("mpk_1_pack") : t("mpk_n_packs").replace("{n}", used))
        : `<b>${used}</b> ${esc(t("mpk_of_used").replace("{m}", limit))}`}</span></div>
      ${own || !limit ? "" : `<div class="mpk-bar"><i style="width:${pct}%;${full ? " background:var(--danger);" : ""}"></i></div>`}
      <button type="button" class="btn mpk-new" data-mpnew ${full || !templates.length ? "disabled" : ""}>+ ${esc(t("mpk_new"))}</button>
      <div class="meta mpk-d"${full ? ` style="color:var(--danger);"` : ""}>${esc(full ? t("mp_full").replace("{n}", limit) : t("mpk_new_d"))}</div>
    </div>
    <div class="mpk-h"><span>${esc(t("mpk_your_packs"))}</span>${used ? `<span>${esc(t("pk_in_budgets"))}</span>` : ""}</div>
    ${used ? `<div class="pkb-cat open mpk-list">${rowsHtml}</div><div class="meta mpk-tap">${esc(t(own ? "mpk_tap_admin" : "mpk_tap"))}</div>` : `<div class="empty mpk-empty">${esc(t("mpk_empty"))}</div>`}
    <details class="pkb-cat mpk-fold" data-mpktpl${tplOpen ? " open" : ""}>
      <summary class="pkb-cat-h"><span class="pkb-n">${templates.length}</span><span class="pkb-cat-t"><b>${esc(t("mpk_kinds"))}</b><small>${esc(own ? t("mp_template_note") : t("mpk_kinds_d"))}</small></span><span class="pkb-caret" aria-hidden="true">&#9656;</span></summary>
      ${tplHtml || `<div class="meta pkb-note">${esc(t("mp_no_templates"))}</div>`}
      ${own ? `<div class="meta pkb-note">${esc(t("mp_template_edit_hint"))}</div>` : ""}
    </details>
    ${own ? `<details class="pkb-cat mpk-fold">
      <summary class="pkb-cat-h"><span class="pkb-n">&#9881;</span><span class="pkb-cat-t"><b>${esc(t("mp_admin_settings"))}</b><small>${esc(t("mp_limit_label"))}: ${limit}</small></span><span class="pkb-caret" aria-hidden="true">&#9656;</span></summary>
      <div class="mpk-adm"><label class="pkb-budrow"><span>${esc(t("mp_limit_label"))}</span><input type="number" min="0" max="50" step="1" class="keep-w" data-mplimit value="${limit}" /></label><div class="meta">${esc(t("mp_admin_desc"))}</div></div>
    </details>` : ""}
    ${used ? `<div class="mpk-speed">&#9201; ${esc(t("mpk_speed"))}</div>` : ""}
    ${MPW_OPEN ? mpWindowHtml(packMineFind(MPW_OPEN)) : ""}
    <div id="mpNewHost"></div>`;
  const redraw = () => {
    const b = el.querySelector(".mpw-panel > .pk-body"), st = b ? b.scrollTop : 0;
    keepBoxes(el, () => renderMyPacks(el, templates, rerenderPage, allTables));
    const b2 = el.querySelector(".mpw-panel > .pk-body");
    if (b2) b2.scrollTop = st;
  };
  const changed = (redrawToo) => { mpSaveSoon(); PACK_PLAN_CACHE.clear(); PACK_TABLES_CACHE = PACK_TABLES_STASH = null; if (typeof budgetInvalidate === "function") budgetInvalidate(); if (redrawToo) setTimeout(redraw, 0); };
  // The window (visitors) has its own history entry: Back / ‹ / Esc / the dim edge close it.
  const mpwOpen = (id) => {
    MPW_OPEN = String(id);
    if (!(history.state && history.state.tab === "mypacks" && history.state.mpw === MPW_OPEN)) history.pushState({ tab: "mypacks", mpw: MPW_OPEN }, "", location.pathname + location.search);
    redraw();
    const b = el.querySelector(".mpw-panel > .pk-body");
    if (b) b.scrollTop = 0;
  };
  const mpwClose = () => {
    if (history.state && history.state.tab === "mypacks" && history.state.mpw) { history.back(); return; }
    MPW_OPEN = null;
    redraw();
  };
  MPW_HOOK = {
    history: (id) => { MPW_OPEN = id && packMineFind(id) ? String(id) : null; redraw(); },
    close: mpwClose,
    closeNew: () => { MP_NEW = null; drawNew(); },
  };
  const fold = el.querySelector("[data-mpktpl]");
  if (fold) fold.addEventListener("toggle", () => { try { localStorage.setItem("mpk_tpl_open", fold.open ? "1" : "0"); } catch (e) { /* blocked */ } });
  // Count in Budgets: the row's tick and the window's switch.
  el.querySelectorAll("[data-mpbud]").forEach((cb) => cb.addEventListener("change", () => {
    const id = cb.dataset.mpbud;
    if (cb.checked) delete PACK_BUDGET_OFF[id]; else PACK_BUDGET_OFF[id] = true;
    saveCalcState("pack_budget_off", PACK_BUDGET_OFF);
    PACK_PLAN_CACHE.clear();
    if (typeof budgetInvalidate === "function") budgetInvalidate();
    el.querySelectorAll(`[data-mpbud="${window.CSS.escape(id)}"]`).forEach((x) => { x.checked = cb.checked; const row = x.closest(".pkb-row"); if (row) row.classList.toggle("pkb-off", !cb.checked); });
  }));
  el.querySelectorAll("[data-mprow]").forEach((row) => {
    const go = () => (own ? mpOpenOnPacks(row.dataset.mprow) : mpwOpen(row.dataset.mprow));
    row.addEventListener("click", (e) => { if (e.target.closest(".pkb-tk")) return; go(); });
    row.addEventListener("keydown", (e) => { if ((e.key === "Enter" || e.key === " ") && !e.target.closest(".pkb-tk")) { e.preventDefault(); go(); } });
  });
  const ov = el.querySelector("[data-mpwov]");
  if (ov) ov.addEventListener("click", (e) => { if (e.target === ov || e.target.closest("[data-mpwclose]")) mpwClose(); });
  // ---- "+ New pack" (P2): kind, name & pages, items ----
  const host = el.querySelector("#mpNewHost");
  const tplOf = (id) => templates.find((x) => String(x.id) === String(id));
  const itemsOf = (tb) => { const link = packLinkForBase(tb.id), eff = packEffectiveCols(tb); return mpItemCols(tb.columns, link).map((ci) => ({ name: eff[ci] || String(tb.columns[ci] || ""), from: ci })); };
  const defName = (tb) => `${String(tb.title).replace(/\s*type$/i, "")} (${t("mp_mine_suffix")})`;
  const pickTpl = (tb) => {
    MP_NEW.tpl = String(tb.id);
    MP_NEW.items = itemsOf(tb);
    if (!MP_NEW.named) MP_NEW.title = defName(tb);
  };
  function drawNew() {
    if (!host) return;
    if (!MP_NEW) { host.innerHTML = ""; return; }
    host.innerHTML = mpNewHtml(templates);
    const nm = host.querySelector("[data-mpnname]");
    if (nm) nm.addEventListener("input", () => { MP_NEW.title = nm.value; MP_NEW.named = true; });
  }
  host.onclick = async (e) => {
    if (!MP_NEW) return;
    if (e.target.matches("[data-mpnov]") || e.target.closest("[data-mpnclose]")) { MP_NEW = null; drawNew(); return; }
    const k = e.target.closest("[data-mpnkind]");
    if (k) { const tb = tplOf(k.dataset.mpnkind); if (tb) { pickTpl(tb); drawNew(); } return; }
    const pg = e.target.closest("[data-mpnpg]");
    if (pg) {
      const key = pg.dataset.mpnpg, i = MP_NEW.groups.indexOf(key);
      if (i >= 0) MP_NEW.groups.splice(i, 1); else MP_NEW.groups.push(key);
      pg.classList.toggle("on", i < 0); pg.setAttribute("aria-pressed", String(i < 0));
      return;
    }
    const rm = e.target.closest("[data-mpnrm]");
    if (rm) { if (MP_NEW.items.length > 1) { MP_NEW.items.splice(Number(rm.dataset.mpnrm), 1); drawNew(); } return; }
    if (e.target.closest("[data-mpnadd]")) {
      const have = new Set(MP_NEW.items.map((x) => String(x.name).toLowerCase()));
      const name = packResourceChoices("").find((n) => !have.has(n.toLowerCase())) || "Item";
      MP_NEW.items.push({ name, from: -1 });
      drawNew();
      return;
    }
    if (e.target.closest("[data-mpnback]")) { MP_NEW.step = Math.max(1, MP_NEW.step - 1); drawNew(); return; }
    if (e.target.closest("[data-mpnnext]")) { MP_NEW.step = Math.min(3, MP_NEW.step + 1); drawNew(); const f = host.querySelector("[data-mpnname]"); if (f && matchMedia("(min-width: 701px)").matches) f.focus(); return; }
    const mk = e.target.closest("[data-mpnmake]");
    if (mk) { mk.disabled = true; await mpCreate(); }
  };
  host.onchange = (e) => {
    const sel = e.target.closest("[data-mpnit]");
    if (!sel || !MP_NEW) return;
    const it = MP_NEW.items[Number(sel.dataset.mpnit)];
    if (it && it.name !== sel.value) { it.name = sel.value; it.from = -1; drawNew(); }
  };
  async function mpCreate() {
    const s = MP_NEW, tb = s && tplOf(s.tpl);
    if (!tb) return;
    const src = JSON.parse(JSON.stringify((PACK_LINKS || {})[String(tb.id)] || { priceCol: 0, cols: {} }));
    const built = mpBuildFromTemplate(tb, src, s.items.filter((x) => x && x.name));
    const pages = [];
    PACK_PAGE_GROUPS.filter((g) => s.groups.includes(g.key)).forEach((g) => g.pages.forEach((k) => { if (!pages.includes(k)) pages.push(k); }));
    const title = (String(s.title || "").trim() || defName(tb)).slice(0, 60);
    if (own) {
      const payload = { title, columns: built.columns, rows: built.rows, sort_order: (allTables || []).length, scale_enabled: false, updated_at: new Date().toISOString() };
      try {
        const [saved] = await sb(`pack_tables`, { method: "POST", body: JSON.stringify({ user_id: USER_ID, ...payload }) });
        PACK_LINKS[String(saved.id)] = { ...built.link, group: PACK_MINE_GROUP, hideVisitors: true, pages };
        await savePackLinks();
        PACK_TABLES_CACHE = PACK_TABLES_STASH = null;
        PACK_PLAN_CACHE.clear();
        if (typeof budgetInvalidate === "function") budgetInvalidate();
        MP_NEW = null;
        toast(t("mpk_made"));
        mpOpenOnPacks(saved.id);
      } catch (err) { toast("Couldn't make that pack", true); drawNew(); }
      return;
    }
    if (MY_PACKS.length >= packMyPacksLimit()) { MP_NEW = null; redraw(); return; }
    const link = built.link;
    delete link.group; delete link.linkSet; delete link.visitorDate; delete link.hideVisitors; delete link.dateWith; delete link.eventName;
    const mp = { id: "my-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), from: tb.title, title, columns: built.columns, rows: built.rows.map((r) => ({ cells: r.cells })), link: { ...link, pages } };
    MY_PACKS.push(mp);
    MP_NEW = null;
    changed(false);
    toast(t("mpk_made"));
    mpwOpen(mp.id);
  }
  const newBtn = el.querySelector("[data-mpnew]");
  if (newBtn) newBtn.addEventListener("click", () => {
    if (!templates.length || (!own && MY_PACKS.length >= packMyPacksLimit())) return;
    const first = templates.find((tb) => packTemplateKind(packLinkForBase(tb.id)) === "regular") || templates[0];
    MP_NEW = { step: 1, tpl: null, title: "", named: false, groups: [], items: [] };
    pickTpl(first);
    drawNew();
  });
  drawNew();
  if (own) {
    const inp = el.querySelector("[data-mplimit]");
    if (inp) inp.addEventListener("change", async () => {
      const n = Math.max(0, Math.min(50, Math.floor(Number(inp.value) || 0)));
      inp.value = n;
      PACK_LINKS.__settings = { ...(PACK_LINKS.__settings || {}), myPacksLimit: n };
      await savePackLinks();
      toast(t("mp_limit_saved"));
    });
    // Templates are not listed on the Packs page; Edit opens just them there.
    el.querySelectorAll("[data-mpaedit]").forEach((b) => b.addEventListener("click", () => { try { localStorage.setItem("packs_filter", "cat:" + PACK_TEMPLATE_GROUP); } catch (e) {} goToTab("packs"); }));
    el.querySelectorAll("[data-mpadup]").forEach((b) => b.addEventListener("click", async () => {
      const tb = templates.find((x) => String(x.id) === b.dataset.mpadup);
      if (!tb) return;
      b.disabled = true;
      const payload = { title: defName(tb), columns: tb.columns.slice(), rows: tb.rows.map((r) => ({ ...r, cells: (r.cells || []).slice() })), sort_order: (allTables || []).length, scale_enabled: false, updated_at: new Date().toISOString() };
      try {
        const [saved] = await sb(`pack_tables`, { method: "POST", body: JSON.stringify({ user_id: USER_ID, ...payload }) });
        const src = JSON.parse(JSON.stringify(PACK_LINKS[String(tb.id)] || { priceCol: 0, cols: {} }));
        PACK_LINKS[String(saved.id)] = { ...src, group: PACK_MINE_GROUP, hideVisitors: true, pages: [] };
        await savePackLinks();
        PACK_TABLES_CACHE = PACK_TABLES_STASH = null;
        toast(t("mp_admin_copied"));
        mpOpenOnPacks(saved.id);
      } catch (err) { b.disabled = false; toast("Couldn't duplicate table", true); }
    }));
    return;
  }
  el.querySelectorAll("[data-mpdup]").forEach((b) => b.addEventListener("click", () => {
    if (MY_PACKS.length >= packMyPacksLimit()) return;
    const tb = templates.find((x) => String(x.id) === b.dataset.mpdup);
    if (!tb) return;
    const src = JSON.parse(JSON.stringify((PACK_LINKS || {})[String(tb.id)] || {}));
    delete src.group; delete src.linkSet; delete src.visitorDate; delete src.hideVisitors; delete src.dateWith; delete src.eventName;
    const mp = { id: "my-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), from: tb.title, title: defName(tb), columns: tb.columns.slice(), rows: tb.rows.map((r) => ({ cells: (r.cells || []).slice() })), link: { ...src, pages: [], cols: {} } };
    MY_PACKS.push(mp);
    MY_PACKS_OPEN.add(mp.id);
    changed(false);
    mpwOpen(mp.id);
  }));
  el.querySelectorAll("[data-mpcard]").forEach((card) => {
    const mp = packMineFind(card.dataset.mpcard);
    if (!mp) return;
    const link = (mp.link = mp.link || {});
    const priceCol = typeof link.priceCol === "number" ? link.priceCol : 0;
    const gemsCi = () => mp.columns.findIndex((c) => /gem/i.test(String(c || "")));
    card.querySelector("[data-mpdel]").addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      if (!confirm(t("mp_delete_confirm").replace("{t}", mp.title))) return;
      MY_PACKS = MY_PACKS.filter((x) => x !== mp);
      changed(false);
      mpwClose();
    });
    const title = card.querySelector("[data-mptitle]");
    title.addEventListener("change", () => { mp.title = title.value.trim().slice(0, 60) || mp.from || "My pack"; changed(true); });
    card.querySelectorAll("[data-mpcell]").forEach((inp) => inp.addEventListener("change", () => {
      const n = Math.max(0, Math.round(mpNum(inp.value)));
      inp.value = n ? n.toLocaleString() : "";
      mp.rows[Number(inp.dataset.row)].cells[Number(inp.dataset.col)] = n ? String(n) : "";
      changed(false);
    }));
    card.querySelectorAll("[data-mpcol]").forEach((sel) => sel.addEventListener("change", () => { mp.columns[Number(sel.dataset.mpcol)] = sel.value; changed(true); }));
    card.querySelectorAll("[data-mprowmax]").forEach((inp) => inp.addEventListener("change", () => {
      const ri = Number(inp.dataset.mprowmax), n = Math.floor(Number(inp.value) || 0);
      link.rowMax = { ...(link.rowMax || {}) };
      if (n > 1) link.rowMax[ri] = n; else { delete link.rowMax[ri]; inp.value = ""; }
      changed(false);
    }));
    card.querySelectorAll("[data-mppage]").forEach((cb) => cb.addEventListener("change", () => {
      const g = PACK_PAGE_GROUPS.find((x) => x.key === cb.dataset.mppage);
      let pages = Array.isArray(link.pages) ? link.pages.slice() : [];
      if (cb.checked) g.pages.forEach((k) => { if (!pages.includes(k)) pages.push(k); }); else pages = pages.filter((k) => !g.pages.includes(k));
      link.pages = pages;
      changed(true);
    }));
    const date = card.querySelector("[data-mpdate]");
    if (date) date.addEventListener("change", () => { if (packValidDay(date.value)) link.resetDay = date.value; else delete link.resetDay; changed(false); });
    card.querySelector("[data-mpaddcol]").addEventListener("click", () => {
      const have = new Set(mp.columns.map((c) => (packResourceByName(c) || String(c)).toLowerCase()));
      const name = packResourceChoices("").find((n) => !have.has(n.toLowerCase())) || packResourceChoices("")[0] || "Item";
      const at = gemsCi() >= 0 ? gemsCi() : mp.columns.length;
      mp.columns.splice(at, 0, name);
      mp.rows.forEach((r) => r.cells.splice(at, 0, ""));
      changed(true);
    });
    card.querySelector("[data-mpdelcol]").addEventListener("click", () => {
      const g = gemsCi();
      const res = mp.columns.map((c, ci) => ci).filter((ci) => ci !== priceCol && ci !== g);
      if (res.length <= 1) return;
      const ci = res[res.length - 1];
      mp.columns.splice(ci, 1);
      mp.rows.forEach((r) => r.cells.splice(ci, 1));
      changed(true);
    });
    card.querySelector("[data-mpaddrow]").addEventListener("click", () => {
      const last = mp.rows[mp.rows.length - 1];
      const top = Math.max(0, ...mp.rows.map((r) => mpNum(r.cells[priceCol])));
      const next = MP_PRICE_STEPS.find((v) => v > top + 0.001);
      if (next == null) return;
      const ratio = top > 0 ? mpGems(next) / mpGems(top) : 1;
      const g = gemsCi();
      const cells = mp.columns.map((_, ci) => {
        if (ci === priceCol) return String(next);
        if (ci === g) return mpGems(next).toLocaleString();
        const v = last ? mpNum(last.cells[ci]) : 0;
        return v ? String(Math.round(v * ratio)) : "";
      });
      mp.rows.push({ cells });
      changed(true);
    });
    card.querySelector("[data-mpdelrow]").addEventListener("click", () => {
      if (mp.rows.length <= 1) return;
      mp.rows.pop();
      if (link.rowMax) delete link.rowMax[mp.rows.length];
      changed(true);
    });
    // "Fill from step 1": every later step = step 1 × the price's tier (like Gems:
    // 4.99 → 9.99 is ×2), the price and Gems stay.
    card.querySelector("[data-mpfill]").addEventListener("click", () => {
      const g = gemsCi(), p0 = mpNum((mp.rows[0] || { cells: [] }).cells[priceCol]);
      if (!p0) return;
      const res = mp.columns.map((c, ci) => ci).filter((ci) => ci !== priceCol && ci !== g);
      mp.rows.forEach((r, ri) => {
        if (!ri) return;
        const ratio = mpGems(mpNum(r.cells[priceCol])) / mpGems(p0);
        res.forEach((ci) => { const v = mpNum(mp.rows[0].cells[ci]); r.cells[ci] = v ? String(Math.round(v * ratio)) : ""; });
      });
      changed(true);
    });
  });
}
// P3 (visitors): the pack's window. The steps are the sideways table the Packs
// window uses (every pack keeps the table): one row per price
// step, one column per item with its picture as the header (tap = the item list,
// a see-through select over the picture), the price column fixed, + Item / − in
// the header, + Step / − / Fill from step 1 under it, then Used for chips, Count
// in Budgets, next date. Every box keeps the old data-mp* attribute, so the save
// code is the old one.
function mpWindowHtml(mp) {
  if (!mp) return "";
  const link = mp.link || {};
  const priceCol = typeof link.priceCol === "number" ? link.priceCol : 0;
  const gemsCi = mp.columns.findIndex((c) => /gem/i.test(String(c || "")));
  const top = Math.max(0, ...mp.rows.map((r) => mpNum(r.cells[priceCol])));
  const canRow = MP_PRICE_STEPS.some((v) => v > top + 0.001);
  const resCols = mp.columns.map((c, ci) => ci).filter((ci) => ci !== priceCol && ci !== gemsCi);
  const pages = Array.isArray(link.pages) ? link.pages : [];
  const numericReset = typeof link.reset === "number";
  const nameOf = (ci) => packResourceByName(mp.columns[ci]) || String(mp.columns[ci] || "");
  const cur = link.currency || "USD";
  const gemsName = gemsCi >= 0 ? (materialDisplayName(mp.columns[gemsCi]) || "Gems") : "";
  const money = (r) => packFmtMoney(mpNum(r.cells[priceCol]), cur);
  const headItem = (ci) => {
    const nm = nameOf(ci), known = packResourceChoices(nm), lbl = materialDisplayName(nm) || nm || "?";
    const ic = mpIconHtml(nm);
    return `<th class="mpt-th mpt-it" title="${esc(lbl)}"><span class="mpt-hd">${ic || `<b>${esc(String(lbl).slice(0, 3))}</b>`}<span class="mpt-cv" aria-hidden="true">&#9662;</span>
      <select data-mpcol="${ci}" class="pack-col-pick keep-w mpt-sel" aria-label="${esc(lbl)}">
      ${known.map((n) => `<option value="${esc(n)}" ${n.toLowerCase() === nm.toLowerCase() ? "selected" : ""}>${esc(materialDisplayName(n))}</option>`).join("")}
      ${known.some((n) => n.toLowerCase() === nm.toLowerCase()) || !nm ? "" : `<option value="${esc(nm)}" selected>${esc(nm)}</option>`}
    </select></span><span class="mpt-nm">${esc(lbl)}</span></th>`;
  };
  const row = (r, ri) => `<tr>
      <td class="mpt-pr"><b>${esc(money(r))}</b></td>
      ${resCols.map((ci) => `<td class="mpt-c"><input inputmode="numeric" class="keep-w" data-mpcell data-row="${ri}" data-col="${ci}" value="${esc(mpNum(r.cells[ci]) ? Number(mpNum(r.cells[ci])).toLocaleString() : "")}" aria-label="${esc(materialDisplayName(nameOf(ci)))} · ${esc(money(r))}" /></td>`).join("")}
      ${gemsCi >= 0 ? `<td class="mpt-gm">${esc(mpNum(r.cells[gemsCi]) ? Number(mpNum(r.cells[gemsCi])).toLocaleString() : "")}</td>` : ""}
      <td class="mpt-mx"><input type="number" min="1" step="1" data-mprowmax="${ri}" class="keep-w" value="${esc((link.rowMax || {})[ri] || "")}" placeholder="1" aria-label="${esc(t("mp_max"))} · ${esc(money(r))}" /></td>
      <td class="mpt-ad"></td>
    </tr>`;
  const table = `<div class="pk-tbl-wrap mpt-wrap"><table class="mpt">
      <thead><tr>
        <th class="mpt-th mpt-pr">${esc(cur === "USD" ? "$" : cur)}</th>
        ${resCols.map(headItem).join("")}
        ${gemsCi >= 0 ? `<th class="mpt-th mpt-gm" title="${esc(gemsName)}"><span class="mpt-hd">${mpIconHtml(mp.columns[gemsCi]) || esc(gemsName)}</span><span class="mpt-nm">${esc(gemsName)}</span></th>` : ""}
        <th class="mpt-th mpt-mx">${esc(t("mp_max"))}</th>
        <th class="mpt-th mpt-ad"><span class="mpt-adb"><button type="button" class="pkc-chip pkc-add" data-mpaddcol>+ ${esc(t("pkc_item"))}</button><button type="button" class="pkc-chip pkc-add" data-mpdelcol ${resCols.length <= 1 ? "disabled" : ""} aria-label="${esc(t("pkc_del_item"))}" title="${esc(t("pkc_del_item"))}">&minus;</button></span></th>
      </tr></thead>
      <tbody>${mp.rows.map(row).join("")}</tbody>
    </table></div>`;
  const when = [mpWhenText(link), mpKindText(link)].filter(Boolean).join(" · ");
  return `<div class="pkb-ov mpw-ov" data-mpwov><div class="pkb-panel mpw-panel" role="dialog" aria-label="${esc(mp.title)}" data-mpcard="${esc(mp.id)}"><div class="pk-body">
    <div class="pk-ed-bar mpw-bar"><button type="button" class="pkb-back" data-mpwclose aria-label="${esc(t("close_button"))}">&#8249;</button><input data-mptitle value="${esc(mp.title)}" maxlength="60" aria-label="${esc(mp.title)}" /><span class="mpw-tag">${esc(t("mp_tag"))}</span><button type="button" class="btn small ghost mpw-del" data-mpdel="${esc(mp.id)}">${esc(t("mp_delete"))}</button>${when ? `<div class="pkb-when">${esc(when)}</div>` : ""}</div>
    <div class="pkc-k">${esc(t("pkc_steps"))} · ${esc(mpKindText(link))}</div>
    ${table}
    <div class="pkc-acts"><button type="button" class="btn ghost" data-mpaddrow ${canRow ? "" : "disabled"}>+ ${esc(t("pkc_step"))}</button><button type="button" class="btn ghost pkc-sm" data-mpdelrow ${mp.rows.length <= 1 ? "disabled" : ""} aria-label="${esc(t("pkc_del_step"))}" title="${esc(t("pkc_del_step"))}">&minus;</button><button type="button" class="btn ghost" data-mpfill>${esc(t("pkc_fill"))}</button></div>
    ${canRow ? "" : `<div class="meta pkc-note" style="color:var(--danger);">${esc(t("mp_row_top"))}</div>`}
    <div class="meta pkc-note">${esc(t("mp_row_hint"))}</div>
    <div class="pkb-sec">
      <div class="pkb-used"><span class="pkb-k">${esc(t("mp_used_for"))}</span><div class="mpk-pgs">${PACK_PAGE_GROUPS.map((g) => `<label class="pks-chip"><input type="checkbox" data-mppage="${esc(g.key)}" ${g.pages.some((k) => pages.includes(k)) ? "checked" : ""} /><span>${esc(packGroupLabel(g))}</span></label>`).join("")}</div>${pages.length ? "" : `<div class="meta pkc-note">${esc(t("mp_all_pages"))}</div>`}</div>
      <label class="pkb-budrow"><span>${esc(t("pk_in_budgets"))}</span><input type="checkbox" class="bset-sw" data-mpbud="${esc(mp.id)}" ${packInBudgets(mp.id) ? "checked" : ""} /></label>
      ${numericReset ? `<label class="pkb-budrow mpk-next"><span>${esc(t("pkc_next_on"))}<small class="meta">${esc(t("mp_every_days").replace("{n}", link.reset))}</small></span><input type="date" class="keep-w" data-mpdate value="${esc(packValidDay(link.resetDay) || "")}" /></label>` : ""}
    </div>
    <div class="meta pkc-note">&#128274; ${esc(t("mpk_locked"))}</div>
  </div></div></div>`;
}
// P2: the "+ New pack" sheet.
function mpNewHtml(templates) {
  const s = MP_NEW, tb = templates.find((x) => String(x.id) === String(s.tpl));
  if (!tb) return "";
  const subs = ["mpn_s1", "mpn_s2", "mpn_s3"], tabs = ["mpn_tab1", "mpn_tab2", "mpn_tab3"];
  const price2 = (n) => Number(n).toFixed(2);
  const kindCard = (x) => {
    const link = packLinkForBase(x.id), kind = packTemplateKind(link), eff = packEffectiveCols(x), pc = link.priceCol || 0;
    const names = mpItemCols(x.columns, link).map((ci) => eff[ci] || String(x.columns[ci] || ""));
    const prices = x.rows.map((r) => mpNum((r.cells || [])[pc])).filter((n) => n > 0);
    const picks = Math.max(1, Number(link.pickCols) || 0);
    const ex = kind === "regular" ? prices.slice(0, 5).map((n) => `<i>${price2(n)}</i>`).join("")
      : kind === "wishful" ? `<i class="b">${esc(t("mpn_pick").replace("{n}", picks))}</i><em>&#8594;</em>${prices.slice(0, 3).map((n) => `<i>${price2(n)}</i>`).join("")}${prices.length > 3 ? "<i>&hellip;</i>" : ""}`
      : `<i class="b">${esc(t("mpn_pick").replace("{n}", picks))}</i><em>&middot;</em><i class="b">${esc(t("mpn_any"))}</i>`;
    const on = String(x.id) === String(s.tpl);
    const many = templates.filter((y) => packTemplateKind(packLinkForBase(y.id)) === kind).length > 1;
    return `<button type="button" class="mpn-kind${on ? " on" : ""}" data-mpnkind="${esc(x.id)}" aria-pressed="${on}">
      <span class="pkb-ic">${mpRowIcon(names)}</span>
      <span class="mpn-kt"><b>${esc(t(MP_KIND_KEYS[kind][0]))}${many ? ` · ${esc(x.title)}` : ""}${kind === "regular" ? ` <u>${esc(t("mpn_most"))}</u>` : ""}</b>
        <small>${esc(t(MP_KIND_KEYS[kind][1]).replace("{n}", picks))}</small>
        <span class="mpn-ex">${ex}</span></span>
      <span class="mpn-ck" aria-hidden="true">${on ? "&#10003;" : ""}</span></button>`;
  };
  let body = "";
  const kOrd = { regular: 0, wishful: 1, mixmatch: 2 };
  if (s.step === 1) body = `${templates.slice().sort((a, b) => kOrd[packTemplateKind(packLinkForBase(a.id))] - kOrd[packTemplateKind(packLinkForBase(b.id))]).map(kindCard).join("")}<div class="meta mpn-note">${esc(t("mpn_note1"))}</div>`;
  else if (s.step === 2) body = `<label class="mpn-f"><span class="pkb-k">${esc(t("mpn_name"))}</span><input data-mpnname maxlength="60" value="${esc(s.title)}" placeholder="${esc(t("mpn_name_ph"))}" autocomplete="off" /></label>
      <div class="mpn-f"><span class="pkb-k">${esc(t("mp_used_for"))}</span><div class="mpk-pgs">${PACK_PAGE_GROUPS.map((g) => `<button type="button" class="mpn-pg${s.groups.includes(g.key) ? " on" : ""}" data-mpnpg="${esc(g.key)}" aria-pressed="${s.groups.includes(g.key)}">${esc(packGroupLabel(g))}</button>`).join("")}</div>
      <div class="meta mpn-note">${esc(t("mpn_pages_d"))}</div></div>`;
  else body = `<div class="mpn-items">${s.items.map((it, i) => {
      const known = packResourceChoices(it.name), has = known.some((n) => n.toLowerCase() === String(it.name).toLowerCase());
      return `<div class="mpn-it"><span class="pkc-ic">${mpIconHtml(it.name)}</span><select data-mpnit="${i}" class="keep-w" aria-label="${esc(materialDisplayName(it.name))}">${known.map((n) => `<option value="${esc(n)}" ${n.toLowerCase() === String(it.name).toLowerCase() ? "selected" : ""}>${esc(materialDisplayName(n))}</option>`).join("")}${has ? "" : `<option value="${esc(it.name)}" selected>${esc(it.name)}</option>`}</select><button type="button" class="mpn-rm" data-mpnrm="${i}" ${s.items.length <= 1 ? "disabled" : ""} aria-label="${esc(t("pkc_del_item"))}">&times;</button></div>`;
    }).join("")}</div>
    <button type="button" class="pkc-chip pkc-add mpn-add" data-mpnadd>+ ${esc(t("pkc_item"))}</button>
    <div class="meta mpn-note">${esc(t("mpn_items_d"))}</div>`;
  return `<div class="modal-overlay mpn-ov" data-mpnov><div class="modal-box mpn" role="dialog" aria-label="${esc(t("mpk_new"))}">
    <div class="mpn-h"><div><b>${esc(t("mpk_new"))}</b><small>${esc(t("mpn_step").replace("{n}", s.step))} · ${esc(t(subs[s.step - 1]))}</small></div><button type="button" class="pkb-back mpn-x" data-mpnclose aria-label="${esc(t("close_button"))}">&times;</button></div>
    <div class="mpn-prog">${tabs.map((k, i) => `<span class="${i < s.step ? "on" : ""}"><i></i>${esc(t(k))}</span>`).join("")}</div>
    <div class="mpn-b">${body}</div>
    <div class="mpn-f2">${s.step === 1 ? `<button type="button" class="btn ghost" data-mpnclose>${esc(t("cancel"))}</button>` : `<button type="button" class="btn ghost" data-mpnback>&#8249; ${esc(t("mpn_back"))}</button>`}
      ${s.step < 3 ? `<button type="button" class="btn" data-mpnnext>${esc(t("mpn_next"))} &#8250;</button>` : `<button type="button" class="btn" data-mpnmake>${esc(t("mpn_create"))}</button>`}</div>
  </div></div>`;
}
// Packs page "Pack dates": every pack whose
// link lets visitors set their own date, except the stacking weekly /
// monthly cards (My Purchases → Weekly cards) and the New Gen packs (their
// own card on My Purchases). One short row each: name, how often and when
// it comes next, one date box, ⚙ (admin: open the pack's settings).
// Visitors save their own date (calc_state my_pack_dates); the admin sets the
// pack's date, which is also visitors' default.
function renderMyPackDates(el, tables) {
  if (!el) return;
  const ownerEdit = IS_OWNER;
  const list = tables.filter((tb) => { const l = packLinkForBase(tb.id); return l.visitorDate && typeof l.reset === "number" && !packStackInfo(l.reset) && !packIsNewGen(l) && !l.template; });
  if (!list.length) { el.innerHTML = `<p class="meta" style="margin:4px 2px;">${esc(t("pkb_dates_empty"))}</p>`; return; }
  // Pack days run on the game's UTC day (see packStartOfToday), so these
  // dates do too - local dates were a day off near midnight UTC.
  const today = packStartOfToday();
  const fmt = (days) => { const d = new Date(today.getTime() + days * 86400000); try { return d.toLocaleDateString(LANG === "en" ? undefined : LANG, { day: "numeric", month: "short", timeZone: "UTC" }); } catch (e) { return packDayKey(d); } };
  // Dated packs of one group move together (see partners below), so they're
  // one row: e.g. both Myriad Bazaar tables are "Myriad Bazzar".
  const rows = [], together = new Map(); // lead id -> how many tables it stands for
  // Only tables linked as one pack (same "Same pack as" set, e.g. the two
  // Myriad Bazaar tables) share a row; a shared category (Events: Fishing Event,
  // Dreamscape Memory) does not (Fishing Event was hidden
  // inside the Dreamscape Memory row).
  const setKey = (id) => packLinkSetOf(id) || "";
  // "Same dates as": a pack that follows another pack's
  // dates (e.g. Megeventure Boost → Mergeventure) is one row with the leader,
  // shown under the leader's name only, one date box (it changes the leader).
  const dateLead = (id) => packLinkForBase(id).dateWith || String(id);
  const rowKey = (id) => { const ld = dateLead(id); return setKey(ld) ? "s:" + setKey(ld) : "d:" + ld; };
  const byId = new Map(tables.map((x) => [String(x.id), x]));
  list.forEach((tb) => {
    const k = rowKey(tb.id);
    const at = rows.findIndex((x) => rowKey(x.id) === k);
    const isSet = k.startsWith("s:") && !!setKey(tb.id) && setKey(tb.id) === k.slice(2);
    if (at < 0) {
      // The row stands for the leader (when it is one of the tables).
      const ld = dateLead(tb.id), lt = byId.get(ld);
      rows.push(lt && !setKey(ld) ? lt : tb);
      return;
    }
    const lead = rows[at];
    if (isSet) together.set(String(lead.id), (together.get(String(lead.id)) || 1) + 1);
  });
  const rowTitle = (tb) => { const n = together.get(String(tb.id));
    // An event (a pack others follow): its event name, see packEventName.
    const ld = byId.get(dateLead(tb.id)) || tb;
    if (packEventFollowers(ld, tables).length) return `<b>&#128279; ${esc(packEventName(ld, tables))}</b>${n ? ` <span class="meta">(${esc(t("pk_tables_n").replace("{n}", n))})</span>` : ""}`;
    return n ? `<b>${esc(String(tb.title || "").split(":")[0].trim())}</b> <span class="meta">(${esc(t("pk_tables_n").replace("{n}", n))})</span>` : `<b>${esc(tb.title || "")}</b>`; };
  const anyMine = list.some((tb) => MY_PACK_DATES[String(tb.id)] || MY_PACK_DATES[dateLead(tb.id)]);
  el.innerHTML = `<details class="panel pkd-box" data-mydatesbox ${MY_DATES_PREVIEW_OPEN ? "open" : ""}>
    <summary class="pkd-sum"><span class="pkd-t"><span data-mydatesarrow>${MY_DATES_PREVIEW_OPEN ? "&#9662;" : "&#9656;"}</span> ${esc(t("pk_dates_title"))}${!ownerEdit && anyMine ? ` <span class="pkd-mine">${esc(t("pk_your_date"))}</span>` : ""}</span><span class="meta">${rows.length} ${esc(t("pk_preview_packs"))}</span></summary>
    <div class="meta pkd-desc">${esc(t(ownerEdit ? "pk_dates_owner_desc" : "pk_dates_desc"))}</div>
    ${rows.map((tb) => {
      const l = packLinkFor(tb.id);
      const offs = packResetOffsets(l.reset, l.resetDay, 400, l.window);
      const next = offs.find((o) => o > 0);
      const then = next != null ? offs.find((o) => o > next) : null;
      const sub = `${packEveryText(l.reset, l.resetDay)}${offs[0] === 0 ? ` · ${t("pur_now")}` : ""}${next != null ? ` · ${t("pk_dates_next").replace("{date}", fmt(next))}` : ""}${then != null ? ` · ${t("pk_dates_then").replace("{date}", fmt(then))}` : ""}`;
      const value = next != null ? packDayKey(new Date(today.getTime() + next * 86400000)) : (packValidDay(l.resetDay) || "");
      return `<div class="pkd-row">
        <div class="pkd-n">${rowTitle(tb)}<div class="meta">${esc(sub)}</div></div>
        <input type="date" class="keep-w pkd-in" data-mydate="${esc(tb.id)}" value="${esc(value)}" aria-label="${esc(t("pk_arrives_on"))}" />
        ${ownerEdit ? `<button type="button" class="pkd-gear" data-mydatesopen="${esc(tb.id)}" title="${esc(t("pk_preview_open"))}" aria-label="${esc(t("pk_preview_open"))}">&#9881;</button>` : ""}
      </div>`;
    }).join("")}
    ${ownerEdit || anyMine ? `<div class="pkd-foot">${ownerEdit ? `<span class="meta">&#9881; = ${esc(t("pk_admin_only"))}</span>` : "<span></span>"}${anyMine ? `<button type="button" class="linklike" data-mydateresetall>${esc(t("pk_reset_all_dates"))}</button>` : ""}</div>` : ""}
  </details>`;
  {
    const det = el.querySelector("details");
    det.addEventListener("toggle", () => {
      MY_DATES_PREVIEW_OPEN = det.open;
      try { localStorage.setItem("my_pack_dates_open", det.open ? "1" : "0"); } catch (e) {}
      const a = det.querySelector("[data-mydatesarrow]"); if (a) a.innerHTML = det.open ? "&#9662;" : "&#9656;";
    });
  }
  el.querySelectorAll("[data-mydatesopen]").forEach((b) => b.addEventListener("click", () => packOpenSettingsHere(b.dataset.mydatesopen)));
  const save = async () => {
    Object.keys(MY_PACK_DATES).forEach((k) => { if (!packValidDay(MY_PACK_DATES[k])) delete MY_PACK_DATES[k]; });
    PACK_PLAN_CACHE.clear(); PACK_EARLIEST_CACHE.clear();
    if (typeof budgetInvalidate === "function") budgetInvalidate();
    PACK_TABLES_CACHE = PACK_TABLES_STASH = null;
    setTimeout(() => renderMyPackDates(el, tables), 0); // not while the input is still handling its change/blur
    await saveCalcState("my_pack_dates", MY_PACK_DATES);
  };
  // Linked dated packs come together, so a new date moves every table of the set.
  // A date-joined row changes its leader (the others follow it).
  const partners = (id0) => {
    const id = dateLead(id0);
    const g = setKey(id);
    if (!g) return [String(id)];
    return list.filter((tb) => setKey(tb.id) === g && !packLinkForBase(tb.id).dateWith).map((tb) => String(tb.id));
  };
  el.querySelectorAll("[data-mydate]").forEach((inp) => inp.addEventListener("change", () => {
    const id0 = inp.dataset.mydate;
    // Admin: the pack's own date, the same box as in its settings.
    if (ownerEdit) {
      if (!packValidDay(inp.value)) return;
      partners(id0).forEach((id) => { PACK_LINKS[id] = PACK_LINKS[id] || { pages: [], priceCol: 0, cols: {} }; PACK_LINKS[id].resetDay = inp.value; });
      PACK_EARLIEST_CACHE.clear(); PACK_TABLES_CACHE = PACK_TABLES_STASH = null;
      savePackLinks();
      setTimeout(() => renderMyPackDates(el, tables), 0);
      return;
    }
    partners(id0).forEach((id) => { if (inp.value) MY_PACK_DATES[id] = inp.value; else delete MY_PACK_DATES[id]; });
    save();
  }));
  const all = el.querySelector("[data-mydateresetall]");
  // Only the packs in this box (the weekly cards have their own Reset all).
  if (all) all.addEventListener("click", () => { list.forEach((tb) => { delete MY_PACK_DATES[String(tb.id)]; delete MY_PACK_DATES[dateLead(tb.id)]; }); save(); });
}
// Packs page: open a pack's settings (its editor is built on first Edit).
function packOpenSettingsHere(id) {
  if (PKB_HOOK && TAB === "packs") {
    // Packs B: open the pack's window, its settings showing
    const dp = document.getElementById("pkbDpSheet");
    if (dp) dp.hidden = true;
    PKB_HOOK.open(id);
    setTimeout(() => { const box = document.querySelector(".pkb-panel details[data-packlink]"); if (box) { box.open = true; box.scrollIntoView({ behavior: "smooth", block: "start" }); } }, 60);
    return;
  }
  const panel = document.querySelector(`[data-packtable][data-pkid="${window.CSS.escape(String(id))}"]`);
  if (!panel) { toast(t("pk_preview_notshown")); return; }
  if (!PACKS_OPEN.has(String(id))) { const ed = panel.querySelector("[data-pk-toggle]"); if (ed) ed.click(); }
  const box = panel.querySelector("details[data-packlink]");
  if (!box) { panel.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
  box.open = true;
  box.scrollIntoView({ behavior: "smooth", block: "center" });
}
// The green line under a card's "Still active" box.
function packActiveNoteText(tableId) {
  const n = packActiveDays(tableId);
  if (!n) return "";
  const l = packLinkFor(tableId), st0 = packStackInfo(packLinkForBase(tableId).reset);
  if (!st0) return "";
  const fmtD = (d) => d.toLocaleDateString(LANG === "en" ? undefined : LANG, { day: "numeric", month: "short", timeZone: "UTC" });
  if (!l.activeDaysLeft) return t("pk_active_done");
  const next = new Date(l.activeUntil.getTime() + 86400000);
  const more = Math.max(0, Math.floor((st0.cap - l.activeDaysLeft) / st0.days));
  return t("pk_active_note").replace("{date}", fmtD(l.activeUntil)).replace("{left}", l.activeDaysLeft).replace("{next}", fmtD(next)).replace("{more}", more);
}
// My Purchases' "change ›" opens the Packs page's Pack dates & prices window at New heroes.
let PKB_DP_FOCUS = null;

// ============================================================
// PACK CALENDAR - when each pack comes and how long it stays.
// Its own page, reached from the Calendar button on the Packs page.
// Design C2 "Week strip + bars": two answer boxes
// (today / next event), one week at a time as 7 day tiles over a bar chart
// (events first, then packs; bars past the week edge are cut ‹ ›), then the
// picked day's list. A bar or a row opens the pack's sheet (dates, what it
// gives, price steps with ★ for the steps in the person's plan, + Will buy,
// Open pack ›); ⚙ Filter (types, ★ In my plan only); the week title opens a
// month picker. Every item is drawn from data the pack already carries: how
// often it comes back, its next date and how many days one copy lasts.
// ============================================================
let PACK_CAL_KEY = null;
let PACK_CAL_MORE_BARS = false; // "+ N more bars" opened
let PACK_CAL_SHEET = null;      // { type: "pack", g, a, ti } | { type: "filter" } | { type: "month", m }
// Filter (kept in this browser like the old chips): kinds switched off and
// "★ In my plan only". Default = everything on, plan-only off.
const PACK_CAL_KINDS = ["weekly", "monthly", "event", "newheroes", "unlocks"];
const PACK_CAL_FILTER = (() => {
  const f = { off: new Set(), plan: false };
  try {
    const s = JSON.parse(localStorage.getItem("packcal_filter") || "null");
    if (s && Array.isArray(s.off)) s.off.forEach((k) => { if (PACK_CAL_KINDS.includes(k)) f.off.add(k); });
    if (s && s.plan === true) f.plan = true;
  } catch (e) { /* blocked */ }
  return f;
})();
function packCalSaveFilter() {
  try { localStorage.setItem("packcal_filter", JSON.stringify({ off: [...PACK_CAL_FILTER.off], plan: PACK_CAL_FILTER.plan })); } catch (e) { /* blocked */ }
}
// A tinted box in an event's colour (background / border alpha).
function gameEventTint(key, bg = 0.13, bd = 0.35) {
  const h = gameEventColor(key).slice(1), r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return `background:rgba(${r},${g},${b},${bg});border-color:rgba(${r},${g},${b},${bd});`;
}
function packCalIconSrc(name) {
  if (!name) return "";
  return itemRegIcon(name) || (String(name).toLowerCase() === "gems" ? MATERIAL_ICONS.gems : "") || bpIcon({ name }) || materialIconSrc(name) || "";
}
function packCalImg(name, cls) {
  const s = packCalIconSrc(name);
  return s ? `<img class="${cls || ""}" src="${esc(s)}" alt="" loading="lazy" />` : "";
}
// A bar's name that doesn't fit inside it goes beside it, on the side with the
// most room (two lines there when needed); with no room on either side it
// wraps to two lines inside the bar.
function packCalFit(root) {
  (root || document).querySelectorAll(".pcg-bar").forEach((b) => {
    const row = b.parentElement;
    row.querySelectorAll(".pcg-side").forEach((x) => x.remove());
    b.classList.remove("out", "two");
    const nm = b.querySelector(".nm");
    if (!nm || nm.scrollWidth <= nm.clientWidth + 1) return;
    const need = nm.scrollWidth + 2;
    const a = Number(b.style.getPropertyValue("--a")) || 0, w = Number(b.style.getPropertyValue("--w")) || 1;
    const colW = row.clientWidth / 7;
    const rRoom = (7 - a - w) * colW - 8, lRoom = a * colW - 8;
    const side = rRoom >= lRoom ? "r" : "l", room = Math.max(rRoom, lRoom);
    if (room >= need || (room >= 56 && room * 1.9 >= need)) {
      const o = document.createElement("span");
      o.className = `pcg-side ${side}${room >= need ? "" : " two"}`;
      o.textContent = nm.textContent;
      o.style.setProperty("--a", a); o.style.setProperty("--w", w);
      o.style.maxWidth = `${Math.floor(room)}px`;
      o.addEventListener("click", () => b.click());
      row.appendChild(o);
      b.classList.add("out");
    } else b.classList.add("two");
  });
}
// The day row stays at the top of the screen while the grid scrolls past
// (CSS sticky can't work: the body is the scroll box, see wirePlxPinned).
let PACK_CAL_PINF = null;
function packCalPin(root) {
  if (PACK_CAL_PINF) { window.removeEventListener("scroll", PACK_CAL_PINF); window.removeEventListener("resize", PACK_CAL_PINF); PACK_CAL_PINF = null; }
  const ph = root.querySelector(".pcg-dh-ph"), el = ph && ph.firstElementChild, grid = root.querySelector(".pcg");
  if (!el || !grid) return;
  let lastW = innerWidth;
  const f = () => {
    if (!el.isConnected) { window.removeEventListener("scroll", f); window.removeEventListener("resize", f); if (PACK_CAL_PINF === f) PACK_CAL_PINF = null; return; }
    if (innerWidth !== lastW) { lastW = innerWidth; packCalFit(root); }
    const r = ph.getBoundingClientRect(), gb = grid.getBoundingClientRect().bottom;
    const pin = r.top < 0 && gb > el.offsetHeight + 40;
    if (pin !== el.classList.contains("is-pinned")) { ph.style.height = pin ? `${ph.offsetHeight}px` : ""; el.classList.toggle("is-pinned", pin); }
    if (pin) { el.style.left = `${r.left}px`; el.style.width = `${r.width}px`; } else { el.style.left = ""; el.style.width = ""; }
  };
  PACK_CAL_PINF = f;
  window.addEventListener("scroll", f, { passive: true });
  window.addEventListener("resize", f);
  f();
}
async function renderPackCalendarPageMain() {
  const seq = RENDER_SEQ;
  const [tablesLoaded] = await Promise.all([packTablesRows(), ensurePackLinks()]);
  if (seq !== RENDER_SEQ) return;
  const { loc, t0, monIdx, dateOf, offOf, fmt, md, wd, wdmd, groups, plan, inPlanAt, planGroups, collect } = packCalModel(tablesLoaded);
  const shownItem = (it) => {
    if (it.kind === "event") return !PACK_CAL_FILTER.off.has("event");
    if (PACK_CAL_FILTER.off.has(it.kind)) return false;
    if (PACK_CAL_FILTER.plan && it.gi != null) return groups[it.gi].plan.length > 0;
    return true;
  };
  const evCol = (it) => (it.kind === "event" ? (it.ev === "wheel" ? PACK_CAL_COL.wheel : gameEventColor(it.ev)) : PACK_CAL_COL[it.kind] || PACK_CAL_COL.weekly);

  // ---- the pack sheet ----
  const resetText = (l) => {
    const r = l.reset;
    if (r >= PACK_ONE_TIME_DAYS) return t("pack_reset_once");
    const preset = PACK_RESET_PRESETS.find((x) => x.days === r);
    return preset ? t("pack_reset_" + preset.key) : packEveryText(r, l.resetDay);
  };
  const kindName = (k) => t({ weekly: "pack_cal_weekly", monthly: "pack_cal_monthly", event: "pack_cal_events", newheroes: "pack_cal_new_heroes", unlocks: "pcl_unlocks" }[k] || "pack_cal_other");
  const needMap = plan && plan.need ? plan.need : null;
  const isNeeded = (k, d = 0) => !!needMap && ((needMap[k] || 0) > 0 || (d < 2 && !!PACK_BUNDLES[k] && Object.keys(PACK_BUNDLES[k]).some((c) => isNeeded(c, d + 1))));
  const appsOf = (gp, horizon) => {
    const l = gp.link;
    return gp.newGen && newGenBaseDay()
      ? newGenAppearances(gp.tables[0].id, Number(l.window) || 0).map((x) => ({ a: offOf(x.start), b: offOf(x.start) + x.days - 1 })).filter((x) => x.b >= 0)
      : packAppearances(l.reset, packPlanAnchor(l), l.window, horizon).map((x) => ({ a: x.offset, b: x.offset + (l.window > 0 ? l.window : 1) - 1 }));
  };
  const daysLeftPill = (a, b, gp) => {
    if (gp && gp.link.reset === 1 && !gp.newGen) return `<span class="pcl-pill now">${esc(t("pcl_every_day"))}</span>`;
    if (a > 0) return `<span class="pcl-pill ice">${esc(t("pcl_starts_in").replace("{n}", a))}</span>`;
    const left = b + 1;
    if (left <= 1) return `<span class="pcl-pill end">${esc(t("pcl_last_day"))}</span>`;
    return `<span class="pcl-pill ${left <= 3 ? "end" : "now"}">${esc(left <= 3 ? t("pcl_ends_day").replace("{day}", wd(b)).replace("{n}", left) : t("pcl_days_left").replace("{n}", left))}</span>`;
  };
  function packSheetHtml(st) {
    const gp = groups[st.g];
    if (!gp) return "";
    const ti = Math.min(st.ti || 0, gp.tables.length - 1);
    const tb = gp.tables[ti], l = packLinkFor(tb.id);
    const apps = appsOf(gp, 400);
    const cur = apps.find((x) => x.a <= st.a && x.b >= st.a) || apps.find((x) => x.b >= st.a) || { a: st.a, b: st.a };
    const next = apps.find((x) => x.a > cur.b);
    const range = (x) => (x.a === x.b ? wdmd(x.a) : `${md(x.a)} → ${md(x.b)}`);
    const win = Number(l.window) || 0;
    const wdays = win > 0 && win < 7 && l.reset % 7 === 0 ? ` · ${wd(cur.a)}–${wd(cur.a + win - 1)}` : "";
    const sub = gp.newGen
      ? `${t("pack_cal_new_heroes")}${packNewGenLabel(dateOf(cur.a), l.reset, gp.tables[0].id) ? " · " + packNewGenLabel(dateOf(cur.a), l.reset, gp.tables[0].id) : ""} · ${t("pcl_one_time")}`
      : [l.reset === 1 ? "" : kindName(gp.kind), resetText(l)].filter((x, i, a) => x && a.indexOf(x) === i).join(" · ") + wdays;
    const cols = packCalCols(tb);
    // Main item = the first needed column, else the first one.
    const main = cols.find((c) => isNeeded(c.name)) || cols[0];
    const chips = cols.slice().sort((x, y) => (isNeeded(y.name) ? 1 : 0) - (isNeeded(x.name) ? 1 : 0)).map((c) => `<span class="pcl-chip${isNeeded(c.name) ? " need" : ""}" title="${esc(materialDisplayName(c.name) || c.name)}">${packCalImg(c.name)}<span>${esc(materialDisplayName(c.name) || c.name)}</span></span>`).join("");
    // Steps in the plan (★): plain rows / buy-in-order runs of this table.
    const mine = gp.plan.filter((x) => (x.r.tables || []).map(String).includes(String(tb.id)));
    const starred = new Set();
    mine.forEach((x) => { if (x.r.row == null) return; if (l.sequential) { for (let k = x.r.from || 0; k <= x.r.row; k++) starred.add(k); } else starred.add(x.r.row); });
    const steps = (tb.rows || []).map((r, ri) => ({ ri, price: packParseNum((r.cells || [])[l.priceCol || 0]), qty: main ? packParseNum((r.cells || [])[main.ci]) : 0 })).filter((s) => s.price > 0);
    const stepsHtml = steps.map((s, k) => `<div class="pcl-step${starred.has(s.ri) ? " on" : ""}"><span class="pcl-st-n">${starred.has(s.ri) ? "★ " : ""}${esc(t("pcl_step").replace("{n}", k + 1))}</span><span class="pcl-st-q">${main ? packCalImg(main.name) : ""}${s.qty > 0 ? esc(Math.round(s.qty).toLocaleString()) : ""}</span><b>${esc(packFmtMoney(s.price, l.currency))}</b></div>`).join("");
    // "★ In your plan": which steps, what it costs, on which dates.
    let planBox = "";
    if (mine.length) {
      const idx = [...starred].map((ri) => steps.findIndex((s) => s.ri === ri) + 1).filter((n) => n > 0).sort((a, b) => a - b);
      const what = idx.length ? (idx.length > 1 && idx[idx.length - 1] - idx[0] === idx.length - 1 ? t("pcl_plan_steps").replace("{a}", idx[0]).replace("{b}", idx[idx.length - 1]) : idx.length === 1 ? t("pcl_step").replace("{n}", idx[0]).toLowerCase() : idx.join(", ")) : String(mine[0].r.label || "").replace(/[⁦-⁩]/g, "");
      const tot = mine.reduce((s, x) => s + packRowLocal(x.r), 0);
      const offs = [...new Set(mine.flatMap((x) => x.xs.map((s) => Math.max(0, s.off))))].sort((a, b) => a - b);
      const cnt = mine.reduce((s, x) => s + x.r.count, 0);
      const when = offs.length ? (offs.length === 1 ? md(offs[0]) : `${md(offs[0])} → ${md(offs[offs.length - 1])} · ${t("pur_when_dates").replace("{n}", offs.length)}`) : "";
      planBox = `<div class="pcl-planbox"><span class="pcl-star">★</span><div><b>${esc(t("pcl_plan_box").replace("{what}", what))}</b><small>${cnt > 1 ? `×${cnt} · ` : ""}${esc(when)}</small></div><b class="pcl-plan-p">${esc(packFmtLocal(tot, mine[0].r.currency, false, mine[0].r.price))}</b></div>`;
    }
    const canBuy = mine.length && (IS_OWNER || visitorCan("budgets"));
    return `<div class="pcl-ov" data-pclclose><div class="pcl-sheet" role="dialog" aria-modal="true" aria-label="${esc(gp.label)}">
      <div class="pcl-grab"></div>
      <div class="pcl-sh">${packCalImg(gp.icon, "pcl-sh-ic")}<div class="pcl-sh-t"><b>${esc(gp.label)}</b><small>${esc(sub)}</small></div><button type="button" class="pcl-x" data-pclx aria-label="${esc(t("close_button"))}">&times;</button></div>
      ${gp.tables.length > 1 ? `<div class="pcl-tabs">${gp.tables.map((x, i) => { const nm = String(x.title || ""); const c = nm.indexOf(":"); return `<button type="button" class="${i === ti ? "on" : ""}" data-pclti="${i}">${esc(c > 0 ? nm.slice(c + 1).trim() : nm)}</button>`; }).join("")}</div>` : ""}
      <div class="pcl-dates"><i style="background:${evCol({ kind: gp.kind })}"></i><b>${esc(range(cur))}</b>${daysLeftPill(cur.a, cur.b, gp)}</div>
      ${next && !gp.newGen ? `<div class="pcl-next">${esc(t("pcl_next_copy").replace("{range}", next.a === next.b ? wdmd(next.a) : `${wdmd(next.a)} → ${wdmd(next.b)}`))}</div>` : ""}
      ${chips ? `<div class="pcl-k">${esc(t("pcl_gives"))}</div><div class="pcl-chips">${chips}</div>` : ""}
      ${stepsHtml ? `<div class="pcl-k">${esc(t("pcl_steps"))}${l.sequential ? `<span>${esc(t("pcl_in_order"))}</span>` : ""}</div><div class="pcl-steps">${stepsHtml}</div>` : ""}
      ${planBox}
      <div class="pcl-btns">${canBuy ? `<button type="button" class="btn pcl-wb" data-pclbuy>+ ${esc(t("pur_will_buy"))}</button>` : ""}<button type="button" class="btn ghost" data-pclopen="${esc(String(tb.id))}">${esc(t("pcl_open_pack"))}</button></div>
    </div></div>`;
  }
  function filterSheetHtml() {
    const ms = new Date(Date.UTC(t0.getUTCFullYear(), t0.getUTCMonth(), 1)), me = new Date(Date.UTC(t0.getUTCFullYear(), t0.getUTCMonth() + 1, 0));
    const its = collect(offOf(ms), offOf(me), true);
    const cnt = (k) => (k === "event" ? its.filter((x) => x.kind === "event" && x.ev !== "wheel").length : new Set(its.filter((x) => x.kind === k).map((x) => (x.gi != null ? "g" + x.gi : x.title))).size);
    const nCh = PACK_CAL_FILTER.off.size + (PACK_CAL_FILTER.plan ? 1 : 0);
    const chip = (k) => `<button type="button" class="pcl-fchip${PACK_CAL_FILTER.off.has(k) ? " off" : ""}" data-pclkind="${k}" aria-pressed="${PACK_CAL_FILTER.off.has(k) ? "false" : "true"}"><i style="background:${PACK_CAL_COL[k]}"></i>${esc(kindName(k))}<span>${cnt(k)}</span></button>`;
    return `<div class="pcl-ov" data-pclclose><div class="pcl-sheet" role="dialog" aria-modal="true" aria-label="${esc(t("pcl_filter"))}">
      <div class="pcl-grab"></div>
      <div class="pcl-sh"><div class="pcl-sh-t"><b>${esc(t("pcl_filter"))}${nCh ? ` <span class="pcl-badge">${nCh}</span> <small class="pcl-inl">${esc(t("pcl_f_changes"))}</small>` : ""}</b></div><button type="button" class="pcl-x" data-pclx aria-label="${esc(t("close_button"))}">&times;</button></div>
      <div class="pcl-k">${esc(t("pcl_f_show"))}</div>
      <div class="pcl-fchips">${PACK_CAL_KINDS.map(chip).join("")}</div>
      <label class="pcl-fplan"><span><b>★ ${esc(t("pcl_f_plan"))}</b><small>${esc(plan ? t("pcl_f_plan_d").replace("{n}", planGroups).replace("{m}", groups.length) : t("pcl_f_noplan"))}</small></span><input type="checkbox" class="bset-sw" data-pclplan ${PACK_CAL_FILTER.plan ? "checked" : ""} ${plan ? "" : "disabled"} /></label>
      <div class="meta pcl-fnote">${esc(t("pcl_f_note"))}</div>
      <div class="pcl-btns"><button type="button" class="btn ghost" data-pclreset>${esc(t("pcl_reset"))}</button><button type="button" class="btn pcl-wb" data-pclx>${esc(t("pcl_done"))}</button></div>
    </div></div>`;
  }
  function monthSheetHtml(m) {
    const ms = new Date(Date.UTC(t0.getUTCFullYear(), t0.getUTCMonth() + m, 1)), me = new Date(Date.UTC(ms.getUTCFullYear(), ms.getUTCMonth() + 1, 0));
    const a0 = offOf(ms) - ((ms.getUTCDay() + 6) % 7), b0 = offOf(me) + (6 - (me.getUTCDay() + 6) % 7);
    const its = collect(a0, b0, false).filter((x) => x.kind === "event" && x.ev !== "wheel" || x.kind === "newheroes");
    const shownWeek = PACK_CAL_WEEK * 7 - monIdx;
    const rows = [];
    for (let w = a0; w <= b0; w += 7) {
      const wk = Math.round((w + monIdx) / 7);
      const evs = its.filter((x) => x.kind === "event" && x.b >= w && x.a <= w + 6);
      const lbl = wk === 0 ? t("pcl_this_week") : wk === 1 ? t("pcl_m_next") : evs.length ? evs.map((x) => x.title).join(" · ") : md(w);
      const cells = Array.from({ length: 7 }, (_, i) => {
        const o = w + i, inM = dateOf(o).getUTCMonth() === ms.getUTCMonth();
        const ev = its.find((x) => x.kind === "event" && x.a <= o && x.b >= o);
        const star = its.some((x) => x.kind === "newheroes" && x.a === o);
        return `<span class="pcl-mc${inM ? "" : " out"}${o === 0 ? " td" : ""}">${dateOf(o).getUTCDate()}${star ? "<em>⭐</em>" : ""}${ev ? `<u style="background:${evCol(ev)}"></u>` : ""}</span>`;
      }).join("");
      rows.push(`<button type="button" class="pcl-mrow${w === shownWeek ? " on" : ""}${evs.length ? " ev" : ""}" data-pclwk="${wk}"><span class="pcl-ml">${esc(lbl)}</span>${cells}</button>`);
    }
    const ng = its.find((x) => x.kind === "newheroes");
    const title = ms.toLocaleDateString(loc, { month: "long", year: "numeric", timeZone: "UTC" });
    return `<div class="pcl-ov pcl-ov-m" data-pclclose><div class="pcl-sheet pcl-month" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="pcl-mh"><button type="button" class="pcl-nb" data-pclm="-1" aria-label="previous">&#8249;</button><b>${esc(title)}</b><button type="button" class="pcl-nb" data-pclm="1" aria-label="next">&#8250;</button></div>
      <div class="pcl-mrow pcl-mdow"><span class="pcl-ml"></span>${Array.from({ length: 7 }, (_, i) => `<span class="pcl-mc">${esc(fmt(i - monIdx, { weekday: "narrow" }))}</span>`).join("")}</div>
      ${rows.join("")}
      <div class="pcl-leg">${GAME_EVENTS.map((e) => `<span><u style="background:${gameEventColor(e.key)}"></u>${esc(e.name)}</span>`).join("")}${ng ? `<span>⭐ ${esc(t("pack_cal_new_heroes"))} ${esc(md(ng.a))}</span>` : ""}</div>
      <div class="pcl-btns"><button type="button" class="btn ghost" data-pclwk="0">${esc(t("pack_cal_today_btn"))}</button><button type="button" class="btn ghost" data-pclx>${esc(t("close_button"))}</button></div>
    </div></div>`;
  }

  function draw() {
    if (seq !== RENDER_SEQ || TAB !== "packcalendar") return;
    const mon = PACK_CAL_WEEK * 7 - monIdx, sun = mon + 6;
    const pick = PACK_CAL_DAY != null ? PACK_CAL_DAY : (PACK_CAL_WEEK === 0 ? monIdx : 0);
    const dOff = mon + pick;
    // This week's items (and a few days around it for the day list's "back <date>").
    const all = collect(mon, sun, true);
    const items = all.filter(shownItem);
    // ---- answer boxes (today, whatever the filter) ----
    const todayAll = collect(0, 0, true);
    const onToday = todayAll.filter((x) => x.gi != null);
    const nOn = new Set(onToday.map((x) => x.gi)).size, nEnd = new Set(onToday.filter((x) => x.b === 0 && !x.daily).map((x) => x.gi)).size;
    const evs = collect(-6, 120, false).filter((x) => x.kind === "event" && x.ev !== "wheel" || (x.kind === "newheroes" && x.milestone)).filter((x) => x.b >= 0).sort((x, y) => x.a - y.a);
    const evText = (x) => {
      const nm = x.kind === "event" ? x.title : t("pack_cal_new_heroes");
      if (x.a <= 0) return x.b === 0 ? t("pcl_ev_ends_today").replace("{name}", nm) : t("pcl_ev_ends").replace("{name}", nm).replace("{day}", wd(x.b));
      return x.a === 1 ? t("pcl_ev_tomorrow").replace("{name}", nm) : t("pcl_ev_in").replace("{name}", nm).replace("{n}", x.a);
    };
    const ev1 = evs[0], ev2 = evs[1];
    const evCls = ev1 ? (ev1.kind === "event" ? (ev1.ev === "koi" ? "koi" : "svs") : "gen") : "";
    const evSty = ev1 && ev1.kind === "event" && ev1.ev !== "svs" && ev1.ev !== "koi" ? ` style="${gameEventTint(ev1.ev, 0.10)}--evc:${gameEventColor(ev1.ev)}"` : "";
    // ---- week strip ----
    const wkLbl = PACK_CAL_WEEK === 0 ? t("pcl_this_week") : PACK_CAL_WEEK === 1 ? t("pcl_next_week") : PACK_CAL_WEEK === -1 ? t("pcl_last_week") : "";
    const sameM = dateOf(mon).getUTCMonth() === dateOf(sun).getUTCMonth();
    const wkRange = `${md(mon)} – ${sameM ? dateOf(sun).getUTCDate() : md(sun)}`;
    // ---- the game-style grid: a day row, then one bar per row (Events, ★ In
    // your plan, other packs folded), today's column gold, the picked one shaded ----
    const picked = PACK_CAL_DAY != null;
    const dayRow = Array.from({ length: 7 }, (_, i) => {
      const o = mon + i;
      return `<button type="button" class="pcg-d${o === 0 ? " td" : ""}${o < 0 ? " past" : ""}${picked && i === pick ? " sel" : ""}" data-pclday="${i}" aria-pressed="${i === pick}"><span class="w">${esc(wd(o))}</span><b>${dateOf(o).getUTCDate()}</b></button>`;
    }).join("");
    const starOf = (it) => it.gi != null && inPlanAt(groups[it.gi], it.a, it.b);
    const bar = (it) => {
      const c0 = Math.max(it.a, mon) - mon, c1 = Math.min(it.b, sun) - mon;
      const cutL = it.a < mon && !it.daily, cutR = it.b > sun && !it.daily;
      const star = starOf(it);
      const nm = `${it.title}${it.count > 1 ? ` ×${it.count}` : ""}${it.daily ? " · " + t("pcl_every_day") : ""}`;
      const sel = PACK_CAL_SHEET && PACK_CAL_SHEET.type === "pack" && PACK_CAL_SHEET.g === it.gi && PACK_CAL_SHEET.a >= it.a && PACK_CAL_SHEET.a <= it.b;
      const tap = it.gi != null ? ` data-pclg="${it.gi}|${Math.max(it.a, mon)}"` : ` data-pcltip="${esc([it.title, it.tip].filter(Boolean).join(" · "))}"`;
      const pic = it.gi != null ? (packCalImg(groups[it.gi].icon) || "<em>&#127873;</em>") : it.kind === "event" && it.ev !== "wheel" ? "<em>&#9876;</em>" : "";
      return `<div class="pcg-row"><span class="pcg-bar${cutL ? " cl" : ""}${cutR ? " cr" : ""}${it.kind === "event" || it.milestone ? " ev" : ""}${sel ? " hot" : ""}" style="--a:${c0};--w:${c1 - c0 + 1};--c:${evCol(it)}" title="${esc(nm + (star ? " ★" : ""))}" role="button" tabindex="0"${tap}>${pic}<span class="nm">${esc(nm)}</span>${star ? `<i class="st">&#9733;</i>` : ""}</span></div>`;
    };
    const ordered = items.slice().sort((x, y) => Math.max(x.a, mon) - Math.max(y.a, mon) || y.b - x.b || x.title.localeCompare(y.title));
    const evItems = ordered.filter((x) => x.gi == null);
    const planItems = ordered.filter((x) => x.gi != null && starOf(x));
    const otherItems = ordered.filter((x) => x.gi != null && !starOf(x));
    const nPk = (l) => new Set(l.map((x) => x.gi)).size;
    const band = (cls, label, n) => `<div class="pcg-band ${cls}"><span>${esc(label)}</span><small>${n}</small></div>`;
    let gridBody = "";
    if (!items.length) gridBody = `<div class="meta pcl-empty">${esc(t("pack_cal_empty"))}</div>`;
    else {
      if (evItems.length) gridBody += band("ev", t("pack_cal_events"), evItems.length) + evItems.map(bar).join("");
      if (planItems.length) gridBody += band("plan", "★ " + t("pcl_g_plan"), nPk(planItems)) + planItems.map(bar).join("");
      if (otherItems.length) {
        const n = nPk(otherItems);
        if (PACK_CAL_MORE_BARS) {
          gridBody += band("oth", t("pcl_g_other"), n) + otherItems.map(bar).join("") + `<button type="button" class="pcl-more pcg-less" data-pclbars="0">${esc(t("pcl_show_less"))} &#9652;</button>`;
        } else {
          const ics = [...new Set(otherItems.map((x) => groups[x.gi].icon).filter(Boolean))].map((nm) => packCalImg(nm)).filter(Boolean).slice(0, 5).join("");
          gridBody += `<button type="button" class="pcg-more" data-pclbars="1">${ics ? `<span class="pcg-stk">${ics}</span>` : ""}${esc(t(planItems.length ? "pcl_g_more" : "pcl_g_packs").replace("{n}", n))} &#9662;</button>`;
        }
      }
    }
    const todayCol = 0 - mon;
    // An event starting next week is hinted under the bars (tap = next week).
    const nextEv = collect(sun + 1, sun + 7, false).find((x) => x.kind === "event" && x.ev !== "wheel" && x.a > sun);
    const hintHtml = nextEv && !items.some((x) => x.kind === "event" && x.ev === nextEv.ev) ? `<button type="button" class="pcl-hint" data-pclweek="1"><i style="background:${evCol(nextEv)}"></i>${esc(t("pcl_ev_next_week").replace("{name}", nextEv.title).replace("{day}", `${wd(nextEv.a)} ${dateOf(nextEv.a).getUTCDate()}`))} &#8250;</button>` : "";
    // ---- the picked day ----
    const onDay = items.filter((x) => x.a <= dOff && x.b >= dOff);
    const dayEvs = onDay.filter((x) => x.kind === "event" || x.milestone);
    const dayPacks = onDay.filter((x) => x.gi != null);
    const tagOf = (x) => (x.daily ? "on" : x.a === dOff && x.b !== dOff ? "st" : x.b === dOff ? "end" : "on");
    const dRank = (x) => ({ st: 0, end: 1, on: 2 }[tagOf(x)]) * 2 + (inPlanAt(groups[x.gi], x.a, x.b) ? 0 : 1);
    dayPacks.sort((x, y) => dRank(x) - dRank(y) || x.title.localeCompare(y.title));
    const nextAfter = (gp, b) => { const n = appsOf(gp, b + 120).find((x) => x.a > b); return n ? n.a : null; };
    const rowHtml = (x) => {
      const gp = groups[x.gi], tg = tagOf(x), star = inPlanAt(gp, x.a, x.b);
      const bits = [];
      if (star) bits.push(`★ ${t("pcl_in_plan")}`);
      if (gp.link.reset === 1) bits.push(t("pcl_every_day"));
      else if (tg === "end") { if (x.b === 0) bits.push(t("pcl_ends_today")); const n = nextAfter(gp, x.b); if (n != null && !gp.newGen) bits.push(t("pcl_back").replace("{date}", n - x.b <= 7 ? `${wd(n)} ${dateOf(n).getUTCDate()}` : md(n))); }
      else if (x.b > dOff) bits.push(t("pcl_to").replace("{date}", x.b - dOff <= 6 ? `${wd(x.b)} ${dateOf(x.b).getUTCDate()}` : md(x.b)));
      if (tg === "st" && !gp.newGen && gp.link.reset > 7) bits.unshift(resetText(gp.link).toLowerCase());
      const pill = `<span class="pcl-pill ${tg === "st" ? "now" : tg === "end" ? "end" : "on"}">${esc(t(tg === "st" ? "pcl_starts" : tg === "end" ? "pcl_ends" : "pcl_on"))}</span>`;
      return `<div class="pcl-rw" data-pclg="${x.gi}|${dOff}" role="button" tabindex="0"><span class="pcl-ic">${packCalImg(gp.icon) || "&#127873;"}</span><span class="pcl-rt"><b>${esc(x.title)}${x.count > 1 ? ` <small>×${x.count}</small>` : ""}</b><span>${pill} ${esc(bits.join(" · "))}</span></span><span class="pcl-rp">${esc(gp.price)}</span></div>`;
    };
    const evRow = (x) => {
      const lbl = x.milestone ? (x.tip || "") : x.b === dOff ? t("pcl_last_day") : t("pcl_day_n").replace("{n}", dOff - x.a + 1).replace("{m}", x.days);
      return `<div class="pcl-evb ${x.kind === "event" ? (x.ev === "koi" ? "koi" : x.ev === "wheel" ? "wh" : "svs") : x.kind === "unlocks" ? "ul" : "gen"}"${x.kind === "event" && x.ev !== "wheel" && x.ev !== "svs" && x.ev !== "koi" ? ` style="${gameEventTint(x.ev)}"` : ""}>${x.kind === "event" && x.ev !== "wheel" ? "&#9876; " : ""}${esc(x.title)}<small>${esc(lbl)}</small></div>`;
    };
    const DMAX = 4;
    const listShown = PACK_CAL_DAY_MORE ? dayPacks : dayPacks.slice(0, DMAX);
    const dayHead = `${wdmd(dOff)}${dOff === 0 ? " · " + t("pcl_on_now") : ""}`;
    const nCh = PACK_CAL_FILTER.off.size + (PACK_CAL_FILTER.plan ? 1 : 0);

    const y = window.scrollY;
    content.innerHTML = `
      <div class="plx-head pcl-head"><h2>${esc(t("pack_cal_title"))}</h2><button type="button" class="pcl-fbtn hd-btn" data-pclfilter>&#9881; ${esc(t("pcl_filter"))}${nCh ? `<span class="pcl-badge">${nCh}</span>` : ""}</button></div>
      <p class="desc">${esc(t("pcl_desc"))}</p>
      <div class="panel pcl-ans">
        <div class="pcl-two">
          <div class="pcl-bx"><span class="l">${esc(t("pcl_today"))}</span><b>${esc(t("pcl_packs_on").replace("{n}", nOn))}</b><small>${esc(nEnd ? t("pcl_end_today").replace("{n}", nEnd) : t("pcl_none_end"))}</small></div>
          <div class="pcl-bx ${evCls}"${evSty}><span class="l">${esc(t("pcl_next_event"))}</span><b>${esc(ev1 ? evText(ev1) : "—")}</b><small>${esc(ev2 ? evText(ev2) : "")}</small></div>
        </div>
      </div>
      <div class="panel pcl-wk">
        <div class="pcl-wkh"><button type="button" class="pcl-nb" data-pclweek="-1" aria-label="previous">&#8249;</button><button type="button" class="pcl-wkt" data-pclmonth aria-haspopup="dialog"><b>${esc(wkRange)}${wkLbl ? ` · ${esc(wkLbl)}` : ""}</b> &#9662;</button>${PACK_CAL_WEEK ? `<button type="button" class="pcl-today" data-pcltoday>${esc(t("pack_cal_today_btn"))}</button>` : ""}<button type="button" class="pcl-nb" data-pclweek="1" aria-label="next">&#8250;</button></div>
        <div class="pcg">
          <div class="pcg-dh-ph"><div class="pcg-dh">${dayRow}</div></div>
          <div class="pcg-body">
            ${[1, 2, 3, 4, 5, 6].map((i) => `<span class="pcg-col" style="--a:${i}"></span>`).join("")}
            ${todayCol >= 0 && todayCol <= 6 ? `<span class="pcg-tdcol" style="--a:${todayCol}"></span>` : ""}
            ${picked && pick !== todayCol ? `<span class="pcg-selcol" style="--a:${pick}"></span>` : ""}
            ${gridBody}
          </div>
        </div>
        ${hintHtml}
      </div>
      <div class="panel pcl-day">
        <div class="pcl-dh"><b>${esc(dayHead)}</b><span>${esc(dayPacks.length === 1 ? t("pur_1_pack") : t("pcl_n_packs").replace("{n}", dayPacks.length))}</span></div>
        ${dayEvs.map(evRow).join("")}
        ${listShown.map(rowHtml).join("") || (dayEvs.length ? "" : `<div class="meta pcl-empty">${esc(t("pcl_no_packs_day"))}</div>`)}
        ${dayPacks.length > DMAX ? `<button type="button" class="pcl-more" data-pcldaymore="${PACK_CAL_DAY_MORE ? 0 : 1}">${esc(PACK_CAL_DAY_MORE ? t("pcl_show_less") + " ▴" : t("pcl_more").replace("{n}", dayPacks.length - DMAX))}</button>` : ""}
        <div class="meta pcl-utc">${esc(t("pcl_utc"))}</div>
      </div>
      <div id="pclSheetHost">${!PACK_CAL_SHEET ? "" : PACK_CAL_SHEET.type === "pack" ? packSheetHtml(PACK_CAL_SHEET) : PACK_CAL_SHEET.type === "filter" ? filterSheetHtml() : monthSheetHtml(PACK_CAL_SHEET.m)}</div>`;
    if (y && Math.abs(window.scrollY - y) > 1) window.scrollTo(0, y);
    packCalFit(content);
    packCalPin(content);
    wire();
  }
  const closeSheet = () => { PACK_CAL_SHEET = null; draw(); };
  function wire() {
    const q = (s) => content.querySelectorAll(s);
    q("[data-pclfilter]").forEach((b) => b.addEventListener("click", () => { PACK_CAL_SHEET = { type: "filter" }; draw(); }));
    q("[data-pclday]").forEach((b) => b.addEventListener("click", () => { PACK_CAL_DAY = Number(b.dataset.pclday); PACK_CAL_DAY_MORE = false; draw(); }));
    q("[data-pclweek]").forEach((b) => b.addEventListener("click", () => { PACK_CAL_WEEK = Math.max(-8, Math.min(52, PACK_CAL_WEEK + Number(b.dataset.pclweek))); PACK_CAL_DAY = null; PACK_CAL_DAY_MORE = false; PACK_CAL_MORE_BARS = false; draw(); }));
    q("[data-pcltoday]").forEach((b) => b.addEventListener("click", () => { PACK_CAL_WEEK = 0; PACK_CAL_DAY = null; PACK_CAL_DAY_MORE = false; PACK_CAL_MORE_BARS = false; draw(); }));
    q("[data-pclmonth]").forEach((b) => b.addEventListener("click", () => {
      const ms = dateOf(PACK_CAL_WEEK * 7 - monIdx);
      PACK_CAL_SHEET = { type: "month", m: (ms.getUTCFullYear() - t0.getUTCFullYear()) * 12 + ms.getUTCMonth() - t0.getUTCMonth() };
      draw();
    }));
    q("[data-pclbars]").forEach((b) => b.addEventListener("click", () => {
      const open = b.dataset.pclbars === "1";
      const card = content.querySelector(".pcl-wk"), top = card ? card.getBoundingClientRect().top : 0;
      PACK_CAL_MORE_BARS = open; draw();
      // "Show less": the week card stays where it was on screen.
      if (!open) { const c2 = content.querySelector(".pcl-wk"); if (c2) window.scrollBy(0, c2.getBoundingClientRect().top - top); }
    }));
    q("[data-pcldaymore]").forEach((b) => b.addEventListener("click", () => { PACK_CAL_DAY_MORE = b.dataset.pcldaymore === "1"; draw(); }));
    const openPack = (el) => { const [g, a] = el.dataset.pclg.split("|").map(Number); PACK_CAL_SHEET = { type: "pack", g, a, ti: 0 }; draw(); };
    q("[data-pclg]").forEach((el) => {
      el.addEventListener("click", () => openPack(el));
      el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openPack(el); } });
    });
    q("[data-pcltip]").forEach((el) => el.addEventListener("click", () => toast(el.dataset.pcltip)));
    // ---- sheets ----
    const host = document.getElementById("pclSheetHost");
    if (!host || !PACK_CAL_SHEET) return;
    const ov = host.querySelector("[data-pclclose]");
    ov.addEventListener("click", (e) => { if (e.target === ov) closeSheet(); });
    host.querySelectorAll("[data-pclx]").forEach((b) => b.addEventListener("click", closeSheet));
    host.querySelectorAll("[data-pclti]").forEach((b) => b.addEventListener("click", () => { PACK_CAL_SHEET = { ...PACK_CAL_SHEET, ti: Number(b.dataset.pclti) }; draw(); }));
    host.querySelectorAll("[data-pclopen]").forEach((b) => b.addEventListener("click", () => { PACK_CAL_SHEET = null; packOpenOnPacks(b.dataset.pclopen); }));
    host.querySelectorAll("[data-pclbuy]").forEach((b) => b.addEventListener("click", () => {
      const st = PACK_CAL_SHEET, gp = groups[st.g];
      const tb = gp.tables[Math.min(st.ti || 0, gp.tables.length - 1)];
      const mine = gp.plan.filter((x) => (x.r.tables || []).map(String).includes(String(tb.id)));
      PUR_FOCUS = { table: String((mine[0] ? tb : gp.tables[0]).id), off: Math.max(0, st.a), at: Date.now() };
      PACK_CAL_SHEET = null;
      goToTab("purchases");
    }));
    host.querySelectorAll("[data-pclkind]").forEach((b) => b.addEventListener("click", () => { const k = b.dataset.pclkind; if (PACK_CAL_FILTER.off.has(k)) PACK_CAL_FILTER.off.delete(k); else PACK_CAL_FILTER.off.add(k); packCalSaveFilter(); draw(); }));
    host.querySelectorAll("[data-pclplan]").forEach((b) => b.addEventListener("change", () => { PACK_CAL_FILTER.plan = b.checked; packCalSaveFilter(); draw(); }));
    host.querySelectorAll("[data-pclreset]").forEach((b) => b.addEventListener("click", () => { PACK_CAL_FILTER.off.clear(); PACK_CAL_FILTER.plan = false; packCalSaveFilter(); draw(); }));
    host.querySelectorAll("[data-pclm]").forEach((b) => b.addEventListener("click", () => { PACK_CAL_SHEET = { type: "month", m: Math.max(-6, Math.min(12, PACK_CAL_SHEET.m + Number(b.dataset.pclm))) }; draw(); }));
    host.querySelectorAll("[data-pclwk]").forEach((b) => b.addEventListener("click", () => { PACK_CAL_WEEK = Math.max(-8, Math.min(52, Number(b.dataset.pclwk))); PACK_CAL_DAY = null; PACK_CAL_DAY_MORE = false; PACK_CAL_MORE_BARS = false; PACK_CAL_SHEET = null; draw(); }));
  }
  PACK_CAL_SHEET = null;
  draw();
  // Esc closes an open sheet (only while this page is drawn).
  const onKey = (e) => {
    if (TAB !== "packcalendar") { document.removeEventListener("keydown", onKey); return; }
    if (e.key === "Escape" && PACK_CAL_SHEET) closeSheet();
  };
  document.removeEventListener("keydown", PACK_CAL_KEY);
  PACK_CAL_KEY = onKey;
  document.addEventListener("keydown", onKey);
}
// Calendar → "Open pack ›": the Packs page with that pack's window open.
let PACK_OPEN_FOCUS = null;
function packOpenOnPacks(id) {
  PACK_OPEN_FOCUS = String(id);
  const g = packLinkFor(id).group;
  try { localStorage.setItem("packs_filter", g ? "cat:" + g : "all"); } catch (e) { /* blocked */ }
  goToTab("packs");
}
// Packs B: the search text and the categories showing all
// their rows, kept for the visit; PKB_HOOK opens / closes the pack window from
// outside the page (Back button, ⚙ in Pack dates, My Purchases' weekly cards).
let PKB_QUERY = "";
const PKB_MORE = new Set();
// The owner's "Arrange" fold (its category key, null = none), kept for the visit.
let PKB_ARRANGE_CAT = null;
// The owner's own order of rows in a fold / inside an event card, saved for
// everyone in packs_links.__rowOrder = { "<category>": [ids], "ev:<leaderId>": [ids] }.
function pkbRowOrder() {
  const o = PACK_LINKS && PACK_LINKS.__rowOrder;
  return o && typeof o === "object" && !Array.isArray(o) ? o : {};
}
// Puts items in the saved order; items not in it (new packs) follow in the
// order they came (A to Z), ids no longer there are skipped. No saved list =
// the same array back.
function pkbByOrder(list, saved, idOf) {
  if (!Array.isArray(saved) || !saved.length) return list;
  const pos = new Map(saved.map((id, i) => [String(id), i]));
  const known = list.filter((x) => pos.has(String(idOf(x)))).sort((a, b) => pos.get(String(idOf(a))) - pos.get(String(idOf(b))));
  return known.concat(list.filter((x) => !pos.has(String(idOf(x)))));
}
// Pack tables in "⇅ Arrange" mode (a ⋮⋮ under each column to drag it), kept for the visit.
const PK_ARRANGE = new Set();
async function renderPacksPageMain() {
  const seq = RENDER_SEQ;
  if (!(history.state && history.state.tab === "packs" && history.state.pkb)) PACKS_OPEN.clear();
  let pkbReady = false;
  content.innerHTML = `
    <div class="page-head">
      <div>
        <h2>${esc(t("packs_title"))}</h2>
        <p class="desc">${esc(IS_OWNER ? t("packs_desc") : t("packs_desc_visitor"))}</p>
      </div>
      <div class="pkb-hbtns">
        ${hiddenForVisitor("page", "packcalendar") ? "" : `<button class="btn ghost hd-btn" id="packsCalendarBtn">📅 ${esc(t("pack_cal_button"))}</button>`}
        ${IS_OWNER ? `<button class="btn pkb-add hd-btn" id="packsAddTable" title="${esc(t("add_table_button"))}" aria-label="${esc(t("add_table_button"))}">+</button>` : ""}
      </div>
    </div>
    <div class="pk-zone-note">ℹ️ ${esc(t("pk_zone_note"))}</div>
    <div class="panel pkb-top">
      <label class="pkb-search"><span aria-hidden="true">&#128269;</span><input type="search" id="pkbSearch" placeholder="${esc(t("pkb_search"))}" value="${esc(PKB_QUERY)}" autocomplete="off" enterkeyhint="search" /></label>
      <div class="pkb-tri">
        <button type="button" class="pkb-tb" data-pkbdp="ng" hidden><span class="pkb-tb-ic" aria-hidden="true">&#11088;</span><span class="pkb-tb-t"><b>${esc(t("pkb_new_heroes"))}</b><small class="meta" data-pkbdpsub="ng"></small></span></button>
        <button type="button" class="pkb-tb" data-pkbdp="dates"><span class="pkb-tb-ic" aria-hidden="true">&#128197;</span><span class="pkb-tb-t"><b>${esc(t("pkb_dates_t"))}</b><small class="meta" data-pkbdpsub="dates"></small></span></button>
        <button type="button" class="pkb-tb" data-pkbdp="prices"><span class="pkb-tb-ic pkb-tb-usd" aria-hidden="true">$</span><span class="pkb-tb-t"><b>${esc(t("pkb_prices_t"))}</b><small class="meta" data-pkbdpsub="prices"></small></span></button>
      </div>
    </div>
    <div class="pkb-ov" id="pkbDpSheet" hidden>
      <div class="pkb-sheet" role="dialog" aria-label="${esc(t("pkb_dates_prices"))}">
        <div class="pkb-sh-h"><button type="button" class="pkb-back" data-pkbdpclose aria-label="${esc(t("close_button"))}">&#8249;</button><b id="pkbDpTitle">${esc(t("pkb_dates_prices"))}</b></div>
        <div class="pkb-sh-b"><div id="packsNewHeroes" data-pkbpart="ng"></div><div id="packsMyDates" data-pkbpart="dates"></div><div id="packsPriceStrip" data-pkbpart="prices"></div></div>
      </div>
    </div>
    <div id="packsList"></div>
  `;

  const calBtn = document.getElementById("packsCalendarBtn");
  if (calBtn) calBtn.addEventListener("click", () => goToTab("packcalendar"));
  // Packs B: search (pack names and the items they give) and the
  // "Pack dates & prices" window.
  const pkbSearchIn = document.getElementById("pkbSearch");
  let pkbSearchT = 0;
  pkbSearchIn.addEventListener("input", () => {
    clearTimeout(pkbSearchT);
    pkbSearchT = setTimeout(() => { PKB_QUERY = pkbSearchIn.value; if (pkbReady) renderAll(); }, 150);
  });
  const pkbDp = document.getElementById("pkbDpSheet");
  // Three boxes (New heroes / Pack dates / Prices), each opening the same
  // window with only its own part showing.
  const PKB_DP_TITLES = { ng: "pkb_new_heroes", dates: "pkb_dates_t", prices: "pkb_prices_t" };
  const pkbDpShow = (on, part) => {
    if (on) {
      const pt = PKB_DP_TITLES[part] ? part : "dates";
      pkbDp.querySelectorAll("[data-pkbpart]").forEach((el) => { el.hidden = el.dataset.pkbpart !== pt; });
      const ttl = t(PKB_DP_TITLES[pt]);
      const ttlEl = document.getElementById("pkbDpTitle");
      ttlEl.textContent = ttl;
      ttlEl.classList.remove("has-info");
      if (pt === "ng") ngTitleInfo(ttlEl);
      pkbDp.querySelector(".pkb-sheet").setAttribute("aria-label", ttl);
      const sb = pkbDp.querySelector(".pkb-sh-b"); if (sb) sb.scrollTop = 0;
      if (pt === "dates") { const box = pkbDp.querySelector("details.pkd-box"); if (box && !box.open) box.open = true; }
    }
    pkbDp.hidden = !on;
  };
  content.querySelectorAll("[data-pkbdp]").forEach((b) => b.addEventListener("click", () => pkbDpShow(true, b.dataset.pkbdp)));
  pkbDp.addEventListener("click", (e) => { if (e.target === pkbDp || e.target.closest("[data-pkbdpclose]")) pkbDpShow(false); });
  // The short line under each box.
  const pkbDpSub = () => {
    const sub = (k, txt) => { const el = content.querySelector(`[data-pkbdpsub="${k}"]`); if (el) el.textContent = txt; };
    const n = pkbDp.querySelectorAll("#packsMyDates .pkd-row").length;
    sub("dates", n ? t("pkb_dates_n").replace("{n}", n) : t("pkb_dates_none"));
    sub("prices", DISPLAY_CURRENCY || "USD");
    const ngBtn = content.querySelector('[data-pkbdp="ng"]');
    const ngEl = document.getElementById("packsNewHeroes");
    if (ngBtn) ngBtn.hidden = !(ngEl && ngEl.firstChild);
    const nx = purNextNewGen();
    let day = "";
    if (nx) { try { day = nx.date.toLocaleDateString(LANG === "en" ? undefined : LANG, { day: "numeric", month: "short", timeZone: "UTC" }); } catch (e) { day = packDayKey(nx.date); } }
    // Narrow phones: break only between "Gen 15 ·" and the date, never inside the date.
    day = day.replace(/ /g, " ");
    sub("ng", !nx ? t("pkb_ng_sub_set") : nx.gen ? t("pkb_ng_sub").replace("{gen}", nx.gen).replace("{date}", day) : day);
  };
  const listEl = document.getElementById("packsList");
  // Tap a summary card's Edit (or its title) to open / close that table.
  // "Budgets" tick on each card: count this pack in Budgets or not.
  listEl.addEventListener("change", (e) => {
    const cb = e.target.closest("[data-pkbud], [data-pkbudrow]");
    if (!cb) return;
    const id = String(cb.dataset.pkbudrow || cb.closest("[data-packtable]").dataset.pkid);
    if (cb.checked) delete PACK_BUDGET_OFF[id]; else PACK_BUDGET_OFF[id] = true;
    const panel = cb.closest("[data-packtable]");
    if (panel) panel.classList.toggle("pk-budoff", !cb.checked);
    saveCalcState("pack_budget_off", PACK_BUDGET_OFF);
    PACK_PLAN_CACHE.clear();
    budgetInvalidate();
    pkbSyncBudget(id);
  });
  // Packs B: a category opens (one at a time) or folds, "Show N more", a row
  // opens its pack's window; the window's ‹ / dim edge closes it.
  listEl.addEventListener("click", (e) => {
    if (e.target.closest(".pkb-tk") || e.target.closest(".pkb-cat .ds-h")) return;
    // the details sheet: ✕ / the dim edge close it, "Open pack ›" opens the
    // pack window, Shining City's Normal | First buy switch
    if (e.target.closest("[data-pkbiclose]") || (e.target.matches && e.target.matches("[data-pkbinfoov]"))) { pkbInfoClose(false); return; }
    const opn = e.target.closest("[data-pkbopen]");
    if (opn) { pkbOpen(opn.dataset.pkbopen); return; }
    const shn = e.target.closest("[data-pkdshine]");
    if (shn) { PKB_SHINE_FIRST = shn.dataset.pkdshine === "1"; pkbInfoDraw(); return; }
    if (e.target.closest(".pkd-sw")) return;
    const arrB = e.target.closest("[data-pkbarr]");
    if (arrB) {
      const k = arrB.dataset.pkbarr;
      PKB_ARRANGE_CAT = PKB_ARRANGE_CAT === k ? null : k;
      renderAll();
      return;
    }
    const arrR = e.target.closest("[data-pkbarrreset]");
    if (arrR) { pkbArrangeReset(arrR.dataset.pkbarrreset); return; }
    // the event's one tick: all on, or all off when all are on
    const evAll = e.target.closest("[data-pkbevall]");
    if (evAll) {
      const ids = evAll.dataset.pkbevall.split(",").filter(Boolean), allOn = ids.every((id) => packInBudgets(id));
      ids.forEach((id) => { if (allOn) PACK_BUDGET_OFF[id] = true; else delete PACK_BUDGET_OFF[id]; });
      saveCalcState("pack_budget_off", PACK_BUDGET_OFF);
      PACK_PLAN_CACHE.clear();
      budgetInvalidate();
      ids.forEach((id) => pkbSyncBudget(id));
      return;
    }
    const evTap = e.target.closest("[data-pkbevtap]");
    if (evTap) { if (!evTap.closest(".pkb-arranging")) pkbInfoOpen("ev:" + evTap.dataset.pkbevtap); return; }
    const fold = e.target.closest("[data-pkbfold]");
    if (fold) {
      const k = fold.dataset.pkbfold, wasOpen = fold.closest(".pkb-cat").classList.contains("open"), top0 = fold.getBoundingClientRect().top;
      PKB_ARRANGE_CAT = null;
      packsFilter = wasOpen ? "closed" : (k ? "cat:" + k : "none");
      try { localStorage.setItem("packs_filter", packsFilter); } catch (err) { /* blocked */ }
      renderAll();
      // keep the tapped heading where it was on the screen
      const again = listEl.querySelector(`[data-pkbfold="${window.CSS.escape(k)}"]`);
      if (again) { const d = again.getBoundingClientRect().top - top0; if (Math.abs(d) > 1) window.scrollBy(0, d); }
      return;
    }
    const more = e.target.closest("[data-pkbmore]");
    if (more) { PKB_MORE.add(more.dataset.pkbmore); renderAll(); return; }
    if (e.target.closest("[data-pkbclose]") || (e.target.matches && e.target.matches("[data-pkbsheet]"))) { pkbClose(false); return; }
    const go = e.target.closest("[data-pkbgo]");
    if (go) { pkbOpen(go.dataset.pkbgo); return; }
    const row = e.target.closest("[data-pkrowid]");
    if (row && !row.closest(".pkb-arranging")) pkbInfoOpen("t:" + row.dataset.pkrowid);
  });
  listEl.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches("[data-pkrowid]")) { e.preventDefault(); if (!e.target.closest(".pkb-arranging")) pkbInfoOpen("t:" + e.target.dataset.pkrowid); }
    if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches("[data-pkbevtap]")) { e.preventDefault(); e.target.click(); }
  });
  // "How it's bought" dropdown in the window sets the same radio buttons as before.
  listEl.addEventListener("change", (e) => {
    const sel = e.target.closest && e.target.closest("select[data-pkbhow]");
    if (!sel) return;
    const panel = sel.closest("[data-packtable]"), radio = panel && panel.querySelector(`input[data-pkhow="${window.CSS.escape(sel.value)}"]`);
    if (radio && !radio.checked) { radio.checked = true; radio.dispatchEvent(new Event("change", { bubbles: true })); }
  });
  listEl.addEventListener("click", (e) => {
    const b = e.target.closest("[data-pk-toggle]");
    if (!b) return;
    const panel = b.closest("[data-packtable]");
    const id = panel.dataset.pkid;
    const open = !PACKS_OPEN.has(id);
    if (open) PACKS_OPEN.add(id); else PACKS_OPEN.delete(id);
    if (open) buildPkBody(panel);
    panel.classList.toggle("pk-open", open);
    panel.querySelector(".pk-body").hidden = !open;
    panel.querySelector("[data-pk-toggle].btn").textContent = open ? t("pk_close") : t("pk_edit");
  });
  // Column dropdowns are built with only their shown option; fill in the
  // full list on the first touch / click / focus / key, before it opens.
  const fillPackColPick = (e) => {
    const sel = e.target && e.target.closest ? e.target.closest("select[data-pt-lazy]") : null;
    if (!sel) return;
    const panel = sel.closest("[data-packtable]");
    const tb = panel && tables[Number(panel.dataset.packtable)];
    if (!tb) return;
    sel.removeAttribute("data-pt-lazy");
    sel.innerHTML = packColumnOptionsHtml(tb, Number(sel.dataset.col));
  };
  ["pointerdown", "mousedown", "touchstart", "focusin", "keydown"].forEach((ev) => listEl.addEventListener(ev, fillPackColPick, true));
  // A1: "⇅ Arrange" shows a ⋮⋮ under each column to drag it sideways; a column picture opens
  // the item list (with search).
  listEl.addEventListener("click", (e) => {
    // A tap anywhere else closes an open ⋯ menu.
    pkCloseMenus(e.target);
    const arr = e.target.closest("[data-pkarrange]");
    if (arr) {
      const panel = arr.closest("[data-packtable]"), id = panel && panel.dataset.pkid;
      if (!id) return;
      if (PK_ARRANGE.has(id)) PK_ARRANGE.delete(id); else PK_ARRANGE.add(id);
      panel.classList.toggle("pk-arrange", PK_ARRANGE.has(id));
      arr.classList.toggle("on", PK_ARRANGE.has(id));
      return;
    }
    const inf = e.target.closest("[data-pksinfo]");
    if (inf) {
      e.preventDefault();
      const box = inf.closest("[data-packlink]"), txt = box && box.querySelector(`[data-pksinfotext="${window.CSS.escape(inf.dataset.pksinfo)}"]`);
      if (txt) txt.hidden = !txt.hidden;
      return;
    }
    const step = e.target.closest("[data-pksstep]");
    if (step) {
      const inp = step.parentElement.querySelector("input[type=number]");
      if (!inp) return;
      const v = Math.max(Number(inp.min) || 1, Math.min(Number(inp.max) || 99, (Number(inp.value) || 0) + Number(step.dataset.pksstep)));
      if (v !== Number(inp.value)) { inp.value = v; inp.dispatchEvent(new Event("change", { bubbles: true })); }
      return;
    }
    const hd = e.target.closest("[data-pkhd]");
    if (hd) {
      const panel = hd.closest("[data-packtable]"), tb = panel && tables[Number(panel.dataset.packtable)];
      if (tb) pkOpenItemSheet(panel, tb, Number(hd.dataset.pkhd));
    }
  });
  function pkOpenItemSheet(panel, tb, ci) {
    const th = panel.querySelectorAll("thead th.pk-th")[ci];
    const sel = th && th.querySelector("select[data-pt-colpick]");
    if (!sel) return;
    if (sel.hasAttribute("data-pt-lazy")) { sel.removeAttribute("data-pt-lazy"); sel.innerHTML = packColumnOptionsHtml(tb, ci); }
    const opts = [...sel.options].map((o) => ({ v: o.value, txt: o.textContent, on: o.selected }));
    document.querySelector(".pk-sheet-back")?.remove();
    const back = document.createElement("div");
    back.className = "pk-sheet-back";
    const listHtml = (q) => opts.filter((o) => !q || o.txt.toLowerCase().includes(q)).map((o) => {
      const real = o.v && !o.v.startsWith("__"), tm = real ? pkSpeedTime(o.v) : "";
      const txt = tm ? `<b>${esc(tm)}</b> · ${esc(o.txt.replace(/\s*\d+\s*(m|min|mins|h|hr|hrs)\.?$/i, ""))}` : esc(o.txt);
      return `<button type="button" class="pk-sheet-o${o.on ? " on" : ""}${o.v === "__remove__" ? " del" : ""}" data-pkopt="${esc(o.v)}"><span class="pk-sheet-ic">${real ? pkIconHtml(o.v) : ""}</span><span>${txt}</span></button>`;
    }).join("") || `<div class="meta" style="padding:10px;">—</div>`;
    back.innerHTML = `<div class="pk-sheet" role="dialog">
      <div class="pk-sheet-h"><b>${esc(t("pk_col_item").replace("{n}", ci + 1))}</b><input type="search" data-pksearch placeholder="${esc(t("pk_search_items"))}" /><button type="button" class="pk-sheet-x" data-pkclose aria-label="Close">&times;</button></div>
      <div class="pk-sheet-list">${listHtml("")}</div></div>`;
    document.body.appendChild(back);
    const close = () => { back.remove(); document.removeEventListener("keydown", onKey); };
    const onKey = (e) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    const list = back.querySelector(".pk-sheet-list");
    list.querySelector(".on")?.scrollIntoView({ block: "center" });
    back.querySelector("[data-pksearch]").addEventListener("input", (e) => { list.innerHTML = listHtml(e.target.value.trim().toLowerCase()); });
    back.addEventListener("click", (e) => {
      if (e.target === back || e.target.closest("[data-pkclose]")) { close(); return; }
      const o = e.target.closest("[data-pkopt]");
      if (o) {
        close();
        if (sel.value === o.dataset.pkopt && o.dataset.pkopt !== "__custom__") return;
        sel.value = o.dataset.pkopt;
        sel.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
  }

  const [tablesLoaded] = await Promise.all([
    packTablesRows(),
    ensurePackLinks(),
    ensureSiteConfig(),
  ]);
  if (seq !== RENDER_SEQ) return;
  // Natalia Reward Pack / VIP Packs: "done" marks (reads only when needed).
  if ((tablesLoaded || []).some((tb) => packIsFirstBuy(tb.id) || vipPackHeroOf(tb.id))) { await vipHeroesCheck(); if (seq !== RENDER_SEQ) return; }
  let tables = packApplyMyEdits(tablesLoaded).filter((tb) => IS_OWNER || !packLinkFor(tb.id).hideVisitors);
  // Visitors copy the templates in "My packs"; they aren't listed as packs.
  const templateTables = tables.filter((tb) => packLinkFor(tb.id).template);
  if (!IS_OWNER) tables = tables.filter((tb) => !packLinkFor(tb.id).template);
  // Admin: the three Pack templates are made once, copied from your own tables.
  if (IS_OWNER && !templateTables.length && !(await calcFlagSet("pack_templates_seeded"))) {
    const made = await packSeedTemplates(tables);
    saveCalcState("pack_templates_seeded", { at: Date.now(), made });
    if (made) { toast(`${made} ${t("mp_templates_added")}`); renderPacksPage(); return; }
  }

  PACK_TABLES_ALL = tables;
  packTablesStash(); // pages re-read them fresh after any edit here
  // First visit: the in-game pack tables are created automatically (once
  // per account, so deleting one later doesn't bring it back).
  if (IS_OWNER && !(await calcFlagSet("pack_presets_seeded"))) {
    saveCalcState("pack_presets_seeded", { at: Date.now() });
    const added = await packAddPresets(tables);
    if (added) { toast(`${added} ${t("pack_presets_added")}`); renderPacksPage(); return; }
  }


  function blankRow(colCount) {
    return { cells: Array(colCount).fill(""), is_total: false };
  }

  // Gems is a fixed, universal WOS price table (not something that varies
  // per-pack like FC/Speedups), so it's looked up directly rather than
  // scaled from Row 1 - it fills on every row, including Row 1 itself.
  // (Admin → Rules "Gems in a pack by price", MP_GEMS / mpGems.)

  // The Amount column itself follows this same fixed sequence in every
  // table. Typing Row 1's Amount as one of these values auto-fills every
  // row below it with the next value in the sequence - e.g. Row 1 = 0.99
  // fills Row 2 with 2.99, Row 3 with 4.99, and so on for however many
  // rows exist (or however far the sequence goes, whichever is shorter).
  // The prices of the Rules "Gems in a pack by price" table, low to high.
  const amountSequence = () => Object.keys(MP_GEMS).map(Number).filter((v) => v > 0).sort((a, b) => a - b);
  function applyAmountSequence(panel, t, onlyRowIndex) {
    const AMOUNT_SEQUENCE = amountSequence();
    const row0Amount = parseNum(panel.querySelector('[data-pt-cell][data-row="0"][data-col="0"]')?.value);
    const startIdx = AMOUNT_SEQUENCE.findIndex((v) => Math.abs(v - row0Amount) < 0.001);
    if (startIdx === -1) return;
    const rowEls = panel.querySelectorAll("tbody tr");
    rowEls.forEach((tr, ri) => {
      if (ri === 0) return; // Row 1 is what was just typed - never overwritten
      if (onlyRowIndex != null && ri !== onlyRowIndex) return; // scoped to one row - leaves other rows' manual edits alone
      const seqVal = AMOUNT_SEQUENCE[startIdx + ri];
      if (seqVal == null) return; // sequence ran out before the rows did
      const amountCell = tr.querySelector('[data-pt-cell][data-col="0"]');
      if (amountCell) amountCell.value = fmtNum(seqVal);
    });
  }

  // Row 1 (the first row) sets the scale for every OTHER column (not Gems -
  // see mpGems): its ratio to the Amount (column 0) is measured
  // from Row 1's own values. Typing an Amount into any other row then
  // auto-fills that row's remaining (non-Gems) columns using that ratio -
  // e.g. if Row 1 is $4.99 / 60 FC / 35 Speedups, FC is locked at 12.02x the
  // amount and Speedups at ~7.01x, and typing "9.99" as Amount on Row 2 fills
  // FC/Speedups automatically.
  function parseNum(str) {
    const n = parseFloat(String(str).replace(/[^0-9.-]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  function fmtNum(n) {
    return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  // Totals of 100,000 and up are shortened so they fit their column (444K,
  // 1.11M); the full number is in the cell's title (long-press).
  function pkShortNum(n, tight) {
    const a = Math.abs(n);
    if (tight && a >= 1e4 && a < 1e5) return (Math.round(n / 100) / 10).toString().replace(/\.0$/, "") + "K";
    if (a >= 1e6) return (n / 1e6).toFixed(a >= 1e7 ? 1 : 2).replace(/\.?0+$/, "") + "M";
    if (a >= 1e5) return Math.round(n / 1e3) + "K";
    return fmtNum(n);
  }
  // A1 header: each column shows its item's picture.
  // The owner taps it to choose the item (pkOpenItemSheet); the real
  // dropdown stays hidden underneath and does the work.
  function pkColItem(tb, ci) {
    return packEffectiveCols(tb)[ci] || String(tb.columns[ci] || "").trim();
  }
  function pkHeadHtml(tb, ci) {
    const link = packLinkFor(tb.id);
    const cur = String(tb.columns[ci] || "").trim();
    const fixed = ci === link.priceCol || (packIsNonResourceColumn(cur) && cur.toLowerCase() !== "gems");
    if (fixed) return `<div class="pk-hd">${packColumnControlHtml(tb, ci)}</div>`;
    const name = pkColItem(tb, ci), label = materialDisplayName(name) || name, tm = pkSpeedTime(name);
    // A hero's own shards / widgets: the hero's face in the corner (two heroes' shards look alike).
    const hm = /^(.+) (Shards|Widgets)$/.exec(String(name)), hImg = hm && !heroOwnShardIcon(name) && HERO_IMG_BY_NAME[hm[1]];
    const face = (pkIconHtml(name) || `<b>${esc(String(label || "?").slice(0, 3))}</b>`) + (hImg ? `<img class="pk-hface" src="${esc(hImg)}" alt="" loading="lazy" />` : "");
    if (cur.toLowerCase() === "gems") {
      return `<div class="pk-hd"><span class="pk-hdi" title="${esc(label)}">${face}${IS_OWNER ? `<button type="button" class="pk-hdx" data-pt-gemsdel data-col="${ci}" title="${esc(t("pack_remove_column"))}">&times;</button>` : ""}</span></div>`;
    }
    return `<div class="pk-hd">${IS_OWNER
      ? `<button type="button" class="pk-hdi${tm ? " pk-ring" : ""}" data-pkhd="${ci}"${tm ? ` style="--ring:${pkTimeRing(tm)}"` : ""} title="${esc(label)}" aria-label="${esc(label)}">${face}<i>&#9662;</i></button>`
      : `<span class="pk-hdi${tm ? " pk-ring" : ""}"${tm ? ` style="--ring:${pkTimeRing(tm)}"` : ""} title="${esc(label)}">${face}</span>`}</div><div class="pk-hd-ctl">${packColumnControlHtml(tb, ci)}</div>`;
  }
  // Which column holds the price - the only one that may have decimals.
  function priceColOf(tb) {
    const ci = packLinkFor(tb.id).priceCol;
    return typeof ci === "number" ? ci : 0;
  }
  // Quantities are whole items: auto-filled values round to the nearest
  // whole number (48 at $0.99 scaled to $2.99 is 144.97 -> 145, and to
  // $1.99 is 96.48 -> 96). Only the price column keeps decimals.
  function fmtQty(n) {
    return Math.round(Number(n) || 0).toLocaleString();
  }
  function fmtCell(tb, ci, n) {
    return ci === priceColOf(tb) ? fmtNum(n) : fmtQty(n);
  }
  // Gems always fills on any typed Amount, in every table, regardless of
  // the Scale toggle - it's a fixed, universal game price point, not a
  // per-table custom ratio like FC/Speedups.
  // The Gems column is found by name (not assumed to be the last one).
  function gemsColOf(tb) {
    return tb.columns.findIndex((c) => /gem/i.test(String(c || "")));
  }
  // Gems for a price: the fixed game table, or the same 500-per-dollar
  // rule for any other price (4.99 -> 2,500, 9.99 -> 5,000, 49.99 -> 25,000).
  function gemsForPrice(amount) {
    return mpGems(amount);
  }
  function applyGemsLookup(panel, t, onlyRowIndex) {
    const lastCi = gemsColOf(t);
    if (lastCi === -1) return;
    panel.querySelectorAll("tbody tr").forEach((tr) => {
      const ri = Number(tr.dataset.row);
      if (onlyRowIndex != null && ri !== onlyRowIndex) return; // scoped to one row - leaves other rows' manual edits alone
      const amount = parseNum(tr.querySelector(`[data-pt-cell][data-col="${priceColOf(t)}"]`)?.value);
      if (amount == null || amount <= 0) return;
      const gemsCell = tr.querySelector(`[data-pt-cell][data-col="${lastCi}"]`);
      if (gemsCell) gemsCell.value = fmtQty(gemsForPrice(amount));
    });
  }
  // Fills every OTHER column (not Gems, not Amount) using the ratio each
  // one holds to the Amount in Row 1 - only runs when Scale is on for
  // this table, since it assumes a fixed proportional relationship that
  // not every table's data actually follows.
  // Every other column follows the game's tier multipliers, not the raw
  // price ratio: the tiers 4.99 / 9.99 / 19.99 / 49.99 / 99.99 are x1, x2,
  // x4, x10, x20 of the first (exactly like Gems 2,500 -> 5,000 -> 10,000
  // -> 25,000 -> 50,000), so 12 in row 1 fills 24 / 48 / 120 / 240. The
  // price column itself is never touched.
  function applyRatioScale(panel, t, onlyRowIndex) {
    const gemsCi = gemsColOf(t);
    const priceCi = priceColOf(t);
    const row0Amount = parseNum(panel.querySelector(`[data-pt-cell][data-row="0"][data-col="${priceCi}"]`)?.value);
    if (!row0Amount) return;
    const base = t.columns.map((_, ci) => {
      if (ci === priceCi || ci === gemsCi) return null; // Amount and Gems are handled separately
      const v = parseNum(panel.querySelector(`[data-pt-cell][data-row="0"][data-col="${ci}"]`)?.value);
      return v == null ? null : v;
    });
    panel.querySelectorAll("tbody tr").forEach((tr) => {
      const ri = Number(tr.dataset.row);
      if (ri === 0) return; // row 1 is the source, never auto-filled itself
      if (onlyRowIndex != null && ri !== onlyRowIndex) return; // scoped to one row - leaves other rows' manual edits alone
      const amount = parseNum(tr.querySelector(`[data-pt-cell][data-col="${priceCi}"]`)?.value);
      if (amount == null) return;
      const mult = gemsForPrice(amount) / gemsForPrice(row0Amount);
      t.columns.forEach((_, ci) => {
        if (base[ci] == null) return;
        const cell = tr.querySelector(`[data-pt-cell][data-col="${ci}"]`);
        if (cell) cell.value = fmtCell(t, ci, base[ci] * mult);
      });
    });
  }
  // Runs both - used when the Scale toggle is switched on, to fill
  // everything (ratio columns + Gems) in one go.
  function applyScale(panel, t) {
    applyRatioScale(panel, t);
    applyGemsLookup(panel, t);
    refreshTotalsIn(panel, t);
  }
  // Re-sums every column straight from the cells on screen, so the totals
  // row is right after typing, auto-fill, adding a row, or toggling Scale.
  function refreshTotalsIn(panel, t) {
    const link = packLinkFor(t.id);
    t.columns.forEach((_, ci) => {
      let sum = 0;
      const money = !IS_OWNER && ci === link.priceCol;
      let code = link.currency;
      panel.querySelectorAll(`[data-pt-cell][data-col="${ci}"]`).forEach((inp) => {
        const v = parseNum(inp.value) || 0;
        if (money && v) { const c = packConvert(v, link.currency); sum += c.n; code = c.code; } else sum += v;
      });
      const cell = panel.querySelector(`[data-pt-total="${ci}"]`);
      if (cell) { cell.textContent = sum ? (money ? fmtMoneyIn(sum, code) : pkShortNum(sum, t.columns.length > 8)) : ""; cell.title = sum && !money ? fmtNum(sum) : ""; }
    });
  }

  // Filter tabs: the category (group name) you gave each table on the
  // Packs page, e.g. "Weekly/Monthly Calendar Packs"; tables without a
  // category sit under "Not assigned".
  let packsFilter = localStorage.getItem("packs_filter") || "all";
  const categoryOf = (tb) => packLinkFor(tb.id).group;
  // Category order: saved by the owner (PACK_LINKS.__order.categories);
  // categories not in that list follow in order of first appearance.
  // Pack templates live on the My packs page: here they
  // show only when "Edit" there opens their category.
  const tplOpen = () => packsFilter === "cat:" + PACK_TEMPLATE_GROUP;
  const isTpl = (tb) => !!packLinkFor(tb.id).template;
  function categoryOrder() {
    const seen = [];
    tables.forEach((tb) => { const g = categoryOf(tb); if (g && !seen.includes(g) && (!isTpl(tb) || tplOpen())) seen.push(g); });
    const saved = (PACK_LINKS && PACK_LINKS.__order && Array.isArray(PACK_LINKS.__order.categories)) ? PACK_LINKS.__order.categories : [];
    return [...saved.filter((g) => seen.includes(g)), ...seen.filter((g) => !saved.includes(g))];
  }
  function categoryTabs() {
    return [{ key: "all" }, ...categoryOrder().map((g) => ({ key: "cat:" + g, name: g })), { key: "none" }];
  }
  // Packs B: no category buttons; every category is a fold
  // and packsFilter says which one is open ("cat:<name>", "none" = Not
  // assigned, "all" = the first, "closed" = none).
  function renderPageTabs() {
    if (packsFilter === "all" || packsFilter === "closed" || packsFilter === "none") return;
    if (!categoryTabs().some((pt) => pt.key === packsFilter)) packsFilter = "all";
  }
  // A redraw keeps the page where it was, and the editors' sideways boxes too.
  // The pack window keeps its own scroll place too when it's drawn again for
  // the same pack (a new table that just got its real id counts as the same).
  function renderAll() {
    const y = window.scrollY, putBoxes = saveBoxScroll(listEl);
    const ob = listEl.querySelector(".pkb-panel > .pk-body"), oPanel = ob && ob.closest(".pkb-panel");
    const oId = oPanel ? oPanel.dataset.pkid : null, oTop = ob ? ob.scrollTop : 0, oLeft = ob ? [...ob.querySelectorAll(".pk-tbl-wrap")].map((w) => w.scrollLeft) : [];
    // The control just used (focused) stays where it was on screen, even when a
    // line above it comes or goes (e.g. "Hidden from visitors").
    const act = document.activeElement, actAt = ob && act && ob.contains(act) ? [...act.attributes].find((a) => a.name.startsWith("data-")) : null;
    const actKey = actAt ? `[${actAt.name}="${window.CSS.escape(actAt.value)}"]` : "", actOff = actKey ? act.getBoundingClientRect().top - ob.getBoundingClientRect().top : 0;
    renderAllCore();
    putBoxes();
    if (oId != null) {
      const nb = listEl.querySelector(".pkb-panel > .pk-body"), nPanel = nb && nb.closest(".pkb-panel");
      if (nPanel && (nPanel.dataset.pkid === oId || PKB_RENAMED[oId] === nPanel.dataset.pkid)) {
        nb.scrollTop = oTop;
        nb.querySelectorAll(".pk-tbl-wrap").forEach((w, i) => { if (oLeft[i]) w.scrollLeft = oLeft[i]; });
        const nAct = actKey ? nb.querySelector(actKey) : null;
        if (nAct) {
          nb.scrollTop += nAct.getBoundingClientRect().top - nb.getBoundingClientRect().top - actOff;
          try { nAct.focus({ preventScroll: true }); } catch (e) {}
        }
      }
    }
    if (Math.abs(window.scrollY - y) > 1) window.scrollTo(0, y);
  }
  // A new table gets its real id on its first save: the open window (and its
  // history entry, Arrange mode) follow the new id, so the next redraw keeps it open.
  const PKB_RENAMED = {};
  function pkbRenamed(oldId, newId) {
    oldId = String(oldId); newId = String(newId);
    PKB_RENAMED[oldId] = newId;
    if (PACKS_OPEN.has(oldId)) { PACKS_OPEN.delete(oldId); PACKS_OPEN.add(newId); }
    if (PK_ARRANGE.has(oldId)) { PK_ARRANGE.delete(oldId); PK_ARRANGE.add(newId); }
    if (history.state && history.state.tab === "packs" && String(history.state.pkb) === oldId) history.replaceState({ ...history.state, pkb: newId }, "", location.pathname + location.search);
    listEl.querySelectorAll(`[data-pkid="${window.CSS.escape(oldId)}"]`).forEach((el) => { el.dataset.pkid = newId; });
  }
  // Speed (Packs B): a table's editor is built the first time it's opened
  // (Edit), or when it's drawn open (PACKS_OPEN); closed cards only carry an
  // empty hidden body (data-pk-lazy). buildPkBody fills and wires it.
  function pkBodyHtml(t, ti) {
    const totals = t.columns.map((_, ci) =>
      t.rows.reduce((sum, r) => sum + (parseNum(r.cells[ci]) || 0), 0)
    );
    const lk = packLinkFor(t.id);
    const groupPh = window.t("pack_group_placeholder"), groupTitle = window.t("pack_group_title");
    // Each column's kind and a small picture / label per box (hidden: the step
    // cards that showed them were dropped; the classes still style the table).
    const pcI = priceColOf(t), gcI = gemsColOf(t);
    const pkcCls = (ci) => (ci === pcI ? " pkc-price" : ci === gcI ? " pkc-gems" : " pkc-item");
    const pkcIcons = t.columns.map((_, ci) => (ci === pcI ? "" : pkIconHtml(pkColItem(t, ci))));
    const pkcLead = (ci) => (ci === pcI ? `<span class="pkc-cur">${esc(String(t.columns[ci] || "$"))}</span>` : `<span class="pkc-ic">${pkcIcons[ci]}</span>`);
    const rowMaxTitle = window.t("pack_rowmax_title"), rowMaxHead = window.t("pack_rowmax_head"), dupTitle = window.t("pack_duplicate"), restoreTitle = window.t("pack_restore"), dailyDayLbl = window.t("pk_daily_day"), hiddenTag = window.t("pk_hidden_tag");
    return `
        ${IS_OWNER && lk.hideVisitors ? `<div style="font-size:10.5px; font-weight:700; color:var(--danger); margin-bottom:6px;">${esc(hiddenTag)}</div>` : ""}
        <div class="pk-ed-scroll pk-ed-bar">
          <input data-pt-title value="${esc(t.title)}" style="font-size:14px; font-weight:700; background:none; border:none; padding:0; flex:1 1 90px; min-width:90px;" />
          ${IS_OWNER ? `<button type="button" class="btn small ghost${PK_ARRANGE.has(String(t.id)) ? " on" : ""}" data-pkarrange>&#8645; ${esc(window.t("pk_arrange"))}</button>` : ""}
          <details class="pk-more"><summary class="btn small ghost" title="${esc(window.t("pk_more"))}">&middot;&middot;&middot;</summary><div class="pk-menu">
            <label class="pk-mi"><span>${esc(window.t("pk_group"))}</span><input data-pt-group list="packGroupNames" value="${esc(packLinkFor(t.id).group)}" placeholder="${esc(groupPh)}" title="${esc(groupTitle)}" class="keep-w" /></label>
            <label class="pk-mi" title="Fills the rest of the table from Row 1's ratios. Turn off for tables whose rows don't follow a fixed scale."><span>${esc(window.t("pk_scale"))}</span><input type="checkbox" class="bset-sw" data-pt-scaletoggle ${t.scale_enabled !== false ? "checked" : ""} /></label>
            <div class="pk-mi"><span>${esc(window.t("mp_column"))}</span><span class="pk-mi-pm"><button type="button" class="btn small ghost" data-pt-addcol title="Add column">+</button><button type="button" class="btn small ghost" data-pt-delcollast title="Remove last column">&minus;</button></span></div>
            <div class="pk-mi"><span>${esc(window.t("mp_row"))}</span><span class="pk-mi-pm"><button type="button" class="btn small ghost" data-pt-addrow title="Add row">+</button><button type="button" class="btn small ghost" data-pt-delrowlast title="Remove last row">&minus;</button></span></div>
            ${PACK_PRESET_TABLES.some((pp) => pp.title === t.title) ? `<button type="button" class="pk-mi pk-mi-b" data-pt-restore><span>${esc(restoreTitle)}</span><span>&#8634;</span></button>` : ""}
            <button type="button" class="pk-mi pk-mi-b" data-pt-duplicate><span>${esc(dupTitle)}</span><span>&#10697;</span></button>
            <button type="button" class="pk-mi pk-mi-b pk-mi-del" data-pt-delete><span>${esc(window.t("pk_delete_table"))}</span><span>&times;</span></button>
          </div></details>
        </div>
        <div class="pk-tbl-wrap" style="overflow-x:auto;">
          <table style="width:100%; border-collapse:collapse; font-size:11px; table-layout:fixed;">
            <thead>
              <tr>
                ${t.columns
                  .map(
                    (c, ci) => `<th class="pk-th${pkcCls(ci)}" style="padding:4px 2px; border-bottom:1px solid var(--line); text-align:center;">
                      ${pkHeadHtml(t, ci)}<span class="pkc-nm">${esc(materialDisplayName(pkColItem(t, ci)) || pkColItem(t, ci) || "?")}</span>
                      ${IS_OWNER ? `<div class="pk-arr">${dsHandleHtml(`data-pt-coldrag data-col="${ci}"`)}</div>` : ""}
                      ${packColMultiplier(packLinkFor(t.id), ci) > 1 ? `<div class="meta" style="font-size:9px; color:var(--ice);">/${esc(dailyDayLbl)} \u00d7${packLinkFor(t.id).daily.days}</div>` : ""}
                      <input type="hidden" data-pt-colname data-col="${ci}" value="${esc(c)}" />
                    </th>`
                  )
                  .join("")}
                <th style="width:36px;" class="meta pkc-maxth" title="${esc(rowMaxTitle)}">${esc(rowMaxHead)}</th>
                ${IS_OWNER ? `<th class="pkc-addth"><button type="button" class="pkc-chip pkc-add" data-pkcadd>+ ${esc(window.t("pkc_item"))}</button></th>` : ""}
              </tr>
            </thead>
            <tbody>
              ${t.rows
                .map(
                  (r, ri) => `<tr data-row="${ri}" style="${ri === 0 ? "background:rgba(111,211,242,0.06);" : ""}">
                    ${t.columns
                      .map(
                        (_, ci) => `<td class="${pkcCls(ci).trim()}" style="padding:3px; text-align:center;">${pkcLead(ci)}
                          <input data-pt-cell data-row="${ri}" data-col="${ci}" value="${esc(r.cells[ci] ?? "")}" style="width:100%; max-width:54px; font-size:14px; text-align:center; padding:4px 1px;" />
                        </td>`
                      )
                      .join("")}
                    <td class="pkc-max" style="text-align:center; white-space:nowrap;"><span class="pkc-lb">${esc(rowMaxHead)}</span>
                      <input type="number" min="1" data-pt-rowmax data-row="${ri}" value="${esc((packLinkFor(t.id).rowMax || {})[ri] || "")}" placeholder="×" title="${esc(rowMaxTitle)}" style="width:34px; font-size:10px; padding:2px 1px; text-align:center;" />
                    </td>
                  </tr>`
                )
                .join("")}
              <tr style="border-top:2px solid var(--line); font-weight:700;">
                ${totals.map((sum, ci) => `<td data-pt-total="${ci}" title="${sum ? esc(fmtNum(sum)) : ""}" style="padding:5px 1px; font-size:11px; text-align:center; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${sum ? esc(pkShortNum(sum, t.columns.length > 8)) : ""}</td>`).join("")}
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
        ${packTriggerStatusHtml(t)}
        ${packLinkEditorHtml(t)}`;
  }
  function buildPkBody(panel) {
    const body = panel && panel.querySelector(".pk-body[data-pk-lazy]");
    if (!body) return;
    const ti = Number(panel.dataset.packtable), tb = tables[ti];
    if (!tb) return;
    body.removeAttribute("data-pk-lazy");
    body.innerHTML = pkBodyHtml(tb, ti) + "\n        ";
    wireTable([panel]);
    wirePackLinkEditors(null, body);
    if (!IS_OWNER) {
      applyPacksReadOnly(panel, true);
      refreshTotalsIn(panel, tb);
    }
  }
  // ---- Packs design B: every category is a fold (how many
  // packs, how many count in Budgets), one open at a time, with slim rows
  // (picture, name, how often, price, on now / next date, Count tick): the first
  // 4, then "Show N more". A row opens the pack in a full-screen window: its
  // table, then Count in Budgets and its settings as sections (the same editor
  // as before, built and wired the same way, buildPkBody). Search finds packs
  // by name or by an item they give.
  const pkbToday = packStartOfToday();
  const pkbLoc = LANG === "en" ? undefined : LANG;
  const pkbFmtD = (days) => { try { return new Date(pkbToday.getTime() + days * 86400000).toLocaleDateString(pkbLoc, { day: "numeric", month: "short", timeZone: "UTC" }); } catch (e) { return ""; } };
  const pkbWd = (d) => { try { return d.toLocaleDateString(pkbLoc, { weekday: "short", timeZone: "UTC" }); } catch (e) { return ""; } };
  function pkbResetText(r) {
    if (Number(r) % 7 === 0 && !PACK_RESET_PRESETS.find((x) => x.days === r) && r < PACK_ONE_TIME_DAYS) return packEveryText(r);
    if (r === "unlimited") return t("pack_reset_unlimited");
    if (r === "once" || r >= PACK_ONE_TIME_DAYS) return t("pack_reset_once");
    if (packStackInfo(r)) return packStackText(r);
    const preset = PACK_RESET_PRESETS.find((x) => x.days === r);
    return preset ? t("pack_reset_" + preset.key) : `${t("pack_reset_every")} ${r}${t("pack_days_short")}`;
  }
  // "Every 2 weeks · Sun–Mon", on now / the next date it comes.
  function pkbWhen(lk, id) {
    const r = lk.reset, out = { text: "", on: false, next: "" };
    if (r == null || r === "") return out;
    const parts = [Number(r) === 30 ? packEveryText(30, lk.resetDay) : pkbResetText(r)];
    if (typeof r === "number" && r < PACK_ONE_TIME_DAYS && !packStackInfo(r)) {
      const win = Number(lk.window) || 0;
      const offs = packResetOffsets(r, lk.resetDay, 400, lk.window);
      out.on = offs[0] === 0;
      const nx = offs.find((o) => o > 0);
      if (nx != null) out.next = pkbFmtD(nx);
      const a = packParseDay(lk.resetDay);
      if (a && win > 0 && win < 7 && r % 7 === 0) { out.days = win === 1 ? pkbWd(a) : `${pkbWd(a)}–${pkbWd(new Date(a.getTime() + (win - 1) * 86400000))}`; parts.push(out.days); }
    }
    // The first purchase reward is on sale from day 1 (no trigger, no date).
    // Once Natalia is unlocked it is done (vipFirstBuyDone).
    if (lk.firstBuy) { out.done = vipFirstBuyDone(); out.on = !out.done; }
    // Natalia / Jeronimo VIP Packs: done once that hero is maxed (5★).
    const vh = id != null ? vipPackHeroOf(id) : null;
    if (vh && vipHeroMaxed(vh)) { out.done = true; out.doneText = t("pkd_hero_maxed").replace("{hero}", dataName(vh)); out.on = false; out.next = ""; }
    if (out.done && !out.doneText) out.doneText = t("pkd_first_done");
    out.text = parts.filter(Boolean).join(" · ");
    return out;
  }
  // Price range in the shown currency: "$4.99–99.99", "Free + $9.99".
  function pkbPrice(tb, lk, bare) {
    const pc = lk.priceCol || 0, nums = [];
    let free = false;
    tb.rows.forEach((r) => {
      const raw = String(r.cells[pc] ?? "").trim();
      if (!raw) return;
      const n = parseNum(raw);
      if (n > 0) nums.push(n); else if (n === 0 || /free/i.test(raw)) free = true;
    });
    if (!nums.length) return free ? t("pkb_free") : "—";
    const lo = Math.min(...nums), hi = Math.max(...nums), plain = (x) => String(x).replace(/[⁦-⁩]/g, "");
    let txt = bare ? Number(packConvert(lo, lk.currency).n).toLocaleString(pkbLoc, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : plain(packFmtMoney(lo, lk.currency));
    if (hi > lo) { const c = packConvert(hi, lk.currency); txt += `–${Number(c.n).toLocaleString(pkbLoc, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
    return bidiNum(free ? `${t("pkb_free")} + ${txt}` : txt);
  }
  // The row's picture: the first item the pack gives (not its price or Gems).
  function pkbIcon(tb, lk) {
    const pc = lk.priceCol || 0, gc = gemsColOf(tb);
    for (let ci = 0; ci < tb.columns.length; ci++) {
      if (ci === pc || ci === gc) continue;
      const n = pkColItem(tb, ci), ic = n ? pkIconHtml(n) || (/^hero shards?$/i.test(n) ? pkIconHtml("Mythic General Hero Shard") : /^hero widgets?$/i.test(n) ? `<img src="${esc(HERO_ITEM_ICON.widget)}" alt="" loading="lazy" />` : "") : "";
      if (ic) return ic;
    }
    return "";
  }
  const pkbMatch = (tb, q) => !q || String(tb.title || "").toLowerCase().includes(q) || tb.columns.some((_, ci) => {
    const n = pkColItem(tb, ci);
    return !!n && (n.toLowerCase().includes(q) || String(materialDisplayName(n) || "").toLowerCase().includes(q));
  });
  const pkbEvKey = (tb) => `${packLinkFor(tb.id).dateWith || String(tb.id)}|${categoryOf(tb)}`;
  // ev: "lead" / "follow" = a slim row inside an event card (B, owner 6 Nov
  // 2026): its dates are said once in the card's header, so the row shows how
  // often (leader) or "same dates" (follower) and its number of tiers.
  // The event's price range over all its packs, in the shown currency.
  function pkbEvPrice(list, bare) {
    let lo = null, hi = null, free = false;
    list.forEach((tb) => {
      const lk = packLinkFor(tb.id), pc = lk.priceCol || 0;
      tb.rows.forEach((r) => {
        const raw = String(r.cells[pc] ?? "").trim();
        if (!raw) return;
        const n = parseNum(raw);
        if (!(n > 0)) { if (n === 0 || /free/i.test(raw)) free = true; return; }
        const v = { n, cur: lk.currency, c: Number(packConvert(n, lk.currency).n) || n };
        if (!lo || v.c < lo.c) lo = v;
        if (!hi || v.c > hi.c) hi = v;
      });
    });
    if (!lo) return free ? t("pkb_free") : "—";
    let txt = bare ? lo.c.toLocaleString(pkbLoc, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : String(packFmtMoney(lo.n, lo.cur)).replace(/[⁦-⁩]/g, "");
    if (hi.c > lo.c) txt += `–${hi.c.toLocaleString(pkbLoc, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    return bidiNum(free ? `${t("pkb_free")} + ${txt}` : txt);
  }
  // One tick for the whole event: ✓ all counted, – some, empty none; "2/3" under it.
  function pkbEvTickHtml(list, lab) {
    const ids = list.filter((tb) => !packLinkFor(tb.id).template).map((tb) => String(tb.id));
    if (!ids.length) return "";
    const on = ids.filter((id) => packInBudgets(id)).length, st = on === ids.length ? "all" : on ? "part" : "none";
    return `<button type="button" class="pkb-evtk ${st}${lab ? " pkd-sw" : ""}" data-pkbevall="${esc(ids.join(","))}"${lab ? " data-pkbevlbl" : ""} title="${esc(t("pk_in_budgets_hint"))}" aria-label="${esc(t("pk_in_budgets"))} ${on}/${ids.length}"><span class="pkb-evtk-b" aria-hidden="true">${st === "all" ? "&#10003;" : st === "part" ? "&#8211;" : ""}</span>${lab ? `<span>${esc(t("pkd_count"))}</span>` : ""}<small>${on}/${ids.length}</small></button>`;
  }
  // New Gen hero packs: the per-hero copies (ngHeroTables) of a pattern table
  // (Value Hero Pack / Widget Pack), shown under its row for the next Gen that
  // has copies. Filled once the copies are worked out (PKB_NG); display only.
  let PKB_NG = null; // pattern table id -> { gen, items: [{ name, img, amt, price }] }
  function pkbNgBuild(copies) {
    const out = {};
    (copies || []).forEach((c) => {
      const l = NG_HERO_LINKS[String(c.id)];
      if (!l || !l.tpl) return;
      const k = String(l.tpl), g = Number(l.ngGen) || 0;
      if (!out[k] || g < out[k].gen) out[k] = { gen: g, list: [] };
      if (g === out[k].gen) out[k].list.push(c);
    });
    Object.keys(out).forEach((k) => {
      const cur = packLinkFor(k).currency;
      out[k].items = out[k].list.map((c) => {
        const title = String(c.title || ""), i = title.lastIndexOf(" · "), name = i >= 0 ? title.slice(i + 3) : title;
        const amts = (c.rows || []).map((r) => packParseNum((r.cells || [])[1])).filter((n) => n > 0);
        const lo = amts.length ? Math.min(...amts) : 0, hi = amts.length ? Math.max(...amts) : 0;
        const n = hi > lo ? `${lo.toLocaleString(pkbLoc)}–${hi.toLocaleString(pkbLoc)}` : lo.toLocaleString(pkbLoc);
        return { name, img: HERO_IMG_BY_NAME[name] || "", amt: t(String(c.id).startsWith("ng-w-") ? "pkb_ng_widgets" : "pkb_ng_shards").replace("{n}", n), price: pkbPrice(c, { priceCol: 0, currency: cur }) };
      });
      delete out[k].list;
    });
    return out;
  }
  // The copies arrived after the list was drawn: an open details sheet shows them.
  function pkbNgFill() {
    if (PKB_NG && PKB_INFO) pkbInfoDraw();
  }
  // ---- Packs C: every pack is a mini card, two a row: picture with the
  // Count in Budgets tick under it, name, price (the fold says the currency
  // once) and on now / next. An event (a pack with "Same dates as" followers)
  // is one card with its pictures 2 × 2 and one tick for all ("3/3").
  // Tapping a card opens its details sheet (pkbInfoHtml); "Open pack ›"
  // there opens the pack window as before.
  const pkbCurCode = () => packConvert(4.99, "USD").code;
  // "4 weeks", "1 week", "5 days": 7 days or a multiple of 7 are said in weeks.
  function pkbDur(n) {
    n = Math.round(Number(n)) || 0;
    if (n > 0 && n % 7 === 0) return n === 7 ? t("pkd_1week") : t("pkd_weeks").replace("{n}", n / 7);
    return n === 1 ? t("pkd_1day") : t("pkd_days").replace("{n}", n);
  }
  function pkbCardHtml(tb, ti, arr) {
    const lk = packLinkFor(tb.id), inB = packInBudgets(tb.id), w = pkbWhen(lk, tb.id), hid = IS_OWNER && lk.hideVisitors;
    const st = w.done ? `<small>${esc(w.doneText)}</small>` : w.on ? `<small class="on">&#9679; ${esc(t("pkb_on_now"))}</small>` : w.next ? `<small>${esc(t("pkb_next").replace("{date}", w.next))}</small>` : "";
    return `<div class="pkb-card${inB || lk.template ? "" : " pkb-off"}${hid ? " pkb-hidv" : ""}" data-pkrow="${ti}" data-pkrowid="${esc(String(tb.id))}" role="button" tabindex="0">
      ${arr ? dsHandleHtml("data-pkbdrag") : ""}<span class="pkb-cl"><span class="pkb-ic">${pkbIcon(tb, lk) || "&#127873;"}</span>${lk.template ? "" : `<label class="pkb-tk" title="${esc(t("pk_in_budgets_hint"))}"><input type="checkbox" data-pkbudrow="${esc(String(tb.id))}" ${inB ? "checked" : ""} aria-label="${esc(t("pk_in_budgets"))}" /></label>`}</span>
      <span class="pkb-cm"><b>${esc(tb.title)}</b><span class="pkb-cp">${esc(pkbPrice(tb, lk, true))}</span>${st}${hid ? `<small class="pkb-hid">${esc(t("pk_hidden_tag"))}</small>` : ""}</span>
    </div>`;
  }
  function pkbEvCardHtml(u, arr) {
    const lt = u.lead.tb, w = pkbWhen(packLinkFor(lt.id), lt.id), id = String(lt.id), all = u.all;
    const pics = all.slice(0, 4).map((x) => `<span>${pkbIcon(x.tb, packLinkFor(x.tb.id)) || "&#127873;"}</span>`).join("");
    const st = w.done ? `<small>${esc(w.doneText)}</small>` : w.on ? `<small class="on">&#9679; ${esc(t("pkb_on_now"))}</small>` : w.next ? `<small>${esc(t("pkb_next").replace("{date}", w.next))}</small>` : "";
    const off = all.every((x) => !packInBudgets(x.tb.id) && !packLinkFor(x.tb.id).template);
    return `<div class="pkb-card pkb-evc${off ? " pkb-off" : ""}" data-pkbev="${esc(id)}" data-pkbevtap="${esc(id)}" role="button" tabindex="0">
      ${arr ? dsHandleHtml("data-pkbdrag") : ""}<span class="pkb-cl"><span class="pkb-ev-st">${pics}</span>${pkbEvTickHtml(all.map((x) => x.tb))}</span>
      <span class="pkb-cm"><b>&#128279; ${esc(u.evName)}</b><span class="pkb-cp">${esc(pkbEvPrice(all.map((x) => x.tb), true))}</span>${st}</span>
    </div>`;
  }
  // ---- The details sheet. PKB_INFO = "t:<id>" (a pack) or "ev:<leader id>"
  // (an event card), kept while the list redraws; it has its own browser
  // history entry, so Back closes it (and Back from the pack window comes
  // back to it).
  let PKB_INFO = (history.state && history.state.tab === "packs" && !history.state.pkb && history.state.pkbi) || null;
  let PKB_SHINE_FIRST = true; // Shining City: "First buy of the day" shown (for the visit)
  const PKB_UNITS = new Map(); // event leader id -> its packs in the shown order
  const pkbVal = (row, ci) => packParseNum((row.cells || [])[ci]);
  const pkbRowsOf = (tb, lk) => tb.rows.map((r, ri) => ({ r, ri })).filter((x) => String(x.r.cells[lk.priceCol || 0] ?? "").trim() !== "");
  const pkbCap = (lk, ri) => { const m = Number((lk.rowMax || {})[ri]); return Number.isInteger(m) && m > 0 ? m : Math.max(1, Math.round(Number(lk.buys)) || 1); };
  const pkbLocal = (tb, lk, ri) => { const n = parseNum(String(tb.rows[ri].cells[lk.priceCol || 0] ?? "")); return n > 0 ? Number(packConvert(n, lk.currency).n) || 0 : 0; };
  const pkbMoneyL = (n, lk) => packFmtMoney(n, packLocalCode(lk.currency), false, true);
  // Speedups stored in minutes ("Research Speedups (minutes)") read as a
  // time: 60 -> "1h", 90 -> "1.5h", 30 -> "30m", 7440 -> "5d 4h".
  const pkbIsMin = (name) => /\(minutes\)\s*$/i.test(String(name || ""));
  function pkbMinTxt(min) {
    const m = Number(min) || 0;
    if (m < 60) return `${Math.round(m)}m`;
    const h = m / 60;
    if (h > 99) { const tot = Math.round(h), d = Math.floor(tot / 24), r = tot % 24; return r ? `${d}d ${r}h` : `${d}d`; }
    return `${Math.round(h * 10) / 10}h`;
  }
  const pkbAmt = (name, n) => (pkbIsMin(name) ? pkbMinTxt(n) : pkShortNum(n, true));
  function pkbChip(name, n, extra) {
    const label = materialDisplayName(name) || name, isMin = pkbIsMin(name);
    let ic = pkIconHtml(name);
    if (!ic && /hero shards?$/i.test(name)) ic = pkIconHtml("Mythic General Hero Shard");
    if (!ic && /hero widgets?$/i.test(name)) ic = `<img src="${esc(HERO_ITEM_ICON.widget)}" alt="" loading="lazy" />`;
    return `<span class="pkd-c${/^gems$/i.test(name) ? " gem" : ""}" title="${esc(isMin ? `${label} · ${fmtNum(n)}` : label)}">${ic || `<i class="pkd-cn">${esc(label)}</i>`}<b>${esc(pkbAmt(name, n))}${extra || ""}</b></span>`;
  }
  // A row's items as picture chips (Gems last, dimmed); `only` = these columns;
  // `strike` = { col: amount } shown struck through after the amount.
  function pkbChips(tb, lk, ri, only, strike) {
    const pc = lk.priceCol || 0, eff = packEffectiveCols(tb), row = tb.rows[ri];
    const a = [], g = [];
    tb.columns.forEach((c, ci) => {
      if (ci === pc || (only && !only.includes(ci))) return;
      const n = pkbVal(row, ci);
      if (!(n > 0)) return;
      const name = eff[ci] || String(c || "").trim();
      const s0 = strike && strike[ci] != null && strike[ci] !== n ? ` <s>${esc(pkbAmt(name, strike[ci]))}</s>` : "";
      (/^gems$/i.test(name) ? g : a).push(pkbChip(name, n, s0));
    });
    return a.concat(g).join("");
  }
  function pkbPriceTag(tb, lk, ri) {
    const raw = String(tb.rows[ri].cells[lk.priceCol || 0] ?? "").trim(), n = parseNum(raw);
    return n > 0 ? `<b class="pkd-p">${esc(packFmtMoney(n, lk.currency))}</b>` : `<b class="pkd-p free">${esc(t("pkb_free"))}</b>`;
  }
  const pkbStep = (lab, price, chips, o = {}) => `<div class="pkd-s${o.cls ? " " + o.cls : ""}"><div class="pkd-sl"><span class="pkd-sk">${lab}</span>${o.mid || ""}<span class="pkd-sx"></span>${o.cap ? `<em class="pkd-cap">${o.cap}</em>` : ""}${price}</div>${chips ? `<div class="pkd-cs">${chips}</div>` : ""}${o.foot || ""}</div>`;
  // Daily Deals: a row that gives exactly what all the other rows give together.
  function pkbBuyAll(tb, lk, rows) {
    if (!lk.choice || rows.length < 3) return -1;
    const pc = lk.priceCol || 0, cols = tb.columns.map((_, ci) => ci).filter((ci) => ci !== pc);
    for (const k of rows) {
      const others = rows.filter((x) => x !== k);
      if (cols.some((ci) => pkbVal(k.r, ci) > 0) && cols.every((ci) => Math.abs(pkbVal(k.r, ci) - others.reduce((s, x) => s + pkbVal(x.r, ci), 0)) < 1e-6)) return k.ri;
    }
    return -1;
  }
  // Shining City: two rows at one price in an event of N days whose buy limits
  // are multiples of N — the bigger one is the first buy of the day.
  function pkbShinePairs(tb, lk, rows) {
    const N = Math.round(Number(lk.window) || 0);
    if (!(N > 1) || lk.sequential || lk.choice || lk.pickCols > 0 || lk.option || lk.colOptions || rows.length < 2) return null;
    const pc = lk.priceCol || 0, by = new Map();
    rows.forEach((x) => { const k = String(parseNum(String(x.r.cells[pc]))); if (!by.has(k)) by.set(k, []); by.get(k).push(x); });
    const pairs = [];
    for (const list of by.values()) {
      if (list.length !== 2) return null;
      const sum = (x) => x.r.cells.reduce((s, c, ci) => (ci === pc || /^gems$/i.test(String(tb.columns[ci] || "").trim()) ? s : s + (packParseNum(c) || 0)), 0);
      const [a, b] = list, ca = pkbCap(lk, a.ri), cb = pkbCap(lk, b.ri);
      if (ca % N || cb % N || sum(a) === sum(b)) return null;
      const [f, n] = sum(a) > sum(b) ? [a, b] : [b, a];
      pairs.push({ f: f.ri, n: n.ri, cf: pkbCap(lk, f.ri), cn: pkbCap(lk, n.ri) });
    }
    return { N, pairs };
  }
  // The four boxes: Comes back / Days / Now / Buys.
  function pkbFacts(tb, lk) {
    const r = lk.reset, st = packStackInfo(r), trig = packTriggerOf(lk), ng = packIsNewGen(lk) || /^ng-/.test(String(tb.id));
    const DAY = 86400000, win = Math.round(Number(lk.window) || 0), anchor = packParseDay(lk.resetDay), num = typeof r === "number" && r > 0;
    const once = r === "once" || (num && r >= PACK_ONE_TIME_DAYS);
    const on = (s) => `<span class="on">&#9679; ${esc(t("pkb_on_now"))}</span>${s ? ` · ${esc(s)}` : ""}`;
    let back, days = "—", now = "—";
    if (trig || (once && !ng)) back = t("pkd_once");
    else if (st || r === "unlimited") back = t("pkd_any_time");
    else if (ng) back = num && !once ? t("pkd_with_heroes_n").replace("{d}", pkbDur(r)) : t("pkd_with_heroes");
    else if (r === 1) back = t("pkd_every_day");
    else back = num ? packEveryText(r, lk.resetDay) : "—";
    if (trig) days = t("pkd_when_appears").replace("{d}", pkbDur(trig.days));
    else if (st) days = t("pkd_per_card").replace("{d}", pkbDur(st.days));
    else if (r === 30) days = t("pkd_whole_month");
    else if (r === 1) days = t("pkd_resets_daily");
    else if (num) {
      const w = win > 0 ? (once ? win : Math.min(win, r)) : r;
      const a = anchor || (w === 7 ? packCurrentCycleStart(7, null) : null);
      if (w <= 7 && a && !once) days = (w === 1 ? pkbWd(a) : `${pkbWd(a)} – ${pkbWd(new Date(a.getTime() + (w - 1) * DAY))}`) + (w >= 4 && w < 7 ? ` (${pkbDur(w)})` : "");
      else if (w < PACK_ONE_TIME_DAYS) days = t("pkd_lasts").replace("{d}", pkbDur(w));
    }
    const vh = vipPackHeroOf(tb.id);
    if (vh && vipHeroMaxed(vh)) now = `<span class="mut">${esc(t("pkd_hero_maxed").replace("{hero}", dataName(vh)))}</span>`;
    else if (lk.firstBuy) now = vipFirstBuyDone() ? `<span class="mut">${esc(t("pkd_first_done"))}</span>` : on("");
    else if (trig) {
      const sts = Object.keys(trig.levels).map((ri) => packTriggerRowStatus(trig, Number(ri))), en = dataName(trig.expert);
      if (sts.some((s) => s.state === "now")) now = on("");
      else if (sts.length && sts.every((s) => s.state === "done")) now = `<span class="mut">${esc(t("pkd_trig_passed").replace("{e}", en).replace("{n}", packExpertLevel(trig.expert).current))}</span>`;
      else { const nx = sts.find((s) => s.level); now = nx ? esc(t("pkd_trig_at").replace("{e}", en).replace("{n}", nx.level)) : "—"; }
    } else if (st) {
      const left = Math.round(Number(lk.activeDaysLeft) || 0), n = Math.round(Number(lk.activeBuys) || 0) || Math.ceil(left / st.days);
      now = left > 0 ? `<span class="on">${esc(t("pkd_running"))}</span> · ${esc(t("pkd_running_left").replace("{d}", pkbDur(left)).replace("{n}", n))}` : esc(t("pkd_not_running"));
    } else if (r === "unlimited") now = on("");
    else if (r === 1) now = on(t("pkd_on_today"));
    else if (num) {
      const offs = packResetOffsets(r, lk.resetDay, 800, lk.window);
      if (offs[0] === 0) {
        let end = null;
        if (r === 30) end = new Date(Date.UTC(pkbToday.getUTCFullYear(), pkbToday.getUTCMonth() + 1, 0));
        else { const s0 = packCurrentCycleStart(r, lk.resetDay); if (s0) end = new Date(s0.getTime() + ((win > 0 ? Math.min(win, r) : r) - 1) * DAY); }
        const eo = end ? Math.round((end - pkbToday) / DAY) : -1;
        now = on(eo < 0 ? "" : eo === 0 ? t("pkd_last_day") : t("pkd_to").replace("{d}", eo < 7 ? pkbWd(end) : pkbFmtD(eo)));
      } else {
        const nx = offs.find((o) => o > 0);
        if (nx != null) {
          let s1 = t("pkd_next").replace("{d}", `${pkbWd(new Date(pkbToday.getTime() + nx * DAY))} ${pkbFmtD(nx)}`);
          const g = ng ? purNextNewGen() : null;
          if (g && g.gen && g.days === nx) s1 += ` · Gen ${g.gen}`;
          now = esc(s1);
        }
      }
    }
    return { back: esc(back), days: esc(days), now };
  }
  // The buys box text from the rows' limits.
  function pkbCapsText(lk, rows) {
    const caps = [...new Set(rows.map((x) => pkbCap(lk, x.ri)).filter((n) => n > 1))].sort((a, b) => a - b);
    return caps.length ? t("pkd_up_to").replace("{list}", caps.map((n) => "×" + n).join(" / ")) : t("pkd_each_once");
  }
  // One table's price steps: { lab, html, buys }.
  function pkbTableSteps(tb, lk, o = {}) {
    const rows = pkbRowsOf(tb, lk), st = packStackInfo(lk.reset), trig = packTriggerOf(lk), ng = !/^ng-/.test(String(tb.id)) && tb.columns.some((c) => /^hero (shards|widgets)$/i.test(String(c || "").trim()));
    const order = lk.sequential ? t("pkd_in_order") : t("pkd_any_order");
    if (st) {
      const cap = Number(lk.stackCap) > 0 ? Math.round(Number(lk.stackCap)) : st.cap, d = lk.daily && Array.isArray(lk.daily.cols) && lk.daily.cols.length ? lk.daily : null;
      const html = rows.map((x) => {
        if (!d) return pkbStep(esc(t("pkd_card")), pkbPriceTag(tb, lk, x.ri), pkbChips(tb, lk, x.ri));
        const now0 = tb.columns.map((_, ci) => ci).filter((ci) => !d.cols.includes(ci));
        return pkbStep(esc(t("pkd_card")), pkbPriceTag(tb, lk, x.ri), `<small class="pkd-at">${esc(t("pkd_at_once"))}</small>${pkbChips(tb, lk, x.ri, now0)}`, { foot: `<div class="pkd-dly"><small>${esc(t("pkd_then_daily").replace("{d}", pkbDur(d.days || st.days)))}</small><div class="pkd-cs">${pkbChips(tb, lk, x.ri, d.cols)}</div></div>` });
      }).join("");
      return { lab: t("pkd_l_card"), html, buys: t("pkd_stack_buys").replace("{d}", pkbDur(cap)).replace("{n}", Math.ceil(cap / st.days)) };
    }
    // Daily Deals: choose one a day, or the row that is all of them.
    if (lk.choice) {
      const k = pkbBuyAll(tb, lk, rows), others = rows.filter((x) => x.ri !== k);
      let html = others.map((x) => pkbStep('<span class="pkd-rad"></span>', pkbPriceTag(tb, lk, x.ri), pkbChips(tb, lk, x.ri))).join("");
      let buys = lk.reset === 1 ? t("pkd_one_day") : t("pkd_one_of");
      if (k >= 0) {
        const sum = others.reduce((s, x) => s + pkbLocal(tb, lk, x.ri), 0), own = pkbLocal(tb, lk, k);
        const save = sum - own > 0.004 ? `<em class="pkd-save">${esc(t("pkd_save").replace("{p}", pkbMoneyL(sum - own, lk)))}</em>` : "";
        html += `<div class="pkd-or"><span>${esc(t("pkd_or"))}</span></div>` + pkbStep(`<b class="pkd-gk">${esc(t("pkd_buy_all").replace("{n}", others.length))}</b>${save}`, `${sum > own ? `<s class="pkd-was">${esc(pkbMoneyL(sum, lk))}</s>` : ""}${pkbPriceTag(tb, lk, k)}`, pkbChips(tb, lk, k), { cls: "pkd-gold", foot: `<small class="pkd-note">${esc(t("pkd_buy_all_note").replace("{n}", others.length))}</small>` });
        if (lk.reset === 1) buys = t("pkd_one_day_all").replace("{n}", others.length).replace("{p}", packFmtMoney(parseNum(String(tb.rows[k].cells[lk.priceCol || 0])), lk.currency));
      }
      return { lab: lk.reset === 1 ? t("pkd_l_choose_day") : t("pkd_l_choose"), html, buys };
    }
    const sh = pkbShinePairs(tb, lk, rows);
    if (sh) {
      const first = PKB_SHINE_FIRST;
      const seg = `<div class="pkd-seg" role="group"><button type="button" data-pkdshine="0" aria-pressed="${!first}"${first ? "" : ' class="on"'}>${esc(t("pkd_sh_normal"))}</button><button type="button" data-pkdshine="1" aria-pressed="${first}"${first ? ' class="on"' : ""}>${esc(t("pkd_sh_first"))}</button></div>`;
      const html = sh.pairs.map((p, i) => {
        const lab = esc(t("pkd_price_n").replace("{n}", i + 1));
        if (!first) return pkbStep(lab, pkbPriceTag(tb, lk, p.n), pkbChips(tb, lk, p.n), { cap: esc(t("pkd_sh_more_day").replace("{n}", Math.round(p.cn / sh.N))) });
        const strike = {}; tb.columns.forEach((_, ci) => { strike[ci] = pkbVal(tb.rows[p.n], ci); });
        return pkbStep(lab, pkbPriceTag(tb, lk, p.f), pkbChips(tb, lk, p.f, null, strike), { cap: esc(t("pkd_sh_a_day").replace("{n}", Math.round(p.cf / sh.N))), foot: `<small class="pkd-note">${esc(t("pkd_sh_first_note"))}</small>` });
      }).join("");
      const perDay = sh.pairs.map((p) => Math.round((p.cf + p.cn) / sh.N)).join(" / ");
      return { lab: t("pkd_l_times"), seg, html, buys: t("pkd_sh_per_day").replace("{list}", perDay) };
    }
    const free0 = rows.length > 1 && !(parseNum(String(rows[0].r.cells[lk.priceCol || 0])) > 0);
    const lab = lk.pickCols > 0 ? t(lk.sequential || lk.pickOrder ? "pkd_l_pick" : "pkd_l_pick_any").replace("{n}", lk.pickCols)
      : ng ? (lk.sequential ? t("pkd_l_order") : t("pkd_l_hero"))
      : trig ? t("pkd_l_steps")
      : lk.sequential ? (free0 ? t("pkd_l_free") : t("pkd_l_order"))
      : rows.some((x) => pkbCap(lk, x.ri) > 1) ? t("pkd_l_times") : rows.length > 1 ? t("pkd_l_any") : t("pkd_l_price");
    const html = rows.map((x, i) => {
      const lab1 = ng && !lk.sequential ? t("pkd_each_hero") : lk.sequential || lk.pickOrder || trig ? t("pkd_step").replace("{n}", i + 1) : rows.length > 1 ? t("pkd_price_n").replace("{n}", i + 1) : "";
      let mid = lk.pickCols > 0 ? `<span class="pkd-pick">${esc(t("pkd_pick_n").replace("{n}", lk.pickCols))}</span>` : "";
      if (trig && trig.levels[x.ri]) {
        const s = packTriggerRowStatus(trig, x.ri);
        mid += `<span class="pkd-lv">${esc(t("pkd_at_lv").replace("{n}", trig.levels[x.ri]))}${s.state === "done" ? ` · ${esc(t("pkd_lv_done"))}` : s.state === "now" ? ` · <span class="on">${esc(t("pkd_lv_now"))}</span>` : ""}</span>`;
      }
      const cap = pkbCap(lk, x.ri);
      return pkbStep(esc(lab1), pkbPriceTag(tb, lk, x.ri), pkbChips(tb, lk, x.ri), { mid, cap: cap > 1 && !trig ? "×" + cap : "" });
    }).join("");
    let buys = ng ? (lk.sequential ? `${t("pkd_in_order")} · ` : "") + t("pkd_once_hero")
      : lk.pickCols > 0 ? `${lk.sequential || lk.pickOrder ? t("pkd_in_order") : t("pkd_any_order")} · ${t("pkd_choose_n").replace("{n}", lk.pickCols)}`
      : trig ? t("pkd_each_once") : `${order} · ${pkbCapsText(lk, rows)}`;
    if (o.opt) buys = `${order} · ${o.opt}`;
    let note = "";
    if (trig) {
      const lvs = rows.map((x, i) => (trig.levels[x.ri] ? `<b>${esc(t("pkd_trig_lv").replace("{n}", trig.levels[x.ri]).replace("{s}", i + 1))}</b>` : "")).filter(Boolean);
      if (lvs.length) note = `<div class="pkd-gnote"><span>&#9889; ${t("pkd_trig_note").replace("{e}", `<b>${esc(dataName(trig.expert))}</b>`).replace("{list}", lvs.length > 1 ? lvs.slice(0, -1).join(", ") + ` ${esc(t("pkd_and"))} ` + lvs[lvs.length - 1] : lvs[0])}</span></div>`;
    }
    return { lab, note, html, buys };
  }
  // Shining City Pack: the free Glorious Tomes for the first buy of each event day.
  function pkbTomeNote(tb, lk) {
    const b = packShiningBonusOf(tb, lk);
    return b ? `<div class="pkd-gnote pkd-tome"><img src="icons/glorious-tome.png" alt="" loading="lazy" /><span>${esc(t("pkd_tomes").replace("{n}", b.qty.toLocaleString(pkbLoc)))}</span></div>` : "";
  }
  // New-hero pattern packs: the copy made for each hero of the next Gen.
  function pkbNgSheetHtml(id) {
    const ng = PKB_NG && PKB_NG[String(id)];
    if (!ng || !ng.items.length) return "";
    return `<div class="pkd-lab">${esc(t("pkb_ng_made").replace("{gen}", ng.gen))}</div><div class="pkd-ngl">${ng.items.map((h) => `<div><span class="pkb-ngh-f">${h.img ? `<img src="${esc(h.img)}" alt="" loading="lazy" />` : esc(h.name.charAt(0))}</span><span class="pkd-ngn"><b>${esc(h.name)}</b><small>${esc(h.amt)} · ${esc(h.price)}</small></span></div>`).join("")}</div>`;
  }
  const pkbBoxes = (f, buys) => `<div class="pkd-g"><div><small>${esc(t("pkd_back"))}</small><span>${f.back}</span></div><div><small>${esc(t("pkd_days_k"))}</small><span>${f.days}</span></div><div><small>${esc(t("pkd_now_k"))}</small><span>${f.now}</span></div><div><small>${esc(t("pkd_buys_k"))}</small><span>${esc(buys)}</span></div></div>`;
  const pkbUsedHtml = (names) => (names.length ? `<div class="pkd-used"><small>${esc(t("pack_used_for"))}</small>${names.map((n) => `<span>${esc(n)}</span>`).join("")}</div>` : "");
  const pkbSwitchHtml = (tb) => (packLinkFor(tb.id).template ? "" : `<label class="pkd-sw"><input type="checkbox" data-pkbudrow="${esc(String(tb.id))}" ${packInBudgets(tb.id) ? "checked" : ""} /><span>${esc(t("pkd_count"))}</span></label>`);
  const pkbSheetWrap = (title, icon, sub, body, foot) => `<div class="pkb-ov pkb-dov" data-pkbinfoov><div class="pkd" role="dialog" aria-modal="true" aria-label="${esc(title)}" tabindex="-1">
      <div class="pkd-h"><span class="pkb-ic">${icon}</span><span class="pkd-t"><b>${esc(title)}</b>${sub ? `<small>${sub}</small>` : ""}</span>${closeXHtml("data-pkbiclose", "pkd-x")}</div>
      <div class="pkd-b">${body}</div>${foot ? `<div class="pkd-f">${foot}</div>` : ""}</div></div>`;
  const pkbOpenBtn = (id) => `<button type="button" class="btn pkd-open" data-pkbopen="${esc(String(id))}">${esc(t("pkd_open"))} &#8250;</button>`;
  function pkbInfoHtml(key) {
    if (!key) return "";
    if (key.startsWith("t:")) {
      const tb = tables.find((x) => String(x.id) === key.slice(2));
      if (!tb) return "";
      const lk = packLinkFor(tb.id), s = pkbTableSteps(tb, lk);
      const leadTb = lk.dateWith ? tables.find((x) => String(x.id) === String(lk.dateWith)) : null;
      const sub = leadTb ? `&#128279; ${esc(t("pkd_part_of").replace("{name}", packEventName(leadTb, tables)))}` : "";
      const body = pkbBoxes(pkbFacts(tb, lk), s.buys) + pkbTomeNote(tb, lk) + (s.note || "") + `<div class="pkd-lab">${esc(s.lab)}</div>` + (s.seg || "") + `<div class="pkd-ss">${s.html}</div>` + pkbNgSheetHtml(tb.id) + pkbUsedHtml(packUsedForNames(tb));
      return pkbSheetWrap(tb.title, pkbIcon(tb, lk) || "&#127873;", sub, body, pkbSwitchHtml(tb) + pkbOpenBtn(tb.id));
    }
    const u = PKB_UNITS.get(key.slice(3));
    if (!u) return "";
    const all = u.all.map((x) => x.tb), lt = u.lead.tb, llk = packLinkFor(lt.id), pc = (x) => packLinkFor(x.id).priceCol || 0;
    const names = [...new Set(all.flatMap((x) => packUsedForNames(x)))];
    const short = (x) => packEventShort(x.title, u.evNames);
    const rowsL = pkbRowsOf(lt, llk);
    // An option set: one price ladder, a table per option (Artisans Trove,
    // Myriad Bazaar's two sides, Dawn Market …).
    const opt = all.length > 1 && all.every((x) => { const l = packLinkFor(x.id), rs = pkbRowsOf(x, l); return l.option && l.linkSet && l.linkSet === llk.linkSet && rs.length === rowsL.length && rs.every((y, i) => parseNum(String(y.r.cells[pc(x)])) === parseNum(String(rowsL[i].r.cells[llk.priceCol || 0]))); });
    const tick = pkbEvTickHtml(all, true);
    if (opt) {
      const optTxt = all.length === 2 ? t("pkd_side_step") : t("pkd_opt_step");
      const sub = `&#128279; ${esc(all.length === 2 ? t("pkd_sides") : t("pkd_options").replace("{n}", all.length))} · ${esc(all.map(short).join(" / "))}`;
      const html = rowsL.map((x, i) => pkbStep(esc(llk.sequential ? t("pkd_step").replace("{n}", i + 1) : t("pkd_price_n").replace("{n}", i + 1)), pkbPriceTag(lt, llk, x.ri), "", { foot: all.map((tb) => { const l = packLinkFor(tb.id), y = pkbRowsOf(tb, l)[i]; return `<div class="pkd-ol"><span class="pkd-on">${esc(short(tb))}</span><div class="pkd-cs">${pkbChips(tb, l, y.ri)}</div></div>`; }).join("") })).join("");
      const body = pkbBoxes(pkbFacts(lt, llk), `${llk.sequential ? t("pkd_in_order") : t("pkd_any_order")} · ${optTxt}`) + `<div class="pkd-lab">${esc(all.length === 2 ? t("pkd_l_side") : t("pkd_l_opt"))}</div><div class="pkd-ss">${html}</div>` + pkbUsedHtml(names);
      return pkbSheetWrap(u.evName, pkbIcon(lt, llk) || "&#127873;", sub, body, tick + pkbOpenBtn(lt.id));
    }
    // Other events: the leader's dates, then each pack with its own steps.
    const secs = all.map((tb) => {
      const l = packLinkFor(tb.id), s = pkbTableSteps(tb, l);
      return `<section class="pkd-sec"><div class="pkd-sh"><span class="pkb-ic">${pkbIcon(tb, l) || "&#127873;"}</span><b title="${esc(tb.title)}">${esc(short(tb))}</b>${packLinkFor(tb.id).template ? "" : `<label class="pkb-tk pkd-stk" title="${esc(t("pk_in_budgets_hint"))}"><input type="checkbox" data-pkbudrow="${esc(String(tb.id))}" ${packInBudgets(tb.id) ? "checked" : ""} aria-label="${esc(t("pk_in_budgets"))}" /></label>`}<button type="button" class="pkd-go" data-pkbopen="${esc(String(tb.id))}" aria-label="${esc(t("pkd_open"))}: ${esc(tb.title)}">${esc(t("pkd_open"))} &#8250;</button></div>${pkbTomeNote(tb, l)}${s.note || ""}<div class="pkd-lab">${esc(s.lab)}</div>${s.seg || ""}<div class="pkd-ss">${s.html}</div>${pkbNgSheetHtml(tb.id)}</section>`;
    }).join("");
    const body = pkbBoxes(pkbFacts(lt, llk), t("pkd_ev_each")) + secs + pkbUsedHtml(names);
    return pkbSheetWrap(u.evName, `<span class="pkb-ev-st">${all.slice(0, 4).map((x) => `<span>${pkbIcon(x, packLinkFor(x.id)) || "&#127873;"}</span>`).join("")}</span>`, `&#128279; ${esc(t("pkb_ev_packs").replace("{n}", all.length))}`, body, tick);
  }
  // Draws (or removes) the sheet at the end of the list; its scroll is kept.
  function pkbInfoDraw() {
    const old = listEl.querySelector("[data-pkbinfoov]"), y = old ? (old.querySelector(".pkd-b") || {}).scrollTop || 0 : 0;
    if (old) old.remove();
    if (!PKB_INFO) return;
    const html = pkbInfoHtml(PKB_INFO);
    if (!html) { PKB_INFO = null; return; }
    listEl.insertAdjacentHTML("beforeend", html);
    const b = listEl.querySelector("[data-pkbinfoov] .pkd-b");
    if (b && y) b.scrollTop = y;
  }
  function pkbInfoOpen(key) {
    PKB_INFO = key;
    if (!(history.state && history.state.tab === "packs" && history.state.pkbi === key)) history.pushState({ tab: "packs", pkbi: key }, "", location.pathname + location.search);
    pkbInfoDraw();
  }
  function pkbInfoClose(fromHistory) {
    if (!fromHistory && history.state && history.state.tab === "packs" && history.state.pkbi) { history.back(); return; }
    PKB_INFO = null;
    pkbInfoDraw();
  }
  function pkbCatSub(list, key) {
    if (key === PACK_TEMPLATE_GROUP) return t("mp_template_note");
    const on = list.filter(({ tb }) => packInBudgets(tb.id)).length;
    return on === list.length ? t("pkb_counted_all").replace("{n}", list.length) : t("pkb_counted_some").replace("{n}", on).replace("{m}", list.length);
  }
  let pkbCats = []; // what the list shows, for pkbSyncBudget
  const PKB_TIER = { classic: 1, sublime: 2, exquisite: 3 };
  const pkbSplit = (title) => { const s0 = String(title || "").trim(), i = s0.indexOf(":"); return i > 0 ? [s0.slice(0, i).trim(), s0.slice(i + 1).trim()] : [s0, ""]; };
  const pkbCmp = (a, b) => a.localeCompare(b, pkbLoc, { numeric: true, sensitivity: "base" });
  function pkbOrder(ta, tb) {
    const [fa, sa] = pkbSplit(ta), [fb, sb] = pkbSplit(tb);
    // "Chief Gear" and "Chief Gears" are the same pack family
    const fam = (x) => x.toLowerCase().replace(/s\b/g, "");
    const c = pkbCmp(fam(fa), fam(fb));
    if (c) return c;
    const ra = PKB_TIER[sa.toLowerCase().split(/\s+/)[0]] || 99, rb = PKB_TIER[sb.toLowerCase().split(/\s+/)[0]] || 99;
    return ra - rb || pkbCmp(sa, sb);
  }
  function renderAllCore() {
    renderPageTabs();
    if (!tables.length) {
      listEl.innerHTML = `<div class="empty"><div class="big">${esc(t("no_tables_yet"))}</div>${esc(t("no_tables_hint"))}</div>`;
      return;
    }
    const q = PKB_QUERY.trim().toLowerCase();
    const order = categoryOrder();
    const groups = order.map((g) => ({ key: g, label: g, list: [] })), none = { key: "", label: t("packs_filter_none"), list: [] };
    // "Same dates as" events: a pack and its followers in the same category
    // (pkbEvKey). Searching shows the whole event when any of them matches.
    const evHit = new Set();
    if (q) tables.forEach((tb) => { if (pkbMatch(tb, q)) evHit.add(pkbEvKey(tb)); });
    tables.forEach((tb, ti) => {
      if (isTpl(tb) && !tplOpen()) return;
      if (!pkbMatch(tb, q) && !evHit.has(pkbEvKey(tb))) return;
      const g = categoryOf(tb);
      (g && groups.find((x) => x.key === g) || none).list.push({ tb, ti });
    });
    pkbCats = [...groups, none].filter((g) => g.list.length);
    // Related packs sit together, in an order you can follow: A to Z by the name before ":" (all
    // "Dawn of Wisdom" tables, then all "Artisans Trove …"), inside one name the
    // game's tiers first (Classic, Sublime, Exquisite), then A to Z with numbers
    // in number order (Lv 2 before Lv 10).
    pkbCats.forEach((g) => g.list.sort((a, b) => pkbOrder(a.tb.title, b.tb.title)));
    // The owner's own order (Arrange), when saved for a fold / an event card.
    const rowOrd = pkbRowOrder();
    if (q || !IS_OWNER) PKB_ARRANGE_CAT = null;
    // Event cards: a leader with followers in the same
    // fold is one unit where the leader sorts; followers aren't listed apart.
    pkbCats.forEach((g) => {
      const ids = new Set(g.list.map((x) => String(x.tb.id))), fol = new Map(), taken = new Set();
      g.list.forEach((x) => {
        const lead = packLinkFor(x.tb.id).dateWith;
        if (lead && ids.has(String(lead))) { if (!fol.has(String(lead))) fol.set(String(lead), []); fol.get(String(lead)).push(x); taken.add(String(x.tb.id)); }
      });
      g.units = pkbByOrder(g.list.filter((x) => !taken.has(String(x.tb.id))).map((x) => ({ lead: x, fol: fol.get(String(x.tb.id)) || [] })), rowOrd[g.key], (u) => u.lead.tb.id);
    });
    PKB_UNITS.clear();
    const unitHtml = (u, arr) => {
      if (!u.fol.length) return pkbCardHtml(u.lead.tb, u.lead.ti, arr);
      const lt = u.lead.tb, id = String(lt.id);
      u.evName = packEventName(lt, tables);
      u.evNames = [u.evName, packEventDefault(lt, packEventFollowers(lt, tables))];
      u.all = pkbByOrder([u.lead, ...u.fol].sort((a, b) => pkbOrder(a.tb.title, b.tb.title)), rowOrd["ev:" + id], (x) => x.tb.id);
      PKB_UNITS.set(id, u);
      return pkbEvCardHtml(u, arr);
    };
    const openKey = packsFilter === "none" ? "" : packsFilter.startsWith("cat:") ? packsFilter.slice(4) : packsFilter === "closed" ? null : (pkbCats[0] ? pkbCats[0].key : null);
    const html = pkbCats.map((g) => {
      const open = !!q || g.key === openKey;
      const arr = open && PKB_ARRANGE_CAT === g.key;
      const shownU = q || arr || PKB_MORE.has(g.key) ? g.units.length : Math.min(4, g.units.length);
      const shown = g.units.slice(0, shownU).reduce((n, u) => n + 1 + u.fol.length, 0);
      // Owner: "Arrange" on the open fold's heading (not while searching).
      const arrBtn = open && IS_OWNER && !q ? `<button type="button" class="pkb-arr-btn${arr ? " on" : ""}" data-pkbarr="${esc(g.key)}" aria-pressed="${arr}">${arr ? esc(t("pkb_arrange_done")) : `&#8645; ${esc(t("pkb_arrange"))}`}</button>` : "";
      const hasSaved = arr && (Array.isArray(rowOrd[g.key]) || g.units.some((u) => u.fol.length && Array.isArray(rowOrd["ev:" + String(u.lead.tb.id)])));
      const arrBar = arr ? `<div class="pkb-arr-bar"><span>${esc(t("pkb_arrange_hint"))}</span>${hasSaved ? `<button type="button" class="pkb-arr-reset" data-pkbarrreset="${esc(g.key)}">${esc(t("pkb_arrange_reset"))}</button>` : ""}</div>` : "";
      return `<section class="pkb-cat${open ? " open" : ""}${arrBtn ? ` pkb-own${arr ? " pkb-arranging" : ""}` : ""}" data-pkbcat="${esc(g.key)}">${arrBtn}
        <button type="button" class="pkb-cat-h" data-pkbfold="${esc(g.key)}" aria-expanded="${open}">
          <span class="pkb-n">${g.list.length}</span>
          <span class="pkb-cat-t"><b>${esc(g.label)}</b><small data-pkbcatsub>${esc(pkbCatSub(g.list, g.key))}</small></span>
          <span class="pkb-caret" aria-hidden="true">${open ? "&#9662;" : "&#9656;"}</span>
        </button>
        ${open ? `${g.key === PACK_MINE_GROUP && IS_OWNER ? `<div class="meta pkb-note">${esc(t("mp_admin_mine_note"))}</div>` : ""}${arrBar}<div class="pkb-cur">${esc(t("pkb_prices_in").replace("{cur}", pkbCurCode()))}</div><div class="pkb-grid">${g.units.slice(0, shownU).map((u) => unitHtml(u, arr)).join("")}</div>${shown < g.list.length ? `<button type="button" class="pkb-more" data-pkbmore="${esc(g.key)}">${esc(t("pkb_show_more").replace("{n}", g.list.length - shown))} &#9662;</button>` : ""}` : ""}
      </section>`;
    }).join("");
    const openId = [...PACKS_OPEN][0];
    const sheetTi = openId != null ? tables.findIndex((tb) => String(tb.id) === String(openId)) : -1;
    listEl.innerHTML = `<div class="pkb-cats">${html || `<div class="empty">${esc(t("pkb_no_match"))}</div>`}</div><datalist id="packGroupNames">${order.map((g) => `<option value="${esc(g)}"></option>`).join("")}</datalist>${sheetTi >= 0 ? pkbSheetHtml(sheetTi) : ""}`;
    if (sheetTi >= 0) pkbBuildSheet(); else if (openId != null) PACKS_OPEN.clear();
    // the details sheet of a unit not drawn (a closed fold, a search) still
    // finds its event: every unit is known, drawn or not
    pkbCats.forEach((g) => g.units.forEach((u) => { if (u.fol.length && !PKB_UNITS.has(String(u.lead.tb.id))) unitHtml(u, false); }));
    if (sheetTi < 0) pkbInfoDraw();
    pkbWireArrange();
  }
  // Arrange (owner): each row / event card of the fold has a ⋮⋮ handle; rows
  // inside an open event card move among themselves. The drop saves the new
  // order for everyone (packs_links.__rowOrder) and draws the list again.
  const pkbArrItem = (h) => h.closest(".pkb-card");
  const pkbArrList = (el) => [...el.parentElement.children].filter((x) => x.matches(".pkb-card"));
  const pkbArrId = (el) => (el.matches(".pkb-evc") ? el.dataset.pkbev : el.dataset.pkrowid);
  function pkbSaveRowOrder(change) {
    const o = { ...pkbRowOrder() };
    change(o);
    if (Object.keys(o).length) PACK_LINKS.__rowOrder = o; else delete PACK_LINKS.__rowOrder;
    savePackLinks();
    renderAll();
    dsSaved();
  }
  function pkbWireArrange() {
    listEl.querySelectorAll(".pkb-arranging .ds-h[data-pkbdrag]").forEach((h) => dragSort(h, {
      item: pkbArrItem,
      items: pkbArrList,
      grid: true,
      place: () => {},
      done: (el, from, to) => {
        const ids = pkbArrList(el).map(pkbArrId);
        const [moved] = ids.splice(from, 1);
        ids.splice(to, 0, moved);
        const sec = el.closest("[data-pkbcat]");
        if (!sec) return;
        const key = sec.dataset.pkbcat;
        pkbSaveRowOrder((o) => { o[key] = ids; });
      },
      refocus: (el) => {
        const id = pkbArrId(el), sel = el.matches(".pkb-evc") ? `.pkb-arranging [data-pkbev="${window.CSS.escape(id)}"] > .ds-h` : `.pkb-arranging [data-pkrowid="${window.CSS.escape(id)}"] > .ds-h`;
        const nh = listEl.querySelector(sel);
        if (nh) nh.focus();
      },
    }));
  }
  // "Reset to A–Z": the fold's own order and its event cards' orders go.
  function pkbArrangeReset(key) {
    const sec = listEl.querySelector(`[data-pkbcat="${window.CSS.escape(key)}"]`);
    const evs = sec ? [...sec.querySelectorAll("[data-pkbev]")].map((x) => "ev:" + x.dataset.pkbev) : [];
    pkbSaveRowOrder((o) => { delete o[key]; evs.forEach((k) => delete o[k]); });
  }
  // Count in Budgets changed (a row's tick or the window's switch): the other
  // one, the row's look and the category's "counted" line follow.
  function pkbSyncBudget(id) {
    const on = packInBudgets(id);
    listEl.querySelectorAll(`[data-pkbudrow="${window.CSS.escape(String(id))}"]`).forEach((cb) => { cb.checked = on; const row = cb.closest(".pkb-row, .pkb-card"); if (row) row.classList.toggle("pkb-off", !on); });
    listEl.querySelectorAll(`.pkb-panel[data-pkid="${window.CSS.escape(String(id))}"] [data-pkbud]`).forEach((cb) => { cb.checked = on; });
    listEl.querySelectorAll("[data-pkbevall]").forEach((b) => {
      const ids = b.dataset.pkbevall.split(",");
      if (!ids.includes(String(id))) return;
      const tmp = document.createElement("div");
      tmp.innerHTML = pkbEvTickHtml(ids.map((x) => tables.find((tb) => String(tb.id) === x)).filter(Boolean), b.hasAttribute("data-pkbevlbl"));
      if (tmp.firstElementChild) b.replaceWith(tmp.firstElementChild);
    });
    listEl.querySelectorAll(".pkb-evc").forEach((c) => { const b = c.querySelector("[data-pkbevall]"); if (b) c.classList.toggle("pkb-off", b.classList.contains("none")); });
    pkbCats.forEach((g) => {
      const sub = listEl.querySelector(`[data-pkbcat="${window.CSS.escape(g.key)}"] [data-pkbcatsub]`);
      if (sub) sub.textContent = pkbCatSub(g.list, g.key);
    });
  }
  function pkbSheetHtml(ti) {
    const tb = tables[ti];
    return `<div class="pkb-ov pkb-tov" data-pkbsheet><div class="panel pk-card pk-open pkb-panel${PK_ARRANGE.has(String(tb.id)) ? " pk-arrange" : ""}${packInBudgets(tb.id) ? "" : " pk-budoff"}" role="dialog" aria-label="${esc(tb.title)}" data-packtable="${ti}" data-pkid="${esc(String(tb.id))}"><div class="pk-body" hidden data-pk-lazy></div></div></div>`;
  }
  // The window: the editor (title bar, table, settings) with a back button and
  // the pack's schedule in the bar, Count in Budgets under the table, the
  // settings open, and "How it's bought" as one dropdown.
  function pkbBuildSheet() {
    const panel = listEl.querySelector(".pkb-panel");
    if (!panel) return;
    buildPkBody(panel);
    const body = panel.querySelector(".pk-body");
    if (!body) return;
    body.hidden = false;
    const tb = tables[Number(panel.dataset.packtable)], lk = packLinkFor(tb.id), w = pkbWhen(lk, tb.id);
    const bar = body.querySelector(".pk-ed-bar");
    if (bar) {
      bar.insertAdjacentHTML("afterbegin", `<button type="button" class="pkb-back" data-pkbclose aria-label="${esc(t("close_button"))}">&#8249;</button>`);
      const line = [w.text, w.done ? w.doneText : w.on ? t("pkb_on_now") : w.next ? t("pkb_next").replace("{date}", w.next) : ""].filter(Boolean).join(" · ");
      if (line) bar.insertAdjacentHTML("beforeend", `<div class="pkb-when">${esc(line)}</div>`);
      const hint = body.querySelector("[data-pack-visitor-hint]");
      if (hint) bar.after(hint);
      // D: a follower says which pack its dates come from.
      const leadTb = lk.dateWith ? tables.find((x) => String(x.id) === String(lk.dateWith)) : null;
      if (leadTb) {
        const sub = [t("pkb_ev_from"), lk.window > 0 ? t("pkb_ev_lasts").replace("{n}", lk.window) : ""].filter(Boolean).join(" · ");
        bar.insertAdjacentHTML("afterend", `<button type="button" class="pkb-evb" data-pkbgo="${esc(String(leadTb.id))}"><span class="pkb-ic">${pkbIcon(leadTb, packLinkFor(leadTb.id)) || "&#127873;"}</span><span class="pkb-evb-t"><b>&#128279; ${esc(t("pkb_ev_part").replace("{name}", packEventName(leadTb, tables)))}</b><small>${esc(sub)}</small></span><span class="pkb-chev" aria-hidden="true">&#8250;</span></button>`);
      }
      if (!IS_OWNER) {
        const edits = packMyEdits()[String(tb.id)];
        if (edits && Object.keys(edits).length) {
          const b = document.createElement("button");
          b.type = "button"; b.className = "btn small ghost pkb-reset"; b.textContent = t("pack_my_edits_reset");
          b.addEventListener("click", () => {
            const all = packMyEdits(); delete all[String(tb.id)]; packSaveMyEdits(all);
            tb.rows = tb._orig.map((r) => ({ ...r, cells: r.cells.slice() }));
            renderAll();
          });
          bar.insertBefore(b, bar.querySelector(".pkb-when"));
        }
      }
    }
    // The settings are built in full here (on the list they're built on first open)
    // and shown open, as sections under the table.
    let settings = body.querySelector("details[data-packlink]");
    if (settings && settings.hasAttribute("data-packlinklazy")) {
      const tmp = document.createElement("div");
      tmp.innerHTML = packLinkEditorFullHtml(tb);
      const full = tmp.querySelector("[data-packlink]");
      if (full) { settings.replaceWith(full); wirePackLinkEditors([full]); settings = full; }
    }
    const usedFor = packUsedForNames(tb);
    const budHtml = lk.template ? "" : `<div class="pkb-sec"><label class="pkb-budrow"><span>${esc(t("pk_in_budgets"))}</span><input type="checkbox" class="bset-sw" data-pkbud ${packInBudgets(tb.id) ? "checked" : ""} /></label>${!IS_OWNER && usedFor.length ? `<div class="pkb-used"><span class="pkb-k">${esc(t("pack_used_for"))} · ${usedFor.length}</span><div class="pk-used-list">${usedFor.map((n) => `<span>${esc(n)}</span>`).join("")}</div></div>` : ""}</div>`;
    // D: the leader lists the packs whose dates follow it.
    const fols = lk.dateWith ? [] : tables.filter((x) => String(x.id) !== String(tb.id) && String(packLinkFor(x.id).dateWith || "") === String(tb.id)).sort((a, b) => pkbOrder(a.title, b.title));
    const evDef = fols.length ? packEventDefault(tb, packEventFollowers(tb, tables)) : "", evName = fols.length ? packEventName(tb, tables) : "", evNames = [evName, evDef];
    const evNameHtml = !fols.length ? "" : IS_OWNER
      ? `<label class="pkb-evn"><span>${esc(t("pkb_ev_name"))}</span><input type="text" class="keep-w" data-pkbevname="${esc(String(tb.id))}" value="${esc(String(((PACK_LINKS || {})[String(tb.id)] || {}).eventName || ""))}" placeholder="${esc(evDef)}" maxlength="80" autocomplete="off" /></label><p class="pkb-evl-n">${esc(t("pkb_ev_name_hint"))}</p>`
      : `<div class="pkb-evn-v">&#128279; ${esc(evName)}</div>`;
    // A pack that follows another can still take others in: it then leads
    // (pkbEvAddSheet), e.g. picking its own leader swaps the two.
    const canLead = IS_OWNER && pkbCanLead(tb);
    const addBtn = canLead ? `<button type="button" class="btn ghost pkb-evadd" data-pkbevadd="${esc(String(tb.id))}">+ ${esc(t("pkb_ev_add"))}</button>` : "";
    const evHtml = fols.length || canLead ? `<div class="pkb-sec pkb-evl"><span class="pkb-k">${esc(t("pkb_ev_with"))}</span>${evNameHtml}${fols.map((x) => { const xl = packLinkFor(x.id); return `<button type="button" class="pkb-evi" data-pkbgo="${esc(String(x.id))}" title="${esc(x.title)}"><span class="pkb-ic">${pkbIcon(x, xl) || "&#127873;"}</span><b>${esc(packEventShort(x.title, evNames))}</b><span class="pkb-evi-p">${esc(pkbPrice(x, xl))}</span><span class="pkb-chev" aria-hidden="true">&#8250;</span></button>`; }).join("")}${fols.length ? `<p class="pkb-evl-n">${esc(t("pkb_ev_move"))}</p>` : lk.dateWith ? "" : `<p class="pkb-evl-n">${esc(t("pkb_ev_none"))}</p>`}${addBtn}</div>` : "";
    if (settings) { settings.insertAdjacentHTML("beforebegin", evHtml + budHtml); settings.open = true; } else body.insertAdjacentHTML("beforeend", evHtml + budHtml);
    const evAdd = body.querySelector("[data-pkbevadd]");
    if (evAdd) evAdd.addEventListener("click", () => pkbEvAddSheet(tb));
    const evIn = body.querySelector("[data-pkbevname]");
    if (evIn) {
      evIn.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); evIn.blur(); } });
      evIn.addEventListener("change", () => {
        const id = evIn.dataset.pkbevname, v = evIn.value.trim().replace(/\s+/g, " ");
        PACK_LINKS[id] = PACK_LINKS[id] || { pages: [], priceCol: 0, cols: {} };
        if (!v || v === evIn.placeholder) delete PACK_LINKS[id].eventName; else PACK_LINKS[id].eventName = v;
        evIn.value = PACK_LINKS[id].eventName || "";
        // the rows in this box follow at once; the list behind redraws on close
        const names = [PACK_LINKS[id].eventName || evIn.placeholder, evIn.placeholder];
        body.querySelectorAll(".pkb-evi").forEach((b) => { const x = b.querySelector("b"); if (x) x.textContent = packEventShort(b.title, names); });
        renderMyPackDates(document.getElementById("packsMyDates"), tables);
        savePackLinks();
      });
    }
    const seg = body.querySelector(".pks-seg");
    if (seg) {
      const radios = [...seg.querySelectorAll("input[data-pkhow]")];
      seg.insertAdjacentHTML("beforebegin", `<div class="bset-row pkb-howrow"><span class="bset-l">${esc(t("pkb_how"))}</span><span class="bset-c"><select data-pkbhow class="keep-w">${radios.map((r) => `<option value="${esc(r.dataset.pkhow)}" ${r.checked ? "selected" : ""}>${esc(r.parentElement.textContent.trim())}</option>`).join("")}</select></span></div>`);
      seg.classList.add("pkb-hide");
    }
  }
  function pkbOpen(id) {
    id = String(id);
    PKB_INFO = null;
    PACKS_OPEN.clear(); PACKS_OPEN.add(id);
    if (!(history.state && history.state.tab === "packs" && history.state.pkb === id)) history.pushState({ tab: "packs", pkb: id }, "", location.pathname + location.search);
    renderAll();
    const b = listEl.querySelector(".pkb-panel > .pk-body");
    if (b) b.scrollTop = 0;
  }
  // ✕ / ‹ / Esc go back one step in the browser history when the window has
  // its own entry (so the phone's Back closes it too).
  function pkbClose(fromHistory) {
    if (!fromHistory && history.state && history.state.tab === "packs" && history.state.pkb) { history.back(); return; }
    PACKS_OPEN.clear();
    renderAll();
  }
  PKB_HOOK = {
    open: pkbOpen,
    closeUi: () => pkbClose(false),
    history: (id, info) => {
      if (id) { PKB_INFO = null; if (![...PACKS_OPEN].includes(String(id))) { PACKS_OPEN.clear(); PACKS_OPEN.add(String(id)); renderAll(); } return; }
      if (PACKS_OPEN.size) { PACKS_OPEN.clear(); PKB_INFO = info || null; renderAll(); return; }
      if (info) { if (PKB_INFO !== info) { PKB_INFO = info; pkbInfoDraw(); } } else if (PKB_INFO) pkbInfoClose(true);
    },
    infoOpen: () => !!PKB_INFO,
    closeInfo: () => pkbInfoClose(false),
  };
  // Visitors: the tables are shown exactly as the owner set them, with every
  // editing control removed and the settings ("Used for") hidden.
  function applyPacksReadOnly(root, bodyOnly) {
    const panelsIn = root.matches && root.matches("[data-packtable]") ? [root] : [...root.querySelectorAll("[data-packtable]")];
    root.querySelectorAll(".pk-more, [data-pkarrange]").forEach((el) => el.remove());
    root.querySelectorAll("[data-packlink], [data-pt-delete], [data-pt-duplicate], [data-pt-restore], [data-pt-group], [data-pt-scaletoggle]").forEach((el) => { const lbl = el.closest("label"); (lbl && el.matches("[data-pt-scaletoggle]") ? lbl : el).remove(); });
    root.querySelectorAll("[data-pt-addcol], [data-pt-addrow]").forEach((el) => { const box = el.parentElement && el.parentElement.parentElement; (box || el).remove(); });
    root.querySelectorAll("[data-pt-title]").forEach((inp) => { inp.readOnly = true; inp.tabIndex = -1; inp.style.pointerEvents = "none"; });
    // Price and Gems cells are locked; the price shows in the viewer's own
    // currency (their store prices, else Admin prices/rates). Every other
    // cell can be changed for their own planning.
    panelsIn.forEach((panel) => {
      const tb = tables[Number(panel.dataset.packtable)];
      if (!tb) return;
      const link = packLinkFor(tb.id);
      const gemsCi = gemsColOf(tb);
      panel.querySelectorAll("[data-pt-cell]").forEach((inp) => {
        const ri = Number(inp.dataset.row), ci = Number(inp.dataset.col);
        if (ci === link.priceCol || ci === gemsCi) {
          inp.readOnly = true; inp.tabIndex = -1; inp.style.pointerEvents = "none";
          if (ci === link.priceCol) {
            const n = parseNum(inp.value);
            inp.style.display = "none";
            const span = document.createElement("span");
            span.style.cssText = "font-size:12px; font-weight:600; white-space:nowrap;";
            span.textContent = n ? packFmtMoney(n, link.currency) : inp.value;
            inp.after(span);
          } else {
            inp.style.opacity = "0.75";
          }
          return;
        }
        const orig = tb._orig && tb._orig[ri] ? String(tb._orig[ri].cells[ci] ?? "") : inp.value;
        if (inp.value !== orig) { inp.style.borderColor = "var(--ice)"; inp.title = orig ? `${orig} \u2192 ${inp.value}` : ""; }
      });
      const edits = !bodyOnly && packMyEdits()[String(tb.id)];
      const headRow = panel.firstElementChild;
      if (edits && Object.keys(edits).length && headRow) {
        const b = document.createElement("button");
        b.type = "button"; b.className = "btn small ghost"; b.style.cssText = "flex-shrink:0; padding:3px 8px; font-size:11px;";
        b.textContent = t("pack_my_edits_reset");
        b.addEventListener("click", () => {
          const all = packMyEdits(); delete all[String(tb.id)]; packSaveMyEdits(all);
          tb.rows = tb._orig.map((r) => ({ ...r, cells: r.cells.slice() }));
          renderAll();
        });
        headRow.appendChild(b);
      }
    });
    // The "you can change the amounts" note sits inside each table's editor
    // (seen after tapping Edit), not above the whole list.
    root.querySelectorAll(".pk-body:not([data-pk-lazy])").forEach((body) => {
      if (body.querySelector("[data-pack-visitor-hint]")) return;
      const hint = document.createElement("p");
      hint.className = "desc"; hint.dataset.packVisitorHint = "1"; hint.style.cssText = "font-size:11px; margin:0 0 8px;";
      hint.textContent = t("pack_visitor_edit_hint");
      body.prepend(hint);
    });
    // Per-row purchase limits stay visible as plain text ("×3" = that row
    // can be bought 3 times), so visitors know a tier repeats.
    // Rows with a Max can be changed for their own planning (kept in this
    // browser); rows without one stay empty.
    root.querySelectorAll("[data-pt-rowmax]").forEach((inp) => {
      const panel = inp.closest("[data-packtable]"), tb = panel && tables[Number(panel.dataset.packtable)];
      const base = tb && PACK_LINKS && PACK_LINKS[String(tb.id)] && PACK_LINKS[String(tb.id)].rowMax ? Number(PACK_LINKS[String(tb.id)].rowMax[inp.dataset.row]) || 0 : 0;
      if (!tb || !base) { const td = inp.closest("td"); td.textContent = ""; return; }
      inp.dataset.ptMyrowmax = "1";
      inp.style.width = "46px"; inp.style.fontSize = "12.5px"; inp.style.padding = "3px";
      inp.placeholder = String(base);
      if (Number(inp.value) !== base) { inp.style.borderColor = "var(--ice)"; inp.title = `${base} \u2192 ${inp.value}`; }
      inp.addEventListener("change", () => {
        const all = packMyRowMax(), id = String(tb.id), n = Math.floor(Number(inp.value) || 0);
        all[id] = { ...(all[id] || {}) };
        if (n > 0 && n !== base) all[id][inp.dataset.row] = n; else { delete all[id][inp.dataset.row]; inp.value = String(base); }
        if (!Object.keys(all[id]).length) delete all[id];
        packSaveMyRowMax(all);
        inp.style.borderColor = Number(inp.value) !== base ? "var(--ice)" : "";
      });
    });
    root.querySelectorAll("[data-pt-currencypick]").forEach((sel) => sel.remove());
    root.querySelectorAll("[data-pt-colpick]").forEach((sel) => {
      const span = document.createElement("span");
      span.className = "meta"; span.style.cssText = "font-size:11px; font-weight:600; display:block; text-align:center;";
      span.textContent = (sel.options[sel.selectedIndex] || {}).text || "";
      sel.replaceWith(span);
    });
  }

  // The "Used for" block under each table: which pages it prices, which
  // column holds the price, and what each other column grants.
  // Price, Gems, every trackable resource, then whatever custom name this
  // column already had, so nothing a user typed before is lost.
  // The header control for one column:
  //  - price column  -> currency list only
  //  - Gems column   -> fixed label, nothing to choose
  //  - anything else -> the resource list (plus a custom name)
  function packColumnControlHtml(tb, ci) {
    const link = packLinkFor(tb.id);
    const cur = String(tb.columns[ci] || "").trim();
    if (ci === link.priceCol || (packIsNonResourceColumn(cur) && cur.toLowerCase() !== "gems")) {
      // Prices are entered in the pack's own currency (US dollars for the
      // in-game shop); viewers convert on the Budgets page.
      const shownCur = !IS_OWNER && DISPLAY_CURRENCY && link.currency === "USD" ? DISPLAY_CURRENCY : link.currency;
      return `<span class="pack-col-fixed" title="${esc(shownCur)}">${esc(packCurrencySymbol(shownCur))}</span><select data-pt-currencypick data-col="${ci}" class="pack-col-pick" hidden title="${esc(t("pack_currency"))}" style="width:100%; max-width:60px; font-size:11px; font-weight:600; text-align:center; padding:3px 2px; background:none; border:none;">
        ${PACK_CURRENCIES.map((c) => `<option value="${esc(c.code)}" ${c.code === link.currency ? "selected" : ""}>${esc(c.symbol)}</option>`).join("")}
      </select>`;
    }
    if (cur.toLowerCase() === "gems") {
      return `<span class="pack-col-fixed" title="${esc(cur)}" style="display:inline-flex; align-items:center; gap:4px;">${esc(cur)}${IS_OWNER ? `<button type="button" class="btn ghost small" data-pt-gemsdel data-col="${ci}" title="${esc(t("pack_remove_column"))}" style="padding:0 5px; font-size:10px; line-height:16px;">&times;</button>` : ""}</span>`;
    }
    // Speed: a page has hundreds of these, each listing every resource
    // (~16,000 options in all, rebuilt on every redraw). Only the option on
    // show is built here; the full list is filled in the moment the
    // dropdown is touched or focused (fillPackColPick), before it opens.
    const known = packResourceChoices(cur);
    const matches = known.filter((n) => n.toLowerCase() === cur.toLowerCase());
    const shown = !cur
      // No name yet: the browser showed the list's first entry.
      ? (known.length ? `<option value="${esc(known[0])}">${esc(materialDisplayName(known[0]))}</option>` : `<option value="__custom__">${esc(t("pack_custom_name"))}</option>`)
      : matches.length
        ? `<option value="${esc(matches[matches.length - 1])}" selected>${esc(materialDisplayName(matches[matches.length - 1]))}</option>`
        : `<option value="${esc(cur)}" selected>${esc(cur)}</option>`;
    return `<select data-pt-colpick data-pt-lazy data-col="${ci}" class="pack-col-pick" title="${esc(cur)}" style="width:100%; max-width:60px; font-size:11px; font-weight:600; text-align:center; padding:3px 2px; background:none; border:none;">${shown}</select>`;
  }
  // The full option list of a column dropdown (see packColumnControlHtml).
  function packColumnOptionsHtml(tb, ci) {
    const cur = String(tb.columns[ci] || "").trim();
    const known = packResourceChoices(cur);
    const isKnown = known.some((n) => n.toLowerCase() === cur.toLowerCase());
    return `
      ${known.map((n) => `<option value="${esc(n)}" ${n.toLowerCase() === cur.toLowerCase() ? "selected" : ""}>${esc(materialDisplayName(n))}</option>`).join("")}
      ${isKnown || !cur ? "" : `<option value="${esc(cur)}" selected>${esc(cur)}</option>`}
      <option value="__custom__">${esc(t("pack_custom_name"))}</option>
      <option value="__remove__">${esc(t("pack_remove_column"))}</option>`;
  }
  function packLinkEditorHtml(tb) {
    // Visitors never see this editor (applyPacksReadOnly removes every
    // [data-packlink]), so don't build it for them: with every table listing
    // every other one under "Same pack", it was thousands of hidden elements.
    if (!IS_OWNER) return "";
    // It starts closed, so only its title line is built here; the full
    // editor is built (and wired) the first time it's opened - see
    // wirePackLinkEditors. Building all of them made every redraw slow.
    const link = packLinkFor(tb.id);
    return `
      <details class="pack-link pks" data-packlink="${esc(tb.id)}" data-packlinklazy>
        <summary class="pks-sum">${esc(packLinkSummaryText(packGroupsChecked(link.pages)))}</summary>
      </details>`;
  }
  // "Same dates as" (owner only): the leader this pack follows, if it takes effect.
  function packDateLeaderShown(id) { return packLinkForBase(id).dateWith || ""; }
  // Packs this one can follow: other repeating packs (not cards, triggered,
  // templates or "My packs"), and not one that already follows this one.
  // A New Gen pack picks only New Gen packs, a normal pack only normal ones.
  function packDateWithChoices(tb) {
    const me = String(tb.id), ng = !!packLinkForBase(me, true).newGen;
    return tables.filter((x) => {
      const id = String(x.id);
      if (id === me || id.startsWith("my-") || id.startsWith("ng-")) return false;
      const l = packLinkForBase(id, true);
      if (l.template || l.trigger || l.mine || !!l.newGen !== ng) return false;
      if (!ng && (typeof l.reset !== "number" || !(l.reset > 0) || l.reset >= PACK_ONE_TIME_DAYS)) return false;
      return packDateLeader(id) !== me;
    });
  }
  // Several packs at once: a pack that can lead, and the packs that may follow it.
  function pkbCanLead(tb) {
    const id = String(tb.id);
    if (id.startsWith("my-") || id.startsWith("ng-")) return false;
    const l = packLinkForBase(id, true);
    if (l.template || l.trigger || l.mine) return false;
    return !!l.newGen || (typeof l.reset === "number" && l.reset > 0 && l.reset < PACK_ONE_TIME_DAYS);
  }
  const pkbRawLead = (id) => String(((PACK_LINKS || {})[String(id)] || {}).dateWith || "");
  // How many packs follow this one ("Same dates as" it).
  const pkbFolCount = (id) => tables.filter((y) => String(y.id) !== String(id) && pkbRawLead(y.id) === String(id)).length;
  // Packs that can join this pack's event. This pack's own leader, or a pack
  // that leads others, can be picked too: this pack then leads them all
  // (a leader swap, see pkbEvAddSheet).
  function pkbEvCands(tb) {
    const me = String(tb.id), myLead = pkbRawLead(me), ng = !!packLinkForBase(me, true).newGen, meLeads = pkbCanLead(tb);
    return tables.filter((x) => {
      const id = String(x.id);
      if (id === me || id.startsWith("my-") || id.startsWith("ng-")) return false;
      const xl = packLinkForBase(id, true);
      if (xl.trigger || xl.template || packStackInfo(xl.reset)) return false; // these have no "Same dates as" / are templates
      if (id === myLead || pkbFolCount(id)) return meLeads && !!xl.newGen === ng; // swap: same kind only
      return packDateWithChoices(x).some((y) => String(y.id) === me); // same kind, no loop
    }).sort((a, b) => pkbOrder(a.title, b.title));
  }
  function pkbEvAddSheet(tb) {
    const me = String(tb.id), cands = pkbEvCands(tb);
    const raw = (id) => String(((PACK_LINKS || {})[String(id)] || {}).dateWith || "");
    const tick = new Set(cands.filter((x) => raw(x.id) === me).map((x) => String(x.id)));
    let m = document.getElementById("pkbEvSheet");
    if (m) m.remove();
    m = document.createElement("div"); m.id = "pkbEvSheet"; m.className = "modal-overlay adm-sheet-wrap gs-wrap pkb-eas-ov"; document.body.appendChild(m);
    const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); close(); } };
    const close = () => { m.remove(); document.removeEventListener("keydown", onKey, true); };
    document.addEventListener("keydown", onKey, true);
    const rows = cands.map((x) => {
      const id = String(x.id), xl = packLinkFor(id), other = raw(id) && raw(id) !== me ? tables.find((y) => String(y.id) === raw(id)) : null, nf = pkbFolCount(id);
      const line = nf ? t(nf === 1 ? "pkb_ev_swap1" : "pkb_ev_swap").replace("{n}", nf).replace("{pack}", tb.title || "") : other ? t("pkb_ev_follows").replace("{pack}", other.title || "") : pkbResetText(xl.reset) || "";
      return `<label class="pkb-eas-r"><input type="checkbox" data-pkbeas="${esc(id)}" ${tick.has(id) ? "checked" : ""} /><span class="pkb-ic">${pkbIcon(x, xl) || "&#127873;"}</span><span class="pkb-eas-m"><b>${esc(x.title || "")}</b><small>${esc(line)}</small></span></label>`;
    }).join("");
    m.innerHTML = `<div class="modal-box adm-sheet gs-box pkb-eas" role="dialog" aria-modal="true" aria-label="${esc(t("pkb_ev_add"))}">
      <div class="gs-head"><span class="pkb-eas-t"><b>${esc(t("pkb_ev_add"))}</b><small>${esc(t("pkb_ev_add_sub").replace("{pack}", tb.title || ""))}</small></span>${closeXHtml("data-pkbeasx")}</div>
      <div class="pkb-eas-list">${rows || `<p class="meta">${esc(t("pkb_ev_add_none"))}</p>`}</div>
      <div class="pkb-eas-foot"><button type="button" class="btn ghost" data-pkbeasx>${esc(t("cancel"))}</button><button type="button" class="btn" data-pkbeasok>${esc(t("pkb_ev_add_done"))}</button></div>
    </div>`;
    m.addEventListener("click", (e) => {
      if (e.target === m || e.target.closest("[data-pkbeasx]")) { close(); return; }
      if (!e.target.closest("[data-pkbeasok]")) return;
      const lnk = (id) => (PACK_LINKS[id] = PACK_LINKS[id] || { pages: [], priceCol: 0, cols: {} });
      const boxes = [...m.querySelectorAll("[data-pkbeas]")];
      // unticked: leave the event (only packs that followed this one)
      boxes.forEach((c) => { const id = c.dataset.pkbeas; if (!c.checked && tick.has(id) && raw(id) === me) delete PACK_LINKS[id].dateWith; });
      const picked = boxes.filter((c) => c.checked).map((c) => c.dataset.pkbeas);
      // A picked leader (this pack's own, or one of other packs): its followers
      // move to this pack too, and its event name when this pack has none.
      const swaps = picked.filter((id) => id === raw(me) || pkbFolCount(id));
      const swapFols = swaps.map((id) => tables.map((y) => String(y.id)).filter((y) => y !== me && y !== id && raw(y) === id));
      picked.forEach((id) => { lnk(id).dateWith = me; });
      swaps.forEach((id, k) => {
        swapFols[k].forEach((y) => { lnk(y).dateWith = me; });
        const nm = PACK_LINKS[id].eventName;
        if (nm) { if (!lnk(me).eventName) PACK_LINKS[me].eventName = nm; delete PACK_LINKS[id].eventName; }
      });
      // A pack that others follow leads: it follows nobody (no chains or loops).
      if (raw(me) && tables.some((y) => String(y.id) !== me && raw(y.id) === me)) delete PACK_LINKS[me].dateWith;
      close();
      PACK_PLAN_CACHE.clear(); PACK_EARLIEST_CACHE.clear(); PACK_TABLES_CACHE = PACK_TABLES_STASH = null;
      savePackLinks();
      renderAll(); // the window (and the list behind it) shows the new event
      const box = listEl.querySelector(".pkb-panel .pkb-evl");
      if (box) box.scrollIntoView({ block: "center" });
    });
  }
  function packDateWithRowHtml(tb, preset) {
    const raw = ((PACK_LINKS || {})[String(tb.id)] || {}).dateWith || "";
    if (preset === "stack" || preset === "trigger") return raw ? `<input type="hidden" data-pkdatewith value="${esc(raw)}" />` : "";
    // A to Z so a pack is easy to find
    const opts = packDateWithChoices(tb).sort((x, y) => (typeof pkbOrder === "function" ? pkbOrder(x.title, y.title) : String(x.title || "").localeCompare(String(y.title || ""), undefined, { numeric: true, sensitivity: "base" })));
    const lead = packDateLeaderShown(tb.id);
    const leadTb = lead ? tables.find((x) => String(x.id) === lead) : null;
    // A saved link to a pack of the other kind (New Gen vs normal) is ignored,
    // so the box says "its own dates" (the next pick replaces it).
    const otherKind = raw && tables.some((x) => String(x.id) === raw) && packIsNewGen((PACK_LINKS || {})[raw]) !== packIsNewGen((PACK_LINKS || {})[String(tb.id)]);
    const has = otherKind || opts.some((x) => String(x.id) === raw);
    return `<div class="bset-row pkdw-row"><span class="bset-l">${esc(t("pk_date_with"))}<small>${esc(t("pk_date_with_desc"))}</small></span><span class="bset-c"><select data-pkdatewith class="keep-w pkdw-sel">
        <option value="">${esc(t("pk_date_with_none"))}</option>
        ${raw && !has ? `<option value="${esc(raw)}" selected>${esc(t("pk_date_with_missing"))}</option>` : ""}
        ${opts.map((x) => `<option value="${esc(String(x.id))}" ${String(x.id) === raw ? "selected" : ""}>${esc(x.title || "")}</option>`).join("")}
      </select></span></div>
      <div class="pkdw-note" data-pkdwnote ${lead ? "" : "hidden"}>&#128279; ${esc(t("pk_date_follows").replace("{pack}", leadTb ? leadTb.title || "" : ""))}</div>`;
  }
  function packLinkEditorFullHtml(tb) {
    // The pack's own settings (a pack that follows another's dates still
    // shows and saves its own reset here; see packDateLeader).
    const link = packLinkFor(tb.id, true);
    const resOpts = (selected) =>
      `<option value="">${esc(t("pack_col_unused"))}</option>` +
      packResourceChoices(selected).map((n) => `<option value="${esc(n)}" ${n === selected ? "selected" : ""}>${esc(materialDisplayName(n))}</option>`).join("");
    const nPages = packGroupsChecked(link.pages);
    // S1: settings as short sections; the longer
    // explanations open under an ⓘ (data-pksinfo, wired once on the list).
    const info = (k) => `<button type="button" class="pks-i" data-pksinfo="${k}" aria-label="info">i</button>`;
    const infoText = (k, txt) => `<div class="pks-info" data-pksinfotext="${k}" hidden>${txt}</div>`;
    const cap = (x) => (x ? x.charAt(0).toUpperCase() + x.slice(1) : x);
    return `
      <details class="pack-link pks" data-packlink="${esc(tb.id)}">
        <summary class="pks-sum">${esc(packLinkSummaryText(nPages))}</summary>
        ${Object.values(packEffectiveCols(tb)).filter((r, i, a) => PACK_BUNDLE_NOTES[r] && a.indexOf(r) === i).map((r) => `<div class="pks-notes"><span class="pks-note">${pkItemIcon(r) ? `<img src="${esc(pkItemIcon(r))}" alt="" />` : ""}${esc(materialDisplayName(r))} ${info("n" + esc(r))}</span>${infoText("n" + esc(r), `${esc(materialDisplayName(r))}: ${esc(PACK_BUNDLE_NOTES[r])}`)}</div>`).join("")}
        <div class="bset-sec"><b>${esc(t("pack_used_for"))} ${info("used")}</b><span class="bset-tag" data-pknonetag ${nPages ? "hidden" : ""}>${esc(t("pk_none_picked"))}</span></div>
        ${infoText("used", esc(t("pack_used_for_desc")))}
        <div class="pks-chips">
          ${PACK_PAGE_GROUPS.map((g) => `<label class="pks-chip"><input type="checkbox" data-packgroup="${esc(g.key)}" ${g.pages.some((k) => link.pages.includes(k)) ? "checked" : ""} /><span>${esc(packGroupLabel(g))}</span></label>`).join("")}
        </div>
        ${(() => {
          // Columns whose name isn't an item: say which item they give.
          const rows = tb.columns.map((c, ci) => {
            // Price column, Gems, and any column already named after a
            // resource are sorted out by the header dropdown itself.
            if (ci === link.priceCol || packIsNonResourceColumn(c) || packResourceByName(c)) return "";
            return `<div class="bset-row"><span class="bset-l">${esc(c || "#" + (ci + 1))}</span><span class="bset-c"><select data-packcol="${ci}">${resOpts((link.cols || {})[ci])}</select></span></div>`;
          }).join("");
          return rows.trim() ? `<div class="bset-sec"><b>${esc(t("pk_sec_columns"))}</b></div>${rows}` : "";
        })()}
        ${(() => {
          // Q1: how is it bought?  Q2 (tiers only): what does one tier give?
          const how = link.pickCols > 0 ? "picks" : link.choice ? "choice" : link.sequential ? "tiers" : "any";
          const gives = !link.sequential ? "all" : (link.colOptions && !link.linkSet) ? (link.lockOption ? "one_locked" : "one_each") : "all";
          const seg = (val, label) => `<label class="pks-seg-o"><input type="radio" name="pkhow-${esc(tb.id)}" data-pkhow="${val}" ${how === val ? "checked" : ""} /><span>${esc(label)}</span></label>`;
          const radio = (name, val, cur, label, desc, attr) => `
            <label style="display:flex; align-items:flex-start; gap:8px; cursor:pointer; font-size:12px;">
              <input type="radio" name="${name}-${esc(tb.id)}" ${attr}="${val}" ${cur === val ? "checked" : ""} style="flex-shrink:0; margin-top:2px;" />
              <span style="flex:1 1 0; min-width:0;"><span style="font-weight:600;">${esc(label)}</span>${desc ? `<br><span class="meta" style="font-size:10.5px;">${esc(desc)}</span>` : ""}</span>
            </label>`;
          const howInfo = [["pk_any", "pk_any_desc"], ["pk_tiers", "pk_tiers_desc"]].concat(how === "choice" ? [["pk_choice", "pk_choice_desc"]] : []).concat([["pk_picks", "pk_picks_desc"]]).map(([a, b]) => `<b>${esc(t(a))}</b>: ${esc(t(b))}`).join("<br>");
          return `<div data-pkhowwrap style="display:${link.linkSet ? "none" : "block"};"><div class="bset-sec"><b>${esc(t("pk_sec_buying"))} ${info("how")}</b></div>
          ${infoText("how", howInfo)}
          <div class="pks-seg">${seg("any", t("pk_any_s"))}${seg("tiers", t("pk_tiers_s"))}${how === "choice" ? seg("choice", t("pk_choice_s")) : ""}${seg("picks", t("pk_picks_s"))}</div>
          <div data-pkpickswrap style="display:${how === "picks" ? "block" : "none"};">
            <div class="bset-row"><span class="bset-l">${esc(t("pk_picks_count"))}</span><span class="bset-c"><span class="pks-step"><button type="button" class="btn small ghost" data-pksstep="-1">&minus;</button><input type="number" min="1" max="6" step="1" class="keep-w" data-pkpicks value="${link.pickCols || 3}" /><button type="button" class="btn small ghost" data-pksstep="1">+</button></span></span></div>
            <label class="bset-row" style="cursor:pointer;"><span class="bset-l">${esc(t("pk_picks_order"))} ${info("order")}<small>${esc(t("pk_picks_order_desc"))}</small></span><input type="checkbox" class="bset-sw" data-pkpickorder ${link.pickOrder ? "checked" : ""} /></label>
            ${infoText("order", esc(t("pk_picks_order_off")))}
          </div>
          <div data-pkgiveswrap style="display:${how === "tiers" && gives !== "all" ? "block" : "none"}; margin:0 0 12px 24px; padding-inline-start:10px; border-inline-start:2px solid var(--line);">
            <div class="meta" style="font-size:11px; font-weight:600; margin-bottom:6px;">${esc(t("pk_q2"))}</div>
            <div style="display:flex; flex-direction:column; gap:6px;">
              ${radio("pkgives", "all", gives, t("pk_all"), t("pk_all_desc"), "data-pkgives")}
              ${gives === "one_each" ? radio("pkgives", "one_each", gives, t("pk_one_each"), t("pk_one_each_desc"), "data-pkgives") : ""}
              ${gives === "one_locked" ? radio("pkgives", "one_locked", gives, t("pk_one_locked"), t("pk_one_locked_desc"), "data-pkgives") : ""}
            </div>
          </div></div>`;
        })()}
        ${(() => {
          const r = link.reset;
          const preset = link.trigger ? "trigger" : packStackInfo(r) ? "stack" : typeof r === "number" ? (PACK_RESET_PRESETS.find((p) => p.days === r) || { key: "custom" }).key : r;
          return `
        <div class="bset-sec"><b>${esc(t("pk_sec_schedule"))} ${info("reset")}</b></div>
        ${infoText("reset", esc(t("pack_reset_desc")))}
        ${IS_OWNER ? packDateWithRowHtml(tb, preset) : ""}
        ${IS_OWNER && packIsNewGen((PACK_LINKS || {})[String(tb.id)]) ? (() => {
          // New Gen pack: how many days after the new heroes it starts (its
          // followers take the leader's; hidden while it follows another pack).
          const own = packNgAfterOf(tb.id), v = own != null ? own : packNewGenOffset(tb.id);
          return `<div class="bset-row" data-pkngafterrow ${packDateLeaderShown(tb.id) ? "hidden" : ""}><span class="bset-l">${esc(t("pk_ng_after"))}<small>${esc(t("pk_ng_after_desc"))}</small></span><span class="bset-c"><input type="number" min="0" step="1" class="keep-w" data-pkngafter value="${esc(String(v))}" style="width:64px;" /><span class="meta">${esc(t("pack_lasts_days"))}</span></span></div>`;
        })() : ""}
        <div class="bset-row" data-pkresetrow ${packDateLeaderShown(tb.id) ? "hidden" : ""}><span class="bset-l">${esc(t("pack_reset_every"))}</span><span class="bset-c">
            <select data-packreset>
              ${preset === "unlimited" ? `<option value="unlimited" selected>${esc(t("pack_reset_unlimited"))}</option>` : ""}
              ${preset === "once" ? `<option value="once" selected>${esc(t("pack_reset_once"))}</option>` : ""}
              ${PACK_RESET_PRESETS.map((p) => `<option value="${p.key}" ${preset === p.key ? "selected" : ""}>${esc(t("pack_reset_" + p.key))}</option>`).join("")}
              <option value="custom" ${preset === "custom" ? "selected" : ""}>${esc(t("pack_reset_custom"))}</option>
              <option value="stack" ${preset === "stack" ? "selected" : ""}>${esc(t("pack_reset_stack"))}</option>
              <option value="trigger" ${preset === "trigger" ? "selected" : ""}>${esc(t("pk_trigger_option"))}</option>
            </select>
            <input type="number" min="1" step="1" class="keep-w" data-packstackcap value="${link.stackCap}" style="width:64px; font-size:12px; padding:3px 6px; ${preset === "stack" ? "" : "display:none;"}" />
            <span class="meta" data-packstackcaplabel style="font-size:11px; ${preset === "stack" ? "" : "display:none;"}">${esc(t("pack_stack_max"))}</span>
            <input type="number" min="1" step="1" class="keep-w" data-packresetdays value="${typeof r === "number" ? r : 7}" style="width:56px; font-size:12px; padding:3px 6px; ${preset === "custom" ? "" : "display:none;"}" />
            <span class="meta" data-packresetdayslabel style="font-size:11px; ${preset === "custom" ? "" : "display:none;"}">${esc(t("pack_days_short_long"))}</span>
        </span></div>
        <div class="bset-row pks-opt" data-pkanchorrow ${packDateLeaderShown(tb.id) ? "hidden" : ""}><span class="bset-l" data-packanchorlabel style="${typeof r === "number" ? "" : "display:none;"}">${esc(t("pack_next_on"))}</span><span class="bset-c"><input type="date" data-packanchor value="${esc(link.resetDay || "")}" style="${typeof r === "number" ? "" : "display:none;"}" /></span></div>
        <div class="bset-row pks-opt pks-nw" data-pkwindowrow ${packDateLeaderShown(tb.id) ? "hidden" : ""}><span class="bset-l" data-packwindowlabel style="${typeof r === "number" ? "" : "display:none;"}">${esc(cap(t("pack_lasts_label")))}<small>${esc(t("pack_lasts_hint"))}</small></span><span class="bset-c"><input type="number" min="0" step="1" class="keep-w" data-packwindow value="${link.window || ""}" placeholder="0" title="${esc(t("pack_lasts_hint"))}" style="width:64px; ${typeof r === "number" ? "" : "display:none;"}" /><span class="meta" data-packwindowlabel2 style="${typeof r === "number" ? "" : "display:none;"}">${esc(t("pack_lasts_days"))}</span></span></div>
        <label class="bset-row" style="${typeof r === "number" && !link.sequential && link.buys > 1 ? "" : "display:none;"}" data-packbuyswrap>
            <span class="bset-l">${esc(t("pack_buys_per_reset"))}</span>
            <span class="bset-c"><input type="number" min="1" step="1" data-packbuys value="${link.buys}" style="width:64px;" /></span>
        </label>
        ${(() => {
          const tr = link.trigger || { expert: "", levels: {}, days: 1 };
          const experts = expertKeysAll();
          const priceOf = (ri) => { const n = packParseNum(((tb.rows || [])[ri] || {}).cells?.[link.priceCol]); return n ? packFmtMoney(n, link.currency) : `#${ri + 1}`; };
          return `<div data-pktrigwrap style="display:${preset === "trigger" ? "block" : "none"}; margin:0 0 10px; padding:10px; border:1px dashed var(--good); border-radius:10px; font-size:12px;">
            <div style="display:flex; flex-wrap:wrap; gap:8px; align-items:center;">
              <span class="meta">${esc(t("pk_trigger_expert"))}</span>
              <select data-pktrigexpert class="keep-w" style="font-size:12px;">${experts.map((k) => `<option value="${esc(k)}" ${k === tr.expert ? "selected" : ""}>${esc(dataName(k))}</option>`).join("")}</select>
              <span class="meta">${esc(t("pk_trigger_lasts"))}</span>
              <input type="number" min="1" step="1" class="keep-w" data-pktrigdays value="${tr.days || 1}" style="width:52px; font-size:12px; padding:3px 6px;" />
              <span class="meta">${esc(t("pk_daily_days"))}</span>
            </div>
            <div style="display:flex; flex-direction:column; gap:4px; margin-top:8px;">
              ${(tb.rows || []).map((_, ri) => `<label style="display:flex; align-items:center; gap:8px;"><span style="min-width:70px; font-weight:600;">${esc(priceOf(ri))}</span><span class="meta">${esc(t("pk_trigger_at_level"))}</span><input type="number" min="1" step="1" class="keep-w" data-pktriglevel="${ri}" value="${esc((tr.levels || {})[ri] || "")}" style="width:60px; font-size:12px; padding:3px 6px;" /></label>`).join("")}
            </div>
            <div class="meta" style="font-size:10.5px; margin-top:6px;">${esc(t("pk_trigger_desc"))}</div>
          </div>`;
        })()}
        <p class="desc" data-packstackhint style="font-size:10.5px; margin:0 0 6px; color:var(--ice); ${preset === "stack" ? "" : "display:none;"}">${esc(t("pack_stack_hint"))}</p>
        ${IS_OWNER ? `<div data-pkownwrap style="display:${preset === "stack" ? "block" : "none"}; margin:0 0 10px; padding:10px; border:1px solid var(--ice); border-radius:10px; font-size:12px;">
          <div style="font-size:10.5px; font-weight:700; letter-spacing:.04em; text-transform:uppercase; color:var(--ice);">${esc(t("pk_own_card_title"))}</div>
          <div style="display:flex; flex-wrap:wrap; gap:8px 12px; align-items:center; margin-top:8px;">
            <label style="display:flex; align-items:center; gap:6px;"><span class="meta">${esc(t("pk_active_label"))} <span style="font-size:10px;">(${esc(t("pk_active_hint"))})</span></span><input type="number" min="0" step="1" class="keep-w" data-ownactive value="${packActiveDays(tb.id) || 0}" style="width:64px; font-size:12px; padding:3px 6px;" /> ${esc(t("pk_days_unit"))}</label>
          </div>
          <div data-ownnote style="font-size:10.5px; color:var(--good); margin-top:6px;">${esc(packActiveNoteText(tb.id))}</div>
          <div class="meta" style="font-size:10.5px; margin-top:4px;">${esc(t("pk_own_card_desc"))}</div>
        </div>` : ""}
        ${IS_OWNER ? `<div data-pkvisitorwrap>
          <div class="bset-sec"><b>${esc(t("pk_sec_visitors"))}</b></div>
          <label class="bset-row" style="cursor:pointer;"><span class="bset-l"><span data-pkvisitordatelabel>${esc(preset === "stack" ? t("pk_visitor_start") : t("pk_visitor_date"))}</span><small data-pkvisitordatedesc>${esc(preset === "stack" ? t("pk_visitor_start_desc") : t("pk_visitor_date_desc"))}</small></span><input type="checkbox" class="bset-sw" data-pkvisitordate ${link.visitorDate ? "checked" : ""} /></label>
          <label class="bset-row" style="cursor:pointer;"><span class="bset-l">${esc(t("pk_hide_visitors"))}</span><input type="checkbox" class="bset-sw" data-pkhidevisitors ${link.hideVisitors ? "checked" : ""} /></label>
        </div>` : ""}`;
        })()}
        ${(() => {
          const body = `
        ${(() => {
          // Daily-reward cards: one purchase, then a smaller reward every day.
          const d = link.daily;
          const cols = (tb.columns || []).map((c, ci) => ({ c, ci })).filter(({ c, ci }) => ci !== link.priceCol && !packIsNonResourceColumn(c));
          if (!cols.length) return "";
          return `<details class="pks-more" data-pkdailywrap ${d ? "open" : ""}>
            <summary>${esc(t("pk_daily_title"))}${d ? ` (${d.days} ${esc(t("pk_daily_days"))})` : ""}</summary>
            <p class="desc" style="font-size:10.5px; margin:6px 0 8px;">${esc(t("pk_daily_desc"))}</p>
            <label style="display:flex; align-items:center; gap:6px; margin-bottom:8px;">${esc(t("pk_daily_for"))} <input type="number" min="1" max="365" data-pkdailydays value="${d ? d.days : 7}" style="width:64px; font-size:12px; padding:3px 6px;" /> ${esc(t("pk_daily_days"))}</label>
            <div style="display:flex; flex-direction:column; gap:5px; padding-inline-start:4px;">
              ${cols.map(({ c, ci }) => `<label style="display:flex; align-items:center; gap:6px; cursor:pointer;"><input type="checkbox" data-pkdailycol="${ci}" ${d && d.cols.includes(ci) ? "checked" : ""} style="flex-shrink:0;" /><span>${esc(materialDisplayName(packEffectiveCols(tb)[ci] || c || "#" + (ci + 1)))} <span class="meta" style="font-size:10px;">${esc(t("pk_daily_per_day"))}</span></span></label>`).join("")}
            </div>
          </details>`;
        })()}
        ${(() => {
          // Same pack, several tables (Classic / Sublime / Exquisite...):
          // tick the partner tables; each step then picks one of them.
          const others = tables.filter((x) => x.id !== tb.id);
          if (!others.length) return "";
          const setId = link.linkSet;
          const members = setId ? packLinkSetMembers(setId).map((x) => String(x.id)) : [];
          const mode = link.lockOption ? "locked" : "each";
          return `<details class="pks-more" data-pksamewrap ${setId ? "open" : ""}>
            <summary>${esc(t("pk_same_title"))}${members.length > 1 ? ` (${members.length})` : ""}</summary>
            <p class="desc" style="font-size:10.5px; margin:6px 0 8px;">${esc(t("pk_same_desc"))}</p>
            <div style="display:flex; flex-direction:column; gap:5px; max-height:180px; overflow:auto; padding-inline-start:4px;">
              ${others.map((x) => `<label style="display:flex; align-items:center; gap:6px; cursor:pointer;"><input type="checkbox" data-pksame="${esc(x.id)}" ${members.includes(String(x.id)) ? "checked" : ""} style="flex-shrink:0;" /><span>${esc(x.title || "")}</span></label>`).join("")}
            </div>
            <div data-pksamemode style="display:${members.length > 1 ? "flex" : "none"}; flex-direction:column; gap:6px; margin-top:10px;">
              <label style="display:flex; align-items:center; gap:8px; cursor:pointer;"><input type="radio" name="pksamemode-${esc(tb.id)}" data-pksamemode="each" ${mode === "each" ? "checked" : ""} /><span>${esc(t("pk_same_each"))}</span></label>
              ${mode === "locked" ? `<label style="display:flex; align-items:center; gap:8px; cursor:pointer;"><input type="radio" name="pksamemode-${esc(tb.id)}" data-pksamemode="locked" checked /><span>${esc(t("pk_same_locked"))}</span></label>` : ""}
              <label style="display:flex; align-items:flex-start; gap:8px; cursor:pointer; margin-top:4px;"><input type="checkbox" data-pksamefree ${link.freeSteps ? "checked" : ""} style="flex-shrink:0; margin-top:2px;" /><span><span>${esc(t("pk_same_free"))}</span><br><span class="meta" style="font-size:10.5px;">${esc(t("pk_same_free_desc"))}</span></span></label>
            </div>
          </details>`;
        })()}
`;
          return body.trim() ? `<div class="bset-sec"><b>${esc(t("pk_sec_more"))}</b></div>${body}` : "";
        })()}
      </details>`;
  }
  function wirePackLinkEditors(boxes, root = listEl) {
    if (!boxes) {
      // Closed editors are built on first open, then wired like the rest.
      root.querySelectorAll("[data-packlinklazy]").forEach((shell) => shell.addEventListener("toggle", () => {
        if (!shell.open || !shell.isConnected) return;
        const tb = tables.find((x) => String(x.id) === shell.dataset.packlink);
        if (!tb) return;
        const tmp = document.createElement("div");
        tmp.innerHTML = packLinkEditorFullHtml(tb);
        const full = tmp.querySelector("[data-packlink]");
        full.open = true;
        shell.replaceWith(full);
        wirePackLinkEditors([full]);
      }));
    }
    (boxes || root.querySelectorAll("[data-packlink]:not([data-packlinklazy])")).forEach((box) => {
      const id = box.dataset.packlink;
      const current = () => {
        PACK_LINKS[id] = PACK_LINKS[id] || { pages: [], priceCol: 0, cols: {} };
        return PACK_LINKS[id];
      };
      box.querySelectorAll("[data-packgroup]").forEach((cb) => {
        cb.addEventListener("change", async () => {
          const l = current();
          const g = PACK_PAGE_GROUPS.find((x) => x.key === cb.dataset.packgroup);
          l.pages = Array.isArray(l.pages) ? l.pages : [];
          if (cb.checked) g.pages.forEach((k) => { if (!l.pages.includes(k)) l.pages.push(k); });
          else l.pages = l.pages.filter((k) => !g.pages.includes(k));
          await savePackLinks();
          const sum = box.querySelector("summary");
          const n = packGroupsChecked(l.pages);
          if (sum) sum.textContent = packLinkSummaryText(n);
          const none = box.querySelector("[data-pknonetag]");
          if (none) none.hidden = n > 0;
          renderPageTabs();
        });
      });
      // Purchase type questions -> the underlying flags.
      const pick = (attr) => (box.querySelector(`[${attr}]:checked`) || {}).dataset?.[attr.replace("data-", "").replace(/-([a-z])/g, (m, c) => c.toUpperCase())];
      const isLadderKind = () => pick("data-pkhow") === "tiers";
      const applyKind = async () => {
        const l = current();
        const how = pick("data-pkhow"), gives = pick("data-pkgives") || "all";
        l.sequential = how === "tiers";
        l.choice = how === "choice";
        const pw = box.querySelector("[data-pkpickswrap]");
        if (pw) pw.style.display = how === "picks" ? "block" : "none";
        if (how === "picks") {
          l.pickCols = Math.max(1, Math.min(6, Math.round(Number((box.querySelector("[data-pkpicks]") || {}).value) || 3)));
          if ((box.querySelector("[data-pkpickorder]") || {}).checked) l.pickOrder = true; else delete l.pickOrder;
        } else { delete l.pickCols; delete l.pickOrder; }
        const opt = how === "tiers" && gives !== "all";
        l.colOptions = opt;
        if (l.linkSet) { l.sequential = true; l.choice = false; l.colOptions = false; l.option = true; }
        else { l.option = false; l.lockOption = opt && gives === "one_locked"; }
        // The "one column" choices were retired ("Pick options from the columns"
        // covers them); they only still show on an old table that uses them.
        box.querySelector("[data-pkgiveswrap]").style.display = how === "tiers" && box.querySelector('[data-pkgives="one_each"],[data-pkgives="one_locked"]') ? "block" : "none";
        syncResetUi();
        await savePackLinks();
      };
      box.querySelectorAll("[data-pkhow],[data-pkgives],[data-pkpicks],[data-pkpickorder]").forEach((r) => r.addEventListener("change", applyKind));
      // Daily-reward cards.
      const dailyBoxes = [...box.querySelectorAll("[data-pkdailycol]")];
      const applyDaily = async () => {
        const l = current();
        const cols = dailyBoxes.filter((cb) => cb.checked).map((cb) => Number(cb.dataset.pkdailycol));
        const days = Math.max(1, Math.round(Number((box.querySelector("[data-pkdailydays]") || {}).value) || 7));
        if (cols.length) l.daily = { days, cols }; else delete l.daily;
        const sum = box.querySelector("[data-pkdailywrap] summary");
        if (sum) sum.textContent = t("pk_daily_title") + (cols.length ? ` (${days} ${t("pk_daily_days")})` : "");
        await savePackLinks();
        PACK_TABLES_CACHE = PACK_TABLES_STASH = null;
        // Column headers show the "/day ×N" note, so redraw the tables.
        renderAll();
      };
      dailyBoxes.forEach((cb) => cb.addEventListener("change", applyDaily));
      const dailyDays = box.querySelector("[data-pkdailydays]");
      if (dailyDays) dailyDays.addEventListener("change", applyDaily);
      // Same pack, several tables: keep every member's flags in step.
      const sameBoxes = [...box.querySelectorAll("[data-pksame]")];
      const applySame = async () => {
        const l = current();
        const picked = sameBoxes.filter((cb) => cb.checked).map((cb) => cb.dataset.pksame);
        const setId = l.linkSet || String(id);
        const oldMembers = packLinkSetMembers(setId).map((x) => String(x.id)).filter((x) => x !== String(id));
        oldMembers.filter((x) => !picked.includes(x)).forEach((x) => { if (PACK_LINKS[x]) { delete PACK_LINKS[x].linkSet; PACK_LINKS[x].option = false; } });
        const lockedMode = (box.querySelector("[data-pksamemode]:checked") || {}).dataset?.pksamemode === "locked";
        const freeMode = !!(box.querySelector("[data-pksamefree]") || {}).checked;
        if (picked.length) {
          [String(id), ...picked].forEach((x) => {
            PACK_LINKS[x] = PACK_LINKS[x] || { pages: [], priceCol: 0, cols: {} };
            const m = PACK_LINKS[x];
            m.linkSet = setId; m.sequential = true; m.choice = false; m.colOptions = false; m.option = true; m.lockOption = lockedMode; m.freeSteps = freeMode;
          });
        } else {
          delete l.linkSet; l.option = false;
        }
        const modeWrap = box.querySelector("[data-pksamemode]");
        if (modeWrap) modeWrap.style.display = picked.length ? "flex" : "none";
        // Linked = bought in steps; the purchase-type questions step aside.
        const howWrap = box.querySelector("[data-pkhowwrap]");
        if (howWrap) howWrap.style.display = picked.length ? "none" : "block";
        const tiersRadio = box.querySelector('[data-pkhow="tiers"]');
        if (picked.length && tiersRadio) tiersRadio.checked = true;
        syncResetUi();
        const sum = box.querySelector("[data-pksamewrap] summary");
        if (sum) sum.textContent = t("pk_same_title") + (picked.length ? ` (${picked.length + 1})` : "");
        await savePackLinks();
      };
      sameBoxes.forEach((cb) => cb.addEventListener("change", applySame));
      box.querySelectorAll("[data-pksamemode]").forEach((r) => r.addEventListener("change", applySame));
      const freeBox = box.querySelector("[data-pksamefree]");
      if (freeBox) freeBox.addEventListener("change", applySame);
      const resetSel = box.querySelector("[data-packreset]");
      const resetDays = box.querySelector("[data-packresetdays]");
      const resetDaysLabel = box.querySelector("[data-packresetdayslabel]");
      const buysWrap = box.querySelector("[data-packbuyswrap]");
      const buysIn = box.querySelector("[data-packbuys]");
      const anchorIn = box.querySelector("[data-packanchor]");
      const anchorLabel = box.querySelector("[data-packanchorlabel]");
      const stackCapIn = box.querySelector("[data-packstackcap]");
      const syncResetUi = () => {
        const stack = resetSel.value === "stack";
        const vdl = box.querySelector("[data-pkvisitordatelabel]"), vdd = box.querySelector("[data-pkvisitordatedesc]");
        const ownWrap = box.querySelector("[data-pkownwrap]"); if (ownWrap) ownWrap.style.display = stack ? "block" : "none";
        if (vdl) vdl.textContent = stack ? t("pk_visitor_start") : t("pk_visitor_date");
        if (vdd) vdd.textContent = stack ? t("pk_visitor_start_desc") : t("pk_visitor_date_desc");
        [stackCapIn, box.querySelector("[data-packstackcaplabel]"), box.querySelector("[data-packstackhint]")].forEach((el) => { if (el) el.style.display = stack ? "" : "none"; });
        const custom = resetSel.value === "custom";
        resetDays.style.display = custom ? "" : "none";
        resetDaysLabel.style.display = custom ? "" : "none";
        const isNumberReset = custom || PACK_RESET_PRESETS.some((p) => p.key === resetSel.value);
        anchorIn.style.display = isNumberReset ? "" : "none";
        anchorLabel.style.display = isNumberReset ? "" : "none";
        [box.querySelector("[data-packwindow]"), box.querySelector("[data-packwindowlabel]"), box.querySelector("[data-packwindowlabel2]")].forEach((el) => { if (el) el.style.display = isNumberReset ? "" : "none"; });
        const isNumber = custom || PACK_RESET_PRESETS.some((p) => p.key === resetSel.value);
        // "Buys per reset" was retired (always 1; the Max column covers repeats).
        // It only still shows on a table that already has more than 1.
        buysWrap.style.display = isNumber && !isLadderKind() && Number(buysIn.value) > 1 ? "" : "none";
        if (buysWrap.style.display === "" && buysWrap.querySelector("span")) buysWrap.querySelector("span").textContent = pick("data-pkhow") === "choice" ? t("pack_buys_per_reset_choice") : t("pack_buys_per_reset");
      };
      const saveReset = async () => {
        const l = current();
        const v = resetSel.value;
        const trigWrap = box.querySelector("[data-pktrigwrap]");
        if (v === "trigger") {
          l.reset = "once";
          const levels = {};
          box.querySelectorAll("[data-pktriglevel]").forEach((inp) => { const n = Math.round(Number(inp.value)); if (n > 0) levels[inp.dataset.pktriglevel] = n; });
          l.trigger = { expert: box.querySelector("[data-pktrigexpert]").value, levels, days: Math.max(1, Math.round(Number(box.querySelector("[data-pktrigdays]").value) || 1)) };
          l.group = PACK_TRIGGER_GROUP;
          l.sequential = false; l.pickCols = 0; l.choice = false;
          const rm = { ...(l.rowMax || {}) }; box.closest("[data-packtable]").querySelectorAll("tbody tr[data-row]").forEach((tr) => { if (!rm[tr.dataset.row]) rm[tr.dataset.row] = 1; }); l.rowMax = rm;
          if (trigWrap) trigWrap.style.display = "block";
          delete l.resetDay;
          syncResetUi();
          await savePackLinks();
          return;
        }
        if (l.trigger) delete l.trigger;
        if (trigWrap) trigWrap.style.display = "none";
        if (v === "unlimited" || v === "once") l.reset = v;
        else if (v === "stack") { l.reset = "stack"; l.stackCap = Math.max(1, Math.round(Number(stackCapIn.value) || 370)); }
        else if (v === "custom") l.reset = Math.max(1, Math.round(Number(resetDays.value) || 7));
        else l.reset = PACK_RESET_PRESETS.find((p) => p.key === v).days;
        l.buys = Math.max(1, Math.round(Number(buysIn.value) || 1));
        // The anchor date only means something for a repeating pack.
        if (typeof l.reset === "number" && anchorIn.value) l.resetDay = anchorIn.value; else delete l.resetDay;
        const winIn = box.querySelector("[data-packwindow]");
        const winVal = winIn ? Math.max(0, Math.round(Number(winIn.value) || 0)) : 0;
        if (typeof l.reset === "number" && winVal > 0) l.window = winVal; else delete l.window;
        syncResetUi();
        await savePackLinks();
      };
      if (resetSel) resetSel.addEventListener("change", saveReset);
      box.querySelectorAll("[data-pktrigexpert], [data-pktrigdays], [data-pktriglevel]").forEach((el) => el.addEventListener("change", saveReset));
      if (resetDays) resetDays.addEventListener("change", saveReset);
      if (buysIn) buysIn.addEventListener("change", saveReset);
      if (anchorIn) anchorIn.addEventListener("change", saveReset);
      const windowIn = box.querySelector("[data-packwindow]");
      if (windowIn) windowIn.addEventListener("change", saveReset);
      if (stackCapIn) stackCapIn.addEventListener("change", saveReset);
      // New Gen pack: "Starts N days after the new heroes" (`ngAfter`).
      const ngAfterIn = box.querySelector("input[data-pkngafter]");
      if (ngAfterIn) ngAfterIn.addEventListener("change", async () => {
        const l = current();
        const n = Math.round(Number(ngAfterIn.value));
        if (ngAfterIn.value === "" || !Number.isFinite(n)) delete l.ngAfter; else l.ngAfter = Math.max(0, n);
        ngAfterIn.value = String(packNgAfterOf(id) != null ? packNgAfterOf(id) : packNewGenOffset(id));
        PACK_PLAN_CACHE.clear(); PACK_EARLIEST_CACHE.clear(); PACK_TABLES_CACHE = PACK_TABLES_STASH = null;
        if (box.closest(".pkb-panel")) {
          savePackLinks();
          setTimeout(() => {
            renderAll();
            const s = listEl.querySelector(".pkb-panel input[data-pkngafter]");
            if (s) s.scrollIntoView({ block: "center" });
          }, 0);
          return;
        }
        await savePackLinks();
      });
      // "Same dates as": dates only (not a linked set), so only this field changes.
      const dwSel = box.querySelector("select[data-pkdatewith]");
      if (dwSel) dwSel.addEventListener("change", async () => {
        const l = current();
        if (dwSel.value && dwSel.value !== String(id)) {
          // Flat data: follow the chosen pack's own leader,
          // and this pack's followers move to that leader too.
          const to = packDateLeader(dwSel.value) || dwSel.value;
          l.dateWith = to === String(id) ? dwSel.value : to;
          Object.keys(PACK_LINKS || {}).forEach((k) => {
            const y = PACK_LINKS[k];
            if (k !== String(id) && y && String(y.dateWith || "") === String(id)) { if (k === l.dateWith) delete y.dateWith; else y.dateWith = l.dateWith; }
          });
        } else delete l.dateWith;
        PACK_PLAN_CACHE.clear(); PACK_EARLIEST_CACHE.clear(); PACK_TABLES_CACHE = PACK_TABLES_STASH = null;
        // In the pack's window, its event parts (banner / Packs with this event /
        // Event name) follow at once: the window is drawn again.
        if (box.closest(".pkb-panel")) {
          savePackLinks();
          setTimeout(() => {
            renderAll();
            const s = listEl.querySelector(".pkb-panel select[data-pkdatewith]");
            if (s) s.scrollIntoView({ block: "center" });
          }, 0);
          return;
        }
        const lead = packDateLeaderShown(id);
        const leadTb = lead ? tables.find((x) => String(x.id) === lead) : null;
        [box.querySelector("[data-pkresetrow]"), box.querySelector("[data-pkanchorrow]"), box.querySelector("[data-pkwindowrow]"), box.querySelector("[data-pkngafterrow]")].forEach((el) => { if (el) el.hidden = !!lead; });
        const note = box.querySelector("[data-pkdwnote]");
        if (note) { note.hidden = !lead; note.textContent = "\u{1F517} " + t("pk_date_follows").replace("{pack}", leadTb ? leadTb.title || "" : ""); }
        // The window's "when" line and the list row follow the new dates.
        const lk = packLinkFor(id), w = pkbWhen(lk, id);
        const panel = box.closest("[data-packtable]");
        const when = panel && panel.querySelector(".pkb-when");
        if (when) when.textContent = [w.text, w.done ? w.doneText : w.on ? t("pkb_on_now") : w.next ? t("pkb_next").replace("{date}", w.next) : ""].filter(Boolean).join(" · ");
        // (The list behind the window, with its event cards, is drawn again when the window closes.)
        await savePackLinks();
      });
      const ownStart = box.querySelector("[data-ownstart]"), ownActive = box.querySelector("[data-ownactive]");
      const saveOwn = async () => {
        const key = String(id);
        // Stacking cards start today: no start date box any more; a saved one is kept but not used.
        if (ownStart) { if (packValidDay(ownStart.value)) MY_PACK_DATES[key] = ownStart.value; else delete MY_PACK_DATES[key]; }
        const n = Math.max(0, Math.floor(Number(ownActive && ownActive.value) || 0));
        if (n) MY_CARDS_ACTIVE[key] = packActiveEntry(n); else delete MY_CARDS_ACTIVE[key];
        PACK_PLAN_CACHE.clear(); PACK_EARLIEST_CACHE.clear();
        if (typeof budgetInvalidate === "function") budgetInvalidate();
        const note = box.querySelector("[data-ownnote]"); if (note) note.textContent = packActiveNoteText(id);
        await Promise.all([saveCalcState("my_pack_dates", MY_PACK_DATES), saveCalcState("my_cards_active", MY_CARDS_ACTIVE)]);
      };
      if (ownStart) ownStart.addEventListener("change", saveOwn);
      if (ownActive) ownActive.addEventListener("change", saveOwn);
      const visDateCb = box.querySelector("[data-pkvisitordate]");
      if (visDateCb) visDateCb.addEventListener("change", async () => {
        const l = current();
        if (visDateCb.checked) l.visitorDate = true; else delete l.visitorDate;
        renderMyPackDates(document.getElementById("packsMyDates"), tables);
        await savePackLinks();
      });
      const hideCb = box.querySelector("[data-pkhidevisitors]");
      if (hideCb) hideCb.addEventListener("change", async () => {
        const l = current();
        if (hideCb.checked) l.hideVisitors = true; else delete l.hideVisitors;
        await savePackLinks();
        PACK_TABLES_CACHE = PACK_TABLES_STASH = null;
        renderAll();
      });
      box.querySelectorAll("[data-packcol]").forEach((sel) => {
        sel.addEventListener("change", async () => {
          const l = current();
          l.cols = l.cols || {};
          if (sel.value) l.cols[sel.dataset.packcol] = sel.value;
          else delete l.cols[sel.dataset.packcol];
          await savePackLinks();
        });
      });
    });
  }

  function wireTable(panels) {
    panels.forEach((panel) => {
      const ti = Number(panel.dataset.packtable);
      const t = tables[ti];

      // Pulls every input's current DOM value (title, column names, cells)
      // back into `t` before any structural change re-renders the table -
      // otherwise typed/auto-scaled values that were only ever in the DOM
      // (not yet saved) would be lost the moment a row/column is added or
      // removed, since renderAll() rebuilds the table HTML from `t` itself.
      function syncFromDom() {
        const titleInput = panel.querySelector("[data-pt-title]");
        if (titleInput) t.title = titleInput.value;
        panel.querySelectorAll("[data-pt-colname]").forEach((inp) => {
          t.columns[Number(inp.dataset.col)] = inp.value;
        });
        panel.querySelectorAll("[data-pt-cell]").forEach((inp) => {
          t.rows[Number(inp.dataset.row)].cells[Number(inp.dataset.col)] = inp.value;
        });
      }

      // Persists the whole table to Supabase - creates it (POST) the first
      // time anything changes on a brand-new table, then PATCHes it from
      // then on. There's no Save button; every edit (typing, adding/removing
      // rows or columns, toggling scale) calls this so nothing is ever lost.
      async function persistTable() {
        if (!IS_OWNER) {
          const all = packMyEdits();
          const mine = {};
          (t.rows || []).forEach((r, ri) => (r.cells || []).forEach((v, ci) => {
            const was = t._orig && t._orig[ri] ? String(t._orig[ri].cells[ci] ?? "") : null;
            if (was !== null && String(v ?? "") !== was) mine[`${ri},${ci}`] = { v: String(v ?? ""), was };
          }));
          if (Object.keys(mine).length) all[String(t.id)] = mine; else delete all[String(t.id)];
          packSaveMyEdits(all);
          return;
        }
        PACK_PLAN_CACHE.clear();
        if (typeof budgetInvalidate === "function") budgetInvalidate();
        try {
          // A new table is created once: changes made while that first save
          // is still running wait for it, then update the created table
          // (two creates would leave a duplicate table behind).
          if (t._creating) await t._creating;
          const payload = { title: t.title.trim() || "Table name here", columns: t.columns, rows: t.rows, sort_order: ti, scale_enabled: t.scale_enabled !== false, updated_at: new Date().toISOString() };
          if (String(t.id).startsWith("new-")) {
            t._creating = sb(`pack_tables`, { method: "POST", body: JSON.stringify({ user_id: USER_ID, ...payload }) }).then(([saved]) => { const was = t.id; t.id = saved.id; pkbRenamed(was, saved.id); });
            try { await t._creating; } finally { t._creating = null; }
          } else {
            await sb(`pack_tables?id=eq.${t.id}`, { method: "PATCH", body: JSON.stringify(payload) });
          }
        } catch (err) {
          toast("Couldn't save that change", true);
        }
      }

      // Live auto-fill. Typing Row 1's Amount cascades the fixed Amount
      // sequence into every row below it. Typing ANY of Row 1's cells
      // (Amount or any other column, including a newly-added #1/#2, etc.)
      // recomputes ratios and re-fills every row - otherwise a column added
      // after other rows already had amounts would never pick up a ratio
      // until the Amount cell happened to be retyped. Gems always fills
      // (fixed universal price point); the ratio fill for every other
      // column only runs when Scale is on for tables that actually follow
      // a fixed proportional relationship.
      // The totals row follows every keystroke (and every auto-fill), so
      // it never waits for a re-render to catch up.
      const refreshTotals = () => refreshTotalsIn(panel, t);
      panel.addEventListener("input", (e) => {
        const cell = e.target.closest("[data-pt-cell]");
        if (!cell) return;
        if (cell.dataset.row === "0" && cell.dataset.col === "0") applyAmountSequence(panel, t);
        if (cell.dataset.col === "0") applyGemsLookup(panel, t);
        if (t.scale_enabled !== false && (cell.dataset.col === "0" || cell.dataset.row === "0")) applyRatioScale(panel, t);
        refreshTotals();
      });
      panel.addEventListener("change", (e) => { if (e.target.closest("[data-pt-cell]")) refreshTotals(); });

      // Persist on blur (change), not every keystroke - covers title,
      // column names, and cell edits (including whatever applyScale just
      // filled in programmatically, since syncFromDom re-reads the DOM).
      // A typed quantity is rounded up as soon as you leave the field, so
      // what's stored matches what's shown. The price column is left alone.
      // Typed values are kept exactly as typed (no reformatting on blur);
      // only the quantity columns' decimals are dropped, since items are whole.
      panel.addEventListener("change", (e) => {
        const cell = e.target.closest("[data-pt-cell]");
        if (!cell) return;
        const ci = Number(cell.dataset.col);
        if (ci === priceColOf(t)) return;
        if (/[.,]\d/.test(cell.value)) { const n = parseNum(cell.value); if (n != null) cell.value = String(Math.trunc(n)); }
      }, true);

      panel.addEventListener("change", (e) => {
        if (e.target.closest("[data-pt-title], [data-pt-colname], [data-pt-cell]")) {
          syncFromDom();
          persistTable();
        }
      });
      panel.querySelectorAll("[data-pt-rowmax]").forEach((inp) => inp.addEventListener("change", async () => {
        if (!IS_OWNER) return; // visitors' own Max is kept in their browser (packMyRowMax)
        if (String(t.id).startsWith("new-")) { syncFromDom(); await persistTable(); }
        await ensurePackLinks();
        const l = (PACK_LINKS[String(t.id)] = PACK_LINKS[String(t.id)] || { pages: [], priceCol: 0, cols: {} });
        l.rowMax = (l.rowMax && typeof l.rowMax === "object") ? l.rowMax : {};
        const v = Math.round(Number(inp.value) || 0);
        if (v > 0) l.rowMax[inp.dataset.row] = v; else delete l.rowMax[inp.dataset.row];
        await savePackLinks();
        PACK_TABLES_CACHE = PACK_TABLES_STASH = null;
      }));
      const groupInput = panel.querySelector("[data-pt-group]");
      if (groupInput) groupInput.addEventListener("change", async () => {
        syncFromDom();
        if (String(t.id).startsWith("new-")) await persistTable(); // needs a real id to link to
        await ensurePackLinks();
        const l = (PACK_LINKS[String(t.id)] = PACK_LINKS[String(t.id)] || { pages: [], priceCol: 0, cols: {} });
        l.group = groupInput.value.trim();
        await savePackLinks();
        PACK_TABLES_CACHE = PACK_TABLES_STASH = null;
        renderAll();
      });

      // Picking a column's name also files it: "$" makes it the price column,
      // a resource assigns that resource, and Gems/custom names assign nothing.
      panel.querySelectorAll("[data-pt-currencypick]").forEach((sel) => {
        sel.addEventListener("change", async () => {
          const ci = Number(sel.dataset.col);
          syncFromDom();
          t.columns[ci] = packCurrencySymbol(sel.value);
          await persistTable();
          await ensurePackLinks();
          const l = (PACK_LINKS[String(t.id)] = PACK_LINKS[String(t.id)] || { pages: [], priceCol: 0, cols: {} });
          l.currency = sel.value;
          l.priceCol = ci;
          delete (l.cols || {})[ci];
          await savePackLinks();
          PACK_TABLES_CACHE = PACK_TABLES_STASH = null;
          renderAll();
        });
      });
      // Delete a column (and its cell in every row); the price column stays.
      async function removeColumn(ci) {
        if (!confirm(window.t("pack_remove_column_confirm").replace("{name}", materialDisplayName(t.columns[ci] || "")))) { renderAll(); return; }
        syncFromDom();
        t.columns.splice(ci, 1);
        t.rows.forEach((r) => r.cells.splice(ci, 1));
        await ensurePackLinks();
        const l0 = PACK_LINKS[String(t.id)];
        if (l0) {
          if (l0.priceCol > ci) l0.priceCol--;
          const cols = {}; Object.entries(l0.cols || {}).forEach(([k, v]) => { const n = Number(k); if (n < ci) cols[n] = v; else if (n > ci) cols[n - 1] = v; }); l0.cols = cols;
          if (l0.daily && Array.isArray(l0.daily.cols)) l0.daily.cols = l0.daily.cols.filter((n) => n !== ci).map((n) => (n > ci ? n - 1 : n));
          await savePackLinks();
        }
        renderAll();
        await persistTable();
      }
      panel.querySelectorAll("[data-pt-gemsdel]").forEach((b) => b.addEventListener("click", () => removeColumn(Number(b.dataset.col))));
      // Move column ci to place cj (dragged in "⇅ Arrange"; cells,
      // price/column settings and daily flags follow it).
      async function moveColumn(ci, cj) {
        if (ci === cj || cj < 0 || cj >= t.columns.length) return;
        syncFromDom();
        const mv = (arr) => { const [x] = arr.splice(ci, 1); arr.splice(cj, 0, x); };
        mv(t.columns);
        t.rows.forEach((r) => { while (r.cells.length < t.columns.length) r.cells.push(""); mv(r.cells); });
        await ensurePackLinks();
        const l0 = PACK_LINKS[String(t.id)];
        if (l0) {
          // Each old column number → its new one.
          const remap = (n) => (n === ci ? cj : ci < cj && n > ci && n <= cj ? n - 1 : cj < ci && n >= cj && n < ci ? n + 1 : n);
          if (typeof l0.priceCol === "number") l0.priceCol = remap(l0.priceCol);
          const cols = {}; Object.entries(l0.cols || {}).forEach(([k, v]) => { cols[remap(Number(k))] = v; }); l0.cols = cols;
          if (l0.daily && Array.isArray(l0.daily.cols)) l0.daily.cols = l0.daily.cols.map(remap);
          await savePackLinks();
        }
        PACK_TABLES_CACHE = PACK_TABLES_STASH = null;
        renderAll();
        await persistTable();
      }
      panel.querySelectorAll("[data-pt-coldrag]").forEach((h) => dragSort(h, {
        axis: "x",
        row: "th.pk-th",
        items: (th) => [...th.parentElement.querySelectorAll("th.pk-th")],
        span: (th) => th.closest("table"),
        place: () => {}, // the table is drawn again in its new order
        done: (th, from, to) => moveColumn(from, to),
      }));
      panel.querySelectorAll("[data-pt-colpick]").forEach((sel) => {
        sel.addEventListener("change", async () => {
          const ci = Number(sel.dataset.col);
          let value = sel.value;
          if (value === "__remove__") { await removeColumn(ci); return; }
          if (value === "__custom__") {
            const typed = prompt(window.t("pack_custom_name_prompt"), t.columns[ci] || "");
            if (typed == null || !typed.trim()) { renderAll(); return; }
            value = typed.trim();
          }
          syncFromDom();
          t.columns[ci] = value;
          await persistTable();
          await ensurePackLinks();
          const l = (PACK_LINKS[String(t.id)] = PACK_LINKS[String(t.id)] || { pages: [], priceCol: 0, cols: {} });
          l.cols = l.cols || {};
          if (packIsNonResourceColumn(value) && value.toLowerCase() !== "gems") l.priceCol = ci;
          // Any earlier manual choice for this column is replaced by the name.
          delete l.cols[ci];
          await savePackLinks();
          PACK_TABLES_CACHE = PACK_TABLES_STASH = null;
          renderAll();
        });
      });

      panel.querySelector("[data-pt-scaletoggle]").addEventListener("change", async (e) => {
        t.scale_enabled = e.target.checked;
        if (t.scale_enabled) {
          // The whole point of turning this on: immediately fill every row
          // from Row 1's ratios (and the Amount sequence itself), not just
          // wait for the next keystroke.
          applyAmountSequence(panel, t);
          applyScale(panel, t);
          syncFromDom();
        }
        await persistTable();
      });

      panel.querySelector("[data-pt-addcol]").addEventListener("click", async () => {
        syncFromDom();
        // Insert before the last column (Gems), not after it, so Gems stays last.
        const insertAt = t.columns.length - 1;
        t.columns.splice(insertAt, 0, `#${t.columns.length - 1}`);
        t.rows.forEach((r) => r.cells.splice(insertAt, 0, ""));
        // Column settings (price column, "Used for", daily flags) move with
        // their columns, like removeColumn/moveColumn do.
        await ensurePackLinks();
        const l0 = PACK_LINKS[String(t.id)];
        if (l0) {
          const shift = (n) => (n >= insertAt ? n + 1 : n);
          if (typeof l0.priceCol === "number") l0.priceCol = shift(l0.priceCol);
          const cols = {}; Object.entries(l0.cols || {}).forEach(([k, v]) => { cols[shift(Number(k))] = v; }); l0.cols = cols;
          if (l0.daily && Array.isArray(l0.daily.cols)) l0.daily.cols = l0.daily.cols.map(shift);
          await savePackLinks();
        }
        renderAll();
        await persistTable();
      });
      panel.querySelector("[data-pt-addrow]").addEventListener("click", async () => {
        syncFromDom();
        t.rows.push(blankRow(t.columns.length));
        const newRowIndex = t.rows.length - 1;
        renderAll();
        // The new row starts blank - immediately fill it (Amount from the
        // fixed sequence, Gems, and ratio columns) instead of waiting for
        // the user to type something in it first. Scoped to just this one
        // row so any other rows you've already hand-edited aren't touched.
        // renderAll() rebuilt the DOM, so re-select the fresh panel rather
        // than using the stale one.
        const freshPanel = listEl.querySelector(`[data-packtable="${ti}"]`);
        if (freshPanel) {
          buildPkBody(freshPanel); // drawn closed (e.g. a new table got its id): fill it anyway, as before
          applyAmountSequence(freshPanel, t, newRowIndex);
          applyGemsLookup(freshPanel, t, newRowIndex);
          if (t.scale_enabled !== false) applyRatioScale(freshPanel, t, newRowIndex);
          freshPanel.querySelectorAll("[data-pt-cell]").forEach((inp) => {
            t.rows[Number(inp.dataset.row)].cells[Number(inp.dataset.col)] = inp.value;
          });
          refreshTotalsIn(freshPanel, t);
        }
        await persistTable();
      });
      // Duplicate: a full copy of the table (cells, columns, title) and of
      // its settings (pages, availability, ladder/choice, row limits,
      // group), placed right after the original.
      // Restore a game-pack table's original columns and numbers.
      const restoreBtn = panel.querySelector("[data-pt-restore]");
      if (restoreBtn) restoreBtn.addEventListener("click", async () => {
        const preset = PACK_PRESET_TABLES.find((pp) => pp.title === t.title);
        if (!preset || !confirm(window.t("pack_restore_confirm"))) return;
        t.columns = preset.columns.slice();
        t.rows = preset.rows.map((r) => ({ ...r, cells: r.cells.slice() }));
        t.scale_enabled = false;
        await persistTable();
        PACK_TABLES_CACHE = PACK_TABLES_STASH = null;
        renderAll();
      });
      panel.querySelector("[data-pt-duplicate]").addEventListener("click", async () => {
        syncFromDom();
        if (String(t.id).startsWith("new-")) await persistTable();
        await ensurePackLinks();
        const fromTemplate = packLinkFor(t.id).template;
        const payload = { title: fromTemplate ? `${String(t.title).replace(/\s*type$/i, "")} (${window.t("mp_mine_suffix")})` : `${t.title} (${window.t("pack_copy_suffix")})`, columns: t.columns.slice(), rows: t.rows.map((r) => ({ ...r, cells: r.cells.slice() })), sort_order: ti + 1, scale_enabled: t.scale_enabled !== false, updated_at: new Date().toISOString() };
        let saved;
        try {
          [saved] = await sb(`pack_tables`, { method: "POST", body: JSON.stringify({ user_id: USER_ID, ...payload }) });
        } catch (err) { toast("Couldn't duplicate table", true); return; }
        const src = PACK_LINKS[String(t.id)];
        if (src) PACK_LINKS[String(saved.id)] = JSON.parse(JSON.stringify(src));
        if (fromTemplate) PACK_LINKS[String(saved.id)] = { ...(PACK_LINKS[String(saved.id)] || { priceCol: 0, cols: {} }), group: PACK_MINE_GROUP, hideVisitors: true, pages: [] };
        await savePackLinks();
        tables.splice(ti + 1, 0, { ...payload, id: saved.id });
        tables.forEach((tb, i) => { tb.sort_order = i; });
        PACK_TABLES_CACHE = PACK_TABLES_STASH = null;
        renderAll();
        await Promise.all(tables.filter((tb) => !String(tb.id).startsWith("new-")).map((tb) => sb(`pack_tables?id=eq.${tb.id}`, { method: "PATCH", body: JSON.stringify({ sort_order: tb.sort_order }) }).catch(() => null)));
      });
      panel.querySelector("[data-pt-delete]").addEventListener("click", async () => {
        if (!confirm(`Delete "${t.title}"? This can't be undone.`)) return;
        if (!String(t.id).startsWith("new-")) {
          try {
            await sb(`pack_tables?id=eq.${t.id}`, { method: "DELETE" });
          } catch (err) {
            toast("Couldn't delete table", true);
            return;
          }
        }
        tables.splice(ti, 1);
        renderAll();
      });
      panel.querySelector("[data-pt-delcollast]").addEventListener("click", async () => {
        syncFromDom();
        // Remove the last removable column - i.e. the one just before Gems
        // (Amount at 0 and Gems at the end are always locked in place).
        const ci = t.columns.length - 2;
        if (ci <= 0) { toast("Nothing left to remove between Amount and Gems", true); return; }
        await ensurePackLinks();
        const l0 = PACK_LINKS[String(t.id)];
        if (l0 && l0.priceCol === ci) { toast("That column is the price column - move it first", true); return; }
        t.columns.splice(ci, 1);
        t.rows.forEach((r) => r.cells.splice(ci, 1));
        // Column settings move with their columns, like removeColumn does.
        if (l0) {
          if (l0.priceCol > ci) l0.priceCol--;
          const cols = {}; Object.entries(l0.cols || {}).forEach(([k, v]) => { const n = Number(k); if (n < ci) cols[n] = v; else if (n > ci) cols[n - 1] = v; }); l0.cols = cols;
          if (l0.daily && Array.isArray(l0.daily.cols)) l0.daily.cols = l0.daily.cols.filter((n) => n !== ci).map((n) => (n > ci ? n - 1 : n));
          await savePackLinks();
        }
        renderAll();
        await persistTable();
      });
      panel.querySelector("[data-pt-delrowlast]").addEventListener("click", async () => {
        syncFromDom();
        if (t.rows.length <= 1) { toast("Keep at least one row (Row 1 sets the scale)", true); return; }
        t.rows.pop();
        renderAll();
        await persistTable();
      });
    });
  }

  if (document.getElementById("packsAddTable")) document.getElementById("packsAddTable").addEventListener("click", async () => {
    tables.unshift({
      id: `new-${Date.now()}`,
      title: "Table name here",
      columns: ["$", "#1", "#2", "Gems"],
      rows: [blankRow(4)],
      sort_order: 0,
      scale_enabled: true,
    });
    // Renumber everyone so the new table is first and existing tables shift
    // down, then persist that new order for any table already saved (so a
    // reload reflects it immediately, not just after each is re-saved).
    tables.forEach((tb, i) => { tb.sort_order = i; });
    pkbOpen(tables[0].id);
    const updates = tables
      .filter((tb) => !String(tb.id).startsWith("new-"))
      .map((tb) => sb(`pack_tables?id=eq.${tb.id}`, { method: "PATCH", body: JSON.stringify({ sort_order: tb.sort_order }) }).catch(() => null));
    await Promise.all(updates);
  });

  // ---- Price strip: USD price points (owner edits) + the viewer's own
  // currency and store prices (saved in their browser). ----
  function renderPriceStrip() {
    const el = document.getElementById("packsPriceStrip");
    if (!el) return;
    const slots = currencyPriceSlots();
    const code = DISPLAY_CURRENCY && DISPLAY_CURRENCY !== "USD" ? DISPLAY_CURRENCY : "";
    const rate = code ? currencyRates()[code] : 0;
    const own = code ? (myStorePrices()[code] || {}) : {};
    // One row per price point:
    // the US $ price (the owner edits it), → your store's price in the chosen
    // currency, ✕ (owner). Same data attributes, so the handlers below are unchanged.
    const curOpts = `<option value="" ${code ? "" : "selected"}>USD $</option>${PACK_CURRENCIES.filter((c) => c.code !== "USD").map((c) => `<option value="${c.code}" ${c.code === code ? "selected" : ""}>${c.code} ${esc(c.symbol)}</option>`).join("")}`;
    el.innerHTML = `
      <div class="panel pp-box">
        <div class="pp-head">
          <h3>${esc(t("price_points_title"))}</h3>
          <select data-pp-currency class="keep-w" aria-label="${esc(t("price_points_cur"))}">${curOpts}</select>
        </div>
        <p class="desc">${esc(t("price_points_desc"))}</p>
        <div class="pp-list">
          <div class="pp-row pp-hd"><span>USD $</span><span></span><span>${code ? esc(code) : ""}</span><span></span></div>
          ${slots.map((sl) => {
            const fallback = code ? (currencySlotPrice(Number(sl), code) ?? (rate > 0 ? Number(sl) * rate : null)) : null;
            return `<div class="pp-row">
              <span class="pp-usd">${IS_OWNER ? `<input type="number" step="0.01" min="0" data-pp-usd="${sl}" value="${sl}" class="keep-w pp-input" aria-label="US $" />` : `<b>$${sl}</b>`}</span>
              <span class="pp-arr" aria-hidden="true">&#8594;</span>
              <span class="pp-own">${code ? `<input type="number" step="any" min="0" data-pp-own="${sl}" value="${own[sl] ?? ""}" placeholder="${fallback != null ? fallback.toFixed(2) : ""}" class="keep-w pp-input${own[sl] ? " mine" : ""}" aria-label="${esc(code)}" />` : `<span class="meta">&mdash;</span>`}</span>
              ${IS_OWNER ? `<button type="button" class="pp-del" data-pp-del="${sl}" title="Remove" aria-label="Remove">&times;</button>` : "<span></span>"}
            </div>`;
          }).join("")}
          ${IS_OWNER ? `<div class="pp-row pp-addrow"><span class="pp-usd"><input type="number" step="0.01" min="0" data-pp-add placeholder="+ ${esc(t("price_points_add"))}" class="keep-w pp-input" aria-label="${esc(t("price_points_add"))}" /></span></div>` : ""}
        </div>
        ${code ? (Object.keys(own).length ? `<button type="button" class="btn small ghost pp-clear" data-pp-clear>${esc(t("price_points_clear"))}</button>` : "") : `<div class="meta pp-pick">${esc(t("price_points_pick"))}</div>`}
      </div>`;
    const refreshPrices = () => { PACK_PLAN_CACHE.clear(); if (typeof budgetInvalidate === "function") budgetInvalidate(); renderPriceStrip(); renderAll(); };
    el.querySelector("[data-pp-currency]").addEventListener("change", (e) => { setDisplayCurrency(e.target.value); setPacksPageCurrency(e.target.value); refreshPrices(); });
    el.querySelectorAll("[data-pp-own]").forEach((inp) => inp.addEventListener("change", () => {
      setMyStorePrice(code, inp.dataset.ppOwn, Number(inp.value));
      refreshPrices();
    }));
    const clearBtn = el.querySelector("[data-pp-clear]");
    if (clearBtn) clearBtn.addEventListener("click", () => {
      const all = myStorePrices(); delete all[code];
      try { localStorage.setItem("my_store_prices", JSON.stringify(all)); } catch (e) {}
      refreshPrices();
    });
    if (!IS_OWNER) return;
    const savePoints = async (list, from, to) => {
      try { await savePackPricePoints(list, from, to); toast("Saved"); } catch (err) { toast(err.message || "Couldn't save", true); }
      refreshPrices();
    };
    el.querySelectorAll("[data-pp-usd]").forEach((inp) => inp.addEventListener("change", () => {
      const from = inp.dataset.ppUsd, n = Number(inp.value);
      if (!(n > 0)) { toast("Enter a price like 4.99", true); renderPriceStrip(); return; }
      const to = n.toFixed(2);
      if (to === from) return;
      if (slots.includes(to)) { toast(`$${to} is already there`, true); renderPriceStrip(); return; }
      savePoints(slots.map((x) => (x === from ? to : x)).sort((a, b) => Number(a) - Number(b)), from, to);
    }));
    el.querySelectorAll("[data-pp-del]").forEach((b) => b.addEventListener("click", () => {
      if (!confirm(`Remove the $${b.dataset.ppDel} price point?`)) return;
      savePoints(slots.filter((x) => x !== b.dataset.ppDel));
    }));
    const addIn = el.querySelector("[data-pp-add]");
    if (addIn) addIn.addEventListener("change", () => {
      const n = Number(addIn.value);
      if (!(n > 0)) return;
      const key = n.toFixed(2);
      if (slots.includes(key)) { toast(`$${key} is already there`, true); return; }
      savePoints([...slots, key].sort((a, b) => Number(a) - Number(b)));
    });
  }

  renderPriceStrip();
  // Every dated pack's own date sits here (above Pack prices) for everyone.
  renderMyPackDates(document.getElementById("packsMyDates"), tables);
  // New heroes: its dates move the hero packs.
  // (Same tables My Purchases used: the hero packs may be hidden from visitors on this page.)
  const ngFocus = PKB_DP_FOCUS;
  PKB_DP_FOCUS = null;
  if (ngFocus) pkbDpShow(true, "ng");
  ensurePackTables().then((all) => {
    const ngEl = document.getElementById("packsNewHeroes");
    if (seq !== RENDER_SEQ || !ngEl) return;
    renderPurNewGen(ngEl, all, () => { if (seq !== RENDER_SEQ) return; pkbDpSub(); if (pkbReady) renderAll(); });
    pkbDpSub();
  }).catch(() => {});
  pkbDpSub();
  renderAll();
  pkbReady = true;
  // Tables with a hero's own shards column (the VIP packs …): the heroes'
  // pictures for those columns; drawn again once they're known.
  const heroCol = /^(.+) (shards|widgets)$/i;
  if (tables.some((tb) => Object.values(packEffectiveCols(tb)).some((c) => heroCol.test(String(c)) && !/general hero/i.test(String(c)) && !HERO_IMG_BY_NAME[heroCol.exec(String(c))[1]]))) {
    ngHeroRows().then((heroes) => {
      const before = Object.keys(HERO_IMG_BY_NAME).length;
      noteHeroImages(heroes);
      if (seq === RENDER_SEQ && listEl.isConnected && Object.keys(HERO_IMG_BY_NAME).length !== before) renderAll();
    }).catch(() => {});
  }
  // The New Gen hero copies of the pattern tables, under their rows.
  ngHeroTables(tables).then((copies) => {
    if (seq !== RENDER_SEQ || !listEl.isConnected) return;
    PKB_NG = pkbNgBuild(copies);
    pkbNgFill();
  }).catch(() => {});
  // Came from ⚙ on My Purchases' Weekly cards: open that pack's settings.
  if (PACK_SETTINGS_FOCUS) { const id = PACK_SETTINGS_FOCUS; PACK_SETTINGS_FOCUS = null; setTimeout(() => packOpenSettingsHere(id), 50); }
  // Came from "Open pack ›" on the Pack calendar: open that pack's window.
  if (PACK_OPEN_FOCUS) { const id = PACK_OPEN_FOCUS; PACK_OPEN_FOCUS = null; if (tables.some((tb) => String(tb.id) === id)) setTimeout(() => pkbOpen(id), 50); }
  // Came from a row on My packs (admin): that pack's window opens in place of
  // this page's history entry, so Back / ‹ return to My packs.
  if (PKB_OPEN_PENDING) {
    const id = PKB_OPEN_PENDING;
    PKB_OPEN_PENDING = null;
    if (tables.some((tb) => String(tb.id) === id)) { history.replaceState({ tab: "packs", pkb: id }, "", location.pathname + location.search); pkbOpen(id); }
  }
}
// The pack settings box title: "Pack settings · Used for (2)".
function packLinkSummaryText(n) {
  return `${t("pk_settings")} · ${t("pack_used_for")}${n ? ` (${n})` : ""}`;
}
function packGroupsChecked(pages) {
  return PACK_PAGE_GROUPS.filter((g) => g.pages.some((k) => (pages || []).includes(k))).length;
}
// Shown on the Packs page for chance-based chests, so the numbers are
// understood as averages over many chests, not guaranteed drops.
const PACK_BUNDLE_NOTES = {
  "Lucky Gear Chest": "1.6% chance of 1 Mythic Gear per chest → counted as 0.016 Mythic Gear per chest (average). 63 chests ≈ 1 Mythic Gear.",
  "Random Chief Gear Chest": "One random Chief Gear material. Alloy: x5000 0.5%, x2500 3%, x1200 15%, x600 31.5%; Polish: x50 0.25%, x25 1.5%, x12 7.5%, x6 15.75%; Design: x50 0.25%, x20 1.5%, x10 7.5%, x5 15.75% → counted as ≈469 Alloy, ≈2.35 Polish and ≈1.96 Design per chest (average).",
  "Random Charm Chest": "Guides: x15 0.5%, x8 3%, x4 15%, x2 31.5%; Designs: same odds → counted as ≈1.55 Guides and ≈1.55 Designs per chest (average).",
  "FC Chest": "x200 0.5%, x100 1.5%, x50 5.5%, x20 10.5%, x10 27%, x5 55% \u2192 counted as 12.8 Fire Crystal per chest (average).",
  "FC Crate": "Weekly card crate — x100 0.4%, x60 0.8%, x40 1.6%, x20 2.5%, x10 8.5%, x5 86.2% \u2192 counted as 7.18 Fire Crystal per crate (average).",
  "Pet Chest": "Each chest opens into one of: 7 Manual, 2 Potion or 1 Serum (your choice). The pack cost turns chests into whichever the plan is short of.",
};
// Speed: this list is built for every resource dropdown on the Packs page
// (hundreds per redraw). The names are sorted once per language/order and
// reused, with one shared collator (calling localeCompare with options
// builds a new one on every comparison, which made each redraw take ~1 s
// on a phone). Same order as before: Intl.Collator#compare matches
// localeCompare with the same locale/options.
const PACK_RESOURCE_COLLATOR = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
let PACK_RESOURCE_SORTED = { key: null, list: [] };
function packResourceChoices(current) {
  const cfg = packResourceConfig();
  const hiddenLower = new Set([...cfg.hidden, ...cfg.removed].map((n) => String(n).toLowerCase()));
  const cur = current ? String(current).toLowerCase() : "";
  const names = packAllResourceNames().concat(packHeroShardNames());
  const key = `${LANG}\u0001${cfg.order.join("\u0002")}\u0001${names.join("\u0002")}`;
  if (PACK_RESOURCE_SORTED.key !== key) {
    const orderOf = new Map();
    cfg.order.forEach((o, i) => { const k = String(o).toLowerCase(); if (!orderOf.has(k)) orderOf.set(k, i); });
    const items = names.map((n) => ({ n, o: orderOf.has(n.toLowerCase()) ? orderOf.get(n.toLowerCase()) : Infinity, d: materialDisplayName(n) }));
    items.sort((a, b) => (a.o !== b.o ? a.o - b.o : PACK_RESOURCE_COLLATOR.compare(a.d, b.d)));
    PACK_RESOURCE_SORTED = { key, list: items.map((x) => x.n) };
  }
  // Filtering the sorted list keeps the same order as filtering first.
  return PACK_RESOURCE_SORTED.list.filter((n) => (!PACK_RESOURCE_HIDDEN.has(n) && !hiddenLower.has(n.toLowerCase())) || n.toLowerCase() === cur);
}
async function savePackLinks() {
  NEW_GEN_BASE_MEMO = null;
  PACK_PLAN_CACHE.clear();
  if (typeof budgetInvalidate === "function") budgetInvalidate();
  saveCalcState("packs_links", PACK_LINKS || {});
}
function vipHeroStarsNow(name) {
  const tr = vipTrackOf(name);
  return Math.max(vipSpecialStars(name), tr && tr.row ? Math.min(5, Math.floor(Number(tr.row.current_stars) || 0)) : 0);
}
function vipHeroMaxed(name) { return vipHeroStarsNow(name) >= 5; }
// The VIP pack hero a table's VIP rows give shards of (null for other tables).
function vipPackHeroOf(tableId) {
  const l = packLinkRaw(tableId).l;
  if (!Array.isArray(l.vipRows)) return null;
  const cols = Object.values(l.cols || {});
  return VIP_PACK_HEROES.find((n) => cols.includes(`${n} Shards`)) || null;
}
async function vipHeroesCheck() {
  await preloadCalcStates();
  if (VIP_PACK_HEROES.every((n) => vipSpecialStars(n) >= 5)) return;
  const by = {};
  await Promise.all(VIP_PACK_HEROES.map(async (n) => { by[n] = await vipHeroTrack(n).catch(() => null); }));
  VIP_TRACK = { user: USER_ID, by };
}
const PACK_TEMPLATE_SOURCES = [
  { title: "Wishful type", from: ["Wishfull", "Wishful"] },
  { title: "Mix & Match type", from: ["Mix & Match"] },
  { title: "Regular pack type", from: ["Lunar Amber Pack"] },
];
function packMyPacksLimit() {
  const n = PACK_LINKS && PACK_LINKS.__settings ? Number(PACK_LINKS.__settings.myPacksLimit) : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 5;
}
function packTemplateKind(link) { return link.pickCols > 0 ? (link.pickOrder ? "wishful" : "mixmatch") : "regular"; }
async function saveMyPacks() {
  PACK_PLAN_CACHE.clear();
  PACK_TABLES_CACHE = PACK_TABLES_STASH = null;
  if (typeof budgetInvalidate === "function") budgetInvalidate();
  saveCalcState("my_packs", { tables: MY_PACKS });
}
// { expert, levels: { rowIndex: level }, days } or null.
// Triggered pack status per row, shown under the table for everyone.
function packTriggerStatusHtml(tb) {
  const link = packLinkFor(tb.id);
  const trig = link.trigger;
  if (!trig) return "";
  const lv = packExpertLevel(trig.expert);
  const color = { coming: "var(--good)", now: "var(--ice)", done: "var(--muted)", notreached: "#e0b25a", nolevel: "var(--muted)" };
  const rows = (tb.rows || []).map((r, ri) => {
    const price = packParseNum((r.cells || [])[link.priceCol]);
    const st = packTriggerRowStatus(trig, ri);
    return `<div style="display:flex; justify-content:space-between; align-items:center; gap:8px; padding:3px 0; border-top:1px solid var(--line);">
      <span>${price ? esc(packFmtMoney(price, link.currency)) : "#" + (ri + 1)}${st.level ? ` <span class="meta">· Lv ${st.level}</span>` : ""}</span>
      <span style="font-size:10.5px; font-weight:700; color:${color[st.state]};">${esc(t("pk_trig_" + st.state))}</span></div>`;
  }).join("");
  return `<div data-pktrigstatus style="margin-top:8px; font-size:11.5px;">
    <div style="display:flex; flex-wrap:wrap; gap:6px; align-items:center; margin-bottom:4px;">
      <span style="font-size:10.5px; padding:1px 8px; border-radius:6px; background:var(--ice); color:#0f141b; font-weight:700;">${esc(dataName(trig.expert))} · ${trig.days === 1 ? esc(t("pk_trig_one_day")) : `${trig.days} ${esc(t("pk_daily_days"))}`} · ${esc(t("pack_reset_once"))}</span>
      <span class="meta" style="font-size:10.5px;">${esc(t("pk_trig_expert_now").replace("{e}", dataName(trig.expert)).replace("{c}", lv.current).replace("{t}", Math.max(lv.current, lv.desired)))}</span>
    </div>${rows}</div>`;
}
// A pack's name inside its event: the title without the event name (or the
// default prefix) and its ":" / " - ", e.g. "Classic"; else the whole title.
function packEventShort(title, names) {
  const s = String(title || "").trim();
  for (const n of names || []) {
    const words = String(n || "").trim().split(/\s+/).filter(Boolean);
    if (!words.length) continue;
    const pat = words.map((w) => w.replace(/s$/i, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "s?").join("\\s+");
    const m = new RegExp("^" + pat + "(?:\\s*:|\\s+[-–—])\\s*(.+)$", "i").exec(s);
    if (m && m[1].trim()) return m[1].trim();
  }
  return s;
}
function packSaveMyRowMax(all) {
  try { localStorage.setItem("pack_my_rowmax", JSON.stringify(all)); } catch (e) {}
  PACK_PLAN_CACHE.clear();
  PACK_TABLES_CACHE = PACK_TABLES_STASH = null;
  if (typeof budgetInvalidate === "function") budgetInvalidate();
}
function packSaveMyEdits(all) {
  try { localStorage.setItem("pack_my_edits", JSON.stringify(all)); } catch (e) {}
  PACK_PLAN_CACHE.clear();
  PACK_TABLES_CACHE = PACK_TABLES_STASH = null;
  if (typeof budgetInvalidate === "function") budgetInvalidate();
}
function packTablesStash() {
  if (PACK_TABLES_CACHE && PACK_TABLES_CACHE._inSig) PACK_TABLES_STASH = { cache: PACK_TABLES_CACHE, groups: PACK_GROUPS_CACHE.tables === PACK_TABLES_CACHE ? PACK_GROUPS_CACHE : null, gen: PACK_GROUPS_GEN };
  PACK_TABLES_CACHE = null;
}
// ------------------------------------------------------------
// Availability: how often a pack table comes back.
//   reset: "unlimited" - can be bought any time, as often as wanted
//          "once"      - one-time offer (a ladder can be run once)
//          number      - resets every N days; `buys` per row per reset
//                        (a ladder can be run once per reset)
// ------------------------------------------------------------
// "Every 4 weeks" rather than "Every 28 days" (owner, 16 Nov 2026: events cycle in weeks).
function packEveryText(r, day) {
  const n = Number(r);
  if (n === 30) { const d = packParseDay(packValidDay(day)); if (!d) return t("pk_every_month_date"); const n2 = d.getUTCDate(), ord = LANG === "en" ? n2 + ([11, 12, 13].includes(n2 % 100) ? "th" : ({ 1: "st", 2: "nd", 3: "rd" }[n2 % 10] || "th")) : String(n2); return t("pk_every_month_on").replace("{d}", ord); }
  if (n === 7) return t("pk_every_week");
  if (n > 0 && n % 7 === 0) return t("pk_every_weeks").replace("{n}", n / 7);
  return t("pk_every_days").replace("{n}", n);
}
function setMyStorePrice(code, slot, value) {
  const all = myStorePrices();
  all[code] = all[code] || {};
  if (value > 0) all[code][slot] = value; else delete all[code][slot];
  if (!Object.keys(all[code]).length) delete all[code];
  try { localStorage.setItem("my_store_prices", JSON.stringify(all)); } catch (e) {}
}
function fmtMoneyIn(n, code) {
  try {
    return bidiNum(new Intl.NumberFormat(LANG === "en" ? undefined : LANG, { style: "currency", currency: code, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n));
  } catch (e) {
    return bidiNum(packCurrencySymbol(code) + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  }
}
function setPacksPageCurrency(code) {
  try { if (code) localStorage.setItem("packs_currency", code); } catch (e) {}
}




// ============================================================
// PACK PRESETS
// Ready-made pack tables (the in-game weekly cards and calendar packs),
// added from the Packs page with one click. Only tables whose title+group
// isn't there yet are created, so it's safe to press again.
// ============================================================
const PACK_PRESET_TABLES = (() => {
  const ladder5 = (cols) => cols.map((c, i) => ({ cells: [["4.99", "9.99", "19.99", "49.99", "99.99"][i], ...c.map(String)] }));
  const W = { reset: 7 };
  const benefit = "Weekly Benefit Card", cards = "Weekly/Monthly Cards", cal = "Weekly/Monthly Calendar Packs";
  return [
    // ---- Weekly benefit cards (two independent tiers, weekly) ----
    { title: "Building Benefit Card", group: benefit, columns: ["$", "Speedup 1h", "Steel", "Gems"], rows: [{ cells: ["4.99", "47", "40000", "2500"] }, { cells: ["9.99", "107", "100000", "5000"] }], link: { ...W, pages: ["research_center", "t11_helios", "t12_research"] } },
    { title: "Pets Benefit Card", group: benefit, columns: ["$", "Food", "Pet Custom Chest", "Gems"], rows: [{ cells: ["4.99", "14000", "16", "2500"] }, { cells: ["9.99", "27500", "40", "5000"] }], link: { ...W, pages: ["pets"] } },
    { title: "Hero Gear Benefit Card", group: benefit, columns: ["$", "Essence Stones", "Lucky Gear Chest", "Gems"], rows: [{ cells: ["4.99", "25", "36", "2500"] }, { cells: ["9.99", "58", "84", "5000"] }], link: { ...W, pages: ["hero_gear"] } },
    { title: "Chief Gear Benefit Card", group: benefit, columns: ["$", "Design Plan", "Chief Gear Chest", "Random Chief Gear Chest", "Gems"], rows: [{ cells: ["4.99", "50", "39", "2", "2500"] }, { cells: ["9.99", "110", "97", "5", "5000"] }], link: { ...W, pages: ["chief_gear"] } },
    { title: "Chief Charm Benefit Card", group: benefit, columns: ["$", "Charm Designs", "Charm Guides", "Random Charm Chest", "Gems"], rows: [{ cells: ["4.99", "60", "60", "6", "2500"] }, { cells: ["9.99", "150", "150", "8", "5000"] }], link: { ...W, pages: ["charm"] } },
    // ---- Weekly/monthly cards (single tier, weekly) ----
    { title: "Fire Crystal Weekly Card", group: cards, columns: ["$", "FC Chest", "Fire Crystal", "Gems", "Fire Crystal"], rows: [{ cells: ["4.99", "1", "8", "100", "25"] }], link: { ...W, pages: [] } },
    { title: "Fire Crystal Shard Weekly Card", group: cards, columns: ["$", "Steel", "FC Shard", "Gems", "FCS"], rows: [{ cells: ["4.99", "20000", "36", "100", "26"] }], link: { ...W, pages: ["t11_helios", "t12_research"] } },
    { title: "Speedup Weekly Card", group: cards, columns: ["$", "Speedup 1h", "Speedup 5m", "Speedup 1m"], rows: [{ cells: ["4.99", "8", "48", "60"] }], link: { ...W, pages: ["experts", "experts_research"] } },
    { title: "Gear Weekly Card", group: cards, columns: ["$", "Lucky Gear Chest", "Essence Stones", "XP 100", "Lucky Gear Chest"], rows: [{ cells: ["4.99", "5", "1", "12", "7"] }], link: { ...W, pages: ["hero_gear"] } },
    // ---- Calendar packs (5-tier ladders, weekly) ----
    { title: "Troops Training", group: cal, columns: ["$", "Speedup 1h", "Speedup 5m", "Gems"], rows: ladder5([[44, 120, 2500], [88, 240, 5000], [176, 480, 10000], [440, 1200, 25000], [880, 2400, 50000]]), link: { ...W, sequential: true, pages: ["experts", "experts_research"] } },
    { title: "Tech Storm", group: cal, columns: ["$", "Speedup 1h", "Speedup 5m", "Gems"], rows: ladder5([[20, 180, 2500], [40, 360, 5000], [80, 720, 10000], [200, 1800, 25000], [400, 3600, 50000]]), link: { ...W, sequential: true, pages: ["experts", "experts_research"] } },
    { title: "Fire Crystal Building", group: cal, columns: ["$", "Fire Crystal", "Speedups", "Gems"], rows: ladder5([[60, 35, 2500], [120, 70, 5000], [240, 140, 10000], [600, 350, 25000], [1200, 700, 50000]]), link: { ...W, sequential: true, pages: [] } },
    { title: "Hall of Chiefs", group: cal, columns: ["$", "Speedup 1h", "Speedup 5m", "Gems"], rows: ladder5([[40, 135, 2500], [80, 270, 5000], [160, 540, 10000], [400, 1350, 25000], [800, 2700, 50000]]), link: { ...W, sequential: true, pages: ["experts", "experts_research"] } },
    // ---- Mix & Match: one ladder, each column is an option (pick one per tier) ----
    { title: "Mix & Match", group: cal, columns: ["$", "Fire Crystal", "Construction Speedup 1h", "Research Speedup 1h", "Troop Speedup 1h", "Design Plan", "Chief Gear Chest", "Steel"],
      rows: ladder5([[30, 22, 22, 22, 24, 12, 25000], [60, 44, 44, 44, 48, 24, 50000], [120, 88, 88, 88, 96, 48, 100000], [300, 220, 220, 220, 240, 120, 250000], [600, 440, 440, 440, 480, 240, 500000]]),
      link: { ...W, sequential: true, colOptions: true, pages: ["chief_gear", "research_center", "t11_helios", "t12_research"] } },
    // ---- Custom Pet Chest: one ladder, each column is an option ----
    { title: "Custom Pet Chest", group: cal, columns: ["$", "Food", "Pet Chest", "Common Marks", "Advanced Marks"],
      rows: ladder5([[5000, 6, 16, 2], [10000, 12, 32, 4], [20000, 24, 64, 8], [50000, 60, 160, 20], [100000, 120, 320, 40]]),
      link: { ...W, sequential: true, colOptions: true, pages: ["pets", "pets_refine"] } },
  ];
})();
// Creates the preset tables that don't exist yet. Returns how many were added.
async function packAddPresets(existingTables) {
  await ensurePackLinks();
  const have = new Set(existingTables.map((tb) => `${(packLinkFor(tb.id).group || "").toLowerCase()}|${String(tb.title || "").toLowerCase()}|${(tb.columns || []).join(",").toLowerCase()}`));
  let added = 0, order = existingTables.length;
  for (const p of PACK_PRESET_TABLES) {
    const key = `${p.group.toLowerCase()}|${p.title.toLowerCase()}|${p.columns.join(",").toLowerCase()}`;
    if (have.has(key)) continue;
    const payload = { title: p.title, columns: p.columns.slice(), rows: p.rows.map((r) => ({ ...r, cells: r.cells.slice() })), sort_order: order++, scale_enabled: false, updated_at: new Date().toISOString() };
    let saved;
    try { [saved] = await sb(`pack_tables`, { method: "POST", body: JSON.stringify({ user_id: USER_ID, ...payload }) }); }
    catch (err) { toast("Couldn't add preset tables", true); break; }
    PACK_LINKS[String(saved.id)] = { pages: p.link.pages || [], priceCol: 0, cols: {}, sequential: !!p.link.sequential, option: !!p.link.option, colOptions: !!p.link.colOptions, choice: false, reset: p.link.reset, group: p.group, currency: "USD", buys: 1 };
    have.add(key); added++;
  }
  await savePackLinks();
  PACK_TABLES_CACHE = PACK_TABLES_STASH = null;
  return added;
}
