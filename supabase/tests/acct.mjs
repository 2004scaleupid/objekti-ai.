import { chromium } from 'playwright';import { execFileSync } from 'child_process';
const S='/tmp/claude-0/-home-claude/cfb7a3a4-3672-5bf5-b816-02763484350f/scratchpad/';const N=S+'npm3/';const G='http://127.0.0.1:54321';
const sql=q=>execFileSync('psql',['-h','/var/tmp/v3dpg','-p','5499','-U','postgres','-d','v3d','-tAq','-c',q],{encoding:'utf8'}).trim();
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',args:['--use-gl=angle','--use-angle=swiftshader']});
let fails=0;const ok=(c,t,x)=>{console.log(c?'PASS':'FAIL',t,c?'':JSON.stringify(x??'').slice(0,300));if(!c)fails++;};
sql('update settings set require_approval=true');
const log=async()=>(await (await fetch(G+'/_log')).json()).filter(x=>x[0]==='mail');const m0=(await log()).length;
for(const [nm,o,em] of [['desk',{viewport:{width:1440,height:900}},'uus.klient@firma.ee'],['phone',{viewport:{width:390,height:844},isMobile:true,deviceScaleFactor:2},'eraisik@gmail.com']]){
const ctx=await b.newContext({...o,reducedMotion:'reduce'});await ctx.route(/fonts\./,r=>r.abort());
await ctx.route(/cdn\.jsdelivr\.net\/npm\/three@0\.170\.0\/(.*)$/,r=>{const m=r.request().url().match(/three@0\.170\.0\/(.*)$/);r.fulfill({path:N+'package/'+m[1],contentType:'text/javascript'});});
await ctx.route(/supabase\.co/,async r=>{const q=r.request(),u=new URL(q.url());if(!/^\/(functions\/v1\/demo-request|auth\/v1\/signup)/.test(u.pathname))return r.abort();
  if(q.method()==='OPTIONS')return r.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'POST'}});
  const h={...q.headers()};delete h.host;h['cf-connecting-ip']='6.6.6.'+(nm==='desk'?1:2);
  const res=await fetch(G+u.pathname+u.search,{method:'POST',headers:h,body:q.postData()});r.fulfill({status:res.status,headers:{'content-type':'application/json','access-control-allow-origin':'*'},body:await res.text()});});
const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8771/');await p.waitForTimeout(1500);
// header „Logi sisse“ -> konto aken, sisselogimise sakk
await p.$eval('header [data-go="dash"]',x=>x.click()).catch(async()=>{await p.$eval('[data-go="dash"]',x=>x.click());});await p.waitForTimeout(300);
ok(await p.$('#acctDlg')!==null,`${nm} „Logi sisse“ avab konto akna (mitte valget lehte)`);
ok(/Logi sisse/.test(await p.$eval('#acT',x=>x.textContent)),`${nm} avaneb sisselogimise sakk`);
ok(await p.$('#acctDlg .acgo')!==null,`${nm} nupp „Ava töölaud ja logi sisse“`);
await p.$eval('#acctDlg .dtabs [data-t="up"]',x=>x.click());await p.waitForTimeout(200);
ok(/Loo konto/.test(await p.$eval('#acT',x=>x.textContent)),`${nm} sakk „Loo konto“`);
if(nm==='desk')await p.screenshot({path:S+'acct-form.png'});
await p.click('#acctDlg button[type=submit]');ok(/nimi/.test(await p.$eval('#acctDlg .dmerr',x=>x.textContent)),`${nm} tühja vormi viga`);
await p.fill('[name=name]',nm==='desk'?'Kalle Klient':'Eva Eraisik');if(nm==='desk')await p.fill('[name=company]','Kalle Saunad OÜ');
await p.selectOption('[name=niche]',nm==='desk'?'moodul':'other');await p.selectOption('[name=source]','google');await p.fill('[name=email]',em);await p.fill('[name=password]','lyhike');
await p.click('#acctDlg button[type=submit]');ok(/8 märki/.test(await p.$eval('#acctDlg .dmerr',x=>x.textContent)),`${nm} lühike parool`);
await p.fill('[name=password]','parool12345');await p.click('#acctDlg button[type=submit]');ok(/tingimuste/.test(await p.$eval('#acctDlg .dmerr',x=>x.textContent)),`${nm} tingimused nõutud`);
await p.check('[name=terms]');await p.click('#acctDlg button[type=submit]');
await p.waitForFunction(()=>/Aitäh/.test(document.getElementById('acT')?.textContent||''),null,{timeout:15000}).catch(()=>{});
const txt=await p.$eval('#acctDlg',x=>x.innerText);ok(/ootab nüüd meie kinnitust/.test(txt)&&/Kinnita oma e-post/.test(txt),`${nm} „Aitäh, saime sinu andmed, oota kinnitust“`,txt.slice(0,200));
if(nm==='desk')await p.screenshot({path:S+'acct-ok.png'});
await p.waitForTimeout(1500);
const cid=sql(`select company_id from profiles where email='${em}'`);ok(!!cid,`${nm} konto loodi`);
ok(sql(`select approved_at is null and approval_requested_at is not null from companies where id='${cid}'`)==='t',`${nm} konto ootab kinnitust`);
ok(sql(`select terms_version from profiles where email='${em}'`)==='2026-10-22',`${nm} tingimustega nõustumine salvestati`);
await p.$eval('#acctDlg .acok',x=>x.click());ok(await p.$('#acctDlg')===null,`${nm} sulgub`);
// „Proovi ise“ avab kohe konto loomise
await p.$eval('#vaba [data-go="dash"]',x=>x.click());await p.waitForTimeout(200);ok(/Loo konto/.test(await p.$eval('#acT',x=>x.textContent)),`${nm} „Proovi ise“ avab konto loomise`);
await p.keyboard.press('Escape');ok(!errs.length,`${nm} JS vigu pole`,errs);await ctx.close();}
const mm=(await log()).slice(m0).filter(m=>/Uus konto ootab kinnitust/.test(m[1].subject));
ok(mm.length===2,'Vaade3D sai 2 kirja uutest kontodest',mm.map(m=>m[1].subject));
const link=mm[0]&&(mm[0][1].html.match(/href="([^"]*#kinnita=[^"]+)"/)||[])[1];ok(!!link,'kirjas „Kinnita konto“ nupp',mm[0]&&mm[0][1].html.slice(0,300));
ok(mm[0]&&/Kalle Saunad/.test(mm[0][1].html)&&mm[0][1].reply_to==='uus.klient@firma.ee','kirjas firma, vastus kliendile');
const t=link.split('#kinnita=')[1];const r=await fetch(G+'/functions/v1/account',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'approve',t})});const j=await r.json();
ok(r.ok&&j.company==='Kalle Saunad OÜ'&&!j.already,'kinnituslink avab konto',j);
ok(sql(`select approved_at is not null from companies c join profiles p on p.company_id=c.id where p.email='uus.klient@firma.ee'`)==='t','andmebaasis kinnitatud');
// juba avatud konto: uut teavitust ei tule
const n1=(await log()).length;await fetch(G+'/functions/v1/demo-request',{method:'POST',headers:{'Content-Type':'application/json','cf-connecting-ip':'6.6.6.9'},body:JSON.stringify({name:'K',company:'K',email:'uus.klient@firma.ee',interest:['access'],consent:true})});
ok((await log()).length===n1,'avatud konto kohta kirja ei saadeta');
sql('update settings set require_approval=false');console.log('fails',fails);await b.close();
