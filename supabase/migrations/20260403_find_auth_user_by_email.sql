-- Быстрый поиск пользователя по email для API регистрации (без перебора listUsers).
-- Выполняется только с service_role.

CREATE OR REPLACE FUNCTION public.find_auth_user_by_email(p_email text)
RETURNS TABLE (
  id uuid,
  email text,
  email_confirmed_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = auth, public
STABLE
AS $$
  SELECT u.id, u.email::text, u.email_confirmed_at
  FROM auth.users u
  WHERE lower(u.email) = lower(trim(p_email))
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.find_auth_user_by_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_auth_user_by_email(text) TO service_role;
