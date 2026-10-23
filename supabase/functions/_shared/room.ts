// Toa 3D (Sisekujundus + 3D): puhas loogika ilma võrguta. Claude'i plaani kontroll, perspektiivi sirgendus, mööbli rühmitus.
// Koordinaadid: meetrid; x vasakult seinast paremale, z tagaseinast kaamera poole, y põrandast üles.

export type Pt = [number, number];
export type Item = {
  name: string; key: string; bbox: [number, number, number, number]; size: { w: number; d: number; h: number };
  pos: { x: number; z: number }; elev: number; rot: number; has_back: boolean; builtin: boolean; color: string;
  front_px: Pt[] | null; model: boolean; photo: number;
};
type Pts = { px: Pt; m: Pt }[];
export type Plan = {
  room: { w: number; d: number; h: number }; est: boolean; img: [number, number]; sizes: [number, number][];
  floor_pts: Pts; back_pts: Pts; left_pts: Pts; right_pts: Pts;
  // mitu fotot: mis fotol on iga pind kõige paremini näha (tekstuurid ja lõiked sealt)
  photo: { floor: number; back: number; left: number; right: number };
  walls: { back: string; left: string; right: string; ceiling: string }; floor: { material: string; color: string };
  openings: { wall: "back" | "left" | "right"; kind: "window" | "door"; x0: number; x1: number; y0: number; y1: number }[];
  items: Item[];
};

export const MAX_MODELS = 4; // eraldi Tripo mudeleid toa kohta (sama nimega esemed kasutavad sama mudelit)
const num = (v: unknown, lo: number, hi: number, d: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const hex = (v: unknown, d: string) => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : d;
const pt = (v: unknown, W: number, H: number): Pt | null => Array.isArray(v) && v.length === 2 && v.every((x) => Number.isFinite(Number(x)))
  ? [num(v[0], 0, W, 0), num(v[1], 0, H, 0)] : null;
/** "nightstand left" -> "nightstand": sama mudel mõlemale */
export const itemKey = (n: string) => n.toLowerCase().replace(/\b(left|right|front|back|center|middle|\d+)\b/g, "").replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim() || "item";

/** Claude'i vastus -> kontrollitud plaan. sizes = iga foto [laius, kõrgus] (või üks foto W, H). dims = kasutaja mõõdud (siis pole hinnanguline). */
export function sanitizePlan(a: Record<string, unknown>, W: number | [number, number][], H?: number | null, dims?: { w: number; d: number; h: number } | null): Plan {
  const sizes: [number, number][] = Array.isArray(W) ? W : [[W, H || 0]];
  const N = sizes.length, ph = (v: unknown, d = 0) => { const n = Number(v); return Number.isInteger(n) && n >= 0 && n < N ? n : d; };
  const r = (a.room || {}) as Record<string, unknown>;
  const room = dims ? { ...dims } : { w: num(r.width, 1.5, 20, 4), d: num(r.depth, 1.5, 20, 4), h: num(r.height, 2, 6, 2.6) };
  const photo = { floor: ph(a.floor_photo), back: ph(a.back_wall_photo), left: ph(a.left_wall_photo), right: ph(a.right_wall_photo) };
  // m: põrand [x, z], tagasein [x, y], küljeseinad [z, y]
  const pts = (v: unknown, kind: "floor" | "back" | "side", i: number) => (Array.isArray(v) ? v : []).map((q: Record<string, unknown>) => {
    const px = pt(q?.px, sizes[i][0], sizes[i][1]), m = Array.isArray(q?.m) ? q.m as unknown[] : null;
    if (!px || !m || m.length !== 2) return null;
    const a0 = kind === "side" ? room.d : room.w, a1 = kind === "floor" ? room.d : room.h;
    return { px, m: [num(m[0], -1, a0 + 1, 0), num(m[1], -1, a1 + 1, 0)] as Pt };
  }).filter(Boolean).slice(0, 4) as Pts;
  const w = (a.walls || {}) as Record<string, unknown>, f = (a.floor || {}) as Record<string, unknown>;
  const items: Item[] = (Array.isArray(a.furniture) ? a.furniture : []).slice(0, 14).map((x: Record<string, unknown>) => {
    const s = (x.size || {}) as Record<string, unknown>, p = (x.pos || {}) as Record<string, unknown>;
    const bb = Array.isArray(x.bbox_px) && x.bbox_px.length === 4 ? x.bbox_px.map(Number) : null;
    const name = String(x.name || "item").slice(0, 60), pi = ph(x.photo), [W, H] = sizes[pi];
    const fp = Array.isArray(x.front_px) ? (x.front_px as unknown[]).map((q) => pt(q, W, H)).filter(Boolean) as Pt[] : [];
    const size = { w: num(s.w, .1, 8, .8), d: num(s.d, .05, 8, .6), h: num(s.h, .02, 3.5, .8) };
    // pööratud ese: jalajälg seina suunas on d, mitte w (muidu jääks seinaäärne kapp toa keskele)
    const rot = num(x.rot_deg, -180, 180, 0), ra = rot * Math.PI / 180, ex = Math.min(room.w / 2, Math.abs(Math.cos(ra)) * size.w / 2 + Math.abs(Math.sin(ra)) * size.d / 2),
      ez = Math.min(room.d / 2, Math.abs(Math.sin(ra)) * size.w / 2 + Math.abs(Math.cos(ra)) * size.d / 2);
    return {
      name, key: itemKey(name), bbox: (bb && bb.every(Number.isFinite) ? [num(bb[0], 0, W, 0), num(bb[1], 0, H, 0), num(bb[2], 0, W, W), num(bb[3], 0, H, H)] : [0, 0, W, H]) as Item["bbox"],
      size, pos: { x: num(p.x, ex, room.w - ex, room.w / 2), z: num(p.z, ez, room.d - ez, room.d / 2) },
      elev: num(x.elev, 0, Math.max(0, room.h - size.h), 0), rot, has_back: x.has_back === true, builtin: x.builtin === true,
      color: hex(x.color, "#c8c0b4"), front_px: fp.length === 4 ? fp : null, model: false, photo: pi,
    };
  }).filter((it) => !/rug|carpet|blanket|throw|picture|frame|poster|pendant|ceiling|curtain|plant|pillow|cushion/i.test(it.name) && it.bbox[2] - it.bbox[0] > 8 && it.bbox[3] - it.bbox[1] > 8);
  // mudeliks: lahtine mööbel (mitte sisseehitatud), suurimad unikaalsed nimed kõigepealt
  const seen = new Set<string>();
  [...items].filter((i) => !i.builtin).sort((a, b) => b.size.w * b.size.d * b.size.h - a.size.w * a.size.d * a.size.h).forEach((i) => {
    if (seen.size < MAX_MODELS && !seen.has(i.key)) { seen.add(i.key); i.model = true; }
  });
  const openings = (Array.isArray(a.openings) ? a.openings : []).slice(0, 10).map((o: Record<string, unknown>) => {
    const wall = ["back", "left", "right"].includes(String(o.wall)) ? String(o.wall) as "back" : "back";
    const len = wall === "back" ? room.w : room.d;
    return { wall, kind: o.kind === "door" ? "door" as const : "window" as const, x0: num(o.x0, 0, len, 0), x1: num(o.x1, 0, len, len), y0: num(o.y0, 0, room.h, 0), y1: num(o.y1, 0, room.h, room.h) };
  }).filter((o) => o.x1 - o.x0 > .2 && o.y1 - o.y0 > .2);
  return {
    room, est: !dims, img: sizes[0], sizes, photo, floor_pts: pts(a.floor_pts, "floor", photo.floor), back_pts: pts(a.back_wall_pts, "back", photo.back),
    left_pts: pts(a.left_wall_pts, "side", photo.left), right_pts: pts(a.right_wall_pts, "side", photo.right),
    walls: { back: hex(w.back, "#ecebe7"), left: hex(w.left, "#ecebe7"), right: hex(w.right, "#ecebe7"), ceiling: hex(w.ceiling, "#f4f3f0") },
    floor: { material: String(f.material || "floor").slice(0, 60), color: hex(f.color, "#b9a789") }, openings, items,
  };
}

/** 4 punktipaari -> homograafia, mis viib dst (väljundpikslid) src-i (fotopikslid). */
export function homography(dst: Pt[], src: Pt[]): number[] | null {
  if (dst.length !== 4 || src.length !== 4) return null;
  const A: number[][] = [], b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = dst[i], [u, v] = src[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  const n = 8, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-9) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  return [...M.map((r, i) => r[n] / r[i]), 1];
}
export const apply = (h: number[], x: number, y: number): Pt => { const w = h[6] * x + h[7] * y + 1; return [(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w]; };

/** Perspektiivi sirgendus (bilineaarne). img: RGBA. Väljaspool fotot jääb värv `bg`. */
export function warp(img: { width: number; height: number; data: Uint8Array }, h: number[], W: number, H: number, bg = [220, 218, 214]): Uint8Array {
  const out = new Uint8Array(W * H * 4), { width: iw, height: ih, data } = img;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const [u, v] = apply(h, x + .5, y + .5), o = (y * W + x) * 4;
    if (!(u >= 0 && v >= 0 && u < iw - 1 && v < ih - 1)) { out[o] = bg[0]; out[o + 1] = bg[1]; out[o + 2] = bg[2]; out[o + 3] = 255; continue; }
    const x0 = u | 0, y0 = v | 0, fx = u - x0, fy = v - y0, i = (y0 * iw + x0) * 4, j = i + iw * 4;
    for (let c = 0; c < 3; c++) out[o + c] = (data[i + c] * (1 - fx) + data[i + 4 + c] * fx) * (1 - fy) + (data[j + c] * (1 - fx) + data[j + 4 + c] * fx) * fy;
    out[o + 3] = 255;
  }
  return out;
}

/** Tagaseina tekstuur: kogu sein 0..laius x 0..kõrgus (y üles -> pildi rida alla). */
export function backWallH(p: Plan, ppm: number): { h: number[]; W: number; H: number } | null {
  if (p.back_pts.length !== 4) return null;
  const W = Math.min(1400, Math.round(p.room.w * ppm)), H = Math.min(800, Math.round(p.room.h * ppm)), sx = W / p.room.w, sy = H / p.room.h;
  const h = homography(p.back_pts.map((q) => [q.m[0] * sx, (p.room.h - q.m[1]) * sy] as Pt), p.back_pts.map((q) => q.px));
  return h ? { h, W, H } : null;
}

/** Küljesein: tekstuuri x kulgeb nagu vaaturi tasapind (vasak: eest taha, parem: tagant ette), y ülevalt alla. */
export function sideWallH(p: Plan, side: "left" | "right", ppm: number): { h: number[]; W: number; H: number } | null {
  const P = side === "left" ? p.left_pts : p.right_pts;
  if (P.length !== 4) return null;
  const W = Math.min(1400, Math.round(p.room.d * ppm)), H = Math.min(800, Math.round(p.room.h * ppm)), sx = W / p.room.d, sy = H / p.room.h;
  const h = homography(P.map((q) => [(side === "left" ? p.room.d - q.m[0] : q.m[0]) * sx, (p.room.h - q.m[1]) * sy] as Pt), P.map((q) => q.px));
  return h ? { h, W, H } : null;
}

/** JPEG mõõdud päisest (ilma lahti pakkimata). */
export function jpegSize(b: Uint8Array): [number, number] | null {
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  for (let i = 2; i + 9 < b.length;) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1], len = (b[i + 2] << 8) | b[i + 3];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return [(b[i + 7] << 8) | b[i + 8], (b[i + 5] << 8) | b[i + 6]];
    i += 2 + len;
  }
  return null;
}

/** Sisseehitatud kapi esikülg: 4 nurka (üleval vasakul, üleval paremal, all paremal, all vasakul) -> ristkülik. */
export function frontH(it: Item, ppm: number): { h: number[]; W: number; H: number } | null {
  if (!it.front_px) return null;
  const W = Math.max(16, Math.min(1024, Math.round(it.size.w * ppm))), H = Math.max(16, Math.min(1024, Math.round(it.size.h * ppm)));
  const h = homography([[0, 0], [W, 0], [W, H], [0, H]], it.front_px);
  return h ? { h, W, H } : null;
}

// ---------- v2: parameetriline stseen (prototüüpide kvaliteet: docs/prototypes) ----------
// Kõik meetrites: x vasakult seinast paremale, z tagaseinast kaamera poole, y põrandast üles.
export type Mat = { id: string; name: string; kind: string; desc: string; color: string; rough: number; metal: number; scale: number; photo: number; tex?: string | null };
export type Zone = { wall: "back" | "left" | "right" | "front"; a0: number; a1: number; y0: number; y1: number; mat: string };
export type Open = { wall: "back" | "left" | "right" | "front"; kind: "window" | "door" | "glass"; a0: number; a1: number; y0: number; y1: number };
export type El = { t: "box" | "cyl" | "stove" | "curtain" | "model"; name: string; mat: string;
  x0: number; x1: number; y0: number; y1: number; z0: number; z1: number; r: number; rot: number; tilt: number; bbox?: number[]; photo: number; has_back?: boolean };
export type Light = { t: "strip" | "spot" | "lamp"; x0: number; x1: number; y: number; z: number; tx: number; ty: number; tz: number; warm: boolean };
export type Scene = { v: 2; room: { w: number; d: number; h: number }; est: boolean; sizes: [number, number][];
  floor: string; ceiling: string; wall: string; mats: Mat[]; zones: Zone[]; opens: Open[]; els: El[]; lights: Light[] };

const KINDS = new Set(["wood", "stone", "tile", "concrete", "fabric", "leather", "paint", "metal", "glass", "plaster", "carpet", "plastic", "emissive"]);
export const TEX_KINDS = new Set(["wood", "stone", "tile", "concrete", "fabric", "leather", "plaster", "carpet"]); // nendele tehakse korduv tekstuur fotolt
const WALLS = ["back", "left", "right", "front"] as const;
const wallLen = (w: string, R: { w: number; d: number }) => (w === "left" || w === "right" ? R.d : R.w);

/** Claude'i stseen -> kontrollitud stseen: kõik numbrid toas, viited olemasolevatele materjalidele, piiratud arv. */
export function sanitizeScene(a: Record<string, unknown>, sizes: [number, number][], dims?: { w: number; d: number; h: number } | null): Scene {
  const N = Math.max(1, sizes.length), ph = (v: unknown) => { const n = Number(v); return Number.isInteger(n) && n >= 0 && n < N ? n : 0; };
  const r = (a.room || {}) as Record<string, unknown>;
  const R = dims ? { ...dims } : { w: num(r.width, 1.2, 20, 3.5), d: num(r.depth, 1.2, 20, 3.5), h: num(r.height, 1.9, 6, 2.5) };
  const ids = new Set<string>(), mats: Mat[] = [];
  for (const m of (Array.isArray(a.materials) ? a.materials : []).slice(0, 8) as Record<string, unknown>[]) {
    const id = String(m.id || "").toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 24);
    if (!id || ids.has(id)) continue;
    ids.add(id);
    const kind = KINDS.has(String(m.kind)) ? String(m.kind) : "paint";
    mats.push({ id, name: String(m.name || id).slice(0, 40), kind, desc: String(m.desc || m.name || kind).slice(0, 140), color: hex(m.color, "#bbb5ab"),
      rough: num(m.rough, 0, 1, kind === "metal" ? .35 : .75), metal: num(m.metal, 0, 1, kind === "metal" ? .8 : 0), scale: num(m.scale, .1, 4, 1), photo: ph(m.photo) });
  }
  if (!mats.length) mats.push({ id: "wall", name: "sein", kind: "paint", desc: "white painted wall", color: "#e9e6e0", rough: .85, metal: 0, scale: 1, photo: 0 });
  const mid = (v: unknown, d = mats[0].id) => { const s = String(v || "").toLowerCase(); return ids.has(s) ? s : d; };
  const zones: Zone[] = [], opens: Open[] = [];
  for (const z of (Array.isArray(a.zones) ? a.zones : []).slice(0, 24) as Record<string, unknown>[]) {
    const w = WALLS.includes(z.wall as never) ? z.wall as Zone["wall"] : "back", L = wallLen(w, R);
    const a0 = num(z.a0, 0, L, 0), a1 = num(z.a1, 0, L, L), y0 = num(z.y0, 0, R.h, 0), y1 = num(z.y1, 0, R.h, R.h);
    if (a1 - a0 > .05 && y1 - y0 > .05) zones.push({ wall: w, a0, a1, y0, y1, mat: mid(z.mat) });
  }
  for (const o of (Array.isArray(a.openings) ? a.openings : []).slice(0, 12) as Record<string, unknown>[]) {
    const w = WALLS.includes(o.wall as never) ? o.wall as Open["wall"] : "back", L = wallLen(w, R);
    const kind = o.kind === "door" ? "door" : o.kind === "glass" || o.kind === "glass_wall" ? "glass" : "window";
    const a0 = num(o.a0, 0, L, 0), a1 = num(o.a1, 0, L, L), y0 = num(o.y0, 0, R.h, 0), y1 = num(o.y1, 0, R.h, R.h);
    if (a1 - a0 > .2 && y1 - y0 > .2) opens.push({ wall: w, kind, a0, a1, y0, y1 });
  }
  const els: El[] = [];
  for (const e of (Array.isArray(a.elements) ? a.elements : []).slice(0, 90) as Record<string, unknown>[]) {
    const t = ["box", "cyl", "stove", "curtain", "model"].includes(String(e.t)) ? String(e.t) as El["t"] : "box";
    const x0 = num(e.x0, -.3, R.w + .3, 0), x1 = num(e.x1, -.3, R.w + .3, x0 + .5), y0 = num(e.y0, 0, R.h + .3, 0), y1 = num(e.y1, 0, R.h + .5, y0 + .5);
    const z0 = num(e.z0, -.3, R.d + .3, 0), z1 = num(e.z1, -.3, R.d + .3, z0 + .5);
    const [X0, X1, Y0, Y1, Z0, Z1] = [Math.min(x0, x1), Math.max(x0, x1), Math.min(y0, y1), Math.max(y0, y1), Math.min(z0, z1), Math.max(z0, z1)];
    if (X1 - X0 < .004 || Y1 - Y0 < .004 || Z1 - Z0 < .004) continue;
    const bb = Array.isArray(e.bbox_px) && e.bbox_px.length === 4 ? (e.bbox_px as unknown[]).map(Number) : undefined;
    els.push({ t, name: String(e.name || t).slice(0, 50), mat: mid(e.mat), x0: X0, x1: X1, y0: Y0, y1: Y1, z0: Z0, z1: Z1,
      r: num(e.r, 0, Math.min(X1 - X0, Y1 - Y0, Z1 - Z0) / 2, 0), rot: num(e.rot, -180, 180, 0), tilt: num(e.tilt, -60, 60, 0),
      bbox: bb && bb.every(Number.isFinite) ? bb : undefined, photo: ph(e.photo), has_back: e.has_back === true });
  }
  // „model“ (Tripo) ainult siis, kui on foto lõige; muidu kast
  els.forEach((e) => { if (e.t === "model" && !e.bbox) e.t = "box"; });
  const lights: Light[] = [];
  for (const l of (Array.isArray(a.lights) ? a.lights : []).slice(0, 20) as Record<string, unknown>[]) {
    const t = ["strip", "spot", "lamp"].includes(String(l.t)) ? String(l.t) as Light["t"] : "lamp";
    lights.push({ t, x0: num(l.x0 ?? l.x, 0, R.w, R.w / 2), x1: num(l.x1 ?? l.x, 0, R.w, R.w / 2), y: num(l.y, 0, R.h, R.h - .05), z: num(l.z, 0, R.d, R.d / 2),
      tx: num(l.tx ?? l.x0 ?? l.x, 0, R.w, R.w / 2), ty: num(l.ty, 0, R.h, 0), tz: num(l.tz ?? l.z, 0, R.d, R.d / 2), warm: l.warm !== false });
  }
  return { v: 2, room: R, est: !dims, sizes, floor: mid(a.floor), ceiling: mid(a.ceiling), wall: mid(a.wall), mats, zones, opens, els, lights };
}
