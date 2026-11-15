// Ainult kohalik test: avab päris Tripo töö 2634fddc päris aiaandmetega (avalik meta.json).
window.ttest = async function () {
  const ID = '2634fddc-10e4-4112-9226-1025a16f8ddc', GLB = 'https://twubqebmjuvwypeduqqq.supabase.co/storage/v1/object/public/models/24a26568-931f-4089-a763-39036838189d/' + ID + '.glb';
  p3Cloud = () => true; CL.cid = 'c1'; window.__clFn = window.__clFn || clFn;
  clFn = async (n, b, o) => n === 'garden' ? { meta: 'https://twubqebmjuvwypeduqqq.supabase.co/storage/v1/object/public/models/aed/116059420/meta.json', timing: {}, cached: true } : window.__clFn(n, b, o);
  if ($('app').hidden) enter(); document.querySelectorAll('#fbw').forEach((e) => e.hidden = true);
  const f = [...document.querySelectorAll('button')].find((b) => /^Firmana/.test(b.innerText) && b.offsetParent); if (f) f.click();
  m3Open({ id: ID, ref: ID, url: GLB, ehr: '116059420', tpl: null, d: null, garden: true }, true);
  for (let i = 0; i < 150 && !(P3V && (P3V.garden || P3V.gErr)); i++) await new Promise((r) => setTimeout(r, 300));
  return stSess().model;
};
