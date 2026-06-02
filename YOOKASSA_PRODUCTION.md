# ЮKassa: боевой магазин (karto.pro)

## Timeweb — менять ничего не нужно

Если в панели Timeweb в переменных окружения приложения уже указаны:

- `YOOKASSA_SHOP_ID` = **1279533** (боевой магазин)
- `YOOKASSA_SECRET_KEY` = ключ с префиксом **`live_`**
- `NEXT_PUBLIC_APP_URL` = **https://karto.pro**

то **на сервере ничего менять не надо**. Сайт на проде всегда брал ключи из Timeweb, а не из вашего `.env.local`.

Тестовый магазин (Shop ID `1280166`, ключ `test_`) использовался **только локально** для скриншотов — в git секреты не попадали.

## Локально вернуть боевой магазин

```powershell
.\scripts\use-yookassa-prod.ps1
npm run dev
```

Или вручную в `.env.local`:

```env
YOOKASSA_SHOP_ID=1279533
YOOKASSA_SECRET_KEY=live_ваш_ключ_из_кабинета
NEXT_PUBLIC_APP_URL=https://karto.pro
```

Строку `YOOKASSA_TEST_MODE` удалите, если осталась.

Проверка:

```powershell
.\scripts\verify-yookassa.ps1
```

## Миграция на проде

Для маски карты в профиле (`Mastercard ···· 4477`) примените на Supabase:

`supabase/migrations/20260529_auto_reply_card_display.sql`

## Тестовый магазин снова (только локально)

См. `YOOKASSA_TEST_LOCAL.md` и `.\scripts\use-yookassa-test.ps1`.
