-- Seller Hub: фоновый сбор данных кабинетов (фаза 1, только добавление; существующие таблицы не меняются).
-- СТАТУС: ЧЕРНОВИК, В БАЗЕ НЕ ПРИМЕНЁН. Применять только после согласования с владельцем.
--
-- Принципы:
--  * Магазин (кабинет) = пара user_id + marketplace_id, как во всех существующих таблицах seller_hub_*. Переход на отдельный cabinet_id отдельным шагом.
--  * Токены остаются в auto_reply_marketplace_secrets. Здесь токенов нет.
--  * Текущее состояние ЗАМЕНЯЕТСЯ (одна актуальная строка), история копится по дням ограниченный срок: 180 дней.
--  * Ничего не дублируем: история по товарам уже в seller_hub_metric_daily, отзывы в seller_hub_feedbacks, журнал агентов в seller_hub_agent_actions.
--  * Таблицы закрыты от клиента: читает и пишет серверный код (service role).

-- 1. Кабинет: согласие на фоновую работу и общее здоровье.
create table if not exists public.seller_hub_cabinets (
  user_id uuid not null references auth.users (id) on delete cascade,
  marketplace_id text not null default 'wildberries',
  name text not null default '',
  -- pending_consent: согласия нет, фон не работает; ok: работает; token_lost: токен не принят или нет прав; paused: остановлено вручную.
  status text not null default 'pending_consent'
    check (status in ('pending_consent', 'ok', 'token_lost', 'paused')),
  background_enabled boolean not null default false,
  consent_at timestamptz,
  consent_version text,
  last_ok_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, marketplace_id),
  -- Фон нельзя включить без записанного согласия.
  check (not background_enabled or consent_at is not null)
);

comment on table public.seller_hub_cabinets is
  'Seller Hub: настройки фонового режима кабинета. Воркер обрабатывает только кабинеты с background_enabled и записанным согласием.';

-- 2. Состояние источников: когда читать в следующий раз, где остановились, кто сейчас читает.
create table if not exists public.seller_hub_sync_state (
  user_id uuid not null,
  marketplace_id text not null,
  -- Идентификаторы источников задаёт код (src/lib/seller-hub/sync/sources.ts): prices, orders, ads_campaigns, ads_stats, funnel и т.д.
  source text not null,
  -- Курсор докачки (страница, дата, id), чтобы длинный источник читался короткими шагами.
  cursor jsonb not null default '{}'::jsonb,
  next_due_at timestamptz not null default now(),
  last_started_at timestamptz,
  last_ok_at timestamptz,
  -- Неудач подряд: от них растёт пауза перед повтором.
  fail_count integer not null default 0,
  last_error text,
  -- Аренда: пока lease_until в будущем, источник читает владелец lease_owner. Защита от двойного чтения
  -- (расписание сработало снова, пока прошлый прогон ещё идёт; перезапуск сервера посреди чтения).
  lease_until timestamptz,
  lease_owner text,
  primary key (user_id, marketplace_id, source),
  foreign key (user_id, marketplace_id)
    references public.seller_hub_cabinets (user_id, marketplace_id) on delete cascade
);

comment on table public.seller_hub_sync_state is
  'Seller Hub: расписание и аренда источников. Воркер берёт источники с next_due_at <= now() и свободной арендой.';

create index if not exists seller_hub_sync_state_due_idx
  on public.seller_hub_sync_state (next_due_at);

-- 3. Журнал прогонов. Хранится 30 дней. Токены и тела ответов WB сюда не пишутся.
create table if not exists public.seller_hub_sync_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  marketplace_id text not null,
  source text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  -- running; ok: снимок обновлён; partial: прочитано не всё, снимок не опубликован; failed; rate_limited: WB ответил 429;
  -- skipped: нет доступа или кабинет остановлен.
  status text not null default 'running'
    check (status in ('running', 'ok', 'partial', 'failed', 'rate_limited', 'skipped')),
  http_status integer,
  rows_count integer,
  duration_ms integer,
  owner text,
  error text,
  foreign key (user_id, marketplace_id)
    references public.seller_hub_cabinets (user_id, marketplace_id) on delete cascade
);

create index if not exists seller_hub_sync_runs_cabinet_idx
  on public.seller_hub_sync_runs (user_id, marketplace_id, started_at desc);

-- 4. Серверный снимок источника: ВСЕГДА одна, последняя полная версия. Неполный прогон её не затирает.
create table if not exists public.seller_hub_snapshots (
  user_id uuid not null,
  marketplace_id text not null,
  source text not null,
  payload jsonb not null,
  -- Хэш содержимого: если не изменился, события и задачи заново считать не нужно.
  payload_hash text,
  -- Окно данных для статистик (ГГГГ-ММ-ДД).
  data_from text,
  data_to text,
  loaded_at timestamptz not null default now(),
  primary key (user_id, marketplace_id, source),
  foreign key (user_id, marketplace_id)
    references public.seller_hub_cabinets (user_id, marketplace_id) on delete cascade
);

comment on table public.seller_hub_snapshots is
  'Seller Hub: последний полный снимок источника кабинета. Браузер читает его и показывает возраст данных по loaded_at.';

-- 5. Реклама по дням: по товару и кампании. WB отдаёт статистику не дальше 31 дня, поэтому длинную историю копим сами.
create table if not exists public.seller_hub_ad_daily (
  user_id uuid not null references auth.users (id) on delete cascade,
  marketplace_id text not null default 'wildberries',
  metric_date date not null,
  advert_id bigint not null,
  nm_id bigint not null,
  views integer not null default 0,
  clicks integer not null default 0,
  spend numeric(12, 2) not null default 0,
  orders integer not null default 0,
  order_sum numeric(14, 2) not null default 0,
  captured_at timestamptz not null default now(),
  primary key (user_id, marketplace_id, metric_date, advert_id, nm_id)
);

comment on table public.seller_hub_ad_daily is
  'Seller Hub: расход и результаты рекламы по дням, кампании и товару. Хранится 180 дней.';

create index if not exists seller_hub_ad_daily_nm_idx
  on public.seller_hub_ad_daily (user_id, marketplace_id, nm_id, metric_date desc);

-- 6. Права. Новые таблицы по умолчанию доступны клиентским ролям Supabase: закрываем явно.
alter table public.seller_hub_cabinets enable row level security;
alter table public.seller_hub_sync_state enable row level security;
alter table public.seller_hub_sync_runs enable row level security;
alter table public.seller_hub_snapshots enable row level security;
alter table public.seller_hub_ad_daily enable row level security;

revoke all on public.seller_hub_cabinets from public, anon, authenticated;
revoke all on public.seller_hub_sync_state from public, anon, authenticated;
revoke all on public.seller_hub_sync_runs from public, anon, authenticated;
revoke all on public.seller_hub_snapshots from public, anon, authenticated;
revoke all on public.seller_hub_ad_daily from public, anon, authenticated;

grant select, insert, update, delete on public.seller_hub_cabinets to service_role;
grant select, insert, update, delete on public.seller_hub_sync_state to service_role;
grant select, insert, update, delete on public.seller_hub_sync_runs to service_role;
grant select, insert, update, delete on public.seller_hub_snapshots to service_role;
grant select, insert, update, delete on public.seller_hub_ad_daily to service_role;

-- 7. Самое главное по кабинетам в понятном виде: здоров ли кабинет и насколько свежи данные по каждому источнику.
create or replace view public.seller_hub_v_cabinet_health as
select
  c.user_id,
  c.marketplace_id as marketplace,
  c.name as cabinet,
  c.status as status,
  c.background_enabled as background_on,
  c.consent_at as consent_given_at,
  s.source as source,
  s.last_ok_at as last_success,
  round(extract(epoch from (now() - s.last_ok_at)) / 60)::integer as data_age_minutes,
  s.fail_count as failures_in_a_row,
  s.last_error as last_error,
  s.next_due_at as next_read_at
from public.seller_hub_cabinets c
left join public.seller_hub_sync_state s
  on s.user_id = c.user_id and s.marketplace_id = c.marketplace_id;

comment on view public.seller_hub_v_cabinet_health is
  'Seller Hub: состояние кабинетов и возраст данных по источникам. Для владельца: select * from seller_hub_v_cabinet_health.';

revoke all on public.seller_hub_v_cabinet_health from public, anon, authenticated;
grant select on public.seller_hub_v_cabinet_health to service_role;

-- 8. Очистка по срокам. Вызывать воркеру раз в сутки: select * from seller_hub_prune_all();
--    История, журналы, отзывы, действия агентов, закрытые задачи: 180 дней. Журнал прогонов: 30 дней.
--    Открытые задачи и действующие настройки не затрагиваются.
create or replace function public.seller_hub_prune_all(keep_days integer default 180, runs_keep_days integer default 30)
returns table (table_name text, deleted integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  delete from public.seller_hub_metric_daily where metric_date < current_date - keep_days;
  get diagnostics n = row_count;
  table_name := 'seller_hub_metric_daily'; deleted := n; return next;

  delete from public.seller_hub_ad_daily where metric_date < current_date - keep_days;
  get diagnostics n = row_count;
  table_name := 'seller_hub_ad_daily'; deleted := n; return next;

  delete from public.seller_hub_feedbacks where created_at < now() - make_interval(days => keep_days);
  get diagnostics n = row_count;
  table_name := 'seller_hub_feedbacks'; deleted := n; return next;

  delete from public.seller_hub_questions where created_at < now() - make_interval(days => keep_days);
  get diagnostics n = row_count;
  table_name := 'seller_hub_questions'; deleted := n; return next;

  delete from public.seller_hub_agent_actions where created_at < now() - make_interval(days => keep_days);
  get diagnostics n = row_count;
  table_name := 'seller_hub_agent_actions'; deleted := n; return next;

  delete from public.seller_hub_product_events where created_at < now() - make_interval(days => keep_days);
  get diagnostics n = row_count;
  table_name := 'seller_hub_product_events'; deleted := n; return next;

  -- Только закрытые задачи со временем закрытия; открытые и отложенные живут, пока условие не исчезнет.
  delete from public.seller_hub_tasks
  where status in ('completed', 'dismissed') and resolved_at is not null and resolved_at < now() - make_interval(days => keep_days);
  get diagnostics n = row_count;
  table_name := 'seller_hub_tasks'; deleted := n; return next;

  delete from public.seller_hub_sync_runs where started_at < now() - make_interval(days => runs_keep_days);
  get diagnostics n = row_count;
  table_name := 'seller_hub_sync_runs'; deleted := n; return next;
end;
$$;

revoke all on function public.seller_hub_prune_all(integer, integer) from public, anon, authenticated;
grant execute on function public.seller_hub_prune_all(integer, integer) to service_role;

-- Откат (если понадобится):
--   drop function public.seller_hub_prune_all(integer, integer);
--   drop view public.seller_hub_v_cabinet_health;
--   drop table public.seller_hub_ad_daily, public.seller_hub_snapshots, public.seller_hub_sync_runs, public.seller_hub_sync_state, public.seller_hub_cabinets;
