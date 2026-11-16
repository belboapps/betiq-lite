import sqlite3, math
db = sqlite3.connect("hist3.sqlite")
def st(v):
    n=len(v)
    if n<2: return n,(v[0] if n else 0),0
    m=sum(v)/n; sd=math.sqrt(sum((x-m)**2 for x in v)/(n-1)); return n,m*100,1.96*sd/math.sqrt(n)*100
def show(label, where, args=()):
    rows=db.execute("SELECT profit_best, profit_b365, won, fair, clv FROM sim_bets s WHERE "+where, args).fetchall()
    n,m,c=st([r[0] for r in rows]); b=[r[1] for r in rows if r[1] is not None]; nb,mb,cb=st(b)
    cl=[r[4] for r in rows if r[4] is not None]
    print("%-58s n=%-6d won %4.1f%% pred %4.1f%%  best %+5.1f%% ±%-4.1f  B365 %+5.1f%% ±%-4.1f  CLV %s" % (label,n,(sum(r[2] for r in rows)/n*100 if n else 0),(sum(r[3] for r in rows)/n*100 if n else 0),m,c,mb,cb,("%+.1f%%"%(sum(cl)/len(cl)*100)) if cl else "n/a"))

print("== Exchange overround (sum of 1/back odds) by league, 2024/25 onwards: how liquid is it? ==")
for lg,n,avgor,liquid in db.execute("""SELECT m.league, COUNT(*), AVG(1/o.o1+1/o.o2+1/o.o3), AVG(CASE WHEN 1/o.o1+1/o.o2+1/o.o3 <= 1.025 THEN 1.0 ELSE 0 END)
        FROM matches m JOIN odds o ON o.match_id=m.id AND o.market='h2h' AND o.book='BFE' AND o.phase='open' WHERE m.season>='2425' GROUP BY 1 ORDER BY 3"""):
    print("  %-22s matches %-5d avg overround %.3f   liquid (<=1.025): %.0f%%" % (lg,n,avgor,liquid*100))

db.execute("CREATE TEMP TABLE liq AS SELECT match_id, 1/o1+1/o2+1/o3 AS orr FROM odds WHERE market='h2h' AND book='BFE' AND phase='open'")
db.execute("CREATE INDEX liq_i ON liq(match_id)")
print("\n== Same seasons (2024/25 onwards), VALUE-flagged bets, each way of working out the fair price ==")
show("UK average (the app's default)", "variant='uk4' AND value=1 AND season>='2425'")
show("Market average of all books", "variant='maxavg' AND market='h2h' AND value=1 AND season>='2425'")
show("Pinnacle as yardstick", "variant='sharp' AND value=1 AND season>='2425'")
show("Betfair Exchange, any liquidity", "variant='exch' AND value=1")
for thr in (1.04, 1.025, 1.015):
    show("Betfair Exchange, overround <= %.3f" % thr, "variant='exch' AND value=1 AND match_id IN (SELECT match_id FROM liq WHERE orr<=?)", (thr,))
    show("   ... its 'check price' (>12%%) bets", "variant='exch' AND suspect=1 AND match_id IN (SELECT match_id FROM liq WHERE orr<=?)", (thr,))
print("\n== Calibration of the exchange fair price when liquid (<=1.025), every outcome ==")
for lo in range(0,90,10):
    r=db.execute("SELECT COUNT(*),AVG(won),AVG(fair) FROM sim_bets WHERE variant='exch' AND fair>=? AND fair<? AND match_id IN (SELECT match_id FROM liq WHERE orr<=1.025)",(lo/100,(lo+10)/100)).fetchone()
    if r[0]>=150: print("  %d-%d%%: n=%d predicted %.1f%% actual %.1f%%" % (lo,lo+10,r[0],r[2]*100,r[1]*100))
print("\n== Head to head on the SAME matches (liquid exchange, 2024/25+): whose fair price predicts better? log loss, lower is better ==")
import collections
ll=collections.defaultdict(float); cnt=0
ids=[r[0] for r in db.execute("SELECT match_id FROM liq WHERE orr<=1.025")]
q="SELECT variant, match_id, sel, fair, won FROM sim_bets WHERE variant IN ('exch','uk4','sharp','maxavg') AND market='h2h' AND season>='2425'"
data=collections.defaultdict(dict)
idset=set(ids)
for v,mid,sel,fair,won in db.execute(q):
    if mid in idset: data[mid][(v,sel)]=(fair,won)
for mid,d in data.items():
    vs=set(k[0] for k in d)
    if not {'exch','uk4','sharp','maxavg'}<=vs: continue
    cnt+=1
    for v in ('exch','uk4','sharp','maxavg'):
        for sel in 'HDA':
            f,w=d[(v,sel)]
            if w: ll[v]+=-math.log(max(f,1e-9))
print("  matches compared:",cnt)
for v,name in (('sharp','Pinnacle'),('exch','Betfair Exchange'),('maxavg','All-books average'),('uk4','UK average')):
    if cnt: print("  %-20s %.5f" % (name, ll[v]/cnt))
