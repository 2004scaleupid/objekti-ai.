-- Käivita päris andmebaasis: kõik veeretatakse tagasi (lõpus erind). Õnnestumine = viga 'TESTS_OK'.
do $$
declare u1 uuid := gen_random_uuid(); u2 uuid := gen_random_uuid(); c1 uuid; c2 uuid; n int; w numeric;
begin
  select welcome_credits into w from settings where id = 1;
  -- 1) registreerimine ilma kinnituseta: krediite pole
  insert into auth.users(id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
    values (u1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'welcome-test-'||u1||'@example.com', '{"company":"Test"}', now(), now());
  select company_id into c1 from profiles where user_id = u1;
  select count(*) into n from credit_ledger where company_id = c1;
  if n <> 0 then raise exception 'FAIL 1: kinnitamata kasutajal % kannet', n; end if;
  -- 2) kinnitamine annab täpselt welcome_credits
  update auth.users set email_confirmed_at = now() where id = u1;
  select count(*) into n from credit_ledger where company_id = c1 and kind = 'welcome' and delta = w;
  if n <> 1 then raise exception 'FAIL 2: pärast kinnitust % kannet', n; end if;
  -- 3) korduv kinnitus (nt e-posti muutmine) ei anna uuesti
  update auth.users set email_confirmed_at = null where id = u1;
  update auth.users set email_confirmed_at = now() where id = u1;
  select count(*) into n from credit_ledger where company_id = c1 and kind = 'welcome';
  if n <> 1 then raise exception 'FAIL 3: korduv kinnitus andis % kannet', n; end if;
  -- 4) kohe kinnitatud kasutaja (admin API / Google): krediidid pärast profiili loomist
  insert into auth.users(id, instance_id, aud, role, email, raw_user_meta_data, email_confirmed_at, created_at, updated_at)
    values (u2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'welcome-test-'||u2||'@example.com', '{}', now(), now(), now());
  select company_id into c2 from profiles where user_id = u2;
  select count(*) into n from credit_ledger where company_id = c2 and kind = 'welcome';
  if n <> 1 then raise exception 'FAIL 4: kohe kinnitatud kasutajal % kannet', n; end if;
  raise exception 'TESTS_OK';
end $$;
