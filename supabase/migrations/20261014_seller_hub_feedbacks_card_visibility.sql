-- Видимость отзыва на карточке nmId: orderStatus, цепочка parent/child, сверка с воронкой.

ALTER TABLE public.seller_hub_feedbacks
  ADD COLUMN IF NOT EXISTS order_status TEXT,
  ADD COLUMN IF NOT EXISTS state TEXT,
  ADD COLUMN IF NOT EXISTS imt_id TEXT,
  ADD COLUMN IF NOT EXISTS parent_feedback_id TEXT,
  ADD COLUMN IF NOT EXISTS child_feedback_id TEXT,
  ADD COLUMN IF NOT EXISTS counts_on_card BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.seller_hub_feedbacks_meta
  ADD COLUMN IF NOT EXISTS rating_mismatches JSONB;

COMMENT ON COLUMN public.seller_hub_feedbacks.order_status IS 'WB orderStatus: buyout|rejected|returned|notSpecified';
COMMENT ON COLUMN public.seller_hub_feedbacks.counts_on_card IS 'true if review contributes to public nmId card rating';
