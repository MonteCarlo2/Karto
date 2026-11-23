-- Seller Hub: «Поручения» агенту. Поручение = что делать + когда + рамки + как действовать (напомнить или сделать самому).
-- Создаётся в чате или в разделе «Поручения»; исполняется фоном по расписанию или условию, без открытого кабинета.
create table if not exists public.seller_hub_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  marketplace_id text not null default 'wildberries',
  title text not null check (char_length(title) between 1 and 160),
  kind text not null check (kind in ('remind', 'ads_deposit', 'price_step')),
  params jsonb not null default '{}'::jsonb,
  schedule jsonb not null default '{}'::jsonb,
  limits jsonb not null default '{}'::jsonb,
  -- act: выполнить самому; ask: только напомнить и предложить
  mode text not null default 'ask' check (mode in ('act', 'ask')),
  status text not null default 'active' check (status in ('active', 'paused', 'done')),
  created_from text not null default 'form' check (created_from in ('chat', 'form', 'template')),
  next_run_at timestamptz,
  last_run_at timestamptz,
  runs_count integer not null default 0,
  last_status text,
  last_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists seller_hub_orders_user_idx on public.seller_hub_orders (user_id, status);
create index if not exists seller_hub_orders_due_idx on public.seller_hub_orders (next_run_at) where status = 'active';
alter table public.seller_hub_orders enable row level security;
comment on table public.seller_hub_orders is 'Seller Hub: поручения агенту (расписание или условие, рамки, режим). Исполняются фоном; каждый запуск пишется в seller_hub_order_runs.';

create table if not exists public.seller_hub_order_runs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.seller_hub_orders (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  at timestamptz not null default now(),
  -- done: выполнено; simulated: тестовый режим; skipped: условие не наступило или упёрлось в рамки; failed: ошибка
  status text not null check (status in ('done', 'simulated', 'skipped', 'failed', 'reminder')),
  summary text not null default '',
  detail jsonb,
  read boolean not null default false
);
create index if not exists seller_hub_order_runs_user_idx on public.seller_hub_order_runs (user_id, at desc);
create index if not exists seller_hub_order_runs_order_idx on public.seller_hub_order_runs (order_id, at desc);
alter table public.seller_hub_order_runs enable row level security;
comment on table public.seller_hub_order_runs is 'Seller Hub: запуски поручений. reminder = напоминание владельцу (показывается в кабинете).';
