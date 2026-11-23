"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronDown, Lightbulb, Search } from "lucide-react";
import { lastFullDaysRange, snapshotTimeMs } from "@/lib/seller-hub/complete-days";
import { loadSellerHubSearchTexts } from "@/lib/seller-hub/client-api";
import { analyzeSearchTexts, type SeoRow } from "@/lib/seller-hub/seo";
import type { SellerCatalogSnapshot, SellerSearchTexts } from "@/lib/seller-hub/types";
import { Card } from "./hub-analytics-ui";
import { Thumb } from "./hub-fulfillment-ui";
import { HelpTip } from "./hub-help-tip";
import { formatInt, hub, HubButton, HubEmptyState, HubInput, hubSans } from "./hub-ui";
import { usePagedLimit } from "./use-paged-limit";

const MONO = { fontFamily: "var(--font-geist-mono), ui-monospace, monospace", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.04em" } as const;
const LINE = "rgba(1, 20, 8, 0.1)";
const GRID = "md:grid-cols-[minmax(0,2.2fr)_repeat(3,minmax(70px,0.7fr))_minmax(90px,0.8fr)_minmax(110px,0.9fr)]";

function shiftDate(iso: string, deltaDays: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + deltaDays * 86_400_000).toISOString().slice(0, 10);
}

const POSITION_STYLE: Record<SeoRow["positionClass"], { label: string; color: string }> = {
  top10: { label: "топ-10", color: "#2E9E6B" },
  mid: { label: "11–40", color: "#D9912B" },
  low: { label: "ниже 40", color: "#C8453F" },
};

/** Текст ошибки для человека: служебные причины (в том числе про тарифы WB) не показываем. */
function friendly(message: string): string {
  return /джем|jam|подписк/i.test(message) ? "WB пока не отдаёт поисковые запросы по этому кабинету. Они появятся здесь сами, как только данные станут доступны." : message;
}

/** Поиск и SEO: по каким запросам находят товар, где вы в выдаче и каких слов не хватает карточке. Только чтение, данные WB. */
export function HubSeo({ snapshot, connected }: { snapshot?: SellerCatalogSnapshot; connected?: boolean }) {
  const reduce = useReducedMotion();
  const items = useMemo(() => snapshot?.items ?? [], [snapshot]);
  /** Товары в порядке спроса: сначала те, что чаще заказывают. */
  const options = useMemo(() => {
    const orders = (nm: string) => snapshot?.funnel?.byNm?.[nm]?.orders ?? 0;
    return [...items].sort((a, b) => orders(b.externalId) - orders(a.externalId)).slice(0, 60);
  }, [items, snapshot?.funnel]);
  const [nmId, setNmId] = useState<string>("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const selectedNm = nmId || options[0]?.externalId || "";
  const selected = items.find((item) => item.externalId === selectedNm) ?? null;
  const [data, setData] = useState<{ nmId: string; texts: SellerSearchTexts; stale?: boolean } | null>(null);
  const [error, setError] = useState<{ nmId: string; message: string } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const pagedRows = usePagedLimit(selectedNm, 10, 10);
  const pagedPick = usePagedLimit(pickerSearch, 8, 8);

  const nowMs = snapshotTimeMs(snapshot);
  const range = useMemo(() => lastFullDaysRange(nowMs || Date.parse("2026-01-01"), 7), [nowMs]);

  useEffect(() => {
    if (!connected || !selectedNm || !nowMs) return;
    let cancelled = false;
    void loadSellerHubSearchTexts({
      nmId: Number(selectedNm),
      dateFrom: range.dateFrom,
      dateTo: range.dateTo,
      pastDateFrom: shiftDate(range.dateFrom, -7),
      pastDateTo: shiftDate(range.dateTo, -7),
      refresh: refreshKey > 0,
    })
      .then((result) => {
        if (cancelled) return;
        if (result.ok && result.texts) {
          setData({ nmId: selectedNm, texts: result.texts, stale: result.stale });
          setError(null);
        } else {
          setError({ nmId: selectedNm, message: result.error ?? "Не удалось загрузить поисковые запросы" });
        }
      })
      .catch(() => !cancelled && setError({ nmId: selectedNm, message: "Не удалось загрузить поисковые запросы" }));
    return () => {
      cancelled = true;
    };
  }, [connected, selectedNm, nowMs, range, refreshKey]);

  const shown = data && data.nmId === selectedNm ? data : null;
  const analysis = useMemo(
    () =>
      shown && selected
        ? analyzeSearchTexts(shown.texts.rows, { title: selected.title ?? "", description: selected.description ?? null })
        : null,
    [shown, selected],
  );
  const loading = connected === true && !shown && !(error && error.nmId === selectedNm);
  const [copied, setCopied] = useState(false);

  const pickerList = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    return q ? options.filter((o) => (o.title ?? "").toLowerCase().includes(q) || o.externalId.includes(q)) : options;
  }, [options, pickerSearch]);

  if (!connected || options.length === 0) {
    return (
      <Card title="Поиск и SEO">
        <HubEmptyState icon={<Search className="h-7 w-7" />} title="Пока нечего показывать" description="Подключите кабинет и выгрузите каталог: поисковые запросы строятся по вашим товарам." />
      </Card>
    );
  }

  async function copyKeywords() {
    if (!analysis) return;
    try {
      await navigator.clipboard.writeText(analysis.missingKeywords.map((k) => k.word).join(", "));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* буфер обмена недоступен */
    }
  }

  const topCount = analysis?.rows.filter((row) => row.positionClass === "top10").length ?? 0;
  const rise = (delay = 0) => (reduce ? {} : { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.35, delay, ease: [0.22, 1, 0.36, 1] as const } });
  const rowsShown = analysis ? analysis.rows.slice(0, pagedRows.limit) : [];

  return (
    <div className="space-y-6">
      <Card
        title="Поиск и SEO"
        hint="По каким запросам покупатели находят товар, на каком месте вы в выдаче и каких слов не хватает карточке."
        action={
          <div className="flex items-center gap-3">
            <HelpTip title="Откуда данные" align="right">
              <p>Запросы покупателей в поиске WB за {range.dateFrom} — {range.dateTo}, до 30 самых результативных по заказам. WB обновляет отчёт раз в 2 часа.</p>
              <p className="mt-2">Для запросов вашей рекламы средняя позиция есть ещё во вкладке «Кампании», раздел «Ставки и запросы».</p>
            </HelpTip>
            <HubButton variant="secondary" size="sm" onClick={() => setRefreshKey((n) => n + 1)}>
              Обновить
            </HubButton>
          </div>
        }
      >
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-[20px] p-4 sm:p-5" style={{ backgroundColor: "rgba(1, 20, 8, 0.045)" }}>
          <div className="flex min-w-0 items-center gap-4">
            <Thumb src={selected?.imageUrl ?? undefined} className="h-[84px] w-[63px]" />
            <div className="min-w-0">
              <p className="text-[14px]" style={{ ...hubSans, color: hub.textSubtle }}>
                Товар
              </p>
              <p className="line-clamp-2 text-[19px] font-semibold leading-[1.3]" style={{ ...hubSans, color: hub.text }}>
                {selected?.title || selected?.vendorCode || selectedNm}
              </p>
            </div>
          </div>
          <HubButton variant="secondary" onClick={() => setPickerOpen((v) => !v)} aria-expanded={pickerOpen}>
            Сменить товар
            <ChevronDown className="h-4 w-4 transition-transform" style={{ transform: pickerOpen ? "rotate(180deg)" : undefined }} aria-hidden />
          </HubButton>
        </div>

        <AnimatePresence initial={false}>
          {pickerOpen ? (
            <motion.div
              key="picker"
              initial={reduce ? false : { height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <div className="pt-4">
                <HubInput value={pickerSearch} onChange={(e) => setPickerSearch(e.target.value)} placeholder="Найти товар" className="w-full sm:w-72" aria-label="Поиск товара" />
                <ul className="mt-3 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                  {pickerList.slice(0, pagedPick.limit).map((o) => {
                    const on = o.externalId === selectedNm;
                    return (
                      <li key={o.externalId}>
                        <button
                          type="button"
                          onClick={() => {
                            setNmId(o.externalId);
                            setPickerOpen(false);
                          }}
                          aria-pressed={on}
                          className="flex h-full w-full items-center gap-3 rounded-[18px] border p-2.5 pr-4 text-left outline-none transition-[background-color,border-color] hover:bg-black/[0.04] focus-visible:shadow-[0_0_0_2px_var(--hub-canvas),0_0_0_4px_var(--hub-lime-ring)]"
                          style={{ borderColor: on ? "#2E9E6B" : "rgba(1, 20, 8, 0.14)", backgroundColor: on ? "rgba(46, 158, 107, 0.1)" : "transparent" }}
                        >
                          <Thumb src={o.imageUrl ?? undefined} className="h-[60px] w-[45px]" />
                          <span className="line-clamp-2 text-[15px] font-semibold leading-[1.3]" style={{ ...hubSans, color: hub.text }}>
                            {o.title || o.vendorCode || o.externalId}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {pickerList.length > pagedPick.limit ? (
                  <div className="mt-3 flex justify-center">
                    <HubButton size="sm" variant="secondary" onClick={pagedPick.more}>
                      Показать ещё {Math.min(pagedPick.step, pickerList.length - pagedPick.limit)} из {pickerList.length - pagedPick.limit}
                    </HubButton>
                  </div>
                ) : null}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {error && error.nmId === selectedNm ? (
          <p className="mt-5 text-[16px] leading-[1.5]" style={{ ...hubSans, color: hub.textMuted }}>
            {friendly(error.message)}
          </p>
        ) : null}
        {loading ? (
          <div className="mt-5 space-y-3" aria-busy>
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-[16px]" style={{ backgroundColor: "rgba(1, 20, 8, 0.05)" }} />
            ))}
          </div>
        ) : null}
        {shown?.stale ? (
          <p className="mt-4 text-[14.5px]" style={{ ...hubSans, color: "#B8741A" }}>
            WB сейчас не ответил, показаны последние сохранённые данные.
          </p>
        ) : null}
        {analysis && analysis.rows.length === 0 ? (
          <p className="mt-5 text-[16px]" style={{ ...hubSans, color: hub.textMuted }}>
            По этому товару WB не вернул поисковых запросов за период: нет показов в поиске или мало данных.
          </p>
        ) : null}

        {analysis && analysis.rows.length > 0 ? (
          <motion.div {...rise()} className="mt-6 grid gap-x-8 gap-y-5 sm:grid-cols-3">
            {[
              ["Запросов", formatInt(analysis.rows.length), "по которым вас находят"],
              ["В топ-10", `${formatInt(topCount)} из ${formatInt(analysis.rows.length)}`, "запросов"],
              ["Не хватает слов", formatInt(analysis.missingKeywords.length), "в названии и описании"],
            ].map(([label, value, sub]) => (
              <div key={label}>
                <p className="text-[14.5px]" style={{ ...hubSans, color: hub.textSubtle }}>
                  {label}
                </p>
                <p className="mt-2 text-[30px] font-medium leading-none" style={{ ...MONO, color: hub.text }}>
                  {value}
                </p>
                <p className="mt-1.5 text-[14px]" style={{ ...hubSans, color: hub.textMuted }}>
                  {sub}
                </p>
              </div>
            ))}
          </motion.div>
        ) : null}
      </Card>

      {analysis && analysis.rows.length > 0 ? (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            <motion.div {...rise(0.05)}>
              <Card title="Чего не хватает карточке" hint="Слова из запросов, по которым вас ищут, но которых нет ни в названии, ни в описании.">
                {analysis.missingKeywords.length > 0 ? (
                  <>
                    <ul className="flex flex-wrap gap-2">
                      {analysis.missingKeywords.map((k) => (
                        <li key={k.word} title={`Встречается в запросах с общей частотой ${formatInt(k.frequency)}`} className="rounded-full px-3.5 py-2 text-[15px] font-medium" style={{ ...hubSans, color: hub.text, backgroundColor: "rgba(1, 20, 8, 0.06)" }}>
                          {k.word}
                        </li>
                      ))}
                    </ul>
                    <div className="mt-5 flex items-start gap-3 border-t pt-5" style={{ borderColor: LINE }}>
                      <span className="mt-[1px] flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: "rgba(185, 255, 75, 0.55)" }} aria-hidden>
                        <Lightbulb className="h-[18px] w-[18px]" style={{ color: hub.text }} />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[16.5px] leading-[1.5]" style={{ ...hubSans, color: hub.text }}>
                          Добавьте самые частые слова в название и описание.
                        </p>
                        <div className="mt-3">
                          <HubButton size="sm" variant="secondary" onClick={() => void copyKeywords()}>
                            {copied ? "Скопировано" : "Скопировать слова"}
                          </HubButton>
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="text-[16px]" style={{ ...hubSans, color: "#067A55" }}>
                    Все слова из ваших топ-запросов уже есть в названии или описании.
                  </p>
                )}
              </Card>
            </motion.div>

            <motion.div {...rise(0.1)}>
              <Card title="Куда расти" hint="Самые частые запросы, где вы пока не в топ-10. Двигаться туда стоит через описание, ставку в рекламе или цену.">
                {analysis.growth.length > 0 ? (
                  <ul className="divide-y" style={{ borderColor: LINE }}>
                    {analysis.growth.map((row) => {
                      const st = POSITION_STYLE[row.positionClass];
                      return (
                        <li key={row.text} className="flex items-center justify-between gap-4 py-3.5" style={{ borderColor: LINE }}>
                          <span className="min-w-0 text-[16px] font-semibold leading-[1.3] [overflow-wrap:anywhere]" style={{ ...hubSans, color: hub.text }}>
                            {row.text}
                          </span>
                          <span className="flex shrink-0 items-center gap-3">
                            <span className="text-[14px]" style={{ ...hubSans, color: hub.textMuted }}>
                              {formatInt(row.frequency ?? 0)} раз
                            </span>
                            <span className="rounded-full px-3 py-1 text-[15px] font-medium" style={{ ...MONO, color: st.color, backgroundColor: `color-mix(in srgb, ${st.color} 13%, white)` }}>
                              {row.avgPosition ?? "—"}
                            </span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="text-[16px]" style={{ ...hubSans, color: "#067A55" }}>
                    По частым запросам вы уже в топ-10.
                  </p>
                )}
              </Card>
            </motion.div>
          </div>

          <motion.div {...rise(0.15)}>
            <Card title="Все запросы по товару" hint="Позиция — средняя в поисковой выдаче WB за период.">
              <div className={`hidden gap-x-4 border-b pb-3 text-[14px] md:grid ${GRID}`} style={{ ...hubSans, color: hub.textSubtle, borderColor: "rgba(1, 20, 8, 0.14)" }}>
                <span>Запрос</span>
                <span className="text-right">Вводили</span>
                <span className="text-right">Переходы</span>
                <span className="text-right">Заказы</span>
                <span className="text-right">В корзину</span>
                <span className="text-right">Позиция</span>
              </div>
              <ul className="divide-y" style={{ borderColor: LINE }}>
                {rowsShown.map((row) => {
                  const st = POSITION_STYLE[row.positionClass];
                  return (
                    <li key={row.text} className={`grid items-center gap-x-4 gap-y-2 py-3.5 ${GRID}`} style={{ borderColor: LINE }}>
                      <div className="min-w-0">
                        <p className="text-[16.5px] font-semibold leading-[1.3] [overflow-wrap:anywhere]" style={{ ...hubSans, color: hub.text }}>
                          {row.text}
                        </p>
                        {row.missingWords.length > 0 ? (
                          <p className="mt-0.5 text-[14px]" style={{ ...hubSans, color: "#B8741A" }}>
                            нет в карточке: {row.missingWords.join(", ")}
                          </p>
                        ) : null}
                      </div>
                      {[
                        ["Вводили", row.frequency != null ? formatInt(row.frequency) : "—"],
                        ["Переходы", row.openCard != null ? formatInt(row.openCard) : "—"],
                        ["Заказы", row.orders != null ? formatInt(row.orders) : "—"],
                        ["В корзину", row.openToCart != null ? `${row.openToCart}%` : "—"],
                      ].map(([label, value]) => (
                        <p key={label} className="flex items-baseline justify-between gap-3 md:justify-end" style={MONO}>
                          <span className="text-[13.5px] md:hidden" style={{ ...hubSans, letterSpacing: 0, color: hub.textSubtle }}>
                            {label}
                          </span>
                          <span className="text-[18px] font-medium" style={{ color: hub.text }}>
                            {value}
                          </span>
                        </p>
                      ))}
                      <p className="flex items-center justify-between gap-3 md:justify-end">
                        <span className="text-[13.5px] md:hidden" style={{ ...hubSans, color: hub.textSubtle }}>
                          Позиция
                        </span>
                        <span className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[15px] font-medium" style={{ ...MONO, color: st.color, backgroundColor: `color-mix(in srgb, ${st.color} 13%, white)` }}>
                          {row.avgPosition ?? "—"}
                          <span className="text-[12.5px]" style={{ ...hubSans, letterSpacing: 0 }}>
                            {st.label}
                          </span>
                        </span>
                      </p>
                    </li>
                  );
                })}
              </ul>
              {analysis.rows.length > rowsShown.length ? (
                <div className="mt-4 flex justify-center">
                  <HubButton size="sm" variant="secondary" onClick={pagedRows.more}>
                    Показать ещё {Math.min(pagedRows.step, analysis.rows.length - rowsShown.length)} из {analysis.rows.length - rowsShown.length}
                  </HubButton>
                </div>
              ) : null}
            </Card>
          </motion.div>
        </>
      ) : null}
    </div>
  );
}
