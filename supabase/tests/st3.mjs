import { chromium } from 'playwright';import fs from 'fs';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'});
let F=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)F++;};
for (const [w,h,n] of [[1440,900,'d'],[390,844,'m']]){
const p=await (await b.newContext({viewport:{width:w,height:h}})).newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message+' '+String(e.stack).split('\n')[1]));
await p.goto('file:///home/claude/viimsi/t/local.html');await p.waitForTimeout(1500);
await p.evaluate(()=>{const s=document.getElementById('skipBtn');if(s&&!s.hidden)s.click();acct.fbDone=1;});await p.waitForTimeout(400);
await p.evaluate(()=>{show('home');openStudio('vaba');});await p.waitForTimeout(300);
const E=f=>p.evaluate(f);
await p.setInputFiles('#stFile',[{name:'a.png',mimeType:'image/png',buffer:fs.readFileSync('a.png')},{name:'b.png',mimeType:'image/png',buffer:fs.readFileSync('b.png')}]);for(let i=0;i<40;i++){if(await E(()=>stSess()&&stSess().tray.length===2))break;await p.waitForTimeout(250);}await p.waitForTimeout(300);
let r=await E(()=>({tray:stSess().tray.length,fresh:document.getElementById('studio').classList.contains('fresh'),stage:!document.getElementById('stStage').hidden,nums:[...document.querySelectorAll('#stFiles .no')].map(x=>x.textContent).join(',')}));
ok(r.tray===2&&r.fresh&&!r.stage&&r.nums==='1,2',n+' 2 pictures numbered in chat box, no editor jump '+JSON.stringify(r));
await p.screenshot({path:`s3-1-${n}.png`});
await p.click('#stFiles [data-ed]');await p.waitForTimeout(700);
ok(await E(()=>!document.getElementById('stStage').hidden&&STU.edit===stSess().tray[0]&&document.getElementById('stEdT').textContent==='Pilt 1'),n+' click picture opens editor for pilt 1');
await E(()=>{const r=document.getElementById('stView').getBoundingClientRect();scrollBy(0,r.top-60);});await p.waitForTimeout(300);
await p.click('#stRail .sttool[data-tool="rect"]');let box=await p.locator('#stImg').boundingBox();
const at=(fx,fy)=>[box.x+box.width*fx,box.y+box.height*fy];
await p.mouse.move(...at(.2,.2));await p.mouse.down();for(let i=1;i<=5;i++)await p.mouse.move(...at(.2+.06*i,.2+.03*i));await p.mouse.up();await p.waitForTimeout(150);
ok(await E(()=>stSess().marks.length===1&&document.getElementById('stMk').textContent.includes('pildil 1 ala 1')),n+' mark + chip "pildil 1 ala 1"');
await p.screenshot({path:`s3-2-${n}.png`});
await p.click('#stEdDone');await p.waitForTimeout(300);
r=await E(()=>({stage:!document.getElementById('stStage').hidden,lbl:document.querySelector('#stFiles .stf .bl').textContent,marks:stSess().imgs[stSess().tray[0]].marks.length}));
ok(!r.stage&&r.lbl.includes('1 märk')&&r.marks===1,n+' done: marks kept on pilt 1 '+JSON.stringify(r));
await p.fill('#stIn','Pane pildil 1 alale 1 päikesepaneelid nagu pildil 2');
ok(await E(()=>!document.getElementById('stGenBtn').disabled&&!document.getElementById('stSend').disabled),n+' Genereeri and chat both enabled');
await p.press('#stIn','Enter');for(let i=0;i<30;i++){if(await E(()=>!!document.querySelector('[data-juh]')))break;await p.waitForTimeout(200);}
r=await E(()=>({thread:!document.getElementById('stThread').hidden,juh:!!document.querySelector('[data-juh]'),cr:acct.credits,msgs:stSess().msgs.length}));
ok(r.thread&&r.juh&&r.msgs===2&&r.cr===30,n+' Enter = chat reply with suggestion, no credits '+JSON.stringify(r));
await p.click('[data-juh]');ok(await E(()=>document.getElementById('stIn').value.length>5),n+' "Kasuta seda" fills input');
const pr=await E(async()=>{const s=stSess(),T=stTrayImgs(s);const c=await stComposite2(T[0]);return {c:c?c.length:0,txt:stMarksText({marks:T[0].marks,scale:T[0].scale,nat:T[0].nat}),p:stPrompt2({kind:'design',T:tplById('vaba'),text:'x',style:'Fotorealistlik',roles:['Image 1 is the user\'s picture 1 ("pilt 1").','Image 2 is picture 1 with...','Image 3 is the user\'s picture 2 ("pilt 2").'],legend:['Markings on picture 1:\n- a'],prods:[],npics:2})};});
ok(pr.c>3000&&/Area 1/.test(pr.txt)&&/picture 1/.test(pr.p)&&/"pilt 1"/.test(pr.p),n+' composite + numbered prompt');
await p.screenshot({path:`s3-3-${n}.png`});
await p.click('#stGenBtn');await p.waitForTimeout(300);
ok(await E(()=>!!document.querySelector('#stThread .stph')),n+' generating shows in thread');
await p.waitForTimeout(2200);
r=await E(()=>{const s=stSess();return {cr:acct.credits,t0k:s.imgs[s.tray[0]].k,tray:s.tray.length,out:!!document.querySelector('#stThread .stv img'),res:document.getElementById('stRes').textContent,u:s.msgs.filter(m=>m.gen).length};});
ok(r.cr===28&&r.t0k==='ai'&&r.tray===2&&r.out&&r.res.includes('−2 krediiti')&&r.u===2,n+' generated: result is pilt 1, credits −2 '+JSON.stringify(r));
await p.screenshot({path:`s3-4-${n}.png`});
ok(await E(()=>!document.querySelector('#stThread .stv.sel [data-add]')),n+' current pilt 1 has no add button');
await p.click('#stThread [data-mk]');await p.waitForTimeout(400);ok(await E(()=>STU.edit!=null&&!document.getElementById('stStage').hidden),n+' Märgi opens editor on result');
await p.click('#stEdDone');
// tool click outside editor opens editor
await p.click('#stRail .sttool[data-tool="brush"]');await p.waitForTimeout(300);ok(await E(()=>STU.edit===stSess().tray[0]&&STU.tool==='brush'),n+' rail tool opens editor on pilt 1');await p.click('#stEdDone');
// remove picture
const t0=await E(()=>stSess().tray.length);await p.click('#stFiles [data-x="1"]');ok(await p.evaluate(t=>stSess().tray.length===t-1,t0),n+' remove picture');
// text only picture
await p.click('#stNew2');await p.waitForTimeout(200);await p.fill('#stIn','Moodne puitmaja männimetsas');ok(await E(()=>stKind()==='pic'&&!document.getElementById('stGenBtn').disabled),n+' text only -> pic');
await p.click('.stchip[data-t="maakler"]');await p.waitForTimeout(200);ok(await E(()=>document.getElementById('stGenBtn').hidden&&stKind()==='addr'),n+' address work hides Genereeri');
ok(!errs.length,n+' no errors '+JSON.stringify(errs));await p.close();}
console.log('fails',F);await b.close();
