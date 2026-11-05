import { chromium } from 'playwright';
const S='/tmp/claude-0/-home-claude/cfb7a3a4-3672-5bf5-b816-02763484350f/scratchpad/';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'});
for(const m of ['classic','min','dark']){
const ctx=await b.newContext({viewport:{width:1280,height:900},colorScheme:'light',deviceScaleFactor:2});const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8767/test.html');await p.waitForTimeout(2500);
const r=await p.evaluate((m)=>{document.getElementById('kindDlg')?.remove();acct.kindSet=true;acct.company='Sinu Firma OÜ';acct.wMode=m;try{save();}catch(_){}siteMock();const hp=document.querySelector('#wSite .hero p');if(hp)hp.textContent='Soojustame ja krohvime maju üle Harjumaa. Sisesta oma aadress ja vaata, kuidas su maja välja näeb, enne kui pakkumist küsid.';
 document.querySelectorAll('.toast,#toast,#fbw,#wPrev').forEach(e=>e.style.display='none');const w=document.getElementById('wSite');w.scrollTop=0;const bb=w.getBoundingClientRect();return [bb.x,bb.y,bb.width,bb.height,w.scrollHeight,getComputedStyle(w).position];},m);
await p.waitForTimeout(1200);
await p.screenshot({path:S+`w-${m}.png`,clip:{x:0,y:0,width:1280,height:m==='min'?560:770}});
console.log(m,JSON.stringify(r),JSON.stringify(errs));await ctx.close();}
await b.close();
