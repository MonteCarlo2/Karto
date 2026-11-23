"use client";

import { useMemo } from "react";
import { ChevronDown, Filter, Lightbulb } from "lucide-react";
import { productFunnels, orderSources, storeFunnel, type FunnelStep } from "@/lib/seller-hub/funnel-analysis";
import { diagnoseProducts, STAGE_HYPOTHESES, type DiagnosisBlocker } from "@/lib/seller-hub/product-diagnosis";
import type { SellerCatalogSnapshot } from "@/lib/seller-hub/types";
import type { AdsData } from "./hub-ads-data";
import { Card } from "./hub-analytics-ui";
import { Thumb } from "./hub-fulfillment-ui";
import { FunnelSteps, type FunnelStage } from "./hub-analytics-funnel";
import { HelpTip } from "./hub-help-tip";
import { formatInt, formatRub, hub, HubEmptyState, hubSans } from "./hub-ui";
import { usePagedLimit } from "./use-paged-limit";

const MONO = { fontFamily: "var(--font-geist-mono), ui-monospace, monospace", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.04em" } as const;
const LINE = "rgba(1, 20, 8, 0.1)";

const STEP_NAME = {
  openToCart: "Из карточки в корзину",
  cartToOrder: "Из корзины в заказ",
} as const;

const STAGE_TITLE = {
  openToCart: "Мало кладут в корзину",
  cartToOrder: "Кладут в корзину, но не заказывают",
} as const;

function blockerText(b: DiagnosisBlocker): string {
  if (b.kind === "loss") return `Товар убыточен (маржа ${b.marginPercent.toLocaleString("ru-RU")}%): рост продаж увеличит убыток. Сначала цена или себестоимость.`;
  if (b.kind === "stock") return `Запаса хватит примерно на ${b.days.toLocaleString("ru-RU")} дн.: сначала поставка, иначе рост упрётся в пустой склад.`;
  return `Рейтинг ${b.rating.toLocaleString("ru-RU")} при среднем по магазину ${b.storeRating.toLocaleString("ru-RU")}: он мешает конверсии.`;
}

const pct = (value: number | null) => (value == null ? "—" : `${value.toLocaleString("ru-RU")}%`);

/** Воронка магазина в том же виде, что во вкладке «Аналитика»: ступени сужаются, между ними доля дошедших. */
function FunnelView({ steps }: { steps: FunnelStep[] }) {
  const stages: FunnelStage[] = steps.map((st) => ({
    id: st.id,
    label: st.label,
    cur: st.count,
    past: st.pastCount,
    rate: st.conversion != null ? st.conversion / 100 : null,
    rateLabel: st.id === "buyout" ? "по заказам (выкуп приходит с задержкой)" : st.id === "cart" ? "из карточки" : "из корзины",
  }));
  return <FunnelSteps stages={stages} />;
}

export function HubAdsSources({ snapshot, data, photos }: { snapshot?: SellerCatalogSnapshot; data: AdsData; photos?: Map<string, string | undefined> }) {
  const funnel = snapshot?.funnel;
  const store = useMemo(() => storeFunnel(funnel), [funnel]);
  const products = useMemo(() => productFunnels(funnel), [funnel]);
  const lossPaged = usePagedLimit("loss", 10, 10);
  const sources = useMemo(() => {
    if (!data.summary) return null;
    const associated = data.associated?.orders ?? 0;
    return orderSources({
      adDaily: data.series,
      adDirectOrders: Math.max(0, data.summary.orders - associated),
      adAssociatedOrders: associated,
      storeDaily: snapshot?.analytics?.daily ?? [],
    });
  }, [data.series, data.summary, data.associated, snapshot?.analytics]);

  const diagnoses = useMemo(() => {
    const ratings = new Map<string, { rating: number; reviews: number }>();
    for (const [nmId, s] of Object.entries(snapshot?.feedbacks?.byNm ?? {})) {
      if (s.ratingAvg != null && s.reviewCount180 > 0) ratings.set(nmId, { rating: s.ratingAvg, reviews: s.reviewCount180 });
    }
    return diagnoseProducts({
      funnel,
      products: data.advisorProducts.map((p) => ({ nmId: p.nmId, marginPercent: p.marginPercent, stock: p.stock })),
      ratings,
    });
  }, [funnel, data.advisorProducts, snapshot?.feedbacks]);

  const titleOf = (nmId: string) => data.titles.get(nmId) ?? `Артикул ${nmId}`;
  const gridCols = "md:grid-cols-[minmax(0,2fr)_repeat(4,minmax(80px,0.8fr))_minmax(180px,1.6fr)]";
  const shownProducts = products.slice(0, lossPaged.limit);

  return (
    <div className="space-y-6">
      <Card
        title="Откуда приходят заказы"
        hint={sources ? `За ${sources.days} дн. Органика и акции в одной строке: WB их не разделяет.` : "Заказы магазина и заказы по рекламе."}
        action={
          sources ? (
            <HelpTip title="Как читать" align="right">
              <p>Если доля рекламы растёт, а органика падает, магазин держится на оплаченном трафике. Следите за ДРР и позициями в поиске.</p>
            </HelpTip>
          ) : null
        }
      >
        {sources ? (
          <div>
            <div className="hub-grow flex h-5 overflow-hidden rounded-full" style={{ backgroundColor: "rgba(1, 20, 8, 0.08)" }} role="img" aria-label="Доли источников заказов">
              {[
                { value: sources.adDirect, color: "#4F7CC4" },
                { value: sources.adAssociated, color: "#D9912B" },
                { value: sources.organic, color: "#2E9E6B" },
              ].map((part, i) => (
                <div key={i} style={{ width: `${sources.total > 0 ? (part.value / sources.total) * 100 : 0}%`, backgroundColor: part.color }} />
              ))}
            </div>
            <ul className="mt-6 grid gap-x-8 gap-y-6 sm:grid-cols-3">
              {[
                { label: "Реклама за деньги", value: sources.adDirect, color: "#4F7CC4" },
                { label: "Реклама без расхода на товар", hint: "WB отнёс заказ к вашей кампании, хотя на этот товар деньги не тратились", value: sources.adAssociated, color: "#D9912B" },
                { label: "Органика и акции", value: sources.organic, color: "#2E9E6B" },
              ].map((part) => {
                const share = sources.total > 0 ? Math.round((part.value / sources.total) * 100) : 0;
                return (
                  <li key={part.label}>
                    <div className="flex items-center gap-2 text-[15.5px] font-semibold" style={{ ...hubSans, color: hub.text }}>
                      <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: part.color }} aria-hidden />
                      {part.label}
                      {"hint" in part && part.hint ? (
                        <HelpTip title={part.label} align="left">
                          <p>{part.hint}</p>
                        </HelpTip>
                      ) : null}
                    </div>
                    <p className="mt-2 flex items-baseline gap-3" style={MONO}>
                      <span className="text-[34px] font-medium leading-none" style={{ color: hub.text }}>
                        {formatInt(part.value)}
                      </span>
                      <span className="text-[18px]" style={{ ...hubSans, letterSpacing: 0, color: hub.textMuted }}>
                        {share}%
                      </span>
                    </p>
                    <p className="mt-1 text-[14px]" style={{ ...hubSans, color: hub.textSubtle }}>
                      из {formatInt(sources.total)} заказов
                    </p>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <p className="text-[16px]" style={{ ...hubSans, color: hub.textMuted }}>
            {data.hasCampaigns ? "Пока нет общих дней у рекламы и данных магазина или не загружена статистика рекламы." : "Нет активных кампаний: все заказы приходят без рекламы."}
          </p>
        )}
      </Card>

      {store ? (
        <Card title="Путь покупателя по магазину" hint={`Воронка WB за ${store.dateFrom} — ${store.dateTo}. Конверсия каждого шага от предыдущего.`}>
          <FunnelView steps={store.steps} />
        </Card>
      ) : (
        <Card title="Путь покупателя по магазину">
          <HubEmptyState
            icon={<Filter className="h-7 w-7" />}
            title="Воронка пока недоступна"
            description={
              funnel?.truncated
                ? "WB отдал воронку не по всем карточкам, поэтому итог по магазину не показываем: он был бы заниженным. Обновите данные позже."
                : "Данные о переходах, корзине и заказах появятся здесь, когда WB их отдаст. Нажмите «Обновить данные» в шапке."
            }
          />
        </Card>
      )}

      {diagnoses.length > 0 ? (
        <Card title="Что тормозит товары" hint="Каждый товар сравниваем с остальным магазином и показываем только заметные отличия. Потенциал — оценка добавочных заказов при выходе на уровень магазина.">
          <ul className="space-y-4">
            {diagnoses.slice(0, 8).map((d) => (
              <li key={`${d.nmId}-${d.stage}`} className="hub-rise rounded-[24px] border p-5 sm:p-6" style={{ borderColor: "rgba(217, 145, 43, 0.35)", background: `linear-gradient(160deg, rgba(217, 145, 43, 0.07), ${hub.canvas} 65%)` }}>
                <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
                  <div className="flex min-w-0 items-center gap-4">
                    <Thumb src={photos?.get(d.nmId)} className="h-[84px] w-[63px]" />
                    <div className="min-w-0">
                      <p className="line-clamp-2 text-[19px] font-semibold leading-[1.3]" style={{ ...hubSans, color: hub.text }}>
                        {titleOf(d.nmId)}
                      </p>
                      <p className="mt-1 text-[14px]" style={{ ...hubSans, color: hub.textSubtle }}>
                        № {d.nmId}
                      </p>
                    </div>
                  </div>
                  <div className="text-right" style={MONO}>
                    <p className="text-[28px] font-medium leading-none" style={{ color: hub.text }}>
                      +{d.extraOrders.toLocaleString("ru-RU")}
                    </p>
                    <p className="mt-1.5 text-[14px]" style={{ ...hubSans, letterSpacing: 0, color: hub.textSubtle }}>
                      заказов за период{d.extraRevenue != null ? ` · ${formatRub(d.extraRevenue)}` : ""}
                    </p>
                  </div>
                </div>
                <p className="mt-5 text-[19px] font-semibold leading-[1.35]" style={{ ...hubSans, color: hub.text }}>
                  {STAGE_TITLE[d.stage]}: {d.mine.toLocaleString("ru-RU")}% против {d.benchmark.toLocaleString("ru-RU")}% у остального магазина
                </p>
                {d.blockers.length > 0 ? (
                  <ul className="mt-4 space-y-2">
                    {d.blockers.map((b) => (
                      <li key={b.kind} className="rounded-[14px] px-4 py-3 text-[15.5px] leading-[1.5]" style={{ ...hubSans, backgroundColor: "rgba(217, 145, 43, 0.14)", color: "#7A4A06" }}>
                        {blockerText(b)}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <div className="mt-5 flex items-start gap-3 border-t pt-5" style={{ borderColor: LINE }}>
                  <span className="mt-[1px] flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: "rgba(185, 255, 75, 0.55)" }} aria-hidden>
                    <Lightbulb className="h-[18px] w-[18px]" style={{ color: hub.text }} />
                  </span>
                  <div>
                    <p className="text-[16.5px] font-semibold" style={{ ...hubSans, color: hub.text }}>
                      Что проверить
                    </p>
                    <ul className="mt-1.5 space-y-1">
                      {STAGE_HYPOTHESES[d.stage].map((line) => (
                        <li key={line} className="text-[15.5px] leading-[1.5]" style={{ ...hubSans, color: hub.textMuted }}>
                          {line}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {products.length > 0 ? (
        <Card
          title="Где товары теряют покупателей"
          hint="Слабый шаг: конверсия товара ниже средней по магазину. Оцениваем при достаточном числе переходов."
          action={
            <HelpTip title="Что делать" align="right">
              <p>Мало переходов в корзину: улучшайте главное фото, цену и отзывы.</p>
              <p className="mt-2">Мало заказов из корзины: смотрите цену и сроки доставки.</p>
              <p className="mt-2">Выкупы приходят с задержкой, поэтому долю выкупа по свежим заказам не оцениваем.</p>
            </HelpTip>
          }
        >
          <details className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-[16px] px-5 py-4 text-[16px] font-semibold outline-none [&::-webkit-details-marker]:hidden" style={{ ...hubSans, color: hub.text, backgroundColor: "rgba(1, 20, 8, 0.045)" }}>
            Показать воронку по каждому товару ({products.length})
            <ChevronDown className="h-5 w-5 transition-transform group-open:rotate-180" style={{ color: hub.textMuted }} aria-hidden />
          </summary>
          <div className={`mt-4 hidden gap-x-4 border-b pb-3 text-[14px] md:grid ${gridCols}`} style={{ ...hubSans, color: hub.textSubtle, borderColor: "rgba(1, 20, 8, 0.14)" }}>
            <span>Товар</span>
            <span className="text-right">Переходы</span>
            <span className="text-right">В корзину</span>
            <span className="text-right">В заказ</span>
            <span className="text-right">Выкупов</span>
            <span>Слабое место</span>
          </div>
          <ul className="divide-y" style={{ borderColor: LINE }}>
            {shownProducts.map((row) => (
              <li key={row.nmId} className={`grid items-center gap-x-4 gap-y-2 py-4 ${gridCols}`} style={{ borderColor: LINE }}>
                <div className="flex min-w-0 items-center gap-3.5">
                  <Thumb src={photos?.get(row.nmId)} className="h-[56px] w-[42px]" />
                  <p className="line-clamp-2 text-[16px] font-semibold leading-[1.3]" style={{ ...hubSans, color: hub.text }}>
                    {titleOf(row.nmId)}
                  </p>
                </div>
                {[
                  ["Переходы", formatInt(row.open)],
                  ["В корзину", pct(row.openToCart)],
                  ["В заказ", pct(row.cartToOrder)],
                  ["Выкупов", formatInt(row.buyout)],
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
                <p className="text-[15px] leading-[1.4]" style={{ ...hubSans, color: row.weakest ? "#B8741A" : hub.textSubtle, fontWeight: row.weakest ? 600 : 400 }}>
                  {row.weakest ? `${STEP_NAME[row.weakest.step]}: ниже средней на ${row.weakest.gapPoints.toLocaleString("ru-RU")} п. п.` : "—"}
                </p>
              </li>
            ))}
          </ul>
          {products.length > shownProducts.length ? (
            <div className="mt-3 flex justify-center">
              <button type="button" onClick={lossPaged.more} className="rounded-full px-4 py-2 text-[14.5px] font-semibold" style={{ ...hubSans, color: hub.text, backgroundColor: "rgba(1, 20, 8, 0.06)" }}>
                Показать ещё {Math.min(lossPaged.step, products.length - shownProducts.length)} из {products.length - shownProducts.length}
              </button>
            </div>
          ) : null}
          </details>
        </Card>
      ) : null}
    </div>
  );
}
