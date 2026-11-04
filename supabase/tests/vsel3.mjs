import { chromium } from 'playwright';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'});
let fails=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fails++;};
for(const [nm,o] of [['desk',{viewport:{width:1400,height:900},colorScheme:'dark'}],['phone',{viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2,colorScheme:'dark'}]]){
const ctx=await b.newContext(o);await ctx.route(/fonts\.googleapis|fonts\.gstatic|maaamet|ehr\.ee|supabase\.co/,r=>r.abort());
const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8767/test.html');await p.waitForTimeout(2500);
await p.click('#kindDlg #dKind button[data-k="firm"]').catch(()=>{});await p.waitForTimeout(300);
await p.click('#tGrid .tcard[data-t="vidin"] b');await p.waitForTimeout(600);
ok(/Päris välimus/.test(await p.textContent('#vsDlg [data-vf="house"] .hvn')),nm+' house card starts with photo version');
ok(/Populaarne/.test(await p.textContent('#vsDlg [data-vf="place"]')),nm+' popular badge on Toode pildile');
await p.locator('#vsDlg [data-vf="house"]').screenshot({path:'vs3-house-'+nm+'.png'});
await p.click('#vsDlg [data-vf="house"] [data-hv="1"]');await p.waitForTimeout(200);
ok(/Kiire 3D/.test(await p.textContent('#vsDlg [data-vf="house"] .hvn'))&&await p.evaluate(()=>document.querySelector('#vsDlg [data-vf="house"]').getAttribute('aria-pressed'))==='true',nm+' arrow switches variant, selection stays');
await p.click('#vsDlg [data-vf="house"] [data-hv="-1"]');await p.waitForTimeout(200);
await p.click('#vsSet');await p.waitForTimeout(800);
ok(/house3d/.test(await p.evaluate(()=>acct.wFeat)),nm+' photo version saves house3d '+await p.evaluate(()=>acct.wFeat));
ok(await p.isVisible('#wGuide'),nm+' setup guide on settings page');
ok(await p.locator('#wGuide > ol > li').count()>=5,nm+' guide steps '+await p.locator('#wGuide > ol > li').count());
await p.click('#wGuide [data-pf="wix"]');await p.waitForTimeout(150);ok(/Embed/.test(await p.textContent('#wGuide .pfs')),nm+' platform instructions switch');
await p.locator('#wGuide').screenshot({path:'vs3-guide-'+nm+'.png'});
ok(!errs.length,nm+' no errors '+JSON.stringify(errs));await ctx.close();}
// maja valik: kallim ees
const q=await (await b.newContext({viewport:{width:1300,height:900}})).newPage();await q.goto('http://localhost:8767/test.html');await q.waitForTimeout(2500);await q.click('#kindDlg #dKind button[data-k="firm"]').catch(()=>{});
await q.click('.tcard[data-t="maja"] b');await q.waitForTimeout(500);ok(await q.evaluate(()=>document.querySelector('#mhDlg .opt').dataset.k)==='foto','house dialog: photo version first');
await b.close();console.log('fails',fails);
