const { chromium } = require('playwright');
const books=['Bet365','Sky Bet','Paddy Power','William Hill','Ladbrokes','Betfair Sportsbook'];
function ev(id,h,a,mins,base,boost,bk){return {id,sport_key:'soccer_epl',home_team:h,away_team:a,commence_time:new Date(Date.now()+mins*60e3).toISOString(),
 bookmakers:(bk||books).map((b,i)=>({key:b.toLowerCase().replace(/ /g,'_'),title:b,markets:[{key:'h2h',outcomes:[{name:h,price:+(base[0]*(i===2?boost:1)).toFixed(2)},{name:a,price:base[2]},{name:'Draw',price:base[1]}]}]}))};}
(async()=>{
 const mode=process.argv[2]||'sharp';
 const b=await chromium.launch(); const p=await (await b.newContext({viewport:{width:390,height:844}})).newPage(); const errs=[]; p.on('pageerror',e=>errs.push(String(e))); p.on('dialog',d=>d.accept());
 const calls=[]; let remaining=400;
 await p.route('**/*',r=>{const u=r.request().url(); if(u.startsWith('file:'))return r.continue(); if(u.includes('fonts.g'))return r.abort();
  const url=new URL(u); const h={'access-control-allow-origin':'*','access-control-expose-headers':'*','x-requests-remaining':String(remaining),'x-requests-last':'1','content-type':'application/json'};
  if(url.pathname.endsWith('/odds/')){ const bm=url.searchParams.get('bookmakers'); calls.push((bm?'PIN':'UK')+' '+url.searchParams.get('markets')); remaining-=1;
    if(bm==='pinnacle'){ if(mode==='refuse') return r.fulfill({status:422,headers:h,body:'{}'}); 
      // Pinnacle says Arsenal is only 42% (odds 2.30 fair-ish), vs UK average ~50%
      return r.fulfill({headers:h,body:JSON.stringify([{...ev('e1','Arsenal','Everton',50,[2.25,3.4,3.3],1.0,['Pinnacle']),bookmakers:[{key:'pinnacle',title:'Pinnacle',markets:[{key:'h2h',outcomes:[{name:'Arsenal',price:2.30},{name:'Everton',price:3.25},{name:'Draw',price:3.45}]}]}]}])}); }
    return r.fulfill({headers:h,body:JSON.stringify([ev('e1','Arsenal','Everton',50,[1.9,3.6,4.2],1.12)])}); }
  if(url.pathname.includes('/scores/')) return r.fulfill({headers:h,body:'[]'});
  return r.fulfill({headers:h,body:'[]'});});
 const seed={key:'dummy',auto:true,autoHours:4,autoKick:true,ver:2,booksSet:true,pracAsked:true,tour:true,sharp:mode!=='off',sports:[{key:'soccer_epl',title:'EPL',group:'Soccer'}],selected:['soccer_epl'],picked:true};
 if(mode==='kick'){ seed.sharp=false; seed.cache={soccer_epl:{at:Date.now()-30*60e3,events:[{id:'e1',c:new Date(Date.now()+50*60e3).toISOString(),h:'Arsenal',a:'Everton',books:[],tb:[]}]}}; }
 await p.addInitScript((s)=>{ if(!sessionStorage.getItem('seeded')){sessionStorage.setItem('seeded','1'); localStorage.setItem('betiqlite.v1',JSON.stringify(s));}},seed);
 await p.goto('file://'+require('path').resolve(__dirname,'..','index.html')+''); await p.waitForTimeout(900);
 if(mode==='kick'){ console.log('KICK auto-refresh calls:',calls,'| alert:',await p.innerText('#alerts').catch(()=>'')); console.log('button:',await p.innerText('#refreshBtn')); console.log('errs',errs); await b.close(); return; }
 await p.click('#refreshBtn'); await p.waitForTimeout(1200);
 console.log(mode,'calls:',calls,'| button:',await p.innerText('#refreshBtn'));
 const card=await p.$eval('#plan .brow',x=>x.querySelector('.cmatch').innerText+' | '+[...x.querySelectorAll('.cgrid b')].map(b=>b.innerText).join(' / ')+' | '+x.querySelector('.cpills').innerText.replace(/\n/g,' ')+' | '+x.querySelector('.verdict b').innerText).catch(()=>'no card');
 console.log('card:',card);
 await p.click('#plan .brow >> nth=0 >> .bmain').catch(()=>{}); await p.waitForTimeout(200);
 console.log('fair-from stat:',await p.$$eval('#sheetBody .stat',e=>e.map(x=>x.innerText.replace(/\n/g,' ')).filter(t=>/Fair price from/.test(t))));
 await p.click('#sheetClose').catch(()=>{}); await p.click('[data-tab=more]'); await p.waitForTimeout(150); console.log('sharp msg:',await p.innerText('#sharpMsg'));
 console.log('errs',errs); await b.close();
})();
