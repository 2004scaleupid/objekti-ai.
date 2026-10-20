// Avalik: ehitisregistri andmed EHR-koodi järgi (server teeb päringu, brauser ei pea).
import { cors, fail } from "../_shared/util.ts";

type Out = { otstarve?: string; esmane?: string; korrused?: string; sein: string[]; viimistlus?: string; katus?: string; kute?: string; energia?: string; koetav?: string; alune?: string };
function parse(j: unknown): Out {
  const o: Out = { sein: [] };
  const walk = (x: unknown): void => {
    if (!x || typeof x !== "object") return;
    if (Array.isArray(x)) { x.forEach(walk); return; }
    const r = x as Record<string, unknown>;
    o.esmane ??= r.esmaneKasutus as string; o.korrused ??= r.maxKorrusteArv as string; o.koetav ??= r.koetavPind as string;
    o.alune ??= r.ehitisalunePind as string; o.otstarve ??= r.kaosIdTxt as string;
    const k = r.klNimetus as string, v = (r.nimetus && r.nimetus !== "muu" ? r.nimetus : (r.lisavaartus || r.nimetus)) as string;
    if (k && v) {
      if (k === "Välisseina liik") o.sein.push(v);
      else if (k === "Välisseina välisviimistluse materjal") o.viimistlus ??= v;
      else if (k === "Katusekatte materjal") o.katus ??= v;
      else if (k === "Soojusvarustuse liik") o.kute ??= v;
      else if (k === "Energiakandja") o.energia ??= v;
    }
    Object.values(r).forEach(walk);
  };
  walk(j); return o;
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const code = new URL(req.url).searchParams.get("code") || "";
  if (!/^\d{6,12}$/.test(code)) return fail("bad code");
  const r = await fetch("https://livekluster.ehr.ee/api/building/v2/buildingData?ehr_code=" + code);
  if (!r.ok) return fail("EHR ei vastanud", 502);
  return new Response(JSON.stringify(parse(await r.json())), { headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "public, max-age=86400" } });
});
