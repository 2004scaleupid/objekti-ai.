// Konto kinnitamine: uus konto ootab Vaade3D kinnitust, admin saab e-kirja, kinnituslink avab konto
import { chromium } from 'playwright';import fs from 'fs';import { execFileSync } from 'child_process';
import { ANON } from '/var/tmp/h/keys.mjs';
const G='http://127.0.0.1:54321',D='/home/claude/viimsi/t/';
const sql=q=>execFileSync('psql',['-h','/var/tmp/v3dpg','-p','5499','-U','postgres','-d','v3d','-tAq','-c',q],{encoding:'utf8'}).trim();
execFileSync('python3',[D+'mklocal.py',`{url:'https://x.supabase.co',key:'${ANON}'}`,D+'e2e.html']);
const html=fs.readFileSync(D+'e2e.html','utf8'),UMD=fs.readFileSync('/root/.cache/deno/npm/registry.npmjs.org/@supabase/supabase-js/2.45.4/dist/umd/supabase.js','utf8');
let pass=0,fails=[];const ok=(c,n,x)=>{if(c){pass++;console.log('  ✓',n);}else{fails.push(n);console.log('  ✗',n,x!==undefined?JSON.stringify(x).slice(0,400):'');}};
const api=async(path,body,tok,method='POST')=>{const r=await fetch(G+path,{method,headers:{'Content-Type':'application/json',apikey:ANON,Authorization:'Bearer '+(tok||ANON)},body:body?JSON.stringify(body):undefined});return {status:r.status,j:await r.json().catch(()=>null)};};
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const ctx=await b.newContext({viewport:{width:1366,height:900}});
await ctx.route('https://fonts.googleapis.com/**',r=>r.abort());
await ctx.route('https://app.vaade3d.ee/**',r=>{const u=new URL(r.request().url()),f='/home/claude/objekti-ai'+u.pathname;
    if(/^\/(js|css|media|examples|vendor|data)\//.test(u.pathname)&&fs.existsSync(f)){const ext=f.split('.').pop();return r.fulfill({body:fs.readFileSync(f),contentType:{js:'application/javascript',css:'text/css',json:'application/json',jpg:'image/jpeg',webp:'image/webp',mp4:'video/mp4',webm:'video/webm',glb:'model/gltf-binary'}[ext]||'application/octet-stream'});}
    return r.fulfill({body:html,contentType:'text/html; charset=utf-8'});});
await ctx.route(/\/node_modules\//,r=>{const u=new URL(r.request().url());r.fulfill({body:fs.readFileSync(D+u.pathname.replace(/^.*?\/node_modules/,'node_modules')),contentType:'application/javascript; charset=utf-8'});});
await ctx.route('https://cdn.jsdelivr.net/npm/@supabase/**',r=>r.fulfill({body:UMD,contentType:'application/javascript; charset=utf-8'}));
await ctx.route('https://x.supabase.co/**',async r=>{const q=r.request(),u=new URL(q.url());if(q.method()==='OPTIONS')return r.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'}});
  const h={...q.headers()};delete h.host;h['cf-connecting-ip']='9.9.9.9';
  const res=await fetch(G+u.pathname+u.search,{method:q.method(),headers:h,body:['GET','HEAD'].includes(q.method())?undefined:q.postDataBuffer()});const buf=Buffer.from(await res.arrayBuffer());const rh=Object.fromEntries(res.headers);rh['access-control-allow-origin']='*';delete rh['content-encoding'];delete rh['content-length'];delete rh['transfer-encoding'];r.fulfill({status:res.status,headers:rh,body:buf});});
const page=await ctx.newPage();const errs=[];page.on('pageerror',e=>errs.push(e.message));page.on('dialog',d=>d.dismiss());
const W=t=>page.waitForTimeout(t),E=f=>page.evaluate(f),until=async(f,ms=10000)=>{const t=Date.now();while(Date.now()-t<ms){if(await page.evaluate(f).catch(()=>false))return true;await W(200);}return false;};
const log=async()=>(await (await fetch(G+'/_log')).json()).filter(x=>x[0]==='mail');
sql(`update settings set require_approval=true`);
const m0=(await log()).length;
const su=await api('/auth/v1/signup',{email:'uus@firma.ee',password:'parool123',data:{name:'Mari Uus',company:'Uus Firma OÜ',niche:'katus',source:'google'}});
const cid=sql(`select company_id from profiles where email='uus@firma.ee'`);
ok(!!cid&&sql(`select approved_at is null from companies where id='${cid}'`)==='t','uus firma on kinnitamata');
ok(sql(`select count(*) from companies where approved_at is null`)==='1','vanad firmad jäid kinnitatuks');
let spendErr='';try{sql(`select spend_credits('${cid}','pic','test')`);}catch(e){spendErr=String(e.stderr||e.message);}
ok(/not_approved/.test(spendErr),'krediite ei saa kulutada enne kinnitust',spendErr.slice(0,120));
// rakendus: ootel ekraan
await page.goto('https://app.vaade3d.ee/');await W(2000);
await page.fill('#lEmail','uus@firma.ee');await page.fill('#lPass','parool123');await page.click('#lSubmit');
ok(await until(()=>{const p=document.getElementById('pend');return p&&/ootab kinnitust/.test(p.innerText);},15000),'sisselogimisel ootel ekraan',await E(()=>({err:document.getElementById('lErr').textContent,login:document.getElementById('login').hidden,app:document.getElementById('app').hidden,pend:!!document.getElementById('pend'),cl:typeof CL!=='undefined'&&{p:CL.pending,cid:CL.cid}})));
ok(await E(()=>document.getElementById('app').hidden&&document.getElementById('login').hidden),'rakendus ja sisselogimine peidus');
await W(1500);
const mails=(await log()).slice(m0);const req=mails.find(m=>/ootab kinnitust/.test(m[1].subject));
ok(!!req,'Vaade3D sai e-kirja uuest kontost',mails.map(m=>m[1].subject));
ok(req&&req[1].to.includes('info@vaade3d.ee'),'kiri läks info@vaade3d.ee',req&&req[1].to);
ok(req&&/Mari Uus/.test(req[1].html)&&/uus@firma\.ee/.test(req[1].html)&&/Uus Firma/.test(req[1].html),'kirjas nimi, e-post ja firma');
const link=req&&(req[1].html.match(/href="([^"]*#kinnita=[^"]+)"/)||[])[1];ok(!!link,'kirjas kinnituslink',link);
// uuesti kontrollimine ei saada teist kirja
await page.click('#pendRe');await W(1500);
ok((await log()).slice(m0).filter(m=>/ootab kinnitust/.test(m[1].subject)).length===1,'teist teavitust ei saadetud');
ok(await E(()=>!!document.getElementById('pend')),'ikka ootel pärast „Kontrolli uuesti“');
// vale link
const bad=await api('/functions/v1/account',{action:'approve',t:cid+'.vale'},null);ok(bad.status===403,'vale allkirjaga link ei kinnita',bad.status);
ok(sql(`select approved_at is null from companies where id='${cid}'`)==='t','firma endiselt kinnitamata');
// kasutaja ise ei saa approved_at muuta
const tok=su.j.access_token;const self=await fetch(G+'/rest/v1/companies?id=eq.'+cid,{method:'PATCH',headers:{'Content-Type':'application/json',apikey:ANON,Authorization:'Bearer '+tok},body:JSON.stringify({approved_at:new Date().toISOString()})});
ok(self.status>=400&&sql(`select approved_at is null from companies where id='${cid}'`)==='t','kasutaja ei saa ennast ise kinnitada',self.status);
// kinnituslink teises aknas (admin, sisse logimata)
const p2=await ctx.newPage();await p2.goto('https://app.vaade3d.ee/'+link.slice(link.indexOf('#')));
const t0=Date.now();let txt='';while(Date.now()-t0<15000){txt=await p2.evaluate(()=>document.body.innerText).catch(()=>'');if(/kinnitatud/.test(txt))break;await p2.waitForTimeout(250);}
ok(/Konto on kinnitatud/.test(txt)&&/Uus Firma/.test(txt),'kinnituslink: „Konto on kinnitatud“',txt.slice(0,200));
ok(sql(`select approved_at is not null from companies where id='${cid}'`)==='t','firma kinnitatud andmebaasis');
await W(800);const um=(await log()).slice(m0).find(m=>/konto on avatud/i.test(m[1].subject));ok(um&&um[1].to[0]==='uus@firma.ee','klient sai e-kirja „konto on avatud“',um&&um[1].to);
const p3=await ctx.newPage();await p3.goto('https://app.vaade3d.ee/'+link.slice(link.indexOf('#')));const t1=Date.now();txt='';while(Date.now()-t1<15000){txt=await p3.evaluate(()=>document.body.innerText).catch(()=>'');if(/kinnitatud/.test(txt))break;await p3.waitForTimeout(250);}
ok(/juba kinnitatud/.test(txt),'teine klikk: „juba kinnitatud“');
ok((await log()).slice(m0).filter(m=>/konto on avatud/i.test(m[1].subject)).length===1,'klient ei saa topelt kirja');
// kasutaja: „Kontrolli uuesti“ avab rakenduse
await page.click('#pendRe');ok(await until(()=>!document.getElementById('home').hidden&&!document.getElementById('pend'),15000),'pärast kinnitust avaneb rakendus');
let sp2='';try{sql(`select spend_credits('${cid}','pic','test')`);}catch(e){sp2=String(e.stderr||e.message);}ok(!/not_approved/.test(sp2),'pärast kinnitust kulutamine lubatud',sp2.slice(0,100));
ok(errs.length===0,'JS vigu pole',errs);
sql(`update settings set require_approval=false`);
console.log(`\n${pass} ok, ${fails.length} viga`);fails.forEach(f=>console.log('  ✗',f));await b.close();process.exit(fails.length?1:0);
