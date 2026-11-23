"use client";

import { useMemo, useState } from "react";
import { buildLogisticsCost, GROWTH_PERCENT, MIN_DELIVERIES } from "@/lib/seller-hub/logistics-cost";
import { buildReturnsWhatIf } from "@/lib/seller-hub/returns-whatif";
import type { SellerCatalogSnapshot } from "@/lib/seller-hub/types";
import { downloadCsv } from "./download-file";
import { formatInt, formatRub, hub, HubButton, HubInput, hubSans } from "./hub-ui";
import { FCard, Headline, MetricCell, Thumb } from "./hub-fulfillment-ui";

const SHOWN = 15;
const mono = { fontFamily: "var(--font-geist-mono), ui-monospace, monospace", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.04em" } as const;
const pct = (v: number | null, digits = 1) => (v == null ? "—" : `${(v * 100).toLocaleString("ru-RU", { maximumFractionDigits: digits })}%`);

/**
 * Во сколько обходится логистика WB по каждому товару и где она подорожала.
 * Все суммы — из отчёта реализации WB за 28 дней, сравнение с предыдущими 28 днями. Нужна категория «Финансы» в токене.
 */
export function HubLogisticsCost({ snapshot }: { snapshot?: SellerCatalogSnapshot }) {
  const [search, setSearch] = useState("");
  const [all, setAll] = useState(false);
  const photos = useMemo(() => new Map((snapshot?.items ?? []).map((i) => [i.externalId, i.imageUrl ?? undefined])), [snapshot?.items]);
  const titles = useMemo(() => new Map((snapshot?.items ?? []).map((i) => [i.externalId, i.title || i.vendorCode || i.externalId])), [snapshot?.items]);
  const summary = useMemo(() => buildLogisticsCost(snapshot?.realization, (id) => titles.get(id) ?? `Артикул ${id}`), [snapshot?.realization, titles]);
  const whatIf = useMemo(
    () => buildReturnsWhatIf({ realization: snapshot?.realization, paidStorage: snapshot?.paidStorage, items: snapshot?.items ?? [] }),
    [snapshot?.realization, snapshot?.paidStorage, snapshot?.items],
  );
  const whatIfTotal = whatIf.reduce((s, r) => s + r.gainPerMonth, 0);
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (summary?.products ?? []).filter((p) => !q || `${p.title} ${p.nmId}`.toLowerCase().includes(q));
  }, [summary, search]);

  if (!summary) {
    return (
      <FCard title="Стоимость логистики" hint="Во сколько WB обходится доставка каждого товара и где она подорожала">
        <div className="flex flex-col items-center px-4 py-10 text-center">
          <p className="text-[19px] font-semibold" style={{ ...hubSans, color: hub.text }}>
            Пока нечего считать
          </p>
          <p className="mt-2 max-w-[56ch] text-[15.5px] leading-[1.6]" style={{ ...hubSans, color: hub.textMuted }}>
            {snapshot?.realization?.error ?? "Отчёт реализации WB ещё не загружен или в нём нет доставок за последние 28 дней."} Стоимость логистики считается по этому отчёту: нужна категория «Финансы» в API-токене.
          </p>
        </div>
      </FCard>
    );
  }

  function exportCsv() {
    downloadCsv(
      `karto-stoimost-logistiki-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Артикул WB", "Товар", "Доставок", "Цена доставки, ₽", "Была, ₽", "Изменение, %", "Возвратов", "Возвраты, %", "Логистика всего, ₽", "Выручка, ₽", "Доля в выручке, %", "Хранение, ₽", "Переплата от роста, ₽"],
      rows.map((p) => [p.nmId, p.title, p.deliveries, p.perDelivery, p.priorPerDelivery, p.changePercent, p.returns, p.returnRate == null ? "" : Math.round(p.returnRate * 1000) / 10, p.logisticsTotal, p.revenue, p.shareOfRevenue == null ? "" : Math.round(p.shareOfRevenue * 1000) / 10, p.storage, p.overpay]),
    );
  }

  const worst = summary.products.filter((p) => p.overpay > 0).sort((a, b) => b.overpay - a.overpay).slice(0, 3);

  return (
    <div className="space-y-12">
      <Headline
        items={[
          { value: formatRub(summary.logisticsTotal), label: "Логистика за 28 дней", note: summary.shareOfRevenue != null ? `${pct(summary.shareOfRevenue)} выручки` : "доставки, возвраты, прочее" },
          { value: formatRub(summary.returnCost), label: "Ушло на возвраты", note: "обратная логистика", color: summary.returnCost > 0 ? "#D9912B" : undefined },
          { value: formatRub(summary.overpay), label: "Переплата от роста тарифа", note: summary.grewCount > 0 ? `у ${summary.grewCount} товаров доставка подорожала` : "доставка не дорожала", color: summary.overpay > 0 ? "#C8453F" : undefined },
          { value: formatRub(summary.storage + summary.acceptance), label: "Хранение и приёмка", note: "из строк отчёта реализации" },
        ]}
      />

      {worst.length > 0 ? (
        <div className="rounded-[14px] px-5 py-4 text-[15.5px] leading-[1.55]" style={{ ...hubSans, backgroundColor: "rgba(1, 20, 8, 0.035)", color: hub.text, borderLeft: `3px solid ${hub.warn}` }}>
          Сильнее всего подорожала доставка: {worst.map((p) => `${p.title} (+${p.changePercent?.toLocaleString("ru-RU")}%, переплата ${formatRub(p.overpay)})`).join("; ")}. Цена доставки зависит от габаритов, склада отгрузки и района покупателя: если вы не меняли габариты, посмотрите вкладки «Склады» и «Регионы» — возможно, заказы стали уходить с дальних складов.
        </div>
      ) : null}

      {whatIf.length > 0 ? (
        <FCard title={`Что даст вдвое меньше возвратов: до ${formatRub(whatIfTotal)} в месяц`} hint="Прибыль с одной продажи по вашей марже при реальных возвратах за 90 дней и при вдвое меньших. Это гипотеза: учтена только экономия на обратной логистике">
          <ul>
            {whatIf.slice(0, 5).map((r) => (
              <li key={r.nmId} className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t py-5" style={{ borderColor: "rgba(1, 20, 8, 0.07)" }}>
                <Thumb src={photos.get(r.nmId)} />
                <div className="min-w-[200px] flex-1">
                  <p className="line-clamp-2 text-[16px] font-semibold leading-[1.3] [overflow-wrap:anywhere]" style={{ ...hubSans, color: hub.text }}>
                    {r.title}
                  </p>
                  <p className="mt-0.5 text-[14px]" style={{ ...hubSans, color: hub.textSubtle }}>
                    возвратов {r.returns90} из {r.deliveries90} ({Math.round(r.returnRate * 100)}%)
                  </p>
                </div>
                <MetricCell label="Прибыль с продажи" value={`${formatRub(r.profitNow)} → ${formatRub(r.profitWhatIf)}`} className="min-w-[160px]" />
                <div className="min-w-[120px] rounded-[12px] px-4 py-2.5 text-right" style={{ backgroundColor: "rgba(185, 255, 75, 0.35)" }}>
                  <p className="text-[12.5px]" style={{ ...hubSans, color: hub.textMuted }}>В месяц</p>
                  <p className="text-[20px] font-medium leading-none" style={{ fontFamily: "var(--font-geist-mono), ui-monospace, monospace", letterSpacing: "-0.05em", color: hub.text }}>
                    +{formatRub(r.gainPerMonth)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </FCard>
      ) : null}

      <div data-evidence="cost-table" className="rounded-[26px]">
      <FCard
        title="Стоимость логистики по товарам"
        hint={`Окно — последние 28 дней, сравнение с предыдущими 28. Цену доставки сравниваем при ${MIN_DELIVERIES} доставках и больше в обоих окнах, рост от ${GROWTH_PERCENT}% считаем заметным`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <HubInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Найти товар" className="w-52" />
            <HubButton size="sm" variant="secondary" onClick={exportCsv}>
              Скачать CSV
            </HubButton>
          </div>
        }
      >
        <div>
          <div className="hidden items-center gap-x-7 px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.07em] xl:grid xl:grid-cols-[minmax(0,1fr)_76px_112px_96px_104px_132px_104px]" style={{ ...hubSans, color: hub.textSubtle, backgroundColor: "rgba(1, 20, 8, 0.045)" }}>
            <span>Товар</span>
            <span className="text-right">Доставок</span>
            <span className="text-right">Цена доставки</span>
            <span className="text-right">Изменение</span>
            <span className="text-right">Возвраты</span>
            <span className="text-right">Логистика</span>
            <span className="text-right">Переплата</span>
          </div>
          <ul>
            {(all ? rows.slice(0, 200) : rows.slice(0, SHOWN)).map((p) => {
              const cell = "flex flex-col gap-1 xl:block xl:text-right";
              const lab = "text-[13px] xl:hidden";
              const growth = p.changePercent != null && p.changePercent >= GROWTH_PERCENT;
              const drop = p.changePercent != null && p.changePercent <= -GROWTH_PERCENT;
              return (
                <li key={p.nmId} className="border-t px-2 py-5 transition-colors hover:bg-black/[0.02]" style={{ borderColor: "rgba(1, 20, 8, 0.07)" }}>
                  <div className="grid items-center gap-x-7 gap-y-3 xl:grid-cols-[minmax(0,1fr)_76px_112px_96px_104px_132px_104px]">
                    <div className="flex min-w-0 items-center gap-4">
                      <Thumb src={photos.get(p.nmId)} />
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-[16px] font-semibold leading-[1.3] [overflow-wrap:anywhere]" style={{ ...hubSans, color: hub.text }}>
                          {p.title}
                        </p>
                        <p className="mt-0.5 text-[13.5px]" style={{ ...hubSans, color: hub.textSubtle }}>
                          {p.nmId}
                          {p.highReturn ? <span className="ml-2 rounded-full px-2 py-0.5 text-[12px] font-semibold" style={{ color: "#B42323", backgroundColor: "rgba(217, 83, 79, 0.12)" }}>много возвратов</span> : null}
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 xl:contents">
                      <p className={cell} style={mono}>
                        <span className={lab} style={{ ...hubSans, color: hub.textSubtle }}>Доставок</span>
                        <span className="text-[20px] font-medium" style={{ color: hub.text }}>{formatInt(p.deliveries)}</span>
                      </p>
                      <p className={cell} style={mono}>
                        <span className={lab} style={{ ...hubSans, color: hub.textSubtle }}>Цена доставки</span>
                        <span className="whitespace-nowrap text-[18px] font-medium" style={{ color: p.perDelivery == null ? hub.textSubtle : hub.text }}>{p.perDelivery == null ? "мало данных" : formatRub(p.perDelivery)}</span>
                      </p>
                      <p className={cell} style={mono}>
                        <span className={lab} style={{ ...hubSans, color: hub.textSubtle }}>Изменение</span>
                        <span className="inline-block rounded-full px-2.5 py-0.5 text-[16px] font-medium" style={{ color: p.changePercent == null ? hub.textSubtle : growth ? "#B42323" : drop ? "#067A55" : hub.textMuted, backgroundColor: growth ? "rgba(217, 83, 79, 0.12)" : drop ? "rgba(46, 158, 107, 0.13)" : undefined }}>
                          {p.changePercent == null ? "—" : `${p.changePercent > 0 ? "+" : ""}${p.changePercent.toLocaleString("ru-RU")}%`}
                        </span>
                      </p>
                      <p className={cell} style={mono}>
                        <span className={lab} style={{ ...hubSans, color: hub.textSubtle }}>Возвраты</span>
                        <span className="text-[17px] font-medium" style={{ color: p.returns > 0 ? hub.text : hub.textSubtle }}>{p.returns > 0 ? `${formatInt(p.returns)} · ${pct(p.returnRate, 0)}` : "—"}</span>
                      </p>
                      <p className={cell} style={mono}>
                        <span className={lab} style={{ ...hubSans, color: hub.textSubtle }}>Логистика</span>
                        <span>
                          <span className="block whitespace-nowrap text-[18px] font-medium" style={{ color: hub.text }}>{formatRub(p.logisticsTotal)}</span>
                          {p.shareOfRevenue != null ? <span className="block text-[12.5px]" style={{ ...hubSans, letterSpacing: 0, color: hub.textSubtle }}>{pct(p.shareOfRevenue)} выручки</span> : null}
                        </span>
                      </p>
                      <p className={cell} style={mono}>
                        <span className={lab} style={{ ...hubSans, color: hub.textSubtle }}>Переплата</span>
                        <span className="whitespace-nowrap text-[17px] font-medium" style={{ color: p.overpay > 0 ? "#B42323" : hub.textSubtle }}>{p.overpay > 0 ? formatRub(p.overpay) : "—"}</span>
                      </p>
                    </div>
                  </div>
                </li>
              );
            })}
            {rows.length === 0 ? (
              <li className="border-t px-5 py-10 text-center text-[15.5px]" style={{ ...hubSans, color: hub.textMuted, borderColor: "rgba(1, 20, 8, 0.07)" }}>
                Товаров по такому запросу нет.
              </li>
            ) : null}
          </ul>
          {rows.length > SHOWN && !search ? (
            <div className="pt-4">
              <HubButton size="sm" variant="ghost" onClick={() => setAll((v) => !v)}>
                {all ? "Свернуть" : `Показать все (${rows.length})`}
              </HubButton>
            </div>
          ) : null}
        </div>
      </FCard>
      </div>
    </div>
  );
}
