// photo-scene ilma päris teenusteta. Käivita: deno test -A --no-config --node-modules-dir=none supabase/tests/scene.test.ts
import { assert, assertEquals } from "jsr:@std/assert@1";
const SB = "http://sb.test", AN = "http://an.test";
Object.entries({ SUPABASE_URL: SB, SUPABASE_SERVICE_ROLE_KEY: "service-role-key-for-tests-only-123456", ANTHROPIC_API_URL: AN, ANTHROPIC_API_KEY: "k" }).forEach(([k, v]) => Deno.env.set(k, v));
const W = { an: 0, usage: [] as Record<string, unknown>[], cache: new Map<string, unknown>(), rate: true, reply: "" };
const res = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
globalThis.fetch = async (input: string | URL | Request, init: RequestInit = {}) => {
  const req = input instanceof Request ? input : new Request(String(input), init);
  const u = new URL(req.url), p = u.pathname;
  if (p === "/auth/v1/user") return req.headers.get("authorization") === "Bearer good" ? res({ id: "u1", aud: "authenticated" }) : res({}, 401);
  if (p === "/rest/v1/profiles") return res({ company_id: "c1" });
  if (p === "/rest/v1/rpc/rate_hit") return res(W.rate);
  if (p === "/rest/v1/photo_scenes" && req.method === "GET") { const h = (u.searchParams.get("hash") || "").slice(3); return W.cache.has(h) ? res(W.cache.get(h)) : res(null, 406); }
  if (p === "/rest/v1/photo_scenes" && req.method === "POST") { const b = await req.json(); W.cache.set(b.hash, { scene: b.scene, room_type: b.room_type, features: b.features }); return res(null, 201); }
  if (p === "/rest/v1/photo_scenes" && req.method === "DELETE") return res(null, 204);
  if (p === "/rest/v1/ai_usage") { W.usage.push(await req.json()); return res(null, 201); }
  if (u.origin === AN) { W.an++; const rq = await req.json(); assertEquals(rq.output_config.format.type, "json_schema"); assert(rq.messages.at(-1).role === "user", "eeltäitmist pole"); return res({ model: "claude-haiku-5-5", usage: { input_tokens: 700, output_tokens: 40 }, content: [{ type: "thinking", thinking: "" }, { type: "text", text: W.reply }] }); }
  throw new Error("mock: " + req.method + " " + req.url);
};
// deno-lint-ignore no-explicit-any
let handler: (r: Request) => Promise<Response> = null as any;
// deno-lint-ignore no-explicit-any
(Deno as any).serve = (h: typeof handler) => { handler = h; return {}; };
await import("../functions/photo-scene/index.ts");
const IMG = "data:image/jpeg;base64," + btoa("x".repeat(300));
const H = (c: string) => c.repeat(64);
const call = async (b: unknown, tok = "good") => { const r = await handler(new Request("http://fn/photo-scene", { method: "POST", headers: { Authorization: "Bearer " + tok, "content-type": "application/json" }, body: JSON.stringify(b) })); return { status: r.status, j: await r.json() }; };

Deno.test("klassifitseerib, puhastab väärtused, logib kulu; sama räsi teist korda vahemälust", async () => {
  W.reply = '{"scene":"interior_room","room_type":"bedroom","features":["Voodi","öölambid","<script>","voodi","väga-väga-pikk-sõna-mis-ei-mahu-ära","aknad"]}';
  const r = await call({ hash: H("a"), image: IMG });
  assertEquals(r.status, 200);
  assertEquals(r.j, { scene: "interior_room", room_type: "bedroom", features: ["voodi", "öölambid", "aknad"], cached: false });
  assertEquals(W.usage.at(-1)!.kind, "scene");
  assert(Number(W.usage.at(-1)!.cost_usd) > 0);
  const n = W.an;
  const c = await call({ hash: H("a"), image: IMG });
  assertEquals(c.j.cached, true);
  assertEquals(c.j.scene, "interior_room");
  assertEquals(W.an, n, "vahemälust ei kutsuta mudelit");
});

Deno.test("tundmatu stseen -> other, toa tüüp ainult siseruumil", async () => {
  W.reply = '{"scene":"spaceship","room_type":"kitchen","features":[]}';
  assertEquals((await call({ hash: H("b"), image: IMG })).j.scene, "other");
  W.reply = '{"scene":"exterior_house","room_type":"kitchen","features":["katus"]}';
  const r = await call({ hash: H("c"), image: IMG });
  assertEquals([r.j.scene, r.j.room_type, r.j.features], ["exterior_house", null, ["katus"]]);
});

Deno.test("pooleks lõigatud vastus: stseen kätte, vahemällu ei panda", async () => {
  W.reply = '{"scene":"interior_room","room_type":"kitchen","features":["köögikapid","laud","tool","aken","pliit","külmkapp","valamu","rippl';
  const r = await call({ hash: H("9"), image: IMG });
  assertEquals([r.j.scene, r.j.room_type], ["interior_room", "kitchen"]);
  assert(!W.cache.has(H("9")), "poolikut tulemust ei salvestata");
});

Deno.test("sisselogimata 401, vigane räsi/pilt 400, piirang 429", async () => {
  assertEquals((await call({ hash: H("d"), image: IMG }, "bad")).status, 401);
  assertEquals((await call({ hash: "abc", image: IMG })).status, 400);
  assertEquals((await call({ hash: H("e"), image: "http://x/y.jpg" })).status, 400);
  W.rate = false;
  assertEquals((await call({ hash: H("f"), image: IMG })).status, 429);
  W.rate = true;
});
