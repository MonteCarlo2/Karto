-- Seller Hub: учёт расхода на нейросети по пользователю (для месячного лимита и экрана «Агенты»). Только новая таблица.
create table if not exists public.seller_hub_ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  kind text not null,
  calls integer not null default 0,
  cost_usd numeric(10, 5) not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists seller_hub_ai_usage_user_day_idx on public.seller_hub_ai_usage (user_id, day);
alter table public.seller_hub_ai_usage enable row level security;
comment on table public.seller_hub_ai_usage is 'Seller Hub: сколько потрачено на ИИ (по запускам). Пишет только сервер.';
