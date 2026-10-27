-- Seller Hub: регулярные задачи автопилота (включаются владельцем, по умолчанию пусто).
alter table public.seller_hub_autopilot_settings add column if not exists routines text[] not null default '{}';
comment on column public.seller_hub_autopilot_settings.routines is 'Регулярные задачи автопилота, включённые владельцем (например minus_queries: раз в сутки минус-фразы для запросов без заказов).';
