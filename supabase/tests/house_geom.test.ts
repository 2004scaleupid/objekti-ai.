// index.html hoone geomeetria (LOD2 -> 3D-maja sisend): võetakse otse index.html-ist, ilma brauserita.
// Käivita: deno test -A --no-config --node-modules-dir=none supabase/tests/house_geom.test.ts
import { assert, assertAlmostEquals, assertEquals } from "jsr:@std/assert@1";

const html = await Deno.readTextFile(new URL("../../index.html", import.meta.url));
const a = html.indexOf("/* ---------- hooned kogu Eestis"), b = html.indexOf("function makeHouse(a)");
assert(a > 0 && b > a, "geomeetria plokk index.html-is");
// deno-lint-ignore no-explicit-any
const G: any = new Function(html.slice(a, b) + "; return {minRect, wingsFor, lod2Tuple, manualTuple, pArea};")();

Deno.test("pööratud ristkülik: pikk külg x-teljele, 1 tiib", () => {
  const t = 30 * Math.PI / 180, c = Math.cos(t), s = Math.sin(t);
  const ring = [[-6, -4], [6, -4], [6, 4], [-6, 4]].flatMap(([x, y]) => [x * c - y * s, x * s + y * c]);
  const m = { c: [550000, 6590000], g: [ring], ridge: 8, eave: 5, fp: 96, per: 40, roof: 110, wall: 300 };
  const T = G.lod2Tuple({ ehr: "1", full: "Test 1, Koht" }, m, []);
  assertAlmostEquals(T[4], 550000, 1e-3);
  assertAlmostEquals(((T[6] % 180) + 180) % 180, 150, 0.01); // pööre -30° (mod 180)
  const xs = T[7].filter((_: number, i: number) => i % 2 === 0), ys = T[7].filter((_: number, i: number) => i % 2 === 1);
  assertAlmostEquals(Math.max(...xs) - Math.min(...xs), 12, 0.02);
  assertAlmostEquals(Math.max(...ys) - Math.min(...ys), 8, 0.02);
  assertEquals(T[8].length, 1);
  assertEquals([T[9], T[10], T[11], T[13], T[14]], [5, 8, 96, 110, 300]); // ametlikud väärtused muutmata
});

Deno.test("L-kujuline maja: 2 tiiba, kokku katavad põhiplaani", () => {
  const P = [[0, 0], [20, 0], [20, 8], [8, 8], [8, 18], [0, 18]];
  const W = G.wingsFor(P);
  assertEquals(W.length, 2);
  const area = W.reduce((s: number, w: number[]) => s + (w[2] - w[0]) * (w[3] - w[1]), 0);
  assertAlmostEquals(area, Math.abs(G.pArea(P)), 0.01); // täpne jaotus: 20x8 + 8x10
});

Deno.test("käsitsi mõõdud: pinnad ja kõrgus", () => {
  const T = G.manualTuple({ ehr: "1", full: "Uus 1, Koht", x: 1, y: 2 }, { L: 9, W: 12, e: 3, rt: "gable" }, []);
  assertEquals(T[11], 108);
  assertEquals(T[12], 42);
  assertAlmostEquals(T[10], 3 + 4.5 * Math.tan(Math.PI / 6), 0.01);
  const F = G.manualTuple({ ehr: "1", full: "Uus 1", x: 1, y: 2 }, { L: 10, W: 10, e: 6, rt: "flat" }, []);
  assertEquals([F[10], F[13], F[14]], [6, 100, 240]);
});
