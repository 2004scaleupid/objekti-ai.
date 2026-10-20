-- Vaade3D: põhiskeem (ettevõtted, krediidid, objektid, AI pildid, tooted, vidin, päringud, partnerid)
create extension if not exists pgcrypto;

-- ---------- ettevõtted ja kasutajad ----------
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  reg_code text, phone text, web text, logo_url text,
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
language sql stable security definer set search_path=public as
$$ select company_id from public.profiles where user_id = auth.uid() $$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path=public as
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
  kind text not null,               -- welcome|purchase|obj|pic|design|lead|refund|admin
  label text,
  promo boolean not null default false,
  ref text,                         -- nt stripe session id, objekti id
  created_at timestamptz not null default now()
);
create index on public.credit_ledger(company_id, created_at desc);
create unique index credit_ledger_ref_uq on public.credit_ledger(ref) where kind = 'purchase';

create or replace view public.company_balance with (security_invoker = true) as
  select company_id, coalesce(sum(delta),0) as credits from public.credit_ledger group by company_id;

-- Kulutab krediite serveris; hind tuleb settings tabelist, mitte brauserist.
create or replace function public.spend_credits(p_company uuid, p_kind text, p_label text, p_ref text default null)
returns numeric language plpgsql security definer set search_path=public as $$
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

-- Sisselogitud kasutaja kulutab oma firma krediite (objektivaade jms).
create or replace function public.spend_my_credits(p_kind text, p_label text, p_ref text default null)
returns numeric language plpgsql security definer set search_path=public as $$
begin
  if p_kind not in ('obj','pic','design') then raise exception 'not allowed'; end if;
  return spend_credits(my_company(), p_kind, p_label, p_ref);
end $$;
grant execute on function public.spend_my_credits(text,text,text) to authenticated;

-- Uus kasutaja: firma, profiil, tervituskrediidid, partnerikood.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path=public as $$
declare cid uuid; s settings; v_code text; meta jsonb := coalesce(new.raw_user_meta_data,'{}'::jsonb);
begin
  select * into s from settings where id=1;
  v_code := upper(nullif(meta->>'ref',''));
  if v_code is not null and not exists(select 1 from partners p where p.code=v_code and p.active) then v_code := null; end if;
  insert into companies(name,niche,source,source_other,partner_code,promo_left)
    values (coalesce(nullif(meta->>'company',''),'Minu ettevõte'), meta->>'niche', meta->>'source', meta->>'source_other', v_code, case when v_code is null then 0 else s.promo_uses end)
    returning id into cid;
  insert into profiles(user_id,company_id,name,email) values (new.id,cid,meta->>'name',new.email);
  insert into credit_ledger(company_id,delta,kind,label) values (cid,s.welcome_credits,'welcome','Tervituskrediit');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ---------- objektid (majavaated) ----------
create table public.objects (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  ehr text not null, address text not null,
  roof_type text, tpl text, job jsonb, colors jsonb,
  created_at timestamptz not null default now(), deleted_at timestamptz
);
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
  created_at timestamptz not null default now()
);

-- ---------- tooted ----------
create table public.products (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null, images text[] not null default '{}',
  w numeric, l numeric, h numeric, capacity text, price text, description text, link text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- vidin ----------
create table public.widgets (
  company_id uuid primary key references public.companies(id) on delete cascade,
  public_id text unique not null default encode(gen_random_bytes(6),'hex'),
  title text, show_dims boolean not null default true, color text, style text not null default 'classic',
  features text not null default 'house' check (features in ('house','place','both')),
  notify_email text, notify_sms text, webhook_url text,
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
  likes jsonb not null default '[]', fixes jsonb not null default '[]', comment text,
  created_at timestamptz not null default now()
);

-- ---------- vidina kuritarvituse piirang ----------
create table public.rate_limits (
  key text primary key, n int not null default 0, window_start timestamptz not null default now()
);

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
grant update (name, reg_code, phone, web, logo_url, services, areas, roof_mat, wall_mat) on public.companies to authenticated;

create policy pr_read on public.profiles for select using (user_id = auth.uid() or is_admin());
create policy pr_upd on public.profiles for update using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke update on public.profiles from anon, authenticated;
grant update (name) on public.profiles to authenticated;

create policy st_read on public.settings for select using (true);
create policy st_admin on public.settings for update using (is_admin());

create policy pa_read on public.partners for select using (owner_user = auth.uid() or is_admin());
create policy pa_admin on public.partners for all using (is_admin()) with check (is_admin());
create policy po_read on public.payouts for select using (is_admin() or code in (select code from partners where owner_user = auth.uid()));
create policy po_admin on public.payouts for insert with check (is_admin());

create policy cl_read on public.credit_ledger for select using (company_id = my_company() or is_admin());

create policy ob_all on public.objects for all using (company_id = my_company()) with check (company_id = my_company());
create policy ob_admin on public.objects for select using (is_admin());
create policy rn_read on public.renders for select using (company_id = my_company() or is_admin());
create policy pd_all on public.products for all using (company_id = my_company()) with check (company_id = my_company());
create policy wg_all on public.widgets for all using (company_id = my_company()) with check (company_id = my_company());
create policy ld_read on public.leads for select using (company_id = my_company());
create policy ld_upd on public.leads for update using (company_id = my_company()) with check (company_id = my_company());
revoke update on public.leads from anon, authenticated;
grant update (status, seen) on public.leads to authenticated;
revoke insert, delete on public.leads from anon, authenticated;
revoke insert, update, delete on public.credit_ledger, public.renders from anon, authenticated;
create policy fb_ins on public.feedback for insert with check (company_id = my_company());
create policy fb_admin on public.feedback for select using (is_admin());

-- Müüjaks hakkamine: loob koodi kasutajale (üks kood kasutaja kohta).
create or replace function public.become_seller(p_code text) returns text
language plpgsql security definer set search_path=public as $$
declare c text := upper(p_code); n text; e text;
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  if exists(select 1 from partners where owner_user = auth.uid()) then return (select code from partners where owner_user=auth.uid() limit 1); end if;
  if c !~ '^[A-Z0-9]{3,20}$' then raise exception 'bad code'; end if;
  select name, email into n, e from profiles where user_id = auth.uid();
  insert into partners(code, owner_user, name, email) values (c, auth.uid(), coalesce(n,'Müüja'), e);
  return c;
end $$;
grant execute on function public.become_seller(text) to authenticated;

-- Partneri tulu: X% tema toodud firmade MAKSETEST (ostetud krediidid), alatiseks või esimesed N ostu.
-- Tasuta tervituskrediitide kasutamine komisjoni ei anna (muidu saaks võltskontodega raha teenida).
create or replace view public.partner_earnings with (security_invoker = true) as
  with s as (select * from settings where id=1),
  buys as (
    select c.partner_code as code, l.company_id, l.eur as eur_value,
           row_number() over (partition by l.company_id order by l.created_at) as n
    from credit_ledger l join companies c on c.id=l.company_id
    where l.kind = 'purchase' and l.eur > 0 and c.partner_code is not null)
  select b.code, count(distinct b.company_id) as companies, sum(b.eur_value) as value_eur,
         round(sum(b.eur_value) * (select partner_pct from s)/100, 2) as earned_eur
  from buys b, s where (s.partner_uses = 0 or b.n <= s.partner_uses) group by b.code;

-- ---------- failihoidla ----------
insert into storage.buckets (id, name, public) values ('uploads','uploads',false) on conflict do nothing;
insert into storage.buckets (id, name, public) values ('renders','renders',true) on conflict do nothing;
insert into storage.buckets (id, name, public) values ('products','products',true) on conflict do nothing;
create policy up_own on storage.objects for all to authenticated
  using (bucket_id in ('uploads','products') and (storage.foldername(name))[1] = my_company()::text)
  with check (bucket_id in ('uploads','products') and (storage.foldername(name))[1] = my_company()::text);

-- Müüja enda tulu (security definer, sest müüja ei näe teiste firmade andmeid)
create or replace function public.my_partner_earnings()
returns table(code text, companies bigint, value_eur numeric, earned_eur numeric, paid_eur numeric)
language sql stable security definer set search_path=public as $$
  select e.code, e.companies, e.value_eur, e.earned_eur,
         coalesce((select sum(amount) from payouts p where p.code=e.code),0)
  from partner_earnings e where e.code in (select code from partners where owner_user = auth.uid())
$$;
grant execute on function public.my_partner_earnings() to authenticated;
