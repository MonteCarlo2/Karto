-- Включить RLS для платёжных таблиц (убрать статус UNRESTRICTED).
-- Выполнить в Supabase → SQL Editor один раз.
-- Политик не создаём: доступ будет только у бэкенда (service role). Из браузера — никакого доступа.

ALTER TABLE pending_payment ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_processed ENABLE ROW LEVEL SECURITY;
