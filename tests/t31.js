// Evidence that matches your bookmakers, the pounds outlook, the STRONG EVIDENCE badge,
// the minimum-chance filter and phone alerts through ntfy.
const { chromium } = require('playwright');
const books=['Bet365','Sky Bet','Paddy Power','William Hill','Ladbrokes','Betfair Sportsbook'];
function ev(id,h,a,hrs,base,boost){return {id,sport_key:'soccer_epl',home_team:h,away_team:a,commence_time:new Date(Date.now()+hrs*3600e3).toISOString(),
 bookmakers:books.map((b,i)=>({key:b.toLowerCase().replace(/ /g,'_'),title:b,markets:[{key:'h2h',outcomes:[{name:h,price:+(base[0]*(i===2?boost:1)).toFixed(2)},{name:a,price:base[2]},{name:'Draw',price:base[1]}]}]}))};}
let fails=0; function check(name,ok,info){ if(!ok) fails++; console.log((ok?'PASS ':'FAIL ')+name+(info!==undefined?' | '+info:'')); }
(async()=>{
 const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:390,height:844}}); const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(String(e))); p.on('dialog',d=>d.accept());
 const sent=[];
 await p.route('**/*',r=>{const q=r.request(), u=q.url(); if(u.startsWith('file:'))return r.continue(); if(u.includes('fonts.g'))return r.abort();
  if(u.startsWith('https://ntfy.sh/')){ sent.push({topic:u.split('/').pop(),title:q.headers()['title'],body:q.postData()}); return r.fulfill({status:200,headers:{'access-control-allow-origin':'*'},body:'{}'}); }
  const h={'access-control-allow-origin':'*','access-control-expose-headers':'*','x-requests-remaining':'400','x-requests-last':'1','content-type':'application/json'};
  if(/\/odds\/\?/.test(u)) return r.fulfill({headers:h,body:JSON.stringify([ev('e1','Arsenal','Everton',2,[1.7,3.9,5.5],1.08),ev('e2','Chelsea','Brighton',30,[2.6,3.4,2.9],1.07),ev('e3','Leeds','Wolves',40,[4.2,3.6,1.95],1.0)])});
  if(/\/sports\/?\?/.test(u)) return r.fulfill({headers:h,body:JSON.stringify([{key:'soccer_epl',group:'Soccer',title:'EPL',active:true,has_outrights:false}])});
  return r.fulfill({headers:h,body:'[]'});});
 await p.addInitScript(()=>{ if(!localStorage.getItem('betiqlite.v1')){ localStorage.setItem('betiqlite.v1',JSON.stringify({key:'dummy',auto:false,ver:2,booksSet:true,pracAsked:true,tour:true,simple:false,
  sports:[{key:'soccer_epl',group:'Soccer',title:'EPL'}],selected:['soccer_epl'],windowH:72,bankroll:100}));} });
 await p.goto('file://'+require('path').resolve(__dirname,'..','index.html')); await p.waitForTimeout(500);
 await p.click('#refreshBtn'); await p.waitForTimeout(1200);
 // the refresh saves when it finishes: wait for that before anything reloads the page
 await p.waitForFunction(()=>{ const s=JSON.parse(localStorage.getItem('betiqlite.v1')||'{}'); return !!(s.cache&&s.cache.soccer_epl&&s.cache.soccer_epl.events.length); },null,{timeout:15000});
 await showAll();
 const rowText=async()=>p.$$eval('#list .brow',r=>r.map(x=>x.innerText.replace(/\n/g,' ')));
 const rows0=await rowText(); check('picks listed',rows0.length>=2,rows0.length);
 async function closeIt(){ await p.evaluate(()=>{ const s=document.getElementById('sheet'); if(s&&!s.hidden){ const c=document.getElementById('sheetClose'); if(c) c.click(); } }); await p.waitForFunction(()=>document.getElementById('sheet').hidden); };
 async function showAll(){ await p.click('[data-tab=all]'); await p.waitForSelector('#list .brow',{timeout:8000}); await p.waitForTimeout(150); };
 async function open(name){ await p.click(`#list .brow:has-text("${name}") >> .bmain`); await p.waitForSelector('#sheetBody .detail'); const t=await p.innerText('#sheetBody'); await closeIt(); return t; };
 // ---- six bookmakers: best-price evidence, pounds outlook, badge
 let t=await open('Arsenal');
 const evid=(t.match(/How bets like this did in the past[\s\S]*?Past results never guarantee the future\./)||[''])[0].replace(/\n/g,' ');
 console.log('   evidence (6 books):',evid.slice(0,520));
 check('pounds outlook shown',/At your stake of £[\d.]+, 100 bets like this came to about [+−]£[\d.]+, and anywhere from [+−]£[\d.]+ to [+−]£[\d.]+/.test(evid));
 check('best-price verdict with 6 books',/bets like this made money/.test(evid)&&!/fewer than three/.test(evid));
 check('STRONG EVIDENCE badge on the row',rows0.some(r=>/Arsenal/.test(r)&&/STRONG EVIDENCE/.test(r)));
 const score6=await p.evaluate(()=>{const r=[...document.querySelectorAll('#list .brow')].find(x=>/Arsenal/.test(x.innerText)); const m=r&&r.innerText.match(/\b(\d{2,3})\b/); return m?+m[1]:null;});
 // ---- one bookmaker: the single-bookmaker figures take over everywhere
 // untick every bookmaker except Paddy Power, through the app's own chips
 async function setBooks(keep){ await p.click('[data-tab=more]'); await p.waitForSelector('#bookChips .chip');
  for(const n of books){ const want=keep.includes(n); const on=await p.getAttribute(`#bookChips .chip:text-is("${n}")`,'aria-pressed'); if((on==='true')!==want) await p.click(`#bookChips .chip:text-is("${n}")`); }
  await showAll(); }
 await setBooks(['Paddy Power']);
 const rows1=await rowText(); t=await open('Arsenal');
 const evid1=(t.match(/How bets like this did in the past[\s\S]*?Past results never guarantee the future\./)||[''])[0].replace(/\n/g,' ');
 console.log('   evidence (1 book):',evid1.slice(-420));
 check('single-bookmaker verdict with 1 book',/fewer than three bookmakers, so the single-bookmaker figure/.test(evid1)&&/Too close to call/.test(evid1));
 check('score reason names single bookmaker',/at a single bookmaker's prices, which is what you have/.test(t));
 check('badge gone with 1 book',!rows1.some(r=>/Arsenal/.test(r)&&/STRONG EVIDENCE/.test(r)));
 await setBooks(books);
 // ---- minimum-chance filter
 const n0=(await rowText()).length; await p.click('#filterBox summary'); await p.selectOption('#fChance','0.5'); await p.waitForTimeout(250);
 const rows50=await rowText(); check('50% filter keeps only safer bets',rows50.length>0&&rows50.length<n0&&rows50.every(r=>/Arsenal/.test(r)),n0+' -> '+rows50.length);
 check('filter in summary',/chance 50%\+/.test(await p.innerText('#filterSum')));
 const kept=await p.evaluate(()=>JSON.parse(localStorage.getItem('betiqlite.v1')).fChance); check('filter is saved',kept===0.5,kept);
 await p.selectOption('#fChance','0'); await p.waitForTimeout(150);
 // ---- phone alerts
 await p.click('[data-tab=more]'); await p.waitForTimeout(250);
 await p.fill('#ntfyTopic','bad topic!'); await p.click('#ntfySave'); await p.waitForTimeout(150); check('bad topic refused',/6 to 64 letters/.test(await p.innerText('#ntfyMsg'))&&sent.length===0);
 await p.fill('#ntfyTopic','betiq-test-topic-123'); await p.click('#ntfySave'); await p.waitForTimeout(400);
 check('test alert sent',sent.length>=1&&sent[0].topic==='betiq-test-topic-123'&&/Sent/.test(await p.innerText('#ntfyMsg')),JSON.stringify(sent[0]));
 const verdicts=await p.evaluate(()=>{document.querySelector('[data-tab=all]').click(); return [...document.querySelectorAll('#list .brow .verdict b')].map(x=>x.innerText);});
 console.log('   verdicts:',verdicts.join(' | '));
 await p.waitForTimeout(300); const before=sent.length; await p.click('#refreshBtn'); await p.waitForTimeout(1300);
 const place=sent.filter(s=>/PLACE/.test(s.title||''));
 check('PLACE alert sent after new prices',place.length===1,JSON.stringify(place[0]||sent.slice(before)));
 check('alert carries only a count',place[0]&&!/Arsenal|Everton|£/.test(place[0].title+place[0].body));
 await p.click('#refreshBtn'); await p.waitForTimeout(1300); check('no repeat for the same bet',sent.filter(s=>/PLACE/.test(s.title||'')).length===1);
 console.log('errs',errs,'overflow',await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),'fails',fails); await b.close(); process.exit(fails||errs.length?1:0);
})();
