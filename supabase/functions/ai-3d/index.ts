// Fotod → 3D-mudel (sisselogitud firma), üks süsteem igale asjale: hoone, ese/toode, sõiduk.
// check:  Claude vaatab fotod üle ja annab allkirjastatud kontrollitõendi (30 min)
// start:  sama fotode komplekt + tõend -> Kie Nano Banana 2.1 puhastab -> MuAPI Tripo H3.1 alustab mudelit
// status: äpp küsib iga ~10 s; kui Tripo on valmis, kopeerime .glb meie 'models' kausta
// Krediidid võetakse alguses; iga vea korral (ja 25 min ajapiirangul) tagastatakse.
import { cors, json, fail, userCompany, spend, refund, kieImage, storeImage, uploadDataUrl, admin, body, rateLimit, isPhoto, refundStale, secret, tfetch, env } from "../_shared/util.ts";

const MUAPI = () => env("MUAPI_API_BASE", "https://api.muapi.ai/api/v1");

// Subjektid: sama tabel on äpis (index.html, P3D). Tripo teeb üksikobjekte, mitte tube, maastikku ega inimesi.
export const SUBJECTS = {
  building: {
    word: "house", min: 4, max: 4, slots: ["Esikülg", "Vasak külg", "Tagakülg", "Parem külg"],
    extra: "Keep cladding boards, every window and door, gutters, downpipes, chimney, roof vents and everything attached to the walls (satellite dish, heat pump, lamps, vents, small signs). Remove trees, branches, bushes, rocks, snow piles and plants in front of the walls. Windows and glass doors must look like closed glass with soft daylight reflection and light curtains behind, never showing the room inside. Keep any snow on the roof.",
  },
  object: {
    word: "object", min: 1, max: 4, slots: ["Eest", "Vasakult", "Tagant", "Paremalt"],
    extra: "Keep all handles, legs, seams, screws, buttons, labels and printed text exactly as they are. Remove the table, floor, hands or stand it rests on unless they are part of the object. Transparent or glass parts stay transparent-looking, never show what is behind them.",
  },
  vehicle: {
    word: "vehicle", min: 4, max: 4, slots: ["Eest", "Vasakult", "Tagant", "Paremalt"],
    extra: "Keep wheels, rims, lights, mirrors, badges, number plate area, trims and paint finish exactly as they are. Remove other cars, people and street objects. Windows look like tinted glass with soft reflection, never showing the interior.",
  },
} as const;
type Subject = keyof typeof SUBJECTS;
const isSubject = (s: unknown): s is Subject => typeof s === "string" && s in SUBJECTS;

// Testitud: ilma „Do NOT add, move or remove“ lauseta lisas AI ühe akna.
const BASE_PROMPT = "Clean this exact photo for 3D reconstruction of the {SUBJECT}. Keep the {SUBJECT} 100% identical and pixel-faithful: same shape, proportions, materials, textures, colours, and every detail in the same position and size. Do NOT add, move or remove any part, detail, opening, logo or attachment of the {SUBJECT}. Remove only what is not the {SUBJECT}: background clutter, people, animals and anything in front of it; fill hidden parts with the matching surface. Even soft daylight with no harsh shadows. Plain pure white background, the whole {SUBJECT} fully in frame, same camera angle, sharp fine detail.";
export const cleanPrompt = (s: Subject) => BASE_PROMPT.replaceAll("{SUBJECT}", SUBJECTS[s].word) + " " + SUBJECTS[s].extra;

// Fotokontrolli vead. Kerged vead lubavad „Jätka ikkagi“, ülejäänud blokeerivad.
const ISSUES = ["wrong_subject", "different_objects", "cut_off", "duplicate_side", "wrong_side", "backlit", "too_dark", "blurry", "occluded", "too_close", "too_far", "unsupported"];
const SOFT = new Set(["occluded", "too_far"]);
const SIDES = ["front", "left", "back", "right"];

async function muKey() {
  // õige nimi on MUAPI_API_KEY; esimene saladus lisati Supabase'i nimega "Muapi.ai "
  const safe = (n: string) => { try { return env(n); } catch { return ""; } };
  const k = safe("MUAPI_API_KEY") || safe("Muapi.ai ") || safe("Muapi.ai") || await secret("muapi_api_key", "MUAPI_API_KEY");
  if (!k) throw new Error("MUAPI_API_KEY puudub");
  return k;
}

async function startTripo(images: string[]): Promise<{ id: string; cost: number; model: string }> {
  const common = {
    pbr: true,
    texture_quality: env("TRIPO_TEXTURE", "detailed"), // 4K tekstuur; "standard" = 2K ja odavam
    face_limit: Number(env("TRIPO_FACES", "150000")), // hoiab faili telefonile sobivana
  };
  // 1 foto (ainult ese) -> image-to-3d; 2–4 -> multiview (järjekord: eest, vasakult, tagant, paremalt)
  const one = images.length === 1;
  const model = one ? "tripo3d-h31-image-to-3d" : "tripo3d-h31-multiview-to-3d";
  const r = await tfetch(`${MUAPI()}/${model}`, {
    method: "POST",
    headers: { "x-api-key": await muKey(), "Content-Type": "application/json" },
    body: JSON.stringify(one ? { image_url: images[0], ...common } : { images_list: images, ...common }),
  }, 30000);
  const j = await r.json().catch(() => ({}));
  if (!j?.request_id) throw new Error("MuAPI: " + JSON.stringify(j).slice(0, 300));
  return { id: String(j.request_id), cost: Number(j?.cost?.amount_usd) || 0.3, model };
}

// ---------- kontrollitõend: HMAC serveri saladusega, seotud firma, subjekti ja täpse fotokomplektiga ----------
const enc = new TextEncoder();
const b64u = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
async function photosHash(photos: string[]) {
  return b64u(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(photos.join("\n")))));
}
let hmacKey: CryptoKey | null = null;
async function key() {
  if (hmacKey) return hmacKey;
  // eraldi saladus kui olemas, muidu tuletatud service_role võtmest (brauser ei näe kumbagi)
  const raw = env("CHECK3D_SECRET") || "ai-3d-check:" + env("SUPABASE_SERVICE_ROLE_KEY");
  if (raw.length < 20) throw new Error("tõendi saladus puudub");
  const k = await crypto.subtle.digest("SHA-256", enc.encode(raw));
  hmacKey = await crypto.subtle.importKey("raw", k, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
  return hmacKey;
}
type Tok = { c: string; h: string; s: Subject; ok: boolean; soft: boolean; exp: number };
async function signTok(t: Tok) {
  const p = b64u(enc.encode(JSON.stringify(t)));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await key(), enc.encode(p)));
  return p + "." + b64u(sig);
}
async function readTok(s: unknown): Promise<Tok | null> {
  if (typeof s !== "string" || s.length > 2000) return null;
  const [p, sig] = s.split(".");
  if (!p || !sig) return null;
  try {
    if (!(await crypto.subtle.verify("HMAC", await key(), unb64u(sig), enc.encode(p)))) return null;
    const t = JSON.parse(new TextDecoder().decode(unb64u(p)));
    return t && typeof t === "object" ? t as Tok : null;
  } catch { return null; }
}

// ---------- AI fotokontroll (Claude vision, kõik fotod ühes päringus) ----------
const CHECK_SYSTEM = `You check photos before they are turned into a 3D model (one single object, photographed from up to 4 sides).
Supported subjects: "building" (house, sauna, shed, garden house, garage), "object" (furniture, product, grill, tent, lamp, statue), "vehicle" (car, trailer, boat, motorbike). Rooms/interiors, landscapes and people are "unsupported".
Check each photo and all photos together:
1. subject: what is in the photos; are all photos the SAME single thing (else "different_objects"); if it does not match the requested subject use "wrong_subject".
2. cut_off: the whole thing must be in frame (roof, corners, wheels not cut off).
3. sides: each photo should show the expected side (slot order: front, left, back, right). Two photos of the same side = "duplicate_side"; clearly not the expected side = "wrong_side". Buildings and vehicles need 4 different sides.
4. light and sharpness: "backlit" (against the sun or blown-out glare), "too_dark", "blurry" (out of focus or motion blur).
5. "occluded" only if more than ~30% of the thing is hidden (trees, cars, people in front). Small occlusion is fine, it gets cleaned.
6. "too_close" (only part in frame), "too_far" (thing is small), heavy tilt counts as "wrong_side".
Allowed issues: ${ISSUES.join(", ")}.
Answer ONLY with JSON, no other text:
{"subject":"building|object|vehicle|unsupported","ok":true|false,"photos":[{"slot":0,"side":"front|left|back|right|unknown","ok":true|false,"issues":[],"tip":"short Estonian tip how to retake, only if not ok"}],"summary":"1-2 short sentences in Estonian for the user"}
Tips and summary must be in plain Estonian, friendly, concrete (e.g. "Pildista tagakülge siis, kui päike on sinu selja taga.").`;

type Photo = { slot: number; side: string; ok: boolean; issues: string[]; tip?: string };
async function aiCheck(photos: string[], want: Subject | null) {
  const content: unknown[] = photos.map((u) => {
    const m = u.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/)!;
    return { type: "image", source: { type: "base64", media_type: m[1], data: m[2] } };
  });
  content.push({ type: "text", text: (want ? `Requested subject: ${want}. Slots: ${SUBJECTS[want].slots.slice(0, photos.length).map((_, i) => `${i}=${SIDES[i]}`).join(", ")}.` : `No subject chosen yet: detect it from the photo(s).`) + ` Number of photos: ${photos.length}.` });
  const r = await tfetch(env("ANTHROPIC_API_URL", "https://api.anthropic.com") + "/v1/messages", {
    method: "POST",
    headers: { "x-api-key": env("ANTHROPIC_API_KEY"), "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: env("CHECK3D_MODEL", "claude-haiku-5-5"), max_tokens: 900, system: CHECK_SYSTEM, messages: [{ role: "user", content }] }),
  }, 45000);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error("anthropic " + r.status + " " + JSON.stringify(j).slice(0, 200));
  const text = String((j.content || []).map((c: { text?: string }) => c.text || "").join(""));
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("kontroll: vastus pole JSON");
  const a = JSON.parse(m[0]);
  const inT = Number(j?.usage?.input_tokens) || 0, outT = Number(j?.usage?.output_tokens) || 0;
  return { a, inT, outT, model: String(j.model || "").slice(0, 60) };
}

// AI vastus puhtaks: ainult lubatud väärtused; ok arvutab server ise (AI „ok“ üksi ei loe)
function normalize(a: Record<string, unknown>, n: number, want: Subject | null) {
  const subject = isSubject(a.subject) ? a.subject : a.subject === "unsupported" ? "unsupported" : (want ?? "unsupported");
  const src = Array.isArray(a.photos) ? a.photos : [];
  const photos: Photo[] = [];
  for (let i = 0; i < n; i++) {
    const p = (src.find((x: { slot?: number }) => Number(x?.slot) === i) ?? src[i] ?? {}) as Record<string, unknown>;
    const issues = [...new Set((Array.isArray(p.issues) ? p.issues : []).map(String).filter((x) => ISSUES.includes(x)))];
    photos.push({ slot: i, side: SIDES.includes(String(p.side)) ? String(p.side) : "unknown", ok: issues.length === 0, issues, tip: issues.length && typeof p.tip === "string" ? p.tip.slice(0, 200) : undefined });
  }
  if (subject === "unsupported") photos.forEach((p) => { if (!p.issues.includes("unsupported")) { p.issues.push("unsupported"); p.ok = false; } });
  else if (want && subject !== want) photos.forEach((p) => { if (!p.issues.includes("wrong_subject")) { p.issues.push("wrong_subject"); p.ok = false; } });
  const all = photos.flatMap((p) => p.issues);
  return { subject, photos, ok: all.length === 0, soft: all.length > 0 && all.every((x) => SOFT.has(x)), summary: typeof a.summary === "string" ? a.summary.slice(0, 400) : "" };
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fail("POST only", 405);
  const me = await userCompany(req);
  if (!me) return fail("unauthorized", 401);
  let b: Record<string, unknown>;
  try { b = await body(req, 36_000_000); } catch { return fail("Pildid on liiga suured", 413); }
  const db = admin();

  // ---------- olek ----------
  if (b.action === "status") {
    await refundStale(me.companyId);
    const id = String(b.id || "");
    const { data: r } = await db.from("renders").select("id,status,stage,ext_id,output_url,error,input_urls,product_id")
      .eq("id", id).eq("company_id", me.companyId).eq("kind", "3d").maybeSingle();
    if (!r) return fail("not found", 404);
    if (r.status !== "pending" || r.stage !== "modelling" || !r.ext_id) return json(view(r));
    try {
      const pr = await tfetch(`${MUAPI()}/predictions/${encodeURIComponent(r.ext_id)}/result`, { headers: { "x-api-key": await muKey() } }, 15000);
      const p = await pr.json().catch(() => ({}));
      if (p?.status === "failed") throw new Error("Tripo: " + String(p?.error || "failed").slice(0, 200));
      if (p?.status !== "completed") return json(view(r));
      const glb = (p.outputs || []).find((u: string) => /\.glb(\?|$)/i.test(u));
      if (!glb) throw new Error("Tripo: .glb puudub");
      // ainult üks päring kopeerib faili (teised näevad 'storing')
      const { data: claim } = await db.from("renders").update({ stage: "storing" }).eq("id", id).eq("stage", "modelling").select("id");
      if (!claim?.length) return json({ ...view(r), stage: "storing" });
      const gr = await tfetch(glb, {}, 90000);
      const bytes = new Uint8Array(await gr.arrayBuffer());
      if (!gr.ok || bytes.length < 1000) throw new Error("mudeli allalaadimine ebaõnnestus");
      if (bytes.length > 52_000_000) throw new Error("mudel on liiga suur");
      if (bytes.length > 20_000_000) console.warn("ai-3d: suur mudel", bytes.length, "-> kaalu TRIPO_FACES langetamist");
      const path = `${me.companyId}/${id}.glb`;
      const { error } = await db.storage.from("models").upload(path, bytes, { contentType: "model/gltf-binary", upsert: true });
      if (error) throw new Error("storage: " + error.message);
      let url = db.storage.from("models").getPublicUrl(path).data.publicUrl;
      const host = env("PUBLIC_STORAGE_URL");
      if (host) url = url.replace(env("SUPABASE_URL"), host);
      await db.from("renders").update({ status: "done", stage: null, output_url: url }).eq("id", id);
      // „Tee tootest 3D-mudel“: mudel jääb toote juurde
      if (r.product_id) await db.from("products").update({ model_url: url }).eq("id", r.product_id).eq("company_id", me.companyId).then(() => {}, () => {});
      return json({ id, status: "done", url, size: bytes.length, cleaned: r.input_urls, product_id: r.product_id ?? null });
    } catch (e) {
      await refund(id);
      await db.from("renders").update({ status: "failed", stage: null, error: String((e as Error).message).slice(0, 500) }).eq("id", id);
      return json({ id, status: "failed", error: "3D-mudeli tegemine ebaõnnestus, krediidid tagastati." });
    }
  }

  const photos = Array.isArray(b.photos) ? b.photos.map(String) : [];
  if (!photos.length || photos.length > 4) return fail("Lisa 1–4 fotot");
  if (photos.some((u) => !isPhoto(u))) return fail("vigane pilt");

  // ---------- fotokontroll ----------
  if (b.action === "check") {
    const want = b.subject == null || b.subject === "" ? null : isSubject(b.subject) ? b.subject : undefined;
    if (want === undefined) return fail("tundmatu subjekt");
    if (want && photos.length > SUBJECTS[want].max) return fail(`Kuni ${SUBJECTS[want].max} fotot`);
    if (!(await rateLimit("3dchk:" + me.companyId, 40, 3600))) return fail("Liiga palju kontrolle lühikese ajaga. Proovi hiljem.", 429);
    let res;
    try {
      const { a, inT, outT, model } = await aiCheck(photos, want);
      res = normalize(a, photos.length, want);
      const cost = (inT * Number(env("ANTHROPIC_PRICE_IN", "0.10")) + outT * Number(env("ANTHROPIC_PRICE_OUT", "0.50"))) / 1e6;
      await db.from("ai_usage").insert({ company_id: me.companyId, kind: "3d-check", model, input_tokens: inT, output_tokens: outT, cost_usd: cost }).then(() => {}, () => {});
    } catch (e) {
      console.error("ai-3d check", (e as Error).message);
      return fail("Fotode kontroll ebaõnnestus, proovi uuesti.", 502);
    }
    const subject = want ?? (isSubject(res.subject) ? res.subject : null);
    // tõend ainult siis, kui subjekt on teada ja fotosid on piisavalt
    let token: string | null = null;
    if (subject && photos.length >= SUBJECTS[subject].min) {
      token = await signTok({ c: me.companyId, h: await photosHash(photos), s: subject, ok: res.ok, soft: res.soft, exp: Date.now() + 30 * 60_000 });
    }
    return json({ ...res, subject: res.subject, token, slots: subject ? SUBJECTS[subject].slots : null });
  }

  // ---------- alusta ----------
  if (!isSubject(b.subject)) return fail("Vali, mis fotodel on: hoone, ese või sõiduk");
  const subject = b.subject, S = SUBJECTS[subject];
  if (photos.length < S.min || photos.length > S.max) return fail(S.min === S.max ? `Vaja on ${S.min} fotot: ${S.slots.join(", ").toLowerCase()}` : `Lisa ${S.min}–${S.max} fotot`);
  // server kontrollib ise: sama firma, sama subjekt, täpselt samad fotod, korras (või lubatud „Jätka ikkagi“)
  const t = await readTok(b.check);
  const pass = !!t && t.c === me.companyId && t.s === subject && t.exp > Date.now() && t.h === await photosHash(photos) && (t.ok || (b.force === true && t.soft));
  if (!pass) return fail("Fotod pole kontrollitud või kontroll ei läinud läbi. Kontrolli fotod uuesti.", 409);
  await refundStale(me.companyId);
  if (!(await rateLimit("3d:" + me.companyId, 10, 3600))) return fail("Liiga palju 3D-mudeleid lühikese ajaga. Proovi hiljem.", 429);
  let objectId: string | null = null;
  if (typeof b.object_id === "string") {
    const { data: o } = await db.from("objects").select("id").eq("id", b.object_id).eq("company_id", me.companyId).maybeSingle();
    objectId = o?.id ?? null;
  }
  let productId: string | null = null;
  if (typeof b.product_id === "string") {
    const { data: p } = await db.from("products").select("id").eq("id", b.product_id).eq("company_id", me.companyId).maybeSingle();
    productId = p?.id ?? null;
  }
  const label = String(b.label || "Fotod → 3D-mudel").slice(0, 120);
  const prompt = cleanPrompt(subject);
  const id = crypto.randomUUID();
  let credits: number;
  try { credits = await spend(me.companyId, "3d", label, id); }
  catch (e) { const m = (e as Error).message; return fail(m, m === "insufficient_credits" ? 402 : 400); }
  await db.from("renders").insert({ id, company_id: me.companyId, object_id: objectId, kind: "3d", product_id: productId, tpl: b.tpl ? String(b.tpl).slice(0, 40) : null, prompt: `[${subject}] ${prompt}`, stage: "cleaning" });
  try {
    const ins = await Promise.all(photos.map((u, i) => uploadDataUrl(u, `${me.companyId}/in/${id}-${i}`)));
    // puhastused paralleelselt; tulemus meie kausta ILMA firma logota (logo ei tohi mudeli tekstuuri sattuda)
    const cleaned = await Promise.all(ins.map(async (u, i) => {
      const k = await kieImage(prompt, [u], "auto");
      return await storeImage(k, `${me.companyId}/3d/${id}-${i}.jpg`);
    }));
    const tr = await startTripo(cleaned);
    await db.from("renders").update({ stage: "modelling", ext_id: tr.id, input_urls: cleaned }).eq("id", id);
    // kulu admini ülevaatesse: Kie n × ~0,02 $ + Tripo
    await db.from("ai_usage").insert({ company_id: me.companyId, kind: "3d", model: "nano-banana-2-1+" + tr.model, cost_usd: 0.02 * cleaned.length + tr.cost }).then(() => {}, () => {});
    return json({ id, status: "pending", stage: "modelling", cleaned, credits, subject, sides: S.slots });
  } catch (e) {
    await refund(id);
    await db.from("renders").update({ status: "failed", stage: null, error: String((e as Error).message).slice(0, 500) }).eq("id", id);
    return fail("Fotode töötlemine ebaõnnestus, krediidid tagastati.", 502);
  }
}

// deno-lint-ignore no-explicit-any
function view(r: any) {
  return { id: r.id, status: r.status, stage: r.stage, url: r.output_url, cleaned: r.input_urls,
    error: r.status === "failed" ? "3D-mudeli tegemine ebaõnnestus, krediidid tagastati." : undefined };
}

Deno.serve(handler);
