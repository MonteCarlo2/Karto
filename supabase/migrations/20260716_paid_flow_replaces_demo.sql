-- Покупка полного Потока и удаление демо должны быть одной транзакцией.
CREATE SCHEMA IF NOT EXISTS app_private;

CREATE OR REPLACE FUNCTION app_private.replace_demo_on_paid_flow()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.plan_type = 'flow' AND NEW.plan_volume > 0 THEN
    DELETE FROM public.user_subscriptions
    WHERE user_id = NEW.user_id
      AND plan_type = 'demo_flow';

    UPDATE public.demo_flow_grants
    SET granted_at = COALESCE(granted_at, now()),
        removed_for_paid_at = COALESCE(removed_for_paid_at, now())
    WHERE user_id = NEW.user_id;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.replace_demo_on_paid_flow() FROM PUBLIC;

DROP TRIGGER IF EXISTS user_subscriptions_replace_demo_on_paid_flow
  ON public.user_subscriptions;
CREATE TRIGGER user_subscriptions_replace_demo_on_paid_flow
AFTER INSERT OR UPDATE OF plan_type, plan_volume
ON public.user_subscriptions
FOR EACH ROW
EXECUTE FUNCTION app_private.replace_demo_on_paid_flow();

-- Нормализовать возможное старое пересечение: оплаченный Поток всегда главнее.
DELETE FROM public.user_subscriptions AS demo
USING public.user_subscriptions AS paid
WHERE demo.user_id = paid.user_id
  AND demo.plan_type = 'demo_flow'
  AND paid.plan_type = 'flow'
  AND paid.plan_volume > 0;

UPDATE public.demo_flow_grants AS grants
SET granted_at = COALESCE(grants.granted_at, now()),
    removed_for_paid_at = COALESCE(grants.removed_for_paid_at, now())
WHERE EXISTS (
  SELECT 1
  FROM public.user_subscriptions AS paid
  WHERE paid.user_id = grants.user_id
    AND paid.plan_type = 'flow'
    AND paid.plan_volume > 0
);
