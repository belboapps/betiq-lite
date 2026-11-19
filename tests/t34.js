// Simple view: the "what to do now" box, the plain bet card, the how-to steps in the details sheet, fractional odds and page hints.
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
 const card=await p.$eval('#tab-today .brow:has-text("Arsenal")',e=>{const vis=x=>!!x&&getComputedStyle(x).display!=='none'&&x.offsetParent!==null;
   return {verdict:e.querySelector('.sverd').innerText.trim(),verdictCls:e.querySelector('.sverd').className,pick:e.querySelector('.spick').innerText,match:e.querySelector('.smatch').innerText,
   facts:[...e.querySelectorAll('.sfact')].map(x=>x.innerText.replace(/\n/g,' ').trim()),note:e.querySelector('.snote').innerText,icons:e.querySelectorAll('.sbet svg.ico').length,
   hidden:['.verdict','.howto','.cgrid','.sbox','.pillev','.trio','.cgist','.cmatch','.ctop'].map(s=>!vis(e.querySelector(s))),first:e.querySelector('.bmain').firstElementChild.className}; });
 console.log('   simple card:',JSON.stringify(card));
 check('plain verdict with an icon: Bet',card.verdict==='Bet'&&/place/.test(card.verdictCls),card.verdict);
 check('says what to back in words',card.pick==='Arsenal to win'&&/^Arsenal v Everton/.test(card.match),card.pick);
 check('three tiles: where, how much, what comes back',card.facts.length===3&&/^Where Paddy Power$/.test(card.facts[0])&&/^Bet £1\.50$/.test(card.facts[1])&&/^If it wins £[\d.]+ back$/.test(card.facts[2]),card.facts.join(' / '));
 check('one line with the lowest odds worth taking',/Only if Paddy Power still shows odds of 1\.79 or more\./.test(card.note),card.note);
 check('icons on the verdict, tiles and note',card.icons>=5,card.icons);
 check('simple view hides the analyst numbers and the long steps',card.hidden.every(Boolean)&&card.first==='sbet',JSON.stringify(card.hidden));
 const now=await p.$eval('#nowBox',e=>e.innerText.replace(/\n+/g,' | '));
 check('top of Today says what to do',/1 good bet today/.test(now)&&/Practice: pretend money/.test(now),now);
 // the short card: verdict, steps, summary, three displays, two buttons
 const short=await p.$eval('#tab-today .brow:has-text("Arsenal")',e=>{const vis=s=>[...e.querySelectorAll(s)].filter(x=>getComputedStyle(x).display!=='none'&&x.offsetParent!==null); return {h:Math.round(e.getBoundingClientRect().height),btns:vis('.actions .btn').map(x=>x.innerText.trim()),links:vis('.bacts > .accbtn').length,pay:vis('.cpay').length,more:vis('.cmore').length,why:/Why this bet\?/.test(e.querySelector('.cmore').innerText)};});
 console.log('   short card:',JSON.stringify(short));
 check('short card: two buttons, bookmaker first, a Why? link, nothing else',short.btns.length===2&&/^Place on Paddy Power/.test(short.btns[0])&&/Log practice bet/.test(short.btns[1])&&short.links===0&&short.pay===0&&short.more===1&&short.why);
 // ---- real-money wording
 await p.click('[data-tab=more]'); await p.waitForSelector('#practiceOn'); await p.uncheck('#practiceOn'); await p.waitForTimeout(200);
 await p.click('[data-tab=today]'); await p.waitForSelector('#tab-today .brow');
 const real=await p.$eval('#tab-today .brow:has-text("Arsenal")',e=>({btns:[...e.querySelectorAll('.actions .btn')].filter(x=>getComputedStyle(x).display!=='none').map(x=>x.innerText.trim()),now:document.getElementById('nowBox').innerText}));
 check('real mode: I placed it, and no practice wording',real.btns[1]==='I placed it'&&!/Practice/.test(real.now),JSON.stringify(real));
 // ---- detail sheet carries the same steps; full view keeps the analyst numbers
 await p.click('#tab-today .brow:has-text("Arsenal") >> .bmain'); await p.waitForSelector('#sheetBody .detail');
 const steps=await p.$$eval('#sheetBody .detail > .howto .hstep',e=>e.map(x=>x.innerText.replace(/\n/g,' ')));
 check('the six how-to steps are in the details',steps.length===6&&steps.every((t,i)=>t.startsWith(String(i+1)))&&/Open Paddy Power\./.test(steps[0])&&/Arsenal v Everton/.test(steps[1])&&/1\.79 \(shown as 4\/5 on some apps\) or higher/.test(steps[3])&&/Type in a stake of £[\d.]+ and confirm/.test(steps[4]),steps.join(' / '));
 check('what left the card is one tap away in the details',await p.$eval('#sheetBody',e=>/Copy bet/.test(e.innerText)&&/Suggested stake/i.test(e.innerText)&&/reminder to my calendar/.test(e.innerText))); await p.click('#sheetClose'); await p.waitForFunction(()=>document.getElementById('sheet').hidden);
 await p.click('[data-tab=more]'); await p.uncheck('#simpleOn'); await p.waitForTimeout(200); await p.click('[data-tab=all]'); await p.waitForSelector('#list .brow');
 check('full view still shows the analyst numbers',await p.$eval('#list .brow:has-text("Arsenal")',e=>['.cgrid','.sbox','.cpay','.actions .copy'].every(s=>getComputedStyle(e.querySelector(s)).display!=='none')));
 const full=await p.$eval('#list .brow:has-text("Arsenal")',e=>Math.round(e.getBoundingClientRect().height)); console.log('   card height: simple',short.h,'px, full',full,'px');
 check('the simple card is clearly shorter',short.h<full*0.8,short.h+' vs '+full);
 // ---- a bet the app does not recommend gets no steps
 const others=await p.$$eval('#list .brow',r=>r.map(x=>({v:x.querySelector('.verdict b').innerText,how:!!x.querySelector('.howto')})));
 check('no steps on bets that are not PLACE or CONSIDER',others.every(o=>/PLACE|CONSIDER/.test(o.v)===o.how),JSON.stringify(others));
 // ---- every page says what it is for
 const hints={}; for(const t of ['all','bets','more']){ await p.click(`[data-tab=${t}]`); await p.waitForTimeout(100); hints[t]=await p.innerText(`#tab-${t} .hint`); }
 check('each page says what to do there',/do not need this page to bet/.test(hints.all)&&/Nothing to do here most days/.test(hints.bets)&&/Set these once/.test(hints.more));
 console.log('errs',errs,'overflow',await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),'fails',fails); await b.close(); process.exit(fails||errs.length?1:0);
})();
