# Настройка Storage для сохранения сгенерированных изображений

## Проблема
Временные URL от Replicate истекают через некоторое время, из-за чего изображения становятся недоступными. Нужно сохранять изображения в Supabase Storage для постоянного доступа.

## Решение
API теперь автоматически скачивает изображения с временных URL и загружает их в Supabase Storage.

## Шаг 1: Создание Storage Bucket

1. Откройте Supabase Dashboard → Storage
2. Нажмите "New bucket"
3. Название: `generated-images`
4. Публичный доступ: **Включен** (Public bucket)
5. Нажмите "Create bucket"

## Шаг 2: Настройка политик Storage

1. В Storage → `generated-images` → Policies
2. Создайте политику для загрузки:
   - Policy name: "Allow service role uploads"
   - Allowed operation: INSERT
   - Policy definition: `true`
   - Target roles: оставьте по умолчанию (public)

3. Создайте политику для чтения:
   - Policy name: "Allow public read"
   - Allowed operation: SELECT
   - Policy definition: `true`
   - Target roles: оставьте по умолчанию (public)

## Как это работает

1. Когда пользователь генерирует изображение, API получает временный URL от Replicate
2. API автоматически скачивает изображение с этого URL
3. Загружает изображение в Supabase Storage (bucket `generated-images`)
4. Сохраняет постоянный URL из Storage в базу данных
5. Если загрузка в Storage не удалась (bucket не настроен), используется исходный URL (fallback)

## Важно

- После настройки bucket все новые изображения будут сохраняться с постоянными URL
- Старые изображения с временными URL останутся как есть (можно мигрировать позже)
- Изображения сохраняются в папке `generated-images/{userId}/` для организации по пользователям
