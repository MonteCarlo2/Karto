-- Аналог «размер пакета» для видео: сколько токенов всего начислено покупками.
-- Для plan_type = video_tokens:
--   plan_volume = текущий остаток
--   video_tokens_spent = всего списано
--   video_tokens_lifetime_purchased = сумма всех пополнений (покупок)

ALTER TABLE public.user_subscriptions
  ADD COLUMN IF NOT EXISTS video_tokens_lifetime_purchased BIGINT NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.user_subscriptions.video_tokens_lifetime_purchased IS
  'Только plan_type=video_tokens: сумма токенов, начисленных за всё время покупками';

-- Восстановить для существующих строк: остаток + списанное ≈ всё, что когда-либо было начислено
UPDATE public.user_subscriptions
SET video_tokens_lifetime_purchased = GREATEST(
  0,
  COALESCE(plan_volume, 0)::bigint + COALESCE(video_tokens_spent, 0)::bigint
)
WHERE plan_type = 'video_tokens';

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

  INSERT INTO user_subscriptions (
    user_id,
    plan_type,
    plan_volume,
    period_start,
    flows_used,
    creative_used,
    video_tokens_spent,
    video_tokens_lifetime_purchased
  )
  VALUES (p_user_id, 'video_tokens', p_amount, NOW(), 0, 0, 0, p_amount::bigint)
  ON CONFLICT (user_id, plan_type) DO UPDATE SET
    plan_volume = user_subscriptions.plan_volume + EXCLUDED.plan_volume,
    video_tokens_lifetime_purchased =
      user_subscriptions.video_tokens_lifetime_purchased + EXCLUDED.plan_volume,
    updated_at = NOW();
END;
$$;

REVOKE ALL ON FUNCTION public.add_user_video_tokens (UUID, INTEGER) FROM PUBLIC;
