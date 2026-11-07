#!/usr/bin/env python3
"""
Builds a local SQLite database of past football matches, bookmaker odds and results from football-data.co.uk,
then replays BetIQ Lite's rules over that history to see how its suggested bets would have turned out.

Run:   python3 history_build.py build  --db history.sqlite --raw raw
       python3 history_build.py report --db history.sqlite --out HISTORY_REPORT.md

Only the standard library is used. The raw files and the database are NOT meant to be committed to a public repo
(the source states no licence), so .gitignore keeps them out.
"""
import argparse, csv, math, os, random, sqlite3, sys, time, urllib.request, urllib.error
from datetime import datetime

LEAGUES = {"E0": "Premier League", "E1": "Championship", "E2": "League One", "E3": "League Two", "EC": "Conference",
           "SC0": "Scottish Premiership", "D1": "Bundesliga", "SP1": "La Liga", "I1": "Serie A", "F1": "Ligue 1",
           "N1": "Eredivisie", "B1": "Belgian Pro League", "P1": "Primeira Liga", "T1": "Turkish Super Lig", "G1": "Greek Super League"}
ENGLAND = ("E0", "E1", "E2", "E3", "EC")
SEASONS = ["1213", "1314", "1415", "1516", "1617", "1718", "1819", "1920", "2021", "2122", "2223", "2324", "2425", "2526", "2627"]
H2H_BOOKS = ["B365", "BW", "IW", "PS", "WH", "VC", "LB", "BF", "1XB", "SB", "GB", "BS", "SJ", "Max", "Avg", "BFE"]
UK_BOOKS = ["B365", "WH", "LB", "BW", "VC", "BF", "IW"]          # stand-ins for the UK bookmakers the app compares
TOT_BOOKS = {"B365": "B365", "P": "PS", "GB": "GB", "BS": "BS", "Max": "Max", "Avg": "Avg", "BFE": "BFE", "BbMx": "Max", "BbAv": "Avg"}
VALUE_MIN, VALUE_MAX, LONGSHOT = 0.03, 0.12, 4.0                 # same thresholds as the page


def download(raw_dir, refresh=False):
    os.makedirs(raw_dir, exist_ok=True)
    got = 0
    for s in SEASONS:
        for d in LEAGUES:
            path = os.path.join(raw_dir, "%s_%s.csv" % (s, d))
            if os.path.exists(path) and os.path.getsize(path) > 0 and not refresh:
                got += 1; continue
            url = "https://football-data.co.uk/mmz4281/%s/%s.csv" % (s, d)
            try:
                req = urllib.request.Request(url, headers={"User-Agent": "betiq-lite-research/1.0"})
                with urllib.request.urlopen(req, timeout=30) as r:
                    data = r.read()
                if len(data) > 200 and b"HomeTeam" in data[:600]:
                    open(path, "wb").write(data); got += 1
                time.sleep(0.25)
            except (urllib.error.HTTPError, urllib.error.URLError) as e:
                print("skip", s, d, e, file=sys.stderr)
    print("files available:", got)


def num(x):
    try:
        v = float(x)
        return v if v > 1.0 else None
    except (TypeError, ValueError):
        return None


def parse_date(t):
    for f in ("%d/%m/%Y", "%d/%m/%y"):
        try:
            return datetime.strptime(t.strip(), f).strftime("%Y-%m-%d")
        except ValueError:
            pass
    return None


def build(db_path, raw_dir):
    download(raw_dir)
    if os.path.exists(db_path):
        os.remove(db_path)
    db = sqlite3.connect(db_path)
    db.executescript("""
    CREATE TABLE matches(id INTEGER PRIMARY KEY, season TEXT, div TEXT, league TEXT, date TEXT, home TEXT, away TEXT,
                         fthg INT, ftag INT, ftr TEXT, hthg INT, htag INT);
    CREATE TABLE odds(match_id INT, market TEXT, book TEXT, phase TEXT, o1 REAL, o2 REAL, o3 REAL);   -- h2h: home/draw/away, totals25: over/under
    CREATE TABLE ah(match_id INT, phase TEXT, line REAL, book TEXT, home REAL, away REAL);
    CREATE INDEX odds_m ON odds(match_id, market, phase);
    """)
    n = 0
    for s in SEASONS:
        for d, lname in LEAGUES.items():
            path = os.path.join(raw_dir, "%s_%s.csv" % (s, d))
            if not os.path.exists(path):
                continue
            with open(path, newline="", encoding="utf-8-sig", errors="replace") as fh:
                for r in csv.DictReader(fh):
                    date = parse_date(r.get("Date", "") or "")
                    if not date or r.get("FTR") not in ("H", "D", "A") or not r.get("HomeTeam"):
                        continue
                    try:
                        hg, ag = int(r["FTHG"]), int(r["FTAG"])
                    except (ValueError, KeyError):
                        continue
                    cur = db.execute("INSERT INTO matches(season,div,league,date,home,away,fthg,ftag,ftr,hthg,htag) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                                     (s, d, lname, date, r["HomeTeam"], r["AwayTeam"], hg, ag, r["FTR"],
                                      int(r["HTHG"]) if (r.get("HTHG") or "").isdigit() else None, int(r["HTAG"]) if (r.get("HTAG") or "").isdigit() else None))
                    mid = cur.lastrowid; n += 1
                    for b in H2H_BOOKS:
                        for ph, c in (("open", ""), ("close", "C")):
                            o = [num(r.get("%s%s%s" % (b, c, k))) for k in ("H", "D", "A")]
                            if all(o):
                                db.execute("INSERT INTO odds VALUES(?,?,?,?,?,?,?)", (mid, "h2h", b, ph, o[0], o[1], o[2]))
                    for old, b in (("BbMx", "Max"), ("BbAv", "Avg")):          # older seasons call the market best/average Betbrain
                        o = [num(r.get("%s%s" % (old, k))) for k in ("H", "D", "A")]
                        if all(o) and not db.execute("SELECT 1 FROM odds WHERE match_id=? AND market='h2h' AND book=? AND phase='open'", (mid, b)).fetchone():
                            db.execute("INSERT INTO odds VALUES(?,?,?,?,?,?,?)", (mid, "h2h", b, "open", o[0], o[1], o[2]))
                    for col, b in TOT_BOOKS.items():
                        for ph, c in (("open", ""), ("close", "C")):
                            ov, un = num(r.get("%s%s>2.5" % (col, c))), num(r.get("%s%s<2.5" % (col, c)))
                            if ov and un:
                                db.execute("INSERT INTO odds VALUES(?,?,?,?,?,?,NULL)", (mid, "totals25", b, ph, ov, un))
                    for ph, hc in (("open", "AHh"), ("close", "AHCh")):
                        try:
                            line = float(r.get(hc, ""))
                        except ValueError:
                            continue
                        for col, b in (("B365", "B365"), ("P", "PS"), ("Max", "Max"), ("Avg", "Avg")):
                            c = "C" if ph == "close" else ""
                            h, a = num(r.get("%s%sAHH" % (col, c))), num(r.get("%s%sAHA" % (col, c)))
                            if h and a:
                                db.execute("INSERT INTO ah VALUES(?,?,?,?,?,?)", (mid, ph, line, b, h, a))
    db.commit()
    print("matches:", n)
    simulate(db)
    db.commit()
    db.close()


METHOD = "power"      # "prop" = divide by the total (what the page used until now); "power" = shrink long shots (fits real results better)


def demargin(prices):
    inv = [1.0 / p for p in prices]
    if METHOD == "prop":
        t = sum(inv)
        return [i / t for i in inv]
    lo, hi = 0.5, 3.0                      # find k so that the chances add up to exactly 1
    for _ in range(60):
        k = (lo + hi) / 2
        if sum(x ** k for x in inv) > 1: lo = k
        else: hi = k
    return [x ** k for x in inv]


def simulate(db):
    """Replay the page's rules: average the margin-free chances across bookmakers, take the best price, flag VALUE at 3-12% with a 4.0 odds cap."""
    db.executescript("""
    DROP TABLE IF EXISTS sim_bets;
    CREATE TABLE sim_bets(match_id INT, season TEXT, league TEXT, date TEXT, market TEXT, variant TEXT, sel TEXT, n_books INT,
                          fair REAL, best REAL, best_book TEXT, ev REAL, value INT, suspect INT, tier TEXT, won INT,
                          profit_best REAL, odds_b365 REAL, profit_b365 REAL, close_fair REAL, clv REAL);
    CREATE INDEX sb_v ON sim_bets(variant, market, value);
    """)
    matches = db.execute("SELECT id, season, league, date, ftr, fthg, ftag FROM matches").fetchall()
    odds = {}
    for mid, mk, bk, ph, o1, o2, o3 in db.execute("SELECT * FROM odds"):
        odds.setdefault((mid, mk, ph), {})[bk] = (o1, o2, o3)
    rows = []
    def tier(f): return "safer" if f >= 0.5 else "mid" if f >= 0.3 else "long"
    def add(m, market, variant, sels, fairs, prices, books, nb, b365, closefair, wins):
        for i, sel in enumerate(sels):
            best = prices[i]
            ev = fairs[i] * best - 1
            won = 1 if wins[i] else 0
            pb = (b365[i] if b365 and b365[i] else None)
            cf = closefair[i] if closefair else None
            rows.append((m[0], m[1], m[2], m[3], market, variant, sel, nb, fairs[i], best, books[i], ev,
                         1 if (VALUE_MIN <= ev <= VALUE_MAX and best <= LONGSHOT and nb >= 4) else 0, 1 if ev > VALUE_MAX else 0,
                         tier(fairs[i]), won, (best - 1) if won else -1.0, pb, ((pb - 1) if won else -1.0) if pb else None,
                         cf, (best * cf - 1) if cf else None))
    for m in matches:
        mid, ftr, hg, ag = m[0], m[4], m[5], m[6]
        o_open, o_close = odds.get((mid, "h2h", "open"), {}), odds.get((mid, "h2h", "close"), {})
        # closing fair: Pinnacle if present, else market average
        cl = o_close.get("PS") or o_close.get("Avg")
        closefair = demargin(cl) if cl else None
        wins = [ftr == "H", ftr == "D", ftr == "A"]
        b365 = o_open.get("B365")
        # variant 1: app-like, individual UK bookmakers
        uk = {b: o_open[b] for b in UK_BOOKS if b in o_open}
        if len(uk) >= 4:
            fairs = [sum(demargin(p)[i] for p in uk.values()) / len(uk) for i in range(3)]
            best = [max(p[i] for p in uk.values()) for i in range(3)]
            bk = [max(uk, key=lambda b: uk[b][i]) for i in range(3)]
            add(m, "h2h", "uk4", ["H", "D", "A"], fairs, best, bk, len(uk), b365, closefair, wins)
        # variant 3: how a professional would do it: Pinnacle's opening price as the fair price, best price among the UK bookmakers
        ps = o_open.get("PS")
        if ps and len(uk) >= 3:
            fairs = demargin(list(ps))
            best = [max(p[i] for p in uk.values()) for i in range(3)]
            bk = [max(uk, key=lambda b: uk[b][i]) for i in range(3)]
            add(m, "h2h", "sharp", ["H", "D", "A"], fairs, best, bk, len(uk) + 1, b365, closefair, wins)
        # variant 2: market average and best price (many bookmakers behind each)
        if "Avg" in o_open and "Max" in o_open:
            fairs = demargin(o_open["Avg"])
            add(m, "h2h", "maxavg", ["H", "D", "A"], fairs, list(o_open["Max"]), ["Max"] * 3, 10, b365, closefair, wins)
        # over/under 2.5 goals, market average and best price
        t_open, t_close = odds.get((mid, "totals25", "open"), {}), odds.get((mid, "totals25", "close"), {})
        if "Avg" in t_open and "Max" in t_open:
            tf = demargin([t_open["Avg"][0], t_open["Avg"][1]])
            tc = t_close.get("PS") or t_close.get("Avg")
            tcf = demargin([tc[0], tc[1]]) if tc else None
            tb = t_open.get("B365")
            add(m, "totals25", "maxavg", ["O", "U"], tf, [t_open["Max"][0], t_open["Max"][1]], ["Max", "Max"], 10,
                [tb[0], tb[1]] if tb else None, tcf, [hg + ag > 2.5, hg + ag < 2.5])
    db.executemany("INSERT INTO sim_bets VALUES(%s)" % ",".join("?" * 21), rows)
    print("simulated bets:", len(rows))


def evidence(db_path, out_path):
    """Compact table of how past bets of each kind turned out, for the page to show next to each bet."""
    import json
    db = sqlite3.connect(db_path)
    buckets = [("none", -9, 0), ("tiny", 0, 0.01), ("small", 0.01, 0.03), ("value", 0.03, 0.06), ("big", 0.06, 0.12), ("huge", 0.12, 9)]
    tiers = {"safer": "fair>=0.5", "mid": "fair>=0.3 AND fair<0.5", "long": "fair<0.3"}
    out = {}
    for key, variant, market in (("h2h", "uk4", "h2h"), ("goals", "maxavg", "totals25")):
        for tn, tw in tiers.items():
            for bn, lo, hi in buckets:
                w = "variant='%s' AND market='%s' AND %s AND ev>%s AND ev<=%s" % (variant, market, tw, lo, hi)
                v = [r[0] for r in db.execute("SELECT profit_best FROM sim_bets WHERE %s" % w)]
                if len(v) < 30: continue
                n, mean, ci = stats(v)
                b = [r[0] for r in db.execute("SELECT profit_b365 FROM sim_bets WHERE %s AND profit_b365 IS NOT NULL" % w)]
                nb, mb, cb = stats(b) if len(b) > 1 else (0, 0.0, 0.0)
                won, pred = db.execute("SELECT AVG(won), AVG(fair) FROM sim_bets WHERE %s" % w).fetchone()
                out["%s|%s|%s" % (key, tn, bn)] = {"n": n, "won": round(won, 3), "pred": round(pred, 3), "roi": round(mean, 3), "ci": round(ci, 3), "roiB": round(mb, 3) if nb else None, "ciB": round(cb, 3) if nb else None}
    json.dump(out, open(out_path, "w"), separators=(",", ":"), sort_keys=True)
    print("evidence cells:", len(out), "->", out_path)


def stats(vals):
    n = len(vals)
    if n < 2:
        return n, (vals[0] if n else 0.0), 0.0
    mean = sum(vals) / n
    sd = math.sqrt(sum((v - mean) ** 2 for v in vals) / (n - 1))
    return n, mean, 1.96 * sd / math.sqrt(n)


def report(db_path, out_path):
    db = sqlite3.connect(db_path)
    L = []
    def p(s=""): L.append(s)
    def roi(where, col="profit_best", args=()):
        v = [r[0] for r in db.execute("SELECT %s FROM sim_bets WHERE %s AND %s IS NOT NULL" % (col, where, col), args)]
        n, mean, ci = stats(v)
        return n, mean * 100, ci * 100
    def row(label, where, args=()):
        n, r, ci = roi(where, "profit_best", args)
        n2, r2, ci2 = roi(where, "profit_b365", args)
        hit = db.execute("SELECT AVG(won), AVG(fair) FROM sim_bets WHERE %s" % where, args).fetchone()
        clv = db.execute("SELECT AVG(clv)*100 FROM sim_bets WHERE %s AND clv IS NOT NULL" % where, args).fetchone()[0]
        return "| %s | %d | %.1f%% | %.1f%% | %+.1f%% (+/-%.1f) | %s | %s |" % (
            label, n, (hit[0] or 0) * 100, (hit[1] or 0) * 100, r, ci, ("%+.1f%% (+/-%.1f)" % (r2, ci2)) if n2 > 1 else "n/a",
            ("%+.1f%%" % clv) if clv is not None else "n/a")
    hdr = "| Group | Bets | Won | Predicted | ROI at best price | ROI at Bet365 price | Beat closing price by |\n|---|---|---|---|---|---|---|"
    tot = db.execute("SELECT COUNT(*), MIN(date), MAX(date) FROM matches").fetchone()
    p("# How BetIQ Lite's rules would have done on past matches"); p()
    p("Generated from football-data.co.uk results and bookmaker odds. %d matches from %s to %s across %d leagues." % (tot[0], tot[1], tot[2], db.execute("SELECT COUNT(DISTINCT div) FROM matches").fetchone()[0])); p()
    p("**How to read it.** Each row replays a rule over every past match, staking 1 unit per bet. *Won* is the share of bets that won, *Predicted* is the average win chance the rules had worked out (if they match, the chances are well calibrated). *ROI* is profit divided by money staked. *Beat closing price by* is the value against the final fair market price, positive meaning better than where the market settled. The +/- is a 95% margin of error.")
    p()
    p("## Coverage"); p(); p("| League | Matches |"); p("|---|---|")
    for lg, n in db.execute("SELECT league, COUNT(*) FROM matches GROUP BY league ORDER BY 2 DESC"):
        p("| %s | %d |" % (lg, n))
    p(); p("Seasons: " + ", ".join("%s (%d)" % (a, b) for a, b in db.execute("SELECT season, COUNT(*) FROM matches GROUP BY season ORDER BY season")))
    p(); p("Closing prices (needed for the closing-price columns) only exist from 2019/20. Older seasons still count for results and return.")
    p()
    for variant, title in (("uk4", "Rules as the app applies them (individual UK bookmakers, best price among them)"),
                           ("maxavg", "Cross-check using market average and best available price"),
                           ("sharp", "What a professional would do: Pinnacle's opening price as the fair price, best price among the UK bookmakers")):
        p("## " + title); p(); p(hdr)
        for mk in ("h2h", "totals25"):
            if not db.execute("SELECT 1 FROM sim_bets WHERE variant=? AND market=? LIMIT 1", (variant, mk)).fetchone():
                continue
            w = "variant='%s' AND market='%s'" % (variant, mk)
            p(row("%s: every bet" % mk, w))
            p(row("%s: VALUE flagged (3-12%%, odds up to 4.0)" % mk, w + " AND value=1"))
            p(row("%s: not flagged" % mk, w + " AND value=0 AND suspect=0"))
            p(row("%s: 'check price' (over 12%%)" % mk, w + " AND suspect=1"))
        p()
    eng = "league IN ('Premier League','Championship','League One','League Two','Conference')"
    p("## English leagues only"); p(); p(hdr)
    for variant in ("uk4", "maxavg", "sharp"):
        p(row("%s: every bet" % variant, "variant='%s' AND market='h2h' AND %s" % (variant, eng)))
        p(row("%s: VALUE flagged" % variant, "variant='%s' AND market='h2h' AND value=1 AND %s" % (variant, eng)))
    p(); p("## Does beating the closing price predict profit? (match winner, seasons with closing prices)"); p()
    p("If the closing price is the market's best guess, bets that beat it by more should earn more. Closing price here is Pinnacle's, with the margin removed."); p(); p(hdr)
    for variant in ("uk4", "maxavg", "sharp"):
        for lo, hi, nm in ((-9, -0.05, "worse than closing by over 5%"), (-0.05, 0, "worse by up to 5%"), (0, 0.03, "better by up to 3%"), (0.03, 0.06, "better by 3 to 6%"), (0.06, 9, "better by over 6%")):
            p(row("%s: %s" % (variant, nm), "variant='%s' AND market='h2h' AND clv IS NOT NULL AND clv>%s AND clv<=%s" % (variant, lo, hi)))
    p(); p("## VALUE-flagged bets by risk level (app-like rules, match winner)"); p(); p(hdr)
    for t, nm in (("safer", "Safer (50%+ chance)"), ("mid", "Middle (30-50%)"), ("long", "Longer shots (under 30%)")):
        p(row(nm, "variant='uk4' AND market='h2h' AND value=1 AND tier='%s'" % t))
    p(); p("## By size of the price edge (app-like rules, match winner)"); p(); p(hdr)
    for lo, hi in ((-1, 0), (0, 0.01), (0.01, 0.03), (0.03, 0.06), (0.06, 0.12), (0.12, 9)):
        p(row("edge %+.0f%% to %+.0f%%" % (lo * 100, hi * 100), "variant='uk4' AND market='h2h' AND ev>%s AND ev<=%s" % (lo, hi)))
    p(); p("## VALUE-flagged bets by season (app-like rules, match winner)"); p(); p(hdr)
    for (s,) in db.execute("SELECT DISTINCT season FROM sim_bets WHERE variant='uk4' ORDER BY season"):
        p(row("season " + s, "variant='uk4' AND market='h2h' AND value=1 AND season='%s'" % s))
    p(); p("## VALUE-flagged bets by league (app-like rules, match winner)"); p(); p(hdr)
    for (lg,) in db.execute("SELECT DISTINCT league FROM sim_bets WHERE variant='uk4' ORDER BY league"):
        p(row(lg, "variant='uk4' AND market='h2h' AND value=1 AND league=?", (lg,)))
    p(); p("## Calibration: do the chances match reality? (app-like rules, match winner, every bet)"); p()
    p("| Predicted chance | Bets | Actually won |"); p("|---|---|---|")
    for lo in range(0, 100, 10):
        r = db.execute("SELECT COUNT(*), AVG(won), AVG(fair) FROM sim_bets WHERE variant='uk4' AND market='h2h' AND fair>=? AND fair<?", (lo / 100, (lo + 10) / 100)).fetchone()
        if r[0]:
            p("| %d%% to %d%% (avg predicted %.0f%%) | %d | %.1f%% |" % (lo, lo + 10, r[2] * 100, r[0], r[1] * 100))
    p(); p("## Match-winner favourites (always back the shortest price)"); p(); p(hdr)
    db.execute("DROP TABLE IF EXISTS fav"); db.execute("CREATE TEMP TABLE fav AS SELECT match_id, MAX(fair) AS mf FROM sim_bets WHERE variant='uk4' AND market='h2h' GROUP BY match_id")
    db.execute("CREATE INDEX fav_i ON fav(match_id)")
    p(row("favourite each match", "variant='uk4' AND market='h2h' AND match_id IN (SELECT match_id FROM fav) AND fair=(SELECT mf FROM fav WHERE fav.match_id=sim_bets.match_id)"))
    p(); p("## Which way of removing the bookmaker's margin predicts best? (market average opening odds, every match)"); p()
    p("Bookmakers add a margin, so their odds imply chances that add up to more than 100%. The page has to take it out before comparing prices. *Divide by the total* is what the page used until now; *power* and *Shin* are standard methods that take proportionally more margin off long shots. Lower log loss and Brier score mean better predictions.")
    p(); p("| Method | Log loss | Brier score |"); p("|---|---|---|")
    idx = {"H": 0, "D": 1, "A": 2}
    meths = (("Divide by the total (old)", lambda q: [x / sum(q) for x in q]), ("Power", None), ("Shin", None))
    def power_m(q):
        lo, hi = 0.5, 3.0
        for _ in range(60):
            k = (lo + hi) / 2
            if sum(x ** k for x in q) > 1: lo = k
            else: hi = k
        return [x ** k for x in q]
    def shin_m(q):
        t = sum(q)
        def pr(z): return [(math.sqrt(z * z + 4 * (1 - z) * x * x / t) - z) / (2 * (1 - z)) for x in q]
        lo, hi = 0.0, 0.4
        for _ in range(60):
            z = (lo + hi) / 2
            if sum(pr(z)) > 1: lo = z
            else: hi = z
        return pr(z)
    fns = {"Divide by the total (old)": meths[0][1], "Power": power_m, "Shin": shin_m}
    data = db.execute("SELECT m.ftr, o.o1, o.o2, o.o3 FROM matches m JOIN odds o ON o.match_id=m.id WHERE o.market='h2h' AND o.book='Avg' AND o.phase='open'").fetchall()
    gaps = {}
    for name, f in fns.items():
        ll = br = 0.0; bk = {}
        for ftr, h, d, a in data:
            q = [1 / h, 1 / d, 1 / a]; w = idx[ftr]; pp = f(q)
            ll += -math.log(max(pp[w], 1e-9)); br += sum((pp[i] - (1 if i == w else 0)) ** 2 for i in range(3))
            for i in range(3):
                b = min(int(pp[i] * 10), 9); c = bk.setdefault(b, [0, 0.0, 0]); c[0] += 1; c[1] += pp[i]; c[2] += 1 if i == w else 0
        p("| %s | %.5f | %.5f |" % (name, ll / len(data), br / len(data))); gaps[name] = bk
    p(); p("Gap between how often outcomes really won and the chance the method gave them (percentage points; positive means the method was too pessimistic):"); p()
    p("| Predicted chance | " + " | ".join(gaps) + " |"); p("|---|" + "---|" * len(gaps))
    for b in range(9):
        cells = []
        for name in gaps:
            c = gaps[name].get(b)
            cells.append("%+.1f (n=%d)" % ((c[2] / c[0] - c[1] / c[0]) * 100, c[0]) if c and c[0] >= 200 else "n/a")
        p("| %d%% to %d%% | %s |" % (b * 10, b * 10 + 10, " | ".join(cells)))
    out = "\n".join(L)
    open(out_path, "w", encoding="utf-8").write(out + "\n")
    print(out)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["build", "report", "evidence"])
    ap.add_argument("--method", choices=["prop", "power"], default="power")
    ap.add_argument("--db", default="history.sqlite"); ap.add_argument("--raw", default="raw"); ap.add_argument("--out", default="HISTORY_REPORT.md")
    a = ap.parse_args()
    METHOD = a.method
    if a.cmd == "build": build(a.db, a.raw)
    elif a.cmd == "evidence": evidence(a.db, a.out)
    else: report(a.db, a.out)
