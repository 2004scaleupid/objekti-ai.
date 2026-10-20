// Mobiilivaate kontroll: kas mõni vaade läheb külgsuunas üle ekraani ja kas konsoolis on vigu
import { chromium } from 'playwright';import fs from 'fs';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const res=[];
for(const [w,h] of [[390,844],[768,1024]]){
const p=await b.newPage({viewport:{width:w,height:h},isMobile:w<500,hasTouch:w<500});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.route('https://fonts.googleapis.com/**',r=>r.abort());
await p.route('https://app.vaade3d.ee/**',r=>r.fulfill({body:fs.readFileSync('/home/claude/objekti-ai/index.html','utf8'),contentType:'text/html; charset=utf-8'}));
await p.route('https://cdnjs.cloudflare.com/**',r=>r.fulfill({body:fs.readFileSync('/home/claude/viimsi/t/node_modules/three/build/three.min.js'),contentType:'application/javascript'}));
await p.route('https://cdn.jsdelivr.net/npm/three@0.128.0/**',r=>r.fulfill({body:fs.readFileSync('/home/claude/viimsi/t/node_modules/three/examples/js/controls/OrbitControls.js'),contentType:'application/javascript'}));
await p.goto('https://app.vaade3d.ee/');await p.waitForTimeout(2500);
const ov=async(name)=>{await p.waitForTimeout(500);const r=await p.evaluate(()=>{const W=document.documentElement.clientWidth;const bad=[...document.querySelectorAll('body *')].filter(e=>{if(!e.offsetParent&&getComputedStyle(e).position!=='fixed')return false;const r=e.getBoundingClientRect();return r.width>0&&r.right>W+2&&!e.closest('[style*="overflow"],.tbl,.hscroll,.chips,.qchips,.tgrid,.plcats,canvas,pre,textarea');}).slice(0,4).map(e=>(e.id?'#'+e.id:e.className||e.tagName).toString().slice(0,40)+' '+Math.round(e.getBoundingClientRect().right));return{sw:document.documentElement.scrollWidth,W,bad};});
  res.push([w+'px '+name,r.sw>r.W+2?'ÜLE ÄÄRE '+r.sw:'ok',r.bad.join(', ')]);await p.screenshot({path:`m-${w}-${name}.png`});};
await p.evaluate(()=>{const f=document.getElementById('fbw');if(f)f.hidden=true;});
await ov('avaleht');
await p.evaluate(()=>{show('app');select(0);});await ov('objekt');
await p.evaluate(()=>{show('settings','products');});await ov('tooted');
await p.evaluate(()=>{show('settings','widget');});await ov('vidin-seaded');
await p.evaluate(()=>{show('settings','company');});await ov('ettevote');
await p.evaluate(()=>{show('settings','seller');});await ov('muuja');
await p.evaluate(()=>{show('settings','billing');});await ov('krediidid');
await p.evaluate(()=>{logout();});await ov('login');
await p.evaluate(()=>{setTab(true);});await ov('registreeru');
await p.evaluate(()=>{widgetView({...widgetPayload(),f:'both'},{preview:false});});await ov('vidin');
await p.evaluate(()=>{openPlace({mode:'widget',p:{c:'Firma OÜ'}});PS.photo=PLACE.park;PS.pt={x:60,y:55};PS.res=PLACE.res;plDraw();});await ov('toode-hoovis');
res.push([w+'px konsoolivead',errs.length?errs.slice(0,3).join(' | '):'ok','']);
await p.close();}
console.log(res.map(r=>r.join(' · ')).join('\n'));await b.close();
