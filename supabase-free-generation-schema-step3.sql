-- ШАГ 3: Включение RLS и политики
-- Выполните после ШАГ 2

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
