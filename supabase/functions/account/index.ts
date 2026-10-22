// Konto andmed (GDPR): { action: "export" } -> kõik minu andmed JSON-ina + failide nimekiri; { action: "delete", confirm: "KUSTUTA" } -> konto kustutamine.
// Kustutamine: 1) firma failid (ainus liige), 2) andmebaas ühe tehinguna (delete_account_data), 3) sisselogimise kasutaja. Iga samm on korratav.
import { cors, json, fail, admin, body, userCompany, rateLimit } from "../_shared/util.ts";

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
  const me = await userCompany(req);
  if (!me) return fail("unauthorized", 401);
  const b = await body(req, 10_000).catch(() => ({} as Record<string, unknown>));
  const db = admin();

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
