-- Heartbeat фонового cron (видно в Supabase → Table Editor → auto_reply_cron_heartbeats)
-- Telegram: статус подключения в auto_reply_telegram_links (notify_enabled = вкл/выкл уведомления)

CREATE TABLE IF NOT EXISTS public.auto_reply_cron_heartbeats (
  id TEXT PRIMARY KEY,
  last_tick_at TIMESTAMPTZ NOT NULL,
  last_result JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.auto_reply_cron_heartbeats ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.auto_reply_cron_heartbeats IS
  'Последний успешный тик фонового cron автоответов (id=inbox). Обновляется каждые ~2 мин на сервере karto.pro.';

COMMENT ON TABLE public.auto_reply_telegram_links IS
  'Telegram ↔ KARTO: одна строка на пользователя. notify_enabled=false — уведомления выключены. Нет строки — Telegram не подключён.';

COMMENT ON TABLE public.auto_reply_telegram_review_messages IS
  'Карточки отзывов в Telegram (pending/sent). После подтверждения в TG статус sent и ответ в auto_reply_inbox_snapshots + auto_reply_history.';
