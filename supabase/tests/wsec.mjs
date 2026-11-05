import { chromium } from 'playwright';
const S='/tmp/claude-0/-home-claude/cfb7a3a4-3672-5bf5-b816-02763484350f/scratchpad/';const N=S+'npm3/';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',args:['--use-gl=angle','--use-angle=swiftshader']});
let fails=0;const ok=(c,t)=>{console.log(c?'PASS':'FAIL',t);if(!c)fails++;};
for(const [nm,o] of [['desk',{viewport:{width:1440,height:900}}],['phone',{viewport:{width:390,height:844},isMobile:true,deviceScaleFactor:2}]]){
const ctx=await b.newContext({...o,reducedMotion:'reduce'});await ctx.route(/fonts\.|supabase\.co/,r=>r.abort());
await ctx.route(/cdn\.jsdelivr\.net\/npm\/three@0\.170\.0\/(.*)$/,r=>{const m=r.request().url().match(/three@0\.170\.0\/(.*)$/);r.fulfill({path:N+'package/'+m[1],contentType:'text/javascript'});});
const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8771/');await p.waitForTimeout(1500);
for(const id of ['koostoo','vaba']){await p.evaluate(id=>document.getElementById(id).scrollIntoView({behavior:'instant'}),id);await p.waitForTimeout(2500);
const bb=await p.evaluate(id=>{const r=document.getElementById(id).getBoundingClientRect();return [r.top+scrollY,r.height]},id);
await p.screenshot({path:S+`${id}-${nm}.png`,fullPage:true,clip:{x:0,y:bb[0],width:o.viewport.width,height:Math.min(bb[1],2600)}});}
for(const m of ['classic','min','dark']){ok(await p.$eval(`img[src="ex/vidin-${m}.webp"]`,i=>{i.loading='eager';return new Promise(r=>{const f=()=>r(i.naturalWidth===1432);i.complete?f():i.onload=f;})}),`${nm} vidin ${m}`);}
ok(await p.$eval('.edshot img',i=>{i.loading='eager';return true}),`${nm} töölaua pilt olemas`);
await p.evaluate(()=>document.getElementById('car3d').scrollIntoView());await p.waitForTimeout(5000);
ok(await p.$eval('#car3d',e=>e.classList.contains('fb')&&!e.querySelector('canvas')),`${nm} auto varupilt kui mudel ei lae`);
ok(errs.length===0,`${nm} JS vigu pole `+errs.join('|'));await ctx.close();}
console.log('fails',fails);await b.close();
