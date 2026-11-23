"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  CheckCircle2,
  CircleCheck,
  ChevronDown,
  Clock,
  EyeOff,
  Lightbulb,
  Download,
  Search,
  SlidersHorizontal,
  Undo2,
  X,
} from "lucide-react";
import type { SellerProductEvent } from "@/lib/seller-hub/event-engine/types";
import { muteSellerHubTask } from "@/lib/seller-hub/client-api";
import { loadSellerHubTasks, updateSellerHubTaskStatus } from "@/lib/seller-hub/task-engine/client";
import { collapseCompleted } from "@/lib/seller-hub/task-engine/completed-groups";
import { recentProductEvents } from "@/lib/seller-hub/task-engine/product-events";
import { HubTaskSettings } from "./hub-task-settings";
import { suggestPriceFix, type PriceFix } from "@/lib/seller-hub/task-engine/fix";
import { loadSellerHubBlockedCards, updateSellerHubPrices } from "@/lib/seller-hub/client-api";
import { claimPriceSubmit, releasePriceSubmit } from "@/lib/seller-hub/price-write";
import { isActionableTask, isPendingSnooze, isUserCompleted, snoozeChoices } from "@/lib/seller-hub/task-engine/lifecycle";
import type { SellerTask, TaskActionType, TaskCategory, TaskEvidence, TaskImpactType, TaskSeverity } from "@/lib/seller-hub/task-engine/types";
import { isFunnelReadyForDemandTasks } from "@/lib/services/wildberries/funnel-parse";
import type { SellerBlockedCards, SellerCatalogItem, SellerCatalogSnapshot, SellerFunnelSnapshot } from "@/lib/seller-hub/types";
import { DEFAULT_TASK_THRESHOLDS } from "@/lib/seller-hub/task-engine/config";
import { severityTooltipLines } from "@/lib/seller-hub/task-engine/severity";
import { HubProductDrawer } from "./hub-product-drawer";
import { TASK_CACHE } from "./task-cache";
import { clearTaskFocus, peekTaskFocus, type TaskFocus } from "./task-focus";
import { AnalyticsMotion } from "./hub-analytics-ui";
import { compareByPriority } from "@/lib/seller-hub/task-engine/priority";
import { CATEGORY_ORDER, TASK_CATEGORY_LABEL } from "@/lib/seller-hub/task-engine/breakdown";
import { humanizeText, taskDisplayTitle, taskStory } from "@/lib/seller-hub/task-engine/story";
import { completedTasksCsv } from "@/lib/seller-hub/task-engine/report";
import {
  actionLabel,
  viewLabel,
  evidenceNote,
  evidenceRows,
  briefText,
  detailLines,
  splitLabelValue,
  impactWhy,
  IMPACT_OPTIONS,
  severityLabel,
  statusLabel,
} from "./hub-task-present";
import { HubTopActions } from "./hub-top-actions";
import { HubTasksHidden } from "./hub-tasks-hidden";
import { HubTasksNavigator, type NavRow, type NavSection } from "./hub-tasks-navigator";
import { HubPriceFixDialog } from "./hub-price-fix-dialog";
import { HubTasksOk } from "./hub-tasks-ok";
import { AiFindingCard, useAiFindings } from "./hub-ai-findings";
import type { AiFeedItem } from "@/lib/seller-hub/client-api";
import { HubTasksRisks } from "./hub-tasks-risks";
import { buildTopActions } from "./top-actions";
import {
  formatRub,
  HubBadge,
  HubButton,
  HubEmptyState,
  HubSearch,
  HubSegmented,
  HubSelect,
  HubPhoto,
  ArticleChip,
  HubTabs,
  ACTION_ICONS,
  SEVERITY_ICONS,
  hub,
  hubNumeric,
  hubSans,
  hubSerif,
} from "./hub-ui";

const NO_ITEMS: SellerCatalogItem[] = [];

type Lifecycle = "open" | "snoozed" | "done" | "hidden";
type SeverityFilter = "all" | TaskSeverity;

function funnelDemandNote(funnel: SellerFunnelSnapshot | undefined): string | null {
  if (!funnel) {
    return "Воронка заказов ещё не загружена. Задачи «конверсия» и «трафик» появятся после чтения Analytics.";
  }
  if (funnel.status === "jam_required" || /Джем|джем/i.test(funnel.error ?? "")) {
    return "Воронка заказов (переходы, корзина, заказы) для этого кабинета недоступна. Задачи по конверсии и трафику не считаются, только выкупы из реализации.";
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
    case "hidden":
      return false;
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
    <div role="status" aria-live="polite" className="space-y-4">
      <AnalyticsMotion />
      <p className="px-1 text-[17px] font-semibold" style={{ ...hubSans, color: hub.text }}>
        Загружаю задачи
        <span className="hub-dots" aria-hidden />
      </p>
      <div className="grid gap-x-12 gap-y-6 xl:grid-cols-[minmax(0,1fr)_296px]">
        <div className="space-y-4">
          <div className="hub-skel h-[300px] rounded-[22px]" />
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="hub-skel h-[150px] rounded-[20px]" style={{ animationDelay: `${index * 0.15}s` }} />
          ))}
        </div>
        <div className="hub-skel order-last h-[420px] rounded-[22px]" style={{ animationDelay: "0.2s" }} />
      </div>
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
  const Icon = SEVERITY_ICONS[severity];
  return (
    <HubBadge tone={tone} title={severityHint(severity, evidence)} icon={<Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />}>
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
  previewTasks,
  previewAiItems,
}: {
  previewAiItems?: AiFeedItem[];
  /** Только для страницы предпросмотра: готовый список вместо загрузки с сервера. */
  previewTasks?: SellerTask[];
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
  const [tasks, setTasks] = useState<SellerTask[]>(() => TASK_CACHE.get(snapshot?.marketplaceId ?? "") ?? []);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [lifecycle, setLifecycle] = useState<Lifecycle>("open");
  const [severity, setSeverity] = useState<SeverityFilter>("all");
  const [impact, setImpact] = useState<TaskImpactType | "all">("all");
  const [category, setCategory] = useState<TaskCategory | "all">(() => peekTaskFocus()?.category ?? "all");
  const [query, setQuery] = useState("");
  const [onlyAi, setOnlyAi] = useState(false);
  const [productNm, setProductNm] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** Переход из другого раздела: категория уже включена, к нужной задаче докручиваем с подсветкой и открываем её. */
  const [pendingFocus] = useState<TaskFocus | null>(() => peekTaskFocus());
  const focusDone = useRef(false);
  useEffect(() => () => clearTaskFocus(), []);
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

  useEffect(() => {
    if (!connected || !snapshot || !requestKey) return;
    const current = snapshot;
    const key = requestKey;
    if (previewTasks) {
      setTasks(previewTasks);
      setError(false);
      setLoadedKey(key);
      return;
    }
    let cancelled = false;
    void loadSellerHubTasks(current)
      .then((rows) => {
        TASK_CACHE.set(current.marketplaceId, rows);
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
  }, [connected, snapshot, requestKey, previewTasks]);

  const items = snapshot?.items ?? NO_ITEMS;
  const aiTitleByNm = useMemo(() => new Map(items.map((row) => [String(row.externalId), row.title])), [items]);
  const aiCardByNm = useMemo(
    () => new Map(items.map((row) => [String(row.externalId), { title: row.title, vendorCode: row.vendorCode, description: row.description ?? "", imageUrl: row.imageUrl }])),
    [items],
  );
  const ai = useAiFindings({ previewItems: previewAiItems, titleByNm: aiTitleByNm, cardByNm: aiCardByNm });
  const failed = error && loadedKey === requestKey;
  const loading = Boolean(requestKey) && loadedKey !== requestKey;

  useEffect(() => {
    if (!pendingFocus || focusDone.current || tasks.length === 0) return;
    // Задача из панели могла получить новый номер при пересчёте: ищем сначала по номеру, потом по типу и товару.
    const target =
      tasks.find((t) => t.id === pendingFocus.id) ??
      (pendingFocus.type ? tasks.find((t) => t.type === pendingFocus.type && (t.nmId ?? null) === (pendingFocus.nmId ?? null) && isActionableTask(t, Date.now())) : undefined);
    let tries = 0;
    let flashTimer: ReturnType<typeof setTimeout> | undefined;
    let openTimer: ReturnType<typeof setTimeout> | undefined;
    const poll = setInterval(() => {
      tries += 1;
      if (!pendingFocus.id) {
        focusDone.current = true;
        clearInterval(poll);
        return;
      }
      if (!target) {
        if (!loading && tries >= 2) {
          focusDone.current = true;
          clearInterval(poll);
          setStatusNote("Этой задачи уже нет в списке: она обновилась или закрыта. Показаны остальные задачи категории.");
        }
        return;
      }
      const el = document.querySelector<HTMLElement>(`[data-task-id="${target.id.replace(/"/g, "")}"]`);
      if (!el && tries < 20) return;
      focusDone.current = true;
      clearInterval(poll);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("hub-task-flash");
        flashTimer = setTimeout(() => el.classList.remove("hub-task-flash"), 2000);
        openTimer = setTimeout(() => setSelectedId(target.id), 450);
      } else {
        setSelectedId(target.id);
      }
    }, 80);
    return () => {
      clearInterval(poll);
      if (flashTimer) clearTimeout(flashTimer);
      if (openTimer) clearTimeout(openTimer);
    };
  }, [pendingFocus, loading, tasks]);
  const nowMs = Date.now();
  const openTasks = useMemo(() => tasks.filter((task) => isActionableTask(task, nowMs)), [tasks, nowMs]);
  const topActions = useMemo(() => buildTopActions(tasks, nowMs), [tasks, nowMs]);
  const totalActive = openTasks.length + ai.items.length;

  const visibleAll = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return tasks.filter((task) => matchesLifecycle(task, lifecycle, nowMs))
      .filter((task) => (severity === "all" ? true : task.severity === severity))
      .filter((task) => (impact === "all" ? true : task.businessImpactType === impact))
      .filter((task) => (category === "all" ? true : task.category === category))
      .filter((task) => (productNm ? task.nmId === productNm : true))
      .filter(() => !onlyAi)
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
  }, [tasks, lifecycle, severity, impact, category, productNm, onlyAi, query, items, nowMs]);
  // В «Завершённых» одна строка на пару «тип + товар» с числом повторов; в остальных списках всё как есть.
  const completedGroups = useMemo(() => (lifecycle === "done" ? collapseCompleted(visibleAll) : null), [lifecycle, visibleAll]);
  const visible = completedGroups ? completedGroups.map((g) => g.task) : visibleAll;
  const repeatsById = useMemo(() => new Map((completedGroups ?? []).map((g) => [g.task.id, g.repeats])), [completedGroups]);
  const navRows = useMemo<NavRow[]>(
    () => [
      ...openTasks.map((task) => ({ level: task.severity, cat: task.category, nm: task.nmId ?? null })),
      ...ai.items.map((row) => ({ level: (row.severity === "watch" ? "opportunity" : row.severity) as NavRow["level"], cat: "ai" as const, nm: row.finding?.nmId ?? null })),
    ],
    [openTasks, ai.items],
  );
  const productInfo = useCallback(
    (nm: string) => {
      const row = items.find((item) => String(item.externalId) === nm);
      return row ? { title: row.title, vendorCode: row.vendorCode, imageUrl: row.imageUrl } : null;
    },
    [items],
  );
  const section: NavSection = onlyAi ? "ai" : category;
  function setSection(value: NavSection) {
    setLifecycle("open");
    if (value === "ai") {
      setOnlyAi(true);
      setCategory("all");
    } else {
      setOnlyAi(false);
      setCategory(value);
    }
  }

  // Находки ИИ лежат в общем списке среди задач. Они не откладываются и не завершаются, поэтому видны только в «Активных».
  const aiVisible = useMemo(() => {
    if (lifecycle !== "open" || impact !== "all" || category !== "all") return [];
    const needle = query.trim().toLowerCase();
    return ai.items.filter((row) => {
      const level = row.severity === "watch" ? "opportunity" : row.severity;
      if (severity !== "all" && level !== severity) return false;
      if (productNm && row.finding!.nmId !== productNm) return false;
      if (!needle) return true;
      const f = row.finding!;
      const haystack = [f.title, f.what, f.nmId, f.nmId ? aiTitleByNm.get(f.nmId) : null].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(needle);
    });
  }, [ai.items, lifecycle, impact, category, severity, productNm, query, aiTitleByNm]);
  const entries = useMemo(() => {
    const rank = { critical: 0, important: 1, opportunity: 2 } as const;
    const out: Array<{ kind: "ai"; item: AiFeedItem } | { kind: "task"; task: SellerTask }> = [];
    for (const level of ["critical", "important", "opportunity"] as const) {
      for (const row of aiVisible) {
        if (rank[row.severity === "watch" ? "opportunity" : row.severity] === rank[level]) out.push({ kind: "ai", item: row });
      }
      for (const task of visible) if (task.severity === level) out.push({ kind: "task", task });
    }
    return out;
  }, [aiVisible, visible]);

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
    patch: { status: "completed" } | { status: "active" } | { status: "snoozed"; snoozeUntil: string },
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

  /** Запись цены в WB: и «Исправить», и «Вернуть как было». Сверяем с тем, что человек видел, чтобы не затереть чужую правку. */
  async function writePrice(
    task: SellerTask,
    next: { baseRub: number; discount: number },
    seen: { price: number | null; discount: number | null } | undefined,
  ): Promise<{ ok: boolean; message: string }> {
    if (!task.nmId || !claimPriceSubmit(priceLock)) return { ok: false, message: "Цена уже отправляется." };
    try {
      const result = await updateSellerHubPrices({
        updates: [{ nmId: Number(task.nmId), price: next.baseRub, discount: next.discount, expected: seen }],
      });
      if (result.outcome === "confirmed" && onItemsUpdate) {
        const target = findItem(items, task);
        if (target) {
          onItemsUpdate(
            items.map((row) =>
              row.id === target.id
                ? { ...row, price: next.baseRub, discountPercent: next.discount, discountedPrice: Math.round(next.baseRub * (1 - next.discount / 100)) }
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

  /** Окно «Исправить цену» держит прежние значения: по ним же работает «Вернуть как было». */
  const [fixDialog, setFixDialog] = useState<{ task: SellerTask; fix: PriceFix; previous: { baseRub: number; discount: number; currentRub: number } } | null>(null);

  /** Кнопка «Исправить цену» есть, только если известны прежние база и скидка: иначе вернуть было бы нечем. */
  function fixFor(task: SellerTask): { fix: PriceFix; previous: { baseRub: number; discount: number; currentRub: number } } | null {
    const row = findItem(items, task);
    const fix = suggestPriceFix(task.type, task.evidence, row);
    if (!fix || !row || row.price == null || !(row.price > 0)) return null;
    return { fix, previous: { baseRub: row.price, discount: row.discountPercent ?? 0, currentRub: fix.currentRub } };
  }

  function openFix(task: SellerTask) {
    const found = fixFor(task);
    if (found) setFixDialog({ task, ...found });
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
      <div>
        <HubEmptyState
          icon={<CheckCircle2 className="h-6 w-6" />}
          title="Недостаточно данных для анализа"
          description="Подключите и синхронизируйте кабинет, чтобы Karto мог сформировать задачи."
        />
      </div>
    );
  }

  if (loading && tasks.length === 0) return <TaskSkeleton />;

  if (failed && tasks.length === 0) {
    return (
      <div>
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
      </div>
    );
  }

  const filtersNarrow = severity !== "all" || impact !== "all" || category !== "all" || onlyAi || productNm != null || query.trim().length > 0;
  const funnelNote = funnelDemandNote(snapshot.funnel);
  const showOk =
    entries.length === 0 && lifecycle === "open" && !filtersNarrow && openTasks.length === 0 && ai.items.length === 0 && snapshot && (blocked?.cards.length ?? 0) === 0;

  function resetFilters() {
    setSeverity("all");
    setImpact("all");
    setCategory("all");
    setOnlyAi(false);
    setProductNm(null);
    setQuery("");
  }

  /** Не создавать такие задачи по этому товару. Нет — задача магазина или созданная вами из уведомления. */
  function muteHandler(task: SellerTask): (() => void) | undefined {
    if (!task.nmId || task.type === "TASK_FROM_EVENT") return undefined;
    return () =>
      void muteSellerHubTask(task.nmId!, task.type, true, snapshot!.marketplaceId)
        .then((res) => {
          if (res.ok) {
            setSelectedId(null);
            setAttempt((value) => value + 1);
          } else setStatusNote(res.error);
        })
        .catch(() => setStatusNote("Не удалось отключить задачи по этому товару"));
  }

  function openTask(task: SellerTask) {
    setStatusNote(null);
    setSelectedId(task.id);
  }

  return (
    <div className="grid gap-x-12 gap-y-10 pb-8 xl:grid-cols-[minmax(0,1fr)_296px]">
      <HubTasksNavigator
        rows={navRows}
        severityRows={SEVERITY_ROWS}
        categoryOrder={CATEGORY_ORDER}
        categoryLabel={TASK_CATEGORY_LABEL}
        severity={severity}
        onSeverity={(value) => {
          setLifecycle("open");
          setSeverity(value);
        }}
        section={section}
        onSection={setSection}
        productNm={productNm}
        onProduct={(nm) => {
          setLifecycle("open");
          setProductNm(nm);
        }}
        productInfo={productInfo}
        shown={entries.length}
        total={totalActive}
      />

      <div className="min-w-0 space-y-10">
        <HubTasksRisks blocked={blocked} />
        <HubTopActions
          actions={topActions}
          canAct={(action) => actionAvailable(action.actionType, findItem(items, action.primary))}
          saving={statusSaving}
          onOpen={(action) => openTask(action.primary)}
          onAct={(action) => runAction(action.primary)}
          fixFor={(action) => (action.primary.status === "active" && fixFor(action.primary) ? () => openFix(action.primary) : undefined)}
          onComplete={(action) => void saveStatus(action.primary, { status: "completed" })}
          muteFor={(action) => muteHandler(action.primary)}
          itemFor={(action) => findItem(items, action.primary)}
        />
        {funnelNote ? <TaskNote>{funnelNote}</TaskNote> : null}
        {failed ? <TaskNote>Не удалось обновить задачи. Показан последний загруженный список.</TaskNote> : null}


        <section aria-label="Список задач" className="space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-b" style={{ borderColor: hub.border }}>
            <HubTabs
              label="Состояние задач"
              value={lifecycle}
              onChange={setLifecycle}
              options={[
                { id: "open", label: "Активные", count: totalActive },
                { id: "snoozed", label: "Отложенные" },
                { id: "done", label: "Завершённые" },
                { id: "hidden", label: "Скрытые" },
              ]}
            />
            <div className="flex flex-wrap items-center gap-2 pb-2.5">
              {lifecycle === "done" && visible.length > 0 ? (
                <HubButton size="sm" variant="secondary" onClick={() => downloadCompletedReport(visibleAll)}>
                  <Download className="h-3.5 w-3.5" strokeWidth={1.75} />
                  Скачать отчёт (CSV)
                </HubButton>
              ) : null}
              <HubButton size="sm" variant="secondary" onClick={() => setSettingsOpen(true)}>
                <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={1.75} />
                Настройки задач
              </HubButton>
            </div>
          </div>

          {lifecycle === "hidden" && snapshot ? (
            <HubTasksHidden
              marketplaceId={snapshot.marketplaceId}
              items={items}
              onRestoredTask={() => setAttempt((value) => value + 1)}
              onRestoredAi={() => void ai.load()}
            />
          ) : (
            <>
          <div className="flex flex-wrap items-center gap-3">
            <HubSearch value={query} onChange={setQuery} placeholder="Товар или артикул" label="Поиск по товару" className="w-full sm:w-[320px]" />
            <HubSegmented
              layoutId="task-severity"
              pill
              value={severity}
              onChange={setSeverity}
              options={[
                { id: "all", label: "Все" },
                { id: "critical", label: "Критические" },
                { id: "important", label: "Важные" },
                { id: "opportunity", label: "Возможности" },
              ]}
            />
            <HubSelect
              label="Эффект"
              icon={<SlidersHorizontal className="h-4 w-4" strokeWidth={1.75} />}
              value={impact}
              onChange={setImpact}
              options={IMPACT_OPTIONS.map((option) => ({ id: option.id, label: option.id === "all" ? "Все" : option.label }))}
            />
          </div>

          {showOk && snapshot ? (
            <HubTasksOk snapshot={snapshot} tasks={tasks} nowMs={nowMs} />
          ) : entries.length === 0 ? (
            <HubEmptyState
              icon={<CheckCircle2 className="h-5 w-5" strokeWidth={1.5} />}
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
                  <HubButton variant="secondary" onClick={resetFilters}>
                    Сбросить фильтр
                  </HubButton>
                ) : undefined
              }
            />
          ) : (
            <ul className="space-y-3">
              {entries.map((entry, index) =>
                entry.kind === "ai" ? (
                  <AiFindingCard key={entry.item.key} item={entry.item} ctx={ai} />
                ) : (
                  <TaskRow
                    key={entry.task.id}
                    index={index}
                    task={entry.task}
                    item={findItem(items, entry.task)}
                    repeats={repeatsById.get(entry.task.id) ?? 1}
                    saving={statusSaving}
                    onOpen={() => openTask(entry.task)}
                    onOpenProduct={(row) => setProduct(row)}
                    onAction={() => runAction(entry.task)}
                    onFix={entry.task.status === "active" && fixFor(entry.task) ? () => openFix(entry.task) : undefined}
                    onComplete={() => void saveStatus(entry.task, { status: "completed" })}
                    onReopen={entry.task.status === "snoozed" || isUserCompleted(entry.task) ? () => void saveStatus(entry.task, { status: "active" }) : undefined}
                    onMute={muteHandler(entry.task)}
                  />
                ),
              )}
            </ul>
          )}
            </>
          )}
        </section>
      </div>

      {fixDialog ? (
        <HubPriceFixDialog
          key={fixDialog.task.id}
          title={fixDialog.task.productTitle ?? findItem(items, fixDialog.task)?.title ?? fixDialog.task.title}
          vendorCode={fixDialog.task.vendorCode}
          photoUrl={findItem(items, fixDialog.task)?.imageUrl}
          fix={fixDialog.fix}
          previous={fixDialog.previous}
          onApply={() =>
            writePrice(fixDialog.task, fixDialog.fix, { price: fixDialog.previous.baseRub, discount: fixDialog.previous.discount })
          }
          onUndo={() =>
            writePrice(fixDialog.task, fixDialog.previous, { price: fixDialog.fix.baseRub, discount: fixDialog.fix.discount })
          }
          onCheckPrice={() => {
            const row = findItem(items, fixDialog.task);
            setFixDialog(null);
            if (row) onOpenPrices(row.id);
          }}
          onClose={() => setFixDialog(null)}
        />
      ) : null}

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
          onFix={selected.status === "active" && fixFor(selected) ? () => openFix(selected) : undefined}
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

const SEVERITY_ROWS = [
  { id: "critical", label: "Критические", dot: "#D33A3C" },
  { id: "important", label: "Важные", dot: "#D29922" },
  { id: "opportunity", label: "Возможности", dot: "#4076B9" },
] as const;

/** Пояснение над списком: тихая подложка без рамки. */
function TaskNote({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-[12px] px-4 py-3 text-[13px] leading-5" style={{ ...hubSans, backgroundColor: hub.surfaceMuted, color: hub.textMuted }}>
      {children}
    </p>
  );
}

/**
 * Карточка задачи. Белая, с чёткой границей. Слева суть (что случилось, что сделать, товар с фото),
 * правее главные цифры (выровнены вправо), в самом правом краю блок действий одной ширины:
 * главное действие, а под ним «Выполнено» и «Скрыть» ровно пополам.
 * Полные доказательства, цена и «почему это важно» открывает панель задачи.
 */
export function TaskRow({
  compact = false,
  index,
  task,
  item,
  repeats,
  saving,
  onOpen,
  onOpenProduct,
  onAction,
  onFix,
  onComplete,
  onReopen,
  onMute,
}: {
  /** В переписке с агентом: один столбец, без кнопок действий (нажатие открывает задачу в разделе). */
  compact?: boolean;
  index: number;
  task: SellerTask;
  item: SellerCatalogItem | null;
  repeats: number;
  saving: boolean;
  onOpen: () => void;
  onOpenProduct: (item: SellerCatalogItem) => void;
  onAction: () => void;
  /** Есть, когда платформа сама может исправить задачу (с подтверждением и возвратом). */
  onFix?: () => void;
  onComplete: () => void;
  /** Вернуть в работу: есть у выполненных человеком и отложенных задач. */
  onReopen?: () => void;
  onMute?: () => void;
}) {
  const canSettle = task.status === "active" || task.status === "in_progress" || task.status === "snoozed";
  const ActionIcon = ACTION_ICONS[task.actionType];
  const story = taskStory(task);
  const rows = evidenceRows(task.evidence).slice(0, 4);
  const main = rows.slice(0, 2);
  const rest = rows.slice(2);
  const label = actionLabel(task.actionType);
  const canAct = label != null && actionAvailable(task.actionType, item);
  return (
    <li className="hub-rise" style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}>
      <article
        data-task-id={task.id}
        className="group cursor-pointer rounded-[20px] border bg-white p-5 shadow-[0_1px_2px_rgba(1,20,8,0.05)] transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-px hover:border-[var(--hub-border-strong)] hover:shadow-[0_1px_2px_rgba(1,20,8,0.04),0_14px_30px_-16px_rgba(1,20,8,0.22)]"
        style={{ borderColor: hub.borderCard }}
        onClick={onOpen}
      >
        <div className={compact ? "flex flex-col gap-5" : "grid gap-x-10 gap-y-4 lg:grid-cols-[minmax(0,1fr)_minmax(200px,260px)_240px]"}>
          <div className="min-w-0">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onOpen();
              }}
              className="block w-full rounded-[8px] text-left outline-none focus-visible:shadow-[0_0_0_2px_#fff,0_0_0_4px_var(--hub-lime-ring)]"
            >
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                <SeverityMark severity={task.severity} evidence={task.evidence} />
                {repeats > 1 ? <HubBadge tone="muted">Повторялась {repeats} {timesWord(repeats)}</HubBadge> : null}
                {task.status === "snoozed" || task.status === "in_progress" ? <HubBadge tone="muted">{statusLabel(task.status)}</HubBadge> : null}
              </span>
              <span className={compact ? "mt-3 block text-balance text-[19px] font-bold leading-[1.25] tracking-[-0.02em] [overflow-wrap:anywhere]" : "mt-3 block text-balance text-[21px] font-bold leading-[1.25] tracking-[-0.02em] [overflow-wrap:anywhere]"} style={{ ...hubSans, color: hub.text }}>
                {taskDisplayTitle(task)}
              </span>
              <span className="mt-1.5 block max-w-[62ch] text-pretty text-[15px] leading-[1.55] [overflow-wrap:anywhere]" style={{ ...hubSans, color: hub.textMuted }}>
                {story ? (
                  <>
                    <span className="font-semibold" style={{ color: hub.text }}>{story.fact}</span>
                    {story.cause ? <> {story.cause}</> : null}
                  </>
                ) : (
                  briefText(task.description, [task.productTitle, item?.title, task.vendorCode], 2, 220)
                )}
              </span>
            </button>

            {task.nmId ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  if (item) onOpenProduct(item);
                }}
                disabled={!item}
                className="mt-3.5 flex w-full max-w-[460px] items-center gap-3.5 rounded-[14px] border p-2.5 pr-4 text-left outline-none transition-colors hover:bg-[var(--hub-surface-muted)] focus-visible:shadow-[0_0_0_2px_#fff,0_0_0_4px_var(--hub-lime-ring)] disabled:cursor-default disabled:hover:bg-transparent"
                style={{ borderColor: hub.border, backgroundColor: hub.canvas }}
              >
                <HubPhoto src={item?.imageUrl} className="h-[84px] w-[64px] shrink-0 rounded-[10px]" iconClassName="h-5 w-5" />
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-[16px] font-semibold leading-[1.35]" style={{ ...hubSans, color: hub.text }}>
                    {item?.title || task.productTitle || "Товар"}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-2 text-[12px]" style={{ ...hubSans, ...hubNumeric, color: hub.textSubtle }}>
                    {task.vendorCode ? <ArticleChip value={task.vendorCode} /> : null}
                    <span>nm {task.nmId}</span>
                  </span>
                </span>
              </button>
            ) : (
              <p className="mt-3.5 text-[13px] font-medium" style={{ ...hubSans, color: hub.textSubtle }}>
                Задача магазина
              </p>
            )}

            {story?.action || task.recommendation ? (
              <p className="mt-3.5 flex max-w-[64ch] items-start gap-2.5 text-pretty text-[16px] font-semibold leading-[1.45]" style={{ ...hubSans, color: hub.text }}>
                <Lightbulb className="mt-1 h-[18px] w-[18px] shrink-0" strokeWidth={1.75} style={{ color: hub.textSubtle }} aria-hidden />
                <span>{story?.action ?? briefText(task.recommendation, [], 1, 140)}</span>
              </p>
            ) : null}
          </div>

          {rows.length > 0 ? (
            <div className={compact ? "h-fit" : "h-fit lg:pt-1"}>
              <dl className={compact ? "flex flex-wrap gap-x-8 gap-y-3" : "grid grid-cols-2 gap-x-6 gap-y-3 lg:text-right"}>
                {main.map((row) => (
                  <div key={row.label} className="min-w-0">
                    <dt className="text-[13px] leading-4" style={{ ...hubSans, color: hub.textSubtle }}>
                      {row.label}
                    </dt>
                    <dd
                      className={
                        row.value.length > 11
                          ? "mt-1 text-[15px] font-bold leading-5 [overflow-wrap:anywhere]"
                          : "mt-1 whitespace-nowrap text-[22px] font-bold leading-7 tracking-[-0.02em]"
                      }
                      style={{ ...hubSans, ...hubNumeric, color: hub.text }}
                    >
                      {row.value}
                    </dd>
                  </div>
                ))}
              </dl>
              {rest.length > 0 ? (
                <dl className={compact ? "mt-3 flex flex-wrap gap-x-8 gap-y-2 border-t pt-3" : "mt-3 grid grid-cols-2 gap-x-6 gap-y-2 border-t pt-3 lg:text-right"} style={{ borderColor: hub.border }}>
                  {rest.map((row) => (
                    <div key={row.label} className="min-w-0">
                      <dt className="text-[13px] leading-4" style={{ ...hubSans, color: hub.textSubtle }}>
                        {row.label}
                      </dt>
                      <dd className="text-[15px] font-medium leading-5 [overflow-wrap:anywhere]" style={{ ...hubSans, ...hubNumeric, color: hub.textMuted }}>
                        {row.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </div>
          ) : (
            <div className={compact ? "hidden" : "hidden lg:block"} />
          )}

          <div className={compact ? "flex flex-wrap items-center gap-2" : "flex flex-col gap-2 lg:pt-1"} onClick={(event) => event.stopPropagation()}>
            {onFix ? (
              <HubButton className={compact ? "" : "w-full"} variant="dark" onClick={onFix}>
                {ActionIcon ? <ActionIcon className="h-4 w-4" strokeWidth={1.75} /> : null}
                Исправить цену
              </HubButton>
            ) : canAct && label ? (
              <HubButton className={compact ? "" : "w-full"} variant="dark" onClick={onAction}>
                {ActionIcon ? <ActionIcon className="h-4 w-4" strokeWidth={1.75} /> : null}
                {label}
              </HubButton>
            ) : null}
            {onReopen ? (
              <HubButton className={compact ? "" : "w-full"} size="sm" variant="secondary" disabled={saving} onClick={onReopen}>
                <Undo2 className="h-4 w-4" strokeWidth={1.75} />
                Вернуть в работу
              </HubButton>
            ) : null}
            {canSettle && !onReopen ? (
              <div className={compact ? "flex gap-2" : "grid grid-cols-2 gap-2"}>
                <HubButton className={compact ? "" : `w-full ${onMute ? "" : "col-span-2"}`} size="sm" variant="secondary" disabled={saving} onClick={onComplete}>
                  <CircleCheck className="h-[18px] w-[18px]" strokeWidth={2.25} style={{ color: hub.greenDark }} />
                  Выполнено
                </HubButton>
                {onMute ? (
                  <HubButton className={compact ? "" : "w-full"} size="sm" variant="secondary" disabled={saving} title="Не создавать такие задачи по этому товару" onClick={onMute}>
                    <EyeOff className="h-4 w-4" strokeWidth={1.75} />
                    Скрыть
                  </HubButton>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </article>
    </li>
  );
}

/** Короткое пояснение «что это и почему так» в панели задачи: не повторяет текст выше, а раскрывает суть действия. */
function taskExplain(task: SellerTask, fix: PriceFix | null): { title: string; text: string } | null {
  if (fix) {
    return {
      title: "Что изменится",
      text: `Безубыточная цена: ${formatRub(fix.targetRub)}. Сейчас покупатель платит ${formatRub(fix.currentRub)}, поэтому каждая продажа уходит в минус. В WB отправим базовую цену ${formatRub(fix.baseRub)} при вашей скидке ${fix.discount}%: скидка не изменится, а перед записью вы увидите, что было и что станет, и сможете вернуть.`,
    };
  }
  switch (task.actionType) {
    case "OPEN_PRICE_EDITOR":
      return { title: "Почему так", text: "Цена решает, останется ли прибыль с каждой продажи. Её стоит сверить с комиссией WB, логистикой и закупкой: так видно, где именно теряются деньги." };
    case "OPEN_STOCKS":
      return { title: "Почему так", text: "Остаток определяет, сколько вы успеете продать. Когда товар на складе заканчивается, карточка теряет показы и позиции в выдаче." };
    case "OPEN_SUPPLIES":
      return { title: "Почему так", text: "Поставка идёт на склад WB несколько дней. Чтобы остаток не закончился раньше, её нужно отправить заранее." };
    case "OPEN_ADS":
      return { title: "Почему так", text: "Реклама списывает деньги за клики. Если заказов нет или они стоят дороже прибыли, ставку и кампанию стоит пересмотреть." };
    case "OPEN_PROMOTIONS":
      return { title: "Почему так", text: "Участие в акции даёт больше показов. Важно, чтобы цена в акции оставалась выше безубыточной, иначе продажи будут убыточными." };
    case "OPEN_CONTENT_EDITOR":
    case "OPEN_PRODUCT":
      return { title: "Почему так", text: "Фото, название и описание влияют на то, купят ли товар после клика. Заполненная карточка лучше показывается в поиске WB." };
    case "OPEN_REVIEWS":
    case "OPEN_REVIEW_RESPONSES":
    case "OPEN_QUESTIONS":
      return { title: "Почему так", text: "Быстрые ответы повышают доверие покупателей и рейтинг карточки. Ответ видят все, кто смотрит товар." };
    default:
      return null;
  }
}

/** Сворачиваемый блок панели: пояснения не лежат сплошным текстом, а открываются по нажатию. */
function DrawerFold({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="border-t" style={{ borderColor: hub.border }}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="group/fold flex w-full items-center justify-between gap-3 rounded-[8px] py-3.5 text-left outline-none focus-visible:shadow-[0_0_0_2px_var(--hub-canvas),0_0_0_4px_var(--hub-lime-ring)]"
      >
        <span className="text-[14px] font-semibold" style={{ ...hubSans, color: hub.text }}>
          {title}
        </span>
        <span className="flex h-6 w-6 items-center justify-center rounded-full transition-colors group-hover/fold:bg-[var(--hub-surface-muted)]" aria-hidden>
          <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${open ? "rotate-180" : ""}`} strokeWidth={1.75} style={{ color: hub.textSubtle }} />
        </span>
      </button>
      <div className="hub-expand" data-open={open} aria-hidden={!open} inert={!open}>
        <div>
          <div className="pb-4">{children}</div>
        </div>
      </div>
    </section>
  );
}

export function TaskDrawer({
  task,
  related,
  item,
  price,
  statusNote,
  saving,
  onClose,
  onOpenProduct,
  onAction,
  onFix,
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
  onFix?: () => void;
  onComplete: () => void;
  onSnooze: (until: string) => void;
  /** Не создавать такие задачи по этому товару. Нет — задача магазина или созданная вами из уведомления. */
  onMute?: () => void;
  /** Что менялось по этому товару (последние события). */
  productEvents: SellerProductEvent[];
}) {
  const [postpone, setPostpone] = useState(false);
  const priceFix = suggestPriceFix(task.type, task.evidence, item);
  const rows = evidenceRows(task.evidence);
  const note = evidenceNote(task.evidence);
  const label = actionLabel(task.actionType);
  const viewText = viewLabel(task.actionType);
  const explain = taskExplain(task, priceFix);
  const canAct = label != null && actionAvailable(task.actionType, item);
  const canSettle = task.status === "active" || task.status === "in_progress" || task.status === "snoozed";
  const choices = postpone ? snoozeChoices(new Date()) : [];
  const story = taskStory(task);
  // Причину и оговорку «это предположение» панель уже показывает отдельной строкой: в расчёте их не дублируем.
  const squash = (value: string) => value.toLowerCase().replace(/[^0-9a-zа-яё]+/giu, "");
  const said = [story?.fact, story?.cause, ...(story?.extra ?? [])].filter((line): line is string => Boolean(line)).map(squash);
  const calcLines = detailLines(task.description, [task.productTitle, item?.title, task.vendorCode]).filter((line) => {
    if (story?.extra && story.extra.length > 0 && /причина|предположение/i.test(line)) return false;
    const flat = squash(line);
    return !(flat.length > 12 && said.some((text) => text.includes(flat) || (text.length > 20 && flat.includes(text))));
  });
  const DrawerActionIcon = ACTION_ICONS[task.actionType];

  return (
    <div className="fixed inset-0 z-30">
      <button type="button" aria-label="Закрыть задачу" className="hub-fade-in absolute inset-0 bg-[rgba(1,20,8,0.3)]" onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-drawer-title"
        className="hub-drawer-in absolute inset-y-0 right-0 flex w-full max-w-[540px] flex-col border-l"
        style={{ borderColor: hub.borderCard, backgroundColor: hub.canvas }}
      >
        <div className="flex items-start justify-between gap-4 px-7 pb-5 pt-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <SeverityMark severity={task.severity} evidence={task.evidence} />
              {task.status !== "active" ? <HubBadge tone="muted">{statusLabel(task.status)}</HubBadge> : null}
            </div>
            <h2
              id="task-drawer-title"
              className="mt-4 text-balance text-[28px] font-bold leading-[1.15] tracking-[-0.02em] [overflow-wrap:anywhere]"
              style={{ ...hubSerif, color: hub.text }}
            >
              {taskDisplayTitle(task)}
            </h2>
            <p className="mt-2 max-w-[52ch] text-pretty text-[15px] leading-[1.55]" style={{ ...hubSans, color: hub.textMuted }}>
              {story ? `${story.fact}${story.cause ? ` ${story.cause}` : ""}` : briefText(task.description, [task.productTitle, item?.title, task.vendorCode], 2, 240)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="-mr-2 rounded-full p-2 outline-none transition-colors hover:bg-[var(--hub-text)]/[0.06] focus-visible:shadow-[0_0_0_2px_var(--hub-lime-ring)]"
            style={{ color: hub.textMuted }}
            aria-label="Закрыть"
          >
            <X className="h-5 w-5" strokeWidth={1.5} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overflow-x-hidden px-7 pb-6">
          {task.nmId ? (
            <button
              type="button"
              disabled={!item}
              onClick={() => item && onOpenProduct(item)}
              className="hub-rise flex w-full items-center gap-4 rounded-[16px] border bg-white p-3 pr-5 text-left outline-none transition-colors hover:bg-[var(--hub-surface-muted)] focus-visible:shadow-[0_0_0_2px_var(--hub-canvas),0_0_0_4px_var(--hub-lime-ring)] disabled:cursor-default disabled:hover:bg-white"
              style={{ borderColor: hub.borderCard }}
            >
              <HubPhoto src={item?.imageUrl} className="h-[96px] w-[72px] shrink-0 rounded-[12px]" iconClassName="h-6 w-6" />
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 text-[15px] font-semibold leading-5" style={{ ...hubSans, color: hub.text }}>
                  {item?.title || task.productTitle || "Товар"}
                </span>
                <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]" style={{ ...hubSans, ...hubNumeric, color: hub.textSubtle }}>
                  {task.vendorCode ? <ArticleChip value={task.vendorCode} /> : null}
                  <span>nm {task.nmId}</span>
                  {price != null ? <span className="font-semibold" style={{ color: hub.text }}>{formatRub(price)}</span> : null}
                </span>
              </span>
            </button>
          ) : (
            <p className="text-[13px] font-medium" style={{ ...hubSans, color: hub.textSubtle }}>
              Задача магазина
            </p>
          )}

          {rows.length > 0 ? (
            <section className="hub-rise" style={{ animationDelay: "60ms" }} aria-label="Цифры по задаче">
              <dl className="grid grid-cols-2 gap-2.5">
                {rows.map((row, index) => (
                  <div key={row.label} className="min-w-0 rounded-[14px] px-4 py-3" style={{ backgroundColor: hub.surfaceMuted }}>
                    <dt className="text-[12px] leading-4" style={{ ...hubSans, color: hub.textSubtle }}>
                      {row.label}
                    </dt>
                    <dd
                      className={`mt-1 whitespace-nowrap font-bold leading-7 tracking-[-0.02em] ${index < 2 ? "text-[24px]" : "text-[18px]"}`}
                      style={{ ...hubSans, ...hubNumeric, color: hub.text }}
                    >
                      {row.value}
                    </dd>
                  </div>
                ))}
              </dl>
              {note && !(story?.todo && story.todo.length > 0) ? (
                <p className="mt-2.5 text-[13px] leading-5" style={{ ...hubSans, color: hub.textMuted }}>
                  {humanizeText(note)}
                </p>
              ) : null}
              {story?.todo && story.todo.length > 0 ? (
                <div className="mt-3 rounded-[14px] border bg-white px-4 py-3.5" style={{ borderColor: hub.borderCard }}>
                  <div className="flex items-baseline justify-between gap-4 pb-1.5">
                    <p className="text-[13px] font-semibold" style={{ ...hubSans, color: hub.text }}>Что улучшить</p>
                    <p className="text-[12px]" style={{ ...hubSans, color: hub.textSubtle }}>Баллы</p>
                  </div>
                  <ul className="space-y-1.5">
                    {story.todo.map((row, index) => (
                      <li key={`${index}-${row.text}`} className="flex items-baseline justify-between gap-4 text-[14px] leading-[1.45]">
                        <span className="text-pretty" style={{ ...hubSans, color: hub.text }}>{row.text}</span>
                        <span className="shrink-0 font-medium" style={{ ...hubSans, ...hubNumeric, color: hub.textSubtle }}>{row.points != null ? `+${row.points}` : ""}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>
          ) : null}

          {story?.action || task.recommendation ? (
            <section
              className="hub-rise rounded-[16px] border px-5 py-4"
              style={{ animationDelay: "120ms", backgroundColor: hub.limeWash, borderColor: "rgba(165, 232, 58, 0.55)" }}
            >
              <h3 className="flex items-center gap-2 text-[13px] font-semibold" style={{ ...hubSans, color: hub.text }}>
                <Lightbulb className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                Что сделать
              </h3>
              <p className="mt-1.5 text-pretty text-[16px] font-semibold leading-[1.45] tracking-[-0.005em]" style={{ ...hubSans, color: hub.text }}>
                {story?.action ?? task.recommendation}
              </p>
            </section>
          ) : null}

          {explain || (canAct && viewText) ? (
            <section className="hub-rise rounded-[16px] border bg-white px-5 py-4" style={{ animationDelay: "180ms", borderColor: hub.borderCard }}>
              {explain ? (
                <>
                  <h3 className="text-[14px] font-semibold" style={{ ...hubSans, color: hub.text }}>
                    {explain.title}
                  </h3>
                  <p className="mt-1.5 text-pretty text-[14px] leading-6 [overflow-wrap:anywhere]" style={{ ...hubSans, color: hub.textMuted }}>
                    {explain.text}
                  </p>
                </>
              ) : null}
              {canAct && viewText ? (
                <div className={explain ? "mt-3" : ""}>
                  <HubButton variant="secondary" onClick={onAction}>
                    {DrawerActionIcon ? <DrawerActionIcon className="h-4 w-4" strokeWidth={1.75} /> : null}
                    {viewText}
                  </HubButton>
                </div>
              ) : null}
            </section>
          ) : null}

          <div className="hub-rise" style={{ animationDelay: "240ms" }}>
            <DrawerFold title="Почему появилась задача">
              <div className="space-y-4">
                {story ? (
                  <div className="space-y-1.5">
                    <p className="max-w-[56ch] text-pretty text-[15px] font-semibold leading-6" style={{ ...hubSans, color: hub.text }}>{story.fact}</p>
                    {story.cause ? <p className="max-w-[56ch] text-pretty text-[14px] leading-6" style={{ ...hubSans, color: hub.textMuted }}>{story.cause}</p> : null}
                  </div>
                ) : null}
                {whyImportantText(task.evidence) ? (
                  <p className="max-w-[56ch] text-pretty text-[14px] leading-6" style={{ ...hubSans, color: hub.text }}>{whyImportantText(task.evidence)}</p>
                ) : null}
                {story && story.extra && story.extra.length > 0 ? (
                  <ul className="space-y-1.5">
                    {story.extra.map((line, index) => {
                      const pair = splitLabelValue(line);
                      return pair ? (
                        <li key={`${index}-${line}`} className="flex items-baseline justify-between gap-4 text-[14px] leading-6">
                          <span style={{ ...hubSans, color: hub.textMuted }}>{pair.label}</span>
                          <span className="shrink-0 font-semibold" style={{ ...hubSans, ...hubNumeric, color: hub.text }}>{pair.value}</span>
                        </li>
                      ) : (
                        <li key={`${index}-${line}`} className="max-w-[56ch] text-pretty text-[14px] leading-6" style={{ ...hubSans, color: hub.textMuted }}>{line}</li>
                      );
                    })}
                  </ul>
                ) : null}
                {calcLines.length > 0 ? (
                  <div className="overflow-hidden rounded-[14px] border bg-white" style={{ borderColor: hub.borderCard }}>
                    <div className="flex items-baseline justify-between gap-4 border-b px-4 py-2.5" style={{ borderColor: hub.border, backgroundColor: hub.surfaceMuted }}>
                      <p className="text-[13px] font-semibold" style={{ ...hubSans, color: hub.text }}>Расчёт по данным WB</p>
                      <p className="text-[12px]" style={{ ...hubSans, color: hub.textSubtle }}>Значение</p>
                    </div>
                    <ul>
                      {calcLines.map((line, index) => {
                        const pair = splitLabelValue(line);
                        const key = pair ? pair.label : line;
                        const result = /итог|безубыточн|маржа на 1|под риском/i.test(key);
                        const negative = pair ? /^[-−]/u.test(pair.value) : false;
                        return pair ? (
                          <li
                            key={`${index}-${line}`}
                            className="flex items-baseline justify-between gap-4 border-t px-4 py-2.5 text-[15px] leading-[1.4] first:border-t-0"
                            style={{ ...hubSans, borderColor: hub.borderSoft, backgroundColor: result ? hub.canvas : undefined }}
                          >
                            <span className="min-w-0 [overflow-wrap:anywhere]" style={{ color: result ? hub.text : hub.textMuted, fontWeight: result ? 600 : 400 }}>{pair.label}</span>
                            <span className="shrink-0 whitespace-nowrap font-bold" style={{ ...hubNumeric, color: negative ? hub.danger : hub.text }}>{pair.value}</span>
                          </li>
                        ) : (
                          <li key={`${index}-${line}`} className="border-t px-4 py-2.5 text-pretty text-[14px] leading-[1.5] first:border-t-0 [overflow-wrap:anywhere]" style={{ ...hubSans, color: hub.textMuted, borderColor: hub.borderSoft }}>
                            {line}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null}
                {task.reason ? (
                  <p className="max-w-[56ch] text-pretty text-[13px] leading-5" style={{ ...hubSans, color: hub.textSubtle }}>
                    По какому правилу: {task.reason}
                  </p>
                ) : null}
              </div>
            </DrawerFold>
            <DrawerFold title="Почему это важно">
              <p className="max-w-[56ch] text-pretty text-[14px] leading-6" style={{ ...hubSans, color: hub.textMuted }}>
                {impactWhy(task.businessImpactType)}
              </p>
            </DrawerFold>
            {related.length > 0 ? (
              <DrawerFold title="Почему Karto рекомендует это сейчас">
                <ul className="space-y-3">
                  {related.map((itemTask) => (
                    <li key={itemTask.id}>
                      <p className="text-[14px] font-medium leading-5" style={{ ...hubSans, color: hub.text }}>
                        {taskDisplayTitle(itemTask)}
                      </p>
                      {itemTask.reason ? (
                        <p className="mt-1 text-[13px] leading-5" style={{ ...hubSans, color: hub.textMuted }}>
                          {itemTask.reason}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </DrawerFold>
            ) : null}
            {productEvents.length > 0 ? (
              <DrawerFold title="Что менялось по этому товару">
                <ul className="space-y-1.5">
                  {productEvents.map((e) => (
                    <li key={e.id} className="text-[13px] leading-5" style={{ ...hubSans, color: hub.textMuted }}>
                      <span style={{ ...hubNumeric, color: hub.textSubtle }}>
                        {new Date(e.createdAt).toLocaleDateString("ru-RU", { day: "numeric", month: "short", timeZone: "Europe/Moscow" }).replace(".", "")}
                      </span>
                      {" · "}
                      <span style={{ color: hub.text }}>{e.title}</span>
                      {e.detail ? `: ${e.detail.split("\n").join("; ")}` : ""}
                    </li>
                  ))}
                </ul>
              </DrawerFold>
            ) : null}
            <div className="border-t" style={{ borderColor: hub.border }} />
          </div>
        </div>

        <div className="space-y-3 border-t px-6 py-4" style={{ borderColor: hub.borderCard, backgroundColor: hub.canvas }}>
          <div className="flex flex-wrap items-center gap-2">
            {onFix ? (
              <HubButton onClick={onFix}>
                {DrawerActionIcon ? <DrawerActionIcon className="h-4 w-4" strokeWidth={1.75} /> : null}
                Исправить цену
              </HubButton>
            ) : canAct && label ? (
              <HubButton onClick={onAction}>
                {DrawerActionIcon ? <DrawerActionIcon className="h-4 w-4" strokeWidth={1.75} /> : null}
                {label}
              </HubButton>
            ) : null}
            {canSettle ? (
              <>
                <HubButton size="sm" variant="secondary" disabled={saving} onClick={onComplete}>
                  <CircleCheck className="h-[18px] w-[18px]" strokeWidth={2.25} style={{ color: hub.greenDark }} />
                  Выполнено
                </HubButton>
                <HubButton size="sm" variant="ghost" disabled={saving} onClick={() => setPostpone((open) => !open)}>
                  <Clock className="h-4 w-4" strokeWidth={1.75} />
                  Отложить
                </HubButton>
              </>
            ) : null}
          </div>
          {canSettle && postpone ? (
            <div className="hub-rise flex flex-wrap gap-2" role="group" aria-label="Срок откладывания">
              {choices.map((choice) => (
                <HubButton key={choice.label} variant="secondary" size="sm" disabled={saving} onClick={() => onSnooze(choice.until)}>
                  {choice.label}
                </HubButton>
              ))}
            </div>
          ) : null}
          {onMute ? (
            <button
              type="button"
              disabled={saving}
              onClick={onMute}
              className="text-[12.5px] font-medium underline-offset-2 outline-none hover:underline focus-visible:shadow-[0_0_0_2px_var(--hub-lime-ring)]"
              style={{ ...hubSans, color: hub.textSubtle }}
            >
              Не создавать такие задачи по этому товару
            </button>
          ) : null}
          {statusNote ? (
            <p className="text-[13px] leading-5" role="alert" style={{ ...hubSans, color: hub.danger }}>
              {statusNote}
            </p>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
