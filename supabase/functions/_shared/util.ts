// Vaade3D: ühised abifunktsioonid kõigile Edge Functionitele
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";
import { Image } from "npm:imagescript@1.3.0";

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });
export const fail = (msg: string, status = 400) => json({ error: msg }, status);

export const env = (k: string, d = "") => Deno.env.get(k) ?? d;
export const admin = (): SupabaseClient =>
  createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

/** Sisselogitud kasutaja ja tema firma (JWT päisest). */
export async function userCompany(req: Request): Promise<{ userId: string; companyId: string } | null> {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const db = admin();
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return null;
  const { data: p } = await db.from("profiles").select("company_id").eq("user_id", data.user.id).single();
  if (!p?.company_id) return null;
  return { userId: data.user.id, companyId: p.company_id };
}

/** Lihtne piirang: max N päringut aknas (sekundites). */
export async function rateLimit(key: string, max: number, windowSec: number): Promise<boolean> {
  const db = admin();
  const now = new Date();
  const { data } = await db.from("rate_limits").select("*").eq("key", key).maybeSingle();
  if (!data || (now.getTime() - new Date(data.window_start).getTime()) / 1000 > windowSec) {
    await db.from("rate_limits").upsert({ key, n: 1, window_start: now.toISOString() });
    return true;
  }
  if (data.n >= max) return false;
  await db.from("rate_limits").update({ n: data.n + 1 }).eq("key", key);
  return true;
}
export const clientIp = (req: Request) =>
  (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";

/** Krediitide kulutamine serveris (hind tuleb andmebaasist). */
export async function spend(companyId: string, kind: string, label: string, ref?: string) {
  const { data, error } = await admin().rpc("spend_credits", { p_company: companyId, p_kind: kind, p_label: label, p_ref: ref ?? null });
  if (error) throw new Error(error.message.includes("insufficient") ? "insufficient_credits" : error.message);
  return data as number;
}
export async function refund(companyId: string, kind: string, label: string) {
  const db = admin();
  const { data: s } = await db.from("settings").select("*").eq("id", 1).single();
  const price = ({ pic: s.price_pic, design: s.price_design, obj: s.price_obj, lead: s.price_lead } as Record<string, number>)[kind] ?? 0;
  await db.from("credit_ledger").insert({ company_id: companyId, delta: price, kind: "refund", label: "Tagastus: " + label });
}

/** Kie.ai pildimudel: loob ülesande, ootab tulemust ja tagastab pildi URL-i. */
export async function kieImage(prompt: string, imageUrls: string[], size = "auto"): Promise<string> {
  const key = env("KIE_API_KEY");
  if (!key) throw new Error("KIE_API_KEY puudub");
  const base = env("KIE_API_BASE", "https://api.kie.ai/api/v1");
  // Testitud: nano-banana-2-1 (4 Kie krediiti ≈ 0,02 €, ~15 s). Mudeli saab vahetada ilma koodi muutmata.
  const model = env("KIE_MODEL", "nano-banana-2-1");
  const input: Record<string, unknown> = { prompt };
  if (model.startsWith("google/")) {
    Object.assign(input, { output_format: "jpeg", image_size: size });
    if (imageUrls.length) input.image_urls = imageUrls;
  } else {
    Object.assign(input, { output_format: "jpg", aspect_ratio: size, resolution: env("KIE_RESOLUTION", "1K") });
    if (imageUrls.length) input.image_input = imageUrls;
  }
  const r = await fetch(`${base}/jobs/createTask`, {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, input }),
  });
  const j = await r.json();
  const taskId = j?.data?.taskId;
  if (!taskId) throw new Error("Kie createTask: " + JSON.stringify(j).slice(0, 300));
  const t0 = Date.now();
  while (Date.now() - t0 < 110_000) {
    await new Promise((res) => setTimeout(res, 3000));
    const s = await (await fetch(`${base}/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`, { headers: { Authorization: `Bearer ${key}` } })).json();
    const st = s?.data?.state;
    if (st === "success") {
      const rj = typeof s.data.resultJson === "string" ? JSON.parse(s.data.resultJson) : s.data.resultJson;
      const url = rj?.resultUrls?.[0];
      if (!url) throw new Error("Kie: tulemuse URL puudub");
      return url;
    }
    if (st === "fail") throw new Error("Kie: " + (s.data.failMsg || "genereerimine ebaõnnestus"));
  }
  throw new Error("Kie: aeg sai otsa");
}

/** Firma logo pildi alla paremale (valge pehme alus, et oleks igal taustal loetav). */
export async function brand(bytes: Uint8Array, logoUrl: string): Promise<Uint8Array> {
  try {
    const base = await Image.decode(bytes);
    const logo = await Image.decode(new Uint8Array(await (await fetch(logoUrl)).arrayBuffer()));
    const W = base.width, H = base.height;
    let lw = Math.round(W * 0.13);
    if ((logo.height * lw) / logo.width > H * 0.08) lw = Math.round((H * 0.08 * logo.width) / logo.height);
    logo.resize(lw, Image.RESIZE_AUTO);
    const pad = Math.max(6, Math.round(W * 0.012)), m = Math.round(W * 0.02);
    const bw = logo.width + pad * 2, bh = logo.height + pad * 2;
    const plate = new Image(bw, bh).fill(0xffffffe0);
    plate.roundCorners(Math.round(Math.min(bw, bh) * 0.22));
    base.composite(plate, W - bw - m, H - bh - m);
    base.composite(logo, W - bw - m + pad, H - bh - m + pad);
    return await base.encodeJPEG(90);
  } catch (_) { return bytes; } // logo ei tohi kunagi pilti ära rikkuda
}

/** Salvestab välise pildi meie 'renders' bucketisse (soovi korral firma logoga) ja tagastab avaliku URL-i. */
export async function storeImage(url: string, path: string, companyId?: string): Promise<string> {
  const db = admin();
  let bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
  if (companyId) {
    const { data: c } = await db.from("companies").select("logo_url,logo_on_images").eq("id", companyId).single();
    if (c?.logo_on_images && c.logo_url) {
      await db.storage.from("renders").upload(path.replace(/\.jpg$/, "-raw.jpg"), bytes, { contentType: "image/jpeg", upsert: true });
      bytes = await brand(bytes, c.logo_url);
    }
  }
  const { error } = await db.storage.from("renders").upload(path, bytes, { contentType: "image/jpeg", upsert: true });
  if (error) throw new Error("storage: " + error.message);
  return db.storage.from("renders").getPublicUrl(path).data.publicUrl;
}

/** data:image/...;base64 -> privaatne fail 'uploads' bucketis + 1h allkirjastatud link (Kie jaoks). */
export async function uploadDataUrl(dataUrl: string, path: string): Promise<string> {
  const m = dataUrl.match(/^data:(image\/[a-z+]+);base64,(.+)$/);
  if (!m) throw new Error("vigane pilt");
  const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
  if (bytes.length > 6_000_000) throw new Error("pilt on liiga suur");
  const db = admin();
  const { error } = await db.storage.from("uploads").upload(path, bytes, { contentType: m[1], upsert: true });
  if (error) throw new Error("storage: " + error.message);
  const { data } = await db.storage.from("uploads").createSignedUrl(path, 3600);
  return data!.signedUrl;
}

/** E-kiri Resendi kaudu. */
export async function sendMail(to: string[], subject: string, html: string, replyTo?: string) {
  const key = env("RESEND_API_KEY");
  if (!key || !to.length) return { skipped: true };
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env("MAIL_FROM", "Vaade3D <paringud@vaade3d.ee>"), to, subject, html, reply_to: replyTo }),
  });
  return { ok: r.ok, status: r.status };
}
export const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
