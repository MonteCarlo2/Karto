-- Seller Hub: задача из уведомления «Событий» (task_type = 'TASK_FROM_EVENT').
-- Открытая задача раньше была одна на пару «тип + товар». Для задач из событий нужна одна на каждое событие, поэтому
-- в ключ уникальности добавляется source_event_id, но только для этого типа: для всех остальных типов правило прежнее.

drop index if exists public.seller_hub_tasks_open_uidx;

create unique index if not exists seller_hub_tasks_open_uidx
  on public.seller_hub_tasks (
    user_id,
    marketplace_id,
    task_type,
    coalesce(nm_id, ''),
    (case when task_type = 'TASK_FROM_EVENT' then coalesce(source_event_id, '') else '' end)
  )
  where status in ('active', 'in_progress', 'snoozed');
