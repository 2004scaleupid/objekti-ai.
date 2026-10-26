// Avalik: päring vidinast. Salvestab nime, e-posti ja aadressi, päring ise on tasuta, maja 3D ilma pildita = Maja 3D hind; saadab e-kirja.
import { cors, json, fail, admin, rateLimit, clientIp, spend, sendMail, esc, body, isEmail, isOurImage, tfetch, ownerEmails } from "../_shared/util.ts";

const num = (v: unknown) => (typeof v === "number" && isFinite(v) && v >= 0 && v < 1e6 ? Math.round(v * 10) / 10 : null);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fail("POST only", 405);
  let b: Record<string, unknown>;
  try { b = await body(req, 20_000); } catch { return fail("liiga suur", 413); }
  const id = String(b.id || "");
  const name = String(b.name || "").replace(/[\r\n\t]+/g, " ").trim().slice(0, 100);
  const email = String(b.email || "").trim().toLowerCase().slice(0, 200);
  const address = String(b.address || "").replace(/[\r\n\t]+/g, " ").trim().slice(0, 200);
  if (!/^[a-f0-9]{6,32}$/.test(id) || name.length < 2 || !isEmail(email) || address.length < 3) return fail("Sisesta nimi, e-post ja aadress");
  // botid täidavad peidetud välja; inimene ei näe seda
  if (b.hp) return json({ ok: true });
  const ip = clientIp(req);
  if (!(await rateLimit("lead-ip:" + ip, 5, 3600)) || !(await rateLimit("lead-ipd:" + ip, 12, 86400))) return fail("Liiga palju päringuid, proovi hiljem", 429);
  const db = admin();
  const { data: w } = await db.from("widgets").select("*").eq("public_id", id).maybeSingle();
  if (!w || !w.active) return fail("not found", 404);
  const { data: c } = await db.from("companies").select("name,phone").eq("id", w.company_id).single();
  // sama e-post samale firmale 24 h jooksul = üks päring (krediit ainult üks kord)
  const since = new Date(Date.now() - 864e5).toISOString();
  const { data: dup } = await db.from("leads").select("id,tok").eq("company_id", w.company_id).eq("email", email).gte("created_at", since).order("created_at", { ascending: false }).limit(1);
  if (dup && dup.length) return json({ ok: true, duplicate: true, tok: dup[0].tok });
  // firma päevalimiit: kaitseb krediite, kui keegi saadab massiliselt võltspäringuid
  const { count: todayN } = await db.from("leads").select("id", { count: "exact", head: true }).eq("company_id", w.company_id).gte("created_at", since);
  if ((todayN || 0) >= (w.daily_lead_cap ?? 30)) return fail(`Täna on päringuid palju. Võta palun otse ühendust${c?.phone ? ": " + c.phone : "."}`, 429);
  const ms = (b.measures && typeof b.measures === "object") ? b.measures as Record<string, unknown> : {};
  const measures = { fp: num(ms.fp), roof: num(ms.roof), wall: num(ms.wall) };
  const lead = {
    company_id: w.company_id, name, email, address,
    product: b.product ? String(b.product).slice(0, 120) : null, date_wish: b.date ? String(b.date).slice(0, 60) : null,
    services: Array.isArray(b.services) ? b.services.slice(0, 8).map((x) => String(x).slice(0, 60)) : [],
    ehr: b.ehr ? String(b.ehr).replace(/\D/g, "").slice(0, 12) || null : null, measures: measures.fp ? measures : null,
    image_url: isOurImage(b.image_url, "renders") ? String(b.image_url) : null,
  };
  const { data: row, error } = await db.from("leads").insert(lead).select().single();
  if (error) return fail("salvestamine ebaõnnestus", 500);
  // 26.10: vidin maksab sama mis tööriistad. Päring ise on tasuta; pilt kliendi hoovis on juba makstud (widget-place, nagu Toode pildile).
  // Maja 3D-ga päring (ilma pildita) = Maja 3D hind (obj). Kui saldo ei piisa, lubame väikese võla (kuni 3 korda), et klient ei kaoks.
  let paid = true;
  const withImg = !!(b.pending_image || lead.image_url);
  if (!withImg) {
    try { await spend(w.company_id, "obj", "Maja 3D vidinast · " + address.replace(/,.*$/, ""), row.id); }
    catch {
      paid = false;
      const [{ data: s }, { data: bal }] = await Promise.all([db.from("settings").select("price_obj").eq("id", 1).single(), db.from("company_balance").select("credits").eq("company_id", w.company_id).maybeSingle()]);
      const price = Number(s?.price_obj ?? 1), credits = Number(bal?.credits ?? 0);
      if (credits - price < -3 * price) {
        await db.from("leads").delete().eq("id", row.id);
        return fail(`Seda vormi ei saa hetkel kasutada. Võta palun otse ühendust${c?.phone ? ": " + c.phone : "."}`, 503);
      }
      await db.from("credit_ledger").insert({ company_id: w.company_id, delta: -price, kind: "obj", label: "Maja 3D vidinast (võlg) · " + address.replace(/,.*$/, ""), ref: row.id });
    }
  }
  // vidina pildisoov: firma saab kirja alles koos pildiga (widget-place saadab selle)
  if (b.pending_image) { await db.from("leads").update({ delivered: { paid, pending_image: true } }).eq("id", row.id); return json({ ok: true, tok: row.tok }); }
  const to = await ownerEmails(w.company_id, w.notify_email);
  const m = lead.measures;
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
      ${m ? `<tr><td style="color:#777;padding:4px 0">Põhiplaan</td><td>${esc(m.fp)} m²</td></tr><tr><td style="color:#777;padding:4px 0">Katus</td><td>~${esc(m.roof)} m²</td></tr><tr><td style="color:#777;padding:4px 0">Seinad</td><td>~${esc(m.wall)} m²</td></tr>` : ""}
    </table>
    <p style="font-size:13px;color:#777">Vasta sellele kirjale, vastus läheb otse kliendile. ${paid ? "Päringu eest võeti krediidid." : "<b>Krediidid on otsas</b>, lae krediite juurde, muidu vidin peatub."}<br>Kliendi nimi ja e-post on ainult sinu jaoks. Vaade3D neid ei kasuta ega jaga.</p></div>`;
  const mail = await sendMail(to, `Uus päring: ${address.replace(/,.*$/, "")} · ${name}`, html, email);
  let hook: unknown = null;
  if (w.webhook_url && /^https:\/\//.test(w.webhook_url)) {
    try { const r = await tfetch(w.webhook_url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...lead, id: row.id, company: c?.name, created_at: row.created_at }), redirect: "manual" }, 5000); hook = r.status; } catch { hook = "error"; }
  }
  await db.from("leads").update({ delivered: { mail, hook, paid } }).eq("id", row.id);
  return json({ ok: true, tok: row.tok });
});
