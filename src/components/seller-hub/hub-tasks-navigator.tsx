"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronRight, Search, Sparkles, X } from "lucide-react";
import type { TaskCategory, TaskSeverity } from "@/lib/seller-hub/task-engine/types";
import { ArticleChip, HubPhoto, hub, hubNumeric, hubSans } from "./hub-ui";

export type NavRow = { level: TaskSeverity; cat: TaskCategory | "ai"; nm: string | null };
export type NavSection = TaskCategory | "ai" | "all";
export type NavProduct = { title: string; vendorCode: string; imageUrl?: string };

type SeverityRowDef = { id: TaskSeverity; label: string; dot: string };

const PRODUCTS_SHORT = 5;
const PICKER_PAGE = 60;

/**
 * Правая панель «Задач»: навигатор. Всё, что здесь выбрано, фильтрует список слева.
 * Числа считаются с учётом остальных выбранных условий: человек видит, сколько задач останется после нажатия.
 */
export function HubTasksNavigator({
  rows,
  severityRows,
  categoryOrder,
  categoryLabel,
  severity,
  onSeverity,
  section,
  onSection,
  productNm,
  onProduct,
  productInfo,
  shown,
  total,
}: {
  rows: NavRow[];
  severityRows: readonly SeverityRowDef[];
  categoryOrder: readonly TaskCategory[];
  categoryLabel: Record<TaskCategory, string>;
  severity: TaskSeverity | "all";
  onSeverity: (value: TaskSeverity | "all") => void;
  section: NavSection;
  onSection: (value: NavSection) => void;
  productNm: string | null;
  onProduct: (value: string | null) => void;
  productInfo: (nm: string) => NavProduct | null;
  /** Сколько задач и решений ИИ сейчас показано в списке. */
  shown: number;
  total: number;
}) {
  const [search, setSearch] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const asideRef = useRef<HTMLElement | null>(null);
  const [stickyTop, setStickyTop] = useState(4);

  // Липкая панель выше экрана иначе недоступна снизу. Отрицательный top прижимает к краю её низ, и она едет вместе со страницей без своей прокрутки.
  useLayoutEffect(() => {
    const el = asideRef.current;
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
  }, []);

  const passes = (row: NavRow, skip: "severity" | "section" | "product" | null) =>
    (skip === "severity" || severity === "all" || row.level === severity) &&
    (skip === "section" || section === "all" || row.cat === section) &&
    (skip === "product" || !productNm || row.nm === productNm);

  const severityCount = (level: TaskSeverity) => rows.filter((row) => passes(row, "severity") && row.level === level).length;
  const sectionCount = (value: TaskCategory | "ai") => rows.filter((row) => passes(row, "section") && row.cat === value).length;
  const aiCount = sectionCount("ai");

  const products = useMemo(() => {
    const pool = rows.filter((row) => (severity === "all" || row.level === severity) && (section === "all" || row.cat === section) && row.nm);
    const byNm = new Map<string, number>();
    for (const row of pool) byNm.set(row.nm!, (byNm.get(row.nm!) ?? 0) + 1);
    const list = [...byNm.entries()].map(([nm, count]) => ({ nm, count, info: productInfo(nm) }));
    return list.sort((a, b) => b.count - a.count || (a.info?.title ?? "").localeCompare(b.info?.title ?? "", "ru"));
  }, [rows, severity, section, productInfo]);

  const needle = search.trim().toLowerCase();
  const matched = needle
    ? products.filter((p) => `${p.info?.title ?? ""} ${p.info?.vendorCode ?? ""} ${p.nm}`.toLowerCase().includes(needle))
    : products;
  const visibleProducts = needle ? matched.slice(0, 8) : matched.slice(0, PRODUCTS_SHORT);
  // Выбранный товар всегда на виду, даже если сейчас не попадает в верх списка.
  const pinned = productNm && !visibleProducts.some((p) => p.nm === productNm) ? { nm: productNm, count: rows.filter((r) => r.nm === productNm && passes(r, "product")).length, info: productInfo(productNm) } : null;

  const filtersOn = severity !== "all" || section !== "all" || productNm != null;
  const sectionLabel = section === "ai" ? "Решения ИИ" : section === "all" ? null : categoryLabel[section];
  const activeChips: Array<{ key: string; label: string; clear: () => void }> = [];
  if (severity !== "all") activeChips.push({ key: "sev", label: severityRows.find((r) => r.id === severity)?.label ?? "", clear: () => onSeverity("all") });
  if (sectionLabel) activeChips.push({ key: "sec", label: sectionLabel, clear: () => onSection("all") });
  if (productNm) activeChips.push({ key: "prod", label: productInfo(productNm)?.title ?? `Товар ${productNm}`, clear: () => onProduct(null) });

  const rowBase =
    "flex w-full items-center justify-between gap-3 rounded-[10px] px-3 py-2 text-left outline-none transition-colors duration-150 hover:bg-[var(--hub-surface-muted)] focus-visible:shadow-[0_0_0_2px_var(--hub-lime-ring)]";

  return (
    <aside
      ref={asideRef}
      aria-label="Навигатор по задачам"
      className="order-last h-fit self-start overflow-hidden rounded-[22px] border-2 bg-white xl:sticky"
      style={{ borderColor: hub.limeEdge, top: stickyTop }}
    >
      <div className="px-5 pb-2 pt-5">
        <div className="flex items-baseline gap-2.5">
          <span className="text-[40px] font-bold leading-none tracking-[-0.03em]" style={{ ...hubSans, ...hubNumeric, color: hub.text }}>
            {filtersOn ? shown : total}
          </span>
          <span className="text-[14px] font-medium" style={{ ...hubSans, color: hub.textSubtle }}>
            {filtersOn ? "по фильтру" : "активных задач"}
          </span>
        </div>
        {filtersOn ? (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {activeChips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                onClick={chip.clear}
                aria-label={`Убрать фильтр: ${chip.label}`}
                className="inline-flex max-w-full items-center gap-1 rounded-full px-2.5 py-1 text-[12.5px] font-medium outline-none transition-colors hover:brightness-95 focus-visible:shadow-[0_0_0_2px_var(--hub-lime-ring)]"
                style={{ ...hubSans, backgroundColor: hub.limeSoft, color: hub.text }}
              >
                <span className="truncate">{chip.label}</span>
                <X className="h-3 w-3 shrink-0" strokeWidth={2.25} aria-hidden />
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                onSeverity("all");
                onSection("all");
                onProduct(null);
              }}
              className="px-1.5 py-1 text-[12.5px] font-medium underline underline-offset-2 outline-none focus-visible:shadow-[0_0_0_2px_var(--hub-lime-ring)]"
              style={{ ...hubSans, color: hub.textSubtle }}
            >
              Сбросить всё
            </button>
          </div>
        ) : null}
      </div>

      <div role="group" aria-label="Задачи по важности" className="px-2.5 pb-2">
        {severityRows.map((row) => {
          const active = severity === row.id;
          const count = severityCount(row.id);
          return (
            <button key={row.id} type="button" aria-pressed={active} onClick={() => onSeverity(active ? "all" : row.id)} className={rowBase} style={{ backgroundColor: active ? hub.limeSoft : undefined }}>
              <span className="flex items-center gap-2.5 text-[14px]" style={{ ...hubSans, color: count === 0 && !active ? hub.textSubtle : hub.text, fontWeight: active ? 600 : 500 }}>
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: row.dot }} aria-hidden />
                {row.label}
              </span>
              <span className="text-[15px] font-semibold" style={{ ...hubNumeric, color: count === 0 ? hub.textSubtle : hub.text }}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="border-t px-2.5 py-2.5" style={{ borderColor: hub.border }}>
        <h2 className="px-3 pb-1.5 pt-1 text-[12px] font-semibold" style={{ ...hubSans, color: hub.textSubtle }}>
          Разделы
        </h2>
        {categoryOrder.map((cat) => {
          const count = sectionCount(cat);
          const active = section === cat;
          if (count === 0 && !active) return null;
          return (
            <button key={cat} type="button" aria-pressed={active} onClick={() => onSection(active ? "all" : cat)} className={rowBase} style={{ backgroundColor: active ? hub.limeSoft : undefined }}>
              <span className="truncate text-[14px]" style={{ ...hubSans, color: hub.text, fontWeight: active ? 600 : 500 }}>
                {categoryLabel[cat]}
              </span>
              <span className="text-[14px] font-medium" style={{ ...hubNumeric, color: hub.textMuted }}>
                {count}
              </span>
            </button>
          );
        })}
        {aiCount > 0 || section === "ai" ? (
          <button type="button" aria-pressed={section === "ai"} onClick={() => onSection(section === "ai" ? "all" : "ai")} className={rowBase} style={{ backgroundColor: section === "ai" ? hub.limeSoft : undefined }}>
            <span className="flex items-center gap-2 truncate text-[14px]" style={{ ...hubSans, color: hub.text, fontWeight: section === "ai" ? 600 : 500 }}>
              <Sparkles className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
              Решения ИИ
            </span>
            <span className="text-[14px] font-medium" style={{ ...hubNumeric, color: hub.textMuted }}>
              {aiCount}
            </span>
          </button>
        ) : null}
      </div>

      <div className="border-t px-2.5 py-2.5" style={{ borderColor: hub.border }}>
        <div className="flex items-baseline justify-between gap-3 px-3 pb-1.5 pt-1">
          <h2 className="text-[12px] font-semibold" style={{ ...hubSans, color: hub.textSubtle }}>
            Товары с задачами
          </h2>
          <span className="text-[12px]" style={{ ...hubNumeric, color: hub.textSubtle }}>
            {products.length}
          </span>
        </div>
        <label className="mx-1 mb-2 flex h-10 items-center gap-2 rounded-full border bg-white px-3.5 text-[13.5px] focus-within:shadow-[0_0_0_2px_var(--hub-lime-ring)]" style={{ borderColor: hub.borderStrong }}>
          <Search className="h-4 w-4 shrink-0" strokeWidth={1.75} style={{ color: hub.textSubtle }} aria-hidden />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Название или артикул"
            aria-label="Найти товар среди задач"
            className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[var(--hub-text-subtle)]"
            style={{ ...hubSans, color: hub.text }}
          />
          {search ? (
            <button type="button" aria-label="Очистить поиск" onClick={() => setSearch("")} className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-[var(--hub-surface-muted)]">
              <X className="h-3 w-3" strokeWidth={2} aria-hidden />
            </button>
          ) : null}
        </label>
        {!needle ? (
          <p className="px-3 pb-1.5 pt-0.5 text-[12px]" style={{ ...hubSans, color: hub.textSubtle }}>
            Больше всего задач
          </p>
        ) : null}
        {[...(pinned ? [pinned] : []), ...visibleProducts].map((p) => {
          const active = productNm === p.nm;
          return (
            <button key={p.nm} type="button" aria-pressed={active} onClick={() => onProduct(active ? null : p.nm)} className={`${rowBase} !py-2`} style={{ backgroundColor: active ? hub.limeSoft : undefined }}>
              <span className="flex min-w-0 items-center gap-3">
                <HubPhoto src={p.info?.imageUrl} className="h-[44px] w-[33px] shrink-0 rounded-[7px]" iconClassName="h-3.5 w-3.5" />
                <span className="line-clamp-2 min-w-0 text-[13.5px] leading-[1.3]" style={{ ...hubSans, color: hub.text, fontWeight: active ? 600 : 500, overflowWrap: "anywhere" }}>
                  {p.info?.title ?? `Товар ${p.nm}`}
                </span>
              </span>
              <span className="min-w-[26px] rounded-full px-2 py-0.5 text-center text-[12.5px] font-bold" style={{ ...hubNumeric, backgroundColor: active ? "#fff" : hub.surfaceMuted, color: hub.text }}>
                {p.count}
              </span>
            </button>
          );
        })}
        {needle && matched.length === 0 ? (
          <p className="px-3 py-2 text-[13px]" style={{ ...hubSans, color: hub.textSubtle }}>
            Среди товаров с задачами такого нет.
          </p>
        ) : null}
        {needle && matched.length > visibleProducts.length ? (
          <p className="px-3 py-1 text-[12px]" style={{ ...hubSans, color: hub.textSubtle }}>
            Ещё {matched.length - visibleProducts.length}: уточните запрос или откройте полный список.
          </p>
        ) : null}
        {products.length > PRODUCTS_SHORT || needle ? (
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="mx-1 mt-1.5 flex w-[calc(100%-0.5rem)] items-center justify-between gap-2 rounded-[10px] px-3 py-2.5 text-[13.5px] font-semibold outline-none transition-colors hover:bg-[var(--hub-surface-muted)] focus-visible:shadow-[0_0_0_2px_var(--hub-lime-ring)]"
            style={{ ...hubSans, color: hub.text, backgroundColor: hub.canvas, boxShadow: `inset 0 0 0 1px ${hub.border}` }}
          >
            <span>Все товары · {products.length}</span>
            <ChevronRight className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          </button>
        ) : null}
      </div>

      {pickerOpen ? (
        <ProductPicker
          products={products}
          selected={productNm}
          initialSearch={search}
          onPick={(nm) => {
            onProduct(nm);
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      ) : null}
    </aside>
  );
}


type PickerProduct = { nm: string; count: number; info: NavProduct | null };

/** Полный список товаров с задачами: поиск, сортировка, постраничный показ. Выдерживает каталог в тысячи товаров. */
function ProductPicker({ products, selected, initialSearch, onPick, onClose }: { products: PickerProduct[]; selected: string | null; initialSearch: string; onPick: (nm: string | null) => void; onClose: () => void }) {
  const [search, setSearch] = useState(initialSearch);
  const [sort, setSort] = useState<"count" | "name">("count");
  const [limit, setLimit] = useState(PICKER_PAGE);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const needle = search.trim().toLowerCase();
  const list = useMemo(() => {
    const found = needle ? products.filter((p) => `${p.info?.title ?? ""} ${p.info?.vendorCode ?? ""} ${p.nm}`.toLowerCase().includes(needle)) : products;
    const sorted = [...found];
    if (sort === "name") sorted.sort((a, b) => (a.info?.title ?? "").localeCompare(b.info?.title ?? "", "ru"));
    return sorted;
  }, [products, needle, sort]);
  const shown = list.slice(0, limit);

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <button type="button" aria-label="Закрыть" className="hub-fade-in absolute inset-0 bg-[rgba(1,20,8,0.5)] backdrop-blur-[2px]" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label="Выбор товара" className="hub-pop relative flex h-[min(720px,100%)] w-full max-w-[600px] flex-col overflow-hidden rounded-t-[28px] bg-white shadow-[0_40px_100px_-30px_rgba(1,20,8,0.55)] sm:rounded-[28px]">
        <div className="px-7 pb-4 pt-6">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-[22px] font-semibold tracking-[-0.02em]" style={{ ...hubSans, color: hub.text }}>
              Выбрать товар
            </h2>
            <button type="button" aria-label="Закрыть" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full outline-none transition-colors hover:bg-[var(--hub-surface-muted)] focus-visible:shadow-[0_0_0_2px_var(--hub-lime-ring)]" style={{ color: hub.textMuted }}>
              <X className="h-5 w-5" strokeWidth={1.75} />
            </button>
          </div>
          <label className="mt-4 flex h-11 items-center gap-2.5 rounded-full border bg-white px-4 text-[15px] focus-within:shadow-[0_0_0_2px_var(--hub-lime-ring)]" style={{ borderColor: hub.borderStrong }}>
            <Search className="h-4 w-4 shrink-0" strokeWidth={1.75} style={{ color: hub.textSubtle }} aria-hidden />
            <input
              ref={inputRef}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setLimit(PICKER_PAGE);
              }}
              placeholder="Название, артикул или номер WB"
              aria-label="Поиск товара"
              className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[var(--hub-text-subtle)]"
              style={{ ...hubSans, color: hub.text }}
            />
          </label>
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-[13px]" style={{ ...hubSans, color: hub.textSubtle }}>
              {needle ? `Найдено ${list.length} из ${products.length}` : `Всего ${products.length}`}
            </p>
            <div role="group" aria-label="Сортировка" className="flex gap-1 rounded-full p-1" style={{ backgroundColor: hub.surfaceMuted }}>
              {([
                ["count", "По числу задач"],
                ["name", "По названию"],
              ] as const).map(([id, label]) => (
                <button key={id} type="button" aria-pressed={sort === id} onClick={() => setSort(id)} className="rounded-full px-3 py-1 text-[12.5px] font-medium outline-none focus-visible:shadow-[0_0_0_2px_var(--hub-lime-ring)]" style={{ ...hubSans, backgroundColor: sort === id ? "#fff" : "transparent", color: hub.text, boxShadow: sort === id ? "0 1px 2px rgba(1,20,8,0.12)" : undefined }}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t px-3 py-2" style={{ borderColor: hub.border }}>
          {shown.map((p) => {
            const active = selected === p.nm;
            return (
              <li key={p.nm}>
                <button type="button" onClick={() => onPick(active ? null : p.nm)} className="flex w-full items-center gap-3.5 rounded-[14px] px-3 py-2.5 text-left outline-none transition-colors hover:bg-[var(--hub-surface-muted)] focus-visible:shadow-[0_0_0_2px_var(--hub-lime-ring)]" style={{ backgroundColor: active ? hub.limeSoft : undefined }}>
                  <HubPhoto src={p.info?.imageUrl} className="h-[52px] w-[39px] shrink-0 rounded-[8px]" iconClassName="h-4 w-4" />
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 block text-[15px] font-semibold leading-[1.3]" style={{ ...hubSans, color: hub.text, overflowWrap: "anywhere" }}>
                      {p.info?.title ?? `Товар ${p.nm}`}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-2 text-[12px]" style={{ ...hubSans, ...hubNumeric, color: hub.textSubtle }}>
                      {p.info?.vendorCode ? <ArticleChip value={p.info.vendorCode} /> : null}
                      <span>nm {p.nm}</span>
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="rounded-full px-2.5 py-0.5 text-[13px] font-bold" style={{ ...hubNumeric, backgroundColor: hub.surfaceMuted, color: hub.text }}>
                      {p.count}
                    </span>
                    {active ? <Check className="h-4 w-4" strokeWidth={2.5} style={{ color: hub.greenDark }} aria-hidden /> : null}
                  </span>
                </button>
              </li>
            );
          })}
          {list.length === 0 ? (
            <li className="px-4 py-10 text-center text-[14px]" style={{ ...hubSans, color: hub.textSubtle }}>
              Среди товаров с задачами такого нет.
            </li>
          ) : null}
          {list.length > shown.length ? (
            <li className="flex justify-center py-3">
              <button type="button" onClick={() => setLimit((value) => value + PICKER_PAGE)} className="rounded-full border px-5 py-2 text-[13.5px] font-semibold outline-none transition-colors hover:bg-[var(--hub-surface-muted)] focus-visible:shadow-[0_0_0_2px_var(--hub-lime-ring)]" style={{ ...hubSans, borderColor: hub.borderStrong, color: hub.text }}>
                Показать ещё {Math.min(PICKER_PAGE, list.length - shown.length)} из {list.length - shown.length}
              </button>
            </li>
          ) : null}
        </ul>
      </div>
    </div>,
    document.body,
  );
}
