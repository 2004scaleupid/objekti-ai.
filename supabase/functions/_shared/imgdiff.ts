// Kas AI tulemus on sisendiga peaaegu sama (muudatust ei tulnud). Võrdleb väikest ruudustikku piirkondade kaupa:
// väike päris muudatus (uus lamp, värvitud sein) muudab vähemalt ühe piirkonna, AI uuesti joonistamise müra mitte.
const GW = 96, GH = 72, BX = 8, BY = 6, SH = 3; // 96×72 rakku, 8×6 piirkonda, nihke otsing ±3 rakku (~3%)

export type Grid = Float32Array; // GW*GH*3, RGB 0..255

/** RGBA piksel -> GW×GH keskmistatud RGB (kuju ei loe, kõik pildid samale ruudustikule). */
export function toGrid(rgba: Uint8Array, w: number, h: number): Grid {
  const g = new Float32Array(GW * GH * 3), n = new Float32Array(GW * GH);
  const step = Math.max(1, Math.floor(Math.min(w, h) / 400)); // ~400 px valim piisab
  for (let y = 0; y < h; y += step) {
    const gy = Math.min(GH - 1, Math.floor((y / h) * GH));
    for (let x = 0; x < w; x += step) {
      const gx = Math.min(GW - 1, Math.floor((x / w) * GW)), i = (y * w + x) * 4, c = gy * GW + gx;
      g[c * 3] += rgba[i]; g[c * 3 + 1] += rgba[i + 1]; g[c * 3 + 2] += rgba[i + 2]; n[c]++;
    }
  }
  for (let c = 0; c < GW * GH; c++) for (let k = 0; k < 3; k++) g[c * 3 + k] /= n[c] || 1;
  return g;
}

const blur = (g: Grid): Grid => { const o = new Float32Array(g.length);
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) for (let k = 0; k < 3; k++) { let t = 0, n = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const yy = y + j, xx = x + i; if (yy < 0 || xx < 0 || yy >= GH || xx >= GW) continue; t += g[(yy * GW + xx) * 3 + k]; n++; }
    o[(y * GW + x) * 3 + k] = t / n; } return o; };

/** Suurim piirkonna keskmine erinevus (0..255) parima väikese nihke juures, pärast üldise tooninihke eemaldamist.
 *  AI joonistab pildi uuesti veidi nihkes või toonis: see ei ole muudatus. */
export function maxRegionDiff(a0: Grid, b0: Grid): number {
  const a = blur(a0), b = blur(b0);
  const at = (dx: number, dy: number) => { // b nihutatud (dx,dy) võrra, ainult kattuv ala
    const off = [0, 0, 0]; let n = 0;
    for (let y = SH; y < GH - SH; y++) for (let x = SH; x < GW - SH; x++) { const c = (y * GW + x) * 3, d = ((y + dy) * GW + x + dx) * 3; for (let k = 0; k < 3; k++) off[k] += b[d + k] - a[c + k]; n++; }
    off.forEach((_, k) => off[k] /= n);
    const reg = new Float32Array(BX * BY), cnt = new Float32Array(BX * BY); let tot = 0;
    for (let y = SH; y < GH - SH; y++) for (let x = SH; x < GW - SH; x++) {
      const c = (y * GW + x) * 3, d = ((y + dy) * GW + x + dx) * 3, r = Math.floor(y / (GH / BY)) * BX + Math.floor(x / (GW / BX));
      let e = 0; for (let k = 0; k < 3; k++) e += Math.abs(b[d + k] - a[c + k] - off[k]); e /= 3; reg[r] += e; cnt[r]++; tot += e;
    }
    let worst = 0; for (let r = 0; r < BX * BY; r++) if (cnt[r]) worst = Math.max(worst, reg[r] / cnt[r]);
    return { tot, worst };
  };
  let best = { tot: Infinity, worst: Infinity };
  for (let dy = -SH; dy <= SH; dy++) for (let dx = -SH; dx <= SH; dx++) { const r = at(dx, dy); if (r.tot < best.tot) best = r; }
  return best.worst;
}

// shortcut: lävi sünteetiliste paaridega saunafotodel: sama (q50, nihe 1–2%, tooninihe, müra) ≤ 6,5; muudatus (ese 4%, lamp 1%,
// sein 30% tumedam) ≥ 13; väga õrn (1/48 pildist 20% tumedam) 6,8–15. Kohenda päris AI tulemuste järgi.
export const SAME_MAX = 8;
export const isSame = (a: Grid, b: Grid) => maxRegionDiff(a, b) < SAME_MAX;

/** JPEG/PNG baidid -> ruudustik; tundmatu vorming -> null (siis kontrolli ei tehta). */
export async function gridOf(bytes: Uint8Array): Promise<Grid | null> {
  try {
    if (bytes[0] === 0xff && bytes[1] === 0xd8) {
      const jpeg = (await import("npm:jpeg-js@0.4.4")).default;
      const d = jpeg.decode(bytes, { useTArray: true, maxMemoryUsageInMB: 1024 });
      return toGrid(d.data, d.width, d.height);
    }
    if (bytes[0] === 0x89 && bytes[1] === 0x50) {
      const UPNG = (await import("npm:upng-js@2.1.0")).default;
      const img = UPNG.decode(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
      return toGrid(new Uint8Array(UPNG.toRGBA8(img)[0]), img.width, img.height);
    }
  } catch (_) { /* vigane pilt: kontrolli ei tehta */ }
  return null;
}
