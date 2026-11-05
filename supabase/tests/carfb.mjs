import { chromium } from 'playwright';
const S='/tmp/claude-0/-home-claude/cfb7a3a4-3672-5bf5-b816-02763484350f/scratchpad/';const N=S+'npm3/';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',args:['--use-gl=angle','--use-angle=swiftshader']});
const ctx=await b.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});await ctx.route(/fonts\.|supabase\.co/,r=>r.abort());
await ctx.route(/cdn\.jsdelivr\.net\/npm\/three@0\.170\.0\/(.*)$/,r=>{const m=r.request().url().match(/three@0\.170\.0\/(.*)$/);r.fulfill({path:N+'package/'+m[1],contentType:'text/javascript'});});
await ctx.route(/f3d\/maja\.glb/,r=>r.abort());
const p=await ctx.newPage();await p.goto('http://localhost:8771/');await p.waitForTimeout(1500);
await p.evaluate(()=>document.getElementById('car3d').scrollIntoView({block:'center',behavior:'instant'}));await p.waitForTimeout(9000);

await p.evaluate(()=>document.getElementById('f3v').scrollIntoView({block:'center',behavior:'instant'}));await p.waitForTimeout(12000);
console.log(await p.evaluate(()=>{const c=document.getElementById('car3d'),f=document.getElementById('f3v'),pi=f.querySelector('#f3poster img');return [c.className,getComputedStyle(c).backgroundImage,f.className,pi&&pi.complete&&pi.naturalWidth,getComputedStyle(document.getElementById('f3poster')).opacity]}));await b.close();
