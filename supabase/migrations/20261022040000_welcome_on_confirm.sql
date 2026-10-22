-- Tervituskrediidid alles e-posti kinnitamisel (mitte registreerimisel). Üks kord firma kohta; olemasolevad kasutajad ei muutu.
create unique index if not exists credit_ledger_one_welcome on public.credit_ledger(company_id) where kind = 'welcome';

create or replace function public.handle_new_user()
 returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare cid uuid; s settings; v_code text; meta jsonb := coalesce(new.raw_user_meta_data,'{}'::jsonb);
begin
  select * into s from settings where id=1;
  v_code := upper(nullif(meta->>'ref',''));
  if v_code is not null and not exists(select 1 from partners p where p.code=v_code and p.active) then v_code := null; end if;
  insert into companies(name,niche,source,source_other,partner_code,promo_left)
    values (left(coalesce(nullif(trim(meta->>'company'),''),'Minu ettevõte'),120), left(meta->>'niche',40), left(meta->>'source',40), left(meta->>'source_other',120), v_code, case when v_code is null then 0 else s.promo_uses end)
    returning id into cid;
  insert into profiles(user_id,company_id,name,email) values (new.id,cid,left(meta->>'name',100),new.email);
  -- tervituskrediidid: grant_welcome_credits (kinnitatud e-post)
  insert into widgets(company_id, notify_email) values (cid, new.email);
  return new;
end $function$;

create or replace function public.grant_welcome_credits()
 returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare cid uuid; n numeric;
begin
  if new.email_confirmed_at is null then return new; end if;
  select company_id into cid from profiles where user_id = new.id;
  select coalesce(welcome_credits, 0) into n from settings where id = 1;
  if cid is null or n <= 0 then return new; end if;
  insert into credit_ledger(company_id, delta, kind, label) values (cid, n, 'welcome', 'Tervituskrediit')
    on conflict (company_id) where kind = 'welcome' do nothing;
  return new;
end $function$;
revoke execute on function public.grant_welcome_credits() from public, anon, authenticated;

-- nimi tähestikus pärast on_auth_user_created: kohe kinnitatud kasutaja (nt admin API) saab krediidid pärast profiili loomist
drop trigger if exists on_auth_user_welcome on auth.users;
create trigger on_auth_user_welcome after insert or update of email_confirmed_at on auth.users
  for each row execute function public.grant_welcome_credits();
