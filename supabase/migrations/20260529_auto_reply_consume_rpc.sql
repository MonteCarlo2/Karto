-- Списание ответов на отзывы (plan_type = auto_replies), только в активном 30-дневном периоде.

CREATE OR REPLACE FUNCTION public.consume_auto_reply_credits (p_user_id UUID, p_amount INTEGER)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN TRUE;
  END IF;

  UPDATE user_subscriptions
  SET
    plan_volume = plan_volume - p_amount,
    updated_at = NOW()
  WHERE
    user_id = p_user_id
    AND plan_type = 'auto_replies'
    AND plan_volume >= p_amount
    AND period_start + INTERVAL '30 days' > NOW();

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_auto_reply_credits (UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_auto_reply_credits (UUID, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_auto_reply_credits (UUID, INTEGER) TO postgres;
