-- =============================================================================
-- Отзывы (auto_replies): схема + ручное начисление себе для теста
-- Supabase → SQL Editor → выполнить целиком
--
-- ВАЖНО: UPDATE ... WHERE plan_type = 'auto_replies' НЕ создаёт строку.
-- Если в Table Editor нет строки auto_replies — нужен INSERT (ниже).
-- =============================================================================

-- 1) Разрешить plan_type = auto_replies
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'user_subscriptions'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) LIKE '%plan_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.user_subscriptions DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.user_subscriptions
  ADD CONSTRAINT user_subscriptions_plan_type_check
  CHECK (plan_type IN ('flow', 'creative', 'video_tokens', 'auto_replies'));

-- 2) Колонка бесплатных пробных ответов (без срока)
ALTER TABLE public.user_subscriptions
  ADD COLUMN IF NOT EXISTS auto_reply_welcome_remaining INTEGER NOT NULL DEFAULT 0;

-- 3) Флаг «30 бесплатных уже выданы» (для мастера)
CREATE TABLE IF NOT EXISTS public.auto_reply_welcome_grants (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4) RPC списания (сначала welcome, потом оплаченный пакет)
CREATE OR REPLACE FUNCTION public.consume_auto_reply_credits (p_user_id UUID, p_amount INTEGER)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  w INT;
  p INT;
  ps TIMESTAMPTZ;
  paid_available INT;
  total INT;
  deduct_welcome INT;
  deduct_paid INT;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN TRUE;
  END IF;

  SELECT
    COALESCE(auto_reply_welcome_remaining, 0),
    COALESCE(plan_volume, 0),
    period_start
  INTO w, p, ps
  FROM user_subscriptions
  WHERE user_id = p_user_id AND plan_type = 'auto_replies'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  paid_available := CASE
    WHEN ps IS NOT NULL AND ps + INTERVAL '30 days' > NOW() THEN p
    ELSE 0
  END;

  total := w + paid_available;
  IF total < p_amount THEN
    RETURN FALSE;
  END IF;

  deduct_welcome := LEAST(w, p_amount);
  deduct_paid := p_amount - deduct_welcome;

  UPDATE user_subscriptions
  SET
    auto_reply_welcome_remaining = auto_reply_welcome_remaining - deduct_welcome,
    plan_volume = plan_volume - deduct_paid,
    updated_at = NOW()
  WHERE user_id = p_user_id AND plan_type = 'auto_replies';

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_auto_reply_credits (UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_auto_reply_credits (UUID, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_auto_reply_credits (UUID, INTEGER) TO postgres;

-- =============================================================================
-- 5) НАЧИСЛЕНИЕ: подставь свой полный UUID (36 символов, без …)
-- =============================================================================

INSERT INTO public.user_subscriptions (
  user_id,
  plan_type,
  plan_volume,
  auto_reply_welcome_remaining,
  period_start,
  flows_used,
  creative_used,
  video_tokens_spent,
  video_tokens_lifetime_purchased
)
VALUES (
  '3928e290-6f1d-4b6b-8e78-d4342b1dcdcf'::uuid,  -- ← замени на свой user_id
  'auto_replies',
  100,   -- оплаченный месячный остаток
  30,    -- бесплатные пробные (без срока); 0 если не нужны
  NOW(), -- начало месячного периода для plan_volume
  0,
  0,
  0,
  0
)
ON CONFLICT (user_id, plan_type) DO UPDATE SET
  plan_volume = EXCLUDED.plan_volume,
  auto_reply_welcome_remaining = EXCLUDED.auto_reply_welcome_remaining,
  period_start = EXCLUDED.period_start,
  updated_at = NOW();

-- 6) Проверка: должна появиться 4-я строка plan_type = auto_replies
SELECT
  plan_type,
  plan_volume AS paid_remaining,
  auto_reply_welcome_remaining AS welcome_remaining,
  period_start
FROM public.user_subscriptions
WHERE user_id = '3928e290-6f1d-4b6b-8e78-d4342b1dcdcf'::uuid
ORDER BY plan_type;
