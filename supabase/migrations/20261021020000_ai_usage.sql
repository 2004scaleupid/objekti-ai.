-- AI teenuste kulu jälgimine admini ülevaate jaoks (ainult server kirjutab ja loeb)
create table if not exists public.ai_usage (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  company_id uuid references public.companies(id) on delete set null,
  kind text not null default 'chat',
  model text,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cost_usd numeric(12,6) not null default 0
);
create index if not exists ai_usage_created_ix on public.ai_usage(created_at desc);
create index if not exists ai_usage_company_ix on public.ai_usage(company_id);
alter table public.ai_usage enable row level security;
revoke all on public.ai_usage from anon, authenticated;
-- (need kaks veergu jäid kasutamata, vt service_topups)
alter table public.settings add column if not exists anthropic_topup_usd numeric(10,2);
alter table public.settings add column if not exists anthropic_topup_at timestamptz;
-- teenustele laetud summad (admin sisestab), et näidata hinnangulist jääki; ainult server
create table if not exists public.service_topups (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  service text not null check (service in ('anthropic','kie')),
  amount_usd numeric(10,2) not null check (amount_usd > 0 and amount_usd < 100000)
);
alter table public.service_topups enable row level security;
revoke all on public.service_topups from anon, authenticated;
