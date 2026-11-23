-- Seller Hub: очередь уведомлений. Каждое уведомление (событие, срочная задача, результат агента, срок токена) пишется один раз,
-- затем доставляется в Telegram с учётом настроек и тихих часов. Уникальность (user_id, dedupe_key) не даёт отправить одно и то же дважды.
create table if not exists public.seller_hub_notify_queue (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  dedupe_key text not null check (char_length(dedupe_key) between 1 and 200),
  category text not null check (category in ('event', 'task', 'agent', 'token')),
  severity text not null check (severity in ('info', 'important', 'critical')),
  title text not null check (char_length(title) between 1 and 400),
  body text not null default '',
  subject text,
  occurred_at timestamptz not null default now(),
  -- pending: ждёт отправки (в том числе из-за тихих часов); sent: отправлено; skipped: не нужно (настройки, устарело); failed: не вышло после повторов
  status text not null default 'pending' check (status in ('pending', 'sent', 'skipped', 'failed')),
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (user_id, dedupe_key)
);
create index if not exists seller_hub_notify_queue_pending_idx on public.seller_hub_notify_queue (user_id, created_at) where status = 'pending';
alter table public.seller_hub_notify_queue enable row level security;
comment on table public.seller_hub_notify_queue is 'Seller Hub: очередь и журнал уведомлений в Telegram. Пишет только сервер (service role).';
