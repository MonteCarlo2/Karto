-- 1) PostgREST: после REVOKE FROM PUBLIC функции должны быть явно доступны service_role (и postgres).
--    Иначе rpc("consume_user_video_tokens") с сервера может вернуть permission denied → 403 в API.

GRANT EXECUTE ON FUNCTION public.consume_user_video_tokens (UUID, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.add_user_video_tokens (UUID, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_user_video_tokens (UUID, INTEGER) TO postgres;
GRANT EXECUTE ON FUNCTION public.add_user_video_tokens (UUID, INTEGER) TO postgres;

-- 2) Одноразово: баланс > 0, но период уже истёк (старые начисления без сброса period_start).
--    Иначе UPDATE в consume не срабатывает, хотя в UI баланс ещё виден до следующей синхронизации.

UPDATE public.user_subscriptions
SET
  period_start = NOW(),
  updated_at = NOW()
WHERE
  plan_type = 'video_tokens'
  AND plan_volume > 0
  AND period_start + INTERVAL '30 days' <= NOW();
