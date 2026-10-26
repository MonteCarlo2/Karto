-- Seller Hub «Задачи»: настройки, которыми реально управляются правила остатков.
-- Правило «Запас скоро закончится» считает поставку по сроку поставки, покрытию после неё и дням на разбор заказа,
-- правило «Избыток запаса» — по числу дней чистого расхода. Раньше эти числа жили только в коде и не настраивались.
-- NULL = значение по умолчанию из кода. Только добавление колонок, существующие данные не затрагиваются.

alter table public.seller_hub_task_settings
  add column if not exists lead_time_days integer,
  add column if not exists supply_cover_days integer,
  add column if not exists reorder_review_days integer,
  add column if not exists excess_cover_days integer;
