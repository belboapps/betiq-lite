const { chromium } = require('playwright');
const b64=o=>Buffer.from(JSON.stringify(o)).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const jwt=sub=>b64({alg:'HS256'})+'.'+b64({sub})+'.sig';
const URL_='https://abc.supabase.co', KEY='k'.repeat(40);
const server={rows:[],otp:[],refreshes:0,fail401:false,log:[]};
async function newDevice(browser, seed, hash){
  const ctx=await browser.newContext({viewport:{width:390,height:844}}); const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(String(e))); p.on('dialog',d=>d.accept());
  await p.route('**/*',async r=>{const u=r.request().url(); if(u.startsWith('file:'))return r.continue(); if(u.includes('fonts.g'))return r.abort();
   const url=new URL(u); const cors={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*','access-control-expose-headers':'*'};
   if(url.host!=='abc.supabase.co') return r.fulfill({headers:{...cors,'content-type':'application/json'},body:'[]'});
   const req=r.request(); if(req.method()==='OPTIONS') return r.fulfill({status:204,headers:cors});
   const auth=(req.headers()['authorization']||'').replace('Bearer ',''); const sub=(()=>{try{return JSON.parse(Buffer.from(auth.split('.')[1],'base64').toString()).sub}catch(e){return null}})();
   server.log.push(req.method()+' '+url.pathname);
   if(url.pathname==='/auth/v1/otp'){ server.otp.push({body:JSON.parse(req.postData()),redirect:url.searchParams.get('redirect_to')}); return r.fulfill({headers:cors,body:'{}'}); }
   if(url.pathname==='/auth/v1/token'){ server.refreshes++; return r.fulfill({headers:{...cors,'content-type':'application/json'},body:JSON.stringify({access_token:jwt('u1'),refresh_token:'r2',expires_in:3600})}); }
   if(url.pathname==='/rest/v1/bets'){
     if(!sub||server.fail401) return r.fulfill({status:401,headers:cors,body:'{"message":"JWT"}'});
     if(req.method()==='GET') return r.fulfill({headers:{...cors,'content-type':'application/json'},body:JSON.stringify(server.rows.filter(x=>x.user_id===sub))});
     if(req.method()==='POST'){ JSON.parse(req.postData()).forEach(row=>{ const i=server.rows.findIndex(x=>x.user_id===row.user_id&&x.pid===row.pid&&x.practice===row.practice); if(i>-1) server.rows[i]=row; else server.rows.push(row); }); return r.fulfill({status:201,headers:cors,body:''}); }
   }
   return r.fulfill({status:404,headers:cors,body:'{}'}); });
  await p.addInitScript((s)=>{ if(!sessionStorage.getItem('seeded')){sessionStorage.setItem('seeded','1'); localStorage.setItem('betiqlite.v1',JSON.stringify(s));}},
    Object.assign({key:'dummy',auto:false,ver:2,booksSet:true,pracAsked:true,tour:true,simple:false,sports:[{key:'soccer_epl',title:'EPL',group:'Soccer'}],selected:['soccer_epl'],picked:true},seed));
  await p.goto('file://'+require('path').resolve(__dirname,'..','index.html')+''+(hash||'')); await p.waitForTimeout(900);
  return {ctx,p,errs};
}
const now=Date.now(), bet=(pid,o)=>Object.assign({pid,evId:'e'+pid,key:'soccer_epl',league:'EPL',h:'A'+pid,a:'B'+pid,sel:'A'+pid,odds:2,book:'X',stake:2,fair:.5,time:now+3600e3,at:now-1000,status:'open',profit:0,m:now-5000},o||{});
const stored=p=>p.evaluate(()=>{const s=JSON.parse(localStorage.getItem('betiqlite.v1'));return {bets:s.bets.map(b=>b.pid+':'+b.stake+':'+b.status),pbets:s.pbets.map(b=>b.pid),tomb:s.tomb.map(t=>t.pid),status:s.sb.status,sess:!!s.sb.session}});
(async()=>{
 const browser=await chromium.launch();
 const sbCfg={sb:{url:URL_,key:KEY,email:'me@example.com',session:null,last:0,status:''}};
 // A: arrives from the email link carrying tokens in the address, with 2 real bets and 1 practice bet on the phone
 const A=await newDevice(browser,{...sbCfg,bets:[bet('1'),bet('2')],pbets:[bet('3')]},'#access_token='+jwt('u1')+'&refresh_token=r1&expires_in=3600&token_type=bearer&type=magiclink');
 console.log('A hash cleared:',await A.p.evaluate(()=>location.hash===''),'| landed on More tab:',!(await A.p.$eval('#tab-more',e=>e.hidden)));
 console.log('A pushed rows to server:',server.rows.map(r=>(r.practice?'p':'r')+r.pid).sort().join(','),'| status:',(await stored(A.p)).status);
 // B: a new phone, signs in, starts empty
 const B=await newDevice(browser,{...sbCfg},'#access_token='+jwt('u1')+'&refresh_token=r1&expires_in=3600&token_type=bearer&type=magiclink');
 const sb=await stored(B.p); console.log('B pulled:',JSON.stringify(sb.bets),'practice',JSON.stringify(sb.pbets),'|',sb.status);
 // B edits a stake and deletes a bet; the page syncs by itself a few seconds later
 await B.p.click('[data-tab=bets]'); await B.p.waitForTimeout(150);
 await B.p.evaluate(()=>{ const s=JSON.parse(localStorage.getItem('betiqlite.v1')); }); 
 await B.p.fill('#betsBody .bet:has-text("A1") input >> nth=0','5'); await B.p.dispatchEvent('#betsBody .bet:has-text("A1") input >> nth=0','change');
 await B.p.click('#betsBody .bet:has-text("A2") .btn:has-text("Remove")'); await B.p.waitForTimeout(5200);
 console.log('server after B edits:',server.rows.map(r=>(r.practice?'p':'r')+r.pid+(r.data.deleted?' (deleted)':' stake '+r.data.stake)).sort().join(', '));
 // A syncs and receives both changes
 await A.p.click('[data-tab=more]'); await A.p.click('#sbSync'); await A.p.waitForTimeout(700);
 const sa=await stored(A.p); console.log('A after sync:',JSON.stringify(sa.bets),'tomb',JSON.stringify(sa.tomb),'|',sa.status);
 // newest wins: A changes the same bet later than B did
 await A.p.click('[data-tab=bets]'); await A.p.fill('#betsBody .bet:has-text("A1") input >> nth=0','7'); await A.p.dispatchEvent('#betsBody .bet:has-text("A1") input >> nth=0','change'); await A.p.waitForTimeout(5200);
 console.log('server stake for A1 now:',server.rows.find(r=>r.pid==='1').data.stake);
 // expired token is refreshed automatically
 const C=await newDevice(browser,{...sbCfg,bets:[]},'#access_token='+jwt('u1')+'&refresh_token=r1&expires_in=1&token_type=bearer&type=magiclink');
 console.log('C refreshed an expired token:',server.refreshes>0,'| pulled:',JSON.stringify((await stored(C.p)).bets));
 // signed out by the server
 server.fail401=true; await C.p.click('[data-tab=more]'); await C.p.click('#sbSync'); await C.p.waitForTimeout(500);
 const sc=await stored(C.p); console.log('after 401: session cleared =',!sc.sess,'|',sc.status,'| sign-in button back:',!(await C.p.$eval('#sbSignIn',e=>e.hidden)));
 server.fail401=false;
 // sending a sign-in link
 const D=await newDevice(browser,{}); await D.p.click('[data-tab=more]'); await D.p.fill('#sbUrl',URL_); await D.p.fill('#sbKey',KEY); await D.p.fill('#sbEmail','new@example.com'); await D.p.click('#sbSignIn'); await D.p.waitForTimeout(500);
 console.log('link request:',JSON.stringify(server.otp[0]),'|',await D.p.innerText('#sbMsg'));
 console.log('errs',[A,B,C,D].map(x=>x.errs)); await browser.close();
})();
