-- Seller Hub: правила автопилота владельца и флаг автопилота на плане. По умолчанию всё выключено.
create table if not exists public.seller_hub_autopilot_settings (
  user_id uuid not null references auth.users (id) on delete cascade,
  marketplace_id text not null default 'wildberries',
  enabled boolean not null default false,
  allowed_types text[] not null default '{pause,remove_nm,minus_phrases,deposit}',
  max_actions_per_day integer not null default 10 check (max_actions_per_day between 1 and 50),
  max_deposit_per_day_rub integer not null default 1000 check (max_deposit_per_day_rub between 0 and 20000),
  updated_at timestamptz not null default now(),
  primary key (user_id, marketplace_id)
);
alter table public.seller_hub_autopilot_settings enable row level security;
comment on table public.seller_hub_autopilot_settings is 'Seller Hub: правила автопилота владельца. По умолчанию выключен. Автопилот выполняет только безопасные шаги принятых планов, у которых включён автопилот.';
alter table public.seller_hub_ai_findings add column if not exists autopilot boolean not null default false;
comment on column public.seller_hub_ai_findings.autopilot is 'Владелец разрешил автопилот для этого плана: безопасные шаги выполняются сами в рамках правил и суточных пределов.';
