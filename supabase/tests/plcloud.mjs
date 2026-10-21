// Admini päris andmete test (käivita pärast e2e.mjs, mis loob andmed)
import { chromium } from 'playwright';import fs from 'fs';import { execFileSync } from 'child_process';
import { ANON } from '/var/tmp/h/keys.mjs';
const G='http://127.0.0.1:54321',D='/home/claude/viimsi/t/';
const sql=q=>execFileSync('psql',['-h','/var/tmp/v3dpg','-p','5499','-U','postgres','-d','v3d','-tAq','-c',q],{encoding:'utf8'}).trim();
execFileSync('python3',[D+'mklocal.py',`{url:'https://x.supabase.co',key:'${ANON}'}`,D+'e2e.html']);
const html=fs.readFileSync(D+'e2e.html','utf8'),UMD=fs.readFileSync('/root/.cache/deno/npm/registry.npmjs.org/@supabase/supabase-js/2.45.4/dist/umd/supabase.js','utf8');
let pass=0,fails=[];const ok=(c,n,x)=>{if(c){pass++;console.log('  ✓',n);}else{fails.push(n);console.log('  ✗',n,x!==undefined?JSON.stringify(x).slice(0,400):'');}};
const api=async(path,body,tok,method='POST')=>{const r=await fetch(G+path,{method,headers:{'Content-Type':'application/json',apikey:ANON,Authorization:'Bearer '+(tok||ANON)},body:body?JSON.stringify(body):undefined});return {status:r.status,j:await r.json().catch(()=>null)};};

await api('/auth/v1/signup',{email:'telgid@firma.ee',password:'parool123',data:{name:'Telgi Omanik',company:'Telgimaailm OÜ'}});
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const ctx=await b.newContext({viewport:{width:1366,height:900}});
await ctx.route('https://fonts.googleapis.com/**',r=>r.abort());
await ctx.route('https://app.vaade3d.ee/**',r=>r.fulfill({body:html,contentType:'text/html; charset=utf-8'}));
await ctx.route(/\/node_modules\//,r=>{const u=new URL(r.request().url());r.fulfill({body:fs.readFileSync(D+u.pathname.replace(/^.*?\/node_modules/,'node_modules')),contentType:'application/javascript; charset=utf-8'});});
await ctx.route('https://cdn.jsdelivr.net/npm/@supabase/**',r=>r.fulfill({body:UMD,contentType:'application/javascript; charset=utf-8'}));
await ctx.route('https://x.supabase.co/**',async r=>{const q=r.request(),u=new URL(q.url());if(q.method()==='OPTIONS')return r.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'}});
  const h={...q.headers()};delete h.host;h['cf-connecting-ip']='9.9.9.9';
  const res=await fetch(G+u.pathname+u.search,{method:q.method(),headers:h,body:['GET','HEAD'].includes(q.method())?undefined:q.postDataBuffer()});const buf=Buffer.from(await res.arrayBuffer());const rh=Object.fromEntries(res.headers);rh['access-control-allow-origin']='*';delete rh['content-encoding'];delete rh['content-length'];delete rh['transfer-encoding'];r.fulfill({status:res.status,headers:rh,body:buf});});
const page=await ctx.newPage();const errs=[];page.on('pageerror',e=>errs.push(e.message+' @ '+String(e.stack).split('\n').slice(1,3).join(' ')));page.on('dialog',d=>d.dismiss());
const W=t=>page.waitForTimeout(t),E=f=>page.evaluate(f),until=async(f,ms=10000)=>{const t=Date.now();while(Date.now()-t<ms){if(await page.evaluate(f).catch(()=>false))return true;await W(200);}return false;};
const T=(await (await fetch(G+'/auth/v1/token?grant_type=password',{method:'POST',headers:{'Content-Type':'application/json',apikey:ANON},body:JSON.stringify({email:'telgid@firma.ee',password:'parool123'})})).json()).access_token;
const cid=sql(`select company_id from profiles where email='telgid@firma.ee'`),wid=sql(`select public_id from widgets where company_id='${cid}'`);
sql(`insert into credit_ledger(company_id,delta,kind,label) values ('${cid}',100,'purchase','test')`);const bal=()=>+sql(`select coalesce(sum(delta),0) from credit_ledger where company_id='${cid}'`);
const pimg='https://x.supabase.co/storage/v1/object/public/products/'+cid+'/p1.jpg';
for(const [n,pl] of [['Peotelk 6×12','ground'],['Päikesepaneelid 10 kW','roof']])await api('/rest/v1/products',{company_id:cid,name:n,images:[pimg],w:6,l:12,placement:pl},T);
await api('/rest/v1/widgets?company_id=eq.'+cid,{features:'both',place_opts:{mode:'instant',max_products:2,lead_first:true}},T,'PATCH');
const b64=o=>Buffer.from(JSON.stringify(o)).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
// klient kodulehe vidinas
async function newCx(){const cx=await b.newContext({viewport:{width:1366,height:900}});await cx.route('https://fonts.googleapis.com/**',r=>r.abort());await cx.route('https://app.vaade3d.ee/**',r=>r.fulfill({body:html,contentType:'text/html; charset=utf-8'}));
await cx.route(/\/node_modules\//,r=>{const u=new URL(r.request().url());r.fulfill({body:fs.readFileSync(D+u.pathname.replace(/^.*?\/node_modules/,'node_modules')),contentType:'application/javascript; charset=utf-8'});});
await cx.route('https://cdn.jsdelivr.net/npm/@supabase/**',r=>r.fulfill({body:UMD,contentType:'application/javascript; charset=utf-8'}));
await cx.route('https://x.supabase.co/**',async r=>{const q=r.request(),u=new URL(q.url());if(q.method()==='OPTIONS')return r.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'}});
  const h={...q.headers()};delete h.host;h['cf-connecting-ip']='4.4.4.4';const res=await fetch(G+u.pathname+u.search,{method:q.method(),headers:h,body:['GET','HEAD'].includes(q.method())?undefined:q.postDataBuffer()});const buf=Buffer.from(await res.arrayBuffer());const rh=Object.fromEntries(res.headers);rh['access-control-allow-origin']='*';delete rh['content-encoding'];delete rh['content-length'];delete rh['transfer-encoding'];r.fulfill({status:res.status,headers:rh,body:buf});});
const p2=await cx.newPage();p2.on('pageerror',e=>cerr.push(e.message));return p2;}
const cerr=[];let cp=await newCx();
const CE=f=>cp.evaluate(f),cuntil=async(f,ms=15000)=>{const t=Date.now();while(Date.now()-t<ms){if(await cp.evaluate(f).catch(()=>false))return true;await cp.waitForTimeout(200);}return false;};
async function customer(name,email){await cp.goto('https://app.vaade3d.ee/#w='+b64({v:1,id:wid}));await cp.waitForTimeout(1800);
  await cp.click('#wPlaceBtn');await cp.waitForTimeout(400);
  const ids=await CE(()=>prodList().map(p=>p.id));await cp.click(`.plpc[data-pp="${ids[0]}"]`);await cp.click(`.plpc[data-pp="${ids[1]}"]`);
  await cp.setInputFiles('#plFile',{name:'maja.jpg',mimeType:'image/jpeg',buffer:fs.readFileSync(D+'maja.jpg')});await cuntil(()=>!!PS.photo);await cp.waitForTimeout(300);
  const bb=await cp.locator('#plPh').boundingBox();await cp.mouse.click(bb.x+bb.width*.4,bb.y+bb.height*.75);await cp.waitForTimeout(200);
  await cp.fill('#plN',name);await cp.fill('#plE',email);await cp.fill('#plA','Kase 1, Viimsi');await cp.click('#plGo');}
await fetch(G+'/_log',{method:'DELETE'});const b0=bal();
await customer('Kati Klient','kati@gmail.com');
ok(await cuntil(()=>PS&&/renders/.test(PS.res||'')),'klient: pilt kohe (2 toodet)');
ok(await CE(()=>document.getElementById('plPanel').textContent.includes('Aitäh')),'klient: päring juba saadetud');
const pr=sql(`select prompt from renders where company_id='${cid}' order by created_at desc limit 1`);ok(/product 1: Peotelk/.test(pr)&&/product 2: Päikesepaneelid/.test(pr)&&/roof slope/.test(pr)&&/Choose the most natural spot/.test(pr),'juhis: telk punktis, paneelid katusel AI valikul',pr.slice(0,300));
ok(b0-bal()===9,'firmalt: päring 7 + pilt 2 krediiti',[b0,bal()]);
const mails=(await (await fetch(G+'/_log')).json()).filter(x=>x[0]==='mail');ok(mails.length===1&&/pildiga/.test(mails[0][1].subject),'firma sai ühe kirja koos pildiga',mails.map(m=>m[1].subject));
// kinnitusega režiim
await api('/rest/v1/widgets?company_id=eq.'+cid,{place_opts:{mode:'review',max_products:2,lead_first:true}},T,'PATCH');
cp=await newCx(); // uus brauser: vidina seaded on brauseri vahemälus 60 s
await customer('Pille Klient','pille@gmail.com');
ok(await cuntil(()=>PS&&PS.review===true),'klient: kinnitusega režiimis pilti kohe ei näe');
ok(await CE(()=>document.getElementById('plStage').textContent.includes('pille@gmail.com')),'klient: teade, et pilt tuleb e-postiga');
ok(sql(`select count(*) from widget_requests where company_id='${cid}' and status='ready'`)==='1','pildisoov ootab firma kinnitust');
// firma saadab töölaualt
await page.goto('https://app.vaade3d.ee/');await W(2000);await page.fill('#lEmail','telgid@firma.ee');await page.fill('#lPass','parool123');await page.click('#lSubmit');ok(await until(()=>!document.getElementById('home').hidden,20000),'firma sisse logitud');
await E(()=>show('settings','widget'));ok(await until(()=>document.querySelectorAll('#wReqList .wrq').length===2),'firma näeb 2 pildisoovi');
ok(await E(()=>document.getElementById('wReqCount').textContent.includes('1 ootab')),'1 ootab kinnitust');
await fetch(G+'/_log',{method:'DELETE'});
await page.click('#wReqList [data-wsend]');await W(400);await page.fill('#wsMsg','Tere Pille! Siin on teie pilt.');await page.click('#dYes');
ok(await until(()=>WREQ.length&&WREQ.every(r=>r.status==='sent')),'pärast saatmist: saadetud');
const m2=(await (await fetch(G+'/_log')).json()).filter(x=>x[0]==='mail');ok(m2.length===1&&m2[0][1].to[0]==='pille@gmail.com'&&m2[0][1].html.includes('Tere Pille'),'klient sai kirja sõnumi ja pildiga');
const tok=sql(`select token from widget_requests where company_id='${cid}' and status='sent' order by created_at desc limit 1`);
cp=await newCx();await cp.goto('https://app.vaade3d.ee/#wr='+tok);ok(await cuntil(()=>!!document.querySelector('.wrv img[alt="Sinu pilt"]')),'kliendi link näitab pilti');
// stuudiost saatmine
await page.goto('https://app.vaade3d.ee/');await W(2500);await E(()=>show('settings','widget'));await until(()=>document.querySelectorAll('#wReqList .wrq').length===2);
await page.click('#wReqList [data-wst]');await W(600);ok(await E(()=>!document.getElementById('studio').hidden&&stSess().wreq&&stSess().tray.length===2),'Ava stuudios: mustand pilt 1, kliendi foto pilt 2');
ok(!errs.length&&!cerr.length,'JS vigu pole',[errs,cerr]);
console.log(`\nKOKKU: ${pass} läbi, ${fails.length} ebaõnnestus`);if(fails.length)console.log(fails.map(f=>' - '+f).join('\n'));await b.close();
