# Исправление ошибки 504 Gateway Timeout для Outlook

## Проблема

Ошибка **504 Gateway Timeout** означает, что Supabase не может подключиться к Outlook SMTP серверу в течение установленного времени.

## Решение 1: Правильные настройки Outlook SMTP

### Для Outlook.com / Hotmail.com:

1. **Supabase Dashboard** → **Settings** → **Authentication** → **SMTP Settings**
2. Заполните **ТОЧНО** так:

```
Email address: karto.help@outlook.com
Sender name: KARTO
Host: smtp-mail.outlook.com
Port: 587
Username: karto.help@outlook.com (полный email!)
Password: [ваш пароль от Outlook]
```

3. **ВАЖНО:** 
   - Порт должен быть **587** (TLS)
   - Username должен быть **полный email адрес**
   - Убедитесь, что пароль правильный

4. Нажмите **"Save"**

### Если порт 587 не работает:

Попробуйте альтернативные настройки:

**Вариант 2:**
```
Host: smtp.office365.com
Port: 587
Username: karto.help@outlook.com
Password: [ваш пароль]
```

**Вариант 3:**
```
Host: smtp-mail.outlook.com
Port: 465
Username: karto.help@outlook.com
Password: [ваш пароль]
```

## Решение 2: Временно отключить Custom SMTP (РЕКОМЕНДУЕТСЯ)

Если Outlook SMTP не работает, временно отключите Custom SMTP:

1. **Supabase Dashboard** → **Settings** → **Authentication** → **SMTP Settings**
2. **Отключите** "Enable Custom SMTP" (переключатель должен быть выключен)
3. Нажмите **"Save"**

После этого:
- ✅ Регистрация будет работать
- ✅ Письма будут отправляться от `noreply@mail.app.supabase.io`
- ✅ Письма будут с вашим красивым шаблоном (если настроен)

**Плюсы:**
- Работает сразу, без настройки
- Надёжно
- Письма с красивым шаблоном

**Минусы:**
- Письма будут от Supabase, а не от вашей компании
- Могут попадать в спам

## Решение 3: Использовать пароль приложения (если есть)

Если у Outlook есть настройка "Пароли приложений":

1. Зайдите в настройки безопасности Outlook
2. Создайте пароль для приложения "KARTO Supabase"
3. Используйте этот пароль в Supabase вместо обычного пароля

## Проверка работы

1. Сохраните настройки
2. Зарегистрируйте тестового пользователя
3. Проверьте логи: **Supabase Dashboard** → **Logs** → **Auth Logs**
4. Если видите ошибку 504 - SMTP не работает, отключите Custom SMTP

## Рекомендация

**Сейчас:** Отключите Custom SMTP, чтобы регистрация работала.

**Потом:** Когда будете настраивать рабочую почту компании, попробуйте:
- Mail.ru (работает стабильно)
- Yandex (работает стабильно)
- Или профессиональный SMTP сервис (SendGrid, Mailgun)

Outlook SMTP может быть нестабильным для автоматической отправки писем.
