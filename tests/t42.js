// First-time setup in Simple view: one question at a time at the top of Today (weekly budget, when to pause,
// which bookmakers), each answer saved at once, and Skip for now hides it.
const { chromium } = require('playwright');
const path = require('path');
const books = ['Bet365', 'Sky Bet', 'Paddy Power', 'William Hill', 'Ladbrokes', 'Betfair Sportsbook'];
function ev(id, h, a, hrs, base, boost) { return { id, sport_key: 'soccer_epl', home_team: h, away_team: a, commence_time: new Date(Date.now() + hrs * 3600e3).toISOString(),
  bookmakers: books.map((b, i) => ({ key: b.toLowerCase().replace(/ /g, '_'), title: b, markets: [{ key: 'h2h', outcomes: [{ name: h, price: +(base[0] * (i === 2 ? boost : 1)).toFixed(2) }, { name: a, price: base[2] }, { name: 'Draw', price: base[1] }] }] })) }; }
let fails = 0; const check = (what, ok, info) => { if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + what + (info !== undefined ? ' | ' + info : '')); };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.route('**/*', r => { const u = r.request().url(); if (u.startsWith('file:')) return r.continue(); if (u.includes('fonts.g')) return r.abort();
    const h = { 'access-control-allow-origin': '*', 'access-control-expose-headers': '*', 'x-requests-remaining': '400', 'x-requests-last': '1', 'content-type': 'application/json' };
    if (/\/odds\/\?/.test(u)) return r.fulfill({ headers: h, body: JSON.stringify([ev('e1', 'Arsenal', 'Everton', 2, [1.7, 3.9, 5.5], 1.08)]) });
    return r.fulfill({ headers: h, body: '[]' }); });
  await p.addInitScript(() => { if (!localStorage.getItem('betiqlite.v1')) localStorage.setItem('betiqlite.v1', JSON.stringify({ key: 'dummy', auto: false, ver: 2, pracAsked: true, tour: true, simple: true, sports: [{ key: 'soccer_epl', group: 'Soccer', title: 'EPL' }], selected: ['soccer_epl'], windowH: 72, bankroll: 100 })); });
  await p.goto('file://' + path.resolve(__dirname, '..', 'index.html')); await p.waitForTimeout(400);
  await p.click('#refreshBtn'); await p.waitForSelector('#nowBox .setupcard');
  const st = () => p.evaluate(() => JSON.parse(localStorage.getItem('betiqlite.v1')));
  const q = () => p.$eval('#nowBox .setupcard h3', e => e.innerText).catch(() => null);
  check('setup asks the weekly budget first', await q() === 'How much can you spend each week?');
  check('it does not repeat the same step in the plan row', !(await p.$('#nowBox .nowstep')));
  check('the bet and the headline still show under it', /1 good bet today/.test(await p.innerText('#nowBox')) && !!(await p.$('#plan .brow')));
  await p.fill('#nowBox .suother input', '35'); await p.press('#nowBox .suother input', 'Enter'); await p.waitForTimeout(250);
  check('typing your own amount saves it', (await st()).weekly === 35, (await st()).weekly);
  check('then asks when to pause', await q() === 'Pause if you lose this much in a week?');
  const pause = await p.$$eval('#nowBox .suopt', e => e.map(x => x.innerText));
  check('pause choices are half and all of the budget', pause.join(',') === '£18,£35', pause.join(','));
  await p.click('#nowBox .suopt >> nth=0'); await p.waitForTimeout(250);
  check('the pause saves as the loss limit', (await st()).lossLimit === 18);
  check('then asks which bookmakers', await q() === 'Which bookmakers do you have?');
  const names = await p.$$eval('#nowBox .suopt', e => e.map(x => x.innerText));
  check('it lists the bookmakers it has seen, none ticked yet', names.length === 6 && !(await p.$('#nowBox .suopt[aria-pressed="true"]')), names.join(','));
  check('with none ticked the button says so', /I don't have any yet/.test(await p.innerText('#nowBox .suacts .btn.primary')));
  await p.click('#nowBox .suopt:has-text("Paddy Power")'); await p.click('#nowBox .suopt:has-text("Bet365")'); await p.waitForTimeout(200);
  check('ticks are saved as you go', JSON.stringify((await st()).myBooks) === '["Paddy Power","Bet365"]', JSON.stringify((await st()).myBooks));
  await p.click('#nowBox .suacts .btn.primary'); await p.waitForTimeout(250);
  check('Done finishes setup and the card goes', (await st()).booksSet === true && !(await p.$('#nowBox .setupcard')));
  await p.click('[data-tab=more]'); await p.waitForTimeout(150);
  check('settings show the answers', await p.evaluate(() => document.getElementById('weeklyIn').value === '35' && document.getElementById('lossLimit').value === '18'));
  await p.click('[data-tab=today]');
  // Skip for now hides it for good
  await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('betiqlite.v1')); s.weekly = 0; s.lossLimit = 0; localStorage.setItem('betiqlite.v1', JSON.stringify(s)); }); await p.reload(); await p.waitForSelector('#nowBox .setupcard');
  await p.click('#nowBox .suacts .linkbtn'); await p.waitForTimeout(250);
  check('Skip for now hides the card', !(await p.$('#nowBox .setupcard')) && (await st()).setupSkip === true);
  check('and the plan row still offers the step', /Decide what you can afford to lose/.test(await p.innerText('#nowBox')));
  console.log('errs', errs, 'fails', fails); await b.close(); process.exit(fails || errs.length ? 1 : 0);
})();
