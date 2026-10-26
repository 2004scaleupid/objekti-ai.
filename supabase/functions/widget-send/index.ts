// Firma saadab vidina pildisoovi tulemuse kliendile (kinnitusega režiim). Ainult sisselogitud firma oma päringule.
import { cors, json, fail, admin, userCompany, body, isOurImage, sendMail, esc, env, ownerEmails } from "../_shared/util.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fail("POST only", 405);
  const me = await userCompany(req);
  if (!me) return fail("unauthorized", 401);
  let b: Record<string, unknown>;
  try { b = await body(req, 20_000); } catch { return fail("liiga suur", 413); }
  const rid = String(b.request_id || "");
  if (!/^[0-9a-f-]{36}$/.test(rid)) return fail("bad id");
  const db = admin();
  const { data: r } = await db.from("widget_requests").select("*").eq("id", rid).eq("company_id", me.companyId).maybeSingle();
  if (!r) return fail("not found", 404);
  const url = String(b.url || r.draft_url || "");
  // ainult sama firma AI-pilt meie hoidlast; 3D-soovil firma enda 3D-mudel
  const model = r.kind === "3d" && isOurImage(url, "models") && url.includes("/models/" + me.companyId + "/") && /\.glb(\?|$)/.test(url);
  if (!model && (!isOurImage(url, "renders") || !url.includes("/renders/" + me.companyId + "/"))) return fail(r.kind === "3d" ? "Tee enne 3D-mudel" : "Vali pilt sellest tööst", 400);
  const { data: lead } = r.lead_id ? await db.from("leads").select("name,email").eq("id", r.lead_id).maybeSingle() : { data: null };
  if (!lead) return fail("Kliendi e-post puudub", 400);
  const { data: c } = await db.from("companies").select("name,phone,web").eq("id", me.companyId).single();
  const note = String(b.message || "").replace(/[\r\n]+/g, "\n").slice(0, 800);
  const mm = url.match(/\/models\/([0-9a-f-]{36}\/[0-9a-f-]{36})\.glb/);
  const link = model && mm ? env("APP_URL", "https://app.vaade3d.ee") + "/#m=" + mm[1] : env("APP_URL", "https://app.vaade3d.ee") + "/#wr=" + r.token;
  const items = (r.items || []).map((i: { name: string }) => i.name).join(", ");
  const html = model ? `<div style="font:15px/1.5 system-ui,sans-serif;color:#16130F;max-width:560px"><h2 style="margin:0 0 8px">Sinu 3D-mudel on valmis</h2>
    <p>Tere, ${esc(lead.name)}! ${esc(c?.name || "Ettevõte")} tegi sinu fotodest 3D-mudeli. Saad seda keerata ja suumida.</p>
    ${note ? `<p style="white-space:pre-wrap">${esc(note)}</p>` : ""}
    <p><a href="${esc(link)}" style="display:inline-block;background:#16130F;color:#fff;padding:10px 16px;border-radius:10px;text-decoration:none;font-weight:600">Ava 3D-mudel</a></p>
    <p style="font-size:13px;color:#777">Küsimuste korral vasta sellele kirjale${c?.phone ? " või helista " + esc(c.phone) : ""}.</p></div>` : `<div style="font:15px/1.5 system-ui,sans-serif;color:#16130F;max-width:560px"><h2 style="margin:0 0 8px">Sinu pilt on valmis</h2>
    <p>Tere, ${esc(lead.name)}! ${esc(c?.name || "Ettevõte")} tegi sulle pildi: <b>${esc(items)}</b> sinu fotol.</p>
    ${note ? `<p style="white-space:pre-wrap">${esc(note)}</p>` : ""}
    <a href="${esc(link)}"><img src="${esc(url)}" style="width:100%;border-radius:10px" alt="Sinu pilt"></a>
    <p><a href="${esc(link)}" style="display:inline-block;background:#16130F;color:#fff;padding:10px 16px;border-radius:10px;text-decoration:none;font-weight:600">Vaata pilti</a></p>
    <p style="font-size:13px;color:#777">Küsimuste korral vasta sellele kirjale${c?.phone ? " või helista " + esc(c.phone) : ""}. Illustreeriv AI-pilt, täpsed mõõdud ja hinna ütleb ${esc(c?.name || "ettevõte")}.</p></div>`;
  // kliendi vastus läheb otse firmale, mitte Vaade3D-le
  const { data: w } = await db.from("widgets").select("notify_email").eq("company_id", me.companyId).limit(1).maybeSingle();
  const [replyTo] = await ownerEmails(me.companyId, w?.notify_email);
  const mail = await sendMail([lead.email], `${c?.name || "Vaade3D"}: ${model ? "sinu 3D-mudel" : "sinu pilt"} on valmis`, html, replyTo, c?.name);
  await db.from("widget_requests").update({ status: "sent", result_url: url, sent_at: new Date().toISOString(), seen: true }).eq("id", rid);
  if (!model) await db.from("leads").update({ image_url: url }).eq("id", r.lead_id);
  return json({ ok: true, mailed: !!(mail as { ok?: boolean }).ok, link });
});
