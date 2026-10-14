# WOS RST — notes for Claude

WOS RST (www.wosrst.com) is a free, unofficial **Whiteout Survival** planner. It tracks gear, charms, research, pets, experts and heroes, and plans the cheapest packs. Most visitors use it on phones, in English, Arabic (RTL) or Korean.

> This file is published with the site (`wosrst.com/CLAUDE.md`), like everything in this repo. Never put secrets or personal data here.

## How the owner works with Claude
- **Report first, change after.** When asked to review or check something, report the findings in plain language and wait for a go-ahead before editing.
- **Don't change functions or design** unless asked. Fixes and speed-ups must look and behave the same.
- **One focused PR per change**, never pushed straight to `main`. Each PR description includes a preview link for testing on a phone before merging:
  `https://raw.githack.com/BuildwithRaed/WOS-RST/<branch>/index.html`
- **The site deploys from `main`** (GitHub Pages, root folder, no build step; live 1–2 minutes after a merge).
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
- **Escape** database/user text with `esc()` before putting it in HTML.

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
- Gallery/Islands/Experts/Facility pictures in the repo are cropped the same way (Oct 2026). The space around them is set in CSS: `.gallery-card .thumb.gallery-thumb` (Cosmetics, 17%), `.island-thumb` (Islands, 5%), `.island-thumb.facility-thumb` (Facility, 10%), and the inline padding on the Experts portraits.

## Open to-dos
- Issue #13: delete 133 unused files from Storage `skin-images` (the owner does it in the dashboard). Re-check the lists first if images changed.

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
