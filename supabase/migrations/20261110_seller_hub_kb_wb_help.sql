-- База знаний: слежение за официальной справкой Wildberries (общие данные, не привязаны к пользователю).
create table if not exists public.seller_hub_kb_wb_articles (
  help_id text primary key,
  slug text,
  title text not null,
  category text,
  wb_updated text,
  content_hash text not null,
  source_text text not null,
  -- Переработанная статья для базы знаний (только для статей справки, которых нет среди написанных вручную).
  auto_article jsonb,
  auto_status text not null default 'none',
  auto_note text,
  first_seen_at timestamptz not null default now(),
  checked_at timestamptz not null default now(),
  changed_at timestamptz,
  removed_at timestamptz
);

create table if not exists public.seller_hub_kb_wb_changes (
  id uuid primary key default gen_random_uuid(),
  help_id text not null,
  kind text not null,
  title text not null,
  wb_updated text,
  -- Короткое объяснение простыми словами и проверенные факты «было → стало».
  summary text,
  facts jsonb not null default '[]'::jsonb,
  -- Точечные правки наших статей: [{articleId, find, replace}]. Применяются поверх текста при показе, исходник не меняется.
  patches jsonb not null default '[]'::jsonb,
  detected_at timestamptz not null default now()
);
create index if not exists seller_hub_kb_wb_changes_detected_idx on public.seller_hub_kb_wb_changes (detected_at desc);

create table if not exists public.seller_hub_kb_wb_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  checked integer not null default 0,
  changed integer not null default 0,
  added integer not null default 0,
  error text
);

alter table public.seller_hub_kb_wb_articles enable row level security;
alter table public.seller_hub_kb_wb_changes enable row level security;
alter table public.seller_hub_kb_wb_runs enable row level security;
-- Читает и пишет только сервер (service_role); клиент получает данные через /api/seller-hub/knowledge/updates.
grant all on public.seller_hub_kb_wb_articles to service_role;
grant all on public.seller_hub_kb_wb_changes to service_role;
grant all on public.seller_hub_kb_wb_runs to service_role;
comment on table public.seller_hub_kb_wb_articles is 'База знаний: снимок статей официальной справки Wildberries и их переработанные версии.';
comment on table public.seller_hub_kb_wb_changes is 'База знаний: лента изменений справки Wildberries с проверенными фактами и точечными правками наших статей.';
comment on table public.seller_hub_kb_wb_runs is 'База знаний: журнал проходов сверки со справкой Wildberries.';
