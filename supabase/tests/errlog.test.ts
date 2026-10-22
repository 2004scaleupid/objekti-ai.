// Edge Functionite console.error -> client_errors. Käivita: deno test -A --no-config --node-modules-dir=none supabase/tests/errlog.test.ts
import { assert, assertEquals } from "jsr:@std/assert@1";
Object.entries({ SUPABASE_URL: "http://sb.test", SUPABASE_SERVICE_ROLE_KEY: "service-role-key-for-tests-only-123456" }).forEach(([k, v]) => Deno.env.set(k, v));
const rows: Record<string, unknown>[] = [], jobs: Promise<unknown>[] = [];
// deno-lint-ignore no-explicit-any
(globalThis as any).EdgeRuntime = { waitUntil: (p: Promise<unknown>) => jobs.push(p) };
globalThis.fetch = async (input: string | URL | Request, init: RequestInit = {}) => {
  const req = input instanceof Request ? input : new Request(String(input), init);
  if (new URL(req.url).pathname === "/rest/v1/client_errors") { const b = await req.json(); rows.push(...(Array.isArray(b) ? b : [b])); return new Response("", { status: 201 }); }
  throw new Error("mock: " + req.url);
};
await import("../functions/_shared/util.ts");

Deno.test("console.error salvestatakse puhastatult, max 20 minutis", async () => {
  console.error("checkout", "kliendi mari@firma.ee makse ebaõnnestus", new Error("stripe 500"));
  for (let i = 0; i < 30; i++) console.error("üle piiri", i);
  await Promise.all(jobs);
  assertEquals(rows.length, 20);
  assertEquals(rows[0].source, "fn:unknown"); // testis pole funktsiooni kausta
  assertEquals(rows[0].kind, "fn");
  assertEquals(rows[0].message, "checkout kliendi [e-post] makse ebaõnnestus stripe 500");
  assert(String(rows[0].stack).startsWith("Error: stripe 500"));
});
