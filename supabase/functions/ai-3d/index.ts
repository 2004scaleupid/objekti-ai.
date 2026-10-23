// Fotod → 3D-mudel (sisselogitud firma), üks süsteem igale asjale: hoone, ese/toode, sõiduk.
// check:  Claude vaatab fotod üle ja annab allkirjastatud kontrollitõendi (30 min)
// start:  sama fotode komplekt + tõend -> Kie Nano Banana 2.1 puhastab -> MuAPI Tripo H3.1 alustab mudelit
// status: äpp küsib iga ~10 s; kui Tripo on valmis, kopeerime .glb meie 'models' kausta
// Krediidid võetakse alguses; iga vea korral (ja 25 min ajapiirangul) tagastatakse.
import { buildGarden } from "../_shared/garden.ts";
import { cors, json, fail, failText, userCompany, spend, refund, kieImage, storeImage, uploadDataUrl, admin, body, rateLimit, isPhoto, refundStale, secret, tfetch, env } from "../_shared/util.ts";

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
const ISSUES = ["wrong_subject", "different_objects", "cut_off", "duplicate_side", "wrong_side", "backlit", "too_dark", "blurry", "occluded", "too_close", "too_far", "unsupported", "aerial", "interior"];
// Ainult need blokeerivad: fotodest ei saa üldse üht 3D-mudelit teha. Kõik muu on hoiatus ja kasutaja võib jätkata.
const SOFT = new Set(["cut_off", "wrong_side", "backlit", "too_dark", "blurry", "occluded", "too_close", "too_far"]);
const SIDES = ["front", "left", "back", "right"];

async function muKey() {
  // õige nimi on MUAPI_API_KEY; esimene saladus lisati Supabase'i nimega "Muapi.ai "
  const safe = (n: string) => { try { return env(n); } catch { return ""; } };
  const k = safe("MUAPI_API_KEY") || safe("Muapi.ai ") || safe("Muapi.ai") || await secret("muapi_api_key", "MUAPI_API_KEY");
  if (!k) throw new Error("MUAPI_API_KEY puudub");
  return k;
}

/** Sama Nano Banana 2.1 puhastus MuAPI kaudu (varuvariant, kui Kie-l pole raha või see ei vasta). */
async function muClean(prompt: string, url: string): Promise<string> {
  const key = await muKey();
  // nano-banana-edit: testitud 21.10 (~20 s, 0,03 $). MuAPI nano-banana-2-1-edit jäi samal päeval ajapiirangusse.
  const model = env("MUAPI_CLEAN_MODEL", "nano-banana-edit");
  const r = await tfetch(`${MUAPI()}/${model}`, {
    method: "POST", headers: { "x-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, images_list: [url] }),
  }, 30000);
  const j = await r.json().catch(() => ({}));
  if (!j?.request_id) throw new Error("MuAPI puhastus: " + JSON.stringify(j).slice(0, 200));
  const t0 = Date.now();
  while (Date.now() - t0 < 110_000) {
    await new Promise((res) => setTimeout(res, 3000));
    const pr = await tfetch(`${MUAPI()}/predictions/${encodeURIComponent(j.request_id)}/result`, { headers: { "x-api-key": key } }, 15000);
    const raw = await pr.json().catch(() => ({}));
    const p = raw?.detail && typeof raw.detail === "object" ? raw.detail : raw; // vea korral tuleb vastus "detail" sees
    if (p?.status === "failed") throw new Error("MuAPI puhastus: " + String(p?.error || "failed").slice(0, 200));
    if (p?.status === "completed" && p.outputs?.[0]) return String(p.outputs[0]);
  }
  throw new Error("MuAPI puhastus: ajapiirang");
}

/** Puhastus: CLEAN_PROVIDER=kie (vaikimisi) proovib Kie't ja vea korral MuAPI-t; =muapi kasutab kohe MuAPI-t. */
async function cleanOne(prompt: string, url: string): Promise<{ url: string; via: string }> {
  if (env("CLEAN_PROVIDER", "kie") !== "muapi") {
    try { return { url: await kieImage(prompt, [url], "auto"), via: "kie" }; }
    catch (e) { console.warn("ai-3d: Kie puhastus ebaõnnestus, kasutan MuAPI-t:", (e as Error).message.slice(0, 160)); }
  }
  return { url: await muClean(prompt, url), via: "muapi" };
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
// one = ühe pildi režiim (image-to-3d mis tahes subjektile); tõend kehtib ainult samas režiimis
type Tok = { c: string; h: string; s: Subject; ok: boolean; soft: boolean; exp: number; one?: boolean };
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
2. "cut_off" ONLY if a big part is missing from the frame (more than ~15% of the thing, e.g. a whole corner, half the roof, a wheel). A chimney tip, antenna, gutter or roof edge touching the image border is FINE - do not flag it.
3. sides: each photo should show the expected side (slot order: front, left, back, right). Two photos of the same side = "duplicate_side"; clearly not the expected side = "wrong_side". Buildings and vehicles need 4 different sides.
4. light and sharpness: "backlit" (against the sun or blown-out glare), "too_dark", "blurry" (out of focus or motion blur).
5. "occluded" only if more than ~30% of the thing is hidden (trees, cars, people in front). Small occlusion is fine, it gets cleaned.
6. "too_close" (clearly only part of the thing in frame), "too_far" (thing is tiny in the photo), heavy tilt counts as "wrong_side".
7. "aerial" (buildings only): the photo is clearly taken from the air - drone, plane, satellite or oblique aerial photo looking down at the roof and yard. Ground-level photos (also from a window, balcony or slope) are NOT aerial.
8. "interior" (top-level true/false): true if the photos are taken INSIDE a room or building (a sauna's inside with benches, a living room, kitchen, bathroom), i.e. they show walls/floor around the camera instead of one thing from outside. A single piece of furniture or product that clearly fills the photo is NOT interior. Use "interior" only at the top level, never as a photo issue.
Be lenient: the photos are cleaned by AI and reconstructed afterwards, normal phone photos of the whole thing are good enough. Flag an issue only when it would clearly ruin the 3D model. When in doubt, do NOT flag. Ordinary phone photos with small imperfections must pass with "ok": true.
Allowed issues: ${ISSUES.join(", ")}.
Answer ONLY with JSON, no other text:
{"subject":"building|object|vehicle|unsupported","interior":true|false,"ok":true|false,"photos":[{"slot":0,"side":"front|left|back|right|unknown","ok":true|false,"issues":[],"tip":"short Estonian tip how to retake, only if not ok"}],"summary":"1-2 short sentences in Estonian for the user"}
Tips and summary must be in plain Estonian, friendly, concrete (e.g. "Pildista tagakülge siis, kui päike on sinu selja taga.").`;

// Valikurežiim: fotosid on rohkem kui külgi (kuni 12). AI valib igale küljele parima, Tripo saab ikka max 4.
export const MAX_POOL = 12;
const POOL_SYSTEM = `
SELECTION MODE: the user uploaded MORE photos than needed. They are numbered 0..N-1 ("Photo i" before each image).
For each side (front, left, back, right) pick the single BEST photo of that side: the whole thing in frame, sharpest, not backlit, least occluded, closest to straight-on.
Buildings and vehicles need all 4 sides. An object needs at least "front"; use other sides only if a photo clearly shows a different side.
Never use the same photo for two sides. If no photo shows a side, set it to null. Photos of a different thing are never selected.
Answer ONLY with JSON, no other text:
{"subject":"building|object|vehicle|unsupported","interior":true|false,"selected":{"front":0,"left":5,"back":null,"right":7},"photos":[{"side":"front","index":0,"ok":true,"issues":[],"tip":"short Estonian tip, only if not ok"}],"unused":[{"index":3,"reason":"very short Estonian reason, e.g. sama külg uduisem"}],"summary":"1-2 short sentences in Estonian"}
"photos" lists only the selected photos with the same issue rules as above.`;
const SIDE_TIP = { building: ["Lisa foto esiküljelt", "Lisa foto vasakult küljelt", "Lisa foto tagaküljelt", "Lisa foto paremalt küljelt"], other: ["Lisa foto eest", "Lisa foto vasakult", "Lisa foto tagant", "Lisa foto paremalt"] };

type Photo = { slot: number; side: string; ok: boolean; issues: string[]; tip?: string; index?: number };
async function aiCheck(photos: string[], want: Subject | null, pool = false, single = false) {
  const content: unknown[] = [];
  photos.forEach((u, i) => {
    const m = u.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/)!;
    if (pool) content.push({ type: "text", text: `Photo ${i}` });
    content.push({ type: "image", source: { type: "base64", media_type: m[1], data: m[2] } });
  });
  content.push({ type: "text", text: (want ? `Requested subject: ${want}.` + (pool ? "" : ` Slots: ${SUBJECTS[want].slots.slice(0, photos.length).map((_, i) => `${i}=${SIDES[i]}`).join(", ")}.`) : `No subject chosen yet: detect it from the photo(s).`) + ` Number of photos: ${photos.length}.` + (single ? " SINGLE PICTURE MODE: only one picture is given on purpose (also for a building or vehicle). Judge only this picture; never use duplicate_side or wrong_side." : "") });
  const r = await tfetch(env("ANTHROPIC_API_URL", "https://api.anthropic.com") + "/v1/messages", {
    method: "POST",
    headers: { "x-api-key": env("ANTHROPIC_API_KEY"), "anthropic-version": "2023-06-01", "content-type": "application/json" },
    // 4 fotot + selgitused vajavad ruumi: 900 tokenist jäi väheks ja JSON jäi poolikuks
    body: JSON.stringify({ model: env("CHECK3D_MODEL", "claude-haiku-5-5"), max_tokens: Number(env("CHECK3D_MAX_TOKENS", "4000")), system: pool ? CHECK_SYSTEM + POOL_SYSTEM : CHECK_SYSTEM, messages: [{ role: "user", content }] }),
  }, pool ? 90000 : 60000);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error("anthropic " + r.status + " " + JSON.stringify(j).slice(0, 200));
  const text = String((j.content || []).filter((c: { type?: string }) => c.type === "text").map((c: { text?: string }) => c.text || "").join(""));
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error(`kontroll: vastus pole JSON (stop=${j.stop_reason}, out=${j?.usage?.output_tokens}, text=${text.slice(0, 160)})`);
  let a;
  try { a = JSON.parse(m[0]); }
  catch { throw new Error(`kontroll: vigane JSON (stop=${j.stop_reason}): ${m[0].slice(0, 160)}`); }
  const inT = Number(j?.usage?.input_tokens) || 0, outT = Number(j?.usage?.output_tokens) || 0;
  return { a, inT, outT, model: String(j.model || "").slice(0, 60) };
}

// Õhu- ja kaldfotod: hoonel blokeeriv (mudel tuleb vale kujuga, seinad on lühenenud), muul subjektil ei loe.
const AERIAL_TIP = "Pildista maapinnalt: seisa maja ees nii, et terve külg ja katus on kaadris.";
const AERIAL_SUM = "Need on õhu- või kaldfotod. 3D-mudeli jaoks pildista maja maapinnalt neljast küljest.";
function aerial(photos: { issues: string[]; ok: boolean; tip?: string }[], kind: Subject | null) {
  let any = false;
  photos.forEach((p) => {
    if (!p.issues.includes("aerial")) return;
    if (kind !== "building") { p.issues = p.issues.filter((x) => x !== "aerial"); p.ok = p.issues.length === 0; if (p.ok) p.tip = undefined; return; }
    any = true; p.tip = AERIAL_TIP;
  });
  return any;
}

// Siseruumi fotod: 3D-mudel tehakse ühest asjast väljastpoolt; äpp pakub toa 3D-d (Sisekujundus + 3D) või eseme 3D-d
export const INTERIOR_TIP = "Siseruum: tee toast 3D (Sisekujundus + 3D) või üksikust esemest 3D.";
const INTERIOR_TIP_OBJ = "See on terve ruum: pildista üks ese lähedalt (nt pink või keris) või tee toast 3D.";
const INTERIOR_SUM = "Need on siseruumi fotod. Siseruumist saad teha toa 3D-s või ühest esemest 3D-mudeli.";
function interior(a: Record<string, unknown>, photos: Photo[], want: Subject | null) {
  photos.forEach((p) => { p.issues = p.issues.filter((x) => x !== "interior"); p.ok = p.issues.length === 0; }); // ainult tervikvastus loeb
  if (a.interior !== true) return false; // ese, mis täidab kaadri, on lubatud ka toas (AI ütleb siis interior: false)
  photos.forEach((p) => { p.issues = ["interior"]; p.ok = false; p.tip = want === "object" ? INTERIOR_TIP_OBJ : INTERIOR_TIP; });
  return true;
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
  const air = aerial(photos, want ?? (isSubject(subject) ? subject : null)), inside = interior(a, photos, want);
  const all = photos.flatMap((p) => p.issues);
  return { subject, photos, ok: all.length === 0, soft: !inside && all.length > 0 && all.every((x) => SOFT.has(x)), interior: inside, summary: inside ? INTERIOR_SUM : air ? AERIAL_SUM : typeof a.summary === "string" ? a.summary.slice(0, 400) : "" };
}

// Valikurežiimi vastus puhtaks: indeksid lubatud ja kordumatud, puuduv külg = blokeeriv viga koos juhisega
export function normalizePool(a: Record<string, unknown>, n: number, want: Subject | null) {
  const subject = isSubject(a.subject) ? a.subject : a.subject === "unsupported" ? "unsupported" : (want ?? "unsupported");
  const kind = isSubject(subject) ? subject : want;
  const selIn = (a.selected && typeof a.selected === "object" ? a.selected : {}) as Record<string, unknown>;
  const src = Array.isArray(a.photos) ? a.photos as Record<string, unknown>[] : [];
  const used = new Set<number>(), selected: { side: string; index: number }[] = [], missing: { side: string; tip: string }[] = [];
  SIDES.forEach((side, k) => {
    const v = selIn[side], i = typeof v === "number" ? v : typeof v === "string" && /^\d+$/.test(v) ? Number(v) : NaN;
    if (Number.isInteger(i) && i >= 0 && i < n && !used.has(i)) { used.add(i); selected.push({ side, index: i }); return; }
    const need = kind === "building" || kind === "vehicle";
    if (need) missing.push({ side, tip: SIDE_TIP[kind === "building" ? "building" : "other"][k] });
  });
  if (!selected.length && !missing.length) missing.push({ side: "front", tip: SIDE_TIP.other[0] });
  const photos: Photo[] = selected.map((s, k) => {
    const p = (src.find((x) => Number(x?.index) === s.index) ?? src.find((x) => x?.side === s.side) ?? {}) as Record<string, unknown>;
    const issues = [...new Set((Array.isArray(p.issues) ? p.issues : []).map(String).filter((x) => ISSUES.includes(x)))];
    return { slot: k, side: s.side, index: s.index, ok: issues.length === 0, issues, tip: issues.length && typeof p.tip === "string" ? p.tip.slice(0, 200) : undefined };
  });
  if (subject === "unsupported") photos.forEach((p) => { if (!p.issues.includes("unsupported")) { p.issues.push("unsupported"); p.ok = false; } });
  else if (want && subject !== want) photos.forEach((p) => { if (!p.issues.includes("wrong_subject")) { p.issues.push("wrong_subject"); p.ok = false; } });
  const air = aerial(photos, kind), inside = interior(a, photos, want);
  if (inside) missing.length = 0; // toas pole „puuduvaid külgi“
  const reasons = new Map<number, string>();
  (Array.isArray(a.unused) ? a.unused : []).forEach((u: Record<string, unknown>) => { const i = Number(u?.index); if (Number.isInteger(i) && i >= 0 && i < n && !used.has(i)) reasons.set(i, typeof u.reason === "string" ? u.reason.slice(0, 80) : ""); });
  const unused = [...Array(n).keys()].filter((i) => !used.has(i)).map((i) => ({ index: i, reason: reasons.get(i) || "" }));
  const all = photos.flatMap((p) => p.issues);
  const ok = all.length === 0 && !missing.length && !inside;
  return { mode: "pool", subject, selected, photos, missing, unused, ok, soft: !inside && !ok && !missing.length && all.every((x) => SOFT.has(x)), interior: inside, summary: inside ? INTERIOR_SUM : air ? AERIAL_SUM : typeof a.summary === "string" ? a.summary.slice(0, 400) : "" };
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
    const { data: r } = await db.from("renders").select("id,status,stage,ext_id,output_url,error,input_urls,product_id,ehr,garden")
      .eq("id", id).eq("company_id", me.companyId).eq("kind", "3d").maybeSingle();
    if (!r) return fail("not found", 404);
    if (r.status === "failed") { const n = await refund(id); return json({ ...view(r), error: failText(n), refunded: n }); }
    if (r.status !== "pending" || r.stage !== "modelling" || !r.ext_id) return json(view(r));
    try {
      const pr = await tfetch(`${MUAPI()}/predictions/${encodeURIComponent(r.ext_id)}/result`, { headers: { "x-api-key": await muKey() } }, 15000);
      const raw = await pr.json().catch(() => ({}));
      const p = raw?.detail && typeof raw.detail === "object" ? raw.detail : raw; // MuAPI vea vastus on "detail" sees
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
      // aed ja ümbrus: Maa-ameti andmed taustal vahemällu, et vaade avaneks kiiresti
      if (r.garden && r.ehr) {
        const job = buildGarden(r.ehr).catch((e) => console.error("garden", r.ehr, (e as Error).message));
        // deno-lint-ignore no-explicit-any
        const rt = (globalThis as any).EdgeRuntime;
        if (rt?.waitUntil) rt.waitUntil(job);
      }
      // „Tee tootest 3D-mudel“: mudel jääb toote juurde
      if (r.product_id) await db.from("products").update({ model_url: url }).eq("id", r.product_id).eq("company_id", me.companyId).then(() => {}, () => {});
      return json({ id, status: "done", url, size: bytes.length, cleaned: r.input_urls, product_id: r.product_id ?? null });
    } catch (e) {
      const n = await refund(id);
      await db.from("renders").update({ status: "failed", stage: null, error: String((e as Error).message).slice(0, 500) }).eq("id", id);
      return json({ id, status: "failed", error: failText(n), refunded: n });
    }
  }

  const photos = Array.isArray(b.photos) ? b.photos.map(String) : [];
  if (!photos.length || photos.length > MAX_POOL) return fail(`Lisa 1–${MAX_POOL} fotot`);
  if (photos.some((u) => !isPhoto(u))) return fail("vigane pilt");

  // ---------- fotokontroll ----------
  if (b.action === "check") {
    const want = b.subject == null || b.subject === "" ? null : isSubject(b.subject) ? b.subject : undefined;
    if (want === undefined) return fail("tundmatu subjekt");
    // rohkem fotosid kui külgi -> AI valib igale küljele parima
    // ühe pildi režiim: „Tee 3D-ks“ ühest pildist (image-to-3d) mis tahes subjektile
    const single = b.single === true;
    if (single && photos.length !== 1) return fail("Ühe pildi režiimis on vaja täpselt 1 pilti");
    const pool = !single && photos.length > (want ? SUBJECTS[want].max : 4);
    if (!(await rateLimit("3dchk:" + me.companyId, 40, 3600))) return fail("Liiga palju kontrolle lühikese ajaga. Proovi hiljem.", 429);
    let res;
    try {
      let r1;
      try { r1 = await aiCheck(photos, want, pool, single); }
      catch (e1) { console.error("ai-3d check, proovin uuesti:", (e1 as Error).message); r1 = await aiCheck(photos, want, pool, single); }
      const { a, inT, outT, model } = r1;
      res = pool ? normalizePool(a, photos.length, want) : normalize(a, photos.length, want);
      const cost = (inT * Number(env("ANTHROPIC_PRICE_IN", "0.10")) + outT * Number(env("ANTHROPIC_PRICE_OUT", "0.50"))) / 1e6;
      await db.from("ai_usage").insert({ company_id: me.companyId, kind: "3d-check", model, input_tokens: inT, output_tokens: outT, cost_usd: cost }).then(() => {}, () => {});
    } catch (e) {
      console.error("ai-3d check", (e as Error).message);
      return fail("Fotode kontroll ebaõnnestus, proovi uuesti.", 502);
    }
    const subject = want ?? (isSubject(res.subject) ? res.subject : null);
    // tõend ainult siis, kui subjekt on teada ja fotosid on piisavalt
    // valikurežiimis tõend ainult valitud fotodele külgede järjekorras (täpselt need, mis start saab)
    const chosen = pool ? (res as ReturnType<typeof normalizePool>).selected.map((x) => photos[x.index]) : photos;
    let token: string | null = null;
    if (subject && chosen.length >= (single ? 1 : SUBJECTS[subject].min) && chosen.length <= SUBJECTS[subject].max) {
      token = await signTok({ c: me.companyId, h: await photosHash(chosen), s: subject, ok: res.ok, soft: res.soft, exp: Date.now() + 30 * 60_000, one: single });
    }
    return json({ ...res, subject: res.subject, token, slots: subject ? SUBJECTS[subject].slots : null });
  }

  // ---------- alusta ----------
  if (!isSubject(b.subject)) return fail("Vali, mis fotodel on: hoone, ese või sõiduk");
  const subject = b.subject, S = SUBJECTS[subject];
  const single = b.single === true;
  if (single ? photos.length !== 1 : photos.length < S.min || photos.length > S.max) return fail(single ? "Ühe pildi režiimis on vaja täpselt 1 pilti" : S.min === S.max ? `Vaja on ${S.min} fotot: ${S.slots.join(", ").toLowerCase()}` : `Lisa ${S.min}–${S.max} fotot`);
  // server kontrollib ise: sama firma, sama subjekt, täpselt samad fotod, korras (või lubatud „Jätka ikkagi“)
  const t = await readTok(b.check);
  const pass = !!t && t.c === me.companyId && t.s === subject && t.exp > Date.now() && t.h === await photosHash(photos) && !!t.one === single && (t.ok || (b.force === true && t.soft));
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
  // hoone aadress (EHR kood) -> ametlikud mõõdud ja automaatne mõõtkava (Maa-ameti LOD2)
  const ehr = subject === "building" && typeof b.ehr === "string" && /^\d{5,12}$/.test(b.ehr) ? b.ehr : null;
  const garden = !!ehr && b.garden === true;
  const label = String(b.label || "Fotod → 3D-mudel").slice(0, 120);
  const prompt = cleanPrompt(subject);
  const id = crypto.randomUUID();
  let credits: number;
  try { credits = await spend(me.companyId, "3d", label, id); }
  catch (e) { const m = (e as Error).message; return fail(m, m === "insufficient_credits" ? 402 : 400); }
  await db.from("renders").insert({ id, company_id: me.companyId, object_id: objectId, kind: "3d", product_id: productId, ehr, garden, tpl: b.tpl ? String(b.tpl).slice(0, 40) : null, prompt: `[${subject}${single ? " 1 pilt" : ""}] ${prompt}`, stage: "cleaning" });
  try {
    const ins = await Promise.all(photos.map((u, i) => uploadDataUrl(u, `${me.companyId}/in/${id}-${i}`)));
    // puhastused paralleelselt; tulemus meie kausta ILMA firma logota (logo ei tohi mudeli tekstuuri sattuda)
    const vias: string[] = [];
    const cleaned = await Promise.all(ins.map(async (u, i) => {
      const k = await cleanOne(prompt, u);
      vias[i] = k.via;
      return await storeImage(k.url, `${me.companyId}/3d/${id}-${i}.jpg`);
    }));
    const tr = await startTripo(cleaned);
    await db.from("renders").update({ stage: "modelling", ext_id: tr.id, input_urls: cleaned }).eq("id", id);
    // kulu admini ülevaatesse: Kie n × ~0,02 $ + Tripo
    await db.from("ai_usage").insert({ company_id: me.companyId, kind: "3d", model: "nano-banana-2-1(" + [...new Set(vias)].join("/") + ")+" + tr.model, cost_usd: vias.reduce((a, v) => a + (v === "muapi" ? 0.03 : 0.02), 0) + tr.cost }).then(() => {}, () => {});
    return json({ id, status: "pending", stage: "modelling", cleaned, credits, subject, sides: S.slots });
  } catch (e) {
    const n = await refund(id);
    await db.from("renders").update({ status: "failed", stage: null, error: String((e as Error).message).slice(0, 500) }).eq("id", id);
    return json({ error: failText(n), refunded: n }, 502);
  }
}

// deno-lint-ignore no-explicit-any
function view(r: any) {
  return { id: r.id, status: r.status, stage: r.stage, url: r.output_url, cleaned: r.input_urls,
    error: r.status === "failed" ? "Töö ebaõnnestus." : undefined };
}

Deno.serve(handler);
