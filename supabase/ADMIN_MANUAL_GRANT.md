# Ручное начисление лимитов (блогер, тест, партнёр)

Выполняй в **Supabase → SQL Editor** от имени проекта (достаточно прав на `user_subscriptions` и вызов RPC).

## 1. Узнать `user_id`

**Authentication → Users** → открой пользователя → скопируй **полный** **UUID** (поле User UID), **36 символов**, без многоточия `…`. Если в SQL вставить обрезанный UUID вроде `3928e290-6f1d-4b6b-8e78-d4342…`, PostgreSQL вернёт `invalid input syntax for type uuid`.

Или по email:

```sql
SELECT id, email FROM auth.users WHERE email ILIKE '%его_почта%';
```

Дальше подставь UUID вместо `'<USER_UUID>'`.

---

## 2. Поток: лимит **5** за текущий 30-дневный период

**Важно:** приложение учитывает только строки, у которых не прошло **30 календарных дней** с `period_start`. Если вы в Table Editor меняете только `plan_volume`, а `period_start` остаётся старым, пакет будет считаться **просроченным** — в профиле будет «0 потоков», хотя число в таблице большое. Всегда выставляйте **`period_start = NOW()`** при выдаче или продлении.

**Только продлить период** (лимит и `flows_used` не трогаем):

```sql
UPDATE public.user_subscriptions
SET period_start = NOW(), updated_at = NOW()
WHERE user_id = '<USER_UUID>'::uuid AND plan_type = 'flow';
```

---

`plan_volume` = сколько потоков доступно за период; `flows_used` = сколько уже израсходовано (для «полного пакета с нуля» ставим **0**).

```sql
INSERT INTO public.user_subscriptions (
  user_id,
  plan_type,
  plan_volume,
  period_start,
  flows_used,
  creative_used,
  video_tokens_spent,
  video_tokens_lifetime_purchased
)
VALUES (
  '<USER_UUID>'::uuid,
  'flow',
  5,
  NOW(),
  0,
  0,
  0,
  0
)
ON CONFLICT (user_id, plan_type) DO UPDATE SET
  plan_volume = EXCLUDED.plan_volume,
  flows_used = 0,
  period_start = NOW(),
  updated_at = NOW();
```

Если строка `flow` уже есть и нужно **только увеличить** лимит, не обнуляя `flows_used`, скажи — используй отдельный `UPDATE` под задачу.

---

## 3. Кредиты (Свободное творчество: фото + видео)

Единый кошелёк: **`plan_type = credits`**. Поле `plan_volume` = остаток кредитов.

**Надёжно:** штатная функция начисления (как после оплаты):

```sql
SELECT public.add_user_video_tokens('<USER_UUID>'::uuid, 2000);
```

**Точное значение вручную:**

```sql
UPDATE public.user_subscriptions
SET
  plan_volume = 2000,
  video_tokens_lifetime_purchased = GREATEST(COALESCE(video_tokens_lifetime_purchased, 0), 2000),
  period_start = NOW(),
  updated_at = NOW()
WHERE user_id = '<USER_UUID>'::uuid AND plan_type = 'credits';
```

Если строки нет — вызови `add_user_video_tokens(uuid, 2000)`.

> Legacy: строки `plan_type = 'creative'` или `video_tokens` — устарели. После миграции `20260717_user_subscriptions_credits_plan_type.sql` используй только **`credits`**.

---

## 4. (устарело) creative / video_tokens

Не создавай новые строки `creative` или `video_tokens`. Для фото и видео в Мастерской — только **`credits`** (раздел 3).

---

## 6. Отзывы (автоответы): `plan_type = auto_replies`

**Четвёртая строка** в `user_subscriptions` — рядом с `flow`, `creative`, `video_tokens`.

| Поле | Значение |
|------|----------|
| `plan_type` | **`auto_replies`** |
| `plan_volume` | Остаток **оплаченного** месячного пакета |
| `auto_reply_welcome_remaining` | **30 бесплатных** (без срока); нужна миграция / `ADMIN_AUTO_REPLIES_GRANT.sql` |
| `period_start` | Начало 30-дневного периода для `plan_volume` — **всегда `NOW()`** при выдаче |

**Частая ошибка:** `UPDATE ... WHERE plan_type = 'auto_replies'` — если строки ещё нет, PostgreSQL пишет «Success», но **0 rows affected** и в таблице ничего не появляется. Нужен **`INSERT ... ON CONFLICT`**.

Готовый скрипт (схема + начисление): **`supabase/ADMIN_AUTO_REPLIES_GRANT.sql`**

Кратко — начислить 100 оплаченных + 30 бесплатных:

```sql
INSERT INTO public.user_subscriptions (
  user_id,
  plan_type,
  plan_volume,
  auto_reply_welcome_remaining,
  period_start,
  flows_used,
  creative_used,
  video_tokens_spent,
  video_tokens_lifetime_purchased
)
VALUES (
  '<USER_UUID>'::uuid,
  'auto_replies',
  100,
  30,
  NOW(),
  0, 0, 0, 0
)
ON CONFLICT (user_id, plan_type) DO UPDATE SET
  plan_volume = EXCLUDED.plan_volume,
  auto_reply_welcome_remaining = EXCLUDED.auto_reply_welcome_remaining,
  period_start = EXCLUDED.period_start,
  updated_at = NOW();
```

Только оплаченные (без бесплатных):

```sql
-- то же, но auto_reply_welcome_remaining = 0
```

Проверка:

```sql
SELECT plan_type, plan_volume, auto_reply_welcome_remaining, period_start
FROM public.user_subscriptions
WHERE user_id = '<USER_UUID>'::uuid AND plan_type = 'auto_replies';
```

В профиле и в автоответах общий остаток = `auto_reply_welcome_remaining` + `plan_volume` (если период активен).

---

## 7. После правок

Пусть человек **выйдет и зайдёт** или обновит страницу профиля / студии — подтянется актуальное состояние из API.
