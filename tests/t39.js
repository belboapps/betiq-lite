// Report features: the true-cost line, "is my edge real yet?", alert decay, the offer value checker,
// account stages and the deposit tracker, checked against hand-worked figures on the page's own code (no browser needed).
const fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');
function grab(name) {
  const at = html.indexOf('  function ' + name + '('); if (at < 0) throw new Error('missing ' + name);
  let i = html.indexOf('{', at), depth = 0;
  for (; i < html.length; i++) { if (html[i] === '{') depth++; else if (html[i] === '}' && --depth === 0) break; }
  return html.slice(at, i + 1);
}
const names = ['signed', 'clvOf', 'costInfo', 'meanCi', 'edgeStats', 'decayStats', 'boostValue', 'ewValue', 'lifeStage', 'depositSummary'];
const F = new Function(names.map(grab).join('\n') + '; return {' + names.join(',') + '};')();
const errs = [], near = (a, b) => Math.abs(a - b) < 1e-3;
function check(label, ok, info) { console.log((ok ? 'ok   ' : 'FAIL ') + label + (info !== undefined ? ': ' + JSON.stringify(info) : '')); if (!ok) errs.push(label); }

let c = F.costInfo(-0.05, 2.0); check('a 5% margin costs 5p per £1', c.text === 'Costs about 5p per £1 on average' && c.cls === 'neg' && !c.longshot, c);
c = F.costInfo(0.04, 12); check('value at long odds: in your favour, with a long-odds warning', /favour by about 4p/.test(c.text) && c.longshot, c);

let m = F.meanCi([1, -1, 1, -1]); check('mean and range of a coin flip', near(m.mean, 0) && m.lo < 0 && m.hi > 0, m);
const win = (i) => ({ status: 'won', stake: 10, profit: 10, at: i });
let e = F.edgeStats([win(1), win(2), win(3), win(4)]); check('four identical wins: clear of luck', /clear of luck/.test(e.yieldText) && near(e.yield.mean, 1), e.yieldText);
e = F.edgeStats([win(1), { status: 'lost', stake: 10, profit: -10 }, win(3)]); check('a mixed short run is not yet clear of luck', /not yet clear of luck/.test(e.yieldText), e.yieldText);
check('no closing prices yet is said plainly', /Not enough closing prices/.test(e.clvText), e.clvText);

const d = F.decayStats([{ flagAt: 0, at: 10 * 60000, odds: 2.0, flagOdds: 2.0 }, { flagAt: 0, at: 30 * 60000, odds: 1.9, flagOdds: 2.0 }, { flagAt: 0, at: 50 * 60000, odds: 2.1, flagOdds: 2.0 }, { at: 5 }]);
check('alert decay: median 30 minutes, 1 of 3 at a worse price', d.n === 3 && near(d.medianMins, 30) && d.worse === 1, d);

let b = F.boostValue(6.0, 5.0, 10); check('a boost to 6.0 on a 5.0 exchange price is +20%, worth £2 on £10', near(b.ev, 0.2) && near(b.perStake, 2), b);
let w = F.ewValue(13.0, 0.2, 15, 3.5); check('each-way at 12/1, 1/5 odds, against exchange 15 and 3.5', near(w.placeOdds, 3.4) && near(w.winEv, 13 / 15 - 1) && near(w.placeEv, 3.4 / 3.5 - 1) && near(w.ev, 0.5 * (13 / 15 - 1) + 0.5 * (3.4 / 3.5 - 1)), w);

const off = (step) => ({ step });
check('limited account', F.lifeStage({ status: 'limited' }, [], null).k === 'done');
check('open offers come first', F.lifeStage({ status: 'active' }, [off('todo'), off('done')], { level: 'ok' }).k === 'offers');
check('likely limited soon, with offers left to finish', /Finish the 1 offer/.test(F.lifeStage({ status: 'active' }, [off('todo')], { level: 'high' }).d));
check('fresh account: offers before value bets', F.lifeStage({ status: 'active' }, [], { level: 'ok' }).k === 'fresh');
check('offers done: value betting', F.lifeStage({ status: 'active' }, [off('done')], { level: 'ok' }).k === 'value');

const now = 100 * 86400000, ds = F.depositSummary([{ at: now - 86400000, amount: 50 }, { at: now - 2 * 86400000, amount: -20 }, { at: now - 40 * 86400000, amount: 500 }], now);
check('deposits: only the last 30 days count', ds.inn === 50 && ds.out === 20 && ds.net === 30, ds);
console.log('errs', errs);
if (errs.length) process.exit(1);
