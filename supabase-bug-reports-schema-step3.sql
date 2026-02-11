-- ШАГ 3: Включение RLS и политики
-- Выполните после ШАГ 2

ALTER TABLE bug_reports ENABLE ROW LEVEL SECURITY;

-- Политики доступа: разрешаем все операции через service_role
CREATE POLICY "Allow all operations for service role" ON bug_reports
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Политики для пользователей: могут создавать отчеты, но не видеть чужие
CREATE POLICY "Users can insert bug reports" ON bug_reports
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can view their own bug reports" ON bug_reports
  FOR SELECT
  USING (auth.uid()::text = user_email OR user_email = 'anonymous');
