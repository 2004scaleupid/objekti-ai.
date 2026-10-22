-- Stuudio fotode stseen (kontekstipõhised soovitused): klassifikatsioon pildi räsi järgi, pilti ennast ei salvestata. Kustub 90 päeva pärast.
create table if not exists public.photo_scenes (
  hash text primary key check (hash ~ '^[a-f0-9]{64}$'),
  scene text not null,
  room_type text,
  features text[] not null default '{}',
  created_at timestamptz not null default now()
);
alter table public.photo_scenes enable row level security; -- poliitikaid pole: ainult server (photo-scene)
