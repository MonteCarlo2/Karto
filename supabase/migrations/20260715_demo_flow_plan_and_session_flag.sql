-- Demo flow: отдельный plan_type + флаг сессии
ALTER TABLE public.user_subscriptions DROP CONSTRAINT IF EXISTS user_subscriptions_plan_type_check;
ALTER TABLE public.user_subscriptions
  ADD CONSTRAINT user_subscriptions_plan_type_check
  CHECK (plan_type = ANY (ARRAY['flow'::text, 'creative'::text, 'video_tokens'::text, 'auto_replies'::text, 'demo_flow'::text]));

ALTER TABLE public.product_sessions
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.product_sessions.is_demo IS
  'true = сессия списана с демо-потока (2 описания, 5 фото 2K)';
