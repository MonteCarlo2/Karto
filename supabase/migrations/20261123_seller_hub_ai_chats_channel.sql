-- Откуда диалог с агентом: сайт или Telegram. Диалоги Telegram в истории на сайте не показываются.
alter table public.seller_hub_ai_chats add column if not exists channel text not null default 'web';
create index if not exists seller_hub_ai_chats_channel_idx on public.seller_hub_ai_chats (user_id, channel, updated_at desc);
