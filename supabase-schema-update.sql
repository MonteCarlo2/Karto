-- Обновление схемы БД для связи проектов с пользователями
-- Выполнить в SQL Editor в Supabase Dashboard

-- Добавляем user_id в product_sessions
ALTER TABLE product_sessions 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Создаём индекс для быстрого поиска проектов пользователя
CREATE INDEX IF NOT EXISTS idx_product_sessions_user_id ON product_sessions(user_id);

-- Обновляем политики RLS для product_sessions
-- Удаляем старую политику
DROP POLICY IF EXISTS "Allow all operations for service role" ON product_sessions;

-- Создаём новую политику: пользователи видят только свои проекты
CREATE POLICY "Users can view their own sessions" ON product_sessions
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own sessions" ON product_sessions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own sessions" ON product_sessions
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own sessions" ON product_sessions
  FOR DELETE
  USING (auth.uid() = user_id);

-- Обновляем политики для understanding_data и description_data
-- Они автоматически доступны через session_id благодаря CASCADE
