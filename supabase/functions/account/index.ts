// Konto: { action: "request_access" } (uus konto ootab kinnitust, teavitab Vaade3D-d), { action: "approve", t } (kinnituslink).
// Konto andmed (GDPR): { action: "export" } -> kõik minu andmed JSON-ina + failide nimekiri; { action: "delete", confirm: "KUSTUTA" } -> konto kustutamine.
// Kustutamine: 1) firma failid (ainus liige), 2) andmebaas ühe tehinguna (delete_account_data), 3) sisselogimise kasutaja. Iga samm on korratav.
import { cors, json, fail, admin, body, userCompany, rateLimit, env, esc, sendMail, isEmail, clientIp } from "../_shared/util.ts";

// ---- Konto kinnitamine: uus konto ootab Vaade3D kinnitust (settings.require_approval) ----
const APP = () => env("APP_URL", "https://app.vaade3d.ee").replace(/\/+$/, "");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function approveSig(cid: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(env("ACCESS_SECRET") || env("SUPABASE_SERVICE_ROLE_KEY")), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const s = new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode("approve:" + cid.toLowerCase())));
  return btoa(String.fromCharCode(...s)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
const same = (a: string, b: string) => a.length === b.length && [...a].reduce((x, c, i) => x | (c.charCodeAt(0) ^ b.charCodeAt(i)), 0) === 0;
const mailBox = (inner: string) => `<div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#16130F"><div style="font-weight:800;font-size:18px;margin-bottom:18px">Vaade<span style="color:#E5482D">3D</span></div>${inner}</div>`;
const btn = (href: string, t: string) => `<a href="${esc(href)}" style="display:inline-block;background:#E5482D;color:#fff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:10px">${esc(t)}</a>`;

/** Kinnituslink adminni e-kirjast: { action:"approve", t:"<firma id>.<allkiri>" } (sisselogimist pole vaja). */
async function approve(req: Request, t: string): Promise<Response> {
  if (!(await rateLimit("approve:ip:" + clientIp(req), 30, 3600))) return fail("Liiga palju katseid, proovi hiljem.", 429);
  const [cid, sig] = String(t || "").split(".");
  if (!cid || !sig || !UUID.test(cid) || !same(sig, await approveSig(cid))) return fail("Kinnituslink on vigane.", 403);
  const db = admin();
  const { data: up } = await db.from("companies").update({ approved_at: new Date().toISOString() }).eq("id", cid).is("approved_at", null).select("name").maybeSingle();
  const { data: co } = up ? { data: up } : await db.from("companies").select("name").eq("id", cid).maybeSingle();
  if (!co) return fail("Kontot ei leitud. See võib olla kustutatud.", 404);
  if (up) {
    const { data: team } = await db.from("profiles").select("email,name").eq("company_id", cid);
    const to = (team || []).map((x: { email: string }) => String(x.email || "")).filter(isEmail);
    const nm = (team || [])[0]?.name ? ", " + esc(String(team![0].name).split(" ")[0]) : "";
    if (to.length) await sendMail(to, "Sinu Vaade3D konto on avatud", mailBox(`<p style="font-size:16px">Tere${nm}!</p><p>Sinu Vaade3D konto (${esc(co.name)}) on nüüd avatud. Logi sisse ja alusta.</p><p style="margin:22px 0">${btn(APP() + "/", "Logi sisse")}</p><p style="color:#77706A;font-size:13px">Küsimused: info@vaade3d.ee</p>`));
  }
  return json({ ok: true, company: co.name, already: !up });
}

/** Sisselogitud, aga kinnitamata kasutaja: teavita Vaade3D-d (kord ööpäevas). */
async function requestAccess(me: { userId: string; companyId: string }): Promise<Response> {
  const db = admin();
  const [{ data: co }, { data: pr }, { data: st }] = await Promise.all([
    db.from("companies").select("name,niche,source,source_other,approved_at,approval_requested_at,created_at").eq("id", me.companyId).single(),
    db.from("profiles").select("name,email").eq("user_id", me.userId).single(),
    db.from("settings").select("require_approval").eq("id", 1).single()]);
  if (!co) return fail("Kontot ei leitud", 404);
  if (co.approved_at || st?.require_approval === false) return json({ approved: true });
  const last = co.approval_requested_at ? Date.parse(co.approval_requested_at) : 0;
  if (Date.now() - last < 24 * 3600 * 1000) return json({ pending: true, requested: true });
  if (!(await rateLimit("access:u:" + me.userId, 3, 3600))) return json({ pending: true });
  await db.from("companies").update({ approval_requested_at: new Date().toISOString() }).eq("id", me.companyId);
  const { data: adm } = await db.from("admin_emails").select("email");
  const to = [...new Set([env("ACCESS_NOTIFY", "info@vaade3d.ee"), ...(adm || []).map((a: { email: string }) => a.email)].map((x) => String(x).toLowerCase()).filter(isEmail))];
  const link = APP() + "/#kinnita=" + me.companyId + "." + await approveSig(me.companyId);
  const row = (k: string, v: unknown) => v ? `<tr><td style="color:#77706A;padding:4px 14px 4px 0">${k}</td><td style="padding:4px 0"><b>${esc(v)}</b></td></tr>` : "";
  const r = await sendMail(to, "Uus konto ootab kinnitust: " + String(co.name || "").slice(0, 80), mailBox(`<p style="font-size:16px">Keegi soovib Vaade3D kontot.</p><table style="font-size:14px;border-collapse:collapse;margin:8px 0 18px">${row("Nimi", pr?.name)}${row("E-post", pr?.email)}${row("Ettevõte", co.name)}${row("Valdkond", co.niche)}${row("Kust kuulis", [co.source, co.source_other].filter(Boolean).join(" · "))}${row("Registreerus", new Date(co.created_at).toLocaleString("et-EE", { timeZone: "Europe/Tallinn" }))}</table><p style="margin:22px 0">${btn(link, "Kinnita konto")}</p><p style="color:#77706A;font-size:13px">Kui sa seda kontot ei soovi, ära tee midagi: konto jääb suletuks. Pärast kinnitust saab klient e-kirja ja saab sisse logida.</p>`), pr?.email || undefined);
  return json({ pending: true, notified: !!(r as { ok?: boolean }).ok });
}


const BUCKETS = ["uploads", "renders", "models", "products"] as const;
const PRIVATE = new Set(["uploads"]);
// firma tabelid ekspordiks (veerg company_id)
const TABLES = ["objects", "renders", "products", "model_marks", "credit_ledger", "invoices", "leads", "widget_requests", "widgets", "feedback"] as const;

/** Kõik failid kaustas `${prefix}/` (rekursiivselt). */
async function listAll(bucket: string, prefix: string): Promise<string[]> {
  const st = admin().storage.from(bucket), out: string[] = [], dirs = [prefix];
  while (dirs.length) {
    const d = dirs.pop()!;
    for (let off = 0; ; off += 1000) {
      const { data, error } = await st.list(d, { limit: 1000, offset: off });
      if (error) throw new Error(`storage ${bucket}: ${error.message}`);
      for (const e of data || []) (e.id ? out : dirs).push(`${d}/${e.name}`);
      if (!data || data.length < 1000) break;
    }
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fail("POST only", 405);
  const b = await body(req, 10_000).catch(() => ({} as Record<string, unknown>));
  if (b.action === "approve") return approve(req, String(b.t || ""));
  const me = await userCompany(req);
  if (!me) return fail("unauthorized", 401);
  const db = admin();
  if (b.action === "request_access") return requestAccess(me);

  if (b.action === "export") {
    if (!(await rateLimit("export:u:" + me.userId, 5, 3600))) return fail("Liiga palju allalaadimisi, proovi tunni pärast uuesti.", 429);
    const [{ data: user }, { data: profile }, { data: company }, ...rows] = await Promise.all([
      db.auth.admin.getUserById(me.userId),
      db.from("profiles").select("*").eq("user_id", me.userId).single(),
      db.from("companies").select("*").eq("id", me.companyId).single(),
      ...TABLES.map((t) => db.from(t).select("*").eq("company_id", me.companyId).limit(10000)),
      db.from("partners").select("code,name,email,iban,seller,active,created_at").eq("owner_user", me.userId),
    ]);
    const data: Record<string, unknown> = {};
    TABLES.forEach((t, i) => (data[t] = rows[i].data || []));
    data.partners = rows[TABLES.length].data || [];
    const files: { bucket: string; path: string; url: string }[] = [];
    for (const bk of BUCKETS) {
      const paths = await listAll(bk, me.companyId);
      if (!paths.length) continue;
      if (PRIVATE.has(bk)) {
        const { data: s } = await db.storage.from(bk).createSignedUrls(paths, 7 * 86400);
        (s || []).forEach((x) => files.push({ bucket: bk, path: x.path || "", url: x.signedUrl }));
      } else paths.forEach((p) => files.push({ bucket: bk, path: p, url: db.storage.from(bk).getPublicUrl(p).data.publicUrl }));
    }
    const u = user?.user;
    return json({
      exported_at: new Date().toISOString(), service: "Vaade3D", note: "Privaatsete failide lingid kehtivad 7 päeva.",
      account: u ? { id: u.id, email: u.email, created_at: u.created_at, last_sign_in_at: u.last_sign_in_at, email_confirmed_at: u.email_confirmed_at, metadata: u.user_metadata } : null,
      profile, company, ...data, files,
    });
  }

  if (b.action === "delete") {
    if (String(b.confirm || "").trim().toUpperCase() !== "KUSTUTA") return fail("Kinnitamiseks kirjuta KUSTUTA");
    if (!(await rateLimit("delete:u:" + me.userId, 5, 3600))) return fail("Liiga palju katseid, proovi hiljem.", 429);
    const { count } = await db.from("profiles").select("user_id", { count: "exact", head: true }).eq("company_id", me.companyId);
    const sole = (count ?? 1) <= 1;
    try {
      if (sole) {
        for (const bk of BUCKETS) {
          const paths = await listAll(bk, me.companyId);
          for (let i = 0; i < paths.length; i += 500) {
            const { error } = await db.storage.from(bk).remove(paths.slice(i, i + 500));
            if (error) throw new Error(`storage ${bk}: ${error.message}`);
          }
        }
      }
      const { error: e1 } = await db.rpc("delete_account_data", { p_uid: me.userId });
      if (e1) throw new Error("db: " + e1.message);
      const { error: e2 } = await db.auth.admin.deleteUser(me.userId);
      if (e2) throw new Error("auth: " + e2.message);
    } catch (e) {
      console.error("account delete", (e as Error).message);
      return fail("Konto kustutamine ei õnnestunud. Proovi uuesti või kirjuta info@vaade3d.ee.", 500);
    }
    return json({ ok: true, sole });
  }
  return fail("tundmatu tegevus");
});
