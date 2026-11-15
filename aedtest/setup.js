// Ainult kohalikuks testiks (ei lähe repo): matkib kontot ja garden-funktsiooni, avab mudeli, salvestab kaadri /__save kaudu.
window.gtest = async function (ehr, opts = {}) {
  p3Cloud = () => true; CL.cid = 'c1';
  if (!window.__clFn) window.__clFn = clFn;
  clFn = async (n, b, o) => n === 'garden' ? { meta: `/aedtest/${ehr}/meta.json`, timing: { auth: 1, cache: 40 }, cached: true } : window.__clFn(n, b, o);
  window.__logs = []; const ci = console.info; console.info = (...a) => { __logs.push(a.join(' ')); ci(...a); };
  if (document.getElementById('app').hidden) enter();
  document.querySelectorAll('.fbpop').forEach(e => e.remove());
  m3Open(Object.assign({ id: 'ehr:' + ehr, url: 'lod2:' + ehr, ehr, tpl: null, d: null, garden: true }, opts), true);
  for (let i = 0; i < 80 && !(P3V && (P3V.garden || P3V.gErr)); i++) await new Promise(r => setTimeout(r, 300));
  return { err: P3V.gErr, logs: __logs };
};
window.gview = function (dir, dist) { const V = P3V; V.cam.position.copy(V.ct.target).addScaledVector(new THREE.Vector3(...dir).normalize(), dist); V.ct.update(); };
window.gcap = async function (name) {
  const V = P3V; V.cam.updateMatrixWorld(); V.r.render(V.sc, V.cam);
  const src = V.r.domElement, c = document.createElement('canvas'); c.width = src.width; c.height = src.height; const g = c.getContext('2d'); g.drawImage(src, 0, 0);
  const lab = $('m3Labs'), svg = lab && lab.querySelector('svg');
  if (svg) { m3Frame(V, lab, true); const im = new Image(); await new Promise(r => { im.onload = im.onerror = r; im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(svg)); }); g.drawImage(im, 0, 0, c.width, c.height); }
  await fetch('/__save?n=' + name, { method: 'POST', body: c.toDataURL('image/jpeg', .9) });
};
