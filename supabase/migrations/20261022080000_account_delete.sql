-- Konto kustutamine (GDPR): ainult serverist (Edge Function "account", service_role), üks tehing.
-- Ainus liige: firma andmed kustutatakse, firma rida jääb anonüümsena (krediidikanded, AI kulud ja arved viitavad sellele).
-- Arved jäävad muutmata: raamatupidamise seadus nõuab ostja andmetega arvet 7 aastat.
create or replace function public.delete_account_data(p_uid uuid)
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare cid uuid; others int;
begin
  select company_id into cid from profiles where user_id = p_uid;
  if cid is null then return jsonb_build_object('company_id', null, 'sole', false); end if;
  select count(*) into others from profiles where company_id = cid and user_id <> p_uid;
  if others = 0 then
    delete from widget_requests where company_id = cid;
    delete from leads where company_id = cid;
    delete from model_marks where company_id = cid;
    delete from renders where company_id = cid;
    delete from objects where company_id = cid;
    delete from products where company_id = cid;
    delete from widgets where company_id = cid;
    delete from feedback where company_id = cid;
    update companies set name = 'Kustutatud konto', reg_code = null, phone = null, web = null, logo_url = null, address = null, vat_code = null,
      source_other = null, services = default, areas = default, roof_mat = default, wall_mat = default where id = cid;
  end if;
  update partners set name = null, email = null, iban = null, active = false where owner_user = p_uid;
  delete from profiles where user_id = p_uid;
  return jsonb_build_object('company_id', cid, 'sole', others = 0);
end $function$;
revoke execute on function public.delete_account_data(uuid) from public, anon, authenticated;
