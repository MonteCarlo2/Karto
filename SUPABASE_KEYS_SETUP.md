# Простая инструкция: Настройка Supabase для аутентификации

## Зачем нужны две переменные с одним URL?

### `SUPABASE_URL` (уже есть у вас)
- Используется: **только на сервере** (API routes)
- Для чего: работа с базой данных на сервере

### `NEXT_PUBLIC_SUPABASE_URL` (нужно добавить)
- Используется: **в браузере** (клиентская часть)
- Для чего: вход/регистрация пользователей
- Значение: **тот же самый URL**, что и `SUPABASE_URL`

**Простыми словами:** Один и тот же URL, но нужен в двух местах - на сервере и в браузере.

---

## Где взять Anon Key?

### Шаг 1: Откройте Supabase Dashboard
1. Зайдите на https://supabase.com/dashboard
2. Войдите в свой аккаунт
3. Выберите ваш проект (тот, где URL `https://ntdnxdccpkpabavgxizd.supabase.co`)

### Шаг 2: Найдите ключи
1. В левом меню нажмите **Settings** (настройки)
2. Выберите **API**
3. Вы увидите два раздела:

#### Раздел 1: "Project API keys"
Здесь два ключа:

**1. `anon` `public`** ← **ЭТОТ НУЖЕН ДЛЯ БРАУЗЕРА**
- Это публичный ключ (безопасен для браузера)
- Скопируйте его - это будет `NEXT_PUBLIC_SUPABASE_ANON_KEY`

**2. `service_role` `secret`** ← **ЭТОТ У ВАС УЖЕ ЕСТЬ**
- Это секретный ключ (только для сервера)
- У вас уже есть в `.env.local` как `SUPABASE_SERVICE_ROLE_KEY`

#### Раздел 2: "Project URL"
- Это URL вашего проекта
- У вас уже есть: `https://ntdnxdccpkpabavgxizd.supabase.co`

---

## Что добавить в `.env.local`

Откройте ваш `.env.local` и добавьте **две строки**:

```env
# У вас уже есть (ПРИМЕР — НЕ НАСТОЯЩИЕ КЛЮЧИ):
REPLICATE_API_TOKEN=ВАШ_REPLICATE_API_TOKEN_ИЗ_АККАУНТА
SUPABASE_URL=https://ВАШ_ПРОЕКТ.supabase.co
SUPABASE_SERVICE_ROLE_KEY=ВАШ_SERVICE_ROLE_KEY_ИЗ_SUPABASE

# ДОБАВЬТЕ ЭТИ ДВЕ СТРОКИ:
NEXT_PUBLIC_SUPABASE_URL=https://ВАШ_ПРОЕКТ.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=ВАШ_ANON_KEY_ИЗ_SUPABASE
```

**Важно:** 
- `NEXT_PUBLIC_SUPABASE_URL` = тот же URL, что и `SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` = скопируйте из Supabase Dashboard → Settings → API → `anon` `public` key

---

## Визуальная подсказка

В Supabase Dashboard → Settings → API вы увидите примерно так:

```
┌─────────────────────────────────────────┐
│ Project URL                              │
│ https://ntdnxdccpkpabavgxizd.supabase.co │ ← Скопируйте сюда
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ Project API keys                        │
│                                         │
│ anon public                             │
│ eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... │ ← Скопируйте ЭТОТ
│ [Reveal] [Copy]                         │
│                                         │
│ service_role secret                      │
│ eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... │ ← У вас уже есть
│ [Reveal] [Copy]                         │
└─────────────────────────────────────────┘
```

---

## Что будет в будущем на Vercel?

Когда будете деплоить на Vercel:
1. Зайдите в Vercel → Settings → Environment Variables
2. Добавьте **те же самые** переменные, что в `.env.local`
3. Всё заработает автоматически

**Ничего сложного - просто скопируете переменные из `.env.local` в Vercel.**

---

## Итого: что нужно сделать сейчас

1. ✅ Откройте Supabase Dashboard → Settings → API
2. ✅ Скопируйте `anon` `public` key
3. ✅ Добавьте в `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL=https://ntdnxdccpkpabavgxizd.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY=скопированный-anon-key`
4. ✅ Перезапустите `npm run dev`
5. ✅ Готово! Регистрация и вход будут работать
