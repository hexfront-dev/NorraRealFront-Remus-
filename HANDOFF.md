# Handoff — railroad-feature branch: asset 404 + preload self-heal added; perf work outstanding

> Future sessions: this file holds the current handoff. Overwrite it rather than
> appending; keep only the latest handoff. Write one only when the session leaves
> open items or partially verified work.

Companion notes: `testnotes.md`.

## 1. Where things are

- Repo: `C:\Users\ai51940\OpenFrontIO`.
- Tokens (all authenticate as **`hexfront-dev`**):
  - `H:\Documents\Hexfront-token.txt` — write to the fork (`origin`).
  - `H:\Documents\Norrasoff-token.txt` — **read-only** (cannot push/PR NorrasOFF).
  - `H:\Documents\Fly.io-token.txt` — Fly deploy token (app `openfrontio`, org
    “Familjen Jacobsson”). `flyctl` at `C:\Users\ai51940\.fly\bin\flyctl.exe`;
    set `$env:FLY_API_TOKEN = (Get-Content -Raw ...).Trim()`.
- Remotes: `origin` = `hexfront-dev/NorraRealFront-Remus-`,
  `norrasoff` = `NorrasOFF/NorraRealFront`, `upstream` = `openfrontio/OpenFrontIO`,
  `hexfront` = `hexfront-dev/OpenFrontIO` (no write with either token).
- This branch **`debug-pr14`** = the railroad feature tip (`647ca65a4`) **plus**
  the asset/preload fixes below. `origin/main` and `origin/revert-pr-14` are the
  **revert** (`576389b13`, no railroad feature); `norrasoff/main` = `1d963cf20`
  (feature, merged). The deployed Fly build was the revert at last check
  (`coreVersion 95f29ecc…` = `96ce9a417`).

## 2. What changed this session (implemented + verified)

Fix for `Failed to fetch dynamically imported module: …/Worker.worker-*.js`
(“Anslutningsfel!” when hosting a private lobby). Root cause: missing assets were
served as the HTML app shell at HTTP 200, and the sim worker is a **lazy** chunk
(since `94f229314`, 2026-06-11) fetched at game start, so a failed fetch became an
unrecoverable module error. **Not** caused by the railroad feature.

1. **Server: 404 for missing assets** — `src/server/Master.ts`. The SPA fallback
   now returns `404 text/plain` for `req.path` under `/assets/` or `/_assets/`
   instead of rendering `index.html`. Verified locally: bogus asset paths → 404;
   `/` → 200 `text/html`.
2. **Client: self-heal failed lazy imports** — `src/client/PreloadErrorRecovery.ts`
   (imported first in `src/client/Main.ts`). On Vite’s `vite:preloadError` it
   `preventDefault()`s and reloads **once** with a cache-busting `_r=<ts>` query;
   a 15 s `sessionStorage` cooldown (`openfront:preload-error-reload-at`) prevents
   a reload loop. Verified headless: the event navigates to `…/?_r=<ts>`.

`npx tsc --noEmit` clean; prettier/oxlint/eslint clean on touched files.

Deliberately **not** done (cost): shortening the app-shell cache
(`stale-while-revalidate`/`stale-if-error` in `RenderHtml.ts`) and keeping a warm
machine (`min_machines_running=1` in `fly.toml`).

## 3. PERFORMANCE WORK — do before shipping the railroad feature

Files: `src/core/execution/RailroadLinkExecution.ts`,
`src/core/game/RailNetworkImpl.ts` (`StationManagerImpl.findStation`),
`src/core/game/PlayerImpl.ts` (`_railroadLinks`).

1. **O(players × factories² × stations) per tick — the lag.** `tick()` calls
   `stationManager.findStation(factories[j])` in an inner loop, and
   `StationManagerImpl.findStation` linearly scans every station
   (`for (const station of this.stations) if (station.unit === unit) …`).
   - Resolve factory→station **once per player per tick** (or once per tick),
     not per pair.
   - Better: add an O(1) `unitId → TrainStation` index to `StationManagerImpl`
     (fill in `addStation`, clear in `removeStation`/`restoreStations`).
   - Early-out for players with `< 2` factories.
   - Regression guard: a test that counts `findStation` calls (or a perf test).
2. **Link never reforms after a factory dies.** The drop loop
   (`RailroadLinkExecution.ts:54-63`) calls `removeLink()` but leaves the pair in
   `prevConnected`; `nowConnected` is then recomputed, so the pair stays in
   `prevConnected` and `newPairs` never re-creates it though the factories are
   still connected. Remove dropped pairs from `prevConnected`, or derive link
   existence from current connectivity.
3. **Multi-factory “newest connection wins” churn.** With A,B,C connected the
   `newPairs` loop creates A:B, deletes it for A:C, deletes that for B:C — one
   link survives, several units created/deleted in one tick. Assign a stable
   partner per factory (e.g. lowest-id still-connected) to stop the thrash.
4. **Delete with an alternate path doesn’t stick.**
   `DeleteRailroadExecution.cutRailBetween` cuts only the found path; another path
   can keep the pair connected and relink. Track an “explicitly unlinked” pair
   until connectivity actually changes.

Verify with `tests/core/executions/RailroadLinkExecution.test.ts`,
`RailroadLinkCheckpoint.test.ts`, plus the new call-count/perf guard.

## 4. Open items / next steps

- Decide the ship target: this branch (`debug-pr14`) vs. the fork `main` (which
  currently holds the revert). Restoring the feature to `origin/main` needs a
  force-push (not done).
- Deploy hygiene: the Fly build reports `GIT_COMMIT=unknown`; deploy with
  `--build-arg GIT_COMMIT=$(git rev-parse --short HEAD)` so build skew is
  detectable. Late-Sept/Oct deploy bursts (6 in ~45 min on 2026-10-01) are the
  likely trigger for the stale-chunk failures now mitigated by §2.
- Performance work §3 is outlined, **not implemented**.
- The pre-existing suite failures in `testnotes.md` still stand.
