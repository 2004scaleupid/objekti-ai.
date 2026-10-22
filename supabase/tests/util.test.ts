// Käivita: deno test -A --no-config --node-modules-dir=none supabase/tests/util.test.ts
import { assertEquals } from "jsr:@std/assert@1";
Deno.env.set("SUPABASE_URL", "http://sb.test");
const { scrub, failText } = await import("../functions/_shared/util.ts");

Deno.test("scrub: e-post, päringuparameetrid ja pikad tokenid välja", () => {
  assertEquals(scrub("kasutaja mari.maasikas+1@firma.ee ei leitud"), "kasutaja [e-post] ei leitud");
  assertEquals(scrub("GET https://x.supabase.co/rest/v1/renders?id=eq.123&token=abc failed"), "GET https://x.supabase.co/rest/v1/renders failed");
  assertEquals(scrub("Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9abcdefghij"), "Bearer …");
  assertEquals(scrub("Tripo: failed 502"), "Tripo: failed 502");
});

Deno.test("failText: arv ja ainsus", () => {
  assertEquals(failText(1), "Töö ebaõnnestus, 1 krediit tagastati.");
  assertEquals(failText(2.5), "Töö ebaõnnestus, 2,5 krediiti tagastati.");
  assertEquals(failText(0), "Töö ebaõnnestus.");
});
