-- Seller Hub: общая база агентов, настройки складов, серверный кэш данных WB и пользовательские настройки.
-- Только новые таблицы (if not exists). Таблицы «Автоотзывов» (auto_reply_*) и существующие seller_hub_* не затрагиваются.
-- Стиль как у seller_hub_task_settings: user_id uuid, marketplace_id text, политика «_own» по auth.uid().

-- 1. Правила агентов. Один агент = одно значение agent; новые агенты добавляются без новых таблиц.
create table if not exists public.seller_hub_agent_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  marketplace_id text not null default 'wildberries',
  agent text not null check (agent in ('ads', 'prices', 'comms', 'stocks')),
  kind text not null,
  -- suggest: агент только предлагает, человек нажимает кнопку; auto: применяет сам в рамках лимитов правила.
  mode text not null default 'suggest' check (mode in ('suggest', 'auto')),
  params jsonb not null default '{}'::jsonb,
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.seller_hub_agent_rules is
  'Seller Hub: правила агентов (реклама, цены, ответы, остатки). По умолчанию выключены и работают в режиме «предлагать».';

create index if not exists seller_hub_agent_rules_user_idx
  on public.seller_hub_agent_rules (user_id, marketplace_id, agent, enabled);

-- 2. Журнал действий агентов и ручных действий с рекламой и ценами.
create table if not exists public.seller_hub_agent_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  marketplace_id text not null default 'wildberries',
  agent text not null check (agent in ('ads', 'prices', 'comms', 'stocks')),
  rule_id uuid references public.seller_hub_agent_rules (id) on delete set null,
  target_id bigint,
  nm_id bigint,
  action text not null,
  request jsonb not null default '{}'::jsonb,
  result text not null check (result in ('ok', 'error', 'skipped', 'suggested')),
  message text,
  initiator text not null default 'user' check (initiator in ('user', 'agent')),
  created_at timestamptz not null default now()
);

comment on table public.seller_hub_agent_actions is
  'Seller Hub: журнал действий (кто, что, когда, с каким результатом). Из него считаются суточные лимиты автопополнения.';

create index if not exists seller_hub_agent_actions_user_time_idx
  on public.seller_hub_agent_actions (user_id, created_at desc);
create index if not exists seller_hub_agent_actions_target_idx
  on public.seller_hub_agent_actions (user_id, agent, target_id, created_at desc);

-- 3. Настройки складов WB (как «Управление складами» у JVO).
create table if not exists public.seller_hub_warehouse_settings (
  user_id uuid not null references auth.users (id) on delete cascade,
  marketplace_id text not null default 'wildberries',
  warehouse_id bigint not null,
  warehouse_name text not null,
  deactivated_from date,
  exclude_stock_from date,
  updated_at timestamptz not null default now(),
  primary key (user_id, marketplace_id, warehouse_id)
);

comment on table public.seller_hub_warehouse_settings is
  'Seller Hub: ручные настройки складов WB (деактивация склада и исключение его остатков из расчётов).';

-- 4. Серверный кэш ответов WB с узкими лимитами (статистика рекламы, заказы по регионам, остатки по складам и т.д.).
-- Читают и пишут серверные маршруты Seller Hub; кэш общий для всех устройств пользователя и переживает перезагрузку страницы.
create table if not exists public.seller_hub_data_cache (
  user_id uuid not null references auth.users (id) on delete cascade,
  marketplace_id text not null default 'wildberries',
  cache_key text not null,
  payload jsonb not null,
  loaded_at timestamptz not null default now(),
  primary key (user_id, marketplace_id, cache_key)
);

comment on table public.seller_hub_data_cache is
  'Seller Hub: кэш ответов WB по ключу запроса. Свежесть решает сервер по loaded_at и TTL ключа.';

create index if not exists seller_hub_data_cache_loaded_idx
  on public.seller_hub_data_cache (loaded_at);

-- 5. Пользовательские настройки интерфейса и расчётов (то, что раньше жило бы только в браузере).
create table if not exists public.seller_hub_user_settings (
  user_id uuid not null references auth.users (id) on delete cascade,
  marketplace_id text not null default 'wildberries',
  setting_key text not null,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, marketplace_id, setting_key)
);

comment on table public.seller_hub_user_settings is
  'Seller Hub: пользовательские настройки (период по умолчанию, параметры плана отгрузки и т.п.), общие для всех устройств.';

alter table public.seller_hub_agent_rules enable row level security;
alter table public.seller_hub_agent_actions enable row level security;
alter table public.seller_hub_warehouse_settings enable row level security;
alter table public.seller_hub_data_cache enable row level security;
alter table public.seller_hub_user_settings enable row level security;

create policy seller_hub_agent_rules_own on public.seller_hub_agent_rules
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy seller_hub_warehouse_settings_own on public.seller_hub_warehouse_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy seller_hub_user_settings_own on public.seller_hub_user_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Журнал: пользователь читает свои записи; пишет сервер (service role) и сам пользователь от своего имени.
create policy seller_hub_agent_actions_read_own on public.seller_hub_agent_actions
  for select using (auth.uid() = user_id);
create policy seller_hub_agent_actions_insert_own on public.seller_hub_agent_actions
  for insert with check (auth.uid() = user_id);

-- Кэш: пользователю достаточно читать своё; записывает только сервер (service role обходит RLS).
create policy seller_hub_data_cache_read_own on public.seller_hub_data_cache
  for select using (auth.uid() = user_id);
