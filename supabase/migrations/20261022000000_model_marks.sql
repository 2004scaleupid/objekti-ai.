-- 3D-mudeli mõõdud ja märkmed (Vaba idee 3D-lõuend): firma kaupa, nagu muud mudeli andmed.
-- ref = 3D-töö id (renders.id); hiljem ka 'ehr:<kood>' aadressiobjektidele.
-- scale = meetrit mudeli ühiku kohta (fotodest tehtud mudelil kasutaja seadistab, aadressiobjektil 1).
-- public = kas jagatud lingil (#m=) näidatakse mõõte. Vaikimisi VÄLJAS: märkmetes võib olla firma sisemist infot.

create table if not exists public.model_marks (
  company_id uuid not null references public.companies(id) on delete cascade,
  ref text not null check (length(ref) between 3 and 80),
  scale numeric check (scale is null or (scale > 0 and scale < 100000)),
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array' and pg_column_size(items) < 200000),
  public boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (company_id, ref)
);
alter table public.model_marks enable row level security;
drop policy if exists mm_all on public.model_marks;
create policy mm_all on public.model_marks for all using (company_id = my_company()) with check (company_id = my_company());
revoke all on public.model_marks from anon;
grant select, insert, update, delete on public.model_marks to authenticated;
revoke truncate, trigger, references on public.model_marks from authenticated;

-- Jagatud lingi jaoks: ainult siis, kui omanik lülitas sisse, ja ainult selle firma enda 3D-töö kohta
-- (nii ei saa keegi teise firma mudelile võõraid märkmeid lisada).
create or replace function public.public_model_marks(p_ref text) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('scale', m.scale, 'items', m.items)
  from model_marks m
  join renders r on r.id::text = m.ref and r.company_id = m.company_id and r.kind = '3d' and r.status = 'done'
  where m.ref = p_ref and m.public and p_ref ~ '^[0-9a-f-]{36}$'
  limit 1
$$;
revoke all on function public.public_model_marks(text) from public;
grant execute on function public.public_model_marks(text) to anon, authenticated;
