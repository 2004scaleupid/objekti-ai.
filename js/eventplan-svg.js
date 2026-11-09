/* Sündmuse planeerija: 2D plaan SVG-na samast paigutusest (kõik tekstid joonistab kood, mitte AI). */
(function (G) {
'use strict';
const EP = (typeof module !== 'undefined' && module.exports) ? require('./eventplan.js') : G.EventPlan;
const fmt = EP.fmt, esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const COL = { stage: '#3d3a36', dance: '#d9d4cb', bar: '#8a6a4a', catering: '#b8946a', popup: '#ffffff', wc: '#7a8a96', audience: '#e8efe4', seating: '#ffffff', standing: '#f3efe8' };
const KIND = { stage: 'Lava', dance: 'Tantsupõrand', bar: 'Baarilett', catering: 'Toitlustus', popup: 'Pop-up telgid', wc: 'WC', audience: 'Publikuala', seating: 'Lauad ja toolid', standing: 'Püstivastuvõtt' };

function svg(L, opt) {
  opt = opt || {};
  const room = L.room, o = L.origin || { x: 0, y: 0 }, A = L.area ? { L: Math.max(L.area.l, L.area.w), W: Math.min(L.area.l, L.area.w) } : null;
  const padM = 2.2, ext = A ? { x0: -o.x, y0: -o.y, x1: A.L - o.x, y1: A.W - o.y } : { x0: 0, y0: 0, x1: room.L, y1: room.W };
  ext.x0 -= padM; ext.y0 -= padM; ext.x1 += padM; ext.y1 += padM;
  const Wpx = opt.width || 1000, s = Wpx / (ext.x1 - ext.x0), Hpx = Math.round((ext.y1 - ext.y0) * s);
  const X = x => +((x - ext.x0) * s).toFixed(1), Y = y => +((y - ext.y0) * s).toFixed(1), S = v => +(v * s).toFixed(1);
  const fs = Math.max(9, Math.min(15, s * .32)), bad = new Set(L.bad || []);
  const out = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Wpx} ${Hpx}" width="${Wpx}" height="${Hpx}" font-family="Inter Tight, Helvetica, Arial, sans-serif" role="img" aria-label="Sündmuse plaan">`);
  out.push(`<defs><pattern id="hz" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="#b5ab9b" stroke-width="1.4"/></pattern><pattern id="hd" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)"><line x1="0" y1="0" x2="0" y2="6" stroke="#5aa06a" stroke-width="1.2"/></pattern><pattern id="hr" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="#e5482d" stroke-width="1.4"/></pattern>
<marker id="ar" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 1 L10 5 L0 9" fill="none" stroke="#16130F" stroke-width="1.4"/></marker></defs>`);
  out.push(`<rect width="100%" height="100%" fill="#fbfaf7"/>`);
  if (A) { out.push(`<rect x="${X(-o.x)}" y="${Y(-o.y)}" width="${S(A.L)}" height="${S(A.W)}" fill="#eef3ea" stroke="#7d9a6f" stroke-dasharray="6 4" stroke-width="1.2"/>`); out.push(txt(X(-o.x) + 6, Y(-o.y) + fs + 3, `Ala ${fmt(A.W)} × ${fmt(A.L)} m`, fs * .85, '#4f6b43', 'start', 600)); }
  // telk
  if (L.tent) {
    const m = L.tent.margin; out.push(`<rect x="${X(-m)}" y="${Y(-m)}" width="${S(room.L + 2 * m)}" height="${S(room.W + 2 * m)}" fill="none" stroke="#9aa58f" stroke-width="1" stroke-dasharray="2 3"/>`);
  }
  out.push(`<rect x="${X(0)}" y="${Y(0)}" width="${S(room.L)}" height="${S(room.W)}" fill="#ffffff" stroke="#16130F" stroke-width="${L.tent ? 3 : 1.5}"/>`);
  if (L.virtual) out.push(`<rect x="${X(0)}" y="${Y(0)}" width="${S(L.virtual.L)}" height="${S(L.virtual.W)}" fill="none"/>`);
  // seinavahe
  const wv = L.rules.wall; out.push(`<rect x="${X(wv)}" y="${Y(wv)}" width="${S(room.L - 2 * wv)}" height="${S(room.W - 2 * wv)}" fill="none" stroke="#d8d2c8" stroke-dasharray="3 3"/>`);
  // sissepääs
  if (L.door) { const z = L.door.zone; out.push(`<rect x="${X(z.x)}" y="${Y(z.y)}" width="${S(z.w)}" height="${S(z.d)}" fill="url(#hd)" stroke="#5aa06a" stroke-width="1"/>`);
    const k = L.door.wall, gx = k % 2 === 0 ? [X(z.x), X(z.x + z.w)] : null, gy = k % 2 ? [Y(z.y), Y(z.y + z.d)] : null;
    if (gx) { const yy = Y(k === 0 ? 0 : room.W); out.push(`<line x1="${gx[0]}" y1="${yy}" x2="${gx[1]}" y2="${yy}" stroke="#fbfaf7" stroke-width="5"/>`); out.push(txt((gx[0] + gx[1]) / 2, k === 0 ? yy - 6 : yy + fs + 4, `Sissepääs ${fmt(L.door.w)} m`, fs * .9, '#2f7a43', 'middle', 700)); }
    else { const xx = X(k === 3 ? 0 : room.L); out.push(`<line x1="${xx}" y1="${gy[0]}" x2="${xx}" y2="${gy[1]}" stroke="#fbfaf7" stroke-width="5"/>`); out.push(rtxt(k === 3 ? xx - 7 : xx + 7, (gy[0] + gy[1]) / 2, `Sissepääs ${fmt(L.door.w)} m`, fs * .9, '#2f7a43', k === 3 ? -90 : 90)); }
  }
  // tsoonid
  for (const it of L.items) for (const z of it.zones || []) out.push(`<rect x="${X(z.x)}" y="${Y(z.y)}" width="${S(z.w)}" height="${S(z.d)}" fill="url(#hz)" stroke="#b5ab9b" stroke-width=".6" stroke-dasharray="3 3"/>`);
  // esemed
  const labels = [];
  for (const it of L.items) {
    const red = bad.has(it.id), stroke = red ? '#e5482d' : '#16130F', sw = red ? 2.4 : 1.2;
    if (it.kind === 'seating' || it.kind === 'standing') {
      if (it.kind === 'standing') for (const z of it.zonesArea || []) out.push(`<rect x="${X(z.x)}" y="${Y(z.y)}" width="${S(z.w)}" height="${S(z.d)}" fill="${COL.standing}" stroke="#c9bfae" stroke-dasharray="4 3"/>`);
      for (const t of it.tables) {
        for (const c of t.chairs || []) out.push(`<rect x="${-S(.225)}" y="${-S(.25)}" width="${S(.45)}" height="${S(.5)}" rx="${S(.08)}" transform="translate(${X(c.x)} ${Y(c.y)}) rotate(${(c.a * 180 / Math.PI + 90).toFixed(1)})" fill="#efe9df" stroke="${red ? '#e5482d' : '#7d756b'}" stroke-width=".8"/>`);
        if (t.shape === 'round' || t.shape === 'cocktail') out.push(`<circle cx="${X(t.x)}" cy="${Y(t.y)}" r="${S(t.d / 2)}" fill="#fff" stroke="${stroke}" stroke-width="${sw}"/>`);
        else { out.push(`<rect x="${X(t.x)}" y="${Y(t.y)}" width="${S(t.w)}" height="${S(t.d)}" fill="#fff" stroke="${stroke}" stroke-width="${sw}"/>`); for (let i = 1; i < t.nTab; i++) { const a = i * t.unitW; out.push(t.along ? `<line x1="${X(t.x + a)}" y1="${Y(t.y)}" x2="${X(t.x + a)}" y2="${Y(t.y + t.d)}" stroke="#bbb" stroke-width=".8"/>` : `<line x1="${X(t.x)}" y1="${Y(t.y + a)}" x2="${X(t.x + t.w)}" y2="${Y(t.y + a)}" stroke="#bbb" stroke-width=".8"/>`); } }
        if (t.shape === 'round' && S(t.d) > fs * 1.6) out.push(txt(X(t.x), Y(t.y) + fs * .35, String(t.seats), fs * .9, '#7d756b', 'middle', 600));
      }
      continue;
    }
    const fill = it.kind === 'dance' ? 'url(#dance)' : COL[it.kind] || '#eee';
    if (it.kind === 'dance') out.push(`<defs><pattern id="dance" width="${S(1)}" height="${S(1)}" patternUnits="userSpaceOnUse" x="${X(it.x)}" y="${Y(it.y)}"><rect width="${S(1)}" height="${S(1)}" fill="#f4f1ec"/><rect width="${S(.5)}" height="${S(.5)}" fill="#ddd6ca"/><rect x="${S(.5)}" y="${S(.5)}" width="${S(.5)}" height="${S(.5)}" fill="#ddd6ca"/></pattern></defs>`);
    out.push(`<rect x="${X(it.x)}" y="${Y(it.y)}" width="${S(it.w)}" height="${S(it.d)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" ${it.kind === 'audience' ? 'stroke-dasharray="6 4"' : ''}/>`);
    if (red) out.push(`<rect x="${X(it.x)}" y="${Y(it.y)}" width="${S(it.w)}" height="${S(it.d)}" fill="url(#hr)" opacity=".5"/>`);
    if ((it.kind === 'popup' || it.kind === 'wc' || it.kind === 'catering' || it.kind === 'bar') && it.n > 1) for (let i = 1; i < it.n; i++) { const step = it.kind === 'popup' ? it.unitW + L.rules.popupGap : it.unitW, a = i * step; const hor = it.w >= it.d; out.push(hor ? `<line x1="${X(it.x + a)}" y1="${Y(it.y)}" x2="${X(it.x + a)}" y2="${Y(it.y + it.d)}" stroke="#16130F" stroke-width=".6" opacity=".5"/>` : `<line x1="${X(it.x)}" y1="${Y(it.y + a)}" x2="${X(it.x + it.w)}" y2="${Y(it.y + a)}" stroke="#16130F" stroke-width=".6" opacity=".5"/>`); }
  }
  const labelOut = [];
  // sildid (nimi + mõõt) — esemete sisse või kõrvale
  for (const it of L.items) {
    const dark = it.kind === 'stage' || it.kind === 'bar' || it.kind === 'wc';
    let title = it.kind === 'seating' ? `${it.name.replace(/^Ümmargune laud /, '').replace(/^Kokkupandav laud /, 'Laud ')} · ${it.tables.length > 1 ? it.tables.length + ' lauda · ' : ''}${it.seats} kohta` : it.name;
    if (it.kind === 'seating' && it.tables[0].shape === 'rect') title = `Pikk laud ${fmt(it.tables[0].nTab * it.tables[0].unitW)} m (${it.tables[0].nTab} × ${fmt(it.tables[0].unitW * 100, 0)} cm) · ${it.seats} kohta`;
    if (it.kind === 'standing') title = `Püstivastuvõtt ${it.guests} in · ${it.tables.length} pukklauda`;
    const sub = (it.kind === 'seating' || it.kind === 'standing' || it.kind === 'audience') ? '' : `${fmt(Math.min(it.w, it.d))} × ${fmt(Math.max(it.w, it.d))} m`;
    const cx = X(it.x + it.w / 2), cy = Y(it.y + it.d / 2), tw = Math.max(title.length, sub.length) * fs * .52;
    const inside = S(it.w) > tw + 8 && S(it.d) > fs * 2.6 && it.kind !== 'seating' && it.kind !== 'standing';
    if (inside) { labelOut.push(txt(cx, cy - (sub ? fs * .2 : -fs * .35), title, fs, dark ? '#fff' : '#16130F', 'middle', 700)); if (sub) labelOut.push(txt(cx, cy + fs * .95, sub, fs * .85, dark ? '#e7e2da' : '#5b544c', 'middle', 500)); }
    else labels.push({ x: cx, y: Y(it.y) - 6, t: title + (sub ? ' · ' + sub : ''), red: bad.has(it.id), it });
  }
  // mõõdud: telgi küljed
  const dims = [];
  dims.push(dimLine(X(0), Y(0) - S(1.1), X(room.L), Y(0) - S(1.1), fmt(room.L) + ' m', true));
  dims.push(dimLine(X(0) - S(1.1), Y(0), X(0) - S(1.1), Y(room.W), fmt(room.W) + ' m', true, true));
  // iga ploki kaugus kahest lähimast seinast + naabrid
  const blocks = L.items.map(b => ({ b, r: b.kind === 'seating' || b.kind === 'standing' ? bboxT(b) : { x: b.x, y: b.y, w: b.w, d: b.d } }));
  for (const { b, r } of blocks) {
    const cx = r.x + r.w / 2, cy = r.y + r.d / 2;
    const dl = r.x, dr = room.L - r.x - r.w, dt = r.y, db = room.W - r.y - r.d;
    const free = (x0, y0, x1, y1) => !blocks.some(o => o.b !== b && Math.min(x0, x1) < o.r.x + o.r.w - .01 && Math.max(x0, x1) > o.r.x + .01 && Math.min(y0, y1) < o.r.y + o.r.d - .01 && Math.max(y0, y1) > o.r.y + .01);
    const hx = dl <= dr ? [0, r.x, dl] : [r.x + r.w, room.L, dr], hy = dt <= db ? [0, r.y, dt] : [r.y + r.d, room.W, db];
    if (free(hx[0], cy, hx[1], cy)) dims.push(dimM(hx[0], cy, hx[1], cy, hx[2]));
    if (free(cx, hy[0], cx, hy[1])) dims.push(dimM(cx, hy[0], cx, hy[1], hy[2]));
  }
  for (let i = 0; i < blocks.length; i++) for (let j = i + 1; j < blocks.length; j++) {
    const a = blocks[i].r, b = blocks[j].r, ka = blocks[i].b.kind, kb = blocks[j].b.kind;
    if ((ka === 'stage' && kb === 'dance') || (kb === 'stage' && ka === 'dance')) continue;
    const ox0 = Math.max(a.x, b.x), ox1 = Math.min(a.x + a.w, b.x + b.w), oy0 = Math.max(a.y, b.y), oy1 = Math.min(a.y + a.d, b.y + b.d);
    if (ox1 - ox0 > .3) { const x = (ox0 + ox1) / 2, g1 = a.y + a.d <= b.y ? [a.y + a.d, b.y] : b.y + b.d <= a.y ? [b.y + b.d, a.y] : null; if (g1 && g1[1] - g1[0] < 4) dims.push(dimM(x, g1[0], x, g1[1], g1[1] - g1[0])); }
    else if (oy1 - oy0 > .3) { const y = (oy0 + oy1) / 2, g1 = a.x + a.w <= b.x ? [a.x + a.w, b.x] : b.x + b.w <= a.x ? [b.x + b.w, a.x] : null; if (g1 && g1[1] - g1[0] < 4) dims.push(dimM(g1[0], y, g1[1], y, g1[1] - g1[0])); }
  }
  // laudade vahe grupis (üks näidis) + tooli taga
  for (const it of L.items) if (it.kind === 'seating' && it.tables.length > 1) {
    const t = it.tables, a = t[0], b = t.find(u => u !== a && Math.abs(u.y - a.y) < .01) || t[1];
    if (a.body && b.body) { const g = EP.gap(a.body, b.body); if (Math.abs(a.y - b.y) < .01) { const x0 = Math.min(a.body.x, b.body.x) + (a.body.r || 0), x1 = Math.max(a.body.x, b.body.x) - (b.body.r || 0); dims.push(dimM(x0, a.y, x1, a.y, g, true)); } }
  }
  out.push(dims.join(''));
  out.push(labelOut.join(''));
  // välised sildid (lihtne kattumise vältimine)
  const placedL = [];
  for (const l of labels) {
    const w = l.t.length * fs * .52 + 10, h = fs * 1.5; let y = l.y;
    for (let k = 0; k < 8 && placedL.some(p => Math.abs(p.x - l.x) < (p.w + w) / 2 && Math.abs(p.y - y) < h); k++) y -= h;
    placedL.push({ x: l.x, y, w });
    out.push(`<rect x="${(l.x - w / 2).toFixed(1)}" y="${(y - fs * 1.05).toFixed(1)}" width="${w.toFixed(1)}" height="${(fs * 1.4).toFixed(1)}" rx="4" fill="${l.red ? '#e5482d' : '#16130F'}" opacity=".9"/>`);
    out.push(txt(l.x, y - fs * .05, l.t, fs * .9, '#fff', 'middle', 600));
  }
  // mõõtkava
  const sb = niceBar(ext.x1 - ext.x0), sx = X(ext.x0 + .6), sy = Hpx - 14;
  out.push(`<g><line x1="${sx}" y1="${sy}" x2="${sx + S(sb)}" y2="${sy}" stroke="#16130F" stroke-width="2"/><line x1="${sx}" y1="${sy - 4}" x2="${sx}" y2="${sy + 4}" stroke="#16130F"/><line x1="${sx + S(sb)}" y1="${sy - 4}" x2="${sx + S(sb)}" y2="${sy + 4}" stroke="#16130F"/>${txt(sx + S(sb) / 2, sy - 5, sb + ' m', fs * .8, '#16130F', 'middle', 600)}</g>`);
  out.push('</svg>');
  return out.join('');

  function txt(x, y, t, size, fill, anchor, wt) { return `<text x="${(+x).toFixed(1)}" y="${(+y).toFixed(1)}" font-size="${size.toFixed(1)}" fill="${fill}" text-anchor="${anchor}" font-weight="${wt || 400}">${esc(t)}</text>`; }
  function rtxt(x, y, t, size, fill, rot) { return `<text transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${rot})" font-size="${size.toFixed(1)}" fill="${fill}" text-anchor="middle" font-weight="700">${esc(t)}</text>`; }
  function dimM(x0, y0, x1, y1, v, inner) { if (v < .05) return ''; return dimLine(X(x0), Y(y0), X(x1), Y(y1), fmt(v) + ' m', false, x0 === x1, inner); }
  function dimLine(x0, y0, x1, y1, t, main, vert, inner) {
    const len = Math.hypot(x1 - x0, y1 - y0); if (len < 6) return '';
    const col = main ? '#16130F' : inner ? '#8a5a2b' : '#2b6cb0', mx = (x0 + x1) / 2, my = (y0 + y1) / 2, f = main ? fs : fs * .78;
    const tick = main ? `<line x1="${x0 - (vert ? 5 : 0)}" y1="${y0 - (vert ? 0 : 5)}" x2="${x0 + (vert ? 5 : 0)}" y2="${y0 + (vert ? 0 : 5)}" stroke="${col}"/><line x1="${x1 - (vert ? 5 : 0)}" y1="${y1 - (vert ? 0 : 5)}" x2="${x1 + (vert ? 5 : 0)}" y2="${y1 + (vert ? 0 : 5)}" stroke="${col}"/>` : '';
    const tw = t.length * f * .55 + 6;
    const label = vert ? `<g transform="translate(${mx.toFixed(1)} ${my.toFixed(1)}) rotate(-90)"><rect x="${(-tw / 2).toFixed(1)}" y="${(-f * .75).toFixed(1)}" width="${tw.toFixed(1)}" height="${(f * 1.3).toFixed(1)}" fill="#fbfaf7" opacity=".9" rx="2"/><text y="${(f * .35).toFixed(1)}" font-size="${f.toFixed(1)}" fill="${col}" text-anchor="middle" font-weight="600">${esc(t)}</text></g>`
      : `<rect x="${(mx - tw / 2).toFixed(1)}" y="${(my - f * .75).toFixed(1)}" width="${tw.toFixed(1)}" height="${(f * 1.3).toFixed(1)}" fill="#fbfaf7" opacity=".9" rx="2"/><text x="${mx.toFixed(1)}" y="${(my + f * .35).toFixed(1)}" font-size="${f.toFixed(1)}" fill="${col}" text-anchor="middle" font-weight="600">${esc(t)}</text>`;
    const showLabel = len > tw * .6 || main;
    return `<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" stroke="${col}" stroke-width="${main ? 1.2 : 1}" ${main ? '' : 'marker-start="url(#ar)" marker-end="url(#ar)"'}/>${tick}${showLabel ? label : ''}`;
  }
}
function bboxT(it) { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; const sh = it.kind === 'standing' && it.zonesArea && it.zonesArea.length ? it.zonesArea : it.tables.map(t => t.body); for (const s of sh) { const a = s.t === 'c' ? [s.x - s.r, s.y - s.r, s.x + s.r, s.y + s.r] : [s.x, s.y, s.x + s.w, s.y + s.d]; x0 = Math.min(x0, a[0]); y0 = Math.min(y0, a[1]); x1 = Math.max(x1, a[2]); y1 = Math.max(y1, a[3]); } return { x: x0, y: y0, w: x1 - x0, d: y1 - y0 }; }
function niceBar(span) { const t = span / 6; for (const v of [1, 2, 5, 10, 20, 50]) if (v >= t) return v; return 100; }

function legendHtml(L) {
  const kinds = [...new Set(L.items.map(i => i.kind))];
  const sw = k => k === 'dance' ? 'background:repeating-conic-gradient(#ddd6ca 0 25%,#f4f1ec 0 50%) 0 0/10px 10px' : `background:${COL[k]}`;
  return `<ul class="eplg">${kinds.map(k => `<li><i style="${sw(k)}"></i>${KIND[k] || k}</li>`).join('')}<li><i style="background:repeating-linear-gradient(45deg,#c9c2b6 0 1.5px,transparent 1.5px 5px)"></i>Vaba ala (lava ees, teenindus)</li><li><i style="background:repeating-linear-gradient(-45deg,#5aa06a 0 1.5px,transparent 1.5px 5px)"></i>Sissepääs, hoia vaba</li><li><i style="border:2px solid #2b6cb0;background:none"></i>Kaugus (m)</li>${(L.bad || []).length ? '<li><i style="background:#e5482d"></i>Reegel ei pea</li>' : ''}</ul>`;
}
function checksHtml(L) { return `<ul class="epck">${L.checks.map(c => `<li class="${c.ok ? 'ok' : 'no'}">${c.ok ? '✓' : '✗'} ${esc(c.text)}</li>`).join('')}</ul>`; }
function bomHtml(L) { return `<table class="epbom"><thead><tr><th>Toode</th><th>Kogus</th></tr></thead><tbody>${L.bom.map(b => `<tr><td>${esc(b.name)}${b.source === 'STD' ? ' <small>STD</small>' : ''}</td><td>${b.qty}</td></tr>`).join('')}</tbody></table>`; }

const API = { svg, legendHtml, checksHtml, bomHtml };
if (typeof module !== 'undefined' && module.exports) module.exports = API; else { G.EventPlan = G.EventPlan || {}; Object.assign(G.EventPlan, { svg: API }); }
})(typeof globalThis !== 'undefined' ? globalThis : this);
