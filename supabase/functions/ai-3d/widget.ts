// Kodulehe vidin: 3D-mudel kliendi fotodest (avalik, ilma kontota). Firma maksab nagu tööriistas (3d hind).
// Firma seade „Kuidas klient tulemuse saab“ (place_opts.mode):
//   instant = AI teeb mudeli kohe ja klient näeb seda vidinas (kontroll -> start -> olek, nagu äpis)
//   review  = klient saadab fotod päringuga, firma teeb mudeli ise oma töölaual (krediit alles siis)
import { feats, opts, monthStart } from "../widget-place/opts.ts";
import { fail, admin, rateLimit, clientIp, sendMail, esc, ownerEmails, env, isPhoto } from "../_shared/util.ts";

export type Lead = { id: string; email: string; name: string; address: string };
export type WMe = { companyId: string; widget: { id: string; F: Set<string>; mode: string; notify: string | null; cap: number; monthCap: number }; lead: Lead | null };

const short = (a: string) => String(a || "").replace(/,.*$/, "").slice(0, 60);
const pub = (u: string) => { const h = env("PUBLIC_STORAGE_URL"); return h ? u.replace(env("SUPABASE_URL"), h) : u; };

/** Vidina identiteet: aktiivne vidin, mis pakub 3D-d; kliendi päring (nimi, e-post, aadress) peab olema enne. */
export async function widgetMe(b: Record<string, unknown>): Promise<WMe | Response> {
  const id = String(b.widget || "");
  if (!/^[a-f0-9]{6,32}$/.test(id)) return fail("bad id");
  const db = admin();
  const { data: w } = await db.from("widgets").select("company_id,active,features,daily_img_cap,notify_email,place_opts").eq("public_id", id).maybeSingle();
  const F = feats(w?.features);
  if (!w || !w.active || !(F.has("model3d") || F.has("house3d"))) return fail("not found", 404);
  const o = opts(w.place_opts);
  let lead: Lead | null = null;
  if (typeof b.lead_tok === "string" && /^[a-zA-Z0-9-]{8,64}$/.test(b.lead_tok)) {
    const { data } = await db.from("leads").select("id,email,name,address").eq("tok", b.lead_tok).eq("company_id", w.company_id).maybeSingle();
    lead = data as Lead | null;
  }
  if (b.action !== "status" && !lead) return fail("Sisesta kõigepealt nimi, e-post ja aadress", 400);
  return { companyId: w.company_id, widget: { id, F, mode: o.mode, notify: w.notify_email, cap: w.daily_img_cap ?? 30, monthCap: o.month_cap }, lead };
}

/** Kas see subjekt on vidinas lubatud: maja = house3d, ese/sõiduk = model3d. */
export const subjectOk = (me: WMe, subject: string) => subject === "building" ? me.widget.F.has("house3d") : me.widget.F.has("model3d");

/** Piirangud enne mudeli tegemist (sama loogika mis piltidel): IP, klient, vidin päevas, firma kuu eelarve. */
export async function limits(me: WMe, req: Request): Promise<Response | null> {
  const ip = clientIp(req), w = me.widget;
  if (!(await rateLimit("w3d-ip:" + ip, 3, 86400))) return fail("Täna on 3D-mudeleid tehtud juba piisavalt. Proovi homme uuesti.", 429);
  if (!(await rateLimit("w3d-c:" + w.id + ":" + me.lead!.email, 2, 7 * 86400))) return fail("Ühe kliendi kohta saab teha 2 3D-mudelit. Firma võtab sinuga ühendust.", 429);
  if (!(await rateLimit("place-w:" + w.id, w.cap, 86400))) return fail("Täna on selle vidina tööd otsas. Proovi homme uuesti.", 429);
  if (w.monthCap > 0) {
    const { data: led } = await admin().from("credit_ledger").select("delta").eq("company_id", me.companyId).or("label.like.Vidin:%,label.like.Tagastus: Vidin:%").gte("created_at", monthStart());
    const used = -(led || []).reduce((a: number, r: { delta: number }) => a + Number(r.delta), 0);
    if (used >= w.monthCap) return fail("3D-mudelid on selleks kuuks otsas. Firma võtab sinuga ühendust ja teeb mudeli ise.", 429);
  }
  return null;
}

export const label = (subject: string, lead: Lead | null) => (subject === "building" ? "Vidin: maja 3D fotodest" : "Vidin: 3D-mudel fotost") + (lead ? " · " + short(lead.address) : "");

/** Pärast starti: pildisoov firma nimekirja (instant). */
export async function instantStarted(me: WMe, renderId: string, subject: string, photos: string[]) {
  const db = admin();
  await db.from("renders").update({ via_widget: true }).eq("id", renderId);
  await db.from("widget_requests").insert({ company_id: me.companyId, lead_id: me.lead?.id ?? null, kind: "3d", mode: "instant", status: "pending", subject, render_id: renderId, photos, photo_path: photos[0] ?? null, items: [{ name: subject === "building" ? "Maja 3D fotodest" : "3D-mudel fotost" }] });
}

/** Mudel valmis (instant): pildisoov saadetuks, päringu juurde link ja firmale e-kiri. */
export async function instantDone(companyId: string, renderId: string, url: string) {
  const db = admin();
  const { data: r } = await db.from("widget_requests").select("id,lead_id,status,subject").eq("render_id", renderId).eq("company_id", companyId).maybeSingle();
  if (!r || r.status === "sent") return;
  await db.from("widget_requests").update({ status: "sent", result_url: url, draft_url: url, sent_at: new Date().toISOString() }).eq("id", r.id);
  if (!r.lead_id) return;
  const { data: lead } = await db.from("leads").select("name,email,address").eq("id", r.lead_id).maybeSingle();
  const { data: w } = await db.from("widgets").select("notify_email").eq("company_id", companyId).limit(1).maybeSingle();
  const what = r.subject === "building" ? "maja 3D-mudeli fotodest" : "3D-mudeli fotodest";
  await db.from("leads").update({ product: r.subject === "building" ? "Maja 3D fotodest" : "3D-mudel fotost" }).eq("id", r.lead_id);
  if (!lead) return;
  const link = modelLink(url);
  const html = `<div style="font:15px/1.5 system-ui,sans-serif;color:#16130F;max-width:560px"><h2 style="margin:0 0 8px">Uus päring: klient tegi ${what}</h2>
    <p>${esc(lead.name)} (${esc(lead.email)}) tegi kodulehe vidinas ${what} ja nägi seda kohe.</p>
    ${link ? `<p><a href="${esc(link)}" style="display:inline-block;background:#16130F;color:#fff;padding:10px 16px;border-radius:10px;text-decoration:none;font-weight:600">Ava 3D-mudel</a></p>` : ""}
    <p>Aadress: ${esc(lead.address)}</p><p style="font-size:13px;color:#777">Vasta sellele kirjale, vastus läheb otse kliendile.</p></div>`;
  const mail = await sendMail(await ownerEmails(companyId, w?.notify_email), `Uus päring 3D-mudeliga: ${lead.name}`, html, lead.email);
  await db.from("leads").update({ delivered: { mail, paid: true, model: true } }).eq("id", r.lead_id);
}

export const modelLink = (url: string) => {
  const m = String(url || "").match(/\/models\/([0-9a-f-]{36}\/[0-9a-f-]{36})\.glb(\?|$)/);
  return m ? env("APP_URL", "https://app.vaade3d.ee") + "/#m=" + m[1] : "";
};

/** Ülevaatusega režiim: kliendi fotod firmale (ilma krediidita). Firma teeb mudeli töölaual ja saadab kliendile. */
export async function submitPhotos(me: WMe, req: Request, subject: string, photos: string[]): Promise<Response | { ok: true; review: true }> {
  const n = subject === "building" ? 4 : 0;
  if (n ? photos.length !== n : photos.length < 1 || photos.length > 4) return fail(n ? "Lisa 4 fotot: eest, vasakult, tagant ja paremalt" : "Lisa 1–4 fotot");
  if (photos.some((u) => !isPhoto(u) || u.length > 8_200_000)) return fail("vigane pilt");
  const ip = clientIp(req);
  if (!(await rateLimit("w3d-ip:" + ip, 3, 86400))) return fail("Täna on fotosid saadetud juba piisavalt. Proovi homme uuesti.", 429);
  if (!(await rateLimit("w3d-c:" + me.widget.id + ":" + me.lead!.email, 2, 7 * 86400))) return fail("Fotod on juba saadetud. Firma võtab sinuga ühendust.", 429);
  const db = admin(), rid = crypto.randomUUID(), urls: string[] = [];
  for (let i = 0; i < photos.length; i++) {
    const m = photos[i].match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/)!;
    const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
    if (bytes.length > 6_000_000) return fail("Foto on liiga suur", 413);
    const path = `${me.companyId}/wr-${rid}-${i}.${m[1].split("/")[1].replace("jpeg", "jpg")}`;
    const up = await db.storage.from("renders").upload(path, bytes, { contentType: m[1], upsert: true });
    if (up.error) return fail("Fotode salvestamine ebaõnnestus, proovi uuesti.", 502);
    urls.push(pub(db.storage.from("renders").getPublicUrl(path).data.publicUrl));
  }
  const name = subject === "building" ? "Maja 3D fotodest" : "3D-mudel fotost";
  await db.from("widget_requests").insert({ id: rid, company_id: me.companyId, lead_id: me.lead!.id, kind: "3d", mode: "review", status: "ready", subject, photos: urls, photo_path: urls[0], items: [{ name }] });
  await db.from("leads").update({ product: name }).eq("id", me.lead!.id);
  const L = me.lead!;
  const html = `<div style="font:15px/1.5 system-ui,sans-serif;color:#16130F;max-width:560px"><h2 style="margin:0 0 8px">Uus soov: ${esc(name)}</h2>
    <p>${esc(L.name)} (${esc(L.email)}) saatis kodulehe vidinas ${urls.length} fotot ja soovib 3D-mudelit.</p>
    <div>${urls.map((u) => `<img src="${esc(u)}" style="width:48%;border-radius:8px;margin:0 1% 6px 0" alt="">`).join("")}</div>
    <p>Aadress: ${esc(L.address)}</p>
    <p style="font-size:13px;color:#777">Ava Vaade3D → Seaded → Kodulehe vidin → Pildisoovid ja vajuta „Tee 3D-mudel“. Krediit kulub alles siis. Vasta sellele kirjale, vastus läheb otse kliendile.</p></div>`;
  const mail = await sendMail(await ownerEmails(me.companyId, me.widget.notify), `3D-mudeli soov: ${L.name}`, html, L.email);
  await db.from("leads").update({ delivered: { mail, paid: true, model_request: true } }).eq("id", L.id);
  return { ok: true, review: true };
}
