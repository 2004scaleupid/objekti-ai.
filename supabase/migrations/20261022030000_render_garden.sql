-- Fotodest hoone 3D-mudel + "Lisa aed ja ümbrus": Maa-ameti avaandmed maja ümber (vt functions/garden).
alter table public.renders add column if not exists garden boolean not null default false;
