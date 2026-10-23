-- Sisekujundus + 3D: toa 3D töö olek (Claude'i mõõdud, MuAPI tööd, mööbel) renders reas; tulemus models/room/<firma>/<id>/room.json
alter table public.renders add column if not exists room jsonb;
alter table public.renders drop constraint if exists renders_room_size;
alter table public.renders add constraint renders_room_size check (room is null or pg_column_size(room) < 200000);
