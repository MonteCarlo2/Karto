import type { SupabaseClient } from "@supabase/supabase-js";
import { addAutoReplyBillingPeriod } from "@/lib/auto-replies-pricing";
import {
  fetchAutoReplySubscriptionInfo,
  type AutoReplySubscriptionInfo,
} from "@/lib/auto-replies-subscription-info";

export type { AutoReplySubscriptionInfo };
export { fetchAutoReplySubscriptionInfo };

export const AUTO_REPLY_INSUFFICIENT_BALANCE_MSG =
  "На балансе закончились ответы. Пополните пакет в разделе «Цена» на главной.";

export const AUTO_REPLY_CONSUME_FAILED_MSG =
  "Не удалось списать ответ. Попробуйте ещё раз.";

export async function getAutoReplyBalance(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  const info = await fetchAutoReplySubscriptionInfo(supabase, userId);
  return info.balance;
}

export async function consumeAutoReplyCredits(
  supabase: SupabaseClient,
  userId: string,
  amount = 1
): Promise<{ ok: boolean; error?: string; code?: "insufficient_balance" | "rpc_error" }> {
  if (amount <= 0) return { ok: true };

  const { data, error } = await supabase.rpc("consume_auto_reply_credits", {
    p_user_id: userId,
    p_amount: amount,
  });

  if (error) {
    console.error("[auto-replies-balance] consume rpc:", error.message);
    return { ok: false, error: AUTO_REPLY_CONSUME_FAILED_MSG, code: "rpc_error" };
  }
  if (data !== true) {
    return {
      ok: false,
      error: AUTO_REPLY_INSUFFICIENT_BALANCE_MSG,
      code: "insufficient_balance",
    };
  }
  return { ok: true };
}

export interface ActivateAutoReplySubscriptionOpts {
  tariffIndex: number;
  autoRenew: boolean;
  paymentMethodId?: string | null;
  /** При автопродлении — предыдущий next_renew_at; следующее списание = +1 мес. от него (сохраняет 15:00). */
  billingAnchorIso?: string | null;
}

/** Активирует месячный пакет автоответов (сброс лимита, не накопление). */
export async function activateAutoReplySubscription(
  supabase: SupabaseClient,
  userId: string,
  replies: number,
  opts: ActivateAutoReplySubscriptionOpts
): Promise<{ ok: boolean; error?: string }> {
  if (replies <= 0) return { ok: true };

  const now = new Date();
  const nowIso = now.toISOString();
  const anchor = opts.billingAnchorIso ? new Date(opts.billingAnchorIso) : now;
  const nextRenewAt = addAutoReplyBillingPeriod(
    Number.isFinite(anchor.getTime()) ? anchor : now
  );

  const { data: row } = await supabase
    .from("user_subscriptions")
    .select("id")
    .eq("user_id", userId)
    .eq("plan_type", "auto_replies")
    .maybeSingle();

  if (row) {
    const { error } = await supabase
      .from("user_subscriptions")
      .update({ plan_volume: replies, period_start: nowIso })
      .eq("user_id", userId)
      .eq("plan_type", "auto_replies");
    if (error) {
      console.error("[auto-replies-balance] update:", error.message);
      return { ok: false, error: error.message };
    }
  } else {
    const { error } = await supabase.from("user_subscriptions").insert({
      user_id: userId,
      plan_type: "auto_replies",
      plan_volume: replies,
      period_start: nowIso,
      flows_used: 0,
      creative_used: 0,
    });
    if (error) {
      console.error("[auto-replies-balance] insert:", error.message);
      return { ok: false, error: error.message };
    }
  }

  const { error: billingErr } = await supabase.from("auto_reply_billing").upsert(
    {
      user_id: userId,
      tariff_index: opts.tariffIndex,
      auto_renew: opts.autoRenew,
      payment_method_id: opts.autoRenew ? (opts.paymentMethodId ?? null) : null,
      period_start: nowIso,
      next_renew_at: nextRenewAt.toISOString(),
      updated_at: nowIso,
    },
    { onConflict: "user_id" }
  );
  if (billingErr) {
    console.warn("[auto-replies-balance] billing upsert:", billingErr.message);
  }

  return { ok: true };
}

/** @deprecated Используйте activateAutoReplySubscription — пакет месячный, не накопительный. */
export async function addAutoReplyCredits(
  supabase: SupabaseClient,
  userId: string,
  amount: number
): Promise<{ ok: boolean; error?: string }> {
  return activateAutoReplySubscription(supabase, userId, amount, {
    tariffIndex: 0,
    autoRenew: false,
  });
}
