-- Справочник категорий и комиссий для калькулятора юнит-экономики.
-- Импорт из Excel: admin / service role → unit_econ_categories.

CREATE TABLE IF NOT EXISTS public.unit_econ_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marketplace TEXT NOT NULL CHECK (marketplace IN ('ozon', 'wildberries')),
  external_id TEXT,
  name TEXT NOT NULL,
  parent_name TEXT,
  commission_percent NUMERIC(6, 3) NOT NULL CHECK (commission_percent >= 0 AND commission_percent <= 100),
  logistics_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_unit_econ_categories_marketplace
  ON public.unit_econ_categories (marketplace, name);

CREATE UNIQUE INDEX IF NOT EXISTS idx_unit_econ_categories_marketplace_external
  ON public.unit_econ_categories (marketplace, external_id)
  WHERE external_id IS NOT NULL;

ALTER TABLE public.unit_econ_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read unit econ categories"
  ON public.unit_econ_categories
  FOR SELECT
  USING (true);

CREATE POLICY "Service role manages unit econ categories"
  ON public.unit_econ_categories
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

COMMENT ON TABLE public.unit_econ_categories IS
  'Категории и комиссии для калькулятора юнит-экономики. Заполняется импортом Excel.';
