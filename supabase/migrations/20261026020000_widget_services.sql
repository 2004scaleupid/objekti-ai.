-- 26.10: vidina teenused. Firma valib, mida vidin pakub (komaga loend):
--   house   = Maja 3D ja mõõdud aadressi järgi
--   house3d = klient saab lisada 4 fotot majast (päris välimusega 3D-mudel)
--   place   = Toode pildile (firma tooted kliendi fotol)
--   idea    = Vaba idee (kliendi foto + kirjeldus)
--   model3d = 3D-mudel fotost (klient laeb 1–4 fotot asjast)
-- Vanad väärtused jäävad kehtima: 'both' = house,place.
alter table public.widgets drop constraint if exists widgets_features_check;
alter table public.widgets add constraint widgets_features_check
  check (features ~ '^(both|(house|house3d|place|idea|model3d)(,(house|house3d|place|idea|model3d)){0,4})$');

-- pildisoovid: ka vaba idee ja 3D-mudelid
alter table public.widget_requests add column if not exists kind text not null default 'place';
alter table public.widget_requests drop constraint if exists widget_requests_kind_check;
alter table public.widget_requests add constraint widget_requests_kind_check check (kind in ('place','idea','3d'));
alter table public.widget_requests add column if not exists photos text[] not null default '{}';
alter table public.widget_requests add column if not exists render_id uuid;
alter table public.widget_requests add column if not exists subject text;
