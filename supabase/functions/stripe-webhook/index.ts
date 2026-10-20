// Stripe teavitab makse õnnestumisest -> krediidid lisatakse (ainult üks kord sama makse kohta).
import { admin, env } from "../_shared/util.ts";

async function verify(body: string, header: string, secret: string): Promise<boolean> {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const t = parts["t"], sig = header.split(",").filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
  if (!t || !sig.length || Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${body}`)));
  const hex = [...mac].map((b) => b.toString(16).padStart(2, "0")).join("");
  return sig.includes(hex);
}
Deno.serve(async (req) => {
  const body = await req.text();
  if (!(await verify(body, req.headers.get("stripe-signature") || "", env("STRIPE_WEBHOOK_SECRET")))) return new Response("bad signature", { status: 400 });
  const ev = JSON.parse(body);
  if (ev.type === "checkout.session.completed" && ev.data.object.payment_status === "paid") {
    const s = ev.data.object, md = s.metadata || {};
    const { error } = await admin().from("credit_ledger").insert({
      company_id: md.company_id, delta: Number(md.credits), eur: Number(md.eur), kind: "purchase",
      label: `Ostetud ${md.credits} krediiti`, ref: s.id,
    });
    if (error && !String(error.message).includes("duplicate")) return new Response("db error", { status: 500 });
  }
  return new Response("ok");
});
