// Offers tab for beginners: the guided walk-through from adding an offer to finishing it.
const { chromium } = require('playwright');
const books=[['bet365','Bet365'],['skybet','Sky Bet'],['paddypower','Paddy Power'],['williamhill','William Hill'],['betfair_ex_uk','Betfair Exchange']];
// layHome: when given, the exchange also sends a real lay price for the home team (market key h2h_lay), as The Odds API does
function ev(id,h,a,hrs,base,layHome){return {id,sport_key:'soccer_epl',home_team:h,away_team:a,commence_time:new Date(Date.now()+hrs*3600e3).toISOString(),
 bookmakers:books.map(([k,t],i)=>({key:k,title:t,markets:(k==='betfair_ex_uk'&&layHome?[{key:'h2h_lay',outcomes:[{name:h,price:layHome},{name:'Bogus',price:0}]}]:[]).concat([{key:'h2h',outcomes:[{name:h,price:+(base[0]*(k==='betfair_ex_uk'?1.03:i===0?1.0:0.97)).toFixed(2)},{name:a,price:+(base[2]*(k==='betfair_ex_uk'?1.06:1)).toFixed(2)},{name:'Draw',price:+(base[1]*(k==='betfair_ex_uk'?1.05:1)).toFixed(2)}]}])}))};}
let fails=0; function check(name,ok,info){ if(!ok) fails++; console.log((ok?'PASS ':'FAIL ')+name+(info!==undefined?' | '+info:'')); }
(async()=>{
 const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:390,height:844}}); const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(String(e))); p.on('dialog',d=>d.accept());
 await p.route('**/*',r=>{const u=r.request().url(); if(u.startsWith('file:'))return r.continue(); if(u.includes('fonts.g'))return r.abort();
  const h={'access-control-allow-origin':'*','access-control-expose-headers':'*','x-requests-remaining':'400','x-requests-last':'1','content-type':'application/json'};
  if(/\/odds\/\?/.test(u)) return r.fulfill({headers:h,body:JSON.stringify([ev('e1','Arsenal','Everton',20,[2.1,3.6,3.9],2.20),ev('e2','Chelsea','Brighton',30,[5.0,4.2,1.7])])});
  return r.fulfill({headers:h,body:'[]'});});
 await p.addInitScript(()=>{ if(!localStorage.getItem('betiqlite.v1')) localStorage.setItem('betiqlite.v1',JSON.stringify({key:'dummy',auto:false,ver:2,booksSet:true,pracAsked:true,tour:true,simple:false,sports:[{key:'soccer_epl',group:'Soccer',title:'EPL'}],selected:['soccer_epl'],windowH:72,bankroll:100})); });
 await p.goto('file://'+require('path').resolve(__dirname,'..','index.html')); await p.waitForTimeout(500);
 await p.click('#refreshBtn'); await p.waitForTimeout(1200);
 await p.waitForFunction(()=>{ const s=JSON.parse(localStorage.getItem('betiqlite.v1')||'{}'); return !!(s.cache&&s.cache.soccer_epl&&s.cache.soccer_epl.events.length); },null,{timeout:15000});
 await p.click('[data-tab=offers]'); await p.waitForSelector('#mbTodo .reco');
 const todo=async()=>(await p.innerText('#mbTodo')).replace(/\n/g,' ');
 const cardText=async()=>(await p.innerText('#mbList .mboffer >> nth=0')).replace(/\n/g,' ');
 const stored=()=>p.evaluate(()=>JSON.parse(localStorage.getItem('betiqlite.v1')).mb.offers);
 check('starts by telling you to add an offer',/Add an offer below/.test(await todo()));
 check('the tools are out of the way',await p.evaluate(()=>!document.getElementById('mbTools').open));
 // ---- add with three fields
 await p.fill('#mbNewBook','bet365'); await p.fill('#mbNewQual','10'); await p.fill('#mbNewFree','30'); await p.click('#mbAdd'); await p.waitForSelector('#mbList .mboffer');
 let o=(await stored())[0]; check('three fields are enough; name and bookmaker tidied',o.book==='Bet365'&&o.name==='Bet £10 get £30'&&o.step==='todo',o.book+' / '+o.name);
 check('what to do names the offer and the step',/Bet365: place the first bet\. The steps are in its card below\./.test(await todo()),await todo());
 // ---- step 1: pick a suggested match, read the two bets
 const sug=await p.$$eval('#mbList .mboffer .mbmatch',r=>r.map(x=>x.innerText.replace(/\n/g,' '))); console.log('   suggestions:',sug.join(' || ').slice(0,260));
 check('up to three suggested matches, cheapest known price first',sug.length>=1&&sug.length<=3&&/^Arsenal/.test(sug[0])&&/costs about £0\.72/.test(sug[0]));
 await p.click('#mbList .mboffer .mbmatch >> nth=0 >> button'); await p.waitForSelector('#mbList .mboffer .howto');
 let steps=await p.$$eval('#mbList .mboffer .howto .hstep',e=>e.map(x=>x.innerText.replace(/\n/g,' '))); console.log('   bets:\n     '+steps.join('\n     '));
 // lay = 2.10*10/(2.20-0.05) = 9.77; exchange holds 9.77*1.20 = 11.72
 check('bookmaker bet written out',/1 At Bet365: bet £10\.00 on Arsenal in Arsenal v Everton, at odds of 2\.10 \(shown as 11\/10 on some apps\) or higher\./.test(steps[0]),steps[0]);
 check('exchange bet written out, with what LAY means',/2 Straight away on Betfair Exchange: .*press LAY, which means betting it will not happen\. Stake £9\.77 at odds of 2\.20 or lower\./.test(steps[1]),steps[1]);
 check('money the exchange holds',/3 Betfair Exchange holds £11\.72 from your balance/.test(steps[2]),steps[2]);
 check('result in plain words, no estimate warning for a real price',/Whatever happens you lose about £0\.72\. That is the price of the free bet\./.test(await cardText())&&!(await p.$('#mbList .mboffer .hwarn')));
 await p.click('#mbList .mboffer >> text=I have placed both bets'); await p.waitForTimeout(150);
 o=(await stored())[0]; check('result recorded without typing it',o.step==='wait'&&o.q===-0.72&&!o.pick,JSON.stringify({step:o.step,q:o.q}));
 // ---- step 2: wait
 check('step 2 says to wait',/STEP 2 OF 3: WAIT FOR THE FREE BET/i.test(await cardText())&&/Nothing right now/.test(await todo()));
 await p.click('#mbList .mboffer >> text=My free bet has arrived'); await p.waitForTimeout(150);
 // ---- step 3: free bet, typing the odds seen
 check('step 3 asks for the free bet',/STEP 3 OF 3: USE THE FREE BET/i.test(await cardText())&&/Bet365: use the free bet/.test(await todo()));
 const free=await p.$$eval('#mbList .mboffer .mbmatch',r=>r.map(x=>x.innerText.replace(/\n/g,' '))); check('free-bet suggestions are at longer odds',free.length>=1&&/^Chelsea/.test(free[0])&&/keep about £/.test(free[0]),free[0]);
 await p.click('#mbList .mboffer .mbtype > summary');
 await p.fill('#mbList .mbtype input >> nth=0','abc').catch(()=>{}); await p.click('#mbList .mbtype >> text=Work it out'); await p.waitForTimeout(100);
 check('bad odds are explained, fractions included',/Enter both odds as decimals.*switch it to decimal odds/.test(await p.innerText('#mbList .mbtype')));
 await p.fill('#mbList .mbtype input >> nth=0','5'); await p.fill('#mbList .mbtype input >> nth=1','5.2'); await p.selectOption('#mbList .mbtype select','0.02'); await p.click('#mbList .mbtype >> text=Work it out'); await p.waitForSelector('#mbList .mboffer .howto');
 steps=await p.$$eval('#mbList .mboffer .howto .hstep',e=>e.map(x=>x.innerText.replace(/\n/g,' ')));
 // lay = 4*30/(5.2-0.02) = 23.17; keeps 22.69 (same figures as the calculator test)
 check('typed odds give the free-bet stakes',/use your £30\.00 free bet on your chosen outcome, at odds of 5\.00/.test(steps[0])&&/on Smarkets or Matchbook: .*Stake £23\.17 at odds of 5\.20 or lower/.test(steps[1])&&/keep about £22\.69/.test(await cardText()),steps[1]);
 await p.click('#mbList .mboffer >> text=Choose a different match'); await p.waitForTimeout(100); check('can change your mind',!(await p.$('#mbList .mboffer .howto'))&&!(await stored())[0].pick);
 await p.click('#mbList .mboffer .mbtype > summary'); await p.fill('#mbList .mbtype input >> nth=0','5'); await p.fill('#mbList .mbtype input >> nth=1','5.2'); await p.selectOption('#mbList .mbtype select','0.02'); await p.click('#mbList .mbtype >> text=Work it out'); await p.waitForSelector('#mbList .mboffer .howto');
 await p.click('#mbList .mboffer >> text=I have placed both bets'); await p.waitForTimeout(150);
 check('both bets on: nothing to do',/BOTH BETS ARE ON/i.test(await cardText())&&/Nothing right now/.test(await todo()));
 await p.click('#mbList .mboffer >> text=The match has finished'); await p.waitForTimeout(150);
 o=(await stored())[0]; const sum=(await p.innerText('#mbSum')).replace(/\n/g,' ');
 check('finished, with the total',o.step==='done'&&o.f===22.69&&/You made \+£21\.97 from this offer/.test(await cardText())&&/\+£21\.97/.test(sum)&&/1 offer finished/.test(sum),sum);
 // ---- a bookmaker with no loaded prices
 await p.fill('#mbNewBook','Corner Shop Bets'); await p.fill('#mbNewQual','5'); await p.fill('#mbNewFree','20'); await p.click('#mbAdd'); await p.waitForTimeout(150);
 const un=await cardText(); check('unknown bookmaker: asks you to type the odds, form already open',/no loaded prices for Corner Shop Bets, so type the odds you can see/.test(un)&&await p.$eval('#mbList .mboffer >> nth=0 >> .mbtype',e=>e.open)&&!(await p.$('#mbList .mboffer >> nth=0 >> .mbmatch')));
 console.log('errs',errs,'overflow',await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),'fails',fails); await b.close(); process.exit(fails||errs.length?1:0);
})();
