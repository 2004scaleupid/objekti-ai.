-- Uued kontod ootavad Vaade3D kinnitust: kasutaja registreerub, meile tuleb e-kiri, konto avaneb alles pärast kinnitust.
-- Olemasolevad firmad loetakse kinnitatuks. Kasutaja neid veerge muuta ei saa (companies update on lubatud ainult kindlatele veergudele).
alter table public.companies add column if not exists approved_at timestamptz;
alter table public.companies add column if not exists approval_requested_at timestamptz;
update public.companies set approved_at = coalesce(created_at, now()) where approved_at is null;

alter table public.settings add column if not exists require_approval boolean not null default true;

-- krediitide kulutamine ainult kinnitatud firmal
create or replace function public.spend_credits(p_company uuid, p_kind text, p_label text, p_ref text DEFAULT NULL::text)
 returns numeric language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare s settings; base numeric; price numeric; bal numeric; c companies; use_promo boolean := false;
begin
  select * into s from settings where id=1;
  base := case p_kind when 'obj' then s.price_obj when 'pic' then s.price_pic when 'design' then s.price_design
                      when 'lead' then s.price_lead when '3d' then s.price_3d when 'video' then s.price_video else null end;
  if base is null then raise exception 'unknown kind %', p_kind; end if;
  select * into c from companies where id=p_company for update;
  if not found then raise exception 'company not found'; end if;
  if coalesce(s.require_approval, true) and c.approved_at is null then raise exception 'not_approved' using errcode='P0001'; end if;
  price := base;
  if p_kind <> 'lead' and c.promo_left > 0 then price := round(base*(1-s.promo_pct/100),2); use_promo := true;
  elsif p_kind <> 'lead' and c.partner_code is not null and coalesce(s.promo_after_pct,0) > 0 then price := round(base*(1-s.promo_after_pct/100),2);
  end if;
  select coalesce(sum(delta),0) into bal from credit_ledger where company_id=p_company;
  if bal < price then raise exception 'insufficient_credits' using errcode='P0001'; end if;
  insert into credit_ledger(company_id,delta,kind,label,promo,ref) values (p_company,-price,p_kind,p_label,use_promo,p_ref);
  if use_promo then update companies set promo_left = promo_left-1 where id=p_company; end if;
  return bal-price;
end $function$;
