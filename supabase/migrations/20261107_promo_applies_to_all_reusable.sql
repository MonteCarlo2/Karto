-- Промокод «на всё и многоразово»: applies_to_all (любой вид услуги) и reusable (много раз одним пользователем).
alter table public.promo_campaigns add column if not exists applies_to_all boolean not null default false;
alter table public.promo_campaigns add column if not exists reusable boolean not null default false;
alter table public.promo_redemptions drop constraint if exists promo_redemptions_campaign_id_user_id_key;
create unique index if not exists promo_redemptions_campaign_payment_key on public.promo_redemptions (campaign_id, payment_id);

-- Один раз на человека остаётся для всех кампаний, кроме reusable (раньше это держал уникальный ключ).
create or replace function public.promo_redemptions_enforce_once()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if not coalesce((select reusable from public.promo_campaigns where id = new.campaign_id), false) then
    perform pg_advisory_xact_lock(hashtextextended(new.campaign_id::text || ':' || new.user_id::text, 0));
    if exists (select 1 from public.promo_redemptions where campaign_id = new.campaign_id and user_id = new.user_id) then
      raise exception 'promo already redeemed' using errcode = '23505';
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.promo_redemptions_enforce_once() from public, anon, authenticated;
drop trigger if exists promo_redemptions_once on public.promo_redemptions;
create trigger promo_redemptions_once before insert on public.promo_redemptions for each row execute function public.promo_redemptions_enforce_once();
