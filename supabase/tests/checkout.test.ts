// checkout ilma päris teenusteta: Supabase REST/auth ja Stripe on matkitud fetch'is, JWT allkirjastatakse testis ES256 võtmega.
// Käivita: deno test -A --no-config --node-modules-dir=none supabase/tests/checkout.test.ts
import { assert, assertEquals } from "jsr:@std/assert@1";

const SB = "http://sb.test", ST = "http://stripe.test";
const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]) as CryptoKeyPair;
const pub = { ...(await crypto.subtle.exportKey("jwk", kp.publicKey)), kid: "k1", alg: "ES256" };
Object.entries({
  SUPABASE_URL: SB, SUPABASE_SERVICE_ROLE_KEY: "service-role-key-for-tests-only-123456", STRIPE_SECRET_KEY: "sk_test_x", STRIPE_API_URL: ST,
  SUPABASE_JWKS: JSON.stringify({ keys: [pub] }),
}).forEach(([k, v]) => Deno.env.set(k, v));

const b64u = (b: Uint8Array | string) => btoa(typeof b === "string" ? b : String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function jwt(claims: Record<string, unknown>, head: Record<string, unknown> = { alg: "ES256", kid: "k1", typ: "JWT" }, key = kp.privateKey) {
  const h = b64u(JSON.stringify(head)), p = b64u(JSON.stringify(claims));
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(h + "." + p)));
  return `${h}.${p}.${b64u(sig)}`;
}
const now = () => Math.floor(Date.now() / 1000);
const HS = (x: string) => b64u(JSON.stringify({ alg: "HS256", typ: "JWT" })) + "." + b64u(JSON.stringify({ sub: x })) + ".sig";
const W = { calls: [] as string[], rate: true, stripe: [] as URLSearchParams[] };
const res = (b: unknown, status = 200) => new Response(typeof b === "string" ? b : JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
globalThis.fetch = async (input: string | URL | Request, init: RequestInit = {}) => {
  const req = input instanceof Request ? input : new Request(String(input), init);
  const u = new URL(req.url), p = u.pathname;
  W.calls.push(req.method + " " + p);
  if (u.origin === SB) {
    if (p === "/auth/v1/user") return req.headers.get("authorization") === "Bearer " + HS("good") ? res({ id: "u1", aud: "authenticated" }) : res({ msg: "bad" }, 401);
    if (p === "/rest/v1/profiles") return res(u.searchParams.get("user_id") === "eq.u1" ? { company_id: "c1" } : null, u.searchParams.get("user_id") === "eq.u1" ? 200 : 406);
    if (p === "/rest/v1/rpc/rate_hit") { assertEquals((await req.json()).p_key, "checkout:u:u1"); return res(W.rate); }
    if (p === "/rest/v1/settings") return res({ credit_eur: 0.5 });
  }
  if (u.origin + p === ST + "/v1/checkout/sessions") { W.stripe.push(new URLSearchParams(await req.text())); return res({ url: "https://checkout.stripe.com/c/pay/cs_test_1" }); }
  throw new Error("mock: tundmatu " + req.method + " " + req.url);
};
// deno-lint-ignore no-explicit-any
let handler: (r: Request) => Promise<Response> = null as any;
// deno-lint-ignore no-explicit-any
(Deno as any).serve = (h: typeof handler) => { handler = h; return {}; };
await import("../functions/checkout/index.ts");
const call = async (b: unknown, tok?: string) => {
  W.calls = [];
  const r = await handler(new Request("http://fn/checkout", { method: "POST", headers: { ...(tok ? { Authorization: "Bearer " + tok } : {}), "content-type": "application/json" }, body: JSON.stringify(b) }));
  return { status: r.status, j: await r.json(), timing: r.headers.get("Server-Timing") || "", expose: r.headers.get("Access-Control-Expose-Headers") };
};
const good = () => jwt({ sub: "u1", role: "authenticated", exp: now() + 600 });

Deno.test("eelsoojendus vastab ilma sisselogimise ja andmebaasita", async () => {
  const r = await call({ warm: true });
  assertEquals(r.status, 200);
  assertEquals(W.calls.length, 0);
});

Deno.test("kehtiv ES256 token: üks andmebaasi ring, Stripe, ajad päises; auth teenust ei kutsuta", async () => {
  W.rate = true;
  const r = await call({ pack: "220", return_url: "https://app.vaade3d.ee/" }, await good());
  assertEquals(r.status, 200, JSON.stringify(r.j));
  assertEquals(r.j.url, "https://checkout.stripe.com/c/pay/cs_test_1");
  assert(!W.calls.includes("GET /auth/v1/user"));
  assert(/auth;dur=\d+, db;dur=\d+, stripe;dur=\d+, total;dur=\d+/.test(r.timing), r.timing);
  assertEquals(r.expose, "Server-Timing");
  const f = W.stripe.at(-1)!;
  assertEquals(f.get("metadata[company_id]"), "c1");
  assertEquals(f.get("metadata[credits]"), "220");
  assertEquals(f.get("line_items[0][price_data][unit_amount]"), "10000");
});

Deno.test("vale allkiri, aegunud token, vale roll ja võõras võti -> 401", async () => {
  const t = await good();
  const bad = t.slice(0, -4) + (t.endsWith("AAAA") ? "BBBB" : "AAAA");
  const other = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]) as CryptoKeyPair).privateKey;
  for (const tok of [bad, await jwt({ sub: "u1", role: "authenticated", exp: now() - 5 }), await jwt({ sub: "u1", role: "anon", exp: now() + 600 }),
    await jwt({ sub: "u1", role: "authenticated", exp: now() + 600 }, undefined, other)]) {
    assertEquals((await call({ pack: "100" }, tok)).status, 401);
  }
  assertEquals((await call({ pack: "100" })).status, 401);
});

Deno.test("vana HS256 token -> auth teenus (tagavara)", async () => {
  const ok = await call({ pack: "100" }, HS("good"));
  assertEquals(ok.status, 200);
  assert(W.calls.includes("GET /auth/v1/user"));
  assertEquals((await call({ pack: "100" }, HS("bad"))).status, 401);
});

Deno.test("kiiruspiirang ja vaba kogus", async () => {
  W.rate = false;
  assertEquals((await call({ pack: "100" }, await good())).status, 429);
  W.rate = true;
  const c = await call({ pack: "custom", credits: 30 }, await good());
  assertEquals(c.status, 200);
  assertEquals(W.stripe.at(-1)!.get("line_items[0][price_data][unit_amount]"), "1500");
  assertEquals((await call({ pack: "custom", credits: 5 }, await good())).status, 400);
});
