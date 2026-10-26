-- Момент перехода остатка в 0 для оценки упущенных заказов.
-- Не путать с updated_at: тот сдвигается на каждый reconcile.
ALTER TABLE public.seller_hub_task_baselines
  ADD COLUMN IF NOT EXISTS stock_out_at TIMESTAMPTZ;
