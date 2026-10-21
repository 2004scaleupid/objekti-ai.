// Foto → 3D-mudel (sisselogitud firma).
// start:  4 fotot (esikülg, vasak, taga, parem) -> Kie Nano Banana 2.1 puhastab -> MuAPI Tripo multi-view alustab mudelit
// status: äpp küsib iga ~10 s; kui Tripo on valmis, kopeerime .glb meie 'models' kausta
// Krediidid võetakse alguses; iga vea korral (ja 25 min ajapiirangul) tagastatakse.
import { cors, json, fail, userCompany, spend, refund, kieImage, storeImage, uploadDataUrl, admin, body, rateLimit, isPhoto, refundStale, secret, tfetch, env } from "../_shared/util.ts";

const MUAPI = () => env("MUAPI_API_BASE", "https://api.muapi.ai/api/v1");
const SIDES = ["Esikülg", "Vasak külg", "Tagakülg", "Parem külg"];

// Testitud päris majal 21.10.2026: hoiab kõik seinadetailid alles ja ei mõtle aknaid juurde.
const CLEAN_PROMPT = "Clean this exact house photo for 3D reconstruction. Keep the house 100% identical and pixel-faithful: same shape, proportions, cladding boards, colours, every window and door in the same position and size, gutters, downpipes, chimney, roof vents, and everything attached to the walls (satellite dish, heat pump, lamps, vents, small signs). Do NOT add, move or remove any window, door or wall feature. Remove only what is not the house: trees, branches, bushes, rocks, snow piles and plants in front of the walls; fill the hidden wall parts with matching cladding. Windows and glass doors must look like closed glass with soft daylight reflection and light curtains behind, never showing the room inside. Even soft daylight, keep any snow on the roof. Plain pure white background, whole house fully in frame, same camera angle, sharp fine detail.";

async function muKey() {
  // õige nimi on MUAPI_API_KEY; esimene saladus lisati Supabase'i nimega "Muapi.ai "
  const safe = (n: string) => { try { return env(n); } catch { return ""; } };
  const k = safe("MUAPI_API_KEY") || safe("Muapi.ai ") || safe("Muapi.ai") || await secret("muapi_api_key", "MUAPI_API_KEY");
  if (!k) throw new Error("MUAPI_API_KEY puudub");
  return k;
}

async function startTripo(images: string[]): Promise<{ id: string; cost: number }> {
  const r = await tfetch(`${MUAPI()}/tripo3d-h31-multiview-to-3d`, {
    method: "POST",
    headers: { "x-api-key": await muKey(), "Content-Type": "application/json" },
    body: JSON.stringify({
      images_list: images,
      pbr: true,
      texture_quality: env("TRIPO_TEXTURE", "detailed"), // 4K tekstuur; "standard" = 2K ja odavam
      face_limit: Number(env("TRIPO_FACES", "150000")), // hoiab faili telefonile sobivana
    }),
  }, 30000);
  const j = await r.json().catch(() => ({}));
  if (!j?.request_id) throw new Error("MuAPI: " + JSON.stringify(j).slice(0, 300));
  return { id: String(j.request_id), cost: Number(j?.cost?.amount_usd) || 0.3 };
}

Deno.serve(async (req) => {
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
    const { data: r } = await db.from("renders").select("id,status,stage,ext_id,output_url,error,input_urls")
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
      const path = `${me.companyId}/${id}.glb`;
      const { error } = await db.storage.from("models").upload(path, bytes, { contentType: "model/gltf-binary", upsert: true });
      if (error) throw new Error("storage: " + error.message);
      let url = db.storage.from("models").getPublicUrl(path).data.publicUrl;
      const host = env("PUBLIC_STORAGE_URL");
      if (host) url = url.replace(env("SUPABASE_URL"), host);
      await db.from("renders").update({ status: "done", stage: null, output_url: url }).eq("id", id);
      return json({ id, status: "done", url, size: bytes.length });
    } catch (e) {
      await refund(id);
      await db.from("renders").update({ status: "failed", stage: null, error: String((e as Error).message).slice(0, 500) }).eq("id", id);
      return json({ id, status: "failed", error: "3D-mudeli tegemine ebaõnnestus, krediidid tagastati." });
    }
  }

  // ---------- alusta ----------
  await refundStale(me.companyId);
  const photos = Array.isArray(b.photos) ? b.photos.map(String) : [];
  if (photos.length !== 4) return fail("Vaja on 4 fotot: esikülg, vasak, taga ja parem");
  if (photos.some((u) => !isPhoto(u))) return fail("vigane pilt");
  if (!(await rateLimit("3d:" + me.companyId, 10, 3600))) return fail("Liiga palju 3D-mudeleid lühikese ajaga. Proovi hiljem.", 429);
  let objectId: string | null = null;
  if (typeof b.object_id === "string") {
    const { data: o } = await db.from("objects").select("id").eq("id", b.object_id).eq("company_id", me.companyId).maybeSingle();
    objectId = o?.id ?? null;
  }
  const label = String(b.label || "Foto → 3D-mudel").slice(0, 120);
  const id = crypto.randomUUID();
  let credits: number;
  try { credits = await spend(me.companyId, "3d", label, id); }
  catch (e) { const m = (e as Error).message; return fail(m, m === "insufficient_credits" ? 402 : 400); }
  await db.from("renders").insert({ id, company_id: me.companyId, object_id: objectId, kind: "3d", tpl: b.tpl ? String(b.tpl).slice(0, 40) : null, prompt: CLEAN_PROMPT, stage: "cleaning" });
  try {
    const ins = await Promise.all(photos.map((u, i) => uploadDataUrl(u, `${me.companyId}/in/${id}-${i}`)));
    // 4 puhastust paralleelselt; tulemus meie kausta ILMA firma logota (logo ei tohi mudeli tekstuuri sattuda)
    const cleaned = await Promise.all(ins.map(async (u, i) => {
      const k = await kieImage(CLEAN_PROMPT, [u], "auto");
      return await storeImage(k, `${me.companyId}/3d/${id}-${i}.jpg`);
    }));
    const t = await startTripo(cleaned);
    await db.from("renders").update({ stage: "modelling", ext_id: t.id, input_urls: cleaned }).eq("id", id);
    // kulu admini ülevaatesse: Kie 4 × ~0,02 $ + Tripo
    await db.from("ai_usage").insert({ company_id: me.companyId, kind: "3d", model: "nano-banana-2-1+tripo-h31", cost_usd: 0.08 + t.cost }).then(() => {}, () => {});
    return json({ id, status: "pending", stage: "modelling", cleaned, credits, sides: SIDES });
  } catch (e) {
    await refund(id);
    await db.from("renders").update({ status: "failed", stage: null, error: String((e as Error).message).slice(0, 500) }).eq("id", id);
    return fail("Fotode töötlemine ebaõnnestus, krediidid tagastati.", 502);
  }
});

// deno-lint-ignore no-explicit-any
function view(r: any) {
  return { id: r.id, status: r.status, stage: r.stage, url: r.output_url, cleaned: r.input_urls,
    error: r.status === "failed" ? "3D-mudeli tegemine ebaõnnestus, krediidid tagastati." : undefined };
}
