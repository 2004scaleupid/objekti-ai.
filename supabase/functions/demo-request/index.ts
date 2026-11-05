// vaade3d.ee „Broneeri demo“ vorm: ettevõte jätab päringu -> salvestame demo_requests tabelisse ja saadame Vaade3D-le e-kirja.
// Kliendile kirja ei saadeta (vormi ei saa kasutada võõrastele kirjade saatmiseks). Kaitse: honeypot, IP- ja päevapiirang.
import { cors, json, fail, admin, body, rateLimit, clientIp, sendMail, esc, isEmail, env } from "../_shared/util.ts";

const INTEREST: Record<string, string> = { demo: "Demo", widget: "Vidin kodulehele", integration: "Kohandatud integratsioon", offer: "Hinnapakkumine" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fail("POST only", 405);
  const b = await body(req, 20_000).catch(() => ({} as Record<string, unknown>));
  if (String(b.hp || "").trim()) return json({ ok: true }); // robot täitis peidetud välja
  const s = (k: string, n: number) => String(b[k] ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, n);
  const name = s("name", 100), company = s("company", 120), email = s("email", 190).toLowerCase(), phone = s("phone", 40);
  const website = s("website", 200), niche = s("niche", 60), message = String(b.message ?? "").trim().slice(0, 2000);
  const interest = (Array.isArray(b.interest) ? b.interest : []).map(String).filter((x) => x in INTEREST).slice(0, 4);
  if (!name || !company) return fail("Sisesta nimi ja ettevõte.");
  if (!isEmail(email)) return fail("Kontrolli e-posti aadressi.");
  if (b.consent !== true) return fail("Nõustu, et võtame sinuga ühendust.");
  const ip = clientIp(req);
  if (!(await rateLimit("demo:ip:" + ip, 5, 3600))) return fail("Liiga palju päringuid. Proovi tunni pärast või kirjuta info@vaade3d.ee.", 429);
  if (!(await rateLimit("demo:all", 200, 86400))) return fail("Vorm on hetkel ülekoormatud. Kirjuta info@vaade3d.ee.", 429);
  const db = admin();
  const { data: row, error } = await db.from("demo_requests").insert({ name, company, email, phone: phone || null, website: website || null, niche: niche || null, interest, message: message || null }).select("id").single();
  if (error) { console.error("demo insert", error.message); return fail("Päringu salvestamine ei õnnestunud. Kirjuta info@vaade3d.ee.", 500); }
  const { data: adm } = await db.from("admin_emails").select("email");
  const to = [...new Set([env("ACCESS_NOTIFY", "info@vaade3d.ee"), ...(adm || []).map((a: { email: string }) => a.email)].map((x) => String(x).toLowerCase()).filter(isEmail))];
  const r = (k: string, v: unknown) => v ? `<tr><td style="color:#77706A;padding:4px 14px 4px 0;vertical-align:top">${k}</td><td style="padding:4px 0"><b>${esc(v)}</b></td></tr>` : "";
  const web = /^https?:\/\//i.test(website) ? website : website ? "https://" + website : "";
  const html = `<div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#16130F"><div style="font-weight:800;font-size:18px;margin-bottom:18px">Vaade<span style="color:#E5482D">3D</span></div>
<p style="font-size:16px">Uus päring kodulehelt: ettevõte soovib Vaade3D-d.</p>
<table style="font-size:14px;border-collapse:collapse;margin:8px 0 14px">${r("Nimi", name)}${r("Ettevõte", company)}${r("E-post", email)}${r("Telefon", phone)}${r("Koduleht", web)}${r("Valdkond", niche)}${r("Soovib", interest.map((x) => INTEREST[x]).join(", "))}</table>
${message ? `<div style="background:#F4F1EC;border-radius:10px;padding:12px 14px;font-size:14px;white-space:pre-wrap">${esc(message)}</div>` : ""}
<p style="color:#77706A;font-size:13px;margin-top:18px">Vasta sellele kirjale, et kirjutada otse kliendile.</p></div>`;
  const m = await sendMail(to, "Demo päring: " + company.slice(0, 80), html, email);
  if ((m as { ok?: boolean }).ok) await db.from("demo_requests").update({ mailed: true }).eq("id", row.id);
  return json({ ok: true });
});
