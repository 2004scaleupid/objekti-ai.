-- Tasuta paketi piirid adminile („Vead“): failihoidla maht kaustade kaupa ja andmebaasi maht (täpne, SQL-ist).
-- Väljaminev liiklus (egress) pole SQL-is nähtav: hinnang tuleb admin-stats funktsioonist.
create or replace function public.admin_quota()
 returns jsonb
 language plpgsql stable security definer set search_path to 'public', 'storage', 'pg_temp'
as $function$
begin
  if not is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'buckets', coalesce((select jsonb_agg(jsonb_build_object('bucket', b, 'files', n, 'bytes', s) order by s desc)
      from (select bucket_id b, count(*) n, coalesce(sum((metadata->>'size')::bigint), 0) s from storage.objects group by bucket_id) x), '[]'::jsonb),
    'storage_bytes', (select coalesce(sum((metadata->>'size')::bigint), 0) from storage.objects),
    'db_bytes', pg_database_size(current_database()));
end $function$;
revoke execute on function public.admin_quota() from public, anon;
grant execute on function public.admin_quota() to authenticated;
