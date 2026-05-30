-- Зашифрованные API-токены для фоновой синхронизации inbox (cron).

CREATE TABLE IF NOT EXISTS public.auto_reply_marketplace_secrets (
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  shop_id TEXT NOT NULL DEFAULT 'main',
  marketplace_id TEXT NOT NULL,
  api_key_ciphertext TEXT NOT NULL,
  client_id TEXT,
  campaign_id TEXT,
  business_id TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, shop_id, marketplace_id)
);

CREATE INDEX IF NOT EXISTS auto_reply_marketplace_secrets_user_idx
  ON public.auto_reply_marketplace_secrets (user_id);

ALTER TABLE public.auto_reply_marketplace_secrets ENABLE ROW LEVEL SECURITY;

-- Только service role (cron / API с service key). Клиент пишет через /api/auto-replies/secrets/sync.
