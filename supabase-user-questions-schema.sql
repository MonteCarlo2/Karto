-- Таблица вопросов от пользователей (форма «Остались вопросы?»)
-- Выполнить в SQL Editor в Supabase Dashboard

CREATE TABLE IF NOT EXISTS user_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email TEXT NOT NULL,
  user_name TEXT NOT NULL,
  question TEXT NOT NULL,
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'read', 'replied', 'closed')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_questions_status ON user_questions(status);
CREATE INDEX IF NOT EXISTS idx_user_questions_created_at ON user_questions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_questions_user_id ON user_questions(user_id);

ALTER TABLE user_questions ENABLE ROW LEVEL SECURITY;

-- Вставка только через service_role (API с серверным ключом)
CREATE POLICY "Service role can manage user_questions" ON user_questions
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

-- Пользователь может видеть только свои вопросы
CREATE POLICY "Users can view own questions" ON user_questions
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION update_user_questions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_questions_updated_at
  BEFORE UPDATE ON user_questions
  FOR EACH ROW
  EXECUTE FUNCTION update_user_questions_updated_at();
