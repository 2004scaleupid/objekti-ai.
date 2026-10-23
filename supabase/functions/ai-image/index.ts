// Esituspilt, disain pildist ja toode hoovis firma töölaualt (sisselogitud kasutaja).
import { failText, cors, json, fail, userCompany, spend, refund, kieImage, storeImage, uploadDataUrl, admin, body, rateLimit, isOurImage, safeSize, isPhoto, refundStale, tfetch } from "../_shared/util.ts";
import { is3dIntent } from "../_shared/intent.ts";
import { gridOf, isSame } from "../_shared/imgdiff.ts";

const KINDS: Record<string, string> = { pic: "pic", design: "design", place: "design" }; // place maksab sama palju kui disain

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fail("POST only", 405);
  const me = await userCompany(req);
  if (!me) return fail("unauthorized", 401);
  await refundStale(me.companyId);
  let b: Record<string, unknown>;
  try { b = await body(req, 30_000_000); } catch { return fail("Pildid on liiga suured", 413); }
  const kind = String(b.kind || "");
  if (!KINDS[kind]) return fail("bad kind");
  const prompt = String(b.prompt || "").slice(0, 4000);
  if (!prompt) return fail("prompt puudub");
  const imgs = Array.isArray(b.images) ? b.images.slice(0, 5).map(String) : [];
  // pildid: ainult üles laetud foto (data-URL) või meie enda failihoidla (toote pildid)
  if (imgs.some((u) => !isPhoto(u) && !isOurImage(u, "products") && !isOurImage(u, "renders"))) return fail("vigane pilt");
  if (kind !== "pic" && !imgs.length) return fail("pilt puudub");
  // kaitse kogemata topeltklikkide ja skriptide vastu: max 60 AI-pilti tunnis firma kohta
  if (!(await rateLimit("img:" + me.companyId, 60, 3600))) return fail("Liiga palju pilte lühikese ajaga. Proovi mõne minuti pärast.", 429);
  // 3D-soov ei ole kujundus: ära võta selle eest kujunduse tasu (äpp suunab ise, see on kaitse vana/ootamatu tee vastu)
  if (kind === "design" && is3dIntent(b.text)) return fail("See on 3D-soov, mitte pildi kujundus. Vajuta „Tee 3D-ruum“. Krediite ei võetud.", 409);
  const label = String(b.label || kind).slice(0, 120);
  const db = admin();
  let objectId: string | null = null;
  if (typeof b.object_id === "string") {
    const { data: o } = await db.from("objects").select("id").eq("id", b.object_id).eq("company_id", me.companyId).maybeSingle();
    objectId = o?.id ?? null;
  }
  const id = crypto.randomUUID();
  let credits: number;
  try { credits = await spend(me.companyId, KINDS[kind], label, id); }
  catch (e) { const m = (e as Error).message; return fail(m, m === "insufficient_credits" ? 402 : 400); }
  await db.from("renders").insert({ id, company_id: me.companyId, object_id: objectId, kind, tpl: b.tpl ? String(b.tpl).slice(0, 40) : null, prompt, ehr: b.ehr ? String(b.ehr).replace(/\D/g, "").slice(0, 12) : null });
  try {
    const urls: string[] = [];
    for (const [i, u] of imgs.entries()) urls.push(u.startsWith("data:") ? await uploadDataUrl(u, `${me.companyId}/in/${id}-${i}`) : u);
    // disain: 2 varianti ühe hinna eest, muidu 1 pilt
    const n = kind === "design" ? Math.max(1, Math.min(2, Number(b.n) || 2)) : 1;
    const outs = await Promise.allSettled(Array.from({ length: n }, () => kieImage(prompt, urls, safeSize(b.size))));
    const ok = outs.filter((o): o is PromiseFulfilledResult<string> => o.status === "fulfilled").map((o) => o.value);
    if (!ok.length) throw (outs[0] as PromiseRejectedResult).reason;
    // kujundus, mis on sisendiga peaaegu sama: seda ei näidata ega võeta tasu (kui kõik variandid on samad)
    let keep = ok;
    if (kind === "design") {
      const bytesOf = async (u: string) => u.startsWith("data:") ? Uint8Array.from(atob(u.slice(u.indexOf(",") + 1)), (c) => c.charCodeAt(0)) : new Uint8Array(await (await tfetch(u, {}, 20000)).arrayBuffer());
      const g0 = await bytesOf(imgs[0]).then(gridOf).catch(() => null);
      if (g0) {
        const same = await Promise.all(ok.map((u) => bytesOf(u).then(gridOf).then((g) => !!g && isSame(g0, g)).catch(() => false)));
        keep = ok.filter((_, i) => !same[i]);
        if (!keep.length) {
          const n = await refund(id);
          await db.from("renders").update({ status: "failed", error: "muudatust ei tulnud" }).eq("id", id);
          return json({ same: true, refunded: n, credits: credits + n, id });
        }
      }
    }
    const st = await Promise.allSettled(keep.map((u, i) => storeImage(u, `${me.companyId}/${id}${i ? "-" + i : ""}.jpg`, me.companyId)));
    const stored = st.filter((o): o is PromiseFulfilledResult<string> => o.status === "fulfilled").map((o) => o.value);
    if (!stored.length) throw (st[0] as PromiseRejectedResult).reason;
    await db.from("renders").update({ status: "done", output_url: stored[0], input_urls: urls.map((u) => u.split("?")[0]) }).eq("id", id);
    return json({ url: stored[0], urls: stored, credits, id });
  } catch (e) {
    const n = await refund(id);
    await db.from("renders").update({ status: "failed", error: String((e as Error).message).slice(0, 500) }).eq("id", id);
    return json({ error: failText(n), refunded: n }, 502);
  }
});
