import { chromium } from 'playwright';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'});
let fails=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fails++;};
for(const [nm,o] of [['desk',{viewport:{width:1300,height:900}}],['phone',{viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2}]]){
const ctx=await b.newContext(o);await ctx.route(/fonts\.googleapis|fonts\.gstatic|maaamet|ehr\.ee|supabase\.co/,r=>r.abort());
const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8767/test.html');await p.waitForTimeout(2500);
await p.click('#kindDlg #dKind button[data-k="firm"]').catch(()=>{});await p.waitForTimeout(300);
// Toode pildile
await p.evaluate(()=>{openPlace({mode:'widget',p:widgetPayload(),preview:true});const P=prodList();PS.sel=[];plToggle(P[0].id,true);delete PS.pins[P[0].id];PS.active=P[0].id;PS.photo=PLACE.park;plDraw();});await p.waitForTimeout(500);
const id=await p.evaluate(()=>PS.sel[0]);
let bb=await p.locator('#plPh').boundingBox();
const at=(fx,fy)=>[bb.x+bb.width*fx,bb.y+bb.height*fy];
const drag=async(a,c)=>{await p.mouse.move(...a);await p.mouse.down();for(let i=1;i<=8;i++)await p.mouse.move(a[0]+(c[0]-a[0])*i/8,a[1]+(c[1]-a[1])*i/8);await p.mouse.up();await p.waitForTimeout(250);bb=await p.locator('#plPh').boundingBox();};
await drag(at(.3,.5),at(.5,.75));
let pn=await p.evaluate(i=>PS.pins[i],id);ok(pn&&pn.area,nm+' area drawn '+JSON.stringify(pn));
let box=await p.locator('#plStage .plbox').boundingBox();
await drag([box.x+box.width/2,box.y+box.height/2],[box.x+box.width/2+bb.width*.1,box.y+box.height/2]);
let pn2=await p.evaluate(i=>PS.pins[i],id);ok(Math.abs((pn2.area[0]-pn.area[0])-10)<1.5&&Math.abs((pn2.area[2]-pn2.area[0])-(pn.area[2]-pn.area[0]))<.5,nm+' area moved keeping size '+JSON.stringify(pn2.area));
const c2=await p.locator('#plStage .plbox .mkc[data-c="2"]').boundingBox();
await drag([c2.x+c2.width/2,c2.y+c2.height/2],[c2.x+c2.width/2+bb.width*.1,c2.y+c2.height/2+bb.height*.05]);
let pn3=await p.evaluate(i=>PS.pins[i],id);ok(pn3.area[2]>pn2.area[2]+8&&pn3.area[3]>pn2.area[3]+3&&Math.abs(pn3.area[0]-pn2.area[0])<.5,nm+' corner resizes '+JSON.stringify(pn3.area));
await p.screenshot({path:'mke-place-'+nm+'.png'});
await p.click('#mkUndo');await p.waitForTimeout(200);let pu=await p.evaluate(i=>PS.pins[i],id);ok(JSON.stringify(pu.area)===JSON.stringify(pn2.area),nm+' undo restores previous');
await p.click('#mkUndo');await p.waitForTimeout(200);await p.click('#mkUndo');await p.waitForTimeout(200);ok(await p.evaluate(i=>!PS.pins[i],id),nm+' undo back to no mark');
await p.evaluate(()=>plClose());
// Vaba idee vidinas
await p.evaluate(()=>{acct.wFeat='house,idea';widgetView(widgetPayload(),{preview:true});});await p.waitForTimeout(500);
await p.click('#wSvcB [data-wsv="idea"]');await p.waitForTimeout(300);
const fc=p.waitForEvent('filechooser');await p.click('#wsxOne');await (await fc).setFiles('/home/claude/objekti-ai/examples/building-1.webp');await p.waitForTimeout(900);
ok(await p.isVisible('#wsxPh'),nm+' idea photo shown with marking');
let ib=await p.locator('#wsxPh').boundingBox();
const iat=(fx,fy)=>[ib.x+ib.width*fx,ib.y+ib.height*fy];
await p.mouse.move(...iat(.2,.4));await p.mouse.down();for(let i=1;i<=8;i++)await p.mouse.move(...iat(.2+.3*i/8,.4+.3*i/8));await p.mouse.up();await p.waitForTimeout(300);
let wm=await p.evaluate(()=>window.__wm=null);
const mk=await p.evaluate(()=>{const e=document.querySelector('#wsxMk .plbox');return !!e;});ok(mk,nm+' idea area drawn');
ok(await p.isVisible('#wsxUndo'),nm+' idea undo shown');
await p.screenshot({path:'mke-idea-'+nm+'.png'});
await p.click('#wsxUndo');await p.waitForTimeout(200);ok(!(await p.evaluate(()=>!!document.querySelector('#wsxMk .plbox'))),nm+' idea undo removes mark');
ok(!errs.length,nm+' no errors '+JSON.stringify(errs));await ctx.close();}
await b.close();console.log('fails',fails);
