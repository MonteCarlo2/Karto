-- Seller Hub: решение ИИ как стратегия (цель, шаги, программа цены, проверки), ход стратегии и история неудачных попыток. Только новые поля.
alter table public.seller_hub_ai_findings add column if not exists task_ids jsonb not null default '[]'::jsonb;
alter table public.seller_hub_ai_findings add column if not exists strategy jsonb;
alter table public.seller_hub_ai_findings add column if not exists strategy_state jsonb not null default '{}'::jsonb;
alter table public.seller_hub_ai_findings add column if not exists attempts jsonb not null default '[]'::jsonb;
comment on column public.seller_hub_ai_findings.strategy is 'Стратегия решения: цель, шаги, программа цены (шаг, период, предел), проверки и критерии успеха, запасной план.';
comment on column public.seller_hub_ai_findings.strategy_state is 'Ход стратегии: когда принята, оценка по контрольным точкам, итог (worked / not_worked / running).';
comment on column public.seller_hub_ai_findings.attempts is 'Прошлые неудачные попытки по этому товару, которые учитывает ИИ при новом решении.';
