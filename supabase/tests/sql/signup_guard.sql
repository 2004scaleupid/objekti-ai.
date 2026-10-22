-- Käivita päris andmebaasis: kõik veeretatakse tagasi (lõpus erind). Õnnestumine = viga 'TESTS_OK'.
do $$
declare r jsonb; ev jsonb; ip text := '203.0.113.' || (floor(random() * 200) + 1)::int;
  mk constant text := '{"metadata":{"ip_address":"%s"},"user":{"email":"%s","app_metadata":{"provider":"email"},"user_metadata":{"terms_v":"2026-10-22"}}}';
begin
  -- 1) ajutine domeen ja selle alamdomeen keelatud, IP-d ei loeta
  r := hook_before_user_created(format(mk, ip, 'a@mailinator.com')::jsonb);
  if r->'error'->>'http_code' is distinct from '403' then raise exception 'FAIL 1a: %', r; end if;
  r := hook_before_user_created(format(mk, ip, 'a@x.mailinator.com')::jsonb);
  if r->'error'->>'http_code' is distinct from '403' then raise exception 'FAIL 1b: %', r; end if;
  -- 2) tavaline domeen: 3 korda lubatud samalt IP-lt
  for i in 1..3 loop
    r := hook_before_user_created(format(mk, ip, 'u' || i || '@gmail.com')::jsonb);
    if r is distinct from '{}'::jsonb then raise exception 'FAIL 2.%: %', i, r; end if;
  end loop;
  -- 3) 4. kord keelatud, eestikeelne teade
  r := hook_before_user_created(format(mk, ip, 'u4@gmail.com')::jsonb);
  if r->'error'->>'http_code' is distinct from '429' or coalesce(r->'error'->>'message','') not like 'Sellelt võrgult%' then raise exception 'FAIL 3: %', r; end if;
  -- 4) teine IP ja IP-ta (admin API) lubatud; .ee domeen lubatud
  r := hook_before_user_created(format(mk, ip || '1', 'u5@neti.ee')::jsonb);
  if r is distinct from '{}'::jsonb then raise exception 'FAIL 4a: %', r; end if;
  r := hook_before_user_created('{"metadata":{},"user":{"email":"admin@hot.ee"}}'::jsonb);
  if r is distinct from '{}'::jsonb then raise exception 'FAIL 4b: %', r; end if;
  update settings set require_terms = true where id = 1; -- veeretatakse tagasi
  -- 5) tingimustega nõustumata e-posti registreerimine keelatud; Google ja admin API lubatud
  r := hook_before_user_created(format('{"metadata":{"ip_address":"%s"},"user":{"email":"t@neti.ee","app_metadata":{"provider":"email"},"user_metadata":{}}}', ip || '2')::jsonb);
  if r->'error'->>'http_code' is distinct from '400' then raise exception 'FAIL 5a: %', r; end if;
  r := hook_before_user_created(format('{"metadata":{"ip_address":"%s"},"user":{"email":"g@gmail.com","app_metadata":{"provider":"google"},"user_metadata":{}}}', ip || '3')::jsonb);
  if r is distinct from '{}'::jsonb then raise exception 'FAIL 5b: %', r; end if;
  raise exception 'TESTS_OK';
end $$;
