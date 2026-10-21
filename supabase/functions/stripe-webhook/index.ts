// Stripe teavitab makse õnnestumisest -> krediidid lisatakse (ainult üks kord sama makse kohta).
import { admin, secret } from "../_shared/util.ts";

const PACKS: Record<string, { credits: number; eur: number }> = { "100": { credits: 100, eur: 50 }, "220": { credits: 220, eur: 100 }, "600": { credits: 600, eur: 250 } };

async function verify(raw: string, header: string, secret: string): Promise<boolean> {
  if (!secret) return false;
  const parts = header.split(",").map((p) => p.trim());
  const t = (parts.find((p) => p.startsWith("t=")) || "").slice(2);
  const sigs = parts.filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
  if (!/^\d+$/.test(t) || !sigs.length || Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${raw}`)));
  const hex = [...mac].map((b) => b.toString(16).padStart(2, "0")).join("");
  // ajastusrünnaku vastu: võrdle kõiki märke
  return sigs.some((s) => s.length === hex.length && [...s].reduce((a, ch, i) => a | (ch.charCodeAt(0) ^ hex.charCodeAt(i)), 0) === 0);
}
Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });
  const raw = await req.text();
  if (raw.length > 500_000 || !(await verify(raw, req.headers.get("stripe-signature") || "", await secret("stripe_webhook_secret", "STRIPE_WEBHOOK_SECRET")))) return new Response("bad signature", { status: 400 });
  const ev = JSON.parse(raw);
  const s = ev?.data?.object || {};
  const okEvent = (ev.type === "checkout.session.completed" && s.payment_status === "paid") || ev.type === "checkout.session.async_payment_succeeded";
  if (okEvent) {
    const md = s.metadata || {};
    let pk: { credits: number; eur: number } | undefined = PACKS[String(md.pack)];
    // vaba kogus: kogus ja summa tulevad meie enda metadata'st (seda saab panna ainult meie server), summa peab klappima
    if (md.pack === "custom") {
      const n = Number(md.credits), c = Number(md.cents);
      pk = Number.isInteger(n) && n >= 10 && n <= 2000 && Number.isInteger(c) && c >= 50 && c <= n * 100 ? { credits: n, eur: c / 100 } : undefined;
    }
    // summa ja valuuta peavad klappima paketiga (krediidid tulevad meie tabelist, mitte maksest)
    // sama Stripe'i kontot kasutavad ka teised projektid: ainult Vaade3D maksed
    if (md.app && md.app !== "vaade3d") return new Response("ignored", { status: 200 });
    if (!pk || s.currency !== "eur" || Number(s.amount_total) !== Math.round(pk.eur * 100) || !md.company_id) return new Response("ignored", { status: 200 });
    const db = admin();
    const { data: c } = await db.from("companies").select("id").eq("id", md.company_id).maybeSingle();
    if (!c) return new Response("no company", { status: 200 });
    const { error } = await db.from("credit_ledger").insert({ company_id: c.id, delta: pk.credits, eur: pk.eur, kind: "purchase", label: `Ostetud ${pk.credits} krediiti`, ref: s.id, ext: s.payment_intent || null });
    if (error && !/duplicate/i.test(error.message)) return new Response("db error", { status: 500 });
  }
  // raha tagastus või vaidlustus: krediidid (ja müüja komisjon) võetakse proportsionaalselt tagasi; võidetud vaidlus annab tagasi
  const pi = typeof s.payment_intent === "string" ? s.payment_intent : null;
  const cb = async (cents: number, label: string, ref: string) => {
    const { error } = await admin().rpc("apply_chargeback", { p_pi: pi, p_back_cents: Math.max(0, Math.round(cents)), p_label: label, p_ref: ref });
    return !error || /duplicate/i.test(error.message);
  };
  if (pi && ev.type === "charge.refunded" && !(await cb(Number(s.amount_refunded) || 0, "Raha tagastatud", `cb:${pi}:${s.amount_refunded}`))) return new Response("db error", { status: 500 });
  if (pi && ev.type === "charge.dispute.created" && !(await cb(1e9, "Makse vaidlustatud", `dp:${pi}:${s.id}`))) return new Response("db error", { status: 500 });
  if (pi && ev.type === "charge.dispute.closed" && s.status === "won" && !(await cb(0, "Vaidlus võidetud, krediidid tagasi", `dw:${pi}:${s.id}`))) return new Response("db error", { status: 500 });
  return new Response("ok");
});
