/* Vaade3D sündmuse planeerija: deterministlik paigutuse lahendaja (mitte AI).
   Sisend: spec (ala, külalised, esemed) + kataloog (ettevõtte tooted, products.spec) + reeglid.
   Väljund: üks paigutus, millest tulevad 2D plaan, 3D vaade, pilt ja tootenimekiri.
   Ühikud meetrites. Telgi sees: x piki telki (0..L), y risti (0..W), nurk 0,0. */
(function (G) {
'use strict';

// ---------- reeglid ----------
const DEF_RULES = {
  wall: 0.25, tentMargin: { modular: 0.3, pagoda: 0.3, popup: 0.2, stretch: 2.0, none: 0 },
  walkSmall: 1.0, walkLarge: 1.2, walkLargeFrom: 51, entryDepth: 1.5,
  stageFront: 1.5, stageSide: 1.0, perGuest: 0.6, serviceZone: 1.0, barWork: 1.0,
  standM2: 0.8, audienceM2: 0.5, popupGap: 0.4, chairD: 0.5, push: 0.75, doorW: 2
};
function rulesFor(spec, cat) {
  const r = JSON.parse(JSON.stringify(DEF_RULES));
  for (const src of [cat && cat.rules, spec.rules]) if (src) for (const k in src) r[k] = (typeof src[k] === 'object' && !Array.isArray(src[k])) ? Object.assign({}, r[k], src[k]) : src[k];
  const g = spec.guests || 0;
  r.walk = r.walk || (g >= r.walkLargeFrom ? r.walkLarge : r.walkSmall);
  const ch = prod(cat, 'chair'); if (ch) { r.chairD = ch.spec.d || r.chairD; r.push = ch.spec.push || r.push; }
  return r;
}

// ---------- kataloog ----------
function prod(cat, idOrKind) { const P = (cat && cat.products) || []; return P.find(p => p.id === idOrKind) || P.find(p => p.spec && p.spec.kind === idOrKind); }
function tentOptions(cat, want, area, R) {
  const out = [];
  for (const p of (cat.products || [])) {
    const s = p.spec || {}; if (s.kind !== 'tent') continue;
    if (want && want.type && want.type !== 'any' && want.type !== s.type) continue;
    if ((!want || !want.type || want.type === 'any') && s.type === 'popup') continue;
    const sizes = s.sizes ? s.sizes.slice() : [];
    if (s.l) for (let l = s.l.from; l <= s.l.to + 1e-9; l += s.l.step) sizes.push([s.w, l]);
    for (const [a, b] of sizes) {
      const W = Math.min(a, b), L = Math.max(a, b), m = R.tentMargin[s.type] != null ? R.tentMargin[s.type] : 0.3;
      if (want && want.size) { const [ww, ll] = [Math.min(...want.size), Math.max(...want.size)]; if (Math.abs(ww - W) > .01 || Math.abs(ll - L) > .01) continue; }
      if (area) { const aL = Math.max(area.l, area.w), aW = Math.min(area.l, area.w); if (L + 2 * m > aL + 1e-9 || W + 2 * m > aW + 1e-9) continue; }
      out.push({ product: p.id, name: `${p.name} ${fmt(W)} × ${fmt(L)} m`, type: s.type, W, L, margin: m, doorW: s.doorW || R.doorW, sideH: s.sideH || 2.3 });
    }
  }
  // sama mõõt mitmest tootest: jäta odavam/lihtsam (esimene); järjesta pindala järgi
  const seen = new Set();
  return out.filter(t => { const k = t.type + t.W + 'x' + t.L; if (seen.has(k)) return false; seen.add(k); return true; }).sort((a, b) => a.W * a.L - b.W * b.L || a.L - b.L);
}
const fmt = (v, d) => { const s = (+v).toFixed(d == null ? 2 : d).replace(/\.?0+$/, ''); return s.replace('.', ','); };

// ---------- geomeetria ----------
// kuju: {t:'r',x,y,w,d} või {t:'c',x,y,r} (keskpunkt)
function gap(a, b) {
  if (a.t === 'c' && b.t === 'c') return Math.hypot(a.x - b.x, a.y - b.y) - a.r - b.r;
  if (a.t === 'c') return gapRC(b, a); if (b.t === 'c') return gapRC(a, b);
  const dx = Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w), 0), dy = Math.max(a.y - (b.y + b.d), b.y - (a.y + a.d), 0);
  if (dx > 0 && dy > 0) return Math.hypot(dx, dy);
  if (dx > 0 || dy > 0) return Math.max(dx, dy);
  return -Math.min(a.x + a.w - b.x, b.x + b.w - a.x, a.y + a.d - b.y, b.y + b.d - a.y); // kattuvus (negatiivne)
}
function gapRC(r, c) { const px = Math.max(r.x, Math.min(c.x, r.x + r.w)), py = Math.max(r.y, Math.min(c.y, r.y + r.d)); const inside = c.x > r.x && c.x < r.x + r.w && c.y > r.y && c.y < r.y + r.d; return inside ? -c.r : Math.hypot(c.x - px, c.y - py) - c.r; }
function wallDist(s, room) { // väikseim kaugus seinast (negatiivne = väljas)
  if (s.t === 'c') return Math.min(s.x - s.r, s.y - s.r, room.L - s.x - s.r, room.W - s.y - s.r);
  return Math.min(s.x, s.y, room.L - s.x - s.w, room.W - s.y - s.d);
}
const E = 1e-6;

// ---------- plokid ----------
// ploki kohalik kuju: laius piki seina (w), sügavus seinast eemale (d). Paigutus: sein k (0 ülal y=0, 1 paremal x=L, 2 all y=W, 3 vasakul x=0), nihe t piki seina, kaugus seinast off.
function place(room, k, t, off, w, d) {
  if (k === 0) return { x: t, y: off, w, d };
  if (k === 2) return { x: t, y: room.W - off - d, w, d };
  if (k === 3) return { x: off, y: t, w: d, d: w };
  return { x: room.L - off - d, y: t, w: d, d: w };
}
const wallLen = (room, k) => (k % 2 === 0 ? room.L : room.W);
// riba ploki ühel küljel: side 'front' (seinast eemale), 'back', 'left', 'right'
function strip(b, k, side, depth, along) {
  // b: maailma ristkülik; k: sein, millega plokk on seljaga
  const fr = { 0: [0, 1], 2: [0, -1], 3: [1, 0], 1: [-1, 0] }[k]; // suund seinast eemale
  let dir;
  if (side === 'front') dir = fr; else if (side === 'back') dir = [-fr[0], -fr[1]];
  else if (side === 'left') dir = [fr[1], -fr[0]]; else dir = [-fr[1], fr[0]];
  const ext = along || 0;
  if (dir[0] === 1) return { t: 'r', x: b.x + b.w, y: b.y - ext, w: depth, d: b.d + 2 * ext };
  if (dir[0] === -1) return { t: 'r', x: b.x - depth, y: b.y - ext, w: depth, d: b.d + 2 * ext };
  if (dir[1] === 1) return { t: 'r', x: b.x - ext, y: b.y + b.d, w: b.w + 2 * ext, d: depth };
  return { t: 'r', x: b.x - ext, y: b.y - depth, w: b.w + 2 * ext, d: depth };
}

function buildBlocks(spec, cat, R) {
  const fixed = [], flex = [], bomOnly = [];
  let ci = 0, bi = 0;
  for (const it of spec.items || []) {
    const n = it.n || 1;
    if (it.kind === 'stage') fixed.push({ id: 'stage', kind: 'stage', name: it.name || 'Lava', w: Math.max(it.w, it.d), d: Math.min(it.w, it.d), product: it.product || (prod(cat, 'podium') ? 'podium' : null), h: it.h });
    else if (it.kind === 'dance') fixed.push({ id: 'dance', kind: 'dance', name: 'Tantsupõrand', w: Math.max(it.w, it.d), d: Math.min(it.w, it.d), attach: 'stage' });
    else if (it.kind === 'audience') fixed.push({ id: 'audience', kind: 'audience', name: 'Publikuala', guests: it.guests, attach: 'stage-front' });
    else if (it.kind === 'catering') { const p = prod(cat, it.product || 'cater183'), w = it.w || (p && p.spec.w) || 1.83, d = it.d || (p && p.spec.d) || .76; fixed.push({ id: 'cater' + (++ci), kind: 'catering', name: n > 1 ? `Toitlustuslauad ${n} tk` : 'Toitlustuslaud', unitW: w, n, w: w * n, d, product: p && p.id }); }
    else if (it.kind === 'bar') { const p = prod(cat, 'bar'), w = it.w || (p && p.spec.w) || 2, d = it.d || (p && p.spec.d) || 1; fixed.push({ id: 'bar' + (++bi), kind: 'bar', name: n > 1 ? `Baarilett ${n} × ${fmt(w)} m` : 'Baarilett', unitW: w, n, w: w * n, d, product: p && p.id }); }
    else if (it.kind === 'popup') { const s = it.size || [3, 3]; fixed.push({ id: 'popup', kind: 'popup', name: `Pop-up telgid ${n} × ${fmt(s[0])}×${fmt(s[1])} m`, unitW: s[0], n, w: n * s[0] + (n - 1) * R.popupGap, d: s[1], size: s, product: 'tent-popup' }); }
    else if (it.kind === 'wc') { const p = prod(cat, it.product || 'wc'), w = (p && p.spec.w) || 1.2, d = (p && p.spec.d) || 1.2; fixed.push({ id: 'wc', kind: 'wc', name: `WC ${n} tk`, unitW: w, n, w: n * w, d, product: p && p.id }); }
    else if (it.kind === 'seating') flex.push(Object.assign({ kind: 'seating' }, it));
    else if (it.kind === 'standing') flex.push(Object.assign({ kind: 'standing' }, it));
    else bomOnly.push(it);
  }
  const ord = { stage: 0, dance: 1, audience: 2, bar: 3, catering: 4, popup: 5, wc: 6 };
  fixed.sort((a, b) => ord[a.kind] - ord[b.kind]);
  return { fixed, flex, bomOnly };
}

// ploki maailmakuju + tsoonid sein k, nihe t korral
function realize(bl, room, k, t, R, extra) {
  let off, body, zones = [];
  if (bl.kind === 'stage') {
    off = R.stageSide; body = place(room, k, t, off, bl.w, bl.d);
    zones = [strip(body, k, 'front', R.stageFront, R.stageSide), strip(body, k, 'back', R.stageSide, R.stageSide), strip(body, k, 'left', R.stageSide), strip(body, k, 'right', R.stageSide)];
  } else if (bl.kind === 'bar') {
    off = R.barWork; body = place(room, k, t, off, bl.w, bl.d);
    zones = [strip(body, k, 'back', R.barWork), strip(body, k, 'front', R.serviceZone)];
  } else if (bl.kind === 'catering' || bl.kind === 'popup' || bl.kind === 'wc') {
    off = R.wall; body = place(room, k, t, off, bl.w, bl.d);
    zones = [strip(body, k, 'front', R.serviceZone)];
  } else { body = extra; }
  zones.forEach(z => z.type = bl.kind);
  return Object.assign({ t: 'r' }, body, { wallK: k, zones });
}

// ---------- vaba ruumi täitmine (istumine, püstilaudad) ----------
function grid(room, cell) { const nx = Math.max(1, Math.round(room.L / cell)), ny = Math.max(1, Math.round(room.W / cell)); return { nx, ny, cx: room.L / nx, cy: room.W / ny, a: new Uint8Array(nx * ny) }; }
function blockShape(g, s, inflate, val) {
  const x0 = s.t === 'c' ? s.x - s.r : s.x, y0 = s.t === 'c' ? s.y - s.r : s.y, x1 = s.t === 'c' ? s.x + s.r : s.x + s.w, y1 = s.t === 'c' ? s.y + s.r : s.y + s.d;
  const i0 = Math.max(0, Math.floor((x0 - inflate) / g.cx + E)), i1 = Math.min(g.nx - 1, Math.ceil((x1 + inflate) / g.cx - E) - 1);
  const j0 = Math.max(0, Math.floor((y0 - inflate) / g.cy + E)), j1 = Math.min(g.ny - 1, Math.ceil((y1 + inflate) / g.cy - E) - 1);
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    if (inflate > 0) { const c = { t: 'r', x: i * g.cx, y: j * g.cy, w: g.cx, d: g.cy }; if (gap(c, s) >= inflate - E) continue; }
    g.a[j * g.nx + i] = val || 1;
  }
}
function largestRect(g) { // suurim vaba ristkülik (histogramm)
  const h = new Int32Array(g.nx); let best = null;
  for (let j = 0; j < g.ny; j++) {
    for (let i = 0; i < g.nx; i++) h[i] = g.a[j * g.nx + i] ? 0 : h[i] + 1;
    const st = [];
    for (let i = 0; i <= g.nx; i++) {
      const v = i < g.nx ? h[i] : 0; let s = i;
      while (st.length && st[st.length - 1][1] >= v) { const [si, sv] = st.pop(); const area = sv * (i - si); if (sv && (!best || area > best.area)) best = { area, i0: si, i1: i - 1, j0: j - sv + 1, j1: j }; s = si; }
      st.push([s, v]);
    }
  }
  return best && { x: best.i0 * g.cx, y: best.j0 * g.cy, w: (best.i1 - best.i0 + 1) * g.cx, d: (best.j1 - best.j0 + 1) * g.cy };
}
function rectsBySize(g, minW, minD, max) { // ahne: suurimad ristkülikud, mis mahutavad vähemalt minW×minD
  const out = [], copy = g.a.slice();
  for (let n = 0; n < (max || 12); n++) {
    const r = largestRect(g); if (!r) break;
    if (Math.min(r.w, r.d) + E >= Math.min(minW, minD) && Math.max(r.w, r.d) + E >= Math.max(minW, minD)) out.push(r);
    blockShape(g, Object.assign({ t: 'r' }, r), 0, 1);
  }
  g.a = copy; return out;
}

function tableSpec(cat, id) { const p = prod(cat, id); return p ? Object.assign({ id: p.id, name: p.name }, p.spec) : null; }
// istumisgrupid ristkülikus r. Tagastab {groups, seats}
function fillSeating(r, need, ts, R, single) {
  const out = [];
  if (ts.shape === 'round') {
    const D = ts.d + 2 * R.chairD, pitch = D + R.walk;
    const nx = Math.floor((r.w - D) / pitch + E) + 1, ny = Math.floor((r.d - D) / pitch + E) + 1;
    if (r.w + E < D || r.d + E < D) return null;
    const nt = Math.min(nx * ny, Math.ceil(need / ts.seats)); if (nt <= 0) return null;
    // kompaktne: täida read, keskel
    const cols = Math.min(nx, nt), rows = Math.ceil(nt / cols);
    const ox = r.x + (r.w - ((cols - 1) * pitch + D)) / 2 + D / 2, oy = r.y + (r.d - ((rows - 1) * pitch + D)) / 2 + D / 2;
    let left = need;
    for (let q = 0; q < nt; q++) {
      const row = Math.floor(q / cols), inRow = row === rows - 1 ? nt - row * cols : cols, col = q % cols;
      const sx = ox + (cols - inRow) * pitch / 2 + col * pitch, sy = oy + row * pitch;
      const seats = Math.min(ts.seats, left); left -= seats;
      out.push({ shape: 'round', product: ts.id, d: ts.d, x: sx, y: sy, seats, chairs: roundChairs(sx, sy, ts.d, seats, R), body: { t: 'c', x: sx, y: sy, r: D / 2 } });
    }
    return { tables: out, seats: need - left };
  }
  // pikad lauad: read piki ristküliku pikemat külge
  const along = r.w >= r.d, Lr = along ? r.w : r.d, Dr = along ? r.d : r.w;
  const depth = ts.d + 2 * R.chairD, pitch = depth + R.walk;
  const perRowMaxTables = Math.floor(Lr / ts.w + E); if (perRowMaxTables < 1 || Dr + E < depth) return null;
  let rows = Math.floor((Dr - depth) / pitch + E) + 1; if (single) rows = 1;
  const perSideMax = Math.floor(perRowMaxTables * ts.w / R.perGuest + E);
  let left = need; const rowsOut = [];
  for (let q = 0; q < rows && left > 0; q++) {
    const perSide = Math.min(perSideMax, Math.ceil(left / 2));
    const nTab = Math.ceil(perSide * R.perGuest / ts.w - E), len = nTab * ts.w, seats = Math.min(left, perSide * 2);
    left -= seats; rowsOut.push({ nTab, len, seats, perSide });
  }
  if (single && left > 0) return null;
  const totalD = rowsOut.length * depth + (rowsOut.length - 1) * R.walk, o2 = (Dr - totalD) / 2;
  rowsOut.forEach((ro, q) => {
    const a0 = (Lr - ro.len) / 2, b0 = o2 + q * pitch + R.chairD;
    const tx = along ? r.x + a0 : r.x + b0, ty = along ? r.y + b0 : r.y + a0, tw = along ? ro.len : ts.d, td = along ? ts.d : ro.len;
    out.push({ shape: 'rect', product: ts.id, nTab: ro.nTab, unitW: ts.w, x: tx, y: ty, w: tw, d: td, along, seats: ro.seats, chairs: rowChairs(tx, ty, tw, td, along, ro.seats, R), body: along ? { t: 'r', x: tx, y: ty - R.chairD, w: tw, d: td + 2 * R.chairD } : { t: 'r', x: tx - R.chairD, y: ty, w: tw + 2 * R.chairD, d: td } });
  });
  return { tables: out, seats: need - left };
}
function roundChairs(x, y, d, n, R) { const c = []; const rr = d / 2 + R.chairD / 2; for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + i * 2 * Math.PI / n; c.push({ x: x + rr * Math.cos(a), y: y + rr * Math.sin(a), a: a + Math.PI }); } return c; }
function rowChairs(x, y, w, d, along, n, R) {
  const c = [], perSide = Math.ceil(n / 2), len = along ? w : d, sp = len / perSide;
  for (let s = 0; s < 2; s++) for (let i = 0; i < perSide && c.length < n; i++) {
    const a = (i + .5) * sp;
    if (along) c.push({ x: x + a, y: s ? y + d + R.chairD / 2 : y - R.chairD / 2, a: s ? -Math.PI / 2 : Math.PI / 2 });
    else c.push({ x: s ? x + w + R.chairD / 2 : x - R.chairD / 2, y: y + a, a: s ? Math.PI : 0 });
  }
  return c;
}

function freeGrid(room, R, placed, door, cell, wallIn) {
  const g = grid(room, cell);
  // seinast vähemalt wallIn (tooli taga vaba ala või seinavahe)
  for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) {
    const x0 = i * g.cx, y0 = j * g.cy;
    if (x0 < wallIn - E || y0 < wallIn - E || x0 + g.cx > room.L - wallIn + E || y0 + g.cy > room.W - wallIn + E) g.a[j * g.nx + i] = 1;
  }
  for (const p of placed) { blockShape(g, p, R.walk, 1); for (const z of p.zones || []) blockShape(g, z, 0, 1); }
  if (door) blockShape(g, door.zone, R.walk, 1);
  return g;
}

function fillFlex(room, R, placed, door, flex, cat, cell) {
  const groups = [], placedAll = placed.slice();
  let seats = 0, need = 0, standCap = 0, standNeed = 0;
  for (const f of flex) {
    if (f.kind === 'seating') {
      const ts = tableSpec(cat, f.table || 'round180') || { id: 'round180', shape: 'round', d: 1.8, seats: 10 };
      let left = f.guests; need += f.guests;
      const minD = ts.shape === 'round' ? ts.d + 2 * R.chairD : ts.d + 2 * R.chairD, minW = ts.shape === 'round' ? minD : (f.single ? Math.ceil(Math.ceil(f.guests / 2) * R.perGuest / ts.w - E) * ts.w : ts.w);
      for (let guard = 0; guard < 40 && left > 0; guard++) {
        const g = freeGrid(room, R, placedAll, door, cell, Math.max(R.wall, R.push));
        const rs = rectsBySize(g, minW, minD, 6); if (!rs.length) break;
        let got = null;
        for (const r of rs) { got = fillSeating(r, left, ts, R, f.single); if (got && got.seats > 0) break; got = null; }
        if (!got) break;
        const grp = { id: 'seat' + (groups.length + 1), kind: 'seating', name: ts.name || 'Lauad', table: ts.id, tables: got.tables, seats: got.seats };
        const bb = bbox(got.tables.map(t => t.body)); Object.assign(grp, { t: 'r' }, bb, { zones: [] });
        groups.push(grp); placedAll.push(...got.tables.map(t => Object.assign({ zones: [] }, t.body)));
        left -= got.seats; seats += got.seats;
        if (f.single) break;
      }
    } else if (f.kind === 'standing') {
      standNeed += f.guests;
      const ct = tableSpec(cat, 'cocktail') || { id: 'cocktail', d: .81, guests: 8 };
      let area = f.guests * R.standM2;
      const zones = [];
      for (let guard = 0; guard < 8 && area > 0.5; guard++) {
        const g = freeGrid(room, R, placedAll, door, cell, R.wall);
        const r = largestRect(g); if (!r || r.w < 2 || r.d < 2) break;
        let z = Object.assign({ t: 'r' }, r);
        const a = r.w * r.d; if (a > area) { const k = area / a; if (r.w > r.d) z.w = Math.max(2, r.w * k); else z.d = Math.max(2, r.d * k); }
        zones.push(z); area -= z.w * z.d; placedAll.push(Object.assign({ zones: [] }, z));
      }
      const capA = zones.reduce((s, z) => s + z.w * z.d, 0); standCap += Math.floor(capA / R.standM2 + E);
      const nT = Math.ceil(f.guests / (ct.guests || 8)), tables = []; const pitch = Math.max(2.4, ct.d + R.walk + 1);
      for (const z of zones) for (let y = z.y + pitch / 2; y <= z.y + z.d - ct.d / 2 && tables.length < nT; y += pitch) for (let x = z.x + pitch / 2; x <= z.x + z.w - ct.d / 2 && tables.length < nT; x += pitch) tables.push({ shape: 'cocktail', product: ct.id, d: ct.d, x, y, body: { t: 'c', x, y, r: ct.d / 2 } });
      groups.push(Object.assign({ id: 'stand', kind: 'standing', name: 'Püstivastuvõtt', zonesArea: zones, tables, guests: f.guests, cap: Math.floor(capA / R.standM2 + E) }, { t: 'r' }, bbox(zones.length ? zones : [{ t: 'r', x: 0, y: 0, w: 0, d: 0 }]), { zones: [] }));
    }
  }
  return { groups, seats, need, standCap, standNeed };
}
function bbox(sh) { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const s of sh) { const a = s.t === 'c' ? [s.x - s.r, s.y - s.r, s.x + s.r, s.y + s.r] : [s.x, s.y, s.x + s.w, s.y + s.d]; x0 = Math.min(x0, a[0]); y0 = Math.min(y0, a[1]); x1 = Math.max(x1, a[2]); y1 = Math.max(y1, a[3]); } return { x: x0, y: y0, w: x1 - x0, d: y1 - y0 }; }

// ---------- otsing ----------
function doorZone(room, k, t, w, R) { const z = place(room, k, t, 0, w, R.entryDepth); return { wall: k, t, w, zone: Object.assign({ t: 'r' }, z) }; }
function doorCands(room, R, doorW, spec, coarse) {
  const out = [];
  for (let k = 0; k < 4; k++) {
    const L = wallLen(room, k); if (L < doorW + 2 * R.wall) continue;
    const ps = coarse ? (L > 12 ? [L / 2 - doorW / 2, L / 4 - doorW / 2, 3 * L / 4 - doorW / 2] : [L / 2 - doorW / 2]) : [L / 2 - doorW / 2, R.wall + .5, L - doorW - R.wall - .5, L / 4 - doorW / 2, 3 * L / 4 - doorW / 2];
    for (const p of ps) if (p >= R.wall - E && p + doorW <= L - R.wall + E && !out.some(d => d.wall === k && Math.abs(d.t - p) < .5)) out.push(doorZone(room, k, +p.toFixed(2), doorW, R));
  }
  if (spec.door && spec.door.wall != null) return out.filter(d => d.wall === spec.door.wall);
  return out;
}

function okAgainst(s, placed, door, R, room) {
  if (wallDist(s, room) < (s.wallMin != null ? s.wallMin : R.wall) - E) return false;
  for (const z of s.zones || []) if (wallDist(z, room) < -E) return false;
  if (door && gap(s, door.zone) < -E) return false;
  for (const z of s.zones || []) if (door && gap(z, door.zone) < -E && s.kind !== 'stage') return false;
  for (const p of placed) {
    const attach = (s.attach === 'stage' && p.kind === 'stage') || (s.attach === 'stage-front' && p.kind === 'stage');
    const need = attach ? 0 : R.walk;
    if (gap(s, p) < need - E) return false;
    if (!attach) { for (const z of p.zones || []) if (gap(s, z) < -E) return false; for (const z of s.zones || []) if (gap(z, p) < -E) return false; }
  }
  return true;
}

function candidates(bl, room, R, placed, door, step) {
  const out = [];
  if (bl.attach === 'stage' || bl.attach === 'stage-front') {
    const st = placed.find(p => p.kind === 'stage'); if (!st) return out;
    const k = st.wallK, sides = bl.attach === 'stage-front' ? ['front'] : ['front', 'left', 'right'];
    for (const side of sides) {
      let w = bl.w, d = bl.d;
      if (bl.kind === 'audience') { // publikuala: laius lavast kuni ruumi laiuseni
        const area = bl.guests * R.audienceM2, full = wallLen(room, k) - 2 * R.wall;
        const minW = Math.max(k % 2 === 0 ? st.w : st.d, 6);
        for (let ww = full; ww >= minW - E; ww -= 2) { const dd = Math.ceil(area / ww * 10) / 10; if (dd > ww * 1.5) break; out.push(mk(ww, dd, 'front', null, R.stageFront)); }
        continue;
      }
      const sideLen = (side === 'front') === (k % 2 === 0) ? st.w : st.d;
      const ws = [[w, d], [d, w]];
      for (const [a, b] of ws) for (const al of ['c', 's', 'e']) out.push(mk(a, b, side, al, 0));
    }
    return out.filter(Boolean);
    function mk(a, b, side, al, dist) {
      // a = laius piki külge, b = sügavus küljest eemale
      const fr = { 0: [0, 1], 2: [0, -1], 3: [1, 0], 1: [-1, 0] }[k];
      let dir = side === 'front' ? fr : side === 'left' ? [fr[1], -fr[0]] : [-fr[1], fr[0]];
      let x, y, w2, d2;
      if (dir[0] !== 0) { w2 = b; d2 = a; x = dir[0] > 0 ? st.x + st.w + dist : st.x - dist - b; const span = [st.y, st.y + st.d]; y = al === 's' ? span[0] : al === 'e' ? span[1] - a : (span[0] + span[1]) / 2 - a / 2; if (al == null) y = (span[0] + span[1]) / 2 - a / 2; }
      else { w2 = a; d2 = b; y = dir[1] > 0 ? st.y + st.d + dist : st.y - dist - b; const span = [st.x, st.x + st.w]; x = al === 's' ? span[0] : al === 'e' ? span[1] - a : (span[0] + span[1]) / 2 - a / 2; if (al == null) x = (span[0] + span[1]) / 2 - a / 2; }
      return { t: 'r', x, y, w: w2, d: d2, zones: [], side, attach: bl.attach, kind: bl.kind };
    }
  }
  for (let k = 0; k < 4; k++) {
    const L = wallLen(room, k), lo = R.wall + (bl.kind === 'stage' ? R.stageSide - R.wall : 0), hi = L - bl.w - lo;
    if (hi < lo - E) continue;
    const ts = new Set([+((lo + hi) / 2).toFixed(2), +lo.toFixed(2), +hi.toFixed(2)]);
    const st = Math.max(step, (hi - lo) / (step < .3 ? 400 : 10));
    for (let t = lo; t <= hi + E; t += st) ts.add(+t.toFixed(2));
    for (const t of ts) out.push(realize(bl, room, k, t, R));
  }
  return out;
}

function prefScore(lay, door) {
  const c = s => [s.x + s.w / 2, s.y + s.d / 2], dz = c(door.zone), d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  let s = 0;
  for (const p of lay) {
    if (p.kind === 'stage') s += 2 * d(c(p), dz);
    if (p.kind === 'catering' || p.kind === 'bar') s -= .6 * d(c(p), dz);
    if (p.kind === 'dance' && p.side === 'front') s += 3;
    if (p.kind === 'wc') s -= .3 * d(c(p), dz);
  }
  return s;
}

function solveRoom(room, R, blocks, door, cat, opts) {
  const { fixed, flex } = blocks, step = opts.step, cell = opts.cell;
  let best = null, nodes = 0, leaves = 0, okLeaves = 0;
  const placed = [];
  const order = (cs) => cs.map(c => ({ c, s: prefScore(placed.concat([Object.assign({ kind: c.kind || fixed[placed.length].kind }, c)]), door) })).sort((a, b) => b.s - a.s).map(o => o.c);
  const go = (i) => {
    if (leaves >= opts.maxLeaves || nodes > opts.maxNodes) return;
    if (i === fixed.length) {
      leaves++;
      const f = fillFlex(room, R, placed, door, flex, cat, cell);
      const short = Math.max(0, f.need - f.seats) + Math.max(0, f.standNeed - f.standCap);
      const sc = -short * 1000 + prefScore(placed, door) - f.groups.length * .5;
      if (!best || sc > best.sc) best = { sc, short, fixed: placed.map(p => Object.assign({}, p)), flex: f };
      if (short === 0) okLeaves++;
      if (okLeaves >= 4) leaves = opts.maxLeaves;
      return;
    }
    const bl = fixed[i];
    const cs = order(candidates(bl, room, R, placed, door, step).map(c => Object.assign(c, { kind: bl.kind, id: bl.id, name: bl.name, src: bl })));
    for (const c of cs) {
      nodes++;
      if (!okAgainst(c, placed, door, R, room)) continue;
      placed.push(c); go(i + 1); placed.pop();
      if (leaves >= opts.maxLeaves || nodes > opts.maxNodes) return;
    }
  };
  go(0);
  return best;
}

// alumine piir: kehad + tsoonid + istumine (ilma vahekäikudeta). Kui telk on väiksem, pole mõtet otsida.
function minArea(blocks, cat, R) {
  let a = 0;
  for (const b of blocks.fixed) {
    if (b.kind === 'stage') a += (b.w + 2 * R.stageSide) * (b.d + R.stageFront + R.stageSide);
    else if (b.kind === 'dance') a += b.w * b.d;
    else if (b.kind === 'audience') a += b.guests * R.audienceM2;
    else if (b.kind === 'bar') a += b.w * (b.d + R.barWork + R.serviceZone);
    else a += b.w * (b.d + R.serviceZone);
  }
  for (const f of blocks.flex) {
    if (f.kind === 'standing') { a += f.guests * R.standM2; continue; }
    const ts = tableSpec(cat, f.table || 'round180') || { shape: 'round', d: 1.8, seats: 10 };
    if (ts.shape === 'round') { const D = ts.d + 2 * R.chairD; a += Math.ceil(f.guests / ts.seats) * D * D; }
    else a += f.guests / 2 * R.perGuest * (ts.d + 2 * R.chairD);
  }
  return a;
}
function cellFor(room) { const a = room.L * room.W; return a <= 120 ? .1 : a <= 600 ? .2 : a <= 2500 ? .25 : .5; }

function solveTent(spec, cat, R, blocks, tent, area, fine) {
  const room = tent ? { L: tent.L, W: tent.W } : { L: Math.max(area.l, area.w), W: Math.min(area.l, area.w) };
  const doorW = tent ? tent.doorW : (spec.door && spec.door.w) || R.doorW;
  const cell = cellFor(room), small = room.L * room.W <= 120;
  if (blocks.minA == null) blocks.minA = minArea(blocks, cat, R);
  if (room.L * room.W < blocks.minA) return null;
  const passes = fine ? [{ step: .5, maxLeaves: 30, maxNodes: 6000 }, { step: .25, maxLeaves: 60, maxNodes: 40000 }].concat(small ? [{ step: .1, maxLeaves: 120, maxNodes: 200000 }] : []) : [{ step: room.L > 30 ? 1 : .5, maxLeaves: 12, maxNodes: 3000 }];
  let best = null; const doorRank = [];
  for (const ps of passes) {
    const doors = ps.step < .2 && doorRank.length ? doorRank.sort((a, b) => b.sc - a.sc).slice(0, 4).map(d => d.door) : doorCands(room, R, doorW, spec, !fine);
    for (const door of doors) {
      const r = solveRoom(room, R, blocks, door, cat, Object.assign({ cell }, ps));
      if (!r) continue;
      if (ps.step >= .2) doorRank.push({ door, sc: r.sc });
      r.door = door; r.room = room;
      if (!best || r.sc > best.sc) best = r;
    }
    if (best && best.short === 0) break;
  }
  return best;
}

// ---------- kontroll (sama funktsioon ka käsitsi liigutamisel) ----------
function shapesOf(it) {
  if (it.kind === 'seating' || it.kind === 'standing') return (it.tables || []).map(t => Object.assign({ owner: it.id, kind: it.kind, name: it.name }, t.body));
  if (it.kind === 'audience') return [Object.assign({ owner: it.id, kind: it.kind, name: it.name, t: 'r' }, rectOf(it))];
  return [Object.assign({ owner: it.id, kind: it.kind, name: it.name, t: 'r' }, rectOf(it))];
}
const rectOf = it => ({ x: it.x, y: it.y, w: it.w, d: it.d });

function validate(L) {
  const R = L.rules, room = L.room, probs = [], bad = new Set();
  const add = (code, text, ids, need, have) => { probs.push({ code, text, ids, need, have }); (ids || []).forEach(i => bad.add(i)); };
  const items = L.items, shapes = items.flatMap(shapesOf);
  // seinad
  for (const s of shapes) {
    const it = items.find(i => i.id === s.owner);
    const min = it.kind === 'seating' ? Math.max(R.wall, R.push) : it.kind === 'stage' ? R.stageSide : it.kind === 'bar' ? R.barWork : R.wall;
    const wd = wallDist(s, room);
    if (wd < min - .005) add('wall', `${s.name}: seinast ${fmt(Math.max(0, wd))} m, vaja ≥ ${fmt(min)} m`, [s.owner], min, wd);
  }
  for (const it of items) for (const z of it.zones || []) if (wallDist(z, room) < -.005) add('zonewall', `${it.name}: ${zoneName(z)} jääb telgist välja`, [it.id]);
  // vahekäigud
  for (let i = 0; i < shapes.length; i++) for (let j = i + 1; j < shapes.length; j++) {
    const a = shapes[i], b = shapes[j];
    const att = (a.kind === 'stage' && (b.kind === 'dance' || b.kind === 'audience')) || (b.kind === 'stage' && (a.kind === 'dance' || a.kind === 'audience'));
    if (att && (a.kind === 'audience' || b.kind === 'audience')) { const g = gap(a, b); if (g < R.stageFront - .005) add('zone', `Publikuala lavale liiga lähedal (${fmt(g)} m, vaja ≥ ${fmt(R.stageFront)} m)`, [a.owner, b.owner]); continue; }
    if (att) { if (b.kind === 'dance' || a.kind === 'dance') { const g = gap(a, b); if (g > .02) add('attach', `Tantsupõrand peab olema vastu lava (vahe ${fmt(g)} m)`, [a.owner, b.owner]); if (g < -.005) add('overlap', 'Tantsupõrand kattub lavaga', [a.owner, b.owner]); } continue; }
    if (a.kind === 'standing' && b.kind === 'standing') { if (gap(a, b) < R.walk - .005) add('walk', `Püstilaudade vahe ${fmt(gap(a, b))} m, vaja ≥ ${fmt(R.walk)} m`, [a.owner]); continue; }
    const g = gap(a, b);
    if (g < -.005) add('overlap', `${a.name} ja ${b.name} kattuvad`, [a.owner, b.owner], 0, g);
    else if (g < R.walk - .005) add('walk', `${a.name} ↔ ${b.name}: vahe ${fmt(g)} m, vaja ≥ ${fmt(R.walk)} m`, [a.owner, b.owner], R.walk, g);
  }
  // tsoonid (lava ees/küljel, teenindusala, baari tööala)
  for (const it of items) for (const z of it.zones || []) for (const s of shapes) {
    if (s.owner === it.id) continue;
    if (it.kind === 'stage' && (s.kind === 'dance' || s.kind === 'audience')) continue;
    if (gap(z, s) < -.005) add('zone', `${s.name} on ${it.name.toLowerCase()} ${zoneName(z)} sees`, [s.owner, it.id]);
  }
  // sissepääs
  if (L.door) for (const s of shapes) if (gap(s, L.door.zone) < -.005) add('door', `${s.name} on sissepääsu ees (vaba ala ${fmt(R.entryDepth)} m)`, [s.owner]);
  // istekohad ja laua kohad
  const seatsNeed = (L.spec.items || []).filter(i => i.kind === 'seating').reduce((s, i) => s + i.guests, 0);
  let seats = 0, chairs = 0;
  for (const it of items) if (it.kind === 'seating') for (const t of it.tables) {
    seats += t.seats; chairs += t.chairs.length;
    const cap = t.shape === 'round' ? (tableCap(L, t)) : Math.floor((t.along ? t.w : t.d) / R.perGuest + E) * 2;
    if (t.chairs.length > cap) add('cap', `Laud: ${t.chairs.length} tooli, mahub ${cap}`, [it.id]);
    if (t.chairs.length !== t.seats) add('cap', 'Toolide arv ei klapi', [it.id]);
  }
  if (seats < seatsNeed) add('seats', `Istekohti ${seats} / ${seatsNeed}: puudu ${seatsNeed - seats}`, [], seatsNeed, seats);
  const standNeed = (L.spec.items || []).filter(i => i.kind === 'standing').reduce((s, i) => s + i.guests, 0);
  const stand = items.filter(i => i.kind === 'standing').reduce((s, i) => s + (i.cap || 0), 0);
  if (stand < standNeed) add('stand', `Püstivastuvõtu ala ${stand} / ${standNeed} külalisele`, [], standNeed, stand);
  // ligipääs
  const acc = access(L, shapes);
  for (const id of acc.unreachable) add('access', `${(items.find(i => i.id === id) || {}).name || id}: ei pääse ligi ≥ ${fmt(R.walk)} m vahekäiku mööda`, [id]);
  return { ok: !probs.length, problems: probs, bad: [...bad], seats, chairs, seatsNeed, stand, standNeed };
}
function tableCap(L, t) { const p = (L.catalog && prod(L.catalog, t.product)) || null; return p ? p.spec.seats : t.seats; }
function zoneName(z) { return { stage: 'vaba ala', bar: 'tööala', catering: 'teenindusala', popup: 'teenindusala', wc: 'järjekorraala' }[z.type] || 'vaba ala'; }

// ligipääs: kas igast esemest pääseb ≥ walk laiust teed mööda sissepääsuni
function access(L, shapes) {
  const room = L.room, R = L.rules, cell = Math.min(.2, cellFor(room)), g = grid(room, cell);
  for (const s of shapes) if (s.kind !== 'audience') blockShape(g, s, 0, 1);
  // kaugus lähimast takistusest (chamfer) — seinad on takistus
  const n = g.nx * g.ny, D = new Float32Array(n), BIG = 1e6;
  for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) { const k = j * g.nx + i; D[k] = g.a[k] ? 0 : Math.min((i + .5) * g.cx, (j + .5) * g.cy, room.L - (i + .5) * g.cx, room.W - (j + .5) * g.cy); }
  const c1 = g.cx, c2 = Math.hypot(g.cx, g.cy);
  for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) { const k = j * g.nx + i; if (i) D[k] = Math.min(D[k], D[k - 1] + c1); if (j) { D[k] = Math.min(D[k], D[k - g.nx] + c1); if (i) D[k] = Math.min(D[k], D[k - g.nx - 1] + c2); if (i < g.nx - 1) D[k] = Math.min(D[k], D[k - g.nx + 1] + c2); } }
  for (let j = g.ny - 1; j >= 0; j--) for (let i = g.nx - 1; i >= 0; i--) { const k = j * g.nx + i; if (i < g.nx - 1) D[k] = Math.min(D[k], D[k + 1] + c1); if (j < g.ny - 1) { D[k] = Math.min(D[k], D[k + g.nx] + c1); if (i < g.nx - 1) D[k] = Math.min(D[k], D[k + g.nx + 1] + c2); if (i) D[k] = Math.min(D[k], D[k + g.nx - 1] + c2); } }
  const ok = new Uint8Array(n), half = R.walk / 2 - cell * .75;
  for (let k = 0; k < n; k++) ok[k] = D[k] >= half ? 1 : 0;
  const seen = new Uint8Array(n), q = [];
  if (L.door) { const z = L.door.zone; for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) { const x = (i + .5) * g.cx, y = (j + .5) * g.cy; if (x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.d) { const k = j * g.nx + i; if (ok[k]) { seen[k] = 1; q.push(k); } } } }
  else { for (let k = 0; k < n; k++) if (ok[k]) { seen[k] = 1; q.push(k); break; } }
  while (q.length) { const k = q.pop(), i = k % g.nx, j = (k - i) / g.nx; for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= g.nx || b >= g.ny) continue; const m = b * g.nx + a; if (!seen[m] && ok[m]) { seen[m] = 1; q.push(m); } } }
  const unreachable = new Set();
  const byOwner = {}; shapes.forEach(s => (byOwner[s.owner] = byOwner[s.owner] || []).push(s));
  for (const id in byOwner) {
    const it = L.items.find(i => i.id === id); if (it.kind === 'audience') continue;
    // iga laud eraldi; muu ese tervikuna
    for (const s of byOwner[id]) {
      const reach = R.walk / 2 + cell * 1.5; let hit = false;
      const bb = s.t === 'c' ? { x: s.x - s.r, y: s.y - s.r, w: 2 * s.r, d: 2 * s.r } : s;
      const i0 = Math.max(0, Math.floor((bb.x - reach) / g.cx)), i1 = Math.min(g.nx - 1, Math.ceil((bb.x + bb.w + reach) / g.cx)), j0 = Math.max(0, Math.floor((bb.y - reach) / g.cy)), j1 = Math.min(g.ny - 1, Math.ceil((bb.y + bb.d + reach) / g.cy));
      for (let j = j0; j <= j1 && !hit; j++) for (let i = i0; i <= i1 && !hit; i++) { const k = j * g.nx + i; if (!seen[k]) continue; const p = { t: 'c', x: (i + .5) * g.cx, y: (j + .5) * g.cy, r: 0 }; if (gap(p, s) <= reach) hit = true; }
      if (!hit) { unreachable.add(id); break; }
    }
  }
  return { unreachable: [...unreachable] };
}

// ---------- tulemus ----------
function assemble(spec, cat, R, tent, area, r) {
  const items = [];
  for (const p of r.fixed) {
    const src = p.src || {};
    items.push({ id: p.id, kind: p.kind, name: p.kind === 'stage' ? `${src.name || 'Lava'} ${fmt(src.w)} × ${fmt(src.d)} m` : p.kind === 'dance' ? `Tantsupõrand ${fmt(src.w)} × ${fmt(src.d)} m` : p.kind === 'audience' ? `Publikuala ${src.guests} in` : src.name,
      x: r2(p.x), y: r2(p.y), w: r2(p.w), d: r2(p.d), wallK: p.wallK, side: p.side, n: src.n, unitW: src.unitW, product: src.product, h: src.h, guests: src.guests, zones: (p.zones || []).map(z => ({ t: 'r', type: z.type, x: r2(z.x), y: r2(z.y), w: r2(z.w), d: r2(z.d) })) });
  }
  for (const g of r.flex.groups) items.push(g);
  const room = r.room;
  const L = { v: 1, spec, rules: R, catalog: cat, tent, area: area || null, room, door: r.door, items,
    origin: tent && area ? { x: r2((Math.max(area.l, area.w) - tent.L) / 2), y: r2((Math.min(area.l, area.w) - tent.W) / 2) } : { x: 0, y: 0 } };
  finish(L);
  return L;
}
const r2 = v => Math.round(v * 1000) / 1000;
function finish(L) {
  const v = validate(L); L.ok = v.ok; L.problems = v.problems; L.bad = v.bad; L.seats = v.seats; L.chairs = v.chairs;
  L.checks = checks(L, v); L.bom = bom(L);
  return L;
}
function checks(L, v) {
  const R = L.rules, has = c => v.problems.some(p => p.code === c), out = [];
  const where = L.tent ? `telki ${fmt(L.tent.W)} × ${fmt(L.tent.L)} m` : `alale ${fmt(L.room.W)} × ${fmt(L.room.L)} m`;
  out.push({ ok: !has('overlap') && !has('zonewall'), text: `Kõik mahub ${where}, midagi ei kattu` });
  out.push({ ok: !has('walk'), text: `Vahekäigud ≥ ${fmt(R.walk)} m` });
  out.push({ ok: !has('wall'), text: `Seintest ≥ ${fmt(R.wall)} m, tooli taga ≥ ${fmt(R.push)} m` });
  if (L.items.some(i => i.kind === 'stage')) out.push({ ok: !has('zone') && !has('attach'), text: `Lava ees ≥ ${fmt(R.stageFront)} m, külgedel ja taga ≥ ${fmt(R.stageSide)} m` });
  out.push({ ok: !has('door'), text: `Sissepääs vaba ${fmt(R.entryDepth)} m sügavuselt` });
  out.push({ ok: !has('access'), text: 'Igale lauale ja alale pääseb vahekäiku mööda' });
  if (v.seatsNeed) out.push({ ok: !has('seats') && !has('cap'), text: `Istekohti ${v.seats} / ${v.seatsNeed}, igal laual toole ≤ laua kohti` });
  if (v.standNeed) out.push({ ok: !has('stand'), text: `Püstivastuvõtt ${v.stand} / ${v.standNeed} külalisele (${fmt(R.standM2)} m² inimese kohta)` });
  if (L.tent && L.area) out.push({ ok: true, text: `Telgi ümber vaba ≥ ${fmt(L.tent.margin)} m (ala ${fmt(Math.min(L.area.l, L.area.w))} × ${fmt(Math.max(L.area.l, L.area.w))} m)` });
  return out;
}
function bom(L) {
  const cat = L.catalog, m = new Map(), add = (id, name, qty, note) => { if (!qty) return; const p = prod(cat, id); const k = id + (note || ''); const e = m.get(k) || { id, name: name || (p && p.name) || id, qty: 0, note: note || '', source: p && p.spec.source }; e.qty += qty; m.set(k, e); };
  if (L.tent) add(L.tent.product, L.tent.name, 1);
  for (const it of L.items) {
    if (it.kind === 'seating') { for (const t of it.tables) { add(t.product, null, t.shape === 'rect' ? t.nTab : 1); add(prod(cat, 'chair') ? prod(cat, 'chair').id : 'chair', null, t.chairs.length); } }
    else if (it.kind === 'standing') for (const t of it.tables) add(t.product, null, 1);
    else if (it.kind === 'stage' && it.product && prod(cat, it.product) && prod(cat, it.product).spec.kind === 'stage') add(it.product, `${prod(cat, it.product).name} ${fmt(Math.min(it.w, it.d))} × ${fmt(Math.max(it.w, it.d))} m`, 1);
    else if (it.kind === 'stage') { const mods = podiumModules(Math.max(it.w, it.d), Math.min(it.w, it.d)); for (const k in mods) add(it.product || 'podium', `Poodiumimoodul ${k}`, mods[k], k); }
    else if (it.kind === 'dance') add('dance', null, Math.ceil(it.w * it.d - E));
    else if (it.kind === 'catering' || it.kind === 'bar' || it.kind === 'wc') add(it.product, null, it.n || 1);
    else if (it.kind === 'popup') add('tent-popup', `Pop-up telk ${it.name.split('× ')[1] || ''}`.trim(), it.n || 1);
  }
  for (const it of (L.spec.items || [])) if (['heater', 'light', 'fence', 'decor'].includes(it.kind)) add(it.product || it.kind, it.name, it.n || 1);
  return [...m.values()];
}
function podiumModules(w, d) { // 2×1 ja 1×1 (ja ×0,5) moodulid
  const out = {}; const add = (k, n) => { if (n > 0) out[k] = (out[k] || 0) + n; };
  const rows = Math.floor(d + E), half = d - rows > .25;
  const perRow = (len, depth) => { const n2 = Math.floor(len / 2 + E), rest = len - n2 * 2; add(depth === 1 ? '2 × 1 m' : '2 × 0,5 m', n2); if (rest > .25) add(depth === 1 ? '1 × 1 m' : '1 × 0,5 m', Math.ceil(rest - E)); };
  for (let i = 0; i < rows; i++) perRow(w, 1); if (half) perRow(w, .5);
  return out;
}

// ---------- avalik: solve ----------
function solve(spec, cat, opt) {
  opt = opt || {};
  const R = rulesFor(spec, cat), blocks = buildBlocks(spec, cat, R), area = spec.area || null;
  const noTent = spec.tent && spec.tent.type === 'none';
  const tents = noTent ? [null] : tentOptions(cat, spec.tent, area, R);
  if (!noTent && !tents.length) return fail(spec, cat, R, { reason: 'Ükski telk ei mahu sellele alale (koos telgi ümber vajaliku vaba alaga).' });
  const found = [];
  for (const t of tents) {
    const r = solveTent(spec, cat, R, blocks, t, area, false) || null;
    let L = r && r.short === 0 ? assemble(spec, cat, R, t, area, r) : null;
    const need = (spec.guests || 0), close = r ? r.short <= Math.max(2, need * .1) : (t ? t.W * t.L <= 120 : true);
    if ((!L || !L.ok) && close) { const r2 = solveTent(spec, cat, R, blocks, t, area, true); if (r2 && r2.short === 0) { const L2 = assemble(spec, cat, R, t, area, r2); if (L2.ok || !L) L = L2; } }
    if (L && L.ok) { found.push(L); if (found.length >= (opt.max || 3) || noTent) break; }
    else if (found.length) break;
    if (found.length && t && found[0].tent && t.W * t.L > found[0].tent.W * found[0].tent.L * 1.6) break;
  }
  if (found.length) return { ok: true, layouts: found, best: found[0] };
  if (opt.quick) return { ok: false, layouts: [] };
  return fail(spec, cat, R, { tents });
}

// ei mahu: lähim paigutus (näiline suurem telk), täpne puudujääk ja kontrollitud parandused
function fail(spec, cat, R, info) {
  const area = spec.area || null, out = { ok: false, layouts: [], reason: info.reason || '', fixes: [] };
  const tents = info.tents || [];
  const big = tents.length ? tents[tents.length - 1] : null;
  if (big) {
    let best = null;
    const tryV = (dl, dw, fine) => { const vt = Object.assign({}, big, { L: r2(big.L + dl), W: r2(big.W + dw) }); const r = solveTent(spec, cat, R, buildBlocks(spec, cat, R), vt, null, fine); if (r && r.short === 0) { const L = assemble(spec, cat, R, vt, null, r); if (L.ok) return L; } return null; };
    // mõlemal teljel eraldi: jäme samm 0,5 m (kiire), siis täpsusta 0,1 m sammuga
    const axis = (ax) => {
      for (let d = .5; d <= 12.01; d = r2(d + .5)) { const L = tryV(ax === 'l' ? d : 0, ax === 'w' ? d : 0, false); if (L) {
        let hit = { d, L };
        for (let e = r2(Math.max(.1, d - .4)); e < d - E; e = r2(e + .1)) { const L2 = tryV(ax === 'l' ? e : 0, ax === 'w' ? e : 0, true); if (L2) { hit = { d: e, L: L2 }; break; } }
        return hit; } }
      return null;
    };
    const hl = axis('l'), hw = axis('w');
    const pick = [hl && { dl: hl.d, dw: 0, L: hl.L }, hw && { dl: 0, dw: hw.d, L: hw.L }].filter(Boolean).sort((x, y) => (x.dl + x.dw) - (y.dl + y.dw));
    best = pick[0] || null; if (best) best.alt = pick[1] || null;
    if (best) {
      const L = best.L; L.virtual = { L: big.L, W: big.W }; L.tent = Object.assign({}, big, { name: big.name });
      L.room = { L: big.L, W: big.W }; L.area = area;
      if (area) L.origin = { x: r2((Math.max(area.l, area.w) - big.L) / 2), y: r2((Math.min(area.l, area.w) - big.W) / 2) };
      const v = validate(L); L.ok = false; L.problems = v.problems; L.bad = v.bad; L.checks = checks(L, v); L.bom = bom(L);
      out.closest = L;
      const txt = b => b.dl ? `${fmt(b.dl, 1)} m pikkust` : `${fmt(b.dw, 1)} m laiust`;
      out.shortfall = { dl: best.dl, dw: best.dw, alt: best.alt && { dl: best.alt.dl, dw: best.alt.dw }, text: `Telgis ${fmt(big.W)} × ${fmt(big.L)} m on puudu ${txt(best)}${best.alt ? ' (või ' + txt(best.alt) + ')' : ''}` };
    }
    out.reason = out.reason || `Ei mahu: suurim sobiv telk on ${big.name}${out.shortfall ? '. ' + out.shortfall.text : ''}.`;
  }
  if (!spec._noFix) out.fixes = fixes(spec, cat);
  return out;
}
function virtualSteps(st) { const s = []; for (let d = st; d <= 12.01; d += st) { s.push([r2(d), 0]); s.push([0, r2(d)]); s.push([r2(d), r2(d)]); } return s.sort((a, b) => (a[0] + a[1]) - (b[0] + b[1])); }

function fixes(spec, cat) {
  const tries = [], items = spec.items || [], clone = () => JSON.parse(JSON.stringify(spec));
  const st = items.find(i => i.kind === 'stage');
  if (st) for (const [w, d] of [[st.w, st.d - 1], [st.w - 1, st.d], [st.w - 1, st.d - 1], [2, 2]]) if (w >= 2 && d >= 1 && (w !== st.w || d !== st.d)) { const s = clone(); const x = s.items.find(i => i.kind === 'stage'); x.w = w; x.d = d; tries.push({ text: `Väiksem lava ${fmt(w)} × ${fmt(d)} m`, spec: s }); }
  const df = items.find(i => i.kind === 'dance');
  if (df && df.w * df.d > 2) { const s = clone(); const x = s.items.find(i => i.kind === 'dance'); x.w = Math.max(1, x.w - 1); tries.push({ text: `Väiksem tantsupõrand ${fmt(x.w)} × ${fmt(x.d)} m`, spec: s }); }
  if (items.some(i => i.kind === 'catering')) { const s = clone(); s.items = s.items.filter(i => i.kind !== 'catering'); tries.push({ text: 'Toitlustuslaud telgist välja (sissepääsu kõrvale)', spec: s, keep: 'catering' }); }
  const se = items.find(i => i.kind === 'seating');
  if (se) {
    const alt = se.single ? [{ single: false, table: se.table, t: 'Mitu pikka lauda kõrvuti' }] : [];
    const tp = tableSpec(cat, se.table || 'round180');
    if (tp && tp.shape === 'rect') alt.push({ table: 'round180', t: 'Ümmargused lauad Ø180' }, { table: 'round150', t: 'Ümmargused lauad Ø150' });
    else alt.push({ table: 'rect183', t: 'Pikad lauad 183 × 76' });
    for (const a of alt) { const s = clone(); const x = s.items.find(i => i.kind === 'seating'); if (a.single === false) delete x.single; if (a.table) x.table = a.table; tries.push({ text: a.t, spec: s }); }
  }
  if (spec.tent && spec.tent.size) { const s = clone(); delete s.tent.size; tries.push({ text: 'Lase valida telgi suurus', spec: s }); }
  if (spec.area) for (const [dl, dw] of [[2, 0], [3, 0], [0, 1], [0, 2], [2, 2], [3, 3], [5, 3], [6, 5], [10, 5]]) { const s = clone(); const aL = Math.max(s.area.l, s.area.w), aW = Math.min(s.area.l, s.area.w); s.area = { l: aL + dl, w: aW + dw }; tries.push({ text: `Suurem ala ${fmt(aW + dw)} × ${fmt(aL + dl)} m`, spec: s, area: true }); }
  const out = []; let areaFound = false;
  for (const t of tries) {
    if (t.area && areaFound) continue;
    t.spec._noFix = true;
    const r = solve(t.spec, cat, { max: 1, quick: true });
    if (r.ok) { out.push({ text: t.text + ` → ${r.best.tent ? r.best.tent.name : 'mahub'}`, spec: (delete t.spec._noFix, t.spec), layout: r.best }); if (t.area) areaFound = true; }
  }
  return out;
}

// AI või vormi spec -> ainult lubatud väljad ja mõistlikud vahemikud (AI väljund ei ole usaldusväärne)
function cleanSpec(x, cat) {
  x = x && typeof x === 'object' ? x : {};
  const num = (v, a, b, d) => { if (v == null || v === '') return d; const n = +String(v).replace(',', '.'); return isFinite(n) && n >= a && n <= b ? n : d; };
  const int = (v, a, b, d) => { const n = num(v, a, b, null); return n == null ? d : Math.round(n); };
  const str = (v, n) => typeof v === 'string' ? v.replace(/[<>]/g, '').slice(0, n || 120) : null;
  const tables = new Set(((cat && cat.products) || []).filter(p => p.spec && p.spec.kind === 'table').map(p => p.id));
  const out = { name: str(x.name) || 'Üritus', venue: x.venue === 'indoor' ? 'indoor' : 'outdoor', guests: int(x.guests, 1, 10000, 0) };
  const al = x.area && num(x.area.l, 2, 500, null), aw = x.area && num(x.area.w, 2, 500, null);
  out.area = al && aw ? { l: al, w: aw } : null;
  const tt = x.tent && ['any', 'modular', 'pagoda', 'stretch', 'popup', 'none'].includes(x.tent.type) ? x.tent.type : (out.venue === 'indoor' ? 'none' : 'any');
  out.tent = { type: tt };
  if (x.tent && Array.isArray(x.tent.size) && x.tent.size.length === 2) { const a = num(x.tent.size[0], 2, 100, null), b = num(x.tent.size[1], 2, 100, null); if (a && b) out.tent.size = [a, b]; }
  if (tt === 'none' && !out.area) out.area = null;
  out.items = [];
  for (const it of (Array.isArray(x.items) ? x.items : []).slice(0, 30)) {
    if (!it || typeof it !== 'object') continue;
    const k = it.kind;
    if (k === 'seating') { const g = int(it.guests, 1, 5000, 0); if (!g) continue; out.items.push(Object.assign({ kind: k, table: tables.has(it.table) ? it.table : 'round180', guests: g }, it.single ? { single: true } : {})); }
    else if (k === 'standing' || k === 'audience') { const g = int(it.guests, 1, 50000, 0); if (g) out.items.push({ kind: k, guests: g }); }
    else if (k === 'stage' || k === 'dance') { const w = num(it.w, .5, 40, null), d = num(it.d, .5, 40, null); if (w && d) out.items.push(Object.assign({ kind: k, w, d }, it.name ? { name: str(it.name, 40) } : {}, it.product && prod(cat, it.product) ? { product: it.product } : {})); }
    else if (k === 'catering') { const o = { kind: k, n: int(it.n, 1, 50, 1) }; const w = num(it.w, .5, 10, null), d = num(it.d, .3, 5, null); if (w && d) Object.assign(o, { w, d }); out.items.push(o); }
    else if (k === 'bar' || k === 'wc' || k === 'heater' || k === 'light') out.items.push({ kind: k, n: int(it.n, 1, 200, 1) });
    else if (k === 'popup') { const o = { kind: k, n: int(it.n, 1, 100, 1), size: [3, 3] }; if (Array.isArray(it.size)) { const a = num(it.size[0], 2, 8, 3), b = num(it.size[1], 2, 8, 3); o.size = [a, b]; } out.items.push(o); }
  }
  const st = x.style || {}; out.style = { colors: (Array.isArray(st.colors) ? st.colors : []).map(c => str(c, 30)).filter(Boolean).slice(0, 6), mood: str(st.mood, 80), notes: str(st.notes, 300) };
  if (x.rules && typeof x.rules === 'object') { const r = {}; for (const [k2, a, b] of [['wall', 0, 2], ['walk', .8, 3], ['entryDepth', .5, 5], ['stageFront', .5, 5], ['stageSide', 0, 3], ['push', .5, 1.5], ['perGuest', .45, 1]]) { const v = num(x.rules[k2], a, b, null); if (v != null) r[k2] = v; } if (Object.keys(r).length) out.rules = r; }
  if (!out.guests) out.guests = out.items.reduce((s2, i) => s2 + (i.guests || 0), 0);
  return out;
}

// pildimudeli juhis paigutusest (kood, mitte AI). vis = kaadris nähtavad arvud {round, rect, cocktail, chairs}
const COLOR_EN = { roheline: 'green', valge: 'white', must: 'black', kuld: 'gold', kuldne: 'gold', hõbe: 'silver', hõbedane: 'silver', roosa: 'pink', punane: 'red', sinine: 'blue', beež: 'beige', hall: 'grey', lilla: 'purple', kollane: 'yellow', oranž: 'orange', pruun: 'brown', kreem: 'cream', türkiis: 'turquoise', bordoo: 'burgundy', smaragd: 'emerald' };
const MOOD_EN = { elegantne: 'elegant', moodne: 'modern', modernne: 'modern', rustikaalne: 'rustic', boho: 'boho', klassikaline: 'classic', romantiline: 'romantic', minimalistlik: 'minimalist', pidulik: 'festive', luksuslik: 'luxurious' };
function imagePrompt(L, vis) {
  const st = (L.spec && L.spec.style) || {}, en = w => { const k = String(w || '').toLowerCase().trim(); return COLOR_EN[k] || MOOD_EN[k] || k; };
  const colors = (st.colors || []).map(en).filter(Boolean), mood = st.mood ? String(st.mood).split(/[,\s]+/).map(en).join(' ') : 'elegant';
  const parts = [];
  if (vis.round) parts.push(`${vis.round} round banquet tables with white floor-length tablecloths`);
  if (vis.rect) parts.push(`${vis.rect} long rectangular tables with white tablecloths`);
  if (vis.chairs) parts.push(`exactly ${vis.chairs} chairs`);
  if (vis.cocktail) parts.push(`${vis.cocktail} tall cocktail tables with white stretch covers`);
  for (const it of L.items) {
    if (it.kind === 'stage') parts.push(`a ${it.product === 'truss-stage' ? 'covered truss stage' : 'low black podium stage'} ${fmt(Math.max(it.w, it.d))} × ${fmt(Math.min(it.w, it.d))} m`);
    if (it.kind === 'dance') parts.push(`a glossy black-and-white checkered dance floor ${fmt(it.w)} × ${fmt(it.d)} m`);
    if (it.kind === 'bar') parts.push('a bar counter'); if (it.kind === 'catering') parts.push('a buffet/catering table');
    if (it.kind === 'wc') parts.push(`a row of ${it.n} portable toilet cabins`); if (it.kind === 'popup') parts.push(`${it.n} white pop-up tents in a row`);
  }
  const tent = L.tent ? `a white ${L.tent.type === 'pagoda' ? 'pagoda' : L.tent.type === 'stretch' ? 'stretch' : 'frame'} party tent ${fmt(L.tent.W)} × ${fmt(L.tent.L)} m${L.spec.venue === 'outdoor' ? ' on a green lawn' : ''}` : (L.spec.venue === 'indoor' ? 'an event hall' : 'an outdoor event field on grass');
  return [
    `Turn this 3D render into one photorealistic photograph of the same event setup: ${tent}.`,
    'KEEP EXACTLY the same camera angle, framing, tent shape and size, and the position, size, orientation and number of every object. Do not add, remove, move, merge or duplicate any table, chair, stage, dance floor, counter or tent.',
    `Objects in the frame: ${parts.join('; ')}.`,
    `Style: ${mood}${colors.length ? ', colour palette ' + colors.join(' and ') : ''}. Decoration only on tables (low centrepieces, flowers, candles) and potted plants along the tent walls, never on walkways, the entrance or the dance floor. Warm soft evening lighting, string lights under the roof.`,
    'No people. No text, letters, numbers, signs, logos or watermarks anywhere in the image.'
  ].join(' ');
}

const API = { solve, cleanSpec, imagePrompt, validate, finish, rulesFor, tentOptions, podiumModules, gap, DEF_RULES, fmt };
if (typeof module !== 'undefined' && module.exports) module.exports = API; else G.EventPlan = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
