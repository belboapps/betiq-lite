// Risk / Reward / Value displays, the plain-words line, sortable bets, the match page and the scorecard.
const { chromium } = require('playwright');
const books=['Bet365','Sky Bet','Paddy Power','William Hill','Ladbrokes','Betfair Sportsbook'];
function ev(id,h,a,hrs,base,boost){return {id,sport_key:'soccer_epl',home_team:h,away_team:a,commence_time:new Date(Date.now()+hrs*3600e3).toISOString(),
 bookmakers:books.map((b,i)=>({key:b.toLowerCase().replace(/ /g,'_'),title:b,markets:[{key:'h2h',outcomes:[{name:h,price:+(base[0]*(i===2?boost:1)).toFixed(2)},{name:a,price:base[2]},{name:'Draw',price:base[1]}]}]}))};}
let fails=0; function check(name,ok,info){ if(!ok) fails++; console.log((ok?'PASS ':'FAIL ')+name+(info!==undefined?' | '+info:'')); }
(async()=>{
 const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:390,height:844}}); const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(String(e))); p.on('dialog',d=>d.accept());
 await p.route('**/*',r=>{const u=r.request().url(); if(u.startsWith('file:'))return r.continue(); if(u.includes('fonts.g'))return r.abort();
  const h={'access-control-allow-origin':'*','access-control-expose-headers':'*','x-requests-remaining':'400','x-requests-last':'1','content-type':'application/json'};
  if(/\/odds\/\?/.test(u)) return r.fulfill({headers:h,body:JSON.stringify([ev('e1','Arsenal','Everton',20,[1.7,3.9,5.5],1.08),ev('e2','Leeds','Wolves',40,[4.2,3.6,1.95],1.0)])});
  return r.fulfill({headers:h,body:'[]'});});
 const now=Date.now(), day=864e5;
 const bet=(i,status,odds,daysAgo)=>({pid:'b'+i,evId:'o'+i,key:'soccer_epl',league:'EPL',h:'A'+i,a:'B'+i,sel:'A'+i,odds,book:'Bet365',stake:2,fair:1/odds,time:now-daysAgo*day,at:now-daysAgo*day-3600e3,status,profit:status==='won'?2*(odds-1):-2,settledAt:now-daysAgo*day+7200e3,mkt:'',m:now});
 const sug=(i,status)=>({sugg:true,pid:'s'+i,evId:'so'+i,key:'soccer_epl',league:'EPL',h:'C'+i,a:'D'+i,sel:'C'+i,odds:2,book:'Bet365',fair:.52,ev:.04,score:65,v:'place',stake:1,time:now-9*day,at:now-10*day,mkt:'',status,profit:status==='won'?1:-1});
 // oldest first: L W W W L W  -> longest run 3, current run 1 win, 4 of 6 won
 const bets=[bet(1,'lost',2.0,20),bet(2,'won',2.0,19),bet(3,'won',2.5,18),bet(4,'won',1.8,17),bet(5,'lost',2.2,5),bet(6,'won',3.0,4)];
 await p.addInitScript((seed)=>{ if(!localStorage.getItem('betiqlite.v1')) localStorage.setItem('betiqlite.v1',JSON.stringify(Object.assign({key:'dummy',auto:false,ver:2,booksSet:true,pracAsked:true,tour:true,simple:false,sports:[{key:'soccer_epl',group:'Soccer',title:'EPL'}],selected:['soccer_epl'],windowH:72,bankroll:100},seed))); },{bets,sugg:[sug(1,'won'),sug(2,'lost'),sug(3,'won')]});
 await p.goto('file://'+require('path').resolve(__dirname,'..','index.html')); await p.waitForTimeout(500);
 await p.click('#refreshBtn'); await p.waitForTimeout(1200);
 await p.waitForFunction(()=>{ const s=JSON.parse(localStorage.getItem('betiqlite.v1')||'{}'); return !!(s.cache&&s.cache.soccer_epl&&s.cache.soccer_epl.events.length); },null,{timeout:15000});
 await p.click('[data-tab=all]'); await p.waitForSelector('#list .brow');
 // ---- every bet row: plain-words line and three displays
 const row=await p.$eval('#list .brow:has-text("Arsenal")',e=>({gist:e.querySelector('.cgist').innerText,labels:[...e.querySelectorAll('.trio .t3l')].map(x=>x.innerText),vals:[...e.querySelectorAll('.trio .t3 b')].map(x=>x.innerText)}));
 console.log('   row:',JSON.stringify(row));
 check('row has Risk, Reward, Value displays',row.labels.join(',').toLowerCase()==='risk,reward,value');
 check('risk is a word, reward and value are numbers',row.vals[0]==='Low'&&/^\+\d+%$/.test(row.vals[1])&&/^[+−-]\d+\.\d%$/.test(row.vals[2]),row.vals.join(' | '));
 check('plain-words line',/^(Very likely|Likely) to win, (small|decent) payout, good price\.$/.test(row.gist),row.gist);
 // ---- match page
 await p.click('#list .brow:has-text("Arsenal") >> .bmain'); await p.waitForSelector('#sheetBody .detail');
 const btn=await p.innerText('#sheetBody .detail >> text=/See all \\d+ bets for this match/'); check('detail links to the match page',/See all 8 bets/.test(btn),btn);
 await p.click('#sheetBody >> text=/See all \\d+ bets/'); await p.waitForSelector('#sheetBody .mrow');
 const read=()=>p.$$eval('#sheetBody .mrow',r=>r.map(x=>({name:x.querySelector('.mkname').childNodes[0].textContent,badges:[...x.querySelectorAll('.badge')].map(b=>b.innerText),chance:parseFloat(x.querySelector('.mkr b').innerText),odds:(x.innerText.match(/Odds ([\d.]+)/)||[])[1],value:(x.querySelector('.trio .t3:nth-child(3) b')||{}).innerText,trio:x.querySelectorAll('.trio .t3').length})));
 let rows=await read(); console.log('   likely:',rows.map(r=>r.name+' '+r.chance).join(' | '));
 check('match page lists main outcomes and other bets',rows.length===8&&rows.some(r=>r.name==='Arsenal to win')&&rows.some(r=>r.name==='Draw')&&rows.some(r=>/draw no bet/i.test(r.name)));
 check('sorted most likely first',rows.every((r,i)=>i===0||rows[i-1].chance>=r.chance)&&rows[0].badges.includes('MOST LIKELY'));
 check('one BetIQ pick, on the value bet',rows.filter(r=>r.badges.includes('BETIQ PICK')).length===1&&rows.find(r=>r.badges.includes('BETIQ PICK')).name==='Arsenal to win');
 check('priced bets show three displays',rows.filter(r=>r.odds).every(r=>r.trio===3)&&rows.filter(r=>r.odds).length===3);
 await p.click('#sheetBody .mksort button:has-text("Payout")'); await p.waitForTimeout(150); rows=await read(); console.log('   payout:',rows.map(r=>r.name+' '+(r.odds||'-')).join(' | '));
 const priced=rows.filter(r=>r.odds); check('payout sort: priced first, biggest odds first',rows.slice(0,priced.length).every(r=>r.odds)&&priced.every((r,i)=>i===0||+priced[i-1].odds>=+r.odds)&&priced[0].name==='Everton to win');
 await p.click('#sheetBody .mksort button:has-text("Value")'); await p.waitForTimeout(150); rows=await read();
 check('value sort: best price edge first',rows[0].name==='Arsenal to win',rows.slice(0,3).map(r=>r.name+' '+r.value).join(' | '));
 check('sort choice saved',await p.evaluate(()=>JSON.parse(localStorage.getItem('betiqlite.v1')).mkSort)==='value');
 // open another outcome from the match page and come back
 await p.click('#sheetBody .mrow:has-text("Draw") >> nth=0'); await p.waitForSelector('#sheetBody .backbtn');
 const dr=await p.innerText('#sheetBody'); check('main outcome opens with full details and a way back',/All bets for this match/.test(dr)&&/Draw/.test(dr)&&/How BetIQ|Suggested stake|Bet with/i.test(dr));
 await p.click('#sheetBody .backbtn'); await p.waitForSelector('#sheetBody .mrow'); check('back returns to the match page',(await read()).length===8);
 await p.click('#sheetBody .mrow:has-text("draw no bet") >> nth=0'); await p.waitForSelector('#sheetBody .backbtn');
 check('a bet with no live price opens too',/All bets for this match/.test(await p.innerText('#sheetBody .backbtn')));
 await p.click('#sheetBody .backbtn'); await p.waitForSelector('#sheetBody .mrow'); await p.click('#sheetClose'); await p.waitForFunction(()=>document.getElementById('sheet').hidden);
 // "other ways to bet" inside a bet is sortable too
 await p.click('#list .brow:has-text("Arsenal") >> .bmain'); await p.waitForSelector('#sheetBody .mk .mksort');
 check('other ways to bet has the sort control',await p.$$eval('#sheetBody .mk .mksort button',e=>e.length)===3); await p.click('#sheetClose'); await p.waitForFunction(()=>document.getElementById('sheet').hidden);
 // ---- scorecard
 await p.click('[data-tab=bets]'); await p.waitForSelector('#scoreBody .stat');
 const sc=(await p.innerText('#scoreBody')).replace(/\n/g,' '); console.log('   scorecard:',sc.slice(0,560));
 check('current and longest run',/RIGHT NOW 1 win/i.test(sc)&&/LONGEST RUN 3 wins/i.test(sc));
 check('win rate',/WON 67% 4 of 6 bets/i.test(sc));
 // work the best week out here the same way: Monday-to-Sunday weeks by settle time
 const wk={}; bets.forEach(x=>{const d=new Date(x.settledAt); d.setHours(0,0,0,0); d.setDate(d.getDate()-((d.getDay()+6)%7)); wk[d.getTime()]=(wk[d.getTime()]||0)+x.profit;});
 const bestWk=Math.max(...Object.values(wk)), shown=(sc.match(/BEST WEEK ([+−]£[\d.]+)/i)||[])[1];
 check('best week matches a hand sum',shown===(bestWk<0?'−':'+')+'£'+Math.abs(bestWk).toFixed(2),shown+' vs '+bestWk.toFixed(2));
 // returns: profit 2+3+1.6+4-2-2 = 6.6 on 12 staked = +55.0%; app: +1 over 3 = +33.3%
 check('you against the app',/Your bets returned \+55\.0% on the money staked over 6 bets\. The app's flagged bets returned \+33\.3% over 3\. Too early to call/.test(sc));
 check('milestones',/✓ Three wins in a row/.test(sc)&&/○ Followed 10 bets from start to finish/.test(sc)&&/6 of 10/.test(sc)&&/✓ A winning week/.test(sc));
 console.log('errs',errs,'overflow',await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),'fails',fails); await b.close(); process.exit(fails||errs.length?1:0);
})();
