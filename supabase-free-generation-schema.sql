-- Схема для сохранения ленты свободной генерации
-- Выполнить в SQL Editor в Supabase Dashboard

-- Таблица для ленты свободной генерации
CREATE TABLE IF NOT EXISTS free_generation_feed (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  prompt TEXT,
  aspect_ratio TEXT NOT NULL CHECK (aspect_ratio IN ('3:4', '4:3', '9:16', '1:1')),
  generation_mode TEXT DEFAULT 'free' CHECK (generation_mode IN ('free', 'for-product')),
  scenario TEXT,
  is_favorite BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Индексы для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_free_feed_user ON free_generation_feed(user_id);
CREATE INDEX IF NOT EXISTS idx_free_feed_created ON free_generation_feed(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_free_feed_favorite ON free_generation_feed(user_id, is_favorite) WHERE is_favorite = TRUE;

-- Row Level Security (RLS)
ALTER TABLE free_generation_feed ENABLE ROW LEVEL SECURITY;

-- Политики доступа: разрешаем все операции через service_role
CREATE POLICY "Allow all operations for service role" ON free_generation_feed
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Политики для пользователей: каждый видит только свои данные
CREATE POLICY "Users can view their own feed" ON free_generation_feed
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own feed" ON free_generation_feed
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own feed" ON free_generation_feed
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own feed" ON free_generation_feed
  FOR DELETE
  USING (auth.uid() = user_id);

-- Триггер для автоматического обновления updated_at
CREATE TRIGGER update_free_feed_updated_at BEFORE UPDATE ON free_generation_feed
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
