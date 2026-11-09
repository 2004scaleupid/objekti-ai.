// Demo andmed: 4 lahendust samast kliendi soovist, igaüks päris lahendaja paigutus (node demo/funrent/build-options.js)
const fs = require('fs'), path = require('path');
const EP = require('../../js/eventplan.js'), cat = require('../../js/catalog/funrent.json');
const base = { name: 'Aiafestival 60 külalisele', venue: 'outdoor', area: { l: 25, w: 18 }, guests: 60,
  items: [{ kind: 'seating', table: 'round180', guests: 40 }, { kind: 'standing', guests: 20 }, { kind: 'stage', w: 4, d: 3, name: 'Lava' }, { kind: 'dance', w: 5, d: 5 }, { kind: 'bar', n: 1 }],
  yard: { items: [{ kind: 'popup', n: 2, size: [3, 3] }, { kind: 'wc', n: 4 }], parking: { cars: 20 }, gateW: 4 } };
const V = [
  { id: 'a', title: 'Roheline aiafestival', sub: 'Kaartelk, ümarlauad ja püstilauad', tent: { type: 'modular' }, style: { mood: 'festival', colors: ['roheline', 'valge'] } },
  { id: 'b', title: 'Pikk pidulaud', sub: 'Moodultelk 10 × 20 m, pikad lauad', tent: { type: 'modular', size: [10, 20] }, seat: 'rect240', style: { mood: 'rustikaalne', colors: ['roheline', 'valge', 'puit'] } },
  { id: 'd', title: 'Õhtune lounge', sub: 'Moodultelk, väiksemad ümarlauad Ø150', tent: { type: 'modular' }, seat: 'round150', style: { mood: 'elegantne', colors: ['valge', 'smaragd', 'kuld'] } }
];
const out = [];
for (const v of V) {
  const s = JSON.parse(JSON.stringify(base)); s.tent = v.tent; s.style = v.style; s._noFix = true;
  if (v.seat) s.items[0].table = v.seat;
  const t = Date.now(), r = EP.solve(s, cat, { max: 1, quick: true });
  if (!r.ok) { console.log(v.id, 'EI MAHU'); continue; }
  const L = r.best; delete L.catalog; delete L.spec._noFix;
  console.log(v.id, L.tent.name, L.seats, 'kohta', L.ok ? 'ok' : 'VIGA', Date.now() - t, 'ms');
  out.push(Object.assign({ id: v.id, title: v.title, sub: v.sub }, { layout: L }));
}
fs.writeFileSync(path.join(__dirname, 'data/options.json'), JSON.stringify(out));
console.log('kirjutatud', out.length, 'lahendust', (fs.statSync(path.join(__dirname, 'data/options.json')).size / 1024).toFixed(0) + ' KB');
