// LOD2 sobituse stressitest: LOD2 kuju -> .glb (juhuslik mõõtkava/pööre/üleulatus/müra) -> GLTFLoader -> m3Fit
window.fitCheck = async function (cases, trials = 5, seed = 7) {
  if (!THREE.GLTFExporter) await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/exporters/GLTFExporter.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
  let a = seed; const R = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const get = async e => { const L = await loadLod2(e); if (!L) throw new Error('no lod2 ' + e); return L; };
  const tri2 = (P) => { const n = [0, 0, 0]; P.forEach((p, k) => { const q = P[(k + 1) % P.length]; n[0] += (p[1] - q[1]) * (p[2] + q[2]); n[1] += (p[2] - q[2]) * (p[0] + q[0]); n[2] += (p[0] - q[0]) * (p[1] + q[1]); });
    const ax = n.map(Math.abs), [u, w] = ax[0] >= ax[1] && ax[0] >= ax[2] ? [1, 2] : ax[1] >= ax[2] ? [0, 2] : [0, 1];
    return THREE.ShapeUtils.triangulateShape(P.map(p => new THREE.Vector2(p[u], p[w])), []); };
  // LOD2 meetrites (x ida, y põhi, z üles) -> kolmnurgad; seinad jalajäljest räästani, katus üleulatusega
  function build(L, ov, noise) {
    const g = L.g[0], G = []; for (let i = 0; i + 1 < g.length; i += 2) G.push([g[i], g[i + 1]]);
    const T = [], add = P => tri2(P).forEach(t => t.forEach(i => T.push(P[i])));
    G.forEach((p, k) => { const q = G[(k + 1) % G.length]; add([[p[0], p[1], 0], [q[0], q[1], 0], [q[0], q[1], L.eave], [p[0], p[1], L.eave]]); });
    add(G.map(p => [p[0], p[1], 0]));
    const nearEdge = (x, y) => G.some((p, k) => { const q = G[(k + 1) % G.length], ex = q[0] - p[0], ey = q[1] - p[1], l2 = ex * ex + ey * ey, u = Math.max(0, Math.min(1, ((x - p[0]) * ex + (y - p[1]) * ey) / l2)); return Math.hypot(p[0] + u * ex - x, p[1] + u * ey - y) < .3; });
    L.f.forEach(F => { const c = F[3], P = []; for (let k = 0; k + 2 < c.length; k += 3) P.push([c[k], c[k + 1], c[k + 2]]);
      const sl = Math.tan(F[1] * Math.PI / 180);
      add(P.map(p => { if (!ov || !nearEdge(p[0], p[1])) return p; const d = Math.hypot(p[0], p[1]) || 1; return [p[0] + p[0] / d * ov, p[1] + p[1] / d * ov, p[2] - ov * Math.min(sl, 3)]; })); });
    const J = new Map(), j = p => { const k = p.map(v => v.toFixed(3)).join(); if (!J.has(k)) J.set(k, p.map(v => v + (R() * 2 - 1) * noise)); return J.get(k); };
    return T.map(j);
  }
  async function roundTrip(T, k, th, off) {
    const pos = []; T.forEach(p => pos.push(p[0], p[2], -p[1]));
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial()), grp = new THREE.Group(); grp.add(mesh); grp.scale.setScalar(k); grp.rotation.y = th; grp.position.set(...off); grp.updateMatrixWorld(true);
    const buf = await new Promise(res => new THREE.GLTFExporter().parse(grp, res, { binary: true }));
    const gl = await new Promise((res, rej) => new THREE.GLTFLoader().parse(buf, '', res, rej));
    return { model: gl.scene, ok: true, grp };
  }
  const out = [];
  for (const c of cases) {
    const L = await get(c.ehr), W = await Promise.all(c.wrong.map(get));
    for (let t = 0; t < trials; t++) {
      const k = .3 + R() * 2.7, th = R() * Math.PI * 2, ov = R() * .5, off = [(R() - .5) * 20, (R() - .5) * 5, (R() - .5) * 20];
      const V = await roundTrip(build(L, ov, .05), k, th, off), f = m3Fit(V, L), cfR = window.m3ConformCalc ? m3ConformCalc(V, L, f) : null;
      // tõde: LOD2 punkt -> mudel (sama teisendus) -> m3ToL tagasi
      const g = L.g[0], toM = (x, y) => new THREE.Vector3(x, 0, -y).applyMatrix4(V.grp.matrixWorld);
      let far = [0, 2], dmax = 0; for (let i = 0; i < g.length; i += 2) for (let j = i + 2; j < g.length; j += 2) { const d = Math.hypot(g[i] - g[j], g[i + 1] - g[j + 1]); if (d > dmax) { dmax = d; far = [i, j]; } }
      const A = m3ToL(f, toM(g[far[0]], g[far[0] + 1])), B = m3ToL(f, toM(g[far[1]], g[far[1] + 1]));
      let rotErr = (Math.atan2(B[1] - A[1], B[0] - A[0]) - Math.atan2(g[far[1] + 1] - g[far[0] + 1], g[far[1]] - g[far[0]])) * 180 / Math.PI; rotErr = ((rotErr % 360) + 540) % 360 - 180;
      const posErr = Math.hypot(A[0] - g[far[0]], A[1] - g[far[0] + 1]);
      const wr = W.map((Lw, i) => { const fw = m3Fit(V, Lw), cf = window.m3ConformCalc ? m3ConformCalc(V, Lw, fw) : null; return { ehr: c.wrong[i], ok: fw.ok, iou: fw.iou, err: fw.err, cf }; });
      out.push({ name: c.name, k: +k.toFixed(2), rot: +(th * 180 / Math.PI).toFixed(0), ov: +ov.toFixed(2), ok: f.ok, cfR, sym: f.sym, iou: f.iou, hErr: f.err, scaleErrPct: +((f.s * k - 1) * 100).toFixed(2), rotErr: +rotErr.toFixed(2), posErr: +posErr.toFixed(2), wrong: wr });
    }
  }
  return out;
};
window.CASES=[{name:'viil Rannakaare 13',ehr:'116059420',wrong:['120259120','116057120']},{name:'L Toome 7',ehr:'120259120',wrong:['116059420','120262920']},{name:'suur Sõpruse 5',ehr:'120662136',wrong:['120259120','120252683']}];
window.fitAgg=r=>[...new Set(r.map(q=>q.name))].map(n=>{const x=r.filter(q=>q.name===n),ab=Math.abs;
  return `${n}: ok ${x.filter(q=>q.ok).length}/${x.length}, iou ${Math.min(...x.map(q=>q.iou)).toFixed(2)}–${Math.max(...x.map(q=>q.iou)).toFixed(2)}, h ${Math.max(...x.map(q=>q.hErr)).toFixed(3)}, scale max ${Math.max(...x.map(q=>ab(q.scaleErrPct))).toFixed(2)}%, wrong ok ${x.flatMap(q=>q.wrong).filter(w=>w.ok).length}/${x.length*2}`;});
