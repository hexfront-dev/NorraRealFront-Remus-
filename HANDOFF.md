# Handoff — ranked leaderboard refresh-on-open (Nine Islands result was recorded)

> Future sessions: this file holds the current handoff. Overwrite it rather than
> appending; keep only the latest handoff. Write one only when the session leaves
> open items or partially verified work.

Companion notes: `testnotes.md`. This session has no new `testnotes.md` section
yet; the points worth keeping are below.

## 1. Where things are

- Repo: `C:\Users\ai51940\OpenFrontIO`, branch `defense-post-priority`.
- Token `H:\Documents\Hexfront-token.txt` authenticates as **`hexfront-dev`**
  (fine-grained; it can push `hexfront-dev/NorraRealFront-Remus-` but **403s**
  on `NorrasOFF/NorraRealFront`).
- Ship target: `origin` = `hexfront-dev/NorraRealFront-Remus-`, branch `main`
  (`git push origin HEAD:main`; use a credential-in-URL remote because the
  credential-manager prompts fail in this shell).
- Fix commit: `9d6b28563` "Refresh the ranked leaderboard when the modal is
  reopened" — pushed to `origin/main` (now `9d6b28563`).
- Live app: Fly app `openfrontio`, still **release v198 (Nov 17 2026 11:30)**.
  The fix is **not live**. Runtime content of this branch equals
  `NorrasOFF/NorraRealFront` `main` except for `HANDOFF.md` and
  `.github/PULL_REQUEST_TEMPLATE.md` (both non-runtime), so deploying from a
  `norrasoff/main` checkout with this commit cherry-picked is equivalent.

## 2. What was reported and what actually happened

Report: "played a ranked lobby on Nine Islands yesterday, results did not show on
the leaderboard, nobody got any points; the website is updated but not the game
leaderboard."

Findings on the live deployment (read-only checks):

- The saved lobby is `y6AwGVkg` — label `Nine Islands · Remus`, 9 players,
  `ranked: true`, FFA, nations default, 49 275 turns, last saved 2026-11-23
  16:19, rated at **17:17** the same day.
- `/data/auth/ranked-ratings.json` has `appliedMatches: ["U5ZyD2u7",
"y6AwGVkg"]`; all nine participants have a bumped `games`/`updatedAt`
  (17:17). **No points were missing and no manual entry is needed.**
- All nine were rated. Nine Islands placements/awards (award = 100 − 5·(place−1)):

  | place | player (account)                  | award | pre → post |
  | ----: | --------------------------------- | ----: | ---------: |
  |     1 | Monstergroda                      |   100 |   95 → 195 |
  |     2 | adrian1 (joined as Lampskene)     |    95 |   90 → 185 |
  |     3 | ali_ce                            |    90 |     0 → 90 |
  |     4 | Remus (joined as Tage Trampolin)  |    85 |  100 → 185 |
  |     5 | TheBohmenienEmpire                |    80 |   80 → 160 |
  |     6 | ooo (joined as Vackrajoel)        |    75 |     0 → 75 |
  |     7 | BonansFall (joined as BönansFall) |    70 |     0 → 70 |
  |     8 | bing chilling                     |    65 |     0 → 65 |
  |     9 | Type shyte                        |    60 |     0 → 60 |

  (`GabeeGaboo`/Erling Haaland did not play; they stay at 85 from `U5ZyD2u7`.)
  The pre-game ladder was the five `U5ZyD2u7` players, so the in-game top-five
  after the game is mostly the same names in a slightly different order — which
  is why it looked unchanged when no point values are shown.

- Root cause of "not the game leaderboard": the `leaderboard-modal` element is
  static in `index.html` and lives for the whole page session. `ensureLoaded()`
  early-returned once `hasLoadedPlayers` was set, so a board opened before the
  match never refetched after it; only a full reload did. The website fetches
  `/api/leaderboard/ranked` on every page load, which is why it was current.
  Reproduced in headless Chrome against the live site: two opens produced **one**
  request and identical rows.

## 3. What landed (commit `9d6b28563`)

- `LeaderboardPlayerList.refreshIfStale()`: after `REFRESH_INTERVAL_MS` (15 s) it
  fetches page 1 again and swaps the rows in place. The old rows stay visible
  while the request runs, and a failed refresh keeps them (no error screen).
  A `refreshing` guard collapses the `onOpen` + `onTabEnter` pair (and rapid
  toggling) into one request. Page-1-only is sufficient: `TOP_PLAYER_LIMIT = 5`
  and the page size is 50, so the visible rows never come from page 2.
- `LeaderboardModal` calls `refreshIfStale()` on open/tab enter instead of
  `ensureLoaded()`.
- `en.json`: `leaderboard_modal.refresh_time` is now "Updates when opened" (it
  previously claimed "Refreshed every 1 hour", which was false).
- Tests: `tests/client/LeaderboardModal.test.ts` gained "Refresh on open"
  (refetch after the window with in-place swap, no refetch inside it, failed
  refresh keeps rows, open/tab-enter collapse, modal open wiring). 20 tests in
  that file pass.

Verification: `npx tsc --noEmit`, `npm run lint`, Prettier clean;
`EnJsonSorted` + `LeaderboardModal` (20 tests) pass. Headless Chrome on a local
dev server: first open 1 request, immediate reopen still 1, reopen after 16 s
refetches (the dedupe guard was added after that run and is covered by the unit
test).

Deliberate design that was **not** changed: the ladder publishes no Elo
(`RankedLeaderboardEntrySchema` has rank/total/public_id/accountUsername), the
in-game list is capped at the verified top 5, and players outside the top 5 are
not pinned. Point values remain hidden by an earlier session's decision.

## 4. Open items

- **Deploy** (nothing live). Either cherry-pick `9d6b28563` onto
  `NorrasOFF/NorraRealFront` `main` and run `flyctl deploy` from that checkout,
  or ask the owner to. A deploy restarts the machine and drops games in
  progress, so it was not done unilaterally. `FLY_API_TOKEN` is available in
  `H:\Documents\fly-token.txt`; the Fly account is `mmrsjacobsson@gmail.com`.
- **Points visibility**: if the owner wants the awarded numbers visible again,
  that is a product change (server payload + leaderboard column) and was left
  alone. The per-player totals are in section 2.
- Until the deploy, the workaround for a stale board is a full page reload; the
  server data is already correct.

## 5. Operational caveats (carried forward)

- `fly.toml` deliberately has `min_machines_running = 0`; the machine auto-stops.
  Do not set it to 1 without asking the owner.
- `AUTH_DIR` must stay on the `openfront_auth` volume (`/data/auth`);
  `ranked-ratings.json` and `accounts.json` live there. Player saves live in
  `/data/saves/w0`.
- `LOCAL_AUTH` returns `usernameStatus: "indefinite"` for every local account, so
  in this deployment every signed-in account counts as verified; the visible
  effect is account usernames replacing typed-in join names. Do not "fix" this
  without checking with the owner.
- The `Hexfront-token.txt` PAT cannot push to `NorrasOFF/NorraRealFront` (403);
  `H:\Documents\norrasoff-token.txt` is the same GitHub user with org access.
