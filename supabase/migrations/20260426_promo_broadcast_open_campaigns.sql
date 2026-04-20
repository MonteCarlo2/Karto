-- Рассылка для «открытых» кампаний (restrict_to_recipients = false):
-- in-app и email-список включают всех пользователей с opted_in в email_marketing_consent.
-- Для ограниченных кампаний поведение прежнее (только promo_campaign_recipients).
-- В функции ниже переменная называется restrict_recipients, не v_restrict — иначе SQL Editor
-- Supabase показывает ложное предупреждение «New table will not have RLS».

CREATE OR REPLACE FUNCTION public.admin_notify_promo_campaign_recipients(
  p_campaign_id uuid,
  p_title text,
  p_body text,
  p_image_urls text[] DEFAULT '{}',
  p_link_url text DEFAULT NULL,
  p_replies_enabled boolean DEFAULT false
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
DECLARE
  n bigint;
  restrict_recipients boolean;
BEGIN
  SELECT c.restrict_to_recipients INTO restrict_recipients
  FROM public.promo_campaigns c
  WHERE c.id = p_campaign_id;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  IF restrict_recipients THEN
    INSERT INTO public.user_notifications (
      user_id,
      title,
      body,
      image_urls,
      link_url,
      category,
      replies_enabled
    )
    SELECT
      r.user_id,
      trim(p_title),
      trim(p_body),
      COALESCE(p_image_urls, '{}'),
      NULLIF(trim(p_link_url), ''),
      'promo',
      COALESCE(p_replies_enabled, false)
    FROM public.promo_campaign_recipients r
    WHERE r.campaign_id = p_campaign_id;
  ELSE
    INSERT INTO public.user_notifications (
      user_id,
      title,
      body,
      image_urls,
      link_url,
      category,
      replies_enabled
    )
    SELECT
      e.user_id,
      trim(p_title),
      trim(p_body),
      COALESCE(p_image_urls, '{}'),
      NULLIF(trim(p_link_url), ''),
      'promo',
      COALESCE(p_replies_enabled, false)
    FROM public.email_marketing_consent e
    WHERE e.opted_in = true;
  END IF;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_promo_recipient_emails_opted_in(p_campaign_id uuid)
RETURNS TABLE (email text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = auth, public
AS $$
  SELECT u.email::text AS email
  FROM auth.users u
  JOIN public.email_marketing_consent e ON e.user_id = u.id AND e.opted_in = true
  JOIN public.promo_campaigns c ON c.id = p_campaign_id
  WHERE u.email IS NOT NULL
    AND length(trim(u.email)) > 3
    AND (
      (
        c.restrict_to_recipients
        AND EXISTS (
          SELECT 1
          FROM public.promo_campaign_recipients r
          WHERE r.campaign_id = c.id
            AND r.user_id = u.id
        )
      )
      OR (NOT c.restrict_to_recipients)
    );
$$;
