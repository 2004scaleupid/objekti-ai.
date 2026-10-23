// Muudatust ei tulnud: nihe ja toon ei ole muudatus, päris muudatus on. Ja 3D-soov tunnustatakse ka serveris.
// Käivita: deno test -A --no-config --node-modules-dir=none supabase/tests/imgdiff.test.ts
import { assert, assertEquals } from "jsr:@std/assert@1";
import { toGrid, isSame } from "../functions/_shared/imgdiff.ts";
import { is3dIntent } from "../functions/_shared/intent.ts";

const W = 400, H = 300;
const scene = (dx = 0, k = 1, box = false) => { const o = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const X = x + dx, i = (y * W + x) * 4;
    const v = 120 + 60 * Math.sin(X / 23) + 40 * Math.cos(y / 17) + ((X >> 4) + (y >> 4)) % 2 * 20;
    o[i] = v * k; o[i + 1] = (v * .8 + 20) * k; o[i + 2] = (255 - v) * k; o[i + 3] = 255;
    if (box && x > 250 && x < 290 && y > 60 && y < 100) { o[i] = 245; o[i + 1] = 235; o[i + 2] = 200; } }
  return toGrid(o, W, H); };

Deno.test("sama pilt veidi nihkes ja toonis = muudatust ei tulnud; uus ese pildil = muudatus", () => {
  const a = scene();
  assert(isSame(a, scene(4)), "4 px nihe");
  assert(isSame(a, scene(0, 1.06)), "6% heledam");
  assert(!isSame(a, scene(0, 1, true)), "uus 40×40 ese (1,3% pildist)");
});

Deno.test("3D-soov: tuba, ese, kujundus ja küsimus", () => {
  assertEquals(is3dIntent("tee 3d ruum sellest saunast"), "room");
  assertEquals(is3dIntent("Tee 3D-ruum"), "room");
  assertEquals(is3dIntent("tee 3d mudel sellest toolist"), "object");
  assertEquals(is3dIntent("tee saun skandinaavia stiilis 3d-s"), null);
  assertEquals(is3dIntent("kas saab 3d ruumi teha?"), null);
  assertEquals(is3dIntent("värvi seinad tumehalliks"), null);
});
