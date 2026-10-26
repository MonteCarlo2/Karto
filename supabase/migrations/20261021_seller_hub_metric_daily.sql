-- Seller Hub: история показателей по дням. Одна строка = день + артикул; nm_id = '' — итог по магазину.
-- Магазин — пара user_id + marketplace_id (как в seller_hub_event_stores). Только новая таблица, существующие не затрагиваются.
-- Пишет сервер (service role), пользователь читает только своё.
-- Срок хранения: по умолчанию 400 дней, чистка функцией seller_hub_metric_daily_prune (вызывать по расписанию).

create table if not exists public.seller_hub_metric_daily (
  user_id uuid not null references auth.users (id) on delete cascade,
  marketplace_id text not null default 'wildberries',
  metric_date date not null,
  nm_id text not null default '',
  metrics jsonb not null,
  source text not null default 'wb-funnel',
  captured_at timestamptz not null default now(),
  primary key (user_id, marketplace_id, metric_date, nm_id)
);

comment on table public.seller_hub_metric_daily is
  'Seller Hub: история показателей по дням (воронка за законченный день, остаток на день снимка). nm_id пустой — итог магазина.';

create index if not exists seller_hub_metric_daily_nm_idx
  on public.seller_hub_metric_daily (user_id, marketplace_id, nm_id, metric_date desc);

alter table public.seller_hub_metric_daily enable row level security;

create policy seller_hub_metric_daily_read_own on public.seller_hub_metric_daily
  for select using (auth.uid() = user_id);

revoke all on public.seller_hub_metric_daily from public, anon, authenticated;
grant select on public.seller_hub_metric_daily to authenticated;
grant select, insert, update, delete on public.seller_hub_metric_daily to service_role;

create or replace function public.seller_hub_metric_daily_prune(keep_days integer default 400)
returns integer
language sql
security definer
set search_path = public
as $$
  with gone as (
    delete from public.seller_hub_metric_daily
    where metric_date < (current_date - keep_days)
    returning 1
  )
  select count(*)::integer from gone;
$$;

revoke all on function public.seller_hub_metric_daily_prune(integer) from public, anon, authenticated;
grant execute on function public.seller_hub_metric_daily_prune(integer) to service_role;
