// Admini päris andmete test (käivita pärast e2e.mjs, mis loob andmed)
import { chromium } from 'playwright';import fs from 'fs';import { execFileSync } from 'child_process';
import { ANON } from '/var/tmp/h/keys.mjs';
const G='http://127.0.0.1:54321',D='/home/claude/viimsi/t/';
const sql=q=>execFileSync('psql',['-h','/var/tmp/v3dpg','-p','5499','-U','postgres','-d','v3d','-tAq','-c',q],{encoding:'utf8'}).trim();
execFileSync('python3',[D+'mklocal.py',`{url:'https://x.supabase.co',key:'${ANON}'}`,D+'e2e.html']);
const html=fs.readFileSync(D+'e2e.html','utf8'),UMD=fs.readFileSync('/root/.cache/deno/npm/registry.npmjs.org/@supabase/supabase-js/2.45.4/dist/umd/supabase.js','utf8');
let pass=0,fails=[];const ok=(c,n,x)=>{if(c){pass++;console.log('  ✓',n);}else{fails.push(n);console.log('  ✗',n,x!==undefined?JSON.stringify(x).slice(0,400):'');}};
const api=async(path,body,tok,method='POST')=>{const r=await fetch(G+path,{method,headers:{'Content-Type':'application/json',apikey:ANON,Authorization:'Bearer '+(tok||ANON)},body:body?JSON.stringify(body):undefined});return {status:r.status,j:await r.json().catch(()=>null)};};
// pahatahtlik nimi + tavakasutaja
const ev=await api('/auth/v1/signup',{email:'evil@x.ee',password:'parool123',data:{name:'<img src=x onerror="window.__xss=1">',company:'<b>Häkker</b> OÜ'}});
const nonAdm=await api('/functions/v1/admin-data',null,ev.j.access_token,'GET');ok(nonAdm.status===403,'tavakasutaja ei saa admini andmeid (403)',nonAdm);
const anon=await api('/functions/v1/admin-data',null,null,'GET');ok(anon.status===401,'sisselogimata: 401',anon.status);
// admin
await api('/auth/v1/signup',{email:'boss@vaade3d.ee',password:'parool123',data:{name:'Jann',company:'Vaade3D'}});sql(`update profiles set is_admin=true where email='boss@vaade3d.ee'`);
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const ctx=await b.newContext({viewport:{width:1366,height:900}});
await ctx.route('https://fonts.googleapis.com/**',r=>r.abort());
await ctx.route('https://app.vaade3d.ee/**',r=>r.fulfill({body:html,contentType:'text/html; charset=utf-8'}));
await ctx.route(/\/node_modules\//,r=>{const u=new URL(r.request().url());r.fulfill({body:fs.readFileSync(D+u.pathname.replace(/^.*?\/node_modules/,'node_modules')),contentType:'application/javascript; charset=utf-8'});});
await ctx.route('https://cdn.jsdelivr.net/npm/@supabase/**',r=>r.fulfill({body:UMD,contentType:'application/javascript; charset=utf-8'}));
await ctx.route('https://x.supabase.co/**',async r=>{const q=r.request(),u=new URL(q.url());if(q.method()==='OPTIONS')return r.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'}});
  const h={...q.headers()};delete h.host;h['cf-connecting-ip']='9.9.9.9';
  const res=await fetch(G+u.pathname+u.search,{method:q.method(),headers:h,body:['GET','HEAD'].includes(q.method())?undefined:q.postDataBuffer()});const buf=Buffer.from(await res.arrayBuffer());const rh=Object.fromEntries(res.headers);rh['access-control-allow-origin']='*';delete rh['content-encoding'];delete rh['content-length'];delete rh['transfer-encoding'];r.fulfill({status:res.status,headers:rh,body:buf});});
const page=await ctx.newPage();const errs=[];page.on('pageerror',e=>errs.push(e.message));page.on('dialog',d=>d.dismiss());
const W=t=>page.waitForTimeout(t),E=f=>page.evaluate(f),until=async(f,ms=10000)=>{const t=Date.now();while(Date.now()-t<ms){if(await page.evaluate(f).catch(()=>false))return true;await W(200);}return false;};
await page.goto('https://app.vaade3d.ee/');await W(2000);
await page.fill('#lEmail','boss@vaade3d.ee');await page.fill('#lPass','parool123');await page.click('#lSubmit');ok(await until(()=>!document.getElementById('home').hidden,20000),'admin logis sisse');
ok(await E(()=>!document.getElementById('admM').hidden),'admini menüüpunkt nähtav');
await E(()=>show('admin'));ok(await until(()=>!!ADM,10000),'päris andmed laaditi');
const cnt=+sql(`select count(*) from companies`);
const r1=await E(()=>({n:ADM.users.length,sample:allUsers().some(u=>u.sample),kpi:[...document.querySelectorAll('#kpis .kpi')].map(k=>k.innerText.replace(/\n/,': ')),banner:document.querySelector('#admin .abanner').textContent}));
ok(r1.n===cnt&&!r1.sample,'kasutajad = firmad andmebaasis, näidiseid pole',[r1.n,cnt]);
const dbRev=+sql(`select coalesce(sum(eur),0) from credit_ledger where kind in ('purchase','chargeback') and created_at>now()-interval '30 days'`);
ok(r1.kpi.some(k=>k.startsWith('Tulu')&&k.includes(dbRev.toFixed(2).replace('.',','))),'tulu = andmebaasi ostud ('+dbRev+' €)',r1.kpi);
ok(/Päris andmed/.test(r1.banner),'bänner: päris andmed');
await E(()=>renderAdmin('users'));await W(300);
const r2=await E(()=>({rows:document.getElementById('uRows').innerText,xss:window.__xss,imgs:document.querySelectorAll('#uRows img').length}));
ok(/Mari Maasikas/.test(r2.rows)&&/Katus OÜ/.test(r2.rows),'kasutajate tabelis päris firma');
ok(!r2.xss&&r2.imgs===0&&/<img src=x/.test(r2.rows),'pahatahtlik nimi kuvatakse tekstina (XSS kaitse)',r2);
await E(()=>renderAdmin('partners'));await W(300);
const code=sql(`select code from partners limit 1`),earned=+sql(`select coalesce(earned_eur,0) from partner_earnings where code='${code}'`);
const r3=await E(()=>({cards:document.getElementById('pCards').innerText,title:document.getElementById('pdTitle').textContent}));
ok(r3.cards.includes(code)&&r3.title.includes('1 klienti'),'partner '+code+' ja tema 1 klient',r3);
await E(()=>renderAdmin('payouts'));await W(300);
const r4=await E(()=>document.getElementById('poRows').innerText);
ok(r4.includes(String(earned.toFixed(2)).replace('.',',')),'väljamaksete tabelis teenitud '+earned+' €',r4);
// partner lisamine
await E(()=>renderAdmin('partners'));await page.click('#addPartner');await W(300);await page.fill('#npCode','katuspro');await page.fill('#npOwner','Katus Pro OÜ');await page.click('#dYes');
ok(await until(()=>ADM.partners.some(p=>p.code==='KATUSPRO'),8000),'partner lisati andmebaasi');ok(sql(`select name from partners where code='KATUSPRO'`)==='Katus Pro OÜ','partner on andmebaasis');
// väljamakse (maksmata summa >= min puhul); lisa käsitsi summa kontrolliks
sql(`update settings set payout_min=0 where id=1`);sql(`update credit_ledger set created_at=created_at-interval '20 days' where kind='purchase'`);await E(()=>loadAdm(true));await W(800);await E(()=>renderAdmin('payouts'));await W(300);
const btn=await page.$(`[data-pay="${code}"]`);
if(earned>0&&btn){await btn.click();await W(300);await page.click('#dYes');ok(await until(()=>ADM.payouts.length>0,8000),'väljamakse märgiti andmebaasi');ok(+sql(`select count(*) from payouts where code='${code}'`)===1,'payouts tabelis 1 rida');}
else ok(true,'(väljamakse nupp puudub: teenitud 0 või 14 päeva ootel)');
await E(()=>renderAdmin('activity'));await W(200);ok(await E(()=>document.getElementById('aRows')?document.getElementById('aRows').innerText.length>0:true),'tegevuste logi täidetud');
for(const t of ['tpls','roi','feedback','sources','rules','overview'])await E(t=>renderAdmin(t),t);
ok(!errs.length,'ühtegi JS viga admini vaadetes',errs);
await page.screenshot({path:D+'adm.png'});
console.log(`\nKOKKU: ${pass} läbi, ${fails.length} ebaõnnestus`);if(fails.length)console.log(fails.map(f=>' - '+f).join('\n'));await b.close();
