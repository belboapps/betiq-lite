const { chromium } = require('playwright');
const books=['Bet365','Sky Bet','Paddy Power','William Hill','Ladbrokes','Betfair Sportsbook'];
function ev(id,h,a,hrs,base,boost,bump){return {id,sport_key:'soccer_epl',home_team:h,away_team:a,commence_time:new Date(Date.now()+hrs*3600e3).toISOString(),
 bookmakers:books.map((b,i)=>({key:b.toLowerCase().replace(/ /g,'_'),title:b,markets:[{key:'h2h',outcomes:[{name:h,price:+(base[0]*(i===2?boost:1)*(bump||1)).toFixed(2)},{name:a,price:base[2]},{name:'Draw',price:base[1]}]}]}))};}
(async()=>{
 const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:390,height:844},acceptDownloads:true}); const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(String(e))); p.on('dialog',d=>d.accept());
 let round=0;
 await p.route('**/*',r=>{const u=r.request().url(); if(u.startsWith('file:'))return r.continue(); if(u.includes('fonts.g'))return r.abort();
  const h={'access-control-allow-origin':'*','access-control-expose-headers':'*','x-requests-remaining':'400','x-requests-last':'1','content-type':'application/json'};
  if(/\/odds\/\?/.test(u)){ round++; const bump=round>1?0.96:1; return r.fulfill({headers:h,body:JSON.stringify([ev('e1','Arsenal','Everton',20,[1.9,3.6,4.2],1.12,bump),ev('e2','Chelsea','Brighton',30,[2.6,3.4,2.9],1.05,1),ev('e3','Spurs','Fulham',40,[1.7,3.9,5.0],1.09,1)])}); }
  return r.fulfill({headers:h,body:'[]'});});
 const now=Date.now();
 await p.addInitScript((bets)=>{ if(!sessionStorage.getItem('s')){sessionStorage.setItem('s','1'); localStorage.setItem('betiqlite.v1',JSON.stringify({key:'dummy',auto:false,ver:2,booksSet:true,pracAsked:true,tour:true,simple:false,bets,sports:[{key:'soccer_epl',title:'EPL',group:'Soccer'}],selected:['soccer_epl'],picked:true,series:{e1:{Arsenal:[[Date.now()-3*3600e3,2.30,0.50]]}}}))}},
  [{pid:'x1',evId:'o1',key:'soccer_epl',league:'EPL',h:'A',a:'B, Ltd',sel:'A',odds:2.1,book:'Bet365',stake:2,fair:.5,time:now-9e6,at:now-1e7,status:'won',profit:2.2,mkt:'',m:now},{pid:'x2',evId:'o2',key:'soccer_epl',league:'EPL',h:'C',a:'D',sel:'Over 2.5 goals',odds:1.9,book:'Paddy Power',stake:3,fair:.5,time:now-9e6,at:now-1e7,status:'lost',profit:-3,mkt:'totals',point:2.5,side:'Over',m:now}]);
 await p.goto('file://'+require('path').resolve(__dirname,'..','index.html')); await p.waitForTimeout(500);
 await p.click('#refreshBtn'); await p.waitForTimeout(1200);
 // ---- chart: first load shows the placeholder, second refresh draws it
 await p.click('[data-tab=all]'); await p.waitForTimeout(150);
 const rows0=await p.$$eval('#list .brow',r=>r.length);
 await p.click('#list .brow >> nth=0 >> .bmain'); await p.waitForTimeout(200); console.log('chart on first sighting (Arsenal seeded with an old price so it draws):',(await p.$$eval('#sheetBody .plain',e=>e.map(x=>x.innerText).filter(t=>/Price over time/.test(t))))[0]?.replace(/\n/g,' | ').slice(0,120)); await p.click('#sheetClose');
 await p.click('#list .brow >> nth=0 >> .bmain'); await p.waitForTimeout(200);
 console.log('chart svg drawn:',await p.$$eval('#sheetBody svg.chart',e=>e.length),'|',(await p.$$eval('#sheetBody .plain',e=>e.map(x=>x.innerText).filter(t=>/Price over time/.test(t))))[0]?.replace(/\n/g,' | ').slice(0,300)); await p.click('#sheetClose');
 // ---- saved filters
 await p.click('#filterBox summary'); await p.selectOption('#fMinScore','70'); await p.waitForTimeout(200); const rows70=await p.$$eval('#list .brow',r=>r.length);
 await p.selectOption('#fMinScore','0'); await p.selectOption('#fMaxOdds','2'); await p.waitForTimeout(200); const rows2=await p.$$eval('#list .brow',r=>r.length);
 console.log('rows: no filter',rows0,'| score>=70:',rows70,'| max odds 2:',rows2,'| summary:',await p.innerText('#filterSum'));
 const sug=await p.evaluate(()=>JSON.parse(localStorage.getItem('betiqlite.v1')).sugg.length); console.log('track record unaffected by filters (logged):',sug);
 await p.reload(); await p.waitForTimeout(500); console.log('filter survives reload:',await p.evaluate(()=>JSON.parse(localStorage.getItem('betiqlite.v1')).fMaxOdds));
 await p.click('[data-tab=all]'); await p.click('#filterBox summary'); await p.selectOption('#fMaxOdds','0');
 // ---- export
 await p.click('[data-tab=bets]'); await p.waitForTimeout(150);
 const [dl]=await Promise.all([p.waitForEvent('download'),p.click('#exportBtn')]); const path=await dl.path(); const csv=require('fs').readFileSync(path,'utf8');
 console.log('CSV file:',dl.suggestedFilename(),'| lines:',csv.trim().split(/\r?\n/).length); console.log(csv.split(/\r?\n/).slice(0,3).join('\n'));
 // ---- accounts
 await p.click('[data-tab=more]'); await p.waitForTimeout(250);
 console.log('accounts listed:',await p.$$eval('#acctList .acct b',e=>e.map(x=>x.innerText)));
 console.log('Paddy Power stats line:',await p.$eval('#acctList .acct:has(b:text-is("Paddy Power")) .subnote',e=>e.innerText));
 await p.fill('#acctList .acct:has(b:text-is("Paddy Power")) input[type=number]','25'); await p.dispatchEvent('#acctList .acct:has(b:text-is("Paddy Power")) input[type=number]','change');
 await p.selectOption('#acctList .acct:has(b:text-is("Paddy Power")) select','limited'); await p.waitForTimeout(250);
 await p.click('[data-tab=today]'); await p.waitForTimeout(200);
 console.log('best price books after limiting Paddy Power:',await p.$$eval('#plan .brow .cgrid',g=>g.map(x=>x.innerText.replace(/\n/g,' ')).slice(0,3)));
 await p.click('[data-tab=more]'); await p.fill('#acctNew','Midnite'); await p.click('#acctAdd'); await p.waitForTimeout(150);
 console.log('manual add:',await p.$$eval('#acctList .acct b',e=>e.map(x=>x.innerText).includes('Midnite')),'| total line:',await p.$eval('#acctList + .row, #acctList .subnote:last-child',e=>e.innerText).catch(()=>''));
 console.log('stored:',JSON.stringify(await p.evaluate(()=>JSON.parse(localStorage.getItem('betiqlite.v1')).accts['Paddy Power'])));
 console.log('errs',errs,'overflow',await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth)); await b.close();
})();
