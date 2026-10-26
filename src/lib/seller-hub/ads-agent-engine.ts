import { evaluateAutopay, validateAutopayParams, type AdAgentMode } from "@/lib/seller-hub/ads-agent";
import type { AdAdvice, AdvisorProduct } from "@/lib/seller-hub/ads-advisor";
import type { BidRow } from "@/lib/seller-hub/ads-bids";
import { AD_BID_MAX_RAISE, AD_BID_MAX_RUB } from "@/lib/seller-hub/ads-bid";
import type { AdsNmRow } from "@/lib/seller-hub/ads-metrics";
import type { SellerAdCampaignRow } from "@/lib/seller-hub/types";

/**
 * Агент рекламы: правила и предложения. Чистая логика без обращений к WB и базе.
 * Агент только решает, что предложить; выполняет решение отдельный слой с теми же границами и подтверждением человека
 * (режим «предлагать»). Режим «автопилот» хранится в правиле, но исполняется только серверным планировщиком.
 */

export type AgentRuleKind = "autopay" | "waste_guard" | "drr_guard" | "bid_climb" | "test_ads";

export type AgentRule = {
  kind: AgentRuleKind;
  enabled: boolean;
  mode: AdAgentMode;
  params: Record<string, number>;
};

export type RuleParamMeta = { key: string; label: string; min: number; max: number; step: number; unit: string; default: number };

export const RULE_META: Record<AgentRuleKind, { title: string; description: string; params: RuleParamMeta[] }> = {
  autopay: {
    title: "Автопополнение бюджета",
    description: "Когда остаток бюджета активной кампании упал ниже порога, предлагает пополнить её со счёта продвижения. За сутки не больше лимита и не больше, чем есть на счёте.",
    params: [
      { key: "minBudgetRub", label: "Пополнять, когда остаток ниже", min: 100, max: 100000, step: 100, unit: "₽", default: 500 },
      { key: "topUpRub", label: "Пополнять на", min: 100, max: 100000, step: 100, unit: "₽", default: 1000 },
      { key: "dailyCapRub", label: "Не больше за сутки на кампанию", min: 100, max: 100000, step: 100, unit: "₽", default: 3000 },
    ],
  },
  waste_guard: {
    title: "Реклама без заказов",
    description: "Находит товары, на которых расход уже превысил маржу с одной продажи, а заказов нет, и предлагает поставить кампанию на паузу или убрать товар из кампании.",
    params: [],
  },
  drr_guard: {
    title: "Защита от убыточного ДРР",
    description: "Если ДРР товара выше его маржи, реклама съедает всю прибыль. Агент предлагает снизить ставку на заданный шаг.",
    params: [
      { key: "stepPercent", label: "Снижать ставку на", min: 5, max: 50, step: 5, unit: "%", default: 20 },
      { key: "overPp", label: "Срабатывать, когда ДРР выше маржи на", min: 0, max: 30, step: 1, unit: "п. п.", default: 0 },
    ],
  },
  test_ads: {
    title: "Тестовая реклама для товаров без продвижения",
    description: "Находит товары с маржой и остатком, которые не продаются и не рекламируются, и предлагает создать для них тестовую кампанию. Кампания создаётся без запуска и без списания денег: бюджет и запуск вы подтверждаете отдельно.",
    params: [],
  },
  bid_climb: {
    title: "Подъём ставки, где есть запас по марже",
    description: "Если у товара есть запас по марже после ДРР и ставка ниже конкурентной по данным WB, агент предлагает поднять ставку, чтобы получить больше показов. Шаг ограничен.",
    params: [
      { key: "minHeadroomPp", label: "Нужен запас по марже не меньше", min: 1, max: 50, step: 1, unit: "п. п.", default: 5 },
      { key: "minOrders", label: "И не меньше заказов за период", min: 1, max: 100, step: 1, unit: "шт.", default: 3 },
      { key: "maxStepPercent", label: "Поднимать не больше чем на", min: 5, max: 100, step: 5, unit: "%", default: 25 },
    ],
  },
};

export const AGENT_RULE_KINDS = Object.keys(RULE_META) as AgentRuleKind[];

/** Правила по умолчанию: выключены и в режиме «предлагать». */
export function defaultRules(): AgentRule[] {
  return AGENT_RULE_KINDS.map((kind) => ({
    kind,
    enabled: false,
    mode: "suggest",
    params: Object.fromEntries(RULE_META[kind].params.map((p) => [p.key, p.default])),
  }));
}

/** Приводит сохранённые правила к полному набору: недостающие берём по умолчанию, лишние и неверные параметры отбрасываем. */
export function normalizeRules(stored: Array<{ kind?: unknown; enabled?: unknown; mode?: unknown; params?: unknown }>): AgentRule[] {
  const byKind = new Map(stored.map((s) => [s.kind, s]));
  return defaultRules().map((base) => {
    const row = byKind.get(base.kind);
    if (!row) return base;
    const params = { ...base.params };
    const given = row.params && typeof row.params === "object" ? (row.params as Record<string, unknown>) : {};
    for (const meta of RULE_META[base.kind].params) {
      const v = given[meta.key];
      if (typeof v === "number" && Number.isFinite(v) && v >= meta.min && v <= meta.max) params[meta.key] = v;
    }
    return { kind: base.kind, enabled: row.enabled === true, mode: row.mode === "auto" ? "auto" : "suggest", params };
  });
}

/** Проверка параметров правила перед сохранением. null — порядок. */
export function validateRule(rule: { kind: string; mode: string; params: Record<string, unknown> }): string | null {
  if (!AGENT_RULE_KINDS.includes(rule.kind as AgentRuleKind)) return "Неизвестное правило";
  if (rule.mode !== "suggest" && rule.mode !== "auto") return "Режим — «предлагать» или «автопилот»";
  const kind = rule.kind as AgentRuleKind;
  for (const meta of RULE_META[kind].params) {
    const v = rule.params[meta.key];
    if (typeof v !== "number" || !Number.isFinite(v) || v < meta.min || v > meta.max) {
      return `${meta.label}: значение от ${meta.min} до ${meta.max} ${meta.unit}`;
    }
    if (kind === "autopay" && !Number.isInteger(v)) return "Суммы пополнения — целые рубли";
  }
  if (kind === "autopay") {
    return validateAutopayParams({
      minBudgetRub: rule.params.minBudgetRub as number,
      topUpRub: rule.params.topUpRub as number,
      dailyCapRub: rule.params.dailyCapRub as number,
    });
  }
  return null;
}

export type AgentAction =
  | { type: "deposit"; campaignId: string; sumRub: number }
  | { type: "pause"; campaignId: string }
  | { type: "remove_nm"; campaignId: string; nmId: string }
  | { type: "bid"; advertId: string; nmId: string; bidRub: number }
  | { type: "create_campaign"; nmId: string; name: string }
  | { type: "price"; nmId: string; targetRub: number; baseRub: number; discount: number; currentRub: number;
      /** Базовая цена, которую видел человек, когда агент предложил действие: перед записью сверяется с WB. */
      currentBaseRub?: number | null };

export type AgentProposal = {
  id: string;
  rule: AgentRuleKind;
  title: string;
  facts: string[];
  /** Что изменится и чем рискуем. */
  effect: string;
  risk: "low" | "medium";
  action: AgentAction;
};

const rub = (v: number) => `${Math.round(v).toLocaleString("ru-RU")} ₽`;
const rub2 = (v: number) => `${v.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ₽`;
const pct = (v: number) => `${v.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%`;
const round2 = (v: number) => Math.round(v * 100) / 100;

export function buildAgentProposals(input: {
  rules: AgentRule[];
  campaigns: SellerAdCampaignRow[];
  adsByProduct: AdsNmRow[];
  products: AdvisorProduct[];
  advice: AdAdvice[];
  bids: BidRow[];
  accountRub: number | null;
  depositedTodayRub: Record<string, number>;
  titles: Map<string, string>;
}): { proposals: AgentProposal[]; skipped: Array<{ rule: AgentRuleKind; text: string }> } {
  const proposals: AgentProposal[] = [];
  const skipped: Array<{ rule: AgentRuleKind; text: string }> = [];
  const enabled = new Map(input.rules.filter((r) => r.enabled).map((r) => [r.kind, r]));
  const productByNm = new Map(input.products.map((p) => [p.nmId, p]));
  const bidByPair = new Map(input.bids.map((b) => [`${b.advertId}:${b.nmId}`, b]));
  const nameOf = (nmId: string) => input.titles.get(nmId) ?? `Артикул ${nmId}`;

  const autopay = enabled.get("autopay");
  if (autopay) {
    const params = { minBudgetRub: autopay.params.minBudgetRub!, topUpRub: autopay.params.topUpRub!, dailyCapRub: autopay.params.dailyCapRub! };
    const { deposits, skipped: notDone } = evaluateAutopay({ params, campaigns: input.campaigns, depositedTodayRub: input.depositedTodayRub, accountRub: input.accountRub });
    for (const d of deposits) {
      proposals.push({
        id: `autopay-${d.campaignId}`,
        rule: "autopay",
        title: `Пополнить кампанию «${d.campaignName}» на ${rub(d.sumRub)}`,
        facts: [d.reason, `Остаток на счёте продвижения: ${input.accountRub != null ? rub(input.accountRub) : "неизвестен"}.`],
        effect: "Деньги переходят со счёта продвижения в бюджет кампании, показы не прервутся.",
        risk: "low",
        action: { type: "deposit", campaignId: d.campaignId, sumRub: d.sumRub },
      });
    }
    for (const s of notDone) skipped.push({ rule: "autopay", text: `${s.campaignName}: ${s.reason}` });
  }

  if (enabled.has("waste_guard")) {
    for (const a of input.advice) {
      if ((a.kind !== "no_orders" && a.kind !== "margin_eaten") || !a.fix) continue;
      if (a.fix.type === "pause") {
        proposals.push({ id: `waste-${a.id}`, rule: "waste_guard", title: a.title, facts: a.facts, effect: `Кампания «${a.fix.campaignName}» остановится, расход прекратится. Запустить её снова можно в один клик.`, risk: "low", action: { type: "pause", campaignId: a.fix.campaignId } });
      } else if (a.fix.type === "remove_nm") {
        proposals.push({ id: `waste-${a.id}`, rule: "waste_guard", title: a.title, facts: a.facts, effect: "Товар уйдёт из кампании, остальные товары кампании продолжат показываться.", risk: "low", action: { type: "remove_nm", campaignId: a.fix.campaignId, nmId: a.fix.nmId } });
      }
    }
  }

  if (enabled.has("test_ads")) {
    for (const a of input.advice) {
      if (a.kind !== "candidate" || !a.nmId) continue;
      proposals.push({
        id: `test-${a.nmId}`,
        rule: "test_ads",
        title: a.title,
        facts: a.facts,
        effect: "Создастся кампания для одного товара в статусе «готова к запуску». Деньги не списываются и показы не начинаются, пока вы не пополните бюджет и не запустите её.",
        risk: "low",
        action: { type: "create_campaign", nmId: a.nmId, name: `KARTO тест: ${nameOf(a.nmId)}`.slice(0, 100) },
      });
    }
  }

  const drrGuard = enabled.get("drr_guard");
  const climb = enabled.get("bid_climb");
  for (const row of input.adsByProduct) {
    if (!(row.spend > 0) || !(row.orders > 0) || !(row.orderSum > 0)) continue;
    const product = productByNm.get(row.nmId);
    const margin = product?.marginPercent ?? null;
    if (margin == null) continue;
    const drr = (row.spend / row.orderSum) * 100;
    const holders = input.campaigns.filter((c) => c.status === 9 && c.paymentType === "cpm" && (c.bidType == null || c.bidType === "manual") && (c.bids ?? []).some((b) => b.nmId === row.nmId && (b.searchRub ?? 0) > 0));

    if (drrGuard && drr > margin + drrGuard.params.overPp!) {
      for (const c of holders) {
        const current = (c.bids ?? []).find((b) => b.nmId === row.nmId)!.searchRub!;
        const next = round2(current * (1 - drrGuard.params.stepPercent! / 100));
        if (!(next > 0) || next >= current) continue;
        proposals.push({
          id: `drr-${c.id}-${row.nmId}`,
          rule: "drr_guard",
          title: `Снизить ставку на «${nameOf(row.nmId)}»: ${rub2(current)} → ${rub2(next)}`,
          facts: [`ДРР товара ${pct(drr)} при марже ${pct(margin)}: реклама съедает больше, чем товар зарабатывает.`, `Расход ${rub(row.spend)}, заказов по рекламе ${row.orders} на ${rub(row.orderSum)}.`],
          effect: "Показов станет меньше, расход упадёт. Заказов по рекламе может стать меньше: смотрите ДРР через несколько дней.",
          risk: "medium",
          action: { type: "bid", advertId: c.id, nmId: row.nmId, bidRub: next },
        });
      }
    }

    if (climb && !(drrGuard && drr > margin + drrGuard.params.overPp!)) {
      const headroom = margin - drr;
      if (headroom >= climb.params.minHeadroomPp! && row.orders >= climb.params.minOrders!) {
        for (const c of holders) {
          const bidRow = bidByPair.get(`${c.id}:${row.nmId}`);
          if (!bidRow || bidRow.verdict !== "below_competitive" || bidRow.competitiveRub == null || bidRow.currentRub == null) continue;
          const cap = Math.min(bidRow.currentRub * (1 + climb.params.maxStepPercent! / 100), bidRow.currentRub * AD_BID_MAX_RAISE, AD_BID_MAX_RUB);
          const next = round2(Math.min(bidRow.competitiveRub, cap));
          if (!(next > bidRow.currentRub)) continue;
          proposals.push({
            id: `climb-${c.id}-${row.nmId}`,
            rule: "bid_climb",
            title: `Поднять ставку на «${nameOf(row.nmId)}»: ${rub2(bidRow.currentRub)} → ${rub2(next)}`,
            facts: [
              `Запас по марже ${pct(headroom)}: маржа ${pct(margin)}, ДРР ${pct(drr)}, заказов по рекламе ${row.orders}.`,
              `Ваша ставка ${rub2(bidRow.currentRub)} ниже конкурентной ${rub2(bidRow.competitiveRub)} по данным WB${next < bidRow.competitiveRub ? `; поднимаем не больше чем на ${climb.params.maxStepPercent}% за раз` : ""}.`,
            ],
            effect: "Показов и заказов может стать больше, расход вырастет. Если ДРР приблизится к марже, правило защиты предложит снизить ставку.",
            risk: "medium",
            action: { type: "bid", advertId: c.id, nmId: row.nmId, bidRub: next },
          });
        }
      }
    }
  }

  // Одно предложение на одно действие над одной целью.
  const seen = new Set<string>();
  const unique = proposals.filter((p) => {
    const target = "campaignId" in p.action ? p.action.campaignId : "advertId" in p.action ? p.action.advertId : "";
    const key = `${p.action.type}:${target}:${"nmId" in p.action ? p.action.nmId : ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { proposals: unique, skipped };
}
