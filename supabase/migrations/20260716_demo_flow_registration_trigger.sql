-- Маркер демо создаётся в той же транзакции, что и auth.users:
-- временный сбой приложения не должен лишать нового пользователя демо.
CREATE SCHEMA IF NOT EXISTS app_private;

CREATE OR REPLACE FUNCTION app_private.mark_demo_flow_registration()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.demo_flow_grants (user_id, registered_at)
  VALUES (NEW.id, now())
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.mark_demo_flow_registration() FROM PUBLIC;

DROP TRIGGER IF EXISTS auth_user_created_demo_flow ON auth.users;
CREATE TRIGGER auth_user_created_demo_flow
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION app_private.mark_demo_flow_registration();
