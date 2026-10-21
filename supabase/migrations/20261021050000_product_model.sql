-- Toote 3D-mudel: „Tee tootest 3D-mudel“ salvestab valmis .glb toote juurde.
-- renders.product_id seob 3D-töö tootega; valmimisel kirjutab server products.model_url.

alter table public.products add column if not exists model_url text;
-- ainult meie 'models' kausta sama firma .glb (kasutaja RLS-iga muuta ei saa võõrast ega välist linki panna)
alter table public.products drop constraint if exists products_model_ok;
alter table public.products add constraint products_model_ok check (
  model_url is null or (
    model_url ~ '^https://[^"<>\s]+\.glb$'
    and position(('/storage/v1/object/public/models/' || company_id::text || '/') in model_url) > 0
  )
);

alter table public.renders add column if not exists product_id uuid references public.products(id) on delete set null;
