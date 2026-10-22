-- Käivita päris andmebaasis: kõik veeretatakse tagasi (lõpus erind). Õnnestumine = viga 'TESTS_OK'.
do $$
declare n int; uid uuid; ok boolean;
begin
  -- 1) anon: kirje tekib, vale tüüp ignoreeritakse
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('request.headers', '{"x-forwarded-for":"198.51.100.7, 10.0.0.1"}', true);
  perform log_client_error('error', 'TypeError: x is undefined at 12:34', 'stack', '/index.html', null);
  perform log_client_error('evil', 'ei tohi', null, null, null);
  select count(*) into n from client_errors where message like 'TypeError: x is undefined%';
  if n <> 1 then raise exception 'FAIL 1: % kirjet', n; end if;
  select count(*) into n from client_errors where message = 'ei tohi';
  if n <> 0 then raise exception 'FAIL 1b'; end if;
  -- 2) piirang: 30 kirjet 10 min kohta sama IP-lt
  for i in 1..40 loop perform log_client_error('fetch', 'Viga ' || i, null, '/functions/v1/x', 500); end loop;
  select count(*) into n from client_errors where message like 'Viga %';
  if n <> 29 then raise exception 'FAIL 2: piirang lasi läbi %', n; end if;
  -- 3) numbrid ei tee eri rühmi
  if err_fp('web', 'fetch', 'Viga 1') <> err_fp('web', 'fetch', 'Viga 22') then raise exception 'FAIL 3'; end if;
  -- 4) admin_client_errors: tavakasutajale keelatud, adminile rühmitatud
  select user_id into uid from profiles where not is_admin limit 1;
  if uid is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
    begin perform * from admin_client_errors(7); ok := true; exception when insufficient_privilege then ok := false; end;
    if ok then raise exception 'FAIL 4a: tavakasutaja nägi vigu'; end if;
  end if;
  select user_id into uid from profiles where is_admin limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select a.n into n from admin_client_errors(7) a where a.message like 'Viga %';
  if n <> 29 then raise exception 'FAIL 4b: rühm %', n; end if;
  raise exception 'TESTS_OK';
end $$;
