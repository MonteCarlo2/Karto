-- Сводка и помесячная/дневная динамика регистраций из auth.users.
-- Вызов только с service_role (серверное API), не для anon/authenticated.

CREATE OR REPLACE FUNCTION public.admin_user_stats_summary()
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = auth, public
AS $$
  SELECT json_build_object(
    'total', (SELECT COUNT(*)::bigint FROM auth.users),
    'today_utc', (
      SELECT COUNT(*)::bigint FROM auth.users
      WHERE (created_at AT TIME ZONE 'UTC')::date = (NOW() AT TIME ZONE 'UTC')::date
    ),
    'today_moscow', (
      SELECT COUNT(*)::bigint FROM auth.users
      WHERE (created_at AT TIME ZONE 'Europe/Moscow')::date = (NOW() AT TIME ZONE 'Europe/Moscow')::date
    ),
    'last_7_days', (
      SELECT COUNT(*)::bigint FROM auth.users
      WHERE created_at >= (NOW() AT TIME ZONE 'UTC') - interval '7 days'
    ),
    'last_30_days', (
      SELECT COUNT(*)::bigint FROM auth.users
      WHERE created_at >= (NOW() AT TIME ZONE 'UTC') - interval '30 days'
    ),
    'yesterday_utc', (
      SELECT COUNT(*)::bigint FROM auth.users
      WHERE (created_at AT TIME ZONE 'UTC')::date = (NOW() AT TIME ZONE 'UTC')::date - 1
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.admin_user_signups_daily(p_days int DEFAULT 30)
RETURNS TABLE(day date, new_users bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = auth, public
AS $$
  SELECT (created_at AT TIME ZONE 'UTC')::date AS day, COUNT(*)::bigint AS new_users
  FROM auth.users
  WHERE created_at >= (DATE_TRUNC('day', NOW() AT TIME ZONE 'UTC') - ((GREATEST(p_days, 1) - 1) || ' days')::interval)
  GROUP BY 1
  ORDER BY 1 ASC;
$$;

REVOKE ALL ON FUNCTION public.admin_user_stats_summary() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_user_signups_daily(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_user_stats_summary() TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_user_signups_daily(int) TO service_role;
