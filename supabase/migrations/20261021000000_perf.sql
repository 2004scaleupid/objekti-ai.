-- Jõudlus: auth.uid() arvutatakse päringu kohta üks kord (mitte iga rea kohta) + puuduvad välisvõtme indeksid.
alter policy pr_read on public.profiles using ((user_id = (select auth.uid())) or (select public.is_admin()));
alter policy pr_upd on public.profiles using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy pa_read on public.partners using ((owner_user = (select auth.uid())) or (select public.is_admin()));
alter policy pa_own_upd on public.partners using (owner_user = (select auth.uid())) with check (owner_user = (select auth.uid()));
alter policy po_read on public.payouts using ((select public.is_admin()) or (code in (select p.code from public.partners p where p.owner_user = (select auth.uid()))));
create index if not exists feedback_company_ix on public.feedback(company_id);
create index if not exists payouts_code_ix on public.payouts(code);
create index if not exists products_company_ix on public.products(company_id);
create index if not exists profiles_company_ix on public.profiles(company_id);
create index if not exists renders_object_ix on public.renders(object_id);
