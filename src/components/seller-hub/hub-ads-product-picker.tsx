"use client";

import { useMemo, useState } from "react";
import { Check, Plus } from "lucide-react";
import type { AdvisorProduct } from "@/lib/seller-hub/ads-advisor";
import { MIN_COVER_FOR_GROWTH_DAYS } from "@/lib/seller-hub/task-engine/promo";
import { Segmented } from "./hub-analytics-ui";
import { Thumb } from "./hub-fulfillment-ui";
import { formatInt, formatRub, hub, HubButton, HubInput, hubSans } from "./hub-ui";
import { usePagedLimit } from "./use-paged-limit";

/** Подходит ли товар для рекламы: есть остаток и положительная маржа. Остальные доступны выбором «Все», с объяснением, чего не хватает. */
export function isRecommended(p: AdvisorProduct): boolean {
  return (p.marginRub ?? 0) > 0 && (p.stock ?? 0) > 0 && (p.coverDays == null || p.coverDays >= MIN_COVER_FOR_GROWTH_DAYS);
}

function whyNot(p: AdvisorProduct): string | null {
  if ((p.stock ?? 0) <= 0) return "нет остатка";
  if (p.marginRub == null) return "маржа не посчитана";
  if (p.marginRub <= 0) return "маржа не положительная";
  if (p.coverDays != null && p.coverDays < MIN_COVER_FOR_GROWTH_DAYS) return "мало запаса";
  return null;
}

/**
 * Выбор товаров плитками с фото: «Рекомендуем» (есть остаток и маржа) или «Все». Лучшие кандидаты первыми.
 * Один компонент и для новых кампаний (много товаров), и для добавления товара в кампанию (один).
 */
export function ProductPicker({
  products,
  photos,
  selected,
  onToggle,
  onSelectMany,
  disabled,
  max,
}: {
  products: AdvisorProduct[];
  photos?: Map<string, string | undefined>;
  selected: Set<string>;
  onToggle: (nmId: string) => void;
  /** Выбрать сразу все показанные (для нескольких кампаний). */
  onSelectMany?: (nmIds: string[]) => void;
  disabled?: boolean;
  max?: number;
}) {
  const recommended = useMemo(() => products.filter(isRecommended).sort((a, b) => (b.marginRub ?? 0) - (a.marginRub ?? 0)), [products]);
  const [scope, setScope] = useState<"rec" | "all">("rec");
  const [search, setSearch] = useState("");
  const paged = usePagedLimit(`${scope}|${search}`, 12, 12);
  const visible = useMemo(() => {
    const base = scope === "rec" ? recommended : [...recommended, ...products.filter((p) => !isRecommended(p))];
    const q = search.trim().toLowerCase();
    return q ? base.filter((p) => p.title.toLowerCase().includes(q) || p.nmId.includes(q)) : base;
  }, [scope, recommended, products, search]);
  const shown = visible.slice(0, paged.limit);
  const hidden = visible.length - shown.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented<"rec" | "all">
          size="sm"
          label="Какие товары показывать"
          layoutId={`picker-scope-${onSelectMany ? "bulk" : "add"}`}
          value={scope}
          onChange={setScope}
          options={[
            { id: "rec", label: `Рекомендуем ${recommended.length}` },
            { id: "all", label: `Все ${products.length}` },
          ]}
        />
        <div className="flex flex-wrap items-center gap-2">
          <HubInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Найти товар" className="w-52" aria-label="Поиск товара" />
          {onSelectMany && visible.length > 0 ? (
            <HubButton size="sm" variant="secondary" onClick={() => onSelectMany(visible.map((p) => p.nmId))}>
              Выбрать все ({Math.min(visible.length, max ?? visible.length)})
            </HubButton>
          ) : null}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="text-[15px]" style={{ ...hubSans, color: hub.textMuted }}>
          {scope === "rec" ? "Подходящих товаров нет: у всех есть реклама, нет остатка или нет положительной маржи. Переключите на «Все»." : "По такому запросу товаров нет."}
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((p, i) => {
            const on = selected.has(p.nmId);
            const problem = whyNot(p);
            return (
              <li key={p.nmId}>
                <button
                  type="button"
                  disabled={disabled || (!on && max != null && selected.size >= max)}
                  onClick={() => onToggle(p.nmId)}
                  aria-pressed={on}
                  className="relative flex h-full w-full items-center gap-3.5 rounded-[20px] border p-3 pr-4 text-left outline-none transition-[background-color,border-color,box-shadow] duration-150 focus-visible:shadow-[0_0_0_2px_var(--hub-canvas),0_0_0_4px_var(--hub-lime-ring)]"
                  style={{ borderColor: on ? "#2E9E6B" : "rgba(1, 20, 8, 0.14)", backgroundColor: on ? "rgba(46, 158, 107, 0.1)" : "rgba(1, 20, 8, 0.035)", boxShadow: on ? "0 0 0 1px #2E9E6B" : undefined }}
                >
                  <Thumb src={photos?.get(p.nmId)} className="h-[84px] w-[63px]" />
                  <span className="min-w-0 flex-1 pr-6">
                    {scope === "rec" && i < 3 && !search ? (
                      <span className="mb-1 inline-block rounded-[8px] px-2 py-0.5 text-[11.5px] font-bold" style={{ ...hubSans, backgroundColor: "#B9FF4B", color: hub.text }}>
                        лучший кандидат
                      </span>
                    ) : null}
                    {problem ? (
                      <span className="mb-1 inline-block rounded-[8px] px-2 py-0.5 text-[11.5px] font-bold" style={{ ...hubSans, backgroundColor: "rgba(217, 145, 43, 0.16)", color: "#9A5F0A" }}>
                        {problem}
                      </span>
                    ) : null}
                    <span className="line-clamp-2 block text-[15px] font-semibold leading-[1.3]" style={{ ...hubSans, color: hub.text }}>
                      {p.title}
                    </span>
                    <span className="mt-1.5 block text-[13.5px] leading-[1.4]" style={{ ...hubSans, color: hub.textMuted }}>
                      маржа {p.marginRub != null ? formatRub(p.marginRub) : "—"} · остаток {p.stock != null ? formatInt(p.stock) : "—"} шт.
                    </span>
                  </span>
                  <span className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full border-2" style={{ borderColor: on ? "#2E9E6B" : "rgba(1, 20, 8, 0.25)", backgroundColor: on ? "#2E9E6B" : "transparent", color: "#fff" }} aria-hidden>
                    {on ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : <Plus className="h-3.5 w-3.5" style={{ color: "rgba(1, 20, 8, 0.35)" }} />}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {hidden > 0 ? (
        <div className="flex justify-center">
          <HubButton size="sm" variant="secondary" onClick={paged.more}>
            Показать ещё {Math.min(paged.step, hidden)} из {formatInt(hidden)}
          </HubButton>
        </div>
      ) : null}
    </div>
  );
}
