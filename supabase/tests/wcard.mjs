import { chromium } from 'playwright';
const S='/tmp/claude-0/-home-claude/cfb7a3a4-3672-5bf5-b816-02763484350f/scratchpad/';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'});
for(const m of ['classic','min','dark']){
const ctx=await b.newContext({viewport:{width:780,height:900},colorScheme:'light',deviceScaleFactor:2});const p=await ctx.newPage();
await p.goto('http://localhost:8767/test.html');await p.waitForTimeout(2500);
await p.evaluate((m)=>{document.getElementById('kindDlg')?.remove();acct.kindSet=true;acct.company='Sinu Firma OÜ';acct.wMode=m;try{save();}catch(_){}siteMock();
 document.querySelectorAll('.toast,#toast,#fbw,#wPrev').forEach(e=>e.style.display='none');const w=document.getElementById('wSite');w.style.background='transparent';document.body.style.background='transparent';document.documentElement.style.background='transparent';},m);
await p.waitForTimeout(800);
const el=await p.$('#wSite .wcard');const bb=await el.boundingBox();
await p.screenshot({path:S+`wc-${m}.png`,clip:bb,omitBackground:true});console.log(m,JSON.stringify(bb));await ctx.close();}
await b.close();
