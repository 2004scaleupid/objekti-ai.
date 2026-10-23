// Sisekujundus + 3D: AI disainivariandist toa 3D (parameetriline). { action: "start" | "status" | "redo" }.
// start: krediidid (3D hind), töö rida. status: iga päring viib tööd ühe sammu edasi (servafunktsiooni aja- ja protsessoripiir):
//   measure -> Claude mõõdab toa ja mööbli, lõiked, MuAPI tööd (põrand, tagasein ilma mööblita, mööbel eraldi fotoks)
//   parts   -> tulemused; mööbli fotost Tripo mudel; tagaseina ja kapifrontide sirgendus
//   done    -> models/room/<firma>/<id>/room.json (vaatur ehitab toa sellest). Viga -> krediidid tagasi.
import { cors, json, fail, env, admin, body, userCompany, tfetch, spend, refund, failText, isOurImage, isPhoto, rateLimit, refundStale, asJpeg, sniffType } from "../_shared/util.ts";
import { sanitizePlan, backWallH, frontH, sideWallH, warp, jpegSize, type Plan, type Item } from "../_shared/room.ts";

const MU = () => env("MUAPI_API_BASE", "https://api.muapi.ai/api/v1");
const muKey = () => { const k = env("MUAPI_API_KEY") || env("Muapi.ai ") || env("Muapi.ai"); if (!k) throw new Error("MUAPI_API_KEY puudub"); return k; };
const PPM = 150, REDO_MAX = 3;
type Job = { rid?: string; url?: string; done?: boolean; err?: string };
type St = {
  v: 1; plan?: Plan; src: string; srcs?: string[]; mode?: "design" | "asis"; dims: { w: number; d: number; h: number } | null; stage: "measure" | "parts" | "done";
  sides?: { left?: string | null; right?: string | null }; sidesDone?: boolean;
  floor: Job; wall: Job; backTex?: string | null; fronts?: Record<number, string>; frontsDone?: boolean;
  models: Record<string, { crop?: string; iso: Job; tri: Job; glb?: string; prev?: string; fail?: string; redo?: number }>;
  lock?: number; t0: number; cost: number; out?: string;
};

const PROMPT = `You are a room-measuring assistant. You get {N} photo(s) of one interior (labelled "Photo i (W x H px)"). Build a simple parametric model of the room.
Coordinates in metres: x from the LEFT wall (as seen in Photo 0) to the right, z from the BACK wall (the wall facing the camera in Photo 0) towards the camera, y up from the floor.
{MULTI}
{DIMS}Estimate sizes from standard furniture (double bed ~2.0 m long, doors 2.0-2.1 m, ceilings 2.5-2.7 m, kitchen counters 0.9 m high, dining chair seat 0.45 m).
Return ONLY JSON:
{"room":{"width":m,"depth":m,"height":m},
 "floor_pts":[{"px":[x,y],"m":[x,z]} x4] - 4 points ON THE BARE FLOOR (not on rugs, beds or furniture), spread as wide as possible, convex quad,
 "back_wall_pts":[{"px":[x,y],"m":[x,y]} x4] - 4 points on the back wall plane, ideally its visible corners,
 "left_wall_pts":[{"px":[x,y],"m":[z,y]} x4] and "right_wall_pts":[...] - optional, 4 points on that side wall if clearly visible,
 "floor_photo":i,"back_wall_photo":i,"left_wall_photo":i,"right_wall_photo":i - the photo index each list of points belongs to (0 if only one photo),
 "walls":{"back":"#hex","left":"#hex","right":"#hex","ceiling":"#hex"},
 "floor":{"material":"short name, e.g. light oak planks","color":"#hex"},
 "openings":[{"wall":"back|left|right","kind":"window|door","x0":m,"x1":m,"y0":m,"y1":m}] (on left/right walls x is measured along z),
 "furniture":[{"name":"short english, e.g. double bed, nightstand left, dining chair","bbox_px":[x0,y0,x1,y1],"size":{"w":m,"d":m,"h":m},
   "pos":{"x":m,"z":m} (centre of the footprint),"elev":m (height of its bottom above the floor: 0 for floor-standing, about 1.4 for kitchen wall cabinets, the real height for wall-mounted TVs and shelves),"rot_deg":deg (direction the FRONT faces: 0 = towards the camera, 90 = towards the right wall, -90 = towards the left wall, 180 = towards the back wall),
   "has_back":bool (true only if it has a clearly taller back side: bed headboard, chair or sofa backrest),
   "builtin":bool (true for fixed cabinetry: kitchen cabinet runs, built-in wardrobes, fitted shelving),
   "front_px":[[x,y],[x,y],[x,y],[x,y]] (builtin only: corners of its visible FRONT face in the photo: top-left, top-right, bottom-right, bottom-left),
   "color":"#hex","photo":i (index of the photo the bbox_px and front_px refer to)}]}
w is the width of the front side, d the depth front-to-back. Include up to 12 pieces; skip rugs, pictures, pillows, blankets, lamps hanging from the ceiling.`;

const MULTI = `These are SEVERAL photos of the SAME room from different angles. Use them together: cross-check every size between the photos and give one consistent value.
For each surface choose the photo where it is seen best (most straight-on, least covered) and give the points in THAT photo.
List every piece of furniture ONCE even when several photos show it; its "photo" is the sharpest, most complete view of that item.
`;
async function claudePlan(srcs: string[], sizes: [number, number][], dims: St["dims"]) {
  const d = dims ? `The room is exactly ${dims.w} m wide (left to right), ${dims.d} m deep and ${dims.h} m high: use these numbers.\n` : "";
  const content: Record<string, unknown>[] = [];
  srcs.forEach((u, i) => { content.push({ type: "text", text: `Photo ${i} (${sizes[i][0]} x ${sizes[i][1]} px)` }); content.push({ type: "image", source: { type: "url", url: u } }); });
  content.push({ type: "text", text: PROMPT.replace("{N}", String(srcs.length)).replace("{MULTI}", srcs.length > 1 ? MULTI : "").replace("{DIMS}", d) });
  const r = await tfetch(env("ANTHROPIC_API_URL", "https://api.anthropic.com") + "/v1/messages", {
    method: "POST", headers: { "x-api-key": env("ANTHROPIC_API_KEY"), "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: env("ROOM_MODEL", "claude-opus-5-5"), max_tokens: 6000,
      messages: [{ role: "user", content }] }),
  }, 120000);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error("anthropic " + r.status + " " + JSON.stringify(j).slice(0, 200));
  const t = String((j.content || []).filter((c: { type?: string }) => c.type === "text").map((c: { text?: string }) => c.text || "").join(""));
  const m = t.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("mõõtmine: vastus pole JSON");
  const u = j.usage || {};
  return { a: JSON.parse(m[0]), cost: ((Number(u.input_tokens) || 0) * 5 + (Number(u.output_tokens) || 0) * 25) / 1e6 };
}

async function muSubmit(model: string, payload: Record<string, unknown>): Promise<string> {
  const r = await tfetch(`${MU()}/${model}`, { method: "POST", headers: { "x-api-key": muKey(), "Content-Type": "application/json" }, body: JSON.stringify(payload) }, 30000);
  const j = await r.json().catch(() => ({}));
  if (!j?.request_id) throw new Error("MuAPI: " + JSON.stringify(j).slice(0, 200));
  return String(j.request_id);
}
async function muPoll(job: Job, want: RegExp): Promise<void> {
  if (!job.rid || job.done || job.err) return;
  try {
    const pr = await tfetch(`${MU()}/predictions/${encodeURIComponent(job.rid)}/result`, { headers: { "x-api-key": muKey() } }, 15000);
    const raw = await pr.json().catch(() => ({}));
    const p = raw?.detail && typeof raw.detail === "object" ? raw.detail : raw;
    if (p?.status === "failed") job.err = String(p?.error || "failed").slice(0, 160);
    else if (p?.status === "completed") {
      const u = (p.outputs || []).find((x: string) => want.test(x)) || p.outputs?.[0];
      if (u) { job.url = String(u); job.done = true; } else job.err = "tulemus puudub";
    }
  } catch (_) { /* järgmine päring proovib uuesti */ }
}
const ISO = (name: string) => `Show only the ${name} from this photo as a clean product photo on a plain white background: the whole object fully visible, slight 3/4 front view, exactly the same design, proportions, materials and colours. No other objects, no room.`;
const TRIPO = (u: string) => ({ image_url: u, pbr: true, texture_quality: "standard", face_limit: 30000 });

const pub = (bucket: string, path: string) => {
  const u = admin().storage.from(bucket).getPublicUrl(path).data.publicUrl, h = env("PUBLIC_STORAGE_URL");
  return h ? u.replace(env("SUPABASE_URL"), h) : u;
};
async function put(path: string, bytes: Uint8Array, type: string) {
  const { error } = await admin().storage.from("models").upload(path, bytes, { contentType: type, upsert: true });
  if (error) throw new Error("storage: " + error.message);
  return pub("models", path);
}
async function decode(url: string) {
  const r = await tfetch(url, {}, 30000);
  const raw = new Uint8Array(await r.arrayBuffer());
  if (!r.ok || raw.length < 500) throw new Error("pilti ei saanud alla laadida");
  const { bytes } = await asJpeg(raw);
  if (sniffType(bytes) !== "image/jpeg") throw new Error("pildi vorming");
  const jpeg = (await import("npm:jpeg-js@0.4.4")).default;
  const d = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 256 });
  return { width: d.width, height: d.height, data: d.data as Uint8Array };
}
async function encode(rgba: Uint8Array, w: number, h: number, q = 86) {
  const jpeg = (await import("npm:jpeg-js@0.4.4")).default;
  return new Uint8Array(jpeg.encode({ data: rgba, width: w, height: h }, q).data);
}
function crop(img: { width: number; height: number; data: Uint8Array }, b: Item["bbox"]) {
  const mx = (b[2] - b[0]) * .15, my = (b[3] - b[1]) * .15;
  const x0 = Math.max(0, Math.floor(b[0] - mx)), y0 = Math.max(0, Math.floor(b[1] - my)), x1 = Math.min(img.width, Math.ceil(b[2] + mx)), y1 = Math.min(img.height, Math.ceil(b[3] + my));
  const w = x1 - x0, h = y1 - y0, out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) out.set(img.data.subarray(((y0 + y) * img.width + x0) * 4, ((y0 + y) * img.width + x1) * 4), y * w * 4);
  return { out, w, h };
}

/** Lõpptulemus vaaturile. */
function roomJson(st: St) {
  const p = st.plan!;
  return {
    v: 1, est: p.est, room: p.room, walls: p.walls, openings: p.openings, mode: st.mode || "design", photos: (st.srcs || [st.src]).length,
    sides: { left: st.sides?.left || null, right: st.sides?.right || null },
    floor: { color: p.floor.color, material: p.floor.material, tex: st.floor.done ? st.floor.url : null, tile: 2 },
    back: { tex: st.backTex || null }, src: st.src,
    items: p.items.map((it, i) => ({ name: it.name, key: it.key, size: it.size, pos: it.pos, elev: it.elev, rot: it.rot, has_back: it.has_back, builtin: it.builtin, color: it.color,
      glb: st.models[it.key]?.glb || st.models[it.key]?.prev || null, front: st.fronts?.[i] || null, redo: it.model && !!st.models[it.key] })),
  };
}
function progress(st: St) {
  const M = Object.values(st.models), N = M.length, n = M.filter((m) => m.glb || m.fail).length;
  return { stage: st.stage, measure: !!st.plan, floor: !!(st.floor.done || st.floor.err), wall: !!(st.wall.done || st.wall.err || st.backTex !== undefined), items: [n, N],
    room: st.plan ? { ...st.plan.room, est: st.plan.est } : null };
}

async function step(id: string, cid: string, st: St): Promise<St> {
  const db = admin(), dir = `room/${cid}/${id}`;
  const srcs = st.srcs || [st.src];
  if (st.stage === "measure") {
    // fotode mõõdud päisest (lahti pakkimata: protsessoriaeg on piiratud)
    const sizes = await Promise.all(srcs.map(async (u) => { const r = await tfetch(u, {}, 30000), z = jpegSize(new Uint8Array(await r.arrayBuffer())); if (!r.ok || !z) throw new Error("pilti ei saanud lugeda"); return z; }));
    const { a, cost } = await claudePlan(srcs, sizes, st.dims);
    const plan = sanitizePlan(a, sizes, null, st.dims);
    st.plan = plan; st.cost += cost;
    // tööd paralleelselt: põrand, tagasein ilma eraldi modelleeritava mööblita, iga mööbel eraldi fotoks
    const remove = plan.items.filter((i) => !i.builtin && i.pos.z < plan.room.d * .6).map((i) => i.name);
    const jobs: Promise<unknown>[] = [
      muSubmit("nano-banana-edit", { prompt: `Create a seamless tileable texture, straight top-down orthographic view, of exactly the floor in this photo (${plan.floor.material}), covering about 2 x 2 metres, even lighting, no furniture, no shadows, no perspective.`, images_list: [srcs[plan.photo.floor]] }).then((r) => st.floor.rid = r).catch((e) => st.floor.err = String(e.message).slice(0, 160)),
      remove.length
        ? muSubmit("nano-banana-edit", { prompt: `Remove these objects from the photo completely: ${[...new Set(remove)].join(", ")}. Fill their place with the wall and floor that would be behind them, as if the room were empty there. Keep everything else exactly identical: same camera, same walls, windows, cabinets and lighting.`, images_list: [srcs[plan.photo.back]] }).then((r) => st.wall.rid = r).catch((e) => st.wall.err = String(e.message).slice(0, 160))
        : Promise.resolve(st.wall = { done: true, url: srcs[plan.photo.back] }),
    ];
    // mööbli lõiked: ainult vajalikud fotod lahti
    const imgs: Record<number, Awaited<ReturnType<typeof decode>>> = {};
    for (const p of new Set(plan.items.filter((i) => i.model).map((i) => i.photo))) imgs[p] = await decode(srcs[p]);
    for (const it of plan.items.filter((i) => i.model)) {
      const c = crop(imgs[it.photo], it.bbox), m: St["models"][string] = st.models[it.key] = { iso: {}, tri: {} };
      jobs.push(encode(c.out, c.w, c.h, 90).then((b) => put(`${dir}/crop-${it.key.replace(/ /g, "-")}.jpg`, b, "image/jpeg"))
        .then((u) => { m.crop = u; return muSubmit("nano-banana-edit", { prompt: ISO(it.name), images_list: [u] }); })
        .then((r) => m.iso.rid = r).catch((e) => m.iso.err = String(e.message).slice(0, 160)));
    }
    await Promise.all(jobs);
    st.cost += .03 * (2 + Object.keys(st.models).length);
    st.stage = "parts";
    return st;
  }
  // ---------- parts ----------
  const M = Object.entries(st.models);
  await Promise.all([muPoll(st.floor, /\.(png|jpe?g|webp)/i), muPoll(st.wall, /\.(png|jpe?g|webp)/i), ...M.flatMap(([, m]) => [muPoll(m.iso, /\.(png|jpe?g|webp)/i), muPoll(m.tri, /\.glb/i)])]);
  for (const [key, m] of M) {
    if (m.iso.err && !m.fail) m.fail = "foto: " + m.iso.err;
    if (m.iso.done && !m.tri.rid && !m.tri.err && !m.fail) {
      try { m.tri.rid = await muSubmit("tripo3d-h31-image-to-3d", TRIPO(m.iso.url!)); st.cost += .3; } catch (e) { m.tri.err = String((e as Error).message).slice(0, 160); }
    }
    if (m.tri.err && !m.fail) m.fail = "3D: " + m.tri.err;
    if (m.tri.done && !m.glb && !m.fail) {
      try {
        const r = await tfetch(m.tri.url!, {}, 60000), b = new Uint8Array(await r.arrayBuffer());
        if (!r.ok || b.length < 1000 || b.length > 30_000_000) throw new Error("mudel " + b.length);
        m.glb = await put(`${dir}/${key.replace(/ /g, "-")}-${m.redo || 0}.glb`, b, "model/gltf-binary");
      } catch (e) { m.fail = "salvestus: " + (e as Error).message; }
    }
  }
  // tagasein (üks protsessorimahukas samm ühe päringu kohta)
  if (st.backTex === undefined && (st.wall.done || st.wall.err)) {
    const H = backWallH(st.plan!, PPM);
    st.backTex = null;
    if (H) {
      try {
        const img = await decode(st.wall.done ? st.wall.url! : srcs[st.plan!.photo?.back ?? 0]), sz = (st.plan!.sizes || [st.plan!.img])[st.plan!.photo?.back ?? 0];
        const sx = img.width / sz[0], sy = img.height / sz[1]; // puhastatud pilt võib olla teise suurusega
        const h = H.h.map((v, i) => [0, 1, 2].includes(i) ? v * sx : [3, 4, 5].includes(i) ? v * sy : v);
        st.backTex = await put(`${dir}/back.jpg`, await encode(warp(img, h, H.W, H.H), H.W, H.H), "image/jpeg");
      } catch (e) { console.error("room back", (e as Error).message); }
    }
    return st;
  }
  if (!st.frontsDone && st.backTex !== undefined) {
    st.fronts = st.fronts || {};
    const B = st.plan!.items.map((it, i) => [it, i] as const).filter(([it]) => it.builtin && it.front_px);
    if (B.length) {
      try {
        const cache: Record<number, Awaited<ReturnType<typeof decode>>> = {};
        for (const [it, i] of B) {
          const F = frontH(it, PPM), ph = it.photo ?? 0;
          if (!F) continue;
          const img = cache[ph] = cache[ph] || await decode(srcs[ph]);
          st.fronts[i] = await put(`${dir}/front-${i}.jpg`, await encode(warp(img, F.h, F.W, F.H), F.W, F.H), "image/jpeg");
        }
      } catch (e) { console.error("room fronts", (e as Error).message); }
    }
    st.frontsDone = true;
    return st;
  }
  if (st.frontsDone && !st.sidesDone) {
    st.sides = {};
    for (const side of ["left", "right"] as const) {
      const S = st.plan!.left_pts ? sideWallH(st.plan!, side, PPM) : null;
      if (!S) continue;
      try { const img = await decode(srcs[st.plan!.photo[side]]); st.sides[side] = await put(`${dir}/side-${side}.jpg`, await encode(warp(img, S.h, S.W, S.H), S.W, S.H), "image/jpeg"); }
      catch (e) { console.error("room side", (e as Error).message); }
    }
    st.sidesDone = true;
    return st;
  }
  const allItems = M.every(([, m]) => m.glb || m.fail);
  if (allItems && (st.floor.done || st.floor.err) && st.frontsDone && st.sidesDone) {
    const bytes = new TextEncoder().encode(JSON.stringify(roomJson(st)));
    st.out = await put(`${dir}/room-${Date.now()}.json`, bytes, "application/json");
    st.stage = "done";
    await db.from("ai_usage").insert({ company_id: cid, kind: "3d", model: "room:opus+nano-banana+tripo", cost_usd: +st.cost.toFixed(3) }).then(() => {}, () => {});
  }
  return st;
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fail("POST only", 405);
  const me = await userCompany(req);
  if (!me) return fail("unauthorized", 401);
  const b = await body(req, 30_000_000).catch(() => ({} as Record<string, unknown>));
  const db = admin();

  if (b.action === "start") {
    // kujundus = üks AI variant (meie kaustas); asis = kasutaja fotod nagu on (1–12, data-URL või meie kaust)
    const list = (Array.isArray(b.photos) ? b.photos : [b.image]).map((x) => String(x || ""));
    if (!list.length || list.length > 12) return fail("Lisa 1–12 fotot");
    if (!list.every((u) => isOurImage(u, "renders") || isPhoto(u))) return fail("Vali AI tehtud disainivariant või lisa toa fotod");
    const mode = b.mode === "asis" ? "asis" as const : "design" as const;
    // fotod kontrollitakse ENNE krediidi võtmist (vigane foto ei maksa midagi)
    const jpgs: (Uint8Array | null)[] = [];
    for (const u of list) {
      if (!isPhoto(u)) { jpgs.push(null); continue; }
      let raw: Uint8Array;
      try { raw = Uint8Array.from(atob(u.slice(u.indexOf(",") + 1)), (c) => c.charCodeAt(0)); } catch { return fail("Foto on vigane"); }
      if (raw.length > 6_000_000) return fail("Foto on liiga suur");
      const { bytes } = await asJpeg(raw);
      if (sniffType(bytes) !== "image/jpeg" || !jpegSize(bytes)) return fail("Foto on vigane, lisa see uuesti");
      jpgs.push(bytes);
    }
    const D = (b.dims || null) as Record<string, unknown> | null, n = (v: unknown) => Number(String(v ?? "").replace(",", "."));
    const dims = D && [D.w, D.d, D.h].every((v) => n(v) > 0) ? { w: n(D.w), d: n(D.d), h: n(D.h) } : null;
    if (dims && !(dims.w >= 1.5 && dims.w <= 20 && dims.d >= 1.5 && dims.d <= 20 && dims.h >= 2 && dims.h <= 6)) return fail("Toa mõõdud: laius ja sügavus 1,5–20 m, kõrgus 2–6 m");
    await refundStale(me.companyId);
    if (!(await rateLimit("3d:" + me.companyId, 10, 3600))) return fail("Liiga palju 3D-töid lühikese ajaga. Proovi hiljem.", 429);
    const id = crypto.randomUUID(), label = String(b.label || (mode === "asis" ? "Tuba 3D-s (fotodest)" : "Tuba 3D-s")).slice(0, 120);
    let credits: number;
    try { credits = await spend(me.companyId, "3d", label, id); }
    catch (e) { const m = (e as Error).message; return fail(m, m === "insufficient_credits" ? 402 : 400); }
    // kasutaja fotod avalikku kausta (MuAPI ja Claude loevad neid aadressi järgi), alati JPEG
    let srcs: string[];
    try { srcs = await Promise.all(list.map((u, i) => jpgs[i] ? put(`room/${me.companyId}/${id}/src-${i}.jpg`, jpgs[i]!, "image/jpeg") : Promise.resolve(u))); }
    catch (e) { const r = await refund(id); return json({ error: (e as Error).message + ". " + failText(r), refunded: r }, 500); }
    const st: St = { v: 1, src: srcs[0], srcs, mode, dims, stage: "measure", floor: {}, wall: {}, models: {}, t0: Date.now(), cost: 0, lock: 0 };
    const { error } = await db.from("renders").insert({ id, company_id: me.companyId, kind: "3d", tpl: "sisek", prompt: "[tuba " + mode + "] " + label, input_urls: srcs, stage: "measure", room: st });
    if (error) { const r = await refund(id); return json({ error: failText(r), refunded: r }, 500); }
    return json({ id, status: "pending", credits, ...progress(st) });
  }

  const id = String(b.id || "");
  const { data: r } = await db.from("renders").select("id,status,stage,room,output_url").eq("id", id).eq("company_id", me.companyId).eq("kind", "3d").maybeSingle();
  if (!r || !r.room) return fail("not found", 404);
  let st = r.room as St;

  if (b.action === "redo") {
    // üks mööbliese uuesti (tasuta, kuni 3 korda töö kohta)
    const key = String(b.key || ""), m = st.models?.[key];
    if (r.status !== "done" || !m) return fail("Seda eset ei saa uuesti teha");
    const used = Object.values(st.models).reduce((a, x) => a + (x.redo || 0), 0);
    if (used >= REDO_MAX) return fail(`Uuesti tegemisi on selle toa kohta ${REDO_MAX}`);
    const it = st.plan!.items.find((i) => i.key === key)!;
    try {
      const rid = await muSubmit("nano-banana-edit", { prompt: ISO(it.name) + " Show it from a slightly different angle than before.", images_list: [m.crop!] });
      st.models[key] = { crop: m.crop, iso: { rid }, tri: {}, redo: (m.redo || 0) + 1, prev: m.glb || m.prev };
    } catch (e) { return fail("Uuesti tegemine ei alanud: " + (e as Error).message, 502); }
    st.stage = "parts"; st.frontsDone = true; st.lock = 0;
    await db.from("renders").update({ status: "pending", stage: "parts", room: st }).eq("id", id);
    return json({ id, status: "pending", ...progress(st) });
  }

  if (b.action !== "status") return fail("tundmatu tegevus");
  await refundStale(me.companyId);
  if (r.status === "failed") { const n = await refund(id); return json({ id, status: "failed", error: failText(n), refunded: n }); }
  if (r.status === "done") return json({ id, status: "done", url: r.output_url, ...progress(st) });
  // üks samm korraga: lukk 3 min (kui päring katkes, võtab järgmine üle)
  const now = Date.now();
  if (st.lock && now - st.lock < 180_000) return json({ id, status: "pending", ...progress(st) });
  const lock = { ...st, lock: now };
  const { data: got } = await db.from("renders").update({ room: lock }).eq("id", id).eq("status", "pending").filter("room->>lock", "eq", String(st.lock || 0)).select("id");
  if (!got?.length) return json({ id, status: "pending", ...progress(st) });
  try {
    st = await step(id, me.companyId, lock);
    st.lock = 0;
    const firstRun = !Object.values(st.models).some((m) => m.redo);
    if (st.stage === "done") {
      await db.from("renders").update({ status: "done", stage: null, output_url: st.out, room: st }).eq("id", id);
      return json({ id, status: "done", url: st.out, ...progress(st) });
    }
    // mõõtmine ebaõnnestus täiesti -> viga; üksik mööbel võib ebaõnnestuda (siis kast)
    if (firstRun && now - st.t0 > 20 * 60_000) throw new Error("ajapiirang");
    await db.from("renders").update({ stage: st.stage, room: st }).eq("id", id);
    return json({ id, status: "pending", ...progress(st) });
  } catch (e) {
    console.error("room-3d", id, (e as Error).message);
    if (Object.values(st.models).some((m) => m.redo) && st.out) {
      // uuesti tegemine ebaõnnestus: tuba jääb alles nagu enne
      await db.from("renders").update({ status: "done", stage: null, room: { ...st, lock: 0, stage: "done" } }).eq("id", id);
      return json({ id, status: "done", url: st.out, error: "Eseme uuesti tegemine ebaõnnestus." });
    }
    const n = await refund(id);
    await db.from("renders").update({ status: "failed", stage: null, error: String((e as Error).message).slice(0, 500), room: { ...st, lock: 0 } }).eq("id", id);
    return json({ id, status: "failed", error: failText(n), refunded: n });
  }
}

Deno.serve(handler);
