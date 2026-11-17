// Beginner guidance: the "how to place this bet" steps, fractional odds, page hints and the simpler card in Simple view.
const { chromium } = require('playwright');
const books=['Bet365','Sky Bet','Paddy Power','William Hill','Ladbrokes','Betfair Sportsbook'];
function ev(id,h,a,hrs,base,boost){return {id,sport_key:'soccer_epl',home_team:h,away_team:a,commence_time:new Date(Date.now()+hrs*3600e3).toISOString(),
 bookmakers:books.map((b,i)=>({key:b.toLowerCase().replace(/ /g,'_'),title:b,markets:[{key:'h2h',outcomes:[{name:h,price:+(base[0]*(i===2?boost:1)).toFixed(2)},{name:a,price:base[2]},{name:'Draw',price:base[1]}]}]}))};}
let fails=0; function check(name,ok,info){ if(!ok) fails++; console.log((ok?'PASS ':'FAIL ')+name+(info!==undefined?' | '+info:'')); }
(async()=>{
 const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:390,height:844}}); const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(String(e))); p.on('dialog',d=>d.accept());
 await p.route('**/*',r=>{const u=r.request().url(); if(u.startsWith('file:'))return r.continue(); if(u.includes('fonts.g'))return r.abort();
  const h={'access-control-allow-origin':'*','access-control-expose-headers':'*','x-requests-remaining':'400','x-requests-last':'1','content-type':'application/json'};
  if(/\/odds\/\?/.test(u)) return r.fulfill({headers:h,body:JSON.stringify([ev('e1','Arsenal','Everton',2,[1.7,3.9,5.5],1.08),ev('e2','Leeds','Wolves',40,[4.2,3.6,1.95],1.0)])});
  return r.fulfill({headers:h,body:'[]'});});
 await p.addInitScript(()=>{ if(!localStorage.getItem('betiqlite.v1')) localStorage.setItem('betiqlite.v1',JSON.stringify({key:'dummy',auto:false,ver:2,booksSet:true,pracAsked:true,tour:true,simple:true,practice:true,planDone:true,sports:[{key:'soccer_epl',group:'Soccer',title:'EPL'}],selected:['soccer_epl'],windowH:72,bankroll:100})); });
 await p.goto('file://'+require('path').resolve(__dirname,'..','index.html')); await p.waitForTimeout(500);
 await p.click('#refreshBtn'); await p.waitForTimeout(1200);
 await p.waitForFunction(()=>{ const s=JSON.parse(localStorage.getItem('betiqlite.v1')||'{}'); return !!(s.cache&&s.cache.soccer_epl&&s.cache.soccer_epl.events.length); },null,{timeout:15000});
 await p.waitForSelector('#tab-today .brow');
 // ---- Today, simple view, practice mode
 const card=await p.$eval('#tab-today .brow:has-text("Arsenal")',e=>({verdict:e.querySelector('.verdict b').innerText,steps:[...e.querySelectorAll('.howto .hstep')].map(x=>x.innerText.replace(/\n/g,' ')),
   hidden:['.cgrid','.sbox','.pillev'].map(s=>{const x=e.querySelector(s); return !x||getComputedStyle(x).display==='none';}),trio:e.querySelectorAll('.trio .t3').length,order:[...e.querySelector('.bmain').children].map(x=>x.className.split(' ')[0])}));
 console.log('   steps:\n     '+card.steps.join('\n     '));
 check('PLACE card has six numbered steps',/PLACE/.test(card.verdict)&&card.steps.length===6&&card.steps.every((s,i)=>s.startsWith(String(i+1)+' ')));
 check('steps name the bookmaker, match and selection',/Open Paddy Power\./.test(card.steps[0])&&/Arsenal v Everton/.test(card.steps[1])&&/match result.*choose Arsenal\./.test(card.steps[2]));
 // minimum price 1.79: the smallest standard fraction that is not worse is 4/5 (1.80)
 check('minimum odds in decimal and fractional',/odds are 1\.79 \(shown as 4\/5 on some apps\) or higher\. If they are lower, do not bet\./.test(card.steps[3]),card.steps[3]);
 check('practice mode says not to pay',/Practice mode: stop here and do not pay/.test(card.steps[4])&&/tap Log practice bet/.test(card.steps[5]));
 check('steps come straight after the verdict',card.order.indexOf('howto')===card.order.indexOf('verdict')+1,card.order.join(' > '));
 check('simple view hides the analyst numbers, keeps the three displays',card.hidden.every(Boolean)&&card.trio===3);
 // ---- real-money wording
 await p.click('[data-tab=more]'); await p.waitForSelector('#practiceOn'); await p.uncheck('#practiceOn'); await p.waitForTimeout(200);
 await p.click('[data-tab=today]'); await p.waitForSelector('#tab-today .brow');
 const real=await p.$$eval('#tab-today .brow:has-text("Arsenal") .howto .hstep',e=>e.map(x=>x.innerText.replace(/\n/g,' ')));
 check('real mode gives the stake and both outcomes',/Type in a stake of £[\d.]+ and confirm\. If it wins you get £[\d.]+ back, if it loses you lose the £[\d.]+\./.test(real[4])&&/tap I placed it/.test(real[5]),real[4]);
 // ---- detail sheet carries the same steps; full view keeps the analyst numbers
 await p.click('#tab-today .brow:has-text("Arsenal") >> .bmain'); await p.waitForSelector('#sheetBody .detail');
 check('detail sheet shows the steps too',await p.$$eval('#sheetBody .detail > .howto .hstep',e=>e.length)===6); await p.click('#sheetClose'); await p.waitForFunction(()=>document.getElementById('sheet').hidden);
 await p.click('[data-tab=more]'); await p.uncheck('#simpleOn'); await p.waitForTimeout(200); await p.click('[data-tab=all]'); await p.waitForSelector('#list .brow');
 check('full view still shows the analyst numbers',await p.$eval('#list .brow:has-text("Arsenal")',e=>['.cgrid','.sbox'].every(s=>getComputedStyle(e.querySelector(s)).display!=='none')));
 // ---- a bet the app does not recommend gets no steps
 const others=await p.$$eval('#list .brow',r=>r.map(x=>({v:x.querySelector('.verdict b').innerText,how:!!x.querySelector('.howto')})));
 check('no steps on bets that are not PLACE or CONSIDER',others.every(o=>/PLACE|CONSIDER/.test(o.v)===o.how),JSON.stringify(others));
 // ---- every page says what it is for
 const hints={}; for(const t of ['all','bets','more']){ await p.click(`[data-tab=${t}]`); await p.waitForTimeout(100); hints[t]=await p.innerText(`#tab-${t} .hint`); }
 check('each page says what to do there',/do not need this page to bet/.test(hints.all)&&/Nothing to do here most days/.test(hints.bets)&&/Set these once/.test(hints.more));
 console.log('errs',errs,'overflow',await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),'fails',fails); await b.close(); process.exit(fails||errs.length?1:0);
})();
