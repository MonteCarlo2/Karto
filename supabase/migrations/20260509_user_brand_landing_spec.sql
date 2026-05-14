-- AI-generated landing preview (structured JSON), persisted per user brand profile.

ALTER TABLE public.user_brand_onboarding
  ADD COLUMN IF NOT EXISTS landing_spec_json JSONB NULL;

ALTER TABLE public.user_brand_onboarding
  ADD COLUMN IF NOT EXISTS landing_generated_at TIMESTAMPTZ NULL;
