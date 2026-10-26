"use client";

import { useMemo } from "react";
import { Filter } from "lucide-react";
import { productFunnels, orderSources, storeFunnel, type FunnelStep } from "@/lib/seller-hub/funnel-analysis";
import { diagnoseProducts, STAGE_HYPOTHESES, type DiagnosisBlocker } from "@/lib/seller-hub/product-diagnosis";
import type { SellerCatalogSnapshot } from "@/lib/seller-hub/types";
import type { AdsData } from "./hub-ads-data";
import { formatInt, formatRub, hub, HubEmptyState, HubPanel, HubPanelHeader } from "./hub-ui";

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
  if (b.kind === "stock") return `Запаса хватит примерно на ${b.days.toLocaleString("ru-RU")} дн. при текущем темпе: сначала поставка, иначе рост упрётся в пустой склад.`;
  return `Рейтинг ${b.rating.toLocaleString("ru-RU")} при среднем по магазину ${b.storeRating.toLocaleString("ru-RU")}: он мешает конверсии.`;
}

const JAM_TEXT =
  "Воронка (переходы, корзина, заказы, выкуп) приходит из отчёта WB, который доступен на подписке «Джем». Для сбора этих данных нужна подписка Джем: подключите её в кабинете WB, и здесь появится путь покупателя по магазину и по каждому товару.";

const pct = (value: number | null) => (value == null ? "—" : `${value.toLocaleString("ru-RU")}%`);

function delta(now: number | null, past: number | null): string | null {
  if (now == null || past == null) return null;
  const diff = Math.round((now - past) * 10) / 10;
  if (diff === 0) return "как раньше";
  return `${diff > 0 ? "+" : ""}${diff.toLocaleString("ru-RU")} п. п. к прошлому периоду`;
}

function StepCard({ step, max }: { step: FunnelStep; max: number }) {
  const width = max > 0 ? Math.max(3, Math.round((step.count / max) * 100)) : 0;
  const lagged = step.id === "buyout";
  const change = lagged ? null : delta(step.conversion, step.pastConversion);
  return (
    <div className="rounded-xl p-4" style={{ backgroundColor: hub.surfaceMuted }}>
      <div className="text-[12px] font-semibold" style={{ color: hub.textMuted }}>
        {step.label}
      </div>
      <div className={`mt-1 text-[22px] font-extrabold tabular-nums`} style={{ color: hub.text }}>
        {formatInt(step.count)}
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: hub.border }}>
        <div className="h-full rounded-full" style={{ width: `${width}%`, backgroundColor: hub.blue }} />
      </div>
      {lagged ? (
        <div className="mt-2 text-[12.5px]" style={{ color: hub.textMuted }}>
          Выкуп приходит с задержкой в несколько недель, поэтому по свежим заказам доля не показательна
        </div>
      ) : step.conversion != null ? (
        <div className="mt-2 text-[12.5px]" style={{ color: hub.textMuted }}>
          {pct(step.conversion)} от предыдущего шага
          {change ? <span style={{ color: hub.textMuted }}> · {change}</span> : null}
        </div>
      ) : (
        <div className="mt-2 text-[12.5px]" style={{ color: hub.textMuted }}>
          Начало пути
        </div>
      )}
    </div>
  );
}

export function HubAdsSources({ snapshot, data }: { snapshot?: SellerCatalogSnapshot; data: AdsData }) {
  const funnel = snapshot?.funnel;
  const store = useMemo(() => storeFunnel(funnel), [funnel]);
  const products = useMemo(() => productFunnels(funnel), [funnel]);
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
  const jam = funnel?.status === "jam_required" || /Джем|джем/i.test(funnel?.error ?? "");

  return (
    <div className="space-y-5">
      <HubPanel>
        <HubPanelHeader
          title="Откуда приходят заказы"
          hint={
            sources
              ? `За ${sources.days} дн., где есть и реклама, и данные магазина. WB не разделяет органику и акции, поэтому они в одной строке.`
              : "Сравнение заказов магазина с заказами по рекламе."
          }
        />
        <div className="p-5 sm:p-6">
          {sources ? (
            <div className="space-y-3">
              {[
                { label: "Реклама (за деньги)", value: sources.adDirect, color: hub.blue },
                { label: "Реклама (WB отнёс к вашей кампании без расхода на товар)", value: sources.adAssociated, color: hub.warn },
                { label: "Органика и акции", value: sources.organic, color: hub.green },
              ].map((part) => {
                const share = sources.total > 0 ? Math.round((part.value / sources.total) * 100) : 0;
                return (
                  <div key={part.label}>
                    <div className="flex items-baseline justify-between gap-3 text-[13.5px]">
                      <span style={{ color: hub.text }}>{part.label}</span>
                      <span className="tabular-nums" style={{ color: hub.textMuted }}>
                        {formatInt(part.value)} из {formatInt(sources.total)} · {share}%
                      </span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full" style={{ backgroundColor: hub.border }}>
                      <div className="h-full rounded-full" style={{ width: `${share}%`, backgroundColor: part.color }} />
                    </div>
                  </div>
                );
              })}
              <p className="pt-1 text-[12.5px]" style={{ color: hub.textMuted }}>
                Если доля рекламы растёт, а органика падает, магазин держится на оплаченном трафике: следите за ДРР и позициями в поиске.
              </p>
            </div>
          ) : (
            <p className="text-[13.5px]" style={{ color: hub.textMuted }}>
              {data.hasCampaigns
                ? "Пока нет общих дней у рекламы и данных магазина или не загружена статистика рекламы."
                : "Нет активных кампаний: все заказы приходят без рекламы."}
            </p>
          )}
        </div>
      </HubPanel>

      {store ? (
        <HubPanel>
          <HubPanelHeader
            title="Путь покупателя по магазину"
            hint={`Воронка WB за ${store.dateFrom} — ${store.dateTo}. Конверсия каждого шага считается от предыдущего.`}
          />
          <div className="grid gap-3 p-5 sm:grid-cols-2 sm:p-6 xl:grid-cols-4">
            {store.steps.map((step) => (
              <StepCard key={step.id} step={step} max={store.steps[0]?.count ?? 0} />
            ))}
          </div>
        </HubPanel>
      ) : (
        <HubPanel>
          <HubEmptyState
            icon={<Filter className="h-7 w-7" />}
            title={jam ? "Нужна подписка Джем" : "Воронка пока не загружена"}
            description={
              jam
                ? JAM_TEXT
                : funnel?.truncated
                  ? "WB отдал воронку не по всем карточкам, поэтому итог по магазину не показываем: он был бы заниженным. Обновите данные позже."
                  : (funnel?.error ?? "Нажмите «Обновить данные» в шапке: воронка загрузится вместе с остальным.")
            }
          />
        </HubPanel>
      )}

      {diagnoses.length > 0 ? (
        <HubPanel>
          <HubPanelHeader
            title="Что тормозит товары"
            hint="Каждый товар сравниваем с остальным магазином. Показываем только отличия, которые не объясняются случайностью. Потенциал — оценка: сколько заказов добавилось бы при выходе на уровень магазина."
          />
          <ul className="divide-y" style={{ borderColor: hub.borderSoft }}>
            {diagnoses.slice(0, 8).map((d) => (
              <li key={`${d.nmId}-${d.stage}`} className="space-y-2 px-5 py-4 sm:px-6">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-[14px] font-semibold" style={{ color: hub.text }}>{titleOf(d.nmId)}</div>
                    <div className="text-[12px]" style={{ color: hub.textMuted }}>{d.nmId}</div>
                  </div>
                  <div className="text-[13px] tabular-nums" style={{ color: hub.textMuted }}>
                    около <strong style={{ color: hub.text }}>+{d.extraOrders.toLocaleString("ru-RU")} заказов</strong>
                    {d.extraRevenue != null ? ` · ${formatRub(d.extraRevenue)}` : ""} за период
                  </div>
                </div>
                <p className="text-[13.5px]" style={{ color: hub.text }}>
                  <strong>{STAGE_TITLE[d.stage]}:</strong> {d.mine.toLocaleString("ru-RU")}% против {d.benchmark.toLocaleString("ru-RU")}% у остального магазина.
                </p>
                {d.blockers.length > 0 ? (
                  <ul className="space-y-1">
                    {d.blockers.map((b) => (
                      <li key={b.kind} className="rounded-lg px-3 py-2 text-[13px] leading-5" style={{ backgroundColor: hub.warnSoft, color: hub.warn }}>
                        {blockerText(b)}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <ul className="list-disc space-y-0.5 pl-5 text-[13px] leading-5" style={{ color: hub.textMuted }}>
                  {STAGE_HYPOTHESES[d.stage].map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </HubPanel>
      ) : null}

      {products.length > 0 ? (
        <HubPanel>
          <HubPanelHeader
            title="Где товары теряют покупателей"
            hint="Слабый шаг — где конверсия товара ниже средней по магазину. Оцениваем только при достаточном числе переходов."
          />
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-left">
              <thead style={{ backgroundColor: hub.surfaceMuted }}>
                <tr>
                  {["Товар", "Переходы", "В корзину", "В заказ", "Выкупов", "Слабое место"].map((label) => (
                    <th key={label} className="border-b px-4 py-3 text-[11.5px] font-bold uppercase tracking-[0.06em]" style={{ borderColor: hub.border, color: hub.textMuted }}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {products.slice(0, 30).map((row) => (
                  <tr key={row.nmId} className="border-b" style={{ borderColor: hub.borderSoft }}>
                    <td className="max-w-[260px] px-4 py-3 text-[13.5px]" style={{ color: hub.text }}>
                      <div className="truncate font-semibold">{titleOf(row.nmId)}</div>
                      <div className="text-[12px]" style={{ color: hub.textMuted }}>{row.nmId}</div>
                    </td>
                    <td className={`px-4 py-3 text-[13.5px] tabular-nums`}>{formatInt(row.open)}</td>
                    <td className={`px-4 py-3 text-[13.5px] tabular-nums`}>{pct(row.openToCart)}</td>
                    <td className={`px-4 py-3 text-[13.5px] tabular-nums`}>{pct(row.cartToOrder)}</td>
                    <td className="px-4 py-3 text-[13.5px] tabular-nums">{formatInt(row.buyout)}</td>
                    <td className="px-4 py-3 text-[13px]" style={{ color: row.weakest ? hub.warn : hub.textMuted }}>
                      {row.weakest ? `${STEP_NAME[row.weakest.step]}: ниже средней на ${row.weakest.gapPoints.toLocaleString("ru-RU")} п. п.` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-5 py-3 text-[12.5px] sm:px-6" style={{ color: hub.textMuted }}>
            Мало переходов в корзину — улучшайте главное фото, цену и отзывы. Мало заказов из корзины — смотрите цену и сроки доставки. Выкупы в этой таблице — просто число: они приходят с задержкой, поэтому долю выкупа по свежим заказам не оцениваем.
          </p>
        </HubPanel>
      ) : null}
    </div>
  );
}
