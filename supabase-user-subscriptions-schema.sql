-- Подписки пользователей: Поток (1/5/15) или Свободное творчество (10/30/100)
-- Выполнить в SQL Editor в Supabase Dashboard

CREATE TABLE IF NOT EXISTS user_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_type TEXT NOT NULL CHECK (plan_type IN ('flow', 'creative')),
  -- >= 0: для video_tokens остаток может быть 0; INSERT-заглушка в consume тоже с 0
  plan_volume INTEGER NOT NULL CHECK (plan_volume >= 0),
  period_start TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  flows_used INTEGER NOT NULL DEFAULT 0,
  creative_used INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_id ON user_subscriptions(user_id);

ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages subscriptions" ON user_subscriptions
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Users can read own subscription" ON user_subscriptions
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION update_user_subscriptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_subscriptions_updated_at
  BEFORE UPDATE ON user_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_user_subscriptions_updated_at();
