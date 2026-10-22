-- Kasutustingimused ja privaatsuspoliitika: nõustumise aeg ja versioon profiilil (/tingimused, /privaatsus).
alter table public.profiles add column if not exists terms_accepted_at timestamptz, add column if not exists terms_version text;
-- lüliti: sisse alles siis, kui uus äpp (saadab terms_v) on avaldatud: update settings set require_terms = true where id = 1;
alter table public.settings add column if not exists require_terms boolean not null default false;

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
  insert into profiles(user_id,company_id,name,email,terms_accepted_at,terms_version)
    values (new.id,cid,left(meta->>'name',100),new.email,case when meta ? 'terms_v' then now() end,left(meta->>'terms_v',20));
  -- tervituskrediidid: grant_welcome_credits (kinnitatud e-post)
  insert into widgets(company_id, notify_email) values (cid, new.email);
  return new;
end $function$;

create or replace function public.hook_before_user_created(event jsonb)
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare
  em text := lower(coalesce(event->'user'->>'email', ''));
  d text := split_part(em, '@', 2);
  ip text := nullif(event->'metadata'->>'ip_address', '');
  parts text[] := string_to_array(d, '.');
  suffixes text[] := '{}';
begin
  -- domeen ja kõik selle ülemdomeenid (x.mailinator.com -> mailinator.com)
  for i in 1 .. coalesce(array_length(parts, 1), 0) - 1 loop
    suffixes := suffixes || array_to_string(parts[i:], '.');
  end loop;
  if d <> '' and exists (select 1 from blocked_email_domains where domain = any(suffixes)) then
    return jsonb_build_object('error', jsonb_build_object('http_code', 403,
      'message', 'Ajutise e-posti aadressiga ei saa kontot luua. Kasuta oma tööalast või isiklikku e-posti.'));
  end if;
  -- tingimustega nõustumine: e-postiga registreerimisel kohustuslik (äpp saadab terms_v); admin API (IP-ta) ja Google erandid
  if ip is not null and coalesce((select require_terms from settings where id = 1), false)
     and coalesce(event->'user'->'app_metadata'->>'provider', 'email') = 'email'
     and coalesce(event->'user'->'user_metadata'->>'terms_v', '') = '' then
    return jsonb_build_object('error', jsonb_build_object('http_code', 400,
      'message', 'Konto loomiseks nõustu kasutustingimuste ja privaatsuspoliitikaga.'));
  end if;
  -- IP piirang (admin API kutsel IP puudub -> ei piira)
  if ip is not null and not rate_hit('signup:ip:' || ip, 3, 86400) then
    return jsonb_build_object('error', jsonb_build_object('http_code', 429,
      'message', 'Sellelt võrgult on täna juba 3 kontot loodud. Proovi homme uuesti või kirjuta info@vaade3d.ee.'));
  end if;
  return '{}'::jsonb;
end $function$;

-- Google'iga registreerumine: äpp kinnitab nõustumise pärast sisselogimist (ainult kui seda veel pole)
create or replace function public.accept_terms(p_version text)
 returns void language sql security definer set search_path to 'public', 'pg_temp'
as $$ update profiles set terms_accepted_at = now(), terms_version = left(p_version, 20) where user_id = auth.uid() and terms_accepted_at is null $$;
revoke execute on function public.accept_terms(text) from public, anon;
grant execute on function public.accept_terms(text) to authenticated;
