// Mõõtjooned ühest allikast (layout.json): sama loogika ja ümardus mis 2D plaanil (EventPlan.fmt, kaugus lähimast seinast, vahekäigud kattuvate külgede vahel).
// Väljund ala koordinaatides (m): x = pikkus 0..10 (vasakult paremale), y = sügavus 0..7 (0 = esikülg). node dims.js -> dims-A.json ...
const EP = require('../../../js/eventplan.js'), fs = require('fs'), fmt = v => EP.fmt(v) + ' m';
const NAME = { stage: 'Lava', dance: 'Tantsuala', catering: 'Catering-laud', seating: 'Pikk laud' };
function bbox(it) { if (it.kind !== 'seating') return { x: it.x, y: it.y, w: it.w, d: it.d }; let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const t of it.tables) { const b = t.body; x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.d); } return { x: x0, y: y0, w: x1 - x0, d: y1 - y0 }; }
function dims(L) {
  const o = L.origin, R = L.room, A = L.area, out = [], P = (x, y) => [+(x + o.x).toFixed(3), +(y + o.y).toFixed(3)];
  const seg = (a, b, t, kind) => out.push({ a, b, t, kind });
  seg([0, -.6], [A.l, -.6], fmt(A.l), 'area'); seg([-.6, 0], [-.6, A.w], fmt(A.w), 'area');
  seg(P(0, R.W + .35), P(R.L, R.W + .35), 'Telk ' + fmt(R.L), 'tent'); seg(P(R.L + .35, 0), P(R.L + .35, R.W), fmt(R.W), 'tent');
  const its = L.items.filter(i => NAME[i.kind]);
  for (const it of its) {
    const b = bbox(it), cx = b.x + b.w / 2, cy = b.y + b.d / 2;
    if (it.kind === 'seating') { const t = it.tables[0], len = t.along ? t.w : t.d, x0 = t.along ? t.x : t.x + t.w / 2, y0 = t.along ? t.y + t.d / 2 : t.y; seg(P(x0, y0), t.along ? P(x0 + len, y0) : P(x0, y0 + len), `Laud ${fmt(len)} · ${it.seats} kohta`, 'size'); }
    else seg(P(b.x, b.y + b.d + .12), P(b.x + b.w, b.y + b.d + .12), `${NAME[it.kind]} ${EP.fmt(Math.max(it.w, it.d))} × ${fmt(Math.min(it.w, it.d))}`, 'size');
    const dl = b.x, dr = R.L - b.x - b.w, dt = b.y, db = R.W - b.y - b.d;
    if (dl <= dr) seg(P(0, cy), P(b.x, cy), fmt(dl), 'wall'); else seg(P(b.x + b.w, cy), P(R.L, cy), fmt(dr), 'wall');
    if (dt <= db) seg(P(cx, 0), P(cx, b.y), fmt(dt), 'wall'); else seg(P(cx, b.y + b.d), P(cx, R.W), fmt(db), 'wall');
  }
  for (let i = 0; i < its.length; i++) for (let j = i + 1; j < its.length; j++) {
    const a = bbox(its[i]), b = bbox(its[j]), k = [its[i].kind, its[j].kind]; if (k.includes('stage') && k.includes('dance')) continue;
    const ox0 = Math.max(a.x, b.x), ox1 = Math.min(a.x + a.w, b.x + b.w), oy0 = Math.max(a.y, b.y), oy1 = Math.min(a.y + a.d, b.y + b.d);
    if (ox1 - ox0 > .3) { const x = (ox0 + ox1) / 2, g = a.y + a.d <= b.y ? [a.y + a.d, b.y] : b.y + b.d <= a.y ? [b.y + b.d, a.y] : null; if (g && g[1] - g[0] < 5) seg(P(x, g[0]), P(x, g[1]), 'vahe ' + fmt(g[1] - g[0]), 'gap'); }
    else if (oy1 - oy0 > .3) { const y = (oy0 + oy1) / 2, g = a.x + a.w <= b.x ? [a.x + a.w, b.x] : b.x + b.w <= a.x ? [b.x + b.w, a.x] : null; if (g && g[1] - g[0] < 5) seg(P(g[0], y), P(g[1], y), 'vahe ' + fmt(g[1] - g[0]), 'gap'); }
  }
  // kõrgused (püstjooned): telgi sein ja hari, lava kõrgus; a = maapunkt, h = kõrgus
  const t = L.tent; out.push({ a: P(0, 0), h: t.sideH, t: `sein ${EP.fmt(t.sideH)} m`, kind: 'vert' }, { a: P(R.L, R.W / 2), h: t.ridgeH, t: `hari ${EP.fmt(t.ridgeH)} m`, kind: 'vert' });
  const st = L.items.find(i => i.kind === 'stage'); if (st) out.push({ a: P(st.x, st.y), h: st.h || .4, t: `lava ${EP.fmt(st.h || .4)} m`, kind: 'vert' });
  return out;
}
if (require.main === module) for (const v of ['A', 'B', 'C']) { const L = JSON.parse(fs.readFileSync(`${__dirname}/${v}-layout.json`)).layout; fs.writeFileSync(`${__dirname}/dims-${v}.json`, JSON.stringify(dims(L))); console.log(v, dims(L).map(s => s.t).join(' | ')); }
module.exports = dims;
