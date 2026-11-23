-- Действия из Telegram, ожидающие подтверждения кнопкой (цена, реклама, поручения). Карточка живёт 15 минут.
create table if not exists public.seller_hub_tg_pending_actions (
  id uuid primary key default gen_random_uuid(),
  short_id text not null unique,
  user_id uuid not null,
  chat_id bigint not null,
  action jsonb not null,
  summary text not null,
  status text not null default 'pending' check (status in ('pending','running','done','failed','cancelled','expired','undone')),
  result text,
  undo jsonb,
  message_id bigint,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  resolved_at timestamptz
);
create index if not exists seller_hub_tg_pending_actions_user_idx on public.seller_hub_tg_pending_actions (user_id, created_at desc);
alter table public.seller_hub_tg_pending_actions enable row level security;
