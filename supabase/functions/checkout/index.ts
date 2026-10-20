// Krediidipaketi ost: Stripe Checkout (kaart, pangalink, Apple Pay).
import { cors, json, fail, userCompany, env } from "../_shared/util.ts";

const PACKS: Record<string, { credits: number; eur: number; name: string }> = {
  "100": { credits: 100, eur: 50, name: "Vaade3D · 100 krediiti" },
  "220": { credits: 220, eur: 100, name: "Vaade3D · 220 krediiti (+20 boonust)" },
  "600": { credits: 600, eur: 250, name: "Vaade3D · 600 krediiti (+100 boonust)" },
};
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const me = await userCompany(req);
  if (!me) return fail("unauthorized", 401);
  const b = await req.json().catch(() => ({}));
  const pk = PACKS[String(b.pack)];
  if (!pk) return fail("bad pack");
  const back = /^https:\/\//.test(String(b.return_url || "")) ? String(b.return_url) : "https://app.vaade3d.ee/";
  const f = new URLSearchParams({
    mode: "payment", "success_url": back + "#paid={CHECKOUT_SESSION_ID}", "cancel_url": back + "#cancel",
    "line_items[0][quantity]": "1", "line_items[0][price_data][currency]": "eur",
    "line_items[0][price_data][unit_amount]": String(pk.eur * 100), "line_items[0][price_data][product_data][name]": pk.name,
    "metadata[company_id]": me.companyId, "metadata[credits]": String(pk.credits), "metadata[eur]": String(pk.eur),
    "invoice_creation[enabled]": "true", "locale": "et",
  });
  const r = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST", headers: { Authorization: `Bearer ${env("STRIPE_SECRET_KEY")}`, "Content-Type": "application/x-www-form-urlencoded" }, body: f,
  });
  const j = await r.json();
  if (!r.ok) return fail("Stripe: " + (j?.error?.message || r.status), 502);
  return json({ url: j.url });
});
