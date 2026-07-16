-- Неизменяемый маркер: демо-поток положен только аккаунтам,
-- которые действительно завершили регистрацию после запуска функции.
CREATE TABLE IF NOT EXISTS public.demo_flow_grants (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  registered_at timestamptz NOT NULL DEFAULT now(),
  granted_at timestamptz,
  removed_for_paid_at timestamptz
);

COMMENT ON TABLE public.demo_flow_grants IS
  'Одноразовая выдача демо-потока: строка создаётся только в момент новой регистрации.';

ALTER TABLE public.demo_flow_grants ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.demo_flow_grants FROM anon, authenticated;
