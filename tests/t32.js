// Offers tab: matched-betting sums, close-match finder, offer tracker.
const { chromium } = require('playwright');
const books=[['bet365','Bet365'],['skybet','Sky Bet'],['paddypower','Paddy Power'],['williamhill','William Hill'],['betfair_ex_uk','Betfair Exchange']];
// layHome: when given, the exchange also sends a real lay price for the home team (market key h2h_lay), as The Odds API does
function ev(id,h,a,hrs,base,layHome){return {id,sport_key:'soccer_epl',home_team:h,away_team:a,commence_time:new Date(Date.now()+hrs*3600e3).toISOString(),
 bookmakers:books.map(([k,t],i)=>({key:k,title:t,markets:(k==='betfair_ex_uk'&&layHome?[{key:'h2h_lay',outcomes:[{name:h,price:layHome},{name:'Bogus',price:0}]}]:[]).concat([{key:'h2h',outcomes:[{name:h,price:+(base[0]*(k==='betfair_ex_uk'?1.03:i===0?1.0:0.97)).toFixed(2)},{name:a,price:+(base[2]*(k==='betfair_ex_uk'?1.06:1)).toFixed(2)},{name:'Draw',price:+(base[1]*(k==='betfair_ex_uk'?1.05:1)).toFixed(2)}]}])}))};}
let fails=0; function check(name,ok,info){ if(!ok) fails++; console.log((ok?'PASS ':'FAIL ')+name+(info!==undefined?' | '+info:'')); }
(async()=>{
 const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:390,height:844}}); const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(String(e))); p.on('dialog',d=>d.accept());
 await p.route('**/*',r=>{const u=r.request().url(); if(u.startsWith('file:'))return r.continue(); if(u.includes('fonts.g'))return r.abort();
  const h={'access-control-allow-origin':'*','access-control-expose-headers':'*','x-requests-remaining':'400','x-requests-last':'1','content-type':'application/json'};
  if(/\/odds\/\?/.test(u)) return r.fulfill({headers:h,body:JSON.stringify([ev('e1','Arsenal','Everton',20,[2.1,3.6,3.9],2.20),ev('e2','Chelsea','Brighton',30,[5.0,4.2,1.7])])});
  return r.fulfill({headers:h,body:'[]'});});
 await p.addInitScript(()=>{ if(!localStorage.getItem('betiqlite.v1')) localStorage.setItem('betiqlite.v1',JSON.stringify({key:'dummy',auto:false,ver:2,booksSet:true,pracAsked:true,tour:true,simple:false,sports:[{key:'soccer_epl',group:'Soccer',title:'EPL'}],selected:['soccer_epl'],windowH:72,bankroll:100})); });
 await p.goto('file://'+require('path').resolve(__dirname,'..','index.html')); await p.waitForTimeout(500);
 check('five tabs',await p.$$eval('#tabbar button',e=>e.length)===5);
 await p.click('[data-tab=offers]'); await p.waitForSelector('#mbCalcOut');
 check('empty state',/No offers yet/.test(await p.innerText('#mbList'))&&/Load some prices first/.test(await p.innerText('#mbMatches')));
 // ---- the sums, against figures worked out by hand
 const stat=async(label)=>p.evaluate((l)=>{const s=[...document.querySelectorAll('#mbCalcOut .stat')].find(x=>x.querySelector('span').innerText.toLowerCase()===l.toLowerCase()); return s?s.querySelector('b').innerText:null;},label);
 await p.fill('#mbStake','10'); await p.fill('#mbBack','2.10'); await p.fill('#mbLay','2.14'); await p.waitForTimeout(100);
 // lay = 2.10*10/(2.14-0.05) = 10.05; wins: 11 - 10.05*1.14 = -0.46; loses: 10.05*0.95 - 10 = -0.45
 check('qualifying: lay stake',await stat('On the exchange')==='£10.05',await stat('On the exchange'));
 check('qualifying: liability',await stat('Exchange needs')==='£11.46',await stat('Exchange needs'));
 check('qualifying: both results',await stat('If it wins')==='−£0.46'&&await stat('If it does not')==='−£0.45',await stat('If it wins')+' / '+await stat('If it does not'));
 check('qualifying: plain words',/lose about £0\.46/.test(await p.innerText('#mbCalcOut .plain')));
 await p.selectOption('#mbType','free'); await p.selectOption('#mbEx','0.02'); await p.fill('#mbStake','30'); await p.fill('#mbBack','5'); await p.fill('#mbLay','5.2'); await p.waitForTimeout(100);
 // lay = 4*30/(5.2-0.02) = 23.17; wins: 120 - 23.17*4.2 = 22.69; loses: 23.17*0.98 = 22.71
 check('free bet: lay stake',await stat('On the exchange')==='£23.17',await stat('On the exchange'));
 check('free bet: both results',await stat('If it wins')==='+£22.69'&&await stat('If it does not')==='+£22.71',await stat('If it wins')+' / '+await stat('If it does not'));
 check('free bet: plain words',/keep about £22\.69, which is 76% of the free bet/.test(await p.innerText('#mbCalcOut .plain')));
 await p.fill('#mbLay','7'); await p.waitForTimeout(100); check('far-apart warning',/far apart/.test(await p.innerText('#mbCalcOut')));
 await p.fill('#mbLay',''); await p.waitForTimeout(100); check('blank input handled',/Enter the stake and both prices/.test(await p.innerText('#mbCalcOut')));
 // ---- close-match finder, from loaded prices
 await p.click('[data-tab=today]'); await p.click('#refreshBtn'); await p.waitForTimeout(1200);
 await p.waitForFunction(()=>{ const s=JSON.parse(localStorage.getItem('betiqlite.v1')||'{}'); return !!(s.cache&&s.cache.soccer_epl&&s.cache.soccer_epl.events.length); },null,{timeout:15000});
 await p.click('[data-tab=offers]'); await p.waitForSelector('#mbMatches .mbmatch');
 const opts=await p.$$eval('#mbBook option',e=>e.map(x=>x.value)); check('exchange is not offered as a bookmaker',opts.includes('Bet365')&&!opts.some(o=>/Exchange/.test(o)),opts.join(','));
 await p.selectOption('#mbType','qual'); await p.fill('#mbStake','10'); await p.selectOption('#mbBook','Bet365'); await p.fill('#mbMin','2'); await p.waitForTimeout(150);
 const rows=await p.$$eval('#mbMatches .mbmatch',r=>r.map(x=>x.innerText.replace(/\n/g,' '))); console.log('   matches:',rows.slice(0,2).join(' || ').slice(0,300));
 const loss=r=>parseFloat((r.match(/lose about £([\d.]+)/)||[])[1]);
 const est=rows.filter(r=>/estimate/.test(r));
 check('real prices first, then estimates by smallest loss, all at 2.0+',rows.length>=2&&/^Arsenal/.test(rows[0])&&!/estimate/.test(rows[0])&&rows.slice(1).every(r=>/estimate/.test(r))&&rows.every(r=>parseFloat(r.match(/Bet365 ([\d.]+)/)[1])>=2)&&est.every((r,i)=>i===0||loss(est[i-1])<=loss(r)),rows.map(r=>(/estimate/.test(r)?'est ':'real ')+loss(r)).join(', '));
 // Arsenal has a real lay price of 2.20 (not the back price 2.16): lay = 21/(2.20-0.05) = 9.77; wins 11 - 9.77*1.20 = -0.72
 const ars=rows.find(r=>/^Arsenal/.test(r)), che=rows.find(r=>/^Chelsea/.test(r));
 check('real lay price used when the service sends one',/Betfair Exchange lay 2\.20: lose about £0\.72/.test(ars)&&!/estimate/.test(ars),ars&&ars.slice(-70));
 check('estimate, and labelled as one, when it does not',/Betfair Exchange about 5\.15 \(estimate\)/.test(che),che&&che.slice(-70));
 check('note explains the estimated rows',/Rows marked \(estimate\)/.test(await p.innerText('#mbMatches')));
 check('lay price is never offered as a price to back at',await p.evaluate(()=>{const s=JSON.parse(localStorage.getItem('betiqlite.v1')); const b=s.cache.soccer_epl.events[0].books.find(x=>x.k==='betfair_ex_uk'); return Array.isArray(b.l)&&b.l.length===1&&b.o.every(o=>o[1]!==2.2);}));
 await p.click('#mbMatches .mbmatch:has-text("Arsenal v Everton") >> nth=0 >> button'); await p.waitForTimeout(100);
 check('Use fills the calculator with the real lay price',await p.inputValue('#mbBack')==='2.10'&&await p.inputValue('#mbLay')==='2.20'&&await p.inputValue('#mbEx')==='0.05',await p.inputValue('#mbBack')+' / '+await p.inputValue('#mbLay'));
 // ---- offer tracker
 await p.click('#mbAdd'); check('needs a name',/Enter the bookmaker/.test(await p.innerText('#mbAddMsg')));
 await p.fill('#mbNewBook','Test Bookie'); await p.fill('#mbNewName','Bet £10 get £30'); await p.fill('#mbNewQual','10'); await p.fill('#mbNewMin','2'); await p.fill('#mbNewFree','30');
 await p.fill('#mbNewExp',new Date(Date.now()+2*864e5).toISOString().slice(0,10)); await p.click('#mbAdd'); await p.waitForTimeout(150);
 let card=await p.innerText('#mbList .mboffer'); check('offer added with next step',/Test Bookie: Bet £10 get £30/.test(card)&&/place the qualifying bet of £10\.00 at odds of 2\.00 or more/.test(card));
 check('expiry warning',/DAYS? LEFT|ENDS TODAY/.test(card)&&/runs out within 3 days: Test Bookie/.test(await p.innerText('#mbWarn')),(card.match(/\d DAYS? LEFT|ENDS TODAY/)||[''])[0]);
 await p.fill('#mbList .mboffer input >> nth=0','-0.46'); await p.dispatchEvent('#mbList .mboffer input >> nth=0','change'); await p.waitForTimeout(100);
 await p.selectOption('#mbList .mboffer select','wait'); await p.waitForTimeout(100);
 await p.click('#mbList .mboffer .btn >> nth=0'); await p.waitForTimeout(100);
 check('free-bet step prefills the calculator',await p.inputValue('#mbType')==='free'&&await p.inputValue('#mbStake')==='30');
 await p.fill('#mbList .mboffer input >> nth=1','22.69'); await p.dispatchEvent('#mbList .mboffer input >> nth=1','change'); await p.waitForTimeout(100);
 await p.selectOption('#mbList .mboffer select','done'); await p.waitForTimeout(150);
 const sum=(await p.innerText('#mbSum')).replace(/\n/g,' '); check('totals',/\+£22\.23/.test(sum)&&/1 offer finished/.test(sum),sum);
 const stored=await p.evaluate(()=>JSON.parse(localStorage.getItem('betiqlite.v1')).mb.offers[0]); check('saved',stored.step==='done'&&stored.q===-0.46&&stored.f===22.69,JSON.stringify(stored).slice(0,140));
 await p.click('#mbList .mboffer .btn >> nth=1'); await p.waitForTimeout(150); check('delete',/No offers yet/.test(await p.innerText('#mbList')));
 console.log('errs',errs,'overflow',await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),'fails',fails); await b.close(); process.exit(fails||errs.length?1:0);
})();
