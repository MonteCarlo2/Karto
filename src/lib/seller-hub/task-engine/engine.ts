import { thresholdsFor, type TaskSettings } from "./config";
import {
  collectDemandCandidates,
  finalizeDemandDrafts,
  storeOrderSum28d,
  type DemandCandidate,
  type DemandTaskType,
} from "./demand";
import { ABSENT_GRACE_MS, ABSENT_SINCE_KEY, CONDITION_CLEARED_RESOLUTION, DISABLED_BY_SETTINGS_RESOLUTION, isUserCompleted } from "./lifecycle";
import { buildStoreMoneyContext } from "./severity";
import {
  collectDrafts,
  collectStoreMarginDrafts,
  finalizeNoSalesDrafts,
} from "./rules";
import {
  collectNegativeShareCandidates,
  elevateNegativeShareWithConversion,
  finalizeNegativeShareDrafts,
  ruleFeedbacksAccess,
  ruleUnansweredNegativeReview,
  ruleUnansweredPositiveReviews,
  ruleUnansweredQuestion,
} from "./reviews";
import { rulePromoLoss, rulePromoOpportunity } from "./promo";
import { ruleAdCampaignStopped, ruleAdDrrOverMargin, ruleAdNoOrders, ruleAdNoStock } from "./ads";
import { ruleAdEfficiencyDrop, ruleAdScaleUp, ruleAdWeakCard } from "./ads-smart";
import { ruleCostsEatMargin, ruleLowBuyout, ruleLowRating, storeRatingOf } from "./quality";
import { scoreTask } from "./scoring";
import { buildShopBuyoutContext } from "./stock-math";
import {
  OPEN_TASK_STATUSES,
  type SellerTask,
  type StoreTaskFacts,
  type TaskBaseline,
  type TaskDraft,
  type TaskEventRef,
  type TaskFact,
  type TaskStatus,
  type TaskType,
} from "./types";

const AD_RULES: ReadonlyArray<readonly [TaskType, (fact: TaskFact) => TaskDraft | null]> = [
  ["TASK_AD_NO_ORDERS", ruleAdNoOrders],
  ["TASK_AD_DRR_OVER_MARGIN", ruleAdDrrOverMargin],
  ["TASK_AD_CAMPAIGN_STOPPED", ruleAdCampaignStopped],
  ["TASK_AD_NO_STOCK", ruleAdNoStock],
  ["TASK_AD_EFFICIENCY_DROP", ruleAdEfficiencyDrop],
  ["TASK_AD_WEAK_CARD", ruleAdWeakCard],
  ["TASK_AD_SCALE_UP", ruleAdScaleUp],
];

const AD_TASK_TYPES: ReadonlySet<TaskType> = new Set(AD_RULES.map(([type]) => type));

export type TaskEngineInput = {
  now: string;
  storeId: string;
  facts: TaskFact[];
  baselines: Record<string, TaskBaseline>;
  store: StoreTaskFacts;
  settings: TaskSettings;
  tasks: SellerTask[];
  events: TaskEventRef[];
  /** Начало истории снимков остатков кабинета (min created_at). */
  stockHistorySince?: string | null;
  createId?: (draft: TaskDraft, now: string) => string;
};

export type TaskEngineResult = {
  tasks: SellerTask[];
  baselines: Record<string, TaskBaseline>;
};

function taskKey(type: string, nmId: string | null): string {
  return `${type}:${nmId ?? ""}`;
}

function isOpen(status: TaskStatus): boolean {
  return OPEN_TASK_STATUSES.includes(status);
}

function nextStockOutAt(
  fact: TaskFact,
  previous: TaskBaseline | null,
  now: string,
): string | null {
  if (fact.stock == null || fact.stock > 0) return null;
  if (previous?.stockOutAt) return previous.stockOutAt;
  if (previous?.stock != null && previous.stock > 0) return now;
  return null;
}

function baselineFrom(fact: TaskFact, now: string, previous: TaskBaseline | null): TaskBaseline {
  return {
    stock: fact.stock,
    promoPrice: fact.promoPrice,
    marginPercent: fact.marginPercent,
    salesQty: fact.salesQty,
    priorSalesQty: fact.priorSalesQty,
    coverDays: fact.coverDays,
    updatedAt: now,
    stockOutAt: nextStockOutAt(fact, previous, now),
  };
}

function eventIdFor(events: TaskEventRef[], draft: TaskDraft): string | null {
  if (!draft.eventKind) return null;
  const match = events.find((event) => event.kind === draft.eventKind && event.nmId === draft.nmId);
  return match?.id ?? null;
}

function materialize(draft: TaskDraft, input: TaskEngineInput, id: string, createdAt: string): SellerTask {
  const scored = scoreTask(draft);
  return {
    id,
    storeId: input.storeId,
    nmId: draft.nmId,
    itemId: draft.itemId,
    productTitle: draft.productTitle,
    vendorCode: draft.vendorCode,
    type: draft.type,
    category: draft.category,
    severity: scored.severity,
    status: "active",
    title: draft.title,
    description: draft.description,
    reason: draft.reason,
    evidence: draft.evidence,
    recommendation: draft.recommendation,
    actionType: draft.actionType,
    businessImpactType: draft.businessImpactType,
    score: scored.score,
    sourceEventId: eventIdFor(input.events, draft),
    createdAt,
    updatedAt: input.now,
    snoozeUntil: null,
    resolvedAt: null,
    resolution: null,
  };
}

function refresh(task: SellerTask, draft: TaskDraft, input: TaskEngineInput): SellerTask {
  const scored = scoreTask(draft);
  let status = task.status;
  if (status === "snoozed" && task.snoozeUntil && Date.parse(task.snoozeUntil) <= Date.parse(input.now)) {
    status = "active";
  }
  return {
    ...task,
    status,
    severity: scored.severity,
    title: draft.title,
    description: draft.description,
    reason: draft.reason,
    evidence: draft.evidence,
    recommendation: draft.recommendation,
    actionType: draft.actionType,
    businessImpactType: draft.businessImpactType,
    score: scored.score,
    sourceEventId: task.sourceEventId ?? eventIdFor(input.events, draft),
    updatedAt: input.now,
    snoozeUntil: status === "active" ? null : task.snoozeUntil,
  };
}

function closeTask(task: SellerTask, now: string, resolution: string): SellerTask {
  if (task.status === "dismissed") {
    return task.resolvedAt
      ? task
      : { ...task, resolvedAt: now, resolution: task.resolution ?? resolution, updatedAt: now };
  }
  if (!isOpen(task.status)) return task;
  return {
    ...task,
    status: "completed",
    resolvedAt: now,
    resolution,
    updatedAt: now,
  };
}

function latestByKey(tasks: SellerTask[]): Map<string, SellerTask> {
  const map = new Map<string, SellerTask>();
  const ordered = [...tasks].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  for (const task of ordered) {
    if (task.storeId && map.has(taskKey(task.type, task.nmId))) {
      const previous = map.get(taskKey(task.type, task.nmId));
      if (previous && previous.createdAt > task.createdAt) continue;
    }
    map.set(taskKey(task.type, task.nmId), task);
  }
  return map;
}

export function reconcileTasks(input: TaskEngineInput): TaskEngineResult {
  const createId = input.createId ?? ((draft, now) => `task:${draft.type}:${draft.nmId ?? "store"}:${now}`);
  const ownTasks = input.tasks.filter((task) => task.storeId === input.storeId);
  const drafts: TaskDraft[] = [];
  const nextBaselines: Record<string, TaskBaseline> = { ...input.baselines };
  const demandCandidates: DemandCandidate[] = [];
  const storeMoney = buildStoreMoneyContext(input.facts, input.settings.thresholds);
  const storeOrderSum = storeMoney.turnoverRub ?? storeOrderSum28d(input.facts);
  const demandQ = input.settings.thresholds.demandFdrQ;
  const shopBuyout = buildShopBuyoutContext({
    products: input.facts.map((fact) => ({
      pastOrders: fact.pastOrderCount ?? fact.priorOrders,
      pastBuyouts:
        fact.pastBuyoutCount ??
        (fact.pastOrderCount === 0 || fact.priorOrders === 0 ? 0 : null),
    })),
  });
  const stockHistorySince = input.stockHistorySince ?? null;
  const noSalesDrafts = finalizeNoSalesDrafts(
    input.facts,
    input.settings,
    input.now,
    storeMoney,
    input.events,
    stockHistorySince,
  );
  drafts.push(...noSalesDrafts);
  drafts.push(...collectStoreMarginDrafts(input.facts, input.settings, storeMoney));
  const noSalesNmIds = new Set(
    noSalesDrafts.map((d) => d.nmId).filter((id): id is string => Boolean(id)),
  );

  for (const fact of input.facts) {
    const baseline = input.baselines[fact.nmId] ?? null;
    drafts.push(
      ...collectDrafts(
        fact,
        baseline,
        input.settings,
        input.now,
        storeMoney,
        input.events,
        shopBuyout,
        true,
        noSalesNmIds,
        stockHistorySince,
      ),
    );
    nextBaselines[fact.nmId] = baselineFrom(fact, input.now, baseline);

    const enabled: Partial<Record<DemandTaskType, boolean>> = {
      TASK_SALES_DROP: thresholdsFor(input.settings, fact.nmId, "TASK_SALES_DROP") != null,
      TASK_SALES_GROWTH: thresholdsFor(input.settings, fact.nmId, "TASK_SALES_GROWTH") != null,
      TASK_CONVERSION_DROP: thresholdsFor(input.settings, fact.nmId, "TASK_CONVERSION_DROP") != null,
      TASK_LOW_TRAFFIC: thresholdsFor(input.settings, fact.nmId, "TASK_LOW_TRAFFIC") != null,
    };
    const thresholds = input.settings.thresholds;
    demandCandidates.push(
      ...collectDemandCandidates(
        fact,
        {
          now: input.now,
          events: input.events,
          baseline,
          storeOrderSum,
          store: storeMoney,
          hadStockOutAt: Boolean(baseline?.stockOutAt),
        },
        thresholds,
        enabled,
      ),
    );
  }

  drafts.push(...finalizeDemandDrafts(demandCandidates, demandQ));

  const storeRating = storeRatingOf(input.facts);
  for (const fact of input.facts) {
    if (thresholdsFor(input.settings, fact.nmId, "TASK_PROMO_LOSS")) {
      const loss = rulePromoLoss(fact, input.now);
      if (loss) drafts.push(loss);
    }
    if (thresholdsFor(input.settings, fact.nmId, "TASK_PROMO_OPPORTUNITY")) {
      const opportunity = rulePromoOpportunity(fact, input.now);
      if (opportunity) drafts.push(opportunity);
    }
    if (thresholdsFor(input.settings, fact.nmId, "TASK_LOW_BUYOUT")) {
      const draft = ruleLowBuyout(fact, shopBuyout);
      if (draft) drafts.push(draft);
    }
    if (thresholdsFor(input.settings, fact.nmId, "TASK_LOW_RATING")) {
      const draft = ruleLowRating(fact, storeRating);
      if (draft) drafts.push(draft);
    }
    if (thresholdsFor(input.settings, fact.nmId, "TASK_COSTS_EAT_MARGIN")) {
      const draft = ruleCostsEatMargin(fact);
      if (draft) drafts.push(draft);
    }
    for (const [type, rule] of AD_RULES) {
      if (!thresholdsFor(input.settings, fact.nmId, type)) continue;
      const draft = rule(fact);
      if (draft) drafts.push(draft);
    }
  }

  const accessDenied = input.store.feedbacksStatus === "forbidden";
  const accessTask = ruleFeedbacksAccess(input.store);
  if (accessTask && thresholdsFor(input.settings, null, "TASK_FEEDBACKS_ACCESS")) {
    drafts.push(accessTask);
  } else if (!accessDenied && input.store.feedbacksStatus && input.store.feedbacksStatus !== "not_loaded") {
    for (const fact of input.facts) {
      if (thresholdsFor(input.settings, fact.nmId, "TASK_UNANSWERED_NEGATIVE_REVIEW")) {
        const neg = ruleUnansweredNegativeReview(fact);
        if (neg) drafts.push(neg);
      }
      if (thresholdsFor(input.settings, fact.nmId, "TASK_UNANSWERED_QUESTION")) {
        const q = ruleUnansweredQuestion(fact);
        if (q) drafts.push(q);
      }
    }
    if (thresholdsFor(input.settings, null, "TASK_UNANSWERED_POSITIVE_REVIEWS")) {
      const pos = ruleUnansweredPositiveReviews(input.store);
      if (pos) drafts.push(pos);
    }
    if (thresholdsFor(input.settings, null, "TASK_NEGATIVE_SHARE_UP")) {
      drafts.push(...finalizeNegativeShareDrafts(collectNegativeShareCandidates(input.facts), demandQ));
    }
  }

  const finalDrafts = elevateNegativeShareWithConversion(drafts);
  const draftByKey = new Map(finalDrafts.map((draft) => [taskKey(draft.type, draft.nmId), draft]));
  const latest = latestByKey(ownTasks);
  const used = new Set<string>();
  const next: SellerTask[] = [];

  for (const task of ownTasks) {
    // Задача из «События» создана человеком: условия для неё движок не вычисляет, поэтому пересчёт её не трогает.
    if (task.type === "TASK_FROM_EVENT") {
      next.push(task);
      continue;
    }
    const key = taskKey(task.type, task.nmId);
    const draft = draftByKey.get(key);
    // Пользователь отключил такие задачи (тип целиком или по этому товару): закрываем сразу. Это решение человека, а не пропажа данных.
    if (isOpen(task.status) && thresholdsFor(input.settings, task.nmId, task.type) == null) {
      next.push(closeTask(task, input.now, DISABLED_BY_SETTINGS_RESOLUTION));
      continue;
    }
    if (isOpen(task.status)) {
      if (draft && !used.has(key)) {
        next.push(refresh(task, draft, input));
        used.add(key);
      } else if (!draft && input.store.adsReady && AD_TASK_TYPES.has(task.type)) {
        // Реклама прочитана целиком (кампании, ставки, статистика): значит, товар убрали из кампании, кампанию
        // остановили или пополнили. Это уже не «данные не догрузились», держать задачу открытой нельзя.
        next.push(closeTask(task, input.now, CONDITION_CLEARED_RESOLUTION));
      } else if (!draft) {
        // Условие не подтвердилось. Пересчёт идёт и на промежуточных снимках, когда часть данных ещё не догрузилась,
        // поэтому закрывать сразу нельзя: задача «мерцала» бы (закрылась и тут же открылась новой строкой).
        // Помечаем, когда условие пропало, и закрываем, только если оно не вернулось за ABSENT_GRACE_MS.
        const since = typeof task.evidence[ABSENT_SINCE_KEY] === "string" ? Date.parse(task.evidence[ABSENT_SINCE_KEY] as string) : Number.NaN;
        if (!Number.isFinite(since)) {
          next.push({ ...task, evidence: { ...task.evidence, [ABSENT_SINCE_KEY]: input.now }, updatedAt: input.now });
        } else if (Date.parse(input.now) - since >= ABSENT_GRACE_MS) {
          next.push(closeTask(task, input.now, CONDITION_CLEARED_RESOLUTION));
        } else {
          next.push(task);
        }
      } else {
        next.push(task);
      }
      continue;
    }
    if (task.status === "dismissed" && !draft && !task.resolvedAt) {
      next.push(closeTask(task, input.now, CONDITION_CLEARED_RESOLUTION));
      continue;
    }
    if (isUserCompleted(task)) {
      if (!draft) {
        next.push({ ...task, resolution: CONDITION_CLEARED_RESOLUTION, updatedAt: input.now });
      } else {
        used.add(key);
        next.push(task);
      }
      continue;
    }
    next.push(task);
  }

  for (const draft of drafts) {
    const key = taskKey(draft.type, draft.nmId);
    if (used.has(key)) continue;
    const previous = latest.get(key);
    if (previous && isOpen(previous.status)) continue;
    if (previous?.status === "dismissed" && !previous.resolvedAt) continue;
    if (previous && isUserCompleted(previous)) continue;
    const stamp = `${input.now}:${key}`;
    next.push(materialize(draft, input, createId(draft, stamp), input.now));
    used.add(key);
  }

  return { tasks: next, baselines: nextBaselines };
}
