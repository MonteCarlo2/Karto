-- Старый CHECK plan_volume > 0 ломает video_tokens:
-- 1) consume_user_video_tokens делает INSERT-заглушку с plan_volume = 0 при отсутствии строки.
-- 2) После списания остаток может стать 0 — это валидное состояние.
-- Ошибка в логах: violates check constraint "user_subscriptions_plan_volume_check"

ALTER TABLE public.user_subscriptions
  DROP CONSTRAINT IF EXISTS user_subscriptions_plan_volume_check;

-- Явно разрешаем нулевой остаток; верхняя граница — INT.
ALTER TABLE public.user_subscriptions
  ADD CONSTRAINT user_subscriptions_plan_volume_nonnegative_check
  CHECK (plan_volume >= 0);
