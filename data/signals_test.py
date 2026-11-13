import sqlite3, math
from collections import defaultdict, deque
db = sqlite3.connect("hist2.sqlite")

def ci(vals):
    n = len(vals)
    if n < 2: return n, (vals[0] if n else 0), 0
    m = sum(vals)/n; sd = math.sqrt(sum((v-m)**2 for v in vals)/(n-1)); return n, m, 1.96*sd/math.sqrt(n)

# ---------- 1. Timing: do good prices survive until kick-off? ----------
print("=== TIMING: flagged value bets, opening best odds vs closing best odds (Max) ===")
q = """SELECT s.sel, s.best, s.fair, oc.o1, oc.o2, oc.o3 FROM sim_bets s
       JOIN odds oc ON oc.match_id=s.match_id AND oc.market='h2h' AND oc.book='Max' AND oc.phase='close'
       WHERE s.variant='uk4' AND s.market='h2h' AND s.value=1"""
idx = {"H":0,"D":1,"A":2}; short=0; same=0; longer=0; ratios=[]; still_value=0; n=0
for sel, best, fair, o1, o2, o3 in db.execute(q):
    cl = [o1,o2,o3][idx[sel]]; r = cl/best; ratios.append(r); n+=1
    if r < 0.98: short+=1
    elif r > 1.02: longer+=1
    else: same+=1
    if fair*cl-1 >= 0.03: still_value+=1
print("flagged bets with closing prices:", n)
print("best price SHORTER by kick-off: %.0f%%  about the same: %.0f%%  LONGER: %.0f%%" % (short/n*100, same/n*100, longer/n*100))
print("average closing/opening best price ratio: %.3f  (i.e. price typically %.1f%% worse by kick-off)" % (sum(ratios)/n, (1-sum(ratios)/n)*100))
print("still flagged as value at the best closing price: %.0f%%" % (still_value/n*100))

# ---------- 2. Do form and head-to-head add anything beyond the market? ----------
print("\n=== FORM / H2H beyond the market (home-win and away-win outcomes, market = demargined Avg opening odds) ===")
rows = db.execute("""SELECT m.id, m.date, m.div, m.home, m.away, m.ftr, m.fthg, m.ftag, o.o1, o.o2, o.o3
                     FROM matches m JOIN odds o ON o.match_id=m.id AND o.market='h2h' AND o.book='Avg' AND o.phase='open'
                     ORDER BY m.date, m.id""").fetchall()
def power(q):
    lo, hi = 0.5, 3.0
    for _ in range(50):
        k=(lo+hi)/2
        if sum(x**k for x in q) > 1: lo=k
        else: hi=k
    return [x**k for x in q]
form = defaultdict(lambda: deque(maxlen=6))      # team -> recent points
h2h = defaultdict(lambda: deque(maxlen=6))       # frozenset pair -> list of (homeTeam, result)
resid = defaultdict(list)                        # bucket -> residuals
used = 0
for mid, date, div, h, a, ftr, hg, ag, o1, o2, o3 in rows:
    p = power([1/o1, 1/o2, 1/o3]); ph, pa = p[0], p[2]
    fh, fa = form[h], form[a]; pair = frozenset((h,a)); hh = h2h[pair]
    if len(fh) >= 5 and len(fa) >= 5:
        used += 1
        fd = (sum(fh)/len(fh)) - (sum(fa)/len(fa))     # form difference, points per game, home minus away
        b = "home form much better (+1 ppg or more)" if fd >= 1 else "home form better (+0.4 to +1)" if fd >= 0.4 else "about level" if fd > -0.4 else "away form better (-0.4 to -1)" if fd > -1 else "away form much better (-1 or less)"
        resid[("form", b)].append(((1 if ftr=="H" else 0) - ph, (1 if ftr=="A" else 0) - pa))
        if len(hh) >= 3:
            wins = sum(1 for (ht, r) in hh if (r=="H" and ht==h) or (r=="A" and ht!=h))   # this home team won
            losses = sum(1 for (ht, r) in hh if (r=="A" and ht==h) or (r=="H" and ht!=h))
            hb = "home team dominates H2H" if wins - losses >= 2 else "away team dominates H2H" if losses - wins >= 2 else "H2H about even"
            resid[("h2h", hb)].append(((1 if ftr=="H" else 0) - ph, (1 if ftr=="A" else 0) - pa))
    ph_pts = 3 if ftr=="H" else 1 if ftr=="D" else 0
    form[h].append(ph_pts); form[a].append(3 - ph_pts if ftr != "D" else 1)
    h2h[pair].append((h, ftr))
print("matches with enough history:", used)
print("%-45s %7s  %-28s %-28s" % ("group", "n", "home win: actual - market", "away win: actual - market"))
for key in sorted(resid, key=lambda k: (k[0], k[1])):
    vals = resid[key]; n1, m1, c1 = ci([v[0] for v in vals]); n2, m2, c2 = ci([v[1] for v in vals])
    print("%-45s %7d  %+5.1f pts (+/-%.1f)          %+5.1f pts (+/-%.1f)" % (key[0]+": "+key[1], n1, m1*100, c1*100, m2*100, c2*100))
print("\nReading: if the market already knows about form and H2H, every number sits near 0 within its +/-.")
