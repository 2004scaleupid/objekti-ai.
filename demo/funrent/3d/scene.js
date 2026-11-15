// Jõe tn 4 hoovi 3D nagu landingu gala (hero/scene.js): fotolt sirgestatud fassaadid (kalibreeritud kaamera + LOD2), ortofoto maapinnaks,
// Tripo GLB mudelid (telk, toolid, lauad, lava, baar, kaar, heinapallid; gala puhvetlaud), sama valgus, toonivastendus ja varjud. Renderdab ainult muutuse korral.
// Koordinaadid = 2D plaan: x lõuna suunas (ala põhjaservast), z lääne suunas (ala idaservast), meetrites. Pealtvaade = plaan.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const $ = id => document.getElementById(id), small = Math.min(innerWidth, innerHeight) < 700;
const fmt = (v, d = 2) => (+v).toFixed(d).replace('.', ',');
const box = $('stage'), tagsEl = $('tags');
// valgus ja toonivastendus nagu hero/scene.js
const r = new THREE.WebGLRenderer({ antialias: !small, preserveDrawingBuffer: true });
r.setPixelRatio(Math.min(devicePixelRatio || 1, small ? 1.5 : 2)); r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.22; r.outputColorSpace = THREE.SRGBColorSpace; box.appendChild(r.domElement);
const sc = new THREE.Scene();
{ const c = document.createElement('canvas'); c.width = 4; c.height = 256; const x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, '#8fb6dc'); g.addColorStop(.7, '#d5e3ee'); g.addColorStop(1, '#eef0ea'); x.fillStyle = g; x.fillRect(0, 0, 4, 256); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; sc.background = t; }
sc.fog = new THREE.Fog('#dfe8ee', 70, 170);
sc.add(new THREE.HemisphereLight('#eef0f4', '#6a6a70', 1.05));
const sun = new THREE.DirectionalLight('#fff4e6', 1.6); sun.position.set(30, 30, -12); sun.castShadow = true; sun.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 110 }); sun.shadow.bias = -.0004; sun.shadow.normalBias = .03; sc.add(sun); sc.add(sun.target); sun.target.position.set(4, 0, 2);

// ---------- kaamerad ----------
const cam = new THREE.PerspectiveCamera(36, 1, .1, 600), ortho = new THREE.OrthographicCamera(-10, 10, 10, -10, .1, 400);
let active = cam;
const ctl = new OrbitControls(cam, r.domElement); ctl.enableDamping = true; ctl.dampingFactor = .08; ctl.maxPolarAngle = Math.PI / 2 - .04; ctl.minDistance = 3; ctl.maxDistance = 90; ctl.screenSpacePanning = false;
const octl = new OrbitControls(ortho, r.domElement); octl.enableRotate = false; octl.screenSpacePanning = true; octl.enabled = false; octl.enableDamping = true;
const AREA = { L: 11.55, W: 8.65 }, CEN = new THREE.Vector3(AREA.L / 2, 0, AREA.W / 2);
// algvaade: foto suunast (kaamera seisis Jõe tänaval edelas), veidi kõrgemalt
function home() { ctl.target.copy(CEN).setY(1.2); const asp = box.clientWidth / Math.max(1, box.clientHeight), d = 30 * Math.max(1, Math.pow(1.4 / Math.max(.45, asp), .7)); const dir = new THREE.Vector3(.35, 0, 1).normalize(); cam.position.set(CEN.x + dir.x * d, d * .62, CEN.z + dir.z * d); ctl.update(); }

// ---------- abifunktsioonid ----------
const M = (c, o) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: .85 }, o || {}));
const TL = new THREE.TextureLoader(), tex = u => new Promise(res => TL.load(u, t => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; res(t); }));
const world = new THREE.Group(); sc.add(world); let layoutG = new THREE.Group(); sc.add(layoutG);
const add = (o, p) => { (p || world).add(o); return o; };
const blobTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 6, 64, 64, 62); gr.addColorStop(0, 'rgba(0,0,0,.6)'); gr.addColorStop(.55, 'rgba(0,0,0,.28)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); })();
const blobMat = new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
function blob(x, z, w, d, p, ry = 0) { const o = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), blobMat); o.position.set(x, .02, z); o.rotation.y = ry; return add(o, p); }

// ---------- krunt: Maa-ameti andmed ----------
const SITE = await fetch('../out/site.json').then(r => r.json()), REAL = await fetch('../site/site-real.json').then(r => r.json());
const [tGround, tFS, tFW, tGP] = await Promise.all([tex('tex/ground.webp'), tex('tex/facade_s.webp'), tex('tex/facade_w.webp'), tex('tex/ground_photo.webp')]);
// ortofoto (60 × 60 m, keskpunkt 562222 / 6588478) plaani telgedel + rohi kaugemal
{ const g = new THREE.Mesh(new THREE.PlaneGeometry(260, 260).rotateX(-Math.PI / 2), M('#72844f', { roughness: 1 })); g.position.set(8.8, -.02, -1.25); g.receiveShadow = true; add(g);
  const o = new THREE.Mesh(new THREE.PlaneGeometry(60, 60).rotateX(-Math.PI / 2), M('#e2ead6', { map: tGround, roughness: .95 })); o.position.set(8.8, 0, -1.25); o.receiveShadow = true; add(o);
  const gp = new THREE.Mesh(new THREE.PlaneGeometry(20, 14).rotateX(-Math.PI / 2), M('#ffffff', { map: tGP, transparent: true, roughness: .95, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 })); gp.position.set(6.5, .006, 3.5); gp.receiveShadow = true; add(gp); }
// kortermaja LOD2 jalajäljest; lõuna- ja läänesein fotolt sirgestatud, ülejäänud krohvivärv
{ const fp = REAL.building.footprint_local, H = REAL.building.eave, plaster = M('#e8e4dc', { roughness: .9 }), plinth = M('#4a4f58', { roughness: .9 });
  const wallTex = { 0: [tFS, 1, 0], 1: [tFW, 0, 1] }; // sein i: [tekstuur, u lõpp-punktis a, u lõpp-punktis b]  (u=0 = SW nurk)
  const grp = new THREE.Group(); add(grp); grp.userData.info = { name: 'Kortermaja Jõe tn 4', rows: [['EHR', REAL.building.ehr], ['Kõrgus', fmt(REAL.building.height) + ' m'], ['Fassaad', 'fotolt (kalibreeritud)'], ['Kuju', 'Maa-amet LOD2']] };
  for (let i = 0; i < 4; i++) { const a = fp[i], b = fp[(i + 1) % 4], T = wallTex[i];
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute([a[0], 0, a[1], b[0], 0, b[1], b[0], H, b[1], a[0], H, a[1]], 3));
    const ua = T ? T[1] : 0, ub = T ? T[2] : 1; geo.setAttribute('uv', new THREE.Float32BufferAttribute([ua, 0, ub, 0, ub, 1, ua, 1], 2)); geo.setIndex([0, 1, 2, 0, 2, 3]); geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, T ? new THREE.MeshStandardMaterial({ map: T[0], roughness: .9, side: THREE.DoubleSide }) : plaster.clone()); if (!T) m.material.side = THREE.DoubleSide; m.castShadow = m.receiveShadow = true; grp.add(m);
    if (!T) { const pg = new THREE.Mesh(new THREE.PlaneGeometry(Math.hypot(b[0] - a[0], b[1] - a[1]), .9), plinth); pg.position.set((a[0] + b[0]) / 2, .45, (a[1] + b[1]) / 2); pg.rotation.y = -Math.atan2(b[1] - a[1], b[0] - a[0]); pg.material.side = THREE.DoubleSide; grp.add(pg); } }
  const sh = new THREE.Shape(fp.map(p => new THREE.Vector2(p[0], -p[1]))), roof = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: .3, bevelEnabled: false }), M('#3f4246', { roughness: .9 }));
  roof.rotation.x = -Math.PI / 2; roof.position.y = H; roof.castShadow = true; grp.add(roof); }
// puu (nDSM): madala polügooniga võra
{ const grp = new THREE.Group(); add(grp); const tr = new THREE.Mesh(new THREE.CylinderGeometry(.22, .3, 3.4, 8), M('#5b4636')); tr.position.set(8.8, 1.7, -8.6); tr.castShadow = true; grp.add(tr);
  for (const [dx, dy, dz, s] of [[0, 6.6, 0, 1], [1.8, 5.8, 1.2, .7], [-1.6, 6, -1, .75], [.6, 7.8, -.8, .6]]) { const c = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), M('#56803f', { flatShading: true, roughness: .9 })); c.scale.set(6 * s, 4.2 * s, 6 * s); c.position.set(8.8 + dx, dy, -8.6 + dz); c.castShadow = true; grp.add(c); }
  grp.userData.info = { name: 'Puu', rows: [['Võra', '≈ 14 m'], ['Allikas', 'Maa-amet nDSM']] }; }
// ümbritsevad puud nDSM-ist (4 m ruudud, kõrgus kõrgusvööndist)
{ const T = await fetch('tex/trees.json').then(r => r.json()), cg = new THREE.IcosahedronGeometry(1, 1), tg = new THREE.CylinderGeometry(.18, .26, 1, 6), cm = M('#4f7a3a', { flatShading: true, roughness: .95 }), tm = M('#5b4636');
  const crowns = new THREE.InstancedMesh(cg, cm, T.length * 2), trunks = new THREE.InstancedMesh(tg, tm, T.length), o = new THREE.Object3D(); let seed = 3; const rnd = () => ((seed = seed * 16807 % 2147483647) - 1) / 2147483646;
  T.forEach(([x, z, h0], i) => { const h = Math.min(h0, 9); const jx = x + (rnd() - .5) * 2, jz = z + (rnd() - .5) * 2; o.position.set(jx, h * .25, jz); o.scale.set(1, h * .5, 1); o.rotation.set(0, 0, 0); o.updateMatrix(); trunks.setMatrixAt(i, o.matrix);
    for (let k = 0; k < 2; k++) { const r0 = 1.5 + rnd() * .8; o.position.set(jx + (rnd() - .5) * 1.5, h * (.62 + k * .15), jz + (rnd() - .5) * 1.5); o.scale.set(r0, r0 * (1.1 + rnd() * .4), r0); o.rotation.set(0, rnd() * 6, 0); o.updateMatrix(); crowns.setMatrixAt(i * 2 + k, o.matrix); } });
  crowns.castShadow = trunks.castShadow = true; add(crowns); add(trunks); }
// ala piir ja kinnistu piir
{ const l = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([[0, 0], [AREA.L, 0], [AREA.L, AREA.W], [0, AREA.W]].map(([x, z]) => new THREE.Vector3(x, .04, z))), new THREE.LineDashedMaterial({ color: '#ffffff', dashSize: .4, gapSize: .25 })); l.computeLineDistances(); add(l);
  const pl = SITE.objects.find(o => o.kind === 'line'); if (pl) { const k = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pl.pts.map(([x, z]) => new THREE.Vector3(x, .045, z))), new THREE.LineDashedMaterial({ color: '#e0391c', dashSize: .5, gapSize: .3, linewidth: 2 })); k.computeLineDistances(); add(k); } }

// ---------- GLB mudelid (Tripo, meshopt) ----------
const GL = new GLTFLoader(); GL.setMeshoptDecoder(MeshoptDecoder);
function fixGlb(buf) { const dv = new DataView(buf), jl = dv.getUint32(12, true), J = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jl))), bo = 20 + jl + 8, bl = dv.getUint32(20 + jl, true), bin = new Uint8Array(buf, bo, bl);
  (J.images || []).forEach(im => { if (im.bufferView == null) return; const v = J.bufferViews[im.bufferView], by = bin.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength); let s = ''; for (let i = 0; i < by.length; i += 32768) s += String.fromCharCode.apply(null, by.subarray(i, i + 32768)); im.uri = 'data:' + (im.mimeType || 'image/png') + ';base64,' + btoa(s); delete im.bufferView; });
  let jb = new TextEncoder().encode(JSON.stringify(J)); const pad = (4 - jb.length % 4) % 4, jp = new Uint8Array(jb.length + pad).fill(32); jp.set(jb);
  const out = new Uint8Array(12 + 8 + jp.length + 8 + bl), o = new DataView(out.buffer); o.setUint32(0, 0x46546C67, true); o.setUint32(4, 2, true); o.setUint32(8, out.length, true); o.setUint32(12, jp.length, true); o.setUint32(16, 0x4E4F534A, true); out.set(jp, 20); o.setUint32(20 + jp.length, bl, true); o.setUint32(24 + jp.length, 0x004E4942, true); out.set(bin, 28 + jp.length); return out.buffer; }
const MODELS = {}, mcache = {};
async function model(k) { if (mcache[k]) return mcache[k]; return mcache[k] = fetch(`models/${k}.glb`).then(r => r.arrayBuffer()).then(b => { const cb = window.createImageBitmap; window.createImageBitmap = undefined; const p = GL.parseAsync(fixGlb(b), ''); window.createImageBitmap = cb; return p; })
  .then(g => { const s = g.scene; s.updateMatrixWorld(true); const bb = new THREE.Box3().setFromObject(s); s.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } }); return { scene: s, bb, size: bb.getSize(new THREE.Vector3()) }; }); }
// ese mõõtu: w piki x, d piki z, h kõrgus (null = proportsionaalselt laiusega); ry pööre
function fit(m, w, d, h, x, z, ry, p, rotModel = 0) { const s = m.scene.clone(true), bb = m.bb, sz = m.size.clone(); if (rotModel) { const t = sz.x; sz.x = sz.z; sz.z = t; }
  const kx = w / sz.x, kz = d / sz.z, ky = h ? h / sz.y : (kx + kz) / 2, inner = new THREE.Group(), outer = new THREE.Group();
  s.position.set(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2); const rot = new THREE.Group(); rot.add(s); rot.rotation.y = rotModel; inner.add(rot); inner.scale.set(kx, ky, kz); outer.add(inner); outer.position.set(x, 0, z); outer.rotation.y = ry || 0; p.add(outer); return outer; }
// instantsid (toolid): kõik mudeli võrgud ühe InstancedMeshina iga materjali kohta
function instances(m, list, size, p) { if (!list.length) return; const k = size / Math.max(m.size.x, m.size.z), base = new THREE.Matrix4().makeScale(k, k, k).multiply(new THREE.Matrix4().makeTranslation(-(m.bb.min.x + m.bb.max.x) / 2, -m.bb.min.y, -(m.bb.min.z + m.bb.max.z) / 2)), o = new THREE.Object3D();
  m.scene.traverse(me => { if (!me.isMesh) return; const im = new THREE.InstancedMesh(me.geometry, me.material, list.length), wm = me.matrixWorld.clone();
    list.forEach((c, i) => { o.position.set(c.x, 0, c.y); o.rotation.set(0, -c.a - Math.PI / 2, 0); o.updateMatrix(); im.setMatrixAt(i, o.matrix.clone().multiply(base).multiply(wm)); }); im.castShadow = im.receiveShadow = true; im.frustumCulled = false; p.add(im); }); }
const CAT = await fetch('../../../js/catalog/funrent.json').then(r => r.json()).catch(() => ({ products: [] }));
const prodName = id => (CAT.products.find(p => p.id === id) || {}).name || '';

// ---------- paigutuse ehitamine ----------
let cur = null, tentObj = null;
async function build(v) {
  sc.remove(layoutG); layoutG = new THREE.Group(); sc.add(layoutG);
  const D = await fetch(`../out/${v}-layout.json`).then(r => r.json()), L = D.layout, o = L.origin || { x: 0, y: 0 }; cur = { v, D, L, o };
  const jaan = v.startsWith('v2'), g = new THREE.Group(); g.position.set(o.x, 0, o.y); layoutG.add(g);
  const need3 = ['tent', jaan ? 'crosschair' : 'chiavari', 'longtable', 'roundtable', 'podium', 'buffet', 'bar', 'cocktail', 'arch', 'hay'];
  const Mm = Object.fromEntries(await Promise.all(need3.map(async k => [k, await model(k)])));
  // telk: pikk külg piki plaani x-telge, avatud külg kaamera (z = W) poole; kõrgus: seinad 2,3–3 m + katus
  const t = L.tent, R = { L: t.L, W: t.W }, ridge = (t.sideH || 2.3) + Math.min(t.W, t.L) * .22;
  { const m = Mm.tent, rotM = m.size.z > m.size.x ? Math.PI / 2 : 0; const tg = fit(m, R.L, R.W, ridge, R.L / 2, R.W / 2, Math.PI, g, rotM); // mudeli avatud külg -z -> pöörame kaamera (z = W) poole
    tg.userData.info = { name: t.name.replace(/^Moodultelk \d+ m /, 'Moodultelk '), rows: [['Mõõt', `${fmt(t.W)} × ${fmt(t.L)} m`], ['Kõrgus', `≈ ${fmt(ridge)} m`], ['Kogus', '1'], ['Toode', 'Funrent moodultelk']] };
    tg.traverse(q => { if (q.isMesh) { q.material = q.material.clone(); q.material.transparent = true; q.material.side = THREE.DoubleSide; } });
    const pl = new THREE.PointLight('#ffc27a', small ? 0 : 5, Math.max(R.L, R.W) * 1.3, 2); pl.position.set(R.L / 2, ridge * .7, R.W / 2); g.add(pl);
    blob(R.L / 2, R.W / 2, R.L + 1.6, R.W + 1.6, g); tentObj = { g: tg, H: ridge, side: t.sideH || 2.3, R }; }
  const chairs = [];
  for (const it of L.items.concat(L.yard ? L.yard.items : [])) {
    const cx = it.x + it.w / 2, cz = it.y + it.d / 2, grp = new THREE.Group(); g.add(grp); const info = (n, rows) => { grp.userData.info = { name: n, rows }; };
    if (it.kind === 'seating') { for (const tb of it.tables) { if (tb.shape === 'round') { fit(Mm.roundtable, tb.d + .1, tb.d + .1, .95, tb.x, tb.y, 0, grp); blob(tb.x, tb.y, tb.d + 2.2, tb.d + 2.2, grp); }
        else { const len = tb.along ? tb.w : tb.d, ry = tb.along ? 0 : Math.PI / 2, m = Mm.longtable, rotM = m.size.z > m.size.x ? Math.PI / 2 : 0; fit(m, len + .1, .86, .95, tb.x + tb.w / 2, tb.y + tb.d / 2, ry, grp, rotM); blob(tb.x + tb.w / 2, tb.y + tb.d / 2, len + 2, 2.4, grp, ry); }
        chairs.push(...(tb.chairs || [])); }
      const t0 = it.tables[0]; info(t0.shape === 'round' ? `Ümarlauad Ø${Math.round(t0.d * 100)}` : 'Pikk laud', [['Mõõt', t0.shape === 'round' ? `Ø ${fmt(t0.d)} m` : `${fmt(Math.max(t0.w, t0.d))} × ${fmt(Math.min(t0.w, t0.d))} m`], ['Laudu', String(it.tables.reduce((s, q) => s + (q.nTab || 1), 0))], ['Istekohti', String(it.seats)], ['Toolid', jaan ? 'risttoega puittool' : 'Chiavari'], ['Toode', prodName(t0.product)]]); }
    else if (it.kind === 'standing') { for (const tb of it.tables) { const q = fit(Mm.cocktail, .85, .85, 1.1, tb.x, tb.y, 0, grp); q.traverse(n => { if (n.isMesh) { n.material = n.material.clone(); n.material.color.set('#f3f1ec'); n.material.map = null; n.material.needsUpdate = true; } }); blob(tb.x, tb.y, 1.5, 1.5, grp); }
      info('Püstilauad', [['Mõõt', 'Ø 0,81 × 1,10 m'], ['Kogus', String(it.tables.length)], ['Külalisi', String(it.guests)], ['Toode', prodName('cocktail')]]); }
    else if (it.kind === 'stage') { const m = Mm.podium, ry = it.w >= it.d ? 0 : Math.PI / 2, w = Math.max(it.w, it.d), d = Math.min(it.w, it.d); fit(m, w, d, null, cx, cz, ry, grp, m.size.z > m.size.x ? Math.PI / 2 : 0); blob(cx, cz, it.w + 1.2, it.d + 1.2, grp);
      info(it.name || 'Lava', [['Mõõt', `${fmt(w)} × ${fmt(d)} m`], ['Kõrgus', '0,40 m, seelikuga'], ['Mooduleid', String(L.bom.filter(b => b.id === 'podium').reduce((s, b) => s + b.qty, 0))], ['Toode', 'Funrent poodiumimoodul']]); }
    else if (it.kind === 'bar') { const ry = it.w >= it.d ? 0 : Math.PI / 2, w = Math.max(it.w, it.d), d = Math.min(it.w, it.d), m = Mm.bar; fit(m, w, d, 1.1, cx, cz, ry, grp, m.size.z > m.size.x ? Math.PI / 2 : 0); blob(cx, cz, it.w + 1, it.d + 1, grp); info('Baarilett', [['Mõõt', `${fmt(w)} × ${fmt(d)} m`], ['Kogus', String(it.n || 1)], ['Toode', prodName('counter')]]); }
    else if (it.kind === 'catering') { const ry = it.w >= it.d ? 0 : Math.PI / 2, w = Math.max(it.w, it.d), d = Math.min(it.w, it.d), m = Mm.buffet; fit(m, w, d, .95, cx, cz, ry, grp, m.size.z > m.size.x ? Math.PI / 2 : 0); blob(cx, cz, it.w + 1, it.d + 1, grp); info('Toitlustuslaud', [['Mõõt', `${fmt(w)} × ${fmt(d)} m`], ['Kogus', String(it.n || 1)], ['Toode', prodName('cater183')]]); }
  }
  instances(jaan ? Mm.crosschair : Mm.chiavari, chairs, .5, g);
  if (jaan && L.door) { const z = L.door.zone, hor = L.door.wall % 2 === 0, ax = hor ? z.x + z.w / 2 : (L.door.wall === 1 ? R.L + .5 : -.5), az = hor ? (L.door.wall === 0 ? -.5 : R.W + .5) : z.y + z.d / 2, dg = new THREE.Group(); g.add(dg);
    fit(Mm.arch, 1.9, .5, 2.4, ax, az, hor ? 0 : Math.PI / 2, dg, Mm.arch.size.z > Mm.arch.size.x ? Math.PI / 2 : 0);
    for (const s of [-1, 1]) fit(Mm.hay, .9, .45, .42, ax + (hor ? s * 1.6 : (L.door.wall === 1 ? .6 : -.6)), az + (hor ? (L.door.wall === 0 ? -.6 : .6) : s * 1.6), hor ? 0 : Math.PI / 2, dg);
    dg.userData.info = { name: 'Jaanipäeva kaunistus', rows: [['Kasekaar', '1'], ['Heinapallid', '2'], ['Allikas', 'STD, kinnitada']] }; }
  updateWalls(); dims(); need();
}

// ---------- telk: kui kaamera on suletud seinte pool, muutub telk läbipaistvaks (sees näha) ----------
function updateWalls() { if (!tentObj) return; const p = active.position.clone().sub(tentObj.g.getWorldPosition(new THREE.Vector3())), back = active === ortho ? true : p.z < tentObj.R.W * .2;
  const op = active === ortho ? 0 : back ? .35 : 1; tentObj.g.traverse(q => { if (q.isMesh) { q.material.opacity = op; q.material.depthWrite = op === 1; q.visible = op > 0; } }); }

// ---------- mõõdud 3D-s (nagu 2D plaanil, ainult põhiesemed) ----------
const dimG = new THREE.Group(); sc.add(dimG); let dimOn = false; const tags = [];
const dimMat = new THREE.LineBasicMaterial({ color: '#2b6cb0' }), dimMatW = new THREE.LineBasicMaterial({ color: '#ffffff' });
function tag(text, p, cls, prio) { const e = document.createElement('div'); e.className = 'tg ' + (cls || ''); e.textContent = text; tagsEl.appendChild(e); tags.push({ e, p: p.clone(), prio: prio || 1 }); }
function dimLine(a, b, txt, cls = 's', y = .06, prio = 1, mt = dimMat) { const A = new THREE.Vector3(a[0], y, a[1]), B = new THREE.Vector3(b[0], y, b[1]); if (A.distanceTo(B) < .08) return;
  const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([A, B]), mt); dimG.add(l);
  const dir = B.clone().sub(A).normalize(), nrm = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(.12); for (const P of [A, B]) dimG.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([P.clone().add(nrm), P.clone().sub(nrm)]), mt));
  tag(txt, A.clone().add(B).multiplyScalar(.5), cls, prio); }
function dims() { dimG.clear(); tags.forEach(t => t.e.remove()); tags.length = 0; if (!dimOn || !cur) return need();
  const { L, o } = cur, A = AREA;
  dimLine([0, -.6], [A.L, -.6], `${fmt(A.L)} m`, 'm', .05, 5, dimMatW); dimLine([-.6, 0], [-.6, A.W], `${fmt(A.W)} m`, 'm', .05, 5, dimMatW);
  for (const s of SITE.objects) if (s.dim) { const [x0, z0, x1, z1, t] = s.dim; dimLine([x0, z0], [x1, z1], t, 'w', .07, 3); }
  if (L.tent && tentObj) { const R = tentObj.R, tx = o.x, tz = o.y; dimLine([tx, tz + R.W + .45], [tx + R.L, tz + R.W + .45], `Telk ${fmt(R.L)} m`, 'm', .08, 4); dimLine([tx + R.L + .45, tz], [tx + R.L + .45, tz + R.W], `${fmt(R.W)} m`, 'm', .08, 4);
    const P = new THREE.Vector3(tx, 0, tz), Q = new THREE.Vector3(tx, tentObj.H, tz); dimG.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([P, Q]), dimMat)); tag(`h ${fmt(tentObj.H)} m (seinad ${fmt(tentObj.side)} m)`, new THREE.Vector3(tx, tentObj.H * .6, tz), 's', 3); }
  // esemed: suurus + kaugus lähima telgiseinani ja naabrini (vahekäik põrandal)
  const room = L.room, its = L.items.filter(i => ['stage', 'dance', 'bar', 'catering', 'seating'].includes(i.kind));
  const R2 = it => it.kind === 'seating' ? (() => { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const t of it.tables) { const b = t.body; const a = b.t === 'c' ? [b.x - b.r, b.y - b.r, b.x + b.r, b.y + b.r] : [b.x, b.y, b.x + b.w, b.y + b.d]; x0 = Math.min(x0, a[0]); y0 = Math.min(y0, a[1]); x1 = Math.max(x1, a[2]); y1 = Math.max(y1, a[3]); } return { x: x0, y: y0, w: x1 - x0, d: y1 - y0 }; })() : it;
  for (const it of its) { const b = R2(it), cx = b.x + b.w / 2, cz = b.y + b.d / 2, X = v => v + o.x, Z = v => v + o.y;
    const lab = it.kind === 'seating' ? (it.tables[0].shape === 'round' ? `${it.tables.length} × Ø${fmt(it.tables[0].d)} m · ${it.seats} kohta` : `Laud ${fmt(Math.max(it.tables[0].w, it.tables[0].d))} m · ${it.seats} kohta`) : `${{ stage: 'Lava', dance: 'Tantsupõrand', bar: 'Baar', catering: 'Toitlustus' }[it.kind]} ${fmt(Math.max(it.w, it.d))} × ${fmt(Math.min(it.w, it.d))} m`;
    tag(lab, new THREE.Vector3(X(cx), it.kind === 'stage' ? 1.1 : 1.3, Z(cz)), 'm', 4);
    const dl = b.x, dr = room.L - b.x - b.w, dt = b.y, db = room.W - b.y - b.d;
    if (dl <= dr) dimLine([X(0), Z(cz)], [X(b.x), Z(cz)], `${fmt(dl)} m`); else dimLine([X(b.x + b.w), Z(cz)], [X(room.L), Z(cz)], `${fmt(dr)} m`);
    if (dt <= db) dimLine([X(cx), Z(0)], [X(cx), Z(b.y)], `${fmt(dt)} m`); else dimLine([X(cx), Z(b.y + b.d)], [X(cx), Z(room.W)], `${fmt(db)} m`); }
  for (let i = 0; i < its.length; i++) for (let j = i + 1; j < its.length; j++) { const a = R2(its[i]), b = R2(its[j]), ox0 = Math.max(a.x, b.x), ox1 = Math.min(a.x + a.w, b.x + b.w), oy0 = Math.max(a.y, b.y), oy1 = Math.min(a.y + a.d, b.y + b.d);
    if (ox1 - ox0 > .3) { const x = (ox0 + ox1) / 2, gp = a.y + a.d <= b.y ? [a.y + a.d, b.y] : b.y + b.d <= a.y ? [b.y + b.d, a.y] : null; if (gp && gp[1] - gp[0] < 5) dimLine([x + o.x, gp[0] + o.y], [x + o.x, gp[1] + o.y], `vahekäik ${fmt(gp[1] - gp[0])} m`, 'w', .05, 2); }
    else if (oy1 - oy0 > .3) { const y = (oy0 + oy1) / 2, gp = a.x + a.w <= b.x ? [a.x + a.w, b.x] : b.x + b.w <= a.x ? [b.x + b.w, a.x] : null; if (gp && gp[1] - gp[0] < 5) dimLine([gp[0] + o.x, y + o.y], [gp[1] + o.x, y + o.y], `vahekäik ${fmt(gp[1] - gp[0])} m`, 'w', .05, 2); } }
  need(); }
// sildid: projektsioon, kattuvad peidetakse (suurem prioriteet jääb)
function placeTags() { const w = box.clientWidth, h = box.clientHeight, v = new THREE.Vector3(), taken = [];
  const list = tags.concat(meas.tagObj ? [meas.tagObj] : []).map(t => { v.copy(t.p).project(active); return { t, x: (v.x + 1) / 2 * w, y: (1 - v.y) / 2 * h, ok: v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05 }; }).sort((a, b) => b.t.prio - a.t.prio);
  for (const q of list) { if (!q.ok) { q.t.e.style.display = 'none'; continue; } const bw = q.t.e.offsetWidth || 60, bh = 22; if (taken.some(r => Math.abs(r.x - q.x) < (r.w + bw) / 2 + 4 && Math.abs(r.y - q.y) < bh)) { q.t.e.style.display = 'none'; continue; } q.t.e.style.display = ''; q.t.e.style.left = q.x + 'px'; q.t.e.style.top = q.y + 'px'; taken.push({ x: q.x, y: q.y, w: bw }); } }

// ---------- mõõda ise (sama tööriist mis planeerijas) ----------
const ray = new THREE.Raycaster(), meas = { on: false, pts: [], g: new THREE.Group(), tagObj: null }; sc.add(meas.g);
const ndc = e => { const b = r.domElement.getBoundingClientRect(); return new THREE.Vector2((e.clientX - b.left) / b.width * 2 - 1, -(e.clientY - b.top) / b.height * 2 + 1); };
let down = null; r.domElement.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; if (walk.on) walk.look = [e.clientX, e.clientY]; });
r.domElement.addEventListener('pointerup', e => { const click = down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) < 6; down = null; walk.look = null; if (!click) return;
  ray.setFromCamera(ndc(e), active);
  if (meas.on) { const hit = ray.intersectObjects([world, layoutG], true).find(h => h.object.isMesh); if (!hit) return; if (meas.pts.length >= 2) { meas.pts = []; meas.g.clear(); if (meas.tagObj) { meas.tagObj.e.remove(); meas.tagObj = null; } }
    meas.pts.push(hit.point.clone()); const d = new THREE.Mesh(new THREE.SphereGeometry(.07, 12, 8), new THREE.MeshBasicMaterial({ color: '#e5482d' })); d.position.copy(hit.point); meas.g.add(d);
    if (meas.pts.length === 2) { meas.g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(meas.pts), new THREE.LineBasicMaterial({ color: '#e5482d' }))); const dd = meas.pts[0].distanceTo(meas.pts[1]), dh = Math.hypot(meas.pts[0].x - meas.pts[1].x, meas.pts[0].z - meas.pts[1].z);
      const e2 = document.createElement('div'); e2.className = 'tg'; e2.style.background = '#e5482d'; e2.style.color = '#fff'; e2.textContent = `${fmt(dd)} m${Math.abs(dd - dh) > .05 ? ` (maas ${fmt(dh)} m)` : ''}`; tagsEl.appendChild(e2); meas.tagObj = { e: e2, p: meas.pts[0].clone().add(meas.pts[1]).multiplyScalar(.5), prio: 9 }; }
    need(); return; }
  // klõps esemel -> kaart
  const hit = ray.intersectObjects([layoutG, world], true).find(h => { if (!h.object.visible || (h.object.material && h.object.material.opacity < .5)) return false; let o = h.object; while (o && !o.userData.info) o = o.parent; return !!o; });
  if (!hit) { $('card').style.display = 'none'; return; } let o = hit.object; while (!o.userData.info) o = o.parent; const I = o.userData.info;
  $('cardB').innerHTML = `<b>${I.name}</b>` + I.rows.map(([k, v]) => `<div class="r"><span>${k}</span><span>${v}</span></div>`).join(''); $('card').style.display = 'block'; });
$('card').querySelector('button').onclick = () => { $('card').style.display = 'none'; };

// ---------- jaluta ----------
const walk = { on: false, yaw: 0, pitch: 0, keys: {}, look: null };
addEventListener('keydown', e => { walk.keys[e.key.toLowerCase()] = 1; if (walk.on) need(); }); addEventListener('keyup', e => { walk.keys[e.key.toLowerCase()] = 0; });
r.domElement.addEventListener('pointermove', e => { if (!walk.on || !walk.look) return; walk.yaw -= (e.clientX - walk.look[0]) * .005; walk.pitch = Math.max(-1.1, Math.min(1.1, walk.pitch - (e.clientY - walk.look[1]) * .005)); walk.look = [e.clientX, e.clientY]; need(); });
let touch2 = 0; r.domElement.addEventListener('touchstart', e => { touch2 = walk.on && e.touches.length >= 2 ? 1 : 0; need(); }, { passive: true }); r.domElement.addEventListener('touchend', () => { touch2 = 0; }, { passive: true });

// ---------- nupud ----------
const hint = t => { $('hint').textContent = t; };
function setTool(id, on) { $(id).setAttribute('aria-pressed', on); }
$('tDim').onclick = () => { dimOn = !dimOn; setTool('tDim', dimOn); dims(); };
$('tMeas').onclick = () => { meas.on = !meas.on; setTool('tMeas', meas.on); if (!meas.on) { meas.pts = []; meas.g.clear(); if (meas.tagObj) { meas.tagObj.e.remove(); meas.tagObj = null; } } hint(meas.on ? 'Mõõda: klõpsa kahte kohta (maapind või ese)' : 'Lohista = pööra · rull/näpistus = suumi · klõpsa esemel = info'); need(); };
$('tWalk').onclick = () => { walk.on = !walk.on; setTool('tWalk', walk.on); if (walk.on) { if (active === ortho) toggleTop(); ctl.enabled = false; const o = cur.o, d = cur.L.door; const z = d ? d.zone : { x: 0, y: 0, w: 0, d: 0 }; cam.position.set(o.x + z.x + z.w / 2, 1.6, o.y + z.y + z.d / 2 + (d && d.wall === 2 ? 2 : d && d.wall === 0 ? -2 : 0)); walk.yaw = Math.atan2(-(CEN.x - cam.position.x), -(CEN.z - cam.position.z)); walk.pitch = -.08; hint('Jalutad: lohista = vaata ringi · W A S D / nooled = liigu · telefonis kaks sõrme = edasi'); } else { ctl.enabled = true; home(); hint('Lohista = pööra · rull/näpistus = suumi · klõpsa esemel = info'); } need(); };
function toggleTop() { const on = active !== ortho; setTool('tTop', on);
  if (on) { if (walk.on) $('tWalk').onclick(); active = ortho; ctl.enabled = false; octl.enabled = true; const asp = box.clientWidth / box.clientHeight, half = Math.max(AREA.L * .9 / asp, AREA.W * .9) + 3; ortho.left = -half * asp; ortho.right = half * asp; ortho.top = half; ortho.bottom = -half; ortho.position.set(CEN.x, 80, CEN.z); ortho.up.set(0, 0, -1); octl.target.set(CEN.x, 0, CEN.z); ortho.lookAt(CEN.x, 0, CEN.z); ortho.updateProjectionMatrix(); octl.update(); hint('Pealtvaade = 2D plaan (põhi vasakul) · lohista = nihuta · rull = suumi'); }
  else { active = cam; octl.enabled = false; ctl.enabled = true; hint('Lohista = pööra · rull/näpistus = suumi · klõpsa esemel = info'); }
  updateWalls(); need(); }
$('tTop').onclick = toggleTop;
$('ver').onclick = e => { const b = e.target.closest('button'); if (!b) return; [...$('ver').children].forEach(x => x.setAttribute('aria-pressed', x === b)); history.replaceState(null, '', '?v=' + b.dataset.v + (dimOn ? '&dim=1' : '')); $('card').style.display = 'none'; build(b.dataset.v); };

// ---------- joonistamine ainult vajadusel ----------
let dirty = true, last = performance.now(); const need = () => { dirty = true; };
ctl.addEventListener('change', need); octl.addEventListener('change', need);
const ro = new ResizeObserver(() => { const w = box.clientWidth, h = box.clientHeight; r.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); if (active === ortho) { active = cam; toggleTop(); } need(); }); ro.observe(box);
function loop(t) { requestAnimationFrame(loop); const dt = Math.min(.05, (t - last) / 1000); last = t;
  if (walk.on) { const k = walk.keys, f = (k.w || k.arrowup || touch2 ? 1 : 0) - (k.s || k.arrowdown ? 1 : 0), s = (k.d || k.arrowright ? 1 : 0) - (k.a || k.arrowleft ? 1 : 0); if (f || s) { cam.position.x += (-Math.sin(walk.yaw) * f + Math.cos(walk.yaw) * s) * 2.2 * dt; cam.position.z += (-Math.cos(walk.yaw) * f - Math.sin(walk.yaw) * s) * 2.2 * dt; dirty = true; } cam.rotation.set(walk.pitch, walk.yaw, 0, 'YXZ'); }
  else if (active === cam) ctl.update(); else octl.update();
  if (!dirty) return; dirty = false; updateWalls(); r.render(sc, active); placeTags(); }
window.__v3d = { need, cam, ortho, ctl, setView: (az, el, d) => { const t = ctl.target; cam.position.set(t.x + Math.sin(az) * Math.cos(el) * d, t.y + Math.sin(el) * d, t.z + Math.cos(az) * Math.cos(el) * d); ctl.update(); need(); }, toggleTop, build, dimsOn: on => { dimOn = on; setTool('tDim', on); dims(); } };
const q = new URLSearchParams(location.search); const v0 = q.get('v') || 'v2'; [...$('ver').children].forEach(x => x.setAttribute('aria-pressed', x.dataset.v === v0)); if (q.get('dim')) { dimOn = true; setTool('tDim', true); }
home(); await build(v0); $('load').remove(); requestAnimationFrame(loop);
