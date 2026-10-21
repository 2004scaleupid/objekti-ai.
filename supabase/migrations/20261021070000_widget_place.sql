-- Vidin "Toode kliendi juures" v2: mitu toodet ühel pildil, paigalduskoht, firma seaded ja kinnitusega režiim.

-- Toote paigalduskoht: määrab kliendi juhendi ja AI juhise (maapind, katus, fassaad, aed/piire, siseruum, ükskõik).
alter table public.products add column if not exists placement text not null default 'ground';
do $$ begin
  if not exists (select 1 from pg_constraint where conname='products_placement_ok') then
    alter table public.products add constraint products_placement_ok check (placement in ('ground','roof','facade','fence','indoor','any'));
  end if;
end $$;
alter table public.products add column if not exists in_widget boolean not null default true;
alter table public.products add column if not exists sort int not null default 0;

-- Vidina "toode kliendi juures" seaded (server kontrollib ja piirab iga väärtuse).
alter table public.widgets add column if not exists place_opts jsonb not null default '{}';
do $$ begin
  if not exists (select 1 from pg_constraint where conname='widgets_place_opts_ok') then
    alter table public.widgets add constraint widgets_place_opts_ok check (jsonb_typeof(place_opts) = 'object' and length(place_opts::text) < 4000);
  end if;
end $$;
grant update (place_opts) on public.widgets to authenticated;

-- Päringu märk: seob kliendi päringu ja tema pildid (ilma, et klient peaks sisse logima).
alter table public.leads add column if not exists tok text unique default replace(gen_random_uuid()::text,'-','');

-- Pildisoovid vidinast: kliendi foto, valitud tooted ja AI tulemus. Kinnitusega režiimis saadab firma pildi ise.
create table if not exists public.widget_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  mode text not null default 'instant' check (mode in ('instant','review')),
  status text not null default 'pending' check (status in ('pending','ready','sent','failed')),
  photo_path text,
  items jsonb not null default '[]',
  note text check (length(coalesce(note,'')) <= 400),
  style text,
  draft_url text,
  result_url text,
  token text unique not null default replace(gen_random_uuid()::text,'-',''),
  seen boolean not null default false,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists widget_requests_company_ix on public.widget_requests(company_id, created_at desc);
alter table public.widget_requests enable row level security;
-- firma näeb ainult oma pildisoove; lisab ja muudab ainult server (pole insert/update/delete poliitikat)
do $$ begin
  if not exists (select 1 from pg_policies where tablename='widget_requests' and policyname='wr_read') then
    create policy wr_read on public.widget_requests for select using (company_id = my_company());
  end if;
end $$;
