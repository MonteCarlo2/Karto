-- Схема базы данных для KARTO
-- Выполнить в SQL Editor в Supabase Dashboard

-- Таблица сессий работы пользователя
CREATE TABLE IF NOT EXISTS product_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Таблица данных этапа "Понимание"
CREATE TABLE IF NOT EXISTS understanding_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES product_sessions(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  photo_url TEXT,
  selected_method TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(session_id)
);

-- Таблица данных этапа "Описание"
CREATE TABLE IF NOT EXISTS description_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES product_sessions(id) ON DELETE CASCADE,
  user_preferences JSONB DEFAULT '{}',
  selected_blocks JSONB DEFAULT '[]',
  generated_descriptions JSONB DEFAULT '[]',
  final_description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(session_id)
);

-- Индексы для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_understanding_session ON understanding_data(session_id);
CREATE INDEX IF NOT EXISTS idx_description_session ON description_data(session_id);

-- Row Level Security (RLS) - включаем для всех таблиц
ALTER TABLE product_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE understanding_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE description_data ENABLE ROW LEVEL SECURITY;

-- Политики доступа: разрешаем все операции через service_role (серверные API routes)
-- ВАЖНО: Эти политики работают только с anon ключом, service_role их обходит
-- Поэтому мы используем service_role только на сервере

-- Политика для product_sessions: разрешаем создание и чтение
CREATE POLICY "Allow all operations for service role" ON product_sessions
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Политика для understanding_data: разрешаем все операции
CREATE POLICY "Allow all operations for service role" ON understanding_data
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Политика для description_data: разрешаем все операции
CREATE POLICY "Allow all operations for service role" ON description_data
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Функция для автоматического обновления updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Триггеры для автоматического обновления updated_at
CREATE TRIGGER update_product_sessions_updated_at BEFORE UPDATE ON product_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_description_data_updated_at BEFORE UPDATE ON description_data
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
