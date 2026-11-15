/* Demo: kliendi vastused (struktureeritud küsimustik) -> lahendaja spec. Kasutavad nii leht kui build-options.js. */
(function (G) {
'use strict';
// Jaanipäeva testjuhtum: eramu hoov, 60 külalist, ala 25 × 18 m murul, parkla 20 autole kõrval
const DEFAULT = {
  photo: 'img/hoov.jpg', areaMode: 'size', L: 25, W: 18, surface: 'muru', level: 'tasane', obstacles: ['Puud ääres'], power: 'jah', access: 'jah',
  type: 'Jaanipäev', date: '2027-06-23', time: '18:00', guests: 60, mode: 'mixed', seatStyle: 'round',
  tent: 'soovitage', tentSize: 'auto', tentL: '', tentW: '', walls: 'avatud', heating: 'ei',
  stage: 'podium', stageW: 4, stageD: 3, bandIn: 'jah', dance: 'jah', danceW: 5, danceD: 5, sound: 'jah',
  cater: 0, bar: 'jah', foodTents: 2,
  wcMode: 'arv', wc: 4, parking: 20, parkWhere: 'korval', fence: 'ei', extras: ['Lastenurk', 'Lõkkekoht'],
  style: 'Festival', colors: ['Roheline', 'Valge'], theme: 'Jaanipäev', budget: '3000–6000 €',
  notes: 'Lastele ruumi, valguskett telgi all.', followups: {},
  name: 'Mari Tamm', phone: '+372 5xx xxxx', email: 'mari@näide.ee', consent: true
};
const num = v => { const n = +String(v == null ? '' : v).replace(',', '.'); return isFinite(n) ? n : 0; };
const fmt = v => String(+(+v).toFixed(2)).replace('.', ',');

function seats(A) { const g = Math.max(0, Math.round(num(A.guests))); const s = A.mode === 'seated' ? g : A.mode === 'standing' ? 0 : Math.round(g * 2 / 3); return { g, s, st: g - s }; }
function wcCount(A) { return A.wcMode === 'soovitage' ? Math.max(2, Math.ceil(seats(A).g / 25)) : Math.max(0, Math.round(num(A.wc))); }

function toSpec(A, over) {
  over = over || {};
  const { g, s, st } = seats(A), indoor = A.surface === 'siseruum', noTent = indoor || A.tent === 'ei';
  const spec = { name: `${A.type || 'Üritus'} ${g} külalisele`, venue: indoor ? 'indoor' : 'outdoor', guests: g, area: { l: Math.max(num(A.L), num(A.W)), w: Math.min(num(A.L), num(A.W)) }, items: [] };
  spec.tent = noTent ? { type: 'none' } : { type: 'modular' };
  if (!noTent && A.tentSize === 'fixed' && num(A.tentL) && num(A.tentW)) spec.tent.size = [Math.min(num(A.tentL), num(A.tentW)), Math.max(num(A.tentL), num(A.tentW))];
  if (over.tent) spec.tent = over.tent;
  const style = over.seatStyle || A.seatStyle, T = { round: over.round || 'round180', long: over.long || 'rect240' };
  if (s) { if (style === 'mixed') { const a = Math.ceil(s / 2); spec.items.push({ kind: 'seating', table: T.round, guests: a }, { kind: 'seating', table: T.long, guests: s - a }); } else spec.items.push({ kind: 'seating', table: T[style] || T.round, guests: s }); }
  if (st) spec.items.push({ kind: 'standing', guests: st });
  if (A.stage && A.stage !== 'none') { const d0 = { podium: [4, 3], band: [6, 4], truss: [8, 6] }[A.stage]; const w = num(A.stageW) || d0[0], d = num(A.stageD) || d0[1]; spec.items.push(Object.assign({ kind: 'stage', w, d, name: { podium: 'Lava', band: 'Bändilava', truss: 'Trusslava' }[A.stage] }, A.stage === 'truss' ? { product: 'truss-stage' } : {})); }
  if (A.dance === 'jah' && num(A.danceW) && num(A.danceD)) spec.items.push({ kind: 'dance', w: num(A.danceW), d: num(A.danceD) });
  if (num(A.cater)) spec.items.push({ kind: 'catering', n: Math.round(num(A.cater)) });
  if (A.bar === 'jah') spec.items.push({ kind: 'bar', n: g > 120 ? 2 : 1 });
  if (A.heating === 'jah') spec.items.push({ kind: 'heater', n: Math.ceil(g / 20) });
  if (A.sound === 'jah') spec.items.push({ kind: 'light', n: 1, name: 'Valguskett telgi alla' });
  if (A.fence === 'jah') spec.items.push({ kind: 'fence', n: Math.ceil(2 * (num(A.L) + num(A.W)) / 3.5), name: 'Aiapaneel 3,5 m (+ värav)' });
  const yard = [];
  if (num(A.foodTents)) yard.push({ kind: 'popup', n: Math.round(num(A.foodTents)), size: [3, 3] });
  const wc = wcCount(A); if (wc) yard.push({ kind: 'wc', n: wc });
  if ((A.extras || []).includes('Lastenurk')) yard.push({ kind: 'spot', w: 4, d: 4, name: 'Lastenurk 4 × 4 m' });
  if ((A.extras || []).includes('Mänguala')) yard.push({ kind: 'spot', w: 6, d: 4, name: 'Mänguala 6 × 4 m' });
  if (noTent) spec.items.push(...yard); // ilma telgita: kõik samal alal
  else spec.yard = Object.assign({ items: yard, gateW: 4 }, num(A.parking) && A.parkWhere === 'korval' ? { parking: { cars: Math.round(num(A.parking)) } } : {});
  spec.style = { mood: over.mood || A.style, colors: (A.colors || []).slice(), notes: A.theme || null };
  return spec;
}
// 3 lahendust: kliendi valik, teine istumisviis, väiksemad lauad / lounge
function variants(A) {
  const alt = A.seatStyle === 'long' ? 'round' : 'long', t = A.type || 'Pidu';
  const out = [{ id: 'a', title: `${t}: soovitus`, sub: `${A.seatStyle === 'long' ? 'Pikad lauad' : A.seatStyle === 'mixed' ? 'Ümar- ja pikad lauad' : 'Ümarlauad Ø180'}, ${(A.colors || []).join(' + ').toLowerCase() || 'sinu stiil'}`, spec: toSpec(A) }];
  if (seats(A).s) {
    out.push({ id: 'b', title: alt === 'long' ? 'Pikk pidulaud' : 'Ümarlauad', sub: alt === 'long' ? 'Pikad lauad 240 × 76, rustikaalne' : 'Ümarlauad Ø180, klassikaline', spec: toSpec(A, { seatStyle: alt, mood: alt === 'long' ? 'rustikaalne' : 'klassikaline' }) });
    out.push({ id: 'c', title: 'Õhtune lounge', sub: 'Väiksemad ümarlauad Ø150, elegantne', spec: toSpec(A, { seatStyle: 'round', round: 'round150', mood: 'elegantne' }) });
  }
  return out;
}
// lahendaja jaoks olulised väljad (kas eelarvutatud lahendused kehtivad)
function key(A) { return JSON.stringify(variants(A).map(v => { const s = Object.assign({}, v.spec); delete s.style; delete s.name; return s; })); }

function summary(A) {
  const { g, s, st } = seats(A), out = [];
  out.push(`Ala ${fmt(num(A.L))} × ${fmt(num(A.W))} m, ${A.surface}`);
  out.push(`${g} külalist${A.mode === 'mixed' ? ` (${s} istuvad, ${st} püsti)` : A.mode === 'standing' ? ' püsti' : ' istuvad'}`);
  out.push(`telk: ${A.surface === 'siseruum' ? 'siseruum, telki pole vaja' : A.tent === 'ei' ? 'ei' : A.tentSize === 'fixed' && A.tentL ? fmt(num(A.tentW)) + ' × ' + fmt(num(A.tentL)) + ' m' : A.tent === 'jah' ? 'jah, suuruse valime' : 'soovitage'}`);
  if (A.stage && A.stage !== 'none') out.push(`lava ${fmt(num(A.stageW))} × ${fmt(num(A.stageD))} m`);
  if (A.dance === 'jah') out.push(`tantsupõrand ${fmt(num(A.danceW))} × ${fmt(num(A.danceD))} m`);
  if (A.bar === 'jah') out.push('baar');
  if (num(A.cater)) out.push(`${num(A.cater)} toitlustuslauda`);
  if (num(A.foodTents)) out.push(`${num(A.foodTents)} toidutelki`);
  const wc = wcCount(A); if (wc) out.push(`${wc} WC${A.wcMode === 'soovitage' ? ' (arvutatud)' : ''}`);
  if (num(A.parking)) out.push(`parkla ${num(A.parking)} autole ${A.parkWhere === 'korval' ? 'ala kõrval' : 'eraldi'}`);
  (A.extras || []).forEach(x => out.push(x.toLowerCase()));
  return out;
}
// firmale: vastused, mis ei muuda paigutust, aga on paigalduseks olulised
function notes(A) {
  const n = [];
  n.push(['Pind', A.surface], ['Kalle', A.level], ['Takistused', (A.obstacles || []).join(', ') || 'ei'], ['Elekter', A.power], ['Sõiduk paigalduseks ligi', A.access]);
  if (A.tent !== 'ei') n.push(['Telgi seinad', A.walls], ['Küte', A.heating]);
  n.push(['Bänd külaliste hulgas', A.bandIn], ['Heli ja valgus', A.sound]);
  if (num(A.parking) && A.parkWhere !== 'korval') n.push(['Parkimine', `${num(A.parking)} autot eraldi kohas`]);
  if (A.fence === 'jah') n.push(['Aed + värav', 'jah']);
  if ((A.extras || []).includes('Lõkkekoht')) n.push(['Lõkkekoht', 'ala kõrvale, ≥ 15 m telgist (tuleohutus), ei ole plaanis']);
  n.push(['Stiil', [A.style, (A.colors || []).join(' + '), A.theme].filter(Boolean).join(', ')], ['Eelarve', A.budget || '–']);
  if (A.notes) n.push(['Lisasoovid', A.notes]);
  for (const k in (A.followups || {})) n.push([k, A.followups[k]]);
  return n;
}
// AI täpsustused (demos eelvalmistatud märksõnade järgi, päris tootes ai-chat)
function followups(A) {
  const t = String(A.notes || '').toLowerCase(), out = [];
  if (/laps|laste/.test(t) || (A.extras || []).includes('Lastenurk')) out.push({ q: 'Kas lastenurk peaks olema telgi lähedal (silma all) või eemal (vaiksem)?', a: ['Telgi lähedal', 'Eemal', 'Pole vahet'] });
  if (/valgus|tuled|kett/.test(t)) out.push({ q: 'Kas valguskett ka telgist väljas, näiteks teel parklasse?', a: ['Jah', 'Ainult telgis'] });
  if (!out.length && t.length > 3) out.push({ q: 'Kas see soov mõjutab paigutust (näiteks lisaala või -mööbel)?', a: ['Jah, lisame', 'Ei'] });
  return out.slice(0, 2);
}
// kohustuslikud väljad sammu kaupa
function missing(A, step) {
  const m = [], need = (ok, t) => { if (!ok) m.push(t); };
  if (step === 0) { need(A.photo, 'foto'); need(num(A.L) >= 3 && num(A.W) >= 3, 'ala mõõdud'); need(A.surface, 'pind'); }
  if (step === 1) { need(A.type, 'ürituse tüüp'); need(A.date && A.time, 'kuupäev ja kellaaeg'); need(num(A.guests) >= 1, 'külaliste arv'); need(A.mode, 'istuvad või püsti'); }
  if (step === 2) need(A.tent || A.surface === 'siseruum', 'kas telki on vaja');
  if (step === 8) { need(String(A.name || '').trim().length > 1, 'nimi'); need(/\d{5,}/.test(String(A.phone || '').replace(/\D/g, '')) || /x/.test(A.phone || ''), 'telefon'); need(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(A.email || ''), 'e-post'); need(A.consent, 'nõusolek'); }
  return m;
}
const API = { DEFAULT, toSpec, variants, key, summary, notes, followups, missing, seats, wcCount };
if (typeof module !== 'undefined' && module.exports) module.exports = API; else G.DemoAnswers = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
