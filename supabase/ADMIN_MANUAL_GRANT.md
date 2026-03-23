# Ручное начисление лимитов (блогер, тест, партнёр)

Выполняй в **Supabase → SQL Editor** от имени проекта (достаточно прав на `user_subscriptions` и вызов RPC).

## 1. Узнать `user_id`

**Authentication → Users** → открой пользователя → скопируй **UUID** (поле User UID).

Или по email:

```sql
SELECT id, email FROM auth.users WHERE email ILIKE '%его_почта%';
```

Дальше подставь UUID вместо `'<USER_UUID>'`.

---

## 2. Поток: лимит **5** за текущий 30-дневный период

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

## 3. Свободное творчество (фото): много генераций (по желанию)

Тарифы на сайте: **10 / 30 / 100**. Для «полного доступа» часто ставят **100** и обнуляют использование:

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
  'creative',
  100,
  NOW(),
  0,
  0,
  0,
  0
)
ON CONFLICT (user_id, plan_type) DO UPDATE SET
  plan_volume = EXCLUDED.plan_volume,
  creative_used = 0,
  period_start = NOW(),
  updated_at = NOW();
```

---

## 4. Видео-токены

**Надёжно:** вызвать штатную функцию начисления (как после оплаты пакета). Она **прибавляет** токены к текущему остатку и продлевает 30-дневный период для видео.

Пример: **+2500** токенов:

```sql
SELECT public.add_user_video_tokens('<USER_UUID>'::uuid, 2500);
```

Повторный вызов с тем же числом снова **добавит** столько же. Если нужно выставить остаток «ровно N» без арифметики в голове — смотри строку `video_tokens` в Table Editor и вычисли сумму, либо сделай одноразовый `UPDATE` (ниже).

**Точное значение вручную** (осторожно, не перепутай с `video_tokens_spent` / lifetime):

```sql
UPDATE public.user_subscriptions
SET
  plan_volume = 2500,
  video_tokens_lifetime_purchased = GREATEST(video_tokens_lifetime_purchased, 2500),
  period_start = NOW(),
  updated_at = NOW()
WHERE user_id = '<USER_UUID>'::uuid AND plan_type = 'video_tokens';
```

Если строки ещё нет — лучше один раз вызвать `add_user_video_tokens(uuid, 2500)` вместо голого `UPDATE`.

---

## 5. После правок

Пусть человек **выйдет и зайдёт** или обновит страницу профиля / студии — подтянется актуальное состояние из API.
