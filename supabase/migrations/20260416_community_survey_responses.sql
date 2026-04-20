-- Двухэтапное голосование сообщества: желаемые функции + проблемы сервиса (мультивыбор).
-- Запись только через API (service_role); пользователи не читают чужие ответы.

CREATE TABLE IF NOT EXISTS public.community_survey_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  survey_version text NOT NULL DEFAULT '2026-04-20',
  feature_option_ids text[] NOT NULL DEFAULT '{}',
  problem_option_ids text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_survey_responses_one_per_user_version UNIQUE (user_id, survey_version)
);

CREATE INDEX IF NOT EXISTS idx_community_survey_responses_version
  ON public.community_survey_responses (survey_version, created_at DESC);

COMMENT ON TABLE public.community_survey_responses IS 'Голосование KARTO: выбранные id опций (текстовые slug-и), версия опроса для повторных волн.';

CREATE OR REPLACE FUNCTION public.set_community_survey_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_community_survey_responses_updated ON public.community_survey_responses;
CREATE TRIGGER tr_community_survey_responses_updated
  BEFORE UPDATE ON public.community_survey_responses
  FOR EACH ROW
  EXECUTE FUNCTION public.set_community_survey_updated_at();

ALTER TABLE public.community_survey_responses ENABLE ROW LEVEL SECURITY;

-- Политики: прямой доступ из клиента не нужен; API пишет через service_role.
DROP POLICY IF EXISTS "community_survey_no_public" ON public.community_survey_responses;
CREATE POLICY "community_survey_no_public"
  ON public.community_survey_responses
  FOR ALL
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE public.community_survey_responses FROM PUBLIC;
GRANT ALL ON TABLE public.community_survey_responses TO service_role;
