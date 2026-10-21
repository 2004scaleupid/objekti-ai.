import { chromium } from 'playwright';import fs from 'fs';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'});
let F=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)F++;};
const ctx=await b.newContext({viewport:{width:1440,height:900}});const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto('file:///home/claude/viimsi/t/local.html');await p.waitForTimeout(1500);
await p.evaluate(()=>{const s=document.getElementById('skipBtn');if(s&&!s.hidden)s.click();acct.fbDone=1;});await p.waitForTimeout(400);
await p.evaluate(()=>{show('home');openStudio('vaba');});await p.waitForTimeout(300);
await p.setInputFiles('#stFile',[{name:'a.png',mimeType:'image/png',buffer:fs.readFileSync('a.png')}]);await p.waitForTimeout(1500);
await p.fill('#stIn','Värvi fassaad tumehalliks');await p.waitForTimeout(1300);
await p.click('#stHome');await p.waitForTimeout(400);
let r=await p.evaluate(()=>{const c=document.querySelector('#ocards .ocard[data-st]');return c?c.textContent:'';});
ok(r.includes('Pooleli')&&r.includes('1 pilti')&&r.includes('Värvi fassaad'),'unfinished work in Viimased objektid: '+r);
await p.screenshot({path:'home-1.png'});
// reload page: still there (auto-saved)
await p.reload();await p.waitForTimeout(1800);await p.evaluate(()=>{const s=document.getElementById('skipBtn');if(s&&!s.hidden)s.click();show('home');});await p.waitForTimeout(400);
ok(await p.evaluate(()=>!!document.querySelector('#ocards .ocard[data-st]')),'still there after reload');
await p.click('#ocards .ocard[data-st]');await p.waitForTimeout(600);
r=await p.evaluate(()=>({studio:!document.getElementById('studio').hidden,tray:stSess().tray.length,txt:document.getElementById('stIn').value}));
ok(r.studio&&r.tray===1&&r.txt==='Värvi fassaad tumehalliks','reopens with picture and text '+JSON.stringify(r));
// text-only draft also saved
await p.click('#stNew2');await p.fill('#stIn','Moodne saun järve ääres');await p.waitForTimeout(1300);await p.click('#stHome');await p.waitForTimeout(300);
ok(await p.evaluate(()=>document.querySelectorAll('#ocards .ocard[data-st]').length===2),'text-only draft saved too');
ok(!errs.length,'no errors '+errs);console.log('fails',F);await b.close();
