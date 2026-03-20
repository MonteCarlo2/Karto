# Видео-кредиты в базе (что выполнить и как читать таблицу)

## Что сделать в Supabase

В **SQL Editor** выполни миграции **по порядку** (если ещё не применял):

1. `migrations/20260318_video_tokens_in_user_subscriptions.sql`  
   - Добавляет `plan_type = 'video_tokens'`, колонку `video_tokens_spent`, RPC `add_user_video_tokens` / `consume_user_video_tokens`.

2. `migrations/20260319_video_tokens_lifetime_purchased.sql`  
   - Добавляет `video_tokens_lifetime_purchased` и обновляет `add_user_video_tokens`, чтобы копить «всего куплено».

3. `migrations/20260321_video_tokens_monthly_period.sql`  
   - Видео-кредиты на **30 дней** с `period_start` (как поток/creative): при новой покупке пакета `period_start` обновляется; списание только пока период не истёк.

4. `migrations/20260322_video_token_rpc_grants_and_period_fix.sql`  
   - **GRANT EXECUTE** на `consume_user_video_tokens` / `add_user_video_tokens` для **service_role** (иначе RPC с бэкенда может дать permission denied и 403 при генерации).  
   - Разовый **UPDATE** `period_start` для строк с балансом, у которых период уже истёк (после старых начислений).

Скопируй содержимое каждого файла и выполни целиком. После этого в Table Editor у `user_subscriptions` появятся нужные колонки.

## Где смотреть видео (не в строке `creative`)

У одного пользователя может быть **несколько строк** с разным `plan_type`:

| plan_type      | Назначение |
|----------------|------------|
| `flow`         | Потоки |
| `creative`     | Генерации **фото**: лимит = `plan_volume`, израсходовано = `creative_used` |
| `video_tokens` | **Видео-кредиты** (отдельная строка) |

Чтобы увидеть видео в редакторе: **отфильтруй** `plan_type` = `video_tokens` (или открой строку с этим типом).

## Смысл колонок для строки `video_tokens`

Аналог логики «лимит / использовано» для фото:

| Колонка | Смысл |
|---------|--------|
| **`plan_volume`** | **Текущий остаток** токенов (как «сколько генераций осталось» у creative) |
| **`video_tokens_spent`** | **Всего списано** за всё время |
| **`video_tokens_lifetime_purchased`** | **Всего начислено покупками** (сумма пакетов; после миграции `20260319`) |
| **`period_start`** | Начало **текущего 30-дневного периода**; при покупке видео-пакета обновляется (как при пополнении creative) |

Связь (если не правили руками и период активен):  
`video_tokens_lifetime_purchased ≈ plan_volume + video_tokens_spent`.

Строка `video_tokens` **появляется** после первой покупки видео-пакета или при первом списании/начислении через RPC — до этого в таблице могут быть только `creative` / `flow`.

## Фото (напоминание)

Для `plan_type = 'creative'`: **лимит** = `plan_volume`, **использовано** = `creative_used`, остаток = `plan_volume - creative_used`.
