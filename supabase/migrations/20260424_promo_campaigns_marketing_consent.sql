-- Промокоды (скидка на оплату ЮKassa), согласие на email-рассылку (отдельно от ПДн),
-- получатели кампании (кто может применить код), учёт одноразового использования.

-- Согласие на рассылку предложений (152-ФЗ: отдельное согласие)
CREATE TABLE IF NOT EXISTS public.email_marketing_consent (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  opted_in boolean NOT NULL DEFAULT false,
  opted_in_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.email_marketing_consent IS
'Согласие на email-рассылку деловых предложений KARTO. Заполняется при регистрации и может обновляться сервером.';

ALTER TABLE public.email_marketing_consent ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "email_marketing_consent_no_client" ON public.email_marketing_consent;
CREATE POLICY "email_marketing_consent_no_client"
  ON public.email_marketing_consent
  FOR ALL
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE public.email_marketing_consent FROM PUBLIC;
GRANT ALL ON TABLE public.email_marketing_consent TO service_role;

-- Кампания промокода: один код, скидка %, тип оплаты, опционально список индексов тарифа (0,1,2)
CREATE TABLE IF NOT EXISTS public.promo_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  discount_percent integer NOT NULL CHECK (discount_percent >= 1 AND discount_percent <= 90),
  payment_kind text NOT NULL CHECK (payment_kind IN ('flow', 'creative', 'video_tokens')),
  tariff_indices integer[] NULL,
  restrict_to_recipients boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz NULL,
  internal_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.promo_campaigns IS
'Промокоды для ЮKassa: payment_kind + tariff_indices (NULL = любой индекс). restrict_to_recipients: только из promo_campaign_recipients.';

CREATE UNIQUE INDEX IF NOT EXISTS promo_campaigns_code_upper ON public.promo_campaigns (upper(code));

ALTER TABLE public.promo_campaigns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "promo_campaigns_no_client" ON public.promo_campaigns;
CREATE POLICY "promo_campaigns_no_client"
  ON public.promo_campaigns FOR ALL USING (false) WITH CHECK (false);
REVOKE ALL ON TABLE public.promo_campaigns FROM PUBLIC;
GRANT ALL ON TABLE public.promo_campaigns TO service_role;

CREATE TABLE IF NOT EXISTS public.promo_campaign_recipients (
  campaign_id uuid NOT NULL REFERENCES public.promo_campaigns (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_promo_recipients_user ON public.promo_campaign_recipients (user_id);

ALTER TABLE public.promo_campaign_recipients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "promo_campaign_recipients_no_client" ON public.promo_campaign_recipients;
CREATE POLICY "promo_campaign_recipients_no_client"
  ON public.promo_campaign_recipients FOR ALL USING (false) WITH CHECK (false);
REVOKE ALL ON TABLE public.promo_campaign_recipients FROM PUBLIC;
GRANT ALL ON TABLE public.promo_campaign_recipients TO service_role;

CREATE TABLE IF NOT EXISTS public.promo_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.promo_campaigns (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  payment_id text NOT NULL,
  amount_paid_rub numeric NOT NULL,
  original_price_rub numeric NOT NULL,
  discount_percent integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, user_id)
);

ALTER TABLE public.promo_redemptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "promo_redemptions_no_client" ON public.promo_redemptions;
CREATE POLICY "promo_redemptions_no_client"
  ON public.promo_redemptions FOR ALL USING (false) WITH CHECK (false);
REVOKE ALL ON TABLE public.promo_redemptions FROM PUBLIC;
GRANT ALL ON TABLE public.promo_redemptions TO service_role;

-- In-app уведомление только получателям кампании
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
BEGIN
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
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_notify_promo_campaign_recipients(uuid, text, text, text[], text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_notify_promo_campaign_recipients(uuid, text, text, text[], text, boolean) TO service_role;

-- Email-адреса получателей кампании с согласием на рассылку (для серверной рассылки SMTP)
CREATE OR REPLACE FUNCTION public.admin_promo_recipient_emails_opted_in(p_campaign_id uuid)
RETURNS TABLE (email text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = auth, public
AS $$
  SELECT u.email::text AS email
  FROM public.promo_campaign_recipients r
  JOIN auth.users u ON u.id = r.user_id
  JOIN public.email_marketing_consent e ON e.user_id = r.user_id AND e.opted_in = true
  WHERE r.campaign_id = p_campaign_id
    AND u.email IS NOT NULL
    AND length(trim(u.email)) > 3;
$$;

REVOKE ALL ON FUNCTION public.admin_promo_recipient_emails_opted_in(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_promo_recipient_emails_opted_in(uuid) TO service_role;
