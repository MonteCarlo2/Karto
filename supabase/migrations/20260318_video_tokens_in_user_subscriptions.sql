-- Видео-кредиты в user_subscriptions (как поток и creative): одна строка на user с plan_type = 'video_tokens'.
-- plan_volume = текущий остаток токенов; video_tokens_spent = накопленно списано (аналитика).
-- Старую таблицу user_video_tokens переносим и удаляем.

ALTER TABLE user_subscriptions
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 1) Расширяем допустимые значения plan_type (снимаем старый CHECK, как он ни назывался)
DO $drop_plan_check$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'public.user_subscriptions'::regclass
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) LIKE '%plan_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.user_subscriptions DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $drop_plan_check$;

ALTER TABLE user_subscriptions ADD CONSTRAINT user_subscriptions_plan_type_check
  CHECK (plan_type IN ('flow', 'creative', 'video_tokens'));

-- 2) Счётчик списаний (используется только для строки video_tokens)
ALTER TABLE user_subscriptions
  ADD COLUMN IF NOT EXISTS video_tokens_spent BIGINT NOT NULL DEFAULT 0;

COMMENT ON COLUMN user_subscriptions.plan_volume IS 'flow/creative: лимит плана; video_tokens: остаток кредитов';
COMMENT ON COLUMN user_subscriptions.video_tokens_spent IS 'Только plan_type=video_tokens: всего списано токенов';

-- 3) Перенос из legacy user_video_tokens + удаление таблицы
DO $migrate$
BEGIN
  IF to_regclass('public.user_video_tokens') IS NOT NULL THEN
    INSERT INTO user_subscriptions (user_id, plan_type, plan_volume, period_start, flows_used, creative_used, video_tokens_spent)
    SELECT
      user_id,
      'video_tokens',
      GREATEST(0, balance)::bigint,
      NOW(),
      0,
      0,
      0
    FROM user_video_tokens
    ON CONFLICT (user_id, plan_type) DO UPDATE SET
      plan_volume = user_subscriptions.plan_volume + EXCLUDED.plan_volume;

    DROP TABLE public.user_video_tokens;
  END IF;
END $migrate$;

-- 4) RPC: атомарное списание (остаток в plan_volume, +spent)
CREATE OR REPLACE FUNCTION public.consume_user_video_tokens (p_user_id UUID, p_amount INTEGER)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN TRUE;
  END IF;

  INSERT INTO user_subscriptions (user_id, plan_type, plan_volume, period_start, flows_used, creative_used, video_tokens_spent)
  VALUES (p_user_id, 'video_tokens', 0, NOW(), 0, 0, 0)
  ON CONFLICT (user_id, plan_type) DO NOTHING;

  UPDATE user_subscriptions
  SET
    plan_volume = plan_volume - p_amount,
    video_tokens_spent = video_tokens_spent + p_amount,
    updated_at = NOW()
  WHERE
    user_id = p_user_id
    AND plan_type = 'video_tokens'
    AND plan_volume >= p_amount;

  RETURN FOUND;
END;
$$;

-- 5) RPC: начисление после оплаты
CREATE OR REPLACE FUNCTION public.add_user_video_tokens (p_user_id UUID, p_amount INTEGER)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN;
  END IF;

  INSERT INTO user_subscriptions (user_id, plan_type, plan_volume, period_start, flows_used, creative_used, video_tokens_spent)
  VALUES (p_user_id, 'video_tokens', p_amount, NOW(), 0, 0, 0)
  ON CONFLICT (user_id, plan_type) DO UPDATE SET
    plan_volume = user_subscriptions.plan_volume + EXCLUDED.plan_volume,
    updated_at = NOW();
END;
$$;

REVOKE ALL ON FUNCTION public.consume_user_video_tokens (UUID, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.add_user_video_tokens (UUID, INTEGER) FROM PUBLIC;
