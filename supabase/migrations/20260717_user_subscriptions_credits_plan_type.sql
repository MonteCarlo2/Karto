-- Единый кошелёк «Кредиты»: plan_type = 'credits' (вместо legacy 'video_tokens').
-- RPC add/consume остаются с прежними именами для совместимости кода.

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

ALTER TABLE public.user_subscriptions ADD CONSTRAINT user_subscriptions_plan_type_check
  CHECK (plan_type = ANY (ARRAY[
    'flow'::text,
    'creative'::text,
    'video_tokens'::text,
    'credits'::text,
    'auto_replies'::text,
    'demo_flow'::text
  ]));

-- Слияние legacy video_tokens → credits (если обе строки — суммируем остаток).
INSERT INTO public.user_subscriptions (
  user_id,
  plan_type,
  plan_volume,
  period_start,
  flows_used,
  creative_used,
  video_tokens_spent,
  video_tokens_lifetime_purchased
)
SELECT
  user_id,
  'credits',
  plan_volume,
  period_start,
  0,
  0,
  COALESCE(video_tokens_spent, 0),
  COALESCE(video_tokens_lifetime_purchased, 0)
FROM public.user_subscriptions
WHERE plan_type = 'video_tokens'
ON CONFLICT (user_id, plan_type) DO UPDATE SET
  plan_volume = user_subscriptions.plan_volume + EXCLUDED.plan_volume,
  video_tokens_spent = user_subscriptions.video_tokens_spent + EXCLUDED.video_tokens_spent,
  video_tokens_lifetime_purchased = GREATEST(
    user_subscriptions.video_tokens_lifetime_purchased,
    EXCLUDED.video_tokens_lifetime_purchased
  ),
  period_start = GREATEST(user_subscriptions.period_start, EXCLUDED.period_start),
  updated_at = NOW();

DELETE FROM public.user_subscriptions WHERE plan_type = 'video_tokens';

COMMENT ON COLUMN public.user_subscriptions.plan_volume IS
  'flow/demo_flow: лимит потоков; credits: остаток кредитов; auto_replies: остаток ответов; creative — legacy, не используется';
COMMENT ON COLUMN public.user_subscriptions.video_tokens_spent IS
  'Только plan_type=credits: всего списано кредитов (историческое имя колонки)';
COMMENT ON COLUMN public.user_subscriptions.video_tokens_lifetime_purchased IS
  'Только plan_type=credits: всего начислено покупками';

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

  INSERT INTO user_subscriptions (
    user_id, plan_type, plan_volume, period_start, flows_used, creative_used, video_tokens_spent
  )
  VALUES (p_user_id, 'credits', 0, NOW(), 0, 0, 0)
  ON CONFLICT (user_id, plan_type) DO NOTHING;

  UPDATE user_subscriptions
  SET
    plan_volume = plan_volume - p_amount,
    video_tokens_spent = video_tokens_spent + p_amount,
    updated_at = NOW()
  WHERE
    user_id = p_user_id
    AND plan_type = 'credits'
    AND plan_volume >= p_amount;

  RETURN FOUND;
END;
$$;

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
    user_id, plan_type, plan_volume, period_start, flows_used, creative_used, video_tokens_spent
  )
  VALUES (p_user_id, 'credits', p_amount, NOW(), 0, 0, 0)
  ON CONFLICT (user_id, plan_type) DO UPDATE SET
    plan_volume = user_subscriptions.plan_volume + EXCLUDED.plan_volume,
    video_tokens_lifetime_purchased = COALESCE(user_subscriptions.video_tokens_lifetime_purchased, 0) + p_amount,
    period_start = NOW(),
    updated_at = NOW();
END;
$$;
