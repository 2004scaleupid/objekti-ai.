// Toa 3D puhas loogika: plaani kontroll, homograafia, sirgendus.
// Käivita: deno test -A --no-config --node-modules-dir=none supabase/tests/room.test.ts
import { assert, assertAlmostEquals, assertEquals } from "jsr:@std/assert@1";
import { sanitizePlan, sanitizeScene, homography, apply, warp, itemKey, MAX_MODELS } from "../functions/_shared/room.ts";

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

Deno.test("v2 stseen: materjalid, seinatsoonid, avad, elemendid toas, Tripo ainult lõikega", () => {
  const a = {
    room: { width: 2, depth: 1.75, height: 2.1 }, floor: "tile", wall: "wood_l", ceiling: "nope",
    materials: [{ id: "wood_l", kind: "wood", desc: "light thermowood boards", color: "#C8A27A", scale: 1.2 }, { id: "tile", kind: "tile", color: "#777", scale: 0.6 },
      { id: "wood_l", kind: "wood" }, { id: "steel", kind: "metal" }, { id: "x?!", kind: "lava" }],
    zones: [{ wall: "back", a0: 1.48, a1: 9, y0: 0, y1: 2.1, mat: "stone" }, { wall: "back", a0: 0, a1: 1.48, y0: 1.32, y1: 2.1, mat: "wood_l" }],
    openings: [{ wall: "right", kind: "glass_wall", a0: 1, a1: 1.6, y0: 0, y1: 1.98 }, { wall: "left", kind: "window", a0: 0, a1: .1, y0: 0, y1: 2 }],
    elements: [
      { t: "box", name: "upper bench", mat: "wood_l", x0: 0, x1: 1.46, y0: .97, y1: 1.06, z0: 0, z1: .56, r: .5 },
      { t: "stove", name: "stove", mat: "steel", x0: 1.6, x1: 1.92, y0: 0, y1: .9, z0: .15, z1: .45 },
      { t: "model", name: "plant", mat: "wood_l", x0: .1, x1: .4, y0: 0, y1: .8, z0: 1, z1: 1.3 },
      { t: "box", name: "tiny", x0: 0, x1: .001, y0: 0, y1: 1, z0: 0, z1: 1 },
      { t: "box", name: "far", x0: -9, x1: 99, y0: 0, y1: 1, z0: 0, z1: 1 },
    ],
    lights: [{ t: "strip", x0: .02, x1: 1.44, y: .96, z: .05 }, { t: "laser" }],
  };
  const s = sanitizeScene(a, [[1600, 1200]]);
  assertEquals(s.room, { w: 2, d: 1.75, h: 2.1 });
  assertEquals(s.mats.map((m) => m.id), ["wood_l", "tile", "steel", "x"]); // kordus välja, id puhastatud
  assertEquals(s.mats[3].kind, "paint");
  assertEquals([s.floor, s.wall, s.ceiling], ["tile", "wood_l", "wood_l"]); // tundmatu -> esimene
  assertEquals(s.zones[0], { wall: "back", a0: 1.48, a1: 2, y0: 0, y1: 2.1, mat: "wood_l" }); // seina pikkuseni, tundmatu materjal -> esimene
  assertEquals(s.opens.map((o) => o.kind), ["glass"]); // liiga kitsas aken välja
  assertEquals(s.els.map((e) => e.name), ["upper bench", "stove", "plant", "far"]);
  assertAlmostEquals(s.els[0].r, .045, 1e-9); // ümardus ei ole paksem kui pool paksusest
  assertEquals(s.els[2].t, "box"); // model ilma fotolõiketa -> kast
  assertEquals([s.els[3].x0, s.els[3].x1], [-.3, 2.3]);
  assertEquals(s.lights.map((l) => l.t), ["strip", "lamp"]);
  assertEquals(sanitizeScene({}, [[10, 10]], { w: 3, d: 4, h: 2.5 }).est, false);
});
