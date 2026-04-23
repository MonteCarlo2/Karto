-- Аналитика успешных оплат и повторных покупок (LTV).
-- Источник правды: public.influencer_payment_events — журнал каждой УСПЕШНОЙ оплаты (webhook/confirm).
-- pending_payment — только попытки/создание платежа, не использовать как «факт покупки».

COMMENT ON TABLE public.influencer_payment_events IS
'Успешные платежи ЮKassa: user_id, вид услуги, сумма. Используется для отчётов по блогерам, повторных покупок и LTV.';

ALTER TABLE public.influencer_payment_events
  ADD COLUMN IF NOT EXISTS tariff_index smallint NULL;

COMMENT ON COLUMN public.influencer_payment_events.tariff_index IS
'Индекс тарифа из metadata ЮKassa (0..2 для потоков/творчества, пакет видео и т.д.).';

-- История: платежи, которые попали в payment_processed и есть в pending_payment, но ещё не в журнале
-- (например, до внедрения influencer_payment_events). kind/sum/tariff могут быть NULL.
INSERT INTO public.influencer_payment_events (
  payment_id,
  user_id,
  blogger_code,
  blogger_source,
  payment_kind,
  amount_rub,
  tariff_index,
  paid_at
)
SELECT DISTINCT ON (pr.payment_id)
  pr.payment_id,
  pp.user_id,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  pp.created_at
FROM public.payment_processed pr
INNER JOIN public.pending_payment pp ON pp.payment_id = pr.payment_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.influencer_payment_events e WHERE e.payment_id = pr.payment_id
)
ORDER BY pr.payment_id, pp.created_at ASC;

-- По одному пользователю: сколько успешных оплат, первая/последняя, сумма, флаг «повторный покупатель»
CREATE OR REPLACE VIEW public.admin_user_payment_stats
WITH (security_invoker = true) AS
SELECT
  user_id,
  COUNT(*)::bigint AS successful_payment_count,
  COUNT(DISTINCT payment_kind)::bigint AS distinct_payment_kinds,
  MIN(paid_at) AS first_paid_at,
  MAX(paid_at) AS last_paid_at,
  COALESCE(SUM(amount_rub), 0)::numeric(14, 2) AS total_amount_rub,
  (COUNT(*) >= 2) AS is_repeat_buyer
FROM public.influencer_payment_events
GROUP BY user_id;

COMMENT ON VIEW public.admin_user_payment_stats IS
'Агрегаты успешных оплат по пользователю (повторные покупки = successful_payment_count >= 2).';

-- Сводка для дашборда
CREATE OR REPLACE VIEW public.admin_repeat_purchase_kpis
WITH (security_invoker = true) AS
SELECT
  COUNT(*)::bigint AS payers_count,
  COUNT(*) FILTER (WHERE is_repeat_buyer)::bigint AS repeat_payers_count,
  COALESCE(SUM(successful_payment_count), 0)::bigint AS total_successful_checkouts,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE is_repeat_buyer)::numeric
    / NULLIF(COUNT(*)::numeric, 0),
    2
  ) AS repeat_payer_pct
FROM public.admin_user_payment_stats;

COMMENT ON VIEW public.admin_repeat_purchase_kpis IS
'KPI: число платящих, число с 2+ оплатами, доля «повторников».';

REVOKE ALL ON TABLE public.admin_user_payment_stats FROM PUBLIC;
REVOKE ALL ON TABLE public.admin_user_payment_stats FROM anon, authenticated;
GRANT SELECT ON TABLE public.admin_user_payment_stats TO service_role;

REVOKE ALL ON TABLE public.admin_repeat_purchase_kpis FROM PUBLIC;
REVOKE ALL ON TABLE public.admin_repeat_purchase_kpis FROM anon, authenticated;
GRANT SELECT ON TABLE public.admin_repeat_purchase_kpis TO service_role;

COMMENT ON TABLE public.pending_payment IS
'Созданный в ЮKassa платёж до подтверждения. Не все строки завершаются успехом — для факта покупки см. influencer_payment_events.';
