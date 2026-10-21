// ai-3d ilma päris teenusteta: Supabase (auth, REST, storage), Kie, MuAPI ja Anthropic on matkitud fetch'is.
// Käivita: deno test -A supabase/tests/ai3d.test.ts
import { assert, assertEquals } from "jsr:@std/assert@1";

const SB = "http://sb.test", KIE = "http://kie.test/api/v1", MU = "http://mu.test/api/v1", AN = "http://an.test";
Object.entries({
  SUPABASE_URL: SB, SUPABASE_SERVICE_ROLE_KEY: "service-role-key-for-tests-only-123456", KIE_API_KEY: "k", KIE_API_BASE: KIE, KIE_POLL_MS: "1",
  ANTHROPIC_API_KEY: "a", ANTHROPIC_API_URL: AN, MUAPI_API_BASE: MU, "Muapi.ai ": "mukey",
}).forEach(([k, v]) => Deno.env.set(k, v));

// ---------- matkitud maailm ----------
const W = {
  renders: [] as Record<string, unknown>[], spends: [] as string[], refunds: [] as string[], usage: [] as Record<string, unknown>[],
  lastAn: null as null | Record<string, unknown>, calls: [] as string[], productUpd: [] as Record<string, unknown>[], check: {} as Record<string, unknown>, tripo: "processing", kieFail: false, balance: 100,
};
const res = (b: unknown, status = 200) => new Response(typeof b === "string" ? b : JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
const eqs = (u: URL) => [...u.searchParams].filter(([, v]) => v.startsWith("eq.")).map(([k, v]) => [k, v.slice(3)]);
const match = (row: Record<string, unknown>, u: URL) => eqs(u).every(([k, v]) => String(row[k]) === v);

globalThis.fetch = async (input: string | URL | Request, init: RequestInit = {}) => {
  const req = input instanceof Request ? input : new Request(String(input), init);
  const u = new URL(req.url), p = u.pathname, m = req.method;
  const txt = m === "GET" || m === "HEAD" ? "" : await req.text();
  const j = () => JSON.parse(txt || "{}");
  W.calls.push(m + " " + u.origin + p);
  if (u.origin === SB) {
    if (p === "/auth/v1/user") return req.headers.get("authorization") === "Bearer good" ? res({ id: "u1", aud: "authenticated" }) : res({ msg: "bad" }, 401);
    if (p === "/rest/v1/profiles") return res({ company_id: "c1" });
    if (p === "/rest/v1/objects") return res([]);
    if (p === "/rest/v1/products") {
      if (m === "PATCH") { W.productUpd.push({ q: u.search, ...j() }); return res([]); }
      return res(eqs(u).some(([k, v]) => k === "company_id" && v === "c1") && eqs(u).some(([k, v]) => k === "id" && v === "p1") ? [{ id: "p1" }] : []);
    }
    if (p === "/rest/v1/ai_usage") { W.usage.push(j()); return res("", 201); }
    if (p === "/rest/v1/rpc/rate_hit") return res(true);
    if (p === "/rest/v1/rpc/refund_stale_renders") return res(0);
    if (p === "/rest/v1/rpc/app_secret") return res(null);
    if (p === "/rest/v1/rpc/spend_credits") { if (W.balance < 10) return res({ message: "insufficient_credits" }, 400); W.balance -= 10; W.spends.push(j().p_ref); return res(W.balance); }
    if (p === "/rest/v1/rpc/refund_credits") { W.refunds.push(j().p_ref); return res(10); }
    if (p === "/rest/v1/renders") {
      if (m === "POST") { W.renders.push({ status: "pending", ...j() }); return res("", 201); }
      const rows = W.renders.filter((r) => match(r, u));
      if (m === "PATCH") { rows.forEach((r) => Object.assign(r, j())); return res(rows); }
      return res(rows);
    }
    if (/^\/storage\/v1\/object\/sign\//.test(p)) return res({ signedURL: p.replace("/storage/v1", "") + "?token=t" });
    if (/^\/storage\/v1\/object\//.test(p)) return res({ Key: p });
  }
  if (u.origin + p === KIE + "/jobs/createTask") return res({ data: { taskId: "t1" } });
  if (u.origin + p === KIE + "/jobs/recordInfo") return res({ data: W.kieFail ? { state: "fail", failMsg: "x" } : { state: "success", resultJson: JSON.stringify({ resultUrls: ["http://img.test/c.jpg"] }) } });
  if (u.origin === "http://img.test") return new Response(new Uint8Array(5000));
  if (u.origin + p === MU + "/tripo3d-h31-multiview-to-3d" || u.origin + p === MU + "/tripo3d-h31-image-to-3d") {
    assertEquals(req.headers.get("x-api-key"), "mukey");
    const b = j(); assert(b.pbr === true && b.texture_quality === "detailed" && b.face_limit === 150000);
    return res({ request_id: "r1", cost: { amount_usd: 0.3 } });
  }
  if (u.origin + p === MU + "/predictions/r1/result") return res({ status: W.tripo, outputs: W.tripo === "completed" ? ["http://mu.test/m.glb?x=1"] : [] });
  if (u.origin + p === "http://mu.test/m.glb") return new Response(new Uint8Array(3000));
  if (u.origin + p === AN + "/v1/messages") { W.lastAn = JSON.parse(txt); } if (u.origin + p === AN + "/v1/messages") return res({ model: "claude-haiku-5-5", usage: { input_tokens: 4000, output_tokens: 200 }, content: [{ type: "text", text: "Siin: " + JSON.stringify(W.check) }] });
  throw new Error("mock: tundmatu " + m + " " + req.url);
};

// funktsioon ilma serverita: püüame käsitleja kinni
// deno-lint-ignore no-explicit-any
(Deno as any).serve = () => ({});
const { handler } = await import("../functions/ai-3d/index.ts");
const call = async (b: unknown, tok = "good") => {
  const r = await handler(new Request("http://fn/ai-3d", { method: "POST", headers: { Authorization: "Bearer " + tok, "content-type": "application/json" }, body: JSON.stringify(b) }));
  return { status: r.status, j: await r.json() };
};
const photo = (n: number) => "data:image/jpeg;base64," + btoa("photo-" + n + "-" + "x".repeat(50));
const P4 = [0, 1, 2, 3].map(photo);
const good = (subject = "building", n = 4) => ({ subject, ok: true, photos: [...Array(n)].map((_, i) => ({ slot: i, side: ["front", "left", "back", "right"][i], ok: true, issues: [] })), summary: "Fotod on head." });

Deno.test("ilma sisselogimiseta keeldub", async () => {
  assertEquals((await call({ action: "check", photos: P4 }, "bad")).status, 401);
});

Deno.test("check → start → status → done", async () => {
  W.check = good();
  const c = await call({ action: "check", subject: "building", photos: P4 });
  assertEquals(c.status, 200);
  assert(c.j.ok && c.j.token && c.j.slots.length === 4);
  assertEquals(W.usage.at(-1)?.kind, "3d-check");
  const s = await call({ subject: "building", photos: P4, check: c.j.token, label: "Test" });
  assertEquals(s.status, 200, JSON.stringify(s.j));
  assertEquals(s.j.status, "pending");
  assertEquals(s.j.cleaned.length, 4);
  assert(W.calls.includes("POST " + MU + "/tripo3d-h31-multiview-to-3d"));
  const row = W.renders.find((r) => r.id === s.j.id)!;
  assert(String(row.prompt).startsWith("[building] Clean this exact photo for 3D reconstruction of the house."));
  assert(String(row.prompt).includes("heat pump"));
  assertEquals(W.spends.at(-1), s.j.id);
  assertEquals(W.usage.at(-1)?.model, "nano-banana-2-1(kie)+tripo3d-h31-multiview-to-3d");
  W.tripo = "processing";
  assertEquals((await call({ action: "status", id: s.j.id })).j.status, "pending");
  W.tripo = "completed";
  const d = await call({ action: "status", id: s.j.id });
  assertEquals(d.j.status, "done");
  assertEquals(d.j.url, SB + "/storage/v1/object/public/models/c1/" + s.j.id + ".glb");
  assertEquals(W.refunds.includes(s.j.id), false);
});

Deno.test("Tripo viga → tagastus", async () => {
  W.check = good(); W.tripo = "processing";
  const c = await call({ action: "check", subject: "building", photos: P4 });
  const s = await call({ subject: "building", photos: P4, check: c.j.token });
  W.tripo = "failed";
  const d = await call({ action: "status", id: s.j.id });
  assertEquals(d.j.status, "failed");
  assert(W.refunds.includes(s.j.id));
});

Deno.test("puhastuse viga start'is → 502 ja tagastus", async () => {
  W.check = good();
  const c = await call({ action: "check", subject: "building", photos: P4 });
  W.kieFail = true;
  const s = await call({ subject: "building", photos: P4, check: c.j.token });
  W.kieFail = false;
  assertEquals(s.status, 502);
  assert(W.refunds.includes(W.spends.at(-1)!));
});

Deno.test("kontrollist ei saa mööda", async () => {
  W.check = good();
  const ok = (await call({ action: "check", subject: "building", photos: P4 })).j.token;
  const n0 = W.spends.length;
  // tõendita
  assertEquals((await call({ subject: "building", photos: P4 })).status, 409);
  // teised fotod sama tõendiga
  assertEquals((await call({ subject: "building", photos: [photo(9), ...P4.slice(1)], check: ok })).status, 409);
  // teine subjekt sama tõendiga
  assertEquals((await call({ subject: "vehicle", photos: P4, check: ok })).status, 409);
  // võltsitud tõend (ok:true ise kirjutatud)
  const [p, sig] = ok.split(".");
  const forged = btoa(JSON.stringify({ ...JSON.parse(atob(p.replace(/-/g, "+").replace(/_/g, "/"))), ok: true, exp: Date.now() + 1e9 })).replace(/=+$/, "") + "." + sig;
  assertEquals((await call({ subject: "building", photos: P4, check: forged })).status, 409);
  // blokeeriv viga + „Jätka ikkagi“ ei aita
  W.check = good(); (W.check.photos as { issues: string[] }[])[1].issues = ["different_objects"];
  const bad = await call({ action: "check", subject: "building", photos: P4 });
  assertEquals(bad.j.ok, false); assertEquals(bad.j.soft, false); assertEquals(bad.j.photos[1].issues, ["different_objects"]);
  assertEquals((await call({ subject: "building", photos: P4, check: bad.j.token, force: true })).status, 409);
  // AI ütleb ok:true, aga vead on olemas: server ei usalda
  W.check = { ...good(), ok: true }; (W.check.photos as { issues: string[] }[])[0].issues = ["duplicate_side"];
  assertEquals((await call({ action: "check", subject: "building", photos: P4 })).j.ok, false);
  assertEquals(W.spends.length, n0);
  // kerge viga: ilma force'ita ei, force'iga jah
  W.check = good(); (W.check.photos as { issues: string[] }[])[2].issues = ["occluded"];
  const soft = await call({ action: "check", subject: "building", photos: P4 });
  assertEquals(soft.j.soft, true);
  assertEquals((await call({ subject: "building", photos: P4, check: soft.j.token })).status, 409);
  assertEquals((await call({ subject: "building", photos: P4, check: soft.j.token, force: true })).status, 200);
});

Deno.test("vale subjekt ja toetamata asi blokeerivad", async () => {
  W.check = { ...good("vehicle") };
  const c = await call({ action: "check", subject: "building", photos: P4 });
  assertEquals(c.j.ok, false); assert(c.j.photos.every((p: { issues: string[] }) => p.issues.includes("wrong_subject")));
  W.check = { ...good(), subject: "unsupported" };
  const u = await call({ action: "check", subject: "building", photos: P4 });
  assertEquals(u.j.ok, false); assert(u.j.photos[0].issues.includes("unsupported"));
});

Deno.test("subjekti tuvastus 1 fotost ja ese 1 fotoga → image-to-3d", async () => {
  W.check = good("object", 1);
  const c = await call({ action: "check", photos: [photo(1)] });
  assertEquals(c.j.subject, "object");
  assert(c.j.token);
  W.calls.length = 0;
  const s = await call({ subject: "object", photos: [photo(1)], check: c.j.token });
  assertEquals(s.status, 200);
  assert(W.calls.includes("POST " + MU + "/tripo3d-h31-image-to-3d"));
  assert(String(W.renders.find((r) => r.id === s.j.id)!.prompt).includes("of the object"));
});

Deno.test("fotode arv subjekti järgi", async () => {
  assertEquals((await call({ subject: "building", photos: P4.slice(0, 3), check: "x" })).status, 400);
  assertEquals((await call({ subject: "vehicle", photos: P4.slice(0, 1), check: "x" })).status, 400);
  assertEquals((await call({ action: "check", subject: "building", photos: [...Array(13).keys()].map(photo) })).status, 400);
  assertEquals((await call({ subject: "boat", photos: P4, check: "x" })).status, 400);
});

Deno.test("toote 3D-mudel salvestub toote juurde, võõra toote id-d ei arvestata", async () => {
  W.check = good("object", 1); W.tripo = "processing";
  const c = await call({ action: "check", subject: "object", photos: [photo(1)] });
  const s = await call({ subject: "object", photos: [photo(1)], check: c.j.token, product_id: "p1" });
  assertEquals(W.renders.find((r) => r.id === s.j.id)!.product_id, "p1");
  W.tripo = "completed";
  const d = await call({ action: "status", id: s.j.id });
  assertEquals(d.j.product_id, "p1");
  const up = W.productUpd.at(-1)!;
  assertEquals(up.model_url, d.j.url);
  assert(String(up.q).includes("id=eq.p1") && String(up.q).includes("company_id=eq.c1"));
  const c2 = await call({ action: "check", subject: "object", photos: [photo(2)] });
  const s2 = await call({ subject: "object", photos: [photo(2)], check: c2.j.token, product_id: "voora-firma-toode" });
  assertEquals(W.renders.find((r) => r.id === s2.j.id)!.product_id, null);
});

// ---------- valikurežiim: rohkem fotosid kui külgi ----------
const P12 = [...Array(12).keys()].map((i) => photo(100 + i));
const pick = (sel: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({ subject: "building", selected: sel,
  photos: Object.entries(sel).map(([side, index]) => ({ side, index, ok: true, issues: [] })), unused: [{ index: 0, reason: "sama külg, uduisem" }], summary: "Valisin parimad.", ...extra });

Deno.test("12 fotot -> AI valib 4, tõend ainult valitud fotodele külgede järjekorras", async () => {
  W.check = pick({ front: 2, left: 5, back: 7, right: 11 });
  const c = await call({ action: "check", subject: "building", photos: P12 });
  assertEquals(c.status, 200);
  assertEquals(c.j.mode, "pool");
  assertEquals(c.j.selected, [{ side: "front", index: 2 }, { side: "left", index: 5 }, { side: "back", index: 7 }, { side: "right", index: 11 }]);
  assertEquals(c.j.unused.length, 8);
  assertEquals(c.j.unused.find((u: { index: number }) => u.index === 0).reason, "sama külg, uduisem");
  assert(c.j.ok && c.j.token);
  // Claude sai nummerdatud fotod ja valikujuhise
  const msg = (W.lastAn!.messages as { content: { type: string; text?: string }[] }[])[0].content;
  assertEquals(msg.filter((x) => x.type === "image").length, 12);
  assert(msg.some((x) => x.text === "Photo 11"));
  assert(String(W.lastAn!.system).includes("SELECTION MODE"));
  // start saab ainult valitud 4 õiges järjekorras
  const sel = [P12[2], P12[5], P12[7], P12[11]];
  assertEquals((await call({ subject: "building", photos: [P12[0], P12[1], P12[2], P12[3]], check: c.j.token })).status, 409);
  assertEquals((await call({ subject: "building", photos: [P12[5], P12[2], P12[7], P12[11]], check: c.j.token })).status, 409);
  assertEquals((await call({ subject: "building", photos: P12, check: c.j.token })).status, 400);
  assertEquals((await call({ subject: "building", photos: sel, check: c.j.token })).status, 200);
});

Deno.test("valikurežiim: puuduv külg ja vigased indeksid", async () => {
  W.check = pick({ front: 2, left: 5, back: null, right: 11 });
  const c = await call({ action: "check", subject: "building", photos: P12 });
  assertEquals(c.j.ok, false); assertEquals(c.j.soft, false);
  assertEquals(c.j.missing, [{ side: "back", tip: "Lisa foto tagaküljelt" }]);
  assertEquals(c.j.token, null);
  // sama foto kahele küljele, olematu indeks, number tekstina
  W.check = pick({ front: 2, left: 2, back: 99, right: "3" });
  const d = await call({ action: "check", subject: "building", photos: P12 });
  assertEquals(d.j.selected, [{ side: "front", index: 2 }, { side: "right", index: 3 }]);
  assertEquals(d.j.missing.map((m: { side: string }) => m.side), ["left", "back"]);
  assertEquals(d.j.missing[0].tip, "Lisa foto vasakult küljelt");
});

Deno.test("kasutaja vahetab külje -> tavaline kontroll valitud 4 fotoga", async () => {
  W.check = good();
  const mine = [P12[3], P12[5], P12[7], P12[11]];
  const c = await call({ action: "check", subject: "building", photos: mine });
  assertEquals(c.j.mode, undefined);
  assert(c.j.ok && c.j.token);
  assertEquals((await call({ subject: "building", photos: mine, check: c.j.token })).status, 200);
});

Deno.test("ese 6 fotost: AI valib ühe -> image-to-3d", async () => {
  W.check = { subject: "object", selected: { front: 4 }, photos: [{ side: "front", index: 4, ok: true, issues: [] }], unused: [], summary: "" };
  const P6 = P12.slice(0, 6);
  const c = await call({ action: "check", subject: "object", photos: P6 });
  assertEquals(c.j.mode, "pool"); assertEquals(c.j.missing, []); assert(c.j.ok && c.j.token);
  W.calls.length = 0;
  assertEquals((await call({ subject: "object", photos: [P6[4]], check: c.j.token })).status, 200);
  assert(W.calls.includes("POST " + MU + "/tripo3d-h31-image-to-3d"));
});
