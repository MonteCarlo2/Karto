-- Мониторинг лимита welcome-пакетов (2 eligible на device за скользящие 30 дней).
-- Таблица: welcome_perk_registrations
-- Миграция: supabase/migrations/20260831_welcome_perk_registrations.sql

-- 1) Все записи (последние сверху)
SELECT
  w.user_id,
  u.email,
  w.perks_eligible,
  w.registered_at,
  left(w.device_hash, 12) || '…' AS device_hash_prefix
FROM public.welcome_perk_registrations w
LEFT JOIN auth.users u ON u.id = w.user_id
ORDER BY w.registered_at DESC
LIMIT 100;

-- 2) Сколько eligible-слотов занято на одном device за последние 30 дней
-- (подставьте device_hash из строки выше или из логов [welcome-perks])
SELECT
  device_hash,
  COUNT(*) FILTER (WHERE perks_eligible = true) AS eligible_in_window,
  COUNT(*) AS total_rows
FROM public.welcome_perk_registrations
WHERE device_hash IS NOT NULL
  AND registered_at >= now() - interval '30 days'
GROUP BY device_hash
HAVING COUNT(*) FILTER (WHERE perks_eligible = true) >= 1
ORDER BY eligible_in_window DESC, total_rows DESC;

-- 3) Аккаунты без бонусов (perks_eligible = false)
SELECT
  w.user_id,
  u.email,
  w.registered_at
FROM public.welcome_perk_registrations w
LEFT JOIN auth.users u ON u.id = w.user_id
WHERE w.perks_eligible = false
ORDER BY w.registered_at DESC;

-- 4) Когда освободится слот для device (самая старая eligible-регистрация в окне)
SELECT
  device_hash,
  MIN(registered_at) FILTER (WHERE perks_eligible = true) AS oldest_eligible_at,
  MIN(registered_at) FILTER (WHERE perks_eligible = true) + interval '30 days' AS next_slot_opens_at
FROM public.welcome_perk_registrations
WHERE device_hash IS NOT NULL
  AND registered_at >= now() - interval '30 days'
GROUP BY device_hash;

-- ── Тест окна 30 дней (ТОЛЬКО dev/staging, не на проде с реальными users) ──
-- Сдвинуть registered_at двух eligible-аккаунтов на 31 день назад → следующая регистрация с того же браузера должна получить бонусы.
-- UPDATE public.welcome_perk_registrations
-- SET registered_at = now() - interval '31 days'
-- WHERE user_id IN ('uuid-1', 'uuid-2') AND perks_eligible = true;
