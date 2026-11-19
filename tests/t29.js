// Helper auto-load and the My plan guide.
const { chromium } = require('playwright'); const path=require('path');
const d=new Date(Date.now()+2*864e5); const dd=String(d.getUTCDate()).padStart(2,'0')+'/'+String(d.getUTCMonth()+1).padStart(2,'0')+'/'+d.getUTCFullYear();
const CSV='Div,Date,Time,HomeTeam,AwayTeam,B365H,B365D,B365A,BFDH,BFDD,BFDA,BVH,BVD,BVA,BWH,BWD,BWA,PPH,PPD,PPA,SKBH,SKBD,SKBA,BFEH,BFED,BFEA\r\nE0,'+dd+',15:00,Arsenal,Everton,1.9,3.5,4,1.9,3.5,4,1.9,3.5,4,1.9,3.5,4,2.15,3.5,4,1.9,3.5,4,2.02,3.75,4.4\r\n';
(async()=>{
 const b=await chromium.launch(); const p=await (await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2})).newPage(); const errs=[]; p.on('pageerror',e=>errs.push(String(e))); p.on('dialog',x=>x.accept());
 let hits=0, mode='ok';
 await p.route('**/*',r=>{const u=r.request().url(); if(u.startsWith('file:'))return r.continue();
  if(u.startsWith('https://helper.example/')){ hits++; if(mode==='down') return r.abort(); return r.fulfill({headers:{'access-control-allow-origin':'*','content-type':'text/csv'},body:mode==='junk'?'hello':CSV}); }
  return r.abort();});
 await p.goto('file://'+path.resolve(__dirname,'..','index.html')); await p.waitForTimeout(400);
 await p.click('#freeStart'); await p.waitForTimeout(200);
 mode='down'; await p.fill('#helperUrl','https://helper.example'); await p.click('#helperLoad'); await p.waitForTimeout(500); console.log('helper down:',await p.innerText('#helperMsg'));
 mode='junk'; await p.click('#helperLoad'); await p.waitForTimeout(500); console.log('helper junk:',await p.innerText('#helperMsg'));
 mode='ok'; await p.click('#helperLoad'); await p.waitForTimeout(700); console.log('helper ok:',await p.innerText('#alerts'));
 console.log('card:',await p.$eval('#plan .brow',x=>x.querySelector('.cmatch').innerText+' | '+x.querySelector('.verdict b').innerText));
 const before=hits; await p.reload(); await p.waitForTimeout(600); console.log('no re-fetch within 3 hours:',hits===before);
 await p.evaluate(()=>{const s=JSON.parse(localStorage.getItem('betiqlite.v1')); s.helperAt=Date.now()-4*3600e3; localStorage.setItem('betiqlite.v1',JSON.stringify(s));}); await p.reload(); await p.waitForTimeout(700); console.log('auto re-fetch after 3 hours:',hits===before+1);
 // ---- plan
 const step=async()=>(await p.$eval('#nowBox .nowstep b small',e=>e.innerText))+' -> '+(await p.$eval('#nowBox .nowstep b',e=>e.firstChild.textContent));
 console.log('plan:',await step());
 await p.evaluate(()=>{const s=JSON.parse(localStorage.getItem('betiqlite.v1')); s.weekly=20; s.lossLimit=10; localStorage.setItem('betiqlite.v1',JSON.stringify(s));}); await p.reload(); await p.waitForTimeout(500); console.log('after limits:',await step());
 await p.click('#nowBox .nowstep .btn'); await p.waitForTimeout(300); console.log('after practice on:',await step(),'| practice:',await p.evaluate(()=>JSON.parse(localStorage.getItem('betiqlite.v1')).practice));
 await p.screenshot({path:path.join(process.env.SHOT_DIR||'.','plan.png')});
 await p.evaluate(()=>{const s=JSON.parse(localStorage.getItem('betiqlite.v1')); const n=Date.now(); s.pbets=Array.from({length:10},(_,i)=>({pid:'q'+i,evId:'z'+i,key:'fd_E0',league:'x',h:'A',a:'B',sel:'A',odds:2,book:'Bet365',stake:1,fair:.5,time:n-9e6,at:n-1e7,status:i%2?'won':'lost',profit:i%2?1:-1,mkt:''})); localStorage.setItem('betiqlite.v1',JSON.stringify(s));}); await p.reload(); await p.waitForTimeout(500);
 console.log('after 10 practice bets:',await step());
 console.log('errs',errs,'overflow',await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth)); await b.close();
})();
