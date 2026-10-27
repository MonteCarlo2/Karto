-- Seller Hub: предложения агента, которые сервер считает сам по снимку кабинета.
-- Только новая таблица. Деньги и кабинет WB она не трогает: это очередь того, что агент предлагает сделать.

create table if not exists public.seller_hub_agent_proposals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  marketplace_id text not null default 'wildberries',
  -- Ключ «действие + цель» (pause:123, deposit:123, remove_nm:123:456): по нему предложения не плодятся при пересчёте.
  proposal_key text not null,
  rule text not null,
  title text not null,
  facts jsonb not null default '[]'::jsonb,
  effect text not null default '',
  risk text not null default 'low' check (risk in ('low', 'medium', 'high')),
  action jsonb not null,
  -- open: ждёт решения; done: выполнено; dismissed: человек отклонил; expired: расчёт больше не предлагает; failed: действие не удалось.
  status text not null default 'open' check (status in ('open', 'done', 'dismissed', 'expired', 'failed')),
  resolution_note text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (user_id, marketplace_id, proposal_key)
);

comment on table public.seller_hub_agent_proposals is
  'Seller Hub: предложения агента, посчитанные сервером по снимку кабинета. Исполняются только после подтверждения человека (или правила в режиме автопилот).';

create index if not exists seller_hub_agent_proposals_open_idx
  on public.seller_hub_agent_proposals (user_id, marketplace_id, status, last_seen_at desc);

alter table public.seller_hub_agent_proposals enable row level security;

create policy seller_hub_agent_proposals_read_own on public.seller_hub_agent_proposals
  for select to authenticated using (auth.uid() = user_id);

grant select on public.seller_hub_agent_proposals to authenticated;
grant all on public.seller_hub_agent_proposals to service_role;
