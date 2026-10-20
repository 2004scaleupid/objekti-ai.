// Esituspilt, disain pildist ja toode hoovis firma töölaualt (sisselogitud kasutaja).
import { cors, json, fail, userCompany, spend, refund, kieImage, storeImage, uploadDataUrl, admin } from "../_shared/util.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const me = await userCompany(req);
  if (!me) return fail("unauthorized", 401);
  const b = await req.json().catch(() => ({}));
  const kind = b.kind as "pic" | "design" | "place";
  if (!["pic", "design", "place"].includes(kind)) return fail("bad kind");
  const prompt = String(b.prompt || "").slice(0, 4000);
  if (!prompt) return fail("prompt puudub");
  const label = String(b.label || kind).slice(0, 120);
  const db = admin();
  let credits: number;
  try { credits = await spend(me.companyId, kind === "place" ? "design" : kind, label); }
  catch (e) { return fail((e as Error).message, (e as Error).message === "insufficient_credits" ? 402 : 400); }
  const { data: row } = await db.from("renders").insert({ company_id: me.companyId, object_id: b.object_id ?? null, kind, tpl: b.tpl ?? null, prompt, ehr: b.ehr ? String(b.ehr).slice(0, 20) : null }).select().single();
  try {
    // sisendpildid: data-URL-id laetakse üles, http(s) lingid kasutatakse otse
    const urls: string[] = [];
    for (const [i, u] of (b.images || []).slice(0, 5).entries()) {
      urls.push(String(u).startsWith("data:") ? await uploadDataUrl(String(u), `${me.companyId}/in/${row.id}-${i}`) : String(u));
    }
    // disain: 2 varianti ühe hinna eest, muidu 1 pilt
    const n = kind === "design" ? Math.max(1, Math.min(2, Number(b.n) || 2)) : 1;
    const outs = await Promise.allSettled(Array.from({ length: n }, () => kieImage(prompt, urls, b.size || "auto")));
    const ok = outs.filter((o): o is PromiseFulfilledResult<string> => o.status === "fulfilled").map((o) => o.value);
    if (!ok.length) throw (outs[0] as PromiseRejectedResult).reason;
    const stored = await Promise.all(ok.map((u, i) => storeImage(u, `${me.companyId}/${row.id}${i ? "-" + i : ""}.jpg`, me.companyId)));
    await db.from("renders").update({ status: "done", output_url: stored[0], input_urls: urls }).eq("id", row.id);
    return json({ url: stored[0], urls: stored, credits, id: row.id });
  } catch (e) {
    await refund(me.companyId, kind === "place" ? "design" : kind, label);
    await db.from("renders").update({ status: "failed", error: (e as Error).message }).eq("id", row.id);
    return fail("Pildi tegemine ebaõnnestus, krediidid tagastati. " + (e as Error).message, 502);
  }
});
