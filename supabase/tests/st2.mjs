import { chromium } from 'playwright';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'});
let fails=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fails++;};
for (const [w,h,n] of [[1440,900,'d'],[390,844,'m']]){
const p=await (await b.newContext({viewport:{width:w,height:h}})).newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error')errs.push('console:'+m.text())});
await p.goto('file:///home/claude/viimsi/t/local.html');await p.waitForTimeout(1500);
await p.evaluate(()=>{const s=document.getElementById('skipBtn');if(s&&!s.hidden)s.click();});await p.waitForTimeout(600);
await p.evaluate(()=>show('home'));await p.waitForTimeout(400);
await p.click('.tcard[data-t="vaba"]');await p.waitForTimeout(600);
await p.screenshot({path:`v2-1-${n}.png`});
ok(await p.evaluate(()=>document.getElementById('studio').classList.contains('fresh')),n+' fresh on open');
await p.click('#stDemo');await p.waitForTimeout(500);await p.click('#stFiles [data-ed]');await p.waitForTimeout(700);
ok(await p.evaluate(()=>!document.getElementById('stStage').hidden&&!!STU.nat),n+' stage shows demo image');
await p.screenshot({path:`v2-2-${n}.png`});
await p.evaluate(()=>{const r=document.getElementById('stView').getBoundingClientRect();scrollBy(0,r.top-60);});await p.waitForTimeout(400);let box=await p.locator('#stImg').boundingBox();
const at=(fx,fy)=>[box.x+box.width*fx,box.y+box.height*fy];
const drag=async(a,b2)=>{await p.mouse.move(...at(...a));await p.mouse.down();for(let i=1;i<=6;i++){await p.mouse.move(at(a[0]+(b2[0]-a[0])*i/6,a[1]+(b2[1]-a[1])*i/6)[0],at(a[0]+(b2[0]-a[0])*i/6,a[1]+(b2[1]-a[1])*i/6)[1]);}await p.mouse.up();await p.waitForTimeout(120);};
const tool=async t=>{await p.click(`#stRail .sttool[data-tool="${t}"]`);await p.waitForTimeout(80);box=await p.locator('#stImg').boundingBox();};
await tool('rect');await drag([.2,.15],[.6,.35]);
ok(await p.evaluate(()=>stSess().marks.length===1&&stSess().marks[0].t==='rect'),n+' rect mark drawn');
ok(await p.evaluate(()=>!document.getElementById('stMk').hidden&&document.getElementById('stMk').textContent.includes('ala 1')),n+' mark chip ala 1');
await tool('point');await p.mouse.click(...at(.1,.8));await p.mouse.click(...at(.8,.85));await p.waitForTimeout(100);
ok(await p.evaluate(()=>stLabels(stSess().marks).join(',')==='1,A,B'),n+' points A and B');
ok(await p.evaluate(()=>[...document.querySelectorAll('#stSugg .stsug')].some(b=>b.textContent.includes('punktist A punkti B'))),n+' contextual suggestion A→B');
await tool('brush');await drag([.7,.5],[.9,.6]);
ok(await p.evaluate(()=>stSess().marks.length===4&&stLabels(stSess().marks)[3]==='2'),n+' brush area 2');
await p.keyboard.press('Control+z');await p.waitForTimeout(80);
ok(await p.evaluate(()=>stSess().marks.length===3),n+' undo');
await p.keyboard.press('Control+Shift+z');await p.waitForTimeout(80);
ok(await p.evaluate(()=>stSess().marks.length===4),n+' redo');
await tool('ruler');await drag([.3,.6],[.5,.6]);await p.waitForTimeout(150);
ok(await p.isVisible('#stScIn'),n+' scale popup');
await p.fill('#stScIn','4');await p.keyboard.press('Enter');await p.waitForTimeout(120);
ok(await p.evaluate(()=>!!stSess().scale&&document.getElementById('stSvg').textContent.includes('4,00 m')),n+' ruler shows 4,00 m');
await drag([.3,.7],[.4,.7]);
ok(await p.evaluate(()=>document.getElementById('stSvg').textContent.includes('2,00 m')),n+' second ruler 2,00 m');
await tool('prod');await drag([.55,.65],[.75,.9]);await p.waitForTimeout(150);
ok(await p.isVisible('.stpop .pi[data-p]'),n+' product popup');
await p.click('.stpop .pi[data-p]');await p.waitForTimeout(120);
ok(await p.evaluate(()=>stSess().marks.some(m=>m.t==='prod'&&m.pid)),n+' product mark with product');
ok(await p.evaluate(()=>stKind()==='place'),n+' kind place when product marked');
await tool('text');await p.mouse.click(...at(.45,.1));await p.waitForTimeout(100);await p.fill('#stTxtIn','uus aken');await p.keyboard.press('Enter');await p.waitForTimeout(100);
ok(await p.evaluate(()=>stSess().marks.some(m=>m.t==='text'&&m.s==='uus aken')),n+' text label');
await tool('erase');const cnt=await p.evaluate(()=>stSess().marks.length);
const tb=await p.locator('#stSvg g.mk[data-mi="0"] rect').boundingBox();await p.mouse.click(tb.x+tb.width/2,tb.y+tb.height/2);await p.waitForTimeout(100);
ok(await p.evaluate(c=>stSess().marks.length===c-1,cnt),n+' eraser removes');
await p.keyboard.press('Control+z');await p.waitForTimeout(80);
// zoom
const z0=await p.evaluate(()=>STU.z);await p.click('#stZi');ok(await p.evaluate(z=>STU.z>z,z0),n+' zoom in');await p.click('#stZf');
// eye
await tool('eye');ok(await p.evaluate(()=>document.getElementById('stCanvas').classList.contains('hidemk')),n+' hide marks');await tool('eye');
await p.screenshot({path:`v2-3-${n}.png`});
// prompt + composite
const pr=await p.evaluate(async()=>{const s=stSess();const c=await stComposite(s);return {c:c?c.length:0,txt:stMarksText(s),pr:stPrompt2({kind:'place',T:tplById('vaba'),text:'pane toode 1 märgitud kohta',style:'Fotorealistlik',roles:['Image 2 is X'],s,prods:stProdRefs('',s)})};});
ok(pr.c>5000,n+' composite image built ('+pr.c+')');ok(/Area 1/.test(pr.txt)&&/Point A/.test(pr.txt)&&/Point B/.test(pr.txt)&&/Product box for product 1/.test(pr.txt)&&/2\.00 m/.test(pr.txt),n+' marks legend text');
if(n==='d')console.log(pr.pr);
await p.click('#stIn');await p.click('#stMk button:first-of-type');
ok(await p.evaluate(()=>document.getElementById('stIn').value.includes('ala 1')),n+' chip inserts ala 1');
await p.click('#stEdDone');
// jobs menu + new
await p.click('#stNew2');await p.waitForTimeout(200);ok(await p.evaluate(()=>document.getElementById('studio').classList.contains('fresh')),n+' new job fresh');
await p.click('.stchip[data-t="toodehoov"]');await p.waitForTimeout(200);await p.screenshot({path:`v2-6-${n}.png`});
await p.click('.stchip[data-t="maakler"]');await p.waitForTimeout(200);await p.fill('#stIn','Silva');await p.waitForTimeout(400);
ok(await p.evaluate(()=>stKind()==='addr'),n+' addr kind');
await p.click('#stJobs');await p.waitForTimeout(100);ok(await p.evaluate(()=>document.querySelectorAll('#stJobsM [data-s]').length>=1),n+' jobs menu lists');
await p.click('#stJobsM [data-s]');await p.waitForTimeout(400);ok(await p.evaluate(()=>stSess().tray.length>=1&&stSess().imgs[stSess().tray[0]].marks.length>=5),n+' reopen job keeps pictures and marks');
await p.click('#stHome');await p.waitForTimeout(200);ok(await p.evaluate(()=>!document.getElementById('home').hidden),n+' back home');
errs.splice(0,errs.length,...errs.filter(e=>!/ERR_TUNNEL|Failed to load resource/.test(e)));ok(!errs.length,n+' no errors '+JSON.stringify(errs));}
await b.close();console.log('fails',fails);
