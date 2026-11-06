# Phone alerts for BetIQ Lite

Once a day GitHub checks the prices for you and sends a notification to your phone if a bet beats the market.
It uses the same rules as the page. You still decide whether to bet, and you set your stake on the page.

**Cost:** nothing. It uses your Odds API credits: with 4 leagues that is about 4 a day, around 120 a month, out of your 500.
It stops by itself when fewer than 150 credits are left, so the page always keeps some.

## One-off setup (about 10 minutes)

1. **Phone:** install the free app **ntfy** (App Store or Google Play). Open it, tap **+**, and subscribe to a topic with a long random name, for example `betiq-` followed by 12 random letters and numbers. Anyone who knows the name can read your alerts, so keep it private. Write it down.
2. **GitHub, add two secrets:** open your `betiq-lite` repo, then **Settings, Secrets and variables, Actions, New repository secret**. Add:
   * name `ODDS_API_KEY`, value: your Odds API key
   * name `NTFY_TOPIC`, value: the topic name from step 1
3. **Test it:** open the **Actions** tab, choose **BetIQ alerts** on the left, tap **Run workflow**. A green tick means it worked. You only get a notification if there is a value bet at that moment, so no notification does not mean it failed. Open the run to read what it found.

## Changing it

* **Leagues, kick-off window, how many bets per alert:** edit `alerts/config.json` on GitHub (pencil icon).
* **Your bookmakers:** in `config.json`, change `"bookmakers": null` to a list, for example `["Bet365", "Sky Bet"]`. Use the names exactly as the page shows them.
* **How often:** edit the `cron` line in `.github/workflows/alerts.yml`. Each extra run a day costs about 120 more credits a month.

GitHub switches scheduled jobs off if the repo has no activity for 60 days. If alerts stop, open Actions and press Enable or Run workflow.
