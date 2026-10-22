// Admini ülevaade: Kie.ai krediidid (otse Kie'st) ja Claude'i kulu (meie enda logist + soovi korral Anthropicu Admin API-st).
import { cors, json, fail, userCompany, admin, env, tfetch, body } from "../_shared/util.ts";

const monthStart = () => { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString(); };
const dayStart = () => { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString(); };
const sum = (rows: { cost_usd: number | string }[] | null) => (rows || []).reduce((a, r) => a + Number(r.cost_usd || 0), 0);

async function kie() {
  const key = env("KIE_API_KEY");
  if (!key) return { ok: false, error: "KIE_API_KEY puudub" };
  try {
    const r = await tfetch(env("KIE_API_BASE", "https://api.kie.ai/api/v1") + "/chat/credit", { headers: { Authorization: `Bearer ${key}` } }, 8000);
    const j = await r.json().catch(() => ({}));
    const credits = Number(j?.data);
    if (!r.ok || !Number.isFinite(credits)) return { ok: false, error: `Kie vastas ${r.status}` };
    const per = Number(env("KIE_CREDITS_PER_IMAGE", "4"));
    return { ok: true, credits, per_image: per, images_left: Math.floor(credits / per), usd_per_credit: Number(env("KIE_USD_PER_CREDIT", "0.005")) };
  } catch { return { ok: false, error: "Kie ei vastanud" }; }
}

async function anthropicReport() {
  // päris kulu Anthropicult, kui Admin API võti on lisatud (sk-ant-admin01-...)
  const key = env("ANTHROPIC_ADMIN_KEY");
  if (!key) return null;
  try {
    const u = new URL("https://api.anthropic.com/v1/organizations/cost_report");
    u.searchParams.set("starting_at", monthStart()); u.searchParams.set("ending_at", new Date().toISOString());
    let total = 0, page: string | null = null, n = 0;
    do {
      if (page) u.searchParams.set("page", page);
      const r = await tfetch(u.toString(), { headers: { "x-api-key": key, "anthropic-version": "2023-06-01" } }, 10000);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return { ok: false, error: `Anthropic vastas ${r.status}` };
      for (const b of j.data || []) for (const x of b.results || []) total += Number(x.amount || 0);
      page = j.has_more ? j.next_page : null;
    } while (page && ++n < 10);
    return { ok: true, month_usd: total / 100 }; // summad tulevad sentides
  } catch { return { ok: false, error: "Anthropic ei vastanud" }; }
}

/** Väljaminev liiklus (egress) hinnanguliselt: failihoidla päringud 7 päeva (Management API) × keskmine vastus.
 *  Täpset baitide arvu Supabase API ei anna (ainult armatuurlaua Usage leht). Vajab saladust SUPABASE_MGMT_TOKEN. */
export async function egress() {
  const tok = env("SUPABASE_MGMT_TOKEN"), ref = (env("SUPABASE_URL").match(/https:\/\/([a-z0-9]+)\./) || [])[1];
  const dash = ref ? `https://supabase.com/dashboard/project/${ref}/settings/usage` : null;
  if (!tok || !ref) return { ok: false, dash, error: "SUPABASE_MGMT_TOKEN puudub" };
  try {
    const r = await tfetch(`https://api.supabase.com/v1/projects/${ref}/analytics/endpoints/usage.api-counts?interval=7day`, { headers: { Authorization: `Bearer ${tok}` } }, 8000);
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !Array.isArray(j.result)) return { ok: false, dash, error: `Supabase vastas ${r.status}` };
    const req7 = j.result.reduce((a: number, x: { total_storage_requests?: number }) => a + Number(x.total_storage_requests || 0), 0);
    const kb = Number(env("EGRESS_AVG_KB", "120")); // LOD2 kild ~95 KB, ruut 1-20 KB, .glb mitu MB
    return { ok: true, dash, storage_requests_7d: req7, avg_kb: kb, month_gb_est: Math.round(req7 / 7 * 30 * kb / 1e6 * 100) / 100, limit_gb: 5 };
  } catch { return { ok: false, dash, error: "Supabase ei vastanud" }; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const me = await userCompany(req);
  if (!me) return fail("unauthorized", 401);
  const db = admin();
  const { data: p } = await db.from("profiles").select("is_admin").eq("user_id", me.userId).single();
  if (!p?.is_admin) return fail("forbidden", 403);

  // admin märgib, et laadis teenuse kontole raha (hinnangulise jäägi jaoks)
  if (req.method === "POST") {
    const b = await body(req, 2000).catch(() => ({} as Record<string, unknown>));
    const amt = Math.round(Number(b.amount_usd) * 100) / 100;
    if (!["anthropic", "kie"].includes(String(b.service)) || !(amt > 0 && amt < 100000)) return fail("vigane summa");
    const { error } = await db.from("service_topups").insert({ service: b.service, amount_usd: amt });
    if (error) return fail("salvestamine ebaõnnestus", 500);
  }

  const [k, rep, month, today, topup, imgs, eg] = await Promise.all([
    kie(), anthropicReport(),
    db.from("ai_usage").select("cost_usd,input_tokens,output_tokens").gte("created_at", monthStart()).limit(100000),
    db.from("ai_usage").select("cost_usd").gte("created_at", dayStart()).limit(100000),
    db.from("service_topups").select("amount_usd,created_at").eq("service", "anthropic").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("renders").select("id", { count: "exact", head: true }).eq("status", "done").gte("created_at", monthStart()),
    egress(),
  ]);
  let sinceTopup: Record<string, unknown> | null = null;
  if (topup.data) {
    const { data: after } = await db.from("ai_usage").select("cost_usd").gte("created_at", topup.data.created_at).limit(100000);
    const spent = sum(after);
    sinceTopup = { topup_usd: Number(topup.data.amount_usd), at: topup.data.created_at, spent_usd: spent, left_usd: Number(topup.data.amount_usd) - spent };
  }
  const m = month.data || [];
  return json({
    kie: { ...k, images_month: imgs.count ?? 0 },
    claude: {
      model: env("ANTHROPIC_MODEL", "claude-haiku-5-5"), key_set: !!env("ANTHROPIC_API_KEY"),
      month: { chats: m.length, input_tokens: m.reduce((a, r) => a + (r.input_tokens || 0), 0), output_tokens: m.reduce((a, r) => a + (r.output_tokens || 0), 0), cost_usd: sum(m) },
      today_usd: sum(today.data), since_topup: sinceTopup, report: rep,
    },
    egress: eg,
    at: new Date().toISOString(),
  });
});
