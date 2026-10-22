// Vaade3D: ühised abifunktsioonid kõigile Edge Functionitele
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });
export const fail = (msg: string, status = 400) => json({ error: msg }, status);

export const env = (k: string, d = "") => Deno.env.get(k) || d;
export const admin = (): SupabaseClient =>
  createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

/** Tekst vealogi jaoks: ilma e-postide, päringuparameetrite ja pikkade tokeniteta. */
export const scrub = (t: string) => t.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[e-post]").replace(/\?[^\s"']*/g, "").replace(/[A-Za-z0-9_\-]{32,}/g, "…");

// Edge Functionite vead -> client_errors (admin "Vead"): iga console.error, max 20 minutis ühe isolaadi kohta. Testides (EdgeRuntime puudub) välja lülitatud.
// deno-lint-ignore no-explicit-any
const RT = (globalThis as any).EdgeRuntime;
if (RT && env("SUPABASE_URL")) {
  const fnName = (Deno.mainModule.match(/\/([a-z0-9-]+)\/index\.ts$/) || [])[1] || "unknown";
  const orig = console.error.bind(console);
  let win = 0, n = 0;
  console.error = (...a: unknown[]) => {
    orig(...a);
    try {
      if (Date.now() - win > 60_000) { win = Date.now(); n = 0; }
      if (++n > 20) return;
      const msg = scrub(a.map((x) => x instanceof Error ? x.message : typeof x === "string" ? x : JSON.stringify(x)).join(" ")).slice(0, 500);
      const st = a.find((x) => x instanceof Error) as Error | undefined;
      const job = admin().from("client_errors").insert({ source: "fn:" + fnName, kind: "fn", message: msg || "?", stack: st?.stack ? scrub(st.stack).slice(0, 2000) : null
      }).then(() => {}, () => {});
      RT.waitUntil?.(job);
    } catch { /* logimine ei tohi kunagi funktsiooni katki teha */ }
  };
  globalThis.addEventListener("unhandledrejection", (e) => console.error("käsitlemata viga:", (e as PromiseRejectionEvent).reason));
}

/** Serveri saladus: kõigepealt Edge Functioni Secrets, siis andmebaasi krüpteeritud vault (ainult service_role). */
const secretCache = new Map<string, string>();
export async function secret(name: string, envKey: string): Promise<string> {
  const e = env(envKey);
  if (e) return e;
  if (secretCache.has(name)) return secretCache.get(name)!;
  const { data } = await admin().rpc("app_secret", { p_name: name });
  const v = typeof data === "string" ? data : "";
  if (v) secretCache.set(name, v);
  return v;
}

/** fetch koos ajapiiranguga, et üks aeglane väline teenus ei jääks funktsiooni kinni hoidma. */
export const tfetch = (url: string, init: RequestInit = {}, ms = 15000) =>
  fetch(url, { ...init, signal: AbortSignal.timeout(ms) });

/** Päringu keha JSON-ina, suuruse piiranguga (vaikimisi 8 MB). */
export async function body(req: Request, max = 8_000_000): Promise<Record<string, unknown>> {
  const len = Number(req.headers.get("content-length") || 0);
  if (len > max) throw new Error("too_large");
  const t = await req.text();
  if (t.length > max) throw new Error("too_large");
  try { const j = JSON.parse(t || "{}"); return j && typeof j === "object" ? j : {}; } catch { return {}; }
}

/** Meie failihoidla avalik aadress (ainult sealt lubame pilte ja logosid). */
export const publicPrefix = (bucket: string) => `${env("PUBLIC_STORAGE_URL", env("SUPABASE_URL"))}/storage/v1/object/public/${bucket}/`;
export const isOurImage = (u: unknown, bucket: string) =>
  typeof u === "string" && u.startsWith(publicPrefix(bucket)) && !/["'<>\s\\]|\.\./.test(u);
export const isPhoto = (u: unknown) => typeof u === "string" && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(u);
/** Katkenud (ajapiirangu tõttu) piltide krediidid tagasi. */
export const refundStale = (companyId: string) => admin().rpc("refund_stale_renders", { p_company: companyId }).then(() => {}, () => {});

/** Kasutaja id JWT-st ilma võrgupäringuta: ES256 allkiri projekti avaliku võtmega (JWKS). Muu allkiri -> auth.getUser.
 *  NB: väljalogitud, aga aegumata token kehtib kuni exp-ni (max 1 h); kasutada seal, kus see on ohutu (nt makselehe avamine). */
let jwks: Promise<JsonWebKey[]> | null = null;
const b64u = (t: string) => Uint8Array.from(atob(t.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(t.length / 4) * 4, "=")), (c) => c.charCodeAt(0));
function loadJwks(): Promise<JsonWebKey[]> {
  if (!jwks) {
    const e = env("SUPABASE_JWKS");
    const fromEnv = (() => { try { const j = JSON.parse(e); return Array.isArray(j) ? j : Array.isArray(j?.keys) ? j.keys : null; } catch { return null; } })();
    jwks = fromEnv ? Promise.resolve(fromEnv) : tfetch(env("SUPABASE_URL") + "/auth/v1/.well-known/jwks.json", {}, 5000).then((r) => r.json()).then((j) => j.keys || [])
      .catch(() => { jwks = null; return []; });
  }
  return jwks;
}
export async function jwtUid(token: string): Promise<string | null> {
  const [h, p, sig] = token.split(".");
  if (!h || !p || !sig) return null;
  try {
    const head = JSON.parse(new TextDecoder().decode(b64u(h)));
    if (head.alg === "ES256") {
      const k = (await loadJwks()).find((x) => (x as { kid?: string }).kid === head.kid && x.kty === "EC");
      if (k) {
        const key = await crypto.subtle.importKey("jwk", { kty: "EC", crv: k.crv, x: k.x, y: k.y }, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
        const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, b64u(sig), new TextEncoder().encode(h + "." + p));
        if (!ok) return null;
        const c = JSON.parse(new TextDecoder().decode(b64u(p)));
        return c.role === "authenticated" && typeof c.sub === "string" && Number(c.exp) * 1000 > Date.now() ? c.sub : null;
      }
    }
  } catch { return null; }
  const { data, error } = await admin().auth.getUser(token);
  return error || !data.user ? null : data.user.id;
}

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

/** Piirang: max N päringut aknas (sekundites). Aatomiline andmebaasis. */
export async function rateLimit(key: string, max: number, windowSec: number): Promise<boolean> {
  const { data, error } = await admin().rpc("rate_hit", { p_key: key, p_max: max, p_window_sec: windowSec });
  if (error) return false; // kahtluse korral keeldu
  return data === true;
}
/** Külastaja IP: Cloudflare'i päis on usaldusväärne, x-forwarded-for esimest väärtust saab võltsida. */
export const clientIp = (req: Request) => {
  if (env("LOG_IP")) console.log("ip headers", JSON.stringify({ cf: req.headers.get("cf-connecting-ip"), xff: req.headers.get("x-forwarded-for"), real: req.headers.get("x-real-ip") }));
  // Cloudflare kirjutab selle päise ise üle, klient seda võltsida ei saa
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  // muidu esimene x-forwarded-for väärtus (võib olla võltsitav, aga põhikaitse on vidina päevalimiit)
  const xs = (req.headers.get("x-forwarded-for") || "").split(",").map((s) => s.trim()).filter(Boolean);
  return xs[0] || "unknown";
};

/** Krediitide kulutamine serveris (hind tuleb andmebaasist). ref seob kulu tagastusega. */
export async function spend(companyId: string, kind: string, label: string, ref: string) {
  const { data, error } = await admin().rpc("spend_credits", { p_company: companyId, p_kind: kind, p_label: label.slice(0, 120), p_ref: ref });
  if (error) throw new Error(error.message.includes("insufficient") ? "insufficient_credits" : error.message);
  return data as number;
}
/** Tagastab täpselt selle viitega võetud summa, ainult üks kord. */
export async function refund(ref: string) {
  await admin().rpc("refund_credits", { p_ref: ref });
}

const SIZES = new Set(["auto", "1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"]);
export const safeSize = (s: unknown) => (typeof s === "string" && SIZES.has(s) ? s : "auto");

/** Kie.ai pildimudel: loob ülesande, ootab tulemust ja tagastab pildi URL-i. */
export async function kieImage(prompt: string, imageUrls: string[], size = "auto", modelOverride?: string): Promise<string> {
  const key = env("KIE_API_KEY");
  if (!key) throw new Error("KIE_API_KEY puudub");
  const base = env("KIE_API_BASE", "https://api.kie.ai/api/v1");
  // Testitud: nano-banana-2-1 (4 Kie krediiti ≈ 0,02 €, ~15 s). Mudeli saab vahetada ilma koodi muutmata.
  const model = modelOverride || env("KIE_MODEL", "nano-banana-2-1");
  const input: Record<string, unknown> = { prompt };
  if (model.startsWith("google/")) {
    Object.assign(input, { output_format: "jpeg", image_size: safeSize(size) });
    if (imageUrls.length) input.image_urls = imageUrls;
  } else {
    Object.assign(input, { output_format: "jpg", aspect_ratio: safeSize(size), resolution: env("KIE_RESOLUTION", "1K") });
    if (imageUrls.length) input.image_input = imageUrls;
  }
  const r = await tfetch(`${base}/jobs/createTask`, {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, input }),
  }, 20000);
  const j = await r.json().catch(() => ({}));
  const taskId = j?.data?.taskId;
  if (!taskId) throw new Error("Kie createTask: " + JSON.stringify(j).slice(0, 300));
  const t0 = Date.now(), poll = Number(env("KIE_POLL_MS", "3000"));
  while (Date.now() - t0 < 110_000) {
    await new Promise((res) => setTimeout(res, poll));
    const s = await (await tfetch(`${base}/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`, { headers: { Authorization: `Bearer ${key}` } }, 10000)).json().catch(() => ({}));
    const st = s?.data?.state;
    if (st === "success") {
      const rj = typeof s.data.resultJson === "string" ? JSON.parse(s.data.resultJson) : s.data.resultJson;
      const url = rj?.resultUrls?.[0];
      if (typeof url !== "string" || !/^https?:\/\//.test(url)) throw new Error("Kie: tulemuse URL puudub");
      return url;
    }
    if (st === "fail") throw new Error("Kie: " + (s.data.failMsg || "genereerimine ebaõnnestus"));
  }
  throw new Error("Kie: aeg sai otsa");
}

/** Firma logo pildi alla paremale (valge pehme alus, et oleks igal taustal loetav). */
export async function brand(bytes: Uint8Array, logoUrl: string): Promise<Uint8Array> {
  try {
    if (!isOurImage(logoUrl, "products")) return bytes; // ainult meie failihoidlast
    const lr = await tfetch(logoUrl, {}, 8000);
    const lb = new Uint8Array(await lr.arrayBuffer());
    if (lb.length > 3_000_000) return bytes;
    // pildikogu laetakse alles siin, et see ei saaks ühtegi teist funktsiooni katki teha
    // NB: aadress peab olema kirjas otse (mitte muutujas), muidu Supabase ei pane seda funktsiooni kaasa
    // deno-lint-ignore no-explicit-any
    const { Image } = await import("https://deno.land/x/imagescript@1.3.0/mod.ts") as any;
    const base = await Image.decode(bytes);
    const logo = await Image.decode(lb);
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

/** Salvestab Kie tulemuse meie 'renders' bucketisse (soovi korral firma logoga) ja tagastab avaliku URL-i. */
export async function storeImage(url: string, path: string, companyId?: string): Promise<string> {
  const db = admin();
  const r = await tfetch(url, {}, 20000);
  let bytes: Uint8Array = new Uint8Array(await r.arrayBuffer());
  if (bytes.length > 9_000_000) throw new Error("tulemus liiga suur");
  if (companyId) {
    const { data: c } = await db.from("companies").select("logo_url,logo_on_images").eq("id", companyId).single();
    if (c?.logo_on_images && c.logo_url) {
      await db.storage.from("renders").upload(path.replace(/\.jpg$/, "-raw.jpg"), bytes, { contentType: "image/jpeg", upsert: true });
      bytes = await brand(bytes, c.logo_url);
    }
  }
  const { error } = await db.storage.from("renders").upload(path, bytes, { contentType: "image/jpeg", upsert: true });
  if (error) throw new Error("storage: " + error.message);
  const pub = db.storage.from("renders").getPublicUrl(path).data.publicUrl;
  const host = env("PUBLIC_STORAGE_URL");
  return host ? pub.replace(env("SUPABASE_URL"), host) : pub;
}

/** data:image/...;base64 -> privaatne fail 'uploads' bucketis + 1h allkirjastatud link (Kie jaoks). */
export async function uploadDataUrl(dataUrl: string, path: string): Promise<string> {
  if (dataUrl.length > 8_200_000) throw new Error("pilt on liiga suur");
  const m = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!m) throw new Error("vigane pilt");
  const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
  if (bytes.length > 6_000_000) throw new Error("pilt on liiga suur");
  const db = admin();
  const { error } = await db.storage.from("uploads").upload(path, bytes, { contentType: m[1], upsert: true });
  if (error) throw new Error("storage: " + error.message);
  const { data } = await db.storage.from("uploads").createSignedUrl(path, 3600);
  if (!data?.signedUrl) throw new Error("storage: link puudub");
  return data.signedUrl;
}

/** E-kiri Resendi kaudu. */
export async function sendMail(to: string[], subject: string, html: string, replyTo?: string, fromName?: string) {
  const key = env("RESEND_API_KEY");
  // saatja nimi: "Firma via Vaade3D <info@…>" (aadress jääb meie kinnitatud domeenile)
  let from = env("MAIL_FROM", "Vaade3D <info@vaade3d.ee>");
  const nm = String(fromName || "").replace(/[^\p{L}\p{N} .&'-]/gu, "").trim().slice(0, 60);
  if (nm) from = `${nm} via Vaade3D <${(from.match(/<([^>]+)>/) || [, from])[1]}>`;
  if (!key || !to.length) return { skipped: true };
  try {
    const r = await tfetch(env("RESEND_API_URL", "https://api.resend.com") + "/emails", {
      method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: to.slice(0, 5), subject: subject.slice(0, 200), html, reply_to: replyTo }),
    }, 10000);
    // Resendi põhjus funktsiooni logisse (nt domeen kinnitamata), ilma kirja sisuta
    if (!r.ok) console.error("resend", r.status, (await r.text().catch(() => "")).slice(0, 300));
    return { ok: r.ok, status: r.status };
  } catch { return { ok: false, status: 0 }; }
}
/** Firma e-posti aadressid teavitusteks: konto e-post või firma domeeni aadress (mitte võõrastele). */
export async function ownerEmails(companyId: string, notify: string | null | undefined): Promise<string[]> {
  const db = admin();
  const [{ data: team }, { data: co }] = await Promise.all([db.from("profiles").select("email").eq("company_id", companyId), db.from("companies").select("web").eq("id", companyId).single()]);
  const own = (team || []).map((t: { email: string }) => String(t.email || "").toLowerCase()).filter(isEmail);
  let webHost = "";
  try { webHost = new URL(/^https?:\/\//.test(co?.web || "") ? co!.web : "https://" + (co?.web || "")).hostname.replace(/^www\./, "").toLowerCase(); } catch { /* */ }
  const domains = new Set(webHost && own.some((e) => e.endsWith("@" + webHost)) ? [webHost] : []);
  const wanted = String(notify || "").split(",").map((x) => x.trim().toLowerCase()).filter(isEmail);
  const to = wanted.filter((e) => own.includes(e) || domains.has(e.split("@")[1])).slice(0, 3);
  return to.length ? to : own.slice(0, 1);
}
export const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
export const isEmail = (s: string) => /^[^\s@<>"',;]{1,64}@[^\s@<>"',;]{1,190}\.[a-z]{2,24}$/i.test(s);
