-- Seller Hub: сценарии агента, состояние сценариев по товарам и журнал решений с измерением результата.
-- Только новые таблицы и одно новое поле. Деньги и кабинет WB они не трогают: это память агента.

-- 1. Сценарий агента: какая стратегия, к каким товарам, в каком режиме.
create table if not exists public.seller_hub_agent_scenarios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  marketplace_id text not null default 'wildberries',
  playbook text not null check (playbook in ('grow_no_price_war', 'raise_margin', 'clear_overstock', 'hold_conversion_on_negative')),
  name text not null,
  -- охват: {"all": true} или {"nmIds": ["123", "456"]}
  scope jsonb not null default '{"all": true}'::jsonb,
  -- suggest: агент только предлагает, человек подтверждает. Режима auto для цен нет.
  mode text not null default 'suggest' check (mode = 'suggest'),
  enabled boolean not null default false,
  -- переопределения параметров стратегии (в допустимых границах, проверяются кодом)
  params jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_run_at timestamptz
);

comment on table public.seller_hub_agent_scenarios is
  'Seller Hub: сценарии цен агента. По умолчанию выключены; режим только «предлагать».';

create index if not exists seller_hub_agent_scenarios_user_idx
  on public.seller_hub_agent_scenarios (user_id, marketplace_id, enabled);

-- 2. Память сценария по товару: опорная цена, фаза, когда сработало «раз в N дней» правило.
create table if not exists public.seller_hub_agent_playbook_state (
  user_id uuid not null references auth.users (id) on delete cascade,
  marketplace_id text not null default 'wildberries',
  nm_id text not null,
  playbook text not null,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, marketplace_id, nm_id, playbook)
);

-- 3. Журнал решений: что агент предложил, что человек сделал, что получилось.
create table if not exists public.seller_hub_agent_decisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  marketplace_id text not null default 'wildberries',
  nm_id text,
  playbook text,
  action_type text not null,
  -- действие целиком, как оно было предложено и выполнено
  action jsonb not null,
  -- сигналы товара в момент решения и сработавшие правила (для проверки «почему агент так решил»)
  signals jsonb not null default '{}'::jsonb,
  reasons jsonb not null default '[]'::jsonb,
  -- что было и что стало в кабинете
  before_state jsonb not null default '{}'::jsonb,
  after_state jsonb not null default '{}'::jsonb,
  -- состояние сценария, которое вступило в силу после выполнения
  next_state jsonb,
  status text not null default 'executed' check (status in ('executed', 'failed', 'reverted')),
  decided_by text not null default 'user' check (decided_by in ('user', 'agent')),
  note text,
  executed_at timestamptz not null default now(),
  -- измерение результата: до какого дня наблюдаем и что получилось
  observe_until timestamptz,
  outcome jsonb,
  outcome_verdict text check (outcome_verdict in ('improved', 'worse', 'no_visible_effect', 'too_early', 'unknown')),
  outcome_at timestamptz
);

comment on table public.seller_hub_agent_decisions is
  'Seller Hub: журнал решений агента с измерением результата через окно наблюдения.';

create index if not exists seller_hub_agent_decisions_user_idx
  on public.seller_hub_agent_decisions (user_id, marketplace_id, executed_at desc);
create index if not exists seller_hub_agent_decisions_nm_idx
  on public.seller_hub_agent_decisions (user_id, nm_id, executed_at desc);
create index if not exists seller_hub_agent_decisions_due_idx
  on public.seller_hub_agent_decisions (user_id, observe_until)
  where outcome_verdict is null and status = 'executed';

-- 4. Метаданные предложения (сценарий, шаг, причины, будущее состояние) для очереди предложений.
alter table public.seller_hub_agent_proposals add column if not exists meta jsonb not null default '{}'::jsonb;

alter table public.seller_hub_agent_scenarios enable row level security;
alter table public.seller_hub_agent_playbook_state enable row level security;
alter table public.seller_hub_agent_decisions enable row level security;

create policy seller_hub_agent_scenarios_read_own on public.seller_hub_agent_scenarios for select to authenticated using (auth.uid() = user_id);
create policy seller_hub_agent_playbook_state_read_own on public.seller_hub_agent_playbook_state for select to authenticated using (auth.uid() = user_id);
create policy seller_hub_agent_decisions_read_own on public.seller_hub_agent_decisions for select to authenticated using (auth.uid() = user_id);

grant select on public.seller_hub_agent_scenarios, public.seller_hub_agent_playbook_state, public.seller_hub_agent_decisions to authenticated;
grant all on public.seller_hub_agent_scenarios, public.seller_hub_agent_playbook_state, public.seller_hub_agent_decisions to service_role;
