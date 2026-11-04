import { chromium } from 'playwright';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'});
let fails=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fails++;};
const ctx=await b.newContext({viewport:{width:1300,height:900}});await ctx.route(/fonts\.googleapis|fonts\.gstatic|maaamet|ehr\.ee|supabase\.co/,r=>r.abort());
const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8767/test.html');await p.waitForTimeout(2500);
await p.click('#kindDlg #dKind button[data-k="firm"]').catch(()=>{});await p.waitForTimeout(300);
await p.evaluate(()=>show('settings','widget'));await p.waitForTimeout(800);
ok(await p.locator('#wSvc .wsv').count()===4,'4 service cards');
const st=()=>p.evaluate(()=>[document.getElementById('wFeat').value,acct.wFeat]);
console.log('start',await st());
await p.click('#wSvc [data-svf="idea"]');await p.waitForTimeout(200);
await p.click('#wSvc [data-svf="model3d"]');await p.waitForTimeout(200);
await p.click('#wSvc [data-svs="house3d"]');await p.waitForTimeout(200);
let s=await st();ok(/idea/.test(s[1])&&/model3d/.test(s[1])&&/house3d/.test(s[1]),'saved features '+s[1]);
await p.locator('#wSvc').screenshot({path:'wsvc-settings.png'});
// eelvaade (kodulehe näidis)
await p.click('#wSave');await p.waitForTimeout(1200);
ok(await p.locator('#wSite [data-wsv="idea"]').count()===1&&await p.locator('#wSite [data-wsv="model3d"]').count()===1&&await p.locator('#wSite [data-wsv="house3d"]').count()===1,'site mock shows service buttons');
await p.screenshot({path:'wsvc-site.png'});
// vaba idee demo
await p.click('#wSite [data-wsv="idea"]');await p.waitForTimeout(400);
ok(await p.isVisible('#wsxDlg'),'idea dialog opens');
await p.evaluate(()=>{const c=document.createElement('canvas');c.width=400;c.height=300;const x=c.getContext('2d');x.fillStyle='#8a6';x.fillRect(0,0,400,300);});
await p.locator('#wsxOne').click().catch(()=>{});
// set photo directly
await p.evaluate(()=>{});
const fc=p.waitForEvent('filechooser');await p.click('#wsxOne');const ch=await fc;await ch.setFiles('/home/claude/objekti-ai/examples/building-1.webp');await p.waitForTimeout(800);
await p.fill('#wsxNote','uus terrass maja ette');await p.fill('#wsxN','Kati');await p.fill('#wsxE','kati@x.ee');await p.fill('#wsxA','Kase 1, Viimsi');
await p.screenshot({path:'wsvc-idea.png'});
await p.click('#wsxGo');await p.waitForTimeout(2000);
ok(await p.evaluate(()=>/Demo|kinnit|vaatab/.test(document.querySelector('#wsxDlg .msg')?.textContent||'')),'idea demo result');
await p.click('#wsxDlg .x');await p.waitForTimeout(200);
// 3D
await p.click('#wSite [data-wsv="house3d"]');await p.waitForTimeout(400);
ok(await p.locator('#wsxDlg .slot').count()===4,'house 3D has 4 slots');
await p.click('#wsxGo');await p.waitForTimeout(300);ok(/4/.test(await p.textContent('#wsxDlg .msg.bad')),'needs 4 photos');
const fc2=p.waitForEvent('filechooser');await p.click('#wsxDlg [data-sl="0"]');const ch2=await fc2;await ch2.setFiles(['/home/claude/objekti-ai/examples/building-1.webp','/home/claude/objekti-ai/examples/building-1.webp','/home/claude/objekti-ai/examples/building-1.webp','/home/claude/objekti-ai/examples/building-1.webp']);await p.waitForTimeout(1500);
ok(await p.locator('#wsxDlg .slot img').count()===4,'4 photos placed');
await p.screenshot({path:'wsvc-3d.png'});
ok(!errs.length,'no errors '+JSON.stringify(errs));
// telefon
const q=await (await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2})).newPage();await q.route(/fonts\.googleapis|fonts\.gstatic|maaamet|ehr\.ee|supabase\.co/,r=>r.abort());
await q.goto('http://localhost:8767/test.html');await q.waitForTimeout(2500);await q.click('#kindDlg #dKind button[data-k="firm"]').catch(()=>{});
await q.evaluate(()=>{acct.wFeat='house,house3d,place,idea,model3d';save();show('settings','widget');});await q.waitForTimeout(600);
await q.locator('#wSvc').screenshot({path:'wsvc-phone-settings.png'});
await q.evaluate(()=>widgetView(widgetPayload(),{preview:true}));await q.waitForTimeout(800);await q.screenshot({path:'wsvc-phone-widget.png'});
await q.click('#wSvcB [data-wsv="model3d"]');await q.waitForTimeout(400);await q.screenshot({path:'wsvc-phone-3d.png'});
await b.close();console.log('fails',fails);
