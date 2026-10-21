// Päris otsast-lõpuni test: päris äpp + päris supabase-js + päris PostgREST/RLS + päris Edge Functions (välised teenused matkitud)
import { chromium } from 'playwright';import fs from 'fs';import crypto from 'crypto';import { execFileSync } from 'child_process';
import { ANON } from '/var/tmp/h/keys.mjs';
const G='http://127.0.0.1:54321',D='/home/claude/viimsi/t/';
const sql=q=>execFileSync('psql',['-h','/var/tmp/v3dpg','-p','5499','-U','postgres','-d','v3d','-tAq','-c',q],{encoding:'utf8'}).trim();
execFileSync('python3',[D+'mklocal.py',`{url:'https://x.supabase.co',key:'${ANON}'}`,D+'e2e.html']);
const html=fs.readFileSync(D+'e2e.html','utf8'),UMD=fs.readFileSync('/root/.cache/deno/npm/registry.npmjs.org/@supabase/supabase-js/2.45.4/dist/umd/supabase.js','utf8');
let pass=0,fails=[];const ok=(c,n,x)=>{if(c){pass++;console.log('  ✓',n);}else{fails.push(n);console.log('  ✗',n,x!==undefined?JSON.stringify(x).slice(0,400):'');}};
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
async function mkctx(br=b){const ctx=await br.newContext({viewport:{width:1366,height:900}});
  await ctx.route('https://fonts.googleapis.com/**',r=>r.abort());
  await ctx.route('https://checkout.stripe.com/**',r=>r.fulfill({body:'<html><body>Stripe test</body></html>',contentType:'text/html'}));
  await ctx.route('https://app.vaade3d.ee/**',r=>r.fulfill({body:html,contentType:'text/html; charset=utf-8'}));
  await ctx.route(/\/node_modules\//,r=>{const u=new URL(r.request().url());r.fulfill({body:fs.readFileSync(D+u.pathname.replace(/^.*?\/node_modules/,'node_modules')),contentType:'application/javascript; charset=utf-8'});});
  await ctx.route('https://cdn.jsdelivr.net/npm/@supabase/**',r=>r.fulfill({body:UMD,contentType:'application/javascript; charset=utf-8'}));
  await ctx.route('https://x.supabase.co/**',async r=>{const q=r.request(),u=new URL(q.url());if(q.method()==='OPTIONS')return r.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'}});
    const h={...q.headers()};delete h.host;const ip=h['x-test-ip']||'8.8.8.8';h['cf-connecting-ip']=ip;
    try{const res=await fetch(G+u.pathname+u.search,{method:q.method(),headers:h,body:['GET','HEAD'].includes(q.method())?undefined:q.postDataBuffer()});const buf=Buffer.from(await res.arrayBuffer());const rh=Object.fromEntries(res.headers);rh['access-control-allow-origin']='*';rh['access-control-expose-headers']='*';delete rh['content-encoding'];delete rh['content-length'];delete rh['transfer-encoding'];r.fulfill({status:res.status,headers:rh,body:buf});}catch(e){r.fulfill({status:502,body:String(e)});}});
  return ctx;}
const ctx=await mkctx();const page=await ctx.newPage();const errs=[];page.on('pageerror',e=>errs.push('PAGE '+e.message+' @ '+String(e.stack).split('\n').slice(1,3).join(' ').slice(0,200)));page.on('response',r=>{if(r.status()>=400)errs.push('HTTP '+r.status()+' '+r.url().slice(0,90));});page.on('console',m=>{if(m.type()==='error'&&!/ERR_FAILED|fonts/.test(m.text()))errs.push('CONSOLE '+m.text().slice(0,200));});
const W=t=>page.waitForTimeout(t),ev=f=>page.evaluate(f),until=async(f,ms=8000)=>{const t=Date.now();while(Date.now()-t<ms){if(await page.evaluate(f).catch(()=>false))return true;await W(200);}return false;};
// müüja konto otse API kaudu
const api=async(path,body,tok)=>{const r=await fetch(G+path,{method:'POST',headers:{'Content-Type':'application/json',apikey:ANON,Authorization:'Bearer '+(tok||ANON)},body:JSON.stringify(body)});return r.json();};
const sS=await api('/auth/v1/signup',{email:'max@seller.ee',password:'parool123',data:{name:'Max Mets',company:'Max OÜ'}});
const CODE=await api('/rest/v1/rpc/become_seller',{},sS.access_token);
console.log('müüja kood',CODE);

console.log('\n== Liitumine äpis ==');
await page.goto('https://app.vaade3d.ee/');await W(2500);
ok(await ev(()=>!document.getElementById('login').hidden&&document.getElementById('skipBtn').hidden),'avaneb sisselogimine, demo nupp peidus');
await ev(()=>setTab(true));await page.fill('#lEmail','mari@katus.ee');await page.fill('#lPass','parool123');await page.fill('#lName','Mari Maasikas');await page.fill('#lComp','Katus OÜ');await page.selectOption('#lNiche',{index:1});await page.selectOption('#lSrc',{index:1});await page.fill('#lRef',CODE.toLowerCase());
await page.click('#lSubmit');ok(await until(()=>!document.getElementById('home').hidden,20000),'konto loodud ja töölaud avanes',await ev(()=>document.getElementById('lErr').textContent));
const cid=sql(`select company_id from profiles where email='mari@katus.ee'`);const dbBal=()=>+sql(`select coalesce(sum(delta),0) from credit_ledger where company_id='${cid}'`);
ok(await ev(()=>acct.credits)===30&&dbBal()===30,'saldo 30 tuleb serverist');
ok(await ev(()=>acct.promo&&acct.promo.left===20),'müüja kood: 20 soodustusega kasutust');
ok(await ev(()=>!!CL.wid),'vidina ID olemas (loodi liitumisel)');

console.log('\n== Objekt ==');
await ev(()=>{openAddress('Kibuvitsa tee 9',document.getElementById('homeIn'));});await W(700);await page.click('#dYes');
ok(await until(()=>CL.objs&&CL.objs.has('120681093'),8000),'objekt salvestati serverisse');
ok(dbBal()===22&&sql(`select count(*) from objects where company_id='${cid}'`)==='1','server võttis 8 krediiti',dbBal());
// krediidita objekt ei jää alles
sql(`insert into credit_ledger(company_id,delta,kind,label) values ('${cid}',-22,'admin','test')`);await ev(()=>clRefresh());
await ev(()=>{acct.credits=50;});await ev(()=>{openAddress('Melba tee 17',document.getElementById('homeIn'));});await W(700);await page.click('#dYes');await W(3500);
ok(sql(`select count(*) from objects where company_id='${cid}'`)==='1'&&await ev(()=>!HOUSES.some(h=>/Melba/.test(h.address))),'krediitideta objekti ei salvestata ja see eemaldatakse',await ev(()=>HOUSES.map(h=>h.short)));
await W(6000);ok(errs.filter(x=>/create_object/.test(x)).length===1&&await ev(()=>!(acct.objects||[]).some(e=>!CL.objs.has(e))),'ebaõnnestunud objekti ei proovita lõputult uuesti',errs.filter(x=>/create_object/.test(x)).length);
sql(`insert into credit_ledger(company_id,delta,kind,label) values ('${cid}',100,'admin','test')`);await ev(()=>clRefresh());await W(500);

console.log('\n== Esituspilt, disain, AI-abiline ==');
await ev(()=>{show('app');select(HOUSES.findIndex(h=>h.ehr==='120681093'));startGen(true);});
ok(await until(()=>acct.genUrl&&acct.genUrl['120681093'],10000),'esituspilt tehti',await ev(()=>document.getElementById('genMsg').textContent));
ok(Math.abs(dbBal()-96.8)<1e-9,'võeti 3,2 krediiti',dbBal());
ok(sql(`select ehr from renders where company_id='${cid}' and kind='pic'`)==='120681093','pilt seotud majaga');
await ev(()=>{const d={id:'d1',img:document.getElementById('lgPrev')?null:null,type:'fassaad',style:'Moodne',txt:'valge',date:'x'};});
await ev(()=>ask('arvuta katuse pindala'));ok(await until(()=>[...document.querySelectorAll('#msgs .msg')].some(m=>/120/.test(m.textContent))),'AI-abiline vastas serveri kaudu');

console.log('\n== Toode, logo, vidin ==');
await ev(()=>{const c=document.createElement('canvas');c.width=300;c.height=120;const g=c.getContext('2d');g.fillStyle='#1d3557';g.fillRect(0,0,300,120);acct.logo=c.toDataURL('image/png');
  const c2=document.createElement('canvas');c2.width=400;c2.height=300;c2.getContext('2d').fillRect(0,0,400,300);
  acct.products=[{id:'pNew',name:'Peotelk 6×12',cat:'Telgid',imgs:[c2.toDataURL('image/jpeg',.8)],W:6,L:12,H:4,cap:'',price:'',desc:'',link:'firma.ee/telk'}];acct.wTitle='Vaata oma maja';acct.wFeat='both';save();});
ok(await until(()=>acct.products[0].sid,10000),'toode salvestati serverisse');
const prow=JSON.parse(sql(`select row_to_json(p) from products p where company_id='${cid}'`)||'{}');
ok(/^https:\/\/x\.supabase\.co\/storage\/v1\/object\/public\/products\//.test(prow.images?.[0])&&prow.link==='https://firma.ee/telk'&&prow.category==='Telgid','toote pilt failihoidlas, link https-iga, kategooria',prow);
ok(/^https:\/\/x\.supabase\.co\/storage\/v1\/object\/public\/products\//.test(sql(`select logo_url from companies where id='${cid}'`)),'logo failihoidlas');
ok(sql(`select title||' '||features from widgets where company_id='${cid}'`)==='Vaata oma maja both','vidina seaded serveris');
const wurl=await ev(()=>{renderWidgetPane();return document.getElementById('wCode').value.match(/src="([^"]+)"/)[1];});
const plink=await ev(()=>prodLink(acct.products[0]));

console.log('\n== Avalik vidin (külastaja) ==');
const b2=await chromium.launch({executablePath:'/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});const ctx2=await mkctx(b2);const v=await ctx2.newPage();v.on('pageerror',e=>errs.push('W '+e.message));
await v.goto(wurl,{waitUntil:'domcontentloaded'});await v.waitForTimeout(3000);
ok(await v.evaluate(()=>!document.getElementById('wdg').hidden&&document.getElementById('wFirm').textContent==='Katus OÜ'&&/img/.test(document.getElementById('wLogo').innerHTML)),'vidin avanes firma nime ja logoga');
await v.fill('#wIn','Kibuvitsa tee 9');await v.evaluate(()=>document.getElementById('wForm').requestSubmit());await v.waitForTimeout(1500);
await v.fill('#ldN','Kalle Kask');await v.fill('#ldE','kalle@klient.ee');await v.click('#leadF [type=submit]');
ok(await (async()=>{for(let k=0;k<30;k++){if(await v.evaluate(()=>/Aitäh/.test(document.querySelector('.cvlead h4')?.textContent||'')))return true;await v.waitForTimeout(200);}return false;})(),'päring saadetud');
ok(sql(`select name||'|'||email from leads where company_id='${cid}'`)==='Kalle Kask|kalle@klient.ee','päring on serveris');
const mails=await (await fetch(G+'/_log')).json();const mm=mails.filter(x=>x[0]==='mail');ok(mm.length===1&&mm[0][1].to[0]==='mari@katus.ee','firma sai e-kirja',mm.map(x=>x[1].to));
// toote link otse
await v.goto('about:blank');await v.goto(plink,{waitUntil:'domcontentloaded'});await v.waitForTimeout(3000);
ok(await v.evaluate(()=>!document.getElementById('place').hidden&&PS&&PS.locked&&/Peotelk/.test(document.querySelector('#plPanel').textContent)),'toote nupp avab kohe selle toote');
const b1=dbBal();
await v.evaluate(()=>{const c=document.createElement('canvas');c.width=640;c.height=480;c.getContext('2d').fillRect(0,0,640,480);PS.photo=c.toDataURL('image/jpeg',.8);PS.pt={x:50,y:60};plDraw();});await v.evaluate(()=>{plGenerate();});
ok(await (async()=>{for(let k=0;k<40;k++){if(await v.evaluate(()=>PS&&/^https:/.test(PS.res||'')))return true;await v.waitForTimeout(250);}return false;})(),'AI pilt kliendi hoovis tehti');
ok(Math.abs(dbBal()-(b1-1.6))<1e-9,'firmalt võeti 1,6 krediiti (soodusega disaini hind)',dbBal()-b1);
await v.fill('#plN','Kalle');await v.fill('#plE','kalle2@klient.ee');await v.fill('#plA','Kibuvitsa tee 9');await v.click('#plLead [type=submit]');await v.waitForTimeout(1500);
ok(/^https:\/\/x\.supabase\.co\/storage\/v1\/object\/public\/renders\//.test(sql(`select image_url from leads where email='kalle2@klient.ee'`)),'päringuga läks kaasa AI pilt');
await v.screenshot({path:D+'e2e-widget.png'});await b2.close();

console.log('\n== Firma näeb päringuid ==');
await page.reload();await until(()=>CL&&CL.cid&&!document.getElementById('home').hidden,15000);await W(1000);
ok(await ev(()=>!document.getElementById('home').hidden),'sessioon püsis pärast lehe laadimist');
ok(await ev(()=>document.getElementById('bellDot').textContent)==='2','kellukesel 2 uut päringut',await ev(()=>document.getElementById('bellDot').textContent));
ok(await ev(()=>acct.genUrl&&!!acct.genUrl['120681093']),'esituspilt taastus serverist');
await ev(()=>{show('settings','widget');renderWidgetPane();const s=document.querySelector('[data-lst="0"]');s.value='called';s.onchange();});await W(1200);
ok(sql(`select count(*) from leads where company_id='${cid}' and status='called'`)==='1','päringu staatus salvestati');
await page.screenshot({path:D+'e2e-leads.png'});

console.log('\n== Ost ja müüja ==');
const ckLog=async()=>(await (await fetch(G+'/_log')).json()).filter(x=>x[0]==='stripe');
await ev(()=>{clBuy(220).catch(()=>{});});await page.waitForURL(/checkout\.stripe\.com/,{timeout:15000}).catch(()=>{});const st=await ckLog();ok(st.length===1&&st[0][1]['metadata[company_id]']===cid,'Stripe makseleht avati õige firmaga');
// Stripe teatab maksest
const sid='cs_e2e',ev1={type:'checkout.session.completed',data:{object:{id:sid,payment_status:'paid',currency:'eur',amount_total:10000,payment_intent:'pi_e2e',metadata:{company_id:cid,pack:'220'}}}},raw=JSON.stringify(ev1),t=Math.floor(Date.now()/1000);
await fetch(G+'/functions/v1/stripe-webhook',{method:'POST',headers:{'stripe-signature':`t=${t},v1=`+crypto.createHmac('sha256','whsec_test').update(`${t}.${raw}`).digest('hex')},body:raw});
await page.goto('https://app.vaade3d.ee/#paid=cs_e2e');await until(()=>typeof acct!=='undefined',15000);ok(await until(()=>/krediiti lisatud/.test(document.getElementById('toast').textContent),20000),'pärast makset: “+220 krediiti lisatud”',await ev(()=>[acct.credits,document.getElementById('toast').textContent]));
// vaba kogus: 15 krediiti = 7,50 €
await ev(()=>show('settings','billing'));await W(800);await page.fill('#cuCr','15');ok(/7,50/.test(await ev(()=>document.getElementById('cuPr').textContent)),'vaba kogus: 15 krediiti = 7,50 €',await ev(()=>document.getElementById('cuPr').textContent));
await page.fill('#cuCr','5');ok(await ev(()=>document.getElementById('cuBuy').disabled),'alla 10 krediidi ei saa osta');await page.fill('#cuCr','15');
await page.click('#cuBuy');await W(400);await page.click('#dYes');await page.waitForURL(/checkout\.stripe\.com/,{timeout:15000}).catch(()=>{});
{const l=(await ckLog()).pop()[1];ok(l['metadata[pack]']==='custom'&&l['metadata[credits]']==='15'&&l['line_items[0][price_data][unit_amount]']==='750','Stripe: vaba kogus 15 krediiti, 750 senti',l);}
{const before=dbBal(),mk=(o,id)=>{const raw=JSON.stringify({type:'checkout.session.completed',data:{object:{id,payment_status:'paid',currency:'eur',payment_intent:'pi_'+id,...o}}}),t=Math.floor(Date.now()/1000);return fetch(G+'/functions/v1/stripe-webhook',{method:'POST',headers:{'stripe-signature':`t=${t},v1=`+crypto.createHmac('sha256','whsec_test').update(`${t}.${raw}`).digest('hex')},body:raw});};
  await mk({amount_total:500,metadata:{company_id:cid,pack:'custom',credits:'15',cents:'750',app:'vaade3d'}},'cs_bad');ok(dbBal()===before,'vale summaga vaba kogus ei anna krediite');
  await mk({amount_total:750,metadata:{company_id:cid,pack:'custom',credits:'15',cents:'750',app:'vaade3d'}},'cs_cust');ok(dbBal()===before+15,'vaba kogus: +15 krediiti',[before,dbBal()]);
  await mk({amount_total:5000,metadata:{company_id:cid,pack:'100',app:'muu-projekt'}},'cs_other');ok(dbBal()===before+15,'teise projekti makse ei anna krediite');}
await page.goto('https://app.vaade3d.ee/#paid=cs_cust');await until(()=>typeof acct!=='undefined',15000);ok(await until(()=>/15 krediiti lisatud/.test(document.getElementById('toast').textContent),20000),'pärast makset: “+15 krediiti lisatud”',await ev(()=>document.getElementById('toast').textContent));
// müüja logib sisse ja näeb tulu
await ev(()=>{document.getElementById('logoutS').click();});await page.waitForLoadState('domcontentloaded');await until(()=>typeof acct!=='undefined'&&!document.getElementById('login').hidden,15000);
await page.fill('#lEmail','max@seller.ee');await page.fill('#lPass','parool123');await page.click('#lSubmit');await until(()=>!document.getElementById('home').hidden,20000);
await ev(()=>show('settings','seller'));await W(1500);
ok(/Teenitud 26,8/.test(await ev(()=>document.getElementById('slSum').textContent)),'müüja näeb 25% tulu',await ev(()=>document.getElementById('slSum').textContent));
await page.screenshot({path:D+'e2e-seller.png'});
// vale parool
await ev(()=>{document.getElementById('logoutS').click();});await W(1500);await until(()=>typeof acct!=='undefined'&&!document.getElementById('login').hidden,15000);await page.fill('#lEmail','max@seller.ee');await page.fill('#lPass','vale');await page.click('#lSubmit');await W(1500);
ok(await until(()=>/Vale e-post või parool/.test(document.getElementById('lErr').textContent),10000),'vale parool: selge veateade',await ev(()=>document.getElementById('lErr').textContent));
ok(await ev(()=>!localStorage.getItem('oai_acct')||!JSON.parse(localStorage.getItem('oai_acct')).products?.length),'väljalogimisel kustuti eelmise konto andmed brauserist');
console.log(`\nKOKKU: ${pass} läbi, ${fails.length} ebaõnnestus`);if(fails.length)console.log(' - '+fails.join('\n - '));console.log('VEAD:',JSON.stringify(errs.slice(0,10)));
await b.close();
