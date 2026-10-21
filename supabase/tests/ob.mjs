import { chromium } from 'playwright';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
let F=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)F++;};
for (const [w,h,n] of [[1440,900,'d'],[1100,800,'t'],[390,844,'m']]){
const p=await (await b.newContext({viewport:{width:w,height:h}})).newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message+' '+String(e.stack).split('\n')[1]));
await p.goto('file:///home/claude/viimsi/t/local.html');await p.waitForTimeout(1800);
await p.evaluate(()=>{const s=document.getElementById('skipBtn');if(s&&!s.hidden)s.click();acct.fbDone=1;});await p.waitForTimeout(500);
await p.evaluate(()=>{show('app');select(0);});await p.waitForTimeout(1200);
ok(await p.evaluate(()=>document.querySelectorAll('#obRail .sttool').length>=10&&getComputedStyle(document.getElementById('obRail')).display!=='none'),n+' rail in 3D view');
await p.screenshot({path:`ob1-${n}.png`});
await p.click('#obRail [data-tool="ruler"]');ok(await p.evaluate(()=>mMode==='dist'&&document.querySelector('#obRail [data-tool="ruler"]').getAttribute('aria-pressed')==='true'),n+' ruler -> measure distance');
await p.click('#obRail [data-tool="area"]');ok(await p.evaluate(()=>mMode==='area'),n+' area measure');
await p.click('#obRail [data-tool="hand"]');ok(await p.evaluate(()=>!mMode&&controls.mouseButtons.LEFT===THREE.MOUSE.PAN),n+' hand pans');
await p.click('#obRail [data-tool="select"]');ok(await p.evaluate(()=>controls.mouseButtons.LEFT===THREE.MOUSE.ROTATE),n+' select rotates');
await p.click('#obRail [data-tool="eye"]');ok(await p.evaluate(()=>document.getElementById('dimBtn').getAttribute('aria-pressed')==='false'),n+' eye hides dims');await p.click('#obRail [data-tool="eye"]');
await p.click('#obPick');ok(await p.evaluate(()=>!document.getElementById('obMenu').hidden&&document.querySelectorAll('#obMenu [data-i]').length>=1),n+' objects menu');await p.keyboard.press('Escape');await p.mouse.click(5,h-5);
await p.click('#obRail [data-tool="rect"]');await p.waitForTimeout(900);
const r=await p.evaluate(()=>({studio:!document.getElementById('studio').hidden,base:!!(stSess()&&stSess().base&&stSess().base.length>10000),obj:stSess()&&stSess().obj,tool:STU.tool,back:!document.getElementById('stTo3d').hidden}));
ok(r.studio&&r.base&&r.obj&&r.tool==='rect'&&r.back,n+' rect snaps 3D view into editor '+JSON.stringify(r));
await p.screenshot({path:`ob2-${n}.png`});
await p.click('#stTo3d');await p.waitForTimeout(500);ok(await p.evaluate(()=>!document.getElementById('body').hidden),n+' back to 3D');
ok(!errs.length,n+' no errors '+JSON.stringify(errs));await p.close();}
console.log('fails',F);await b.close();
