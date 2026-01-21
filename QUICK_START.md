# Быстрый старт: Этап "Описание"

## Что было реализовано

✅ Подключение Supabase для хранения данных между этапами
✅ Страница "Описание" с полным функционалом
✅ Генерация 4 вариантов описаний через GPT-4o-mini
✅ Редактирование и перегенерация описаний
✅ Автоматический переход на следующий этап

## Что нужно сделать для запуска

### 1. Настроить Supabase

Следуйте инструкции в файле `SUPABASE_SETUP.md`:
- Создайте проект в Supabase
- Выполните SQL скрипт из `supabase-schema.sql`
- Добавьте ключи в `.env.local`

### 2. Проверить переменные окружения

Убедитесь, что в `.env.local` есть:
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
REPLICATE_API_TOKEN=r8_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### 3. Запустить приложение

```bash
npm run dev
```

## Как это работает

1. **Этап "Понимание"** → Пользователь вводит название товара
2. При нажатии "Принять и продолжить" → данные сохраняются в Supabase
3. **Автоматический переход** → на этап "Описание"
4. **Этап "Описание"**:
   - Пользователь указывает пожелания и выбирает блоки
   - Генерируются 4 варианта описания
   - Пользователь выбирает лучший вариант
   - Может уточнить детали и перегенерировать
   - При подтверждении → автоматический переход на "Визуал"

## Безопасность

✅ Все API ключи только в `.env.local` (не коммитятся)
✅ Все операции с БД через серверные API routes
✅ RLS политики включены в Supabase
✅ `service_role` ключ используется только на сервере

## Файлы

**Созданные файлы:**
- `src/lib/supabase/server.ts` - серверный клиент Supabase
- `src/app/api/supabase/save-understanding/route.ts` - сохранение данных "Понимание"
- `src/app/api/supabase/get-understanding/route.ts` - загрузка данных "Понимание"
- `src/app/api/supabase/save-description/route.ts` - сохранение данных "Описание"
- `src/app/api/generate-description/route.ts` - генерация описаний
- `src/app/studio/description/page.tsx` - страница "Описание"
- `supabase-schema.sql` - схема базы данных
- `SUPABASE_SETUP.md` - инструкция по настройке

**Измененные файлы:**
- `package.json` - добавлен @supabase/supabase-js
- `src/lib/services/replicate.ts` - функция generateProductDescription
- `src/app/studio/understanding/page.tsx` - интеграция с Supabase
