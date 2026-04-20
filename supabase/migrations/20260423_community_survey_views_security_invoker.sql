-- Если 20260422 уже применяли без security_invoker: починить предупреждения Supabase
-- («Security Definer view», UNRESTRICTED) и явно закрыть доступ с anon/authenticated.

ALTER VIEW public.community_survey_summary SET (security_invoker = true);
ALTER VIEW public.community_survey_feature_aggregates SET (security_invoker = true);
ALTER VIEW public.community_survey_problem_aggregates SET (security_invoker = true);

REVOKE ALL ON TABLE public.community_survey_summary FROM PUBLIC;
REVOKE ALL ON TABLE public.community_survey_summary FROM anon, authenticated;
GRANT SELECT ON public.community_survey_summary TO service_role;

REVOKE ALL ON TABLE public.community_survey_feature_aggregates FROM PUBLIC;
REVOKE ALL ON TABLE public.community_survey_feature_aggregates FROM anon, authenticated;
GRANT SELECT ON public.community_survey_feature_aggregates TO service_role;

REVOKE ALL ON TABLE public.community_survey_problem_aggregates FROM PUBLIC;
REVOKE ALL ON TABLE public.community_survey_problem_aggregates FROM anon, authenticated;
GRANT SELECT ON public.community_survey_problem_aggregates TO service_role;
