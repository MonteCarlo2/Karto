-- Простой журнал регистраций: видно в Supabase → Table Editor, без отдельного сайта.
-- Каждая новая строка в auth.users добавляет одну строку сюда.

CREATE TABLE IF NOT EXISTS public.signup_events (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL
);

COMMENT ON TABLE public.signup_events IS 'Копия момента регистрации из auth.users; пополняется триггером.';

ALTER TABLE public.signup_events ENABLE ROW LEVEL SECURITY;

-- Через PostgREST/API к таблице никто из клиентов не лезет; смотреть — из Dashboard (роль postgres).
-- При необходимости выдаёте SELECT только service_role:
CREATE POLICY "signup_events_no_client_access"
  ON public.signup_events
  FOR ALL
  USING (false)
  WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.log_signup_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.signup_events (user_id, created_at)
  VALUES (NEW.id, NEW.created_at)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auth_user_signup_log ON auth.users;
CREATE TRIGGER trg_auth_user_signup_log
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.log_signup_event();

-- Разовая заливка уже существующих пользователей (идемпотентно)
INSERT INTO public.signup_events (user_id, created_at)
SELECT id, created_at
FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

-- Удобное представление «сколько новых за день» — открыть в SQL Editor или создать как View в UI
CREATE OR REPLACE VIEW public.signup_events_by_day AS
SELECT
  (created_at AT TIME ZONE 'Europe/Moscow')::date AS day_moscow,
  COUNT(*)::bigint AS new_users
FROM public.signup_events
GROUP BY 1
ORDER BY 1 DESC;

COMMENT ON VIEW public.signup_events_by_day IS 'Агрегат по дням (дата по Москве). Смотреть: Table Editor → Views или SQL.';

REVOKE ALL ON TABLE public.signup_events FROM anon, authenticated;
REVOKE ALL ON TABLE public.signup_events_by_day FROM anon, authenticated;
