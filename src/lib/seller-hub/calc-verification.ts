/**
 * Независимые проверки расчётов Seller Hub (этап 1).
 * Где возможно — не вызываем те же функции, что основной путь UI.
 */

import { contentScore, CONTENT_APPLICABLE_MAX } from "@/lib/seller-hub/product-signal";
import { productUnitSaleEconomics } from "@/lib/seller-hub/product-unit-sale";
import { DEFAULT_TASK_THRESHOLDS } from "@/lib/seller-hub/task-engine/config";
import { taskFactsFromSnapshot } from "@/lib/seller-hub/task-engine/facts";
import { buildStoreMoneyContext } from "@/lib/seller-hub/task-engine/severity";
import { OPEN_TASK_STATUSES, type SellerTask, type TaskFact, type TaskSeverity } from "@/lib/seller-hub/task-engine/types";
import type { SellerCatalogSnapshot } from "@/lib/seller-hub/types";
import { reconcileBankPayment } from "@/lib/seller-hub/unit-economics";
import { reconcileFeedbackRatings } from "@/lib/seller-hub/feedbacks/build-snapshot";
import type { MonthReconcileDiagnostics } from "@/lib/seller-hub/diagnostics";

export type VerifyTone = "ok" | "fail" | "na";

export type VerifySourceStatus = {
  id: string;
  label: string;
  status: "ok" | "pending" | "error" | "not_loaded";
  loadedAt: string | null;
  period: string | null;
  error: string | null;
  fresh24h: boolean | null;
};

export type VerifyCheckRow = {
  id: string;
  title: string;
  tone: VerifyTone;
  summary: string;
  details: string[];
};

export type CalcVerificationReport = {
  builtAt: string;
  sources: VerifySourceStatus[];
  checks: VerifyCheckRow[];
};

/** Пороги важности — копия стандарта для независимой сверки (не импорт decision-пути задач). */
const SEV = {
  turnoverImportant: 0.01,
  turnoverCritical: 0.05,
  grossImportant: 0.05,
  grossCritical: 0.2,
} as const;

const FORBIDDEN_PHRASES = [
  "может быть неточным",
  "расчёт на",
  "до налога",
  "Не учтены: реклама",
  "undefined",
  "NaN",
  "null",
] as const;

function hoursAgo(iso: string | null | undefined, nowMs: number): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return (nowMs - t) / 3_600_000;
}

function isFresh(iso: string | null | undefined, nowMs: number): boolean | null {
  const h = hoursAgo(iso, nowMs);
  if (h == null) return null;
  return h <= 24;
}

function periodLabel(from?: string | null, to?: string | null): string | null {
  if (!from && !to) return null;
  if (from && to) return `${from} — ${to}`;
  return from ?? to ?? null;
}

function photoCount(item: { imageUrls?: string[]; imageUrl?: string }): number {
  if (item.imageUrls && item.imageUrls.length > 0) return item.imageUrls.length;
  return item.imageUrl ? 1 : 0;
}

function extractGapPoints(line: string): number {
  const matches = [...line.matchAll(/\+(\d+)\s*б\./g)];
  if (matches.length === 0) return 0;
  return Math.max(...matches.map((m) => Number(m[1])));
}

function expectedSeverityFromShare(
  money: number | null,
  store: { turnoverRub: number | null; grossProfitRub: number | null; useGrossProfit: boolean },
  urgencyCritical: boolean,
): { severity: TaskSeverity; basis: string } {
  if (urgencyCritical) return { severity: "critical", basis: "срочность" };
  if (money == null) return { severity: "opportunity", basis: "деньги неизвестны" };
  if (!(money > 0)) return { severity: "opportunity", basis: "хранение 0 ₽" };
  if (store.useGrossProfit && store.grossProfitRub != null && store.grossProfitRub > 0) {
    const share = money / store.grossProfitRub;
    const severity: TaskSeverity =
      share >= SEV.grossCritical ? "critical" : share >= SEV.grossImportant ? "important" : "opportunity";
    return { severity, basis: "доля валовой прибыли" };
  }
  if (store.turnoverRub == null || !(store.turnoverRub > 0)) {
    return { severity: "opportunity", basis: "деньги неизвестны" };
  }
  const share = money / store.turnoverRub;
  const severity: TaskSeverity =
    share >= SEV.turnoverCritical ? "critical" : share >= SEV.turnoverImportant ? "important" : "opportunity";
  return { severity, basis: "доля оборота" };
}

function activeTasks(tasks: SellerTask[], nowMs: number): SellerTask[] {
  return tasks.filter((task) => {
    if (!OPEN_TASK_STATUSES.includes(task.status)) return false;
    if (task.status === "snoozed" && task.snoozeUntil) {
      const until = Date.parse(task.snoozeUntil);
      if (Number.isFinite(until) && until > nowMs) return false;
    }
    return task.status === "active" || task.status === "in_progress" || task.status === "snoozed";
  });
}

export function buildSourceStatuses(
  snapshot: SellerCatalogSnapshot | null,
  nowMs = Date.now(),
): VerifySourceStatus[] {
  if (!snapshot) {
    return [
      "funnel",
      "stocks",
      "realization",
      "paid_storage",
      "feedbacks",
      "catalog",
    ].map((id) => ({
      id,
      label: id,
      status: "not_loaded" as const,
      loadedAt: null,
      period: null,
      error: null,
      fresh24h: null,
    }));
  }

  const funnel = snapshot.funnel;
  const stocks = snapshot.stocksReport;
  const realization = snapshot.realization;
  const paid = snapshot.paidStorage;
  const feedbacks = snapshot.feedbacks;

  function mapStatus(
    loaded: boolean,
    error: string | null | undefined,
    pending: boolean,
    explicit?: string | null,
  ): VerifySourceStatus["status"] {
    if (explicit === "pending" || pending) return "pending";
    if (error || explicit === "error" || explicit === "forbidden" || explicit === "rate_limited") {
      return "error";
    }
    if (!loaded || explicit === "not_loaded") return "not_loaded";
    if (explicit === "ok" || explicit === "partial" || loaded) return "ok";
    return "not_loaded";
  }

  return [
    {
      id: "funnel",
      label: "Воронка",
      status: mapStatus(
        Boolean(funnel?.loadedAt),
        funnel?.error,
        false,
        funnel?.status ?? (funnel?.error ? "error" : funnel ? "ok" : "not_loaded"),
      ),
      loadedAt: funnel?.loadedAt ?? null,
      period: periodLabel(funnel?.dateFrom, funnel?.dateTo),
      error: funnel?.error ?? null,
      fresh24h: isFresh(funnel?.loadedAt, nowMs),
    },
    {
      id: "stocks",
      label: "Остатки (отчёт WB)",
      status: mapStatus(
        Boolean(stocks?.loadedAt),
        stocks?.error,
        false,
        stocks?.status ?? (stocks?.error ? "error" : stocks ? "ok" : "not_loaded"),
      ),
      loadedAt: stocks?.loadedAt ?? null,
      period: periodLabel(stocks?.dateFrom, stocks?.dateTo),
      error: stocks?.error ?? null,
      fresh24h: isFresh(stocks?.loadedAt, nowMs),
    },
    {
      id: "realization",
      label: "Отчёт реализации (90 дней)",
      status: mapStatus(
        Boolean(realization?.loadedAt) && !realization?.error,
        realization?.error,
        false,
        realization?.error ? "error" : realization ? "ok" : "not_loaded",
      ),
      loadedAt: realization?.loadedAt ?? null,
      period: periodLabel(realization?.dateFrom, realization?.dateTo),
      error: realization?.error ?? null,
      fresh24h: isFresh(realization?.loadedAt, nowMs),
    },
    {
      id: "paid_storage",
      label: "Платное хранение",
      status: mapStatus(
        Boolean(paid?.loadedAt),
        paid?.error,
        Boolean(paid?.pendingChunks?.length) || paid?.status === "pending",
        paid?.status ?? (paid?.error ? "error" : paid ? "ok" : "not_loaded"),
      ),
      loadedAt: paid?.loadedAt ?? paid?.lastOkLoadedAt ?? null,
      period: periodLabel(paid?.dateFrom ?? paid?.lastOkDateFrom, paid?.dateTo ?? paid?.lastOkDateTo),
      error: paid?.error ?? null,
      fresh24h: isFresh(paid?.loadedAt ?? paid?.lastOkLoadedAt, nowMs),
    },
    {
      id: "feedbacks",
      label: "Отзывы и вопросы",
      status: mapStatus(
        Boolean(feedbacks?.loadedAt),
        feedbacks?.error,
        false,
        feedbacks?.status ?? (feedbacks?.error ? "error" : feedbacks ? "ok" : "not_loaded"),
      ),
      loadedAt: feedbacks?.loadedAt ?? null,
      period: periodLabel(feedbacks?.dateFrom, feedbacks?.dateTo),
      error: feedbacks?.error ?? null,
      fresh24h: isFresh(feedbacks?.loadedAt, nowMs),
    },
    {
      id: "catalog",
      label: "Карточки и справочник категорий",
      status: snapshot.items.length > 0 ? "ok" : "not_loaded",
      loadedAt: snapshot.syncedAt ?? null,
      period: snapshot.categoryCharcMeta
        ? `справочник ${snapshot.categoryCharcMeta.withDictionary} / без ${snapshot.categoryCharcMeta.withoutDictionary}, отложено ${snapshot.categoryCharcMeta.pending}`
        : `${snapshot.items.length} карточек`,
      error: null,
      fresh24h: isFresh(snapshot.syncedAt, nowMs),
    },
  ];
}

function checkSourcesFresh(sources: VerifySourceStatus[]): VerifyCheckRow {
  const loaded = sources.filter((s) => s.status === "ok" || s.status === "pending");
  if (loaded.length === 0) {
    return {
      id: "sources_fresh",
      title: "Источники свежие",
      tone: "na",
      summary: "Нет загруженных источников",
      details: [],
    };
  }
  const stale = loaded.filter((s) => s.fresh24h === false);
  const unknown = loaded.filter((s) => s.fresh24h == null);
  const details = loaded.map((s) => {
    const age = s.loadedAt ? `${Math.round((Date.now() - Date.parse(s.loadedAt)) / 3_600_000)} ч` : "—";
    return `${s.label}: ${s.status}, ${age}${s.fresh24h === false ? " (старше 24 ч)" : ""}`;
  });
  if (stale.length > 0) {
    return {
      id: "sources_fresh",
      title: "Источники свежие",
      tone: "fail",
      summary: `${stale.length} источник(ов) старше 24 часов`,
      details,
    };
  }
  if (unknown.length === loaded.length) {
    return {
      id: "sources_fresh",
      title: "Источники свежие",
      tone: "na",
      summary: "Нет даты загрузки",
      details,
    };
  }
  return {
    id: "sources_fresh",
    title: "Источники свежие",
    tone: "ok",
    summary: `Все загруженные источники свежее 24 ч (${loaded.length})`,
    details,
  };
}

function checkWeekBank(snapshot: SellerCatalogSnapshot | null): VerifyCheckRow {
  const rec = snapshot?.realization?.reconcile;
  if (!rec || rec.ok == null || rec.bankPaymentSum == null || rec.computed == null) {
    return {
      id: "week_bank",
      title: "Сверка недели с банком",
      tone: "na",
      summary: rec?.error ?? "Нет сверки недели в снимке реализации",
      details: rec
        ? [`Период: ${rec.dateFrom} — ${rec.dateTo}`, `ошибка: ${rec.error ?? "—"}`]
        : [],
    };
  }
  /** Независимый пересчёт той же формулы: Σ(Pay−L−St−A−Pen) уже лежит в computed; сверяем delta. */
  const delta = Math.round((rec.computed - rec.bankPaymentSum) * 100) / 100;
  const ok = Math.abs(delta) < 0.005;
  return {
    id: "week_bank",
    title: "Сверка недели с банком",
    tone: ok ? "ok" : "fail",
    summary: ok
      ? `${rec.dateFrom}–${rec.dateTo}: ${fmtMoney(rec.computed)} = ${fmtMoney(rec.bankPaymentSum)}`
      : `Разница ${fmtMoney(delta)} (наш ${fmtMoney(rec.computed)} ≠ банк ${fmtMoney(rec.bankPaymentSum)})`,
    details: [
      `Период: ${rec.dateFrom} — ${rec.dateTo}`,
      `Наш расчёт: ${fmtMoney(rec.computed)}`,
      `Итого к оплате: ${fmtMoney(rec.bankPaymentSum)}`,
      `Δ: ${fmtMoney(delta)}`,
    ],
  };
}

function checkMonthBank(month: MonthReconcileDiagnostics | null | undefined): VerifyCheckRow {
  if (!month || month.bankPaymentSum == null) {
    return {
      id: "month_bank",
      title: "Сверка месяца",
      tone: "na",
      summary: month?.bankError ?? "Нет данных месяца — нажмите «Загрузить сверку месяца»",
      details: [],
    };
  }
  const sumP = month.sumP;
  const sumPen = month.sumPen;
  const left = month.identityLeft ?? Math.round((sumP - sumPen) * 100) / 100;
  const right =
    month.identityRight ?? Math.round((month.bankPaymentSum - month.costSum) * 100) / 100;
  const delta = Math.round((left - right) * 100) / 100;
  const ok = month.identityOk ?? Math.abs(delta) < 0.02;
  return {
    id: "month_bank",
    title: "Сверка месяца",
    tone: ok ? "ok" : "fail",
    summary: ok
      ? `${month.month}: ${fmtMoney(sumP)} − ${fmtMoney(sumPen)} = ${fmtMoney(month.bankPaymentSum)} − ${fmtMoney(month.costSum)} = ${fmtMoney(left)}`
      : `Тождество не сходится, Δ ${fmtMoney(delta)}`,
    details: [
      `Σ маржи товаров (P): ${fmtMoney(sumP)}`,
      `Σ штрафов и удержаний (Pen): ${fmtMoney(sumPen)}`,
      `Итого к оплате: ${fmtMoney(month.bankPaymentSum)}`,
      `Σ себестоимости: ${fmtMoney(month.costSum)}`,
      `Левая часть: ${fmtMoney(left)}`,
      `Правая часть: ${fmtMoney(right)}`,
    ],
  };
}

function checkUnitMargin(
  facts: TaskFact[],
  snapshot: SellerCatalogSnapshot | null,
): VerifyCheckRow {
  const mismatches: string[] = [];
  let checked = 0;
  if (!snapshot?.realization) {
    return {
      id: "unit_margin",
      title: "Маржа на 1 продажу",
      tone: "na",
      summary: "Нет отчёта реализации для независимого пересчёта",
      details: [],
    };
  }
  for (const fact of facts) {
    if (fact.promoPrice == null || !(fact.promoPrice > 0) || fact.cost == null || !(fact.cost > 0)) continue;
    if (fact.marginRub == null) continue;
    /** Независимый пересчёт (не через округлённые feeRateK/l из факта). */
    const unit = productUnitSaleEconomics({
      realization: snapshot.realization,
      paidStorage: snapshot.paidStorage ?? null,
      nmId: fact.nmId,
      costPerUnit: fact.cost,
      taxRatePercent: null,
      currentPrice: fact.promoPrice,
      stockFbo: fact.stockFbo,
    });
    if (!unit || unit.u == null || unit.m == null) continue;
    checked += 1;
    const uCalc = Math.round(unit.u * 100) / 100;
    const mCalc = Math.round(unit.m * 1000) / 10;
    if (Math.abs(uCalc - fact.marginRub) > 0.01 || (fact.marginPercent != null && Math.abs(mCalc - fact.marginPercent) > 0.05)) {
      mismatches.push(
        `${fact.nmId}: u факт ${fact.marginRub} ₽ vs ${uCalc} ₽; m факт ${fact.marginPercent ?? "—"}% vs ${mCalc}%`,
      );
      continue;
    }
    /** Тождество u = p·(1−k) − l − s − a − c по неокруглённым полям unit (в факте k/l округлены для показа). */
    const s = unit.storageExcluded ? 0 : (unit.s ?? 0);
    const fromFields = Math.round((unit.p * (1 - unit.k) - unit.l - s - unit.a - fact.cost) * 100) / 100;
    if (Math.abs(fromFields - uCalc) > 0.01) {
      mismatches.push(
        `${fact.nmId}: из полей unit ${fromFields} ₽ ≠ u ${uCalc} ₽`,
      );
    }
    const mFromFields = unit.p > 0 ? Math.round((fromFields / unit.p) * 1000) / 10 : null;
    if (mFromFields != null && Math.abs(mFromFields - mCalc) > 0.05) {
      mismatches.push(`${fact.nmId}: m из полей ${mFromFields}% ≠ ${mCalc}%`);
    }
  }
  if (checked === 0) {
    return {
      id: "unit_margin",
      title: "Маржа на 1 продажу",
      tone: "na",
      summary: "Нет товаров с полным набором для unit-пересчёта",
      details: [],
    };
  }
  return {
    id: "unit_margin",
    title: "Маржа на 1 продажу",
    tone: mismatches.length === 0 ? "ok" : "fail",
    summary:
      mismatches.length === 0
        ? `Совпадает у ${checked} товаров (допуск 0,01 ₽)`
        : `Расхождение у ${mismatches.length} из ${checked}`,
    details: mismatches.slice(0, 40),
  };
}

function checkRatings(snapshot: SellerCatalogSnapshot | null): VerifyCheckRow {
  const fb = snapshot?.feedbacks;
  if (!fb?.byNm) {
    return {
      id: "ratings",
      title: "Рейтинг",
      tone: "na",
      summary: "Отзывы не загружены",
      details: [],
    };
  }
  const wb: Record<string, number | null> = {};
  for (const [nmId, row] of Object.entries(snapshot?.funnel?.byNm ?? {})) {
    wb[nmId] = row.feedbackRating;
  }
  const mismatches = reconcileFeedbackRatings(fb.byNm, wb);
  return {
    id: "ratings",
    title: "Рейтинг",
    tone: mismatches.length === 0 ? "ok" : "fail",
    summary:
      mismatches.length === 0
        ? "Расхождений с feedbackRating WB нет (порог 0,1)"
        : `${mismatches.length} расхождений > 0,1`,
    details: mismatches.map(
      (m) =>
        `${m.nmId}: наш ${m.ourRating ?? "нет"} (${m.ourCount} отз.) vs WB ${m.wbFeedbackRating ?? "нет"}`,
    ),
  };
}

function checkSeverity(tasks: SellerTask[], facts: TaskFact[], nowMs: number): VerifyCheckRow {
  const store = buildStoreMoneyContext(facts, DEFAULT_TASK_THRESHOLDS);
  const open = activeTasks(tasks, nowMs);
  const mismatches: string[] = [];
  for (const task of open) {
    if (task.type === "TASK_LOW_CONTENT_SCORE" || task.type === "TASK_CONTENT_OPPORTUNITY") {
      if (task.severity !== "opportunity") {
        mismatches.push(`${task.nmId ?? "store"} ${task.type}: контент должен быть «Возможность», сейчас ${task.severity}`);
      }
      continue;
    }
    const money =
      typeof task.evidence.money_at_risk_rub === "number"
        ? task.evidence.money_at_risk_rub
        : typeof task.evidence.lost_money_est === "number"
          ? task.evidence.lost_money_est
          : typeof task.evidence.loss_rub === "number"
            ? task.evidence.loss_rub
            : null;
    const urgency = task.evidence.urgency_critical === true;
    const illiquid = task.evidence.illiquid_raise === true;
    const expected = expectedSeverityFromShare(money, store, urgency);
    let sev = expected.severity;
    /**
     * Убыточная цена (rules-standard): пол opportunity→important;
     * critical если доля ≥ порога «Важно» (1% оборота / 5% валовой).
     */
    if (task.type === "TASK_NEGATIVE_MARGIN" || task.type === "TASK_MARGIN_NEAR_ZERO") {
      const importantShare = store.useGrossProfit ? SEV.grossImportant : SEV.turnoverImportant;
      const base = store.useGrossProfit ? store.grossProfitRub : store.turnoverRub;
      if (money != null && base != null && base > 0 && money / base >= importantShare) {
        sev = "critical";
      } else if (sev === "opportunity") {
        sev = "important";
      }
    }
    /** Неликвид (rules-standard): заморожено ≥ 1% оборота → «Важно», даже если деньги хранения неизвестны. */
    if (illiquid && sev === "opportunity" && store.turnoverRub != null && store.turnoverRub > 0) {
      const frozen =
        typeof task.evidence.frozen_rub === "number" ? task.evidence.frozen_rub : money;
      if (frozen != null && frozen / store.turnoverRub >= SEV.turnoverImportant) sev = "important";
    }
    if (task.severity !== sev && task.evidence.severity_cap !== "opportunity_no_money") {
      mismatches.push(
        `${task.nmId ?? "store"} ${task.type}: на задаче ${task.severity}, по стандарту ожидалось ${sev} (${expected.basis}, деньги ${money ?? "—"})`,
      );
    }
  }
  return {
    id: "severity",
    title: "Важность",
    tone: mismatches.length === 0 ? "ok" : "fail",
    summary:
      mismatches.length === 0
        ? `У ${open.length} активных задач уровень согласован со стандартом`
        : `${mismatches.length} несовпадений`,
    details: mismatches.slice(0, 40),
  };
}

function checkDuplicates(tasks: SellerTask[], nowMs: number): VerifyCheckRow {
  const open = activeTasks(tasks, nowMs);
  const issues: string[] = [];
  const byKey = new Map<string, number>();
  for (const task of open) {
    const key = `${task.nmId ?? "store"}::${task.type}`;
    byKey.set(key, (byKey.get(key) ?? 0) + 1);
  }
  for (const [key, count] of byKey) {
    if (count > 1) issues.push(`Дубль ${key}: ${count} шт.`);
  }
  const byNm = new Map<string, Set<string>>();
  for (const task of open) {
    if (!task.nmId) continue;
    const set = byNm.get(task.nmId) ?? new Set();
    set.add(task.type);
    byNm.set(task.nmId, set);
  }
  for (const [nmId, types] of byNm) {
    if (types.has("TASK_LOW_CONTENT_SCORE") && types.has("TASK_CONTENT_OPPORTUNITY")) {
      issues.push(`${nmId}: одновременно LOW_CONTENT и CONTENT_OPPORTUNITY`);
    }
  }
  const storeReviews = open.filter(
    (t) =>
      (t.type === "TASK_UNANSWERED_REVIEWS" || t.type === "TASK_UNANSWERED_QUESTIONS") &&
      t.nmId == null,
  );
  for (const t of storeReviews) {
    /** Старый образец — без evidence по артикулам и с общим счётчиком как единственным фактом. */
    if (
      t.evidence.unanswered_feedbacks != null &&
      t.evidence.unanswered_positive_count == null &&
      t.type === "TASK_UNANSWERED_REVIEWS"
    ) {
      issues.push(`Старый TASK_UNANSWERED_REVIEWS магазина: ${t.id}`);
    }
  }
  return {
    id: "duplicates",
    title: "Дубли",
    tone: issues.length === 0 ? "ok" : "fail",
    summary: issues.length === 0 ? "Дублей типов нет" : `${issues.length} проблем`,
    details: issues,
  };
}

function checkTexts(tasks: SellerTask[], nowMs: number): VerifyCheckRow {
  const open = activeTasks(tasks, nowMs);
  const issues: string[] = [];
  for (const task of open) {
    const blob = `${task.title}\n${task.description}\n${task.reason}\n${task.recommendation}`;
    for (const phrase of FORBIDDEN_PHRASES) {
      if (blob.includes(phrase)) {
        issues.push(`${task.nmId ?? "store"} ${task.type}: «${phrase}»`);
      }
    }
    if (/\.\./.test(blob.replace(/\d\.\d/g, ""))) {
      issues.push(`${task.nmId ?? "store"} ${task.type}: двойные точки`);
    }
    if (/\b1\s+переходов\b|\b1\s+перехода\b/.test(blob)) {
      issues.push(`${task.nmId ?? "store"} ${task.type}: склонение «1 переход»`);
    }
    if (/\b2\s+переход\b(?![а-я])|\b3\s+переход\b(?![а-я])|\b4\s+переход\b(?![а-я])/.test(blob)) {
      issues.push(`${task.nmId ?? "store"} ${task.type}: склонение «2–4 перехода»`);
    }
    if (/\b5\s+перехода\b|\b5\s+переход\b(?![а-яов])/.test(blob)) {
      issues.push(`${task.nmId ?? "store"} ${task.type}: склонение «5 переходов»`);
    }
    if (/\d{4,}/.test(blob) && !/\d[\s\u00a0]\d{3}/.test(blob) && /\d+\s*₽/.test(blob)) {
      /** мягко: большие суммы без пробела */
      const moneyHits = blob.match(/\d{5,}\s*₽/g);
      if (moneyHits) {
        issues.push(`${task.nmId ?? "store"} ${task.type}: деньги без разряда тысяч (${moneyHits[0]})`);
      }
    }
  }
  return {
    id: "texts",
    title: "Тексты",
    tone: issues.length === 0 ? "ok" : "fail",
    summary: issues.length === 0 ? "Запрещённых формулировок нет" : `${issues.length} замечаний`,
    details: issues.slice(0, 40),
  };
}

function checkContent(snapshot: SellerCatalogSnapshot | null, facts: TaskFact[]): VerifyCheckRow {
  if (!snapshot?.items.length) {
    return {
      id: "content",
      title: "Контент",
      tone: "na",
      summary: "Каталог не загружен",
      details: [],
    };
  }
  const issues: string[] = [];
  for (const item of snapshot.items) {
    const card = contentScore({
      photos: photoCount(item),
      hasVideo: Boolean(item.videoUrl),
      description: item.description ?? null,
      characteristicNames: item.characteristicNames ?? null,
      categoryCharcNames: item.categoryCharcNames ?? null,
      categoryCharcRequiredNames: item.categoryCharcRequiredNames ?? null,
      dimensions: item.dimensions ?? null,
    });
    const slotSum = card.parts.media + card.parts.filters + card.parts.copy;
    if (slotSum !== card.earned) {
      issues.push(`${item.externalId}: сумма блоков ${slotSum} ≠ earned ${card.earned}`);
    }
    const normalized = Math.round((card.earned / CONTENT_APPLICABLE_MAX) * 100);
    if (normalized !== card.score) {
      issues.push(`${item.externalId}: score ${card.score} ≠ ${normalized} из earned`);
    }
    const scored = card.gaps.filter((g) => g.block !== "required");
    for (let i = 1; i < scored.length; i += 1) {
      if (scored[i]!.points > scored[i - 1]!.points) {
        issues.push(
          `${item.externalId}: сортировка недоборов: «${scored[i]!.line}» выше по баллам, чем предыдущая`,
        );
        break;
      }
    }
    /** Визуальная строгость: по числам в тексте (+N б.) монотонно не возрастают вниз. */
    const lines = card.gapLines.filter((l) => !l.startsWith("Не заполнено обязательное"));
    for (let i = 1; i < lines.length; i += 1) {
      const prev = extractGapPoints(lines[i - 1]!);
      const cur = extractGapPoints(lines[i]!);
      if (cur > prev) {
        issues.push(`${item.externalId}: в тексте «${lines[i]}» (+${cur}) после (+${prev})`);
        break;
      }
    }
  }
  const withTask = facts.filter((f) => f.contentScore != null && f.contentScore < DEFAULT_TASK_THRESHOLDS.lowContentScore);
  return {
    id: "content",
    title: "Контент",
    tone: issues.length === 0 ? "ok" : "fail",
    summary:
      issues.length === 0
        ? `Слоты и сортировка ок (${snapshot.items.length} карточек, ниже порога ${withTask.length})`
        : `${issues.length} проблем`,
    details: issues.slice(0, 40),
  };
}

function checkTasksWithoutData(tasks: SellerTask[], nowMs: number): VerifyCheckRow {
  const open = activeTasks(tasks, nowMs);
  const issues: string[] = [];
  for (const task of open) {
    const blob = `${task.description} ${task.reason} ${task.recommendation}`;
    if (/\bnull\b|\bundefined\b|\bNaN\b/.test(blob)) {
      issues.push(`${task.nmId ?? "store"} ${task.type}: null/NaN в тексте`);
    }
    const money = task.evidence.money_at_risk_rub;
    if (money === null && /₽/.test(task.description) && !/неизвестн|без учёта хранения|нет данных|не берёт/i.test(task.description)) {
      /** Деньги в тексте при evidence null — подозрительно, кроме явных оговорок. */
      if (/около\s+\d|заморожено|убыток|потер/i.test(task.description)) {
        issues.push(`${task.nmId ?? "store"} ${task.type}: деньги в тексте при money_at_risk_rub=null`);
      }
    }
    if (
      task.evidence.storage_excluded === true &&
      !/без учёта хранения/i.test(blob) &&
      (task.type === "TASK_NEGATIVE_MARGIN" || task.type === "TASK_MARGIN_NEAR_ZERO")
    ) {
      issues.push(`${task.nmId ?? "store"} ${task.type}: хранение исключено, но нет пометки в тексте`);
    }
  }
  return {
    id: "tasks_data",
    title: "Задачи без данных",
    tone: issues.length === 0 ? "ok" : "fail",
    summary: issues.length === 0 ? "Нет задач с деньгами из null" : `${issues.length} замечаний`,
    details: issues.slice(0, 40),
  };
}

function fmtMoney(value: number): string {
  return `${value.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽`;
}

export function buildCalcVerification(input: {
  snapshot: SellerCatalogSnapshot | null;
  tasks: SellerTask[];
  monthReconcile?: MonthReconcileDiagnostics | null;
  tasksLoaded?: boolean;
  nowMs?: number;
}): CalcVerificationReport {
  const nowMs = input.nowMs ?? Date.now();
  const sources = buildSourceStatuses(input.snapshot, nowMs);
  const facts =
    input.snapshot && input.snapshot.items.length > 0
      ? taskFactsFromSnapshot(input.snapshot).products
      : [];

  /** Пока задачи не загружены, проверки по задачам — «нет данных», а не пустой зелёный. */
  const tasksPending = input.tasksLoaded === false;
  const needTasks = (row: VerifyCheckRow): VerifyCheckRow =>
    tasksPending
      ? { id: row.id, title: row.title, tone: "na", summary: "Задачи ещё не загружены", details: [] }
      : row;

  const checks: VerifyCheckRow[] = [
    checkSourcesFresh(sources),
    checkWeekBank(input.snapshot),
    checkMonthBank(input.monthReconcile),
    checkUnitMargin(facts, input.snapshot),
    checkRatings(input.snapshot),
    needTasks(checkSeverity(input.tasks, facts, nowMs)),
    needTasks(checkDuplicates(input.tasks, nowMs)),
    needTasks(checkTexts(input.tasks, nowMs)),
    checkContent(input.snapshot, facts),
    needTasks(checkTasksWithoutData(input.tasks, nowMs)),
  ];

  return {
    builtAt: new Date(nowMs).toISOString(),
    sources,
    checks,
  };
}

/** Экспорт для тестов: независимая сверка недели из окон. */
export function verifyWeekFormula(input: {
  byNm: Array<{ Pay: number; L: number; St: number; A: number; Pen: number }>;
  noNm: { Pay: number; L: number; St: number; A: number; Pen: number };
  bankPaymentSum: number;
}) {
  return reconcileBankPayment(input);
}
