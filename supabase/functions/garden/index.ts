// Aed ja ümbrus: { ref } (oma firma 3D-töö) või { ehr } (aadressiobjekt) -> meta.json aadress.
// Andmed on avalikud (Maa-amet) ja vahemälus aadressi kaupa; sisselogimine + piirang hoiavad koormuse mõistlikuna.
import { cors, body, admin, jwtUid, rateLimit, clientIp } from "../_shared/util.ts";
import { buildGarden, type Timing } from "../_shared/garden.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const t0 = performance.now(), T: Timing = {};
  const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json",
    "Access-Control-Expose-Headers": "Server-Timing", "Timing-Allow-Origin": "*",
    "Server-Timing": [...Object.entries(T).map(([k, v]) => `${k};dur=${v}`), `total;dur=${Math.round(performance.now() - t0)}`].join(", ") } });
  const fail = (msg: string, status = 400) => json({ error: msg }, status);
  if (req.method !== "POST") return fail("POST only", 405);
  const b = await body(req, 5_000).catch(() => ({} as Record<string, unknown>));
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const uid = token ? await jwtUid(token) : null;
  T.auth = Math.round(performance.now() - t0);
  const db = admin();
  // kodulehe vidina külastaja (ilma kontota): aktiivne vidin + ainult ehr; piirang IP ja vidina kaupa (Maa-ameti andmed on avalikud)
  if (!uid && typeof b.widget === "string" && /^[a-f0-9]{6,32}$/.test(b.widget) && typeof b.ehr === "string" && /^\d{5,12}$/.test(b.ehr)) {
    const { data: w } = await db.from("widgets").select("active").eq("public_id", b.widget).maybeSingle();
    if (!w?.active) return fail("not found", 404);
    if (!(await rateLimit("garden:ip:" + clientIp(req), 30, 3600)) || !(await rateLimit("garden:w:" + b.widget, 300, 86400))) return fail("Liiga palju päringuid, proovi hiljem", 429);
    try {
      const g = await buildGarden(b.ehr, T);
      if (!g) return fail("Selle aadressi kohta pole Maa-ameti andmeid", 404);
      return json({ ehr: b.ehr, meta: g.url, cached: g.cached, timing: T });
    } catch (e) { console.error("garden w", b.ehr, (e as Error).message); return fail("Maa-ameti andmed ei laadinud, proovi hiljem", 502); }
  }
  if (!uid) return fail("unauthorized", 401);
  const [prof, rl] = await Promise.all([
    db.from("profiles").select("company_id").eq("user_id", uid).single(),
    db.rpc("rate_hit", { p_key: "garden:u:" + uid, p_max: 60, p_window_sec: 3600 }),
  ]);
  const companyId = prof.data?.company_id as string | undefined;
  if (!companyId) return fail("unauthorized", 401);
  if (rl.error || rl.data !== true) return fail("Liiga palju päringuid, proovi hiljem", 429);
  let ehr = typeof b.ehr === "string" && /^\d{5,12}$/.test(b.ehr) ? b.ehr : "";
  if (!ehr && typeof b.ref === "string") {
    const { data: r } = await db.from("renders").select("ehr").eq("id", b.ref).eq("company_id", companyId).eq("kind", "3d").maybeSingle();
    ehr = r?.ehr || "";
  }
  if (!ehr) return fail("Mudelil pole aadressi");
  try {
    const g = await buildGarden(ehr, T);
    if (!g) return fail("Selle aadressi kohta pole Maa-ameti andmeid", 404);
    return json({ ehr, meta: g.url, cached: g.cached, timing: T });
  } catch (e) {
    console.error("garden", ehr, (e as Error).message);
    return fail("Maa-ameti andmed ei laadinud, proovi hiljem", 502);
  }
});
