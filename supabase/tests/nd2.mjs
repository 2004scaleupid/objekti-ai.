import { chromium } from 'playwright';
const S='/tmp/claude-0/-home-claude/cfb7a3a4-3672-5bf5-b816-02763484350f/scratchpad/';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'});
let fails=0;const ok=(c,m,x)=>{console.log((c?'PASS ':'FAIL ')+m,c?'':JSON.stringify(x));if(!c)fails++;};
for(const [nm,o] of [['desk',{viewport:{width:1300,height:900},colorScheme:'dark'}],['phone',{viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2}]]){
const ctx=await b.newContext(o);const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8767/test.html');await p.waitForTimeout(2500);
const open=async()=>{await p.evaluate(()=>{const f=document.getElementById('fbw');if(f)f.hidden=true;acct.kindSet=true;document.getElementById('kindDlg')?.remove();acct.credits=50;window.__c0=acct.credits;
  HOUSES.splice(0,HOUSES.length,...HOUSES.filter(h=>h.ehr!=='120250330'));show('home');openAddress('Käärametsa tee 3',null,{ehr:'120250330',full:'Käärametsa tee 3, Laiaküla, Viimsi vald',t:'Käärametsa tee 3'});});await p.waitForTimeout(1500);};
await open();
const st=()=>p.evaluate(()=>({wide:document.getElementById('dlg').classList.contains('wide'),cards:[...document.querySelectorAll('.hvo')].map(b=>b.dataset.hv+':'+b.getAttribute('aria-pressed')),yes:document.getElementById('dYes').textContent,w:document.querySelector('#dlg .dbox').getBoundingClientRect().width,sw:document.documentElement.scrollWidth}));
let s=await st();ok(s.cards.join()==='foto:false,lihtne:true'&&s.yes==='Loo objekt · 1 krediit',nm+' fotodega on esimene, ilma fotodeta vaikimisi kiire',s);ok(s.sw<=o.viewport.width,nm+' ei kerita külgsuunas',s);
await p.screenshot({path:S+'nd-'+nm+'.png'});
// Lisa 4 fotot -> picker; set files
const [fc]=await Promise.all([p.waitForEvent('filechooser'),p.click('.hvo[data-hv="foto"]')]);ok(!!fc&&/Lisa 4 fotot/.test((await st()).yes),nm+' fotodega kaart avab fotode valiku');
ok(await p.evaluate(()=>!document.getElementById('dlg').hidden),nm+' aken jääb lahti');
await fc.setFiles(['maja.jpg','maja.jpg','maja.jpg','maja.jpg']);await p.waitForTimeout(400);
s=await st();ok(/Loo objekt \+ 3D fotodest · 4 krediiti/.test(s.yes),nm+' 4 fotoga nupp',s);
ok(/4 fotot lisatud/.test(await p.textContent('#hvN')),nm+' näitab fotode arvu');
await p.evaluate(()=>{window.__st=null;const o=window.openStudio;window.openStudio=function(k,f,opt){window.__st=[k,f.length,opt&&opt.subject];};});
await p.click('#dYes');await p.waitForTimeout(2500);
let r=await p.evaluate(()=>[__c0-acct.credits,HOUSES[cur].short,window.__st,document.getElementById('dlg').classList.contains('wide')]);
ok(r[1]==='Käärametsa tee 3'&&r[0]===1,nm+' objekt tehtud, objektivaade 1 krediit',r);
ok(r[2]&&r[2][0]==='mudel3d'&&r[2][1]===4&&r[2][2]==='building',nm+' 3D fotodest avaneb 4 fotoga',r);
// lihtne
await open();await p.click('.hvo[data-hv="lihtne"]');s=await st();ok(s.yes==='Loo objekt · 1 krediit',nm+' lihtne nupp',s);
await p.evaluate(()=>{window.__st=null;});await p.click('#dYes');await p.waitForTimeout(2500);
r=await p.evaluate(()=>[__c0-acct.credits,window.__st]);ok(r[0]===1&&!r[1],nm+' ainult mõõdud: 1 krediit, stuudiot ei avata',r);
// cancel
await open();await p.click('#dNo');ok(await p.evaluate(()=>!document.getElementById('dlg').classList.contains('wide')),nm+' loobu sulgeb');
ok(!errs.length,nm+' vigu pole',errs);await ctx.close();}
console.log('fails',fails);await b.close();process.exit(fails?1:0);
