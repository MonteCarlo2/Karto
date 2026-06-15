-- Telegram: полуавтомат — уведомления, подтверждение, синхронизация с karto.pro

CREATE TABLE IF NOT EXISTS public.auto_reply_telegram_links (
  user_id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  telegram_user_id BIGINT NOT NULL,
  chat_id BIGINT NOT NULL,
  username TEXT,
  first_name TEXT,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notify_enabled BOOLEAN NOT NULL DEFAULT true
);

CREATE UNIQUE INDEX IF NOT EXISTS auto_reply_telegram_links_tg_user_idx
  ON public.auto_reply_telegram_links (telegram_user_id);

CREATE TABLE IF NOT EXISTS public.auto_reply_telegram_link_tokens (
  token TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS auto_reply_telegram_link_tokens_user_idx
  ON public.auto_reply_telegram_link_tokens (user_id, expires_at DESC);

CREATE TABLE IF NOT EXISTS public.auto_reply_telegram_verify_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  telegram_user_id BIGINT NOT NULL,
  chat_id BIGINT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS auto_reply_telegram_verify_codes_email_idx
  ON public.auto_reply_telegram_verify_codes (lower(email), created_at DESC);

CREATE TABLE IF NOT EXISTS public.auto_reply_telegram_review_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  shop_id TEXT NOT NULL DEFAULT 'main',
  marketplace_id TEXT NOT NULL,
  review_id TEXT NOT NULL,
  telegram_message_id BIGINT NOT NULL,
  chat_id BIGINT NOT NULL,
  reply_draft TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  notified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  CONSTRAINT auto_reply_telegram_review_messages_status_chk
    CHECK (status IN ('pending', 'sent', 'cancelled'))
);

CREATE UNIQUE INDEX IF NOT EXISTS auto_reply_telegram_review_messages_review_uq
  ON public.auto_reply_telegram_review_messages (user_id, shop_id, marketplace_id, review_id);

CREATE INDEX IF NOT EXISTS auto_reply_telegram_review_messages_pending_idx
  ON public.auto_reply_telegram_review_messages (user_id, status)
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS public.auto_reply_telegram_sessions (
  telegram_user_id BIGINT PRIMARY KEY,
  chat_id BIGINT NOT NULL,
  state TEXT NOT NULL DEFAULT 'idle',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.auto_reply_telegram_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auto_reply_telegram_link_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auto_reply_telegram_verify_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auto_reply_telegram_review_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auto_reply_telegram_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auto_reply_telegram_links_select_own"
  ON public.auto_reply_telegram_links FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "auto_reply_telegram_links_delete_own"
  ON public.auto_reply_telegram_links FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "auto_reply_telegram_review_messages_select_own"
  ON public.auto_reply_telegram_review_messages FOR SELECT
  USING (auth.uid() = user_id);
