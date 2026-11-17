// Bet tools: same-match bet checker (against an independent calculation) and the losing-run simulator.
const { chromium } = require('playwright');
const books=['Bet365','Sky Bet','Paddy Power','William Hill','Ladbrokes','Betfair Sportsbook'];
// The truth for the test match: home scores 1.6 goals on average, away 1.1, independently (Poisson).
const LH=1.6, LA=1.1;
const pois=(l,k)=>{let p=Math.exp(-l); for(let i=1;i<=k;i++) p*=l/i; return p;};
function truth(test){ let t=0; for(let h=0;h<=14;h++) for(let a=0;a<=14;a++) if(test(h,a)) t+=pois(LH,h)*pois(LA,a); return t; }
const pH=truth((h,a)=>h>a), pD=truth((h,a)=>h===a), pA=truth((h,a)=>h<a);
// every bookmaker quotes exactly 1/chance, so there is no margin and the app's fair chances equal the truth
function ev(id,h,a,hrs,pr){return {id,sport_key:'soccer_epl',home_team:h,away_team:a,commence_time:new Date(Date.now()+hrs*3600e3).toISOString(),
 bookmakers:books.map((b)=>({key:b.toLowerCase().replace(/ /g,'_'),title:b,markets:[{key:'h2h',outcomes:[{name:h,price:+(1/pr[0]).toFixed(4)},{name:a,price:+(1/pr[2]).toFixed(4)},{name:'Draw',price:+(1/pr[1]).toFixed(4)}]}]}))};}
let fails=0; function check(name,ok,info){ if(!ok) fails++; console.log((ok?'PASS ':'FAIL ')+name+(info!==undefined?' | '+info:'')); }
(async()=>{
 const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:390,height:844}}); const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(String(e))); p.on('dialog',d=>d.accept());
 await p.route('**/*',r=>{const u=r.request().url(); if(u.startsWith('file:'))return r.continue(); if(u.includes('fonts.g'))return r.abort();
  const h={'access-control-allow-origin':'*','access-control-expose-headers':'*','x-requests-remaining':'400','x-requests-last':'1','content-type':'application/json'};
  if(/\/odds\/\?/.test(u)) return r.fulfill({headers:h,body:JSON.stringify([ev('e1','Arsenal','Everton',20,[pH,pD,pA])])});
  return r.fulfill({headers:h,body:'[]'});});
 await p.addInitScript(()=>{ if(!localStorage.getItem('betiqlite.v1')) localStorage.setItem('betiqlite.v1',JSON.stringify({key:'dummy',auto:false,ver:2,booksSet:true,pracAsked:true,tour:true,simple:true,sports:[{key:'soccer_epl',group:'Soccer',title:'EPL'}],selected:['soccer_epl'],windowH:72,bankroll:100})); });
 await p.goto('file://'+require('path').resolve(__dirname,'..','index.html')); await p.waitForTimeout(500);
 const stats=async(sel)=>p.$$eval(sel+' .stat',e=>Object.fromEntries(e.map(x=>[x.querySelector('span').innerText.toLowerCase(),x.querySelector('b').innerText+' / '+(x.querySelector('small')||{innerText:''}).innerText])));
 await p.click('[data-tab=more]'); await p.waitForSelector('#toolsBox'); check('five tools',await p.$$eval('#toolsBox details',d=>d.length)===5);
 // ---- same-match checker with nothing loaded
 await p.click('#tSame > summary'); check('asks for prices when none are loaded',/Load some football prices first/.test(await p.innerText('#sameOut')));
 await p.click('[data-tab=today]'); await p.click('#refreshBtn'); await p.waitForTimeout(1200);
 await p.waitForFunction(()=>{ const s=JSON.parse(localStorage.getItem('betiqlite.v1')||'{}'); return !!(s.cache&&s.cache.soccer_epl&&s.cache.soccer_epl.events.length); },null,{timeout:15000});
 await p.click('[data-tab=more]'); await p.waitForSelector('#sameMatch option[value=e1]',{state:'attached'}); if(!(await p.isVisible('#sameMatch'))) await p.click('#tSame > summary');
 check('match offered, picks named after the teams',/Arsenal v Everton/.test(await p.innerText('#sameMatch'))&&/Arsenal to win/.test(await p.innerText('#sameResult'))&&/Choose at least two picks/.test(await p.innerText('#sameOut')));
 const pick=async(r,g,bt)=>{ await p.selectOption('#sameResult',r); await p.selectOption('#sameGoals',g); await p.selectOption('#sameBtts',bt); await p.waitForTimeout(250); return stats('#sameOut'); };
 // home win + over 2.5 + both teams score
 let s=await pick('h','o2.5','y');
 let want=truth((h,a)=>h>a&&h+a>2.5&&h>0&&a>0), naive=truth((h,a)=>h>a)*truth((h,a)=>h+a>2.5)*truth((h,a)=>h>0&&a>0);
 console.log('   home win + over 2.5 + both score:',JSON.stringify(s),'| truth',(want*100).toFixed(1)+'%','unrelated',(naive*100).toFixed(1)+'%');
 check('chance matches an independent calculation',Math.abs(parseFloat(s['chance all happen'])-want*100)<0.6,parseFloat(s['chance all happen'])+' vs '+(want*100).toFixed(1));
 check('and differs from simply multiplying',Math.abs(parseFloat(s['if unrelated'])-naive*100)<0.6&&want>naive*1.2,parseFloat(s['if unrelated'])+' vs '+(naive*100).toFixed(1));
 check('says the picks go together',/tend to happen together/.test(await p.innerText('#sameOut .plain')));
 const fitNote=await p.innerText('#sameOut'); const m=fitNote.match(/about ([\d.]+) goals for Arsenal, ([\d.]+) for Everton/);
 check('recovers the goal averages it was given',m&&Math.abs(+m[1]-LH)<0.06&&Math.abs(+m[2]-LA)<0.06,m&&m[1]+' / '+m[2]);
 // the price offered
 await p.fill('#sameOdds','4.0'); await p.waitForTimeout(150); s=await stats('#sameOut'); const cut=(1-4.0*want)*100;
 check("bookmaker's cut from the offered odds",Math.abs(parseFloat(s["bookmaker's cut"])-cut)<1.5&&/paid less than the fair price/.test(await p.innerText('#sameOut .plain')),s["bookmaker's cut"]+' vs '+cut.toFixed(1));
 await p.fill('#sameOdds','9/1'); await p.waitForTimeout(150); check('a price above fair is flagged with caution',/in your favour/.test((await stats('#sameOut'))["bookmaker's cut"])&&/Treat that with caution/.test(await p.innerText('#sameOut .plain')));
 // picks that pull against each other, and picks that cannot all happen
 await p.fill('#sameOdds',''); s=await pick('a','u2.5','');
 want=truth((h,a)=>h<a&&h+a<2.5); check('away win + under 2.5',Math.abs(parseFloat(s['chance all happen'])-want*100)<0.6,parseFloat(s['chance all happen'])+' vs '+(want*100).toFixed(1));
 await pick('d','o2.5','n'); check('impossible combination is caught',/cannot all happen/.test(await p.innerText('#sameOut')));
 s=await pick('d','u1.5','n'); want=pois(LH,0)*pois(LA,0); check('draw + under 1.5 + a team fails to score is 0-0',Math.abs(parseFloat(s['chance all happen'])-want*100)<0.5,parseFloat(s['chance all happen'])+' vs '+(want*100).toFixed(1));
 check('says no goals prices were loaded',/because no goals prices are loaded/.test(await p.innerText('#sameOut')));
 // ---- losing-run simulator
 await p.click('#tRun > summary'); await p.waitForSelector('#runOut .stat');
 const run=async(c,o,st,bu,n)=>{ await p.fill('#runChance',String(c)); await p.fill('#runOdds',String(o)); await p.fill('#runStake',String(st)); await p.fill('#runBudget',String(bu)); await p.fill('#runBets',String(n)); await p.waitForTimeout(300); return stats('#runOut'); };
 s=await run(50,'evens',1,1000,100); console.log('   coin flips:',JSON.stringify(s));
 // 100 fair coin flips: the longest run of tails is about log2(100) - 1, so 5 to 7
 const typ=parseInt(s['longest losing run']), bad=parseInt(s['1 time in 10']);
 check('coin flips: longest run matches the textbook figure',typ>=5&&typ<=7&&bad>typ&&bad<=11,typ+' typical, '+bad+' one time in ten');
 check('coin flips: behind about half the time, budget safe',Math.abs(parseFloat(s['behind after 100'])-46)<8&&/^0%/.test(s['budget gone']),s['behind after 100']);
 const again=await run(50,'evens',1,1000,100); check('same inputs give the same answer',JSON.stringify(again)===JSON.stringify(s));
 s=await run(45,'2.3',2,100,100); console.log('   small edge:',JSON.stringify(s));
 check('an edge still has long losing runs',parseInt(s['longest losing run'])>=6&&/edge of \+3\.5% in your favour\. Even so, expect to lose about \d+ in a row/.test(await p.innerText('#runOut .plain')),(await p.innerText('#runOut .plain')).slice(17,120));
 s=await run(45,'2.0',20,100,200); check('big stakes on losing bets empty the budget',parseFloat(s['budget gone'])>60&&/lose 10\.0% of each stake/.test(await p.innerText('#runOut .plain'))&&/real chance of running out of money/.test(await p.innerText('#runOut .plain')),s['budget gone']);
 await p.fill('#runStake','500'); await p.waitForTimeout(200); check('stake bigger than the budget is refused',/stake no bigger than the budget/.test(await p.innerText('#runOut')));
 console.log('errs',errs,'overflow',await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),'fails',fails); await b.close(); process.exit(fails||errs.length?1:0);
})();
