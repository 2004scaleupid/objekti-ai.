/* Mobiilne stuudio (vt css/mobile.css):
   - body.m-st, kui stuudio on avatud ja ekraan on kitsas
   - --vvh = nähtava ala kõrgus, et kirjutamisriba püsiks klaviatuuri kohal
   - „i“ nupp ülaribal avab paneeli (tooted, nõuanded) alt lehena */
(function(){
  const st=document.getElementById('studio');if(!st)return;
  const mq=window.matchMedia('(max-width:820px)');
  const vv=window.visualViewport;
  const root=document.documentElement;

  function setVh(){const h=vv?vv.height:window.innerHeight;root.style.setProperty('--vvh',Math.round(h)+'px');
    if(document.body.classList.contains('m-st')){window.scrollTo(0,0);}}

  function closePanel(){document.body.classList.remove('m-pan');}
  function sync(){const on=mq.matches&&!st.hidden;document.body.classList.toggle('m-st',on);if(!on)closePanel();setVh();}

  // info-nupp
  const top=document.getElementById('stTop');
  if(top&&!top.querySelector('.mInfo')){
    const b=document.createElement('button');b.type='button';b.className='mInfo';b.setAttribute('aria-label','Tooted ja nõuanded');b.title='Tooted ja nõuanded';
    b.innerHTML='<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>';
    b.onclick=()=>document.body.classList.toggle('m-pan');
    const nw=document.getElementById('stNew2');top.insertBefore(b,nw||null);
    b.style.display='none';
    const upd=()=>{b.style.display=mq.matches?'':'none';};mq.addEventListener('change',upd);upd();
  }
  const scrim=document.createElement('div');scrim.className='mScrim';scrim.onclick=closePanel;document.body.appendChild(scrim);
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closePanel();});

  new MutationObserver(sync).observe(st,{attributes:true,attributeFilter:['hidden']});
  mq.addEventListener('change',sync);
  if(vv){vv.addEventListener('resize',setVh);vv.addEventListener('scroll',()=>{if(document.body.classList.contains('m-st'))window.scrollTo(0,0);});}
  window.addEventListener('resize',setVh);

  // klaviatuur avaneb -> vestlus viimase sõnumi juurde
  const inp=document.getElementById('stIn'),th=document.getElementById('stThread');
  if(inp&&th)inp.addEventListener('focus',()=>{if(!document.body.classList.contains('m-st'))return;setTimeout(()=>{th.scrollTop=th.scrollHeight;},300);});

  sync();
})();
