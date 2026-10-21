-- Objekti/kuulutuse 3D-mudel: „Lisa objektile“ seob valmis .glb maja (objekti) juurde.
-- Sama reegel nagu products.model_url: ainult oma firma .glb meie 'models' kaustast.

alter table public.objects add column if not exists model_url text;
alter table public.objects drop constraint if exists objects_model_ok;
alter table public.objects add constraint objects_model_ok check (
  model_url is null or (
    model_url ~ '^https://[^"<>\s]+\.glb$'
    and position(('/storage/v1/object/public/models/' || company_id::text || '/') in model_url) > 0
  )
);

-- kasutaja tohib objektil muuta ainult kindlaid veerge (vt init.sql); lisame model_url
grant update (model_url) on public.objects to authenticated;
