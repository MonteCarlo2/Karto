-- Расширение статистики: итог «всего пользователей», накопитель по дням, детали в signup_events.
-- Выполнить в Supabase после 20260405_signup_events_log.sql

ALTER TABLE public.signup_events
  ADD COLUMN IF NOT EXISTS email_domain text,
  ADD COLUMN IF NOT EXISTS auth_provider text;

COMMENT ON COLUMN public.signup_events.email_domain IS 'Домен почты (без @), для разреза по почтовикам';
COMMENT ON COLUMN public.signup_events.auth_provider IS 'Источник: email, yandex и т.д. из user/app metadata';

UPDATE public.signup_events se
SET
  email_domain = NULLIF(lower(split_part(u.email, '@', 2)), ''),
  auth_provider = COALESCE(
    NULLIF(trim(u.raw_user_meta_data->>'provider'), ''),
    NULLIF(trim(u.raw_app_meta_data->>'provider'), ''),
    'email'
  )
FROM auth.users u
WHERE u.id = se.user_id
  AND (se.email_domain IS NULL OR se.auth_provider IS NULL);

CREATE OR REPLACE FUNCTION public.log_signup_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.signup_events (user_id, created_at, email_domain, auth_provider)
  VALUES (
    NEW.id,
    NEW.created_at,
    NULLIF(lower(split_part(NEW.email, '@', 2)), ''),
    COALESCE(
      NULLIF(trim(NEW.raw_user_meta_data->>'provider'), ''),
      NULLIF(trim(NEW.raw_app_meta_data->>'provider'), ''),
      'email'
    )
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Одна строка: общие цифры «прямо сейчас» (обновляются при каждом открытии/рефреше в Table Editor)
CREATE OR REPLACE VIEW public.signup_stats_summary AS
SELECT
  (SELECT COUNT(*)::bigint FROM auth.users) AS total_users_now,
  (SELECT COUNT(*)::bigint FROM public.signup_events) AS tracked_in_signup_log,
  (
    SELECT COUNT(*)::bigint
    FROM auth.users
    WHERE (created_at AT TIME ZONE 'Europe/Moscow')::date
      = (NOW() AT TIME ZONE 'Europe/Moscow')::date
  ) AS new_today_moscow,
  (
    SELECT COUNT(*)::bigint
    FROM auth.users
    WHERE created_at >= (NOW() AT TIME ZONE 'UTC') - interval '7 days'
  ) AS new_last_7_days_utc,
  (
    SELECT COUNT(*)::bigint
    FROM auth.users
    WHERE created_at >= (NOW() AT TIME ZONE 'UTC') - interval '30 days'
  ) AS new_last_30_days_utc,
  (NOW() AT TIME ZONE 'Europe/Moscow') AS snapshot_moscow_time;

COMMENT ON VIEW public.signup_stats_summary IS 'Сводка в одну строку: открыть в Table Editor → Views. Обновление = нажать Refresh (или включить Realtime на таблице signup_events).';

-- По дням: новые за день + накопительно с начала учёта + колонка «всего в auth сейчас» на каждой строке
CREATE OR REPLACE VIEW public.signup_events_by_day AS
WITH daily AS (
  SELECT
    (created_at AT TIME ZONE 'Europe/Moscow')::date AS day_moscow,
    COUNT(*)::bigint AS new_users
  FROM public.signup_events
  GROUP BY 1
),
tot AS (
  SELECT COUNT(*)::bigint AS n FROM auth.users
)
SELECT
  d.day_moscow,
  d.new_users,
  SUM(d.new_users) OVER (
    ORDER BY d.day_moscow ASC
    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
  ) AS signups_cumulative_to_this_day,
  (SELECT n FROM tot) AS total_users_in_auth_now
FROM daily d
ORDER BY d.day_moscow DESC;

COMMENT ON VIEW public.signup_events_by_day IS 'По дням (МСК): новые, накопительно с первого дня в логе, и всего пользователей в Authentication на момент запроса.';

-- Разрез: день × способ входа
CREATE OR REPLACE VIEW public.signup_events_by_day_provider AS
SELECT
  (created_at AT TIME ZONE 'Europe/Moscow')::date AS day_moscow,
  COALESCE(auth_provider, 'email') AS auth_provider,
  COUNT(*)::bigint AS new_users
FROM public.signup_events
GROUP BY 1, 2
ORDER BY 1 DESC, 3 DESC;

COMMENT ON VIEW public.signup_events_by_day_provider IS 'Сколько новых регистраций за день по способу входа (email / yandex / …).';

REVOKE ALL ON TABLE public.signup_events FROM anon, authenticated;
REVOKE ALL ON public.signup_events_by_day FROM anon, authenticated;
REVOKE ALL ON public.signup_stats_summary FROM anon, authenticated;
REVOKE ALL ON public.signup_events_by_day_provider FROM anon, authenticated;
