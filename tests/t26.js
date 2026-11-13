const { chromium } = require('playwright');
const books=['Bet365','Sky Bet','Paddy Power','William Hill','Ladbrokes','Betfair Sportsbook'];
function ev(id,h,a,hrs,base,boost){return {id,sport_key:'soccer_epl',home_team:h,away_team:a,commence_time:new Date(Date.now()+hrs*3600e3).toISOString(),
 bookmakers:books.map((b,i)=>({key:b.toLowerCase().replace(/ /g,'_'),title:b,markets:[{key:'h2h',outcomes:[{name:h,price:+(base[0]*(i===2?boost:1)).toFixed(2)},{name:a,price:base[2]},{name:'Draw',price:base[1]}]}]}))};}
(async()=>{
 const b=await chromium.launch(); const p=await (await b.newContext({viewport:{width:390,height:844}})).newPage(); const errs=[]; p.on('pageerror',e=>errs.push(String(e))); p.on('dialog',d=>d.accept());
 let scoreCalls=0;
 await p.route('**/*',r=>{const u=r.request().url(); if(u.startsWith('file:'))return r.continue(); const h={'access-control-allow-origin':'*','access-control-expose-headers':'*','x-requests-remaining':'400','x-requests-last':'1','content-type':'application/json'};
  if(u.includes('/scores/')){scoreCalls++; return r.fulfill({headers:h,body:JSON.stringify([{id:'old1',completed:true,scores:[{name:'Arsenal',score:'2'},{name:'Everton',score:'0'}]}])});}
  if(/\/odds\/\?/.test(u)) return r.fulfill({headers:h,body:JSON.stringify([ev('e1','Arsenal','Everton',20,[1.9,3.6,4.2],1.12),ev('e2','Chelsea','Brighton',30,[2.1,3.4,3.6],1.0),ev('e3','Spurs','Fulham',40,[1.8,3.9,4.4],1.0)])});
  return r.fulfill({headers:h,body:'[]'});});
 const now=Date.now();
 await p.addInitScript((s)=>{ if(!sessionStorage.getItem('seeded')){sessionStorage.setItem('seeded','1'); localStorage.setItem('betiqlite.v1',JSON.stringify(s));}},
  {key:'dummy',auto:true,autoHours:4,ver:2,booksSet:true,pracAsked:true,tour:true,sports:[{key:'soccer_epl',title:'EPL',group:'Soccer'}],selected:['soccer_epl'],picked:true,
   sugg:[{sugg:true,pid:'old1|Arsenal',evId:'old1',key:'soccer_epl',league:'EPL',h:'Arsenal',a:'Everton',sel:'Arsenal',odds:2.1,book:'X',fair:.5,ev:.05,score:70,v:'place',stake:1,time:now-5*3600e3,at:now-6*3600e3,status:'open',profit:0}]});
 await p.goto('file://'+require('path').resolve(__dirname,'..','index.html')); await p.waitForTimeout(1500);
 console.log('simple class:',await p.evaluate(()=>document.body.classList.contains('simple')),'| heading:',await p.$eval('#plan h2',e=>e.innerText));
 console.log('cards shown:',await p.$$eval('#plan .brow .verdict b',e=>e.map(x=>x.innerText)));
 console.log('adv hidden (calc, cloud, scenarios):',await p.$$eval('#calcBox,#sbBox,#scenBox',e=>e.map(x=>getComputedStyle(x).display)));
 console.log('record auto-updated on open:',scoreCalls>0,'| status:',await p.evaluate(()=>JSON.parse(localStorage.getItem('betiqlite.v1')).sugg[0].status));
 await p.click('[data-tab=more]'); await p.waitForTimeout(150); await p.uncheck('#simpleOn'); await p.waitForTimeout(200);
 console.log('after toggle, adv visible:',await p.$$eval('#calcBox,#sbBox',e=>e.map(x=>getComputedStyle(x).display)));
 await p.click('[data-tab=today]'); console.log('full board cards:',await p.$$eval('#plan .brow',e=>e.length),'| heading:',await p.$eval('#plan h2',e=>e.innerText));
 console.log('errs',errs,'overflow',await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth)); await b.close();
})();
