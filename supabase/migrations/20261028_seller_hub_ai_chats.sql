-- Seller Hub: диалоги «поставить задачу ИИ своими словами». Только новая таблица.
create table if not exists public.seller_hub_ai_chats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  marketplace_id text not null default 'wildberries',
  title text not null default '',
  messages jsonb not null default '[]'::jsonb,
  -- asking: ИИ уточняет; planned: планы составлены; closed: закрыт владельцем
  state text not null default 'asking' check (state in ('asking', 'planned', 'closed')),
  rounds integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists seller_hub_ai_chats_user_idx on public.seller_hub_ai_chats (user_id, marketplace_id, updated_at desc);
alter table public.seller_hub_ai_chats enable row level security;
comment on table public.seller_hub_ai_chats is 'Seller Hub: диалоги «поставить задачу ИИ»: вопросы, ответы, составленные планы (планы лежат в seller_hub_ai_findings с origin chat).';
