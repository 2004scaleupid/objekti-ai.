// Admini päris andmete test (käivita pärast e2e.mjs, mis loob andmed)
import { chromium } from 'playwright';import fs from 'fs';import { execFileSync } from 'child_process';
import { ANON } from '/var/tmp/h/keys.mjs';
const G='http://127.0.0.1:54321',D='/home/claude/viimsi/t/';
const sql=q=>execFileSync('psql',['-h','/var/tmp/v3dpg','-p','5499','-U','postgres','-d','v3d','-tAq','-c',q],{encoding:'utf8'}).trim();
execFileSync('python3',[D+'mklocal.py',`{url:'https://x.supabase.co',key:'${ANON}'}`,D+'e2e.html']);
const html=fs.readFileSync(D+'e2e.html','utf8'),UMD=fs.readFileSync('/root/.cache/deno/npm/registry.npmjs.org/@supabase/supabase-js/2.45.4/dist/umd/supabase.js','utf8');
let pass=0,fails=[];const ok=(c,n,x)=>{if(c){pass++;console.log('  ✓',n);}else{fails.push(n);console.log('  ✗',n,x!==undefined?JSON.stringify(x).slice(0,400):'');}};
const api=async(path,body,tok,method='POST')=>{const r=await fetch(G+path,{method,headers:{'Content-Type':'application/json',apikey:ANON,Authorization:'Bearer '+(tok||ANON)},body:body?JSON.stringify(body):undefined});return {status:r.status,j:await r.json().catch(()=>null)};};

await api('/auth/v1/signup',{email:'maja3d@firma.ee',password:'parool123',data:{name:'Maja Test',company:'Maja OÜ'}});
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const ctx=await b.newContext({viewport:{width:1366,height:900}});
await ctx.route('https://fonts.googleapis.com/**',r=>r.abort());
await ctx.route(/fonts\.gstatic|challenges\.cloudflare|fotoladu|livekluster/,r=>r.abort());await ctx.route('https://app.vaade3d.ee/**',r=>{const u=new URL(r.request().url()),f='/home/claude/objekti-ai'+u.pathname;
    if(/^\/(js|css|media|examples|vendor)\//.test(u.pathname)&&fs.existsSync(f)){const ext=f.split('.').pop();return r.fulfill({body:fs.readFileSync(f),contentType:{js:'application/javascript',css:'text/css',json:'application/json',jpg:'image/jpeg',webp:'image/webp',mp4:'video/mp4',webm:'video/webm'}[ext]||'application/octet-stream'});}
    return r.fulfill({body:html,contentType:'text/html; charset=utf-8'});});
await ctx.route(/\/node_modules\//,r=>{const u=new URL(r.request().url());r.fulfill({body:fs.readFileSync(D+u.pathname.replace(/^.*?\/node_modules/,'node_modules')),contentType:'application/javascript; charset=utf-8'});});
await ctx.route('https://cdn.jsdelivr.net/npm/@supabase/**',r=>r.fulfill({body:UMD,contentType:'application/javascript; charset=utf-8'}));
await ctx.route('https://x.supabase.co/**',async r=>{const q=r.request(),u=new URL(q.url());if(q.method()==='OPTIONS')return r.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'}});
  const h={...q.headers()};delete h.host;h['cf-connecting-ip']='9.9.9.9';
  const res=await fetch(G+u.pathname+u.search,{method:q.method(),headers:h,body:['GET','HEAD'].includes(q.method())?undefined:q.postDataBuffer()});const buf=Buffer.from(await res.arrayBuffer());const rh=Object.fromEntries(res.headers);rh['access-control-allow-origin']='*';delete rh['content-encoding'];delete rh['content-length'];delete rh['transfer-encoding'];r.fulfill({status:res.status,headers:rh,body:buf});});
const DS=JSON.parse(fs.readFileSync('/home/claude/viimsi/ds.json','utf8'));
await ctx.route('https://inaadress.maaamet.ee/**',r=>{const q=(new URL(r.request().url()).searchParams.get('address')||'').toLowerCase().trim();
  const rows=DS.A.filter(a=>a[0].toLowerCase().startsWith(q)||a[1]===q).slice(0,10).map(a=>({liik:'E',tunnus:a[1],ads_oid:a[2],ipikkaadress:a[0]+', Viimsi vald, Harju maakond',viitepunkt_x:DS.o[0]+a[4],viitepunkt_y:DS.o[1]+a[5]}));
  r.fulfill({body:JSON.stringify({addresses:rows}),contentType:'application/json',headers:{'access-control-allow-origin':'*'}});});
await ctx.route(/x\.supabase\.co\/storage\/v1\/object\/public\/lod2\//,r=>{const m=new URL(r.request().url()).pathname.match(/lod2\/v1\/(\d{3})\.json/);const f=m&&'/home/claude/lod2work/tiles/'+m[1]+'.json';
  if(f&&fs.existsSync(f))return r.fulfill({body:fs.readFileSync(f),contentType:'application/json',headers:{'access-control-allow-origin':'*'}});r.fulfill({status:404,body:'{}',headers:{'access-control-allow-origin':'*'}});});
await ctx.route(/fotoladu\.maaamet\.ee|livekluster\.ehr\.ee|challenges\.cloudflare\.com/,r=>r.abort());
const page=await ctx.newPage();const errs=[];page.on('pageerror',e=>errs.push(e.message+' @ '+String(e.stack).split('\n').slice(1,3).join(' ')));page.on('dialog',d=>d.dismiss());
const W=t=>page.waitForTimeout(t),E=f=>page.evaluate(f),until=async(f,ms=10000)=>{const t=Date.now();while(Date.now()-t<ms){if(await page.evaluate(f).catch(()=>false))return true;await W(200);}return false;};

await page.goto('https://app.vaade3d.ee/');await W(2000);
await page.fill('#lEmail','maja3d@firma.ee');await page.fill('#lPass','parool123');await page.click('#lSubmit');ok(await until(()=>!document.getElementById('home').hidden,20000),'sisse logitud');
const cid=sql(`select company_id from profiles where email='maja3d@firma.ee'`);const bal=()=>+sql(`select coalesce(sum(delta),0) from credit_ledger where company_id='${cid}'`);
sql(`insert into credit_ledger(company_id,delta,kind,label) values ('${cid}',50,'purchase','test')`);await E(()=>clRefresh&&clRefresh());await W(800);
await page.waitForSelector('#kindDlg [data-k="firm"]',{timeout:6000}).then(()=>page.click('#kindDlg [data-k="firm"]')).catch(()=>{});await W(300);
// avalehe kaart: 4 fotot + aadress + nupp
await page.setInputFiles('#mhFile',['maja0.jpg','maja1.jpg','maja2.jpg','maja3.jpg']);await W(500);
ok(/Loo objekt \+ 3D fotodest/.test(await page.textContent('#homeF [type=submit]')),'nupp: Loo objekt + 3D fotodest');
await page.fill('#homeIn','Kibuvitsa tee 9');await W(300);const b0=bal();await page.click('#homeF [type=submit]');
ok(await until(()=>!document.getElementById('dlg').hidden,15000),'nupp töötab: Uus objekt aken avanes',[errs,await E(()=>[...document.querySelectorAll('.toast,#toast')].map(t=>t.textContent).join('|')),await E(()=>HOUSES.map(h=>h.short))]);
const y=await E(()=>document.getElementById('dYes').textContent);const PO=+sql('select price_obj from settings where id=1'),P3=+sql('select price_3d from settings where id=1');ok(y.startsWith('Loo objekt + 3D fotodest · '+String(+(PO+P3).toFixed(2)).replace('.',',')+' krediiti'),'aknas fotodega valik, hind objekt + 3D',[y,PO,P3]);
await page.click('#dYes');
ok(await until(()=>!document.getElementById('studio').hidden,15000),'maja tehti ja stuudio avanes ise');
await until(()=>STU.p3&&STU.p3.pool.length===4,8000);const P=await E(()=>({ehr:STU.p3&&STU.p3.ehr,sub:STU.p3&&STU.p3.subject,n:STU.p3.pool.length}));ok(P.ehr&&P.sub==='building'&&P.n===4,'stuudios maja, aadress ja 4 fotot',P);
ok(await until(()=>{const s=stSess();return s&&s.p3job&&s.p3job.id;},30000),'fotod kontrolliti ja mudel algas ise (ilma lisaklõpsuta)');
await W(1500);const r=sql(`select coalesce(ehr,'')||'|'||kind||'|'||coalesce(array_length(input_urls,1),0) from renders where company_id='${cid}' order by created_at desc limit 1`);ok(/^\d+\|3d\|4$/.test(r),'server sai maja EHR-i ja 4 fotot',r);
ok(Math.abs(b0-bal()-(PO+P3))<1e-9,'kokku objekt + 3D hind',[b0,bal(),PO,P3]);
ok(await until(()=>{const s=stSess();return s&&s.model&&s.model.garden===true&&!!s.model.ehr;},40000),'valmis maja avaneb krundil (aed sees, aadressiga)',await E(()=>{const s=stSess();return s&&{m:s.model,j:s.p3job};}));
// stuudios ilma aadressita maja ei tee
await E(()=>openStudio('mudel3d',null,{subject:'building',lock:true}));await W(500);
const q=await E(()=>({dis:document.getElementById('stSend').disabled,need:document.getElementById('p3AdS')&&document.getElementById('p3AdS').classList.contains('need'),lab:(document.querySelector('label[for="p3Ad"]')||{}).textContent}));
ok(q.dis&&q.need&&/kohustuslik/.test(q.lab),'stuudios on maja aadress kohustuslik',q);
ok(!errs.length,'JS vigu pole',errs);
console.log(`\nKOKKU: ${pass} läbi, ${fails.length} ebaõnnestus`);if(fails.length)console.log(fails.map(f=>' - '+f).join('\n'));await b.close();process.exit(fails.length?1:0);
