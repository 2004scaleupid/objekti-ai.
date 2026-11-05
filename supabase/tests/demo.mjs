import { chromium } from 'playwright';
const S='/tmp/claude-0/-home-claude/cfb7a3a4-3672-5bf5-b816-02763484350f/scratchpad/';const N=S+'npm3/';
const G='http://127.0.0.1:54321';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',args:['--use-gl=angle','--use-angle=swiftshader']});
let fails=0;const ok=(c,t,x)=>{console.log(c?'PASS':'FAIL',t,c?'':JSON.stringify(x||'').slice(0,300));if(!c)fails++;};
for(const [nm,o] of [['desk',{viewport:{width:1440,height:900}}],['phone',{viewport:{width:390,height:844},isMobile:true,deviceScaleFactor:2}]]){
const ctx=await b.newContext({...o,reducedMotion:'reduce'});await ctx.route(/fonts\./,r=>r.abort());
await ctx.route(/cdn\.jsdelivr\.net\/npm\/three@0\.170\.0\/(.*)$/,r=>{const m=r.request().url().match(/three@0\.170\.0\/(.*)$/);r.fulfill({path:N+'package/'+m[1],contentType:'text/javascript'});});
// supabase: functions -> kohalik värav, muu katki
await ctx.route(/supabase\.co/,async r=>{const q=r.request(),u=new URL(q.url());if(!u.pathname.startsWith('/functions/v1/demo-request'))return r.abort();
  if(q.method()==='OPTIONS')return r.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'POST'}});
  const h={...q.headers()};delete h.host;h['cf-connecting-ip']='7.7.7.'+(nm==='desk'?1:2);
  const res=await fetch(G+u.pathname,{method:'POST',headers:h,body:q.postData()});r.fulfill({status:res.status,headers:{'content-type':'application/json','access-control-allow-origin':'*'},body:await res.text()});});
const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8771/');await p.waitForTimeout(1500);
const n=await p.$$eval('a[href^="mailto:info@vaade3d.ee?subject="]',a=>a.length);ok(n>=4,`${nm} demo lingid olemas (${n})`);
await p.$eval('.acts a.btn.red',a=>a.click());await p.waitForTimeout(400);
ok(await p.$('#demoDlg')!==null,`${nm} „Broneeri demo“ avab vormi`);
ok(await p.$eval('#demoDlg [value=demo]',i=>i.checked),`${nm} demo eelvalitud`);
await p.click('#demoDlg button[type=submit]');ok(/nimi ja ettevõte/.test(await p.$eval('.dmerr',e=>e.textContent)),`${nm} tühja vormi viga`);
await p.fill('[name=name]','Mari Test');await p.fill('[name=company]','Telgid OÜ');await p.fill('[name=email]','mari@telgid.ee');await p.fill('[name=phone]','+372 5555 5555');await p.fill('[name=website]','telgid.ee');
await p.selectOption('[name=niche]','Rent ja üritused');await p.check('[name=interest][value=widget]');await p.fill('[name=message]','Tahame <b>vidinat</b> kodulehele.');
await p.click('#demoDlg button[type=submit]');ok(/ühendust/.test(await p.$eval('.dmerr',e=>e.textContent)),`${nm} nõusolek nõutud`);
if(nm==='desk')await p.screenshot({path:S+'demo-form.png'});
await p.check('[name=consent]');await p.click('#demoDlg button[type=submit]');
await p.waitForFunction(()=>/Aitäh/.test(document.getElementById('demoDlg')?.innerText||''),null,{timeout:15000}).catch(()=>{});
ok(/Aitäh, Mari/.test(await p.$eval('#demoDlg',e=>e.innerText)),`${nm} saadetud: aitäh-teade`);
if(nm==='desk')await p.screenshot({path:S+'demo-ok.png'});
await p.click('.dmclose');ok(await p.$('#demoDlg')===null,`${nm} sulgub`);
// Küsi pakkumist eelvalib pakkumise
await p.$eval('#koostoo a.btn.red',a=>a.click());await p.waitForTimeout(300);ok(await p.$eval('#demoDlg [value=offer]',i=>i.checked),`${nm} „Küsi pakkumist“ eelvalib hinnapakkumise`);
await p.keyboard.press('Escape');ok(await p.$('#demoDlg')===null,`${nm} Esc sulgeb`);
ok(!errs.length,`${nm} JS vigu pole`,errs);await ctx.close();}
// server
const log=(await (await fetch(G+'/_log')).json()).filter(x=>x[0]==='mail'&&/Demo päring/.test(x[1].subject));
ok(log.length===2,'Vaade3D sai 2 kirja',log.length);const m=log[0]&&log[0][1];
ok(m&&m.to.includes('info@vaade3d.ee')&&m.reply_to==='mari@telgid.ee','kiri info@-le, vastus kliendile',m&&[m.to,m.reply_to]);
ok(m&&/Telgid OÜ/.test(m.html)&&/Vidin kodulehele/.test(m.html)&&/&lt;b&gt;vidinat/.test(m.html),'kirjas andmed, HTML on varjestatud');
const api=async(bd,ip)=>{const r=await fetch(G+'/functions/v1/demo-request',{method:'POST',headers:{'Content-Type':'application/json','cf-connecting-ip':ip},body:JSON.stringify(bd)});return [r.status,await r.json().catch(()=>({}))];};
const base={name:'A',company:'B',email:'a@b.ee',consent:true};
ok((await api({...base,consent:false},'8.8.8.1'))[0]===400,'ilma nõusolekuta 400');
ok((await api({...base,email:'vale'},'8.8.8.1'))[0]===400,'vale e-post 400');
const hp=await api({...base,hp:'bot'},'8.8.8.1');ok(hp[0]===200,'robot (honeypot) saab ok, aga');
let last;for(let i=0;i<6;i++)last=await api(base,'8.8.8.9');ok(last[0]===429,'IP piirang (6. päring 429)',last);
const fs=await import('child_process');const cnt=fs.execFileSync('psql',['-h','/var/tmp/v3dpg','-p','5499','-U','postgres','-d','v3d','-tAq','-c',"select count(*) from demo_requests where name='A'"],{encoding:'utf8'}).trim();
ok(cnt==='5','honeypot ei salvestunud, 5 päringut salvestus',cnt);
console.log('fails',fails);await b.close();
