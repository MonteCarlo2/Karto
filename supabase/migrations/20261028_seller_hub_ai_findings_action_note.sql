-- Seller Hub: причина, по которой принятое действие пока не стало предложением. Только новое поле.
alter table public.seller_hub_ai_findings add column if not exists action_note text not null default '';
comment on column public.seller_hub_ai_findings.action_note is 'Почему принятое действие сейчас не стало предложением (ограничитель цены, нет данных). Пусто, если предложение создано.';
