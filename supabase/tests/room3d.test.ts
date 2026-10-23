// room-3d ilma päris teenusteta: sisselogimine, ainult meie disainivariant, mõõtude piirid, krediidi võtmine.
// Käivita: deno test -A --no-config --node-modules-dir=none supabase/tests/room3d.test.ts
import { assert, assertEquals } from "jsr:@std/assert@1";

const SB = "http://sb.test";
Object.entries({ SUPABASE_URL: SB, SUPABASE_SERVICE_ROLE_KEY: "service-role-key-for-tests-only-123456" }).forEach(([k, v]) => Deno.env.set(k, v));
const b64u = (s: string) => btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const TOK = b64u(JSON.stringify({ alg: "HS256" })) + "." + b64u(JSON.stringify({ sub: "u1" })) + ".sig";
const W = { spent: 0, inserted: [] as unknown[] };
const res = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
globalThis.fetch = async (input: string | URL | Request, init: RequestInit = {}) => {
  const req = input instanceof Request ? input : new Request(String(input), init);
  const u = new URL(req.url), p = u.pathname;
  if (u.origin === SB) {
    if (p === "/auth/v1/user") return req.headers.get("authorization") === "Bearer " + TOK ? res({ id: "u1", aud: "authenticated" }) : res({}, 401);
    if (p === "/rest/v1/profiles") return res({ company_id: "c1" });
    if (p === "/rest/v1/rpc/rate_hit") return res(true);
    if (p === "/rest/v1/rpc/refund_stale_renders") return res(0);
    if (p === "/rest/v1/rpc/spend_credits") { W.spent++; return res(20); }
    if (p === "/rest/v1/renders" && req.method === "POST") { W.inserted.push(await req.json()); return res(null, 201); }
  }
  throw new Error("mock: tundmatu " + req.method + " " + req.url);
};
// deno-lint-ignore no-explicit-any
let handler: (r: Request) => Promise<Response> = null as any;
// deno-lint-ignore no-explicit-any
(Deno as any).serve = (h: typeof handler) => { handler = h; return {}; };
await import("../functions/room-3d/index.ts");
const call = async (b: unknown, tok = TOK) => {
  const r = await handler(new Request("http://fn/room-3d", { method: "POST", headers: { Authorization: "Bearer " + tok, "content-type": "application/json" }, body: JSON.stringify(b) }));
  return { status: r.status, j: await r.json() };
};
const OURS = SB + "/storage/v1/object/public/renders/c1/abc.jpg";

Deno.test("sisselogimata keelatud", async () => {
  assertEquals((await call({ action: "start", image: OURS }, "bad")).status, 401);
});

Deno.test("ainult meie AI variant ja mõistlikud mõõdud, siis ei võeta krediiti", async () => {
  W.spent = 0;
  for (const image of ["https://evil.example/x.jpg", SB + "/storage/v1/object/public/uploads/c1/a.jpg", "data:image/png;base64,AAAA", "data:text/html;base64,AAAA", OURS + "/../x"]) {
    assertEquals((await call({ action: "start", image })).status, 400, image);
  }
  assertEquals((await call({ action: "start", image: OURS, dims: { w: 0.5, d: 4, h: 2.6 } })).status, 400);
  assertEquals((await call({ action: "start", image: OURS, dims: { w: 3, d: 4, h: 9 } })).status, 400);
  assertEquals(W.spent, 0);
});

Deno.test("start: krediidid võetakse, töö algab mõõtmisega, kasutaja mõõdud säilivad", async () => {
  W.spent = 0; W.inserted = [];
  const r = await call({ action: "start", image: OURS, dims: { w: "3,2", d: 4, h: 2.5 } });
  assertEquals(r.status, 200, JSON.stringify(r.j));
  assertEquals(W.spent, 1);
  assertEquals([r.j.status, r.j.stage, r.j.measure], ["pending", "measure", false]);
  // deno-lint-ignore no-explicit-any
  const row = W.inserted[0] as any;
  assertEquals([row.kind, row.stage, row.room.dims, row.room.src], ["3d", "measure", { w: 3.2, d: 4, h: 2.5 }, OURS]);
  assert(row.room.lock === 0);
});

Deno.test("toa fotod (asis): kuni 12 fotot, vigane foto ei maksa", async () => {
  // 1x1 JPEG
  const JPG = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=";
  W.spent = 0;
  assertEquals((await call({ action: "start", mode: "asis", photos: Array(13).fill(JPG) })).status, 400);
  assertEquals((await call({ action: "start", mode: "asis", photos: [JPG, "data:image/jpeg;base64,AAAA"] })).status, 400);
  assertEquals(W.spent, 0);
});
