-- Käivita päris andmebaasis: kõik veeretatakse tagasi (lõpus erind). Õnnestumine = viga 'TESTS_OK'.
do $$
declare u1 uuid := gen_random_uuid(); u2 uuid := gen_random_uuid(); c1 uuid; r jsonb; n int; nm text; ok boolean;
begin
  insert into auth.users(id, instance_id, aud, role, email, raw_user_meta_data, email_confirmed_at, created_at, updated_at)
    values (u1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'del-'||u1||'@example.com', '{"company":"Kustuta OÜ","name":"Mari"}', now(), now(), now());
  select company_id into c1 from profiles where user_id = u1;
  update companies set reg_code = '12345678', phone = '+3725555', address = 'Tänav 1' where id = c1;
  insert into objects(company_id, ehr, address) values (c1, '116059420', 'Tänav 1');
  insert into feedback(company_id, stars, comment) values (c1, 5, 'tore');
  insert into credit_ledger(company_id, delta, eur, kind, label) values (c1, 100, 50, 'purchase', 'Ost');
  -- 1) kasutaja ise ei saa funktsiooni kutsuda (ainult server)
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  begin
    execute 'set local role authenticated';
    perform delete_account_data(u1); ok := true;
  exception when insufficient_privilege then ok := false; end;
  execute 'reset role';
  if ok then raise exception 'FAIL 1: authenticated sai kutsuda'; end if;
  -- 2) kustutamine: andmed läinud, firma anonüümne, krediidikanded alles
  r := delete_account_data(u1);
  if (r->>'sole')::boolean is distinct from true or (r->>'company_id')::uuid is distinct from c1 then raise exception 'FAIL 2a: %', r; end if;
  select count(*) into n from profiles where user_id = u1; if n <> 0 then raise exception 'FAIL 2b: profiil alles'; end if;
  select count(*) into n from objects where company_id = c1; if n <> 0 then raise exception 'FAIL 2c: objektid alles'; end if;
  select count(*) into n from feedback where company_id = c1; if n <> 0 then raise exception 'FAIL 2d: tagasiside alles'; end if;
  select count(*) into n from widgets where company_id = c1; if n <> 0 then raise exception 'FAIL 2e: vidin alles'; end if;
  select name into nm from companies where id = c1 and reg_code is null and phone is null and address is null;
  if nm is distinct from 'Kustutatud konto' then raise exception 'FAIL 2f: firma pole anonüümne (%)', nm; end if;
  select count(*) into n from credit_ledger where company_id = c1 and kind = 'purchase'; if n <> 1 then raise exception 'FAIL 2g: ostukanne kadus'; end if;
  -- 3) mitme liikmega firma: teise liikme kustutamine firmat ei puuduta
  insert into auth.users(id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
    values (u2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'del2-'||u2||'@example.com', '{}', now(), now());
  update profiles set company_id = (select company_id from profiles where user_id = (select user_id from profiles where user_id <> u2 and company_id is not null limit 1)) where user_id = u2;
  select company_id into c1 from profiles where user_id = u2;
  select count(*) into n from objects where company_id = c1;
  r := delete_account_data(u2);
  if (r->>'sole')::boolean is distinct from false then raise exception 'FAIL 3a: %', r; end if;
  if (select count(*) from objects where company_id = c1) <> n then raise exception 'FAIL 3b: teise firma andmed muutusid'; end if;
  raise exception 'TESTS_OK';
end $$;
