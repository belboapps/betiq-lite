# Historical results and odds

`history_build.py` downloads past football results and bookmaker odds from football-data.co.uk, builds a local SQLite database, and replays the page's rules over those matches to see how the suggested bets would have turned out.

```
python3 history_build.py build  --db history.sqlite --raw raw
python3 history_build.py report --db history.sqlite --out HISTORY_REPORT.md
```

`HISTORY_REPORT.md` holds the findings (calibration, return on flagged bets, comparison of margin-removal methods).

The downloaded files and the database are deliberately **not** committed: football-data.co.uk states no licence for redistribution, and this repository is public. `.gitignore` keeps them out. The script downloads them again on demand.
