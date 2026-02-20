-- =============================================================================
-- ОБЯЗАТЕЛЬНО: выполните этот скрипт в Supabase один раз.
-- Supabase Dashboard → SQL Editor → вставьте весь файл → Run.
-- Без этих таблиц оплата проходит в ЮKassa, но в аккаунт ничего не начисляется.
-- =============================================================================

-- 1) Таблица ожидающих платежей (при создании платежа сюда пишем, при возврате на сайт — читаем и начисляем)
CREATE TABLE IF NOT EXISTS pending_payment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  payment_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pending_payment_user_created ON pending_payment (user_id, created_at DESC);

-- 2) Таблица обработанных платежей (идемпотентность: один платёж начисляется только один раз)
CREATE TABLE IF NOT EXISTS payment_processed (
  payment_id TEXT PRIMARY KEY
);

-- 3) Включить RLS — доступ только с бэкенда (API с service role). Из браузера к таблицам доступа не будет.
ALTER TABLE pending_payment ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_processed ENABLE ROW LEVEL SECURITY;

-- Готово. После выполнения снова попробуйте оплату.
