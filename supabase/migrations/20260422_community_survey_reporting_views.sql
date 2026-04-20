-- Подписи к колонкам (что хранится) + VIEW «общая картина» без дублирования данных.
-- Выполнять после 20260416 и 20260421.

COMMENT ON TABLE public.community_survey_responses IS
'Один ряд = один человек завершил голосование за эту версию (survey_version). Актуально последнее сохранение API (в т.ч. если пользователь поменял ответы на экране итогов и снова отправил). Сводки по всем участникам: откройте представления community_survey_summary, community_survey_feature_aggregates, community_survey_problem_aggregates в Supabase.';

COMMENT ON COLUMN public.community_survey_responses.id IS 'Внутренний id записи.';
COMMENT ON COLUMN public.community_survey_responses.user_id IS 'Кто голосовал (uuid из auth.users).';
COMMENT ON COLUMN public.community_survey_responses.survey_version IS 'Версия бланка голосования; при новой волне меняется в коде приложения.';
COMMENT ON COLUMN public.community_survey_responses.feature_option_ids IS 'Итоговый приоритет 7 функций: массив id от самой важной для человека к менее важной (порядок после карточек).';
COMMENT ON COLUMN public.community_survey_responses.feature_swipe_votes IS 'Ответы по карточкам: JSON { "id_функции": "very" | "need" | "later" } = «Очень нужно» / «Нужно» / «Пока не актуально».';
COMMENT ON COLUMN public.community_survey_responses.problem_option_ids IS 'Шаг «недостатки»: массив id отмеченных пунктов (мультивыбор).';
COMMENT ON COLUMN public.community_survey_responses.reward_generations_applied IS 'true = бонус +3 генерации «Свободное творчество» уже начислен этому пользователю за эту версию (один раз).';
COMMENT ON COLUMN public.community_survey_responses.created_at IS 'Первое сохранение голоса.';
COMMENT ON COLUMN public.community_survey_responses.updated_at IS 'Последнее обновление записи.';

-- Сколько человек проголосовало и когда был последний ответ
-- security_invoker: права и RLS базовой таблицы от имени вызывающего (совет Supabase вместо Security Definer).
CREATE OR REPLACE VIEW public.community_survey_summary
WITH (security_invoker = true)
AS
SELECT
  survey_version,
  COUNT(*)::bigint AS total_respondents,
  MAX(updated_at) AS last_response_at
FROM public.community_survey_responses
GROUP BY survey_version;

-- По каждой функции: сколько раз выбрали «очень / нужно / позже» и суммы баллов (для рейтинга)
-- points_karto: как в продукте при ранжировании (очень=3, нужно=2, позже=1)
-- points_simple: упрощённо (2 / 1 / 1) — наглядно для отчётов
CREATE OR REPLACE VIEW public.community_survey_feature_aggregates
WITH (security_invoker = true)
AS
SELECT
  r.survey_version,
  e.key AS feature_id,
  COUNT(*) FILTER (WHERE (e.value #>> '{}') = 'very')::bigint AS votes_very,
  COUNT(*) FILTER (WHERE (e.value #>> '{}') = 'need')::bigint AS votes_need,
  COUNT(*) FILTER (WHERE (e.value #>> '{}') = 'later')::bigint AS votes_later,
  (
    COUNT(*) FILTER (WHERE (e.value #>> '{}') = 'very') * 3
    + COUNT(*) FILTER (WHERE (e.value #>> '{}') = 'need') * 2
    + COUNT(*) FILTER (WHERE (e.value #>> '{}') = 'later') * 1
  )::bigint AS points_karto,
  (
    COUNT(*) FILTER (WHERE (e.value #>> '{}') = 'very') * 2
    + COUNT(*) FILTER (WHERE (e.value #>> '{}') = 'need') * 1
    + COUNT(*) FILTER (WHERE (e.value #>> '{}') = 'later') * 1
  )::bigint AS points_simple
FROM public.community_survey_responses r
CROSS JOIN LATERAL jsonb_each(r.feature_swipe_votes) AS e(key, value)
GROUP BY r.survey_version, e.key;

-- По каждому пункту «что мешает»: сколько респондентов отметили (мультивыбор — сумма может быть > total_respondents)
CREATE OR REPLACE VIEW public.community_survey_problem_aggregates
WITH (security_invoker = true)
AS
SELECT
  r.survey_version,
  p.problem_id,
  COUNT(*)::bigint AS respondents_count
FROM public.community_survey_responses r
CROSS JOIN LATERAL unnest(COALESCE(r.problem_option_ids, ARRAY[]::text[])) AS p(problem_id)
GROUP BY r.survey_version, p.problem_id;

REVOKE ALL ON TABLE public.community_survey_summary FROM PUBLIC;
REVOKE ALL ON TABLE public.community_survey_summary FROM anon, authenticated;
GRANT SELECT ON public.community_survey_summary TO service_role;

REVOKE ALL ON TABLE public.community_survey_feature_aggregates FROM PUBLIC;
REVOKE ALL ON TABLE public.community_survey_feature_aggregates FROM anon, authenticated;
GRANT SELECT ON public.community_survey_feature_aggregates TO service_role;

REVOKE ALL ON TABLE public.community_survey_problem_aggregates FROM PUBLIC;
REVOKE ALL ON TABLE public.community_survey_problem_aggregates FROM anon, authenticated;
GRANT SELECT ON public.community_survey_problem_aggregates TO service_role;

COMMENT ON VIEW public.community_survey_summary IS 'Число проголосовавших и время последнего ответа по версии бланка.';
COMMENT ON VIEW public.community_survey_feature_aggregates IS 'Сводка по функциям: сколько «очень нужно» / «нужно» / «позже» и суммы баллов.';
COMMENT ON VIEW public.community_survey_problem_aggregates IS 'Сводка по недостаткам: сколько человек отметили каждый пункт.';
