import { chromium } from 'playwright';import fs from 'fs';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'});
let F=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)F++;};
const p=await (await b.newContext({viewport:{width:1440,height:900}})).newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto('file:///home/claude/viimsi/t/local.html');await p.waitForTimeout(1500);
await p.evaluate(()=>{const s=document.getElementById('skipBtn');if(s&&!s.hidden)s.click();acct.fbDone=1;show('home');openStudio('vaba');});await p.waitForTimeout(300);
const f=n=>({name:n,mimeType:'image/jpeg',buffer:fs.readFileSync(n)});
await p.setInputFiles('#stFile',[f('maja.jpg'),f('maja_b2.jpg'),f('maja_dark.jpg'),f('maja_bright.jpg')]);
for(let i=0;i<40;i++){if(await p.evaluate(()=>stSess()&&stSess().tray.length===4&&stSess().imgs.every(x=>x.q)))break;await p.waitForTimeout(250);}
const r=await p.evaluate(()=>stTrayImgs(stSess()).map(im=>im.q.lvl+':'+im.q.iss.map(x=>x[1]).join('|')));console.log(r);
ok(r[0].startsWith('warn:Pilt on väike')||r[0].startsWith('ok'),'sharp photo: no blur/dark issue');
ok(r[1].startsWith('bad')&&r[1].includes('udune'),'blurry flagged');ok(r[2].startsWith('bad')&&r[2].includes('tume'),'dark flagged');ok(r[3].includes('üle valgustatud'),'overexposed flagged');
ok(await p.evaluate(()=>document.querySelectorAll('#stFiles .qw').length>=3&&!!document.querySelector('#stFiles .qw.bad')),'thumbnail warning badges');
ok(await p.evaluate(()=>document.querySelectorAll('#stQCard .stqw').length>=3&&document.querySelectorAll('#stQCard .stqual li').length===6),'panel: warnings + 6 criteria');
await p.screenshot({path:'qual-1.png'});
await p.click('#stQAi');for(let i=0;i<20;i++){if(await p.evaluate(()=>{const m=stSess().msgs.at(-1);return m&&m.chat&&!m.pending;}))break;await p.waitForTimeout(200);}
ok(await p.evaluate(()=>stSess().msgs.length===2&&/fotod sobivad/.test(stSess().msgs[0].text)),'AI photo check asks via free chat');
await p.evaluate(()=>{openStudio('sisek');});await p.waitForTimeout(200);ok(await p.evaluate(()=>document.getElementById('stQCard').textContent.includes('Tuled põlema')),'interior tips');
ok(!errs.length,'no errors '+errs);console.log('fails',F);await b.close();
