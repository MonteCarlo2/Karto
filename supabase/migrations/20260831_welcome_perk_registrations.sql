-- Лимит welcome-пакетов: 2 eligible-регистрации на device_hash за скользящие 30 дней.
-- Регистрация аккаунта не блокируется; режутся только стартовые бонусы.

CREATE TABLE IF NOT EXISTS public.welcome_perk_registrations (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  device_hash text,
  perks_eligible boolean NOT NULL DEFAULT true,
  registered_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.welcome_perk_registrations IS
  'Маркер welcome-пакета при завершении регистрации. device_hash — SHA256 от fingerprint (nullable = fail-open).';

COMMENT ON COLUMN public.welcome_perk_registrations.perks_eligible IS
  'false — стартовые бонусы не выдаются (лимит 2 на device за 30 дней).';

CREATE INDEX IF NOT EXISTS welcome_perk_registrations_device_eligible_idx
  ON public.welcome_perk_registrations (device_hash, registered_at DESC)
  WHERE device_hash IS NOT NULL AND perks_eligible = true;

ALTER TABLE public.welcome_perk_registrations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.welcome_perk_registrations FROM anon, authenticated;
