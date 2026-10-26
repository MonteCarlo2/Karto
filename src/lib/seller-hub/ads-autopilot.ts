import { recordAction } from "@/lib/seller-hub/action-log";
import { evaluateAutopay, validateAutopayParams, type AutopayParams } from "@/lib/seller-hub/ads-agent";
import { parseAdDepositRequest } from "@/lib/seller-hub/ads-deposit";
import { moscowDateKey } from "@/lib/seller-hub/complete-days";
import { openSellerHubWbToken } from "@/lib/seller-hub/wb-token";
import { supabaseSellerHubSecretDb } from "@/lib/seller-hub/wb-token-store";
import { fetchWbAdsSnapshot } from "@/lib/services/wildberries/advert-client";
import { depositWbAdBudget } from "@/lib/services/wildberries/ads-write-client";
import { createServerClient } from "@/lib/supabase/server";

/**
 * Автопилот автопополнения: серверный проход по пользователям, у которых правило «Автопополнение» включено в режиме «автопилот».
 * Деньги двигаются только в рамках правила: порог остатка, разовая сумма, суточный лимит на кампанию, не больше, чем на счёте продвижения.
 * Каждое пополнение проходит те же проверки, что у ручной кнопки, и записывается в журнал от имени агента.
 * При первой ошибке WB проход пользователя останавливается: повторять запись про деньги вслепую нельзя.
 */

export type AutopilotUserResult = {
  userId: string;
  decisions: Array<{ campaignId: string; sumRub: number; reason: string }>;
  executed: Array<{ campaignId: string; sumRub: number }>;
  skipped: string[];
  error?: string;
};

const running = new Set<string>();

export async function runAutopayForUser(userId: string, dry: boolean): Promise<AutopilotUserResult> {
  const out: AutopilotUserResult = { userId, decisions: [], executed: [], skipped: [] };
  if (running.has(userId)) {
    out.skipped.push("Проход для пользователя уже идёт");
    return out;
  }
  running.add(userId);
  try {
    const supabase = createServerClient();
    const { data: rules } = await supabase.from("seller_hub_agent_rules").select("params, enabled, mode").eq("user_id", userId).eq("agent", "ads").eq("kind", "autopay").limit(1);
    const rule = rules?.[0];
    if (!rule || rule.enabled !== true || rule.mode !== "auto") {
      out.skipped.push("Автопополнение не включено в режиме автопилота");
      return out;
    }
    const p = (rule.params ?? {}) as Record<string, unknown>;
    const params: AutopayParams = { minBudgetRub: Number(p.minBudgetRub), topUpRub: Number(p.topUpRub), dailyCapRub: Number(p.dailyCapRub) };
    const invalid = validateAutopayParams(params);
    if (invalid) {
      out.skipped.push(`Параметры правила неверны: ${invalid}`);
      return out;
    }

    const opened = await openSellerHubWbToken(userId, supabaseSellerHubSecretDb(supabase));
    if (!opened.ok) {
      out.skipped.push("Кабинет Wildberries не подключён или токен недоступен");
      return out;
    }
    const snapshot = await fetchWbAdsSnapshot(opened.token);

    const dayStart = new Date(`${moscowDateKey(Date.now())}T00:00:00+03:00`).toISOString();
    const { data: actions } = await supabase.from("seller_hub_agent_actions").select("target_id, request").eq("user_id", userId).eq("agent", "ads").eq("action", "ad_deposit").eq("result", "ok").gte("created_at", dayStart);
    const depositedToday: Record<string, number> = {};
    for (const a of actions ?? []) {
      const sum = (a.request as { sum?: unknown } | null)?.sum;
      if (a.target_id != null && typeof sum === "number") depositedToday[String(a.target_id)] = (depositedToday[String(a.target_id)] ?? 0) + sum;
    }

    const { deposits, skipped } = evaluateAutopay({ params, campaigns: snapshot.campaigns, depositedTodayRub: depositedToday, accountRub: snapshot.accountNet ?? null });
    out.decisions = deposits.map((d) => ({ campaignId: d.campaignId, sumRub: d.sumRub, reason: d.reason }));
    out.skipped.push(...skipped.map((s) => `${s.campaignName}: ${s.reason}`));
    if (dry) return out;

    for (const d of deposits) {
      const parsed = parseAdDepositRequest({ campaignId: Number(d.campaignId), sum: d.sumRub, confirmSum: d.sumRub });
      if (!parsed.ok) {
        out.error = parsed.error;
        break;
      }
      try {
        const result = await depositWbAdBudget(opened.token, parsed.request);
        await recordAction({ userId, agent: "ads", action: "ad_deposit", targetId: Number(d.campaignId), request: { campaignId: Number(d.campaignId), sum: d.sumRub, rule: "autopay" }, result: result.ok ? "ok" : "error", message: result.ok ? d.reason : (result.error ?? null), initiator: "agent" });
        if (!result.ok) {
          out.error = result.error ?? "WB не принял пополнение";
          break;
        }
        out.executed.push({ campaignId: d.campaignId, sumRub: d.sumRub });
      } catch (e) {
        out.error = e instanceof Error ? e.message : "Ошибка пополнения";
        await recordAction({ userId, agent: "ads", action: "ad_deposit", targetId: Number(d.campaignId), request: { campaignId: Number(d.campaignId), sum: d.sumRub, rule: "autopay" }, result: "error", message: out.error, initiator: "agent" });
        break;
      }
    }
    return out;
  } catch (e) {
    out.error = e instanceof Error ? e.message : "Ошибка прохода";
    return out;
  } finally {
    running.delete(userId);
  }
}

/** Пользователи, у которых включён автопилот автопополнения. */
export async function usersWithAutopay(): Promise<string[]> {
  const { data } = await createServerClient().from("seller_hub_agent_rules").select("user_id").eq("agent", "ads").eq("kind", "autopay").eq("enabled", true).eq("mode", "auto");
  return [...new Set((data ?? []).map((r) => String(r.user_id)))];
}
