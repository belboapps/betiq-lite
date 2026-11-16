// Exchange yardstick, free weekly file import (synthetic file, or a real one passed as argv[2]), credit saver, settlement by names.
const { chromium } = require('playwright'); const fs=require('fs'), path=require('path');
const realFile=process.argv[2];
const page='file://'+path.resolve(__dirname,'..','index.html');
function synth(){ const d=new Date(Date.now()+2*864e5); const dd=String(d.getUTCDate()).padStart(2,'0')+'/'+String(d.getUTCMonth()+1).padStart(2,'0')+'/'+d.getUTCFullYear();
 const H='Div,Date,Time,HomeTeam,AwayTeam,Referee,B365H,B365D,B365A,BFDH,BFDD,BFDA,BVH,BVD,BVA,BWH,BWD,BWA,PPH,PPD,PPA,SKBH,SKBD,SKBA,BFEH,BFED,BFEA';
 const row=(div,h,a,b,ppBoost,ex)=>[div,dd,'15:00',h,a,'',b[0],b[1],b[2],b[0],b[1],b[2],b[0],b[1],b[2],b[0],b[1],b[2],(b[0]*ppBoost).toFixed(2),b[1],b[2],b[0],b[1],b[2],ex[0],ex[1],ex[2]].join(',');
 return [H,row('E0','Arsenal','Everton',[1.9,3.5,4.0],1.12,[2.02,3.75,4.4]),row('E0','"Brighton, Hove"','Fulham',[2.2,3.3,3.2],1.0,[2.34,3.5,3.4]),row('EC','Halifax','Woking',[2.0,3.3,3.4],1.15,[1.6,2.5,2.9])].join('\r\n'); }
(async()=>{
 const b=await chromium.launch(); const errs=[]; let apiCalls=0;
 async function open(seed,clock){ const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2}); const p=await ctx.newPage(); p.on('pageerror',e=>errs.push(String(e))); p.on('dialog',d=>d.accept());
  await p.route('**/*',r=>{const u=r.request().url(); if(u.startsWith('file:'))return r.continue(); if(u.includes('fonts.g'))return r.abort();
   const h={'access-control-allow-origin':'*','access-control-expose-headers':'*','x-requests-remaining':'400','x-requests-last':'1','content-type':'application/json'};
   if(u.includes('the-odds-api')) apiCalls++;
   if(u.includes('/scores/')) return r.fulfill({headers:h,body:JSON.stringify([{id:'api9',home_team:'Arsenal',away_team:'Everton FC',commence_time:new Date(Date.now()-4*3600e3).toISOString(),completed:true,scores:[{name:'Arsenal',score:'2'},{name:'Everton FC',score:'0'}]}])});
   if(/\/odds\/\?/.test(u)) return r.fulfill({headers:h,body:JSON.stringify(seed.__odds||[])});
   return r.fulfill({headers:h,body:'[]'});});
  await p.addInitScript(([s,clock])=>{ if(clock){ const off=clock-Date.now(), D=Date; class F extends D{ constructor(...a){ if(a.length) super(...a); else super(D.now()+off);} static now(){return D.now()+off;} } window.Date=F; }
   if(!sessionStorage.getItem('s')){sessionStorage.setItem('s','1'); if(s) localStorage.setItem('betiqlite.v1',JSON.stringify(s));}},[seed.__none?null:seed,clock||0]);
  await p.goto(page); await p.waitForTimeout(500); return p; }
 // ---- 1. exchange yardstick
 const books=(ex)=>['Bet365','Sky Bet','Paddy Power','William Hill'].map((t,i)=>({key:t.toLowerCase().replace(/ /g,'_'),title:t,markets:[{key:'h2h',outcomes:[{name:'Arsenal',price:i===2?2.13:1.9},{name:'Everton',price:4.2},{name:'Draw',price:3.6}]}]})).concat([{key:'betfair_ex_uk',title:'Betfair',markets:[{key:'h2h',outcomes:ex}]}]);
 const mk=(ex)=>[{id:'e1',sport_key:'soccer_epl',home_team:'Arsenal',away_team:'Everton',commence_time:new Date(Date.now()+20*3600e3).toISOString(),bookmakers:books(ex)}];
 const base={key:'dummy',auto:false,ver:2,booksSet:true,pracAsked:true,tour:true,simple:false,sports:[{key:'soccer_epl',title:'EPL',group:'Soccer'}],selected:['soccer_epl'],picked:true};
 for (const [name,ex] of [['busy exchange',[{name:'Arsenal',price:2.3},{name:'Everton',price:3.9},{name:'Draw',price:3.4}]],['thin exchange',[{name:'Arsenal',price:1.5},{name:'Everton',price:2.5},{name:'Draw',price:2.6}]]]){
  const p=await open({...base,__odds:mk(ex)}); await p.click('#refreshBtn'); await p.waitForTimeout(1000); await p.click('[data-tab=all]'); await p.click('#modeLikely'); await p.waitForTimeout(200);
  await p.click('#list .brow >> nth=0 >> .bmain'); await p.waitForTimeout(200);
  console.log(name+':',(await p.$$eval('#sheetBody .stat',e=>e.map(x=>x.innerText.replace(/\n/g,' ')).filter(t=>/Fair price from/.test(t))))[0],'| fair:',await p.$eval('#list .brow .cgrid',e=>e.innerText.replace(/\n/g,' ').match(/FAIR PRICE.*/)[0])); await p.context().close(); }
 // ---- 2. free file, no key
 apiCalls=0; const csv=realFile?fs.readFileSync(realFile):Buffer.from(synth()); const clock=realFile?Date.parse('2026-11-13T15:00:00Z'):0;
 let p=await open({__none:true},clock);
 console.log('setup offers free start:',await p.$eval('#freeStart',e=>e.innerText)); await p.click('#freeStart'); await p.waitForTimeout(200);
 await p.setInputFiles('#freeFile',{name:'junk.csv',mimeType:'text/csv',buffer:Buffer.from('a,b\n1,2\n')}); await p.waitForTimeout(300); console.log('bad file:',await p.innerText('#freeMsg'));
 await p.setInputFiles('#freeFile',{name:'fixtures.csv',mimeType:'text/csv',buffer:csv}); await p.waitForTimeout(700);
 console.log('alert:',await p.innerText('#alerts')); console.log('refresh button:',await p.innerText('#refreshBtn'),'| API calls made:',apiCalls);
 console.log('today heading + cards:',await p.$eval('#plan h2',e=>e.innerText),await p.$$eval('#plan .brow',r=>r.map(x=>x.querySelector('.clg').innerText+' | '+x.querySelector('.cmatch').innerText+' | '+x.querySelector('.verdict').innerText.replace(/\n/g,' :: ')+' | '+x.querySelector('.cwhen').innerText).slice(0,4)));
 await p.click('[data-tab=all]'); await p.click('#modeLikely'); await p.waitForTimeout(200); console.log('all bets (most likely) rows:',await p.$$eval('#list .brow',r=>r.length),'| leagues:',await p.$$eval('#leagueChips .chip',e=>e.map(x=>x.innerText)).then(a=>a.slice(0,8)));
 if(await p.$('#list .brow')){ await p.click('#list .brow >> nth=0 >> .bmain'); await p.waitForTimeout(200); console.log('first bet detail:',(await p.innerText('#sheetBody')).replace(/\n+/g,' | ').slice(0,230)); await p.screenshot({path:path.join(process.env.SHOT_DIR||'.', 'free_sheet.png')}); await p.click('#sheetClose'); }
 await p.click('[data-tab=more]'); await p.waitForTimeout(200); console.log('free panel:',await p.innerText('#freeMsg'));
 await p.context().close();
 if(!realFile){
  // ---- 3. settle a free-file bet by team names, with a key
  const now=Date.now(); p=await open({...base,cache:{},sports:[{key:'soccer_epl',title:'EPL',group:'Soccer'},{key:'fd_E0',title:'Premier League · free file',group:'Soccer'}],selected:['soccer_epl','fd_E0'],
    bets:[{pid:'fd|E0|x|Arsenal|Everton|Arsenal',evId:'fd|E0|x|Arsenal|Everton',key:'fd_E0',league:'Premier League',h:'Arsenal',a:'Everton',sel:'Arsenal',odds:2.1,book:'Paddy Power',stake:2,fair:.5,time:now-4*3600e3,at:now-9e6,status:'open',profit:0,mkt:''},
          {pid:'fd|E0|x|Arsenal|Everton|Everton',evId:'fd|E0|x|Arsenal|Everton',key:'fd_E0',league:'Premier League',h:'Arsenal',a:'Everton',sel:'Everton',odds:4,book:'Bet365',stake:1,fair:.2,time:now-4*3600e3,at:now-9e6,status:'open',profit:0,mkt:''}]});
  await p.click('[data-tab=bets]'); await p.click('#betsBody .btn.primary'); await p.waitForTimeout(800);
  console.log('settled by names:',await p.evaluate(()=>JSON.parse(localStorage.getItem('betiqlite.v1')).bets.map(b=>b.sel+':'+b.status)));
  await p.click('[data-tab=more]'); await p.click('#creditSaver'); await p.waitForTimeout(200); console.log('credit saver:',await p.innerText('#alerts')); console.log('cost note:',(await p.innerText('#costNote')).slice(0,120));
  await p.context().close(); }
 console.log('errs',errs); await b.close();
})();
