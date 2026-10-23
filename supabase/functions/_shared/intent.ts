// Kas kasutaja tekst on 3D-soov (toa 3D või foto → 3D), mitte pildi kujundus. Sama reegel mis äpis (index.html st3dIntent).
// Server kontrollib seda ENNE krediidi võtmist: vana või ootamatu klient ei saa 3D-soovi eest kujunduse tasu võtta.
const ST_3D = /(^|[^a-z0-9])3\s*-?\s*d(?![a-z])/i;
const ST_ROOMW = /(ruum|tuba|toa\b|toast|saun|köök|köögi|interjöör|siseruum)/i;
const ST_DESIGNW = /(stiil|kujund|värv|disain|moodn|modern|skandinaav|hele|tume|muuda|asenda|remont|renoveeri|vaheta|uus |uue )/i;
const ST_OBJW = /(mudel|ese|eseme|tool|laud|laua|diivan|keris|pink|lamp|toode|toote|kapp|voodi)/i;
const QUESTION = /^(mis|mida|kas|kuidas|miks|millal|kus|kes|kumb|kumba|milline|millised|millist|mitu|palju|kui palju|soovita|anna nõu|aita|räägi|selgita|kirjelda mulle)\b/;

export function is3dIntent(text: unknown): "room" | "object" | null {
  const t = String(text ?? "").toLowerCase().trim();
  if (!ST_3D.test(t) || ST_DESIGNW.test(t) || t.endsWith("?")) return null;
  const n = t.replace(/[„“"«»'.,!?:;]/g, " ").replace(/\s+/g, " ").trim();
  if (QUESTION.test(n)) return null;
  return ST_ROOMW.test(t) ? "room" : ST_OBJW.test(t) ? "object" : "room";
}
