// Demo: eelarvutatud lahendused jaanipäeva vaikevastustele (node demo/funrent/build-options.js).
// Leht kasutab neid, kui vastused on muutmata; muude vastustega arvutab sama lahendaja lehel kohapeal.
const fs = require('fs'), path = require('path');
const EP = require('../../js/eventplan.js'), cat = require('../../js/catalog/funrent.json'), DA = require('./answers.js');
const out = [];
for (const v of DA.variants(DA.DEFAULT)) {
  const s = Object.assign({}, v.spec, { _noFix: true }), t = Date.now(), r = EP.solve(s, cat, { max: 1, quick: true });
  if (!r.ok) { console.log(v.id, 'EI MAHU'); continue; }
  const L = r.best; delete L.catalog; delete L.spec._noFix;
  console.log(v.id, L.tent ? L.tent.name : 'ilma telgita', L.seats, 'kohta', L.ok ? 'ok' : 'VIGA', Date.now() - t, 'ms');
  out.push({ id: v.id, title: v.title, sub: v.sub, layout: L });
}
fs.writeFileSync(path.join(__dirname, 'data/options.json'), JSON.stringify({ key: DA.key(DA.DEFAULT), options: out }));
console.log('kirjutatud', out.length);
