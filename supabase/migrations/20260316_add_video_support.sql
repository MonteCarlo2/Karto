-- Добавляем поддержку видео в таблицу free_generation_feed

-- Добавляем media_type для различия фото/видео
ALTER TABLE free_generation_feed
  ADD COLUMN IF NOT EXISTS media_type TEXT DEFAULT 'image';

-- Добавляем поле для хранения видео URL (отдельно от image_url)
ALTER TABLE free_generation_feed
  ADD COLUMN IF NOT EXISTS video_url TEXT;

-- Обновляем существующие строки — они все являются изображениями
UPDATE free_generation_feed SET media_type = 'image' WHERE media_type IS NULL;
