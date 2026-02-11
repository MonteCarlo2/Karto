# Настройка входа через Яндекс OAuth

## Шаг 1: Создание приложения в Яндекс OAuth

1. Зайдите на https://oauth.yandex.ru/
2. Нажмите **"Зарегистрировать новое приложение"**
3. Заполните форму:
   - **Название приложения:** `KARTO`
   - **Платформы:** выберите "Веб-сервисы"
   - **Callback URI #1:** `https://ваш-проект.supabase.co/auth/v1/callback`
     - Замените `ваш-проект` на ID вашего Supabase проекта
     - Например: `https://ntdnxdccpkpabavgxizd.supabase.co/auth/v1/callback`
   - **Callback URI #2:** `http://localhost:3000/auth/callback` (для локальной разработки)
4. Нажмите **"Создать"**

## Шаг 2: Получение Client ID и Client Secret

1. После создания приложения вы увидите:
   - **ID приложения** (Client ID) - скопируйте его
   - **Пароль приложения** (Client Secret) - скопируйте его (показывается только один раз!)

## Шаг 3: Настройка в Supabase

1. Зайдите в **Supabase Dashboard**
2. **Settings** → **Authentication** → **Providers**
3. Найдите **"Yandex"** в списке провайдеров
4. Включите переключатель **"Enable Yandex provider"**
5. Заполните:
   - **Client ID (secret):** вставьте ваш Client ID из Яндекс
   - **Client Secret (secret):** вставьте ваш Client Secret из Яндекс
6. Нажмите **"Save"**

## Шаг 4: Настройка Redirect URLs

1. В том же разделе **Providers** → **Yandex**
2. Убедитесь, что в **"Redirect URLs"** указаны:
   - `https://ваш-проект.supabase.co/auth/v1/callback`
   - `http://localhost:3000/auth/callback` (для разработки)

## Шаг 5: Проверка работы

1. Зайдите на `/login`
2. Нажмите **"Продолжить с Яндекс"**
3. Должно открыться окно авторизации Яндекс
4. После авторизации вы будете перенаправлены обратно на сайт

## ⚠️ Важно для локальной разработки

Для работы на `localhost:3000`:
- В Яндекс OAuth добавьте `http://localhost:3000/auth/callback` в Callback URI
- В Supabase добавьте `http://localhost:3000/auth/callback` в Redirect URLs

## ⚠️ Важно для продакшена

После деплоя на Vercel:
1. В Яндекс OAuth добавьте ваш домен в Callback URI:
   - `https://ваш-домен.vercel.app/auth/callback`
2. В Supabase добавьте тот же URL в Redirect URLs

## Как это работает

1. Пользователь нажимает "Продолжить с Яндекс"
2. Перенаправляется на Яндекс для авторизации
3. После авторизации Яндекс перенаправляет на Supabase callback
4. Supabase создаёт/обновляет пользователя
5. Пользователь перенаправляется на указанный URL (по умолчанию `/studio`)

## Если не работает

1. Проверьте, что Client ID и Client Secret правильные
2. Убедитесь, что Callback URI в Яндекс совпадает с Redirect URL в Supabase
3. Проверьте консоль браузера на ошибки
4. Убедитесь, что провайдер "Yandex" включен в Supabase
