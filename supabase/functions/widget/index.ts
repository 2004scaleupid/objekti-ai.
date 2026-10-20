// Avalik: vidina seaded ja tooted (ilma isikuandmeteta).
import { cors, json, fail, admin } from "../_shared/util.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const id = new URL(req.url).searchParams.get("id") || "";
  if (!/^[a-f0-9]{6,32}$/.test(id)) return fail("bad id");
  const db = admin();
  const { data: w } = await db.from("widgets").select("company_id,title,show_dims,color,style,features,active").eq("public_id", id).maybeSingle();
  if (!w || !w.active) return fail("not found", 404);
  const { data: c } = await db.from("companies").select("name,phone,web,logo_url,services").eq("id", w.company_id).single();
  const { data: p } = await db.from("products").select("id,name,category,images,w,l,h,capacity,price,description,link").eq("company_id", w.company_id).eq("active", true);
  return new Response(JSON.stringify({
    firm: { name: c?.name, phone: c?.phone, web: c?.web, logo: c?.logo_url, services: (c?.services || []).slice(0, 6) },
    title: w.title, dims: w.show_dims, color: w.color, style: w.style, features: w.features, products: p || [],
  }), { headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "public, max-age=60" } });
});
