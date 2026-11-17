# Home-server agents (optional)

A small program for an always-on machine that runs Docker. It reads your bet log from your Supabase project
(set up cloud backup first: see `supabase/README.md`) and:

| Agent | What it does | Needs |
|---|---|---|
| Backup | A copy of the whole bet log each night in `server/backups`, kept 30 days | Supabase |
| Closing-price collector | Saves the final fair price about 20 minutes before kick-off for each open match-result bet, so the closing-price score no longer needs the page open | Odds API key |
| Spending guardian | A monthly line in `spending.txt` (stakes, returns, net) and one warning when the month's stakes pass your limit | Supabase |
| Morning message | How many bets kick off today and how many are waiting for a result | ntfy topic |
| Weekly review | Each week in `weekly.txt`: results and the closing-price score, real and practice bets apart | Supabase |
| Tipster tracker | Rates tipsters on return and on beating the final price, from tips you forward | A private ntfy topic for tips |
| Price watcher | Alerts when a bet reaches PLACE, with the page closed. Separate and optional: see below | Odds API key, ntfy topic |
| Health checker | Says when Supabase, the Odds API key, the page or the backup stops working, and when it is fixed | ntfy topic |

It only reports. It never places a bet, and phone messages carry counts, never amounts.

## Set it up

1. Copy the `server` folder to the machine and, inside it:

   ```bash
   cp .env.example .env
   ```

   ```bash
   nano .env
   ```

   Fill in the Supabase address and the secret key (it starts `sb_secret_`; on older projects it is called
   `service_role`). The publishable or anon key will not work. That key can read and change every row, which is why it
   lives only in this file on your own machine. The other lines are optional.

2. Build and start it.

   ```bash
   docker compose up -d --build
   ```

3. Check it.

   ```bash
   docker logs betiq-agent
   ```

   ```bash
   docker exec betiq-agent cat /data/state.json
   ```

   The monthly money summary is read with `docker exec betiq-agent cat /data/spending.txt`.

## Tipster tracker (optional)

1. In the ntfy app, make up a second topic with a long random name and put it in `.env` as `TIPS_TOPIC`. Anyone who
   knows the name can post to it, so keep it private. Restart with `docker compose up -d`.
2. When a tipster posts a tip, send one line to that topic from the ntfy app:

   ```
   Sharp Sam; Arsenal v Everton; Arsenal; 2.10
   ```

   That is the tipster, the match, the selection (one of the teams, or `draw`) and the odds, separated by semicolons.
3. Read the table with `docker exec betiq-agent cat /data/tipsters.txt`.

Only football match-result tips, in the leagues football-data.co.uk covers. The time ntfy received the line is the
time the tip was captured: one that arrives after kick-off is kept but never counted. Each tip is scored at one unit.
Results and final prices come from football-data.co.uk's free files, a day or two after the match. Under 100 counted
tips a tipster is marked too early to judge. It does not read any tipster's site or feed itself.

The weekly review is read with `docker exec betiq-agent cat /data/weekly.txt`.

## Price watcher (optional, spends credits)

Opens the real BetIQ page in a hidden browser on the server every half hour, so the page's own automatic refresh and
its own "N bets say PLACE" phone alert work with the page closed. Because it is the page itself, the verdict rules are
the same ones you see on your phone.

The hidden browser has its own settings, set in `.env`. It cannot see the ones on your phone, so if you have ticked
particular bookmakers or leagues there, list the same ones in `BETIQ_BOOKS` and `BETIQ_LEAGUES`. It does not know which
bets you have already logged, your loss limits or your tuned PLACE threshold.

1. In `.env` set `ODDS_API_KEY` and `NTFY_TOPIC`, and look at the watcher lines at the bottom.
2. Start it:

   ```bash
   docker compose --profile watcher up -d --build
   ```

3. See what the last visit did (counts only):

   ```bash
   docker logs --tail 5 betiq-watcher
   ```

Credits: one per league each time prices are reloaded. The defaults (two leagues, every six hours) use about 240 a
month and stop when fewer than 150 remain, so your phone keeps some. It starts again by itself when credits return.

To check it without spending anything, this runs the real page against made-up prices:

```bash
docker compose --profile watcher run --rm watcher node watcher.js --selftest
```

## Good to know

- Closing prices use the same sums as the page with Pinnacle switched off: a busy Betfair Exchange market if there is
  one, otherwise the bookmaker average. Bets on other markets (totals, handicaps) are left to the page.
- Each saved price costs one Odds API credit per league with a bet about to start, at most twice per bet.
- If you change a bet on your phone in the same few minutes and it has not synced yet, the newest change wins,
  exactly as between two phones.
- Not yet run against a real Supabase project or the real Odds API. Watch the first few days.

## Tests

```bash
python3 -m unittest discover server
```
