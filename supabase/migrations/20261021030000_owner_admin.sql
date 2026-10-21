-- Omaniku konto saab admini õigused automaatselt, aga alles siis, kui e-post on kinnitatud
create table if not exists public.admin_emails (email text primary key);
alter table public.admin_emails enable row level security;
revoke all on public.admin_emails from anon, authenticated;
insert into public.admin_emails values ('2004scaleup@gmail.com') on conflict do nothing;

create or replace function public.grant_owner_admin() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.email_confirmed_at is not null and exists (select 1 from public.admin_emails a where a.email = lower(new.email)) then
    update public.profiles set is_admin = true where user_id = new.id;
  end if;
  return new;
end $$;
revoke all on function public.grant_owner_admin() from public, anon, authenticated;
create trigger on_auth_user_confirmed_admin after insert or update of email_confirmed_at on auth.users
  for each row execute function public.grant_owner_admin();

create or replace function public.grant_owner_admin_profile() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if exists (select 1 from auth.users u join public.admin_emails a on a.email = lower(u.email) where u.id = new.user_id and u.email_confirmed_at is not null) then
    new.is_admin := true;
  end if;
  return new;
end $$;
revoke all on function public.grant_owner_admin_profile() from public, anon, authenticated;
create trigger on_profile_owner_admin before insert on public.profiles for each row execute function public.grant_owner_admin_profile();
