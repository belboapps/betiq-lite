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
  if(u.includes('/scores/'))return r.fulfill({headers:h,body:JSON.stringify([{id:'e1',completed:true,scores:[{name:'Arsenal',score:'2'},{name:'Everton',score:'1'}]},{id:'c1',completed:true,scores:[{name:'Leeds',score:'0'},{name:'Burnley',score:'0'}]}])}); return r.fulfill({headers:h,body:'[]'});});
 await p.addInitScript(()=>{ if(!sessionStorage.getItem('seeded')){sessionStorage.setItem('seeded','1'); localStorage.setItem('betiqlite.v1',JSON.stringify({key:'dummy',auto:false,totals:true,ver:2,booksSet:true,pracAsked:true,weekly:30,
  sports:[{key:'soccer_uefa_champs_league',title:'UEFA Champions League',group:'Soccer'},{key:'soccer_efl_champ',title:'Championship',group:'Soccer'},{key:'soccer_epl',title:'EPL',group:'Soccer'}],
  selected:['soccer_uefa_champs_league','soccer_efl_champ','soccer_epl'],picked:true}))}});
 await p.goto('file://'+require('path').resolve(__dirname,'..','index.html')+''); await p.waitForTimeout(500); await p.click('#refreshBtn'); await p.waitForTimeout(1200);
 const st=()=>p.evaluate(()=>{const s=JSON.parse(localStorage.getItem('betiqlite.v1')); return s.sugg.map(x=>x.sel+'|'+x.h+'|'+x.odds+'|'+x.score+'|'+x.status+'|'+x.profit)});
 console.log('SUGG after refresh:',await st());
 await p.click('#refreshBtn'); await p.waitForTimeout(1200); console.log('no duplicates on 2nd refresh:',(await st()).length);
 console.log('PLAN LINE:',await p.$eval('#plan .subnote',e=>e.innerText));
 console.log('CARD DO:',await p.$$eval('#plan .brow .verdict',e=>e.slice(0,3).map(x=>x.className+' :: '+x.innerText)));
 const ics=await p.$eval('#plan .brow .bacts a.accbtn',a=>decodeURIComponent(a.getAttribute('href'))); console.log('ICS:',ics.startsWith('data:text/calendar'),ics.match(/SUMMARY:[^\r]*/)?.[0],'|',ics.match(/DESCRIPTION:[^\r]*/)?.[0].slice(0,110));
 await p.click('#plan .brow >> nth=0 >> .bmain'); await p.waitForTimeout(200); console.log('SHEET timing:',(await p.innerText('#sheetBody .timing')).replace(/\n+/g,' | ').slice(0,260)); await p.click('#sheetClose');
 await p.click('[data-tab=bets]'); await p.waitForTimeout(150); console.log('RECORD early:',(await p.innerText('#recordBody')).replace(/\n+/g,' | ').slice(0,300));
 await p.evaluate(()=>{const s=JSON.parse(localStorage.getItem('betiqlite.v1')); s.sugg.forEach(x=>x.time=Date.now()-4*3600e3); localStorage.setItem('betiqlite.v1',JSON.stringify(s));}); await p.reload(); await p.waitForTimeout(500);
 await p.click('[data-tab=bets]'); await p.waitForTimeout(150); console.log('UPDATE BTN:',await p.$eval('#recordBody .btn',e=>e.innerText));
 await p.click('#recordBody .btn'); await p.waitForTimeout(900); console.log('SUGG settled:',await st());
 console.log('RECORD after:',(await p.innerText('#recordBody')).replace(/\n+/g,' | ').slice(0,700)); await p.screenshot({path:'rec.png',fullPage:true});
 console.log('errs',errs,'overflow',await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth)); await b.close();})();
