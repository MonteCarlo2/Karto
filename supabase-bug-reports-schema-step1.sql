-- ШАГ 1: Создание таблицы bug_reports
-- Скопируйте и выполните это в Supabase SQL Editor

CREATE TABLE IF NOT EXISTS bug_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  description TEXT NOT NULL,
  image_urls TEXT[] DEFAULT '{}',
  user_email TEXT NOT NULL,
  user_name TEXT NOT NULL,
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'resolved', 'closed')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
