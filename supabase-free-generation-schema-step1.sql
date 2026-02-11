-- ШАГ 1: Создание таблицы
-- Скопируйте и выполните это в Supabase SQL Editor

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
