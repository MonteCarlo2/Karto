-- Wizard finished once → user sees brand overview on /brand (not the 7-step flow).

ALTER TABLE public.user_brand_onboarding
  ADD COLUMN IF NOT EXISTS wizard_completed_at TIMESTAMPTZ NULL;

-- Уже сохранённые полные черновики считаем завершёнными мастером (до появления колонки).
UPDATE public.user_brand_onboarding u
SET wizard_completed_at = u.updated_at
WHERE u.wizard_completed_at IS NULL
  AND length(trim(COALESCE(u.draft_json->>'name', ''))) >= 2
  AND length(trim(COALESCE(u.draft_json->>'niche', ''))) > 0
  AND length(trim(COALESCE(u.draft_json->>'description', ''))) >= 20
  AND nullif(trim(COALESCE(u.draft_json->>'paletteId', '')), '') IS NOT NULL
  AND nullif(trim(COALESCE(u.draft_json->>'styleId', '')), '') IS NOT NULL
  AND nullif(trim(COALESCE(u.draft_json->>'toneId', '')), '') IS NOT NULL
  AND nullif(trim(COALESCE(u.draft_json->>'logoMode', '')), '') IS NOT NULL;
