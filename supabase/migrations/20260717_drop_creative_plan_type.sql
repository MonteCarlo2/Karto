-- Удаляем legacy plan_type = 'creative' (заменён единым кошельком credits).

-- Перенос остатка creative → credits перед удалением
DO $migrate_creative$
DECLARE
  r RECORD;
  remaining INT;
  credits_add INT;
BEGIN
  FOR r IN
    SELECT user_id, plan_volume, creative_used
    FROM public.user_subscriptions
    WHERE plan_type = 'creative'
  LOOP
    remaining := GREATEST(0, COALESCE(r.plan_volume, 0) - COALESCE(r.creative_used, 0));
    IF remaining > 0 THEN
      credits_add := remaining * 100;
      PERFORM public.add_user_video_tokens(r.user_id, credits_add);
    END IF;
  END LOOP;
END $migrate_creative$;

DELETE FROM public.user_subscriptions WHERE plan_type = 'creative';

-- Обновляем CHECK: creative больше не создаём
DO $drop_plan_check$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'public.user_subscriptions'::regclass
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) LIKE '%plan_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.user_subscriptions DROP CONSTRAINT IF EXISTS %I', rec.conname);
  END LOOP;
END $drop_plan_check$;

ALTER TABLE public.user_subscriptions ADD CONSTRAINT user_subscriptions_plan_type_check
  CHECK (plan_type = ANY (ARRAY[
    'flow'::text,
    'credits'::text,
    'auto_replies'::text,
    'demo_flow'::text
  ]));

COMMENT ON TABLE public.user_subscriptions IS
  'Подписки: flow, demo_flow, credits (фото+видео), auto_replies. Одна строка на (user_id, plan_type).';
