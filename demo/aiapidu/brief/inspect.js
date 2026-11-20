// Vaataja lisad: toote kaart (klõps), mõõtude tasemed, tingimuste paneel, vaba pinna näit, lohistamine. Mõõdud ainult kataloogist (SZ), kontroll lahendajast (EP.validate).
export function init(c) {
  const { THREE, sc, cam, r, ctl, need, CAT, SZ, EP, EPS, LAY } = c, $ = id => document.getElementById(id), f = SZ.fmt, m = v => f(v) + ' m', m2 = v => f(v) + ' m²';
  const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  document.head.insertAdjacentHTML('beforeend', `<style>
#card,#req{position:fixed;background:#fff;border-radius:14px;box-shadow:0 8px 30px #0003;font-size:13px;z-index:4}
#card{right:12px;top:110px;width:300px;padding:12px 14px;display:none}#card h3{margin:0 26px 4px 0;font-size:15px}#card .x{position:absolute;right:8px;top:6px;border:0;background:none;font-size:20px;cursor:pointer}
.kv{display:flex;justify-content:space-between;gap:10px;padding:4px 0;border-bottom:1px solid #eee}.kv span:first-child{color:#6f685f}.kv span:last-child{text-align:right;font-weight:600}
.unv{display:inline-block;background:#fdf0d5;color:#8a5a00;border:1px solid #e8c37a;border-radius:6px;padding:0 6px;font-size:11px;font-weight:700}
.bt{border:0;border-radius:9px;padding:7px 10px;font:700 12.5px "Inter Tight";background:#2F6B4F;color:#fff;cursor:pointer;margin:8px 6px 0 0}.bt.g{background:#e9ece8;color:#16130F}
#req{left:12px;bottom:12px;width:320px;max-height:calc(100% - 150px);overflow:auto;padding:10px 14px}#req h3{margin:0 0 4px;font-size:14px;display:flex;justify-content:space-between;cursor:pointer}
#req .row{padding:5px 0;border-bottom:1px solid #f0eeea}#req .ok{color:#2F6B4F}#req .no{color:#c0392b}#req .sub{color:#6f685f;font-size:12px}#req .fx{margin-top:4px}
#req:not(.open) .row,#req:not(.open) .fx,#req:not(.open) .free{display:none}#req:not(.open) h3{margin:0}#req .free{background:#f4f6f3;border-radius:10px;padding:6px 8px;margin-top:6px;font-size:12.5px}

.tg.s{background:#2b6cb0;color:#fff;border-color:#2b6cb0}.tg.u{background:#fdf0d5;color:#8a5a00;border-color:#e8c37a}
#plan svg{max-width:100%;height:auto;display:block;margin:0 auto}#plan .eplg,#plan .epbom{max-width:1100px;margin:8px auto;font-size:13px}#plan .eplg{display:flex;flex-wrap:wrap;gap:6px 14px;list-style:none;padding:0}#plan .eplg i{display:inline-block;width:14px;height:10px;margin-right:5px;vertical-align:-1px}
@media (max-width:600px){#plan{padding-left:8px;padding-right:8px}#plan svg{max-width:none;width:920px}#card{left:8px;right:8px;top:auto;bottom:8px;width:auto;max-height:55vh;overflow:auto;z-index:6}#req{left:8px;right:8px;bottom:calc(58px + env(safe-area-inset-bottom));width:auto;max-height:44px;overflow:hidden;padding:10px 12px}#req.open{max-height:62vh;overflow:auto}}
</style>`);
  document.body.insertAdjacentHTML('beforeend', '<div id="card"><button class="x" aria-label="Sulge">×</button><div id="cardB"></div></div><div id="req"></div>');
  $('card').querySelector('.x').onclick = () => { $('card').style.display = 'none'; sel = null; drawSel(); render2d(); };
  let level = 'main', sel = null, L = null, v = null;
  $('vw').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; const show = b.dataset.w === '3d' || b.dataset.w === '2d'; $('req').style.display = show ? '' : 'none'; $('tools').style.display = b.dataset.w === '3d' ? '' : 'none'; if (!show) $('card').style.display = 'none'; open = b.dataset.w === '3d' && innerWidth > 600; renderReq(); });
  const selG = new THREE.Group(), allG = new THREE.Group(), featG = new THREE.Group(); sc.add(selG, allG, featG);
  const smat = new THREE.LineBasicMaterial({ color: '#2b6cb0', depthTest: false, transparent: true }), fmat = new THREE.LineBasicMaterial({ color: '#16130F' });
  const myTags = [];
  const tag = (txt, p, pr, cls) => { const e = document.createElement('div'); e.className = 'tg' + (cls ? ' ' + cls : ''); e.textContent = txt; $('tags').appendChild(e); const t = { e, p, pr, mine: 1 }; c.tags.push(t); myTags.push(t); return t; };
  const clearTags = grp => { for (const t of myTags.filter(t => t.grp === grp)) { t.e.remove(); c.tags.splice(c.tags.indexOf(t), 1); myTags.splice(myTags.indexOf(t), 1); } };
  const line = (g, pts, mat) => { const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat); l.renderOrder = 5; g.add(l); return l; };
  const lg = () => c.layoutGroup(); // telgi kohalik rühm: x = piki telki, z = risti (paigutuse y)
  const W = (x, y, h) => lg().localToWorld(new THREE.Vector3(x, h || 0, y));
  const pinfo = id => { try { return SZ.info(CAT, id); } catch (e) { return null; } };
  // ---------- mõõtude tasemed: Peamised / Kõik tooted / Väljas ----------
  $('dimB').parentElement.remove(); const bar = document.createElement('div'); bar.className = 'seg'; bar.id = 'dimL'; $('tools').appendChild(bar); /* mõõtude tase alumises tööriistaribas */ bar.innerHTML = ['main:Mõõdud', 'all:Kõik', 'off:Väljas'].map(s => { const [k, t] = s.split(':'); return `<button data-l="${k}" aria-pressed="${k === level}">${t}</button>`; }).join('');
  bar.onclick = e => { const b = e.target.closest('button'); if (!b) return; level = b.dataset.l; [...bar.children].forEach(x => x.setAttribute('aria-pressed', x === b)); applyLevel(); };
  function applyLevel() { c.setLevel(level); allG.visible = level === 'all'; featG.visible = level !== 'off'; for (const t of myTags) t.hide = (t.grp === 'all' && level !== 'all') || (t.grp === 'feat' && level === 'off'); need(); }
  function drawAll() { allG.clear(); clearTags('all'); if (!L) return;
    const box = (x, y, w, d, txt, unv) => { line(allG, [W(x, y, .05), W(x + w, y, .05), W(x + w, y + d, .05), W(x, y + d, .05), W(x, y, .05)], smat); const t = tag(txt + (unv ? ' · kontrollimata' : ''), W(x + w / 2, y + d / 2, .6), 2, unv ? 'u' : 's'); t.grp = 'all'; };
    for (const it of L.items) {
      if (it.tables) { it.tables.forEach(tb => { const i = pinfo(tb.product); box(tb.x, tb.y, tb.w, tb.d, (tb.nTab > 1 ? `${tb.nTab} × ` : '') + SZ.label(i), i.unverified); });
        const ch = pinfo(L.rules.chair), n = it.tables.reduce((s, t) => s + t.chairs.length, 0), c0 = it.tables[0].chairs[0]; if (c0) { const t = tag(`${n} × tool ${SZ.label(ch)}${ch.unverified ? ' · kontrollimata' : ''}`, W(c0.x, c0.y, 1.1), 2, ch.unverified ? 'u' : 's'); t.grp = 'all'; } }
      else if (it.product || it.kind === 'dance') { const i = pinfo(it.product || 'dance'); const h = it.kind === 'stage' ? (it.h != null ? it.h : i.h) : i && i.h; box(it.x, it.y, it.w, it.d, `${it.kind === 'stage' ? 'Lava' : it.kind === 'dance' ? 'Tantsupõrand' : i.name.split(' (')[0]} ${m(it.w).replace(' m', '')} × ${m(it.d)}${h != null ? ` × h${f(h)}` : ''}`, i && i.unverified); }
    }
    applyLevel(); }
  // ---------- olemasolevad objektid (terrass, maja sein, kinnistu piir) + kaugus telgist ----------
  function drawFeatures() { featG.clear(); clearTags('feat'); if (!L) return; const V = (p, h) => new THREE.Vector3(p[0], h || .04, p[1]);
    const tent = [[0, 0], [L.room.L, 0], [L.room.L, L.room.W], [0, L.room.W]].map(([x, y]) => { const w = W(x, y); return [w.x, w.z]; });
    for (const F of c.features || []) { const pts = F.kind === 'rect' ? F.pts.concat([F.pts[0]]) : F.pts; line(featG, pts.map(p => V(p)), fmat);
      const xs = F.pts.map(p => p[0]), zs = F.pts.map(p => p[1]), w = Math.max(...xs) - Math.min(...xs), d = Math.max(...zs) - Math.min(...zs), ctr = [(Math.max(...xs) + Math.min(...xs)) / 2, (Math.max(...zs) + Math.min(...zs)) / 2];
      const t = tag(`${F.name} ${F.kind === 'rect' ? `≈ ${f(w)} × ${m(d)}` : `≈ ${m(Math.hypot(w, d))}`}`, V(ctr, .3), 3, 'a'); t.grp = 'feat';
      const dd = polyDist(tent, F.kind === 'rect' ? F.pts.concat([F.pts[0]]) : F.pts, F.kind !== 'rect'); F.dist = dd.d;
      line(featG, [V(dd.a, .08), V(dd.b, .08)], smat); const t2 = tag(`telk → ${F.name.toLowerCase()} ${m(dd.d)}`, V([(dd.a[0] + dd.b[0]) / 2, (dd.a[1] + dd.b[1]) / 2], .2), 2, 's'); t2.grp = 'feat'; }
    applyLevel(); }
  function segPt(p, a, b) { const dx = b[0] - a[0], dz = b[1] - a[1], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz || 1))); return [a[0] + t * dx, a[1] + t * dz]; }
  function polyDist(A, B, open) { const segs = P => { const s = []; for (let i = 0; i < P.length - 1; i++) s.push([P[i], P[i + 1]]); return s; }; const SA = segs(A.concat([A[0]])), SB = segs(open ? B : B); let best = { d: 1e9 };
    for (const [a1, a2] of SA) for (const [b1, b2] of SB) for (const [p, q1, q2, rev] of [[a1, b1, b2, 0], [a2, b1, b2, 0], [b1, a1, a2, 1], [b2, a1, a2, 1]]) { const qq = segPt(p, q1, q2), d = Math.hypot(p[0] - qq[0], p[1] - qq[1]); if (d < best.d) best = rev ? { d, a: qq, b: p } : { d, a: p, b: qq }; }
    return best; }
  // ---------- toote kaart ----------
  const ray = new THREE.Raycaster(); let down = null, drag = null;
  r.domElement.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY }; const h = hit(e); if (h && h.pick.id && h.pick.kind !== 'tent') { drag = { h, start: ground(e), last: null, moved: false }; } });
  addEventListener('pointermove', e => { if (!drag || !down) return; if (!drag.moved && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 6) return;
    if (!drag.moved) { drag.moved = true; ctl.enabled = false; } const g = ground(e); if (!g || !drag.start) return;
    const a = lg().worldToLocal(drag.start.clone()), b = lg().worldToLocal(g.clone()), dx = b.x - a.x, dy = b.z - a.z, step = .05, qx = Math.round(dx / step) * step, qy = Math.round(dy / step) * step;
    const prev = drag.last || [0, 0]; if (qx === prev[0] && qy === prev[1]) return; EP.moveItem(L, { id: drag.h.pick.id, t: drag.h.pick.t }, qx - prev[0], qy - prev[1]); drag.last = [qx, qy];
    drag.h.obj.position.x += qx - prev[0]; drag.h.obj.position.z += qy - prev[1]; EP.finish(L); renderReq(); need(); });
  addEventListener('pointerup', e => { const d = down; down = null; if (drag && drag.moved) { ctl.enabled = true; drag = null; c.rebuild(v); return; } drag = null;
    if (!d || e.target !== r.domElement || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5) return; const h = hit(e); if (h) openCard(h.pick); });
  function hit(e) { const rc = r.domElement.getBoundingClientRect(); ray.setFromCamera(new THREE.Vector2((e.clientX - rc.left) / rc.width * 2 - 1, -(e.clientY - rc.top) / rc.height * 2 + 1), cam);
    let tent = null; for (const x of ray.intersectObjects(c.party().children, true)) { let o = x.object; while (o && !o.userData.pick) o = o.parent; if (!o) continue; if (o.userData.pick.kind === 'tent') { tent = tent || { pick: o.userData.pick, obj: o }; continue; } return { pick: o.userData.pick, obj: o }; } return tent; } // telgi sees olev ese enne telgi seina
  function ground(e) { const rc = r.domElement.getBoundingClientRect(); ray.setFromCamera(new THREE.Vector2((e.clientX - rc.left) / rc.width * 2 - 1, -(e.clientY - rc.top) / rc.height * 2 + 1), cam); return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3()); }
  function itemOf(p) { return p.id ? L.items.find(i => i.id === p.id) : null; }
  function openCard(p) {
    const R = L.rules, it = itemOf(p), rows = [], kv = (k, val) => rows.push(`<div class="kv"><span>${k}</span><span>${val}</span></div>`);
    let pid = p.product, title, dims, foot, qty;
    if (p.kind === 'tent') { const t = L.tent, i = pinfo(t.product); title = t.name; dims = `${f(t.W)} × ${m(t.L)} · sein ${m(t.sideH)} · hari ${m(t.ridgeH)}`; foot = `${f(t.W + 2 * t.margin)} × ${m(t.L + 2 * t.margin)} (ümber ${m(t.margin)})`; qty = '1'; kv('Uks', `${m(t.doorW)}${(i.std || []).includes('doorW') ? ' <span class="unv">kontrollimata</span>' : ''}`); }
    else if (p.kind === 'chair') { const i = pinfo(pid); title = i.name; dims = SZ.label(i); foot = `${f(i.w)} × ${m(i.d + R.push)} (tooli taga ${m(R.push)})`; qty = `${p.n} tk`; }
    else if (p.kind === 'table') { const tb = it.tables[p.t], i = pinfo(pid), ch = pinfo(R.chair), side = tb.chairs.length ? ch.d + R.push : 0; title = i.name; dims = SZ.label(i); const long = tb.along ? tb.w : tb.d, short = tb.along ? tb.d : tb.w;
      foot = i.round ? `Ø${m(i.w + 2 * side)} (toolid + ${m(R.push)})` : `${f(long)} × ${m(short + 2 * side)} (toolid + ${m(R.push)} tooli taga)`; qty = `${tb.nTab} laud${tb.nTab > 1 ? 'a' : ''} · ${tb.chairs.length} tooli`; }
    else if (it && it.kind === 'stage') { const i = pinfo(it.product || 'podium'), h = it.h != null ? it.h : i.h, mods = EP.podiumModules(Math.max(it.w, it.d), Math.min(it.w, it.d)); pid = it.product || 'podium'; title = it.name; dims = `${f(it.w)} × ${m(it.d)} × h${f(h)}`; foot = `${f(it.w + 2 * R.stageSide)} × ${m(it.d + R.stageFront + R.stageSide)} (ees ${m(R.stageFront)}, külgedel ${m(R.stageSide)})`; qty = Object.entries(mods).map(([k, n]) => `${n} × ${k}`).join(', '); }
    else if (it && it.kind === 'dance') { pid = 'dance'; title = it.name; dims = `${f(it.w)} × ${m(it.d)}`; foot = dims; qty = `${Math.ceil(it.w * it.d - 1e-6)} plaati 1 × 1 m`; }
    else if (it) { const i = pinfo(it.product); title = it.name; dims = SZ.label(i); foot = `${f(it.w)} × ${m(it.d + (it.kind === 'bar' ? R.barWork : R.serviceZone))} (${it.kind === 'bar' ? 'tööala' : 'teenindusala'} ${m(it.kind === 'bar' ? R.barWork : R.serviceZone)})`; qty = `${it.n || 1} tk`; }
    const i = pinfo(pid); kv('Mõõdud', dims); kv('Põhi koos vaba ruumiga', foot); kv('Kogus', qty);
    if (i) kv('Toode', esc(i.name)), kv('Allikas', i.unverified ? `STD <span class="unv">kontrollimata</span>` : `tooteleht · ${i.checked}`);
    const alt = p.kind === 'table' ? CAT.products.filter(q => q.spec.kind === 'table' && q.spec.shape === (i.round ? 'round' : 'rect') && q.id !== pid) : [];
    $('cardB').innerHTML = `<h3>${esc(title)} ${i && i.unverified ? '<span class="unv">kontrollimata</span>' : ''}</h3>${rows.join('')}${i && i.note ? `<div class="sub" style="margin-top:6px;color:#6f685f;font-size:12px">${esc(i.note)}</div>` : ''}
      <button class="bt" id="showD">Näita mõõte</button>${alt.length ? `<select id="swap" class="bt g"><option value="">Vaheta laud…</option>${alt.map(q => `<option value="${q.id}">${esc(q.name)}</option>`).join('')}</select>` : ''}`;
    $('card').style.display = 'block'; sel = Object.assign({}, p, { dims: { it, tent: p.kind === 'tent' } });
    $('showD').onclick = () => { drawSel(); render2d(); };
    if ($('swap')) $('swap').onchange = e => { if (e.target.value) tryFix({ label: `Laud → ${pinfo(e.target.value).name}`, mod: s => s.items.filter(x => x.kind === 'seating').forEach(x => x.table = e.target.value) }, true); };
  }
  function drawSel() { selG.clear(); clearTags('sel'); if (!sel) return need(); const p = sel, it = itemOf(p), dim = (a, b, txt) => { line(selG, [a, b], smat); const t = tag(txt, a.clone().add(b).multiplyScalar(.5), 6, 's'); t.grp = 'sel'; };
    let x, y, w, d, h; if (p.kind === 'tent') { x = 0; y = 0; w = L.room.L; d = L.room.W; h = L.tent.sideH; } else if (p.kind === 'table') { const tb = it.tables[p.t]; x = tb.x; y = tb.y; w = tb.w; d = tb.d; h = pinfo(tb.product).h; } else if (p.kind === 'chair') { const c0 = L.items.find(i => i.tables).tables[0].chairs[0], ch = pinfo(L.rules.chair); x = c0.x - ch.w / 2; y = c0.y - ch.d / 2; w = ch.w; d = ch.d; h = ch.h; } else if (it) { x = it.x; y = it.y; w = it.w; d = it.d; h = it.kind === 'stage' ? (it.h != null ? it.h : pinfo(it.product || 'podium').h) : (pinfo(it.product || 'dance') || {}).h; }
    const o = .25; dim(W(x, y - o, .05), W(x + w, y - o, .05), m(w)); dim(W(x + w + o, y, .05), W(x + w + o, y + d, .05), m(d)); if (h) dim(W(x + w, y, 0), W(x + w, y, h), 'h ' + m(h)); need(); }
  // ---------- 2D plaan (SVG samast paigutusest, valitud ese esile) ----------
  function render2d() { if (!L) return; const P = $('plan'); if (!P) return; const opt = { width: 1100 }; if (sel && sel.id) opt.sel = { id: sel.id, t: sel.t };
    P.innerHTML = EPS.svg(L, opt) + EPS.legendHtml(L) + '<h3 style="max-width:1100px;margin:10px auto 4px;font-size:14px">Tootenimekiri</h3>' + EPS.bomHtml(L); }
  // ---------- tingimused ----------
  function analyze() {
    const R = L.rules, M = L.meas || {}, need = L.spec.guests || 0, A = L.area, tentF = L.room.L * L.room.W, rows = [];
    let occ = 0; for (const it of L.items) { if (it.tables) for (const tb of it.tables) { occ += tb.shape === 'round' ? Math.PI * (tb.d / 2) ** 2 : tb.w * tb.d; const ch = pinfo(R.chair); occ += tb.chairs.length * ch.w * ch.d; } else if (it.w && it.d) occ += it.w * it.d; }
    const free = tentF - occ, standCap = Math.floor(free / R.standM2), has = c2 => (L.problems || []).filter(p => p.code === c2), okC = (...cs) => cs.every(c2 => !has(c2).length);
    rows.push({ ok: L.seats >= need, t: `Külalised: nõutud ${need} · istekohti ${L.seats} · püsti kuni ${standCap}`, sub: `püsti ${f(R.standM2)} m² inimese kohta vabal pinnal` });
    const mv = (k, h) => h >= 0 ? m(h) : (k === 'walk' || k === 'stageFront' ? `kattub ${m(-h)}` : `üle seina ${m(-h)}`);
    const mrow = (k, label, codes) => { const x = M[k]; rows.push({ ok: okC(...codes), t: `${label}: ${x ? mv(k, x.have) : '–'} (nõue ≥ ${m(x ? x.need : 0)})`, sub: x ? `kitsaim koht: ${x.name}` : '', codes }); };
    mrow('wall', 'Seinast', ['wall', 'zonewall']); mrow('chairBack', 'Tooli taga', ['wall']); mrow('walk', 'Vahekäik (kitsaim)', ['walk', 'access']);
    if (L.items.some(i => i.kind === 'stage')) mrow('stageFront', 'Lava ees vaba', ['zone', 'attach']);
    rows.push({ ok: okC('door'), t: `Sissepääs vaba: ${m(L.door ? L.door.w || L.tent.doorW : 0)} lai, ${m(R.entryDepth)} sügav`, codes: ['door'] });
    const inArea = L.tent && A ? L.tent.L + 2 * L.tent.margin <= Math.max(A.l, A.w) + 1e-6 && L.tent.W + 2 * L.tent.margin <= Math.min(A.l, A.w) + 1e-6 : true;
    rows.push({ ok: inArea && okC('overlap', 'zonewall'), t: `Kõik ala sees: telk ${f(L.tent.W)} × ${m(L.tent.L)} alal ${f(Math.min(A.l, A.w))} × ${m(Math.max(A.l, A.w))}, midagi ei kattu`, codes: ['overlap'] });
    if (L.tent) { const tp = SZ.product(CAT, L.tent.product), s = tp.spec, sizes = (s.sizes || []).concat(s.l ? [...Array(Math.floor((s.l.to - s.l.from) / s.l.step) + 1)].map((_, k) => [s.w, s.l.from + k * s.l.step]) : []);
      const real = sizes.some(z => Math.abs(Math.min(...z) - L.tent.W) < .01 && Math.abs(Math.max(...z) - L.tent.L) < .01); rows.push({ ok: real, t: `Telk on kataloogi suurus: ${tp.name} ${f(L.tent.W)} × ${m(L.tent.L)}`, sub: real ? '' : 'sellist suurust kataloogis ei ole' }); }
    for (const F of c.features || []) if (F.dist != null) rows.push({ info: 1, t: `Kaugus: telk → ${F.name.toLowerCase()} ${m(F.dist)}`, sub: F.note || '' });
    const unv = (L.bom || []).filter(b => b.unverified); if (unv.length) rows.push({ info: 1, warn: 1, t: `Mõõt kontrollimata (STD): ${unv.map(b => b.name).join(', ')}` });
    return { rows, tentF, occ, free, area: A.l * A.w, need };
  }
  let fixes = null, open = innerWidth > 600; // telefonis kokku (alumine leht), arvutis lahti
  function renderReq() { if (!L) return; const a = analyze(), bad = a.rows.filter(x => x.ok === false), probs = L.problems || [];
    const head = `<h3 id="reqH"><span>Tingimused ${bad.length ? `<span class="no">✗ ${bad.length}</span>` : '<span class="ok">✓ kõik täidetud</span>'}</span><span style="color:#6f685f;font-weight:600">${open ? '▾' : '▴'}</span></h3>`;
    const rows = a.rows.map(x => `<div class="row ${x.info ? (x.warn ? '' : '') : x.ok ? 'ok' : 'no'}">${x.info ? (x.warn ? '<span class="unv">!</span>' : 'ℹ') : x.ok ? '✓' : '✗'} ${esc(x.t)}${x.sub && (x.ok === false || x.info) ? `<div class="sub">${esc(x.sub)}</div>` : ''}${!x.ok && !x.info && x.codes ? probs.filter(p => x.codes.includes(p.code)).slice(0, 3).map(p => `<div class="sub no">${esc(p.text)}${p.need != null && p.have != null ? ` · puudu ${m(Math.max(0, p.need - p.have))}` : ''}</div>`).join('') : ''}</div>`).join('');
    const freeB = `<div class="free">Ala ${m2(a.area)} · telgi põrand ${m2(a.tentF)} · hõivatud ${m2(a.occ)} · vaba ${m2(a.free)}<br>${a.need ? `${m2(a.tentF / a.need)} külalise kohta (vaba ${m2(a.free / a.need)})` : ''}</div>`;
    const fx = !L.ok ? `<div class="fx">${fixes ? (fixes.length ? fixes.map((q, k) => `<button class="bt" data-fx="${k}">✓ ${esc(q.label)}</button>`).join('') : '<div class="sub">Kontrollitud parandusi ei leitud.</div>') : '<button class="bt g" id="findFx">Leia parandused</button>'}</div>` : '';
    $('req').innerHTML = head + rows + fx + freeB; $('req').classList.toggle('open', open);
    $('reqH').onclick = () => { open = !open; renderReq(); };
    if ($('findFx')) $('findFx').onclick = () => { $('findFx').textContent = 'Kontrollin…'; setTimeout(findFixes, 30); };
    $('req').querySelectorAll('[data-fx]').forEach(b => b.onclick = () => applyFix(fixes[+b.dataset.fx]));
  }
  // parandused: lahendaja kontrollib iga variandi (ainult kataloogi tooted ja suurused)
  const solve = mod => { const s = JSON.parse(JSON.stringify(L.spec)); mod(s); try { const res = EP.solve(s, CAT, { max: 1 }); return res.ok ? res.best : null; } catch (e) { return null; } };
  function candidates() { const s = L.spec, out = [{ label: 'Paiguta uuesti samade toodetega', mod: () => {} }];
    if (L.tent) { const R = L.rules, opts = EP.tentOptions(CAT, { type: L.tent.type }, s.area, R).filter(t => t.W * t.L > L.tent.W * L.tent.L).slice(0, 2); for (const t of opts) out.push({ label: `Suurem telk: ${t.name}`, mod: x => { x.tent = { type: t.type, size: [t.W, t.L] }; } }); }
    const tb = (s.items.find(i => i.kind === 'seating') || {}).table; for (const id of ['rect240', 'rect152', 'rect183w'].filter(k => k !== tb)) out.push({ label: `Teine laud: ${pinfo(id).name}`, mod: x => x.items.filter(i => i.kind === 'seating').forEach(i => i.table = id) });
    const st = s.items.find(i => i.kind === 'stage'); if (st && st.w * st.d > 4) out.push({ label: 'Väiksem lava 4 × 2 m', mod: x => { const y = x.items.find(i => i.kind === 'stage'); y.w = 4; y.d = 2; } });
    return out; }
  function findFixes() { fixes = []; for (const q of candidates()) { const r2 = solve(q.mod); if (r2) fixes.push(Object.assign(q, { L: r2 })); if (fixes.length >= 4) break; } renderReq(); }
  function tryFix(q, apply) { const r2 = solve(q.mod); if (!r2) { alert('Selle muudatusega paigutust ei leitud.'); return; } if (apply) applyFix(Object.assign(q, { L: r2 })); }
  function applyFix(q) { const nl = q.L; nl.catalog = CAT; LAY[v] = nl; fixes = null; sel = null; if (innerWidth <= 600) open = false; $('card').style.display = 'none'; c.rebuild(v); }
  // ---------- vaataja kutsub ----------
  function onBuild(Lx, vx) { L = Lx; v = vx; if (!L.catalog) L.catalog = CAT; EP.finish(L); fixes = null; drawAll(); drawFeatures(); drawSel(); render2d(); renderReq();
    // vigased esemed punaseks
    const bad = new Set(L.bad || []); c.party().traverse(o => { if (o.userData.pick && bad.has(o.userData.pick.id)) o.traverse(q => { if (q.isMesh && q.material && q.material.emissive) { q.material = q.material.clone(); q.material.emissive.set('#c0392b'); q.material.emissiveIntensity = .5; } }); }); }
  return { onBuild, level: () => level };
}
