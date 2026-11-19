// Free results on the home server: the server copy settles football bets from its own /results,
// with no Cloudflare helper and no Odds API credits.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const page0 = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');
const serverPage = page0.replace('</head>', '<script>window.BETIQ_SERVER = true;</script>\n</head>');
const SITE = 'https://betiq.belboapps.co.uk';
let fails = 0; const check = (ok, what) => { if (!ok) { fails++; console.log('FAIL ' + what); } else console.log('ok   ' + what); };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e))); p.on('dialog', d => d.accept());
  const yd = new Date(Date.now() - 864e5), dd = String(yd.getUTCDate()).padStart(2, '0') + '/' + String(yd.getUTCMonth() + 1).padStart(2, '0') + '/' + yd.getUTCFullYear();
  const asked = [], other = []; let apiCalls = 0; const stored = [];
  await ctx.route('**/*', r => {
    const u = r.request().url(), m = r.request().method();
    const json = v => r.fulfill({ headers: { 'content-type': 'application/json' }, body: JSON.stringify(v) });
    if (u.includes('fonts.g')) return r.abort();
    if (u.startsWith(SITE + '/results')) {
      asked.push(new URL(u).searchParams.get('div'));
      return r.fulfill({ headers: { 'content-type': 'text/csv' }, body: 'Div,Date,Time,HomeTeam,AwayTeam,FTHG,FTAG,FTR\nE0,' + dd + ',15:00,Arsenal,Everton,2,0,H\n' });
    }
    if (u.startsWith(SITE + '/rest/v1/bets')) {
      if (m === 'POST') { JSON.parse(r.request().postData()).forEach(x => stored.push(x)); return r.fulfill({ status: 204, body: '' }); }
      return json([]);
    }
    if (u.startsWith(SITE + '/rest/v1/')) return json([]);
    if (u.startsWith(SITE + '/')) return r.fulfill({ headers: { 'content-type': 'text/html' }, body: serverPage });
    if (u.includes('the-odds-api')) { apiCalls++; return json([]); }
    other.push(u); return r.abort();
  });
  const t = yd.getTime(), bet = (pid, h, a, sel) => ({ pid, evId: pid, key: 'fd_E0', league: 'PL', h, a, sel, odds: 2, book: 'Bet365', stake: 2, fair: .5, time: t, at: t - 9e5, status: 'open', profit: 0, mkt: '' });
  await p.addInitScript(s => { if (!localStorage.getItem('betiqlite.v1')) localStorage.setItem('betiqlite.v1', JSON.stringify(s)); },
    { key: '', freeMode: true, auto: false, ver: 2, booksSet: true, pracAsked: true, tour: true, helperUrl: '', sports: [], selected: [], picked: true,
      bets: [bet('f1', 'Arsenal', 'Everton', 'Arsenal'), bet('f2', 'Chelsea', 'Spurs', 'Chelsea')] });
  await p.goto(SITE + '/'); await p.waitForTimeout(1500);
  const st = await p.evaluate(() => JSON.parse(localStorage.getItem('betiqlite.v1')));
  const f1 = st.bets.find(x => x.pid === 'f1'), f2 = st.bets.find(x => x.pid === 'f2');
  check(asked.length === 1 && asked[0] === 'E0', 'the server copy asked its own server for the league results (' + asked.join(',') + ')');
  check(f1 && f1.status === 'won', 'the finished bet was settled (' + (f1 && f1.status) + ')');
  check(f2 && f2.status === 'open', 'a bet with no result yet stays open');
  check(/home server/.test(await p.innerText('#alerts')), 'the message says the result came from the home server');
  check(apiCalls === 0, 'no Odds API credits spent');
  check(!other.some(u => /workers\.dev|football-data/.test(u)), 'nothing went to a helper or straight to football-data');
  await p.click('[data-tab=more]'); await p.waitForTimeout(200);
  check(/don't need the helper/.test(await p.innerText('#helperMsg')), 'the helper section says it is not needed here');
  console.log('errs', errs);
  await b.close();
  if (fails) process.exit(1);
})();
