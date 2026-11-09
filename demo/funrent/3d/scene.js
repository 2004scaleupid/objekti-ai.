// Jõe tn 4 hoovi 3D: lahendaja paigutused (v1/v2/v2b/v3) Maa-ameti andmetel (LOD2 hoone, parkla, tee, puu).
// Valgus, materjalid, kontaktvarjud, puhvetlaua mudel ja sujuv kaamera nagu landingu Black Box gala stseenis. Renderdab ainult muutuse korral.
// Koordinaadid = 2D plaan: x lõuna suunas (ala põhjaservast), z lääne suunas (ala idaservast), meetrites. Pealtvaade = plaan.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const $ = id => document.getElementById(id), small = Math.min(innerWidth, innerHeight) < 700;
const fmt = (v, d = 2) => (+v).toFixed(d).replace('.', ','), D2R = Math.PI / 180;
const box = $('stage'), tagsEl = $('tags');
const r = new THREE.WebGLRenderer({ antialias: !small, preserveDrawingBuffer: true });
r.setPixelRatio(Math.min(devicePixelRatio || 1, small ? 1.5 : 2)); r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.15; r.outputColorSpace = THREE.SRGBColorSpace; box.appendChild(r.domElement);
const sc = new THREE.Scene();
{ const c = document.createElement('canvas'); c.width = 4; c.height = 256; const x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, '#9fc0dc'); g.addColorStop(.6, '#dbe7ee'); g.addColorStop(1, '#eef0ea'); x.fillStyle = g; x.fillRect(0, 0, 4, 256); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; sc.background = t; }
sc.fog = new THREE.Fog('#e3ebee', 60, 160);
sc.add(new THREE.HemisphereLight('#eef3f8', '#6d7a5a', 1.0));
const sun = new THREE.DirectionalLight('#fff1dc', 2.2); sun.position.set(30, 34, -14); sun.castShadow = true; sun.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 120 }); sun.shadow.bias = -.0004; sun.shadow.normalBias = .03; sc.add(sun); sc.add(sun.target); sun.target.position.set(5, 0, 4);

// ---------- kaamerad ----------
const cam = new THREE.PerspectiveCamera(38, 1, .1, 600), ortho = new THREE.OrthographicCamera(-10, 10, 10, -10, .1, 400);
let active = cam;
const ctl = new OrbitControls(cam, r.domElement); ctl.enableDamping = true; ctl.dampingFactor = .08; ctl.maxPolarAngle = Math.PI / 2 - .04; ctl.minDistance = 3; ctl.maxDistance = 90; ctl.screenSpacePanning = false;
const octl = new OrbitControls(ortho, r.domElement); octl.enableRotate = false; octl.screenSpacePanning = true; octl.enabled = false; octl.enableDamping = true;
const AREA = { L: 11.55, W: 8.65 }, CEN = new THREE.Vector3(AREA.L / 2, 0, AREA.W / 2);
function home() { ctl.target.copy(CEN).setY(1); const asp = box.clientWidth / Math.max(1, box.clientHeight), d = 26 * Math.max(1, Math.pow(1.4 / Math.max(.45, asp), .7)); cam.position.set(CEN.x + d * .66, d * .4, CEN.z + d * .74); ctl.update(); }

// ---------- materjalid ----------
const M = (c, o) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: .8 }, o || {}));
function canvasTex(w, h, draw, rep, srgb = true) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...rep); } return t; }
const noise = (g, w, h, base, n, a) => { g.fillStyle = base; g.fillRect(0, 0, w, h); for (let i = 0; i < n; i++) { g.fillStyle = `rgba(${a[0]},${a[1]},${a[2]},${Math.random() * a[3]})`; const s = Math.random() * 3 + 1; g.fillRect(Math.random() * w, Math.random() * h, s, s); } };
const T = {
  grass: canvasTex(256, 256, (g, w, h) => { noise(g, w, h, '#6f8f4a', 9000, [40, 70, 20, .35]); for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(150,180,90,${Math.random() * .3})`; g.fillRect(Math.random() * w, Math.random() * h, 1, 3); } }, [40, 40]),
  asph: canvasTex(256, 256, (g, w, h) => noise(g, w, h, '#76777a', 12000, [30, 30, 30, .35]), [20, 20]),
  gravel: canvasTex(256, 256, (g, w, h) => noise(g, w, h, '#a69c8c', 14000, [70, 60, 50, .4]), [10, 10]),
  parquet: canvasTex(512, 512, (g, w, h) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 4; x++) { const v = 150 + Math.random() * 40 | 0; g.fillStyle = `rgb(${v + 40},${v},${v - 50})`; g.fillRect(x * 128 + (y % 2) * 64, y * 32, 126, 30); g.fillRect(x * 128 + (y % 2) * 64 - 512, y * 32, 126, 30); } }, [2, 2]),
  straw: canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#c9a85a'; g.fillRect(0, 0, w, h); for (let i = 0; i < 900; i++) { g.strokeStyle = `rgba(${120 + Math.random() * 80},${90 + Math.random() * 60},30,.6)`; g.beginPath(); const x = Math.random() * w, y = Math.random() * h; g.moveTo(x, y); g.lineTo(x + Math.random() * 14 - 7, y + Math.random() * 4); g.stroke(); } }, [1, 1]),
  birch: canvasTex(64, 256, (g, w, h) => { g.fillStyle = '#ecebe4'; g.fillRect(0, 0, w, h); for (let i = 0; i < 40; i++) { g.fillStyle = '#2a2621'; g.fillRect(Math.random() * w, Math.random() * h, 6 + Math.random() * 18, 2 + Math.random() * 3); } }, [1, 1])
};
const mat = {
  grass: M('#ffffff', { map: T.grass, roughness: 1 }), asph: M('#ffffff', { map: T.asph, roughness: .95 }), gravel: M('#ffffff', { map: T.gravel, roughness: 1 }),
  linen: M('#f7f4ee', { roughness: .9, sheen: 1 }), runner: M('#8fa58a', { roughness: .9 }), wood: M('#9b6a3e', { roughness: .6 }), white: M('#fbfbf8', { roughness: .5 }),
  black: M('#1d1c1b', { roughness: .7 }), skirt: M('#141414', { roughness: .95 }), metal: M('#c9ccd0', { metalness: .7, roughness: .35 }),
  tent: M('#fbfbf9', { roughness: .55, side: THREE.DoubleSide }), wall: M('#f3f1ec', { roughness: .7, side: THREE.DoubleSide, transparent: true, opacity: .96 }),
  curtain: M('#fffefb', { roughness: .85, side: THREE.DoubleSide }), bulb: new THREE.MeshBasicMaterial({ color: '#ffd38a' }), leaf: M('#4c7a3a', { roughness: .9 }), flower: M('#ffffff', { roughness: .8 }),
  parquet: M('#ffffff', { map: T.parquet, roughness: .45 }), straw: M('#ffffff', { map: T.straw, roughness: 1 }), birch: M('#ffffff', { map: T.birch, roughness: .8 }),
  car: ['#2b2f36', '#c9ccd2', '#8a1e1e', '#e8e8e6'].map(c => M(c, { metalness: .5, roughness: .35 })), glass: M('#2a3540', { metalness: .3, roughness: .1 }), tyre: M('#151515')
};
const blobTex = canvasTex(128, 128, (g) => { const gr = g.createRadialGradient(64, 64, 6, 64, 64, 62); gr.addColorStop(0, 'rgba(0,0,0,.55)'); gr.addColorStop(.55, 'rgba(0,0,0,.25)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); });
const blobMat = new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });

// ---------- abifunktsioonid ----------
const add = (o, p) => { (p || world).add(o); return o; };
function boxM(w, h, d, m, x, y, z, p) { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; return add(o, p); }
function plane(w, d, m, x, z, y = 0, p) { const o = new THREE.Mesh(new THREE.PlaneGeometry(w, d), m); o.rotation.x = -Math.PI / 2; o.position.set(x, y, z); o.receiveShadow = true; return add(o, p); }
function blob(x, z, w, d, p) { const o = plane(w, d, blobMat, x, z, .015, p); o.castShadow = false; o.receiveShadow = false; return o; }
const world = new THREE.Group(); sc.add(world);
let layoutG = new THREE.Group(); sc.add(layoutG);

// ---------- krunt: Maa-ameti andmed ----------
const SITE = await fetch('../out/site.json').then(r => r.json());
const REAL = await fetch('../site/site-real.json').then(r => r.json());
plane(220, 220, mat.grass, 5, 4, -.01);
// Jõe tn (lääs), parkla, juurdepääsutee (lõuna), ala servad
plane(110, 5.5, mat.asph, -20, 17.05, .005); plane(46, 5.05, mat.asph, -17, 11.37, .006);
for (let x = -40; x <= 5.8; x += 2.5) boxM(.08, .01, 4.9, M('#f2f2ee'), x, .012, 11.37);
plane(2.2, 30, mat.gravel, 12.65, 1, .004); plane(18, 1.7, mat.gravel, 13.5 + 9, -2.6, .004);
// kortermaja LOD2 jalajäljest: 3 korrust + kelder, lame katus, aknad (lääne fassaad rõdudega)
{
  const fp = REAL.building.footprint_local.map(([x, z]) => new THREE.Vector2(x, z)), H = REAL.building.eave;
  const winTex = (cols, balcony) => canvasTex(1024, 256, (g, w, h) => { g.fillStyle = '#e9e5dc'; g.fillRect(0, 0, w, h); g.fillStyle = '#5a5f66'; g.fillRect(0, h - 22, w, 22);
    for (let f = 0; f < 3; f++) for (let i = 0; i < cols; i++) { const x = (i + .5) * w / cols, y = 30 + f * 70; g.fillStyle = '#3d4855'; g.fillRect(x - 14, y, 28, 36); g.fillStyle = '#c9d4dc'; g.fillRect(x - 12, y + 2, 11, 32); g.fillRect(x + 1, y + 2, 11, 32);
      if (balcony && i % 3 === 1 && f < 3) { g.fillStyle = '#4a4542'; g.fillRect(x - 40, y + 30, 80, 18); } } }, null);
  const wallsG = new THREE.Group(); add(wallsG);
  for (let i = 0; i < 4; i++) { const a = fp[i], b = fp[(i + 1) % 4], len = a.distanceTo(b), m = new THREE.Mesh(new THREE.PlaneGeometry(len, H), M('#ffffff', { map: winTex(Math.max(2, Math.round(len / 3.3)), len > 30 && (a.y + b.y) / 2 > -6), roughness: .9, side: THREE.DoubleSide }));
    m.position.set((a.x + b.x) / 2, H / 2, (a.y + b.y) / 2); m.rotation.y = -Math.atan2(b.y - a.y, b.x - a.x); m.castShadow = m.receiveShadow = true; wallsG.add(m); }
  const sh = new THREE.Shape(fp.map(p => new THREE.Vector2(p.x, -p.y))); const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: .35, bevelEnabled: false }), M('#55585c', { roughness: .9 }));
  roof.rotation.x = -Math.PI / 2; roof.position.y = H; roof.castShadow = true; add(roof);
  const base = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: H, bevelEnabled: false }), M('#e9e5dc')); base.rotation.x = -Math.PI / 2; base.scale.set(.995, .995, .999); base.visible = true; add(base);
  base.userData.info = { name: 'Kortermaja Jõe tn 4', rows: [['EHR', REAL.building.ehr], ['Kõrgus', fmt(REAL.building.height) + ' m'], ['Allikas', 'Maa-amet LOD2']] };
}
// puu (nDSM): madala polügooniga võra
{ const tr = boxM(.45, 3.2, .45, M('#5b4636'), 8.8, 1.6, -8.6); const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), M('#5d8a45', { flatShading: true, roughness: .9 }));
  crown.scale.set(6.6, 4.6, 6.6); crown.position.set(8.8, 6.6, -8.6); crown.castShadow = true; add(crown); crown.userData.info = { name: 'Puu', rows: [['Võra', '≈ 14 m'], ['Allikas', 'Maa-amet nDSM']] }; tr.userData.info = crown.userData.info; }
// autod parklas (madala polügooniga)
function car(x, z, ry, mi) { const g = new THREE.Group(); boxM(4.4, .7, 1.8, mat.car[mi], 0, .55, 0, g); boxM(2.4, .55, 1.6, mat.glass, -.2, 1.15, 0, g); for (const [a, b] of [[-1.4, -.85], [1.4, -.85], [-1.4, .85], [1.4, .85]]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(.33, .33, .22, 14), mat.tyre); w.rotation.x = Math.PI / 2; w.position.set(a, .33, b); g.add(w); } g.position.set(x, 0, z); g.rotation.y = ry; add(g); blob(x, z, 4.8, 2.4); g.traverse(o => { if (o.isMesh) o.castShadow = true; }); }
car(-6.2, 10.9, Math.PI / 2, 0); car(-11.2, 10.9, Math.PI / 2, 1); car(-21.3, 10.9, Math.PI / 2, 3); car(-28.8, 11.8, Math.PI / 2, 2);
// ala piir (valge kriipsjoon) ja kinnistu piir (punane)
const areaLine = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([[0, 0], [AREA.L, 0], [AREA.L, AREA.W], [0, AREA.W]].map(([x, z]) => new THREE.Vector3(x, .03, z))), new THREE.LineDashedMaterial({ color: '#ffffff', dashSize: .4, gapSize: .25 })); areaLine.computeLineDistances(); add(areaLine);
{ const pl = SITE.objects.find(o => o.kind === 'line'); if (pl) { const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pl.pts.map(([x, z]) => new THREE.Vector3(x, .035, z))), new THREE.LineDashedMaterial({ color: '#d9381e', dashSize: .5, gapSize: .3 })); l.computeLineDistances(); add(l); } }

// ---------- mööbel (madala polügooniga, gala stiilis) ----------
const GL = new GLTFLoader(); GL.setMeshoptDecoder(MeshoptDecoder);
function fixGlb(buf) { const dv = new DataView(buf), jl = dv.getUint32(12, true), J = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jl))), bo = 20 + jl + 8, bl = dv.getUint32(20 + jl, true), bin = new Uint8Array(buf, bo, bl);
  (J.images || []).forEach(im => { if (im.bufferView == null) return; const v = J.bufferViews[im.bufferView], by = bin.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength); let s = ''; for (let i = 0; i < by.length; i += 32768) s += String.fromCharCode.apply(null, by.subarray(i, i + 32768)); im.uri = 'data:' + (im.mimeType || 'image/png') + ';base64,' + btoa(s); delete im.bufferView; });
  let jb = new TextEncoder().encode(JSON.stringify(J)); const pad = (4 - jb.length % 4) % 4, jp = new Uint8Array(jb.length + pad).fill(32); jp.set(jb);
  const out = new Uint8Array(12 + 8 + jp.length + 8 + bl), o = new DataView(out.buffer); o.setUint32(0, 0x46546C67, true); o.setUint32(4, 2, true); o.setUint32(8, out.length, true); o.setUint32(12, jp.length, true); o.setUint32(16, 0x4E4F534A, true); out.set(jp, 20); o.setUint32(20 + jp.length, bl, true); o.setUint32(24 + jp.length, 0x004E4942, true); out.set(bin, 28 + jp.length); return out.buffer; }
const BUFFET = await fetch('models/buffet.glb').then(r => r.arrayBuffer()).then(b => { const cb = window.createImageBitmap; window.createImageBitmap = undefined; const p = GL.parseAsync(fixGlb(b), ''); window.createImageBitmap = cb; return p; }).then(g => g.scene).catch(() => null);
const geo = {
  crossChair: (() => { const P = []; const b = (w, h, d, x, y, z, rx = 0, rz = 0) => { const g = new THREE.BoxGeometry(w, h, d); if (rx || rz) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, 0, rz))); g.translate(x, y, z); P.push(g); };
    for (const [x, z] of [[-.19, -.19], [.19, -.19], [-.19, .19], [.19, .19]]) b(.035, .46, .035, x, .23, z); b(.44, .04, .42, 0, .47, 0); b(.035, .48, .035, -.19, .72, -.2); b(.035, .48, .035, .19, .72, -.2); b(.4, .04, .03, 0, .95, -.2); b(.035, .5, .02, 0, .72, -.2, 0, .72); b(.035, .5, .02, 0, .72, -.2, 0, -.72); return mergeGeometries(P); })(),
  chiavari: (() => { const P = []; const c = (r, h, x, y, z) => { const g = new THREE.CylinderGeometry(r, r, h, 6); g.translate(x, y, z); P.push(g); }; for (const [x, z] of [[-.18, -.18], [.18, -.18], [-.18, .18], [.18, .18]]) c(.016, .46, x, .23, z); const s = new THREE.BoxGeometry(.4, .05, .4); s.translate(0, .47, 0); P.push(s); for (const x of [-.18, -.09, 0, .09, .18]) c(.012, .46, x, .73, -.19); const t = new THREE.BoxGeometry(.4, .04, .03); t.translate(0, .96, -.19); P.push(t); return mergeGeometries(P); })(),
  cocktail: new THREE.LatheGeometry([[0, 0], [.32, 0], [.33, .03], [.16, .45], [.12, .6], [.2, .95], [.42, 1.06], [.42, 1.1], [0, 1.1]].map(([a, b]) => new THREE.Vector2(a, b)), 20)
};
const ADD = { };
function chairs(list, kind, parent) { if (!list.length) return; const im = new THREE.InstancedMesh(kind === 'chiavari' ? geo.chiavari : geo.crossChair, kind === 'chiavari' ? mat.white : mat.wood, list.length), o = new THREE.Object3D();
  list.forEach((c, i) => { o.position.set(c.x, 0, c.y); o.rotation.set(0, -c.a - Math.PI / 2, 0); o.updateMatrix(); im.setMatrixAt(i, o.matrix); }); im.castShadow = im.receiveShadow = true; parent.add(im); return im; }
function longTable(t, g, style) { const len = t.along ? t.w : t.d, wd = t.along ? t.d : t.w, cx = t.x + t.w / 2, cz = t.y + t.d / 2, ry = t.along ? 0 : Math.PI / 2, tg = new THREE.Group(); tg.position.set(cx, 0, cz); tg.rotation.y = ry; g.add(tg);
  boxM(len + .06, .03, wd + .06, mat.linen, 0, .76, 0, tg); boxM(len + .04, .72, wd + .04, mat.linen, 0, .38, 0, tg); boxM(len * .96, .005, .32, mat.runner, 0, .78, 0, tg);
  for (let a = -len / 2 + .5; a < len / 2 - .2; a += 1.1) { const f = new THREE.Mesh(new THREE.IcosahedronGeometry(.12, 0), style === 'jaan' ? mat.leaf : mat.flower); f.position.set(a, .86, 0); f.scale.y = .7; tg.add(f); const cnd = new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, .14, 8), M('#fff6e6', { emissive: '#ffb84d', emissiveIntensity: .6 })); cnd.position.set(a + .3, .85, .06); tg.add(cnd); }
  blob(cx, cz, (t.along ? len : wd) + 1.8, (t.along ? wd : len) + 1.8, g); }
function roundTable(t, g) { const top = new THREE.Mesh(new THREE.CylinderGeometry(t.d / 2 + .03, t.d / 2 + .12, .76, 32, 1, true), mat.linen); top.position.set(t.x, .38, t.y); top.castShadow = true; g.add(top); const lid = new THREE.Mesh(new THREE.CylinderGeometry(t.d / 2 + .03, t.d / 2 + .03, .02, 32), mat.linen); lid.position.set(t.x, .77, t.y); g.add(lid); const f = new THREE.Mesh(new THREE.IcosahedronGeometry(.16, 0), mat.flower); f.position.set(t.x, .9, t.y); g.add(f); blob(t.x, t.y, t.d + 2, t.d + 2, g); }

// ---------- telk (moodultelk: raam, katus, seinad kaarakendega, kardinad, valguskett) ----------
const winPanel = canvasTex(512, 256, (g, w, h) => { g.fillStyle = '#f5f3ee'; g.fillRect(0, 0, w, h); g.fillStyle = '#c9d6dd'; g.beginPath(); g.moveTo(96, 236); g.lineTo(96, 110); g.arc(256, 110, 160, Math.PI, 0); g.lineTo(416, 236); g.closePath(); g.fill(); g.strokeStyle = '#f5f3ee'; g.lineWidth = 8; for (let x = 136; x < 416; x += 40) { g.beginPath(); g.moveTo(x, 236); g.lineTo(x, 40); g.stroke(); } for (let y = 120; y < 236; y += 38) { g.beginPath(); g.moveTo(96, y); g.lineTo(416, y); g.stroke(); } g.beginPath(); g.moveTo(256, 110); g.lineTo(256, 236); g.stroke(); });
function tent(L, ox, oz, g, info) {
  const t = L.tent, span = (L.catalog_span || 0) || (t.product === 'tent-mod10' ? 10 : t.W), ridgeX = span === t.L, R = { L: t.L, W: t.W }, side = t.sideH || 2.3, ridge = side + span * .22;
  const tg = new THREE.Group(); tg.position.set(ox, 0, oz); g.add(tg); tg.userData.info = info;
  const bayL = ridgeX ? R.W : R.L, bays = Math.max(1, Math.round(bayL / (span >= 10 ? 5 : 3))), step = bayL / bays;
  const P = (a, b) => ridgeX ? [b, a] : [a, b]; // a = piki harja, b = üle sildeava
  const spanLen = ridgeX ? R.L : R.W;
  const frames = []; for (let i = 0; i <= bays; i++) frames.push(i * step);
  for (const a of frames) { for (const b of [0, spanLen]) { const [x, z] = P(a, b); boxM(.09, side, .09, mat.metal, x, side / 2, z, tg); }
    const [x0, z0] = P(a, 0), [x1, z1] = P(a, spanLen), [xm, zm] = P(a, spanLen / 2);
    const raft = (xa, za, xb, zb) => { const dx = xb - xa, dz = zb - za, len = Math.hypot(dx, ridge - side, dz); const m = boxM(.07, .07, len, mat.metal, (xa + xb) / 2, (side + ridge) / 2, (za + zb) / 2, tg); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(dx, ridge - side, dz).normalize()); };
    raft(x0, z0, xm, zm); raft(x1, z1, xm, zm); }
  // katus: kaks kallet + sakiline äär
  const roofG = new THREE.BufferGeometry(), V = [], put = (a, b, y) => { const [x, z] = P(a, b); V.push(x, y, z); };
  const quad = (a0, b0, y0, a1, b1, y1) => { put(a0, b0, y0); put(a1, b0, y0); put(a1, b1, y1); put(a0, b0, y0); put(a1, b1, y1); put(a0, b1, y1); };
  quad(-.08, -.08, side, bayL + .08, spanLen / 2, ridge); quad(-.08, spanLen + .08, side, bayL + .08, spanLen / 2, ridge);
  roofG.setAttribute('position', new THREE.Float32BufferAttribute(V, 3)); roofG.computeVertexNormals(); const roof = new THREE.Mesh(roofG, mat.tent); roof.castShadow = true; roof.receiveShadow = true; tg.add(roof);
  // otsakolmnurgad
  for (const a of [0, bayL]) { const tri = new THREE.BufferGeometry(), v = []; for (const [b, y] of [[0, side], [spanLen, side], [spanLen / 2, ridge]]) { const [x, z] = P(a, b); v.push(x, y, z); } tri.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); tri.computeVertexNormals(); tg.add(new THREE.Mesh(tri, mat.tent)); }
  // sakiline äär (valance) mõlemal pikal küljel
  for (const b of [0, spanLen]) for (let a = 0; a < bayL; a += .5) { const sh = new THREE.Mesh(new THREE.CircleGeometry(.25, 10, Math.PI, Math.PI), mat.tent); const [x, z] = P(a + .25, b); sh.position.set(x, side, z); sh.rotation.y = ridgeX ? Math.PI / 2 : 0; tg.add(sh); }
  // seinad: tagumine pikk külg ja otsad kaarakendega; esikülg lahti, kardinad iga posti juures kinni seotud
  const door = L.door ? L.door.wall : 2, wallsG = new THREE.Group(); tg.add(wallsG);
  const sides = [[0, 0, R.L, 0], [R.L, 0, R.L, R.W], [R.L, R.W, 0, R.W], [0, R.W, 0, 0]];
  sides.forEach(([xa, za, xb, zb], k) => { const len = Math.hypot(xb - xa, zb - za), open = k === door || k === (door + 2) % 4 && false;
    if (k === door) { for (let q = 0; q <= Math.round(len / step); q++) { const f = q / Math.round(len / step), x = xa + (xb - xa) * f, z = za + (zb - za) * f; for (const s of [-.18, .18]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(.09, .2, side - .1, 8, 3, true), mat.curtain); c.position.set(x + (zb - za) / len * 0 + (xb - xa) / len * s * (q === 0 ? 1 : q === Math.round(len / step) ? -1 : Math.sign(s)), side / 2, z + (zb - za) / len * s * (q === 0 ? 1 : q === Math.round(len / step) ? -1 : Math.sign(s))); const tie = new THREE.Mesh(new THREE.TorusGeometry(.12, .02, 6, 12), mat.curtain); tie.rotation.x = Math.PI / 2; tie.position.set(c.position.x, 1.1, c.position.z); tg.add(c, tie); c.castShadow = true; } } return; }
    const tex = winPanel.clone(); tex.wrapS = THREE.RepeatWrapping; tex.repeat.set(Math.max(1, Math.round(len / 3)), 1); tex.needsUpdate = true;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len, side - .05), M('#ffffff', { map: tex, roughness: .7, side: THREE.DoubleSide, transparent: true, opacity: .97 })); m.position.set((xa + xb) / 2, side / 2, (za + zb) / 2); m.rotation.y = -Math.atan2(zb - za, xb - xa); m.userData.k = k; m.receiveShadow = true; wallsG.add(m); });
  tg.userData.walls = wallsG;
  // valguskett: rippuvad lambid kahes reas piki telki + soe valgus
  const bulbs = []; for (const b of [spanLen * .3, spanLen * .7]) for (let a = .25; a < bayL; a += .45) { const sag = Math.sin(((a % step) / step) * Math.PI) * .25; const [x, z] = P(a, b); bulbs.push([x, side + (ridge - side) * .45 - sag, z]); }
  const bm = new THREE.InstancedMesh(new THREE.SphereGeometry(.045, 6, 4), mat.bulb, bulbs.length), o = new THREE.Object3D(); bulbs.forEach((p, i) => { o.position.set(...p); o.updateMatrix(); bm.setMatrixAt(i, o.matrix); }); tg.add(bm);
  const pl = new THREE.PointLight('#ffc17a', small ? 0 : 6, Math.max(R.L, R.W) * 1.2, 2); pl.position.set(R.L / 2, side + .3, R.W / 2); tg.add(pl);
  blob(R.L / 2, R.W / 2, R.L + 1.5, R.W + 1.5, tg);
  return { g: tg, H: ridge, side, R };
}

// ---------- paigutuse ehitamine ----------
const CAT = await fetch('../../../js/catalog/funrent.json').then(r => r.json()).catch(() => ({ products: [] }));
const prodName = id => (CAT.products.find(p => p.id === id) || {}).name || '';
let cur = null, tentObj = null, pickables = [];
async function build(v) {
  sc.remove(layoutG); layoutG.traverse(o => { if (o.geometry && !Object.values(geo).includes(o.geometry)) o.geometry.dispose(); }); layoutG = new THREE.Group(); sc.add(layoutG); pickables = [];
  const D = await fetch(`../out/${v}-layout.json`).then(r => r.json()), L = D.layout, o = L.origin || { x: 0, y: 0 }; cur = { v, D, L, o };
  const g = new THREE.Group(); g.position.set(o.x, 0, o.y); layoutG.add(g);
  const qty = id => (L.bom.find(b => b.id === id) || {}).qty;
  if (L.tent) tentObj = tent(L, 0, 0, g, { name: L.tent.name, rows: [['Mõõt', `${fmt(L.tent.W)} × ${fmt(L.tent.L)} m`], ['Kogus', '1'], ['Toode', 'Funrent moodultelk']] });
  const chairsJ = [], chairsC = [], style = v.startsWith('v2') ? 'jaan' : 'x', chKind = v === 'v3' ? 'chiavari' : 'cross';
  const items = L.items.concat(L.yard ? L.yard.items : []);
  for (const it of items) {
    const cx = it.x + it.w / 2, cz = it.y + it.d / 2, grp = new THREE.Group(); g.add(grp); pickables.push(grp);
    const info = (n, rows) => { grp.userData.info = { name: n, rows }; };
    if (it.kind === 'seating') { for (const t of it.tables) { if (t.shape === 'round') roundTable(t, grp); else longTable(t, grp, style); (chKind === 'chiavari' ? chairsC : chairsJ).push(...(t.chairs || [])); }
      const t0 = it.tables[0]; info(t0.shape === 'round' ? `Ümarlauad Ø${Math.round(t0.d * 100)}` : 'Pikk laud', [['Mõõt', t0.shape === 'round' ? `Ø ${fmt(t0.d)} m` : `${fmt(Math.max(t0.w, t0.d))} × ${fmt(Math.min(t0.w, t0.d))} m`], ['Laudu', String(it.tables.reduce((s, t) => s + (t.nTab || 1), 0))], ['Istekohti', String(it.seats)], ['Toode', prodName(t0.product)]]); }
    else if (it.kind === 'standing') { for (const t of it.tables) { const m = new THREE.Mesh(geo.cocktail, mat.white); m.position.set(t.x, 0, t.y); m.castShadow = true; grp.add(m); blob(t.x, t.y, 1.4, 1.4, grp); } info('Püstilauad', [['Mõõt', 'Ø 0,81 × 1,10 m'], ['Kogus', String(it.tables.length)], ['Külalisi', String(it.guests)], ['Toode', prodName('cocktail')]]); }
    else if (it.kind === 'stage') { const h = .4; boxM(it.w, .04, it.d, M('#2a2622', { roughness: .5 }), cx, h, cz, grp); const sk = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, h, 48, 1, true), mat.skirt); sk.scale.set(it.w / 2 * 1.02, 1, it.d / 2 * 1.02); boxM(it.w, h - .02, it.d, mat.skirt, cx, h / 2, cz, grp);
      for (const s of [-1, 1]) { const sp = new THREE.Group(); boxM(.35, .55, .3, mat.black, 0, 1.75, 0, sp); const leg = boxM(.03, 1.3, .03, mat.metal, 0, 1.05, 0, sp); sp.position.set(cx + s * (it.w / 2 - .3), h, cz - it.d / 2 + .3); grp.add(sp); }
      if (style === 'jaan') { boxM(.5, .35, .3, M('#33302c'), cx - .4, h + .18, cz, grp); const gt = boxM(.35, .9, .08, M('#b5793a', { roughness: .4 }), cx + .3, h + .5, cz, grp); gt.rotation.z = .15; } else boxM(1.2, .9, .6, mat.black, cx, h + .45, cz, grp);
      blob(cx, cz, it.w + 1, it.d + 1, grp); info(it.name || 'Lava', [['Mõõt', `${fmt(Math.max(it.w, it.d))} × ${fmt(Math.min(it.w, it.d))} m`], ['Kõrgus', '0,40 m, seelikuga'], ['Mooduleid', String(L.bom.filter(b => b.id === 'podium').reduce((s, b) => s + b.qty, 0))], ['Toode', 'Funrent poodiumimoodul 2 × 1 m']]); }
    else if (it.kind === 'dance') { boxM(it.w, .03, it.d, mat.parquet, cx, .015, cz, grp); info('Tantsupõrand', [['Mõõt', `${fmt(it.w)} × ${fmt(it.d)} m`], ['Plaate', String(Math.round(it.w * it.d))], ['Toode', prodName('dance')]]); }
    else if (it.kind === 'bar') { boxM(it.w, 1.05, it.d, mat.wood, cx, .525, cz, grp); boxM(it.w + .1, .05, it.d + .1, M('#f2efe8'), cx, 1.07, cz, grp); blob(cx, cz, it.w + 1, it.d + 1, grp); info('Baarilett', [['Mõõt', `${fmt(Math.max(it.w, it.d))} × ${fmt(Math.min(it.w, it.d))} m`], ['Kogus', String(it.n || 1)], ['Toode', prodName('counter')]]); }
    else if (it.kind === 'catering') { if (BUFFET) { const m = BUFFET.clone(true), b = new THREE.Box3().setFromObject(m), s = b.getSize(new THREE.Vector3()), k = Math.max(it.w, it.d) / Math.max(s.x, s.z); m.position.set(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2); const w = new THREE.Group(); w.add(m); w.scale.setScalar(k); w.position.set(cx, 0, cz); if ((it.w > it.d) !== (s.x > s.z)) w.rotation.y = Math.PI / 2; m.traverse(q => { if (q.isMesh) q.castShadow = true; }); grp.add(w); } else boxM(it.w, .76, it.d, mat.linen, cx, .38, cz, grp);
      blob(cx, cz, it.w + 1, it.d + 1, grp); info('Toitlustuslaud', [['Mõõt', `${fmt(Math.max(it.w, it.d))} × ${fmt(Math.min(it.w, it.d))} m`], ['Kogus', String(it.n || 1)], ['Toode', prodName('cater183')]]); }
  }
  chairs(chairsJ, 'cross', g); chairs(chairsC, 'chiavari', g);
  // jaanipäeva kaunistus: kasekaar sissepääsul, heinapallid
  if (style === 'jaan' && L.door) { const z = L.door.zone, ax = z.x + z.w / 2, az = z.y + z.d / 2, hor = L.door.wall % 2 === 0, dg = new THREE.Group(); g.add(dg);
    for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(.06, .07, 2.3, 8), mat.birch); p.position.set(ax + (hor ? s * .9 : 0), 1.15, (L.door.wall === 0 ? 0 : L.door.wall === 2 ? L.tent.W : az) + (hor ? 0 : s * .9)); p.castShadow = true; dg.add(p);
      for (let k = 0; k < 6; k++) { const lf = new THREE.Mesh(new THREE.IcosahedronGeometry(.22, 0), mat.leaf); lf.position.set(p.position.x + (Math.random() - .5) * .3, .6 + k * .32, p.position.z + (Math.random() - .5) * .3); dg.add(lf); } }
    for (const [dx, dz] of [[-1.6, -.9], [-1.6, .5]]) { const b = boxM(.9, .45, .45, mat.straw, (L.door.wall % 2 ? ax : ax + dx), .225, (L.door.wall % 2 ? az + dx : (L.door.wall === 0 ? -1.2 : L.tent.W + 1.2) + dz * .3), dg); } }
  updateWalls(); dims(); need();
}

// ---------- telgi seinad kaamera pool peidus ----------
function updateWalls() { if (!tentObj) return; const p = active.position.clone().sub(tentObj.g.getWorldPosition(new THREE.Vector3())), R = tentObj.R;
  tentObj.g.userData.walls.children.forEach(w => { const k = w.userData.k, n = [[0, -1], [1, 0], [0, 1], [-1, 0]][k], c = [[R.L / 2, 0], [R.L, R.W / 2], [R.L / 2, R.W], [0, R.W / 2]][k]; w.visible = active === ortho ? false : ((p.x - c[0]) * n[0] + (p.z - c[1]) * n[1]) < 0; }); }

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
  const hit = ray.intersectObjects([layoutG, world], true).find(h => { let o = h.object; while (o && !o.userData.info) o = o.parent; return !!o; });
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
  if (tentObj) tentObj.g.traverse(o => { if (o.isMesh || o.isInstancedMesh) { if (o.userData.roofY == null) o.userData.roofY = new THREE.Box3().setFromObject(o).min.y > tentObj.side - .3; if (o.userData.roofY) o.visible = !on; } });
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
