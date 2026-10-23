// Avalik: külastaja foto + 1–3 firma toodet -> AI pilt. Kulu läheb firmale, piirangud IP, kliendi, päeva ja kuu kaupa.
// Režiim "instant": klient näeb pilti kohe. Režiim "review": firma vaatab pildi üle ja saadab selle kliendile ise.
import { opts, STYLES } from "./opts.ts";
import { cors, json, fail, admin, rateLimit, clientIp, spend, refund, kieImage, storeImage, body, isPhoto, isOurImage, refundStale, sendMail, esc, ownerEmails, env } from "../_shared/util.ts";

type Item = { product_id: string; x?: number; y?: number; area?: number[]; auto?: boolean };
const PLACE: Record<string, string> = {
  ground: "standing naturally on the ground, scaled correctly relative to people, doors, cars and trees, with a realistic shadow on the ground",
  roof: "mounted on the roof surface, following the roof slope, direction and perspective exactly, fitted inside the roof edges with a small margin, keeping chimneys and windows",
  facade: "applied on the building's facade/wall surface in correct perspective, keeping all windows, doors and trims in place",
  fence: "along the yard boundary or the marked line, standing on the ground in correct perspective",
  indoor: "placed inside the room on the floor or wall as appropriate, matching the room's perspective and lighting",
  any: "placed where it fits most naturally for this product, in correct perspective and real-world scale",
};
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fail("POST only", 405);
  let b: Record<string, unknown>;
  try { b = await body(req, 9_000_000); } catch { return fail("Foto on liiga suur", 413); }
  const id = String(b.id || "");
  if (!/^[a-f0-9]{6,32}$/.test(id)) return fail("bad id");
  if (!isPhoto(b.photo)) return fail("Lae üles foto");
  const db = admin();
  const { data: w } = await db.from("widgets").select("company_id,active,features,daily_img_cap,notify_email,place_opts").eq("public_id", id).maybeSingle();
  if (!w || !w.active || w.features === "house") return fail("not found", 404);
  const o = opts(w.place_opts);
  // tooted: uus kuju items[], vana kuju product_id + point
  let items: Item[] = Array.isArray(b.items) ? (b.items as Item[]) : b.product_id ? [{ product_id: String(b.product_id), x: Number((b.point as Record<string, unknown>)?.x), y: Number((b.point as Record<string, unknown>)?.y) }] : [];
  items = items.slice(0, o.max_products).filter((i) => i && /^[0-9a-f-]{36}$/.test(String(i.product_id)));
  if (!items.length) return fail("Vali toode", 400);
  const { data: prods } = await db.from("products").select("*").eq("company_id", w.company_id).eq("active", true).in("id", items.map((i) => i.product_id));
  const P = items.map((i) => ({ i, p: (prods || []).find((x) => x.id === i.product_id) })).filter((x) => x.p);
  if (P.length !== items.length) return fail("toodet ei leitud", 404);
  // kliendi päring (nimi, e-post, aadress) enne pilti, kui firma nii valis
  let lead: { id: string; email: string; name: string; address: string } | null = null;
  if (b.lead_tok) { const { data: l } = await db.from("leads").select("id,email,name,address").eq("tok", String(b.lead_tok)).eq("company_id", w.company_id).maybeSingle(); lead = l; }
  if (o.lead_first && !lead) return fail("Sisesta kõigepealt nimi, e-post ja aadress", 400);
  if (o.mode === "review" && !lead) return fail("Sisesta e-post, et saaksime pildi saata", 400);
  // piirangud: IP päevas, klient nädalas, vidin päevas, firma kuu eelarve
  const ip = clientIp(req);
  if (!(await rateLimit("place-ip:" + ip, Math.max(3, o.per_customer * 2), 86400))) return fail("Täna on pilte tehtud juba piisavalt. Proovi homme uuesti.", 429);
  if (!(await rateLimit("place-c:" + id + ":" + (lead ? lead.email : ip), o.per_customer, 7 * 86400))) return fail(`Ühe kliendi kohta saab teha ${o.per_customer} pilti. Firma võtab sinuga ühendust.`, 429);
  if (!(await rateLimit("place-w:" + id, w.daily_img_cap ?? 30, 86400))) return fail("Täna on selle vidina pildid otsas. Proovi homme uuesti.", 429);
  const units = o.quality === "hd" ? 2 : 1;
  if (o.month_cap > 0) {
    const ms = new Date(); ms.setUTCDate(1); ms.setUTCHours(0, 0, 0, 0);
    const { data: led } = await db.from("credit_ledger").select("delta,kind").eq("company_id", w.company_id).or("label.like.Vidin:%,label.like.Tagastus: Vidin:%").gte("created_at", ms.toISOString());
    const used = -(led || []).reduce((a: number, r: { delta: number }) => a + Number(r.delta), 0);
    if (used >= o.month_cap) return json({ error: "budget", message: "Pildid on selleks kuuks otsas. Jäta päring ja firma saadab sulle pildi." }, 429);
  }
  await refundStale(w.company_id);
  // AI juhis: iga toode oma kohaga, paigalduskoha järgi
  const names = P.map(({ p }) => String(p.name).replace(/[^\p{L}\p{N} ,.×x\-]/gu, "").slice(0, 80));
  const lines: string[] = ["Image 1 is the customer's photo (the scene). Keep its framing, camera angle and everything that is not part of the request."];
  // juhendpilt (sama foto nummerdatud märkidega), kui klient märkis koha või ala
  const hasGuide = isPhoto(b.guide) && String(b.guide).length < 2_500_000 && P.some(({ i }) => !i.auto);
  if (hasGuide) lines.push("Image 2 is the same photo with numbered orange markers showing where each product goes. Use it only as a placement guide: the markers, numbers and dashed boxes must NOT appear in the result.");
  let img = hasGuide ? 3 : 2;
  const per = P.length > 1 ? 1 : 3;
  const pimgs: string[] = [];
  P.forEach(({ p, i }, k) => {
    const L = (p.images || []).filter((u: string) => isOurImage(u, "products")).slice(0, per);
    const at = L.length ? `Image${L.length > 1 ? "s" : ""} ${img}${L.length > 1 ? "–" + (img + L.length - 1) : ""} show${L.length > 1 ? "" : "s"} product ${k + 1}: ${names[k]}.` : `Product ${k + 1}: ${names[k]}.`;
    img += L.length; pimgs.push(...L);
    const size = p.w && p.l ? ` Real size about ${p.w} m × ${p.l} m${p.h ? `, ${p.h} m high` : ""}.` : "";
    const pl = PLACE[String(p.placement)] || PLACE.ground;
    let where = "Choose the most natural spot for it.";
    const ar = Array.isArray(i.area) && i.area.length === 4 ? i.area.map((v) => Math.max(0, Math.min(100, Number(v) || 0))) : null;
    const mk = hasGuide ? `marked ${k + 1} on the guide image ` : "";
    if (ar) where = `Place it inside the area ${mk}(x ${ar[0].toFixed(0)}–${ar[2].toFixed(0)}%, y ${ar[1].toFixed(0)}–${ar[3].toFixed(0)}% of image 1), filling that area naturally.`;
    else if (!i.auto && Number.isFinite(Number(i.x)) && Number.isFinite(Number(i.y))) where = `Place it at the point ${mk}(${Math.max(0, Math.min(100, Number(i.x))).toFixed(0)}% from the left and ${Math.max(0, Math.min(100, Number(i.y))).toFixed(0)}% from the top of image 1).`;
    lines.push(`${at} Add EXACTLY this product to image 1, ${pl}. ${where}${size} Keep the product's exact design, colours and proportions from its images.`);
  });
  const note = o.allow_note ? String(b.note || "").replace(/["\\]/g, "'").slice(0, 300) : "";
  if (note) lines.push(`The customer's wish (Estonian): "${note}".`);
  const st = o.customer_style && STYLES[String(b.style)] ? String(b.style) : o.style;
  lines.push(`Match the scene's light direction and colour and add realistic shadows. Do not change anything else. ${STYLES[st]} No text, no watermark.`);
  const prompt = lines.join("\n");
  const rid = crypto.randomUUID(), label = "Vidin: " + names.join(" + ").slice(0, 90);
  try { for (let u = 0; u < units; u++) await spend(w.company_id, "design", label, u ? rid + ":hd" : rid); }
  catch { if (units > 1) await refund(rid); return json({ error: "budget", message: "Teenus pole hetkel saadaval. Jäta päring ja firma võtab sinuga ühendust." }, 503); }
  await db.from("renders").insert({ id: rid, company_id: w.company_id, kind: "place", prompt, via_widget: true, product_id: P[0].p.id });
  // kliendi foto: meie hoidlasse (sama koht nagu AI tulemused), et firma näeks seda päringu juures
  const pm = String(b.photo).match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/)!;
  const bytes = Uint8Array.from(atob(pm[2]), (c) => c.charCodeAt(0));
  if (bytes.length > 6_000_000) { await refund(rid); if (units > 1) await refund(rid + ":hd"); return fail("Foto on liiga suur", 413); }
  const ppath = `${w.company_id}/wr-${rid}-foto.${pm[1].split("/")[1].replace("jpeg", "jpg")}`;
  const up = await db.storage.from("renders").upload(ppath, bytes, { contentType: pm[1], upsert: true });
  const photoUrl = up.error ? null : (() => { const u = db.storage.from("renders").getPublicUrl(ppath).data.publicUrl, h = env("PUBLIC_STORAGE_URL"); return h ? u.replace(env("SUPABASE_URL"), h) : u; })();
  let guideUrl: string | null = null;
  if (hasGuide) {
    const gm = String(b.guide).match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/)!;
    const gpath = `${w.company_id}/wr-${rid}-juhend.${gm[1].split("/")[1].replace("jpeg", "jpg")}`;
    const gu = await db.storage.from("renders").upload(gpath, Uint8Array.from(atob(gm[2]), (c) => c.charCodeAt(0)), { contentType: gm[1], upsert: true });
    if (!gu.error) { const u = db.storage.from("renders").getPublicUrl(gpath).data.publicUrl, h = env("PUBLIC_STORAGE_URL"); guideUrl = h ? u.replace(env("SUPABASE_URL"), h) : u; }
  }
  const itemsSaved = P.map(({ p, i }) => ({ product_id: p.id, name: p.name, placement: p.placement, x: i.x ?? null, y: i.y ?? null, area: i.area ?? null, auto: !!i.auto }));
  const { data: wr } = await db.from("widget_requests").insert({ company_id: w.company_id, lead_id: lead?.id || null, mode: o.mode, status: "pending", photo_path: photoUrl, items: itemsSaved, note: note || null, style: st }).select("id,token").single();
  try {
    if (!photoUrl) throw new Error("foto salvestamine ebaõnnestus");
    if (hasGuide && !guideUrl) throw new Error("juhendpildi salvestamine ebaõnnestus");
    const model = o.quality === "hd" ? env("KIE_MODEL_HD", "nano-banana-2") : undefined;
    const out = await kieImage(prompt, [photoUrl, ...(guideUrl ? [guideUrl] : []), ...pimgs].slice(0, 5), "auto", model);
    const url = await storeImage(out, `${w.company_id}/w-${rid}.jpg`, w.company_id);
    await db.from("renders").update({ status: "done", output_url: url, input_urls: [photoUrl] }).eq("id", rid);
    const sent = o.mode === "instant";
    if (wr) await db.from("widget_requests").update({ status: sent ? "sent" : "ready", draft_url: url, result_url: sent ? url : null, sent_at: sent ? new Date().toISOString() : null }).eq("id", wr.id);
    if (lead) {
      await db.from("leads").update({ image_url: url, product: names.join(" + ").slice(0, 120) }).eq("id", lead.id);
      const to = await ownerEmails(w.company_id, w.notify_email);
      const html = `<div style="font:15px/1.5 system-ui,sans-serif;color:#16130F;max-width:560px"><h2 style="margin:0 0 8px">${sent ? "Uus päring koos pildiga" : "Uus pildisoov: vaata üle ja saada kliendile"}</h2>
        <p>${esc(lead.name)} (${esc(lead.email)}) proovis kodulehe vidinas: <b>${esc(names.join(", "))}</b>.${note ? " Soov: „" + esc(note) + "“." : ""}</p>
        <img src="${esc(url)}" style="width:100%;border-radius:10px" alt=""><p>Aadress: ${esc(lead.address)}</p>
        <p style="font-size:13px;color:#777">${sent ? "Klient nägi seda pilti kohe." : "Klient ootab pilti. Ava Vaade3D, vaata pilt üle (vajadusel paranda stuudios) ja vajuta „Saada kliendile“."} Vasta sellele kirjale, vastus läheb otse kliendile.</p></div>`;
      const mail = await sendMail(to, sent ? `Uus päring pildiga: ${names[0]} · ${lead.name}` : `Pildisoov ootab kinnitust: ${lead.name}`, html, lead.email);
      await db.from("leads").update({ delivered: { mail, paid: true, image: true } }).eq("id", lead.id);
    }
    return json(o.mode === "instant" ? { url, request: wr?.token } : { review: true, request: wr?.token });
  } catch (e) {
    await refund(rid); if (units > 1) await refund(rid + ":hd");
    await db.from("renders").update({ status: "failed", error: String((e as Error).message).slice(0, 500) }).eq("id", rid);
    if (wr) await db.from("widget_requests").update({ status: "failed" }).eq("id", wr.id);
    return fail("Pildi tegemine ebaõnnestus. Proovi teise fotoga.", 502);
  }
});
