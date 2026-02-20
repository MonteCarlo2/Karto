-- Ожидающие оплаты: при создании платежа в ЮKassa пишем сюда (user_id, payment_id).
-- При возврате на сайт подтверждаем этот платёж через API ЮKassa и обновляем user_subscriptions.
-- Вся логика только через Supabase, без localStorage.

CREATE TABLE IF NOT EXISTS pending_payment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  payment_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pending_payment_user_created ON pending_payment (user_id, created_at DESC);

COMMENT ON TABLE pending_payment IS 'Платёж ЮKassa, ожидающий подтверждения после возврата пользователя на сайт.';
