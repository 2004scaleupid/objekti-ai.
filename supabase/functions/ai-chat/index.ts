// AI-abiline: Claude API, ainult objekti andmete põhjal.
import { cors, json, fail, userCompany, rateLimit, env, body, tfetch } from "../_shared/util.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fail("POST only", 405);
  const me = await userCompany(req);
  if (!me) return fail("unauthorized", 401);
  // AI-abiline on tasuta, seega piirame: 80 küsimust päevas ja 20 tunnis firma kohta
  if (!(await rateLimit("chat-d:" + me.companyId, 80, 86400)) || !(await rateLimit("chat-h:" + me.companyId, 20, 3600))) return fail("AI-abilise limiit on täis, proovi hiljem uuesti", 429);
  let b: Record<string, unknown>;
  try { b = await body(req, 200_000); } catch { return fail("liiga suur", 413); }
  const role = String(b.role || "katuse- ja fassaadifirmadele").slice(0, 200);
  const ctx = JSON.stringify(b.context ?? {}).slice(0, 15000);
  const history = (Array.isArray(b.messages) ? b.messages : []).slice(-8).map((m: { role?: string; content?: string }) => ({
    role: m?.role === "assistant" ? "assistant" : "user", content: String(m?.content ?? "").slice(0, 2000) })).filter((m) => m.content);
  if (!history.length || history[history.length - 1].role !== "user") return fail("küsimus puudub");
  const system = `Oled Vaade3D abiline Eesti ${role}. Kui küsitakse kogust või materjali, arvesta ettevõtte materjalide ja tegevusaladega (andmetes "ettevote") ning lisa ettevõtte varu (varu_katus_pct ja varu_fassaad_pct) ja ütle, et varu on soovituslik. Vasta eesti keeles, lühidalt (2–5 lauset), konkreetsete numbritega. Arvuta ainult allolevate andmete põhjal, näita lühidalt arvutuskäiku ja ütle selgelt, mis on hinnang ja mis riigi andmetest. Kui andmetest ei piisa, ütle mida on vaja. Hindu ära paku. Räägi ainult selle objekti ja ehitustöödega seotud teemadel.\n\nOBJEKTI ANDMED (JSON):\n${ctx}`;
  try {
    const r = await tfetch(env("ANTHROPIC_API_URL", "https://api.anthropic.com") + "/v1/messages", {
      method: "POST",
      headers: { "x-api-key": env("ANTHROPIC_API_KEY"), "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: env("ANTHROPIC_MODEL", "claude-haiku-5-5"), max_tokens: 600, system, messages: history }),
    }, 45000);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { console.error("anthropic", r.status, JSON.stringify(j).slice(0, 300)); return fail("AI-abiline ei vastanud, proovi uuesti", 502); }
    return json({ text: (j.content || []).map((c: { text?: string }) => c.text || "").join("") });
  } catch { return fail("AI-abiline ei vastanud, proovi uuesti", 502); }
});
