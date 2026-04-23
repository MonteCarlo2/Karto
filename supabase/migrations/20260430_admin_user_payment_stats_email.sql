-- Колонка email в admin_user_payment_stats (из auth.users) для удобства в Table Editor.

CREATE OR REPLACE VIEW public.admin_user_payment_stats
WITH (security_invoker = true) AS
SELECT
  e.user_id,
  COUNT(*)::bigint AS successful_payment_count,
  COUNT(DISTINCT e.payment_kind)::bigint AS distinct_payment_kinds,
  MIN(e.paid_at) AS first_paid_at,
  MAX(e.paid_at) AS last_paid_at,
  COALESCE(SUM(e.amount_rub), 0)::numeric(14, 2) AS total_amount_rub,
  (COUNT(*) >= 2) AS is_repeat_buyer,
  MAX(u.email)::text AS email
FROM public.influencer_payment_events e
LEFT JOIN auth.users u ON u.id = e.user_id
GROUP BY e.user_id;

COMMENT ON VIEW public.admin_user_payment_stats IS
'Агрегаты успешных оплат по пользователю; email из auth.users. Повторные покупки: successful_payment_count >= 2.';
