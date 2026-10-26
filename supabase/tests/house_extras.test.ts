// house-extras ilma päris teenusteta (Supabase ja Anthropic matkitud).
// Käivita: deno test -A --no-config --node-modules-dir=none supabase/tests/house_extras.test.ts
import { assert, assertEquals } from "jsr:@std/assert@1";

const SB = "http://sb.test", AN = "http://an.test";
Object.entries({ SUPABASE_URL: SB, SUPABASE_SERVICE_ROLE_KEY: "service-role-key-for-tests-only-123456", ANTHROPIC_API_KEY: "test-key", ANTHROPIC_API_URL: AN })
  .forEach(([k, v]) => Deno.env.set(k, v));

const W = { usage: [] as Record<string, unknown>[], an: null as null | Record<string, unknown>, anHeaders: null as null | Headers, reply: {} as unknown, status: 200, rate: true };
const res = (b: unknown, status = 200) => new Response(typeof b === "string" ? b : JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
globalThis.fetch = async (input: string | URL | Request, init: RequestInit = {}) => {
  const req = input instanceof Request ? input : new Request(String(input), init);
  const u = new URL(req.url), p = u.pathname, txt = req.method === "GET" ? "" : await req.text();
  if (u.origin === SB) {
    if (p === "/auth/v1/user") return req.headers.get("authorization") === "Bearer good" ? res({ id: "u1", aud: "authenticated" }) : res({ msg: "bad" }, 401);
    if (p === "/rest/v1/profiles") return res({ company_id: "c1" });
    if (p === "/rest/v1/rpc/rate_hit") return res(W.rate);
    if (p === "/rest/v1/ai_usage") { W.usage.push(JSON.parse(txt)); return res("", 201); }
  }
  if (u.origin + p === AN + "/v1/messages") {
    W.an = JSON.parse(txt); W.anHeaders = req.headers;
    if (W.status !== 200) return res({ error: { type: "overloaded_error" } }, W.status);
    return res({ model: "claude-sonnet-5-5", stop_reason: "end_turn", usage: { input_tokens: 10000, output_tokens: 1500 }, content: [{ type: "thinking", thinking: "" }, { type: "text", text: JSON.stringify(W.reply) }] });
  }
  throw new Error("mock: tundmatu " + req.method + " " + req.url);
};

const { handler, normalize } = await import("../functions/house-extras/index.ts");
const photo = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
const walls = [{ id: "A", len: 10, face: "S", gable: false }, { id: "B", len: 7, face: "E", gable: true }, { id: "C", len: 10, face: "N", gable: false }, { id: "D", len: 7, face: "W", gable: true }];
const call = (b: unknown, tok = "good") => handler(new Request("http://f/house-extras", { method: "POST", headers: { authorization: "Bearer " + tok, "content-type": "application/json" }, body: JSON.stringify(b) }));

Deno.test("ilma sisselogimiseta 401", async () => {
  assertEquals((await call({ photos: [photo], walls }, "bad")).status, 401);
});

Deno.test("vigased sisendid -> 400", async () => {
  assertEquals((await call({ photos: [], walls })).status, 400);
  assertEquals((await call({ photos: Array(7).fill(photo), walls })).status, 400);
  assertEquals((await call({ photos: ["http://x/y.jpg"], walls })).status, 400);
  assertEquals((await call({ photos: [photo], walls: [{ id: "A", len: 5, face: "S" }] })).status, 400);
  assertEquals((await call({ photos: [photo], walls: [...walls.slice(0, 3), { id: "A", len: 7, face: "W" }] })).status, 400);
  assertEquals((await call({ photos: [photo], walls: walls.map((w) => ({ ...w, face: "lõuna" })) })).status, 400);
});

Deno.test("Sonnet 5.5, JSON-skeem, võti saladusest, kulu logitakse", async () => {
  W.usage = [];
  W.reply = { photos: [{ i: 0, wall: "A", conf: 0.8 }, { i: 1, wall: "Z", conf: 0.9 }], items: [
    { t: "rodu", photo: 0, side: "facing", from: 0.7, w: 3.2, d: 1.6, z: 2.9, h: 1, note: "puitrõdu <b>" },
    { t: "terr", photo: 0, side: "right", from: 0.4, w: 99, d: 3, z: 0, h: 0.4, note: "puitterrass" },
    { t: "aed", photo: 1, side: "facing", from: 0.5, w: 0, d: 0, z: 0, h: 1.2, note: "lippaed" },
    { t: "aed", photo: 0, side: "left", from: 0.5, w: 0, d: 0, z: 0, h: 1.1, note: "lippaed" },
    { t: "katus", photo: 0, side: "facing", from: 0.5, w: 1, d: 1, z: 0, h: 1, note: "x" },
    { t: "juur", photo: 5, side: "facing", from: 0.5, w: 3, d: 3, z: 0, h: 3, note: "vale foto" },
  ], summary: "Leidsin rõdu, terrassi ja aia." };
  const r = await call({ photos: [photo, photo], walls, eave: 3.1, ridge: 7.4 });
  assertEquals(r.status, 200);
  const j = await r.json();
  const an = W.an!;
  assertEquals(an.model, "claude-sonnet-5-5");
  assertEquals(W.anHeaders!.get("x-api-key"), "test-key");
  assertEquals((an.output_config as Record<string, Record<string, unknown>>).format.type, "json_schema");
  const content = (an.messages as { content: { type: string; text?: string }[] }[])[0].content;
  assertEquals(content.filter((c) => c.type === "image").length, 2);
  assert(content.at(-1)!.text!.includes("A: 10 m, faces S") && content.at(-1)!.text!.includes("B: 7 m, faces E, gable") && content.at(-1)!.text!.includes("Eave height 3.1 m"));
  // tundmatu sein -> null, vale liik ja vale foto välja, aed ainult üks korra, numbrid piiratud, HTML välja
  assertEquals(j.photos, [{ i: 0, wall: "A", conf: 0.8 }, { i: 1, wall: null, conf: 0 }]);
  assertEquals(j.items.map((x: { t: string }) => x.t), ["rodu", "terr", "aed"]);
  assertEquals(j.items[0], { t: "rodu", photo: 0, side: "facing", from: 0.7, w: 3.2, d: 1.6, z: 2.9, h: 1, note: "puitrõdu b" });
  assertEquals(j.items[1].w, 30);
  assertEquals(W.usage.length, 1);
  assertEquals(W.usage[0].kind, "extras");
  assertEquals(W.usage[0].cost_usd, (10000 * 2 + 1500 * 10) / 1e6);
});

Deno.test("EXTRAS_MODEL vahetab mudeli (Haiku hind)", async () => {
  Deno.env.set("EXTRAS_MODEL", "claude-haiku-5-5"); W.usage = [];
  W.reply = { photos: [], items: [], summary: "" };
  await call({ photos: [photo], walls });
  assertEquals(W.an!.model, "claude-haiku-5-5");
  Deno.env.delete("EXTRAS_MODEL");
});

Deno.test("Anthropic viga -> 502 ilma detailideta, piirang -> 429", async () => {
  W.status = 529;
  const r = await call({ photos: [photo], walls });
  assertEquals(r.status, 502);
  assert(!(await r.text()).includes("overloaded"));
  W.status = 200; W.rate = false;
  assertEquals((await call({ photos: [photo], walls })).status, 429);
  W.rate = true;
});

Deno.test("normalize: tühi / vigane vastus", () => {
  const n = normalize({}, 2, walls);
  assertEquals(n, { photos: [{ i: 0, wall: null, conf: 0 }, { i: 1, wall: null, conf: 0 }], items: [], summary: "" });
});
