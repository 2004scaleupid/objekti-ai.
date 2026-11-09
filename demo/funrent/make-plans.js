// 3 versiooni 10 × 6 m alale (node demo/funrent/make-plans.js): soov -> kui ei mahu, lähim mahtuv; pop-up katus laudade/baari kohale; kirjutab out/vN-layout.json
const fs = require('fs'), path = require('path');
const EP = require('../../js/eventplan.js'), base = require('../../js/catalog/funrent.json');
const OUT = path.join(__dirname, 'out'); fs.mkdirSync(OUT, { recursive: true });
// tool = Funrendi klapptool (funrent.ee 80 × 40 × 44 cm), mitte STD banketitool
const cat = JSON.parse(JSON.stringify(base)); const ch = cat.products.find(p => p.id === 'chair'), cf = cat.products.find(p => p.id === 'chair-fold');
Object.assign(ch, { name: 'Klapptool valge', spec: Object.assign({}, cf.spec) });
const AREA = { l: 11.55, w: 8.65 }; // päris vaba muru Jõe tn 4 juures (Maa-amet: ortofoto + nDSM, vt site/site-real.json)
const S = (name, g, items) => ({ name, venue: 'outdoor', area: AREA, guests: g, tent: { type: 'modular' }, items, _noFix: true }); // 5 m moodultelk (ainus laius, mis 10 × 6 m alale mahub)
const V = [
  { id: 'v1', title: 'Minifestival', wish: '30 külalist püsti, lava 3 × 2 m, baar',
    tries: [['30 püsti, lava 3 × 2 m, baar', S('Minifestival', 30, [{ kind: 'stage', w: 3, d: 2, name: 'Lava' }, { kind: 'standing', guests: 30 }, { kind: 'bar', n: 1 }])]],
    style: { mood: 'festival', colors: ['valge', 'roheline'] } },
  { id: 'v2', title: 'Jaanipäev', wish: '16 külalist pika laua taga + bänd poodiumil 3 × 2 m, minimaalne telk',
    tries: [['16 + bändi poodium 3 × 2 m', S('Jaanipäev', 16, [{ kind: 'seating', table: 'rect240', guests: 16, single: true }, { kind: 'stage', w: 3, d: 2, name: 'Bändi poodium' }])]],
    decor: ['Kasekaar sissepääsul', 'Lillepärjad laual', 'Laternad', 'Heinapallid'], style: { mood: 'jaanipäev', colors: ['valge', 'kaserohelised', 'lillad'] } },
  { id: 'v2b', title: 'Jaanipäev, lava väljas', wish: '16 külalist väikses telgis 5 × 6 m, bändi poodium 2 × 2 m telgist väljas',
    tries: [['16 telgis 5 × 6 m + poodium 2 × 2 m väljas', Object.assign(S('Jaanipäev', 16, [{ kind: 'seating', table: 'rect240', guests: 16, single: true }]), { tent: { type: 'modular', size: [5, 6] }, yard: { gateW: 2, items: [{ kind: 'stage', w: 2, d: 2, name: 'Bändi poodium' }] } })]],
    decor: ['Kasekaar sissepääsul', 'Lillepärjad laual', 'Laternad', 'Heinapallid'], style: { mood: 'jaanipäev', colors: ['valge', 'kaserohelised'] } },
  { id: 'v3', title: 'Perepidu / väike pulm', wish: '24 külalist ümarlaudades Ø150 + toitlustuslaud',
    tries: [['24 ümarlaudades Ø150', S('Perepidu', 24, [{ kind: 'seating', table: 'round150', guests: 24 }, { kind: 'catering', n: 1 }])],
      ['24 pikkade laudade taga + toitlustuslaud', S('Perepidu', 24, [{ kind: 'seating', table: 'rect240', guests: 24 }, { kind: 'catering', n: 1 }])]],
    style: { mood: 'elegantne', colors: ['valge', 'salvei roheline'] } }
];
const r2 = v => Math.round(v * 100) / 100, fmt1 = v => (Math.round(v * 10) / 10).toString().replace('.', ',');
for (const v of V) {
  let L = null, used = null, first = null;
  for (const [t, s] of v.tries) { s.style = v.style; const r = EP.solve(s, cat, { max: 1, quick: true }); if (!first) first = { t, ok: r.ok }; if (r.ok) { L = r.best; used = t; break; } }
  if (!L) { console.log(v.id, 'EI MAHU ÜHTEGI'); continue; }
  // pop-up katus: keskele üle laudade või baari; postid ei tohi olla teiste esemete peal ega alast väljas
  const tgt = v.canopy && L.items.find(i => i.kind === v.canopy.over); let can = null;
  if (tgt) {
    const [a, b] = v.canopy.size, horiz = tgt.w >= tgt.d, w = horiz ? Math.max(a, b) : Math.min(a, b), d = horiz ? Math.min(a, b) : Math.max(a, b);
    let x = tgt.x + tgt.w / 2 - w / 2, y = tgt.y + tgt.d / 2 - d / 2;
    if (v.canopy.over === 'bar') { const z = (tgt.zones || []).concat([tgt]); const bb = { x0: Math.min(...z.map(q => q.x)), y0: Math.min(...z.map(q => q.y)), x1: Math.max(...z.map(q => q.x + q.w)), y1: Math.max(...z.map(q => q.y + q.d)) }; x = (bb.x0 + bb.x1) / 2 - w / 2; y = (bb.y0 + bb.y1) / 2 - d / 2; }
    const bad = (x, y) => [[x, y], [x + w, y], [x, y + d], [x + w, y + d]].filter(([px, py]) => L.items.some(it => (it.tables ? it.tables.some(t => EP.gap({ t: 'c', x: px, y: py, r: .05 }, t.body) < .05) : EP.gap({ t: 'c', x: px, y: py, r: .05 }, Object.assign({ t: 'r' }, it)) < .05))).length;
    const cl = (x, y) => [Math.max(.2, Math.min(AREA.l - .2 - w, x)), Math.max(.2, Math.min(AREA.w - .2 - d, y))];
    let best = null; // nihuta 0,1 m sammuga kuni 1,5 m, kuni ükski post ei ole eseme peal
    for (let dx = -1.5; dx <= 1.5001; dx += .1) for (let dy = -1.5; dy <= 1.5001; dy += .1) { const [cx, cy] = cl(x + dx, y + dy), n = bad(cx, cy), c = n * 100 + Math.hypot(cx - x, cy - y); if (!best || c < best.c) best = { c, x: cx, y: cy, n }; }
    can = { x: r2(best.x), y: r2(best.y), w, d, name: v.canopy.name, ok: best.n === 0 };
  }
  L.canopies = can ? [can] : [];
  if (can) { L.bom.unshift({ id: 'tent-popup', name: `Pop-up telk ${can.d < can.w ? can.d + ' × ' + can.w : can.w + ' × ' + can.d} m`, qty: 1, source: 'funrent.ee' }); L.checks.push({ ok: can.ok, text: `${can.name}: postid ei ole laudade, toolide ega lava peal, ala sees (≥ 0,2 m servast)` }); }
  for (const d of v.decor || []) L.bom.push({ id: 'decor', name: d, qty: d.startsWith('Kasekaar') ? 1 : d.startsWith('Heinapallid') ? 4 : d.startsWith('Laternad') ? 8 : 6, source: 'STD', note: 'kaunistus' });
  L.wish = { text: v.wish, fits: first.ok, used };
  { const o = L.origin || { x: 0, y: 0 }, maxX = Math.max(...L.items.concat(L.yard ? L.yard.items : []).map(i => o.x + i.x + i.w), L.tent ? o.x + L.tent.L + L.tent.margin : 0);
    var parcel = maxX > 6.35 ? `Telk/esemed ulatuvad ${fmt1(maxX - 6.35)} m üle Jõe tn 4 kinnistu piiri Urke tänava ja Urke pargi maale (valla maa): vaja Jõelähtme valla kooskõlastust.` : ''; }
  delete L.catalog;
  fs.writeFileSync(path.join(OUT, `${v.id}-layout.json`), JSON.stringify(Object.assign({ id: v.id, title: v.title, decor: v.decor || [], parcel }, { layout: L })));
  console.log(v.id, v.title, first.ok ? 'soov mahub' : 'soov EI mahu -> ' + used, '| kohti', L.seats, '| katus', can && can.ok);
}
fs.writeFileSync(path.join(OUT, 'catalog.json'), JSON.stringify(cat));
