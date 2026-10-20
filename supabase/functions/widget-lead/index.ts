// Avalik: päring vidinast. Salvestab nime, e-posti ja aadressi, võtab firmalt krediidid ja saadab e-kirja.
import { cors, json, fail, admin, rateLimit, clientIp, spend, sendMail, esc } from "../_shared/util.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fail("POST only", 405);
  const b = await req.json().catch(() => ({}));
  const id = String(b.id || "");
  const name = String(b.name || "").trim().slice(0, 120), email = String(b.email || "").trim().slice(0, 200), address = String(b.address || "").trim().slice(0, 300);
  if (!/^[a-f0-9]{6,32}$/.test(id) || !name || !/^\S+@\S+\.\S+$/.test(email) || !address) return fail("Sisesta nimi, e-post ja aadress");
  if (!(await rateLimit("lead-ip:" + clientIp(req), 5, 3600))) return fail("Liiga palju päringuid, proovi hiljem", 429);
  const db = admin();
  const { data: w } = await db.from("widgets").select("*").eq("public_id", id).maybeSingle();
  if (!w || !w.active) return fail("not found", 404);
  // sama e-post + aadress 24 h jooksul = üks päring (krediit ainult üks kord)
  const since = new Date(Date.now() - 864e5).toISOString();
  const { data: dup } = await db.from("leads").select("id").eq("company_id", w.company_id).eq("email", email).eq("address", address).gte("created_at", since).maybeSingle();
  if (dup) return json({ ok: true, duplicate: true });
  const lead = {
    company_id: w.company_id, name, email, address,
    product: b.product ? String(b.product).slice(0, 120) : null, date_wish: b.date ? String(b.date).slice(0, 60) : null,
    services: Array.isArray(b.services) ? b.services.slice(0, 8).map(String) : [],
    ehr: b.ehr ? String(b.ehr).slice(0, 20) : null, measures: b.measures ?? null,
    image_url: typeof b.image_url === "string" && b.image_url.startsWith("https://") ? b.image_url : null,
  };
  const { data: row, error } = await db.from("leads").insert(lead).select().single();
  if (error) return fail("salvestamine ebaõnnestus", 500);
  let paid = true;
  try { await spend(w.company_id, "lead", "Päring vidinast · " + address.replace(/,.*$/, ""), row.id); }
  catch {
    // Krediidid otsas: päring jõuab ikka firmani, summa jääb võlaks ja arvestatakse järgmisest ostust maha.
    paid = false;
    const { data: s } = await db.from("settings").select("price_lead").eq("id", 1).single();
    await db.from("credit_ledger").insert({ company_id: w.company_id, delta: -(s?.price_lead ?? 7), kind: "lead", label: "Päring vidinast (võlg) · " + address, ref: row.id });
  }
  const { data: c } = await db.from("companies").select("name").eq("id", w.company_id).single();
  const to = String(w.notify_email || "").split(",").map((s: string) => s.trim()).filter(Boolean);
  const m = lead.measures || {};
  const html = `<div style="font:15px/1.5 system-ui,sans-serif;color:#16130F;max-width:560px">
    <h2 style="margin:0 0 8px">Uus päring: ${esc(address.replace(/,.*$/, ""))} · ${esc(name)}</h2>
    <p>Tere! Sinu kodulehe vidinast tuli uus päring${lead.product ? ": klient proovis toodet oma hoovis" : ""}.</p>
    ${lead.image_url ? `<img src="${esc(lead.image_url)}" style="width:100%;border-radius:10px" alt="">` : ""}
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <tr><td style="color:#777;padding:4px 0">Nimi</td><td><b>${esc(name)}</b></td></tr>
      <tr><td style="color:#777;padding:4px 0">E-post</td><td><b>${esc(email)}</b></td></tr>
      <tr><td style="color:#777;padding:4px 0">Aadress</td><td>${esc(address)}</td></tr>
      ${lead.product ? `<tr><td style="color:#777;padding:4px 0">Toode</td><td><b>${esc(lead.product)}</b></td></tr>` : ""}
      ${lead.date_wish ? `<tr><td style="color:#777;padding:4px 0">Soovitud aeg</td><td>${esc(lead.date_wish)}</td></tr>` : ""}
      ${lead.services.length ? `<tr><td style="color:#777;padding:4px 0">Soovib</td><td>${esc(lead.services.join(", "))}</td></tr>` : ""}
      ${m.fp ? `<tr><td style="color:#777;padding:4px 0">Põhiplaan</td><td>${esc(m.fp)} m²</td></tr><tr><td style="color:#777;padding:4px 0">Katus</td><td>~${esc(m.roof)} m²</td></tr><tr><td style="color:#777;padding:4px 0">Seinad</td><td>~${esc(m.wall)} m²</td></tr>` : ""}
    </table>
    <p style="font-size:13px;color:#777">Vasta sellele kirjale, vastus läheb otse kliendile. ${paid ? "Päringu eest võeti krediidid." : "<b>Krediidid on otsas</b>, lae krediite juurde."}<br>Kliendi nimi ja e-post on ainult sinu jaoks. Vaade3D neid ei kasuta ega jaga.</p></div>`;
  const mail = await sendMail(to, `Uus päring: ${address.replace(/,.*$/, "")} · ${name}`, html, email);
  let hook: unknown = null;
  if (w.webhook_url && /^https:\/\//.test(w.webhook_url)) {
    try { const r = await fetch(w.webhook_url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...lead, id: row.id, company: c?.name, created_at: row.created_at }) }); hook = r.status; } catch { hook = "error"; }
  }
  await db.from("leads").update({ delivered: { mail, hook } }).eq("id", row.id);
  return json({ ok: true });
});
