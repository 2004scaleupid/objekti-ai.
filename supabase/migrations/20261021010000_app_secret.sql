-- Serveri saladused krüpteeritud vault'ist (ainult service_role ehk Edge Functionid saavad lugeda).
-- Stripe'i webhooki allkirjavõti salvestatakse: select vault.create_secret('<whsec_...>', 'stripe_webhook_secret');
create or replace function public.app_secret(p_name text) returns text
language sql security definer set search_path = public, pg_temp stable as $$
  select decrypted_secret from vault.decrypted_secrets where name = p_name and p_name in ('stripe_webhook_secret','stripe_secret_key') limit 1;
$$;
revoke all on function public.app_secret(text) from public, anon, authenticated;
grant execute on function public.app_secret(text) to service_role;
