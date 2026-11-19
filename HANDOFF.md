# BetIQ Lite: handoff

Written 19 Nov 2026 for a new Claude Code chat on the home server (`belboapps`). It brings together the earlier cloud
chat `session_01FWFUotqGjcBeonWUTGHWET` ("BetIQ Lite project handoff", 6 to 16 Nov) and what is in this folder today.
Later commits (17 to 19 Nov) came from other sessions and are summarised from git only.

## About the user (from the chat)

- UK based, Europe/London time, £ and decimal odds. Works on a Mac and a phone. Tight budget, wants as little admin as possible.
- New to betting and to coding. Explain step by step, give options with a recommendation, and say which model fits the
  next job (Sonnet for routine building, a stronger model for research or model design).
- Be honest: nothing reliably beats the bookmaker margin. Never invent data, tipsters or track records. Keep the 18+ /
  BeGambleAware footer, suggest deposit limits, never imply guaranteed profit.

## What the app is

A phone web app that compares bookmaker prices, works out a fair chance for each outcome, flags bets priced better than
fair ("value"), suggests a stake, gives a PLACE / CONSIDER / WAIT / SKIP / CHECK FIRST verdict, and logs and settles bets.
It is personal, not commercial.

- `index.html`: the whole app in one file (vanilla HTML/CSS/JS, about 375 KB, no build step). Footer version is still
  `v27 (16 Nov 2026)`, although many features were added after that (see Discrepancies).
- `manifest.webmanifest`, `icon.png`: home-screen install.
- State lives in the browser's `localStorage` under `betiqlite.v1` (key, settings, bets, cache, price history, track record).
  On the home-server copy the bet log is also saved to the server (below).

## Stack and layout

| Path | What it is |
|---|---|
| `index.html` | The app |
| `helper/worker.js`, `helper/README.md` | Cloudflare Worker "helper" (v2): `/fixtures` passes on football-data.co.uk's weekly prices file, `/results?div=` passes on results; optional daily ntfy alert. Pasted into Cloudflare by hand |
| `server/` | Python 3.12 home-server services (Docker): `betiq_agent.py` (agents), `web.py` (serves the page and the bet-log API), `betiqdb.py` (SQLite store that answers Supabase-style requests), `cfaccess.py` (checks Cloudflare Access login passes), `tipsters.py`, `watcher/` (Node + Playwright price watcher) |
| `server/docker-compose.yml` | Services `agent` (betiq-agent), `web` (betiq-web, `127.0.0.1:8214`), `watcher` (profile `watcher`, off by default) |
| `scripts/deploy.sh` | Test-then-deploy script for the home server |
| `tests/` | Playwright browser tests `t14`..`t40` against a fake Odds API, `run-all.sh`, `README.md` |
| `.github/workflows/tests.yml` | GitHub Actions: server unit tests, all browser tests, watcher self-test, on every push and PR |
| `data/` | History and research scripts and reports (`history_build.py`, `exch_test.py`, `signals_test.py`, `model_test.py`, `HISTORY_REPORT.md`, `EXCHANGE_TEST.md`, `SIGNALS_TEST.md`, `MODEL_REPORT.md`, `evidence.json`). `data/raw/` (225 CSVs) and `data/history.sqlite` (261 MB) exist locally but are git-ignored on purpose |
| `supabase/` | `setup.sql`, `files.sql`, README for the optional Supabase cloud backup |

Data sources: The Odds API (user's free key, 500 credits a month; key only accepted in the URL), football-data.co.uk
(free weekly prices file, results and history; no stated licence, so personal use only and raw files never committed),
Betfair Exchange prices that come in the normal Odds API call (used as the fair-price yardstick when the market is busy).

## Run, test and deploy on this server

This machine is the home server. Verified on 19 Nov:

- Deployed copy: `~/docker/betiq-agent/` (server files plus `page/` with the app). Its `index.html` and server files
  match `main` exactly.
- Running containers: `betiq-agent`, `betiq-web` (`127.0.0.1:8214`), and `cloudflared` (separate stack in `~/docker/cloudflared`).
  The watcher image exists but the watcher container is not running.
- The page is served at `https://betiq.<domain>` behind the home dashboard's Cloudflare Access login (per `server/web.py`
  and compose comments; the exact hostname was not checked).

Commands:

- Server unit tests (verified, 32 pass): `python3 -m unittest discover server` from the repo root.
- Browser tests: there is no Node on the host. `scripts/deploy.sh` runs them inside the `betiq-agent-watcher` image
  (`tests/run-all.sh`). GitHub Actions also runs them on every push. Not run in this handoff.
- Deploy: `scripts/deploy.sh` runs server tests, browser tests, then rsyncs `server/` to `~/docker/betiq-agent/`, copies the
  page to `page/`, and runs `docker compose up -d --build`. It works over `ssh homeserver` (written to run from the Mac).
  Running it from this server would ssh to itself; whether that works here is **unverified**. Manual equivalent on this
  box: copy the same files into `~/docker/betiq-agent/`, then `cd ~/docker/betiq-agent && docker compose up -d --build`.
- Watcher (spends credits): `docker compose --profile watcher up -d --build`; self-test:
  `docker compose --profile watcher run --rm watcher node watcher.js --selftest`.
- Logs: `docker logs betiq-agent`, `docker exec betiq-agent cat /data/state.json` (also `spending.txt`, `weekly.txt`, `tipsters.txt`).
- GitHub Pages still serves `main` at `https://belboapps.github.io/betiq-lite/` until it is switched off (deploy.sh says so).

## Where secrets live (never copy them into files or chat)

- Odds API key: typed into the page, kept in the browser's `localStorage`. Optionally `ODDS_API_KEY` in the server `.env`.
- Server settings and secrets: `~/docker/betiq-agent/.env` (template `server/.env.example`). Possible names: `BETIQ_DB`,
  `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `ODDS_API_KEY`, `NTFY_TOPIC`, `TIPS_TOPIC`, `BETIQ_MONTHLY_LIMIT`, `CF_ACCESS_TEAM`,
  `CF_ACCESS_AUD`, `DASHBOARD_URL`, watcher `BETIQ_*`. There is also `.env.before-supabase-removal` beside it. Not read for this handoff.
- Cloudflare Worker helper: `NTFY_TOPIC` secret in the Cloudflare dashboard.
- Supabase anon key and URL (if used): typed into the app's Cloud backup panel.

## Current state

What exists on `main` (= `origin/main`, `06d2c6f`, working tree clean):

- From the chat (v1 to v27): dark card design with a 0 to 100 BetIQ score and "why this score"; power-method margin
  removal; Betfair Exchange yardstick with a liquidity guard; optional Pinnacle yardstick; verdict strip on every bet;
  Today, All bets (ranked, league filter chips, Balanced 10), My bets, More tabs; Simple view on by default; price check
  ("only worth taking at X or better"); practice mode; weekly budget and loss limits; closing-price score; suggestion log
  and track record with a self-adjusting PLACE threshold; per-bet history evidence; extra markets (BTTS, double chance,
  draw no bet, handicaps) with credit controls and Credit saver; Live watch for one in-play match; more sports
  (football, tennis, NBA recommended); calendar reminders; saved filters, price-over-time chart, CSV export, bookmaker
  account tracker; "My plan" 7-step beginner guide; zero-credit mode from the free weekly file; helper auto-load and
  free results (v27, PR #24).
- After the chat (17 to 19 Nov, other sessions): Offers tab (matched-betting calculator, close-match finder, offer tracker),
  beginner guidance, bet tools (odds converter, each-way, accumulator and same-match checkers, losing-run simulator),
  account health signs, true-cost line, "is my edge real yet?", alert decay, Today's to-do, fixes from a maths review and
  a daily-use audit, home-server agents, price watcher, test workflow, an independent football model that **failed**
  against the market (`data/MODEL_REPORT.md`; work stopped by a pre-set rule), and finally the move to the home server:
  `web.py` + `betiqdb.py` serve the page and bet log behind Cloudflare Access, and the GitHub copy has a "Move to my server"
  button that hands bets and settings across in the URL fragment.

Branches (after `git fetch`):

| Branch | State |
|---|---|
| `main` / `own-server` / `origin/main` | Same commit `06d2c6f`. Live code |
| `origin/claude/eager-volta-5ry0px` | The chat's working branch. Everything was squash-merged to `main` except its last commit `c77e3db` "Stop tracking test screenshots" (untracks 9 `tests/*.png`, adds `tests/.gitignore`). Not merged |
| `origin/claude/bet-tools`, `claude/shorter-cards`, `claude/evidence-outlook-alerts` | Fully merged (PRs #25 to #27) |
| `steady-t27`, `compact-today`, `ci-retry`, `daily-and-weekly-file`, `report-features`, `review-fixes`, `tests-workflow`, `agents` | Merged into `main` |
| `football-model` (`e00e21e`) | Cherry-picked into `main` as `bf6d464`; the branch itself looks behind, nothing new |
| `tester` (4 commits) | Older versions of CI and account-health work that landed on `main` another way; diff against `main` is mostly deletions. Probably safe to ignore, not checked line by line |
| `origin/claude/festive-hawking-bl0sdb` (7 commits) | Unrelated games ("Orbit Hop", "Trickle Down"). Not BetIQ work |

## Key decisions from the chat, and why

- **Single static page, no build step.** Simple to host and update; claude.ai artifacts cannot call the Odds API.
- **Don't trust or copy the old Gemini project** (`Documents/Gemini/betting-assistant/` on the Mac): it ran on fake data.
- **No tipster scraping or social media tips.** Unverifiable, and against sites' terms. (A later session added a tipster
  *tracker* that only scores tips the user forwards by hand.)
- **No form or head-to-head in the maths.** Across 79,000 matches they added nothing beyond the odds (`data/SIGNALS_TEST.md`).
- **Power method for margin removal.** The history test showed the proportional method overrated long shots.
- **The edge comes from best price across several bookmakers.** Value bets returned about +5% to +8% at best price,
  roughly nothing at a single bookmaker, on 80,665 past matches. Hence the push to open 3 to 5 accounts.
- **Edges over 12% are treated as stale prices** ("check first"); they lost badly in the history.
- **No horse racing.** The Odds API has no UK racing; other feeds need sign-ups and are unverified.
- **Live betting only as "Live watch" on one match**, practice mode first; credits cannot support scanning everything.
- **Don't pay yet.** The Odds API paid plan (listed at $30/month, unconfirmed) only after practice results look good.
- **Supabase is optional.** It was judged not essential; the app works fully from `localStorage`.
- **Never automate placing bets.**
- **Hosting moved away from relying on GitHub** after the user's GitHub account was suspended on 7 Nov (cause unknown;
  restored by 11 Nov). The chat suggested Netlify or Cloudflare Pages and, as precautions, batching merges and keeping
  raw data and secrets out of the public repo. The later sessions moved hosting to this home server instead.

## Known bugs, open questions, unverified things

- **Almost nothing was checked against real Odds API data in the chat.** Tests use a fake API. Unknown: extra markets on
  the free plan, in-play prices for Live watch, the Pinnacle option, team news (API-Football free plan), calendar
  reminder on a real phone. The user never sent the asked-for real-data screenshots.
- Evidence weights and PLACE thresholds are judgement calls until the track record has 30+ results per band.
- Some browser tests have been timing-flaky (t20 once, t27 fixed in `steady-t27`); `run-all.sh` retries once.
- An occasional empty bet log after an instant reload was seen in tests on 6 Nov; believed to be a test artefact, never proven.
- Tennis results may need settling by hand. Team-name matching between Odds API and football-data results is fuzzy.
- Server agents and watcher: the README says "not yet run against a real Supabase project or the real Odds API". Unknown whether
  the deployed agent now uses `BETIQ_DB` (local SQLite) or Supabase.

## What the user still needed to do (as of the chat's end, 16 Nov)

- Paste helper v2 (`helper/worker.js`) into Cloudflare and confirm the helper page shows "(v2)". The user's last message
  ("I haven't done any of this, is this not something that can be automated?") was unanswered in substance: the chat
  offered (a) connecting Cloudflare Workers to the GitHub repo, or (b) a limited Cloudflare API token. It is unclear whether
  the user had even done the original Cloudflare setup (they said "I have done all the stages" earlier).
- Set weekly budget and loss limit; run practice mode for 2 to 4 weeks; tick bookmakers; open 3 to 5 bookmaker accounts
  with deposit limits (suggested Bet365, William Hill, BetVictor, Paddy Power or Sky Bet, plus Betfair or Smarkets).
- Try Live watch on one real match in practice mode and report what the panel says.
- Optional: ntfy notifications for the helper; switch off GitHub Pages and make the repo private.

## Suggested next steps

1. Ask the user what they now use day to day (home-server address or GitHub Pages) and whether the helper is deployed.
2. Get one real-data session: a refresh, the Credit use panel, the markets list, one card.
3. Decide on GitHub Pages: once the home server is the main copy, switch Pages off and consider making the repo private.
4. Bump `VERSION` in `index.html` (still says v27).
5. Optionally merge or cherry-pick `c77e3db` (untrack test screenshots), and remove the stray tracked `.DS_Store` and empty `hist2.sqlite`.
6. The background price watcher exists (`--profile watcher`) but is not running; only start it with the user's agreement (it spends credits).
7. Clean up stale branches (`tester`, `football-model`, the merged `claude/*` ones) if the user wants.

## Discrepancies between the chat and this folder

- Chat paths were `/home/user/betiq-lite` in a cloud container; here it is `/home/belbo/code/betiq-lite`. The original
  handoff mentioned `Documents/Gemini/betting-assistant/betiq-lite/` on the Mac.
- The chat ended at v27 with GitHub Pages as the host. This folder has three more days of work from other sessions, with
  hosting moved to the home server, but the footer `VERSION` was never bumped past v27.
- The chat's last cleanup commit (`c77e3db`, untrack 9 test screenshots) is on `claude/eager-volta-5ry0px` only; the PNGs are still tracked on `main`.
- The chat said the Supabase backup was "not tested against a real project". Later commits read the bet log from a real
  Supabase project and then replaced it with a SQLite store on this server (`.env.before-supabase-removal` exists), so
  Supabase may no longer be in use. Not confirmed.
- The chat removed the GitHub alerts workflow to reduce automation on the account. A new `tests.yml` workflow now runs on every push.
- `supabase/README.md` still points the sign-in address at the GitHub Pages URL.
- `.DS_Store` and an empty `hist2.sqlite` are committed at the repo root.
- `tests/README.md` lists tests up to t39; `tests/t40.js` exists too.

## Source

Cloud session `session_01FWFUotqGjcBeonWUTGHWET` ("BetIQ Lite project handoff", 6 to 16 Nov 2026). Read it with
`mcp__claude-code-remote__list_events` (kinds `user`, `assistant`, `result`). Its work was pushed to `claude/eager-volta-5ry0px` and squash-merged to `main` (last PR #24).
Repo: `git@github.com:belboapps/betiq-lite.git`.
