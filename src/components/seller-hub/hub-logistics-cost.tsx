"use client";

import { useMemo, useState } from "react";
import { buildLogisticsCost, GROWTH_PERCENT, MIN_DELIVERIES } from "@/lib/seller-hub/logistics-cost";
import { buildReturnsWhatIf } from "@/lib/seller-hub/returns-whatif";
import type { SellerCatalogSnapshot } from "@/lib/seller-hub/types";
import { downloadCsv } from "./download-file";
import { formatInt, formatRub, hub, HubButton, HubInput, hubSans, MetricTile } from "./hub-ui";

const pct = (v: number | null, digits = 1) => (v == null ? "—" : `${(v * 100).toLocaleString("ru-RU", { maximumFractionDigits: digits })}%`);

/**
 * Во сколько обходится логистика WB по каждому товару и где она подорожала.
 * Все суммы — из отчёта реализации WB за 28 дней, сравнение с предыдущими 28 днями. Нужна категория «Финансы» в токене.
 */
export function HubLogisticsCost({ snapshot }: { snapshot?: SellerCatalogSnapshot }) {
  const [search, setSearch] = useState("");
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
      <p className="rounded-2xl px-5 py-6 text-[13px] leading-5" style={{ ...hubSans, color: hub.textMuted, backgroundColor: hub.surface }}>
        {snapshot?.realization?.error ?? "Отчёт реализации WB ещё не загружен или в нём нет доставок за последние 28 дней."} Стоимость логистики считается по этому отчёту, нужна категория «Финансы» в API-токене.
      </p>
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
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricTile label="Логистика за 28 дней" value={formatRub(summary.logisticsTotal)} sub={summary.shareOfRevenue != null ? `${pct(summary.shareOfRevenue)} выручки` : "доставки, возвраты, прочее"} />
        <MetricTile label="Ушло на возвраты" value={formatRub(summary.returnCost)} sub="обратная логистика" tone={summary.returnCost > 0 ? "warn" : "default"} />
        <MetricTile label="Переплата от роста тарифа" value={formatRub(summary.overpay)} sub={summary.grewCount > 0 ? `у ${summary.grewCount} товаров доставка подорожала` : "доставка не дорожала"} tone={summary.overpay > 0 ? "danger" : "good"} />
        <MetricTile label="Хранение и приёмка" value={formatRub(summary.storage + summary.acceptance)} sub="из строк отчёта реализации" />
      </div>

      {worst.length > 0 ? (
        <div className="rounded-2xl px-4 py-3 text-[13px] leading-5" style={{ ...hubSans, backgroundColor: hub.warnSoft, color: hub.warn }}>
          Сильнее всего подорожала доставка: {worst.map((p) => `${p.title} (+${p.changePercent?.toLocaleString("ru-RU")}%, переплата ${formatRub(p.overpay)})`).join("; ")}. Цена доставки зависит от габаритов, склада отгрузки и района покупателя: если вы не меняли габариты, посмотрите вкладки «Склады» и «Регионы» — возможно, заказы стали уходить с дальних складов.
        </div>
      ) : null}

      {whatIf.length > 0 ? (
        <div className="rounded-2xl p-4" style={{ backgroundColor: hub.surface }}>
          <p className="text-[14px] font-semibold" style={{ ...hubSans, color: hub.text }}>
            Что даст вдвое меньше возвратов: до {formatRub(whatIfTotal)} в месяц
          </p>
          <p className="mb-3 mt-0.5 text-[12.5px] leading-5" style={{ ...hubSans, color: hub.textMuted }}>
            Считаем прибыль с одной продажи по вашей марже (как в «Товарах») при реальных возвратах за 90 дней и при вдвое меньших. Это гипотеза: учтена только экономия на обратной логистике, выручка с сохранённых продаж не добавлена. Улучшить можно упаковкой и точностью карточки.
          </p>
          <ul className="space-y-2">
            {whatIf.slice(0, 5).map((r) => (
              <li key={r.nmId} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3">
                <span className="min-w-0 truncate text-[13px]" style={{ ...hubSans, color: hub.text }}>
                  {r.title}
                  <span className="ml-2 text-[12px]" style={{ color: hub.textSubtle }}>
                    возвратов {r.returns90} из {r.deliveries90} ({Math.round(r.returnRate * 100)}%), прибыль с продажи {formatRub(r.profitNow)} → {formatRub(r.profitWhatIf)}
                  </span>
                </span>
                <span className="whitespace-nowrap text-[13px] font-semibold tabular-nums" style={{ color: hub.green }}>
                  +{formatRub(r.gainPerMonth)} / мес
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="rounded-2xl p-4" style={{ backgroundColor: hub.surface }}>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <HubInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Найти товар" className="w-56" />
          <HubButton size="sm" variant="secondary" onClick={exportCsv}>
            Скачать CSV
          </HubButton>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-left">
            <thead style={{ backgroundColor: hub.surfaceMuted }}>
              <tr>
                {["Товар", "Доставок", "Цена доставки", "Изменение", "Возвраты", "Логистика всего", "Доля выручки", "Переплата"].map((label) => (
                  <th key={label} className="border-b px-3 py-2.5 text-[11.5px] font-bold uppercase tracking-[0.06em]" style={{ ...hubSans, color: hub.textSubtle, borderColor: hub.borderSoft }}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 100).map((p) => (
                <tr key={p.nmId} className="border-b" style={{ borderColor: hub.borderSoft }}>
                  <td className="max-w-[280px] px-3 py-2.5">
                    <p className="truncate text-[13px] font-medium" style={{ ...hubSans, color: hub.text }}>
                      {p.title}
                    </p>
                    <p className="text-[11.5px]" style={{ ...hubSans, color: hub.textSubtle }}>
                      {p.nmId}
                    </p>
                  </td>
                  <td className="px-3 py-2.5 text-[13px] tabular-nums">{formatInt(p.deliveries)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[13px] tabular-nums">{p.perDelivery == null ? "мало данных" : formatRub(p.perDelivery)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[13px] font-semibold tabular-nums" style={{ color: p.changePercent == null ? hub.textSubtle : p.changePercent >= GROWTH_PERCENT ? hub.danger : p.changePercent <= -GROWTH_PERCENT ? hub.green : hub.textMuted }}>
                    {p.changePercent == null ? "—" : `${p.changePercent > 0 ? "+" : ""}${p.changePercent.toLocaleString("ru-RU")}%`}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[13px] tabular-nums">
                    {p.returns > 0 ? `${formatInt(p.returns)} · ${pct(p.returnRate, 0)}` : "—"}
                    {p.highReturn ? (
                      <span className="ml-1.5 rounded-full px-1.5 py-px text-[10.5px] font-semibold" style={{ backgroundColor: hub.dangerSoft, color: hub.danger }} title="Возвратов заметно больше, чем в среднем по магазину. Проверьте упаковку и соответствие карточки товару.">
                        высокий возврат
                      </span>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[13px] font-semibold tabular-nums">{formatRub(p.logisticsTotal)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[13px] tabular-nums">{pct(p.shareOfRevenue)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[13px] tabular-nums" style={{ color: p.overpay > 0 ? hub.danger : hub.textSubtle }}>
                    {p.overpay > 0 ? formatRub(p.overpay) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11.5px] leading-4" style={{ ...hubSans, color: hub.textSubtle }}>
          Окно — последние 28 дней, сравнение с предыдущими 28. Цену доставки сравниваем только при {MIN_DELIVERIES} доставках и больше в обоих окнах; рост от {GROWTH_PERCENT}% считаем заметным. «Переплата» — сколько вы заплатили сверх прошлой цены доставки при том же числе доставок. Это сумма из отчёта, а не прогноз.
        </p>
      </div>
    </div>
  );
}
