const { chromium } = require('playwright');
const books=['Bet365','Sky Bet','Paddy Power','William Hill','Ladbrokes','Betfair Sportsbook'];
const BASE={m1:['Arsenal','Everton',[1.9,3.6,4.2]],m2:['Chelsea','Brighton',[2.1,3.4,3.6]],m3:['Spurs','Fulham',[1.8,3.9,4.4]]};
function mainEv(id){const [h,a,b]=BASE[id]; return {id,sport_key:'soccer_epl',home_team:h,away_team:a,commence_time:new Date(Date.now()+(20+ +id[1]*3)*3600e3).toISOString(),
  bookmakers:books.map((bk,i)=>({key:bk.toLowerCase().replace(/ /g,'_'),title:bk,markets:[{key:'h2h',outcomes:[{name:h,price:+(b[0]*(i===2?1.1:1)).toFixed(2)},{name:a,price:b[2]},{name:'Draw',price:b[1]}]}]}))};}
function extraResp(id,mk){const [h,a]=BASE[id]; const o=mainEv(id); o.bookmakers=books.map((bk,i)=>({key:bk.toLowerCase().replace(/ /g,'_'),title:bk,markets:mk.includes('btts')?[{key:'btts',outcomes:[{name:'Yes',price:+(1.85*(i===2?1.15:1)).toFixed(2)},{name:'No',price:1.95}]}]:[]})); return o;}
async function setup(seed, opts={}){
 const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2}); const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(String(e))); p.on('dialog',d=>{ opts.dialogs&&opts.dialogs.push(d.message()); d.accept(); });
 let remaining=400; const calls=[];
 await p.route('**/*',r=>{const u=r.request().url(); if(u.startsWith('file:'))return r.continue(); if(u.includes('fonts.g'))return r.abort();
  const url=new URL(u);
  if(url.host==='v3.football.api-sports.io'){ calls.push('AF '+url.pathname+url.search); const H={'access-control-allow-origin':'*','content-type':'application/json'};
    if(opts.afMode==='plan') return r.fulfill({headers:H,body:JSON.stringify({errors:{plan:'Free plans do not have access to this season, try from 2022 to 2024.'},response:[]})});
    if(opts.afMode==='net') return r.abort();
    const mk=(t,n,rs)=>Array.from({length:n},(_,i)=>({team:{name:t},player:{name:t[0]+'Player'+i,type:'Missing Fixture',reason:rs}}));
    return r.fulfill({headers:H,body:JSON.stringify({errors:[],response:[...mk('Everton',4,'Knee Injury'),...mk('Arsenal',3,'Hamstring Injury'),{team:{name:'Chelsea'},player:{name:'CQ',type:'Questionable',reason:'Knock'}}]})}); }
  let last=1; const h=()=>({'access-control-allow-origin':'*','access-control-expose-headers':'*','x-requests-remaining':String(remaining),'x-requests-last':String(last),'content-type':'application/json'});
  let m=url.pathname.match(/events\/(m\d)\/odds/);
  if(m){ const mk=(url.searchParams.get('markets')||'').split(','); calls.push('X '+m[1]); remaining-=mk.length; last=mk.length; return r.fulfill({headers:h(),body:JSON.stringify(extraResp(m[1],mk))}); }
  if(url.pathname.endsWith('/odds/')){ calls.push('MAIN'); remaining-=1; last=1; return r.fulfill({headers:h(),body:JSON.stringify(['m1','m2','m3'].map(mainEv))}); }
  if(url.pathname.includes('/scores/')) return r.fulfill({headers:h(),body:'[]'});
  return r.fulfill({headers:h(),body:JSON.stringify([{key:'soccer_epl',title:'EPL',group:'Soccer',active:true,has_outrights:false}])});});
 await p.addInitScript((seedObj)=>{ if(!sessionStorage.getItem('seeded')){sessionStorage.setItem('seeded','1'); localStorage.setItem('betiqlite.v1',JSON.stringify(Object.assign({key:'dummy',auto:false,ver:2,booksSet:true,pracAsked:true,tour:true,sports:[{key:'soccer_epl',title:'EPL',group:'Soccer'}],selected:['soccer_epl'],picked:true,windowH:168},seedObj)))}},seed);
 await p.goto('file://'+require('path').resolve(__dirname,'..','index.html')+''); await p.waitForTimeout(400);
 return {b,p,errs,calls};
}
module.exports={setup};
if(require.main===module) (async()=>{
 const now=Date.now(); const bet=(pid,over)=>Object.assign({pid,evId:'m1',key:'soccer_epl',league:'EPL',h:'Arsenal',a:'Everton',sel:'Arsenal',odds:2.2,book:'Paddy Power',stake:2,fair:.5,time:now+2*3600e3,at:now-3600e3,status:'open',profit:0,mkt:''},over||{});
 // ---- 1. closing price
 let {b,p,errs,calls}=await setup({practice:true,pbets:[bet('m1|Arsenal')]});
 await p.click('[data-tab=bets]'); console.log('1a button before refresh:',(await p.innerText('#betsBody')).match(/Save closing prices[^\n]*/)?.[0]);
 await p.click('#refreshBtn'); await p.waitForTimeout(1800);
 await p.click('[data-tab=bets]'); const txt=await p.innerText('#betsBody');
 console.log('1b closing line:',txt.match(/Closing-price check[^\n]*/)?.[0],'| score tile:',txt.match(/Closing-price score\n[^\n]*\n[^\n]*/)?.[0].replace(/\n/g,' '));
 const f=await p.evaluate(()=>JSON.parse(localStorage.getItem('betiqlite.v1')).pbets[0].close); console.log('1c stored close:',JSON.stringify(f));
 await p.click('#betsBody .btn:has-text("Save closing prices")'); await p.waitForTimeout(600); console.log('1d after button, calls:',calls.filter(c=>c==='MAIN').length,'main calls total; log:',await p.evaluate(()=>JSON.parse(localStorage.getItem('betiqlite.v1')).clog.map(c=>c.label+':'+c.used).join(' | ')));
 console.log('errs',errs); await b.close();
 // ---- 2. loss limits
 ({b,p,errs}=await setup({lossStreak:3,bets:[1,2,3].map(i=>bet('x'+i,{evId:'old'+i,status:'lost',profit:-2,settledAt:Date.now()-i*3600e3,time:Date.now()-5*3600e3}))}));
 await p.click('#refreshBtn'); await p.waitForTimeout(1500);
 console.log('2a banner:',(await p.innerText('.lossbar').catch(()=> 'NONE')).replace(/\n/g,' ').slice(0,110));
 console.log('2b first row stake line:',await p.$eval('#plan .brow .cpay small',e=>e.innerText));
 await b.close();
 ({b,p,errs}=await setup({lossLimit:5,lossStreak:0,bets:[1,2,3].map(i=>bet('y'+i,{evId:'old'+i,status:i===3?'won':'lost',profit:i===3?1:-3,settledAt:Date.now()-1000*i,time:Date.now()-5*3600e3}))}));
 await p.click('#refreshBtn'); await p.waitForTimeout(1500);
 console.log('2c weekly-limit banner:',(await p.innerText('.lossbar').catch(()=> 'NONE')).replace(/\n/g,' ').slice(0,110));
 await b.close();
 ({b,p,errs}=await setup({practice:true,lossStreak:3,pbets:[1,2,3].map(i=>bet('z'+i,{evId:'old'+i,status:'lost',profit:-2,settledAt:Date.now()-i*3600e3,time:Date.now()-5*3600e3}))}));
 await p.click('#refreshBtn'); await p.waitForTimeout(1500); console.log('2d practice mode never paused:',await p.$('.lossbar')===null); await b.close();
 // ---- 3. credits: freshness + confirm
 const dialogs=[]; ({b,p,errs,calls}=await setup({extraMax:12,extraFreshH:3,windowH:168},{dialogs}));
 await p.click('#refreshBtn'); await p.waitForTimeout(1800); const c1=calls.filter(c=>c.startsWith('X')).length;
 console.log('3a first refresh extras calls:',c1,'| button now:',await p.innerText('#refreshBtn'));
 await p.click('#refreshBtn'); await p.waitForTimeout(1500); console.log('3b second refresh extras calls added:',calls.filter(c=>c.startsWith('X')).length-c1,'(fresh ones skipped)');
 await b.close();
 ({b,p,errs,calls}=await setup({extraMax:12},{dialogs})); await p.evaluate(()=>{const s=JSON.parse(localStorage.getItem('betiqlite.v1')); s.remaining=45; localStorage.setItem('betiqlite.v1',JSON.stringify(s));}); await p.reload(); await p.waitForTimeout(300);
 await p.click('#refreshBtn'); await p.waitForTimeout(600); console.log('3c confirm dialog shown:',dialogs.length?dialogs[0]:'NO DIALOG'); await b.close();
})();
