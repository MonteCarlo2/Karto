# Интеграция проекта в Lovable

## Шаг 1: Подготовка проекта (локально)

### 1.1. Закоммить и запушить все изменения

```bash
# Добавить все изменения
git add .

# Создать коммит
git commit -m "feat: complete visual stage UI with clean floating cards design"

# Запушить в GitHub
git push origin main
```

## Шаг 2: Импорт в Lovable

### 2.1. Создать проект в Lovable

1. Перейди на [lovable.dev](https://lovable.dev)
2. Войди в свой аккаунт (или зарегистрируйся)
3. Нажми **"New Project"** или **"Import from GitHub"**

### 2.2. Подключить GitHub репозиторий

1. Выбери **"Import from GitHub"**
2. Авторизуйся через GitHub (если нужно)
3. Найди репозиторий: `MonteCarlo2/Karto`
4. Выбери его и нажми **"Import"**

### 2.3. Настройка проекта

Lovable автоматически определит:
- **Framework**: Next.js
- **Package Manager**: npm (или yarn, если используется)
- **Build Command**: `npm run build`
- **Dev Command**: `npm run dev`

## Шаг 3: Настройка переменных окружения

### 3.1. В Lovable перейди в Settings → Environment Variables

Добавь следующие переменные:

#### Supabase (обязательно)
```
SUPABASE_URL=твой_supabase_url
SUPABASE_SERVICE_ROLE_KEY=твой_supabase_service_role_key
```

**Для клиентской части (если используется):**
```
NEXT_PUBLIC_SUPABASE_URL=твой_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=твой_supabase_anon_key
```

#### Replicate API (обязательно)
```
REPLICATE_API_TOKEN=твой_replicate_api_token
```

#### OpenAI (опционально, если используется)
```
OPENAI_API_KEY=твой_openai_api_key
```

#### Google Gemini (опционально, если используется)
```
GEMINI_API_KEY=твой_gemini_api_key
```

### 3.2. Где найти значения:

**Supabase:**
- Зайди в [supabase.com](https://supabase.com)
- Выбери свой проект
- Settings → API
- Скопируй `Project URL` и `anon public` key

**Replicate:**
- Зайди в [replicate.com](https://replicate.com)
- Account → API Tokens
- Скопируй токен

## Шаг 4: Запуск проекта в Lovable

1. После импорта Lovable автоматически установит зависимости
2. Нажми **"Run"** или **"Start Dev Server"**
3. Проект будет доступен по URL, который предоставит Lovable

## Шаг 5: Проверка работоспособности

### Проверь следующие страницы:

1. `/studio/understanding` - этап понимания товара
2. `/studio/description` - этап генерации описания
3. `/studio/visual` - этап генерации визуальных карточек

### Проверь API endpoints:

- `/api/generate-description` - генерация описания
- `/api/supabase/*` - работа с Supabase
- `/api/generate-visual` (если есть) - генерация визуальных карточек

## Шаг 6: Продолжение разработки

### В Lovable ты можешь:

1. **Редактировать код** прямо в браузере
2. **Запускать команды** через терминал
3. **Просматривать логи** в реальном времени
4. **Деплоить** на Vercel одним кликом
5. **Коллаборировать** с командой

### Синхронизация с GitHub:

- Изменения в Lovable автоматически коммитятся в GitHub
- Или можно работать локально и пушить изменения, которые подтянутся в Lovable

## Полезные ссылки

- [Lovable Documentation](https://docs.lovable.dev)
- [GitHub Repository](https://github.com/MonteCarlo2/Karto)
- [Next.js Documentation](https://nextjs.org/docs)

## Примечания

- Убедись, что все зависимости указаны в `package.json`
- Проверь, что `.env.local` не закоммичен (он в `.gitignore`)
- После импорта Lovable может предложить обновить зависимости - это нормально
