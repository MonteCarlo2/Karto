-- Опционально: добавить updated_at в user_subscriptions (для совместимости с кодом, который может использовать эту колонку позже).
-- Выполнять в Supabase SQL Editor только если колонки ещё нет.
ALTER TABLE user_subscriptions
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
