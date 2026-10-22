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

Deno.test("asJpeg: PNG -> päris JPEG (q90), JPEG jääb samaks, tundmatu jääb oma tüübiga", async () => {
  const { asJpeg, sniffType } = await import("../functions/_shared/util.ts");
  // 64x48 PNG (sama teek, millega asJpeg loeb)
  const UPNG = (await import("npm:upng-js@2.1.0")).default;
  const px = new Uint8Array(64 * 48 * 4).map((_, i) => [0xcc, 0x33, 0x22, 0xff][i % 4]);
  const png = new Uint8Array(UPNG.encode([px.buffer], 64, 48, 0));
  assertEquals(sniffType(png), "image/png");
  const j = await asJpeg(png);
  assertEquals(j.type, "image/jpeg");
  assertEquals([...j.bytes.slice(0, 3)], [0xff, 0xd8, 0xff]);
  const again = await asJpeg(j.bytes);
  assertEquals(again.bytes, j.bytes); // JPEG-i ei kodeerita uuesti
  const junk = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 1, 2, 3]); // katkine WebP
  assertEquals((await asJpeg(junk)).type, "image/webp");
});
