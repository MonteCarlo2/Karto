-- Auto-replies: настройки, workspace, история ответов (без API-ключей).

CREATE TABLE IF NOT EXISTS public.auto_reply_user_state (
  user_id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  email TEXT,
  shop_id TEXT NOT NULL DEFAULT 'main',
  shop_name TEXT,
  workspace_prefs JSONB NOT NULL DEFAULT '{}'::jsonb,
  settings_json JSONB NOT NULL DEFAULT '{"version":1,"shops":{},"marketplaces":{}}'::jsonb,
  compose_drafts JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS auto_reply_user_state_updated_at_idx
  ON public.auto_reply_user_state (updated_at DESC);

CREATE INDEX IF NOT EXISTS auto_reply_user_state_email_idx
  ON public.auto_reply_user_state (email);

CREATE TABLE IF NOT EXISTS public.auto_reply_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  shop_id TEXT NOT NULL DEFAULT 'main',
  marketplace_id TEXT NOT NULL,
  usage_mode TEXT NOT NULL,
  usage_mode_label TEXT NOT NULL DEFAULT '',
  star_rating TEXT NOT NULL,
  review_text TEXT NOT NULL DEFAULT '',
  reply_text TEXT NOT NULL DEFAULT '',
  generation_source TEXT NOT NULL DEFAULT 'local',
  product_name TEXT,
  buyer_label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS auto_reply_history_user_created_idx
  ON public.auto_reply_history (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS auto_reply_history_user_mp_idx
  ON public.auto_reply_history (user_id, shop_id, marketplace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.auto_reply_inbox_snapshots (
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  shop_id TEXT NOT NULL DEFAULT 'main',
  marketplace_id TEXT NOT NULL,
  items_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  seller_name TEXT,
  unanswered_count INTEGER,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, shop_id, marketplace_id)
);

CREATE INDEX IF NOT EXISTS auto_reply_inbox_snapshots_synced_idx
  ON public.auto_reply_inbox_snapshots (synced_at DESC);

ALTER TABLE public.auto_reply_user_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auto_reply_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auto_reply_inbox_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auto_reply_user_state_select_own"
  ON public.auto_reply_user_state FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "auto_reply_user_state_insert_own"
  ON public.auto_reply_user_state FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "auto_reply_user_state_update_own"
  ON public.auto_reply_user_state FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "auto_reply_user_state_delete_own"
  ON public.auto_reply_user_state FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "auto_reply_history_select_own"
  ON public.auto_reply_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "auto_reply_history_insert_own"
  ON public.auto_reply_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "auto_reply_history_update_own"
  ON public.auto_reply_history FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "auto_reply_history_delete_own"
  ON public.auto_reply_history FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "auto_reply_inbox_snapshots_select_own"
  ON public.auto_reply_inbox_snapshots FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "auto_reply_inbox_snapshots_insert_own"
  ON public.auto_reply_inbox_snapshots FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "auto_reply_inbox_snapshots_update_own"
  ON public.auto_reply_inbox_snapshots FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "auto_reply_inbox_snapshots_delete_own"
  ON public.auto_reply_inbox_snapshots FOR DELETE
  USING (auth.uid() = user_id);
