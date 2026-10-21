import { chromium } from 'playwright';import fs from 'fs';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'});
let F=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)F++;};
for(const [w,h,n] of [[1440,900,'d'],[390,844,'m']]){
const p=await (await b.newContext({viewport:{width:w,height:h}})).newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto('file:///home/claude/viimsi/t/local.html');await p.waitForTimeout(1500);
await p.evaluate(()=>{const s=document.getElementById('skipBtn');if(s&&!s.hidden)s.click();acct.fbDone=1;show('home');openStudio('vaba');});await p.waitForTimeout(300);
await p.setInputFiles('#stFile',[{name:'a.png',mimeType:'image/png',buffer:fs.readFileSync('a.png')}]);await p.waitForTimeout(1500);
const ed=()=>p.evaluate(()=>STU.edit!=null&&!document.getElementById('stStage').hidden);
await p.click('#stFiles [data-ed]');await p.waitForTimeout(300);ok(await ed(),n+' editor open');
await p.screenshot({path:`back-${n}.png`});
await p.click('#stEdBack');await p.waitForTimeout(300);ok(!(await ed())&&await p.evaluate(()=>!document.getElementById('studio').hidden),n+' Töölaud button -> dashboard');
await p.click('#stFiles [data-ed]');await p.waitForTimeout(300);await p.keyboard.press('Escape');await p.waitForTimeout(200);ok(!(await ed()),n+' Esc -> dashboard');
await p.click('#stFiles [data-ed]');await p.waitForTimeout(300);await p.click('#stTn');await p.waitForTimeout(200);ok(!(await ed()),n+' title -> dashboard');
ok(!errs.length,n+' no errors '+errs);await p.close();}
console.log('fails',F);await b.close();
