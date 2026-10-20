// Kontroll: kas avalik index.html (turvapäisega CSP) töötab nii demos kui serveriga, ilma CSP rikkumisteta
import { chromium } from 'playwright';import fs from 'fs';import { ANON } from '/var/tmp/h/keys.mjs';
const G='http://127.0.0.1:54321';
const idx=fs.readFileSync('/home/claude/objekti-ai/index.html','utf8');
const cloud=idx.replace('<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js',`<script>window.V3D_CONFIG={url:'https://x.supabase.co',key:'${ANON}'}</script>\n<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js`);
const UMD=fs.readFileSync('/root/.cache/deno/npm/registry.npmjs.org/@supabase/supabase-js/2.45.4/dist/umd/supabase.js','utf8');
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const out=[];
for(const [name,body] of [['demo',idx],['server',cloud]]){
  const ctx=await b.newContext();const p=await ctx.newPage();const errs=[];
  await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));
  await ctx.route('https://app.vaade3d.ee/**',r=>r.fulfill({body,contentType:'text/html; charset=utf-8'}));
  await ctx.route('https://cdnjs.cloudflare.com/**',r=>r.fulfill({body:fs.readFileSync('/home/claude/viimsi/t/node_modules/three/build/three.min.js'),contentType:'application/javascript'}));
  await ctx.route('https://cdn.jsdelivr.net/npm/three@0.128.0/**',r=>r.fulfill({body:fs.readFileSync('/home/claude/viimsi/t/node_modules/three/examples/js/controls/OrbitControls.js'),contentType:'application/javascript'}));
  await ctx.route('https://cdn.jsdelivr.net/npm/@supabase/**',r=>r.fulfill({body:UMD,contentType:'application/javascript'}));
  await ctx.route('https://x.supabase.co/**',async r=>{const q=r.request(),u=new URL(q.url());const h={...q.headers()};delete h.host;const res=await fetch(G+u.pathname+u.search,{method:q.method(),headers:h,body:['GET','HEAD'].includes(q.method())?undefined:q.postDataBuffer()});const rh=Object.fromEntries(res.headers);rh['access-control-allow-origin']='*';delete rh['content-encoding'];delete rh['content-length'];r.fulfill({status:res.status,headers:rh,body:Buffer.from(await res.arrayBuffer())});});
  await p.addInitScript(()=>{document.addEventListener('securitypolicyviolation',e=>{(window.__csp=window.__csp||[]).push(e.violatedDirective+' '+e.blockedURI);});});
  p.on('pageerror',e=>errs.push(e.message));
  await p.goto('https://app.vaade3d.ee/');await p.waitForTimeout(4000);
  if(name==='demo'){await p.evaluate(()=>{show('app');select(0);setRen(true);show('settings','company');renderLgPrev();});await p.waitForTimeout(800);}
  else{await p.evaluate(()=>setTab(false));await p.fill('#lEmail','mari@katus.ee');await p.fill('#lPass','parool123');await p.click('#lSubmit');await p.waitForTimeout(5000);
    await p.evaluate(()=>{show('app');select(0);ask('katus?');});await p.waitForTimeout(3000);}
  const r=await p.evaluate(()=>({csp:window.__csp||[],cloud:!!CLOUD,home:!document.getElementById('home').hidden||!document.getElementById('body').hidden,three:typeof THREE}));
  out.push([name,JSON.stringify(r),errs.slice(0,3).join(' | ')]);await ctx.close();}
console.log(out.map(x=>x.join('  ')).join('\n'));await b.close();
