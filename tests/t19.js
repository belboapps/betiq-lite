const { chromium } = require('playwright');
const books=['Bet365','Sky Bet','Paddy Power','William Hill','Ladbrokes','Betfair Sportsbook'];
function ev(id,sk,h,a,hrs,base,boost){return {id,sport_key:sk,home_team:h,away_team:a,commence_time:new Date(Date.now()+hrs*3600e3).toISOString(),
 bookmakers:books.map((b,i)=>({key:b.toLowerCase().replace(/ /g,'_'),title:b,markets:[{key:'h2h',outcomes:[{name:h,price:+(base[0]*(i===2?boost:1)).toFixed(2)},{name:a,price:base[2]},{name:'Draw',price:base[1]}]},
  {key:'totals',outcomes:[{name:'Over',point:2.5,price:+(1.9*(i===1?1.1:1)).toFixed(2)},{name:'Under',point:2.5,price:1.95}]}]}))};}
const DATA={soccer_efl_champ:[ev('c1','soccer_efl_champ','Leeds','Burnley',22,[2.3,3.3,3.2],1.11),ev('c2','soccer_efl_champ','QPR','Lincoln',28,[2.6,3.3,2.8],1.0)],
 soccer_epl:[ev('e1','soccer_epl','Arsenal','Everton',20,[1.9,3.6,4.2],1.12),ev('e2','soccer_epl','Chelsea','Brighton',30,[2.1,3.4,3.6],1.10),ev('e3','soccer_epl','Spurs','Fulham',26,[1.8,3.9,4.4],1.0)],
 soccer_uefa_champs_league:[ev('u1','soccer_uefa_champs_league','Inter','Porto',40,[2.2,3.3,3.4],1.09)]};
(async()=>{
 const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,colorScheme:'dark'}); const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(String(e))); p.on('dialog',d=>d.accept());
 await p.route('**/*',r=>{const u=r.request().url(); if(u.startsWith('file:'))return r.continue(); if(u.includes('fonts.g'))return r.abort();
  const h={'access-control-allow-origin':'*','access-control-expose-headers':'*','x-requests-remaining':'400','content-type':'application/json'};
  const m=u.match(/sports\/([a-z_0-9]+)\/odds/); if(m) return r.fulfill({headers:h,body:JSON.stringify(DATA[m[1]]||[])});
  return r.fulfill({headers:h,body:'[]'});});
 await p.addInitScript(()=>{ if(!sessionStorage.getItem('seeded')){sessionStorage.setItem('seeded','1'); localStorage.setItem('betiqlite.v1',JSON.stringify({key:'dummy',auto:false,totals:true,ver:2,booksSet:true,pracAsked:true,weekly:30,
  sports:[{key:'soccer_uefa_champs_league',title:'UEFA Champions League',group:'Soccer'},{key:'soccer_efl_champ',title:'Championship',group:'Soccer'},{key:'soccer_epl',title:'EPL',group:'Soccer'}],
  selected:['soccer_uefa_champs_league','soccer_efl_champ','soccer_epl'],picked:true}))}});
 await p.goto('file://'+require('path').resolve(__dirname,'..','index.html')+''); await p.waitForTimeout(500); await p.click('#refreshBtn'); await p.waitForTimeout(1200);
 await p.screenshot({path:'k_today.png'});
 console.log('CARDS:',await p.$$eval('#plan .brow',r=>r.map(x=>x.querySelector('.clg').innerText+' | '+x.querySelector('.cmatch').innerText+' | '+[...x.querySelectorAll('.cgrid b')].map(b=>b.innerText).join(' / ')+' | '+[...x.querySelectorAll('.sbt b')].map(b=>b.innerText).join('/')+' | '+x.querySelector('.cwhen').innerText.split('·').pop().trim()+' | '+[...x.querySelectorAll('.cpay b')].map(b=>b.innerText).join(' -> '))));
 await p.click('#plan .brow >> nth=0 >> .bmain'); await p.waitForTimeout(250);
 console.log('WHY:',(await p.$$eval('#sheetBody .plain',e=>e.map(x=>x.innerText).filter(t=>/Why this score/.test(t))))[0].replace(/\n+/g,' | ').slice(0,420));
 await p.evaluate(()=>{document.querySelector('.panelsheet').scrollTop=150}); await p.screenshot({path:'k_sheet.png'}); await p.click('#sheetClose');
 await p.click('#plan .brow >> nth=0 >> .bacts .btn:has-text("I placed it")'); await p.waitForTimeout(200);
 console.log('logged:',await p.evaluate(()=>JSON.parse(localStorage.getItem('betiqlite.v1')).bets.length), await p.$eval('#plan .brow .bacts .btn.done',e=>e.innerText));
 await p.click('[data-tab=all]'); await p.waitForTimeout(200); await p.screenshot({path:'k_all.png'}); console.log('all rows:',await p.$$eval('#list .brow',r=>r.length));
 await p.click('#modeBal'); await p.waitForTimeout(200); console.log('balanced rows:',await p.$$eval('#list .brow',r=>r.length));
 await p.click('[data-tab=more]'); await p.waitForTimeout(150); await p.screenshot({path:'k_more.png'});
 console.log('errs',errs,'overflow',await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth)); await b.close();})();
