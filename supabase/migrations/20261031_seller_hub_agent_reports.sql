-- Seller Hub: недельные отчёты о работе агентов.
create table if not exists public.seller_hub_agent_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  marketplace_id text not null default 'wildberries',
  kind text not null default 'weekly',
  period_start date not null,
  period_end date not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (user_id, marketplace_id, kind, period_end)
);
alter table public.seller_hub_agent_reports enable row level security;
create policy seller_hub_agent_reports_read_own on public.seller_hub_agent_reports for select to authenticated using (auth.uid() = user_id);
grant select on public.seller_hub_agent_reports to authenticated;
grant all on public.seller_hub_agent_reports to service_role;
comment on table public.seller_hub_agent_reports is 'Seller Hub: недельные отчёты о работе агентов (что сделано, чем закончились планы). Только наши данные, без оценок денег.';
