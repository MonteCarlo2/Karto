-- Per-user persistence for the 7-step brand wizard (/brand)

CREATE TABLE IF NOT EXISTS public.user_brand_onboarding (
  user_id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  draft_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  active_step SMALLINT NOT NULL DEFAULT 0,
  show_name_gen BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_brand_onboarding_updated_at_idx
  ON public.user_brand_onboarding (updated_at DESC);

ALTER TABLE public.user_brand_onboarding ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_brand_onboarding_select_own"
  ON public.user_brand_onboarding
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "user_brand_onboarding_insert_own"
  ON public.user_brand_onboarding
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_brand_onboarding_update_own"
  ON public.user_brand_onboarding
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_brand_onboarding_delete_own"
  ON public.user_brand_onboarding
  FOR DELETE
  USING (auth.uid() = user_id);
