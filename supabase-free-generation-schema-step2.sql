-- ШАГ 2: Создание индексов
-- Выполните после ШАГ 1

CREATE INDEX IF NOT EXISTS idx_free_feed_user ON free_generation_feed(user_id);
CREATE INDEX IF NOT EXISTS idx_free_feed_created ON free_generation_feed(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_free_feed_favorite ON free_generation_feed(user_id, is_favorite) WHERE is_favorite = TRUE;
