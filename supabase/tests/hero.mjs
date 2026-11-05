import { chromium } from 'playwright';
const S='/tmp/claude-0/-home-claude/cfb7a3a4-3672-5bf5-b816-02763484350f/scratchpad/';const N=S+'npm3/';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',args:['--use-gl=angle','--use-angle=swiftshader']});
for(const [nm,o] of [['desk',{viewport:{width:1440,height:900}}],['phone',{viewport:{width:390,height:844},isMobile:true,deviceScaleFactor:2}]]){
const ctx=await b.newContext({...o,reducedMotion:'reduce'});await ctx.route(/fonts\.|supabase\.co/,r=>r.abort());
await ctx.route(/cdn\.jsdelivr\.net\/npm\/three@0\.170\.0\/(.*)$/,r=>{const m=r.request().url().match(/three@0\.170\.0\/(.*)$/);r.fulfill({path:N+'package/'+m[1],contentType:'text/javascript'});});
const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8771/');await p.waitForTimeout(2000);
await p.screenshot({path:S+`hero-${nm}.png`,fullPage:true,clip:{x:0,y:0,width:o.viewport.width,height:nm=='desk'?1300:1700}});
const img=await p.evaluate(()=>{const i=document.querySelector('.appshot img');return i&&[i.naturalWidth,i.complete]});
console.log(nm,img,JSON.stringify(errs));await ctx.close();}
await b.close();
