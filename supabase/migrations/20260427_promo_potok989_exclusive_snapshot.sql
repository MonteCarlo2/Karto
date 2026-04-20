-- Эксклюзив ПОТОК989: только пользователи, зарегистрированные на момент применения миграции.
-- Новые регистрации не попадают в promo_campaign_recipients → промокод им недоступен.
-- Письма по API admin: для ограниченных кампаний — всем из снимка с валидным email (без фильтра opted_in).

UPDATE public.promo_campaigns c
SET restrict_to_recipients = true,
    internal_note = 'Акция: 5 потоков 1190→989 ₽; эксклюзив — снимок получателей на дату миграции'
WHERE upper(c.code) = upper('ПОТОК989');

INSERT INTO public.promo_campaign_recipients (campaign_id, user_id)
SELECT c.id, u.id
FROM auth.users u
CROSS JOIN LATERAL (
  SELECT id
  FROM public.promo_campaigns
  WHERE upper(code) = upper('ПОТОК989')
  LIMIT 1
) c
ON CONFLICT (campaign_id, user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.admin_promo_recipient_emails_opted_in(p_campaign_id uuid)
RETURNS TABLE (email text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = auth, public
AS $$
  SELECT u.email::text AS email
  FROM auth.users u
  JOIN public.promo_campaigns c ON c.id = p_campaign_id
  JOIN public.promo_campaign_recipients r ON r.campaign_id = c.id AND r.user_id = u.id
  WHERE c.restrict_to_recipients
    AND u.email IS NOT NULL
    AND length(trim(u.email)) > 3
  UNION
  SELECT u.email::text AS email
  FROM auth.users u
  JOIN public.email_marketing_consent e ON e.user_id = u.id AND e.opted_in = true
  JOIN public.promo_campaigns c ON c.id = p_campaign_id
  WHERE NOT c.restrict_to_recipients
    AND u.email IS NOT NULL
    AND length(trim(u.email)) > 3;
$$;

COMMENT ON FUNCTION public.admin_promo_recipient_emails_opted_in(uuid) IS
'Email для рассылки: restrict_to_recipients — все email из снимка получателей; иначе — все с opted_in.';

REVOKE ALL ON FUNCTION public.admin_promo_recipient_emails_opted_in(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_promo_recipient_emails_opted_in(uuid) TO service_role;
