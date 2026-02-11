# Настройка переменных окружения на Vercel

## Важно понимать:

### `.env.local` - только для локальной разработки
- ✅ Используется только на вашем компьютере при `npm run dev`
- ✅ НЕ заливается на сервер (в `.gitignore`)
- ✅ НЕ нужен на Vercel

### На Vercel - настраиваются через веб-интерфейс
- ✅ Settings → Environment Variables
- ✅ Используются при сборке и в рантайме
- ✅ Безопасно хранятся на сервере

---

## Шаг 1: Локальная разработка (`.env.local`)

Создайте файл `.env.local` в корне проекта:

```env
# Supabase - для сервера (API routes)
SUPABASE_URL=https://ntdnxdccpkpabavgxizd.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Supabase - для клиента (аутентификация в браузере)
NEXT_PUBLIC_SUPABASE_URL=https://ntdnxdccpkpabavgxizd.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Replicate API
REPLICATE_API_TOKEN=your-replicate-token
```

⚠️ **Этот файл НЕ заливается на сервер!** Он только для локальной разработки.

---

## Шаг 2: Настройка на Vercel

После деплоя на Vercel:

1. Перейдите в ваш проект на Vercel
2. Откройте **Settings** → **Environment Variables**
3. Добавьте те же переменные:

### Production (для продакшена):
```
SUPABASE_URL=https://ntdnxdccpkpabavgxizd.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NEXT_PUBLIC_SUPABASE_URL=https://ntdnxdccpkpabavgxizd.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
REPLICATE_API_TOKEN=your-replicate-token
```

### Preview (для preview веток):
Те же самые переменные

### Development (для dev веток):
Те же самые переменные

4. Нажмите **Save**
5. Пересоберите проект (Redeploy)

---

## Почему нужны `NEXT_PUBLIC_*` переменные?

### Как работает Next.js:

```
┌─────────────────────────────────────────┐
│  СБОРКА (Build) на Vercel               │
│  - Next.js читает NEXT_PUBLIC_*          │
│  - Встраивает их в клиентский JS        │
│  - Создает статические файлы            │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│  БРАУЗЕР (Runtime)                       │
│  - Клиентский JS выполняется            │
│  - Использует встроенные NEXT_PUBLIC_*  │
│  - Делает запросы к Supabase            │
└─────────────────────────────────────────┘
```

**Важно:** `NEXT_PUBLIC_*` переменные встраиваются в JavaScript код во время сборки. Поэтому они нужны и на Vercel, иначе клиентский код не сможет подключиться к Supabase.

---

## Где взять ключи Supabase?

1. Зайдите в Supabase Dashboard: https://supabase.com/dashboard
2. Выберите ваш проект
3. Перейдите в **Settings** → **API**

### Для сервера (API routes):
- **Project URL** → `SUPABASE_URL`
- **service_role key** (секретный!) → `SUPABASE_SERVICE_ROLE_KEY`

### Для клиента (браузер):
- **Project URL** → `NEXT_PUBLIC_SUPABASE_URL` (тот же URL)
- **anon public key** (публичный) → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

---

## Безопасность

### ✅ Правильно:
- `.env.local` в `.gitignore` (не коммитится)
- `service_role` ключ только на сервере
- `anon` ключ безопасен для браузера (благодаря RLS)

### ❌ Неправильно:
- Коммитить `.env.local` в Git
- Использовать `service_role` ключ в браузере
- Хранить ключи в коде

---

## Проверка после деплоя

После настройки переменных на Vercel:

1. Пересоберите проект (Redeploy)
2. Откройте сайт
3. Попробуйте зарегистрироваться
4. Проверьте консоль браузера на ошибки

Если видите ошибку "Failed to fetch" или "Supabase не настроен":
- Проверьте, что переменные добавлены на Vercel
- Проверьте, что проект пересобран после добавления переменных
- Проверьте, что `NEXT_PUBLIC_SUPABASE_URL` и `NEXT_PUBLIC_SUPABASE_ANON_KEY` установлены
