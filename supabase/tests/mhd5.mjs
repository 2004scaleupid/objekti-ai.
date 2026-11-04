import { chromium } from 'playwright';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'});
let fails=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fails++;};
for(const [nm,o] of [['desk',{viewport:{width:1400,height:900}}],['phone',{viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2}]]){
const ctx=await b.newContext(o);await ctx.route(/fonts\.googleapis|fonts\.gstatic|maaamet|ehr\.ee|supabase\.co/,r=>r.abort());
const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8767/test.html');await p.waitForTimeout(2500);if(nm==='desk'){await p.click('#kindDlg #dKind button[data-k="firm"]').catch(()=>{});await p.waitForTimeout(400);await p.locator('#tGrid').scrollIntoViewIfNeeded();await p.waitForTimeout(1500);await p.locator('#tGrid').screenshot({path:'grid.png'});}
await p.click('#kindDlg #dKind button[data-k="firm"]').catch(()=>{});await p.waitForTimeout(500);
await p.click('.tcard[data-t="maja"] b');await p.waitForTimeout(700);
ok(await p.isVisible('#mhDlg'),nm+' dialog opens on card click');
const t=await p.evaluate(()=>[...document.querySelectorAll('#mhDlg .opt .pr')].map(x=>x.textContent));ok(t.length===2&&/krediiti/.test(t[0])&&/1 krediit · 0,50 €/.test(t[1]),nm+' prices (photo version first) '+JSON.stringify(t));
const imgs=await p.evaluate(()=>[...document.querySelectorAll('#mhDlg img')].map(i=>i.naturalWidth>0));ok(imgs.every(Boolean),nm+' sample images load '+imgs);
const ov=await p.evaluate(()=>{const b=document.querySelector('#mhDlg .box').getBoundingClientRect();return [b.left>=0,b.right<=innerWidth+1,document.documentElement.scrollWidth<=innerWidth+1];});ok(ov.every(Boolean),nm+' fits screen '+ov);
await p.screenshot({path:'mhd-'+nm+'.png'});
if(nm==='phone'){await p.evaluate(()=>document.querySelector('#mhDlg .box').scrollTop=9999);await p.waitForTimeout(200);await p.screenshot({path:'mhd-phone2.png'});}
await p.keyboard.press('Escape');await p.waitForTimeout(200);ok(!(await p.isVisible('#mhDlg')),nm+' Esc closes');
await p.click('.tcard[data-t="maja"] b');await p.waitForTimeout(500);await p.click('#mhDlg .opt[data-k="lihtne"]');await p.waitForTimeout(700);
ok(!(await p.isVisible('#mhDlg')),nm+' pick closes');ok(await p.evaluate(()=>document.activeElement&&document.activeElement.id==='homeIn'),nm+' address field focused');
ok(!errs.length,nm+' no errors '+JSON.stringify(errs));await ctx.close();}
await b.close();console.log('fails',fails);
