// Krediidipaketi ost: Stripe Checkout (kaart, pangalink, Apple Pay).
import { cors, json, fail, userCompany, env, body, tfetch, rateLimit, secret } from "../_shared/util.ts";

export const PACKS: Record<string, { credits: number; eur: number; name: string }> = {
  "100": { credits: 100, eur: 50, name: "Vaade3D · 100 krediiti" },
  "220": { credits: 220, eur: 100, name: "Vaade3D · 220 krediiti (+20 boonust)" },
  "600": { credits: 600, eur: 250, name: "Vaade3D · 600 krediiti (+100 boonust)" },
};
// makse järel tohib tagasi suunata ainult meie enda lehtedele
const allowed = () => env("APP_ORIGINS", "https://app.vaade3d.ee,https://2004scaleupid.github.io").split(",").map((s) => s.trim()).filter(Boolean);
function safeReturn(u: unknown): string {
  const def = allowed()[0] + "/";
  try { const x = new URL(String(u)); return allowed().includes(x.origin) ? x.origin + x.pathname : def; } catch { return def; }
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fail("POST only", 405);
  const me = await userCompany(req);
  if (!me) return fail("unauthorized", 401);
  if (!(await rateLimit("checkout:" + me.companyId, 20, 3600))) return fail("Liiga palju katseid", 429);
  const b = await body(req, 10_000).catch(() => ({} as Record<string, unknown>));
  const pk = PACKS[String(b.pack)];
  if (!pk) return fail("bad pack");
  const sk = await secret("stripe_secret_key", "STRIPE_SECRET_KEY");
  if (!sk) return fail("Maksed on veel seadistamata. Kirjuta info@vaade3d.ee", 503);
  const back = safeReturn(b.return_url);
  const f = new URLSearchParams({
    mode: "payment", "success_url": back + "#paid={CHECKOUT_SESSION_ID}", "cancel_url": back + "#cancel",
    "line_items[0][quantity]": "1", "line_items[0][price_data][currency]": "eur",
    "line_items[0][price_data][unit_amount]": String(pk.eur * 100), "line_items[0][price_data][product_data][name]": pk.name,
    "metadata[company_id]": me.companyId, "metadata[pack]": String(b.pack), "client_reference_id": me.companyId,
    "invoice_creation[enabled]": "true", "locale": "et", "metadata[app]": "vaade3d",
    // kaardiväljavõttel ja kviitungil on näha VAADE3D
    "payment_intent_data[statement_descriptor_suffix]": "VAADE3D", "payment_intent_data[description]": pk.name,
    "payment_intent_data[metadata][app]": "vaade3d", "payment_intent_data[metadata][company_id]": me.companyId, "payment_intent_data[metadata][pack]": String(b.pack),
  });
  try {
    const r = await tfetch(env("STRIPE_API_URL", "https://api.stripe.com") + "/v1/checkout/sessions", {
      method: "POST", headers: { Authorization: `Bearer ${sk}`, "Content-Type": "application/x-www-form-urlencoded" }, body: f,
    }, 15000);
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.url) { console.error("stripe", r.status, JSON.stringify(j?.error || j).slice(0, 300)); return fail("Makselehe avamine ebaõnnestus, proovi uuesti", 502); }
    return json({ url: j.url });
  } catch { return fail("Makselehe avamine ebaõnnestus, proovi uuesti", 502); }
});
