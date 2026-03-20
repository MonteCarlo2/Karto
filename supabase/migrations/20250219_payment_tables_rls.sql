-- Включить RLS для таблиц оплаты. Доступ только с бэкенда (service role).
-- Политик для anon/authenticated не добавляем — к таблицам обращается только API (service role обходит RLS).

ALTER TABLE pending_payment ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_processed ENABLE ROW LEVEL SECURITY;
