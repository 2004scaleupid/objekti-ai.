-- Failihoidla seaded, millele funktsioonid toetuvad (garden: png + json models kaustas). Õnnestumine = viga 'TESTS_OK'.
do $$
declare t text[];
begin
  select allowed_mime_types into t from storage.buckets where id = 'models';
  if t is not null and not (t @> array['model/gltf-binary', 'image/png', 'application/json']) then raise exception 'FAIL models: %', t; end if;
  raise exception 'TESTS_OK';
end $$;
