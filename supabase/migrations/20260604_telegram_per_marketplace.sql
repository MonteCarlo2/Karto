-- Telegram: включение/отключение отдельно для каждой площадки (WB / Ozon / Яндекс).
-- auto_reply_telegram_links — привязка аккаунта KARTO ↔ Telegram (одна на пользователя).

CREATE TABLE IF NOT EXISTS public.auto_reply_telegram_marketplaces (
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  shop_id TEXT NOT NULL DEFAULT 'main',
  marketplace_id TEXT NOT NULL,
  notify_enabled BOOLEAN NOT NULL DEFAULT true,
  enabled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, shop_id, marketplace_id),
  CONSTRAINT auto_reply_telegram_marketplaces_mp_chk
    CHECK (marketplace_id IN ('wildberries', 'ozon', 'yandex'))
);

CREATE INDEX IF NOT EXISTS auto_reply_telegram_marketplaces_user_idx
  ON public.auto_reply_telegram_marketplaces (user_id);

ALTER TABLE public.auto_reply_telegram_marketplaces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auto_reply_telegram_marketplaces_select_own"
  ON public.auto_reply_telegram_marketplaces FOR SELECT
  USING (auth.uid() = user_id);

ALTER TABLE public.auto_reply_telegram_link_tokens
  ADD COLUMN IF NOT EXISTS shop_id TEXT NOT NULL DEFAULT 'main',
  ADD COLUMN IF NOT EXISTS marketplace_id TEXT;

-- Уже привязанные пользователи: включить все три площадки (обратная совместимость).
INSERT INTO public.auto_reply_telegram_marketplaces (user_id, shop_id, marketplace_id, notify_enabled)
SELECT l.user_id, 'main', m.mp, true
FROM public.auto_reply_telegram_links l
CROSS JOIN (VALUES ('wildberries'), ('ozon'), ('yandex')) AS m(mp)
ON CONFLICT (user_id, shop_id, marketplace_id) DO NOTHING;

COMMENT ON TABLE public.auto_reply_telegram_marketplaces IS
  'Telegram-уведомления по площадкам: notify_enabled=false — отключено для этой площадки.';
