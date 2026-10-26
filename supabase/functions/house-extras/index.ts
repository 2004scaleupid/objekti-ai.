// Lisad maja külge fotodelt: Claude vaatab kliendi fotosid ja ütleb, mis LOD2 mudelist puudu on
// (rõdu, terrass, juurdeehitus, aed) ja millise seina juures. Äpp näitab nimekirja, klient kinnitab.
// Ei võta krediite (nagu fotokontroll); kulu logitakse ai_usage tabelisse (kind 'extras').
import { cors, json, fail, userCompany, admin, body, rateLimit, isPhoto, tfetch, env } from "../_shared/util.ts";

export const MAX_PHOTOS = 6;
const TYPES = ["rodu", "terr", "juur", "aed"] as const;
const SIDES = ["facing", "left", "right"] as const;
const FACES = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
type Wall = { id: string; len: number; face: string; gable: boolean };
type Item = { t: typeof TYPES[number]; photo: number; side: typeof SIDES[number]; from: number; w: number; d: number; z: number; h: number; note: string };

// $/1M tokenit (claude-api, 06.10.2026): Sonnet 5.5 2/10, Haiku 5.5 0,10/0,50
const PRICE: Record<string, [number, number]> = { sonnet: [2, 10], haiku: [0.1, 0.5], opus: [4, 20] };
const model = () => env("EXTRAS_MODEL", "claude-sonnet-5-5");

export const SYSTEM = `You look at photos of ONE detached house and find attachments that a footprint-only 3D model of the house is missing.
The 3D model already has the main house volume (walls and roof). It does NOT have:
- "rodu": balcony (a platform on an upper floor with a railing, also a balcony on posts)
- "terr": terrace or wooden deck on the ground (also a paved patio clearly attached to the house)
- "juur": extension, annex, roofed porch, carport or veranda attached to the house with its own walls or roof
- "aed": fence around the plot (picket fence, wooden fence, metal fence, hedge-like fence panels). Not a hedge of plants.

You get the list of the house's walls from the map (id, length in metres, compass direction the wall faces outwards, gable = triangular end wall under the roof slope) and the eave and ridge heights. Use them as a size scale.

1. For each photo decide which wall from the list it mainly shows (the wall the camera faces). The photo itself does not show the compass, so use:
   - shape: gable end (triangle on top) vs long side under the eave; the wall's length compared to the others;
   - sun: the photos are from Estonia. A wall in bright direct sunlight faces roughly south-east, south or south-west (morning east, evening west); a wall in full shade on a sunny day faces roughly north. Shadow directions on the ground help too;
   - consistency: different photos usually show different walls; a photo taken across a corner shows two walls, pick the one it shows more of.
   Give "conf" 0..1 for how sure you are of the wall. If you cannot tell, give your best guess with a low conf.
2. List every attachment you can clearly see. List each real thing ONCE even if several photos show it (use the photo where it is seen best).
   For each: "photo" = index of that photo; "side" = where it is relative to that photo's wall: "facing" (on the wall the camera faces), "left" or "right" (on the neighbouring wall around the left or right corner as seen in the photo).
   "from" = position of the attachment's centre along its wall, 0 = left end, 1 = right end, as seen standing outside facing that wall.
   "w" = width along the wall in metres, "d" = depth out from the wall in metres. Estimate from the wall length and the eave height.
   "z" (balcony only) = height of the balcony floor above ground in metres; "h" = railing height for a balcony, deck height above ground for a terrace, wall height for an extension. For a fence give w, d, h as 0 except h = fence height.
   "note" = very short Estonian description, e.g. "puitrõdu klaaspiirdega", "puitterrass", "valge lippaed".
3. Do not guess things you cannot see (hidden sides). Do not list the main roof, chimney, windows, doors, gutters, stairs alone, plants, cars, garden furniture or neighbours' buildings.
"summary" = 1 short Estonian sentence for the customer about what you found.`;

const num = { type: "number" };
export const SCHEMA = {
  type: "object", additionalProperties: false, required: ["photos", "items", "summary"],
  properties: {
    photos: { type: "array", items: { type: "object", additionalProperties: false, required: ["i", "wall", "conf"], properties: { i: { type: "integer" }, wall: { type: "string" }, conf: num } } },
    items: {
      type: "array", items: {
        type: "object", additionalProperties: false, required: ["t", "photo", "side", "from", "w", "d", "z", "h", "note"],
        properties: { t: { type: "string", enum: [...TYPES] }, photo: { type: "integer" }, side: { type: "string", enum: [...SIDES] }, from: num, w: num, d: num, z: num, h: num, note: { type: "string" } },
      },
    },
    summary: { type: "string" },
  },
};

const clamp = (x: unknown, a: number, b: number, d: number) => { const n = Number(x); return Number.isFinite(n) ? Math.max(a, Math.min(b, n)) : d; };
const r1 = (x: number) => Math.round(x * 10) / 10;

export function readWalls(v: unknown): Wall[] | null {
  if (!Array.isArray(v) || v.length < 3 || v.length > 24) return null;
  const out: Wall[] = [];
  for (const w of v) {
    const o = w as Record<string, unknown>;
    if (typeof o?.id !== "string" || !/^[A-X]$/.test(o.id) || !FACES.includes(String(o.face))) return null;
    const len = Number(o.len);
    if (!(len > 0 && len < 300)) return null;
    out.push({ id: o.id, len: r1(len), face: String(o.face), gable: o.gable === true });
  }
  return new Set(out.map((w) => w.id)).size === out.length ? out : null;
}

/** AI vastus -> puhas kuju. Vigased read visatakse välja, numbrid piiratakse mõistlikesse vahemikesse. */
export function normalize(a: Record<string, unknown>, n: number, walls: Wall[]) {
  const ids = new Set(walls.map((w) => w.id));
  const photos = [...Array(n).keys()].map((i) => {
    const p = (Array.isArray(a.photos) ? a.photos : []).find((x: Record<string, unknown>) => Number(x?.i) === i) as Record<string, unknown> | undefined;
    const wall = p && typeof p.wall === "string" && ids.has(p.wall) ? p.wall : null;
    return { i, wall, conf: wall ? r1(clamp(p!.conf, 0, 1, 0.3) * 10) / 10 : 0 };
  });
  const items = (Array.isArray(a.items) ? a.items : []).flatMap((x: Record<string, unknown>): Item[] => {
    const t = TYPES.find((k) => k === x?.t), photo = Number(x?.photo);
    if (!t || !Number.isInteger(photo) || photo < 0 || photo >= n) return [];
    const side = SIDES.find((k) => k === x.side) ?? "facing";
    const note = typeof x.note === "string" ? x.note.replace(/[<>]/g, "").slice(0, 80) : "";
    if (t === "aed") return [{ t, photo, side, from: 0.5, w: 0, d: 0, z: 0, h: r1(clamp(x.h, 0.3, 3, 1.2)), note }];
    return [{
      t, photo, side, from: Math.round(clamp(x.from, 0, 1, 0.5) * 100) / 100,
      w: r1(clamp(x.w, 0.5, 30, t === "rodu" ? 3 : 4)), d: r1(clamp(x.d, 0.5, 20, t === "rodu" ? 1.5 : 3)),
      z: t === "rodu" ? r1(clamp(x.z, 0.5, 15, 2.8)) : 0,
      h: r1(clamp(x.h, 0.1, 12, t === "rodu" ? 1 : t === "terr" ? 0.35 : 3)), note,
    }];
  }).slice(0, 10);
  // aed on üks (kogu krundipiir); mitme foto aiad -> üks rida
  const fi = items.findIndex((x) => x.t === "aed");
  const dedup = items.filter((x, k) => x.t !== "aed" || k === fi);
  return { photos, items: dedup, summary: typeof a.summary === "string" ? a.summary.replace(/[<>]/g, "").slice(0, 300) : "" };
}

async function ask(photos: string[], walls: Wall[], eave: number, ridge: number) {
  const content: unknown[] = [];
  photos.forEach((u, i) => {
    const m = u.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/)!;
    content.push({ type: "text", text: `Photo ${i}` });
    content.push({ type: "image", source: { type: "base64", media_type: m[1], data: m[2] } });
  });
  content.push({ type: "text", text: `Walls (in order around the house): ${walls.map((w) => `${w.id}: ${w.len} m, faces ${w.face}${w.gable ? ", gable" : ""}`).join("; ")}.\nEave height ${eave} m, ridge height ${ridge} m. Number of photos: ${photos.length}.` });
  const r = await tfetch(env("ANTHROPIC_API_URL", "https://api.anthropic.com") + "/v1/messages", {
    method: "POST",
    headers: { "x-api-key": env("ANTHROPIC_API_KEY"), "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: model(), max_tokens: Number(env("EXTRAS_MAX_TOKENS", "16000")), system: SYSTEM,
      output_config: { effort: env("EXTRAS_EFFORT", "medium"), format: { type: "json_schema", schema: SCHEMA } },
      messages: [{ role: "user", content }],
    }),
  }, 120000);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error("anthropic " + r.status + " " + JSON.stringify(j?.error ?? {}).slice(0, 200));
  if (j.stop_reason === "refusal" || j.stop_reason === "max_tokens") throw new Error("anthropic stop=" + j.stop_reason);
  const text = String((j.content || []).filter((c: { type?: string }) => c.type === "text").map((c: { text?: string }) => c.text || "").join(""));
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error(`vastus pole JSON (stop=${j.stop_reason})`);
  const inT = Number(j?.usage?.input_tokens) || 0, outT = Number(j?.usage?.output_tokens) || 0;
  return { a: JSON.parse(m[0]), inT, outT, model: String(j.model || model()).slice(0, 60) };
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fail("POST only", 405);
  let b: Record<string, unknown>;
  try { b = await body(req, 16_000_000); } catch { return fail("Pildid on liiga suured", 413); }
  const me = await userCompany(req);
  if (!me) return fail("unauthorized", 401);
  const photos = Array.isArray(b.photos) ? b.photos.map(String) : [];
  if (!photos.length || photos.length > MAX_PHOTOS) return fail(`Lisa 1–${MAX_PHOTOS} fotot`);
  if (photos.some((u) => !isPhoto(u))) return fail("vigane pilt");
  const walls = readWalls(b.walls);
  if (!walls) return fail("vigased seinad");
  const eave = r1(clamp(b.eave, 1, 60, 4)), ridge = r1(clamp(b.ridge, eave, 80, eave + 3));
  if (!(await rateLimit("extras:" + me.companyId, 20, 3600))) return fail("Liiga palju päringuid lühikese ajaga. Proovi hiljem.", 429);
  try {
    let r;
    try { r = await ask(photos, walls, eave, ridge); }
    catch (e1) { console.error("house-extras, proovin uuesti:", (e1 as Error).message); r = await ask(photos, walls, eave, ridge); }
    const p = PRICE[Object.keys(PRICE).find((k) => r.model.includes(k)) || "sonnet"];
    const cost = (r.inT * p[0] + r.outT * p[1]) / 1e6;
    await admin().from("ai_usage").insert({ company_id: me.companyId, kind: "extras", model: r.model, input_tokens: r.inT, output_tokens: r.outT, cost_usd: cost }).then(() => {}, () => {});
    return json(normalize(r.a, photos.length, walls));
  } catch (e) {
    console.error("house-extras", (e as Error).message);
    return fail("Fotode vaatamine ebaõnnestus, proovi uuesti.", 502);
  }
}

if (import.meta.main) Deno.serve(handler);
