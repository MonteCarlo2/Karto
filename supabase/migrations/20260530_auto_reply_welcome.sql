-- Пробные 30 ответов (без срока) + списание: сначала welcome, затем оплаченный месячный пакет.
-- Баланс и ручное начисление — в user_subscriptions (plan_type = auto_replies).

ALTER TABLE public.user_subscriptions
  ADD COLUMN IF NOT EXISTS auto_reply_welcome_remaining INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.user_subscriptions.auto_reply_welcome_remaining IS
  'Бесплатные пробные ответы (без срока). plan_volume — оплаченный месячный остаток.';

CREATE TABLE IF NOT EXISTS public.auto_reply_welcome_grants (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.auto_reply_welcome_grants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS auto_reply_welcome_grants_select_own ON public.auto_reply_welcome_grants;
CREATE POLICY auto_reply_welcome_grants_select_own ON public.auto_reply_welcome_grants
  FOR SELECT USING (auth.uid() = user_id);

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
