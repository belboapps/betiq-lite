# Home-server agents (optional)

A small program for an always-on machine that runs Docker. It reads your bet log from your Supabase project
(set up cloud backup first: see `supabase/README.md`) and:

| Agent | What it does | Needs |
|---|---|---|
| Backup | A copy of the whole bet log each night in `server/backups`, kept 30 days | Supabase |
| Closing-price collector | Saves the final fair price about 20 minutes before kick-off for each open match-result bet, so the closing-price score no longer needs the page open | Odds API key |
| Spending guardian | A monthly line in `spending.txt` (stakes, returns, net) and one warning when the month's stakes pass your limit | Supabase |
| Morning message | How many bets kick off today and how many are waiting for a result | ntfy topic |
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

   Fill in the Supabase address and the `service_role` key. That key can read and change every row, which is why it
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
