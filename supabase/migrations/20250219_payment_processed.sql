-- Идемпотентность оплат: один платёж начисляется только один раз (и по вебхуку, и при возврате на сайт).
-- Выполнить в Supabase → SQL Editor.

CREATE TABLE IF NOT EXISTS payment_processed (
  payment_id TEXT PRIMARY KEY
);

COMMENT ON TABLE payment_processed IS 'Идентификаторы платежей ЮKassa, уже обработанных (начисление подписки).';
