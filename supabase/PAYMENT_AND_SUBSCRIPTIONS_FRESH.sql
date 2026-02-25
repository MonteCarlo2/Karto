-- =============================================================================
-- Подписки и оплата: один скрипт «с нуля».
-- Если удаляешь таблицы: сначала DROP TABLE IF EXISTS payment_processed; DROP TABLE IF EXISTS pending_payment;
-- (user_subscriptions можно не трогать, если нужны старые данные; тогда не выполняй блок 1 ниже.)
-- Выполни в Supabase → SQL Editor целиком.
-- =============================================================================

-- 1) Подписки пользователей (потоки + генерации). Одна строка на (user_id, plan_type).
CREATE TABLE IF NOT EXISTS user_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_type TEXT NOT NULL CHECK (plan_type IN ('flow', 'creative')),
  plan_volume INT NOT NULL DEFAULT 0,
  period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  flows_used INT NOT NULL DEFAULT 0,
  creative_used INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, plan_type)
);

-- 2) Ожидающие платежи (при создании платежа в ЮKassa сюда пишем; при возврате — читаем).
CREATE TABLE IF NOT EXISTS pending_payment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  payment_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pending_payment_user_created ON pending_payment (user_id, created_at DESC);

-- 3) Обработанные платежи (идемпотентность: один платёж начисляется один раз).
CREATE TABLE IF NOT EXISTS payment_processed (
  payment_id TEXT PRIMARY KEY
);

-- 4) RLS: доступ только с бэкенда (service role).
ALTER TABLE pending_payment ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_processed ENABLE ROW LEVEL SECURITY;
-- user_subscriptions: RLS по желанию; если включишь — нужны политики для сервиса.

-- Готово. Дальше: вебхук https://karto.pro/api/payment/webhook, событие payment.succeeded.
