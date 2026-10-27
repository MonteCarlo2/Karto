-- Seller Hub: ИИ разбирает сигналы алгоритмов (задачи): план решения, вердикт «проблема / не проблема». Только новые поля.
alter table public.seller_hub_ai_findings add column if not exists origin text not null default 'scan';
alter table public.seller_hub_ai_findings add column if not exists task_id text;
alter table public.seller_hub_ai_findings add column if not exists signal_fp text;
alter table public.seller_hub_ai_findings add column if not exists verdict text;
alter table public.seller_hub_ai_findings add column if not exists plan jsonb;
alter table public.seller_hub_ai_findings drop constraint if exists seller_hub_ai_findings_status_check;
alter table public.seller_hub_ai_findings add constraint seller_hub_ai_findings_status_check check (status in ('open', 'faded', 'dismissed', 'not_problem'));
create index if not exists seller_hub_ai_findings_task_idx on public.seller_hub_ai_findings (user_id, marketplace_id, task_id);
comment on column public.seller_hub_ai_findings.origin is 'signal: ИИ разобрал сигнал алгоритма (задачу); scan: ИИ сам просмотрел кабинет';
comment on column public.seller_hub_ai_findings.plan is 'Последовательность решения: [{step, by: human|program, action}]';
