-- Kodulehe (vaade3d.ee) demo- ja koostööpäringud ettevõtetelt. Kirjutab ainult demo-request funktsioon (service_role); loevad adminid.
create table if not exists public.demo_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  company text not null,
  email text not null,
  phone text,
  website text,
  niche text,
  interest text[] not null default '{}',
  message text,
  mailed boolean not null default false
);
alter table public.demo_requests enable row level security;
revoke all on public.demo_requests from anon, authenticated;
grant select on public.demo_requests to authenticated;
drop policy if exists dr_admin_read on public.demo_requests;
create policy dr_admin_read on public.demo_requests for select using (public.is_admin());
