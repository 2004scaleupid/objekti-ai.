-- Fotodest tehtud hoone 3D-mudel seotakse aadressiga (EHR kood) -> Maa-ameti LOD2 ametlikud mõõdud ja automaatne mõõtkava.
-- renders.ehr on olemas (init.sql, esituspiltide jaoks); 3D-töö saab selle ai-3d start'is või hiljem "Lisa aadress" kaudu.

alter table public.renders drop constraint if exists renders_ehr_ok;
alter table public.renders add constraint renders_ehr_ok check (ehr is null or ehr ~ '^[0-9]{5,12}$');

-- "Lisa aadress": kasutaja tohib muuta ainult oma firma 3D-töö ehr veergu
drop policy if exists rn_ehr on public.renders;
create policy rn_ehr on public.renders for update
  using (company_id = my_company() and kind = '3d')
  with check (company_id = my_company() and kind = '3d');
grant update (ehr) on public.renders to authenticated;

-- mõõdukihi juures: millise hoone järgi sobitati ja tulemus {scale, conf, rot, ...}
alter table public.model_marks add column if not exists ehr text;
alter table public.model_marks add column if not exists fit jsonb;
alter table public.model_marks drop constraint if exists model_marks_ehr_ok;
alter table public.model_marks add constraint model_marks_ehr_ok check (ehr is null or ehr ~ '^[0-9]{5,12}$');
alter table public.model_marks drop constraint if exists model_marks_fit_ok;
alter table public.model_marks add constraint model_marks_fit_ok check (fit is null or (jsonb_typeof(fit) = 'object' and pg_column_size(fit) < 4000));
