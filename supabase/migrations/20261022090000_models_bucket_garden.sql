-- Aed ja ümbrus salvestab models/aed/<EHR>/ kausta ndsm.png, fences.png ja meta.json; kaust lubas ainult .glb faile (aia salvestamine ebaõnnestus).
update storage.buckets set allowed_mime_types = array['model/gltf-binary', 'application/octet-stream', 'image/png', 'image/jpeg', 'application/json']
where id = 'models';
