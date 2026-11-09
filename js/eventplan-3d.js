/* Sündmuse planeerija: 3D vaade samast paigutusest (päris mõõdus lihtsad kujud). Vajab globaalset THREE + OrbitControls.
   Plaani x -> 3D x, plaani y -> 3D z, kõrgus y. */
(function (G) {
'use strict';
const fmt = v => (Math.round(v * 100) / 100).toString().replace('.', ',');

function view3d(box, L, opt) {
  opt = opt || {};
  const T = G.THREE;
  const r = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  r.setPixelRatio(Math.min(G.devicePixelRatio || 1, 2)); r.shadowMap.enabled = true; r.shadowMap.type = T.PCFSoftShadowMap;
  if ('outputEncoding' in r) r.outputEncoding = T.sRGBEncoding; r.toneMapping = T.ACESFilmicToneMapping; r.toneMappingExposure = 1.1;
  box.appendChild(r.domElement); r.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none';
  const sc = new T.Scene(); sc.background = new T.Color('#cdd9e1'); sc.fog = new T.Fog('#cdd9e1', 120, 600); if (sc.background.convertSRGBToLinear) sc.background.convertSRGBToLinear();
  const cam = new T.PerspectiveCamera(42, 1, .1, 2000);
  const ctl = new T.OrbitControls(cam, r.domElement); ctl.enableDamping = true; ctl.maxPolarAngle = Math.PI / 2 - .03;
  sc.add(new T.HemisphereLight('#ffffff', '#8f877b', .62));
  const sun = new T.DirectionalLight('#fff6ea', 1.0); sun.castShadow = true; sun.shadow.bias = -.0004; sun.shadow.normalBias = .03; sc.add(sun); sc.add(sun.target);
  const root = new T.Group(); sc.add(root);
  const labels = document.createElement('div'); labels.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden'; box.style.position = box.style.position || 'relative'; box.appendChild(labels);
  const M = (c, o) => { const m = new T.MeshStandardMaterial(Object.assign({ color: c, roughness: .85 }, o || {})); if (m.color.convertSRGBToLinear) m.color.convertSRGBToLinear(); return m; }; // r128: värvid sRGB -> lineaarne, muidu kõik on pleekinud
  const mat = { grass: M('#7f9a64'), floor: M('#d9d2c4'), white: M('#ffffff', { roughness: .6 }), cloth: M('#fbfbf8', { roughness: .9 }), chair: M('#cfc6b8'), stage: M('#2f2c29'), wood: M('#9a7350'), counter: M('#3b3733'), wc: M('#6f8796'), red: M('#e5482d', { transparent: true, opacity: .55 }),
    tentWall: M('#ffffff', { transparent: true, opacity: .14, side: T.DoubleSide, depthWrite: false }), roof: M('#ffffff', { transparent: true, opacity: .2, side: T.DoubleSide, depthWrite: false }), post: M('#c9cdd1', { metalness: .4, roughness: .4 }), audience: M('#cfe0c4', { transparent: true, opacity: .6 }), zone: M('#d8d0c2', { transparent: true, opacity: .35 }) };
  const danceTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#f6f3ee'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#d9d2c6'; g.fillRect(0, 0, 32, 32); g.fillRect(32, 32, 32, 32); const t = new T.CanvasTexture(c); if ('encoding' in t) t.encoding = T.sRGBEncoding; t.wrapS = t.wrapT = T.RepeatWrapping; t.magFilter = T.NearestFilter; return t; })();
  let state = { L: null, roof: true, walls: true, measure: false, walk: false, items: [] };
  const lab = [];

  function addBox(w, h, d, x, y, z, m, parent) { const o = new T.Mesh(new T.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; (parent || root).add(o); return o; }
  function label(text, x, y, z, red) { const e = document.createElement('div'); e.textContent = text; e.style.cssText = `position:absolute;transform:translate(-50%,-100%);font:600 11.5px Inter Tight,Arial,sans-serif;background:${red ? '#e5482d' : 'rgba(22,19,15,.82)'};color:#fff;padding:2px 7px;border-radius:5px;white-space:nowrap`; labels.appendChild(e); lab.push({ e, p: new T.Vector3(x, y, z) }); }

  function build(L) {
    state.L = L; while (root.children.length) { const c = root.children.pop(); c.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
    labels.innerHTML = ''; lab.length = 0; mlist.length = 0;
    const R = L.room, bad = new Set(L.bad || []), o = L.origin || { x: 0, y: 0 };
    const A = L.area ? { L: Math.max(L.area.l, L.area.w), W: Math.min(L.area.l, L.area.w) } : { L: R.L + 20, W: R.W + 20 };
    const gx = L.area ? -o.x : -10, gz = L.area ? -o.y : -10;
    const g = new T.Mesh(new T.PlaneGeometry(Math.max(A.L, R.L) * 6 + 300, Math.max(A.L, R.L) * 6 + 300), M('#b7c6a3')); g.rotation.x = -Math.PI / 2; g.position.set(R.L / 2, -.01, R.W / 2); g.receiveShadow = true; root.add(g);
    const ga = new T.Mesh(new T.PlaneGeometry(A.L, A.W), mat.grass); ga.rotation.x = -Math.PI / 2; ga.position.set(gx + A.L / 2, 0, gz + A.W / 2); ga.receiveShadow = true; root.add(ga);
    if (L.tent) { const f = new T.Mesh(new T.PlaneGeometry(R.L, R.W), mat.floor); f.rotation.x = -Math.PI / 2; f.position.set(R.L / 2, .01, R.W / 2); f.receiveShadow = true; root.add(f); tent(L); }
    if (L.door) { const z = L.door.zone; const d = new T.Mesh(new T.PlaneGeometry(z.w, z.d), M('#7fbf8a', { transparent: true, opacity: .45 })); d.rotation.x = -Math.PI / 2; d.position.set(z.x + z.w / 2, .02, z.y + z.d / 2); root.add(d); label('Sissepääs', z.x + z.w / 2, .3, z.y + z.d / 2); }
    // instantsitud toolid ja lauad (gala 250 toolil peab jooksma sujuvalt)
    const chairs = [], rounds = [], cocktails = [];
    for (const it of L.items) {
      const red = bad.has(it.id), cx = it.x + it.w / 2, cz = it.y + it.d / 2;
      for (const zn of it.zones || []) { const zm = new T.Mesh(new T.PlaneGeometry(zn.w, zn.d), mat.zone); zm.rotation.x = -Math.PI / 2; zm.position.set(zn.x + zn.w / 2, .015, zn.y + zn.d / 2); root.add(zm); }
      if (it.kind === 'seating' || it.kind === 'standing') {
        for (const t of it.tables) {
          if (t.shape === 'round') rounds.push(t); else if (t.shape === 'cocktail') cocktails.push(t);
          else { addBox(t.w, .04, t.d, t.x + t.w / 2, .74, t.y + t.d / 2, mat.cloth); addBox(t.w - .02, .7, t.d - .02, t.x + t.w / 2, .37, t.y + t.d / 2, M('#f4f2ee', { transparent: true, opacity: .95 })); }
          for (const c of t.chairs || []) chairs.push(c);
        }
        if (it.kind === 'standing') for (const z of it.zonesArea || []) { const zm = new T.Mesh(new T.PlaneGeometry(z.w, z.d), M('#efe7d8', { transparent: true, opacity: .5 })); zm.rotation.x = -Math.PI / 2; zm.position.set(z.x + z.w / 2, .018, z.y + z.d / 2); root.add(zm); }
        const tt = it.tables[0]; if (tt) label(it.kind === 'standing' ? `Püstivastuvõtt ${it.guests} in` : `${it.seats} kohta`, cx, 1.5, cz, red);
        continue;
      }
      if (it.kind === 'stage') {
        const h = it.h || (it.product === 'truss-stage' ? 1 : .4); addBox(it.w, h, it.d, cx, h / 2, cz, red ? mat.red : mat.stage);
        if (it.product === 'truss-stage') { const rh = 5; for (const [px, pz] of [[it.x, it.y], [it.x + it.w, it.y], [it.x, it.y + it.d], [it.x + it.w, it.y + it.d]]) addBox(.3, rh, .3, px, rh / 2, pz, mat.post); addBox(it.w + .3, .4, it.d + .3, cx, rh, cz, mat.post); }
        label(`${it.name}`, cx, h + .6, cz, red); mlist.push({ it, h }); continue;
      }
      if (it.kind === 'dance') { const m = new T.MeshStandardMaterial({ map: danceTex.clone(), roughness: .35 }); m.map.needsUpdate = true; m.map.repeat.set(it.w, it.d); addBox(it.w, .04, it.d, cx, .02, cz, red ? mat.red : m); label(it.name, cx, .6, cz, red); continue; }
      if (it.kind === 'audience') { const m = new T.Mesh(new T.PlaneGeometry(it.w, it.d), mat.audience); m.rotation.x = -Math.PI / 2; m.position.set(cx, .02, cz); root.add(m); label(it.name, cx, .5, cz, red); continue; }
      if (it.kind === 'bar') { addBox(it.w, 1.1, it.d, cx, .55, cz, red ? mat.red : mat.counter); label(it.name, cx, 1.7, cz, red); continue; }
      if (it.kind === 'catering') { addBox(it.w, .05, it.d, cx, .74, cz, mat.cloth); addBox(it.w - .04, .72, it.d - .04, cx, .36, cz, red ? mat.red : M('#f4f2ee')); label(it.name, cx, 1.4, cz, red); continue; }
      if (it.kind === 'wc') { const n = it.n || 1, hor = it.w >= it.d, u = (hor ? it.w : it.d) / n; for (let i = 0; i < n; i++) addBox(hor ? u - .05 : it.w, 2.3, hor ? it.d : u - .05, hor ? it.x + u * (i + .5) : cx, 1.15, hor ? cz : it.y + u * (i + .5), red ? mat.red : mat.wc); label(it.name, cx, 2.9, cz, red); continue; }
      if (it.kind === 'popup') { const n = it.n || 1, hor = it.w >= it.d, s = it.unitW, gp = L.rules.popupGap; for (let i = 0; i < n; i++) { const px = hor ? it.x + i * (s + gp) + s / 2 : cx, pz = hor ? cz : it.y + i * (s + gp) + s / 2; popup(px, pz, s, hor ? it.d : it.w); } label(it.name, cx, 3.4, cz, red); continue; }
    }
    inst(chairs, chairGeo(), mat.chair, (c, m4) => { m4.makeRotationY(-c.a + Math.PI / 2); m4.setPosition(c.x, 0, c.y); });
    inst(rounds, roundGeo(), mat.cloth, (t, m4) => { m4.makeScale(t.d / 1.8, 1, t.d / 1.8); m4.setPosition(t.x, 0, t.y); });
    inst(cocktails, cocktailGeo(), mat.cloth, (t, m4) => { m4.makeTranslation(t.x, 0, t.y); });
    frame(L);
  }
  function inst(list, geo, m, set) { if (!list.length) return; const im = new T.InstancedMesh(geo, m, list.length), m4 = new T.Matrix4(); list.forEach((x, i) => { set(x, m4); im.setMatrixAt(i, m4); }); im.castShadow = im.receiveShadow = true; root.add(im); }
  function merge(parts) { const BU = T.BufferGeometryUtils; if (BU && BU.mergeGeometries) return BU.mergeGeometries(parts); // väike käsitsi ühendamine
    const pos = [], nor = [], idx = []; let off = 0; for (const p of parts) { const g = p.index ? p.toNonIndexed() : p; g.computeVertexNormals(); pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array); } const out = new T.BufferGeometry(); out.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); out.setAttribute('normal', new T.Float32BufferAttribute(nor, 3)); return out; }
  function chairGeo() { const s = new T.BoxGeometry(.45, .05, .45).translate(0, .46, 0), b = new T.BoxGeometry(.45, .5, .05).translate(0, .72, -.2), legs = [[-.2, -.2], [.2, -.2], [-.2, .2], [.2, .2]].map(([x, z]) => new T.BoxGeometry(.04, .45, .04).translate(x, .225, z)); return merge([s, b, ...legs]); }
  function roundGeo() { return merge([new T.CylinderGeometry(.9, .9, .04, 40).translate(0, .74, 0), new T.CylinderGeometry(.93, .96, .7, 40, 1, true).translate(0, .37, 0)]); }
  function cocktailGeo() { return merge([new T.CylinderGeometry(.405, .405, .04, 28).translate(0, 1.1, 0), new T.CylinderGeometry(.42, .5, 1.08, 28, 1, true).translate(0, .54, 0)]); }
  function popup(x, z, w, d) { const h = 2.1; for (const [px, pz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]]) addBox(.05, h, .05, x + px, h / 2, z + pz, mat.post); const roof = new T.Mesh(new T.ConeGeometry(Math.hypot(w, d) / 2, 1, 4, 1), mat.white); roof.rotation.y = Math.PI / 4; roof.scale.set(w / Math.hypot(w, d) * Math.SQRT2, 1, d / Math.hypot(w, d) * Math.SQRT2); roof.position.set(x, h + .5, z); roof.castShadow = true; root.add(roof); }
  let tentG = null;
  function tent(L) {
    const R = L.room, sh = L.tent.sideH || 2.3, rid = sh + Math.min(R.W * .2, 4), g = new T.Group(); tentG = g; root.add(g);
    const bay = L.tent.type === 'modular' ? (R.W >= 10 ? 5 : 3) : R.L;
    const xs = []; for (let x = 0; x <= R.L + 1e-6; x += bay) xs.push(Math.min(x, R.L)); if (xs[xs.length - 1] < R.L - .01) xs.push(R.L);
    for (const x of xs) { for (const z of [0, R.W]) addBox(.12, sh, .12, x, sh / 2, z, mat.post, g); const raf = new T.Shape(); }
    // katus: viilkatus (pagoda: püramiid)
    const roof = new T.Group(); g.add(roof); roof.name = 'roof';
    if (L.tent.type === 'pagoda' || L.tent.type === 'popup') { const c = new T.Mesh(new T.ConeGeometry(Math.hypot(R.L, R.W) / 2, rid - sh + 1, 4, 1, true), mat.roof); c.rotation.y = Math.PI / 4; c.scale.set(R.L / Math.hypot(R.L, R.W) * Math.SQRT2, 1, R.W / Math.hypot(R.L, R.W) * Math.SQRT2); c.position.set(R.L / 2, sh + (rid - sh + 1) / 2, R.W / 2); roof.add(c); }
    else { const geo = new T.BufferGeometry(), v = [0, sh, 0, R.L, sh, 0, R.L, rid, R.W / 2, 0, rid, R.W / 2, 0, sh, R.W, R.L, sh, R.W]; geo.setAttribute('position', new T.Float32BufferAttribute(v, 3)); geo.setIndex([0, 1, 2, 0, 2, 3, 3, 2, 5, 3, 5, 4, 0, 3, 4, 1, 5, 2]); geo.computeVertexNormals(); roof.add(new T.Mesh(geo, mat.roof)); for (const x of xs) { addBox(.08, .08, Math.hypot(R.W / 2, rid - sh) , x, (sh + rid) / 2, R.W / 4, mat.post, roof).rotation.x = -Math.atan2(rid - sh, R.W / 2); addBox(.08, .08, Math.hypot(R.W / 2, rid - sh), x, (sh + rid) / 2, 3 * R.W / 4, mat.post, roof).rotation.x = Math.atan2(rid - sh, R.W / 2); } }
    // seinad (uks jääb lahti)
    const walls = new T.Group(); walls.name = 'walls'; g.add(walls);
    const dz = L.door;
    const wall = (k, a0, a1) => { const len = a1 - a0; if (len <= .01) return; const m = new T.Mesh(new T.PlaneGeometry(len, sh), mat.tentWall); const mid = (a0 + a1) / 2; if (k === 0) m.position.set(mid, sh / 2, 0); else if (k === 2) m.position.set(mid, sh / 2, R.W); else { m.rotation.y = Math.PI / 2; m.position.set(k === 3 ? 0 : R.L, sh / 2, mid); } walls.add(m); };
    for (let k = 0; k < 4; k++) { const len = k % 2 === 0 ? R.L : R.W; if (dz && dz.wall === k) { wall(k, 0, dz.t); wall(k, dz.t + dz.w, len); } else wall(k, 0, len); }
    roof.visible = state.roof; walls.visible = state.walls;
  }
  function frame(L) {
    const R = L.room, c = new T.Vector3(R.L / 2, 0, R.W / 2), asp = box.clientWidth / Math.max(1, box.clientHeight), s = Math.max(R.L, R.W) * Math.max(1, Math.pow(1.5 / Math.max(.4, asp), .6));
    sc.fog.near = s * 2.5; sc.fog.far = s * 9; ctl.target.copy(c); cam.position.set(c.x - s * .6, s * .8, c.z + s * 1.0); cam.near = .1; cam.far = s * 20; cam.updateProjectionMatrix(); ctl.update();
    sun.position.set(c.x - s, s * 1.4, c.z - s * .6); sun.target.position.copy(c); const sc2 = sun.shadow.camera; sc2.left = sc2.bottom = -s * .8; sc2.right = sc2.top = s * .8; sc2.far = s * 5; sc2.updateProjectionMatrix(); sun.shadow.mapSize.set(2048, 2048);
  }

  // mõõtmine: kaks klõpsu maapinnal või esemel
  const mlist = [], ray = new T.Raycaster(), mpts = [], mg = new T.Group(); sc.add(mg);
  let downAt = null;
  r.domElement.addEventListener('pointerdown', e => { downAt = [e.clientX, e.clientY]; });
  r.domElement.addEventListener('pointerup', e => {
    if (!state.measure || !downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
    const b = r.domElement.getBoundingClientRect(), p = new T.Vector2((e.clientX - b.left) / b.width * 2 - 1, -(e.clientY - b.top) / b.height * 2 + 1);
    ray.setFromCamera(p, cam); const hit = ray.intersectObjects(root.children, true).find(h => h.object.type === 'Mesh' || h.object.isInstancedMesh);
    if (!hit) return; if (mpts.length >= 2) { mpts.length = 0; mg.clear(); measureEl(null); }
    mpts.push(hit.point.clone()); const dot = new T.Mesh(new T.SphereGeometry(.08, 12, 8), M('#e5482d')); dot.position.copy(hit.point); mg.add(dot);
    if (mpts.length === 2) { const g2 = new T.BufferGeometry().setFromPoints(mpts); mg.add(new T.Line(g2, new T.LineBasicMaterial({ color: '#e5482d' }))); const d = mpts[0].distanceTo(mpts[1]), dh = Math.hypot(mpts[0].x - mpts[1].x, mpts[0].z - mpts[1].z); measureEl(`${fmt(d)} m${Math.abs(d - dh) > .05 ? ` (põrandal ${fmt(dh)} m)` : ''}`); if (opt.onMeasure) opt.onMeasure(d); }
  });
  let mEl = null; function measureEl(t) { if (!mEl) { mEl = document.createElement('div'); mEl.style.cssText = 'position:absolute;transform:translate(-50%,-130%);font:700 13px Inter Tight,Arial;background:#e5482d;color:#fff;padding:3px 8px;border-radius:6px;white-space:nowrap'; labels.appendChild(mEl); } mEl.hidden = !t; if (t) { mEl.textContent = t; mEl._p = mpts[0].clone().add(mpts[1]).multiplyScalar(.5); } }

  // jalutamine: silmad 1,6 m, lohista = vaata ringi, WASD/nooled = liigu
  const keys = {}; let yaw = 0, pitch = 0, look = null;
  addEventListener('keydown', e => { if (state.walk) keys[e.key.toLowerCase()] = 1; });
  addEventListener('keyup', e => { keys[e.key.toLowerCase()] = 0; });
  r.domElement.addEventListener('pointermove', e => { if (!state.walk || !look) return; yaw -= (e.clientX - look[0]) * .005; pitch = Math.max(-1.2, Math.min(1.2, pitch - (e.clientY - look[1]) * .005)); look = [e.clientX, e.clientY]; });
  r.domElement.addEventListener('pointerdown', e => { if (state.walk) look = [e.clientX, e.clientY]; });
  addEventListener('pointerup', () => { look = null; });
  let walkTouch = 0; // telefonis: kaks sõrme = edasi
  r.domElement.addEventListener('touchstart', e => { walkTouch = state.walk && e.touches.length >= 2 ? 1 : 0; }, { passive: true });
  r.domElement.addEventListener('touchend', () => { walkTouch = 0; }, { passive: true });
  function setWalk(on) {
    state.walk = on; ctl.enabled = !on;
    if (on) { const Lr = state.L.room, d = state.L.door; const p = d ? d.zone : { x: Lr.L / 2, y: Lr.W / 2, w: 0, d: 0 }; cam.position.set(p.x + p.w / 2, 1.6, p.y + p.d / 2); yaw = Math.atan2(-(Lr.L / 2 - cam.position.x), -(Lr.W / 2 - cam.position.z)); pitch = -.1; }
    else frame(state.L);
  }
  let last = performance.now(), raf = 0;
  function loop(t) {
    raf = requestAnimationFrame(loop); const dt = Math.min(.05, (t - last) / 1000); last = t;
    if (state.walk) { const sp = 2.2 * dt, f = (keys.w || keys.arrowup || walkTouch ? 1 : 0) - (keys.s || keys.arrowdown ? 1 : 0), s2 = (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0); cam.position.x += (-Math.sin(yaw) * f + Math.cos(yaw) * s2) * sp; cam.position.z += (-Math.cos(yaw) * f - Math.sin(yaw) * s2) * sp; cam.rotation.set(pitch, yaw, 0, 'YXZ'); }
    else ctl.update();
    r.render(sc, cam);
    const b = r.domElement.getBoundingClientRect(), v = new T.Vector3();
    for (const l of lab) { v.copy(l.p).project(cam); const vis = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1 && state.labels !== false; l.e.style.display = vis ? '' : 'none'; if (vis) { l.e.style.left = ((v.x + 1) / 2 * b.width) + 'px'; l.e.style.top = ((1 - v.y) / 2 * b.height) + 'px'; } }
    if (mEl && !mEl.hidden && mEl._p) { v.copy(mEl._p).project(cam); mEl.style.left = ((v.x + 1) / 2 * b.width) + 'px'; mEl.style.top = ((1 - v.y) / 2 * b.height) + 'px'; }
  }
  const ro = new ResizeObserver(() => { const w = box.clientWidth, h = box.clientHeight; r.setSize(w, h, false); cam.aspect = w / Math.max(1, h); cam.updateProjectionMatrix(); }); ro.observe(box);
  build(L); raf = requestAnimationFrame(loop);
  return {
    update: build, setWalk,
    setMeasure(on) { state.measure = on; if (!on) { mpts.length = 0; mg.clear(); measureEl(null); } },
    setRoof(on) { state.roof = on; if (tentG) tentG.getObjectByName('roof').visible = on; },
    setWalls(on) { state.walls = on; if (tentG) tentG.getObjectByName('walls').visible = on; },
    setLabels(on) { state.labels = on; },
    snapshot(w, h) { const ow = r.domElement.width, oh = r.domElement.height, oa = cam.aspect; r.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); r.render(sc, cam); const url = r.domElement.toDataURL('image/jpeg', .9); r.setSize(ow / r.getPixelRatio(), oh / r.getPixelRatio(), false); cam.aspect = oa; cam.updateProjectionMatrix(); return url; },
    camera: cam, renderer: r, scene: sc,
    dispose() { cancelAnimationFrame(raf); ro.disconnect(); r.dispose(); box.innerHTML = ''; }
  };
}
G.EventPlan = G.EventPlan || {}; G.EventPlan.view3d = view3d;
})(typeof globalThis !== 'undefined' ? globalThis : this);
