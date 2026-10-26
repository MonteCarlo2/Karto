-- Маржа: налог и целевая маржа кабинета + история себестоимости.

ALTER TABLE public.seller_hub_task_settings
  ADD COLUMN IF NOT EXISTS tax_rate_percent NUMERIC,
  ADD COLUMN IF NOT EXISTS target_margin_percent NUMERIC;

COMMENT ON COLUMN public.seller_hub_task_settings.tax_rate_percent IS
  'Налог % от суммы реализации WB (retail_amount). NULL — маржа до налога.';
COMMENT ON COLUMN public.seller_hub_task_settings.target_margin_percent IS
  'Целевая маржа %. NULL — TASK_LOW_MARGIN выключен. Дублирует смысл low_margin_percent; при чтении берём target, иначе low.';

CREATE TABLE IF NOT EXISTS public.seller_hub_cost_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  marketplace_id TEXT NOT NULL,
  nm_id TEXT NOT NULL,
  cost_price NUMERIC NOT NULL CHECK (cost_price >= 0),
  effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS seller_hub_cost_history_nm_idx
  ON public.seller_hub_cost_history (user_id, marketplace_id, nm_id, effective_from DESC);

ALTER TABLE public.seller_hub_cost_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seller_hub_cost_history FORCE ROW LEVEL SECURITY;

CREATE POLICY "seller_hub_cost_history_own"
  ON public.seller_hub_cost_history
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

REVOKE ALL ON public.seller_hub_cost_history FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.seller_hub_cost_history TO authenticated;
GRANT ALL ON public.seller_hub_cost_history TO service_role;
