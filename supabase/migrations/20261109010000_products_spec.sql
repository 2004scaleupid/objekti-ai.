-- Sündmuse planeerija: toote mõõdud ja reeglid masinloetavalt (laud, tool, telk, lava, ...).
-- Näide: {"kind":"table","shape":"round","d":1.8,"seats":10,"source":"funrent.ee"}
alter table public.products add column if not exists spec jsonb;
alter table public.products drop constraint if exists products_spec_ok;
alter table public.products add constraint products_spec_ok check (spec is null or (jsonb_typeof(spec) = 'object' and pg_column_size(spec) <= 8000));
-- ettevõtte reeglid (seinavahe, vahekäigud, ...) muudetavad
alter table public.companies add column if not exists plan_rules jsonb;
alter table public.companies drop constraint if exists companies_plan_rules_ok;
alter table public.companies add constraint companies_plan_rules_ok check (plan_rules is null or (jsonb_typeof(plan_rules) = 'object' and pg_column_size(plan_rules) <= 4000));
