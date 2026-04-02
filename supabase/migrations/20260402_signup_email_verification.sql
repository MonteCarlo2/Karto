-- Код подтверждения email при регистрации (4 цифры), хранится только хеш.
-- Доступ только с сервера (service role); RLS без политик для anon/authenticated.

CREATE TABLE IF NOT EXISTS public.signup_email_verification (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  email text NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  resend_count int NOT NULL DEFAULT 0,
  last_sent_at timestamptz,
  wrong_attempts int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_signup_email_verification_email_lower
  ON public.signup_email_verification (lower(email));

ALTER TABLE public.signup_email_verification ENABLE ROW LEVEL SECURITY;
