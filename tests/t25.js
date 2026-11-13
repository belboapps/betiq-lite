const { chromium } = require('playwright');
(async()=>{
 const b=await chromium.launch(); const p=await (await b.newContext({viewport:{width:390,height:844}})).newPage(); const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
 const SPORTS=[{key:'soccer_epl',title:'EPL',group:'Soccer',active:true,has_outrights:false},{key:'soccer_efl_champ',title:'Championship',group:'Soccer',active:true,has_outrights:false},{key:'soccer_uefa_champs_league',title:'UCL',group:'Soccer',active:true,has_outrights:false},
  {key:'tennis_atp_paris',title:'ATP Paris',group:'Tennis',active:true,has_outrights:false},{key:'tennis_wta_finals',title:'WTA Finals',group:'Tennis',active:true,has_outrights:false},{key:'tennis_atp_x',title:'ATP X',group:'Tennis',active:true,has_outrights:false},
  {key:'basketball_euroleague',title:'Euroleague',group:'Basketball',active:true,has_outrights:false},{key:'basketball_nba',title:'NBA',group:'Basketball',active:true,has_outrights:false},{key:'americanfootball_nfl',title:'NFL',group:'American Football',active:true,has_outrights:false}];
 await p.route('**/*',r=>{const u=r.request().url(); if(u.startsWith('file:'))return r.continue(); const h={'access-control-allow-origin':'*','access-control-expose-headers':'*','x-requests-remaining':'400','content-type':'application/json'};
  if(u.endsWith('/sports/?apiKey=dummy')||/\/sports\/\?/.test(u)) return r.fulfill({headers:h,body:JSON.stringify(SPORTS)}); return r.fulfill({headers:h,body:'[]'});});
 await p.addInitScript(()=>{ if(!sessionStorage.getItem('seeded')){sessionStorage.setItem('seeded','1'); localStorage.setItem('betiqlite.v1',JSON.stringify({key:'dummy',auto:false,ver:2,booksSet:true,pracAsked:true,tour:true,picked:true,selected:['soccer_epl'],sports:[]}));}});
 await p.goto('file://'+require('path').resolve(__dirname,'..','index.html')+''); await p.waitForTimeout(600);
 await p.click('[data-tab=more]'); await p.waitForTimeout(150); await p.click('#useRecommended'); await p.waitForTimeout(600);
 console.log('selected:',await p.evaluate(()=>JSON.parse(localStorage.getItem('betiqlite.v1')).selected));
 console.log('alert:',await p.innerText('#alerts'));
 console.log('errs',errs); await b.close();
})();
