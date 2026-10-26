-- История сравнения Seller Hub. Отдельно от auto_reply_inbox_snapshots:
-- там лежат входящие отзывы, здесь базовые значения карточек для событий.
-- Магазин — пара user_id + marketplace_id: отдельной таблицы магазинов нет.
-- Неотвеченные отзывы и вопросы общие на кабинет, поэтому они в seller_hub_event_stores,
-- а не в каждой строке товара. sales_qty — штуки отчёта реализации, не заказы воронки.

CREATE TABLE IF NOT EXISTS public.seller_hub_event_stores (
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  marketplace_id TEXT NOT NULL,
  captured BOOLEAN NOT NULL DEFAULT false,
  last_sync_at TEXT,
  unanswered_feedbacks INTEGER,
  unanswered_questions INTEGER,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, marketplace_id)
);

CREATE TABLE IF NOT EXISTS public.seller_hub_product_snapshots (
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  marketplace_id TEXT NOT NULL,
  nm_id TEXT NOT NULL,
  item_id TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  vendor_code TEXT NOT NULL DEFAULT '',
  price INTEGER,
  discount INTEGER,
  promo_price INTEGER,
  stock INTEGER,
  sales_qty INTEGER,
  sales_window TEXT,
  content_score INTEGER,
  photos_count INTEGER,
  cover_days INTEGER,
  absent BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, marketplace_id, nm_id)
);

CREATE INDEX IF NOT EXISTS seller_hub_product_snapshots_user_idx
  ON public.seller_hub_product_snapshots (user_id, marketplace_id);

CREATE TABLE IF NOT EXISTS public.seller_hub_product_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  marketplace_id TEXT NOT NULL,
  event_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  kind TEXT NOT NULL,
  event_group TEXT NOT NULL,
  severity TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  product_title TEXT,
  vendor_code TEXT,
  nm_id TEXT,
  item_id TEXT,
  UNIQUE (user_id, marketplace_id, event_key)
);

CREATE INDEX IF NOT EXISTS seller_hub_product_events_user_created_idx
  ON public.seller_hub_product_events (user_id, marketplace_id, created_at DESC);

ALTER TABLE public.seller_hub_event_stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seller_hub_product_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seller_hub_product_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.seller_hub_event_stores FORCE ROW LEVEL SECURITY;
ALTER TABLE public.seller_hub_product_snapshots FORCE ROW LEVEL SECURITY;
ALTER TABLE public.seller_hub_product_events FORCE ROW LEVEL SECURITY;

CREATE POLICY "seller_hub_event_stores_own"
  ON public.seller_hub_event_stores
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "seller_hub_product_snapshots_own"
  ON public.seller_hub_product_snapshots
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "seller_hub_product_events_own"
  ON public.seller_hub_product_events
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

REVOKE ALL ON public.seller_hub_event_stores FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.seller_hub_product_snapshots FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.seller_hub_product_events FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.seller_hub_event_stores TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.seller_hub_product_snapshots TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.seller_hub_product_events TO authenticated, service_role;
