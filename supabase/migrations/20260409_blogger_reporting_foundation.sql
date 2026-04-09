-- База для отчётности по блогерам (полуавтомат):
-- 1) сохраняем метку блогера в signup_events (для регистраций),
-- 2) журналим успешные оплаты в influencer_payment_events,
-- 3) готовим view для ежедневного отчёта и KPI за 60 дней.

ALTER TABLE IF EXISTS public.signup_events
  ADD COLUMN IF NOT EXISTS blogger_code text,
  ADD COLUMN IF NOT EXISTS blogger_source text;

COMMENT ON COLUMN public.signup_events.blogger_code IS 'Код блогера из user_metadata (поле blogger_code)';
COMMENT ON COLUMN public.signup_events.blogger_source IS 'Источник блогера из user_metadata (поле blogger_source)';

UPDATE public.signup_events se
SET
  blogger_code = NULLIF(lower(trim(u.raw_user_meta_data->>'blogger_code')), ''),
  blogger_source = NULLIF(lower(trim(u.raw_user_meta_data->>'blogger_source')), '')
FROM auth.users u
WHERE u.id = se.user_id
  AND (se.blogger_code IS NULL OR se.blogger_source IS NULL);

CREATE OR REPLACE FUNCTION public.log_signup_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.signup_events (
    user_id,
    created_at,
    email_domain,
    auth_provider,
    blogger_code,
    blogger_source
  )
  VALUES (
    NEW.id,
    NEW.created_at,
    NULLIF(lower(split_part(NEW.email, '@', 2)), ''),
    COALESCE(
      NULLIF(trim(NEW.raw_user_meta_data->>'provider'), ''),
      NULLIF(trim(NEW.raw_app_meta_data->>'provider'), ''),
      'email'
    ),
    NULLIF(lower(trim(NEW.raw_user_meta_data->>'blogger_code')), ''),
    NULLIF(lower(trim(NEW.raw_user_meta_data->>'blogger_source')), '')
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.influencer_payment_events (
  payment_id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blogger_code text,
  blogger_source text,
  payment_kind text,
  amount_rub numeric(12, 2),
  paid_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.influencer_payment_events IS 'Успешные платежи для отчётности по блогерам (пишется из API payment/webhook и payment/confirm).';

CREATE INDEX IF NOT EXISTS idx_influencer_payment_events_blogger_paid_at
  ON public.influencer_payment_events (blogger_code, paid_at DESC);

CREATE INDEX IF NOT EXISTS idx_influencer_payment_events_user_paid_at
  ON public.influencer_payment_events (user_id, paid_at DESC);

ALTER TABLE public.influencer_payment_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'influencer_payment_events'
      AND policyname = 'influencer_payment_events_no_client_access'
  ) THEN
    CREATE POLICY influencer_payment_events_no_client_access
      ON public.influencer_payment_events
      FOR ALL
      USING (false)
      WITH CHECK (false);
  END IF;
END $$;

CREATE OR REPLACE VIEW public.influencer_daily_metrics AS
WITH signup_daily AS (
  SELECT
    (created_at AT TIME ZONE 'Europe/Moscow')::date AS day_moscow,
    lower(trim(blogger_code)) AS blogger_code,
    COUNT(*)::bigint AS registrations
  FROM public.signup_events
  WHERE blogger_code IS NOT NULL AND trim(blogger_code) <> ''
  GROUP BY 1, 2
),
payment_daily AS (
  SELECT
    (paid_at AT TIME ZONE 'Europe/Moscow')::date AS day_moscow,
    lower(trim(blogger_code)) AS blogger_code,
    COUNT(*)::bigint AS payments_count,
    COUNT(DISTINCT user_id)::bigint AS paid_users,
    COALESCE(SUM(amount_rub), 0)::numeric(12, 2) AS revenue_rub
  FROM public.influencer_payment_events
  WHERE blogger_code IS NOT NULL AND trim(blogger_code) <> ''
  GROUP BY 1, 2
)
SELECT
  COALESCE(s.day_moscow, p.day_moscow) AS day_moscow,
  COALESCE(s.blogger_code, p.blogger_code) AS blogger_code,
  COALESCE(s.registrations, 0)::bigint AS registrations,
  COALESCE(p.payments_count, 0)::bigint AS payments_count,
  COALESCE(p.paid_users, 0)::bigint AS paid_users,
  COALESCE(p.revenue_rub, 0)::numeric(12, 2) AS revenue_rub
FROM signup_daily s
FULL OUTER JOIN payment_daily p
  ON s.day_moscow = p.day_moscow
 AND s.blogger_code = p.blogger_code
ORDER BY day_moscow DESC, blogger_code ASC;

COMMENT ON VIEW public.influencer_daily_metrics IS 'Ежедневные метрики по блогерам: регистрации + платежи + выручка.';

CREATE OR REPLACE VIEW public.influencer_kpi_60d AS
WITH signup_60d AS (
  SELECT
    lower(trim(blogger_code)) AS blogger_code,
    COUNT(*)::bigint AS registrations_60d
  FROM public.signup_events
  WHERE blogger_code IS NOT NULL
    AND trim(blogger_code) <> ''
    AND created_at > now() - interval '60 days'
  GROUP BY 1
),
payments_60d AS (
  SELECT
    lower(trim(blogger_code)) AS blogger_code,
    COUNT(*)::bigint AS payments_60d,
    COUNT(DISTINCT user_id)::bigint AS paid_users_60d,
    COALESCE(SUM(amount_rub), 0)::numeric(12, 2) AS revenue_rub_60d
  FROM public.influencer_payment_events
  WHERE blogger_code IS NOT NULL
    AND trim(blogger_code) <> ''
    AND paid_at > now() - interval '60 days'
  GROUP BY 1
)
SELECT
  COALESCE(s.blogger_code, p.blogger_code) AS blogger_code,
  COALESCE(s.registrations_60d, 0)::bigint AS registrations_60d,
  COALESCE(p.payments_60d, 0)::bigint AS payments_60d,
  COALESCE(p.paid_users_60d, 0)::bigint AS paid_users_60d,
  COALESCE(p.revenue_rub_60d, 0)::numeric(12, 2) AS revenue_rub_60d
FROM signup_60d s
FULL OUTER JOIN payments_60d p ON p.blogger_code = s.blogger_code
ORDER BY revenue_rub_60d DESC, registrations_60d DESC;

COMMENT ON VIEW public.influencer_kpi_60d IS 'Сводка KPI по блогерам за последние 60 дней (без ручных охватов и стоимости интеграций).';

REVOKE ALL ON public.influencer_payment_events FROM anon, authenticated;
REVOKE ALL ON public.influencer_daily_metrics FROM anon, authenticated;
REVOKE ALL ON public.influencer_kpi_60d FROM anon, authenticated;
