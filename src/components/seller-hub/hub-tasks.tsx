"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Search, X } from "lucide-react";
import {
  buildSellerHubDiagnostics,
  exportSellerHubDiagnostics,
} from "@/lib/seller-hub/diagnostics";
import type { SellerProductEvent } from "@/lib/seller-hub/event-engine/types";
import { buildSellerHubDiagnosticsRemote } from "@/lib/seller-hub/client-api";
import { muteSellerHubTask } from "@/lib/seller-hub/client-api";
import { loadSellerHubTasks, updateSellerHubTaskStatus } from "@/lib/seller-hub/task-engine/client";
import { collapseCompleted } from "@/lib/seller-hub/task-engine/completed-groups";
import { recentProductEvents } from "@/lib/seller-hub/task-engine/product-events";
import { HubTaskSettings } from "./hub-task-settings";
import { suggestPriceFix, type PriceFix } from "@/lib/seller-hub/task-engine/fix";
import { loadSellerHubBlockedCards, updateSellerHubPrices } from "@/lib/seller-hub/client-api";
import { claimPriceSubmit, releasePriceSubmit } from "@/lib/seller-hub/price-write";
import { isActionableTask, isPendingSnooze, snoozeChoices } from "@/lib/seller-hub/task-engine/lifecycle";
import type { SellerTask, TaskActionType, TaskCategory, TaskEvidence, TaskImpactType, TaskSeverity } from "@/lib/seller-hub/task-engine/types";
import { isFunnelReadyForDemandTasks } from "@/lib/services/wildberries/funnel-parse";
import type { SellerBlockedCards, SellerCatalogItem, SellerCatalogSnapshot, SellerFunnelSnapshot } from "@/lib/seller-hub/types";
import { DEFAULT_TASK_THRESHOLDS } from "@/lib/seller-hub/task-engine/config";
import { severityTooltipLines } from "@/lib/seller-hub/task-engine/severity";
import { HubProductDrawer } from "./hub-product-drawer";
import { compareByPriority } from "@/lib/seller-hub/task-engine/priority";
import { taskCategoryBreakdown } from "@/lib/seller-hub/task-engine/breakdown";
import { completedTasksCsv } from "@/lib/seller-hub/task-engine/report";
import {
  actionLabel,
  evidenceNote,
  evidenceRows,
  impactLabel,
  impactWhy,
  IMPACT_OPTIONS,
  severityLabel,
  statusLabel,
} from "./hub-task-present";
import { HubTopActions } from "./hub-top-actions";
import { HubTasksOk } from "./hub-tasks-ok";
import { HubAiFindings } from "./hub-ai-findings";
import { HubTasksRisks } from "./hub-tasks-risks";
import { buildTopActions } from "./top-actions";
import {
  formatRub,
  HubBadge,
  HubButton,
  HubEmptyState,
  HubInput,
  HubPanel,
  HubPhoto,
  HubSegmented,
  hub,
  hubNumeric,
  hubSans,
} from "./hub-ui";

const NO_ITEMS: SellerCatalogItem[] = [];

type Lifecycle = "open" | "snoozed" | "done";
type SeverityFilter = "all" | TaskSeverity;

function funnelDemandNote(funnel: SellerFunnelSnapshot | undefined): string | null {
  if (!funnel) {
    return "Воронка заказов ещё не загружена. Задачи «конверсия» и «трафик» появятся после чтения Analytics.";
  }
  if (funnel.status === "jam_required" || /Джем|джем/i.test(funnel.error ?? "")) {
    return "Для сбора этих данных нужна подписка Джем: воронка (переходы, корзина, заказы). Без неё задачи по конверсии и трафику не считаются, только выкупы из реализации.";
  }
  if (funnel.status === "rate_limited") {
    return "WB ограничил запросы к воронке. Подождите минуту и нажмите «Обновить».";
  }
  if (funnel.status === "forbidden" || funnel.status === "error" || funnel.error) {
    return funnel.error ?? "Воронка не прочиталась. Задачи по конверсии и трафику пока недоступны.";
  }
  if (!isFunnelReadyForDemandTasks(funnel)) {
    return "Воронка устарела или неполная. Идёт обновление — список задач пересчитается сам.";
  }
  return null;
}

/** «2 раза», «5 раз». */
function timesWord(n: number): string {
  return n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? "раза" : "раз";
}

function matchesLifecycle(task: SellerTask, lifecycle: Lifecycle, nowMs: number): boolean {
  switch (lifecycle) {
    case "open":
      return isActionableTask(task, nowMs);
    case "snoozed":
      return isPendingSnooze(task, nowMs);
    case "done":
      return task.status === "completed";
    default: {
      const unexpected: never = lifecycle;
      return unexpected;
    }
  }
}

function findItem(items: SellerCatalogItem[], task: SellerTask): SellerCatalogItem | null {
  if (task.itemId) {
    const byId = items.find((item) => item.id === task.itemId);
    if (byId) return byId;
  }
  if (task.nmId) return items.find((item) => item.externalId === task.nmId) ?? null;
  return null;
}

function salePrice(item: SellerCatalogItem | null, task: SellerTask): number | null {
  if (item) {
    const price = item.discountedPrice ?? item.price;
    return price == null ? null : Math.round(price);
  }
  const evidencePrice = task.evidence.price;
  return typeof evidencePrice === "number" ? Math.round(evidencePrice) : null;
}

function actionAvailable(action: TaskActionType, item: SellerCatalogItem | null): boolean {
  switch (action) {
    case "OPEN_PRODUCT":
    case "OPEN_CONTENT_EDITOR":
    case "OPEN_PRICE_EDITOR":
      return item != null;
    case "OPEN_STOCKS":
    case "OPEN_SUPPLIES":
    case "OPEN_PROMOTIONS":
    case "OPEN_ADS":
    case "OPEN_REVIEWS":
    case "OPEN_REVIEW_RESPONSES":
    case "OPEN_QUESTIONS":
      return true;
    case "NONE":
      return false;
    default: {
      const unexpected: never = action;
      return unexpected;
    }
  }
}

/** Отчёт о завершённых задачах: файл собирается в браузере, на сервер ничего не уходит. */
function downloadCompletedReport(tasks: SellerTask[]) {
  const blob = new Blob([completedTasksCsv(tasks)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `karto-zadachi-vypolneno-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function TaskSkeleton() {
  return (
    <div className="space-y-3" aria-hidden>
      <div className="grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="h-[72px] animate-pulse rounded-2xl border" style={{ borderColor: hub.border, backgroundColor: hub.surface }} />
        ))}
      </div>
      <HubPanel>
        <div className="divide-y" style={{ borderColor: hub.border }}>
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="space-y-3 px-5 py-4">
              <div className="h-4 w-28 animate-pulse rounded" style={{ backgroundColor: hub.canvas }} />
              <div className="h-5 w-2/3 animate-pulse rounded" style={{ backgroundColor: hub.canvas }} />
              <div className="h-4 w-full animate-pulse rounded" style={{ backgroundColor: hub.canvas }} />
            </div>
          ))}
        </div>
      </HubPanel>
    </div>
  );
}

function severityHint(severity: TaskSeverity, evidence?: TaskEvidence): string {
  const turnover =
    typeof evidence?.turnover_base_rub === "number"
      ? evidence.turnover_base_rub
      : typeof evidence?.store_order_sum_28d === "number"
        ? evidence.store_order_sum_28d
        : null;
  const basis = typeof evidence?.severity_basis === "string" ? evidence.severity_basis : null;
  return severityTooltipLines({
    severity,
    basis,
    turnoverRub: turnover,
    thresholds: DEFAULT_TASK_THRESHOLDS,
  }).detail;
}

function whyImportantText(evidence: TaskEvidence): string | null {
  return typeof evidence.why_important === "string" && evidence.why_important.trim()
    ? evidence.why_important
    : null;
}

function SeverityMark({ severity, evidence }: { severity: TaskSeverity; evidence?: TaskEvidence }) {
  const tone = severity === "critical" ? "danger" : severity === "important" ? "warn" : "accent";
  return (
    <HubBadge tone={tone} title={severityHint(severity, evidence)}>
      {severityLabel(severity)}
    </HubBadge>
  );
}

export function HubTasks({
  snapshot,
  connected,
  events = [],
  onItemsUpdate,
  onOpenPrices,
  onOpenStocks,
  onOpenSupplies,
  onOpenPromotions,
  onOpenAds,
  onOpenReviews,
  onOpenQuestions,
}: {
  snapshot?: SellerCatalogSnapshot;
  connected?: boolean;
  events?: SellerProductEvent[];
  onItemsUpdate?: (items: SellerCatalogItem[]) => void;
  onOpenPrices: (itemId: string) => void;
  onOpenStocks: () => void;
  onOpenSupplies: () => void;
  onOpenPromotions: () => void;
  onOpenAds: () => void;
  onOpenReviews: () => void;
  onOpenQuestions: () => void;
}) {
  const [tasks, setTasks] = useState<SellerTask[]>([]);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [lifecycle, setLifecycle] = useState<Lifecycle>("open");
  const [severity, setSeverity] = useState<SeverityFilter>("all");
  const [impact, setImpact] = useState<TaskImpactType | "all">("all");
  const [category, setCategory] = useState<TaskCategory | "all">("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [product, setProduct] = useState<SellerCatalogItem | null>(null);
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const [statusSaving, setStatusSaving] = useState(false);
  const [blocked, setBlocked] = useState<SellerBlockedCards | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  /** Риски от самого WB (заблокированные карточки): серверный кэш на час, отдельно от движка задач. */
  useEffect(() => {
    if (!connected) return;
    // Фоновый сбор уже положил блокировки в снимок: отдельный запрос к WB не нужен.
    if (snapshot?.blockedCards) {
      setBlocked(snapshot.blockedCards);
      return;
    }
    let cancelled = false;
    void loadSellerHubBlockedCards()
      .then((result) => {
        if (!cancelled && result.ok && result.blocked) setBlocked(result.blocked);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [connected, snapshot?.blockedCards]);

  /** Воронка, остатки, хранение и реализация догружаются после sync — без них ключ не обновится. */
  const requestKey =
    connected && snapshot
      ? [
          snapshot.marketplaceId,
          snapshot.syncedAt,
          snapshot.funnel?.loadedAt ?? "no-funnel",
          snapshot.funnel?.status ?? "",
          snapshot.stocksReport?.loadedAt ?? "no-stocks",
          snapshot.stocksReport?.status ?? "",
          snapshot.paidStorage?.loadedAt ?? "no-paid-storage",
          snapshot.paidStorage?.status ?? "",
          snapshot.realization?.loadedAt ?? "no-realization",
          String(attempt),
        ].join(":")
      : "";

  const isDevDiagnostics = process.env.NODE_ENV !== "production";

  const [diagNote, setDiagNote] = useState<string | null>(null);
  const [diagBusy, setDiagBusy] = useState(false);

  function exportDiagnostics() {
    if (!snapshot || !isDevDiagnostics || diagBusy) return;
    const data = buildSellerHubDiagnostics({ snapshot, tasks, events });
    void exportSellerHubDiagnostics(data).then((result) => {
      setDiagNote(
        result.saved
          ? "Диагностика сохранена: karto-diagnostics.json в корне проекта и в загрузках."
          : "Файл скачан. Запись в корень проекта не удалась — положите karto-diagnostics.json вручную.",
      );
    });
  }

  /** Полный sync + paid_storage + rawRealizationSample (до ~10 мин). */
  function rebuildDiagnostics() {
    if (!isDevDiagnostics || diagBusy) return;
    setDiagBusy(true);
    setDiagNote("Идёт полный прогон (каталог → воронка → остатки → хранение, до ~10 мин)…");
    void buildSellerHubDiagnosticsRemote()
      .then((result) => {
        if (!result.ok) {
          setDiagNote(result.error ?? "Прогон не удался");
          return;
        }
        const sampleNm = result.rawRealizationSampleNm?.join(", ") || "—";
        setDiagNote(
          `Прогон готов: ${result.taskCount ?? 0} задач, paid_storage=${result.paidStorageStatus ?? "?"} (${result.paidStorageNmCount ?? 0} nm), rawSample nm=${sampleNm} (${result.rawRealizationSampleRows ?? 0} строк). Файл: karto-diagnostics.json в корне проекта.`,
        );
        setAttempt((value) => value + 1);
      })
      .catch((error: unknown) => {
        setDiagNote(error instanceof Error ? error.message : "Прогон не удался");
      })
      .finally(() => setDiagBusy(false));
  }

  useEffect(() => {
    if (!connected || !snapshot || !requestKey) return;
    const current = snapshot;
    const key = requestKey;
    let cancelled = false;
    void loadSellerHubTasks(current)
      .then((rows) => {
        if (cancelled) return;
        setTasks(rows);
        setError(false);
        setLoadedKey(key);
      })
      .catch(() => {
        if (cancelled) return;
        setError(true);
        setLoadedKey(key);
      });
    return () => {
      cancelled = true;
    };
  }, [connected, snapshot, requestKey]);

  const items = snapshot?.items ?? NO_ITEMS;
  const failed = error && loadedKey === requestKey;
  const loading = Boolean(requestKey) && loadedKey !== requestKey;
  const nowMs = Date.now();
  const openTasks = useMemo(() => tasks.filter((task) => isActionableTask(task, nowMs)), [tasks, nowMs]);
  const topActions = useMemo(() => buildTopActions(tasks, nowMs), [tasks, nowMs]);
  const counts = useMemo(
    () => ({
      critical: openTasks.filter((task) => task.severity === "critical").length,
      important: openTasks.filter((task) => task.severity === "important").length,
      opportunity: openTasks.filter((task) => task.severity === "opportunity").length,
    }),
    [openTasks],
  );

  const visibleAll = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return tasks.filter((task) => matchesLifecycle(task, lifecycle, nowMs))
      .filter((task) => (severity === "all" ? true : task.severity === severity))
      .filter((task) => (impact === "all" ? true : task.businessImpactType === impact))
      .filter((task) => (category === "all" ? true : task.category === category))
      .filter((task) => {
        if (!needle) return true;
        const item = findItem(items, task);
        const haystack = [task.productTitle, task.vendorCode, task.nmId, task.title, item?.title, item?.vendorCode]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(needle);
      })
      .sort(compareByPriority);
  }, [tasks, lifecycle, severity, impact, category, query, items, nowMs]);
  // В «Завершённых» одна строка на пару «тип + товар» с числом повторов; в остальных списках всё как есть.
  const completedGroups = useMemo(() => (lifecycle === "done" ? collapseCompleted(visibleAll) : null), [lifecycle, visibleAll]);
  const visible = completedGroups ? completedGroups.map((g) => g.task) : visibleAll;
  const repeatsById = useMemo(() => new Map((completedGroups ?? []).map((g) => [g.task.id, g.repeats])), [completedGroups]);
  const categoryRows = useMemo(() => taskCategoryBreakdown(openTasks), [openTasks]);

  const selected = tasks.find((task) => task.id === selectedId) ?? null;

  useEffect(() => {
    if (!selected || product) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, product]);

  async function saveStatus(
    task: SellerTask,
    patch: { status: "completed" } | { status: "snoozed"; snoozeUntil: string },
  ) {
    if (!snapshot || statusSaving) return;
    setStatusSaving(true);
    setStatusNote(null);
    try {
      const saved = await updateSellerHubTaskStatus({
        marketplaceId: snapshot.marketplaceId,
        taskId: task.id,
        status: patch.status,
        snoozeUntil: patch.status === "snoozed" ? patch.snoozeUntil : undefined,
      });
      setTasks((rows) => rows.map((row) => (row.id === saved.id ? saved : row)));
      setSelectedId(null);
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "";
      setStatusNote(message && message !== "tasks" ? message : "Не удалось сохранить статус");
    } finally {
      setStatusSaving(false);
    }
  }

  const priceLock = useRef(false);

  /** «Выполнить» из задачи: отправить цену не ниже безубыточной. Запись в WB только после подтверждения в панели. */
  async function applyPriceFix(task: SellerTask, fix: PriceFix): Promise<{ ok: boolean; message: string }> {
    if (!task.nmId || !claimPriceSubmit(priceLock)) return { ok: false, message: "Цена уже отправляется." };
    try {
      const seen = findItem(items, task);
      const result = await updateSellerHubPrices({
        updates: [
          {
            nmId: Number(task.nmId),
            price: fix.baseRub,
            discount: fix.discount,
            expected: seen ? { price: seen.price ?? null, discount: seen.discountPercent ?? null } : undefined,
          },
        ],
      });
      if (result.outcome === "confirmed" && onItemsUpdate) {
        const target = findItem(items, task);
        if (target) {
          onItemsUpdate(
            items.map((row) =>
              row.id === target.id
                ? { ...row, price: fix.baseRub, discountPercent: fix.discount, discountedPrice: Math.round(fix.baseRub * (1 - fix.discount / 100)) }
                : row,
            ),
          );
        }
      }
      return { ok: result.ok, message: result.message };
    } finally {
      releasePriceSubmit(priceLock);
    }
  }

  function runAction(task: SellerTask) {
    const item = findItem(items, task);
    const action: TaskActionType = task.actionType;
    switch (action) {
      case "OPEN_PRODUCT":
      case "OPEN_CONTENT_EDITOR":
        if (item) setProduct(item);
        return;
      case "OPEN_PRICE_EDITOR":
        if (item) onOpenPrices(item.id);
        return;
      case "OPEN_STOCKS":
        onOpenStocks();
        return;
      case "OPEN_SUPPLIES":
        onOpenSupplies();
        return;
      case "OPEN_PROMOTIONS":
        onOpenPromotions();
        return;
      case "OPEN_ADS":
        onOpenAds();
        return;
      case "OPEN_REVIEWS":
      case "OPEN_REVIEW_RESPONSES":
        onOpenReviews();
        return;
      case "OPEN_QUESTIONS":
        onOpenQuestions();
        return;
      case "NONE":
        return;
      default: {
        const unexpected: never = action;
        return unexpected;
      }
    }
  }

  if (!connected || !snapshot) {
    return (
      <HubPanel>
        <HubEmptyState
          icon={<CheckCircle2 className="h-6 w-6" />}
          title="Недостаточно данных для анализа"
          description="Подключите и синхронизируйте кабинет, чтобы Karto мог сформировать задачи."
        />
      </HubPanel>
    );
  }

  if (loading && tasks.length === 0) return <TaskSkeleton />;

  if (failed && tasks.length === 0) {
    return (
      <HubPanel>
        <HubEmptyState
          icon={<Search className="h-6 w-6" />}
          title="Не удалось загрузить задачи"
          description="Попробуйте обновить данные."
          action={
            <HubButton variant="secondary" onClick={() => setAttempt((value) => value + 1)}>
              Обновить
            </HubButton>
          }
        />
      </HubPanel>
    );
  }

  const filtersNarrow = severity !== "all" || impact !== "all" || category !== "all" || query.trim().length > 0;
  const funnelNote = funnelDemandNote(snapshot.funnel);

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <HubButton variant="secondary" onClick={() => setSettingsOpen(true)}>
          Настройки задач
        </HubButton>
      </div>
      <HubTasksRisks blocked={blocked} />
      <HubAiFindings titleByNm={new Map(snapshot.items.map((item) => [String(item.externalId), item.title]))} cardByNm={new Map(snapshot.items.map((item) => [String(item.externalId), { title: item.title, vendorCode: item.vendorCode, description: item.description ?? "" }]))} />
      {funnelNote ? (
        <HubPanel className="px-4 py-3">
          <p className="text-[13px] leading-5" style={{ color: hub.textMuted }}>{funnelNote}</p>
        </HubPanel>
      ) : null}
      {failed ? (
        <HubPanel className="px-4 py-3">
          <p className="text-[13px] leading-5" style={{ color: hub.textMuted }}>
            Не удалось обновить задачи. Показан последний загруженный список.
          </p>
        </HubPanel>
      ) : null}
      {isDevDiagnostics ? (
        <div className="flex flex-col items-end gap-2">
          <div className="flex flex-wrap justify-end gap-2">
            <HubButton variant="secondary" disabled={diagBusy} onClick={exportDiagnostics}>
              Выгрузить диагностику
            </HubButton>
            <HubButton variant="secondary" disabled={diagBusy} onClick={rebuildDiagnostics}>
              {diagBusy ? "Прогон…" : "Полный прогон + файл"}
            </HubButton>
          </div>
          {diagNote ? (
            <p className="max-w-xl text-right text-[12px] leading-4" style={{ color: hub.textMuted }}>
              {diagNote}
            </p>
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid flex-1 gap-2 sm:grid-cols-3">
          {(
            [
              ["critical", counts.critical],
              ["important", counts.important],
              ["opportunity", counts.opportunity],
            ] as const
          ).map(([id, count]) => {
            const active = lifecycle === "open" && severity === id;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setLifecycle("open");
                  setSeverity(active ? "all" : id);
                }}
                className="rounded-2xl border bg-white px-4 py-3 text-left transition-colors hover:bg-[#F4F6F8]"
                style={{ borderColor: active ? hub.ink : hub.border }}
              >
                <span className="flex items-center gap-2">
                  <SeverityMark severity={id} />
                </span>
                <span className="mt-2 block text-[22px] font-semibold leading-none" style={{ ...hubNumeric, color: hub.text }}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
        <p className="text-[13px]" style={{ ...hubSans, color: hub.textMuted }}>
          Всего активных {openTasks.length}
        </p>
      </div>

      {categoryRows.length > 0 ? (
        <HubPanel className="px-4 py-3 sm:px-5">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-[13px] font-semibold" style={{ ...hubSans, color: hub.text }}>
              Где больше всего задач
            </p>
            {category !== "all" ? (
              <button
                type="button"
                onClick={() => setCategory("all")}
                className="text-[12px] font-semibold underline"
                style={{ ...hubSans, color: hub.textMuted }}
              >
                Показать все разделы
              </button>
            ) : null}
          </div>
          <div className="space-y-1.5">
            {categoryRows.map((row) => {
              const widest = Math.max(...categoryRows.map((r) => r.total));
              const selectedRow = category === row.category;
              const segments = [
                { id: "critical", count: row.critical, color: hub.danger, label: "критических" },
                { id: "important", count: row.important, color: hub.warn, label: "важных" },
                { id: "opportunity", count: row.opportunity, color: hub.blue, label: "возможностей" },
              ] as const;
              return (
                <div
                  key={row.category}
                  className="grid grid-cols-[132px_1fr_32px] items-center gap-3 rounded-lg px-1.5 py-1"
                  style={{ backgroundColor: selectedRow ? hub.canvas : "transparent" }}
                >
                  <button
                    type="button"
                    aria-pressed={selectedRow}
                    onClick={() => {
                      setLifecycle("open");
                      setCategory(selectedRow ? "all" : row.category);
                    }}
                    className="truncate text-left text-[13px]"
                    style={{ ...hubSans, color: hub.text, fontWeight: selectedRow ? 600 : 400 }}
                  >
                    {row.label}
                  </button>
                  <div className="flex h-5 gap-0.5" style={{ width: `${Math.max(8, (row.total / widest) * 100)}%` }}>
                    {segments.map((segment) =>
                      segment.count > 0 ? (
                        <button
                          key={segment.id}
                          type="button"
                          title={`${segment.count} ${segment.label}`}
                          aria-label={`${row.label}: ${segment.count} ${segment.label}`}
                          onClick={() => {
                            setLifecycle("open");
                            setCategory(row.category);
                            setSeverity(segment.id);
                          }}
                          className="h-full rounded-sm"
                          style={{ flexGrow: segment.count, backgroundColor: segment.color }}
                        />
                      ) : null,
                    )}
                  </div>
                  <span className="text-right text-[13px]" style={{ ...hubNumeric, color: hub.textMuted }}>
                    {row.total}
                  </span>
                </div>
              );
            })}
          </div>
        </HubPanel>
      ) : null}

      <HubTopActions
        actions={topActions}
        canAct={(action) => actionAvailable(action.actionType, findItem(items, action.primary))}
        onOpen={(action) => {
          setStatusNote(null);
          setSelectedId(action.primary.id);
        }}
        onAct={(action) => runAction(action.primary)}
      />

      <HubPanel className="px-4 py-3 sm:px-5">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <HubSegmented
              layoutId="task-lifecycle"
              value={lifecycle}
              onChange={setLifecycle}
              options={[
                { id: "open", label: "Активные" },
                { id: "snoozed", label: "Отложенные" },
                { id: "done", label: "Завершённые" },
              ]}
            />
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ["all", lifecycle === "open" ? "Все активные" : "Все"],
                  ["critical", "Критические"],
                  ["important", "Важные"],
                  ["opportunity", "Возможности"],
                ] as const
              ).map(([id, label]) => {
                const active = severity === id;
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setSeverity(id)}
                    className="rounded-full px-3 py-1.5 text-[13px] font-semibold"
                    style={{
                      ...hubSans,
                      backgroundColor: active ? hub.ink : hub.canvas,
                      color: active ? "#fff" : hub.text,
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">Поиск по товару</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: hub.textSubtle }} />
              <HubInput
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Товар или артикул"
                className="pl-9"
              />
            </label>
            <label className="min-w-[220px]">
              <span className="sr-only">Тип эффекта</span>
              <select
                value={impact}
                onChange={(event) => setImpact(event.target.value as TaskImpactType | "all")}
                className="w-full rounded-[11px] border px-3.5 py-2.5 text-[14px] outline-none focus:border-[#1F4E3D]/45 focus:ring-2 focus:ring-[#B9FF4B]/70"
                style={{ ...hubSans, backgroundColor: hub.inputBg, borderColor: hub.inputBorder, color: hub.text }}
              >
                {IMPACT_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.id === "all" ? "Эффект: все" : option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </HubPanel>

      {visible.length === 0 && lifecycle === "open" && !filtersNarrow && openTasks.length === 0 && snapshot && (blocked?.cards.length ?? 0) === 0 ? (
        <HubTasksOk snapshot={snapshot} tasks={tasks} nowMs={nowMs} />
      ) : visible.length === 0 ? (
        <HubPanel>
          <HubEmptyState
            icon={<CheckCircle2 className="h-6 w-6" />}
            title={filtersNarrow || lifecycle !== "open" ? "Таких задач нет" : "Всё под контролем"}
            description={
              filtersNarrow
                ? "По этим условиям задач нет."
                : lifecycle === "done"
                  ? "Завершённых задач пока нет."
                  : lifecycle === "snoozed"
                    ? "Отложенных задач нет."
                    : "Сейчас Karto не видит задач, требующих внимания. Следующая проверка появится после обновления данных."
            }
            action={
              filtersNarrow ? (
                <HubButton
                  variant="secondary"
                  onClick={() => {
                    setSeverity("all");
                    setImpact("all");
                    setCategory("all");
                    setQuery("");
                  }}
                >
                  Сбросить фильтр
                </HubButton>
              ) : undefined
            }
          />
        </HubPanel>
      ) : (
        <div className="space-y-2">
          {lifecycle === "done" ? (
            <div className="flex justify-end">
              <HubButton variant="secondary" onClick={() => downloadCompletedReport(visibleAll)}>
                Скачать отчёт (CSV)
              </HubButton>
            </div>
          ) : null}
          {visible.map((task) => {
            const item = findItem(items, task);
            const rows = evidenceRows(task.evidence).slice(0, 4);
            const label = actionLabel(task.actionType);
            const canAct = label != null && actionAvailable(task.actionType, item);
            const price = salePrice(item, task);
            return (
              <article
                key={task.id}
                className="cursor-pointer rounded-2xl border bg-white px-4 py-4 sm:px-5"
                style={{ borderColor: hub.border }}
                onClick={() => {
                  setStatusNote(null);
                  setSelectedId(task.id);
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setStatusNote(null);
                    setSelectedId(task.id);
                  }}
                  className="w-full text-left"
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <SeverityMark severity={task.severity} evidence={task.evidence} />
                    {(repeatsById.get(task.id) ?? 1) > 1 ? <HubBadge tone="muted">Повторялась {repeatsById.get(task.id)} {timesWord(repeatsById.get(task.id) ?? 0)}</HubBadge> : null}
                    <span className="text-[12px] font-medium" style={{ color: hub.textSubtle }}>
                      {impactLabel(task.businessImpactType)}
                    </span>
                    {task.status === "snoozed" || task.status === "in_progress" ? (
                      <HubBadge tone="muted">{statusLabel(task.status)}</HubBadge>
                    ) : null}
                  </span>
                  <span className="mt-2 block text-[16px] font-semibold leading-6" style={{ color: hub.text }}>
                    {task.title}
                  </span>
                  <span className="mt-1 block text-[14px] leading-6" style={{ color: hub.textMuted }}>
                    {task.description}
                  </span>
                  {whyImportantText(task.evidence) ? (
                    <span className="mt-1 block text-[13px] leading-5" style={{ color: hub.text }}>
                      {whyImportantText(task.evidence)}
                    </span>
                  ) : null}
                </button>

                {task.nmId ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      if (item) setProduct(item);
                    }}
                    disabled={!item}
                    className="mt-3 flex w-full items-center gap-3 rounded-xl px-1 py-1 text-left hover:bg-[#F4F6F8] disabled:cursor-default disabled:hover:bg-transparent"
                  >
                    <HubPhoto src={item?.imageUrl} className="h-11 w-11 shrink-0 rounded-lg" />
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-semibold" style={{ color: hub.text }}>
                        {item?.title || task.productTitle || "Товар"}
                      </span>
                      <span className="block truncate text-[12px]" style={{ ...hubNumeric, color: hub.textSubtle }}>
                        {[task.vendorCode, task.nmId ? `nm ${task.nmId}` : null, price != null ? formatRub(price) : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                  </button>
                ) : (
                  <p className="mt-3 text-[13px] font-medium" style={{ color: hub.textMuted }}>
                    Задача магазина
                  </p>
                )}

                {rows.length > 0 ? (
                  <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
                    {rows.map((row) => (
                      <div key={row.label} className="flex items-baseline justify-between gap-3">
                        <dt className="text-[12px]" style={{ color: hub.textSubtle }}>
                          {row.label}
                        </dt>
                        <dd className="text-[13px] font-semibold" style={{ ...hubNumeric, color: hub.text }}>
                          {row.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : null}

                <p className="mt-3 text-[13px] leading-5" style={{ color: hub.textMuted }}>
                  {impactWhy(task.businessImpactType)}
                </p>
                {task.recommendation ? (
                  <p className="mt-1 text-[13px] leading-5" style={{ color: hub.text }}>
                    {task.recommendation}
                  </p>
                ) : null}
                {canAct && label ? (
                  <div className="mt-3" onClick={(event) => event.stopPropagation()}>
                    <HubButton size="sm" onClick={() => runAction(task)}>
                      {label}
                    </HubButton>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}

      {selected ? (
        <TaskDrawer
          key={selected.id}
          task={selected}
          related={topActions.find((action) => action.id === selected.id)?.supporting ?? []}
          item={findItem(items, selected)}
          price={salePrice(findItem(items, selected), selected)}
          statusNote={statusNote}
          saving={statusSaving}
          onClose={() => setSelectedId(null)}
          onOpenProduct={(item) => setProduct(item)}
          onAction={() => runAction(selected)}
          onApplyPrice={(fix) => applyPriceFix(selected, fix)}
          onComplete={() => void saveStatus(selected, { status: "completed" })}
          onSnooze={(until) => void saveStatus(selected, { status: "snoozed", snoozeUntil: until })}
          productEvents={recentProductEvents(events, selected.nmId)}
          onMute={
            selected.nmId && selected.type !== "TASK_FROM_EVENT"
              ? () =>
                  void muteSellerHubTask(selected.nmId!, selected.type, true, snapshot.marketplaceId)
                    .then((res) => {
                      if (res.ok) {
                        setSelectedId(null);
                        setAttempt((value) => value + 1);
                      } else setStatusNote(res.error);
                    })
                    .catch(() => setStatusNote("Не удалось отключить задачи по этому товару"))
              : undefined
          }
        />
      ) : null}

      {settingsOpen ? (
        <HubTaskSettings
          marketplaceId={snapshot.marketplaceId}
          items={items}
          onClose={() => setSettingsOpen(false)}
          onSaved={() => setAttempt((value) => value + 1)}
        />
      ) : null}

      {product ? (
        <HubProductDrawer
          item={product}
          promotions={snapshot.promotions}
          connected={connected}
          onOpenPrices={onOpenPrices}
          onClose={() => setProduct(null)}
          onPatched={(patch) => {
            if (!onItemsUpdate) return;
            onItemsUpdate(items.map((row) => (row.id === patch.id ? { ...row, ...patch } : row)));
          }}
        />
      ) : null}
    </div>
  );
}

function TaskDrawer({
  task,
  related,
  item,
  price,
  statusNote,
  saving,
  onClose,
  onOpenProduct,
  onAction,
  onApplyPrice,
  onComplete,
  onSnooze,
  onMute,
  productEvents,
}: {
  task: SellerTask;
  related: SellerTask[];
  item: SellerCatalogItem | null;
  price: number | null;
  statusNote: string | null;
  saving: boolean;
  onClose: () => void;
  onOpenProduct: (item: SellerCatalogItem) => void;
  onAction: () => void;
  onApplyPrice: (fix: PriceFix) => Promise<{ ok: boolean; message: string }>;
  onComplete: () => void;
  onSnooze: (until: string) => void;
  /** Не создавать такие задачи по этому товару. Нет — задача магазина или созданная вами из уведомления. */
  onMute?: () => void;
  /** Что менялось по этому товару (последние события). */
  productEvents: SellerProductEvent[];
}) {
  const [postpone, setPostpone] = useState(false);
  const [fixConfirm, setFixConfirm] = useState(false);
  const [fixBusy, setFixBusy] = useState(false);
  const [fixResult, setFixResult] = useState<{ ok: boolean; message: string } | null>(null);
  const priceFix = suggestPriceFix(task.type, task.evidence, item);
  const rows = evidenceRows(task.evidence);
  const note = evidenceNote(task.evidence);
  const label = actionLabel(task.actionType);
  const canAct = label != null && actionAvailable(task.actionType, item);
  const canSettle = task.status === "active" || task.status === "in_progress" || task.status === "snoozed";
  const choices = postpone ? snoozeChoices(new Date()) : [];

  return (
    <div className="fixed inset-0 z-30">
      <button type="button" aria-label="Закрыть задачу" className="absolute inset-0 bg-black/35" onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-drawer-title"
        className="absolute inset-y-0 right-0 flex w-full max-w-[480px] flex-col border-l bg-white"
        style={{ borderColor: hub.border }}
      >
        <div className="flex items-start justify-between gap-3 border-b px-5 py-4" style={{ borderColor: hub.border }}>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <SeverityMark severity={task.severity} evidence={task.evidence} />
              <HubBadge tone="muted">{statusLabel(task.status)}</HubBadge>
            </div>
            <h2 id="task-drawer-title" className="mt-3 text-[20px] font-semibold leading-7" style={{ color: hub.text }}>
              {task.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 hover:bg-[#F4F6F8]"
            aria-label="Закрыть"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
          <p className="text-[14px] leading-6" style={{ color: hub.textMuted }}>
            {task.description}
          </p>
          {whyImportantText(task.evidence) ? (
            <p className="text-[14px] leading-6" style={{ color: hub.text }}>
              {whyImportantText(task.evidence)}
            </p>
          ) : null}
          {task.nmId ? (
            <button
              type="button"
              disabled={!item}
              onClick={() => item && onOpenProduct(item)}
              className="flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left hover:bg-[#F4F6F8] disabled:cursor-default"
              style={{ borderColor: hub.border }}
            >
              <HubPhoto src={item?.imageUrl} className="h-12 w-12 shrink-0 rounded-lg" />
              <span className="min-w-0">
                <span className="block truncate text-[14px] font-semibold">{item?.title || task.productTitle || "Товар"}</span>
                <span className="block text-[12px]" style={{ ...hubNumeric, color: hub.textSubtle }}>
                  {[task.vendorCode, task.nmId, price != null ? formatRub(price) : null].filter(Boolean).join(" · ")}
                </span>
              </span>
            </button>
          ) : (
            <p className="text-[13px] font-medium" style={{ color: hub.textMuted }}>
              Задача магазина
            </p>
          )}
          <section>
            <h3 className="text-[13px] font-semibold" style={{ color: hub.text }}>
              Почему появилась задача
            </h3>
            <p className="mt-1 text-[14px] leading-6" style={{ color: hub.textMuted }}>
              {task.reason}
            </p>
          </section>
          {related.length > 0 ? (
            <section>
              <h3 className="text-[13px] font-semibold" style={{ color: hub.text }}>
                Почему Karto рекомендует это сейчас
              </h3>
              <ul className="mt-2 space-y-3">
                {related.map((itemTask) => (
                  <li key={itemTask.id}>
                    <p className="text-[14px] font-medium leading-5" style={{ color: hub.text }}>
                      {itemTask.title}
                    </p>
                    {itemTask.reason ? (
                      <p className="mt-1 text-[13px] leading-5" style={{ color: hub.textMuted }}>
                        {itemTask.reason}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {rows.length > 0 || note ? (
            <section>
              <h3 className="text-[13px] font-semibold" style={{ color: hub.text }}>
                Доказательства
              </h3>
              <dl className="mt-2 space-y-2">
                {rows.map((row) => (
                  <div key={row.label} className="flex items-baseline justify-between gap-4">
                    <dt className="text-[13px]" style={{ color: hub.textSubtle }}>
                      {row.label}
                    </dt>
                    <dd className="text-[14px] font-semibold" style={{ ...hubNumeric, color: hub.text }}>
                      {row.value}
                    </dd>
                  </div>
                ))}
              </dl>
              {note ? (
                <p className="mt-2 text-[13px] leading-5" style={{ color: hub.textMuted }}>
                  {note}
                </p>
              ) : null}
            </section>
          ) : null}
          <section>
            <h3 className="text-[13px] font-semibold" style={{ color: hub.text }}>
              Почему это важно
            </h3>
            <p className="mt-1 text-[14px] leading-6" style={{ color: hub.textMuted }}>
              {impactWhy(task.businessImpactType)}
            </p>
          </section>
          {productEvents.length > 0 ? (
            <section>
              <h3 className="text-[13px] font-semibold" style={{ color: hub.text }}>
                Что менялось по этому товару
              </h3>
              <ul className="mt-1 space-y-1">
                {productEvents.map((e) => (
                  <li key={e.id} className="text-[13px] leading-5" style={{ color: hub.textMuted }}>
                    <span style={{ ...hubNumeric, color: hub.textSubtle }}>
                      {new Date(e.createdAt).toLocaleDateString("ru-RU", { day: "numeric", month: "short", timeZone: "Europe/Moscow" }).replace(".", "")}
                    </span>
                    {" · "}
                    <span style={{ color: hub.text }}>{e.title}</span>
                    {e.detail ? `: ${e.detail.split("\n").join("; ")}` : ""}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <section>
            <h3 className="text-[13px] font-semibold" style={{ color: hub.text }}>
              Что сделать
            </h3>
            <p className="mt-1 text-[14px] leading-6" style={{ color: hub.text }}>
              {task.recommendation}
            </p>
          </section>
          {priceFix ? (
            <section className="rounded-xl border px-4 py-3" style={{ borderColor: hub.border, backgroundColor: hub.greenSoft }}>
              <h3 className="text-[13px] font-semibold" style={{ color: hub.text }}>
                Можно исправить сразу
              </h3>
              <p className="mt-1 text-[14px] leading-6" style={{ color: hub.text }}>
                Поставить цену {formatRub(priceFix.targetRub)} вместо {formatRub(priceFix.currentRub)}: это безубыточная цена.
                В WB уйдёт базовая цена {formatRub(priceFix.baseRub)} при вашей скидке {priceFix.discount}%, скидка не меняется.
              </p>
              {fixResult ? (
                <p
                  className="mt-2 text-[13px] leading-5"
                  role="status"
                  style={{ color: fixResult.ok ? hub.greenDark : hub.danger }}
                >
                  {fixResult.message}
                </p>
              ) : fixConfirm ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <HubButton
                    loading={fixBusy}
                    onClick={() => {
                      setFixBusy(true);
                      void onApplyPrice(priceFix)
                        .then(setFixResult)
                        .catch(() => setFixResult({ ok: false, message: "Не удалось отправить цену" }))
                        .finally(() => setFixBusy(false));
                    }}
                  >
                    Отправить в WB
                  </HubButton>
                  <HubButton variant="secondary" disabled={fixBusy} onClick={() => setFixConfirm(false)}>
                    Отмена
                  </HubButton>
                </div>
              ) : (
                <div className="mt-2">
                  <HubButton onClick={() => setFixConfirm(true)}>Поставить цену {formatRub(priceFix.targetRub)}</HubButton>
                </div>
              )}
            </section>
          ) : null}
        </div>
        <div className="space-y-2 border-t px-5 py-4" style={{ borderColor: hub.border }}>
          {canAct && label ? <HubButton onClick={onAction}>{label}</HubButton> : null}
          {canSettle ? (
            <div className="flex flex-wrap gap-2">
              <HubButton variant="secondary" disabled={saving} onClick={onComplete}>
                Выполнено
              </HubButton>
              <HubButton variant="ghost" disabled={saving} onClick={() => setPostpone((open) => !open)}>
                Отложить
              </HubButton>
            </div>
          ) : null}
          {canSettle && postpone ? (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Срок откладывания">
              {choices.map((choice) => (
                <HubButton key={choice.label} variant="secondary" size="sm" disabled={saving} onClick={() => onSnooze(choice.until)}>
                  {choice.label}
                </HubButton>
              ))}
            </div>
          ) : null}
          {onMute ? (
            <button type="button" disabled={saving} onClick={onMute} className="text-[12.5px] font-medium underline-offset-2 hover:underline" style={{ color: hub.textMuted }}>
              Не создавать такие задачи по этому товару
            </button>
          ) : null}
          {statusNote ? (
            <p className="text-[13px] leading-5" role="alert" style={{ color: hub.danger }}>
              {statusNote}
            </p>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
