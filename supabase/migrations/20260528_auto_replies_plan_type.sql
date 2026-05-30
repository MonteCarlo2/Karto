-- Баланс автоответов в user_subscriptions (plan_type = auto_replies), период 30 дней.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'user_subscriptions'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) LIKE '%plan_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.user_subscriptions DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.user_subscriptions ADD CONSTRAINT user_subscriptions_plan_type_check
  CHECK (plan_type IN ('flow', 'creative', 'video_tokens', 'auto_replies'));

COMMENT ON COLUMN public.user_subscriptions.plan_volume IS
  'flow/creative: лимит плана; video_tokens/auto_replies: остаток на балансе';
