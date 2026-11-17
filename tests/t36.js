// Bet tools: odds converter, each-way calculator, accumulator checker.
const { chromium } = require('playwright');
const books=['Bet365','Sky Bet','Paddy Power','William Hill','Ladbrokes','Betfair Sportsbook'];
function ev(id,h,a,hrs,base){return {id,sport_key:'soccer_epl',home_team:h,away_team:a,commence_time:new Date(Date.now()+hrs*3600e3).toISOString(),
 bookmakers:books.map((b)=>({key:b.toLowerCase().replace(/ /g,'_'),title:b,markets:[{key:'h2h',outcomes:[{name:h,price:base[0]},{name:a,price:base[2]},{name:'Draw',price:base[1]}]}]}))};}
let fails=0; function check(name,ok,info){ if(!ok) fails++; console.log((ok?'PASS ':'FAIL ')+name+(info!==undefined?' | '+info:'')); }
(async()=>{
 const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:390,height:844}}); const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(String(e))); p.on('dialog',d=>d.accept());
 await p.route('**/*',r=>{const u=r.request().url(); if(u.startsWith('file:'))return r.continue(); if(u.includes('fonts.g'))return r.abort();
  const h={'access-control-allow-origin':'*','access-control-expose-headers':'*','x-requests-remaining':'400','x-requests-last':'1','content-type':'application/json'};
  if(/\/odds\/\?/.test(u)) return r.fulfill({headers:h,body:JSON.stringify([ev('e1','Arsenal','Everton',20,[2.0,3.6,3.8]),ev('e2','Chelsea','Brighton',30,[2.5,3.4,2.9])])});
  return r.fulfill({headers:h,body:'[]'});});
 await p.addInitScript(()=>{ if(!localStorage.getItem('betiqlite.v1')) localStorage.setItem('betiqlite.v1',JSON.stringify({key:'dummy',auto:false,ver:2,booksSet:true,pracAsked:true,tour:true,simple:true,sports:[{key:'soccer_epl',group:'Soccer',title:'EPL'}],selected:['soccer_epl'],windowH:72,bankroll:100})); });
 await p.goto('file://'+require('path').resolve(__dirname,'..','index.html')); await p.waitForTimeout(500);
 await p.click('[data-tab=more]'); await p.waitForSelector('#toolsBox');
 check('tools show in Simple view',await p.isVisible('#toolsBox')&&await p.$$eval('#toolsBox details',d=>d.length)===3);
 const stats=async(sel)=>p.$$eval(sel+' .stat',e=>Object.fromEntries(e.map(x=>[x.querySelector('span').innerText.toLowerCase(),x.querySelector('b').innerText+' / '+(x.querySelector('small')||{innerText:''}).innerText])));
 // ---- odds converter: 6/4 = 2.50 = 40%
 await p.click('#tOdds > summary');
 const conv=async(v)=>{ await p.fill('#tOddsBody input',v); await p.waitForTimeout(80); return stats('#tOddsBody'); };
 let s=await conv('6/4'); check('6/4 converts',/^2\.50/.test(s.decimal)&&/^6\/4/.test(s.fraction)&&/^40\.0%/.test(s['chance needed'])&&/^£25\.00 \/ £15\.00 profit/.test(s['£10 returns']),JSON.stringify(s));
 s=await conv('2.5'); check('2.5 converts the same',/^6\/4/.test(s.fraction)&&/^40\.0%/.test(s['chance needed']));
 s=await conv('40%'); check('40% converts the same',/^2\.50/.test(s.decimal)&&/^6\/4/.test(s.fraction));
 s=await conv('Evens'); check('evens',/^2\.00/.test(s.decimal)&&/^evens/.test(s.fraction)&&/^50\.0%/.test(s['chance needed']));
 s=await conv('1.87'); check('an in-between price says "about"',/^about 5\/6/.test(s.fraction),s.fraction);
 await p.fill('#tOddsBody input','banana'); await p.waitForTimeout(80); check('nonsense is refused politely',/does not look like odds/.test(await p.innerText('#tOddsBody')));
 for(const bad of ['0.5','1','0/0','150%','-2']){ await p.fill('#tOddsBody input',bad); await p.waitForTimeout(50); if(!/does not look like odds/.test(await p.innerText('#tOddsBody'))){ check('rejects '+bad,false); } }
 check('plain words',await (async()=>{ await p.fill('#tOddsBody input','4/1'); await p.waitForTimeout(80); return /break even if it happens 2 in 10 times\. Bet only if you think the real chance is higher than 20%/.test(await p.innerText('#tOddsBody .plain')); })(),await p.innerText('#tOddsBody .plain'));
 // ---- each-way: £5 each way at 8/1 (9.0), place part 1/5 of the odds
 //   wins: win part 5*8 = 40, place part 5*8/5 = 8 -> +48.00; places only: +8 - 5 = +3.00; neither: -10.00
 await p.click('#tEw > summary'); await p.fill('#tEwBody input[type=number]','5'); await p.fill('#tEwBody input[type=text]','8/1'); await p.waitForTimeout(100);
 s=await stats('#tEwBody'); check('each-way at 8/1, 1/5 odds',/^£10\.00/.test(s['you pay'])&&/^\+£48\.00/.test(s['if it wins'])&&/^\+£3\.00/.test(s['if it only places'])&&/^−£10\.00/.test(s['if it does neither']),JSON.stringify(s));
 //   at 3/1 (4.0) with 1/4 odds: places only = 5*3/4 - 5 = -1.25; break-even odds 1 + 4 = 5.00 (4/1)
 await p.fill('#tEwBody input[type=text]','3/1'); await p.selectOption('#tEwBody select','0.25'); await p.waitForTimeout(100);
 s=await stats('#tEwBody'); check('a place alone can lose',/^−£1\.25/.test(s['if it only places'])&&/place alone loses you £1\.25.*odds are above 5\.00 \(4\/1\)/.test(await p.innerText('#tEwBody .plain')),s['if it only places']);
 // ---- accumulator, typed odds: three picks at 2.00 with an assumed 5% cut each
 //   odds 8.00; chance (1/2.1)^3 = 10.8%; cut 1 - 8*0.10798 = 13.6%; £5 comes back as £4.32 on average
 await p.click('#tAcca > summary');
 check('starts with two picks',await p.$$eval('#accaLegs .accaleg',e=>e.length)===2&&/Add at least two picks/.test(await p.innerText('#accaOut')));
 await p.click('#tAccaBody >> text=Add a pick'); await p.waitForTimeout(80);
 for(let i=0;i<3;i++){ await p.fill(`#accaLegs .accaleg >> nth=${i} >> input[type=text]`,i===1?'evens':'2.0'); }
 await p.waitForTimeout(100); s=await stats('#accaOut'); const words=await p.innerText('#accaOut .plain');
 check('treble at 2.00',/^£40\.00 \/ odds of 8\.00/.test(s['pays if all win'])&&/^10\.8%/.test(s['chance all win'])&&/^13\.6%/.test(s["bookmaker's cut"]),JSON.stringify(s));
 check('plain words give the average loss',/every £5\.00 staked on this comes back as £4\.32, a loss of £0\.68\. As 3 separate bets the same picks would cost about 4\.8% each/.test(words),words.slice(0,170));
 check('says the cut is assumed for typed odds',/assumed to be 5% per pick/.test(await p.innerText('#accaOut')));
 // more picks, bigger cut
 await p.click('#tAccaBody >> text=Add a pick'); await p.fill('#accaLegs .accaleg >> nth=3 >> input[type=text]','2.0'); await p.waitForTimeout(100);
 const cut4=parseFloat((await stats('#accaOut'))["bookmaker's cut"]); check('a fourth pick raises the cut',cut4>13.6&&Math.abs(cut4-17.7)<0.2,cut4);
 await p.click('#accaLegs .accaleg >> nth=3 >> text=Remove'); await p.waitForTimeout(80); check('remove a pick',await p.$$eval('#accaLegs .accaleg',e=>e.length)===3);
 // ---- accumulator from loaded prices
 await p.click('[data-tab=today]'); await p.click('#refreshBtn'); await p.waitForTimeout(1200);
 await p.waitForFunction(()=>{ const s=JSON.parse(localStorage.getItem('betiqlite.v1')||'{}'); return !!(s.cache&&s.cache.soccer_epl&&s.cache.soccer_epl.events.length); },null,{timeout:15000});
 await p.click('[data-tab=more]'); await p.waitForSelector('#accaLegs .accaleg select'); if(!(await p.isVisible('#accaLegs'))) await p.click('#tAcca > summary');
 const opts=await p.$$eval('#accaLegs .accaleg >> nth=0 >> option',o=>o.map(x=>x.innerText)); check('picks offered from loaded prices',opts.length===7&&opts.some(o=>/^Arsenal to win · Arsenal v Everton · 2\.00$/.test(o)),opts.slice(1,3).join(' | '));
 await p.selectOption('#accaLegs .accaleg >> nth=0 >> select',{label:'Arsenal to win · Arsenal v Everton · 2.00'}); await p.waitForTimeout(100);
 await p.selectOption('#accaLegs .accaleg >> nth=1 >> select',{label:'Chelsea to win · Chelsea v Brighton · 2.50'}); await p.waitForTimeout(100);
 await p.click('#accaLegs .accaleg >> nth=2 >> text=Remove'); await p.waitForTimeout(100);
 s=await stats('#accaOut'); const real=await p.evaluate(()=>{const q=[1/2.0,1/3.6,1/3.8], r=[1/2.5,1/3.4,1/2.9]; return {a:q[0]/q.reduce((x,y)=>x+y,0), b:r[0]/r.reduce((x,y)=>x+y,0)};});
 console.log('   double from loaded prices:',JSON.stringify(s),'| simple fair chances for comparison',real.a.toFixed(3),real.b.toFixed(3));
 const ch=parseFloat(s['chance all win']); check('uses the real fair chances, not the 5% guess',/^£25\.00 \/ odds of 5\.00/.test(s['pays if all win'])&&Math.abs(ch-100*real.a*real.b)<1.5&&!/assumed to be 5%/.test(await p.innerText('#accaOut')),ch+' vs '+(100*real.a*real.b).toFixed(1));
 await p.selectOption('#accaLegs .accaleg >> nth=1 >> select',{label:'Draw · Arsenal v Everton · 3.60'}); await p.waitForTimeout(100);
 check('warns about two picks from one match',/Two of your picks are from the same match/.test(await p.innerText('#accaOut')));
 console.log('errs',errs,'overflow',await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),'fails',fails); await b.close(); process.exit(fails||errs.length?1:0);
})();
