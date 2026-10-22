-- Jagatud lingil ka ametlikud tahud: lisaks mõõtudele aadressi EHR ja sobitus (ainult siis, kui omanik jagab mõõte).
create or replace function public.public_model_marks(p_ref text) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('scale', m.scale, 'items', m.items, 'ehr', m.ehr, 'fit', m.fit)
  from model_marks m
  join renders r on r.id::text = m.ref and r.company_id = m.company_id and r.kind = '3d' and r.status = 'done'
  where m.ref = p_ref and m.public and p_ref ~ '^[0-9a-f-]{36}$'
  limit 1
$$;
revoke all on function public.public_model_marks(text) from public;
grant execute on function public.public_model_marks(text) to anon, authenticated;
