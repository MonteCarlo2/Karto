-- Ответы пользователей на отдельные уведомления (обратная связь).
-- replies_enabled задаётся при создании уведомления из админки.

ALTER TABLE public.user_notifications
  ADD COLUMN IF NOT EXISTS replies_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS user_reply_text text,
  ADD COLUMN IF NOT EXISTS user_replied_at timestamptz;

COMMENT ON COLUMN public.user_notifications.replies_enabled IS 'Если true — пользователь может один раз ответить из колокольчика.';
COMMENT ON COLUMN public.user_notifications.user_reply_text IS 'Текст ответа пользователя (один раз).';
COMMENT ON COLUMN public.user_notifications.user_replied_at IS 'Когда пользователь отправил ответ.';

-- Новая сигнатура рассылки (добавлен флаг ответов)
DROP FUNCTION IF EXISTS public.admin_notify_all_users(text, text, text[], text, text);

CREATE OR REPLACE FUNCTION public.admin_notify_all_users(
  p_title text,
  p_body text,
  p_image_urls text[] DEFAULT '{}',
  p_link_url text DEFAULT NULL,
  p_category text DEFAULT 'news',
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
    u.id,
    trim(p_title),
    trim(p_body),
    COALESCE(p_image_urls, '{}'),
    NULLIF(trim(p_link_url), ''),
    CASE
      WHEN trim(COALESCE(p_category, '')) IN ('message', 'reply', 'news', 'promo')
      THEN trim(p_category)
      ELSE 'news'
    END,
    COALESCE(p_replies_enabled, false)
  FROM auth.users u;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_notify_all_users(text, text, text[], text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_notify_all_users(text, text, text[], text, text, boolean) TO service_role;
