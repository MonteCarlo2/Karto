-- Детальные ответы по карточкам (very / need / later) + флаг единоразового бонуса генераций.
-- ВАЖНО: таблица community_survey_responses должна уже существовать — сначала выполните
-- миграцию 20260416_community_survey_responses.sql в том же проекте Supabase.

ALTER TABLE public.community_survey_responses
  ADD COLUMN IF NOT EXISTS feature_swipe_votes jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS reward_generations_applied boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.community_survey_responses.feature_swipe_votes IS 'Объект { feature_id: very|need|later } для аналитики.';
COMMENT ON COLUMN public.community_survey_responses.reward_generations_applied IS 'Бонус за голосование уже начислен в user_subscriptions (creative).';
