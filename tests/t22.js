const { chromium } = require('playwright');
const books=['Bet365','Sky Bet','Paddy Power','William Hill','Ladbrokes','Betfair Sportsbook'];
function two(id,sk,h,a,hrs,base,boost,spread){return {id,sport_key:sk,home_team:h,away_team:a,commence_time:new Date(Date.now()+hrs*3600e3).toISOString(),
 bookmakers:books.map((b,i)=>({key:b.toLowerCase().replace(/ /g,'_'),title:b,markets:[{key:'h2h',outcomes:[{name:h,price:+(base[0]*(i===2?boost:1)).toFixed(2)},{name:a,price:base[1]}]},
  {key:'totals',outcomes:[{name:'Over',point:220.5,price:+(1.9*(i===1?1.1:1)).toFixed(2)},{name:'Under',point:220.5,price:1.95}]}].concat(spread?[{key:'spreads',outcomes:[{name:h,point:-5.5,price:+(1.9*(i===2?1.12:1)).toFixed(2)},{name:a,point:5.5,price:1.95}]}]:[])}))};}
(async()=>{
 const b=await chromium.launch(); const p=await (await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2})).newPage(); const errs=[]; p.on('pageerror',e=>errs.push(String(e))); p.on('dialog',d=>d.accept());
 const calls=[];
 await p.route('**/*',r=>{const u=r.request().url(); if(u.startsWith('file:'))return r.continue(); if(u.includes('fonts.g'))return r.abort();
  const url=new URL(u); const h={'access-control-allow-origin':'*','access-control-expose-headers':'*','x-requests-remaining':'400','x-requests-last':'1','content-type':'application/json'};
  let m=url.pathname.match(/sports\/([a-z_0-9]+)\/events\/([a-z0-9]+)\/odds/); if(m){ calls.push(m[1]+':'+url.searchParams.get('markets')); return r.fulfill({headers:h,body:JSON.stringify(two(m[2],m[1],m[2]==='n1'?'Lakers':'Djokovic',m[2]==='n1'?'Celtics':'Alcaraz',20,[1.8,2.1],1.0,true))}); }
  m=url.pathname.match(/sports\/([a-z_0-9]+)\/odds\//); if(m){ const k=m[1];
    if(k==='basketball_nba') return r.fulfill({headers:h,body:JSON.stringify([two('n1',k,'Lakers','Celtics',20,[1.8,2.1],1.12,false)])});
    if(k==='tennis_atp_paris') return r.fulfill({headers:h,body:JSON.stringify([two('t1',k,'Djokovic','Alcaraz',30,[2.2,1.7],1.10,false)])});
    return r.fulfill({headers:h,body:'[]'}); }
  return r.fulfill({headers:h,body:'[]'});});
 await p.addInitScript(()=>{ if(!sessionStorage.getItem('seeded')){sessionStorage.setItem('seeded','1'); localStorage.setItem('betiqlite.v1',JSON.stringify({key:'dummy',auto:false,ver:2,booksSet:true,pracAsked:true,tour:true,totals:true,extras:true,
   sports:[{key:'basketball_nba',title:'NBA',group:'Basketball'},{key:'tennis_atp_paris',title:'ATP Paris',group:'Tennis'}],selected:['basketball_nba','tennis_atp_paris'],picked:true}))}});
 await p.goto('file://'+require('path').resolve(__dirname,'..','index.html')+''); await p.waitForTimeout(400); await p.click('#refreshBtn'); await p.waitForTimeout(1500);
 console.log('extra calls (non-football = spreads only):',calls);
 console.log('CARDS:',await p.$$eval('#plan .brow',r=>r.map(x=>x.querySelector('.clg').innerText+' | '+x.querySelector('.cmatch').innerText+' | '+x.querySelector('.verdict').innerText.replace(/\n/g,' :: ')+' | '+x.querySelector('.cgrid b').innerText)));
 console.log('PLAN LINE:',await p.$eval('#plan .subnote',e=>e.innerText).catch(()=>'none'));
 await p.click('#plan .brow >> nth=0 >> .bmain'); await p.waitForTimeout(250);
 console.log('SHEET verdict:',await p.$eval('#sheetBody .verdict',e=>e.innerText.replace(/\n/g,' :: ')));
 console.log('SHEET why:',(await p.$$eval('#sheetBody .plain',e=>e.map(x=>x.innerText).filter(t=>/Why this score/.test(t))))[0]?.replace(/\n+/g,' | ').slice(0,300));
 console.log('OTHER WAYS:',await p.$$eval('#sheetBody .mkrow',r=>r.map(x=>x.querySelector('.mkname').innerText.replace(/\n/g,' ')+' :: '+x.querySelector('small').innerText.slice(0,70))));
 console.log('evidence box for basketball (should be none):',await p.$$eval('#sheetBody .plain',e=>e.filter(x=>/How bets like this/.test(x.innerText)).length));
 await p.click('#sheetClose'); await p.screenshot({path:'sports.png',fullPage:false});
 console.log('errs',errs,'overflow',await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth)); await b.close();
})();
