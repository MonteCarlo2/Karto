ALTER TABLE public.auto_reply_telegram_review_messages
  ADD COLUMN IF NOT EXISTS extra_message_ids BIGINT[] NOT NULL DEFAULT '{}';
