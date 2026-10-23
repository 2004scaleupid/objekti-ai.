// Toa 3D puhas loogika: plaani kontroll, homograafia, sirgendus.
// Käivita: deno test -A --no-config --node-modules-dir=none supabase/tests/room.test.ts
import { assert, assertAlmostEquals, assertEquals } from "jsr:@std/assert@1";
import { sanitizePlan, homography, apply, warp, itemKey, MAX_MODELS } from "../functions/_shared/room.ts";

Deno.test("plaan: mõõdud piiridesse, kasutaja mõõdud ülimuslikud, vaibad ja pildid välja, mudeliks lahtine mööbel", () => {
  const a = {
    room: { width: 99, depth: 4, height: 2.6 }, walls: { back: "#FFFFFF", left: "red" },
    furniture: [
      { name: "double bed", bbox_px: [100, 100, 500, 400], size: { w: 1.6, d: 2.1, h: 1 }, pos: { x: 2, z: 1 }, has_back: true },
      { name: "nightstand left", bbox_px: [10, 10, 60, 60], size: { w: .5, d: .4, h: .5 }, pos: { x: .5, z: .2 } },
      { name: "nightstand right", bbox_px: [600, 10, 660, 60], size: { w: .5, d: .4, h: .5 }, pos: { x: 3.5, z: .2 } },
      { name: "jute rug", bbox_px: [0, 0, 100, 100], size: { w: 2, d: 2, h: .01 } },
      { name: "wardrobe", builtin: true, bbox_px: [0, 0, 100, 400], size: { w: 2, d: .6, h: 2.4 }, front_px: [[0, 0], [90, 0], [90, 400], [0, 400]] },
    ],
  };
  const p = sanitizePlan(a, 800, 600);
  assertEquals(p.room.w, 20); assertEquals(p.est, true);
  assertEquals(p.walls.back, "#ffffff"); assertEquals(p.walls.left, "#ecebe7");
  assertEquals(p.items.map((i) => i.name), ["double bed", "nightstand left", "nightstand right", "wardrobe"]);
  assertEquals(p.items.filter((i) => i.model).map((i) => i.key), ["double bed", "nightstand"]); // sama võti -> üks mudel
  assert(!p.items.find((i) => i.builtin)!.model);
  assertEquals(p.items.find((i) => i.builtin)!.front_px!.length, 4);
  const u = sanitizePlan(a, 800, 600, { w: 3.2, d: 4, h: 2.5 });
  assertEquals([u.room, u.est], [{ w: 3.2, d: 4, h: 2.5 }, false]);
  assertEquals(itemKey("Dining chair 2"), "dining chair");
  assert(MAX_MODELS >= 3);
});

Deno.test("homograafia: nelinurk -> ristkülik ja tagasi", () => {
  const dst: [number, number][] = [[0, 0], [100, 0], [100, 50], [0, 50]], src: [number, number][] = [[10, 20], [210, 40], [190, 160], [30, 150]];
  const h = homography(dst, src)!;
  dst.forEach((d, i) => { const [u, v] = apply(h, d[0], d[1]); assertAlmostEquals(u, src[i][0], 1e-6); assertAlmostEquals(v, src[i][1], 1e-6); });
  assertEquals(homography([[0, 0], [1, 0], [2, 0], [3, 0]], src), null); // kõik ühel joonel
});

Deno.test("sirgendus: identsus annab sama pildi, väljaspool tausta värv", () => {
  const W = 4, H = 3, data = new Uint8Array(W * H * 4).map((_, i) => (i % 4 === 3 ? 255 : (i * 7) % 250));
  const id = homography([[0, 0], [1, 0], [1, 1], [0, 1]], [[0, 0], [1, 0], [1, 1], [0, 1]])!;
  const out = warp({ width: W, height: H, data }, id, 2, 2);
  assertEquals(out.length, 16);
  const far = homography([[0, 0], [1, 0], [1, 1], [0, 1]], [[100, 100], [101, 100], [101, 101], [100, 101]])!;
  assertEquals([...warp({ width: W, height: H, data }, far, 1, 1)], [220, 218, 214, 255]);
});

Deno.test("seinaäärne pööratud kapp jääb seina äärde, seinakapp õhku", () => {
  const p = sanitizePlan({ room: { width: 6, depth: 6, height: 2.6 }, furniture: [
    { name: "base cabinet run", builtin: true, bbox_px: [0, 0, 100, 400], size: { w: 4.5, d: .6, h: .9 }, pos: { x: .3, z: 3 }, rot_deg: 90 },
    { name: "wall cabinets", builtin: true, bbox_px: [0, 0, 100, 100], size: { w: 3, d: .35, h: .9 }, pos: { x: .2, z: 3 }, rot_deg: 90, elev: 1.45 },
    { name: "tv", bbox_px: [0, 0, 50, 50], size: { w: 1.3, d: .08, h: .75 }, pos: { x: 5.9, z: 2 }, rot_deg: -90, elev: 9 },
  ] }, 800, 600);
  assertAlmostEquals(p.items[0].pos.x, .3, 1e-9); // varem lükati x = 2.25 peale (laius, mitte sügavus)
  assertAlmostEquals(p.items[1].pos.x, .2, 1e-9);
  assertEquals(p.items[1].elev, 1.45);
  assertAlmostEquals(p.items[2].elev, 2.6 - .75, 1e-9); // lae sisse ei lähe
  assertAlmostEquals(p.items[2].pos.x, 5.9, 1e-9); // seinas, ruumi sees
});
