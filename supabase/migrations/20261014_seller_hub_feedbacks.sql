-- Отзывы и вопросы Seller Hub (только чтение WB). Без имён покупателей.

CREATE TABLE IF NOT EXISTS public.seller_hub_feedbacks (
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  marketplace_id TEXT NOT NULL DEFAULT 'wildberries',
  feedback_id TEXT NOT NULL,
  nm_id TEXT NOT NULL,
  rating SMALLINT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  created_at TIMESTAMPTZ NOT NULL,
  answered BOOLEAN NOT NULL DEFAULT false,
  answered_at TIMESTAMPTZ,
  body_text TEXT,
  pros TEXT,
  cons TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, marketplace_id, feedback_id)
);

CREATE INDEX IF NOT EXISTS seller_hub_feedbacks_nm_created_idx
  ON public.seller_hub_feedbacks (user_id, marketplace_id, nm_id, created_at DESC);

CREATE INDEX IF NOT EXISTS seller_hub_feedbacks_created_idx
  ON public.seller_hub_feedbacks (user_id, marketplace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.seller_hub_questions (
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  marketplace_id TEXT NOT NULL DEFAULT 'wildberries',
  question_id TEXT NOT NULL,
  nm_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  answered BOOLEAN NOT NULL DEFAULT false,
  answered_at TIMESTAMPTZ,
  body_text TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, marketplace_id, question_id)
);

CREATE INDEX IF NOT EXISTS seller_hub_questions_nm_created_idx
  ON public.seller_hub_questions (user_id, marketplace_id, nm_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.seller_hub_feedbacks_meta (
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  marketplace_id TEXT NOT NULL DEFAULT 'wildberries',
  status TEXT NOT NULL DEFAULT 'not_loaded',
  error TEXT,
  last_sync_at TIMESTAMPTZ,
  full_loaded_at TIMESTAMPTZ,
  feedbacks_max_created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, marketplace_id)
);

ALTER TABLE public.seller_hub_feedbacks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seller_hub_feedbacks FORCE ROW LEVEL SECURITY;
ALTER TABLE public.seller_hub_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seller_hub_questions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.seller_hub_feedbacks_meta ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seller_hub_feedbacks_meta FORCE ROW LEVEL SECURITY;

CREATE POLICY "seller_hub_feedbacks_own"
  ON public.seller_hub_feedbacks FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "seller_hub_questions_own"
  ON public.seller_hub_questions FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "seller_hub_feedbacks_meta_own"
  ON public.seller_hub_feedbacks_meta FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

REVOKE ALL ON public.seller_hub_feedbacks FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.seller_hub_questions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.seller_hub_feedbacks_meta FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.seller_hub_feedbacks TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.seller_hub_questions TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.seller_hub_feedbacks_meta TO authenticated, service_role;
