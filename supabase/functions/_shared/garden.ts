// Aed ja ümbrus (krundi mudel): Maa-ameti avaandmed maja ümber (katastriüksused, ETAK teed, piirded, maakatte kõrgusmudel puude jaoks),
// salvestatakse aadressi (EHR) kaupa failihoidlasse ja kasutatakse uuesti (avaandmed, kõigile samad).
import { admin, env, tfetch } from "./util.ts";

export const GARDEN_R = 64; // maja keskpunktist ±64 m
export const GARDEN_V = 5; // 5: (ortofotot ei kasutata: maapind ja katused puhtad värvid); 3: krundi mudel vektorandmetest (teed aukudega); 4: krundi piiri muutmise kuupäev
const MAX_AGE = 30 * 864e5;
const BUCKET = "models";
const SRC = "Kataster, teed, piirded, maakatte kõrgusmudel, hooned: Maa- ja Ruumiamet 2026";

export type Timing = Record<string, number>;
const pub = (path: string) => {
  let u = admin().storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  const host = env("PUBLIC_STORAGE_URL");
  if (host) u = u.replace(env("SUPABASE_URL"), host);
  return u;
};

/** LOD2 keskpunkt (EPSG:3301): avalik kaust lod2/v1/NNN.json.gz (EHR 3 viimast numbrit, gzip), sama mis äpis */
export const LOD2_VER = "v1";
async function centre(ehr: string): Promise<[number, number] | null> {
  const base = env("LOD2_BASE", `${env("SUPABASE_URL")}/storage/v1/object/public/lod2/${LOD2_VER}/`).replace(/\/?$/, "/");
  const r = await tfetch(`${base}${ehr.slice(-3)}.json.gz`, {}, 15000);
  if (!r.ok || !r.body) return null;
  const txt = await new Response(r.body.pipeThrough(new DecompressionStream("gzip"))).text().catch(() => "");
  let d: Record<string, { c?: number[] }> = {};
  try { d = JSON.parse(txt); } catch { /* vigane kild */ }
  const c = d?.[ehr]?.c;
  return Array.isArray(c) && c.length === 2 && c.every(Number.isFinite) ? [c[0], c[1]] : null;
}

const wms = (svc: string, layer: string, [x, y]: [number, number], px: number, fmt: string) =>
  `https://kaart.maaamet.ee/wms/${svc}?service=WMS&version=1.3.0&request=GetMap&layers=${layer}&styles=&crs=EPSG:3301` +
  // WMS 1.3.0 + EPSG:3301: telgede järjekord põhi, ida
  `&bbox=${y - GARDEN_R},${x - GARDEN_R},${y + GARDEN_R},${x + GARDEN_R}&width=${px}&height=${px}&format=${fmt}` + (fmt === "image/png" ? "&transparent=true" : "");

async function bytes(url: string, kind: RegExp): Promise<Uint8Array> {
  const r = await tfetch(url, {}, 30000);
  const ct = r.headers.get("content-type") || "";
  const b = new Uint8Array(await r.arrayBuffer());
  if (!r.ok || !kind.test(ct) || b.length < 100) throw new Error(`allikas ${r.status} ${ct}`);
  return b;
}

type Parcel = { t: string; a: string; p: number; d: string; g: number[][] };
async function parcels([x, y]: [number, number]): Promise<Parcel[]> {
  const R = GARDEN_R + 10;
  const u = "https://gsavalik.envir.ee/geoserver/kataster/ows?service=WFS&version=2.0.0&request=GetFeature&typeNames=kataster:ky_kehtiv" +
    `&outputFormat=application/json&srsName=EPSG:3301&bbox=${x - R},${y - R},${x + R},${y + R},EPSG:3301&count=200`;
  const r = await tfetch(u, {}, 30000);
  if (!r.ok) throw new Error("kataster " + r.status);
  const j = await r.json();
  const out: Parcel[] = [];
  for (const f of j.features || []) {
    const g = f.geometry, P = f.properties || {};
    const polys = g?.type === "Polygon" ? [g.coordinates] : g?.type === "MultiPolygon" ? g.coordinates : [];
    for (const poly of polys) {
      const ring = poly[0] as number[][];
      if (!ring?.length) continue;
      out.push({ t: String(P.tunnus || ""), a: String(P.l_aadress || ""), p: Number(P.pindala) || 0, d: String(P.geom_muudet || "").slice(0, 10),
        g: [ring.flatMap(([px, py]) => [+(px - x).toFixed(2), +(py - y).toFixed(2)])] });
    }
  }
  return out;
}

type Road = { w: number; n: string; g: number[] };
/** ETAK teed: liiklusalad (polügoonid) + teede teljed laiusega (joonistatakse laiuse järgi) */
async function roads([x, y]: [number, number]): Promise<{ a: number[][][]; l: Road[] }> {
  const R = GARDEN_R + 16, base = "https://gsavalik.envir.ee/geoserver/etak/ows?service=WFS&version=2.0.0&request=GetFeature&outputFormat=application/json&srsName=EPSG:3301&count=300";
  // WFS 2.0 + urn: telgede järjekord põhi, ida
  const bb = `&bbox=${y - R},${x - R},${y + R},${x + R},urn:ogc:def:crs:EPSG::3301`;
  const get = (t: string) => tfetch(`${base}&typeNames=etak:${t}${bb}`, {}, 30000).then((r) => r.ok ? r.json() : { features: [] }).catch(() => ({ features: [] }));
  const [A, J] = await Promise.all([get("e_501_tee_a"), get("e_501_tee_j")]);
  const rel = (c: number[][]) => c.flatMap(([px, py]) => [+(px - x).toFixed(2), +(py - y).toFixed(2)]);
  // liiklusalad on suured koridorid, kus kvartalid on aukudena -> kõik rõngad (täide even-odd)
  const a: number[][][] = [];
  for (const f of A.features || []) {
    const g = f.geometry, polys = g?.type === "Polygon" ? [g.coordinates] : g?.type === "MultiPolygon" ? g.coordinates : [];
    for (const p of polys) if (p[0]?.length) a.push(p.map((r: number[][]) => rel(r)));
  }
  const l: Road[] = [];
  for (const f of J.features || []) {
    const g = f.geometry, lines = g?.type === "LineString" ? [g.coordinates] : g?.type === "MultiLineString" ? g.coordinates : [];
    for (const c of lines) if (c?.length > 1) l.push({ w: Math.max(2, Math.min(20, Number(f.properties?.laius) || 4)), n: String(f.properties?.nimetus || ""), g: rel(c) });
  }
  return { a, l };
}

/** Aia andmed EHR järgi: vahemälust või Maa-ametist (paralleelselt). Tagastab meta.json avaliku aadressi. */
export async function buildGarden(ehr: string, T: Timing = {}, force = false): Promise<{ url: string; cached: boolean } | null> {
  if (!/^\d{5,12}$/.test(ehr)) return null;
  const db = admin(), dir = `aed/${ehr}/`;
  let t = performance.now();
  const lap = (k: string) => { const n = performance.now(); T[k] = Math.round(n - t); t = n; };
  if (!force) {
    const r = await tfetch(pub(dir + "meta.json") + "?v=" + Date.now(), {}, 8000).catch(() => null);
    const m = r?.ok ? await r.json().catch(() => null) : null;
    lap("cache");
    if (m?.v === GARDEN_V && Date.now() - Date.parse(m.t) < MAX_AGE) return { url: pub(dir + "meta.json"), cached: true };
  }
  const c = await centre(ehr);
  lap("lod2");
  if (!c) return null;
  const [ndsm, fences, ky, rd] = await Promise.all([
    bytes(wms("fotokaart", "nDSM", c, 768, "image/png"), /png/),
    bytes(wms("kaart", "etak_piirded", c, 1536, "image/png"), /png/),
    parcels(c).catch(() => [] as Parcel[]),
    roads(c).catch(() => ({ a: [], l: [] })),
  ]);
  lap("maaamet");
  const up = (name: string, b: Uint8Array, ct: string) =>
    db.storage.from(BUCKET).upload(dir + name, b, { contentType: ct, upsert: true, cacheControl: "2592000" }).then(({ error }) => { if (error) throw new Error("storage: " + error.message); });
  await Promise.all([up("ndsm.png", ndsm, "image/png"), up("fences.png", fences, "image/png")]);
  const meta = { v: GARDEN_V, ehr, c, r: GARDEN_R, t: new Date().toISOString(), src: SRC,
    files: { ndsm: pub(dir + "ndsm.png"), fences: pub(dir + "fences.png") }, parcels: ky, roads: rd };
  // meta viimasena: kui see on olemas, on ka pildid olemas
  await db.storage.from(BUCKET).upload(dir + "meta.json", new TextEncoder().encode(JSON.stringify(meta)), { contentType: "application/json", upsert: true, cacheControl: "300" })
    .then(({ error }) => { if (error) throw new Error("storage: " + error.message); });
  lap("store");
  return { url: pub(dir + "meta.json"), cached: false };
}
