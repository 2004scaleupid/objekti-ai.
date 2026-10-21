import { chromium } from 'playwright';import fs from 'fs';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'});
let F=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)F++;};
const p=await (await b.newContext({viewport:{width:1440,height:900}})).newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto('file:///home/claude/viimsi/t/local.html');await p.waitForTimeout(1500);
await p.evaluate(()=>{const s=document.getElementById('skipBtn');if(s&&!s.hidden)s.click();});await p.waitForTimeout(500);
await p.evaluate(()=>{show('home');openStudio('vaba');});await p.waitForTimeout(300);
const B=['tpl.png','a.png','b.png','c.png'].map(f=>fs.readFileSync(f).toString('base64'));let k=0;
const drop=async(sel,kind='file')=>p.evaluate(async([sel,b64,kind])=>{const dt=new DataTransfer();
  if(kind==='file'){const bin=atob(b64),u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);dt.items.add(new File([u],'a.png',{type:'image/png'}));}
  else dt.setData('text/html','<img src="'+EXIMG.maja+'">');
  const el=document.querySelector(sel);const ov=[];for(const t of ['dragenter','dragover']){el.dispatchEvent(new DragEvent(t,{bubbles:true,cancelable:true,dataTransfer:dt}));}
  ov.push(!document.getElementById('stDrop').hidden,!document.getElementById('stDropV').hidden);
  el.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt}));return ov;},[sel,B[(k++)%4],kind]);
const st=()=>p.evaluate(()=>({tray:stSess()?stSess().tray.length:0,edit:STU.edit,stage:!document.getElementById('stStage').hidden}));
let o=await drop('#stBox');await p.waitForTimeout(800);let s=await st();ok(o[0]&&s.tray===1&&!s.stage,'fresh: drop -> pilt 1, no editor jump '+JSON.stringify([o,s]));
o=await drop('#stPanel');await p.waitForTimeout(800);s=await st();ok(s.tray===2,'drop on side panel -> pilt 2 '+JSON.stringify(s));
await p.click('#stFiles [data-ed]');await p.waitForTimeout(400);
o=await drop('#stView');await p.waitForTimeout(800);s=await st();ok(o[1]&&s.tray===3&&s.edit!=null,'editor: drop on image -> pilt 3, editor stays '+JSON.stringify([o,s]));
o=await drop('#stView','html');await p.waitForTimeout(800);s=await st();ok(s.tray===4,'image dragged from web page -> pilt 4 '+JSON.stringify(s));
ok(await p.evaluate(()=>document.getElementById('stDrop').hidden&&document.getElementById('stDropV').hidden),'overlays hidden after drop');
ok(!errs.length,'no errors '+errs);console.log('fails',F);await b.close();
