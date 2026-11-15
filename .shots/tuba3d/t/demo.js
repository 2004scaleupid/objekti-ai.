// ainult kohalik test: Sisekujunduse vestlus kasutaja foto ja 2 AI variandiga
window.DEMO=async()=>{await new Promise(r=>setTimeout(r,2200));const ob=[...document.querySelectorAll('button')].find(x=>/^Firmana/.test(x.textContent.trim())&&x.offsetParent);ob&&ob.click();
  document.querySelectorAll('#fbw,.fbw').forEach(e=>e.remove());safeUrl=u=>String(u||'');openStudio('sisek');const s=stNewSession(),O=location.origin+'/.shots/tuba3d/t/';
  s.imgs=[{src:O+'orig.jpg',marks:[]}];s.tray=[0];s.base=O+'orig.jpg';s.title='Magamistuba';
  s.msgs=[{role:'u',text:'Skandinaavia stiilis, hele puit ja valged seinad',gen:true,pics:[O+'orig.jpg']},{role:'a',out:[O+'v1.jpg',O+'v2.jpg'],cr:2}];
  stSave();stOpenSession(s.id);await new Promise(r=>setTimeout(r,1500));return [innerWidth,innerHeight,document.documentElement.scrollHeight];};
