import { chromium } from 'playwright';import fs from 'fs';
const URL_=process.argv[2]||'file:///home/claude/viimsi/t/local.html';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'});
let F=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)F++;};
for(const scheme of ['dark','light']){
const p=await (await b.newContext({viewport:{width:1440,height:900},colorScheme:scheme})).newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error'&&!/ERR_TUNNEL|Failed to load resource/.test(m.text()))errs.push(m.text())});
await p.goto(URL_);await p.waitForTimeout(2000);
await p.evaluate(()=>{const s=document.getElementById('skipBtn');if(s&&!s.hidden)s.click();});await p.waitForTimeout(500);
if(!(await p.evaluate(()=>typeof openStudio==='function'&&!!document.getElementById('studio')))){console.log('no studio');process.exit(1);}
await p.evaluate(()=>{show('home');openStudio('vaba');acct.fbDone=1;});await p.waitForTimeout(300);
const b64=fs.readFileSync('test.heic').toString('base64');
await p.evaluate(([b64])=>{const bin=atob(b64),u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);
  window.__dt=new DataTransfer();__dt.items.add(new File([u],'IMG_2402.HEIC',{type:'image/heic'}));const el=document.querySelector('#stBox');
  for(const t of ['dragenter','dragover'])el.dispatchEvent(new DragEvent(t,{bubbles:true,cancelable:true,dataTransfer:__dt}));},[b64]);
await p.waitForTimeout(200);await p.screenshot({path:`heic-drag-${scheme}.png`});
await p.evaluate(()=>document.querySelector('#stBox').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:__dt})));
const t0=Date.now();let done=false;while(Date.now()-t0<30000){done=await p.evaluate(()=>!!(stSess()&&stSess().base&&STU.nat));if(done)break;await p.waitForTimeout(300);}
ok(done,scheme+' HEIC converted and shown in '+(Date.now()-t0)+'ms '+JSON.stringify(await p.evaluate(()=>STU.nat)));
await p.screenshot({path:`heic-done-${scheme}.png`});
ok(!errs.length,scheme+' no errors '+JSON.stringify(errs));await p.close();}
console.log('fails',F);await b.close();
