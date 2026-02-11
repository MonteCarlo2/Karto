-- Исправление RLS политик для bug_reports
-- Выполнить в SQL Editor в Supabase Dashboard

-- Удаляем старые политики
DROP POLICY IF EXISTS "Allow all operations for service role" ON bug_reports;
DROP POLICY IF EXISTS "Users can insert bug reports" ON bug_reports;
DROP POLICY IF EXISTS "Users can view their own bug reports" ON bug_reports;

-- Политика для service_role: разрешает все операции (обходит RLS)
CREATE POLICY "Allow all operations for service role" ON bug_reports
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

-- Политика для пользователей: могут создавать отчеты
CREATE POLICY "Users can insert bug reports" ON bug_reports
  FOR INSERT
  WITH CHECK (true);

-- Политика для пользователей: могут видеть свои отчеты
CREATE POLICY "Users can view their own bug reports" ON bug_reports
  FOR SELECT
  USING (auth.uid()::text = user_email OR user_email = 'anonymous');
