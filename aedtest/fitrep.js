// Ainult kohalik test: sobitatud mudeli võrdlus LOD2-ga (sama meetod mõlemal: minimaalse pindalaga ristkülik + kumer kest).
window.fitrep = function () {
  const m = stSess().model, V = P3V, f = m.fit, L = M3L2[m.ehr];
  const P = [], v = new THREE.Vector3();
  V.model.updateMatrixWorld(true);
  V.model.traverse((o) => { const g = o.isMesh && o.geometry, p = g && g.attributes.position; if (!p) return;
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld); P.push(m3ToL(f, v)); } });
  const eave = L.eave > 0 ? L.eave : L.ridge * .6;
  // seinte lõige: kõrgus 30–70 % räästast (räästa üleulatus ja maapind välja)
  const S = P.filter((q) => q[2] > .3 * eave && q[2] < .7 * eave).map((q) => [q[0], q[1]]);
  const FP = []; L.g.forEach((r) => { for (let i = 0; i + 1 < r.length; i += 2) FP.push([r[i], r[i + 1]]); });
  const hull = (pts) => { const a = pts.slice().sort((p, q) => p[0] - q[0] || p[1] - q[1]), cr = (o, p, q) => (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]), lo = [], up = [];
    for (const p of a) { while (lo.length > 1 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    for (const p of a.reverse()) { while (up.length > 1 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
    return lo.slice(0, -1).concat(up.slice(0, -1)); };
  const area = (h) => Math.abs(h.reduce((s, p, i) => { const q = h[(i + 1) % h.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
  const rect = (h) => { let best = null; for (let d = 0; d < 90; d += .1) { const t = d * Math.PI / 180, c = Math.cos(t), s = Math.sin(t); let a = 1e9, b = 1e9, A = -1e9, B = -1e9;
      for (const p of h) { const x = p[0] * c + p[1] * s, y = -p[0] * s + p[1] * c; a = Math.min(a, x); A = Math.max(A, x); b = Math.min(b, y); B = Math.max(B, y); }
      const ar = (A - a) * (B - b); if (!best || ar < best.ar) best = { ar, ang: d, L: Math.max(A - a, B - b), W: Math.min(A - a, B - b) }; } return best; };
  const hm = hull(S), hl = hull(FP), rm = rect(hm), rl = rect(hl);
  let dAng = Math.abs(rm.ang - rl.ang) % 90; dAng = Math.min(dAng, 90 - dAng);
  const top = Math.max(...P.map((q) => q[2]));
  const pct = (a, b) => +((a / b - 1) * 100).toFixed(1);
  return { fit: { ok: f.ok, iou: +f.iou.toFixed(3), heightErr: +(f.err * 100).toFixed(1) + '%', sym: f.sym, s: +f.s.toFixed(4), rot: +f.rot.toFixed(1) },
    lod2: { L: +rl.L.toFixed(2), W: +rl.W.toFixed(2), hullArea: +area(hl).toFixed(1), ridge: L.ridge, eave: L.eave },
    model: { L: +rm.L.toFixed(2), W: +rm.W.toFixed(2), hullArea: +area(hm).toFixed(1), ridge: +top.toFixed(2), slicePts: S.length },
    errors: { rotationDeg: +dAng.toFixed(1), lengthPct: pct(rm.L, rl.L), widthPct: pct(rm.W, rl.W), areaPct: pct(area(hm), area(hl)), ridgePct: pct(top, L.ridge) } };
};
