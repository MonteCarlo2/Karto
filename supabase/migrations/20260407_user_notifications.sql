-- Сообщения от команды пользователю внутри аккаунта (ответ на баг, новости, акции).
-- Чтение: только свои строки (authenticated + RLS). Запись и рассылка — через service_role (API).

CREATE TABLE IF NOT EXISTS public.user_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  image_urls text[] NOT NULL DEFAULT '{}',
  link_url text,
  category text NOT NULL DEFAULT 'message',
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  CONSTRAINT user_notifications_category_check CHECK (
    category IN ('message', 'reply', 'news', 'promo')
  )
);

CREATE INDEX IF NOT EXISTS idx_user_notifications_user_created
  ON public.user_notifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_notifications_unread
  ON public.user_notifications (user_id)
  WHERE read_at IS NULL;

COMMENT ON TABLE public.user_notifications IS 'Уведомления пользователя внутри KARTO; создаются только сервером (admin API).';

ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_notifications_select_own"
  ON public.user_notifications
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

REVOKE ALL ON TABLE public.user_notifications FROM PUBLIC;
GRANT SELECT ON TABLE public.user_notifications TO authenticated;
GRANT ALL ON TABLE public.user_notifications TO service_role;

-- Рассылка всем пользователям (одна вставка на каждого пользователя auth.users)
CREATE OR REPLACE FUNCTION public.admin_notify_all_users(
  p_title text,
  p_body text,
  p_image_urls text[] DEFAULT '{}',
  p_link_url text DEFAULT NULL,
  p_category text DEFAULT 'news'
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
DECLARE
  n bigint;
BEGIN
  INSERT INTO public.user_notifications (user_id, title, body, image_urls, link_url, category)
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
    END
  FROM auth.users u;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_notify_all_users(text, text, text[], text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_notify_all_users(text, text, text[], text, text) TO service_role;
