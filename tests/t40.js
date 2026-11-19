// Moving to the home server: the GitHub copy offers the move, the server copy takes in bets and
// settings, saves to the server instead of Supabase, and shows the right words.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const page0 = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');
const serverPage = page0.replace('</head>', '<script>window.BETIQ_SERVER = true;</script>\n</head>');
let fails = 0; const check = (ok, what) => { if (!ok) { fails++; console.log('FAIL ' + what); } else console.log('ok   ' + what); };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e))); p.on('dialog', d => d.accept());
  const stored = [], posts = [];
  await ctx.route('**/*', r => {
    const u = r.request().url(), m = r.request().method();
    const json = (v, s) => r.fulfill({ status: s || 200, headers: { 'content-type': 'application/json' }, body: v === null ? '' : JSON.stringify(v) });
    if (u.includes('fonts.g')) return r.abort();
    if (u.startsWith('https://belboapps.github.io/betiq-lite/')) return r.fulfill({ headers: { 'content-type': 'text/html' }, body: page0 });
    if (u.startsWith('https://betiq.belboapps.co.uk/rest/v1/bets')) {
      if (m === 'POST') { const rows = JSON.parse(r.request().postData()); posts.push(rows); rows.forEach(x => { const i = stored.findIndex(y => y.pid === x.pid && y.practice === x.practice); if (i >= 0) stored[i] = x; else stored.push(x); }); return r.fulfill({ status: 204, body: '' }); }
      return json(stored);
    }
    if (u.startsWith('https://betiq.belboapps.co.uk/rest/v1/files')) return json([]);
    if (u.startsWith('https://betiq.belboapps.co.uk/')) return r.fulfill({ headers: { 'content-type': 'text/html' }, body: serverPage });
    return json([]);
  });
  const now = Date.now();
  await p.addInitScript((bets) => {
    if (location.hostname === 'belboapps.github.io' && !localStorage.getItem('betiqlite.v1'))
      localStorage.setItem('betiqlite.v1', JSON.stringify({ key: 'dummy-key', auto: false, ver: 2, booksSet: true, pracAsked: true, tour: true, bankroll: 250, myBooks: ['Bet365'], bets, sports: [], selected: [], picked: true, cache: { big: { events: [] } } }));
  }, [{ pid: 'x1', evId: 'o1', key: 'soccer_epl', league: 'EPL', h: 'A', a: 'B', sel: 'A', odds: 2.1, book: 'Bet365', stake: 2, fair: .5, time: now - 9e6, at: now - 1e7, status: 'won', profit: 2.2, mkt: '', m: now },
      { pid: 'x2', evId: 'o2', key: 'soccer_epl', league: 'EPL', h: 'C', a: 'D', sel: 'C', odds: 1.9, book: 'Bet365', stake: 3, fair: .5, time: now - 9e6, at: now - 1e7, status: 'lost', profit: -3, mkt: '', m: now }]);
  await p.goto('https://belboapps.github.io/betiq-lite/'); await p.waitForTimeout(600);
  await p.click('[data-tab=more]'); await p.waitForTimeout(200);
  check(await p.isVisible('#moveBtn'), 'the GitHub copy offers "Move to my server"');
  await Promise.all([p.waitForURL('https://betiq.belboapps.co.uk/**'), p.click('#moveBtn')]);
  await p.waitForFunction(() => /Moved across/.test((document.getElementById('sbMsg') || {}).innerText || ''), null, { timeout: 15000 }).catch(() => {});
  const st = await p.evaluate(() => JSON.parse(localStorage.getItem('betiqlite.v1')));
  check(st.bets.length === 2 && st.key === 'dummy-key' && st.bankroll === 250, 'bets and settings arrived (' + st.bets.length + ' bets)');
  check(!st.cache || !st.cache.big, 'caches were left behind');
  check(!(await p.evaluate(() => location.hash)), 'the moved data is gone from the address bar');
  check(stored.length === 2 && stored.every(r => r.data && r.data.pid), 'the bets were saved to the server (' + stored.length + ')');
  check(!(await p.isVisible('#moveBtn')), 'the server copy does not offer the move');
  check(/saved on your home server/.test(await p.innerText('#sbMsg')), 'the server copy says where bets are saved');
  check(!(await p.isVisible('#sbSignIn')), 'no Supabase sign-in on the server copy');
  await p.reload(); await p.waitForTimeout(800);
  check((await p.evaluate(() => JSON.parse(localStorage.getItem('betiqlite.v1')).sb.url)) === 'https://betiq.belboapps.co.uk', 'the server copy keeps using the server after a reload');
  console.log('errs', errs);
  await b.close();
  if (fails) process.exit(1);
})();
