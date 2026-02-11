-- Миграция: Добавление поля visual_state для сохранения промежуточного состояния визуала
-- Выполнить в SQL Editor в Supabase Dashboard

-- Добавляем поле visual_state в таблицу visual_data
ALTER TABLE visual_data 
ADD COLUMN IF NOT EXISTS visual_state JSONB DEFAULT '{}';

-- Комментарий к полю
COMMENT ON COLUMN visual_data.visual_state IS 'Промежуточное состояние визуала: generatedCards, selectedCardIndex, isSeriesMode';
