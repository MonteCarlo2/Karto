import type { SupabaseClient } from "@supabase/supabase-js";

import { AUTO_REPLY_PACKAGES } from "@/lib/auto-replies-pricing";

import { activateAutoReplySubscription } from "@/lib/auto-replies-balance";



export function parseAutoRenewFromMetadata(meta: Record<string, unknown>): boolean {

  const raw = meta.auto_renew;

  if (raw === false || raw === "false" || raw === "0") return false;

  return true;

}



export async function creditAutoReplyFromPayment(

  supabase: SupabaseClient,

  userId: string,

  tariffIndex: number,

  opts: { autoRenew: boolean; paymentMethodId?: string | null; billingAnchorIso?: string | null }

): Promise<{ ok: boolean; error?: string }> {

  const idx = Math.min(AUTO_REPLY_PACKAGES.length - 1, Math.max(0, tariffIndex));

  const pack = AUTO_REPLY_PACKAGES[idx];

  return activateAutoReplySubscription(supabase, userId, pack.replies, {

    tariffIndex: idx,

    autoRenew: opts.autoRenew,

    paymentMethodId: opts.paymentMethodId,

    billingAnchorIso: opts.billingAnchorIso,

  });

}


