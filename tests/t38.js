// Account health: the three warning signs, checked on the page's own code without a browser.
const fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');
function grab(name) {                       // the source of one top-level function in the page
  const at = html.indexOf('  function ' + name + '('); if (at < 0) throw new Error('missing ' + name);
  let i = html.indexOf('{', at), depth = 0;
  for (; i < html.length; i++) { if (html[i] === '{') depth++; else if (html[i] === '}' && --depth === 0) break; }
  return html.slice(at, i + 1);
}
const acctHealth = new Function(grab('signed') + grab('clvOf') + grab('acctHealth') + '; return acctHealth;')();
const errs = [], now = Date.now();
function check(label, got, want) { const ok = JSON.stringify(got) === JSON.stringify(want); console.log((ok ? 'ok   ' : 'FAIL ') + label + ': ' + JSON.stringify(got)); if (!ok) errs.push(label); }
function bet(i, o) { return Object.assign({ status: 'lost', stake: 10, profit: -10, odds: 2, time: now - 1e6, at: now - 2e6 + i }, o); }
const many = (n, f) => Array.from({ length: n }, (_, i) => bet(i, f(i)));

check('no bets', acctHealth([]).level, 'ok');
check('a losing account', acctHealth(many(30, () => ({}))).level, 'ok');
check('19 winning bets is too few to judge', acctHealth(many(19, () => ({ status: 'won', profit: 10 }))).level, 'ok');
const winning = acctHealth(many(20, (i) => (i % 2 ? { status: 'won', profit: 14 } : {})));
check('winning well over 20 bets', [winning.level, winning.signs.length], ['watch', 1]);
check('open bets do not count as winning', acctHealth(many(20, () => ({ status: 'open', profit: 0 }))).level, 'ok');
// closing price: fair chance 0.55 at odds 2.0 is +10%, saved one hour before kick-off
const beat = (i) => ({ close: { f: i % 4 ? 0.55 : 0.45, at: now - 1e6 - 3600e3 } });
const clv = acctHealth(many(16, beat));
check('beats the final price 75% of the time', [clv.level, /75% of 16/.test(clv.signs[0])], ['watch', true]);
check('a strong closing record over 30 bets is high', acctHealth(many(32, beat)).level, 'high');
check('prices saved too early are ignored', acctHealth(many(16, () => ({ close: { f: 0.55, at: now - 1e6 - 5 * 3600e3 } }))).level, 'ok');
const cut = acctHealth(many(15, (i) => ({ stake: i < 10 ? 20 : 5, profit: i < 10 ? -20 : -5 })));
check('stakes cut by more than half', [cut.level, cut.signs.length], ['watch', 1]);
check('steady stakes', acctHealth(many(15, () => ({ stake: 20, profit: -20 }))).level, 'ok');
check('two signs together are high', acctHealth(many(20, (i) => Object.assign(i % 2 ? { status: 'won', profit: 14 } : {}, beat(i)))).level, 'high');
console.log('errs', errs);
if (errs.length) process.exit(1);
