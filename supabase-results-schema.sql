-- Схема для сохранения результатов потока
-- Выполнить в SQL Editor в Supabase Dashboard

-- Таблица для визуальных слайдов
CREATE TABLE IF NOT EXISTS visual_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES product_sessions(id) ON DELETE CASCADE,
  slides JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(session_id)
);

-- Таблица для анализа цены
CREATE TABLE IF NOT EXISTS price_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES product_sessions(id) ON DELETE CASCADE,
  price_analysis JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(session_id)
);

-- Индексы для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_visual_session ON visual_data(session_id);
CREATE INDEX IF NOT EXISTS idx_price_session ON price_data(session_id);

-- Row Level Security (RLS)
ALTER TABLE visual_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_data ENABLE ROW LEVEL SECURITY;

-- Политики доступа: разрешаем все операции через service_role
CREATE POLICY "Allow all operations for service role" ON visual_data
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all operations for service role" ON price_data
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Обновляем политики для пользователей (через session_id)
CREATE POLICY "Users can view their own visual data" ON visual_data
  FOR ALL
  USING (EXISTS (SELECT 1 FROM product_sessions WHERE id = session_id AND user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM product_sessions WHERE id = session_id AND user_id = auth.uid()));

CREATE POLICY "Users can view their own price data" ON price_data
  FOR ALL
  USING (EXISTS (SELECT 1 FROM product_sessions WHERE id = session_id AND user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM product_sessions WHERE id = session_id AND user_id = auth.uid()));

-- Триггеры для автоматического обновления updated_at
CREATE TRIGGER update_visual_data_updated_at BEFORE UPDATE ON visual_data
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_price_data_updated_at BEFORE UPDATE ON price_data
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
