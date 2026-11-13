# Tests

Headless-browser checks of `index.html` against a fake Odds API, at phone width. They need Node and Playwright with Chromium.

```
cd tests
for t in t14 t15 t16 t17 t19 t20 t21 t22 t23 t24 t25 t26 t27; do node $t.js; done
```

Each script prints what it checked; `errs []` at the end means no page errors. t23 takes a mode (`sharp`, `refuse`, `off`, `kick`), t21 and t13-style scripts take `refuse`.

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

Mock data is for testing only and never ships in the page.
