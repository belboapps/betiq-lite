// Free results through the helper.
const { chromium } = require('playwright'); const path=require('path');
(async()=>{
 const b=await chromium.launch(); const p=await (await b.newContext({viewport:{width:390,height:844}})).newPage(); const errs=[]; p.on('pageerror',e=>errs.push(String(e))); p.on('dialog',x=>x.accept());
 const yd=new Date(Date.now()-864e5), dd=String(yd.getUTCDate()).padStart(2,'0')+'/'+String(yd.getUTCMonth()+1).padStart(2,'0')+'/'+yd.getUTCFullYear();
 let apiCalls=0, resHits=[];
 await p.route('**/*',r=>{const u=r.request().url(); if(u.startsWith('file:'))return r.continue();
  if(u.startsWith('https://helper.example/results')){ resHits.push(new URL(u).searchParams.get('div')); return r.fulfill({headers:{'access-control-allow-origin':'*','content-type':'text/csv'},body:'Div,Date,Time,HomeTeam,AwayTeam,FTHG,FTAG,FTR\nE0,'+dd+',15:00,Arsenal,Everton,2,1,H\nE0,'+dd+',15:00,Man United,Fulham,0,0,D\n'}); }
  if(u.startsWith('https://helper.example/')) return r.fulfill({headers:{'access-control-allow-origin':'*','content-type':'text/csv'},body:'x'});
  if(u.includes('the-odds-api')){ apiCalls++; return r.fulfill({headers:{'access-control-allow-origin':'*','content-type':'application/json'},body:'[]'}); }
  return r.abort();});
 const t=yd.getTime(), bet=(pid,key,h,a,sel,o)=>Object.assign({pid,evId:pid,key,league:'PL',h,a,sel,odds:2,book:'Bet365',stake:2,fair:.5,time:t,at:t-9e5,status:'open',profit:0,mkt:''},o||{});
 await p.addInitScript((s)=>{ if(!sessionStorage.getItem('s')){sessionStorage.setItem('s','1'); localStorage.setItem('betiqlite.v1',JSON.stringify(s));}},
  {key:'',freeMode:true,auto:false,ver:2,booksSet:true,pracAsked:true,tour:true,helperUrl:'https://helper.example',helperAt:Date.now(),sports:[{key:'soccer_epl',title:'EPL',group:'Soccer'}],selected:[],picked:true,
   bets:[bet('f1','fd_E0','Arsenal','Everton','Arsenal'),bet('f2','fd_E0','Arsenal','Everton','Over 2.5 goals',{mkt:'totals',point:2.5,side:'Over'}),bet('a1','soccer_epl','Manchester United','Fulham','Draw'),bet('x1','fd_E0','Chelsea','Spurs','Chelsea')],
   sugg:[Object.assign(bet('s1','fd_E0','Arsenal','Everton','Everton'),{sugg:true,stake:1,score:70,v:'place'})]});
 await p.goto('file://'+path.resolve(__dirname,'..','index.html')); await p.waitForTimeout(1200);
 const st=await p.evaluate(()=>{const s=JSON.parse(localStorage.getItem('betiqlite.v1')); return {bets:s.bets.map(b=>b.pid+':'+b.status+':'+b.profit), sugg:s.sugg.map(b=>b.pid+':'+b.status+':'+b.profit)}});
 console.log(JSON.stringify(st)); console.log('alert:',await p.innerText('#alerts')); console.log('leagues asked:',resHits,'| paid API calls:',apiCalls);
 const n=resHits.length; await p.reload(); await p.waitForTimeout(800); console.log('no repeat within 3 hours:',resHits.length===n);
 console.log('errs',errs); await b.close();
})();
