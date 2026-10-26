"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Boxes,
  ChevronLeft,
  ChevronRight,
  Check,
  Copy,
  Download,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { autoRepliesAuthorizedFetch } from "@/lib/auto-replies/auto-replies-fetch";
import {
  listSellerHubWarehouses,
  loadSellerHubFunnel,
  loadSellerHubRealization,
  saveSellerHubCostPrice,
  updateSellerHubPrices,
  updateSellerHubStocks,
} from "@/lib/seller-hub/client-api";
import { appendHubJournal } from "@/lib/seller-hub/journal";
import { claimPriceSubmit, priceJournalEntry, priceWriteView, releasePriceSubmit } from "@/lib/seller-hub/price-write";
import {
  frozenPurchase,
  indexGuide,
  readProduct,
  scoreGrade,
  STOCK_DAY_CAP,
  stockColumn,
  type ProductRead,
  type ProductTone,
  type ReadoutSectionId,
} from "@/lib/seller-hub/product-signal";
import { downloadCatalogSheet, type SheetCell } from "@/lib/seller-hub/catalog-sheet";
import { funnelNeedsReload } from "@/lib/services/wildberries/funnel-parse";
import type { SellerCatalogItem, SellerCatalogSnapshot, SellerFunnelSnapshot, SellerRealizationSnapshot } from "@/lib/seller-hub/types";
import { SELLER_FUNNEL_SNAPSHOT_VERSION } from "@/lib/seller-hub/types";
import {
  formatInt,
  formatRub,
  formatSyncTime,
  hub,
  HubButton,
  HubEmptyState,
  HubInput,
  HubPanel,
  HubSegmented,
  hubNumeric,
  hubSans,
} from "./hub-ui";
import { auditChatText, coverDays } from "./hub-card-audit";
import { writeHubCardSeed } from "@/lib/seller-hub/card-seed";
import { HubProductDrawer } from "./hub-product-drawer";
import { HubProductReadout } from "./hub-product-readout";
import { HubStocks } from "./hub-stocks";

const PAGE_SIZE = 50;

type CatalogFilter =
  | "all"
  | "discounted"
  | "steep-discount"
  | "thin-margin"
  | "below-floor"
  | "no-cost"
  | "no-sales"
  | "out-of-stock"
  | "short-cover"
  | "long-cover"
  | "no-price";

const CATALOG_FILTERS: Array<{ id: CatalogFilter; label: string }> = [
  { id: "all", label: "Все" },
  { id: "discounted", label: "Со скидкой" },
  { id: "steep-discount", label: "Скидка от 20%" },
  { id: "thin-margin", label: "Маржа до 10%" },
  { id: "below-floor", label: "Ниже порога" },
  { id: "no-cost", label: "Без закупки" },
  { id: "no-sales", label: "Без продаж" },
  { id: "out-of-stock", label: "Нет в наличии" },
  { id: "short-cover", label: "Запас до 14 дн." },
  { id: "long-cover", label: "Запас > 180 дн." },
  { id: "no-price", label: "Без цены" },
];

const PRIMARY_FILTERS: CatalogFilter[] = ["all", "discounted", "no-cost", "no-sales", "long-cover"];
type CatalogSort = "updated" | "price-desc" | "price-asc" | "stock-desc" | "stock-asc";

const SORTS: Array<{ id: CatalogSort; label: string }> = [
  { id: "updated", label: "По обновлению" },
  { id: "price-desc", label: "Цена: сначала дорогие" },
  { id: "price-asc", label: "Цена: сначала дешёвые" },
  { id: "stock-desc", label: "Остаток: больше" },
  { id: "stock-asc", label: "Остаток: меньше" },
];

function effectivePrice(item: SellerCatalogItem): number | null {
  return item.discountedPrice ?? item.price ?? null;
}

type CatalogSheetRow = {
  item: SellerCatalogItem;
  signal: ProductRead;
  stockText: string;
  price: number | null;
  discount: number | null;
  sale: number | null;
  cost: number | null;
  stockPieces: number | null;
  fbs: number | null;
};

function passesCatalogFilter(filter: CatalogFilter, item: SellerCatalogItem, signal: ProductRead): boolean {
  const stock = item.totalStock ?? 0;
  switch (filter) {
    case "all":
      return true;
    case "discounted":
      return (item.discountPercent ?? 0) > 0;
    case "steep-discount":
      return (item.discountPercent ?? 0) >= 20;
    case "thin-margin":
      return (
        signal.margin != null &&
        signal.marginGap == null &&
        signal.margin.percent >= 0 &&
        signal.margin.percent <= 10
      );
    case "below-floor":
      return signal.margin != null && signal.marginGap == null && signal.margin.rub < 0;
    case "no-cost":
      return item.costPrice == null;
    case "no-sales":
      return signal.soldQty === 0 && stock > 0;
    case "out-of-stock":
      return item.totalStock === 0;
    case "short-cover":
      return signal.burnDays != null && signal.burnDays <= 14 && stock > 0;
    case "long-cover":
      return signal.burnDays != null && signal.burnDays > STOCK_DAY_CAP;
    case "no-price":
      return effectivePrice(item) == null;
    default: {
      const unexpected: never = filter;
      return unexpected;
    }
  }
}

function marginInk(margin: ProductRead["margin"]): string {
  if (margin == null) return hub.textSubtle;
  if (margin.percent <= 10) return hub.danger;
  return hub.green;
}

function downloadCatalogCsv(rows: CatalogSheetRow[], marketplaceId: string) {
  const header = [
    "Название",
    "Индекс SKU",
    "Контент",
    "Запас",
    "Зависший капитал",
    "Артикул",
    "Цена",
    "Скидка %",
    "Со скидкой",
    "Себестоимость",
    "Маржа на 1 продажу %",
    "Маржа на 1 продажу ₽",
    "Продано, 28 дн.",
    "К прошлым 28 дням",
    "Рейтинг отзывов",
    "Отзывов за 180 дн.",
    "Без ответа",
    "Негатив без ответа",
    "Вопросы без ответа",
    "Остаток",
    "Статус",
    "nmID",
    "Бренд",
    "Категория",
    "Штрихкод",
    "FBO",
    "FBS",
    "Описание",
  ];
  const textColumns = [0, 1, 3, 5, 13, 20, 21, 22, 23, 24, 27];
  const body: SheetCell[][] = rows.map(({ item, signal, stockText, price, discount, sale, cost, stockPieces, fbs }) => {
    const soldMove = signal.soldDelta
      ? [signal.soldDelta.mark, signal.soldDelta.caption].filter(Boolean).join(" ")
      : "";
    const line: SheetCell[] = [
      item.title,
      signal.index == null ? "" : `${scoreGrade(signal.index)} ${signal.index}`,
      signal.cardScore ?? "",
      stockText,
      signal.excessRub != null && signal.excessRub > 0 ? Math.round(signal.excessRub) : "",
      item.vendorCode,
      price,
      discount,
      sale,
      cost,
      signal.margin != null ? Math.round(signal.margin.percent * 10) / 10 : "",
      signal.margin != null ? Math.round(signal.margin.rub) : "",
      signal.soldQty ?? "",
      soldMove,
      signal.reviewRatingAvg ?? "",
      signal.reviewCount180 ?? "",
      signal.unansweredReviews ?? "",
      signal.unansweredNegativeReviews ?? "",
      signal.unansweredQuestions ?? "",
      stockPieces,
      signal.label,
      item.externalId,
      item.brand ?? "",
      item.category ?? "",
      item.barcode ?? "",
      item.stockFbo ?? "",
      fbs,
      item.description ?? "",
    ];
    return line;
  });
  downloadCatalogSheet(
    header,
    body,
    textColumns,
    `karto-${marketplaceId}-catalog-${new Date().toISOString().slice(0, 10)}.xls`,
  );
}

function wbPhoto(url: string | undefined, size: "card" | "full"): string | undefined {
  if (!url) return undefined;
  const card = "/images/c246x328/";
  const full = "/images/c516x688/";
  const next = size === "full" ? full : card;
  return url.replace("/images/tm/", next).replace("/images/c246x328/", size === "full" ? full : card);
}

function FilterChip({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-[11px] border bg-white px-3.5 text-[13px] outline-none transition hover:bg-[#F4F6F8] focus-visible:ring-2 focus-visible:ring-[#1F4E3D]"
      style={{
        ...hubSans,
        borderColor: active ? hub.ink : hub.border,
        borderWidth: active ? 2 : 1,
        color: active ? hub.ink : hub.textMuted,
        fontWeight: active ? 600 : 500,
      }}
    >
      {label}
      <span className="tabular-nums" style={{ ...hubNumeric, color: active ? hub.ink : hub.textSubtle }}>
        {formatInt(count)}
      </span>
    </button>
  );
}

function KpiFilters({
  filter,
  counts,
  onChange,
}: {
  filter: CatalogFilter;
  counts: Record<CatalogFilter, number>;
  onChange: (id: CatalogFilter) => void;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);
  const primary = CATALOG_FILTERS.filter((option) => PRIMARY_FILTERS.includes(option.id));
  const more = CATALOG_FILTERS.filter(
    (option) => !PRIMARY_FILTERS.includes(option.id) && (counts[option.id] > 0 || filter === option.id),
  );
  const moreActive = more.some((option) => option.id === filter);
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Фильтры товаров">
      {primary.map((option) => (
        <FilterChip
          key={option.id}
          active={filter === option.id}
          label={option.label}
          count={counts[option.id]}
          onClick={() => onChange(option.id)}
        />
      ))}
      {more.length > 0 ? (
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
            className="inline-flex min-h-[40px] items-center rounded-[11px] border bg-white px-3.5 text-[13px] font-semibold outline-none hover:bg-[#F4F6F8] focus-visible:ring-2 focus-visible:ring-[#1F4E3D]"
            style={{
              ...hubSans,
              borderColor: moreActive ? hub.ink : hub.border,
              borderWidth: moreActive ? 2 : 1,
              color: hub.ink,
            }}
          >
            + Фильтры
          </button>
          {open ? (
            <div
              className="absolute left-0 z-20 mt-1 min-w-[220px] rounded-[12px] border bg-white p-1.5 shadow-[0_8px_24px_rgba(14,17,22,0.08)]"
              style={{ borderColor: hub.border }}
            >
              {more.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => {
                    onChange(option.id);
                    setOpen(false);
                  }}
                  className="flex w-full items-center justify-between rounded-[8px] px-3 py-2 text-left text-[13px] outline-none hover:bg-[#F4F6F8]"
                  style={{ ...hubSans, color: filter === option.id ? hub.ink : hub.text, fontWeight: filter === option.id ? 600 : 500 }}
                >
                  {option.label}
                  <span className="tabular-nums" style={{ ...hubNumeric, color: hub.textMuted }}>
                    {formatInt(counts[option.id])}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function CopyArticle({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      aria-label="Скопировать артикул"
      className={`ml-1 inline-flex rounded-[4px] p-0.5 align-middle transition-opacity hover:bg-black/[0.05] focus-visible:opacity-100 ${
        done ? "opacity-100" : "opacity-0 group-hover:opacity-100"
      }`}
      onClick={(event) => {
        event.stopPropagation();
        void navigator.clipboard.writeText(text).then(() => {
          setDone(true);
          window.setTimeout(() => setDone(false), 1400);
        });
      }}
    >
      {done ? (
        <Check className="h-3.5 w-3.5" style={{ color: hub.green }} />
      ) : (
        <Copy className="h-3.5 w-3.5" style={{ color: hub.textSubtle }} />
      )}
    </button>
  );
}

function ProductCell({ item, onPreview }: { item: SellerCatalogItem; onPreview: (src: string) => void }) {
  const src = wbPhoto(item.imageUrl, "card");
  return (
    <div className="flex min-w-[280px] items-center gap-3.5">
      <button
        type="button"
        className="relative flex h-[75px] w-[56px] shrink-0 items-center justify-center overflow-hidden bg-[#F4F6F8] outline-none focus-visible:ring-2 focus-visible:ring-[#1F4E3D]"
        style={{ boxShadow: `inset 0 0 0 1px ${hub.border}` }}
        onClick={(event) => {
          event.stopPropagation();
          const full = wbPhoto(item.imageUrl, "full");
          if (full) onPreview(full);
        }}
        aria-label={`Открыть фото: ${item.title}`}
      >
        {src ? (
          <img src={src} alt="" className="max-h-full max-w-full object-contain" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-[11px]" style={{ color: hub.textSubtle }}>
            нет фото
          </span>
        )}
      </button>
      <div className="min-w-0">
        <p className="line-clamp-2 text-[15.5px] font-semibold leading-snug" style={{ color: hub.text }} title={item.title}>
          {item.title}
        </p>
        <p className="mt-1 truncate text-[12px]" style={{ color: hub.textMuted }}>
          {[item.brand, item.category].filter(Boolean).join(" · ") || "—"}
        </p>
      </div>
    </div>
  );
}

type RowDraft = { price: string; discount: string; cost: string; fbs: string };

function parseDraftNumber(raw: string): number | null {
  const trimmed = raw.trim().replace(/\s/g, "").replace(",", ".");
  if (!trimmed) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

function saleFromDraft(item: SellerCatalogItem, draft: RowDraft | undefined): number | null {
  if (!draft) return item.discountedPrice ?? item.price ?? null;
  const price = parseDraftNumber(draft.price);
  const discount = parseDraftNumber(draft.discount) ?? 0;
  if (price == null) return null;
  return Math.round(price * (1 - discount / 100));
}

const CLICK_FRAME =
  "inline-flex cursor-pointer items-center rounded-lg border-2 shadow-[0_1px_2px_rgba(14,17,22,0.06)] outline-none transition duration-200 hover:shadow-[0_4px_12px_rgba(14,17,22,0.1)] active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-[#1F4E3D] focus-visible:ring-offset-2";

function scorePaint(score: number): { pill: string; dot: string; number: string } {
  if (score >= 80) {
    return {
      pill: "border-emerald-500 bg-white text-emerald-800 hover:bg-emerald-50",
      dot: "bg-emerald-500",
      number: "text-emerald-800",
    };
  }
  if (score >= 60) {
    return {
      pill: "border-slate-300 bg-slate-100 text-slate-600 hover:border-slate-400 hover:bg-slate-200",
      dot: "bg-slate-400",
      number: "text-slate-600",
    };
  }
  if (score >= 40) {
    return {
      pill: "border-sky-500 bg-white text-sky-700 hover:bg-sky-50",
      dot: "bg-sky-500",
      number: "text-sky-700",
    };
  }
  return {
    pill: "border-red-500 bg-red-50 text-red-600 hover:border-red-600 hover:bg-red-100",
    dot: "bg-red-500",
    number: "text-red-600",
  };
}

function GradeBadge({
  score,
  label,
  onClick,
  empty,
}: {
  score: number | null;
  label: string;
  onClick: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  empty?: string;
}) {
  if (score == null) {
    return (
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        className={`${CLICK_FRAME} border-dashed border-slate-300 bg-white px-2.5 py-1 text-[14px] font-semibold text-slate-400 hover:border-slate-400 hover:bg-slate-50`}
      >
        {empty ?? "—"}
      </button>
    );
  }
  const letter = scoreGrade(score);
  const mark = scorePaint(score);
  return (
    <button
      type="button"
      aria-label={`${label}: ${letter} ${score}`}
      onClick={onClick}
      className={`${CLICK_FRAME} gap-1.5 px-2.5 py-1 text-[14px] font-semibold tabular-nums ${mark.pill}`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${mark.dot}`} aria-hidden />
      <span>{letter}</span>
      <span>{score}</span>
    </button>
  );
}

function contentScoreFrame(score: number): { frame: string; number: string } {
  const paint = scorePaint(score);
  return { frame: paint.pill, number: paint.number };
}

function ContentScore({
  score,
  parts,
  label,
  onClick,
}: {
  score: number | null;
  parts: { media: number; filters: number; copy: number } | null;
  label: string;
  onClick: (event: ReactMouseEvent<HTMLButtonElement>) => void;
}) {
  if (score == null || parts == null) {
    return (
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        className={`${CLICK_FRAME} border-dashed border-slate-300 bg-white px-2.5 py-1 text-[14px] font-semibold text-slate-400 hover:border-slate-400 hover:bg-slate-50`}
      >
        —
      </button>
    );
  }
  const hint = `Медиа: ${parts.media}/40, Характеристики: ${parts.filters}/35, Текст: ${parts.copy}/25`;
  const look = contentScoreFrame(score);
  return (
    <button
      type="button"
      aria-label={`${label}: ${score} из 100. ${hint}`}
      title={hint}
      onClick={onClick}
      className={`${CLICK_FRAME} items-baseline gap-1 px-2.5 py-1 ${look.frame}`}
    >
      <span className={`text-[16px] font-semibold tabular-nums leading-none ${look.number}`}>{score}</span>
      <span className="text-[11px] font-medium text-slate-400">/ 100</span>
    </button>
  );
}

function StockCover({
  pieces,
  cover,
  label,
  draft,
  fbo,
  vendorCode,
  onFbs,
  onOpen,
}: {
  pieces: number | null;
  cover: { text: string; tone: ProductTone };
  label: string;
  draft: RowDraft | undefined;
  fbo: number | null;
  vendorCode: string;
  onFbs: (value: string) => void;
  onOpen: (event: ReactMouseEvent<HTMLButtonElement>) => void;
}) {
  const look = chipStyle(cover.tone);
  return (
    <div
      className="flex flex-col items-start gap-1.5"
      onClick={draft ? (event) => event.stopPropagation() : undefined}
    >
      {draft ? (
        <span className="inline-flex items-center gap-2">
          <EditField
            value={draft.fbs}
            label={`Остаток FBS ${vendorCode}`}
            onChange={onFbs}
          />
          {fbo != null ? (
            <span className="text-[12px] font-medium" style={{ ...hubSans, color: hub.textMuted }}>
              FBO {formatInt(fbo)}
            </span>
          ) : null}
        </span>
      ) : (
        <span className="text-[17px] font-semibold leading-none" style={{ ...hubSans, ...hubNumeric, color: hub.text }}>
          {pieces != null ? `${formatInt(pieces)} шт` : "—"}
        </span>
      )}
      <button
        type="button"
        aria-label={label}
        onClick={onOpen}
        className="inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-semibold leading-none outline-none focus-visible:ring-2 focus-visible:ring-[#1F4E3D]"
        style={{ ...hubSans, ...hubNumeric, backgroundColor: look.backgroundColor, color: look.color }}
      >
        {cover.text}
      </button>
    </div>
  );
}

function MetricButton({
  children,
  label,
  tone,
  onClick,
}: {
  children: ReactNode;
  label: string;
  tone?: "danger" | "ok" | "warn" | "muted";
  onClick: (event: ReactMouseEvent<HTMLButtonElement>) => void;
}) {
  const color =
    tone === "danger" ? hub.danger : tone === "ok" ? hub.green : tone === "warn" ? hub.warn : tone === "muted" ? hub.textMuted : hub.text;
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="rounded-[4px] text-left text-[15px] font-semibold underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[#1F4E3D]"
      style={{ ...hubSans, ...hubNumeric, color }}
    >
      {children}
    </button>
  );
}

function TrendMark({
  direction,
  mark,
  tone,
}: {
  direction: "up" | "down";
  mark: string;
  tone: "ok" | "danger";
}) {
  const Icon = direction === "up" ? ArrowUp : ArrowDown;
  return (
    <span
      className="inline-flex items-center gap-0.5 text-[12px] font-semibold leading-none"
      style={{ color: tone === "ok" ? hub.green : hub.danger }}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={2.6} aria-hidden />
      {mark ? <span className="tabular-nums">{mark}</span> : null}
    </span>
  );
}

function chipStyle(tone: ProductTone): { backgroundColor: string; color: string; borderColor: string } {
  switch (tone) {
    case "ok":
      return { backgroundColor: hub.greenSoft, color: hub.green, borderColor: "rgba(31,78,61,0.35)" };
    case "warn":
      return { backgroundColor: hub.warnSoft, color: hub.warn, borderColor: "rgba(194,65,12,0.32)" };
    case "danger":
      return { backgroundColor: hub.dangerSoft, color: hub.danger, borderColor: "rgba(194,65,59,0.32)" };
    case "muted":
      return { backgroundColor: hub.surfaceMuted, color: hub.textMuted, borderColor: hub.border };
    default: {
      const unexpected: never = tone;
      return unexpected;
    }
  }
}

function StatusChip({
  tone,
  label,
  onClick,
}: {
  tone: ProductTone;
  label: string;
  onClick: (event: ReactMouseEvent<HTMLButtonElement>) => void;
}) {
  const look = chipStyle(tone);
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-semibold leading-none outline-none transition duration-200 hover:shadow-[0_2px_6px_rgba(14,17,22,0.08)] active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-[#1F4E3D] focus-visible:ring-offset-1"
      style={{ ...hubSans, ...look }}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: look.color }} aria-hidden />
      {label}
    </button>
  );
}

const TABLE_COLUMNS: Array<{ label: string; align: string; focus?: ReadoutSectionId; pad?: string }> = [
  { label: "Товар", align: "text-left" },
  { label: "Индекс SKU", align: "text-left", focus: "index", pad: "pl-4 pr-8" },
  { label: "Контент", align: "text-left", focus: "card", pad: "pl-8 pr-8" },
  { label: "Остаток / Запас", align: "text-left", focus: "stock", pad: "pl-8 pr-7" },
  { label: "Зависший капитал", align: "text-left", focus: "capital", pad: "pl-7 pr-5" },
  { label: "Артикул", align: "text-left" },
  { label: "Цена", align: "text-left" },
  { label: "Скидка %", align: "text-left" },
  { label: "Со скидкой", align: "text-left" },
  { label: "Себестоимость", align: "text-left" },
  { label: "Маржа на 1 продажу", align: "text-left", focus: "margin" },
  { label: "Продано, 28 дн.", align: "text-left" },
  { label: "Рейтинг отзывов", align: "text-left" },
  { label: "Без ответа", align: "text-left" },
  { label: "Вопросы", align: "text-left" },
  { label: "Статус", align: "text-left", focus: "status" },
  { label: "Действия", align: "text-right" },
];

function EditField({ value, label, onChange }: { value: string; label: string; onChange: (value: string) => void }) {
  return (
    <input
      value={value}
      aria-label={label}
      inputMode="decimal"
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => onChange(event.target.value)}
      className="w-[6.5rem] rounded-[4px] border bg-white px-2 py-1 text-[14px] font-semibold outline-none"
      style={{ ...hubSans, ...hubNumeric, borderColor: hub.ink, color: hub.text }}
    />
  );
}

export function HubCatalog({
  snapshot,
  marketplaceId,
  syncing,
  onSync,
  canSync,
  onOpenIntegration,
  onAsk,
  onOpenPrices,
  view = "matrix",
  onViewChange,
  connected,
  onItemsUpdate,
  onRealization,
  onFunnel,
}: {
  snapshot?: SellerCatalogSnapshot;
  marketplaceId: string;
  syncing: boolean;
  onSync: () => void;
  canSync: boolean;
  onOpenIntegration: () => void;
  onAsk?: (prompt: string) => void;
  onOpenPrices?: (itemId: string) => void;
  view?: "matrix" | "stocks";
  onViewChange?: (view: "matrix" | "stocks") => void;
  connected?: boolean;
  onItemsUpdate?: (items: SellerCatalogItem[]) => void;
  onRealization?: (realization: SellerRealizationSnapshot) => void;
  onFunnel?: (funnel: SellerFunnelSnapshot) => void;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<CatalogFilter>("all");
  const [sort, setSort] = useState<CatalogSort>("updated");
  const [page, setPage] = useState(0);
  const [preview, setPreview] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<SellerCatalogItem | null>(null);
  const [tableEdit, setTableEdit] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  const [editNote, setEditNote] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [leaveAction, setLeaveAction] = useState<(() => void) | null>(null);
  const [realizationAttempt, setRealizationAttempt] = useState(0);
  const [funnelAttempt, setFunnelAttempt] = useState(0);
  const [showSitting, setShowSitting] = useState(false);
  const [costEdit, setCostEdit] = useState<{ id: string; value: string } | null>(null);
  const [costSaving, setCostSaving] = useState(false);
  const [brief, setBrief] = useState<
    { kind: "product"; itemId: string; focus: ReadoutSectionId } | { kind: "guide"; focus: ReadoutSectionId } | null
  >(null);
  const [marginLoading, setMarginLoading] = useState(false);
  const [funnelLoading, setFunnelLoading] = useState(false);
  const catalogRootRef = useRef<HTMLDivElement | null>(null);
  const costLockRef = useRef(false);
  const priceLockRef = useRef(false);
  const skipOutsideRef = useRef(0);
  const mountedRef = useRef(true);
  const fetchedRealizationAttempt = useRef(-1);
  const fetchedFunnelAttempt = useRef(-1);
  const periodDays = snapshot?.analytics?.daily.length ?? 0;
  const ordersByNm = useMemo(() => {
    const map = new Map<number, number>();
    for (const order of snapshot?.orders?.orders ?? []) {
      if (order.nmId == null) continue;
      map.set(order.nmId, (map.get(order.nmId) ?? 0) + 1);
    }
    return map;
  }, [snapshot?.orders?.orders]);

  const items = useMemo(() => snapshot?.items ?? [], [snapshot]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!connected || !onRealization || items.length === 0) return;
    const realization = snapshot?.realization;
    const fresh = Boolean(realization?.loadedAt && !realization.error && (realization.version ?? 0) >= 3);
    if (fetchedRealizationAttempt.current === realizationAttempt && (fresh || Boolean(realization?.error))) return;
    if (fresh && realizationAttempt === 0) {
      fetchedRealizationAttempt.current = 0;
      return;
    }
    if (realization?.error && realizationAttempt === 0) {
      fetchedRealizationAttempt.current = 0;
      return;
    }
    if (fetchedRealizationAttempt.current === realizationAttempt) return;
    fetchedRealizationAttempt.current = realizationAttempt;
    setMarginLoading(true);
    void loadSellerHubRealization().then((result) => {
      if (!mountedRef.current) return;
      setMarginLoading(false);
      if (result.realization) {
        onRealization(result.realization);
        return;
      }
      if (!result.error) return;
      onRealization({
        loadedAt: new Date().toISOString(),
        dateFrom: "",
        dateTo: "",
        accountRetail: 0,
        accountNet: 0,
        byNm: {},
        error: result.error,
      });
    });
  }, [
    connected,
    items.length,
    onRealization,
    realizationAttempt,
    snapshot?.realization?.error,
    snapshot?.realization?.loadedAt,
    snapshot?.realization?.version,
  ]);

  useEffect(() => {
    if (!connected || !onFunnel || items.length === 0) return;
    const funnel = snapshot?.funnel;
    const fresh = !funnelNeedsReload(funnel, snapshot?.syncedAt);
    if (fetchedFunnelAttempt.current === funnelAttempt && (fresh || Boolean(funnel?.error))) return;
    if (fresh && funnelAttempt === 0) {
      fetchedFunnelAttempt.current = 0;
      return;
    }
    if (funnel?.error && funnelAttempt === 0 && (funnel.version ?? 0) >= SELLER_FUNNEL_SNAPSHOT_VERSION) {
      fetchedFunnelAttempt.current = 0;
      return;
    }
    if (fetchedFunnelAttempt.current === funnelAttempt) return;
    fetchedFunnelAttempt.current = funnelAttempt;
    setFunnelLoading(true);
    void loadSellerHubFunnel().then((result) => {
      if (!mountedRef.current) return;
      setFunnelLoading(false);
      if (result.funnel) {
        onFunnel(result.funnel);
        return;
      }
      if (!result.error) return;
      onFunnel({
        loadedAt: new Date().toISOString(),
        version: SELLER_FUNNEL_SNAPSHOT_VERSION,
        dateFrom: "",
        dateTo: "",
        status: "error",
        byNm: {},
        error: result.error,
      });
    });
  }, [
    connected,
    items.length,
    onFunnel,
    funnelAttempt,
    snapshot?.funnel?.error,
    snapshot?.funnel?.loadedAt,
    snapshot?.funnel?.version,
    snapshot?.syncedAt,
  ]);

  const resetKey = `${marketplaceId}:${items.length}`;
  const [lastResetKey, setLastResetKey] = useState(resetKey);
  if (resetKey !== lastResetKey) {
    setLastResetKey(resetKey);
    setPage(0);
  }

  const savedSignals = useMemo(() => {
    const map = new Map<string, ProductRead>();
    const realization = snapshot?.realization ?? null;
    const funnel = snapshot?.funnel ?? null;
    for (const item of items) {
      map.set(
        item.id,
        readProduct({
          sale: item.discountedPrice ?? item.price ?? null,
          cost: item.costPrice ?? null,
          stock: item.totalStock ?? null,
          days: coverDays(item, ordersByNm, periodDays),
          periodDays,
          externalId: item.externalId,
          promotionIds: item.promotionIds,
          photos: item.imageUrls?.length ?? (item.imageUrl ? 1 : 0),
          hasVideo: Boolean(item.videoUrl),
          description: item.description ?? null,
          characteristicNames: item.characteristicNames ?? null,
          categoryCharcNames: item.categoryCharcNames ?? null,
          categoryCharcRequiredNames: item.categoryCharcRequiredNames ?? null,
          dimensions: item.dimensions ?? null,
          realization,
          paidStorage: snapshot?.paidStorage ?? null,
          loading: marginLoading,
          stockFbo: item.stockFbo ?? null,
          stockFbs: item.stockFbs ?? null,
          createdAt: item.createdAt ?? null,
          funnel,
          funnelLoading,
          promotions: snapshot?.promotions,
          promotionEntryTerms: snapshot?.promotionEntryTerms,
          activeAdCampaigns: snapshot?.ads ? snapshot.ads.activeCount : null,
          feedbacks: snapshot?.feedbacks,
        }),
      );
    }
    return map;
  }, [items, ordersByNm, periodDays, snapshot, marginLoading, funnelLoading]);

  const filterCounts = useMemo(() => {
    const counts = Object.fromEntries(CATALOG_FILTERS.map((option) => [option.id, 0])) as Record<CatalogFilter, number>;
    counts.all = items.length;
    for (const item of items) {
      const signal = savedSignals.get(item.id);
      if (!signal) continue;
      for (const option of CATALOG_FILTERS) {
        if (option.id === "all") continue;
        if (passesCatalogFilter(option.id, item, signal)) counts[option.id] += 1;
      }
    }
    return counts;
  }, [items, savedSignals]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();

    let rows = items.filter((item) => {
      if (q) {
        const haystack = `${item.title} ${item.vendorCode} ${item.externalId} ${item.brand ?? ""} ${item.barcode ?? ""}`;
        if (!haystack.toLowerCase().includes(q)) return false;
      }
      const signal = savedSignals.get(item.id);
      if (!signal || !passesCatalogFilter(filter, item, signal)) return false;
      if (showSitting && (signal.excessRub == null || signal.excessRub <= 0)) return false;
      return true;
    });

    rows = [...rows].sort((a, b) => {
      switch (sort) {
        case "price-desc":
          return (effectivePrice(b) ?? -1) - (effectivePrice(a) ?? -1);
        case "price-asc":
          return (effectivePrice(a) ?? Number.MAX_SAFE_INTEGER) - (effectivePrice(b) ?? Number.MAX_SAFE_INTEGER);
        case "stock-desc":
          return (b.totalStock ?? -1) - (a.totalStock ?? -1);
        case "stock-asc":
          return (a.totalStock ?? Number.MAX_SAFE_INTEGER) - (b.totalStock ?? Number.MAX_SAFE_INTEGER);
        case "updated":
        default:
          return (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "");
      }
    });

    return rows;
  }, [items, search, filter, showSitting, savedSignals, sort]);

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = visible.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const isDirty = tableEdit && items.some((item) => {
    const draft = drafts[item.id];
    if (!draft) return false;
    const samePrice = (parseDraftNumber(draft.price) ?? null) === (item.price != null ? Math.round(item.price) : null);
    const sameDiscount = (parseDraftNumber(draft.discount) ?? null) === (item.discountPercent ?? null);
    const sameCost = (parseDraftNumber(draft.cost) ?? null) === (item.costPrice ?? null);
    const sameFbs = (parseDraftNumber(draft.fbs) ?? null) === (item.stockFbs ?? null);
    return !samePrice || !sameDiscount || !sameCost || !sameFbs;
  });

  function beginEdit() {
    const next: Record<string, RowDraft> = {};
    for (const item of items) {
      next[item.id] = {
        price: item.price != null ? String(Math.round(item.price)) : "",
        discount: item.discountPercent != null ? String(item.discountPercent) : "",
        cost: item.costPrice != null ? String(item.costPrice) : "",
        fbs: item.stockFbs != null ? String(item.stockFbs) : "",
      };
    }
    setDrafts(next);
    setEditNote(null);
    setTableEdit(true);
  }

  function discardEdit() {
    setTableEdit(false);
    setDrafts({});
    setEditNote(null);
  }

  function patchDraft(id: string, key: keyof RowDraft, value: string) {
    setDrafts((current) => {
      const prev = current[id];
      if (!prev) return current;
      return { ...current, [id]: { ...prev, [key]: value } };
    });
  }

  async function saveEdits(): Promise<boolean> {
    if (!isDirty) {
      discardEdit();
      return true;
    }
    if (!claimPriceSubmit(priceLockRef)) return false;
    setSavingEdit(true);
    setEditNote(null);
    const notes: string[] = [];
    const problems: string[] = [];
    const priceUpdates: { nmId: number; price?: number; discount?: number; expected?: { price: number | null; discount: number | null } }[] = [];
    const priceJournalRows: Array<{ nmId: number; beforePrice?: number | null; beforeDiscount?: number | null; price?: number; discount?: number }> = [];
    const fbsUpdates: { nmId: number; amount: number }[] = [];
    const priceTouched = new Set<string>();
    const fbsTouched = new Set<string>();

    for (const item of items) {
      const draft = drafts[item.id];
      if (!draft) continue;
      const price = parseDraftNumber(draft.price);
      const discount = parseDraftNumber(draft.discount);
      const fbs = parseDraftNumber(draft.fbs);
      const prevPrice = item.price != null ? Math.round(item.price) : null;
      const prevDiscount = item.discountPercent ?? null;
      const prevFbs = item.stockFbs ?? null;
      const priceChanged = price !== prevPrice || discount !== prevDiscount;
      const fbsChanged = fbs !== prevFbs;
      const nmId = Number(item.externalId);
      if (priceChanged) {
        if (!Number.isFinite(nmId) || price == null) {
          problems.push(`${item.vendorCode}: в цене нет числа, в кабинет не отправляю.`);
        } else {
          priceUpdates.push({
            nmId,
            price: Math.round(price),
            discount: Math.round(discount ?? 0),
            expected: { price: prevPrice, discount: prevDiscount },
          });
          priceJournalRows.push({
            nmId,
            beforePrice: prevPrice,
            beforeDiscount: prevDiscount,
            price: Math.round(price),
            discount: Math.round(discount ?? 0),
          });
          priceTouched.add(item.id);
        }
      }
      if (fbsChanged) {
        if (!Number.isFinite(nmId) || fbs == null) {
          problems.push(`${item.vendorCode}: в остатке FBS нет числа, на склад не отправляю.`);
        } else {
          fbsUpdates.push({ nmId, amount: Math.round(fbs) });
          fbsTouched.add(item.id);
        }
      }
    }

    if (problems.length > 0) {
      setEditNote(problems.join(" "));
      releasePriceSubmit(priceLockRef);
      setSavingEdit(false);
      return false;
    }

    let priceConfirmed = priceUpdates.length === 0;
    try {
      if (priceUpdates.length > 0) {
        if (!connected) {
          setEditNote("Цену не отправил: кабинет не подключён.");
          return false;
        }
        const result = await updateSellerHubPrices({ updates: priceUpdates });
        const view = priceWriteView({
          outcome: result.outcome,
          uploadId: result.uploadId,
          error: result.error,
          read: result.verified ? "match" : result.outcome === "processed" ? "unread" : undefined,
        });
        notes.push(result.message);
        appendHubJournal(priceJournalEntry({ rows: priceJournalRows, view: { ...view, text: result.message } }));
        priceConfirmed = view.applyLocal;
        if (result.outcome === "failed" || result.outcome === "rejected") {
          setEditNote(notes.join(" "));
          return false;
        }
      }

      let fbsApplied = fbsUpdates.length === 0;
      if (fbsUpdates.length > 0) {
        if (!connected) {
          notes.push("Остаток FBS не отправил: кабинет не подключён.");
        } else {
          const warehouses = await listSellerHubWarehouses();
          const list = warehouses.warehouses ?? [];
          if (!warehouses.ok || list.length !== 1) {
            notes.push("Складов FBS не один. Остаток не отправил, чтобы не угадывать склад.");
          } else {
            const result = await updateSellerHubStocks({
        warehouseId: list[0]?.id,
              updates: fbsUpdates,
            });
            if (result.ok) {
              fbsApplied = true;
              notes.push("WB принял остаток FBS.");
            } else {
              notes.push(result.error ?? "Остаток FBS не ушёл.");
            }
          }
        }
      }

      onItemsUpdate?.(
        items.map((item) => {
          const draft = drafts[item.id];
          if (!draft) return item;
          const price = parseDraftNumber(draft.price);
          const discount = parseDraftNumber(draft.discount);
          const fbs = parseDraftNumber(draft.fbs);
          const applyPrice = priceConfirmed && priceTouched.has(item.id);
          const applyFbs = fbsApplied && fbsTouched.has(item.id);
          return {
            ...item,
            price: applyPrice ? price : item.price,
            discountPercent: applyPrice ? discount : item.discountPercent,
            discountedPrice:
              applyPrice && price != null ? Math.round(price * (1 - (discount ?? 0) / 100)) : item.discountedPrice,
            costPrice: parseDraftNumber(draft.cost),
            stockFbs: applyFbs ? fbs : item.stockFbs,
            totalStock: applyFbs
              ? item.stockFbo != null || fbs != null
                ? (item.stockFbo ?? 0) + (fbs ?? 0)
                : item.totalStock
              : item.totalStock,
          };
        }),
      );

      setEditNote(notes.length > 0 ? notes.join(" ") : null);
      if (!fbsApplied || !priceConfirmed) return false;
      setTableEdit(false);
      setDrafts({});
      return true;
    } finally {
      releasePriceSubmit(priceLockRef);
      setSavingEdit(false);
    }
  }

  async function saveRowMoney(
    item: SellerCatalogItem,
    next: { price: string; discount: string; cost: string },
  ): Promise<string | null> {
    if (tableEdit && isDirty) return "Сначала сохраните или отмените правку таблицы.";
    const price = parseDraftNumber(next.price);
    const discount = parseDraftNumber(next.discount);
    const cost = parseDraftNumber(next.cost);
    const prevPrice = item.price != null ? Math.round(item.price) : null;
    const prevDiscount = item.discountPercent ?? null;
    const priceChanged = price !== prevPrice || (discount ?? null) !== prevDiscount;
    const costChanged = cost !== (item.costPrice ?? null);
    if (!priceChanged && !costChanged) return null;
    if (!claimPriceSubmit(priceLockRef)) return "Цена уже отправляется.";
    try {
      let priceConfirmed = !priceChanged;
      let priceMessage = "";
      if (priceChanged) {
        const nmId = Number(item.externalId);
        if (!Number.isFinite(nmId) || price == null) return "В цене нет числа.";
        if (!connected) {
          priceMessage = "Цену не отправил: кабинет не подключён.";
          priceConfirmed = false;
        } else {
          const result = await updateSellerHubPrices({
            updates: [{ nmId, price: Math.round(price), discount: Math.round(discount ?? 0), expected: { price: prevPrice, discount: prevDiscount } }],
          });
          const view = priceWriteView({
            outcome: result.outcome,
            uploadId: result.uploadId,
            error: result.error,
            read: result.verified ? "match" : result.outcome === "processed" ? "unread" : undefined,
          });
          priceMessage = result.message;
          priceConfirmed = view.applyLocal;
          appendHubJournal(priceJournalEntry({
            rows: [{ nmId, beforePrice: prevPrice, beforeDiscount: prevDiscount, price: Math.round(price), discount: Math.round(discount ?? 0) }],
            view: { ...view, text: result.message },
          }));
        }
      }
      onItemsUpdate?.(
        items.map((row) => {
          if (row.id !== item.id) return row;
          return {
            ...row,
            price: priceConfirmed && price != null ? Math.round(price) : row.price,
            discountPercent: priceConfirmed ? Math.round(discount ?? 0) : row.discountPercent,
            discountedPrice:
              priceConfirmed && price != null ? Math.round(price * (1 - (discount ?? 0) / 100)) : row.discountedPrice,
            costPrice: cost,
          };
        }),
      );
      if (costChanged && cost != null) {
        void saveSellerHubCostPrice({
          marketplaceId: item.marketplaceId,
          nmId: item.externalId,
          costPrice: cost,
        });
      }
      if (priceChanged && !priceConfirmed) return costChanged ? `${priceMessage} Закупка сохранена.` : priceMessage;
      if (priceChanged && costChanged) return `${priceMessage} Закупка сохранена.`;
      if (priceChanged) return priceMessage;
      return "Закупка сохранена.";
    } finally {
      releasePriceSubmit(priceLockRef);
    }
  }

  function releaseCostLock() {
    window.setTimeout(() => {
      costLockRef.current = false;
    }, 0);
  }

  async function saveCostInline(item: SellerCatalogItem) {
    if (costLockRef.current || !costEdit || costEdit.id !== item.id) return;
    costLockRef.current = true;
    const cost = parseDraftNumber(costEdit.value);
    if (cost == null || cost < 0) {
      setCostEdit(null);
      releaseCostLock();
      return;
    }
    setCostSaving(true);
    const note = await saveRowMoney(item, {
      price: item.price != null ? String(Math.round(item.price)) : "",
      discount: item.discountPercent != null ? String(item.discountPercent) : "",
      cost: String(cost),
    });
    setCostSaving(false);
    setCostEdit(null);
    if (note) setEditNote(note);
    releaseCostLock();
  }

  function requestLeave(action: () => void) {
    if (!tableEdit || !isDirty) {
      if (tableEdit) discardEdit();
      action();
      return;
    }
    setLeaveAction(() => action);
  }

  useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const isOutside = (target: EventTarget | null) => {
      const root = catalogRootRef.current;
      return Boolean(root && target instanceof Node && !root.contains(target));
    };
    const onPointerDown = (event: PointerEvent) => {
      if (skipOutsideRef.current > 0) {
        skipOutsideRef.current -= 1;
        return;
      }
      if (!isOutside(event.target) || leaveAction) return;
      const clickable = event.target instanceof Element ? event.target.closest("button, a, [role='button']") : null;
      setLeaveAction(() => () => {
        if (!(clickable instanceof HTMLElement)) return;
        skipOutsideRef.current = 2;
        window.setTimeout(() => clickable.click(), 0);
      });
    };
    const onClick = (event: MouseEvent) => {
      if (skipOutsideRef.current > 0) {
        skipOutsideRef.current -= 1;
        return;
      }
      if (!isOutside(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("click", onClick, true);
    return () => {
      skipOutsideRef.current = 0;
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("click", onClick, true);
    };
  }, [isDirty, leaveAction]);

  const leaveDialog = leaveAction ? (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/35 p-6">
      <div className="w-full max-w-sm bg-white p-5" style={{ boxShadow: `inset 0 0 0 1px ${hub.ink}` }}>
        <p className="text-[16px] font-semibold" style={{ color: hub.text }}>Сохранить изменения?</p>
        <div className="mt-4 flex gap-2">
          <HubButton
            size="sm"
            disabled={savingEdit}
            onClick={() => {
              void (async () => {
                const ok = await saveEdits();
                const action = leaveAction;
                setLeaveAction(null);
                if (!ok || !action) return;
                action();
              })();
            }}
          >
            Сохранить
          </HubButton>
          <button
            type="button"
            className="inline-flex min-h-[36px] items-center rounded-[4px] border bg-white px-3.5 text-[13px] font-semibold"
            style={{ borderColor: hub.ink, color: hub.ink }}
            onClick={() => {
              const action = leaveAction;
              discardEdit();
              setLeaveAction(null);
              action();
            }}
          >
            Не сохранять
          </button>
        </div>
      </div>
    </div>
  ) : null;

  const viewTabs = (
    <HubSegmented
      layoutId="catalog-view"
      accent
      value={view}
      onChange={(id) => {
        if (id === view) return;
        requestLeave(() => onViewChange?.(id));
      }}
      options={[
        { id: "matrix", label: "Товары" },
        { id: "stocks", label: "Остатки" },
      ]}
    />
  );

  if (view === "stocks") {
    return (
      <div ref={catalogRootRef} className="space-y-4">
        {viewTabs}
        <HubStocks snapshot={snapshot} connected={connected} onUpdate={onItemsUpdate} onAsk={onAsk} />
        {leaveDialog}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <HubPanel className="flex min-h-[460px] flex-col rounded-md">
        <HubEmptyState
          icon={<Boxes className="h-7 w-7" />}
          title="Товарная матрица пока пуста"
          description="Подключите API-токен кабинета и запустите выгрузку — KARTO подтянет все карточки с артикулами, ценами, скидками и остатками."
          action={
            canSync ? (
              <HubButton onClick={onSync} loading={syncing}>
                <RefreshCw className="h-4 w-4" />
                Выгрузить каталог
              </HubButton>
            ) : (
              <HubButton onClick={onOpenIntegration}>Подключить кабинет</HubButton>
            )
          }
        />
      </HubPanel>
    );
  }

  function readRow(item: SellerCatalogItem): ProductRead {
    const draft = tableEdit ? drafts[item.id] : undefined;
    const draftCost = draft ? parseDraftNumber(draft.cost) : (item.costPrice ?? null);
    const draftFbs = draft ? parseDraftNumber(draft.fbs) : item.stockFbs;
    const sale = draft ? saleFromDraft(item, draft) : (item.discountedPrice ?? item.price ?? null);
    const stock =
      draft && (item.stockFbo != null || draftFbs != null) ? (item.stockFbo ?? 0) + (draftFbs ?? 0) : item.totalStock;
    const days = coverDays(stock === item.totalStock ? item : { ...item, totalStock: stock }, ordersByNm, periodDays);
    return readProduct({
      sale,
      cost: draftCost,
      stock: stock ?? null,
      days,
      periodDays,
      externalId: item.externalId,
      promotionIds: item.promotionIds,
      photos: item.imageUrls?.length ?? (item.imageUrl ? 1 : 0),
      hasVideo: Boolean(item.videoUrl),
      description: item.description ?? null,
      characteristicNames: item.characteristicNames ?? null,
      categoryCharcNames: item.categoryCharcNames ?? null,
      categoryCharcRequiredNames: item.categoryCharcRequiredNames ?? null,
      dimensions: item.dimensions ?? null,
      realization: snapshot?.realization ?? null,
      paidStorage: snapshot?.paidStorage ?? null,
      loading: marginLoading,
      stockFbo: item.stockFbo ?? null,
      stockFbs: draft ? parseDraftNumber(draft.fbs) : (item.stockFbs ?? null),
      createdAt: item.createdAt ?? null,
      funnel: snapshot?.funnel ?? null,
      funnelLoading,
      promotions: snapshot?.promotions,
      promotionEntryTerms: snapshot?.promotionEntryTerms,
      activeAdCampaigns: snapshot?.ads ? snapshot.ads.activeCount : null,
      feedbacks: snapshot?.feedbacks,
    });
  }

  function openBrief(event: { stopPropagation: () => void }, itemId: string, focus: ReadoutSectionId) {
    event.stopPropagation();
    setBrief({ kind: "product", itemId, focus });
  }

  const briefItem = brief?.kind === "product" ? items.find((row) => row.id === brief.itemId) ?? null : null;
  const briefSignal = briefItem ? readRow(briefItem) : null;

  const frozen = frozenPurchase(items, snapshot?.realization ?? null);

  function exportVisible() {
    const reportReady = Boolean(snapshot?.realization && !snapshot.realization.error);
    const sheet = visible.map((item) => {
      const draft = tableEdit ? drafts[item.id] : undefined;
      const draftFbs = draft ? parseDraftNumber(draft.fbs) : item.stockFbs;
      const stock =
        draft && (item.stockFbo != null || draftFbs != null)
          ? (item.stockFbo ?? 0) + (draftFbs ?? 0)
          : item.totalStock;
      const signal = readRow(item);
      const stockCell = stockColumn({
        ready: reportReady,
        stock: stock ?? null,
        soldQty: signal.soldQty,
        burnDays: signal.burnDays,
        fallbackDays: coverDays(
          stock === item.totalStock ? item : { ...item, totalStock: stock },
          ordersByNm,
          periodDays,
        ),
      });
      return {
        item,
        signal,
        stockText: stockCell.text,
        price: draft ? parseDraftNumber(draft.price) : item.price ?? null,
        discount: draft ? parseDraftNumber(draft.discount) : item.discountPercent ?? null,
        sale: draft ? saleFromDraft(item, draft) : (item.discountedPrice ?? item.price ?? null),
        cost: draft ? parseDraftNumber(draft.cost) : item.costPrice ?? null,
        stockPieces: stock ?? null,
        fbs: draftFbs ?? null,
      };
    });
    downloadCatalogCsv(sheet, marketplaceId);
  }

  return (
    <div ref={catalogRootRef} className="space-y-4">
      <div className="space-y-3">
        {viewTabs}
        <KpiFilters
          filter={filter}
          counts={filterCounts}
          onChange={(id) => {
            setFilter(id);
            setPage(0);
          }}
        />
      </div>
      {snapshot?.warnings?.length ? (
        <div
          className="flex items-start gap-2.5 rounded-[14px] border px-4 py-3"
          style={{ backgroundColor: hub.warnSoft, borderColor: "rgba(180,83,9,0.2)" }}
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: hub.warn }} />
          <div className="min-w-0 space-y-1">
            {snapshot.warnings.map((w) => (
              <p key={w} className="text-[13px] leading-[1.55]" style={{ ...hubSans, color: hub.warn }}>
                {w}
              </p>
            ))}
          </div>
        </div>
      ) : null}

      <HubPanel inkFrame className="flex flex-col rounded-md">
        <div
          className="flex flex-wrap items-center gap-3 border-b px-4 py-3.5 sm:px-5"
          style={{ borderColor: hub.borderSoft }}
        >
          <div className="relative min-w-[200px] flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
              style={{ color: hub.textSubtle }}
            />
            <HubInput
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              placeholder="Найти товар: название, артикул, штрихкод"
              className="pl-9 pr-10"
              aria-label="Поиск по товарам"
            />
            {search ? (
              <button
                type="button"
                aria-label="Очистить поиск"
                className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full outline-none hover:bg-black/[0.05] focus-visible:ring-2 focus-visible:ring-[#1F4E3D]"
                style={{ color: hub.textMuted }}
                onClick={() => {
                  setSearch("");
                  setPage(0);
                }}
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>

          <div className="relative">
            <ArrowUpDown
              className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2"
              style={{ color: hub.textSubtle }}
            />
            <select
              value={sort}
              onChange={(e) => {
                setSort(e.target.value as CatalogSort);
                setPage(0);
              }}
              className="h-[42px] cursor-pointer appearance-none rounded-[11px] border pl-8 pr-8 text-[13px] font-medium outline-none"
              style={{
                ...hubSans,
                backgroundColor: hub.inputBg,
                borderColor: hub.inputBorder,
                color: hub.text,
              }}
            >
              {SORTS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          {tableEdit ? (
            <>
              <HubButton disabled={savingEdit} onClick={() => void saveEdits()}>
                {savingEdit ? "Сохраняю" : "Сохранить"}
              </HubButton>
              <button
                type="button"
                className="inline-flex h-[42px] items-center rounded-[4px] border bg-white px-3.5 text-[13px] font-semibold"
                style={{ borderColor: hub.ink, color: hub.ink }}
                onClick={discardEdit}
              >
                Не сохранять
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={beginEdit}
              className="inline-flex h-[42px] items-center rounded-[11px] border-2 bg-white px-4 text-[14px] font-semibold outline-none transition hover:bg-[#F4F6F8] active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1F4E3D]"
              style={{ ...hubSans, borderColor: hub.ink, color: hub.ink }}
            >
              Редактировать
            </button>
          )}
          <button
            type="button"
            disabled={visible.length === 0}
            title="Скачать текущий список книгой Excel: колонки таблицы, без «Действий». Артикул, nmID и штрихкод — текст."
            onClick={exportVisible}
            className="inline-flex h-[42px] items-center gap-2 rounded-[11px] border-2 bg-white px-4 text-[14px] font-semibold outline-none transition hover:bg-[#F4F8FF] active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1F4E3D] disabled:cursor-not-allowed disabled:opacity-45"
            style={{ ...hubSans, borderColor: hub.blue, color: hub.blue }}
          >
            <Download className="h-4 w-4" />
            Excel
          </button>
        </div>
        {tableEdit ? (
          <p className="px-5 pb-1 text-[13px]" style={{ ...hubSans, color: hub.textMuted }}>
            Можно менять цену, скидку, себестоимость и остаток FBS. Цена со скидкой и маржа пересчитываются сами.
          </p>
        ) : null}
        {editNote ? (
          <p className="px-5 pb-2 text-[13px]" style={{ ...hubSans, color: hub.text }}>
            {editNote}
          </p>
        ) : null}
        {snapshot?.realization?.error ? (
          <div className="flex flex-wrap items-center gap-3 px-5 pb-2">
            <p className="text-[13px]" style={{ ...hubSans, color: hub.warn }}>
              {snapshot.realization.error}
            </p>
            <button
              type="button"
              className="text-[13px] font-semibold underline"
              style={{ color: hub.ink }}
              onClick={() => setRealizationAttempt((attempt) => attempt + 1)}
            >
              Повторить
            </button>
          </div>
        ) : null}
        {snapshot?.realization?.truncated ? (
          <p className="px-5 pb-2 text-[13px]" style={{ ...hubSans, color: hub.textMuted }}>
            Отчёт реализации обрезан на 100 000 строк. Маржа посчитана по этой части.
          </p>
        ) : null}
        {snapshot?.funnel?.error ? (
          <div className="flex flex-wrap items-center gap-3 px-5 pb-2">
            <p className="text-[13px]" style={{ ...hubSans, color: hub.warn }}>
              {snapshot.funnel.error}
            </p>
            <button
              type="button"
              className="text-[13px] font-semibold underline"
              style={{ color: hub.ink }}
              onClick={() => setFunnelAttempt((attempt) => attempt + 1)}
            >
              Повторить
            </button>
          </div>
        ) : null}
        {snapshot?.funnel?.truncated ? (
          <p className="px-5 pb-2 text-[13px]" style={{ ...hubSans, color: hub.textMuted }}>
            Воронка прочитана не до конца: в оценку вошли первые 3 000 карточек. У остальных заказы и рейтинг в число не входят.
          </p>
        ) : null}
        {frozen != null && frozen > 0 ? (
          <div
            className="mx-5 mb-3 flex flex-wrap items-center justify-between gap-3 rounded-[12px] border px-4 py-3"
            style={{ borderColor: hub.border, backgroundColor: hub.surface, maxWidth: "52rem" }}
          >
            <div className="min-w-0">
              <p className="text-[15px] font-semibold" style={{ ...hubSans, color: hub.text }}>
                Зависший капитал {formatRub(frozen)}
              </p>
              <p className="mt-1 text-[13px] leading-[1.5]" style={{ ...hubSans, color: hub.textMuted }}>
                Закупка на штуки сверх темпа 28 дней.
              </p>
            </div>
            <button
              type="button"
              className="inline-flex h-10 shrink-0 items-center rounded-[11px] border-2 bg-white px-3.5 text-[13.5px] font-semibold outline-none hover:bg-[#F4F6F8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1F4E3D]"
              style={{ ...hubSans, borderColor: hub.ink, color: hub.ink }}
              onClick={() => {
                setShowSitting((shown) => !shown);
                setPage(0);
              }}
            >
              {showSitting ? "Показать все товары" : "Показать излишек"}
            </button>
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-left">
            <thead
              className="sticky top-0 z-10"
              style={{ backgroundColor: hub.surfaceMuted }}
            >
              <tr>
                {TABLE_COLUMNS.map((column, i) => (
                  <th
                    key={column.label}
                    className={`whitespace-nowrap border-b py-3 text-[11px] font-bold uppercase tracking-[0.06em] ${column.align} ${
                      column.pad ?? `px-3 ${i === 0 ? "sm:px-5" : ""}`
                    }`}
                    style={{ ...hubSans, color: hub.textSubtle, borderColor: hub.borderSoft }}
                  >
                    {column.focus ? (
                      <button
                        type="button"
                        className="rounded-[4px] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[#1F4E3D]"
                        onClick={() => setBrief({ kind: "guide", focus: column.focus ?? "index" })}
                      >
                        {column.label}
                      </button>
                    ) : (
                      column.label
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((item) => {
                const draft = tableEdit ? drafts[item.id] : undefined;
                const draftDiscount = draft ? parseDraftNumber(draft.discount) : item.discountPercent;
                const draftCost = draft ? parseDraftNumber(draft.cost) : (item.costPrice ?? null);
                const draftFbs = draft ? parseDraftNumber(draft.fbs) : item.stockFbs;
                const shownDiscount = draftDiscount ?? 0;
                const sale = draft ? saleFromDraft(item, draft) : (item.discountedPrice ?? item.price ?? null);
                const stock =
                  draft && (item.stockFbo != null || draftFbs != null)
                    ? (item.stockFbo ?? 0) + (draftFbs ?? 0)
                    : item.totalStock;
                const days = coverDays(
                  stock === item.totalStock ? item : { ...item, totalStock: stock },
                  ordersByNm,
                  periodDays,
                );
                const signal = readRow(item);
                const reportReady = Boolean(snapshot?.realization && !snapshot.realization.error);
                const stockCell = stockColumn({
                  ready: reportReady,
                  stock: stock ?? null,
                  soldQty: signal.soldQty,
                  burnDays: signal.burnDays,
                  fallbackDays: days,
                });
                return (
                <tr
                  key={item.id}
                  className="group cursor-pointer border-b transition-colors duration-200 hover:bg-[#F4F6F8]"
                  style={{ borderColor: hub.borderSoft }}
                  onClick={() => requestLeave(() => setSelectedItem(item))}
                >
                  <td className="px-3 py-2.5 sm:px-4">
                    <ProductCell item={item} onPreview={setPreview} />
                  </td>
                  <td className="whitespace-nowrap py-3 pl-4 pr-8">
                    <GradeBadge
                      score={signal.index}
                      empty={funnelLoading && signal.index == null ? "Считаю" : "—"}
                      label={`Индекс SKU ${item.vendorCode}`}
                      onClick={(event) => openBrief(event, item.id, "index")}
                    />
                  </td>
                  <td className="whitespace-nowrap py-3 pl-8 pr-8">
                    <ContentScore
                      score={signal.cardScore}
                      parts={signal.cardParts}
                      label={`Контент ${item.vendorCode}`}
                      onClick={(event) => openBrief(event, item.id, "card")}
                    />
                  </td>
                  <td className="whitespace-nowrap py-3 pl-8 pr-7">
                    <StockCover
                      pieces={stock ?? null}
                      cover={stockCell}
                      label={`Остаток и запас ${item.vendorCode}`}
                      draft={draft}
                      fbo={item.stockFbo ?? null}
                      vendorCode={item.vendorCode}
                      onFbs={(value) => patchDraft(item.id, "fbs", value)}
                      onOpen={(event) => openBrief(event, item.id, "stock")}
                    />
                  </td>
                  <td className="whitespace-nowrap py-3 pl-7 pr-5">
                    <MetricButton
                      label={`Зависший капитал ${item.vendorCode}`}
                      tone={signal.excessRub != null && signal.excessRub > 0 ? "danger" : undefined}
                      onClick={(event) => openBrief(event, item.id, "capital")}
                    >
                      {signal.excessRub != null && signal.excessRub > 0 ? formatRub(signal.excessRub) : "—"}
                    </MetricButton>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <span className="inline-flex items-center">
                      <span className="font-mono text-[12px] tracking-[-0.01em]" style={{ color: hub.textSubtle }}>
                        {item.vendorCode}
                      </span>
                      <CopyArticle text={item.vendorCode} />
                    </span>
                  </td>
                  <td
                    className="whitespace-nowrap px-5 py-3 text-[15px]"
                    style={{ ...hubSans, ...hubNumeric, color: shownDiscount > 0 ? hub.textSubtle : hub.text }}
                  >
                    {draft ? (
                      <EditField
                        value={draft.price}
                        label={`Цена ${item.vendorCode}`}
                        onChange={(value) => patchDraft(item.id, "price", value)}
                      />
                    ) : item.price != null ? (
                      <span className={shownDiscount > 0 ? "line-through" : "font-semibold"}>
                        {formatRub(item.price)}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td
                    className="whitespace-nowrap px-5 py-3 text-[15px] font-semibold"
                    style={{
                      ...hubSans,
                      ...hubNumeric,
                      color: shownDiscount >= 20 ? hub.danger : hub.text,
                      backgroundColor: shownDiscount > 0 ? hub.greenSoft : undefined,
                    }}
                  >
                    {draft ? (
                      <EditField
                        value={draft.discount}
                        label={`Скидка ${item.vendorCode}`}
                        onChange={(value) => patchDraft(item.id, "discount", value)}
                      />
                    ) : shownDiscount > 0 ? (
                      `−${item.discountPercent}%`
                    ) : item.discountPercent === 0 ? (
                      "0%"
                    ) : (
                      "—"
                    )}
                    {!draft && signal.promoMark ? (
                      <div
                        className="mt-1 text-[11px] font-semibold"
                        style={{ color: signal.promoMark.startsWith("скоро") ? hub.warn : hub.green }}
                      >
                        {signal.promoMark}
                      </div>
                    ) : null}
                  </td>
                  <td
                    className="whitespace-nowrap px-5 py-3 text-[15px] font-semibold"
                    style={{
                      ...hubSans,
                      ...hubNumeric,
                      color: hub.text,
                      backgroundColor: hub.blueSoft,
                    }}
                  >
                    <span className="flex flex-col items-start gap-0.5">
                      <span>{sale != null ? formatRub(sale) : "—"}</span>
                      {signal.floor != null ? (
                        <button
                          type="button"
                          className="text-[11px] font-medium underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[#1F4E3D]"
                          style={{ color: hub.textMuted }}
                          onClick={(event) => openBrief(event, item.id, "margin")}
                        >
                          убыток ниже {formatRub(signal.floor)}
                        </button>
                      ) : null}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    {draft ? (
                      <EditField
                        value={draft.cost}
                        label={`Себестоимость ${item.vendorCode}`}
                        onChange={(value) => patchDraft(item.id, "cost", value)}
                      />
                    ) : costEdit?.id === item.id ? (
                      <input
                        autoFocus
                        value={costEdit.value}
                        aria-label={`Себестоимость ${item.vendorCode}`}
                        inputMode="decimal"
                        disabled={costSaving}
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) => setCostEdit({ id: item.id, value: event.target.value })}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            void saveCostInline(item);
                          }
                          if (event.key === "Escape") {
                            costLockRef.current = true;
                            setCostEdit(null);
                            window.setTimeout(() => {
                              costLockRef.current = false;
                            }, 0);
                          }
                        }}
                        onBlur={() => {
                          void saveCostInline(item);
                        }}
                        className="w-[6.5rem] rounded-[4px] border bg-white px-2 py-1 text-[14px] font-semibold outline-none"
                        style={{ ...hubSans, ...hubNumeric, borderColor: hub.ink, color: hub.text }}
                      />
                    ) : (
                      <button
                        type="button"
                        className="rounded-[4px] text-[15px] font-semibold underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[#1F4E3D]"
                        style={{ ...hubSans, ...hubNumeric, color: item.costPrice != null ? hub.text : hub.textMuted }}
                        title={item.costPrice == null ? "Вписать себестоимость" : "Изменить себестоимость"}
                        onClick={(event) => {
                          event.stopPropagation();
                          setCostEdit({
                            id: item.id,
                            value: item.costPrice != null ? String(item.costPrice) : "",
                          });
                        }}
                      >
                        {item.costPrice != null ? formatRub(item.costPrice) : "—"}
                      </button>
                    )}
                  </td>
                  <td
                    className="px-4 py-3 text-[15px] font-semibold"
                    style={{
                      ...hubSans,
                      ...hubNumeric,
                      color: marginInk(signal.margin),
                    }}
                  >
                    {signal.margin != null && signal.marginGap == null ? (
                      <button
                        type="button"
                        className="inline-flex items-center gap-0.5 rounded-[4px] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[#1F4E3D]"
                        onClick={(event) => openBrief(event, item.id, "margin")}
                      >
                        <span>
                          {signal.margin.percent.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%
                        </span>
                        {signal.trend === "up" || signal.trend === "down" ? (
                          <TrendMark
                            direction={signal.trend}
                            mark=""
                            tone={signal.trend === "up" ? "ok" : "danger"}
                          />
                        ) : null}
                      </button>
                    ) : signal.marginGap === "no-deliveries" ? (
                      <span
                        title="Нет доставок за 90 дней"
                        className="inline-block max-w-[7.25rem] whitespace-normal text-left text-[11px] font-medium leading-[1.3]"
                        style={{ color: hub.textMuted }}
                      >
                        Нет доставок за 90 дней
                      </span>
                    ) : draftCost == null || signal.marginGap === "no-cost" ? (
                      <span
                        title="Маржа: укажите себестоимость"
                        className="inline-block max-w-[7.25rem] whitespace-normal text-left text-[11px] font-medium leading-[1.3]"
                        style={{ color: hub.textMuted }}
                      >
                        Укажите себестоимость
                      </span>
                    ) : marginLoading
                        ? "Считаю"
                        : snapshot?.realization?.error
                          ? "Не вышло"
                          : snapshot?.realization
                            ? "Нет доставок за 90 дней"
                            : "Считаю"}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-[15px] font-semibold" style={{ ...hubSans, ...hubNumeric, color: hub.text }}>
                    <span className="inline-flex flex-col items-start gap-0.5">
                      <span className="inline-flex items-center gap-0.5">
                        <span>{signal.soldQty == null ? "—" : formatInt(signal.soldQty)}</span>
                        {signal.soldDelta ? (
                          <span title="К прошлым 28 дням">
                            <TrendMark
                              direction={signal.soldDelta.direction}
                              mark={signal.soldDelta.mark}
                              tone={signal.soldDelta.tone}
                            />
                          </span>
                        ) : null}
                      </span>
                      {signal.soldDelta?.caption ? (
                        <span
                          title="К прошлым 28 дням"
                          className="text-[11px] font-medium leading-none"
                          style={{ color: signal.soldDelta.tone === "ok" ? hub.green : hub.danger }}
                        >
                          {signal.soldDelta.caption}
                        </span>
                      ) : null}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-[15px] font-semibold" style={{ ...hubSans, ...hubNumeric, color: hub.text }}>
                    {signal.reviewCount180 == null ? (
                      <span style={{ color: hub.textMuted }}>—</span>
                    ) : (
                      <span className="inline-flex flex-col items-start gap-0.5">
                        <span>
                          {signal.reviewRatingAvg != null
                            ? `${signal.reviewRatingAvg.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}★`
                            : "—"}
                        </span>
                        <span className="text-[11px] font-medium leading-none" style={{ color: hub.textMuted }}>
                          {formatInt(signal.reviewCount180)} за 180 дн.
                        </span>
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-[15px] font-semibold" style={{ ...hubSans, ...hubNumeric, color: hub.text }}>
                    {signal.unansweredReviews == null ? (
                      <span style={{ color: hub.textMuted }}>—</span>
                    ) : signal.unansweredReviews === 0 ? (
                      <span style={{ color: hub.textMuted }}>0</span>
                    ) : (
                      <span className="inline-flex flex-col items-start gap-0.5">
                        <span>{formatInt(signal.unansweredReviews)}</span>
                        {signal.unansweredNegativeReviews != null && signal.unansweredNegativeReviews > 0 ? (
                          <span className="text-[11px] font-medium leading-none" style={{ color: hub.danger }}>
                            негатив {formatInt(signal.unansweredNegativeReviews)}
                          </span>
                        ) : null}
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-[15px] font-semibold" style={{ ...hubSans, ...hubNumeric, color: hub.text }}>
                    {signal.unansweredQuestions == null ? (
                      <span style={{ color: hub.textMuted }}>—</span>
                    ) : (
                      formatInt(signal.unansweredQuestions)
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusChip
                      tone={signal.tone}
                      label={signal.label}
                      onClick={(event) => openBrief(event, item.id, "status")}
                    />
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {onAsk ? (
                      <button
                        type="button"
                        title="Разобрать эту карточку"
                        aria-label={`Аудит ${item.vendorCode}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          onAsk(auditChatText(item, coverDays(item, ordersByNm, periodDays), periodDays));
                        }}
                        className="inline-flex h-9 cursor-pointer items-center rounded-[11px] bg-[#B9FF4B] px-3.5 text-[13px] font-semibold text-[#0E1116] shadow-[0_1px_2px_rgba(14,17,22,0.1),0_0_0_1px_rgba(31,78,61,0.14)] outline-none transition duration-200 hover:bg-[#C6FF68] hover:shadow-[0_8px_18px_rgba(185,255,75,0.55)] active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1F4E3D]"
                        style={hubSans}
                      >
                        Аудит
                      </button>
                    ) : null}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>

          {visible.length === 0 ? (
            <p
              className="px-6 py-14 text-center text-[14px]"
              style={{ ...hubSans, color: hub.textMuted }}
            >
              По текущему фильтру товаров нет.
            </p>
          ) : null}
        </div>

        <div
          className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 sm:px-5"
          style={{ borderColor: hub.borderSoft }}
        >
          <p className="text-[12.5px]" style={{ ...hubSans, color: hub.textMuted }}>
            Показано {formatInt(pageRows.length)} из {formatInt(visible.length)} · всего в кабинете{" "}
            {formatInt(items.length)} · обновлено {formatSyncTime(snapshot?.syncedAt)}
          </p>

          {pageCount > 1 ? (
            <div className="flex items-center gap-2">
              <HubButton
                variant="secondary"
                size="sm"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={safePage === 0}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Назад
              </HubButton>
              <span
                className="text-[12.5px] font-semibold"
                style={{ ...hubSans, ...hubNumeric, color: hub.textMuted }}
              >
                {safePage + 1} / {pageCount}
              </span>
              <HubButton
                variant="secondary"
                size="sm"
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                disabled={safePage >= pageCount - 1}
              >
                Вперёд
                <ChevronRight className="h-3.5 w-3.5" />
              </HubButton>
            </div>
          ) : null}
        </div>
      </HubPanel>

      {brief?.kind === "guide" ? (
        <HubProductReadout
          title="Как считаются показатели"
          sections={indexGuide()}
          focus={brief.focus}
          canEdit={false}
          onEdit={null}
          onClose={() => setBrief(null)}
        />
      ) : brief?.kind === "product" && briefItem && briefSignal ? (
        <HubProductReadout
          title={briefItem.title}
          vendorCode={briefItem.vendorCode}
          externalId={briefItem.externalId}
          sections={briefSignal.readout}
          focus={brief.focus}
          canEdit={briefSignal.opensEdit}
          actions={{
            visual: {
              href: "/studio/visual",
              label: "Открыть генератор Поток",
              onClick: () =>
                writeHubCardSeed({
                  title: briefItem.title,
                  vendorCode: briefItem.vendorCode,
                  externalId: briefItem.externalId,
                  description: briefItem.description ?? "",
                }),
            },
            description: {
              href: "/studio/description",
              label: "Усилить через SEO-генератор",
              onClick: () =>
                writeHubCardSeed({
                  title: briefItem.title,
                  vendorCode: briefItem.vendorCode,
                  externalId: briefItem.externalId,
                  description: briefItem.description ?? "",
                }),
            },
            card: {
              label: "Заполнить характеристики",
              onClick: () => {
                setBrief(null);
                setSelectedItem(briefItem);
              },
            },
          }}
          money={
            onItemsUpdate
              ? {
                  price: briefItem.price != null ? String(Math.round(briefItem.price)) : "",
                  discount: briefItem.discountPercent != null ? String(briefItem.discountPercent) : "",
                  cost: briefItem.costPrice != null ? String(briefItem.costPrice) : "",
                  onSave: (next) => saveRowMoney(briefItem, next),
                }
              : undefined
          }
          onEdit={() => {
            setBrief(null);
            if (!tableEdit) beginEdit();
          }}
          onClose={() => setBrief(null)}
        />
      ) : null}
      {selectedItem ? (
        <HubProductDrawer
          item={selectedItem}
          promotions={snapshot?.promotions}
          onOpenPrices={onOpenPrices}
          connected={connected}
          onPatched={(patch) => {
            if (!onItemsUpdate) return;
            onItemsUpdate(items.map((row) => (row.id === patch.id ? { ...row, ...patch } : row)));
            setSelectedItem((current) => (current && current.id === patch.id ? { ...current, ...patch } : current));
          }}
          onClose={() => setSelectedItem(null)}
        />
      ) : null}
      {preview ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
          onClick={() => setPreview(null)}
          role="presentation"
        >
          <button
            type="button"
            className="absolute right-4 top-4 rounded-full bg-white p-2"
            onClick={() => setPreview(null)}
            aria-label="Закрыть фото"
          >
            <X className="h-4 w-4" />
          </button>
          <img
            src={preview}
            alt=""
            className="max-h-[85vh] max-w-[min(520px,90vw)] object-contain"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      ) : null}
      {leaveDialog}
    </div>
  );
}
