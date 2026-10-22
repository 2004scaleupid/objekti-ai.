-- Maa-ameti LOD2 andmed (kogu Eesti) avalikus kaustas: lod2/v1/NNN.json.gz ja lod2/v1/geo/GX_GY.json.gz.
-- Failid on gzip-pakitud (äpp pakib lahti), vahemälu 1 aasta; uued andmed lähevad uude kausta (v2), mitte üle.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('lod2', 'lod2', true, 5242880, array['application/gzip'])
on conflict (id) do update set public = true, file_size_limit = 5242880, allowed_mime_types = array['application/gzip'];
