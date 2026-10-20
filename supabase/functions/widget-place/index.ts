// Avalik: külastaja foto + firma toode -> AI pilt. Kulu läheb firmale (disaini hind), piirang IP ja vidina kohta.
import { cors, json, fail, admin, rateLimit, clientIp, spend, refund, kieImage, storeImage, uploadDataUrl, body, isPhoto, isOurImage, refundStale } from "../_shared/util.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fail("POST only", 405);
  let b: Record<string, unknown>;
  try { b = await body(req, 9_000_000); } catch { return fail("Foto on liiga suur", 413); }
  const id = String(b.id || "");
  if (!/^[a-f0-9]{6,32}$/.test(id)) return fail("bad id");
  if (!isPhoto(b.photo)) return fail("Lae üles foto");
  const ip = clientIp(req);
  if (!(await rateLimit("place-ip:" + ip, 3, 86400))) return fail("Täna on pilte tehtud juba 3. Proovi homme uuesti.", 429);
  const db = admin();
  const { data: w } = await db.from("widgets").select("company_id,active,features,daily_img_cap").eq("public_id", id).maybeSingle();
  if (!w || !w.active || w.features === "house") return fail("not found", 404);
  const pid = String(b.product_id || "");
  if (!/^[0-9a-f-]{36}$/.test(pid)) return fail("toodet ei leitud", 404);
  const { data: p } = await db.from("products").select("*").eq("id", pid).eq("company_id", w.company_id).eq("active", true).maybeSingle();
  if (!p) return fail("toodet ei leitud", 404);
  // firma päevalimiit: keegi ei saa firma krediite pildipommitamisega tühjaks teha
  if (!(await rateLimit("place-w:" + id, w.daily_img_cap ?? 30, 86400))) return fail("Täna on selle vidina pildid otsas. Proovi homme uuesti.", 429);
  await refundStale(w.company_id);
  const pt = (b.point && typeof b.point === "object") ? b.point as Record<string, unknown> : {};
  const x = Math.max(0, Math.min(100, Number(pt.x) || 50)), y = Math.max(0, Math.min(100, Number(pt.y) || 60));
  const size = p.w && p.l ? `about ${p.w} m wide and ${p.l} m long${p.h ? `, ${p.h} m high` : ""}` : "realistic real-world size";
  const name = String(p.name).replace(/[^\p{L}\p{N} ,.×x\-]/gu, "").slice(0, 80);
  const prompt = `Image 1 is a customer's photo of their yard (the scene). The other images show one product: ${name}. Place EXACTLY this product into image 1 at the point ${x.toFixed(0)}% from the left and ${y.toFixed(0)}% from the top of the image, standing on the ground there. Keep the product's exact design, colours and proportions from the product images. Real size ${size}, scaled correctly relative to people, doors, cars and trees in the scene. Match the scene's light direction and colour, add a realistic shadow in the same direction and length as other shadows in the scene. Do not change anything else in image 1 and keep its framing. Photorealistic, no text.`;
  const rid = crypto.randomUUID();
  try { await spend(w.company_id, "design", "Vidin: toode hoovis · " + name, rid); }
  catch { return fail("Teenus pole hetkel saadaval", 503); }
  await db.from("renders").insert({ id: rid, company_id: w.company_id, kind: "place", prompt, via_widget: true });
  try {
    const scene = await uploadDataUrl(String(b.photo), `${w.company_id}/widget/${rid}`);
    const out = await kieImage(prompt, [scene, ...(p.images || []).filter((u: string) => isOurImage(u, "products")).slice(0, 3)], "auto");
    const url = await storeImage(out, `${w.company_id}/w-${rid}.jpg`, w.company_id);
    await db.from("renders").update({ status: "done", output_url: url, input_urls: [scene.split("?")[0]] }).eq("id", rid);
    return json({ url });
  } catch (e) {
    await refund(rid);
    await db.from("renders").update({ status: "failed", error: String((e as Error).message).slice(0, 500) }).eq("id", rid);
    return fail("Pildi tegemine ebaõnnestus. Proovi teise fotoga.", 502);
  }
});
