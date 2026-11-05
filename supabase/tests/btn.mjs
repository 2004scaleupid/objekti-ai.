import { chromium } from 'playwright';
const N='/tmp/claude-0/-home-claude/cfb7a3a4-3672-5bf5-b816-02763484350f/scratchpad/npm3/';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',args:['--use-gl=angle','--use-angle=swiftshader']});
let fails=0;const ok=(c,m,x)=>{console.log((c?'PASS ':'FAIL ')+m,c?'':JSON.stringify(x));if(!c)fails++;};
for(const [nm,vp] of [['desk',{width:1440,height:900}],['phone',{width:390,height:844}]]){
const ctx=await b.newContext({viewport:vp,reducedMotion:'reduce',isMobile:nm==='phone',hasTouch:nm==='phone'});
await ctx.route(/fonts\.(googleapis|gstatic)|supabase\.co/,r=>r.abort());
await ctx.route(/cdn\.jsdelivr\.net\/npm\/three@0\.170\.0\/(.*)$/,r=>{const m=r.request().url().match(/three@0\.170\.0\/(.*)$/);r.fulfill({path:N+'package/'+m[1],contentType:'text/javascript'});});
let appHits=0;await ctx.route(/app\.vaade3d\.ee/,r=>{appHits++;r.fulfill({body:'<h1>app</h1>',contentType:'text/html'});});
const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
const home=async()=>{await p.goto('http://localhost:8771/?avaleht');await p.waitForTimeout(1200);};
await home();
const inView=async id=>{for(let k=0;k<40;k++){const v=await p.evaluate(id=>{const r=document.getElementById(id).getBoundingClientRect();return r.top<innerHeight*0.75&&r.bottom>0;},id);if(v)return true;await p.waitForTimeout(150);}return false;};
// header nav (desktop only visible)
if(nm==='desk'){for(const to of ['planeerija','kellele','voimalused','koostoo','kkk']){await p.evaluate(()=>scrollTo({top:0,behavior:'instant'}));await p.click(`.topnav [data-to="${to}"]`);ok(await inView(to),`${nm} menüü → ${to}`);}}
else{const vis=await p.evaluate(()=>[...document.querySelectorAll('.topnav .navl')].filter(e=>e.offsetParent).length);console.log('phone nav buttons visible',vis);}
// hero
await p.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
ok((await p.getAttribute('.hero2 a.btn.red','href')).startsWith('mailto:info@vaade3d.ee'),`${nm} Broneeri demo = e-kiri`);
await p.click('.hero2 [data-to="planeerija"]');ok(await inView('planeerija'),`${nm} Vaata, kuidas töötab`);
ok(await p.$eval('.appshot img',i=>i.complete&&i.naturalWidth>1000),`${nm} hero töölaua pilt laetud`);
// kellele cards
for(const to of ['planeerija','tooted','voimalused','koostoo','vaba']){await p.locator(`#kellele .who a[data-to="${to}"]`).scrollIntoViewIfNeeded();await p.click(`#kellele .who a[data-to="${to}"]`);ok(await inView(to),`${nm} kaart → ${to}`);}
// mallid tabs
const tabs=await p.$$('#mtlist .mtab');if(tabs.length>1){await tabs[1].scrollIntoViewIfNeeded();await tabs[1].click();await p.waitForTimeout(300);ok(await p.evaluate(()=>document.querySelectorAll('#mtlist .mtab')[1].getAttribute('aria-selected')==='true'||document.querySelectorAll('#mtlist .mtab')[1].classList.contains('on')),`${nm} näidiste vahetus`);}
// faq
await p.locator('#kkk details summary').first().scrollIntoViewIfNeeded();await p.click('#kkk details summary');ok(await p.evaluate(()=>document.querySelector('#kkk details').open),`${nm} KKK avaneb`);
ok(await p.evaluate(()=>document.querySelectorAll('#kkk details').length)===5,`${nm} KKK 5 küsimust`);
ok((await p.getAttribute('#koostoo a.btn.red','href')).startsWith('mailto:'),`${nm} Küsi pakkumist = e-kiri`);
ok((await p.getAttribute('.cta a.btn','href')).startsWith('mailto:'),`${nm} lõpu Broneeri demo = e-kiri`);
// app buttons
for(const sel of ['#vaba [data-go="dash"]','#koostoo [data-go="dash"]','.cta [data-go="dash"]','header [data-go="dash"]']){await home();const h0=appHits;await p.locator(sel).scrollIntoViewIfNeeded();await Promise.all([p.waitForURL(/app\.vaade3d\.ee/,{timeout:5000}).catch(()=>{}),p.click(sel)]);ok(p.url().includes('app.vaade3d.ee'),`${nm} ${sel} → äpp`,p.url());}
await home();await p.click('header .logo');await p.waitForTimeout(300);ok(!!(await p.$('.hero2')),`${nm} logo → avaleht`);
ok(!errs.length,`${nm} JS vigu pole`,errs);
await ctx.close();}
console.log('fails',fails);await b.close();process.exit(fails?1:0);
