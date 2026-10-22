// Stuudio foto stseen kontekstipõhiste soovituste jaoks: { hash, image } -> { scene, room_type, features }.
// Üks väike Claude Haiku pildikutse (~512 px), kasutajale tasuta (krediite ei võeta), vahemälu pildi räsi järgi (photo_scenes), kulu ai_usage-sse.
import { cors, json, fail, admin, body, userCompany, rateLimit, env, tfetch } from "../_shared/util.ts";

export const SCENES = ["exterior_house", "facade_closeup", "roof", "garden_yard", "interior_room", "product_object", "vehicle", "other"] as const;
export const ROOMS = ["bedroom", "living", "kitchen", "bathroom", "sauna", "office", "kids", "hall"] as const;
const SYSTEM = `You classify one photo for a home-design app. Answer ONLY with JSON:
{"scene":"${SCENES.join("|")}","room_type":"${ROOMS.join("|")}|none","features":["..."]}
scene: exterior_house = whole house or large part from outside (also aerial); facade_closeup = close-up of a wall, windows or door; roof = mainly the roof;
garden_yard = garden, lawn, yard, terrace without the house as main subject; interior_room = any room inside (set room_type); product_object = single item or furniture on its own;
vehicle = car, van, boat, trailer; other = anything else.
room_type only for interior_room (living = living room, kids = children's room, hall = hallway/entrance), else "none".
features: up to 6 clearly visible things the user might change, as short Estonian nouns in nominative singular, lowercase (e.g. "diivan", "voodi", "köögikapid", "kamin", "lavad", "keris", "aknad", "uks", "terrass", "muru", "hekk", "aed", "piirdeaed", "katus", "fassaad", "auto").`;

const SCHEMA = { type: "object", additionalProperties: false, required: ["scene", "room_type", "features"],
  properties: { scene: { type: "string", enum: [...SCENES] }, room_type: { type: "string", enum: [...ROOMS, "none"] }, features: { type: "array", items: { type: "string" } } } };

export function sanitize(a: Record<string, unknown>) {
  const scene = (SCENES as readonly string[]).includes(String(a.scene)) ? String(a.scene) : "other";
  const room = scene === "interior_room" && (ROOMS as readonly string[]).includes(String(a.room_type)) ? String(a.room_type) : null;
  const features = [...new Set((Array.isArray(a.features) ? a.features : []).map((x) => String(x).toLowerCase().trim())
    .filter((x) => /^[a-zäöüõšž -]{2,24}$/.test(x)))].slice(0, 6);
  return { scene, room_type: room, features };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fail("POST only", 405);
  const me = await userCompany(req);
  if (!me) return fail("unauthorized", 401);
  const b = await body(req, 400_000).catch(() => ({} as Record<string, unknown>));
  const hash = String(b.hash || "");
  if (!/^[a-f0-9]{64}$/.test(hash)) return fail("vigane räsi");
  const db = admin();
  const { data: hit } = await db.from("photo_scenes").select("scene,room_type,features").eq("hash", hash).maybeSingle();
  if (hit) return json({ ...hit, cached: true });
  const m = String(b.image || "").match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!m || m[2].length > 300_000) return fail("vigane pilt");
  if (!(await rateLimit("scene:" + me.companyId, 120, 3600))) return fail("Liiga palju päringuid, proovi hiljem.", 429);
  try {
    const r = await tfetch(env("ANTHROPIC_API_URL", "https://api.anthropic.com") + "/v1/messages", {
      method: "POST",
      headers: { "x-api-key": env("ANTHROPIC_API_KEY"), "anthropic-version": "2023-06-01", "content-type": "application/json" },
      // struktureeritud väljund (skeem) + madal pingutus: Haiku 5.5 mõtleb vaikimisi ja mõtlemine sööb max_tokens-ist (200-ga jäi JSON pooleks)
      body: JSON.stringify({ model: env("SCENE_MODEL", "claude-haiku-5-5"), max_tokens: 1024, system: SYSTEM,
        output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
        messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: m[1], data: m[2] } }, { type: "text", text: "Classify this photo." }] }] }),
    }, 30000);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error("anthropic " + r.status + " " + JSON.stringify(j).slice(0, 200));
    const text = String((j.content || []).filter((c: { type?: string }) => c.type === "text").map((c: { text?: string }) => c.text || "").join(""));
    // pooliku JSON-i korral võetakse vähemalt stseen ja toa tüüp, aga seda vahemällu ei panda
    let a: Record<string, unknown>, whole = true;
    try { a = JSON.parse((text.match(/\{[\s\S]*\}/) || [""])[0]); }
    catch { whole = false; a = { scene: (text.match(/"scene"\s*:\s*"(\w+)"/) || [])[1], room_type: (text.match(/"room_type"\s*:\s*"(\w+)"/) || [])[1] }; }
    const out = sanitize(a);
    const inT = Number(j?.usage?.input_tokens) || 0, outT = Number(j?.usage?.output_tokens) || 0;
    const cost = (inT * Number(env("ANTHROPIC_PRICE_IN", "0.10")) + outT * Number(env("ANTHROPIC_PRICE_OUT", "0.50"))) / 1e6;
    await Promise.all([
      whole ? db.from("photo_scenes").upsert({ hash, ...out }).then(() => {}, () => {}) : Promise.resolve(),
      db.from("ai_usage").insert({ company_id: me.companyId, kind: "scene", model: String(j.model || "").slice(0, 60), input_tokens: inT, output_tokens: outT, cost_usd: cost }).then(() => {}, () => {}),
    ]);
    if (Math.random() < 0.01) await db.from("photo_scenes").delete().lt("created_at", new Date(Date.now() - 90 * 864e5).toISOString()).then(() => {}, () => {});
    return json({ ...out, cached: false });
  } catch (e) {
    console.error("photo-scene", (e as Error).message);
    return fail("Pildi tuvastus ebaõnnestus", 502);
  }
});
