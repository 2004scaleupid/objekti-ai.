// Admini päris andmete test (käivita pärast e2e.mjs, mis loob andmed)
import { chromium } from 'playwright';import fs from 'fs';import { execFileSync } from 'child_process';
import { ANON } from '/var/tmp/h/keys.mjs';
const G='http://127.0.0.1:54321',D='/home/claude/viimsi/t/';
const sql=q=>execFileSync('psql',['-h','/var/tmp/v3dpg','-p','5499','-U','postgres','-d','v3d','-tAq','-c',q],{encoding:'utf8'}).trim();
execFileSync('python3',[D+'mklocal.py',`{url:'https://x.supabase.co',key:'${ANON}'}`,D+'e2e.html']);
const html=fs.readFileSync(D+'e2e.html','utf8'),UMD=fs.readFileSync('/root/.cache/deno/npm/registry.npmjs.org/@supabase/supabase-js/2.45.4/dist/umd/supabase.js','utf8');
let pass=0,fails=[];const ok=(c,n,x)=>{if(c){pass++;console.log('  ✓',n);}else{fails.push(n);console.log('  ✗',n,x!==undefined?JSON.stringify(x).slice(0,400):'');}};
const api=async(path,body,tok,method='POST')=>{const r=await fetch(G+path,{method,headers:{'Content-Type':'application/json',apikey:ANON,Authorization:'Bearer '+(tok||ANON)},body:body?JSON.stringify(body):undefined});return {status:r.status,j:await r.json().catch(()=>null)};};

await api('/auth/v1/signup',{email:'stuudio@firma.ee',password:'parool123',data:{name:'Stuudio Test',company:'Stuudio OÜ'}});
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

const kie=async()=>(await (await fetch(G+'/_log')).json()).filter(x=>x[0]==='kie');
await page.goto('https://app.vaade3d.ee/');await W(2000);
await page.fill('#lEmail','stuudio@firma.ee');await page.fill('#lPass','parool123');await page.click('#lSubmit');ok(await until(()=>!document.getElementById('home').hidden,20000),'sisse logitud');
const cid=sql(`select company_id from profiles where email='stuudio@firma.ee'`);const bal=()=>+sql(`select coalesce(sum(delta),0) from credit_ledger where company_id='${cid}'`);
await page.click('.tcard[data-t="vaba"]');await W(500);ok(await E(()=>!document.getElementById('studio').hidden&&document.getElementById('studio').classList.contains('fresh')),'Vaba idee avab tühja stuudio');
// 1) foto + tekst -> design, 2 varianti
await page.click('#stDemo');await W(400);await page.fill('#stIn','Lisa katusele päikesepaneelid');const b0=bal();await page.click('#stGenBtn');
ok(await until(()=>{const s=acct.studio[0];return s&&!s.msgs[s.msgs.length-1].pending;},20000),'pilt valmis');
const r1=await E(()=>{const m=acct.studio[0].msgs;return {out:m[1].out,err:m[1].err,base:acct.studio[0].base};});
ok(r1.out&&r1.out.length===2&&/storage\/v1\/object\/public\/renders/.test(r1.out[0])&&!r1.err,'2 varianti serverist',r1);
ok(bal()===b0-2,'server võttis 2 krediiti',[b0,bal()]);
const rs1=await E(()=>document.getElementById('stRes').textContent);ok(rs1.includes('−2 krediiti')&&rs1.includes('saldo '+String(bal()).replace('.',',')+' krediiti'),'chatis kulu ja serveri saldo',rs1);
// 2) jätkamine valitud pildiga (1 tulemus, sisend = eelmine tulemus)
await page.fill('#stIn','Tee katus punaseks');await page.click('#stGenBtn');
ok(await until(()=>{const s=acct.studio[0];return !s.msgs[s.msgs.length-1].pending;},20000),'teine muudatus valmis');
const r2=await E(()=>{const m=acct.studio[0].msgs;return {out:m[3].out,err:m[3].err};});ok(r2.out&&r2.out.length===1,'jätkamine: 1 tulemus',r2);
const last=sql(`select input_urls[1] from renders where company_id='${cid}' order by created_at desc limit 1`);ok(r1.out.includes(last)||/renders/.test(last),'jätkamisel kasutati eelmist AI-pilti',last);
// 2b) märgitud ala -> server saab foto + märgitud koopia, prompt kirjeldab ala
await E(()=>{stSess().marks.push({t:'rect',c:'#E5482D',a:[.2,.2],b:[.6,.4]});stRenderMarks();});await page.fill('#stIn','Pane alale 1 päikesepaneelid');await page.click('#stGenBtn');
ok(await until(()=>{const s=acct.studio[0];return !s.msgs[s.msgs.length-1].pending;},20000),'märgiga muudatus valmis');
const mk=sql(`select array_length(input_urls,1)||'|'||prompt from renders where company_id='${cid}' order by created_at desc limit 1`);
ok(mk.startsWith('2|')&&/Area 1 \("ala 1"\)/.test(mk)&&/x 20–60%/.test(mk)&&/Never draw the markings/.test(mk),'märgid: 2 sisendpilti ja ala kirjeldus promptis',mk.slice(0,300));
ok(await E(()=>{const s=stSess();return s.imgs[s.tray[0]].k==='ai'&&s.imgs[s.tray[0]].marks.length===0;}),'pärast genereerimist on tulemus pilt 1 (märkideta)');
// 2c) vestlus: tasuta, pildid kaasas, pilti ei tee
{const b2=bal(),n0=(await kie()).length;await page.fill('#stIn','Mida võiks selle majaga veel teha?');await page.press('#stIn','Enter');
ok(await until(()=>{const s=acct.studio[0];const m=s.msgs[s.msgs.length-1];return m.chat&&!m.pending;},15000),'vestluse vastus tuli');
const cl=(await (await fetch(G+'/_log')).json()).filter(x=>x[0]==='claude').pop();ok(cl&&cl[5]==='studio'&&cl[4]>=1,'vestlus: stuudio režiim ja pilt kaasas',cl);
ok(bal()===b2&&(await kie()).length===n0,'vestlus ei võtnud krediite ega teinud pilti');
ok(await E(()=>!!document.querySelector('#stThread [data-juh]')),'vastuses on „Kasuta seda“ juhis');}
// 3) ainult tekst -> pic
await page.click('#stNew2');await W(300);await page.fill('#stIn','Moodne puitmaja männimetsas');const b1=bal();await page.click('#stGenBtn');
ok(await until(()=>{const s=acct.studio[0];return s.msgs.length===2&&!s.msgs[1].pending;},20000),'tekstist pilt valmis');
ok(bal()===b1-4&&sql(`select kind from renders where company_id='${cid}' order by created_at desc limit 1`)==='pic','tekstist pilt: kind pic, 4 krediiti',[b1,bal()]);
// 4) teemat hoidev prompt (sisekujundus)
await page.click('#stNew2');await W(300);await page.click('.stchip[data-t="sisek"]');await W(200);
ok(await E(()=>document.getElementById('stGenBtn').disabled),'sisekujundus ilma fotota: Genereeri keelatud');
await page.setInputFiles('#stFile',{name:'tuba.jpg',mimeType:'image/jpeg',buffer:Buffer.from(fs.readFileSync(D+'tpl.png'))}).catch(()=>{});await W(800);
await page.fill('#stIn','Skandinaavia stiil');await page.click('#stGenBtn');
ok(await until(()=>{const s=acct.studio[0];return s.msgs.length===2&&!s.msgs[1].pending;},20000),'sisekujundus valmis');
const pr=sql(`select prompt from renders where company_id='${cid}' order by created_at desc limit 1`);ok(/Sisekujundus/.test(pr)&&/Skandinaavia stiil/.test(pr),'prompt sisaldab teemat ja soovi');
ok(sql(`select tpl from renders where company_id='${cid}' order by created_at desc limit 1`)==='sisek','render märgitud mallile sisek');
// 5) aadressitöö -> 3D-vaade
await page.click('#stNew2');await W(300);await page.click('.stchip[data-t="katus"]');await W(200);await page.fill('#stIn','Kibuvitsa tee 9');await W(300);await page.keyboard.press('Enter');await W(1200);
ok(await E(()=>!document.getElementById('dlg').hidden||!document.getElementById('body').hidden),'aadress avab objekti loomise');
ok(!errs.length,'JS vigu pole',errs);
console.log(`\nKOKKU: ${pass} läbi, ${fails.length} ebaõnnestus`);if(fails.length)console.log(fails.map(f=>' - '+f).join('\n'));await b.close();
