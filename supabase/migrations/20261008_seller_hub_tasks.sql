-- Задачи Seller Hub. Отдельно от seller_hub_product_events:
-- событие фиксирует изменение, задача живёт, пока условие не исчезло.

CREATE TABLE IF NOT EXISTS public.seller_hub_task_settings (
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  marketplace_id TEXT NOT NULL,
  low_stock_days INTEGER NOT NULL DEFAULT 7,
  sales_change_percent NUMERIC NOT NULL DEFAULT 25,
  sales_change_min_units INTEGER NOT NULL DEFAULT 5,
  excess_stock_days INTEGER NOT NULL DEFAULT 180,
  no_sales_days INTEGER NOT NULL DEFAULT 28,
  low_content_score INTEGER NOT NULL DEFAULT 70,
  low_margin_percent NUMERIC,
  stagnant_capital_rub NUMERIC NOT NULL DEFAULT 0,
  margin_drop_points NUMERIC NOT NULL DEFAULT 5,
  full_photo_count INTEGER NOT NULL DEFAULT 7,
  disabled_types TEXT[] NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, marketplace_id)
);

CREATE TABLE IF NOT EXISTS public.seller_hub_task_overrides (
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  marketplace_id TEXT NOT NULL,
  nm_id TEXT NOT NULL,
  task_type TEXT NOT NULL,
  disabled BOOLEAN NOT NULL DEFAULT false,
  low_stock_days INTEGER,
  excess_stock_days INTEGER,
  low_content_score INTEGER,
  low_margin_percent NUMERIC,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, marketplace_id, nm_id, task_type)
);

CREATE TABLE IF NOT EXISTS public.seller_hub_task_baselines (
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  marketplace_id TEXT NOT NULL,
  nm_id TEXT NOT NULL,
  stock INTEGER,
  promo_price INTEGER,
  margin_percent NUMERIC,
  sales_qty INTEGER,
  prior_sales_qty INTEGER,
  cover_days INTEGER,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, marketplace_id, nm_id)
);

CREATE TABLE IF NOT EXISTS public.seller_hub_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  marketplace_id TEXT NOT NULL,
  nm_id TEXT,
  item_id TEXT,
  product_title TEXT,
  vendor_code TEXT,
  task_type TEXT NOT NULL,
  category TEXT NOT NULL,
  severity TEXT NOT NULL,
  status TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL DEFAULT '',
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  recommendation TEXT NOT NULL DEFAULT '',
  action_type TEXT NOT NULL,
  business_impact_type TEXT NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  source_event_id TEXT,
  snooze_until TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  resolution TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS seller_hub_tasks_open_uidx
  ON public.seller_hub_tasks (user_id, marketplace_id, task_type, COALESCE(nm_id, ''))
  WHERE status IN ('active', 'in_progress', 'snoozed');

CREATE INDEX IF NOT EXISTS seller_hub_tasks_user_idx
  ON public.seller_hub_tasks (user_id, marketplace_id, updated_at DESC);

ALTER TABLE public.seller_hub_task_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seller_hub_task_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seller_hub_task_baselines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seller_hub_tasks ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.seller_hub_task_settings FORCE ROW LEVEL SECURITY;
ALTER TABLE public.seller_hub_task_overrides FORCE ROW LEVEL SECURITY;
ALTER TABLE public.seller_hub_task_baselines FORCE ROW LEVEL SECURITY;
ALTER TABLE public.seller_hub_tasks FORCE ROW LEVEL SECURITY;

CREATE POLICY "seller_hub_task_settings_own"
  ON public.seller_hub_task_settings
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "seller_hub_task_overrides_own"
  ON public.seller_hub_task_overrides
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "seller_hub_task_baselines_own"
  ON public.seller_hub_task_baselines
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "seller_hub_tasks_own"
  ON public.seller_hub_tasks
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

REVOKE ALL ON public.seller_hub_task_settings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.seller_hub_task_overrides FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.seller_hub_task_baselines FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.seller_hub_tasks FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.seller_hub_task_settings TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.seller_hub_task_overrides TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.seller_hub_task_baselines TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.seller_hub_tasks TO authenticated, service_role;
