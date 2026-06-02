-- Маска сохранённой карты для отображения в профиле (last4 + тип из ЮKassa).

ALTER TABLE public.auto_reply_billing
  ADD COLUMN IF NOT EXISTS card_last4 TEXT,
  ADD COLUMN IF NOT EXISTS card_brand TEXT;

COMMENT ON COLUMN public.auto_reply_billing.card_last4 IS 'Последние 4 цифры сохранённой карты (ЮKassa).';
COMMENT ON COLUMN public.auto_reply_billing.card_brand IS 'Тип карты из ЮKassa (Visa, MasterCard, Mir и т.д.).';
