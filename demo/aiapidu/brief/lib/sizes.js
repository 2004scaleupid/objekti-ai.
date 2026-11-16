/* Kataloogi mõõdud ühest kohast: lahendaja, 2D plaan, 3D vaataja, tingimuste paneel ja test kasutavad ainult seda.
   Mõõtu ei arvata: kui kataloogis pole, visatakse viga (parem katki kui vale mõõt). */
(function (G) {
'use strict';
const DIMS = ['w', 'd', 'h'];
function product(cat, id) {
  const P = (cat && cat.products) || [], p = P.find(x => x.id === id) || P.find(x => x.spec && x.spec.kind === id);
  if (!p) throw new Error(`Kataloogis puudub toode "${id}"`);
  return p;
}
function need(cat, id, key) { const p = product(cat, id), v = p.spec[key]; if (v == null) throw new Error(`Kataloogis puudub ${p.id}.${key}`); return v; }
// "kontrollimata": kogu toode STD või mõni põhimõõt (w/d/h/sizes) STD
function unverified(p, keys) { if (!p) return true; if (p.source !== 'funrent.ee') return true; const s = p.std || []; return (keys || DIMS.concat(['sizes', 'sideH', 'ridgeH'])).some(k => s.includes(k)); }
function info(cat, id) {
  const p = product(cat, id), s = p.spec;
  const round = s.shape === 'round' || s.kind === 'cocktail', w = round ? s.d : s.w, d = s.d; // ümmargusel w = d = läbimõõt
  return { id: p.id, name: p.name, w, d, h: s.h, round, source: p.source, url: p.url || null, checked: p.checked || null, std: p.std || [], unverified: unverified(p), note: p.note || '' };
}
// telgi kõrgused valitud suurusele
function tentHeights(cat, id, W, L) {
  const p = product(cat, id), s = p.spec, side = s.sideH; if (side == null) throw new Error(`Kataloogis puudub ${p.id}.sideH`);
  const ridge = s.ridgeBySize ? s.ridgeBySize[String(Math.min(W, L))] : s.ridgeH; if (ridge == null) throw new Error(`Kataloogis puudub ${p.id} harja kõrgus suurusele ${W} × ${L}`);
  return { sideH: side, ridgeH: ridge, doorW: s.doorW, unverified: unverified(p, ['sideH', 'ridgeH', 'sizes']) };
}
// GLB mudel kataloogi mõõtu: pikem horisontaalne külg -> w, lühem -> d, kõrgus -> h (eraldi telgede kaupa, et mõõt oleks täpne)
// axes 'xz' = mudeli x on laius (w), z sügavus (d), ilma pööramata (nt tool, mille esikülg on +z)
function fitScale(size, dim, axes) {
  const rot = axes !== 'xz' && size.z > size.x ? Math.PI / 2 : 0, sx = rot ? size.z : size.x, sz = rot ? size.x : size.z;
  return { rot, sx: dim.w / sx, sy: dim.h / size.y, sz: dim.d / sz };
}
const fmt = v => (Math.round(v * 100) / 100).toString().replace('.', ',');
function label(i) { return (i.round ? `Ø${fmt(i.w)}` : `${fmt(i.w)} × ${fmt(i.d)}`) + (i.h != null ? ` × h${fmt(i.h)}` : '') + ' m'; }
const API = { product, need, info, unverified, tentHeights, fitScale, label, fmt };
if (typeof module !== 'undefined' && module.exports) module.exports = API; else G.Sizes = API;
})(typeof window !== 'undefined' ? window : globalThis);
