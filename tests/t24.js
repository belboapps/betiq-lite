const { chromium } = require('playwright');
(async()=>{
 const b=await chromium.launch(); const p=await (await b.newContext({viewport:{width:390,height:844}})).newPage(); const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
 await p.route('**/*',r=>{const u=r.request().url(); if(u.startsWith('file:'))return r.continue(); return r.fulfill({headers:{'access-control-allow-origin':'*','content-type':'application/json'},body:'[]'});});
 const now=Date.now(), sugg=[];
 for(let i=0;i<35;i++) sugg.push({sugg:true,pid:'p'+i,evId:'e'+i,key:'soccer_epl',league:'EPL',h:'A'+i,a:'B'+i,sel:'A'+i,odds:2.0,book:'X',fair:.5,ev:.05,score:70,v:'place',stake:1,time:now-9e6,at:now-9e6,status:i%3===0?'won':'lost',profit:i%3===0?1:-1,settledAt:now});
 for(let i=0;i<35;i++) sugg.push({sugg:true,pid:'c'+i,evId:'f'+i,key:'soccer_epl',league:'EPL',h:'C'+i,a:'D'+i,sel:'C'+i,odds:2.0,book:'X',fair:.5,ev:.04,score:50,v:'consider',stake:1,time:now-9e6,at:now-9e6,status:i%2===0?'won':'lost',profit:i%2===0?1:-1,settledAt:now});
 await p.addInitScript((s)=>{ if(!sessionStorage.getItem('seeded')){sessionStorage.setItem('seeded','1'); localStorage.setItem('betiqlite.v1',JSON.stringify(s));}},{key:'dummy',auto:false,ver:2,booksSet:true,pracAsked:true,tour:true,sugg,sports:[{key:'soccer_epl',title:'EPL',group:'Soccer'}],selected:['soccer_epl'],picked:true});
 await p.goto('file://'+require('path').resolve(__dirname,'..','index.html')+''); await p.waitForTimeout(500); await p.click('[data-tab=bets]'); await p.waitForTimeout(200);
 const t=(await p.innerText('#recordBody')).replace(/\n+/g,' | ');
 console.log('VERDICT ROWS:',t.match(/By verdict[^]*?By BetIQ score/)?.[0].slice(0,420));
 console.log('placeMin now:',await p.evaluate(()=>JSON.parse(localStorage.getItem('betiqlite.v1')).placeMin),'tuneN:',await p.evaluate(()=>JSON.parse(localStorage.getItem('betiqlite.v1')).tuneN));
 console.log('errs',errs); await b.close();
})();
