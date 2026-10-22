// Täpsustööriistad: nurkade lohistamine, haakumine, Shift-nurk, nurk-nurgalt vabakuju, nooleklahvid, luup.
import { chromium } from 'playwright';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'});
let fails=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fails++;};
const p=await (await b.newContext({viewport:{width:1440,height:900}})).newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto('file:///home/claude/viimsi/t/local.html');await p.waitForTimeout(1500);
await p.evaluate(()=>{const s=document.getElementById('skipBtn');if(s&&!s.hidden)s.click();show('home');});await p.waitForTimeout(400);
await p.click('.tcard[data-t="vaba"]');await p.waitForTimeout(500);
await p.click('#stDemo');await p.waitForTimeout(400);await p.click('#stFiles [data-ed]');await p.waitForTimeout(600);
let box=await p.locator('#stImg').boundingBox();
const at=(fx,fy)=>[box.x+box.width*fx,box.y+box.height*fy];
const drag=async(a,c,mods)=>{await p.mouse.move(...at(...a));await p.mouse.down();for(let i=1;i<=6;i++)await p.mouse.move(...at(a[0]+(c[0]-a[0])*i/6,a[1]+(c[1]-a[1])*i/6));await p.mouse.up();await p.waitForTimeout(80);box=await p.locator('#stImg').boundingBox();};
const tool=async t=>{await p.click(`#stRail .sttool[data-tool="${t}"]`);await p.waitForTimeout(60);box=await p.locator('#stImg').boundingBox();};
const M=()=>p.evaluate(()=>JSON.parse(JSON.stringify(stSess().marks)));
// 1) ristkülik -> nurgad ilmuvad kohe, nurga lohistamine muudab ainult seda nurka
await tool('rect');await drag([.2,.2],[.4,.4]);
ok(await p.locator('#stSvg .hd').count()===4,'rect shows 4 corner handles right after drawing');
box=await p.locator('#stImg').boundingBox();const h2=await p.locator('#stSvg .hd[data-h="2"]').boundingBox();
await p.mouse.move(h2.x+h2.width/2,h2.y+h2.height/2);await p.mouse.down();
ok(await p.isVisible('#stLoupe'),'loupe visible while dragging a corner');
await p.mouse.move(...at(.5,.45),{steps:5});await p.mouse.up();await p.waitForTimeout(80);
let m=(await M())[0];ok(Math.abs(m.b[0]-.5)<.01&&Math.abs(m.b[1]-.45)<.01&&Math.abs(m.a[0]-.2)<.01,'corner drag resizes only that corner '+JSON.stringify(m.b));
ok(!(await p.isVisible('#stLoupe')),'loupe hides after drag');
await p.keyboard.press('Control+z');await p.waitForTimeout(60);m=(await M())[0];ok(Math.abs(m.b[0]-.4)<.01,'undo restores corner');
// 2) mõõt: ots haakub ristküliku nurgaga
await tool('ruler');await drag([.2,.6],[.4,.405]);await p.waitForTimeout(150);
if(await p.isVisible('#stScIn')){await p.fill('#stScIn','5');await p.keyboard.press('Enter');}
m=(await M()).find(x=>x.t==='ruler');ok(Math.abs(m.b[0]-.4)<.0005&&Math.abs(m.b[1]-.4)<.0005,'ruler end snaps to rect corner '+JSON.stringify(m.b));
// 3) Shift: sirge nurk
await tool('arrow');await p.mouse.move(...at(.6,.6));await p.mouse.down();await p.keyboard.down('Shift');await p.mouse.move(...at(.8,.615),{steps:6});await p.mouse.up();await p.keyboard.up('Shift');await p.waitForTimeout(60);
m=(await M()).find(x=>x.t==='arrow');ok(Math.abs(m.b[1]-m.a[1])<.002,'shift keeps arrow horizontal '+JSON.stringify([m.a,m.b]));
// arrow endpoint handle
ok(await p.locator('#stSvg .hd').count()===2,'arrow shows 2 end handles');
// 4) nurk-nurgalt vabakuju
await tool('lasso');const before=(await M()).length;
for(const q of [[.1,.7],[.25,.7],[.25,.9]]){await p.mouse.click(...at(...q));await p.waitForTimeout(60);}
ok(await p.evaluate(()=>STU.poly&&STU.poly.pts.length===3),'polygon mode collects clicked corners');
await p.mouse.click(...at(.1,.9));await p.waitForTimeout(60);await p.mouse.click(...at(.1,.7));await p.waitForTimeout(80);
let L=await M();m=L[L.length-1];ok(L.length===before+1&&m.t==='lasso'&&m.pts.length===4,'click on first corner closes polygon with 4 corners');
ok(await p.locator('#stSvg .hd').count()===4,'polygon corners are draggable handles');
// Esc tühistab pooliku
await p.mouse.click(...at(.5,.8));await p.waitForTimeout(40);await p.mouse.click(...at(.6,.8));await p.keyboard.press('Escape');await p.waitForTimeout(40);
ok(await p.evaluate(()=>!STU.poly)&&(await M()).length===before+1,'Esc cancels unfinished polygon');
// topeltklõps lõpetab
for(const q of [[.6,.2],[.7,.2]]){await p.mouse.click(...at(...q));await p.waitForTimeout(60);}await p.mouse.dblclick(...at(.7,.3));await p.waitForTimeout(80);
L=await M();ok(L.length===before+2&&L[L.length-1].pts.length===3,'double-click closes polygon');
// vabakäe kuju lihtsustatakse
await drag([.45,.55],[.55,.75]);L=await M();m=L[L.length-1];
ok(m.t==='lasso'&&m.pts.length<=10,'freehand lasso simplified to editable corners ('+m.pts.length+')');
// 5) nooleklahvid
await tool('select');const rb=await p.locator('#stSvg g.mk[data-mi="0"] rect').boundingBox();await p.mouse.click(rb.x+rb.width/2,rb.y+rb.height/2);await p.waitForTimeout(60);
const a0=(await M())[0].a[0];await p.keyboard.press('ArrowRight');await p.keyboard.press('Shift+ArrowRight');await p.waitForTimeout(60);
const nw=await p.evaluate(()=>STU.nat.w);ok(Math.abs(((await M())[0].a[0]-a0)*nw-11)<.01,'arrow keys nudge 1 px and Shift 10 px');
// liigutamine ei vii pildist välja
await p.mouse.move(rb.x+rb.width/2,rb.y+rb.height/2);await p.mouse.down();await p.mouse.move(box.x-300,box.y-300,{steps:5});await p.mouse.up();
m=(await M())[0];ok(m.a[0]>=0&&m.a[1]>=0,'move stays inside the picture');
ok(!errs.length,'no errors '+JSON.stringify(errs));
await p.screenshot({path:'prec.png'});
// telefon: puude suurem nurk
const q=await (await b.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true})).newPage();
await q.goto('file:///home/claude/viimsi/t/local.html');await q.waitForTimeout(1500);
await q.evaluate(()=>{const s=document.getElementById('skipBtn');if(s&&!s.hidden)s.click();show('home');});await q.waitForTimeout(300);
await q.click('.tcard[data-t="vaba"]');await q.waitForTimeout(400);await q.click('#stDemo');await q.waitForTimeout(300);await q.click('#stFiles [data-ed]');await q.waitForTimeout(500);
const r=await q.evaluate(()=>{const s=stSess();s.marks.push({t:'arrow',c:'#E5482D',a:[.2,.2],b:[.6,.6]});STU.tool='arrow';STU.sel=0;STU.touch=true;stRenderMarks();const h=document.querySelector('#stSvg .hd');return h.getBoundingClientRect().width;});
ok(r>=20,'touch handles are at least 20 px ('+Math.round(r)+')');
await b.close();console.log('fails',fails);
