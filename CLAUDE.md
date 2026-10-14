# WOS RST — notes for Claude

WOS RST (www.wosrst.com) is a free, unofficial **Whiteout Survival** planner. It tracks gear, charms, research, pets, experts and heroes, and plans the cheapest packs. Most visitors use it on phones, in English, Arabic (RTL) or Korean.

> This file is published with the site (`wosrst.com/CLAUDE.md`), like everything in this repo. Never put secrets or personal data here.

## How the owner works with Claude
- **Report first, change after.** When asked to review or check something, report the findings in plain language and wait for a go-ahead before editing.
- **Don't change functions or design** unless asked. Fixes and speed-ups must look and behave the same.
- **One focused PR per change**, never pushed straight to `main`. Each PR description includes a preview link for testing on a phone before merging:
  `https://raw.githack.com/BuildwithRaed/WOS-RST/<branch>/index.html`
- **The site deploys from `main`** (GitHub Pages, root folder, no build step; live 1–2 minutes after a merge).
- **If the site doesn't update after a merge**, check the "pages build and deployment" run in GitHub Actions. On 14 Oct 2026 GitHub's deploy step timed out ("Timeout reached") for PR #29 with no code problem; a new merge to `main` publishes again.
- **After the owner says "merged", check it really is** (`git fetch origin main` and look for the merge commit). The final "Confirm merge" click has been missed before. Then restart the working branch from the new `main`.
- Explanations should be short and non-technical. Show before/after numbers or pictures when useful.

## Files
- `index.html`: the whole app, about 19,900 lines. HTML shell, inline `<style>`, then one large inline `<script>`. No framework, no build.
- `sw.js`: service worker. The page is network-first; icons are cache-first; the pinned supabase-js URL is cache-first. Cache name `wosrst-v2`; don't bump it without a reason, since that makes every user re-download all icons.
- `manifest.webmanifest`, `pwa/icons/`: installable app.
- `icons/`: game images. `icons/skins/opt/` holds optimized copies of the gallery images (see Images).
- `CNAME` (www.wosrst.com), `.nojekyll`.

## Backend: Supabase (project `hzourauekkiorojrhpko`)
- REST through `sb(path, opts)`. Reads over 1,000 rows page automatically; `sbAllPagesAtOnce(path)` fetches the first two pages in parallel.
- **Visitors** sign in anonymously. **The owner** is detected by login email (`IS_OWNER`) and gets Admin and editing. Row-level security enforces the same rule on the server.
- Game data belongs to `PROGRESSION_OWNER_ID`. Each user's own progress is in `calc_state` (one JSON state per `calc_name`) plus `skins` / `player_heroes`.
- Storage bucket `skin-images`: public read, **owner-only writes** (Claude can't upload or delete there).
- The Supabase connector can run SQL. Use read-only queries unless the owner asked for a change, and back up anything you change first.

## Key code patterns (keep them intact)
- **Routing:** `goToTab(tab)` → `render()`. Every page render function starts with `const seq = RENDER_SEQ;` and, after each `await`, does `if (seq !== RENDER_SEQ) return;` before drawing. That stops a slow page from drawing over the page the user switched to. New pages must follow this.
- **Translations:** `t("key")` uses the big `T` dictionary (en/ar/ko). There's also an automatic DOM translator (`UI_TEXT_I18N`, `DATA_NAME_I18N`, `localizeDom` + a MutationObserver). Add keys to `T` for new text.
- **Saved state:** `loadCalcState(name)` reads from a bulk-preloaded cache. `saveCalcState(name, state)` updates the cache at once and saves in the background through a per-state queue (one request at a time, newest wins). **Don't `await` saves before redrawing.**
- **Row updates from taps** (gallery/facility cards, roster stars): `patchRowQueued(table, id, patch)` / `patchSkinQueued(id, patch)`. Show the change at once and put it back if the save fails.
- **Data kept for the visit:** `dashCached(key, load)` (Dashboard tables, VIP, Hero Stars, island categories) and `loadExpertNodes(kind)` (expert tables). Anything that changes this data must clear it:
  - `dashDataChanged("skins")` after skin edits (already done in `patchSkinQueued` and Alliance Tech)
  - `dropKeptGameData()` after buff edits and when Admin opens
  - **Add the same when adding new writes to these tables.**
- **Ensure-loaders** (`ensureHeroGearData`, `ensureCharmData`, ...): callers share one in-flight load, and the "loaded" flag is set only once the saved state is applied.
- **Pack planner:** heavy work runs in a Web Worker built from function source text (`PLANNER_FN_NAMES`). Functions in that list must only use other listed functions/constants.
- **Swipe cards:** `wireSwipeGesture` / `wireTroopSwipe` / `renderSwipeDots` / `renderSwipeCounter` set `el.onpointerdown = ...` on purpose (no listener stacking on re-render).
- **Performance choices to keep:**
  - Packs column dropdowns are built with only their shown option (`data-pt-lazy`) and filled on first touch/focus.
  - Owner "Used for" boxes are built on first open (`data-packlinklazy`).
  - `packResourceChoices` caches its sorted list.
  - Hero Gear / T12 / Research Center update only the changed values instead of redrawing.
  - Budgets: built pack groups are kept for the visit (`PACK_GROUPS_CACHE`, cleared by `budgetInvalidate()` and when the pack tables reload); only the ticked pages' packs are sent to the planner worker; `ensurePackTables` shares one load.
  - Packs tables (`[data-packtable]`) use `content-visibility:auto` so off-screen tables skip layout.
- **Planner page layout** (T12 design, used by T12, T11, Research Center, Chief Gear, Charms, Heroes Gears, Pets, Pet Refine, Experts Level/Research): `plxShellHtml({title, settings, amountsId, needId, needTitle, timeId, tabsId, topExtra, mainHtml, sideExtra})` builds two columns on PC (side: Settings, "Amounts from your Backpack" tiles with Trade items and Pack Cost; main: "Total resources needed" squares, title + troop tabs, the page's content) and stacks them on phones (settings, totals, content, amounts). Helpers: `plxTimeHtml` (research time box), `plxNodeHtml` / `plxSectionHtml` (NOW − n + / TARGET nodes in folding sections), `plxTabsHtml` (a tabs container with class `t12x-tabs` is drawn by `renderSwipeDots` as tabs), `capSettingsHtml` (level cap in Settings), `navLabel(tab)`. Page title sits on top (`.plx-head`) with "Max everything" on its right (`maxId`). Stats: `plxStatBoxesHtml` (boxes with of-max bar) and `plxStatTabsHtml(id, groups)` (several stat groups behind tabs, one click handler on `document`, chosen tab kept in `PLX_STAT_TAB`) — used by the planner pages, Dashboard troops, Alliance Tech, VIP, Tundra Album, Collection Gallery. `renderPickStrip` = picture/name strip to pick a pet or expert. `plxAmountModal` = the tap-to-type pop-up for tiles outside the shared bar (Experts Level). `renderChiefGearResourcesBar` puts the needed squares into `BAR_SUMMARY_HOST[calcKey]` and shows tiles unless `BAR_SHOW_ALL[calcKey] === false`. Other pages use `.panel`, which has the same card look.
- **Escape** database/user text with `esc()` before putting it in HTML.
- **Backpack page** (`renderInventory`): square tiles of every item the site uses, with tabs (All + each group; speedup groups share one Speedups tab). The item list is site_config `backpack_items` (Admin → Backpack Items; default `BACKPACK_DEFAULT_GROUPS`). Amounts are per user in calc_state `backpack`. **Planner pages fill their owned boxes from it** (`BACKPACK_PAGE_LINKS`, `backpackAmountFor`, applied in `ensureMaterialOwnedCache`, the Experts pages, `budgetOwnedFor` and the general speedup pool) once the person has anything in the Backpack; typing in a box keeps that number (calc_state `backpack_manual` = { calcKey: { item: true } }, "Use Backpack" link puts it back). Converted: XP Component = XP 10×10 + XP 100×100; speedup minutes = counts × minutes. Chests are shown read-only (`BACKPACK_PAGE_CHESTS`): Custom Resource Chests Lv.1–3 (+ Secured) count as your choice of Meat/Wood/Coal/Iron on the research pages (hidden rules `BACKPACK_RES_CHEST_RULES`); Chief Gear Chest counts as 400 Alloy + 4 Polish + 1 Design (`ownedWithChests`, noted as assumed); chance chests (Random Chief Gear/Charm, Lucky Gear, FC Chest/Crate) are shown but not counted. "?" chests are not in the Backpack. The old `items` / `player_inventory` tables are no longer used. The All tab is one grid with no headings, in the game's own Backpack order (`BP_GAME_ORDER`: Resources tab items incl. resource chests, then Other tab items, then hero shards), with all speedups last under a "Speedups" heading (`BP_SPEEDUP_ORDER`). Hero shards: the 3 General Hero Shards are in the default list; each person adds the heroes whose shards they track ("+ Add hero" per rarity, list saved in calc_state `backpack_heroes`, amounts saved as "<hero name> Shards"). **Scan screenshot** (`openBackpackScan`): reads game screenshots on the phone (never uploaded) with Tesseract.js 5.1.1 from jsdelivr, loaded only when Scan is used (that is why the CSP allows `'wasm-unsafe-eval'` and jsdelivr in `connect-src`). It reads the "Resource & Speedup Summary" Resources tab (last column = Total Resources, city + backpack; resource chests aren't counted there) and the Backpack Speedup tab (tiles found as same-size squares on the blue panel; size from the tile colour, type from the corner mark compared with `icons/scan-marks.png`, amount read from the bottom-right number). A check screen lists every value with "please check" marks before saving. Resources/Other tab tiles are recognised by picture: `scanTileFeature` (30×17 colour grid) compared with the rows of `icons/scan-items.png` (`SCAN_ITEM_NAMES`, learned from the owner's PC and phone screenshots; a tile further than 20 is skipped, over 12 or a close second is marked to check; Custom Resource Chest Lv.1/Lv.2 share a picture and are told apart by tile colour, green = Lv.1, blue = Lv.2). Numbers are read on a wide strip, then on a tight crop if nothing was read; a number made only of thin "1" shapes is counted from the shapes. Not learned yet (no screenshot): Amber, Mythic Gear, FC Chest, FC Crate, Holger/Gareth/Justus Sigils, Rare General Hero Shard, each hero's own shards.

## Testing approach used so far
The cloud environment allows `hzourauekkiorojrhpko.supabase.co` and `www.wosrst.com`. It can't reach `cdn.jsdelivr.net`, so tests serve a local copy of `@supabase/supabase-js@2.117.3`.
1. Extract the main inline script and run `node --check`. Run ESLint for unused variables and real-bug rules.
2. Use Playwright with the preinstalled Chromium (`executablePath: '/opt/pw-browsers/chromium'`), real data, **read-only**: mock `/auth/v1/` to return a session whose token is the public anon key, and block every non-GET request to Supabase.
3. Compare old (`origin/main`) vs new: page HTML across all tabs at 390 px and 1280 px, plus before/after timings with CPU throttling ×4 and +150 ms per request.

## Images
- Large repo icons were optimized (resized to 2–3× display size, palette PNG via libimagequant) with **file names and formats kept**, so database links keep working.
- `skins_catalog.image_url` for 88 gallery images points to `icons/skins/opt/<file>`. The originals stay in Storage `skin-images` as the backup. Revert:
  ```sql
  update skins_catalog
  set image_url = 'https://hzourauekkiorojrhpko.supabase.co/storage/v1/object/public/skin-images/' || split_part(image_url, '/', -1)
  where image_url like 'icons/skins/opt/%';
  ```
- New images uploaded through Admin still go to Storage. `cropUploadImage` crops them first (see-through borders off, keeping 99% of the picture, max 384 px; JPEGs untouched), so they match the others.
- Gallery/Islands/Experts/Facility pictures in the repo are cropped the same way (Oct 2026). The space around them is set in CSS: `.gallery-card .thumb.gallery-thumb` (Cosmetics, 17%; `gallery-thumb-big` 6% for the categories in `GALLERY_BIG_THUMB`: City Skin, Teleport Skin, Private Chat, Rally), `.island-thumb` (Islands, 5%), `.island-thumb.facility-thumb` (Facility, 10%), and the inline padding on the Experts portraits.

## Open to-dos
- None. (Issue #13 done 14 Oct 2026: 132 unused Storage files deleted; `skin-images` now holds 90 files: Justus's expert picture, the 88 gallery backup originals, and one unlinked city-skin picture `d248d1b3-….png` kept for the owner to decide.)

## History (Oct 2026)
- PR #1: Experts Research swipe fix
- PR #2: removed unused code
- PR #3: Hero Gear missing-data fix
- PRs #4–#6: full bug review (crashes, saved-data overwrites, wrong totals, Admin bugs)
- PRs #7–#12: performance:
  - Packs speed
  - instant saves
  - keeping data for the visit
  - smaller redraws
  - image optimization (repo icons and the gallery images)
- PR #15: Budgets speed (open 7.2 s → 2.7 s, date change 6.2 s → 0.7 s)
- PR #16: owner Packs page speed (2.4 s → 1.4 s)
- PR #17: even, smaller gallery pictures + auto-crop on upload
- PR #18: new hero star design; PR #19: Dashboard "highest Gen for Max" toggle
- PR #20: bigger pictures for City Skin, Teleport, Private Chat, Rally
- PR #21: pictures for Pet Chest, Common/Advanced Marks, Gems (game icons, same as whiteoutsurvival.wiki)
- PR #22: new Backpack page (all items as tiles, tabs, tap to edit) + Admin → Backpack Items
- PR #24: Backpack hero shards (General + heroes you add)
- PR #25: Backpack All tab in game order, speedups at the bottom, resource chests, XP Component removed
- PR #26: own picture for each speedup type (`icons/speedup-general|construction|troop|research|expert.png`: drawn double arrows plus the type mark cut from the owner's Speedup screenshot), on Backpack and the Experts page; replaces the wiki "Gathering Speed Boost" icon `item_icon_302000.png`
- PR #27: Backpack Scan screenshot (Summary Resources tab + Speedup tab, check screen before saving)
- PR #28: Scan fix for phone screenshots (reads only the light Summary panel; squares found but no speedups → also tried as the Summary)
- PR #29: Scan reads the Backpack Resources and Other tabs (44 items learned from the owner's screenshots)
- PR #32: Scan fixes from the owner's phone screenshots (Fiery Heart recognised, lone digits like "8" and "11" read, phone pictures learned)
- PR #33: planner pages fill from the Backpack (manual override per box), chests shown read-only
- PR #34: "From Backpack" note and "Use Backpack" link on the research pages' General Speedups box
- PR #35: Backpack speedup totals (each type in d/h/m) at the top of the Speedups tab and the All tab's speedups
- PR #23: correct FC Chest picture (`icons/fc-chest.png`, cut from the owner's game screenshot; the wiki's "Fire Crystal Chest" icon is a different item)
