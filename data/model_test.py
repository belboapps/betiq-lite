#!/usr/bin/env python3
"""
An honest test of an independent football match model, built the way a betting syndicate starts:
does our own price beat the market's?

    python3 model_test.py --db history.sqlite --out MODEL_REPORT.md

The model. For each league, every team gets an attack and a defence strength fitted to goals
scored and conceded, with recent matches counting more (half-life HALF_LIFE days, using the last
WINDOW days), plus a home advantage. Expected goals for each side give, through independent
Poisson scores, the chances of a home win, a draw and an away win.

How it stays honest. Every setting below was fixed before looking at any result. Each week's
matches are predicted only from matches played before that week (walk-forward), so no future
information leaks in. Bets are judged at prices that could have been taken: Bet365's, and
Betfair Exchange's after commission. The last HELD_BACK seasons are reported separately.

The decisive test is accuracy: if the model's chances are less accurate than the market's own
(measured by log loss), it has no edge, whatever its profit happens to be over a sample.
"""
import argparse, math, sqlite3, sys
from collections import defaultdict
from datetime import date, timedelta

# ---- fixed in advance; do not tune these to the results ----
HALF_LIFE = 180          # days
WINDOW = 730             # days of history used for each fit
MIN_GAMES = 10           # each team needs this many matches in the window, or its games are skipped
EDGE = 0.05              # bet when model chance x price - 1 is at least this
MAX_ODDS = 5.0
COMMISSION = 0.05        # Betfair Exchange on winnings
HELD_BACK = ("2526", "2627")
TEST_FROM = "1920"       # closing prices exist from 2019/20
MAX_GOALS = 10


def demargin(prices):
    inv = [1.0 / p for p in prices]
    lo, hi = 0.5, 3.0
    for _ in range(60):
        k = (lo + hi) / 2
        if sum(x ** k for x in inv) > 1:
            lo = k
        else:
            hi = k
    return [x ** k for x in inv]


def pois(lam, k):
    return math.exp(-lam) * lam ** k / math.factorial(k)


def outcome_probs(lh, la):
    ph = [pois(lh, k) for k in range(MAX_GOALS + 1)]
    pa = [pois(la, k) for k in range(MAX_GOALS + 1)]
    h = d = a = 0.0
    for i in range(MAX_GOALS + 1):
        for j in range(MAX_GOALS + 1):
            p = ph[i] * pa[j]
            if i > j:
                h += p
            elif i == j:
                d += p
            else:
                a += p
    t = h + d + a
    return [h / t, d / t, a / t]


def fit(games, today):
    """games: (date, home, away, hg, ag) before today. Returns (attack, defence, home_adv, counts)."""
    rows = []
    for d, h, a, hg, ag in games:
        age = (today - d).days
        if 0 < age <= WINDOW:
            rows.append((h, a, hg, ag, 0.5 ** (age / HALF_LIFE)))
    if len(rows) < 50:
        return None
    teams = {t for r in rows for t in r[:2]}
    att = {t: 1.0 for t in teams}
    dfn = {t: 1.0 for t in teams}
    cnt = defaultdict(int)
    for h, a, *_ in rows:
        cnt[h] += 1
        cnt[a] += 1
    home = 1.3
    for _ in range(25):                              # iterative scaling towards the weighted maximum likelihood
        num_a, den_a = defaultdict(float), defaultdict(float)
        for h, a, hg, ag, w in rows:
            num_a[h] += w * hg; den_a[h] += w * home * dfn[a]
            num_a[a] += w * ag; den_a[a] += w * dfn[h]
        att = {t: num_a[t] / den_a[t] if den_a[t] > 0 else 1.0 for t in teams}
        num_d, den_d = defaultdict(float), defaultdict(float)
        for h, a, hg, ag, w in rows:
            num_d[a] += w * hg; den_d[a] += w * home * att[h]
            num_d[h] += w * ag; den_d[h] += w * att[a]
        dfn = {t: num_d[t] / den_d[t] if den_d[t] > 0 else 1.0 for t in teams}
        m = sum(att.values()) / len(att)              # fix the scale: average attack is 1
        att = {t: v / m for t, v in att.items()}
        dfn = {t: v * m for t, v in dfn.items()}
        hn = sum(w * hg for h, a, hg, ag, w in rows)
        hd = sum(w * att[h] * dfn[a] for h, a, hg, ag, w in rows)
        home = hn / hd if hd > 0 else home
    return att, dfn, home, cnt


def week_start(d):
    return d - timedelta(days=d.weekday())


def load(db):
    c = sqlite3.connect(db)
    matches = c.execute("SELECT id, season, div, date, home, away, fthg, ftag, ftr FROM matches ORDER BY date").fetchall()
    odds = defaultdict(dict)
    for mid, book, phase, o1, o2, o3 in c.execute(
            "SELECT match_id, book, phase, o1, o2, o3 FROM odds WHERE market='h2h' AND book IN ('B365','BFE','PS','Avg')"):
        odds[mid][(book, phase)] = (o1, o2, o3)
    return matches, odds


def run(db):
    matches, odds = load(db)
    by_div = defaultdict(list)
    for m in matches:
        by_div[m[2]].append(m)
    preds = []
    for div, ms in by_div.items():
        hist = []                                    # (date, home, away, hg, ag) seen so far
        weeks = defaultdict(list)
        for m in ms:
            weeks[week_start(date.fromisoformat(m[3]))].append(m)
        for wk in sorted(weeks):
            batch = weeks[wk]
            if batch[0][1] >= TEST_FROM:
                f = fit(hist, wk)
                if f:
                    att, dfn, home, cnt = f
                    for mid, season, _, d, h, a, hg, ag, ftr in batch:
                        if cnt[h] < MIN_GAMES or cnt[a] < MIN_GAMES:
                            continue
                        lh, la = home * att[h] * dfn[a], att[a] * dfn[h]
                        preds.append(dict(id=mid, season=season, div=div, ftr="HDA".index(ftr),
                                          p=outcome_probs(lh, la), odds=odds.get(mid, {})))
            hist.extend((date.fromisoformat(m[3]), m[4], m[5], m[6], m[7]) for m in batch)
    return preds


def ci(xs):
    n = len(xs)
    if n < 2:
        return (sum(xs) / n if n else 0.0), float("nan")
    m = sum(xs) / n
    sd = math.sqrt(sum((x - m) ** 2 for x in xs) / (n - 1))
    return m, 1.96 * sd / math.sqrt(n)


def evaluate(preds, label):
    """Accuracy against the market, and the bets the rule would have made."""
    ll_model, ll_mkt, n_cmp = 0.0, 0.0, 0
    bets = {"Bet365": [], "Betfair Exchange (after 5% commission)": []}
    clv = []
    for r in preds:
        o, k = r["odds"], r["ftr"]
        avg = o.get(("Avg", "open"))
        if avg:
            mk = demargin(avg)
            ll_model -= math.log(max(1e-9, r["p"][k]))
            ll_mkt -= math.log(max(1e-9, mk[k]))
            n_cmp += 1
        close = o.get(("PS", "close"))
        fair_close = demargin(close) if close else None
        for name, key, comm in (("Bet365", ("B365", "open"), 0.0), ("Betfair Exchange (after 5% commission)", ("BFE", "open"), COMMISSION)):
            pr = o.get(key)
            if not pr:
                continue
            for i in range(3):
                price = 1 + (pr[i] - 1) * (1 - comm)
                if pr[i] <= MAX_ODDS and r["p"][i] * price - 1 >= EDGE:
                    bets[name].append(price - 1 if k == i else -1.0)
                    if name == "Bet365" and fair_close:
                        clv.append(pr[i] * fair_close[i] - 1)
    out = [f"### {label}", "",
           f"Matches predicted: {len(preds)}. Compared with the market on {n_cmp}.", ""]
    if n_cmp:
        out.append(f"- **Accuracy (log loss, lower is better):** model {ll_model / n_cmp:.4f}, market {ll_mkt / n_cmp:.4f}. "
                   + ("The model is LESS accurate than the market." if ll_model > ll_mkt else "The model is MORE accurate than the market."))
    for name, xs in bets.items():
        if xs:
            m, h = ci(xs)
            out.append(f"- **Bets at {name}:** {len(xs)} bets, return {m * 100:+.1f}% per £1 (95% range {(m - h) * 100:+.1f}% to {(m + h) * 100:+.1f}%).")
    if clv:
        m, h = ci(clv)
        out.append(f"- **Against the closing price** (Pinnacle, margin removed), the Bet365 bets averaged {m * 100:+.2f}% "
                   f"(95% range {(m - h) * 100:+.2f}% to {(m + h) * 100:+.2f}%) over {len(clv)} bets.")
    out.append("")
    return out, dict(model=ll_model / n_cmp if n_cmp else None, market=ll_mkt / n_cmp if n_cmp else None)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default="history.sqlite")
    ap.add_argument("--out", default="MODEL_REPORT.md")
    a = ap.parse_args()
    preds = run(a.db)
    dev = [p for p in preds if p["season"] not in HELD_BACK]
    held = [p for p in preds if p["season"] in HELD_BACK]
    lines = ["# Does our own football model beat the market?", "",
             "Generated by `model_test.py` from football-data.co.uk history. Settings were fixed before any result was seen: "
             f"half-life {HALF_LIFE} days, {WINDOW} days of history, bets at an edge of {EDGE * 100:.0f}% or more on odds up to {MAX_ODDS}, "
             f"Betfair commission {COMMISSION * 100:.0f}%. Each week is predicted only from earlier matches.", ""]
    d_lines, d = evaluate(dev, f"Development seasons ({TEST_FROM[:2]}/{TEST_FROM[2:]} to 2024/25)")
    h_lines, h = evaluate(held, "Held-back seasons (2025/26 and 2026/27 so far)")
    lines += d_lines + h_lines
    by_league = defaultdict(list)
    for p in preds:
        by_league[p["div"]].append(p)
    lines += ["### Accuracy by league (all test seasons)", "", "| League | Matches | Model log loss | Market log loss | Model better? |", "|---|---|---|---|---|"]
    for div in sorted(by_league):
        _, s = evaluate(by_league[div], div)
        if s["model"] is not None:
            lines.append(f"| {div} | {len(by_league[div])} | {s['model']:.4f} | {s['market']:.4f} | {'yes' if s['model'] < s['market'] else 'no'} |")
    open(a.out, "w").write("\n".join(lines) + "\n")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
