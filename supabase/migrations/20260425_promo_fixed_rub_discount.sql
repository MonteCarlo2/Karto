-- Фиксированная скидка в рублях (чтобы получить ровно нужную цену, например 1190 → 989).
-- Промокод «ПОТОК989»: только пакет «5 потоков», только для снимка пользователей
-- (см. 20260427: заполнение promo_campaign_recipients + restrict_to_recipients = true).

ALTER TABLE public.promo_campaigns DROP CONSTRAINT IF EXISTS promo_campaigns_discount_percent_check;

ALTER TABLE public.promo_campaigns
  ADD COLUMN IF NOT EXISTS discount_rub integer NULL;

ALTER TABLE public.promo_campaigns
  ADD CONSTRAINT promo_campaigns_discount_percent_check CHECK (discount_percent >= 0 AND discount_percent <= 90);

ALTER TABLE public.promo_campaigns
  ADD CONSTRAINT promo_campaigns_discount_rub_positive CHECK (discount_rub IS NULL OR discount_rub >= 1);

ALTER TABLE public.promo_campaigns
  ADD CONSTRAINT promo_campaigns_discount_source_check CHECK (
    (discount_rub IS NOT NULL)
    OR (discount_percent >= 1)
  );

COMMENT ON COLUMN public.promo_campaigns.discount_rub IS
'Фиксированная скидка в ₽ с базовой цены тарифа. Если задана, при расчёте игнорируется discount_percent.';

-- Кампания: 5 потоков (tariff index 1), 1190 − 201 = 989 ₽. Код кириллицей + цифры.
-- Повторный запуск: если код уже есть — строка не дублируется (обновите вручную при необходимости).
INSERT INTO public.promo_campaigns (
  code,
  discount_percent,
  discount_rub,
  payment_kind,
  tariff_indices,
  restrict_to_recipients,
  active,
  internal_note
)
SELECT
  'ПОТОК989',
  0,
  201,
  'flow',
  ARRAY[1],
  true,
  true,
  'Акция: 5 потоков 1190→989 ₽; эксклюзив — только снимок в promo_campaign_recipients'
WHERE NOT EXISTS (
  SELECT 1 FROM public.promo_campaigns c WHERE upper(c.code) = upper('ПОТОК989')
);
