// AI-abiline: Claude API, ainult objekti andmete põhjal.
import { cors, json, fail, userCompany, rateLimit, env } from "../_shared/util.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const me = await userCompany(req);
  if (!me) return fail("unauthorized", 401);
  if (!(await rateLimit("chat:" + me.companyId, 200, 86400))) return fail("Päevane AI-abilise limiit on täis", 429);
  const b = await req.json().catch(() => ({}));
  const role = String(b.role || "katuse- ja fassaadifirmadele").slice(0, 300);
  const ctx = JSON.stringify(b.context ?? {}).slice(0, 30000);
  const history = (Array.isArray(b.messages) ? b.messages : []).slice(-8).map((m: { role: string; content: string }) => ({
    role: m.role === "assistant" ? "assistant" : "user", content: String(m.content).slice(0, 4000) }));
  if (!history.length) return fail("küsimus puudub");
  const system = `Oled Vaade3D abiline Eesti ${role}. Vasta eesti keeles, lühidalt (2–5 lauset), konkreetsete numbritega. Arvuta ainult allolevate andmete põhjal, näita lühidalt arvutuskäiku ja ütle selgelt, mis on hinnang ja mis riigi andmetest. Kui andmetest ei piisa, ütle mida on vaja. Hindu ära paku.\n\nOBJEKTI ANDMED (JSON):\n${ctx}`;
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": env("ANTHROPIC_API_KEY"), "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: env("ANTHROPIC_MODEL", "claude-haiku-4-5"), max_tokens: 600, system, messages: history }),
  });
  const j = await r.json();
  if (!r.ok) return fail("AI viga: " + (j?.error?.message || r.status), 502);
  return json({ text: (j.content || []).map((c: { text?: string }) => c.text || "").join("") });
});
