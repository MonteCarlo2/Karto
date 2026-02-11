# Настройка системы отчетов о неполадках

## Шаг 1: Создание таблицы в Supabase

1. Откройте Supabase Dashboard → SQL Editor
2. Выполните SQL из файла `supabase-bug-reports-schema.sql` (весь файл целиком)

**ВАЖНО:** Копируйте только содержимое SQL файла (без директив "use client" или других строк из React компонентов!)

## Шаг 1.5: Исправление RLS политик (если возникают ошибки "row-level security policy")

Если при отправке отчетов возникает ошибка **"new row violates row-level security policy"**, выполните:

1. Откройте Supabase Dashboard → SQL Editor
2. Выполните SQL из файла `supabase-bug-reports-schema-fix.sql`

Это исправит RLS политики, чтобы они правильно работали с service_role.

## Шаг 2: Создание Storage Bucket для изображений

1. Откройте Supabase Dashboard → Storage
2. Нажмите "New bucket"
3. Название: `bug-reports`
4. Публичный доступ: **Включен** (Public bucket)
5. Нажмите "Create bucket"

## Шаг 3: Настройка политик Storage

1. В Storage → `bug-reports` → Policies
2. Создайте политику для загрузки:
   - Policy name: "Allow authenticated uploads"
   - Allowed operation: INSERT
   - Policy definition: `true` (или более строгая политика по необходимости)

3. Создайте политику для чтения:
   - Policy name: "Allow public read"
   - Allowed operation: SELECT
   - Policy definition: `true`

## Готово!

После выполнения этих шагов функция "Сообщить о проблеме" будет полностью рабочей:
- Кнопка появляется на главной странице и на странице свободной генерации
- Пользователь может прикрепить скриншот через Ctrl+V или загрузку файла
- Отчеты сохраняются в таблицу `bug_reports` в Supabase
- Изображения сохраняются в Storage bucket `bug-reports`

## Устранение проблем

### Ошибка "new row violates row-level security policy"
Выполните `supabase-bug-reports-schema-fix.sql` (см. Шаг 1.5)

### Изображения не загружаются (пустые `image_urls`)
1. Убедитесь, что bucket `bug-reports` создан (см. Шаг 2)
2. Убедитесь, что политики Storage настроены (см. Шаг 3)
3. Проверьте консоль браузера на наличие ошибок загрузки
