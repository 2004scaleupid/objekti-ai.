import { chromium } from 'playwright';
const S='/tmp/claude-0/-home-claude/cfb7a3a4-3672-5bf5-b816-02763484350f/scratchpad/';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'});
const ctx=await b.newContext({viewport:{width:1280,height:900},colorScheme:'dark',deviceScaleFactor:1});const p=await ctx.newPage();
await p.goto('http://localhost:8767/test.html');await p.waitForTimeout(2500);
await p.evaluate(()=>{document.getElementById('kindDlg')?.remove();acct.kindSet=true;try{openSettings('widget')}catch(e){try{document.querySelector('[data-tab="widget"]').click()}catch(_){}}});await p.waitForTimeout(1000);
await p.evaluate(()=>{const b=document.querySelector('[data-tab="widget"]');if(b)b.click();document.getElementById('wOpts').scrollIntoView({block:'center'})});await p.waitForTimeout(800);
const bb=await p.evaluate(()=>{const r=document.getElementById('wOpts').closest('.qgrp').getBoundingClientRect();return {x:r.x-10,y:r.y-10,width:r.width+20,height:r.height+20}});
await p.screenshot({path:S+'wopts.png',clip:bb});console.log(JSON.stringify(bb));await b.close();
