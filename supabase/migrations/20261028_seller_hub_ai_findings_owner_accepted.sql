-- Seller Hub: владелец принял действие из находки ИИ. Только новое поле.
alter table public.seller_hub_ai_findings add column if not exists owner_accepted boolean not null default false;
comment on column public.seller_hub_ai_findings.owner_accepted is 'Владелец принял действие из находки: оно становится предложением «Выполнить» даже без включённого сценария цен.';
