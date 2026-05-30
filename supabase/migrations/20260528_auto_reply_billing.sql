-- Автопродление пакетов автоответов (ЮKassa save_payment_method + recurring charge).



CREATE TABLE IF NOT EXISTS public.auto_reply_billing (

  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  tariff_index SMALLINT NOT NULL DEFAULT 0 CHECK (tariff_index >= 0 AND tariff_index <= 6),

  auto_renew BOOLEAN NOT NULL DEFAULT true,

  payment_method_id TEXT,

  period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  next_renew_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),

  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()

);



CREATE INDEX IF NOT EXISTS auto_reply_billing_renew_due_idx

  ON public.auto_reply_billing (next_renew_at)

  WHERE auto_renew = true AND payment_method_id IS NOT NULL;



ALTER TABLE public.auto_reply_billing ENABLE ROW LEVEL SECURITY;



DROP POLICY IF EXISTS auto_reply_billing_select_own ON public.auto_reply_billing;

CREATE POLICY auto_reply_billing_select_own ON public.auto_reply_billing

  FOR SELECT USING (auth.uid() = user_id);



DROP POLICY IF EXISTS auto_reply_billing_update_own ON public.auto_reply_billing;

CREATE POLICY auto_reply_billing_update_own ON public.auto_reply_billing

  FOR UPDATE USING (auth.uid() = user_id)

  WITH CHECK (auth.uid() = user_id);



COMMENT ON TABLE public.auto_reply_billing IS

  'Подписка на пакет автоответов: тариф, автопродление, сохранённая карта ЮKassa.';


