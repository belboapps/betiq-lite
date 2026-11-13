const { chromium } = require('playwright');
(async()=>{
 const b=await chromium.launch(); const p=await (await b.newContext({viewport:{width:390,height:844}})).newPage(); const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
 await p.route('**/*',r=>{const u=r.request().url(); if(u.startsWith('file:'))return r.continue(); if(u.includes('fonts.g'))return r.abort();
  const h={'access-control-allow-origin':'*','access-control-expose-headers':'*','x-requests-remaining':'300','content-type':'application/json'};
  if(u.includes('/scores/'))return r.fulfill({headers:h,body:JSON.stringify([{id:'m1',completed:true,scores:[{name:'Arsenal',score:'2'},{name:'Everton',score:'1'}]}])});
  return r.fulfill({headers:h,body:'[]'});});
 const past=Date.now()-4*3600e3, H='Arsenal', A='Everton';
 const mk=(n,sel,mkt,rule)=>({pid:'m1|'+n,evId:'m1',key:'soccer_epl',league:'EPL',h:H,a:A,sel,odds:2,book:'X',stake:2,fair:.5,time:past,at:past,status:'open',profit:0,mkt,rule});
 const cases=[['btts yes','BTTS Yes','btts',{t:'btts',side:'Yes'},'won'],['btts no','BTTS No','btts',{t:'btts',side:'No'},'lost'],
  ['dc HD','Arsenal or draw','dc',{t:'dc',set:[H,'Draw']},'won'],['dc DA','Draw or Everton','dc',{t:'dc',set:['Draw',A]},'lost'],['dc HA','Arsenal or Everton','dc',{t:'dc',set:[H,A]},'won'],
  ['dnb H','Arsenal dnb','dnb',{t:'dnb',team:H},'won'],['dnb A','Everton dnb','dnb',{t:'dnb',team:A},'lost'],
  ['sp H-1.5','Arsenal -1.5','spread',{t:'spread',team:H,point:-1.5},'lost'],['sp H-0.5','Arsenal -0.5','spread',{t:'spread',team:H,point:-0.5},'won'],
  ['sp A+1.5','Everton +1.5','spread',{t:'spread',team:A,point:1.5},'won'],['sp H-1','Arsenal -1','spread',{t:'spread',team:H,point:-1},'void'],['sp A+1','Everton +1','spread',{t:'spread',team:A,point:1},'void']];
 await p.addInitScript((bets)=>{ if(!sessionStorage.getItem('s')){sessionStorage.setItem('s','1'); localStorage.setItem('betiqlite.v1',JSON.stringify({key:'dummy',auto:false,ver:2,booksSet:true,pracAsked:true,bets,sports:[{key:'soccer_epl',title:'EPL',group:'Soccer'}],selected:['soccer_epl'],picked:true}))}},cases.map(c=>mk(c[0],c[1],c[2],c[3])));
 await p.goto('file://'+require('path').resolve(__dirname,'..','index.html')+''); await p.waitForTimeout(400);
 await p.click('[data-tab=bets]'); await p.click('#betsBody .btn.primary'); await p.waitForTimeout(800);
 const got=await p.evaluate(()=>JSON.parse(localStorage.getItem('betiqlite.v1')).bets.map(b=>[b.pid.split('|')[1],b.status]));
 let bad=0; cases.forEach((c,i)=>{ const ok=got[i][1]===c[4]; if(!ok) bad++; console.log((ok?'ok  ':'FAIL')+' '+c[0].padEnd(10)+' expected '+c[4].padEnd(5)+' got '+got[i][1]); });
 console.log(bad?'MISMATCHES: '+bad:'ALL SETTLE RULES CORRECT','errs',errs); await b.close();})();
