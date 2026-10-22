// account (GDPR) ilma päris teenusteta: Supabase auth, REST ja failihoidla on matkitud fetch'is.
// Käivita: deno test -A --no-config --node-modules-dir=none supabase/tests/account.test.ts
import { assert, assertEquals } from "jsr:@std/assert@1";

const SB = "http://sb.test";
Object.entries({ SUPABASE_URL: SB, SUPABASE_SERVICE_ROLE_KEY: "service-role-key-for-tests-only-123456" }).forEach(([k, v]) => Deno.env.set(k, v));
const W = { calls: [] as string[], removed: [] as string[], members: 1 };
// failid: uploads/c1/in/a.jpg (privaatne), models/c1/m.glb (avalik)
const TREE: Record<string, { name: string; id: string | null }[]> = {
  "uploads:c1": [{ name: "in", id: null }], "uploads:c1/in": [{ name: "a.jpg", id: "f1" }], "models:c1": [{ name: "m.glb", id: "f2" }],
};
const res = (b: unknown, status = 200, h: Record<string, string> = {}) => new Response(b === null ? null : JSON.stringify(b), { status, headers: { "content-type": "application/json", ...h } });
globalThis.fetch = async (input: string | URL | Request, init: RequestInit = {}) => {
  const req = input instanceof Request ? input : new Request(String(input), init);
  const u = new URL(req.url), p = u.pathname;
  W.calls.push(req.method + " " + p);
  if (p === "/auth/v1/user") return req.headers.get("authorization") === "Bearer good" ? res({ id: "u1", aud: "authenticated" }) : res({ msg: "bad" }, 401);
  if (p === "/auth/v1/admin/users/u1") return req.method === "DELETE" ? res({}) : res({ id: "u1", email: "mari@firma.ee", created_at: "2026-10-01", user_metadata: { name: "Mari" } });
  if (p === "/rest/v1/profiles") return req.method === "HEAD" ? res(null, 200, { "content-range": `*/${W.members}` }) : res({ company_id: "c1", user_id: "u1", name: "Mari" });
  if (p === "/rest/v1/rpc/rate_hit") return res(true);
  if (p === "/rest/v1/rpc/delete_account_data") { assertEquals((await req.json()).p_uid, "u1"); return res({ company_id: "c1", sole: true }); }
  if (p === "/rest/v1/companies") return res({ id: "c1", name: "Firma OÜ" });
  if (p === "/rest/v1/objects") return res([{ id: "o1", address: "Tänav 1" }]);
  if (p.startsWith("/rest/v1/")) return res([]);
  const ls = p.match(/^\/storage\/v1\/object\/list\/(\w+)$/);
  if (ls) { const b = await req.json(); return res(b.offset ? [] : TREE[`${ls[1]}:${b.prefix}`] || []); }
  if (p === "/storage/v1/object/sign/uploads") { const b = await req.json(); return res(b.paths.map((x: string) => ({ path: x, signedURL: `/object/sign/uploads/${x}?token=t` }))); }
  const rm = p.match(/^\/storage\/v1\/object\/(\w+)$/);
  if (rm && req.method === "DELETE") { const b = await req.json(); W.removed.push(...b.prefixes.map((x: string) => rm[1] + "/" + x)); return res([]); }
  throw new Error("mock: tundmatu " + req.method + " " + req.url);
};
// deno-lint-ignore no-explicit-any
let handler: (r: Request) => Promise<Response> = null as any;
// deno-lint-ignore no-explicit-any
(Deno as any).serve = (h: typeof handler) => { handler = h; return {}; };
await import("../functions/account/index.ts");
const call = async (b: unknown, tok = "good") => {
  W.calls = [];
  const r = await handler(new Request("http://fn/account", { method: "POST", headers: { Authorization: "Bearer " + tok, "content-type": "application/json" }, body: JSON.stringify(b) }));
  return { status: r.status, j: await r.json() };
};

Deno.test("sisselogimata keelatud", async () => {
  assertEquals((await call({ action: "export" }, "bad")).status, 401);
  assertEquals((await call({ action: "delete", confirm: "KUSTUTA" }, "bad")).status, 401);
});

Deno.test("export: konto, firma, tabelid ja failide nimekiri (privaatsed allkirjastatud lingiga)", async () => {
  const r = await call({ action: "export" });
  assertEquals(r.status, 200);
  assertEquals(r.j.account.email, "mari@firma.ee");
  assertEquals(r.j.company.name, "Firma OÜ");
  assertEquals(r.j.objects[0].address, "Tänav 1");
  assert(Array.isArray(r.j.credit_ledger) && Array.isArray(r.j.invoices) && Array.isArray(r.j.partners));
  assertEquals(r.j.files.map((f: { bucket: string; path: string }) => f.bucket + "/" + f.path).sort(), ["models/c1/m.glb", "uploads/c1/in/a.jpg"]);
  assert(r.j.files.find((f: { bucket: string }) => f.bucket === "uploads").url.includes("token=t"));
  assert(!W.calls.some((c) => c.startsWith("DELETE")), "eksport ei kustuta midagi");
});

Deno.test("delete: ilma kinnituseta 400, midagi ei kustutata", async () => {
  for (const confirm of [undefined, "", "kustuta mind", "DELETE"]) {
    const r = await call({ action: "delete", confirm });
    assertEquals(r.status, 400);
  }
  assertEquals(W.removed.length, 0);
});

Deno.test("delete (ainus liige): failid, siis andmebaas, siis sisselogimine", async () => {
  W.members = 1; W.removed = [];
  const r = await call({ action: "delete", confirm: "kustuta" });
  assertEquals(r.status, 200, JSON.stringify(r.j));
  assertEquals(r.j, { ok: true, sole: true });
  assertEquals(W.removed.sort(), ["models/c1/m.glb", "uploads/c1/in/a.jpg"]);
  const i = (s: string) => W.calls.indexOf(s);
  assert(i("DELETE /storage/v1/object/uploads") < i("POST /rest/v1/rpc/delete_account_data"));
  assert(i("POST /rest/v1/rpc/delete_account_data") < i("DELETE /auth/v1/admin/users/u1"));
});

Deno.test("delete (firmas teisi liikmeid): firma faile ei puututa", async () => {
  W.members = 2; W.removed = [];
  const r = await call({ action: "delete", confirm: "KUSTUTA" });
  assertEquals(r.j, { ok: true, sole: false });
  assertEquals(W.removed.length, 0);
  assert(W.calls.includes("DELETE /auth/v1/admin/users/u1"));
});
