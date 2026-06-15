ALTER TABLE public.auto_reply_telegram_review_messages
  ADD COLUMN IF NOT EXISTS has_photo BOOLEAN NOT NULL DEFAULT false;
