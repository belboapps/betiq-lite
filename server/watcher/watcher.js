// BetIQ Lite price watcher: opens the real BetIQ page in a hidden browser on the home server every
// half hour, so the page's own automatic refresh and its own PLACE alert run with nobody looking.
// The verdict rules are the page's, not a copy, so they cannot drift apart.
//
// The hidden browser has its own saved settings (it cannot see your phone's). They come from the
// environment each time the page opens:
//   ODDS_API_KEY        the Odds API key (required)
//   NTFY_TOPIC          where "N bets say PLACE" is sent (required for alerts)
//   BETIQ_LEAGUES       comma list of Odds API league keys. Default: soccer_epl,soccer_efl_champ
//   BETIQ_BOOKS         comma list of bookmaker names exactly as the page shows them. Default: all
//   BETIQ_WATCH_HOURS   how old prices may get before they are loaded again. Default 6
//   BETIQ_MIN_CREDITS   stop loading prices when fewer credits than this remain. Default 150
//   BETIQ_KICKOFF       "1" to also refresh a league shortly before its matches start (costs more)
// One refresh costs one credit per league. With the defaults that is about 240 credits a month.
// It only alerts. It never logs or places a bet.
const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');

const env = process.env;
const list = (v) => (v || '').split(',').map((x) => x.trim()).filter(Boolean);
const CFG = {
  url: env.BETIQ_PAGE || env.BETIQ_APP_URL || 'https://belboapps.github.io/betiq-lite/',
  data: env.BETIQ_DATA || '/data',
  every: 30 * 60 * 1000,
  seed: {
    key: env.ODDS_API_KEY || '',
    ntfy: env.NTFY_TOPIC || '',
    leagues: list(env.BETIQ_LEAGUES).length ? list(env.BETIQ_LEAGUES) : ['soccer_epl', 'soccer_efl_champ'],
    books: list(env.BETIQ_BOOKS),
    hours: Math.max(1, parseFloat(env.BETIQ_WATCH_HOURS) || 6),
    floor: Math.max(60, parseFloat(env.BETIQ_MIN_CREDITS) || 150),
    kickoff: env.BETIQ_KICKOFF === '1',
  },
};

// Runs inside the page before its own code, on every load: lays the server's settings over whatever
// the hidden browser saved last time (prices, alerts already sent, credits left).
function applySeed(seed) {
  const LS = 'betiqlite.v1';
  let s = {};
  try { s = JSON.parse(localStorage.getItem(LS) || '{}') || {}; } catch (e) { s = {}; }
  const low = typeof s.remaining === 'number' && s.remaining < seed.floor;
  Object.assign(s, {
    ver: 2, key: seed.key, ntfy: seed.ntfy, selected: seed.leagues, picked: true,
    auto: !low, autoHours: seed.hours, autoKick: seed.kickoff,
    myBooks: seed.books.length ? seed.books : null, booksSet: true,
    tour: true, pracAsked: true, practice: false, newsOn: false, extras: false, totals: false, helperUrl: '',
  });
  if (s.sports && s.sports.length && !seed.leagues.every((k) => s.sports.some((x) => x.key === k))) s.sports = [];   // ask again
  // While paused for low credits, ask for the list of sports once a day. That request is free and its
  // reply says how many credits are left, so the watcher starts again by itself when they are topped up.
  if (low && Date.now() - (s.sportsAt || 0) > 24 * 3600000) s.sports = [];
  localStorage.setItem(LS, JSON.stringify(s));
}

// One visit: open the page, let it do its automatic refresh, and report what it left behind.
async function visit(profile, routes) {
  const ctx = await chromium.launchPersistentContext(profile, { viewport: { width: 390, height: 844 } });
  const out = { at: new Date().toISOString(), ok: false, errors: [] };
  try {
    const page = ctx.pages()[0] || await ctx.newPage();
    page.on('pageerror', (e) => out.errors.push(String(e).slice(0, 200)));
    page.on('dialog', (d) => d.dismiss().catch(() => {}));
    let calls = 0, last = Date.now();
    page.on('request', (r) => { if (/the-odds-api\.com|ntfy\.sh/.test(r.url())) { calls++; last = Date.now(); } });
    page.on('requestfinished', () => { last = Date.now(); });
    if (routes) await page.route('**/*', routes);
    await ctx.addInitScript(applySeed, CFG.seed);
    const res = await page.goto(CFG.url, { waitUntil: 'load', timeout: 60000 });
    if (res && res.status() >= 400) throw new Error('The page did not load (' + res.status() + ')');
    // The refresh is a burst of requests. It is over when nothing has been asked for 8 seconds.
    const start = Date.now();
    while (Date.now() - start < 120000 && (Date.now() - start < 6000 || Date.now() - last < 8000)) await page.waitForTimeout(1000);
    const s = await page.evaluate(() => JSON.parse(localStorage.getItem('betiqlite.v1') || '{}'));
    const ages = (s.selected || []).map((k) => (s.cache && s.cache[k] ? Math.round((Date.now() - s.cache[k].at) / 60000) : null));
    Object.assign(out, {
      ok: true, calls, credits: typeof s.remaining === 'number' ? s.remaining : null, paused: s.auto === false,
      leagues: (s.selected || []).length, loaded: ages.filter((a) => a !== null).length,
      oldest_minutes: ages.some((a) => a === null) ? null : Math.max(0, ...ages),
      matches: (s.selected || []).reduce((t, k) => t + (s.cache && s.cache[k] ? s.cache[k].events.length : 0), 0),
      alerted: (s.ntfySeen || []).length,
    });
  } catch (e) {
    out.errors.push(String(e && e.message || e).slice(0, 200));
  } finally {
    await ctx.close().catch(() => {});
  }
  return out;
}

function note(out) {
  // No key, topic or team names in the log: counts only.
  console.log(JSON.stringify(out));
  try { fs.mkdirSync(CFG.data, { recursive: true }); fs.writeFileSync(path.join(CFG.data, 'watch.json'), JSON.stringify(out)); } catch (e) {}
}

// ---- self-test: the real page against made-up prices, without the Odds API or a real phone message ----
async function selftest() {
  const books = ['Bet365', 'Sky Bet', 'Paddy Power', 'William Hill', 'Ladbrokes', 'Betfair Sportsbook'];
  const ev = (id, h, a, hrs, base, boost) => ({ id, sport_key: 'soccer_epl', home_team: h, away_team: a, commence_time: new Date(Date.now() + hrs * 3600e3).toISOString(),
    bookmakers: books.map((b, i) => ({ key: b.toLowerCase().replace(/ /g, '_'), title: b, markets: [{ key: 'h2h', outcomes: [{ name: h, price: +(base[0] * (i === 2 ? boost : 1)).toFixed(2) }, { name: a, price: base[2] }, { name: 'Draw', price: base[1] }] }] })) });
  const sent = [], odds = [];
  let credits = 400;
  const routes = (r) => {
    const q = r.request(), u = q.url();
    if (u.startsWith('https://ntfy.sh/')) { sent.push({ topic: u.split('/').pop(), title: q.headers()['title'], body: q.postData() }); return r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, body: '{}' }); }
    if (!u.includes('the-odds-api.com')) return u.includes('fonts.g') ? r.abort() : r.continue();
    const h = { 'access-control-allow-origin': '*', 'access-control-expose-headers': '*', 'x-requests-remaining': String(credits), 'x-requests-last': '1', 'content-type': 'application/json' };
    if (/\/odds\/\?/.test(u)) { odds.push(u.replace(/apiKey=[^&]*/, 'apiKey=…')); return r.fulfill({ headers: h, body: JSON.stringify([ev('e1', 'Arsenal', 'Everton', 2, [1.7, 3.9, 5.5], 1.08), ev('e2', 'Chelsea', 'Brighton', 30, [2.6, 3.4, 2.9], 1.07), ev('e3', 'Leeds', 'Wolves', 40, [4.2, 3.6, 1.95], 1.0)]) }); }
    if (/\/sports\/?\?/.test(u)) return r.fulfill({ headers: h, body: JSON.stringify([{ key: 'soccer_epl', group: 'Soccer', title: 'EPL', active: true, has_outrights: false }]) });
    return r.fulfill({ headers: h, body: '[]' });
  };
  Object.assign(CFG.seed, { key: 'selftest-key', ntfy: 'selftest-topic-123', leagues: ['soccer_epl'], books: [], hours: 6, floor: 150, kickoff: false });
  CFG.data = fs.mkdtempSync(path.join(os.tmpdir(), 'betiq-watch-'));
  const profile = path.join(CFG.data, 'profile');
  let fails = 0;
  const check = (name, ok, info) => { if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? ' | ' + info : '')); };

  const a = await visit(profile, routes);
  check('page opened without errors', a.ok && !a.errors.length, JSON.stringify(a.errors));
  check('prices loaded once for the one league', odds.length === 1 && a.loaded === 1 && a.matches === 3, odds.length + ' requests, ' + a.matches + ' matches');
  check('credits read from the reply', a.credits === 400, a.credits);
  check('a PLACE alert went out with counts only', sent.length === 1 && /say(s)? PLACE/.test(sent[0].title) && !/Arsenal|Everton|£/.test(sent[0].title + sent[0].body), JSON.stringify(sent[0]));
  check('it went to the topic from the settings', sent.length && sent[0].topic === 'selftest-topic-123');

  const b = await visit(profile, routes);
  check('a second visit with fresh prices spends nothing', odds.length === 1, odds.length);
  check('and does not repeat the alert', sent.length === 1, sent.length);

  credits = 100;                                             // the reply to the next refresh says credits are low
  CFG.seed.hours = 0.0001;
  await visit(profile, routes);                              // refreshes (prices now count as old), learns credits are 100
  const before = odds.length;
  const d = await visit(profile, routes);
  check('below the credit floor it stops loading prices', odds.length === before && d.paused === true, 'requests ' + before + ' -> ' + odds.length + ', paused ' + d.paused);
  check('no page errors in any visit', ![a, b, d].some((x) => x.errors.length));
  console.log('errs', fails ? ['selftest'] : []);
  process.exit(fails ? 1 : 0);
}

async function main() {
  if (process.argv.includes('--selftest')) return selftest();
  if (!CFG.seed.key) { console.log('ODDS_API_KEY is not set, so the price watcher has nothing to do. Add it to .env and start it again.'); }
  console.log('BetIQ price watcher running: ' + CFG.seed.leagues.length + ' leagues, prices reloaded when ' + CFG.seed.hours + ' hours old, alerts ' + (CFG.seed.ntfy ? 'on' : 'OFF (no NTFY_TOPIC)'));
  const profile = path.join(CFG.data, 'profile');
  for (;;) {
    if (CFG.seed.key) note(await visit(profile, null));
    await new Promise((r) => setTimeout(r, CFG.every));
  }
}
main();
