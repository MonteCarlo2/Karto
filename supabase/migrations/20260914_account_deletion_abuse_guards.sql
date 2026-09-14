-- Защита от delete → re-register: durable device/email claims + комментарии.

CREATE TABLE IF NOT EXISTS public.welcome_perk_device_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_hash text NOT NULL,
  registered_at timestamptz NOT NULL,
  perks_eligible boolean NOT NULL DEFAULT true
);

COMMENT ON TABLE public.welcome_perk_device_claims IS
  'История eligible-регистраций по device_hash; сохраняется при удалении аккаунта.';

CREATE INDEX IF NOT EXISTS welcome_perk_device_claims_device_eligible_idx
  ON public.welcome_perk_device_claims (device_hash, registered_at DESC)
  WHERE perks_eligible = true;

ALTER TABLE public.welcome_perk_device_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.welcome_perk_device_claims FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.demo_flow_email_usage (
  email_hash text PRIMARY KEY,
  first_used_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.demo_flow_email_usage IS
  'Email (SHA-256), для которого демо-поток уже выдавался; переживает удаление аккаунта.';

ALTER TABLE public.demo_flow_email_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.demo_flow_email_usage FROM anon, authenticated;
