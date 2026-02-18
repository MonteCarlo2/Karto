-- Разрешить у одного пользователя и Поток, и Свободное творчество одновременно.
-- Было: UNIQUE(user_id) — одна запись на пользователя.
-- Стало: UNIQUE(user_id, plan_type) — до двух записей: одна flow, одна creative.
-- Выполнить в Supabase Dashboard → SQL Editor.

ALTER TABLE user_subscriptions
  DROP CONSTRAINT IF EXISTS user_subscriptions_user_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS user_subscriptions_user_id_plan_type_key
  ON user_subscriptions (user_id, plan_type);
