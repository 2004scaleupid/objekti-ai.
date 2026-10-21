// Avalik: vidina seaded ja tooted (ilma isikuandmeteta). ?r=<märk> annab kliendile tema pildisoovi tulemuse.
import { cors, json, fail, admin, isOurImage } from "../_shared/util.ts";
import { opts } from "../widget-place/opts.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const q = new URL(req.url).searchParams, id = q.get("id") || "", r = q.get("r") || "";
  const db = admin();
  if (r) {
    if (!/^[a-f0-9]{32}$/.test(r)) return fail("bad token");
    const { data: x } = await db.from("widget_requests").select("company_id,status,result_url,items,created_at,sent_at").eq("token", r).maybeSingle();
    if (!x) return fail("not found", 404);
    const { data: c } = await db.from("companies").select("name,phone,web,logo_url").eq("id", x.company_id).single();
    return json({ status: x.status, url: x.status === "sent" && isOurImage(x.result_url, "renders") ? x.result_url : null, items: (x.items || []).map((i: { name: string }) => i.name),
      firm: { name: c?.name, phone: c?.phone, web: c?.web, logo: isOurImage(c?.logo_url, "products") ? c?.logo_url : null }, sent_at: x.sent_at });
  }
  if (!/^[a-f0-9]{6,32}$/.test(id)) return fail("bad id");
  const { data: w } = await db.from("widgets").select("company_id,title,show_dims,color,style,features,active,place_opts").eq("public_id", id).maybeSingle();
  if (!w || !w.active) return fail("not found", 404);
  const { data: c } = await db.from("companies").select("name,phone,web,logo_url,services").eq("id", w.company_id).single();
  const { data: p } = await db.from("products").select("id,name,category,images,w,l,h,capacity,price,description,link,placement,in_widget,sort").eq("company_id", w.company_id).eq("active", true).order("sort").order("created_at");
  const o = opts(w.place_opts), po = (w.place_opts || {}) as Record<string, unknown>;
  return new Response(JSON.stringify({
    firm: { name: c?.name, phone: c?.phone, web: c?.web, logo: isOurImage(c?.logo_url, "products") ? c?.logo_url : null, services: (c?.services || []).slice(0, 6) },
    title: w.title, dims: w.show_dims, color: w.color, style: w.style, features: w.features,
    place: { mode: o.mode, max: o.max_products, lead_first: o.lead_first, style: o.style, customer_style: o.customer_style, per_customer: o.per_customer, allow_note: o.allow_note,
      show_price: po.show_price !== false, cta: ["quote", "call", "link"].includes(String(po.cta)) ? po.cta : "quote", lang: ["et", "en", "ru", "fi"].includes(String(po.lang)) ? po.lang : "et" },
    products: (p || []).filter((x) => x.in_widget !== false).map((x) => ({ ...x, price: po.show_price === false ? null : x.price, images: (x.images || []).filter((u: string) => isOurImage(u, "products")) })),
  }), { headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "public, max-age=60" } });
});
