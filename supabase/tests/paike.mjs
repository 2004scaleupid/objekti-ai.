import { chromium } from 'playwright';
const S='/tmp/claude-0/-home-claude/cfb7a3a4-3672-5bf5-b816-02763484350f/scratchpad/';const N=S+'npm3/';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',args:['--use-gl=angle','--use-angle=swiftshader']});
const ctx=await b.newContext({viewport:{width:1440,height:900}});await ctx.route(/fonts\.|supabase\.co/,r=>r.abort());
await ctx.route(/cdn\.jsdelivr\.net\/npm\/three@0\.170\.0\/(.*)$/,r=>{const m=r.request().url().match(/three@0\.170\.0\/(.*)$/);r.fulfill({path:N+'package/'+m[1],contentType:'text/javascript'});});
const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8771/');await p.waitForTimeout(1500);
const ids=await p.evaluate(()=>[...document.querySelectorAll('#mtlist [data-m], #mtlist button')].map(e=>e.dataset.m||e.textContent.trim().slice(0,30)));console.log(ids);
await p.evaluate(()=>document.getElementById('mstage').scrollIntoView({behavior:'instant',block:'center'}));await p.waitForTimeout(800);
const btn=await p.$('#mtlist [data-m="paike"]');if(btn){await btn.click();}
await p.waitForTimeout(1200);await (await p.$('#mstage').then(e=>e.screenshot({path:S+'paike-1.png'})));
await p.waitForTimeout(3500);await (await p.$('#mstage').then(e=>e.screenshot({path:S+'paike-2.png'})));
console.log(await p.evaluate(()=>{const s=document.getElementById('mstage');const im=[...s.querySelectorAll('.mimg[data-i="paike"] img')].map(i=>[i.src.split('/').pop(),i.naturalWidth,getComputedStyle(i).opacity]);return [s.dataset.m,getComputedStyle(s.querySelector('.mimg[data-i="paike"]')).opacity,im]}),JSON.stringify(errs));
await b.close();
