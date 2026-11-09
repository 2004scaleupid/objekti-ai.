// AI-abiline: Claude API, ainult objekti andmete põhjal.
import { cors, json, fail, userCompany, rateLimit, env, body, tfetch, admin } from "../_shared/util.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fail("POST only", 405);
  const me = await userCompany(req);
  if (!me) return fail("unauthorized", 401);
  // AI-abiline on tasuta, seega piirame: 80 küsimust päevas ja 20 tunnis firma kohta
  if (!(await rateLimit("chat-d:" + me.companyId, 80, 86400)) || !(await rateLimit("chat-h:" + me.companyId, 20, 3600))) return fail("AI-abilise limiit on täis, proovi hiljem uuesti", 429);
  let b: Record<string, unknown>;
  try { b = await body(req, 1_200_000); } catch { return fail("liiga suur", 413); }
  const role = String(b.role || "katuse- ja fassaadifirmadele").slice(0, 200);
  const ctx = JSON.stringify(b.context ?? {}).slice(0, 15000);
  const history = (Array.isArray(b.messages) ? b.messages : []).slice(-8).map((m: { role?: string; content?: string }) => ({
    role: m?.role === "assistant" ? "assistant" : "user", content: String(m?.content ?? "").slice(0, 2000) })).filter((m) => m.content);
  if (!history.length || history[history.length - 1].role !== "user") return fail("küsimus puudub");
  const studio = b.mode === "studio", evspec = b.mode === "event-spec", evcount = b.mode === "event-count";
  // stuudio: kuni 3 väikest pilti (kasutaja pildid 1, 2, 3) viimase küsimuse juurde
  const imgs = (studio || evcount) && Array.isArray(b.images) ? b.images.slice(0, 3).map(String).map((u) => u.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/)).filter((m): m is RegExpMatchArray => !!m && m[2].length <= 350_000) : [];
  const msgs: { role: string; content: unknown }[] = history;
  if (imgs.length) { const last = history[history.length - 1]; msgs[msgs.length - 1] = { role: "user", content: [...imgs.map((m) => ({ type: "image", source: { type: "base64", media_type: m[1], data: m[2] } })), { type: "text", text: last.content }] }; }
  const sysStudio = `Oled Vaade3D stuudio abiline. Kasutaja on Eesti ${role} ja teeb AI-ga pilte: muudab fotosid (fassaad, katus, hoov, sisekujundus, tooted kliendi hoovis) või loob pildi kirjelduse järgi. Kasutaja pildid on nummerdatud: pilt 1, pilt 2 jne, ja need on lisatud sõnumile samas järjekorras. Pildil võivad olla kasutaja märgid (ala 1, punkt A, toode 2), need on kirjas andmetes. Sina ise pilte ei tee: pildi teeb nupp „Genereeri“, mis maksab krediite. Aita sõnastada, mida AI peaks muutma, paku ideid ja vasta küsimustele. Kui kasutaja tahab pilti, kirjuta täpselt üks konkreetne juhis eraldi reale kujul: Juhis: „...“. Juhise all on nupp, mis teeb pildi kohe (krediitidega), seega ära kirjuta „vajuta Genereeri“. Ära korda juhist, mille sa juba andsid: kui kasutaja kordab sama soovi, vasta ühe lausega, et pildi saab teha juhise all olevast nupust. Küsimustele vasta tavaliselt, ilma juhiseta. Vasta eesti keeles, lühidalt (2–5 lauset). Hindu ära paku. Räägi ainult piltide, kujunduse, ehituse ja selle töö teemadel. Kui andmetes on "mudel", on need kasutaja 3D-mudelil tehtud mõõdud ja märkmed: kasuta neid pindade ja materjali koguste arvutamisel (näita lühidalt arvutuskäiku, varu lisa ainult kui küsitakse), ja kui mõõtkava pole seadistatud, ütle, et väärtused on suhtelised ja palu mõõtkava seadistada.\n\nANDMED (JSON):\n${ctx}`;
  // sündmuse planeerija: AI ainult teisendab kliendi vastused struktureeritud JSON-iks; paigutuse arvutab kood (js/eventplan.js)
  const sysSpec = `Sa teisendad Eesti peo- või sündmuseklienti soovid (eesti keeles) täpselt üheks JSON-objektiks. Väljasta AINULT JSON, ilma selgituse ja koodiblokita. Ära lisa midagi, mida klient ei soovinud; tundmatu väärtus = null. Mõõdud meetrites, koma asemel punkt.
Skeem:
{"name":string|null,"venue":"outdoor"|"indoor","area":{"l":number,"w":number}|null,"guests":number,
 "tent":{"type":"any"|"modular"|"pagoda"|"stretch"|"popup"|"none","size":[number,number]|null},
 "items":[ {"kind":"seating","table":TABLE_ID,"guests":number,"single":true|false},
   {"kind":"standing","guests":number}, {"kind":"stage","w":number,"d":number,"name":string|null},
   {"kind":"dance","w":number,"d":number}, {"kind":"catering","n":number,"w":number|null,"d":number|null},
   {"kind":"bar","n":number}, {"kind":"wc","n":number}, {"kind":"popup","n":number,"size":[number,number]},
   {"kind":"audience","guests":number}, {"kind":"heater","n":number}, {"kind":"light","n":number} ],
 "style":{"colors":[string],"mood":string|null,"notes":string|null},
 "rules":{"wall":number}|null}
TABLE_ID on üks kataloogi lauakoodidest (andmetes "lauad"). "Üks pikk laud kõigile" = rect183 või rect240 ja single:true. Ümarlaud ilma mõõduta = round180. Siseruum = tent.type "none" ja area = ruumi mõõdud. Telgi tüüp "valge telk" ilma täpsustuseta = "any". Seinavahe soov ("mööbel vähemalt 0,25 m seintest") = rules.wall.

ANDMED (JSON):
${ctx}`;
  // sündmuse pildi kontroll: kas AI-pilt hoidis laudade ja toolide arvu ning ei lisanud teksti
  const sysCount = `Sa loed fotol esemeid. Loe kokku nähtavad lauad (iga laud üks kord, ka pikkade laudade read loe lauaosadena ainult kui need on selgelt eraldi) ja toolid. Kontrolli ka, kas pildil on kirju, silte, logosid või tähti. Vasta AINULT JSON-iga: {"tables":täisarv,"chairs":täisarv,"text":true|false}`;
  const system = evcount ? sysCount : evspec ? sysSpec : studio ? sysStudio : `Oled Vaade3D abiline Eesti ${role}. Kui küsitakse kogust või materjali, arvesta ettevõtte materjalide ja tegevusaladega (andmetes "ettevote") ning lisa ettevõtte varu (varu_katus_pct ja varu_fassaad_pct) ja ütle, et varu on soovituslik. Vasta eesti keeles, lühidalt (2–5 lauset), konkreetsete numbritega. Arvuta ainult allolevate andmete põhjal, näita lühidalt arvutuskäiku ja ütle selgelt, mis on hinnang ja mis riigi andmetest. Kui andmetest ei piisa, ütle mida on vaja. Hindu ära paku. Räägi ainult selle objekti ja ehitustöödega seotud teemadel.\n\nOBJEKTI ANDMED (JSON):\n${ctx}`;
  try {
    const r = await tfetch(env("ANTHROPIC_API_URL", "https://api.anthropic.com") + "/v1/messages", {
      method: "POST",
      headers: { "x-api-key": env("ANTHROPIC_API_KEY"), "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: env("ANTHROPIC_MODEL", "claude-haiku-5-5"), max_tokens: evspec ? 1200 : evcount ? 100 : 600, system, messages: msgs }),
    }, 45000);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { console.error("anthropic", r.status, JSON.stringify(j).slice(0, 300)); return fail("AI-abiline ei vastanud, proovi uuesti", 502); }
    // kulu admini ülevaate jaoks (hind dollarites miljoni tokeni kohta, Haiku 5.5: 0,10 / 0,50)
    const inT = Number(j.usage?.input_tokens) || 0, outT = Number(j.usage?.output_tokens) || 0;
    const cost = (inT * Number(env("ANTHROPIC_PRICE_IN", "0.10")) + outT * Number(env("ANTHROPIC_PRICE_OUT", "0.50"))) / 1e6;
    await admin().from("ai_usage").insert({ company_id: me.companyId, kind: evspec || evcount ? "chat-event" : studio ? "chat-studio" : "chat", model: String(j.model || "").slice(0, 60), input_tokens: inT, output_tokens: outT, cost_usd: cost }).then(() => {}, () => {});
    const text = (j.content || []).map((c: { text?: string }) => c.text || "").join("");
    if (evcount) { try { const m = text.match(/\{[\s\S]*\}/); const o = JSON.parse(m ? m[0] : text); return json({ count: { tables: Number(o.tables) || 0, chairs: Number(o.chairs) || 0, text: !!o.text } }); } catch { return fail("AI ei saanud pilti kontrollida", 502); } }
    if (evspec) { try { const m = text.match(/\{[\s\S]*\}/); return json({ spec: JSON.parse(m ? m[0] : text) }); } catch { return fail("AI ei saanud soovidest vormi täita, täida see käsitsi", 502); } }
    return json({ text });
  } catch { return fail("AI-abiline ei vastanud, proovi uuesti", 502); }
});
