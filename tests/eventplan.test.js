// node --test tests/   (Node 18+). Sündmuse planeerija: iga paigutus peab läbima sama kontrolli, mida kasutab ka käsitsi muutmine.
const test = require('node:test'), assert = require('node:assert');
const EP = require('../js/eventplan.js'), cat = require('../js/catalog/funrent.json'), C = require('./eventplan.cases.js');
const clone = o => JSON.parse(JSON.stringify(o));

function sane(L, spec) {
  const v = EP.validate(L);
  assert.ok(v.ok, 'kontroll: ' + v.problems.map(p => p.text).join('; '));
  const seatsNeed = spec.items.filter(i => i.kind === 'seating').reduce((s, i) => s + i.guests, 0);
  assert.strictEqual(L.chairs, seatsNeed, 'toolide arv = külaliste arv');
  for (const it of L.items) if (it.kind === 'seating') for (const t of it.tables) {
    if (t.shape === 'round') assert.ok(t.chairs.length <= cat.products.find(p => p.id === t.product).spec.seats, 'ümarlaual liiga palju toole');
    else assert.ok(t.chairs.length <= 2 * Math.floor(t.nTab * t.unitW / L.rules.perGuest + 1e-6), 'pikal laual liiga palju toole');
  }
  assert.ok(L.checks.every(c => c.ok), 'kontrollnimekiri roheline');
  if (L.tent && spec.area) { const aL = Math.max(spec.area.l, spec.area.w), aW = Math.min(spec.area.l, spec.area.w); assert.ok(L.tent.L + 2 * L.tent.margin <= aL + 1e-9 && L.tent.W + 2 * L.tent.margin <= aW + 1e-9, 'telk + ümbrus mahub alale'); }
}

for (const k of ['wedding', 'company', 'gala', 'standing', 'festival'])
  test(C[k].name, () => {
    const r = EP.solve(C[k], cat);
    assert.ok(r.ok, r.reason);
    assert.ok(r.layouts.length >= 1);
    for (const L of r.layouts) sane(L, C[k]);
    const b = r.best.bom; assert.ok(b.length > 2, 'tootenimekiri');
  });

test('Väike 10 × 7 m: ei mahu → täpne puudujääk, lähim paigutus punasega, kontrollitud parandused', () => {
  const r = EP.solve(C.small, cat);
  assert.strictEqual(r.ok, false);
  assert.ok(r.shortfall && (r.shortfall.dl > 0 || r.shortfall.dw > 0), 'puudujääk meetrites');
  assert.match(r.reason, /puudu/);
  assert.ok(r.closest && r.closest.bad.length > 0, 'lähim paigutus, konfliktsed esemed märgitud');
  assert.ok(r.fixes.length >= 1, 'vähemalt üks parandus');
  for (const f of r.fixes) sane(f.layout, f.spec);
});

test('Kontroll leiab vead: laud lava peal, liiga palju toole, sissepääs kinni', () => {
  const L = EP.solve(C.wedding, cat).best;
  const a = clone(L); a.catalog = cat; const st = a.items.find(i => i.kind === 'stage'), sg = a.items.find(i => i.kind === 'seating');
  const t = sg.tables[0], dx = st.x + st.w / 2 - t.x, dy = st.y + st.d / 2 - t.y; t.x += dx; t.y += dy; t.body.x += dx; t.body.y += dy;
  assert.ok(EP.validate(a).problems.some(p => p.code === 'overlap' || p.code === 'zone'));
  const b = clone(L); b.catalog = cat; const t2 = b.items.find(i => i.kind === 'seating').tables[0]; for (let i = 0; i < 6; i++) t2.chairs.push(t2.chairs[0]); t2.seats = t2.chairs.length;
  assert.ok(EP.validate(b).problems.some(p => p.code === 'cap'));
  const c = clone(L); c.catalog = cat; const bar = c.items.find(i => i.kind === 'bar'); Object.assign(bar, { x: c.door.zone.x, y: c.door.zone.y });
  assert.ok(EP.validate(c).problems.some(p => p.code === 'door'));
});

test('Poodiumimoodulid: 4 × 3 m = 6 × (2 × 1)', () => {
  assert.deepStrictEqual(EP.podiumModules(4, 3), { '2 × 1 m': 6 });
  assert.deepStrictEqual(EP.podiumModules(3, 2), { '2 × 1 m': 2, '1 × 1 m': 2 });
});

test('cleanSpec: AI väljund -> ainult lubatud väljad', () => {
  const s = EP.cleanSpec({ guests: '12', area: { l: '10', w: '7,0' }, tent: { type: 'bogus' }, items: [{ kind: 'seating', table: 'xxx', guests: 12, single: 1 }, { kind: 'rocket' }, { kind: 'stage', w: 4, d: 300 }], rules: { wall: '0,25', walk: 9 } }, cat);
  assert.deepStrictEqual(s.area, { l: 10, w: 7 });
  assert.strictEqual(s.tent.type, 'any');
  assert.deepStrictEqual(s.items, [{ kind: 'seating', table: 'round180', guests: 12, single: true }]);
  assert.deepStrictEqual(s.rules, { wall: 0.25 });
});
