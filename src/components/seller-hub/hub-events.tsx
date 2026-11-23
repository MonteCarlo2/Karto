"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  Activity,
  Pin,
  TriangleAlert,
  X,
  Bot,
  FileText,
  Megaphone,
  Newspaper,
  PackageMinus,
  ShieldAlert,
  ShoppingCart,
  Star,
  Tag,
  TrendingUp,
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
import { ArticleChip, HubButton, HubEmptyState, HubPhoto, HubSearch, HubSegmented, HubSelect, formatInt, formatRub, hub, hubNumeric, hubSans } from "./hub-ui";
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

/**
 * Центр уведомлений устроен как почтовый ящик (Linear, GitHub): слева папки и направления, в середине плотный список, справа открытое уведомление.
 * Цвет только по смыслу: нейтральный по умолчанию, лайм у агентов, синий у новостей, красный и жёлтый у критичности.
 */
const NEUTRAL_TONE = { bg: "var(--hub-surface-muted)", fg: "var(--hub-text)" };
const GROUP_TONE: Record<SellerEventGroup, { bg: string; fg: string }> = {
  sales: NEUTRAL_TONE,
  stock: NEUTRAL_TONE,
  price: NEUTRAL_TONE,
  content: NEUTRAL_TONE,
  reviews: NEUTRAL_TONE,
  orders: NEUTRAL_TONE,
  ads: NEUTRAL_TONE,
  money: NEUTRAL_TONE,
  agents: { bg: "#E5FBD0", fg: "#2D6600" },
  system: NEUTRAL_TONE,
  news: { bg: "#E6EFFB", fg: "#1F5FBF" },
  other: NEUTRAL_TONE,
};

/** Сколько позиций серии показываем в самом уведомлении; остальное открывается окном со списком и поиском. */
const BURST_PREVIEW = 9;

/** Что это за уведомление, если в самом событии мало подробностей. Только то, что точно известно про вид события. */
const KIND_HINT: Partial<Record<SellerEventKind, string>> = {
  orders_new: "Появились новые заказы по схеме FBS: товар отгружается с вашего склада. Состав заказов и сроки отгрузки смотрите в разделе «Заказы и логистика».",
  orders_canceled: "Заказы отменены покупателем или WB. Какие именно и почему, видно в разделе «Заказы и логистика».",
  supply_created: "Создана поставка на склад WB. Состав и статус приёмки смотрите в разделе «Поставки».",
  supply_closed: "Поставка закрыта: после закрытия её состав уже не меняется. Приёмку на складе WB ведёт WB, статус виден в разделе «Поставки».",
  finance_document: "В личном кабинете WB появился новый финансовый документ. Его можно открыть в разделе «Финансы».",
  finance_withdraw_up: "Сумма к выводу выросла по сравнению с прошлой проверкой.",
  ad_budget_ended: "Бюджет рекламной кампании закончился, показы остановлены, пока бюджет не пополнят.",
  ad_budget_topped_up: "Бюджет рекламной кампании пополнен.",
  token_expiring: "Токен WB действует ограниченное время. Создайте новый заранее и замените его в разделе «Кабинет и API»: после истечения данные кабинета перестанут обновляться.",
  access_lost: "Токен WB перестал работать: данные кабинета не обновляются, пока доступ не восстановят в разделе «Кабинет и API».",
  access_restored: "Доступ к WB восстановлен, данные снова обновляются.",
  card_blocked: "WB заблокировал карточку: пока блокировка не снята, товар не продаётся.",
};

/**
 * Задачу из уведомления имеет смысл создавать, только если человеку нужно что-то решить или проверить.
 * Информационные уведомления (новый заказ, закрытая поставка, пополненный бюджет) задачу не создают.
 */
const TASKABLE_KINDS: ReadonlySet<SellerEventKind> = new Set<SellerEventKind>([
  "sales_up",
  "trend_orders_up",
  "promo_new",
  "stock_out",
  "forecast_stockout",
  "sales_down",
  "day_orders_drop",
  "trend_orders_down",
  "funnel_shift",
  "product_silent",
  "review_negative",
  "rating_changed",
  "buyout_changed",
  "card_blocked",
  "penalties_up",
  "tariff_logistics_changed",
  "tariff_storage_changed",
  "ad_budget_ended",
  "ad_spend_spike",
  "orders_canceled",
  "promo_deadline",
  "promo_left",
  "access_lost",
  "token_expiring",
]);
/** Что предложить в задаче по уведомлению: человек видит текст в окне и может его поправить. */
function suggestTask(event: SellerProductEvent): { title: string; text: string } {
  const product = event.productTitle ? ` «${event.productTitle}»` : "";
  const base = (title: string, text: string) => ({ title, text: [text, `Основание: уведомление «${event.title}».`].filter(Boolean).join("\n\n") });
  switch (event.kind) {
    case "promo_left":
      return base("Проверить товары, вышедшие из акции", "Часть товаров вышла из акции. Решите, вернуть их в акцию или оставить без неё, и проверьте цены.");
    case "promo_new":
      return base("Выбрать товары для новой акции", "WB открыл новую акцию. Откройте условия, выберите подходящие товары и проверьте, что цена в акции остаётся прибыльной.");
    case "promo_deadline":
      return base("Проверить участие в акции до срока", "Скоро старт или окончание акции. Проверьте, какие товары участвуют и что будет с ценами после неё.");
    case "sales_up":
    case "trend_orders_up":
      return base(`Закрепить рост продаж${product}`, "Продажи растут. Проверьте запас, цену и рекламу, чтобы не потерять рост из-за остатка или невыгодной цены.");
    case "sales_down":
    case "day_orders_drop":
    case "trend_orders_down":
    case "product_silent":
      return base(`Разобраться, почему упали продажи${product}`, "Проверьте, что менялось перед просадкой: цена, остаток, реклама, карточка, акции.");
    case "funnel_shift":
      return base(`Разобрать изменение воронки${product}`, "Конверсия изменилась. Проверьте карточку, цену и отзывы товара.");
    case "stock_out":
    case "forecast_stockout":
      return base(`Пополнить остаток${product}`, "Товар закончился или скоро закончится. Подготовьте поставку или переведите остатки между складами.");
    case "review_negative":
      return base(`Ответить на негативный отзыв${product}`, "Прочитайте отзыв, ответьте покупателю и, если причина в товаре, исправьте её.");
    case "rating_changed":
      return base(`Выяснить, почему изменился рейтинг${product}`, "Откройте последние отзывы и найдите повторяющуюся жалобу.");
    case "buyout_changed":
      return base(`Проверить причину изменения выкупа${product}`, "Сравните размеры, описание и фото с тем, что получает покупатель.");
    case "card_blocked":
      return base(`Исправить заблокированную карточку${product}`, "Откройте причину блокировки в кабинете WB, исправьте её и отправьте карточку на повторную проверку.");
    case "penalties_up":
      return base("Разобраться со штрафами WB", "Штрафы и удержания выросли. Откройте отчёт и найдите, за что они начислены.");
    case "tariff_logistics_changed":
    case "tariff_storage_changed":
      return base("Пересчитать цены с учётом новых тарифов", "Тарифы WB изменились. Проверьте маржу товаров и при необходимости поправьте цены.");
    case "ad_budget_ended":
      return base("Пополнить бюджет рекламной кампании", "Бюджет закончился, показы остановлены. Пополните его или остановите кампанию.");
    case "ad_spend_spike":
      return base("Проверить резкий рост расхода на рекламу", "Откройте кампанию и проверьте ставку, лимит и запросы с самыми большими затратами.");
    case "orders_canceled":
      return base("Выяснить причину отмены заказов", "Откройте заказы и посмотрите, кто и почему их отменил.");
    case "token_expiring":
      return base("Заменить токен Wildberries", "Токен скоро истечёт. Создайте новый в кабинете Wildberries и замените его в разделе «Кабинет и API».");
    case "access_lost":
      return base("Восстановить доступ к WB", "Токен перестал работать. Обновите его в разделе «Кабинет и API», иначе данные не обновляются.");
    case "agent_action":
      return base("Повторить действие агента вручную", "Агент не смог выполнить действие. Проверьте его в разделе «Агенты» и выполните вручную.");
    case "news_item":
    case "news_general":
      return base(`Разобрать новость WB: ${event.title.length > 110 ? `${event.title.slice(0, 107)}…` : event.title}`, "Прочитайте новость и решите, нужны ли изменения в акциях, ценах, рекламе или карточках.");
    default:
      return base(event.title, "Проверьте уведомление и решите, что нужно сделать.");
  }
}

const canTask = (event: SellerProductEvent) => event.severity !== "info" || TASKABLE_KINDS.has(event.kind);

/** Значок для события без товара: один спокойный значок на направление. У событий с товаром вместо него фото. */
const GROUP_ICON: Record<SellerEventGroup, LucideIcon> = {
  sales: TrendingUp,
  stock: PackageMinus,
  price: Tag,
  content: FileText,
  reviews: Star,
  orders: ShoppingCart,
  ads: Megaphone,
  money: Wallet,
  agents: Bot,
  system: ShieldAlert,
  news: Newspaper,
  other: Activity,
};

/** Главная цифра события («1 083 ₽», «40 шт.», «+32%»): показываем справа жирно, чтобы строка читалась без открытия. */
function keyFigure(text: string): string | null {
  const m = text.match(/[+\-−]?\d[\d\u00a0 ]*(?:[.,]\d+)?\s?(?:₽|%|шт\.?)/u);
  return m ? m[0].trim() : null;
}

const CRITICAL = { line: "#D33A3C", wash: "#FFF4F4", pillBg: "#FBE3E3", pillFg: "#B3262A" };
const IMPORTANT = { line: "#E4B964", wash: "#FFFAEE", pillBg: "#FCEFD6", pillFg: "#9A5A00" };

/** Технические тексты ошибок и даты в служебном формате переводим на человеческий язык. */
function plainError(text: string): string {
  const t = text
    .trim()
    // 2026-11-07T21:00:00Z показываем как «8 ноября» по Москве
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g, (iso) => {
      const d = new Date(iso);
      return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", timeZone: "Europe/Moscow" });
    });
  if (/fetch failed|failed to fetch|ECONNRESET|ECONNREFUSED|ENOTFOUND|socket hang up|network error/i.test(t)) return "Не удалось связаться с сервером Wildberries. Действие не выполнено.";
  if (/timeout|timed out|aborted/i.test(t)) return "Wildberries не ответил вовремя. Действие не выполнено.";
  if (/unauthori[sz]ed|forbidden|http[ :]*40[13]/i.test(t)) return "Wildberries не принял токен. Проверьте доступы в разделе «Кабинет и API».";
  if (/too many requests|rate limit|http[ :]*429/i.test(t)) return "Wildberries ограничил частоту запросов. Действие не выполнено.";
  if (/internal server error|bad gateway|service unavailable|http[ :]*5\d\d/i.test(t)) return "Сервер Wildberries временно недоступен. Действие не выполнено.";
  return t;
}

/** Подробности события: строки вида «Было: 1 200 ₽» показываем двумя колонками, остальное как текст. */
function DetailLines({ detail }: { detail: string }) {
  const lines = detail.split("\n").map((line) => plainError(line)).filter(Boolean);
  if (lines.length === 0) return null;
  return (
    <dl className="space-y-2">
      {lines.map((line, index) => {
        const match = line.match(/^([^:]{2,42}):\s+(.+)$/u);
        return match ? (
          <div key={index} className="grid grid-cols-[minmax(0,130px)_minmax(0,1fr)] items-baseline gap-x-3 text-[14px] leading-[1.45]" style={hubSans}>
            <dt style={{ color: hub.textSubtle }}>{match[1]}</dt>
            <dd className="font-medium [overflow-wrap:anywhere]" style={{ ...hubNumeric, color: hub.text }}>
              {match[2]}
            </dd>
          </div>
        ) : (
          <p key={index} className="max-w-[68ch] text-pretty text-[14.5px] leading-[1.55] [overflow-wrap:anywhere]" style={{ ...hubSans, color: hub.textMuted }}>
            {line}
          </p>
        );
      })}
    </dl>
  );
}

/** Возможные причины просадки дня: события, замеченные перед ней. Совпадение по времени, а не доказанная связь. */
function DropCauses({ event, events }: { event: SellerProductEvent; events: SellerProductEvent[] }) {
  const date = event.id.split(":").pop() ?? "";
  const causes = possibleCauses(date, events);
  return (
    <div className="rounded-[14px] px-4 py-3 text-[13.5px] leading-[1.5]" style={{ ...hubSans, backgroundColor: hub.canvas, color: hub.textMuted, boxShadow: `inset 0 0 0 1px ${hub.borderSoft}` }}>
      {causes.length === 0 ? (
        <p>Среди замеченных нами событий кандидатов нет. Возможные причины вне данных: реклама, конкуренты, сезонность.</p>
      ) : (
        <>
          <p className="font-semibold" style={{ color: hub.text }}>
            Что менялось перед этим
          </p>
          <p className="text-[12.5px]" style={{ color: hub.textSubtle }}>
            Совпадение по времени, а не доказанная связь.
          </p>
          <ul className="mt-2 space-y-1.5">
            {causes.map((c) => (
              <li key={c.event.id} className="flex gap-2.5">
                <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: hub.textSubtle }} aria-hidden />
                <span>
                  <span style={{ color: hub.text }}>
                    {c.event.title}
                    {c.event.productTitle ? ` — ${c.event.productTitle}` : ""}
                  </span>
                  : {c.why}
                </span>
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
    <div className="grid gap-6 xl:grid-cols-[216px_minmax(0,1fr)_400px]">
      <div className="hidden space-y-2 xl:block">
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index} className="h-9 animate-pulse rounded-[10px]" style={{ backgroundColor: hub.surfaceMuted }} />
        ))}
      </div>
      <div className="overflow-hidden rounded-[18px] border bg-white" style={{ borderColor: hub.borderCard }}>
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index} className="flex animate-pulse gap-3 border-t px-4 py-4 first:border-t-0" style={{ borderColor: hub.borderSoft }}>
            <div className="h-8 w-8 rounded-[10px]" style={{ backgroundColor: hub.surfaceMuted }} />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 w-52 rounded" style={{ backgroundColor: hub.surfaceMuted }} />
              <div className="h-3 w-72 rounded" style={{ backgroundColor: hub.surfaceMuted }} />
            </div>
          </div>
        ))}
      </div>
      <div className="hidden h-64 animate-pulse rounded-[18px] xl:block" style={{ backgroundColor: hub.surfaceMuted }} />
    </div>
  );
}

function SideCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-[18px] border bg-white px-5 py-5" style={{ borderColor: hub.borderCard }}>
      <h3 className="text-[15px] font-bold tracking-[-0.01em]" style={{ ...hubSans, color: hub.text }}>
        {title}
      </h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className="relative mt-0.5 h-[22px] w-[38px] shrink-0 rounded-full outline-none transition-colors duration-200 focus-visible:shadow-[0_0_0_2px_#fff,0_0_0_4px_var(--hub-lime-ring)]"
      style={{ backgroundColor: checked ? hub.greenDark : hub.borderStrong }}
    >
      <span className="absolute top-[3px] h-4 w-4 rounded-full bg-white shadow-sm transition-[left] duration-200" style={{ left: checked ? 19 : 3 }} />
    </button>
  );
}


/** Окно «Создать задачу»: предложенный заголовок и описание можно поправить до создания. */
function TaskDialog({ event, busy, error, onCreate, onClose }: { event: SellerProductEvent; busy: boolean; error: boolean; onCreate: (title: string, text: string) => void; onClose: () => void }) {
  const suggested = useMemo(() => suggestTask(event), [event]);
  const [title, setTitle] = useState(suggested.title);
  const [text, setText] = useState(suggested.text);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);
  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <button type="button" aria-label="Закрыть" className="hub-fade-in absolute inset-0 bg-[rgba(1,20,8,0.5)] backdrop-blur-[2px]" onClick={() => (busy ? undefined : onClose())} />
      <div role="dialog" aria-modal="true" aria-label="Создать задачу" className="hub-pop relative w-full max-w-[560px] rounded-t-[28px] bg-white p-7 shadow-[0_40px_100px_-30px_rgba(1,20,8,0.55)] sm:rounded-[28px]">
        <h2 className="text-[22px] font-semibold tracking-[-0.02em]" style={{ ...hubSans, color: hub.text }}>
          Создать задачу
        </h2>
        <p className="mt-1 text-[13.5px] leading-[1.45]" style={{ ...hubSans, color: hub.textSubtle }}>
          Задача появится в разделе «Задачи». Текст можно поправить.
        </p>
        <label className="mt-5 block">
          <span className="text-[13px] font-semibold" style={{ ...hubSans, color: hub.textMuted }}>Что нужно сделать</span>
          <input
            value={title}
            maxLength={160}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1.5 h-11 w-full rounded-[12px] border bg-white px-3.5 text-[15px] font-medium outline-none focus:shadow-[0_0_0_2px_var(--hub-lime-ring)]"
            style={{ ...hubSans, borderColor: hub.borderStrong, color: hub.text }}
          />
        </label>
        <label className="mt-4 block">
          <span className="text-[13px] font-semibold" style={{ ...hubSans, color: hub.textMuted }}>Подробности</span>
          <textarea
            value={text}
            maxLength={600}
            rows={5}
            onChange={(e) => setText(e.target.value)}
            className="mt-1.5 w-full resize-none rounded-[12px] border bg-white px-3.5 py-3 text-[14.5px] leading-[1.5] outline-none focus:shadow-[0_0_0_2px_var(--hub-lime-ring)]"
            style={{ ...hubSans, borderColor: hub.borderStrong, color: hub.text }}
          />
        </label>
        {error ? (
          <p role="alert" className="mt-3 text-[13px]" style={{ ...hubSans, color: hub.danger }}>
            Не удалось создать задачу, попробуйте ещё раз.
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap items-center justify-end gap-2.5">
          <HubButton variant="ghost" disabled={busy} onClick={onClose}>
            Отмена
          </HubButton>
          <HubButton loading={busy} disabled={!title.trim()} onClick={() => onCreate(title.trim(), text.trim())}>
            Создать задачу
          </HubButton>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Новость WB, разложенная для чтения: суть, подробности, почему это вам. Заголовок остаётся заголовком WB. */
function NewsDetail({ detail }: { detail: string }) {
  const lines = detail.split("\n").map((l) => l.trim()).filter(Boolean);
  const rubric = lines.find((l) => l.startsWith("Рубрика WB:"))?.replace("Рубрика WB:", "").trim();
  const tone = lines.find((l) => l.startsWith("Скорее"));
  const body = lines.filter((l) => !l.startsWith("Рубрика WB:") && !l.startsWith("Почему это вам:") && !l.startsWith("Скорее")).join(" ");
  const sentences = body
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+(?=[А-ЯЁA-Z«"])/u)
    .map((x) => x.trim())
    .filter(Boolean);
  const lead = sentences[0];
  const rest = sentences.slice(1, 9);
  return (
    <div className="space-y-5" style={hubSans}>
      {lead ? (
        <section>
          <h3 className="text-[13px] font-bold" style={{ color: hub.textMuted }}>Что случилось</h3>
          <p className="mt-1.5 text-pretty text-[16px] font-semibold leading-[1.5] [overflow-wrap:anywhere]" style={{ color: hub.text }}>
            {lead}
          </p>
        </section>
      ) : null}
      {rest.length > 0 ? (
        <section>
          <h3 className="text-[13px] font-bold" style={{ color: hub.textMuted }}>Подробности</h3>
          <ul className="mt-2 space-y-2">
            {rest.map((sentence, i) => (
              <li key={i} className="flex gap-3 text-pretty text-[14.5px] leading-[1.55] [overflow-wrap:anywhere]" style={{ color: hub.textMuted }}>
                <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: hub.textSubtle }} aria-hidden />
                {sentence}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {tone || rubric ? (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]" style={{ color: hub.textSubtle }}>
          {rubric ? <span className="rounded-full px-2.5 py-0.5 font-medium" style={{ backgroundColor: hub.surfaceMuted, color: hub.textMuted }}>{rubric}</span> : null}
          {tone ? <span>{tone}</span> : null}
        </p>
      ) : null}
    </div>
  );
}

/** Полный список позиций серии («Изменилась цена: у 40 товаров»): поиск и прокрутка, чтобы не раздувать уведомление. */
function BurstModal({ title, events, photoOf, onClose }: { title: string; events: SellerProductEvent[]; photoOf: (e: SellerProductEvent) => string | undefined; onClose: () => void }) {
  const [search, setSearch] = useState("");
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const needle = search.trim().toLowerCase();
  const list = needle ? events.filter((e) => `${e.productTitle ?? ""} ${e.vendorCode ?? ""} ${e.nmId ?? ""} ${e.detail}`.toLowerCase().includes(needle)) : events;
  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <button type="button" aria-label="Закрыть" className="hub-fade-in absolute inset-0 bg-[rgba(1,20,8,0.5)] backdrop-blur-[2px]" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={title} className="hub-pop relative flex h-[min(720px,100%)] w-full max-w-[640px] flex-col overflow-hidden rounded-t-[28px] bg-white shadow-[0_40px_100px_-30px_rgba(1,20,8,0.55)] sm:rounded-[28px]">
        <div className="px-7 pb-4 pt-6">
          <div className="flex items-start justify-between gap-4">
            <h2 className="text-[20px] font-semibold leading-[1.25] tracking-[-0.02em] [overflow-wrap:anywhere]" style={{ ...hubSans, color: hub.text }}>
              {title}
            </h2>
            <button type="button" aria-label="Закрыть" onClick={onClose} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full outline-none transition-colors hover:bg-[var(--hub-surface-muted)] focus-visible:shadow-[0_0_0_2px_var(--hub-lime-ring)]" style={{ color: hub.textMuted }}>
              <X className="h-5 w-5" strokeWidth={1.75} />
            </button>
          </div>
          <input
            autoFocus
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Название, артикул или номер WB"
            aria-label="Поиск по списку"
            className="mt-4 h-11 w-full rounded-full border bg-white px-4 text-[15px] outline-none focus:shadow-[0_0_0_2px_var(--hub-lime-ring)]"
            style={{ ...hubSans, borderColor: hub.borderStrong, color: hub.text }}
          />
          <p className="mt-2 text-[13px]" style={{ ...hubSans, ...hubNumeric, color: hub.textSubtle }}>
            {needle ? `Найдено ${list.length} из ${events.length}` : `Всего ${events.length}`}
          </p>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t px-3 py-2" style={{ borderColor: hub.border }}>
          {list.map((e) => (
            <li key={e.id} className="flex items-center gap-3.5 rounded-[12px] px-3 py-2.5">
              <HubPhoto src={photoOf(e)} className="h-[48px] w-[36px] shrink-0 rounded-[7px]" iconClassName="h-3.5 w-3.5" />
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-[14.5px] font-semibold leading-[1.3] [overflow-wrap:anywhere]" style={{ ...hubSans, color: hub.text }}>
                  {e.productTitle ?? "Товар"}
                </p>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12.5px]" style={{ ...hubSans, ...hubNumeric, color: hub.textMuted }}>
                  {e.vendorCode ? <ArticleChip value={e.vendorCode} /> : null}
                  {e.detail ? <span className="[overflow-wrap:anywhere]">{plainError(e.detail.split("\n").join("; "))}</span> : null}
                </div>
              </div>
            </li>
          ))}
          {list.length === 0 ? (
            <li className="px-4 py-10 text-center text-[14px]" style={{ ...hubSans, color: hub.textSubtle }}>
              Ничего не найдено.
            </li>
          ) : null}
        </ul>
      </div>
    </div>,
    document.body,
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
  const [digests, setDigests] = useState<Map<string, DayDigest>>(() => new Map());
  const [nowMs] = useState(() => Date.now());
  const [seenAt, setSeenAt] = useUserSetting<string>("events.seenAt", "");
  const [marksRaw, setMarksRaw] = useUserSetting<string>("events.marks", "");
  const [mutedRaw, setMutedRaw] = useUserSetting<string>("events.mutedGroups", "");
  const [sensitivity, setSensitivity] = useUserSetting<string>("events.sensitivity", "normal");
  const [newsGeneral, setNewsGeneral] = useUserSetting<boolean>("events.newsGeneral", false);
  const [mutedRubricsRaw, setMutedRubricsRaw] = useUserSetting<string>("events.newsMutedRubrics", "");
  const [groupBursts, setGroupBursts] = useUserSetting<boolean>("events.groupBursts", true);
  const [autoRead, setAutoRead] = useUserSetting<boolean>("events.autoRead", true);
  const [newsPersonalOnly, setNewsPersonalOnly] = useUserSetting<boolean>("events.newsPersonalOnly", false);
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
  const shown = useMemo(
    () =>
      live.filter(
        (e) =>
          !muted.has(e.group) &&
          (newsGeneral || e.kind !== "news_general") &&
          !hiddenByRubric(e, mutedRubrics) &&
          (!newsPersonalOnly || (e.kind !== "news_item" && e.kind !== "news_general") || /персональная новость/i.test(e.detail)),
      ),
    [live, muted, newsGeneral, mutedRubrics, newsPersonalOnly],
  );
  const isRead = (e: SellerProductEvent) => isEventRead(e, marks, seenMs);
  const viewCount = (v: StatusView) => shown.filter((e) => matchesView(e, v, marks, seenMs, needsAttention)).length;
  const unreadCount = viewCount("unread");

  const inView = shown.filter((e) => matchesView(e, view, marks, seenMs, needsAttention) && matchesQuery(e, query));
  const dirCounts = new Map<SellerEventGroup, number>();
  for (const e of inView) dirCounts.set(e.group, (dirCounts.get(e.group) ?? 0) + 1);
  const filtered = inView.filter((e) => direction === "all" || e.group === direction);
  const days = groupEventsByDay(filtered, nowMs, digests);
  const shownDays = days;

  const todayKey = moscowDateKey(nowMs);
  const week = useMemo(() => buildWeekCompare([...digests].map(([date, d]) => ({ date, orders: d.orders, orderSum: d.orderSum })), todayKey), [digests, todayKey]);
  const coverage = useMemo(() => buildCoverage(snapshot, digests.size), [snapshot, digests.size]);

  const openItem = snapshot?.items.find((item) => item.id === openId) ?? null;

  // Плотный список: общий порядок строк нужен для выбора и клавиатуры.
  const dayItems = shownDays.map((day) => ({ day, items: groupBursts ? collapseBursts(day.events) : day.events.map((event) => ({ type: "single" as const, event })) }));
  const flat = dayItems.flatMap((d) => d.items);
  type FeedItem = (typeof flat)[number];
  const keyOf = (item: FeedItem) => (item.type === "burst" ? item.id : item.event.id);
  const groupOf = (item: FeedItem) => (item.type === "burst" ? item.events : [item.event]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [burstModal, setBurstModal] = useState<string | null>(null);
  const [taskDialog, setTaskDialog] = useState<string | null>(null);
  const [listModal, setListModal] = useState<{ title: string; events: SellerProductEvent[] } | null>(null);
  const selected = flat.find((i) => keyOf(i) === selectedKey) ?? null;
  const paneRef = useRef<HTMLDivElement | null>(null);
  const [stickyTop, setStickyTop] = useState(4);

  const select = (item: FeedItem | null) => {
    if (!item) {
      setSelectedKey(null);
      return;
    }
    setSelectedKey(keyOf(item));
    const group = groupOf(item);
    // Открыл уведомление, значит, прочитал.
    if (autoRead && group.some((e) => !isRead(e))) updateMarks((m) => group.reduce((acc, e) => setRead(acc, e.id, true), m));
  };

  // Клавиатура, как в почте: J и K (или стрелки) по списку, E в архив, U прочитано, P закрепить, Esc закрыть.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.metaKey || event.ctrlKey || event.altKey || openId || settingsOpen || burstModal || taskDialog || listModal) return;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)) return;
      const index = selected ? flat.findIndex((i) => keyOf(i) === selectedKey) : -1;
      const move = (to: number) => {
        const next = flat[Math.max(0, Math.min(flat.length - 1, to))];
        if (!next) return;
        select(next);
        window.requestAnimationFrame(() => document.querySelector(`[data-ev="${CSS.escape(keyOf(next))}"]`)?.scrollIntoView({ block: "nearest" }));
      };
      const key = event.key.toLowerCase();
      if (key === "j" || (key === "arrowdown" && selected)) {
        event.preventDefault();
        move(index + 1);
      } else if (key === "k" || (key === "arrowup" && selected)) {
        event.preventDefault();
        move(index < 0 ? 0 : index - 1);
      } else if (selected && key === "e") {
        const group = groupOf(selected);
        const archivedNow = marks.archived.includes(group[0]!.id);
        updateMarks((m) => group.reduce((acc, e) => setArchived(acc, e.id, !archivedNow), m));
      } else if (selected && key === "u") {
        const group = groupOf(selected);
        const unreadNow = group.some((e) => !isRead(e));
        updateMarks((m) => group.reduce((acc, e) => setRead(acc, e.id, unreadNow), m));
      } else if (selected && key === "p" && selected.type === "single") {
        updateMarks((m) => setPinned(m, selected.event.id, !marks.pinned.includes(selected.event.id)));
      } else if (selected && key === "escape") {
        setSelectedKey(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Правая колонка липнет к верху. Если она выше экрана, прижимается нижним краем и едет вместе со страницей, без своей прокрутки.
  useLayoutEffect(() => {
    const el = paneRef.current;
    if (!el) return;
    const update = () => setStickyTop(Math.min(4, Math.round(window.innerHeight - el.offsetHeight - 16)));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [loading, selectedKey]);


  const createTask = (eventId: string, text?: { title: string; description: string }) => {
    setTaskState((prev) => ({ ...prev, [eventId]: "creating" }));
    void createSellerHubTaskFromEvent(eventId, "wildberries", text)
      .then((res) => {
        setTaskState((prev) => ({ ...prev, [eventId]: res.ok ? (res.existed ? "exists" : "created") : "error" }));
        if (res.ok) setTaskDialog(null);
      })
      .catch(() => setTaskState((prev) => ({ ...prev, [eventId]: "error" })));
  };

  if (loading) return <EventSkeleton />;

  if (error) {
    return (
      <div className="overflow-hidden rounded-[20px] border bg-white" style={{ borderColor: hub.borderCard }}>
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
      </div>
    );
  }

  const attentionCount = viewCount("attention");
  const itemById = new Map((snapshot?.items ?? []).map((row) => [row.id, row]));
  const emptyTitle = view === "archive" ? "Архив пуст" : view === "pinned" ? "Нет закреплённых" : view === "unread" ? "Всё прочитано" : shown.length === 0 ? "Событий пока нет" : "Ничего не найдено";
  const emptyText =
    view === "archive"
      ? "Сюда попадают уведомления, которые вы скрыли."
      : view === "pinned"
        ? "Закрепите важное уведомление, чтобы оно было под рукой."
        : view === "unread"
          ? "Новых уведомлений нет."
          : shown.length === 0
            ? "Когда в кабинете что-то произойдёт, уведомление появится здесь."
            : "Попробуйте другой фильтр или запрос.";
  const pickView = (id: StatusView) => {
    setView(id);
  };

  /** Товары из акции («Из акции вышло товаров: 15»): имена из подробностей показываем списком с фото, как серии. */
  const titleToItem = new Map((snapshot?.items ?? []).map((row) => [row.title, row]));
  const renderNameList = (first: SellerProductEvent) => {
    const tail = first.detail.match(/\s+и ещё (\d+)\s*$/u);
    const more = tail ? Number(tail[1]) : 0;
    const base = tail ? first.detail.slice(0, tail.index) : first.detail;
    const names = base.split(/;\s*/).map((n) => n.trim()).filter(Boolean);
    const pseudo: SellerProductEvent[] = names.map((name, index) => {
      const row = titleToItem.get(name);
      return { id: `${first.id}:n${index}`, createdAt: first.createdAt, kind: first.kind, group: first.group, severity: "info", title: first.title, detail: "", productTitle: name, vendorCode: row?.vendorCode ?? null, nmId: row ? String(row.externalId) : null, itemId: row?.id ?? null };
    });
    return (
      <div>
        <ul className="divide-y overflow-hidden rounded-[14px] border bg-white" style={{ borderColor: hub.border }}>
          {pseudo.slice(0, BURST_PREVIEW).map((e) => {
            const row = e.itemId ? itemById.get(e.itemId) : undefined;
            return (
              <li key={e.id} className="flex items-center gap-3 px-3.5 py-2.5" style={{ borderColor: hub.borderSoft }}>
                <HubPhoto src={row?.imageUrl} className="h-[40px] w-[30px] shrink-0 rounded-[6px]" iconClassName="h-3 w-3" />
                <p className="line-clamp-2 min-w-0 flex-1 text-[14px] font-medium [overflow-wrap:anywhere]" style={{ ...hubSans, color: hub.text }}>
                  {e.productTitle}
                </p>
              </li>
            );
          })}
        </ul>
        {pseudo.length > BURST_PREVIEW ? (
          <HubButton variant="secondary" className="mt-3" onClick={() => setListModal({ title: first.title, events: pseudo })}>
            Показать все {pseudo.length}
          </HubButton>
        ) : null}
        {more > 0 ? (
          <p className="mt-2 text-[12.5px] leading-[1.45]" style={{ ...hubSans, color: hub.textSubtle }}>
            И ещё {more}: в этом уведомлении сохранены не все названия, в новых уведомлениях список полный.
          </p>
        ) : null}
      </div>
    );
  };

  /** Открытое уведомление: заголовок, товар, подробности, кнопки. Те же кнопки всегда видны. */
  const renderDetail = (item: FeedItem) => {
    const group = groupOf(item);
    const first = group[0]!;
    const tone = GROUP_TONE[first.group];
    const critical = group.some((e) => e.severity === "critical");
    const important = !critical && group.some((e) => e.severity === "important");
    const unread = group.some((e) => !isRead(e));
    const archived = marks.archived.includes(first.id);
    const pinned = marks.pinned.includes(first.id);
    const canOpen = item.type === "single" && Boolean(first.itemId && snapshot?.items.some((row) => row.id === first.itemId));
    const product = first.itemId ? itemById.get(first.itemId) : undefined;
    const target = item.type === "single" ? eventTarget(first) : null;
    const isNews = item.type === "single" && (first.kind === "news_item" || first.kind === "news_general");
    return (
      <div className="space-y-5">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[13px]" style={{ ...hubSans, color: hub.textSubtle }}>
            <span className="font-semibold" style={{ color: first.group === "agents" || first.group === "news" ? tone.fg : hub.textMuted }}>
              {GROUP_LABEL[first.group]}
            </span>
            {" · "}
            {dateTimeOf(first.createdAt)}
          </p>
          <button
            type="button"
            aria-label="Закрыть уведомление"
            onClick={() => select(null)}
            className="-mr-1.5 -mt-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full outline-none transition-colors hover:bg-[var(--hub-surface-muted)] focus-visible:shadow-[0_0_0_2px_var(--hub-lime-ring)]"
            style={{ color: hub.textMuted }}
          >
            <X className="h-4.5 w-4.5" strokeWidth={1.75} />
          </button>
        </div>

        <div>
          <h2 className="text-balance text-[22px] font-bold leading-[1.25] tracking-[-0.02em] [overflow-wrap:anywhere]" style={{ ...hubSans, color: hub.text }}>
            {item.type === "burst" ? item.title : first.title}
          </h2>
          {critical || important ? (
            <p className="mt-2.5">
              <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12.5px] font-bold" style={{ ...hubSans, backgroundColor: critical ? CRITICAL.pillBg : IMPORTANT.pillBg, color: critical ? CRITICAL.pillFg : IMPORTANT.pillFg }}>
                {critical ? "Критично" : "Важно"}
              </span>
            </p>
          ) : null}
        </div>

        {item.type === "single" && first.productTitle ? (
          <div className="flex items-center gap-3.5 rounded-[14px] border p-2.5 pr-4" style={{ borderColor: hub.border, backgroundColor: hub.canvas }}>
            <HubPhoto src={product?.imageUrl} className="h-[72px] w-[54px] shrink-0 rounded-[9px]" iconClassName="h-4 w-4" />
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-[15px] font-semibold leading-[1.35] [overflow-wrap:anywhere]" style={{ ...hubSans, color: hub.text }}>
                {first.productTitle}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]" style={{ ...hubSans, ...hubNumeric, color: hub.textSubtle }}>
                {first.vendorCode ? <ArticleChip value={first.vendorCode} /> : null}
                {first.nmId ? <span>nm {first.nmId}</span> : null}
              </div>
            </div>
          </div>
        ) : null}

        {item.type === "single" && first.detail ? (isNews ? <NewsDetail detail={first.detail} /> : first.kind === "promo_left" || first.kind === "promo_entered" ? renderNameList(first) : <DetailLines detail={first.detail} />) : null}
        {item.type === "single" && KIND_HINT[first.kind] ? (
          <p className="max-w-[62ch] text-pretty text-[13.5px] leading-[1.55]" style={{ ...hubSans, color: hub.textSubtle }}>
            {KIND_HINT[first.kind]}
          </p>
        ) : null}
        {item.type === "single" && first.kind === "day_orders_drop" ? <DropCauses event={first} events={live} /> : null}
        {item.type === "burst" ? (
          <div>
            <ul className="divide-y overflow-hidden rounded-[14px] border bg-white" style={{ borderColor: hub.border }}>
              {item.events.slice(0, BURST_PREVIEW).map((e) => {
                const row = e.itemId ? itemById.get(e.itemId) : undefined;
                return (
                  <li key={e.id} className="flex items-center gap-3 px-3.5 py-2.5" style={{ borderColor: hub.borderSoft }}>
                    <HubPhoto src={row?.imageUrl} className="h-[40px] w-[30px] shrink-0 rounded-[6px]" iconClassName="h-3 w-3" />
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-1 text-[14px] font-medium [overflow-wrap:anywhere]" style={{ ...hubSans, color: hub.text }}>
                        {e.productTitle ?? "Товар"}
                      </p>
                      {e.detail ? (
                        <p className="text-[13px] leading-[1.4] [overflow-wrap:anywhere]" style={{ ...hubSans, ...hubNumeric, color: hub.textMuted }}>
                          {plainError(e.detail.split("\n").join("; "))}
                        </p>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
            {item.events.length > BURST_PREVIEW ? (
              <HubButton variant="secondary" className="mt-3" onClick={() => setBurstModal(keyOf(item))}>
                Показать все {item.events.length}
              </HubButton>
            ) : null}
          </div>
        ) : null}

        {item.type === "single" ? (
          <div className="flex flex-wrap items-center gap-2">
            {target && onNavigate ? (
              <HubButton variant="primary" onClick={() => onNavigate(target)}>
                {target.label}
              </HubButton>
            ) : null}
            {!canTask(first) ? null : taskState[first.id] === "created" || taskState[first.id] === "exists" ? (
              <span className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px] font-medium" style={{ ...hubSans, backgroundColor: hub.greenSoft, color: hub.greenDark }}>
                {taskState[first.id] === "exists" ? "Задача уже создана" : "Задача создана"}
                {onOpenTasks ? (
                  <button type="button" onClick={onOpenTasks} className="underline underline-offset-2 outline-none focus-visible:shadow-[0_0_0_2px_var(--hub-lime-ring)]">
                    Открыть в задачах
                  </button>
                ) : null}
              </span>
            ) : (
              <HubButton variant="secondary" loading={taskState[first.id] === "creating"} onClick={() => setTaskDialog(first.id)}>
                Создать задачу
              </HubButton>
            )}
            {canOpen ? (
              <HubButton variant="secondary" onClick={() => setOpenId(first.itemId)}>
                К товару
              </HubButton>
            ) : null}
            {isNews && !archived ? (
              <HubButton
                variant="ghost"
               
                onClick={() => {
                  updateMarks((m) => setArchived(m, first.id, true));
                  const rubric = newsRubricsOf(first.detail).find((r) => r !== "Персональная новость" && r !== "Важно");
                  if (rubric && !mutedRubrics.has(rubric)) setAskRubric({ eventId: first.id, rubric });
                }}
              >
                Не по теме
              </HubButton>
            ) : null}
            {taskState[first.id] === "error" ? (
              <span className="text-[13px]" style={{ ...hubSans, color: hub.danger }}>
                Не удалось создать задачу, попробуйте ещё раз
              </span>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 border-t pt-4" style={{ borderColor: hub.border }}>
          <div className="inline-flex overflow-hidden rounded-full border" style={{ borderColor: hub.borderStrong }}>
            {[
              { label: unread ? "Прочитано" : "Не прочитано", on: false, run: () => updateMarks((m) => group.reduce((acc, e) => setRead(acc, e.id, unread), m)) },
              ...(item.type === "single" ? [{ label: pinned ? "Открепить" : "Закрепить", on: pinned, run: () => updateMarks((m) => setPinned(m, first.id, !pinned)) }] : []),
              { label: archived ? "Вернуть из архива" : "В архив", on: false, run: () => updateMarks((m) => group.reduce((acc, e) => setArchived(acc, e.id, !archived), m)) },
            ].map((action, index) => (
              <button
                key={action.label}
                type="button"
                onClick={action.run}
                className="px-4 py-2 text-[13.5px] font-semibold outline-none transition-colors hover:bg-[var(--hub-surface-muted)] focus-visible:shadow-[inset_0_0_0_2px_var(--hub-lime-ring)]"
                style={{ ...hubSans, color: hub.text, backgroundColor: action.on ? hub.limeSoft : undefined, borderLeft: index > 0 ? `1px solid ${hub.borderStrong}` : undefined }}
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="grid gap-x-8 gap-y-5 xl:grid-cols-[minmax(0,1fr)_400px] xl:items-start">

      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <HubSearch value={query} onChange={setQuery} placeholder="Найти товар или событие" label="Поиск по событиям" className="min-w-0 flex-1 basis-56" />
          <HubSelect
            label="Направление"
            value={direction}
            onChange={(id) => setDirection(id)}
            options={[{ id: "all" as Direction, label: "Все" }, ...GROUP_ORDER.filter((g) => dirCounts.has(g)).map((g) => ({ id: g as Direction, label: `${GROUP_LABEL[g]} · ${dirCounts.get(g)}` }))]}
          />
          {unreadCount > 0 ? (
            <HubButton variant="secondary" size="sm" onClick={markAllRead}>
              Прочитать всё
            </HubButton>
          ) : null}
          <HubButton variant="secondary" size="sm" onClick={() => setSettingsOpen(true)}>
            Настройки
          </HubButton>
        </div>

        <div role="tablist" aria-label="Что показывать" className="flex flex-wrap gap-x-6 gap-y-1 px-1">
          {(
            [
              ["all", "Все"],
              ["unread", "Непрочитанные"],
              ["attention", "Важное"],
              ["pinned", "Закреплённые"],
              ["archive", "Архив"],
            ] as Array<[StatusView, string]>
          ).map(([id, label]) => {
            const active = view === id;
            const count = viewCount(id);
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => pickView(id)}
                className="relative whitespace-nowrap pb-2 pt-1 text-[14px] outline-none transition-colors duration-200 hover:text-[var(--hub-text)] focus-visible:shadow-[0_0_0_2px_var(--hub-lime-ring)]"
                style={{ ...hubSans, color: active ? hub.text : hub.textSubtle, fontWeight: active ? 700 : 500 }}
              >
                <span aria-hidden className="absolute inset-x-0 bottom-0 h-[3px] origin-left rounded-full transition-transform duration-300 ease-out" style={{ backgroundColor: hub.limeEdge, transform: active ? "scaleX(1)" : "scaleX(0)" }} />
                {label}
                {count > 0 || id === "all" ? (
                  <span className="ml-1.5 text-[13px] font-medium" style={{ ...hubNumeric, color: hub.textSubtle }}>
                    {count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        {askRubric ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[16px] border bg-white px-5 py-4" style={{ borderColor: hub.borderCard }}>
            <p className="max-w-[60ch] text-[14px] leading-[1.5]" style={{ ...hubSans, color: hub.text }}>
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
          </div>
        ) : null}

        {shownDays.length === 0 ? (
          <div className="overflow-hidden rounded-[18px] border bg-white" style={{ borderColor: hub.borderCard }}>
            <HubEmptyState icon={<Activity className="h-7 w-7" />} title={emptyTitle} description={emptyText} />
          </div>
        ) : (
          <div key={`${view}|${direction}|${query.trim()}`} className="hub-fade-in space-y-5">
            {dayItems.map(({ day, items }) => (
              <section key={day.date} aria-label={day.label}>
                <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 px-1">
                  <h3 className="text-[13.5px] font-bold" style={{ ...hubSans, color: hub.text }}>
                    {day.label}
                    <span className="ml-2 font-medium" style={{ ...hubNumeric, color: hub.textSubtle }}>
                      {day.events.length}
                    </span>
                  </h3>
                  {day.digest && day.digest.orders != null ? (
                    <p className="text-[12.5px]" style={{ ...hubSans, ...hubNumeric, color: hub.textMuted }}>
                      Заказов за день: <b style={{ color: hub.text }}>{formatInt(day.digest.orders)}</b>
                      {day.digest.orderSum != null ? <> на <b style={{ color: hub.text }}>{formatRub(day.digest.orderSum)}</b></> : null}
                    </p>
                  ) : null}
                </div>
                <ul className="overflow-hidden rounded-[16px] border bg-white" style={{ borderColor: hub.borderCard }}>
                  {items.map((item) => {
                    const group = groupOf(item);
                    const first = group[0]!;
                    const key = keyOf(item);
                    const tone = GROUP_TONE[first.group];
                    const critical = group.some((e) => e.severity === "critical");
                    const important = !critical && group.some((e) => e.severity === "important");
                    const unread = group.some((e) => !isRead(e));
                    const archived = marks.archived.includes(first.id);
                    const pinned = marks.pinned.includes(first.id);
                    const active = selectedKey === key;
                    const firstLine = item.type === "burst" ? "" : plainError(first.detail.split("\n").map((l) => l.trim()).find(Boolean) ?? "");
                    const headline = item.type === "burst" ? `${item.events.length} шт.` : (first.productTitle ?? firstLine);
                    // Третья строка: суть события. Не повторяем то, что уже сказано в заголовке или второй строке.
                    const summary = item.type === "single" && first.productTitle && firstLine && firstLine.length > 3 ? firstLine : "";
                    const isNewsRow = first.kind === "news_item" || first.kind === "news_general";
                    const countInTitle = first.kind === "promo_left" || first.kind === "promo_entered" ? first.title.match(/:\s*(\d+)\s*$/)?.[1] : undefined;
                    const figure = item.type === "burst" ? `${item.events.length} шт.` : countInTitle ? `${countInTitle} шт.` : isNewsRow || first.kind === "promo_deadline" ? null : keyFigure(firstLine) ?? keyFigure(first.title);
                    const photo = item.type === "single" && first.productTitle ? (first.itemId ? (itemById.get(first.itemId)?.imageUrl ?? undefined) : undefined) : null;
                    const GroupGlyph = GROUP_ICON[first.group];
                    return (
                      <li key={key} className="border-t first:border-t-0" style={{ borderColor: hub.borderSoft }}>
                        <button
                          type="button"
                          data-ev={key}
                          aria-current={active}
                          onClick={() => select(active ? null : item)}
                          className="grid w-full grid-cols-[10px_46px_minmax(0,1fr)_auto] items-center gap-x-3.5 px-4 py-3.5 text-left outline-none transition-[background-color,box-shadow,opacity] duration-300 ease-out hover:bg-[var(--hub-surface-muted)] focus-visible:shadow-[inset_0_0_0_2px_var(--hub-lime-ring)]"
                          style={{
                            backgroundColor: active ? hub.limeSoft : critical ? CRITICAL.wash : important ? IMPORTANT.wash : unread ? "#F5F9FF" : undefined,
                            boxShadow: critical && !active ? `inset 0 0 0 1.5px ${CRITICAL.line}` : undefined,
                            opacity: archived ? 0.62 : 1,
                          }}
                        >
                          <span aria-label={unread ? "Не прочитано" : undefined} className="h-2.5 w-2.5 rounded-full transition-[background-color,box-shadow,transform] duration-300" style={{ backgroundColor: unread ? "#2F6FEB" : "transparent", boxShadow: unread ? "0 0 0 3px rgba(47,111,235,0.2)" : "0 0 0 0 rgba(47,111,235,0)", transform: unread ? "scale(1)" : "scale(0.6)" }} />
                          {photo !== null ? (
                            <HubPhoto src={photo ?? undefined} className="h-[46px] w-[35px] rounded-[9px]" iconClassName="h-4 w-4" />
                          ) : (
                            <span className="flex h-[40px] w-[40px] items-center justify-center" style={{ color: first.group === "agents" || first.group === "news" ? tone.fg : hub.textSubtle }}>
                              <GroupGlyph className="h-[22px] w-[22px]" strokeWidth={1.6} />
                            </span>
                          )}
                          <span className="min-w-0">
                            <span className="block truncate text-[15px] leading-[1.35]" style={{ ...hubSans, color: hub.text, fontWeight: unread ? 700 : 600 }}>
                              {item.type === "burst" ? item.title : first.title}
                            </span>
                            <span className="mt-0.5 block truncate text-[13px] leading-[1.35]" style={{ ...hubSans, color: hub.textSubtle }}>
                              <span className="font-medium" style={{ color: first.group === "agents" || first.group === "news" ? tone.fg : hub.textMuted }}>
                                {GROUP_LABEL[first.group]}
                              </span>
                              {headline ? ` · ${headline}` : ""}
                            </span>
                            {summary ? (
                              <span className="mt-0.5 block truncate text-[13px] leading-[1.35]" style={{ ...hubSans, color: hub.textMuted }}>
                                {summary}
                              </span>
                            ) : null}
                          </span>
                          <span className="flex shrink-0 flex-col items-end gap-1 text-right" style={{ ...hubSans, ...hubNumeric }}>
                            {figure ? (
                              <span className="text-[15px] font-bold leading-none" style={{ color: hub.text }}>
                                {figure}
                              </span>
                            ) : null}
                            <span className="flex items-center gap-2 text-[12px]" style={{ color: hub.textSubtle }}>
                              {critical ? (
                                <span className="rounded-full px-2 py-0.5 text-[11.5px] font-bold" style={{ backgroundColor: CRITICAL.pillBg, color: CRITICAL.pillFg }}>
                                  Критично
                                </span>
                              ) : important ? (
                                <span className="rounded-full px-2 py-0.5 text-[11.5px] font-bold" style={{ backgroundColor: IMPORTANT.pillBg, color: IMPORTANT.pillFg }}>
                                  Важно
                                </span>
                              ) : null}
                              {pinned ? <Pin aria-label="Закреплено" className="h-3.5 w-3.5" style={{ color: hub.textMuted }} /> : null}
                              {timeOf(first.createdAt)}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>

      {selected ? <button type="button" aria-label="Закрыть уведомление" className="fixed inset-0 z-20 bg-[rgba(1,20,8,0.4)] xl:hidden" onClick={() => select(null)} /> : null}
      <div
        ref={paneRef}
        className={
          selected
            ? "hub-pane-drawer max-xl:fixed max-xl:inset-y-0 max-xl:right-0 max-xl:z-30 max-xl:w-full max-xl:max-w-[460px] max-xl:overflow-y-auto xl:sticky xl:top-[var(--pane-top)]"
            : "max-xl:hidden xl:sticky xl:top-[var(--pane-top)]"
        }
        style={{ "--pane-top": `${stickyTop}px` } as React.CSSProperties}
      >
        <div key={selected ? keyOf(selected) : "summary"} className="hub-fade-in">
        {selected ? (
          <div className="bg-white p-6 max-xl:min-h-full xl:rounded-[18px] xl:border" style={{ borderColor: hub.borderCard }}>
            {renderDetail(selected)}
          </div>
        ) : (
          <div className="space-y-4">
            <section className="overflow-hidden rounded-[18px] border-2 bg-white" style={{ borderColor: hub.limeEdge }}>
              <div className="grid grid-cols-2 divide-x" style={{ borderColor: hub.border }}>
                <div className="px-5 py-5" style={{ borderColor: hub.border }}>
                  <p className="text-[36px] font-bold leading-none tracking-[-0.03em]" style={{ ...hubSans, ...hubNumeric, color: hub.text }}>
                    {unreadCount}
                  </p>
                  <p className="mt-2 text-[13px]" style={{ ...hubSans, color: hub.textSubtle }}>
                    непрочитанных
                  </p>
                </div>
                <div className="px-5 py-5" style={{ borderColor: hub.border }}>
                  <p className="text-[36px] font-bold leading-none tracking-[-0.03em]" style={{ ...hubSans, ...hubNumeric, color: attentionCount > 0 ? CRITICAL.pillFg : hub.text }}>
                    {attentionCount}
                  </p>
                  <p className="mt-2 text-[13px]" style={{ ...hubSans, color: hub.textSubtle }}>
                    важных
                  </p>
                </div>
              </div>
              <p className="border-t px-5 py-3 text-[12.5px]" style={{ ...hubSans, borderColor: hub.border, color: hub.textSubtle }}>
                Данные кабинета: <span style={{ color: hub.textMuted }}>{snapshot?.syncedAt ? dateTimeOf(snapshot.syncedAt) : "не загружены"}</span>
              </p>
            </section>

            <SideCard title="За 7 дней">
              {week ? (
                <div className="space-y-4 text-[13.5px]" style={{ ...hubSans, ...hubNumeric, color: hub.textMuted }}>
                  <div>
                    <p>Заказов</p>
                    <p className="mt-0.5">
                      <span className="text-[24px] font-bold tracking-[-0.02em]" style={{ color: hub.text }}>{formatInt(week.orders)}</span>
                      {week.ordersChange != null ? <span className="ml-2 font-semibold" style={{ color: week.ordersChange < 0 ? hub.danger : hub.greenDark }}>{changeText(week.ordersChange)}</span> : null}
                    </p>
                    <p className="text-[12.5px]" style={{ color: hub.textSubtle }}>против {formatInt(week.prevOrders)}</p>
                  </div>
                  <div>
                    <p>На сумму</p>
                    <p className="mt-0.5">
                      <span className="text-[24px] font-bold tracking-[-0.02em]" style={{ color: hub.text }}>{formatRub(week.sum)}</span>
                      {week.sumChange != null ? <span className="ml-2 font-semibold" style={{ color: week.sumChange < 0 ? hub.danger : hub.greenDark }}>{changeText(week.sumChange)}</span> : null}
                    </p>
                    <p className="text-[12.5px]" style={{ color: hub.textSubtle }}>против {formatRub(week.prevSum)}</p>
                  </div>
                </div>
              ) : (
                <p className="text-[13.5px] leading-[1.5]" style={{ ...hubSans, color: hub.textMuted }}>
                  Сравнение появится, когда в базе сохранены 14 законченных дней. Пока их {digests.size}.
                </p>
              )}
            </SideCard>

          </div>
        )}
        </div>
      </div>

      {taskDialog
        ? (() => {
            const ev = flat.flatMap((i) => groupOf(i)).find((e) => e.id === taskDialog);
            return ev ? (
              <TaskDialog key={ev.id} event={ev} busy={taskState[ev.id] === "creating"} error={taskState[ev.id] === "error"} onCreate={(title, text) => createTask(ev.id, { title, description: text })} onClose={() => setTaskDialog(null)} />
            ) : null;
          })()
        : null}

      {listModal ? <BurstModal title={listModal.title} events={listModal.events} photoOf={(e) => (e.itemId ? itemById.get(e.itemId)?.imageUrl : undefined)} onClose={() => setListModal(null)} /> : null}

      {burstModal && flat.find((i) => i.type === "burst" && keyOf(i) === burstModal)
        ? (() => {
            const found = flat.find((i) => i.type === "burst" && keyOf(i) === burstModal);
            return found && found.type === "burst" ? <BurstModal title={found.title} events={found.events} photoOf={(e) => (e.itemId ? itemById.get(e.itemId)?.imageUrl : undefined)} onClose={() => setBurstModal(null)} /> : null;
          })()
        : null}

      {settingsOpen
        ? createPortal(
            <div className="fixed inset-0 z-[200] flex items-end justify-center p-0 sm:items-center sm:p-4">
              <button type="button" aria-label="Закрыть" className="hub-fade-in absolute inset-0 bg-[rgba(1,20,8,0.5)] backdrop-blur-[2px]" onClick={() => setSettingsOpen(false)} />
              <div role="dialog" aria-modal="true" aria-label="Настройки событий" className="hub-pop relative flex h-[min(760px,100%)] w-full max-w-[560px] flex-col overflow-hidden rounded-t-[28px] bg-white shadow-[0_40px_100px_-30px_rgba(1,20,8,0.55)] sm:rounded-[28px]">
                <div className="flex items-center justify-between gap-4 px-7 pb-4 pt-6">
                  <h2 className="text-[22px] font-semibold tracking-[-0.02em]" style={{ ...hubSans, color: hub.text }}>
                    Настройки событий
                  </h2>
                  <button type="button" aria-label="Закрыть" onClick={() => setSettingsOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-full outline-none transition-colors hover:bg-[var(--hub-surface-muted)] focus-visible:shadow-[0_0_0_2px_var(--hub-lime-ring)]" style={{ color: hub.textMuted }}>
                    <X className="h-5 w-5" strokeWidth={1.75} />
                  </button>
                </div>
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain border-t px-7 py-5" style={{ borderColor: hub.border, backgroundColor: hub.canvas }}>
                  <SideCard title="Что показывать">
                    <ul className="space-y-3.5">
                      {coverage.map((row) => (
                        <li key={row.group} className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[14px] font-semibold leading-5" style={{ ...hubSans, color: hub.text }}>
                              {GROUP_LABEL[row.group]}
                            </p>
                            {!row.tracked && row.note ? (
                              <p className="mt-0.5 text-[12.5px] leading-[1.4]" style={{ ...hubSans, color: hub.textSubtle }}>
                                Не отслеживается: {row.note}
                              </p>
                            ) : null}
                          </div>
                          <Switch checked={!muted.has(row.group)} onChange={() => toggleMuted(row.group)} label={`Показывать направление «${GROUP_LABEL[row.group]}» в ленте`} />
                        </li>
                      ))}
                    </ul>
                  </SideCard>

                  <SideCard title="Лента">
                    <ul className="space-y-4">
                      <li className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-[14px] font-semibold" style={{ ...hubSans, color: hub.text }}>Объединять серии</p>
                          <p className="mt-0.5 text-[12.5px] leading-[1.4]" style={{ ...hubSans, color: hub.textSubtle }}>Одинаковые события у многих товаров идут одним уведомлением со списком.</p>
                        </div>
                        <Switch checked={groupBursts} onChange={() => setGroupBursts(!groupBursts)} label="Объединять серии однотипных событий" />
                      </li>
                      <li className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-[14px] font-semibold" style={{ ...hubSans, color: hub.text }}>Прочитанным при открытии</p>
                          <p className="mt-0.5 text-[12.5px] leading-[1.4]" style={{ ...hubSans, color: hub.textSubtle }}>Уведомление отмечается прочитанным, когда вы его открыли.</p>
                        </div>
                        <Switch checked={autoRead} onChange={() => setAutoRead(!autoRead)} label="Отмечать прочитанным при открытии" />
                      </li>
                    </ul>
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4" style={{ borderColor: hub.border }}>
                      <p className="max-w-[28ch] text-[12.5px] leading-[1.4]" style={{ ...hubSans, color: hub.textSubtle }}>
                        Все события за последние 7 дней снова станут непрочитанными. Закреплённые и архив не меняются.
                      </p>
                      <HubButton
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setSeenAt("");
                          updateMarks((m) => ({ ...m, read: [], unread: [] }));
                        }}
                      >
                        Сбросить прочитанное
                      </HubButton>
                    </div>
                  </SideCard>

                  <SideCard title="Чувствительность">
                    <HubSegmented
                      pill
                      value={sensitivity as "low" | "normal" | "high"}
                      options={[
                        { id: "low", label: "Низкая" },
                        { id: "normal", label: "Обычная" },
                        { id: "high", label: "Высокая" },
                      ]}
                      onChange={(id) => setSensitivity(id)}
                      layoutId="events-sensitivity"
                    />
                    <p className="mt-3 text-[12.5px] leading-[1.45]" style={{ ...hubSans, color: hub.textSubtle }}>
                      {sensitivity === "low" ? "Только резкие отклонения: меньше уведомлений." : sensitivity === "high" ? "Видны и небольшие отклонения: уведомлений больше." : "Баланс между пропуском важного и лишним шумом."} Пороги подстраиваются под ваш магазин, изменение действует со следующей синхронизации.
                    </p>
                  </SideCard>

                  <SideCard title="Новости WB">
                    <ul className="space-y-4">
                      <li className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-[14px] font-semibold" style={{ ...hubSans, color: hub.text }}>Общие новости</p>
                          <p className="mt-0.5 text-[12.5px] leading-[1.4]" style={{ ...hubSans, color: hub.textSubtle }}>Показывать и те, что не относятся к вашим категориям и схеме работы.</p>
                        </div>
                        <Switch checked={newsGeneral} onChange={() => setNewsGeneral(!newsGeneral)} label="Показывать и общие новости" />
                      </li>
                      <li className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-[14px] font-semibold" style={{ ...hubSans, color: hub.text }}>Только персональные</p>
                          <p className="mt-0.5 text-[12.5px] leading-[1.4]" style={{ ...hubSans, color: hub.textSubtle }}>Оставить новости, которые WB адресовал именно вашему кабинету.</p>
                        </div>
                        <Switch checked={newsPersonalOnly} onChange={() => setNewsPersonalOnly(!newsPersonalOnly)} label="Только персональные новости" />
                      </li>
                    </ul>
                    {mutedRubrics.size > 0 ? (
                      <div className="mt-4">
                        <p className="text-[12.5px] font-semibold" style={{ ...hubSans, color: hub.textMuted }}>
                          Скрытые рубрики
                        </p>
                        <ul className="mt-2 flex flex-wrap gap-1.5">
                          {[...mutedRubrics].map((r) => (
                            <li key={r}>
                              <button
                                type="button"
                                className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12.5px] outline-none transition-colors hover:bg-[var(--hub-surface-muted)] focus-visible:shadow-[0_0_0_2px_var(--hub-lime-ring)]"
                                style={{ ...hubSans, borderColor: hub.borderStrong, color: hub.textMuted }}
                                onClick={() => setMutedRubricsRaw(serializeRubricList([...mutedRubrics].filter((x) => x !== r)))}
                                aria-label={`Снова показывать рубрику «${r}»`}
                              >
                                {r}
                                <X className="h-3 w-3" strokeWidth={2.25} aria-hidden />
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    <p className="mt-3 text-[12.5px] leading-[1.45]" style={{ ...hubSans, color: newsStatus.state === "error" ? hub.danger : hub.textSubtle }}>
                      {newsStatus.state === "loading" ? "Читаю новости WB…" : newsStatus.state === "idle" ? "" : newsStatus.state === "error" ? `Не удалось прочитать новости: ${newsStatus.text}` : newsStatus.text}
                    </p>
                    <p className="mt-1 text-[12.5px] leading-[1.45]" style={{ ...hubSans, color: hub.textSubtle }}>
                      Тон новости мы определяем по заголовку: это наша оценка, не мнение WB.
                    </p>
                  </SideCard>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

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
