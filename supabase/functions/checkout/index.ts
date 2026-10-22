// Krediidipaketi ost: Stripe Checkout (kaart, pangalink, Apple Pay).
import { cors, env, body, tfetch, secret, admin, jwtUid } from "../_shared/util.ts";

export const PACKS: Record<string, { credits: number; eur: number; name: string }> = {
  "100": { credits: 100, eur: 50, name: "Vaade3D · 100 krediiti" },
  "220": { credits: 220, eur: 100, name: "Vaade3D · 220 krediiti (+20 boonust)" },
  "600": { credits: 600, eur: 250, name: "Vaade3D · 600 krediiti (+100 boonust)" },
};
export const CUSTOM_MIN = 10, CUSTOM_MAX = 2000;
// makse järel tohib tagasi suunata ainult meie enda lehtedele
const allowed = () => env("APP_ORIGINS", "https://app.vaade3d.ee,https://2004scaleupid.github.io").split(",").map((s) => s.trim()).filter(Boolean);
function safeReturn(u: unknown): string {
  const def = allowed()[0] + "/";
  try { const x = new URL(String(u)); return allowed().includes(x.origin) ? x.origin + x.pathname : def; } catch { return def; }
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  // Server-Timing: iga sammu aeg (ms), brauseris loetav
  const t0 = performance.now(), T: string[] = [];
  let last = t0;
  const lap = (n: string) => { const t = performance.now(); T.push(`${n};dur=${(t - last).toFixed(0)}`); last = t; };
  const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json",
    "Access-Control-Expose-Headers": "Server-Timing", "Timing-Allow-Origin": "*", "Server-Timing": [...T, `total;dur=${(performance.now() - t0).toFixed(0)}`].join(", ") } });
  const fail = (msg: string, status = 400) => json({ error: msg }, status);
  if (req.method !== "POST") return fail("POST only", 405);
  const b = await body(req, 10_000).catch(() => ({} as Record<string, unknown>));
  // eelsoojendus (modaal avati / hiir nupul): isolaat käima, ilma sisselogimise ja andmebaasita
  if (b.warm === true) return json({ ok: true });
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const uid = token ? await jwtUid(token) : null;
  lap("auth");
  if (!uid) return fail("unauthorized", 401);
  // üks andmebaasi ring: firma ja kiiruspiirang korraga (piirang kasutaja kohta, 20 tunnis)
  const db = admin();
  const [prof, rl, set] = await Promise.all([
    db.from("profiles").select("company_id").eq("user_id", uid).single(),
    db.rpc("rate_hit", { p_key: "checkout:u:" + uid, p_max: 20, p_window_sec: 3600 }),
    b.pack === "custom" ? db.from("settings").select("credit_eur").eq("id", 1).single() : Promise.resolve({ data: null }),
  ]);
  lap("db");
  const companyId = prof.data?.company_id as string | undefined;
  if (!companyId) return fail("unauthorized", 401);
  if (rl.error || rl.data !== true) return fail("Liiga palju katseid", 429);
  const me = { companyId };
  // pakett või vaba kogus (10–2000 krediiti, krediidi hind andmebaasi seadetest, boonuseta)
  let pk: { credits: number; eur: number; name: string } | undefined = PACKS[String(b.pack)], packKey = String(b.pack), cents = 0;
  if (b.pack === "custom") {
    const n = Number(b.credits);
    if (!Number.isInteger(n) || n < CUSTOM_MIN || n > CUSTOM_MAX) return fail(`Vali ${CUSTOM_MIN}–${CUSTOM_MAX} krediiti`);
    const st = set.data as { credit_eur?: unknown } | null;
    const per = Number(st?.credit_eur) > 0 ? Number(st!.credit_eur) : 0.5;
    cents = Math.round(n * per * 100);
    if (cents < 50) return fail("Summa on liiga väike");
    pk = { credits: n, eur: cents / 100, name: `Vaade3D · ${n} krediiti` };
    packKey = "custom";
  }
  if (!pk) return fail("bad pack");
  if (!cents) cents = pk.eur * 100;
  const sk = await secret("stripe_secret_key", "STRIPE_SECRET_KEY");
  if (!sk) return fail("Maksed on veel seadistamata. Kirjuta info@vaade3d.ee", 503);
  const back = safeReturn(b.return_url);
  const f = new URLSearchParams({
    mode: "payment", "success_url": back + "#paid={CHECKOUT_SESSION_ID}", "cancel_url": back + "#cancel",
    "line_items[0][quantity]": "1", "line_items[0][price_data][currency]": "eur",
    "line_items[0][price_data][unit_amount]": String(cents), "line_items[0][price_data][product_data][name]": pk.name,
    "metadata[company_id]": me.companyId, "metadata[pack]": packKey, "metadata[credits]": String(pk.credits), "metadata[cents]": String(cents), "client_reference_id": me.companyId,
    "invoice_creation[enabled]": "true", "locale": "et", "metadata[app]": "vaade3d",
    // kaardiväljavõttel ja kviitungil on näha VAADE3D
    "payment_intent_data[statement_descriptor_suffix]": "VAADE3D", "payment_intent_data[description]": pk.name,
    "payment_intent_data[metadata][app]": "vaade3d", "payment_intent_data[metadata][company_id]": me.companyId, "payment_intent_data[metadata][pack]": packKey,
  });
  try {
    const r = await tfetch(env("STRIPE_API_URL", "https://api.stripe.com") + "/v1/checkout/sessions", {
      method: "POST", headers: { Authorization: `Bearer ${sk}`, "Content-Type": "application/x-www-form-urlencoded" }, body: f,
    }, 15000);
    const j = await r.json().catch(() => ({}));
    lap("stripe");
    if (!r.ok || !j.url) { console.error("stripe", r.status, JSON.stringify(j?.error || j).slice(0, 300)); return fail("Makselehe avamine ebaõnnestus, proovi uuesti", 502); }
    return json({ url: j.url });
  } catch { return fail("Makselehe avamine ebaõnnestus, proovi uuesti", 502); }
});
