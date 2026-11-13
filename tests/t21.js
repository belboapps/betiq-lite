const { chromium } = require('playwright');
const books=['Bet365','Sky Bet','Paddy Power','William Hill','Ladbrokes','Betfair Sportsbook'];
function ev(id,h,a,minsFromNow,base,boost){return {id,sport_key:'soccer_epl',home_team:h,away_team:a,commence_time:new Date(Date.now()+minsFromNow*60e3).toISOString(),
 bookmakers:books.map((b,i)=>({key:b.toLowerCase().replace(/ /g,'_'),title:b,markets:[{key:'h2h',outcomes:[{name:h,price:+(base[0]*(i===2?boost:1)).toFixed(2)},{name:a,price:base[2]},{name:'Draw',price:base[1]}]}]}))};}
(async()=>{
 const refuse=process.argv[2]==='refuse';
 const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2}); const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
 const dialogs=[]; p.on('dialog',d=>{dialogs.push(d.message()); d.accept();});
 let liveCalls=0, scoreCalls=0, boost=1.0, remaining=300;
 await p.route('**/*',r=>{const u=r.request().url(); if(u.startsWith('file:'))return r.continue(); if(u.includes('fonts.g'))return r.abort();
  const url=new URL(u); const h=last=>({'access-control-allow-origin':'*','access-control-expose-headers':'*','x-requests-remaining':String(remaining),'x-requests-last':String(last),'content-type':'application/json'});
  if(url.pathname.match(/events\/live1\/odds/)){ liveCalls++; if(refuse) return r.fulfill({status:422,headers:h(0),body:'{"message":"no live"}'}); remaining-=1; return r.fulfill({headers:h(1),body:JSON.stringify(ev('live1','Arsenal','Everton',-10,[2.4,3.3,3.0],boost))}); }
  if(url.pathname.includes('/scores/')){ scoreCalls++; remaining-=2; return r.fulfill({headers:h(2),body:JSON.stringify([{id:'live1',completed:false,scores:[{name:'Arsenal',score:'1'},{name:'Everton',score:'0'}]}])}); }
  if(url.pathname.endsWith('/odds/')){ remaining-=1; return r.fulfill({headers:h(1),body:JSON.stringify([ev('live1','Arsenal','Everton',-10,[2.4,3.3,3.0],1.0),ev('e2','Chelsea','Brighton',600,[1.9,3.6,4.2],1.12)])}); }
  return r.fulfill({headers:h(0),body:'[]'});});
 await p.addInitScript(()=>{ if(!sessionStorage.getItem('seeded')){sessionStorage.setItem('seeded','1'); localStorage.setItem('betiqlite.v1',JSON.stringify({key:'dummy',auto:false,ver:2,booksSet:true,pracAsked:true,tour:true,practice:true,sports:[{key:'soccer_epl',title:'EPL',group:'Soccer'}],selected:['soccer_epl'],picked:true}))}});
 await p.goto('file://'+require('path').resolve(__dirname,'..','index.html')+''); await p.waitForTimeout(400); await p.click('#refreshBtn'); await p.waitForTimeout(1200);
 console.log('in-play row:',await p.$eval('#plan .plain .accbtn',e=>e.innerText).catch(()=> 'NONE'));
 await p.click('#plan .plain .accbtn'); await p.waitForTimeout(800);
 console.log('confirm text:',dialogs[0]?.slice(0,120));
 if(refuse){ console.log('REFUSED ->',(await p.innerText('#liveBox')).replace(/\n+/g,' | ').slice(0,200)); console.log('errs',errs); await b.close(); return; }
 console.log('panel:',(await p.innerText('#liveBox')).replace(/\n+/g,' | ').slice(0,330));
 boost=1.12; await p.click('#liveBox .btn:has-text("Check now")'); await p.waitForTimeout(500);
 console.log('after boost:',(await p.innerText('#liveBox')).replace(/\n+/g,' | ').match(/Standout[^|]*\|[^|]*\|[^|]*\|[^|]*/)?.[0]);
 console.log('standout rows:',await p.$$eval('#liveBox .badge.value',e=>e.length),'| calls',liveCalls,scoreCalls);
 await p.click('#liveBox .actions .btn:has-text("Log practice bet")'); await p.waitForTimeout(300);
 const bets=await p.evaluate(()=>JSON.parse(localStorage.getItem('betiqlite.v1')).pbets.map(b=>b.sel+'|'+b.odds+'|'+b.live+'|'+b.stake)); console.log('live bet logged:',bets);
 await p.screenshot({path:'live.png'});
 await p.evaluate(()=>{const s=JSON.parse(localStorage.getItem('betiqlite.v1')); s.live.spent=s.live.cap; localStorage.setItem('betiqlite.v1',JSON.stringify(s));}); await p.reload(); await p.waitForTimeout(700);
 console.log('cap stop:',(await p.innerText('#liveBox')).replace(/\n+/g,' | ').match(/Stopped[^|]*/)?.[0]);
 await p.click('[data-tab=bets]'); console.log('LIVE tag in My bets:',await p.$eval('#betsBody .nm',e=>e.innerText.replace(/\n/g,' ')));
 console.log('errs',errs,'overflow',await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth)); await b.close();
})();
