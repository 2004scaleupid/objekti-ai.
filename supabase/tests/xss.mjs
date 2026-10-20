import { chromium } from 'playwright';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'});
const ctx=await b.newContext({viewport:{width:1280,height:900}});const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('dialog',d=>{errs.push('DIALOG '+d.message());d.dismiss();});
const base='file://'+process.cwd()+'/local.html';
const X='x" onerror="window.__pwn=(window.__pwn||[]).concat(\'IMG\')" a="';
const b64e=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const res=[];const chk=async(name)=>{const v=await p.evaluate(()=>window.__pwn||null);res.push([name,v?'HAAVATAV '+JSON.stringify(v):'ok']);};
// 1) võltsitud vidina link
await p.goto(base+'#w='+b64e({v:1,c:'<img src=x onerror=window.__pwn=1>',lg:X,f:'both',st:'classic',t:'<b>x</b>',p:'"><img src=x onerror=window.__pwn=2>',w:'javascript:window.__pwn=3',sv:['<img src=x onerror=window.__pwn=4>']}));await p.waitForTimeout(2500);await chk('võltsitud #w= link');
await p.evaluate(()=>{document.getElementById('wIn').value='Kibuvitsa tee 9';document.getElementById('wForm').requestSubmit();});await p.waitForTimeout(1500);await chk('võltsitud link + maja vaade');
await p.evaluate(()=>{const a=[...document.querySelectorAll('.cvfirm a')];a.forEach(x=>{if(/^javascript:/i.test(x.getAttribute('href')))x.click();});});await chk('firma veebilingi klikk');
// 2) pahatahtlikud päringud firma töölaual
await p.goto(base);await p.waitForTimeout(2000);
await p.evaluate((X)=>{localStorage.setItem('v3d_leads',JSON.stringify([{d:new Date().toISOString(),st:'new',n:'<img src=x onerror=window.__pwn=5>',m:'"><img src=x onerror=window.__pwn=6>',a:'<img src=x onerror=window.__pwn=7>, Viimsi',sv:['<img src=x onerror=window.__pwn=8>'],prod:'<svg onload=window.__pwn=9>',date:'<img src=x onerror=window.__pwn=10>',img:X,fp:'<img src=x onerror=window.__pwn=11>',roof:'<img src=x onerror=window.__pwn=12>',wall:1,e:'1"><img src=x onerror=window.__pwn=13>'}]));},X);
await p.reload();await p.waitForTimeout(2500);
await p.evaluate(()=>{const f=document.getElementById('fbw');if(f)f.hidden=true;renderBell(true);renderHomeLeads();show('settings','widget');renderWidgetPane();});await p.waitForTimeout(500);await chk('päringud: kelluke, avaleht, nimekiri');
await p.evaluate(()=>{showLeadMail(leadsForUi().L[0]);});await p.waitForTimeout(500);await chk('päringu e-kirja eelvaade');
// 3) pahatahtlik toode
await p.evaluate((X)=>{document.getElementById('dNo').click();acct.products=[{id:'p1',name:'<img src=x onerror=window.__pwn=14>',cat:'<img src=x onerror=window.__pwn=15>',imgs:[X],W:6,L:12,link:'javascript:window.__pwn=16',desc:'<img src=x onerror=window.__pwn=17>'}];save();show('settings','products');openPlace({mode:'firm'});},X);await p.waitForTimeout(800);
await p.evaluate(()=>{document.querySelectorAll('#plPanel a').forEach(a=>{if(/^javascript:/i.test(a.getAttribute('href')||''))a.click();});});await chk('pahatahtlik toode (pilt, link, nimi)');
await p.evaluate((X)=>{document.body.insertAdjacentHTML('beforeend','<img src="'+X+'">');},X);await p.waitForTimeout(300);await chk('KONTROLL: tahtlikult haavatav (peab olema HAAVATAV)');console.log(JSON.stringify(res,null,1));console.log('errors',JSON.stringify(errs.slice(0,5)));await b.close();
