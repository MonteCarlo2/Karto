-- Seller Hub: предложенное ИИ действие в находке. Только новое поле.
alter table public.seller_hub_ai_findings add column if not exists action jsonb;
comment on column public.seller_hub_ai_findings.action is 'Предложенное ИИ действие (пока только цена: направление и ступень 1–3%). Число цены считает программа, ограничители проверяют его.';
