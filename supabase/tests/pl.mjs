import { chromium } from 'playwright';import fs from 'fs';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'});
let F=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)F++;};
for(const [w,h,n] of [[1440,900,'d'],[390,844,'m']]){
const p=await (await b.newContext({viewport:{width:w,height:h}})).newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message+' '+String(e.stack).split('\n')[1]));
await p.goto('file:///home/claude/viimsi/t/local.html');await p.waitForTimeout(1500);
await p.evaluate(()=>{const s=document.getElementById('skipBtn');if(s&&!s.hidden)s.click();acct.fbDone=1;
  acct.products=[{id:'p1',name:'Peotelk 6×12',cat:'Telgid',imgs:[PLACE.tent],W:6,L:12,H:4,price:'290 €',pl:'ground'},{id:'p2',name:'Päikesepaneelid',cat:'Energia',imgs:[PLACE.tent],pl:'roof'},{id:'p3',name:'Saun',cat:'Saunad',imgs:[PLACE.tent],W:3,L:4,pl:'ground'}];acct.wPl={mode:'instant',max_products:2,lead_first:true,show_price:true};save();show('settings','widget');});
await p.waitForTimeout(500);
ok(await p.evaluate(()=>!!document.getElementById('wPlCard')&&document.getElementById('wPlMax').value==='2'&&document.querySelector('#wPlMode [data-v="instant"]').getAttribute('aria-pressed')==='true'),n+' settings card rendered from acct.wPl');
await p.screenshot({path:`pl-set-${n}.png`,fullPage:false});
await p.selectOption('#wPlLang','et');await p.click('#wPlTry');await p.waitForTimeout(400);
ok(await p.evaluate(()=>!document.getElementById('place').hidden&&PS.cfg.max===2&&PS.cfg.lead_first),n+' "Proovi nagu klient" opens widget preview');
await p.click('.plpc[data-pp="p1"]');await p.click('.plpc[data-pp="p2"]');await p.click('.plpc[data-pp="p3"]');
ok(await p.evaluate(()=>PS.sel.join()==='p1,p2'),n+' max 2 products enforced');
ok(await p.evaluate(()=>PS.pins.p2&&PS.pins.p2.auto===true&&!PS.pins.p1),n+' roof product defaults to AI chooses');
ok(await p.evaluate(()=>document.querySelector('.pltips').textContent.includes('katus')),n+' tips adapt to roof');
await p.screenshot({path:`pl-1-${n}.png`});
await p.setInputFiles('#plFile',{name:'maja.jpg',mimeType:'image/jpeg',buffer:fs.readFileSync('maja.jpg')});await p.waitForTimeout(900);
ok(await p.evaluate(()=>!!PS.photo&&PS.active==='p1'),n+' photo set, product 1 waiting for tap');
const bb=await p.locator('#plPh').boundingBox();await p.mouse.click(bb.x+bb.width*.3,bb.y+bb.height*.7);await p.waitForTimeout(200);
ok(await p.evaluate(()=>PS.pins.p1&&Math.abs(PS.pins.p1.x-30)<3&&plReady()),n+' tap places pin 1, ready');
ok(await p.evaluate(()=>!!document.getElementById('plN')&&!!document.querySelector('.plpin em')),n+' lead form shown before image, numbered pin');
await p.screenshot({path:`pl-2-${n}.png`});
await p.click('#plGo');await p.waitForTimeout(300);ok(await p.evaluate(()=>!PS.res),n+' empty lead blocks');
await p.fill('#plN','Kati Klient');await p.fill('#plE','kati@gmail.com');await p.fill('#plA','Kase 1, Viimsi');await p.click('#plGo');await p.waitForTimeout(2600);
ok(await p.evaluate(()=>PS.res==='sketch'&&!!PS.lead&&document.querySelectorAll('.plsk').length===2),n+' result with 2 products (demo sketch)');
await p.screenshot({path:`pl-3-${n}.png`});
ok(await p.evaluate(()=>document.getElementById('plPanel').textContent.includes('Aitäh')),n+' thanks after lead-first result');
// review mode in preview
await p.evaluate(()=>{plClose();acct.wPl={mode:'review',max_products:3,lead_first:true,lang:'en'};save();openPlace({mode:'widget',preview:true,p:{...widgetPayload(),pl:acct.wPl}});});await p.waitForTimeout(300);
ok(await p.evaluate(()=>document.getElementById('plPanel').textContent.includes('Choose products')),n+' English widget');
await p.evaluate(()=>{plClose();openPlace({mode:'firm',prod:'p3'});});await p.waitForTimeout(300);
ok(await p.evaluate(()=>PS.sel.join()==='p3'&&PS.cfg.max===3&&!PS.cfg.lead_first&&!document.getElementById('plN')),n+' firm mode: no lead form, up to 3');
await p.evaluate(()=>{plClose();show('settings','products');});await p.waitForTimeout(300);
ok(await p.evaluate(()=>document.getElementById('prGrid').textContent.includes('Katus')),n+' products show placement');
ok(!errs.length,n+' no errors '+JSON.stringify(errs));await p.close();}
console.log('fails',F);await b.close();
