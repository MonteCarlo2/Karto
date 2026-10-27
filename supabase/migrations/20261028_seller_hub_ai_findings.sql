-- Seller Hub: находки ИИ-наблюдателя (наблюдения с цифрами, не действия). Только новая таблица.
create table if not exists public.seller_hub_ai_findings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  marketplace_id text not null default 'wildberries',
  fingerprint text not null,
  nm_id text,
  kind text not null,
  severity text not null check (severity in ('watch', 'important')),
  title text not null,
  what text not null default '',
  why_now text not null default '',
  evidence jsonb not null default '[]'::jsonb,
  human_advice text not null default '',
  algorithm_view jsonb not null default '{}'::jsonb,
  second_opinion text not null default 'not_checked',
  second_reason text not null default '',
  -- open: показывается; faded: ИИ больше не видит проблему; dismissed: владелец скрыл
  status text not null default 'open' check (status in ('open', 'faded', 'dismissed')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  -- сверка с продажами: что стало с заказами товара через 7–14 дней после находки
  outcome jsonb,
  unique (user_id, marketplace_id, fingerprint)
);
create index if not exists seller_hub_ai_findings_user_status_idx on public.seller_hub_ai_findings (user_id, marketplace_id, status);
alter table public.seller_hub_ai_findings enable row level security;
comment on table public.seller_hub_ai_findings is 'Seller Hub: находки ИИ-наблюдателя. Пишет только сервер; владелец читает через API.';
