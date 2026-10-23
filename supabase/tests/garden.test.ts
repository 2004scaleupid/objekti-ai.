// garden ilma päris teenusteta: äpi LOD2 andmed, Maa-ameti WMS/WFS ja failihoidla on matkitud fetch'is.
// Käivita: deno test -A --no-config --node-modules-dir=none supabase/tests/garden.test.ts
import { assert, assertEquals } from "jsr:@std/assert@1";

const SB = "http://sb.test";
Object.entries({ SUPABASE_URL: SB, SUPABASE_SERVICE_ROLE_KEY: "service-role-key-for-tests-only-123456" }).forEach(([k, v]) => Deno.env.set(k, v));
const b64u = (s: string) => btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const TOK = b64u(JSON.stringify({ alg: "HS256" })) + "." + b64u(JSON.stringify({ sub: "u1" })) + ".sig";
const W = { calls: [] as string[], store: new Map<string, string>(), uploads: [] as string[] };
const res = (b: unknown, status = 200, ct = "application/json") => new Response(typeof b === "string" ? b : b instanceof Uint8Array ? new Blob([b as BlobPart]) : JSON.stringify(b), { status, headers: { "content-type": ct } });
globalThis.fetch = async (input: string | URL | Request, init: RequestInit = {}) => {
  const req = input instanceof Request ? input : new Request(String(input), init);
  const u = new URL(req.url), p = u.pathname;
  W.calls.push(u.host + p + (u.searchParams.get("layers") ? "?" + u.searchParams.get("layers") : ""));
  if (u.origin === SB && p === "/storage/v1/object/public/lod2/v1/418.json.gz") {
    const gz = new Response(new Blob([JSON.stringify({ "120656418": { c: [545000.5, 6597000.25] } })]).stream().pipeThrough(new CompressionStream("gzip")));
    return res(new Uint8Array(await gz.arrayBuffer()), 200, "application/gzip");
  }
  if (u.host === "kaart.maaamet.ee") {
    assertEquals(u.searchParams.get("crs"), "EPSG:3301");
    assertEquals(u.searchParams.get("bbox"), "6596936.25,544936.5,6597064.25,545064.5"); // põhi, ida ±64 m
    const png = u.searchParams.get("format") === "image/png";
    return res(new Uint8Array(500), 200, png ? "image/png" : "image/jpeg");
  }
  if (u.host === "gsavalik.envir.ee" && u.pathname.includes("/etak/")) {
    assertEquals(u.searchParams.get("bbox"), "6596920.25,544920.5,6597080.25,545080.5,urn:ogc:def:crs:EPSG::3301"); // põhi, ida ±80 m
    return res(u.searchParams.get("typeNames") === "etak:e_501_tee_j"
      ? { features: [{ properties: { laius: 4, nimetus: "Tammekännu tee" }, geometry: { type: "LineString", coordinates: [[545000.5, 6597050.25], [545040.5, 6597050.25]] } }] }
      : { features: [{ properties: {}, geometry: { type: "Polygon", coordinates: [[[545000.5, 6597060.25], [545010.5, 6597060.25], [545010.5, 6597070.25], [545000.5, 6597060.25]]] } }] });
  }
  if (u.host === "gsavalik.envir.ee") return res({ features: [{ properties: { tunnus: "89001:001:1", l_aadress: "Tammekännu tee 44", pindala: 1200, geom_muudet: "2020-10-29Z" },
    geometry: { type: "Polygon", coordinates: [[[545010.5, 6597010.25], [545020.5, 6597010.25], [545020.5, 6597020.25], [545010.5, 6597010.25]]] } }] });
  if (u.origin === SB) {
    if (p === "/auth/v1/user") return req.headers.get("authorization") === "Bearer " + TOK ? res({ id: "u1", aud: "authenticated" }) : res({}, 401);
    if (p === "/rest/v1/profiles") return res({ company_id: "c1" });
    if (p === "/rest/v1/rpc/rate_hit") return res(true);
    if (p === "/rest/v1/renders") return res(u.searchParams.get("id") === "eq.r1" && u.searchParams.get("company_id") === "eq.c1" ? { ehr: "120656418" } : null);
    const up = p.match(/^\/storage\/v1\/object\/models\/(.+)$/);
    if (up && req.method === "POST") { W.uploads.push(up[1]); W.store.set(up[1], await req.text()); return res({ Key: up[1] }); }
    const pg = p.match(/^\/storage\/v1\/object\/public\/models\/(.+)$/);
    if (pg) return W.store.has(pg[1]) ? res(W.store.get(pg[1])!) : res("not found", 404);
  }
  throw new Error("mock: tundmatu " + req.method + " " + req.url);
};
// deno-lint-ignore no-explicit-any
let handler: (r: Request) => Promise<Response> = null as any;
// deno-lint-ignore no-explicit-any
(Deno as any).serve = (h: typeof handler) => { handler = h; return {}; };
await import("../functions/garden/index.ts");
const call = async (b: unknown, tok = TOK) => {
  const r = await handler(new Request("http://fn/garden", { method: "POST", headers: { Authorization: "Bearer " + tok, "content-type": "application/json" }, body: JSON.stringify(b) }));
  return { status: r.status, j: await r.json(), timing: r.headers.get("Server-Timing") || "" };
};

Deno.test("esimene kord: 4 allikat paralleelselt, 4 faili, meta suhteliste krundipiiridega", async () => {
  W.calls = [];
  const r = await call({ ehr: "120656418" });
  assertEquals(r.status, 200, JSON.stringify(r.j));
  assertEquals(r.j.cached, false);
  assertEquals(W.uploads.sort(), ["aed/120656418/fences.png", "aed/120656418/meta.json", "aed/120656418/ndsm.png"]);
  assert(!W.calls.some((c) => c.includes("EESTIFOTO")), "ortofotot enam ei laeta");
  assert(W.calls.includes("kaart.maaamet.ee/wms/fotokaart?nDSM") && W.calls.includes("kaart.maaamet.ee/wms/kaart?etak_piirded"));
  const meta = JSON.parse(W.store.get("aed/120656418/meta.json")!);
  assertEquals(meta.c, [545000.5, 6597000.25]);
  assertEquals(meta.parcels[0].p, 1200);
  assertEquals(meta.parcels[0].g[0].slice(0, 4), [10, 10, 20, 10]);
  assertEquals(meta.v, 5);
  assertEquals(meta.parcels[0].d, "2020-10-29");
  assertEquals(meta.roads.l[0], { w: 4, n: "Tammekännu tee", g: [0, 50, 40, 50] });
  assertEquals(meta.roads.a[0][0].slice(0, 2), [0, 60]);
  assert(/auth;dur=\d+, cache;dur=\d+, lod2;dur=\d+, maaamet;dur=\d+, store;dur=\d+, total;dur=\d+/.test(r.timing), r.timing);
});

Deno.test("teine kord: vahemälust, Maa-ametit ei kutsuta", async () => {
  W.calls = [];
  const r = await call({ ehr: "120656418" });
  assertEquals(r.j.cached, true);
  assert(!W.calls.some((c) => c.startsWith("kaart.maaamet.ee") || c.startsWith("gsavalik")));
});

Deno.test("ref -> oma firma töö EHR; võõras töö, vigane ehr ja sisselogimata keelatud", async () => {
  assertEquals((await call({ ref: "r1" })).j.ehr, "120656418");
  assertEquals((await call({ ref: "voras" })).status, 400);
  assertEquals((await call({ ehr: "12; drop" })).status, 400);
  assertEquals((await call({ ehr: "120656418" }, "x.y.z")).status, 401);
});
