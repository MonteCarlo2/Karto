-- LEGACY: отдельная таблица user_video_tokens.
-- После применения 20260318_video_tokens_in_user_subscriptions.sql данные переносятся в user_subscriptions (plan_type = video_tokens), таблица удаляется.
-- Оставлено для проектов, которые уже прогнали только этот файл.

-- Баланс видео-токенов (только для видео-генерации, отдельно от генераций изображений)

CREATE TABLE IF NOT EXISTS user_video_tokens (
  user_id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_video_tokens_updated ON user_video_tokens (updated_at);

COMMENT ON TABLE user_video_tokens IS 'Кредиты для видео-генерации; списание только через API (service role).';

-- Атомарное списание: возвращает true, если хватило баланса
CREATE OR REPLACE FUNCTION public.consume_user_video_tokens (p_user_id UUID, p_amount INTEGER)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN TRUE;
  END IF;

  INSERT INTO public.user_video_tokens (user_id, balance)
  VALUES (p_user_id, 0)
  ON CONFLICT (user_id) DO NOTHING;

  UPDATE public.user_video_tokens
  SET
    balance = balance - p_amount,
    updated_at = now()
  WHERE
    user_id = p_user_id
    AND balance >= p_amount;

  RETURN FOUND;
END;
$$;

-- Начисление (после оплаты)
CREATE OR REPLACE FUNCTION public.add_user_video_tokens (p_user_id UUID, p_amount INTEGER)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN;
  END IF;

  INSERT INTO public.user_video_tokens (user_id, balance)
  VALUES (p_user_id, p_amount)
  ON CONFLICT (user_id) DO UPDATE
  SET
    balance = public.user_video_tokens.balance + EXCLUDED.balance,
    updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.consume_user_video_tokens (UUID, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.add_user_video_tokens (UUID, INTEGER) FROM PUBLIC;
