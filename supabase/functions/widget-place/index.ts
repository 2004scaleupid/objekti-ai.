// Avalik: külastaja foto + firma toode -> AI pilt. Kulu läheb firmale (disaini hind), piirang IP ja vidina kohta.
import { cors, json, fail, admin, rateLimit, clientIp, spend, refund, kieImage, storeImage, uploadDataUrl } from "../_shared/util.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fail("POST only", 405);
  const b = await req.json().catch(() => ({}));
  const id = String(b.id || "");
  if (!/^[a-f0-9]{6,32}$/.test(id)) return fail("bad id");
  if (!(await rateLimit("place-ip:" + clientIp(req), 3, 86400))) return fail("Täna on pilte tehtud juba 3. Proovi homme uuesti.", 429);
  const db = admin();
  const { data: w } = await db.from("widgets").select("company_id,active,features").eq("public_id", id).maybeSingle();
  if (!w || !w.active || w.features === "house") return fail("not found", 404);
  if (!(await rateLimit("place-w:" + id, 60, 86400))) return fail("Vidina päevane limiit on täis", 429);
  const { data: p } = await db.from("products").select("*").eq("id", b.product_id).eq("company_id", w.company_id).eq("active", true).maybeSingle();
  if (!p) return fail("toodet ei leitud", 404);
  const x = Math.max(0, Math.min(100, Number(b.point?.x) || 50)), y = Math.max(0, Math.min(100, Number(b.point?.y) || 60));
  const size = p.w && p.l ? `about ${p.w} m wide and ${p.l} m long${p.h ? `, ${p.h} m high` : ""}` : "realistic real-world size";
  const prompt = `Image 1 is a customer's photo of their yard (the scene). The other images show one product: ${p.name}. Place EXACTLY this product into image 1 at the point ${x.toFixed(0)}% from the left and ${y.toFixed(0)}% from the top of the image, standing on the ground there. Keep the product's exact design, colours and proportions from the product images. Real size ${size}, scaled correctly relative to people, doors, cars and trees in the scene. Match the scene's light direction and colour, add a realistic shadow in the same direction and length as other shadows in the scene. Do not change anything else in image 1 and keep its framing. Photorealistic, no text.`;
  try { await spend(w.company_id, "design", "Vidin: toode hoovis · " + p.name); }
  catch { return fail("Teenus pole hetkel saadaval", 503); }
  const { data: row } = await db.from("renders").insert({ company_id: w.company_id, kind: "place", prompt, via_widget: true }).select().single();
  try {
    const scene = await uploadDataUrl(String(b.photo || ""), `${w.company_id}/widget/${row.id}`);
    const out = await kieImage(prompt, [scene, ...(p.images || []).slice(0, 3)], "auto");
    const url = await storeImage(out, `${w.company_id}/w-${row.id}.jpg`, w.company_id);
    await db.from("renders").update({ status: "done", output_url: url, input_urls: [scene] }).eq("id", row.id);
    return json({ url });
  } catch (e) {
    await refund(w.company_id, "design", "Vidin: toode hoovis · " + p.name);
    await db.from("renders").update({ status: "failed", error: (e as Error).message }).eq("id", row.id);
    return fail("Pildi tegemine ebaõnnestus. Proovi teise fotoga.", 502);
  }
});
