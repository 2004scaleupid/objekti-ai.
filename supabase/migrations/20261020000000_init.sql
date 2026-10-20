-- Vaade3D: põhiskeem (ettevõtted, krediidid, objektid, AI pildid, tooted, vidin, päringud, partnerid)

-- ---------- ettevõtted ja kasutajad ----------
-- toote/logo pildid peavad olema meie enda failihoidlas (ei mingeid võõraid ega javascript: linke)
create or replace function public.storage_urls_ok(u text[]) returns boolean language sql immutable as $$
  select coalesce(bool_and(x ~ '^https://[^/"<>\s]+/storage/v1/object/public/products/[^"<>\s]+$'), true) from unnest(u) x
$$;

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  reg_code text, phone text, web text, logo_url text,
  logo_on_images boolean not null default true, -- firma logo AI-piltide alla paremale
  constraint companies_logo_url_ok check (logo_url is null or logo_url ~ '^https://[^/"<>\s]+/storage/v1/object/public/products/[^"<>\s]+$'),
  constraint companies_web_ok check (web is null or length(web) < 200),
  constraint companies_text_ok check (length(name) <= 120 and length(coalesce(phone,'')) <= 40 and length(coalesce(reg_code,'')) <= 20 and pg_column_size(services) + pg_column_size(areas) + pg_column_size(roof_mat) + pg_column_size(wall_mat) < 20000),
  niche text, source text, source_other text,
  services jsonb not null default '[]', areas jsonb not null default '[]',
  roof_mat jsonb not null default '[]', wall_mat jsonb not null default '[]',
  partner_code text,                -- müüja/partneri kood, millega firma liitus (ei muutu)
  promo_left int not null default 0, -- mitu soodushinnaga kasutust on alles
  created_at timestamptz not null default now()
);

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  name text, email text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function public.my_company() returns uuid
language sql stable security definer set search_path=public, pg_temp as
$$ select company_id from public.profiles where user_id = auth.uid() $$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path=public, pg_temp as
$$ select coalesce((select is_admin from public.profiles where user_id = auth.uid()), false) $$;

-- ---------- programmi reeglid ja hinnad (üks rida) ----------
create table public.settings (
  id int primary key default 1 check (id = 1),
  credit_eur numeric not null default 0.5,
  price_obj numeric not null default 10,
  price_pic numeric not null default 4,
  price_design numeric not null default 2,
  price_lead numeric not null default 7,
  welcome_credits numeric not null default 30,
  promo_pct numeric not null default 20,
  promo_uses int not null default 20,
  partner_pct numeric not null default 25,
  partner_uses int not null default 0,      -- 0 = alatiseks
  payout_min numeric not null default 20
);
insert into public.settings default values;

-- ---------- partnerid / müüjad ----------
create table public.partners (
  code text primary key check (code ~ '^[A-Z0-9]{3,20}$'),
  owner_user uuid references auth.users(id) on delete set null,
  name text not null, email text, iban text,
  seller boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index partners_owner_uq on public.partners(owner_user) where owner_user is not null;
create table public.payouts (
  id uuid primary key default gen_random_uuid(),
  code text not null references public.partners(code),
  amount numeric not null check (amount > 0),
  note text, created_at timestamptz not null default now()
);

-- ---------- krediidid (ainult server kirjutab) ----------
create table public.credit_ledger (
  id bigserial primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  delta numeric not null,           -- + ost/boonus, - kasutus
  eur numeric not null default 0,   -- makstud summa (ostud)
  kind text not null,               -- welcome|purchase|chargeback|obj|pic|design|lead|refund|admin
  label text,
  promo boolean not null default false,
  ref text,                         -- nt stripe session id, objekti id
  ext text,                         -- Stripe payment_intent (tagasimaksete jaoks)
  created_at timestamptz not null default now()
);
create index on public.credit_ledger(company_id, created_at desc);
create unique index credit_ledger_ref_uq on public.credit_ledger(ref) where kind = 'purchase';
create unique index credit_ledger_refund_uq on public.credit_ledger(ref) where kind = 'refund';
create unique index credit_ledger_cb_uq on public.credit_ledger(ref) where kind = 'chargeback';
create index credit_ledger_ext_ix on public.credit_ledger(ext) where ext is not null;

create or replace view public.company_balance with (security_invoker = true) as
  select company_id, coalesce(sum(delta),0) as credits from public.credit_ledger group by company_id;

-- Kulutab krediite serveris; hind tuleb settings tabelist, mitte brauserist.
create or replace function public.spend_credits(p_company uuid, p_kind text, p_label text, p_ref text default null)
returns numeric language plpgsql security definer set search_path=public, pg_temp as $$
declare s settings; base numeric; price numeric; bal numeric; c companies; use_promo boolean := false;
begin
  select * into s from settings where id=1;
  base := case p_kind when 'obj' then s.price_obj when 'pic' then s.price_pic when 'design' then s.price_design when 'lead' then s.price_lead else null end;
  if base is null then raise exception 'unknown kind %', p_kind; end if;
  select * into c from companies where id=p_company for update;
  if not found then raise exception 'company not found'; end if;
  price := base;
  if p_kind <> 'lead' and c.promo_left > 0 then price := round(base*(1-s.promo_pct/100),2); use_promo := true; end if;
  select coalesce(sum(delta),0) into bal from credit_ledger where company_id=p_company;
  if bal < price then raise exception 'insufficient_credits' using errcode='P0001'; end if;
  insert into credit_ledger(company_id,delta,kind,label,promo,ref) values (p_company,-price,p_kind,p_label,use_promo,p_ref);
  if use_promo then update companies set promo_left = promo_left-1 where id=p_company; end if;
  return bal-price;
end $$;
revoke all on function public.spend_credits(uuid,text,text,text) from public, anon, authenticated;

-- Tagastus: täpselt see summa, mis selle viitega võeti, ainult üks kord, ja soodustuse kasutus tuleb tagasi.
create or replace function public.refund_credits(p_ref text) returns numeric
language plpgsql security definer set search_path=public, pg_temp as $$
declare r credit_ledger;
begin
  if p_ref is null then return 0; end if;
  select * into r from credit_ledger where ref = p_ref and delta < 0 and kind in ('obj','pic','design','lead') order by created_at limit 1;
  if not found then return 0; end if;
  if exists(select 1 from credit_ledger where ref = p_ref and kind = 'refund') then return 0; end if;
  insert into credit_ledger(company_id,delta,kind,label,ref) values (r.company_id, -r.delta, 'refund', 'Tagastus: '||coalesce(r.label,''), p_ref);
  if r.promo then update companies set promo_left = promo_left + 1 where id = r.company_id; end if;
  return -r.delta;
end $$;
revoke all on function public.refund_credits(text) from public, anon, authenticated;

-- Sisselogitud kasutaja kulutab oma firma krediite (objektivaade jms).
create or replace function public.spend_my_credits(p_kind text, p_label text, p_ref text default null)
returns numeric language plpgsql security definer set search_path=public, pg_temp as $$
begin
  -- AI-pildid ja disainid võtab server ise; kasutaja saab siit maksta ainult objektivaate eest
  if p_kind <> 'obj' then raise exception 'not allowed'; end if;
  return spend_credits(my_company(), p_kind, left(p_label,120), case when p_ref is null then null else 'u:'||left(p_ref,40) end);
end $$;
revoke all on function public.spend_my_credits(text,text,text) from public, anon, authenticated;

-- Uus kasutaja: firma, profiil, tervituskrediidid, partnerikood.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path=public, pg_temp as $$
declare cid uuid; s settings; v_code text; meta jsonb := coalesce(new.raw_user_meta_data,'{}'::jsonb);
begin
  select * into s from settings where id=1;
  v_code := upper(nullif(meta->>'ref',''));
  if v_code is not null and not exists(select 1 from partners p where p.code=v_code and p.active) then v_code := null; end if;
  insert into companies(name,niche,source,source_other,partner_code,promo_left)
    values (left(coalesce(nullif(trim(meta->>'company'),''),'Minu ettevõte'),120), left(meta->>'niche',40), left(meta->>'source',40), left(meta->>'source_other',120), v_code, case when v_code is null then 0 else s.promo_uses end)
    returning id into cid;
  insert into profiles(user_id,company_id,name,email) values (new.id,cid,left(meta->>'name',100),new.email);
  insert into credit_ledger(company_id,delta,kind,label) values (cid,s.welcome_credits,'welcome','Tervituskrediit');
  insert into widgets(company_id, notify_email) values (cid, new.email);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ---------- objektid (majavaated) ----------
create table public.objects (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  ehr text not null, address text not null,
  roof_type text, tpl text, job jsonb, colors jsonb,
  constraint objects_size_ok check (pg_column_size(job) < 20000 and pg_column_size(colors) < 5000),
  created_at timestamptz not null default now(), deleted_at timestamptz
);
create unique index objects_active_uq on public.objects(company_id, ehr) where deleted_at is null;
create index on public.objects(company_id, created_at desc);

-- ---------- AI pildid ----------
create table public.renders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  object_id uuid references public.objects(id) on delete set null,
  kind text not null check (kind in ('pic','design','place')),
  tpl text, prompt text, input_urls text[] not null default '{}',
  output_url text, status text not null default 'pending', error text,
  via_widget boolean not null default false,
  ehr text,                         -- esituspildi puhul maja EHR-kood
  created_at timestamptz not null default now()
);

-- ---------- tooted ----------
create table public.products (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null, images text[] not null default '{}',
  category text,                    -- nt Telgid, Saunad, Aiamajad (vidinas rühmitamiseks)
  w numeric, l numeric, h numeric, capacity text, price text, description text, link text,
  constraint products_link_ok check (link is null or link = '' or link ~ '^https?://[^"<>\s]+$'),
  constraint products_images_ok check (cardinality(images) <= 4 and public.storage_urls_ok(images)),
  constraint products_name_ok check (length(name) between 1 and 120),
  constraint products_text_ok check (length(coalesce(description,'')) <= 1000 and length(coalesce(capacity,'')) <= 200 and length(coalesce(price,'')) <= 200 and length(coalesce(category,'')) <= 60),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- vidin ----------
create table public.widgets (
  company_id uuid primary key references public.companies(id) on delete cascade,
  public_id text unique not null default substr(replace(gen_random_uuid()::text,'-',''),1,12),
  title text, show_dims boolean not null default true, color text, style text not null default 'classic',
  features text not null default 'house' check (features in ('house','place','both')),
  notify_email text, notify_sms text, webhook_url text,
  daily_lead_cap int not null default 30 check (daily_lead_cap between 0 and 500),   -- kaitse: rohkem päringuid päevas ei võeta
  daily_img_cap int not null default 30 check (daily_img_cap between 0 and 500),     -- kaitse: rohkem AI-pilte päevas ei tehta
  constraint widgets_hook_ok check (webhook_url is null or webhook_url = '' or webhook_url ~ '^https://[^"<>\s]+$'),
  active boolean not null default true
);

-- ---------- päringud (ainult nimi, e-post, aadress) ----------
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null, email text not null, address text not null,
  product text, date_wish text, services jsonb not null default '[]',
  ehr text, measures jsonb, image_url text,
  status text not null default 'new' check (status in ('new','called','done','lost')),
  seen boolean not null default false,
  delivered jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index on public.leads(company_id, created_at desc);

-- ---------- tagasiside ----------
create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  stars int check (stars between 1 and 5), nps int check (nps between 0 and 10),
  likes jsonb not null default '[]', fixes jsonb not null default '[]', comment text check (length(comment) <= 2000),
  created_at timestamptz not null default now()
);

-- ---------- vidina kuritarvituse piirang ----------
create table public.rate_limits (
  key text primary key, n int not null default 0, window_start timestamptz not null default now()
);
-- Aatomiline piirang: tagastab true, kui päring on lubatud (max N korda aknas).
create or replace function public.rate_hit(p_key text, p_max int, p_window_sec int) returns boolean
language plpgsql security definer set search_path=public, pg_temp as $$
declare n int;
begin
  insert into rate_limits(key,n,window_start) values (p_key,1,now())
  on conflict (key) do update set
    n = case when rate_limits.window_start < now() - make_interval(secs => p_window_sec) then 1 else rate_limits.n + 1 end,
    window_start = case when rate_limits.window_start < now() - make_interval(secs => p_window_sec) then now() else rate_limits.window_start end
  returning rate_limits.n into n;
  if random() < 0.01 then delete from rate_limits where window_start < now() - interval '3 days'; end if;
  return n <= p_max;
end $$;
revoke all on function public.rate_hit(text,int,int) from public, anon, authenticated;


-- ---------- RLS ----------
alter table public.companies enable row level security;
alter table public.profiles enable row level security;
alter table public.settings enable row level security;
alter table public.partners enable row level security;
alter table public.payouts enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.objects enable row level security;
alter table public.renders enable row level security;
alter table public.products enable row level security;
alter table public.widgets enable row level security;
alter table public.leads enable row level security;
alter table public.feedback enable row level security;
alter table public.rate_limits enable row level security;

create policy co_read on public.companies for select using (id = my_company() or is_admin());
create policy co_upd on public.companies for update using (id = my_company()) with check (id = my_company());
-- partner_code ja promo_left muudab ainult server: kasutaja tohib muuta ainult neid veerge
revoke update on public.companies from anon, authenticated;
grant update (name, reg_code, phone, web, logo_url, logo_on_images, services, areas, roof_mat, wall_mat) on public.companies to authenticated;

create policy pr_read on public.profiles for select using (user_id = auth.uid() or is_admin());
create policy pr_upd on public.profiles for update using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke update on public.profiles from anon, authenticated;
grant update (name) on public.profiles to authenticated;

create policy st_read on public.settings for select using (true);
create policy st_admin on public.settings for update using (is_admin());

create policy pa_read on public.partners for select using (owner_user = auth.uid() or is_admin());
create policy pa_admin on public.partners for all using (is_admin()) with check (is_admin());
-- müüja saab ise muuta ainult oma IBAN-i
create policy pa_own_upd on public.partners for update using (owner_user = auth.uid()) with check (owner_user = auth.uid());
revoke update on public.partners from anon, authenticated;
grant update (iban) on public.partners to authenticated;
create policy po_read on public.payouts for select using (is_admin() or code in (select code from partners where owner_user = auth.uid()));
create policy po_admin on public.payouts for insert with check (is_admin());

create policy cl_read on public.credit_ledger for select using (company_id = my_company() or is_admin());

create policy ob_all on public.objects for all using (company_id = my_company()) with check (company_id = my_company());
-- objekti saab luua ainult create_object kaudu (see võtab krediidid); muuta saab ainult tööde andmeid ja kustutada
revoke insert, update, delete on public.objects from anon, authenticated;
grant update (job, colors, roof_type, deleted_at) on public.objects to authenticated;
create policy ob_admin on public.objects for select using (is_admin());
create policy rn_read on public.renders for select using (company_id = my_company() or is_admin());
create policy pd_all on public.products for all using (company_id = my_company()) with check (company_id = my_company());
create policy wg_all on public.widgets for all using (company_id = my_company()) with check (company_id = my_company());
-- vidin luuakse liitumisel; firma muudab ainult seadeid (mitte avalikku ID-d)
revoke insert, update, delete on public.widgets from anon, authenticated;
grant update (title, show_dims, color, style, features, notify_email, notify_sms, webhook_url, active, daily_lead_cap, daily_img_cap) on public.widgets to authenticated;
revoke insert, update, delete on public.companies, public.profiles, public.settings, public.partners, public.payouts, public.rate_limits from anon;
revoke delete on public.companies, public.profiles from authenticated;
create policy ld_read on public.leads for select using (company_id = my_company());
create policy ld_upd on public.leads for update using (company_id = my_company()) with check (company_id = my_company());
revoke update on public.leads from anon, authenticated;
grant update (status, seen) on public.leads to authenticated;
revoke insert, delete on public.leads from anon, authenticated;
revoke insert, update, delete on public.credit_ledger, public.renders from anon, authenticated;
create policy fb_ins on public.feedback for insert with check (company_id = my_company());
create policy fb_admin on public.feedback for select using (is_admin());

-- Müüjaks hakkamine: loob koodi kasutajale (üks kood kasutaja kohta).
create or replace function public.become_seller(p_code text default null) returns text
language plpgsql security definer set search_path=public, pg_temp as $$
declare c text; n text; e text; base text; k int := 0;
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  if exists(select 1 from partners where owner_user = auth.uid()) then return (select code from partners where owner_user=auth.uid() limit 1); end if;
  select name, email into n, e from profiles where user_id = auth.uid();
  -- kood tehakse serveris (nimi + juhuslikud numbrid), et keegi ei saaks võõrast või ametlikku koodi endale võtta
  base := upper(regexp_replace(translate(split_part(coalesce(n,''),' ',1),'ÕÄÖÜŠŽõäöüšž','OAOUSZoaousz'),'[^A-Za-z]','','g'));
  base := left(case when length(base) >= 2 then base else 'PARTNER' end, 8);
  if base ~ '^(VAADE|ADMIN|TEST|SUPPORT|INFO|ABI|TASUTA|FREE)' then base := 'PARTNER'; end if;
  loop
    c := base || (1000 + floor(random()*9000))::int;
    exit when not exists(select 1 from partners where code = c);
    k := k + 1; if k > 20 then raise exception 'try again'; end if;
  end loop;
  insert into partners(code, owner_user, name, email) values (c, auth.uid(), coalesce(n,'Müüja'), e);
  return c;
end $$;
revoke all on function public.become_seller(text) from public, anon;
grant execute on function public.become_seller(text) to authenticated;

-- Partneri tulu: X% tema toodud firmade MAKSETEST (ostetud krediidid), alatiseks või esimesed N ostu.
-- Tasuta tervituskrediitide kasutamine komisjoni ei anna (muidu saaks võltskontodega raha teenida).
create or replace view public.partner_earnings with (security_invoker = true) as
  with s as (select * from settings where id=1),
  buys as (
    select c.partner_code as code, l.company_id, l.eur as eur_value, l.created_at,
           row_number() over (partition by l.company_id, (l.kind = 'purchase') order by l.created_at) as n, l.kind
    from credit_ledger l join companies c on c.id=l.company_id
    where l.kind in ('purchase','chargeback') and l.eur <> 0 and c.partner_code is not null
      -- müüja enda firma ostud komisjoni ei anna
      and not exists (select 1 from profiles pr join partners pp on pp.owner_user = pr.user_id where pr.company_id = l.company_id and pp.code = c.partner_code))
  select b.code, count(distinct b.company_id) as companies, sum(b.eur_value) as value_eur,
         round(sum(b.eur_value) * (select partner_pct from s)/100, 2) as earned_eur,
         -- viimase 14 päeva maksed on ootel (tagasimakse aken), neid veel välja ei maksta
         round(sum(b.eur_value) filter (where b.created_at > now() - interval '14 days') * (select partner_pct from s)/100, 2) as pending_eur
  from buys b, s where (s.partner_uses = 0 or b.kind = 'chargeback' or b.n <= s.partner_uses) group by b.code;

-- ---------- failihoidla ----------
-- ainult pildid, max 6 MB
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('uploads','uploads',false,6291456,array['image/jpeg','image/png','image/webp']) on conflict do nothing;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('renders','renders',true,10485760,array['image/jpeg','image/png','image/webp']) on conflict do nothing;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('products','products',true,6291456,array['image/jpeg','image/png','image/webp']) on conflict do nothing;
create policy up_own on storage.objects for all to authenticated
  using (bucket_id in ('uploads','products') and (storage.foldername(name))[1] = my_company()::text)
  with check (bucket_id in ('uploads','products') and (storage.foldername(name))[1] = my_company()::text);

-- Müüja enda tulu (security definer, sest müüja ei näe teiste firmade andmeid)
create or replace function public.my_partner_earnings()
returns table(code text, companies bigint, value_eur numeric, earned_eur numeric, paid_eur numeric, pending_eur numeric)
language sql stable security definer set search_path=public, pg_temp as $$
  select e.code, e.companies, e.value_eur, e.earned_eur,
         coalesce((select sum(amount) from payouts p where p.code=e.code),0), coalesce(e.pending_eur,0)
  from partner_earnings e where e.code in (select code from partners where owner_user = auth.uid())
$$;
revoke all on function public.my_partner_earnings() from public, anon;
grant execute on function public.my_partner_earnings() to authenticated;

-- Liitumisvormi jaoks: kas müüja/soodus kood on olemas (ei näita, kelle oma)
create or replace function public.ref_code_ok(p_code text) returns boolean
language sql stable security definer set search_path=public, pg_temp as $$
  select exists(select 1 from partners where code = upper(p_code) and active)
$$;
grant execute on function public.ref_code_ok(text) to anon, authenticated;

-- Uus objekt: krediidid võetakse ja objekt salvestatakse ühes tehingus. Sama maja uuesti avamine ei maksa.
create or replace function public.create_object(p_ehr text, p_address text, p_label text, p_job jsonb default null, p_tpl text default null, p_roof text default null)
returns jsonb language plpgsql security definer set search_path=public, pg_temp as $$
declare cid uuid := my_company(); oid uuid; bal numeric;
begin
  if cid is null then raise exception 'unauthorized'; end if;
  if p_ehr !~ '^[0-9]{6,12}$' then raise exception 'bad ehr'; end if;
  perform 1 from companies where id = cid for update; -- kaks samaaegset päringut ei saa sama maja eest kaks korda maksta
  select id into oid from objects where company_id = cid and ehr = p_ehr and deleted_at is null limit 1;
  if oid is not null then return jsonb_build_object('id', oid, 'charged', false); end if;
  oid := gen_random_uuid();
  bal := spend_credits(cid, 'obj', left(coalesce(p_label,'Objektivaade'),120), 'obj:'||oid);
  insert into objects(id, company_id, ehr, address, job, tpl, roof_type)
    values (oid, cid, p_ehr, left(coalesce(p_address,p_ehr),200), p_job, left(p_tpl,40), left(p_roof,20));
  return jsonb_build_object('id', oid, 'charged', true, 'credits', bal);
end $$;
revoke all on function public.create_object(text,text,text,jsonb,text,text) from public, anon;
grant execute on function public.create_object(text,text,text,jsonb,text,text) to authenticated;

-- Kui pildifunktsioon katkes (ajapiirang), jääb pilt "pending": tagastame krediidid 10 minuti pärast.
create or replace function public.refund_stale_renders(p_company uuid default null) returns int
language plpgsql security definer set search_path=public, pg_temp as $$
declare r record; n int := 0;
begin
  for r in select id from renders where status = 'pending' and created_at < now() - interval '10 minutes' and (p_company is null or company_id = p_company) for update skip locked loop
    perform refund_credits(r.id::text);
    update renders set status = 'failed', error = 'timeout' where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.refund_stale_renders(uuid) from public, anon, authenticated;

-- Stripe tagasimakse / vaidlustus: krediidid tagasi proportsionaalselt, lukuga (samaaegsed teated ei võta topelt)
create or replace function public.apply_chargeback(p_pi text, p_back_cents int, p_label text, p_ref text) returns numeric
language plpgsql security definer set search_path=public, pg_temp as $$
declare b credit_ledger; already int; add int; d numeric;
begin
  select * into b from credit_ledger where kind = 'purchase' and ext = p_pi for update;
  if not found then return 0; end if;
  if exists(select 1 from credit_ledger where kind = 'chargeback' and ref = p_ref) then return 0; end if;
  select coalesce(-round(sum(eur)*100),0)::int into already from credit_ledger where kind = 'chargeback' and ext = p_pi;
  add := least(p_back_cents, round(b.eur*100)::int) - already;   -- negatiivne = vaidlus võideti, krediidid tagasi
  if add = 0 then return 0; end if;
  d := round(b.delta * add / (b.eur*100), 2);
  insert into credit_ledger(company_id, delta, eur, kind, label, ref, ext) values (b.company_id, -d, -add/100.0, 'chargeback', p_label, p_ref, p_pi);
  return -d;
end $$;
revoke all on function public.apply_chargeback(text,int,text,text) from public, anon, authenticated;
