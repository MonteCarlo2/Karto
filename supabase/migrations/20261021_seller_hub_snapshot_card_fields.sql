-- Seller Hub «События»: настоящие изменения полей карточки («было → стало»).
-- Храним отпечаток описания (не текст), число характеристик и наличие видео. Только добавление колонок.

alter table public.seller_hub_product_snapshots
  add column if not exists description_hash text,
  add column if not exists description_length integer,
  add column if not exists characteristics_count integer,
  add column if not exists has_video boolean;
