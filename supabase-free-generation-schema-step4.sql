-- ШАГ 4: Создание триггера
-- Выполните после ШАГ 3
-- ВАЖНО: Функция update_updated_at_column() должна уже существовать
-- (она создается в основном файле supabase-schema.sql)

CREATE TRIGGER update_free_feed_updated_at BEFORE UPDATE ON free_generation_feed
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
