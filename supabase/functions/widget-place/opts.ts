// Vidina "toode kliendi juures" seaded: üks koht, kus iga väärtus kontrollitakse ja piiratakse.
export const STYLES: Record<string, string> = {
  real: "Photorealistic, natural light as in the photo.",
  sunny: "Photorealistic, bright sunny summer day.",
  evening: "Photorealistic, warm evening light, soft glow.",
  overcast: "Photorealistic, soft overcast daylight.",
};
export function opts(o: Record<string, unknown> | null) {
  const p = o || {};
  const n = (v: unknown, lo: number, hi: number, d: number) => { const x = Math.round(Number(v)); return Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : d; };
  return {
    mode: p.mode === "review" ? "review" : "instant",
    max_products: n(p.max_products, 1, 3, 2),
    lead_first: p.lead_first !== false,
    style: STYLES[String(p.style)] ? String(p.style) : "real",
    customer_style: p.customer_style === true,
    quality: p.quality === "hd" ? "hd" : "std",
    per_customer: n(p.per_customer, 1, 5, 3),
    month_cap: n(p.month_cap, 0, 100000, 0), // krediitides, 0 = piiranguta
    allow_note: p.allow_note !== false,
  };
}

// Vidina teenused (widgets.features): komaga loend; vana 'both' = maja + toode pildile.
export const FEATS = ["house", "house3d", "place", "idea", "model3d"] as const;
export function feats(f: unknown): Set<string> {
  const s = String(f || "house");
  if (s === "both") return new Set(["house", "place"]);
  return new Set(s.split(",").filter((x) => (FEATS as readonly string[]).includes(x)));
}
/** Vidina kuu eelarve kasutus (krediidid, mis on läinud vidina AI-töödele sel kuul). */
export function monthStart() { const ms = new Date(); ms.setUTCDate(1); ms.setUTCHours(0, 0, 0, 0); return ms.toISOString(); }
