-- Vigade jälgimine: brauseri vead (window.onerror, unhandledrejection, ebaõnnestunud päringud) ja Edge Functionite vead.
-- Isikuandmeid peale kasutaja id ei salvestata (äpp eemaldab tekstist e-postid, päringuparameetrid ja pikad tokenid).
create or replace function public.err_fp(p_source text, p_kind text, p_message text)
 returns text language sql immutable set search_path to 'public', 'pg_temp'
as $$ select md5(p_source || '|' || p_kind || '|' || regexp_replace(left(p_message, 200), '[0-9]+', '#', 'g')) $$;

create table if not exists public.client_errors (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid,
  source text not null check (source ~ '^(web|fn:[a-z0-9-]{1,40})$'),
  kind text not null check (kind in ('error', 'rejection', 'fetch', 'fn')),
  message text not null,
  stack text,
  url text,
  status int,
  fp text generated always as (public.err_fp(source, kind, message)) stored
);
create index if not exists client_errors_recent on public.client_errors (created_at desc);
alter table public.client_errors enable row level security; -- poliitikaid pole: kirjutamine RPC kaudu, lugemine admin_client_errors kaudu



-- äpist (anon või sisselogitud): max 30 kirjet 10 min kohta kasutaja või IP kohta
create or replace function public.log_client_error(p_kind text, p_message text, p_stack text default null, p_url text default null, p_status int default null)
 returns void language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare k text;
begin
  if p_kind not in ('error', 'rejection', 'fetch') or coalesce(p_message, '') = '' then return; end if;
  k := coalesce('cerr:u:' || auth.uid()::text,
    'cerr:ip:' || coalesce(nullif(split_part(current_setting('request.headers', true)::json->>'x-forwarded-for', ',', 1), ''), '?'));
  if not rate_hit(k, 30, 600) then return; end if;
  insert into client_errors (user_id, source, kind, message, stack, url, status)
    values (auth.uid(), 'web', p_kind, left(p_message, 500), left(p_stack, 2000), left(p_url, 300), p_status);
  if random() < 0.01 then delete from client_errors where created_at < now() - interval '30 days'; end if;
end $function$;
revoke execute on function public.log_client_error(text, text, text, text, int) from public;
grant execute on function public.log_client_error(text, text, text, text, int) to anon, authenticated;

-- admin: viimased p_days päeva rühmitatult
create or replace function public.admin_client_errors(p_days int default 7)
 returns table (fp text, source text, kind text, message text, n bigint, users bigint, first_at timestamptz, last_at timestamptz, url text, status int, stack text)
 language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $function$
begin
  if not is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
    select e.fp, min(e.source), min(e.kind), (array_agg(e.message order by e.created_at desc))[1], count(*), count(distinct e.user_id),
      min(e.created_at), max(e.created_at), (array_agg(e.url order by e.created_at desc))[1], (array_agg(e.status order by e.created_at desc))[1],
      (array_agg(e.stack order by e.created_at desc))[1]
    from client_errors e where e.created_at > now() - make_interval(days => least(greatest(p_days, 1), 30))
    group by e.fp order by max(e.created_at) desc limit 200;
end $function$;
revoke execute on function public.admin_client_errors(int) from public, anon;
grant execute on function public.admin_client_errors(int) to authenticated;
