// Admini päris andmed: firmad, kasutus, ostud, partnerid, väljamaksed, tagasiside. Ainult admin.
import { cors, json, fail, userCompany, admin } from "../_shared/util.ts";

const day = (t: string) => String(t).slice(0, 10);
type Row = Record<string, unknown>;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const me = await userCompany(req);
  if (!me) return fail("unauthorized", 401);
  const db = admin();
  const { data: p } = await db.from("profiles").select("is_admin").eq("user_id", me.userId).single();
  if (!p?.is_admin) return fail("forbidden", 403);

  const L = 50000;
  const [co, pr, led, ob, rn, fb, pa, po, ld, earn, st] = await Promise.all([
    db.from("companies").select("id,name,niche,source,partner_code,created_at").limit(L),
    db.from("profiles").select("company_id,name,email,is_admin,created_at").limit(L),
    db.from("credit_ledger").select("company_id,delta,eur,kind,ref,created_at").order("created_at").limit(L),
    db.from("objects").select("id,tpl").limit(L),
    db.from("renders").select("id,tpl,kind,via_widget").limit(L),
    db.from("feedback").select("company_id,stars,nps,likes,fixes,comment,created_at").limit(L),
    db.from("partners").select("code,owner_user,name,email,iban,seller,active,created_at").limit(L),
    db.from("payouts").select("code,amount,note,created_at").order("created_at").limit(L),
    db.from("leads").select("company_id,created_at").limit(L),
    db.from("partner_earnings").select("*").limit(L),
    db.from("settings").select("partner_pct,partner_uses").eq("id", 1).single(),
  ]);
  const err = [co, pr, led, ob, rn, fb, pa, po, ld].find((r) => r.error);
  if (err) { console.error("admin-data", err.error); return fail("andmete laadimine ebaõnnestus", 500); }

  const objTpl = new Map((ob.data || []).map((o: Row) => ["obj:" + o.id, o.tpl as string | null]));
  const rnTpl = new Map((rn.data || []).map((r: Row) => [String(r.id), r.via_widget || r.kind === "place" ? "toodehoov" : (r.tpl as string | null)]));
  // tagastatud kulud (ebaõnnestunud pildid jne) ei ole kasutus
  const refunded = new Set((led.data || []).filter((l: Row) => l.kind === "refund" && l.ref).map((l: Row) => String(l.ref)));

  const users = new Map<string, Row & { ev: Row[]; fb: Row[] }>();
  for (const c of co.data || []) {
    const prof = (pr.data || []).find((x: Row) => x.company_id === c.id) || {} as Row;
    const ev: Row[] = [{ t: "signup", d: day(c.created_at) }];
    if (c.partner_code) ev.push({ t: "promo", d: day(c.created_at), code: c.partner_code });
    users.set(c.id, { id: c.id, name: prof.name || "(nimeta)", email: prof.email || "", company: c.name || "", joined: day(c.created_at),
      source: c.source || "", niche: c.niche || "", code: c.partner_code || "", admin: !!prof.is_admin, bal: 0, paid: 0, leads: 0, ev, fb: [] });
  }
  // partneri tulu kliendi kohta (sama reegel mis partner_earnings: ostud, partner_uses piires)
  const buyN = new Map<string, number>();
  for (const l of led.data || []) {
    const u = users.get(String(l.company_id)); if (!u) continue;
    const delta = Number(l.delta) || 0, e = Number(l.eur) || 0, d = day(String(l.created_at));
    u.bal = Number(u.bal) + delta;
    if (l.kind === "purchase" || l.kind === "chargeback") {
      u.paid = Number(u.paid) + e; u.ev.push({ t: "purchase", d, cr: delta, eur: e });
      if (l.kind === "purchase") buyN.set(String(l.company_id), (buyN.get(String(l.company_id)) || 0) + 1);
      const lim = Number(st.data?.partner_uses) || 0, n = buyN.get(String(l.company_id)) || 0;
      if (u.code && (lim === 0 || l.kind === "chargeback" || n <= lim)) u.commBase = Number(u.commBase || 0) + e;
    } else if ((l.kind === "obj" || l.kind === "pic" || l.kind === "design") && delta < 0 && !refunded.has(String(l.ref))) {
      const ref = String(l.ref || "");
      u.ev.push({ t: l.kind === "obj" ? "obj" : "pic", d, cr: -delta, tpl: (l.kind === "obj" ? objTpl.get(ref) : rnTpl.get(ref)) || undefined });
    } else if (l.kind === "lead" && delta < 0) {
      u.ev.push({ t: "lead", d, cr: -delta });
    }
  }
  for (const l of ld.data || []) { const u = users.get(String(l.company_id)); if (u) u.leads = Number(u.leads) + 1; }
  for (const f of fb.data || []) {
    const u = users.get(String(f.company_id)); if (!u) continue;
    u.fb.push({ stars: f.stars, nps: f.nps, like: f.likes || [], fix: f.fixes || [], txt: f.comment || "", d: day(f.created_at) });
  }
  const out = [...users.values()].map((u) => ({ ...u, bal: Math.round(Number(u.bal) * 100) / 100, paid: Math.round(Number(u.paid) * 100) / 100,
    commBase: Math.round(Number(u.commBase || 0) * 100) / 100, ev: u.ev.sort((a, b) => (String(a.d) < String(b.d) ? -1 : 1)) }));

  const E = new Map((earn.data || []).map((e: Row) => [String(e.code), e]));
  const paidBy = new Map<string, number>();
  (po.data || []).forEach((x: Row) => paidBy.set(String(x.code), (paidBy.get(String(x.code)) || 0) + Number(x.amount || 0)));
  const partners = (pa.data || []).map((x: Row) => {
    const e = E.get(String(x.code)) || {} as Row, earned = Number(e.earned_eur || 0), paidOut = paidBy.get(String(x.code)) || 0;
    return { code: x.code, owner: x.name || x.code, email: x.email || "", iban: x.iban || "", created: day(String(x.created_at)), seller: !!x.seller, active: x.active !== false,
      earned, pending: Number(e.pending_eur || 0), value: Number(e.value_eur || 0), paidOut, due: Math.max(0, Math.round((earned - Number(e.pending_eur || 0) - paidOut) * 100) / 100) };
  });
  const owners = new Map(partners.map((p) => [p.code, p.owner]));
  const payouts = (po.data || []).map((x: Row) => ({ code: x.code, owner: owners.get(String(x.code)) || x.code, amount: Number(x.amount), note: x.note || "", d: day(String(x.created_at)) }));
  return json({ users: out, partners, payouts, at: new Date().toISOString() });
});
