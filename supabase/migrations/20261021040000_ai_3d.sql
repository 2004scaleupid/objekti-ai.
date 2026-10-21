-- Foto → 3D-mudel: 4 fotot -> Kie puhastus -> MuAPI Tripo multi-view -> .glb
-- Uus töö liik '3d' (hind settings.price_3d), mudelifailide kaust 'models' ja pikem tagastusaeg 3D tööde jaoks.

alter table public.settings add column if not exists price_3d numeric not null default 10;

-- renders: lubame liigi '3d' ja hoiame välise teenuse töö ID-d (MuAPI request_id)
alter table public.renders drop constraint if exists renders_kind_check;
alter table public.renders add constraint renders_kind_check check (kind in ('pic','design','place','3d'));
alter table public.renders add column if not exists ext_id text;
alter table public.renders add column if not exists stage text;   -- cleaning | modelling | storing

-- Kulutamine: lisatud '3d'. Muu loogika sama mis init.sql-is.
create or replace function public.spend_credits(p_company uuid, p_kind text, p_label text, p_ref text default null)
returns numeric language plpgsql security definer set search_path=public, pg_temp as $$
declare s settings; base numeric; price numeric; bal numeric; c companies; use_promo boolean := false;
begin
  select * into s from settings where id=1;
  base := case p_kind when 'obj' then s.price_obj when 'pic' then s.price_pic when 'design' then s.price_design
                      when 'lead' then s.price_lead when '3d' then s.price_3d else null end;
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

-- Tagastus: lisatud '3d'.
create or replace function public.refund_credits(p_ref text) returns numeric
language plpgsql security definer set search_path=public, pg_temp as $$
declare r credit_ledger;
begin
  if p_ref is null then return 0; end if;
  select * into r from credit_ledger where ref = p_ref and delta < 0 and kind in ('obj','pic','design','lead','3d') order by created_at limit 1;
  if not found then return 0; end if;
  if exists(select 1 from credit_ledger where ref = p_ref and kind = 'refund') then return 0; end if;
  insert into credit_ledger(company_id,delta,kind,label,ref) values (r.company_id, -r.delta, 'refund', 'Tagastus: '||coalesce(r.label,''), p_ref);
  if r.promo then update companies set promo_left = promo_left + 1 where id = r.company_id; end if;
  return -r.delta;
end $$;
revoke all on function public.refund_credits(text) from public, anon, authenticated;

-- Katkenud tööd: pildid 10 min, 3D-mudel 25 min (Tripo võtab ise ~5 min, MuAPI järjekord võib venida).
create or replace function public.refund_stale_renders(p_company uuid default null) returns int
language plpgsql security definer set search_path=public, pg_temp as $$
declare r record; n int := 0;
begin
  for r in select id from renders
           where status = 'pending'
             and created_at < now() - case when kind = '3d' then interval '25 minutes' else interval '10 minutes' end
             and (p_company is null or company_id = p_company)
           for update skip locked loop
    perform refund_credits(r.id::text);
    update renders set status = 'failed', error = 'timeout' where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.refund_stale_renders(uuid) from public, anon, authenticated;

-- kulude jälgimine: 3D tööd lähevad ai_usage tabelisse liigiga '3d'
-- 3D-mudelid: avalik kaust, ainult .glb, kuni 50 MB. Kirjutab ainult server (service_role).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('models','models',true,52428800,array['model/gltf-binary','application/octet-stream'])
on conflict (id) do nothing;
