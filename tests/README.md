# Tests

Headless-browser checks of `index.html` against a fake Odds API, at phone width. They need Node and Playwright with Chromium.

```
tests/run-all.sh
```

`run-all.sh` runs every `t*.js`, retries a failure once and names failures at the end. Each script prints what it checked; `errs []` at the end means no page errors. t23 takes a mode (`sharp`, `refuse`, `off`, `kick`), t21 and t13-style scripts take `refuse`.

| Script | Checks |
|---|---|
| t14 | settlement rules for every market type |
| t15 | closing prices, loss limits, credit controls |
| t16 | team news (works / plan blocked / network blocked), guided tour |
| t17 | Supabase cloud backup sync between two devices |
| t19 | dark card layout, score, details sheet |
| t20 | suggestion log, track record, what-to-do lines, calendar reminder |
| t21 | Live watch (standout, cap, refusal) |
| t22 | other sports: handicaps, units, verdict strip |
| t23 | Pinnacle yardstick and kick-off auto-refresh |
| t24 | verdict scorecard and self-adjusting PLACE threshold |
| t25 | recommended sports button |
| t26 | Simple view and automatic record updates |
| t27 | saved filters, price chart, spreadsheet export, bookmaker accounts |
| t29 | helper auto-load and the My plan guide |
| t30 | free results through the helper |
| t28 | exchange yardstick, free weekly file (pass a real fixtures.csv as an argument to test it), credit saver |
| t31 | evidence that matches your bookmakers, pounds outlook, STRONG EVIDENCE badge, minimum-chance filter, phone alerts |
| t32 | Offers tab: matched-betting sums against hand-worked figures, close-match finder with real and estimated lay prices, offer tracker |
| t33 | Risk / Reward / Value displays, plain-words line, sortable bets, the match page, the scorecard |
| t34 | beginner guidance: how-to-place steps, fractional odds, page hints, simpler card in Simple view |
| t35 | Offers tab for beginners: the guided walk-through from adding an offer to finishing it |
| t36 | Bet tools: odds converter, each-way calculator, accumulator checker, against hand-worked figures |
| t37 | Bet tools: same-match bet checker against an independent calculation, losing-run simulator |
| t38 | Account health: the signs that a bookmaker may limit an account (no browser needed) |
| t39 | True-cost line, edge panel, alert decay, offer value checker, account stages and deposit tracker (no browser needed) |
| t40 | Moving to the home server: the GitHub copy offers the move, the server copy takes in bets and settings and saves to the server |

Mock data is for testing only and never ships in the page.
