-- 26.10: partneriprogramm. Partner saab 20% alatiseks kõigest, mida tema toodud firma maksab.
-- Koodiga firma: esimesed promo_uses kasutust −promo_pct (20%), pärast seda alatiseks −promo_after_pct (5%).
-- Hinnad: 3D-mudel fotost 3 krediiti. Vidina päring ise on tasuta (widget-lead võtab maja 3D eest obj hinna, pilt widget-place'is).
alter table public.settings add column if not exists price_video numeric not null default 5.4;
alter table public.settings add column if not exists promo_after_pct numeric not null default 5 check (promo_after_pct >= 0 and promo_after_pct <= 90);
update public.settings set partner_pct = 20, partner_uses = 0, promo_pct = 20, promo_after_pct = 5, price_3d = 3 where id = 1;

create or replace function public.spend_credits(p_company uuid, p_kind text, p_label text, p_ref text default null)
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
revoke all on function public.spend_credits(uuid,text,text,text) from public, anon, authenticated;

-- Max Nõuliku partnerikood
insert into public.partners(code, name, seller, active) values ('MAXNOULIK', 'Max', true, true) on conflict (code) do update set active = true;
