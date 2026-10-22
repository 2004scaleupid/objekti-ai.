-- Käivita päris andmebaasis: kõik veeretatakse tagasi (lõpus erind). Õnnestumine = viga 'TESTS_OK'.
do $$
declare u1 uuid := gen_random_uuid(); u2 uuid := gen_random_uuid(); t timestamptz; v text;
begin
  -- 1) e-postiga registreerimine: aeg ja versioon metaandmetest
  insert into auth.users(id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
    values (u1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'terms-'||u1||'@example.com', '{"terms_v":"2026-10-22"}', now(), now());
  select terms_accepted_at, terms_version into t, v from profiles where user_id = u1;
  if t is null or v is distinct from '2026-10-22' then raise exception 'FAIL 1: % %', t, v; end if;
  -- 2) ilma (nt Google): tühi, accept_terms täidab ühe korra
  insert into auth.users(id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
    values (u2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'terms-'||u2||'@example.com', '{}', now(), now());
  select terms_accepted_at into t from profiles where user_id = u2;
  if t is not null then raise exception 'FAIL 2a'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  perform accept_terms('2026-10-22');
  perform accept_terms('2099-01-01'); -- teine kord ei muuda
  select terms_accepted_at, terms_version into t, v from profiles where user_id = u2;
  if t is null or v is distinct from '2026-10-22' then raise exception 'FAIL 2b: % %', t, v; end if;
  raise exception 'TESTS_OK';
end $$;
