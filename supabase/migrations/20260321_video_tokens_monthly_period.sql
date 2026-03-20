-- Видео-кредиты: тот же 30-дневный цикл, что у потока и creative (с period_start).
-- При новой покупке пакета обновляем period_start — период продлевается.
-- Списание только пока period_start + 30 дней не истёк.

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
    period_start = NOW(),
    updated_at = NOW();
END;
$$;

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
    AND plan_volume >= p_amount
    AND period_start + INTERVAL '30 days' > NOW();

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_user_video_tokens (UUID, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.add_user_video_tokens (UUID, INTEGER) FROM PUBLIC;

COMMENT ON COLUMN public.user_subscriptions.period_start IS
  'Начало текущего 30-дневного периода плана; для video_tokens обновляется при покупке пакета';
