# The helper (optional)

A tiny free program that fetches the weekly prices file for the app, so you never download it by hand. It can also send
one phone notification when a new file contains value bets. It holds no keys and no betting-account details.

It runs on Cloudflare's free Workers plan. Cloudflare's menus change, so names below may differ slightly. Before you
start, read Cloudflare's terms yourself: this is a personal page that compares public odds, takes no payments and shows no adverts.

## Set it up (about 10 minutes)

1. Create a free account at cloudflare.com.
2. In the dashboard open **Workers & Pages**, choose **Create**, then **Worker** (the "Hello World" starter). Name it, for example `betiq-helper`, and **Deploy**.
3. Choose **Edit code**. Delete everything in the editor, paste the whole of `helper/worker.js` from this repository, and **Deploy**.
4. Copy the worker's address. It looks like `https://betiq-helper.YOURNAME.workers.dev`. Opening it should show "BetIQ Lite helper is running".
5. In the app: **More > Free weekly prices > Load it automatically**. Paste the address and press **Save and load**.

## What it does once connected

- Loads the newest prices file into the app by itself.
- Fills in football results for free, so finished bets and the app's track record settle without spending credits. Results appear when the source site publishes them, which can be a day or two after a match.

When this file changes in the repository, paste the new `helper/worker.js` over the old code in Cloudflare (**Edit code**, replace everything, **Deploy**). The helper's front page shows its version.

## Phone notifications (optional)

1. Install the free **ntfy** app and subscribe to a topic with a long random name. Anyone who knows the name can read the alerts, so keep it private.
2. In the worker open **Settings > Variables and Secrets** and add a secret named `NTFY_TOPIC` with that name as its value.
3. Open **Settings > Triggers** (or **Triggers > Cron Triggers**) and add the schedule `0 16 * * *` (once a day, 16:00 UTC).

You are only notified when a new file has appeared in the last day **and** it contains value bets, which is rare. No notification usually means nothing qualified.

Optional variables: `BOOKS` (the bookmakers you use, from `B365,BFD,BV,BW,PP,SKB`) and `APP_URL` (the address the notification opens).

## Good to know

- The file comes from football-data.co.uk, which publishes it free of charge and states no licence. Keep this for personal use. The helper asks that site at most 8 times a day.
- The prices are a snapshot from a few days before each match. Always check the live price in your bookmaker's app before betting.
- To stop, delete the worker in Cloudflare and clear the address in the app.
