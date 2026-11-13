const { setup } = require('./t15.js');
(async()=>{
 // ---- 4a. team news works
 let {b,p,errs,calls}=await setup({afKey:'k123',extras:false});
 await p.click('[data-tab=more]'); await p.click('#afTest'); await p.waitForTimeout(500);
 console.log('4a test button:',await p.innerText('#afMsg'));
 await p.click('[data-tab=today]'); await p.click('#refreshBtn'); await p.waitForTimeout(1800);
 console.log('4b AF calls:',calls.filter(c=>c.startsWith('AF')).join(' | ').slice(0,200));
 await p.click('[data-tab=all]'); await p.waitForTimeout(200);
 console.log('4c badges:',await p.$$eval('#list .brow',r=>r.map(x=>x.querySelector('.bn1').innerText.replace(/\n/g,' ')+' '+x.querySelector('.bsub').innerText.slice(0,28))));
 const row=await p.$('#list .brow:has(.badge.warn:has-text("TEAM NEWS")) .bmain'); if(row){ await row.click(); await p.waitForTimeout(250); console.log('4d sheet news:',(await p.innerText('#sheetBody .plain >> nth=0')).replace(/\n/g,' | ').slice(0,260)); await p.screenshot({path:'n_sheet.png'}); } else console.log('4d no row with TEAM NEWS badge');
 console.log('errs',errs); await b.close();
 // ---- 4e. free plan blocks the season
 ({b,p,errs}=await setup({afKey:'k123'},{afMode:'plan'})); await p.click('[data-tab=more]'); await p.click('#afTest'); await p.waitForTimeout(500);
 console.log('4e plan blocked:',await p.innerText('#afMsg')); await b.close();
 // ---- 4f. browser blocked
 ({b,p,errs}=await setup({afKey:'k123'},{afMode:'net'})); await p.click('[data-tab=more]'); await p.click('#afTest'); await p.waitForTimeout(500);
 console.log('4f network blocked:',await p.innerText('#afMsg')); await b.close();
 // ---- 5. tour: shown on a fresh start, skippable, and from More
 ({b,p,errs}=await setup({tour:false,booksSet:false}));
 console.log('5a tour auto-shown:',!(await p.$eval('#tour',e=>e.hidden)),'|',(await p.innerText('#tourPanel')).split('\n').slice(0,2).join(' / '));
 for (let i=0;i<4;i++){ await p.click('#tourPanel .actions .btn:has-text("Next")'); await p.waitForTimeout(80); }
 console.log('5b last step:',(await p.innerText('#tourPanel')).split('\n').slice(0,2).join(' / '),'| buttons:',await p.$$eval('#tourPanel .actions .btn',e=>e.map(x=>x.innerText)));
 await p.screenshot({path:'tour5.png'});
 await p.click('#tourPanel .actions .btn:has-text("Done")'); console.log('5c hidden after done:',await p.$eval('#tour',e=>e.hidden),'| tour flag saved:',await p.evaluate(()=>JSON.parse(localStorage.getItem('betiqlite.v1')).tour));
 await p.click('[data-tab=more]'); await p.click('#tourAgain'); await p.waitForTimeout(150); await p.click('#tourPanel .actions .btn:has-text("Next")');
 await p.click('#tourPanel .btn.primary:has-text("Choose my bookmakers")'); await p.waitForTimeout(150); console.log('5d step button opened More tab:',!(await p.$eval('#tab-more',e=>e.hidden)));
 await p.click('[data-tab=more]'); await p.click('#tourAgain'); await p.click('#tourPanel .actions .btn:has-text("Next")'); await p.click('#tourPanel .actions .btn:has-text("Next")');
 await p.click('#tourPanel .btn.primary:has-text("Turn on practice mode")'); await p.waitForTimeout(150); console.log('5e practice switched on:',await p.evaluate(()=>JSON.parse(localStorage.getItem('betiqlite.v1')).practice));
 console.log('errs',errs,'overflow',await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth)); await b.close();
 // ---- 5f. existing user with bets never auto-sees it
 ({b,p,errs}=await setup({tour:false,booksSet:false,bets:[{pid:'q',evId:'q',key:'soccer_epl',league:'EPL',h:'A',a:'B',sel:'A',odds:2,book:'X',stake:1,fair:.5,time:Date.now()-1e6,at:Date.now()-1e6,status:'open',profit:0}]}));
 console.log('5f tour hidden for existing user:',await p.$eval('#tour',e=>e.hidden)); await b.close();
})();
