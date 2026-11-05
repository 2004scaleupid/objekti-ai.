import { chromium } from 'playwright';
const S='/tmp/claude-0/-home-claude/cfb7a3a4-3672-5bf5-b816-02763484350f/scratchpad/';
const PLI='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="15" rx="2"/><circle cx="9" cy="11" r="2"/><path d="m21 17-5-5-8 8"/></svg>';
const IDEA='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/></svg>';
const TENT='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 20 12 4l9 16z"/><path d="M12 4v16M8 20l4-7 4 7"/></svg>';
const cfg={
 classic:{co:'Sinu Rent OÜ',sub:'Ürituse planeerija',t:'Kujunda oma üritus',p:'Lae üles foto oma platsist ja vali telgid, lava, mööbel ja valgus. AI paneb need sinu fotole ja arvutab kogused.',btns:[[TENT,'Lae üles platsi foto'],[IDEA,'Kirjelda oma üritust']],pts:['Sinu inventar','Õiged mõõdud','Hinnapäring kohe']},
 min:{t:'Vaata oma maja 3D-s',keep:true},
 dark:{co:'Sinu Firma OÜ',sub:'Proovi enne ostu',t:'Proovi meie toodet oma kodus',p:'Lae üles foto oma hoovist või toast ja vali meie valikust. Näed kohe, kuidas saun, terrass või mööbel sinu juures välja näeb.',btns:[[PLI,'Proovi meie toodet oma hoovis'],[IDEA,'Näita oma ideed pildil']],pts:['Päris tooted','Sinu enda foto','Tasuta']},
};
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'});
for(const m of ['classic','min','dark']){
const ctx=await b.newContext({viewport:{width:780,height:900},colorScheme:'light',deviceScaleFactor:2});const p=await ctx.newPage();
await p.goto('http://localhost:8767/test.html');await p.waitForTimeout(2500);
await p.evaluate(([m,c])=>{document.getElementById('kindDlg')?.remove();acct.kindSet=true;acct.company=c.co||'Sinu Firma OÜ';acct.wMode=m;try{save();}catch(_){}siteMock();
 document.querySelectorAll('.toast,#toast,#fbw,#wPrev').forEach(e=>e.style.display='none');
 const w=document.querySelector('#wSite .wcard');
 if(!c.keep){const ini=c.co.split(/\s+/).map(x=>x[0]).join('').slice(0,2).toUpperCase();
  w.querySelector('.cvl').textContent=ini;w.querySelector('.cvt b').textContent=c.co;w.querySelector('.cvt small').textContent=c.sub;
  w.querySelector('h1').textContent=c.t;w.querySelector('p').textContent=c.p;
  const f=w.querySelector('form');const d=document.createElement('div');d.className='wsvb';d.style.marginTop='4px';d.innerHTML=c.btns.map(([i,t])=>`<button type="button" class="wplace">${i}${t}</button>`).join('');f.replaceWith(d);
  w.querySelectorAll('.wsvb').forEach(x=>{if(x!==d)x.remove();});
  const pts=w.querySelector('.wpts');if(pts)pts.innerHTML=c.pts.map(x=>`<span>${x}</span>`).join('');}
 else{w.querySelector('h1').textContent=c.t;}
 return w.querySelectorAll('.wplace').length;},[m,cfg[m]]);
await p.waitForTimeout(600);
const el=await p.$('#wSite .wcard');const bb=await el.boundingBox();
await p.screenshot({path:S+`wc2-${m}.png`,clip:bb});console.log(m,JSON.stringify(bb));await ctx.close();}
await b.close();
