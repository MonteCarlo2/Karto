"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Activity,
  BadgePercent,
  Bot,
  FileText,
  ImageIcon,
  Megaphone,
  MessageCircle,
  Newspaper,
  PackageMinus,
  PackagePlus,
  Pin,
  RefreshCw,
  ShieldAlert,
  ShoppingCart,
  Star,
  Tag,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  Truck,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { moscowDateKey } from "@/lib/seller-hub/complete-days";
import { useSellerHubSyncMode } from "./sync-mode-context";
import { createSellerHubTaskFromEvent, loadSellerHubAnalyticsHistory, syncSellerHubNews } from "@/lib/seller-hub/client-api";
import { RETIRED_EVENT_KINDS, type SellerEventGroup, type SellerEventKind, type SellerProductEvent } from "@/lib/seller-hub/event-engine/types";
import { collapseBursts, groupEventsByDay, matchesQuery, needsAttention, type DayDigest } from "@/lib/seller-hub/events-feed";
import {
  clearUnread,
  isEventRead,
  matchesView,
  parseMarks,
  parseMuted,
  pruneMarks,
  serializeMarks,
  serializeMuted,
  setArchived,
  setPinned,
  setRead,
  type Direction,
  type EventMarks,
  type StatusView,
} from "@/lib/seller-hub/events-marks";
import { eventTarget, type EventTarget } from "@/lib/seller-hub/events-actions";
import { promoShortName } from "@/lib/seller-hub/event-engine/store-events";
import { hiddenByRubric, newsRubricsOf, parseRubricList, serializeRubricList } from "@/lib/seller-hub/news/analysis";
import { buildCoverage, buildWeekCompare } from "@/lib/seller-hub/events-overview";
import { possibleCauses } from "@/lib/seller-hub/events-timeline";
import type { SellerCatalogSnapshot } from "@/lib/seller-hub/types";
import { downloadCsv } from "./download-file";
import { HubButton, HubEmptyState, HubInput, HubPanel, HubSegmented, formatInt, formatRub, hub, hubNumeric, hubSans } from "./hub-ui";
import { HubProductDrawer } from "./hub-product-drawer";
import { useUserSetting } from "./use-user-setting";

/** Направления кабинета. Новости WB и Ozon появятся отдельным направлением позже. */
const GROUP_LABEL: Record<SellerEventGroup, string> = {
  sales: "Продажи",
  stock: "Остатки",
  price: "Цены и акции",
  content: "Карточки",
  reviews: "Отзывы",
  orders: "Заказы и поставки",
  ads: "Реклама",
  money: "Деньги",
  agents: "Агенты",
  system: "Система",
  news: "Новости",
  other: "Другое",
};
const GROUP_ORDER = Object.keys(GROUP_LABEL) as SellerEventGroup[];
/** Сколько дней показываем сразу и сколько добавляет «Показать более ранние дни». */
const DAYS_PAGE = 7;

function eventIcon(kind: SellerEventKind): LucideIcon {
  switch (kind) {
    case "stock_out":
    case "low_stock":
    case "forecast_stockout":
      return TriangleAlert;
    case "sales_new":
    case "sales_up":
    case "day_orders_spike":
      return TrendingUp;
    case "sales_down":
    case "day_orders_drop":
    case "trend_orders_down":
      return TrendingDown;
    case "trend_orders_up":
      return TrendingUp;
    case "trend_recovered":
    case "funnel_shift":
      return Activity;
    case "product_silent":
      return PackageMinus;
    case "price_changed":
    case "promo_price_changed":
      return Tag;
    case "discount_changed":
    case "promo_new":
    case "promo_entered":
    case "promo_left":
      return BadgePercent;
    case "content_score_changed":
      return Activity;
    case "card_title_changed":
    case "card_description_changed":
    case "card_characteristics_changed":
    case "card_video_changed":
      return FileText;
    case "photos_changed":
      return ImageIcon;
    case "reviews_unanswered":
    case "questions_unanswered":
      return MessageCircle;
    case "review_negative":
    case "rating_changed":
      return Star;
    case "card_blocked":
    case "card_unblocked":
      return ShieldAlert;
    case "buyout_changed":
      return Activity;
    case "tariff_logistics_changed":
    case "tariff_storage_changed":
      return Truck;
    case "sync_completed":
      return RefreshCw;
    case "product_added":
      return PackagePlus;
    case "product_removed":
      return PackageMinus;
    case "ad_status_changed":
    case "ad_campaign_added":
    case "ad_budget_ended":
    case "ad_budget_topped_up":
    case "ad_product_added":
    case "ad_product_removed":
    case "ad_bid_changed":
    case "ad_limit_changed":
    case "ad_spend_spike":
      return Megaphone;
    case "orders_new":
    case "orders_canceled":
      return ShoppingCart;
    case "supply_closed":
    case "supply_created":
      return Truck;
    case "finance_document":
      return FileText;
    case "finance_withdraw_up":
    case "penalties_up":
      return Wallet;
    case "access_lost":
    case "access_restored":
      return ShieldAlert;
    case "agent_action":
      return Bot;
    case "news_item":
    case "news_general":
      return Newspaper;
    case "promo_deadline":
      return BadgePercent;
    default: {
      const unexpected: never = kind;
      return unexpected;
    }
  }
}

function timeOf(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" });
}

function dateTimeOf(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" });
}

const changeText = (v: number | null) => (v == null ? "" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(Math.round(v))}%`);

/** Возможные причины просадки дня: события, замеченные перед ней. Совпадение по времени, а не доказанная связь. */
function DropCauses({ event, events }: { event: SellerProductEvent; events: SellerProductEvent[] }) {
  const date = event.id.split(":").pop() ?? "";
  const causes = possibleCauses(date, events);
  return (
    <div className="mt-0.5 text-[12.5px] leading-5" style={{ ...hubSans, color: hub.textMuted }}>
      {causes.length === 0 ? (
        <p>Среди замеченных нами событий кандидатов нет. Возможные причины вне данных: реклама, конкуренты, сезонность.</p>
      ) : (
        <>
          <p className="font-medium">Что менялось перед этим (совпадение по времени, а не доказанная связь):</p>
          <ul className="list-disc pl-4">
            {causes.map((c) => (
              <li key={c.event.id}>
                {c.event.title}
                {c.event.productTitle ? ` — ${c.event.productTitle}` : ""}: {c.why}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function EventSkeleton() {
  return (
    <div className="space-y-3">
      <HubPanel className="px-5 py-4">
        <div className="h-4 w-40 animate-pulse rounded" style={{ backgroundColor: hub.canvas }} />
      </HubPanel>
      <HubPanel>
        <div className="divide-y" style={{ borderColor: hub.border }}>
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="flex animate-pulse gap-3 px-4 py-3.5 sm:px-5">
              <div className="h-8 w-8 rounded-lg" style={{ backgroundColor: hub.canvas }} />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 w-40 rounded" style={{ backgroundColor: hub.canvas }} />
                <div className="h-3 w-56 rounded" style={{ backgroundColor: hub.canvas }} />
              </div>
            </div>
          ))}
        </div>
      </HubPanel>
    </div>
  );
}

function SideCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <HubPanel className="px-4 py-3.5">
      <h3 className="text-[13px] font-semibold" style={{ ...hubSans, color: hub.text }}>
        {title}
      </h3>
      <div className="mt-2">{children}</div>
    </HubPanel>
  );
}

function TextAction({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className="text-[11.5px] font-medium leading-5 underline-offset-2 hover:underline" style={{ color: hub.textMuted }} onClick={onClick}>
      {children}
    </button>
  );
}

export function HubEvents({
  events: allEvents,
  snapshot,
  loading,
  error,
  onRetry,
  connected,
  onItemsUpdate,
  onOpenPrices,
  onNavigate,
  onOpenTasks,
}: {
  events: SellerProductEvent[];
  snapshot?: SellerCatalogSnapshot;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  connected?: boolean;
  onItemsUpdate?: (items: SellerCatalogSnapshot["items"]) => void;
  onOpenPrices?: (itemId: string) => void;
  /** Перейти из уведомления в раздел платформы. */
  onNavigate?: (target: EventTarget) => void;
  onOpenTasks?: () => void;
}) {
  const [taskState, setTaskState] = useState<Record<string, "creating" | "created" | "exists" | "error">>({});
  const [view, setView] = useState<StatusView>("all");
  const [direction, setDirection] = useState<Direction>("all");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [daysShown, setDaysShown] = useState(DAYS_PAGE);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [digests, setDigests] = useState<Map<string, DayDigest>>(() => new Map());
  const [nowMs] = useState(() => Date.now());
  const [seenAt, setSeenAt] = useUserSetting<string>("events.seenAt", "");
  const [marksRaw, setMarksRaw] = useUserSetting<string>("events.marks", "");
  const [mutedRaw, setMutedRaw] = useUserSetting<string>("events.mutedGroups", "");
  const [sensitivity, setSensitivity] = useUserSetting<string>("events.sensitivity", "normal");
  const [newsGeneral, setNewsGeneral] = useUserSetting<boolean>("events.newsGeneral", false);
  const [mutedRubricsRaw, setMutedRubricsRaw] = useUserSetting<string>("events.newsMutedRubrics", "");
  const [askRubric, setAskRubric] = useState<{ eventId: string; rubric: string } | null>(null);
  const mutedRubrics = useMemo(() => new Set(parseRubricList(mutedRubricsRaw)), [mutedRubricsRaw]);
  const [newsStatus, setNewsStatus] = useState<{ state: "idle" | "loading" | "ok" | "error"; text: string }>({ state: "idle", text: "" });
  const syncMode = useSellerHubSyncMode();
  const retryRef = useRef(onRetry);
  useEffect(() => {
    retryRef.current = onRetry;
  });

  // Профиль продавца для персонализации новостей: категории и бренды товаров, схема работы.
  const newsProfile = useMemo(() => {
    const items = snapshot?.items ?? [];
    const uniq = (list: Array<string | undefined>) => [...new Set(list.map((v) => (v ?? "").trim()).filter(Boolean))];
    const supplies = snapshot?.supplies?.supplies ?? [];
    return {
      categories: uniq(items.map((i) => i.category)),
      brands: uniq(items.map((i) => i.brand)),
      worksFbs: (snapshot?.orders?.total ?? 0) > 0 || supplies.some((x) => x.type === "fbs"),
      worksFbw: supplies.some((x) => x.type === "fbw"),
      usesAds: (snapshot?.ads?.totalCount ?? 0) > 0,
      promoNames: [...new Set((snapshot?.promotions ?? []).map((p) => promoShortName(p.name)))].slice(0, 40),
      mutedRubrics: [...mutedRubrics],
      // Склады, куда продавец реально возит товар (поставки FBW за 60 дней). СЦ-новости показываем, только если назван один из них.
      warehouseNames: uniq([...supplies.flatMap((x) => [x.warehouseName, x.actualWarehouseName]), ...(snapshot?.orders?.officeNames ?? [])]),
    };
  }, [snapshot, mutedRubrics]);
  const profileKey = JSON.stringify(newsProfile);

  // Новости WB: читаем, разбираем под профиль, новые уведомления подтягиваем в ленту. Страницы WB идут не чаще раза в минуту.
  useEffect(() => {
    if (!connected || !snapshot || syncMode === "unknown") return;
    // При фоновом сборе новости читает сам сервер (с профилем из базы), вкладка ничего у WB не просит.
    if (syncMode === "background") {
      setNewsStatus({ state: "ok", text: "Новости портала WB сервер читает сам, каждые 20 минут" });
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const run = (left: number) => {
      setNewsStatus((prev) => ({ state: "loading", text: prev.text }));
      void syncSellerHubNews(JSON.parse(profileKey) as typeof newsProfile)
        .then((res) => {
          if (cancelled) return;
          if (!res.ok) {
            setNewsStatus({ state: "error", text: res.error });
            return;
          }
          setNewsStatus({ state: "ok", text: `${res.news} новостей за последние недели${res.created > 0 ? `, новых уведомлений: ${res.created}` : ""}${res.warning ? `. ${res.warning}` : ""}` });
          if (res.created > 0) retryRef.current();
          if (res.more && left > 1) timer = setTimeout(() => run(left - 1), 65_000);
        })
        .catch((e: unknown) => {
          if (!cancelled) setNewsStatus({ state: "error", text: e instanceof Error ? e.message : "Новости не загрузились" });
        });
    };
    run(3);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // snapshot нужен только как признак «каталог загружен»: профиль берём из profileKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, Boolean(snapshot), profileKey, syncMode]);

  // Итоги дней (заказы и сумма) берём из истории в базе: только чтение, без запросов в WB.
  useEffect(() => {
    if (!connected) return;
    let cancelled = false;
    void loadSellerHubAnalyticsHistory({ readOnly: true })
      .then((res) => {
        if (cancelled || !res.ok) return;
        setDigests(new Map(res.series.filter((p) => p.orders != null).map((p) => [p.date, { orders: p.orders, orderSum: p.orderSum }])));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [connected]);

  // Состояния («мало запаса», «есть неотвеченные») ведёт раздел «Задачи»: старые записи таких видов из истории не показываем.
  const live = useMemo(() => allEvents.filter((event) => !RETIRED_EVENT_KINDS.has(event.kind)), [allEvents]);
  const marks = useMemo(() => parseMarks(marksRaw), [marksRaw]);
  const muted = useMemo(() => parseMuted(mutedRaw, GROUP_ORDER), [mutedRaw]);
  const liveIds = useMemo(() => new Set(live.map((e) => e.id)), [live]);
  // Пока человек ничего не отмечал, непрочитанными считаем события последних 7 дней.
  const seenMs = seenAt ? Date.parse(seenAt) : nowMs - 7 * 24 * 60 * 60 * 1000;

  const updateMarks = (fn: (m: EventMarks) => EventMarks) => setMarksRaw(serializeMarks(pruneMarks(fn(marks), liveIds)));
  const markAllRead = () => {
    setSeenAt(new Date().toISOString());
    setMarksRaw(serializeMarks(clearUnread(marks)));
  };
  const toggleMuted = (group: SellerEventGroup) => {
    const next = new Set(muted);
    if (next.has(group)) next.delete(group);
    else next.add(group);
    setMutedRaw(serializeMuted(next));
    if (direction === group) setDirection("all");
  };

  // События выбранных направлений (скрытые пользователем не учитываются нигде).
  const shown = useMemo(() => live.filter((e) => !muted.has(e.group) && (newsGeneral || e.kind !== "news_general") && !hiddenByRubric(e, mutedRubrics)), [live, muted, newsGeneral, mutedRubrics]);
  const isRead = (e: SellerProductEvent) => isEventRead(e, marks, seenMs);
  const viewCount = (v: StatusView) => shown.filter((e) => matchesView(e, v, marks, seenMs, needsAttention)).length;
  const unreadCount = viewCount("unread");

  const inView = shown.filter((e) => matchesView(e, view, marks, seenMs, needsAttention) && matchesQuery(e, query));
  const dirCounts = new Map<SellerEventGroup, number>();
  for (const e of inView) dirCounts.set(e.group, (dirCounts.get(e.group) ?? 0) + 1);
  const filtered = inView.filter((e) => direction === "all" || e.group === direction);
  const days = groupEventsByDay(filtered, nowMs, digests);
  const shownDays = days.slice(0, daysShown);

  const todayKey = moscowDateKey(nowMs);
  const week = useMemo(() => buildWeekCompare([...digests].map(([date, d]) => ({ date, orders: d.orders, orderSum: d.orderSum })), todayKey), [digests, todayKey]);
  const coverage = useMemo(() => buildCoverage(snapshot, digests.size), [snapshot, digests.size]);

  const viewOptions: Array<{ id: StatusView; label: string }> = [
    { id: "all", label: "Все" },
    { id: "unread", label: unreadCount > 0 ? `Непрочитанные · ${unreadCount}` : "Непрочитанные" },
    { id: "attention", label: viewCount("attention") > 0 ? `Обратить внимание · ${viewCount("attention")}` : "Обратить внимание" },
    { id: "pinned", label: viewCount("pinned") > 0 ? `Закреплённые · ${viewCount("pinned")}` : "Закреплённые" },
    { id: "archive", label: viewCount("archive") > 0 ? `Архив · ${viewCount("archive")}` : "Архив" },
  ];

  const exportCsv = () =>
    downloadCsv(
      `karto-sobytiya-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Дата и время (Москва)", "Направление", "Событие", "Товар", "Артикул WB", "Подробности", "Обратить внимание", "Прочитано"],
      filtered.map((e) => [dateTimeOf(e.createdAt), GROUP_LABEL[e.group], e.title, e.productTitle ?? "", e.nmId ?? "", e.detail.split("\n").join("; "), needsAttention(e) ? "да" : "нет", isRead(e) ? "да" : "нет"]),
    );

  const openItem = snapshot?.items.find((item) => item.id === openId) ?? null;

  const createTask = (eventId: string) => {
    setTaskState((prev) => ({ ...prev, [eventId]: "creating" }));
    void createSellerHubTaskFromEvent(eventId)
      .then((res) => setTaskState((prev) => ({ ...prev, [eventId]: res.ok ? (res.existed ? "exists" : "created") : "error" })))
      .catch(() => setTaskState((prev) => ({ ...prev, [eventId]: "error" })));
  };

  if (loading) return <EventSkeleton />;

  if (error) {
    return (
      <HubPanel>
        <HubEmptyState
          icon={<TriangleAlert className="h-7 w-7" />}
          title="Не удалось обновить события"
          description="Список не собрался. Данные кабинета на месте, можно попробовать ещё раз."
          action={
            <HubButton variant="secondary" onClick={onRetry}>
              Попробовать снова
            </HubButton>
          }
        />
      </HubPanel>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="max-w-xl text-[13px] leading-5" style={{ ...hubSans, color: hub.textMuted }}>
            Что происходит в вашем кабинете: уведомления по дням. Что нужно сделать, смотрите в разделе «Задачи».
          </p>
          <div className="flex flex-wrap gap-2">
            {unreadCount > 0 ? (
              <HubButton variant="secondary" onClick={markAllRead}>
                Отметить всё прочитанным
              </HubButton>
            ) : null}
            <HubButton variant="secondary" onClick={exportCsv} disabled={filtered.length === 0}>
              Скачать CSV
            </HubButton>
          </div>
        </div>

        <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
          <div className="max-w-full overflow-x-auto">
            <HubSegmented
              value={view}
              options={viewOptions}
              onChange={(id) => {
                setView(id);
                setDaysShown(DAYS_PAGE);
              }}
              layoutId="events-view"
            />
          </div>
          <HubInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти товар или событие" aria-label="Поиск по событиям" className="xl:w-64" />
        </div>

        <div className="max-w-full overflow-x-auto">
          <HubSegmented
            value={direction}
            options={[{ id: "all" as Direction, label: "Все направления" }, ...GROUP_ORDER.filter((g) => dirCounts.has(g)).map((g) => ({ id: g as Direction, label: `${GROUP_LABEL[g]} · ${dirCounts.get(g)}` }))]}
            onChange={(id) => {
              setDirection(id);
              setDaysShown(DAYS_PAGE);
            }}
            layoutId="events-direction"
          />
        </div>

        {askRubric ? (
          <HubPanel className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <p className="text-[13px] leading-5" style={{ ...hubSans, color: hub.text }}>
              Новость скрыта. Скрывать и дальше новости рубрики «{askRubric.rubric}»? Персональные и важные новости всё равно будут показываться.
            </p>
            <div className="flex gap-2">
              <HubButton
                size="sm"
                onClick={() => {
                  setMutedRubricsRaw(serializeRubricList([...parseRubricList(mutedRubricsRaw), askRubric.rubric]));
                  setAskRubric(null);
                }}
              >
                Да, скрывать
              </HubButton>
              <HubButton size="sm" variant="secondary" onClick={() => setAskRubric(null)}>
                Нет, только эту
              </HubButton>
            </div>
          </HubPanel>
        ) : null}

        {shownDays.length === 0 ? (
          <HubPanel>
            <HubEmptyState
              icon={<Activity className="h-7 w-7" />}
              title={view === "archive" ? "Архив пуст" : view === "pinned" ? "Нет закреплённых" : view === "unread" ? "Всё прочитано" : shown.length === 0 ? "Событий пока нет" : "Ничего не найдено"}
              description={
                view === "archive"
                  ? "Сюда попадают уведомления, которые вы скрыли."
                  : view === "pinned"
                    ? "Закрепите важное уведомление, чтобы оно было под рукой."
                    : view === "unread"
                      ? "Новых уведомлений нет."
                      : shown.length === 0
                        ? "Когда в кабинете что-то произойдёт, уведомление появится здесь."
                        : "Попробуйте другой фильтр или запрос."
              }
            />
          </HubPanel>
        ) : (
          <div className="space-y-4">
            {shownDays.map((day) => (
              <section key={day.date}>
                <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3 px-1">
                  <h3 className="text-[14px] font-semibold" style={{ ...hubSans, color: hub.text }}>
                    {day.label}
                  </h3>
                  {day.digest && day.digest.orders != null ? (
                    <p className="text-[12px]" style={{ ...hubSans, ...hubNumeric, color: hub.textMuted }}>
                      Заказов за день: {formatInt(day.digest.orders)}
                      {day.digest.orderSum != null ? ` на ${formatRub(day.digest.orderSum)}` : ""}
                    </p>
                  ) : null}
                </div>
                <HubPanel>
                  <ul>
                    {collapseBursts(day.events).map((item) => {
                      const group = item.type === "burst" ? item.events : [item.event];
                      const first = group[0]!;
                      const Icon = eventIcon(first.kind);
                      const attention = group.some(needsAttention);
                      const unread = group.some((e) => !isRead(e));
                      const archived = marks.archived.includes(first.id);
                      const pinned = marks.pinned.includes(first.id);
                      const key = item.type === "burst" ? item.id : first.id;
                      const open = expanded.has(key);
                      const canOpen = item.type === "single" && Boolean(first.itemId && snapshot?.items.some((row) => row.id === first.itemId));
                      return (
                        <li key={key} className="flex gap-3 border-t px-4 py-2.5 first:border-t-0 sm:px-5" style={{ borderColor: hub.borderSoft, opacity: archived ? 0.7 : 1 }}>
                          <span
                            className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                            style={{ backgroundColor: attention ? hub.warnSoft : hub.canvas, color: attention ? hub.warn : hub.textMuted }}
                          >
                            <Icon className="h-4 w-4" strokeWidth={2.1} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                              {unread ? <span aria-label="Не прочитано" className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: hub.blue }} /> : null}
                              <p className="text-[13.5px] font-semibold leading-5" style={{ ...hubSans, color: hub.text }}>
                                {item.type === "burst" ? item.title : first.title}
                              </p>
                              {pinned ? <Pin aria-label="Закреплено" className="h-3 w-3" style={{ color: hub.textMuted }} /> : null}
                              {attention ? (
                                <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold" style={{ ...hubSans, color: hub.warn }}>
                                  <TriangleAlert className="h-3 w-3" strokeWidth={2.5} />
                                  Обратить внимание
                                </span>
                              ) : null}
                            </div>
                            {item.type === "single" && first.productTitle ? (
                              <p className="truncate text-[12.5px] leading-5" style={{ ...hubSans, color: hub.text }}>
                                {first.productTitle}
                              </p>
                            ) : null}
                            {item.type === "single" && first.detail ? (
                              <p className="whitespace-pre-line text-[12.5px] leading-5" style={{ ...hubSans, ...hubNumeric, color: hub.textMuted }}>
                                {first.detail}
                              </p>
                            ) : null}
                            {item.type === "single" && first.kind === "day_orders_drop" ? <DropCauses event={first} events={live} /> : null}
                            {item.type === "burst" && open ? (
                              <ul className="mt-1 space-y-0.5">
                                {item.events.map((e) => (
                                  <li key={e.id} className="text-[12.5px] leading-5" style={{ ...hubSans, ...hubNumeric, color: hub.textMuted }}>
                                    <span style={{ color: hub.text }}>{e.productTitle ?? "Товар"}</span>
                                    {e.detail ? `: ${e.detail.split("\n").join("; ")}` : ""}
                                  </li>
                                ))}
                              </ul>
                            ) : null}
                            {item.type === "single" ? (
                              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                                {(() => {
                                  const target = eventTarget(first);
                                  return target && onNavigate ? (
                                    <HubButton variant="secondary" size="sm" onClick={() => onNavigate(target)}>
                                      {target.label}
                                    </HubButton>
                                  ) : null;
                                })()}
                                {taskState[first.id] === "created" || taskState[first.id] === "exists" ? (
                                  <span className="inline-flex items-center gap-2 text-[12.5px]" style={{ ...hubSans, color: hub.textMuted }}>
                                    {taskState[first.id] === "exists" ? "Задача уже создана" : "Задача создана"}
                                    {onOpenTasks ? <TextAction onClick={onOpenTasks}>Открыть в задачах</TextAction> : null}
                                  </span>
                                ) : (
                                  <HubButton variant="secondary" size="sm" loading={taskState[first.id] === "creating"} onClick={() => createTask(first.id)}>
                                    Создать задачу
                                  </HubButton>
                                )}
                                {taskState[first.id] === "error" ? (
                                  <span className="text-[12px]" style={{ ...hubSans, color: hub.danger }}>
                                    Не удалось создать задачу, попробуйте ещё раз
                                  </span>
                                ) : null}
                              </div>
                            ) : null}
                            <div className="mt-1 flex flex-wrap items-center gap-x-3">
                              <span className="text-[11.5px] leading-5" style={{ ...hubSans, color: hub.textSubtle }}>
                                {timeOf(first.createdAt)} · {GROUP_LABEL[first.group]}
                              </span>
                              {item.type === "burst" ? (
                                <TextAction
                                  onClick={() =>
                                    setExpanded((prev) => {
                                      const next = new Set(prev);
                                      if (next.has(key)) next.delete(key);
                                      else next.add(key);
                                      return next;
                                    })
                                  }
                                >
                                  {open ? "Свернуть список" : "Показать список"}
                                </TextAction>
                              ) : null}
                              {canOpen ? <TextAction onClick={() => setOpenId(first.itemId)}>Перейти к товару</TextAction> : null}
                              <TextAction onClick={() => updateMarks((m) => group.reduce((acc, e) => setRead(acc, e.id, unread), m))}>{unread ? "Прочитано" : "Не прочитано"}</TextAction>
                              {item.type === "single" ? <TextAction onClick={() => updateMarks((m) => setPinned(m, first.id, !pinned))}>{pinned ? "Открепить" : "Закрепить"}</TextAction> : null}
                              {item.type === "single" && (first.kind === "news_item" || first.kind === "news_general") && !archived ? (
                                <TextAction
                                  onClick={() => {
                                    updateMarks((m) => setArchived(m, first.id, true));
                                    const rubric = newsRubricsOf(first.detail).find((r) => r !== "Персональная новость" && r !== "Важно");
                                    if (rubric && !mutedRubrics.has(rubric)) setAskRubric({ eventId: first.id, rubric });
                                  }}
                                >
                                  Не по теме
                                </TextAction>
                              ) : null}
                              <TextAction onClick={() => updateMarks((m) => group.reduce((acc, e) => setArchived(acc, e.id, !archived), m))}>{archived ? "Вернуть из архива" : "В архив"}</TextAction>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </HubPanel>
              </section>
            ))}
            {days.length > daysShown ? (
              <div className="flex justify-center">
                <HubButton variant="secondary" onClick={() => setDaysShown((n) => n + DAYS_PAGE)}>
                  Показать более ранние дни
                </HubButton>
              </div>
            ) : null}
          </div>
        )}
      </div>

      <aside className="min-w-0 space-y-3 lg:sticky lg:top-4">
        <SideCard title="Сводка">
          <dl className="space-y-1.5 text-[13px]" style={{ ...hubSans, color: hub.textMuted }}>
            <div className="flex justify-between gap-3">
              <dt>Непрочитанных</dt>
              <dd className="font-semibold tabular-nums" style={{ color: hub.text }}>
                {unreadCount}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Обратить внимание</dt>
              <dd className="font-semibold tabular-nums" style={{ color: viewCount("attention") > 0 ? hub.warn : hub.text }}>
                {viewCount("attention")}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Данные кабинета</dt>
              <dd className="text-right" style={{ color: hub.text }}>
                {snapshot?.syncedAt ? dateTimeOf(snapshot.syncedAt) : "не загружены"}
              </dd>
            </div>
          </dl>
        </SideCard>

        <SideCard title="За 7 дней">
          {week ? (
            <div className="space-y-1.5 text-[13px]" style={{ ...hubSans, ...hubNumeric, color: hub.textMuted }}>
              <p>
                Заказов: <span className="font-semibold" style={{ color: hub.text }}>{formatInt(week.orders)}</span>
                {week.ordersChange != null ? ` (${changeText(week.ordersChange)})` : ""} против {formatInt(week.prevOrders)}
              </p>
              <p>
                На сумму: <span className="font-semibold" style={{ color: hub.text }}>{formatRub(week.sum)}</span>
                {week.sumChange != null ? ` (${changeText(week.sumChange)})` : ""} против {formatRub(week.prevSum)}
              </p>
              <p className="text-[11.5px]" style={{ color: hub.textSubtle }}>
                Последние 7 законченных дней к предыдущим 7, по воронке WB.
              </p>
            </div>
          ) : (
            <p className="text-[12.5px] leading-5" style={{ ...hubSans, color: hub.textMuted }}>
              Сравнение появится, когда в базе сохранены 14 законченных дней. Пока их {digests.size}: история копится, пока открыта вкладка «Аналитика → Динамика».
            </p>
          )}
        </SideCard>

        <SideCard title="Умные уведомления">
          <p className="mb-2 text-[12.5px] leading-5" style={{ ...hubSans, color: hub.textMuted }}>
            Пороги подстраиваются под ваш магазин: учитывается, насколько у вас обычно колеблются заказы, день недели и обычный спрос каждого товара. Чувствительность задаёт, насколько заметное отклонение считать событием.
          </p>
          <HubSegmented
            value={sensitivity as "low" | "normal" | "high"}
            options={[
              { id: "low", label: "Низкая" },
              { id: "normal", label: "Обычная" },
              { id: "high", label: "Высокая" },
            ]}
            onChange={(id) => setSensitivity(id)}
            layoutId="events-sensitivity"
          />
          <p className="mt-2 text-[11.5px] leading-4" style={{ ...hubSans, color: hub.textSubtle }}>
            {sensitivity === "low" ? "Только резкие отклонения: меньше уведомлений." : sensitivity === "high" ? "Видны и небольшие отклонения: уведомлений больше." : "Баланс между пропуском важного и лишним шумом."} Изменение действует со следующей синхронизации.
          </p>
        </SideCard>

        <SideCard title="Что отслеживаем">
          <ul className="space-y-2">
            {coverage.map((row) => (
              <li key={row.group} className="flex items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-1 h-3.5 w-3.5 shrink-0"
                  checked={!muted.has(row.group)}
                  onChange={() => toggleMuted(row.group)}
                  aria-label={`Показывать направление «${GROUP_LABEL[row.group]}» в ленте`}
                />
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-[13px] font-medium leading-5" style={{ ...hubSans, color: hub.text }}>
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: row.tracked ? hub.green : hub.textSubtle }} />
                    {GROUP_LABEL[row.group]}
                  </p>
                  {row.note ? (
                    <p className="text-[11.5px] leading-4" style={{ ...hubSans, color: hub.textMuted }}>
                      {row.tracked ? "" : "Не отслеживается: "}
                      {row.note}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11.5px] leading-4" style={{ ...hubSans, color: hub.textSubtle }}>
            Галочка: показывать направление в ленте. Снятая галочка скрывает уведомления, сами данные не удаляются.
          </p>
        </SideCard>

        <SideCard title="Новости WB">
          <div className="flex gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: hub.canvas, color: hub.textMuted }}>
              <Newspaper className="h-4 w-4" />
            </span>
            <p className="text-[12.5px] leading-5" style={{ ...hubSans, color: hub.textMuted }}>
              Новости портала продавцов WB: персональные, по вашим категориям и брендам, важные и по вашей схеме работы (FBS, FBW). Обучение, чужие склады и дайджесты скрыты. Новости Ozon появятся позже.
            </p>
          </div>
          <label className="mt-2.5 flex cursor-pointer items-start gap-2 text-[12.5px] leading-5" style={{ ...hubSans, color: hub.text }}>
            <input type="checkbox" className="mt-1 h-3.5 w-3.5 shrink-0" checked={newsGeneral} onChange={(e) => setNewsGeneral(e.target.checked)} />
            Показывать и общие новости
          </label>
          {mutedRubrics.size > 0 ? (
            <div className="mt-2">
              <p className="text-[11.5px] font-medium" style={{ ...hubSans, color: hub.textMuted }}>Скрытые рубрики</p>
              <ul className="mt-1 flex flex-wrap gap-1.5">
                {[...mutedRubrics].map((r) => (
                  <li key={r}>
                    <button
                      type="button"
                      className="rounded-full border px-2 py-0.5 text-[11.5px] hover:bg-[#F4F6F8]"
                      style={{ ...hubSans, borderColor: hub.border, color: hub.textMuted }}
                      onClick={() => setMutedRubricsRaw(serializeRubricList([...mutedRubrics].filter((x) => x !== r)))}
                      aria-label={`Снова показывать рубрику «${r}»`}
                    >
                      {r} ✕
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="mt-2 text-[11.5px] leading-4" style={{ ...hubSans, color: newsStatus.state === "error" ? hub.danger : hub.textSubtle }}>
            {newsStatus.state === "loading" ? "Читаю новости WB…" : newsStatus.state === "idle" ? "" : newsStatus.state === "error" ? `Не удалось прочитать новости: ${newsStatus.text}` : newsStatus.text}
          </p>
          <p className="mt-1 text-[11.5px] leading-4" style={{ ...hubSans, color: hub.textSubtle }}>
            Тон («скорее хорошая или неприятная») мы определяем по заголовку, это наша оценка, а не мнение WB.
          </p>
        </SideCard>
      </aside>

      {openItem ? (
        <HubProductDrawer
          item={openItem}
          promotions={snapshot?.promotions}
          connected={connected}
          onOpenPrices={onOpenPrices}
          onClose={() => setOpenId(null)}
          onPatched={(patch) => {
            if (!snapshot || !onItemsUpdate) return;
            onItemsUpdate(snapshot.items.map((row) => (row.id === patch.id ? { ...row, ...patch } : row)));
          }}
        />
      ) : null}
    </div>
  );
}
