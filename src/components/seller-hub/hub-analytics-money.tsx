"use client";

import { useMemo, useState } from "react";
import { buildMoneyAnalytics } from "@/lib/seller-hub/money-analytics";
import { pctChange } from "@/lib/seller-hub/analytics-core";
import type { SellerCatalogSnapshot } from "@/lib/seller-hub/types";
import { downloadCsv } from "./download-file";
import { formatRub, hub, HubButton, HubInput, hubSans } from "./hub-ui";
import { dayLabel, Card, DeltaChip, fmtPct, IncompleteNotice, Kpi, SourceNote } from "./hub-analytics-ui";


/** Деньги магазина: куда уходит выручка и что остаётся. По отчёту реализации WB (нужна категория «Финансы» в токене). */
export function HubAnalyticsMoney({ snapshot, days }: { snapshot?: SellerCatalogSnapshot; days: number }) {
  const money = useMemo(() => buildMoneyAnalytics(snapshot?.realization, snapshot?.items ?? [], days), [snapshot?.realization, snapshot?.items, days]);
  const [search, setSearch] = useState("");
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (money?.products ?? []).filter((p) => !q || `${p.title} ${p.nmId}`.toLowerCase().includes(q));
  }, [money, search]);

  if (!money) {
    return (
      <Card title="Отчёта реализации пока нет">
        <p className="text-[13px] leading-5" style={{ ...hubSans, color: hub.textMuted }}>
          {snapshot?.realization && !snapshot.realization.error && days !== 28
            ? `Данные за ${days} дн. появятся после обновления данных кабинета (кнопка «Обновить данные»): отчёт реализации нужно прочитать заново, чтобы разложить его по периодам.`
            : `${snapshot?.realization?.error ?? "Деньги считаются по отчёту реализации WB."} Нужна категория «Финансы» в API-токене и выгрузка данных кабинета.`}
        </p>
      </Card>
    );
  }
  const { current: c, past: p } = money;
  const parts = [
    { id: "hold", label: "Удержано WB", note: "комиссия, эквайринг и прочее", value: c.wbHold, past: p?.wbHold, color: "#B07CF0" },
    { id: "log", label: "Логистика", value: c.logistics, past: p?.logistics, color: hub.warn },
    { id: "stor", label: "Хранение", value: c.storage, past: p?.storage, color: "#E39B6B" },
    { id: "acc", label: "Приёмка", value: c.acceptance, past: p?.acceptance, color: "#D4B24A" },
    { id: "left", label: "Остаётся до себестоимости", value: c.beforeCost, past: p?.beforeCost, color: hub.green },
  ];
  const base = Math.max(c.revenue, 1);

  function exportCsv() {
    downloadCsv(
      `karto-analitika-dengi-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Артикул WB", "Товар", "Продано, шт.", "Выручка, ₽", "Остаётся до себестоимости, ₽", "Логистика, ₽", "Хранение, ₽", "Себестоимость, ₽", "Прибыль, ₽", "Маржа, %"],
      rows.map((r) => [r.nmId, r.title, r.units, Math.round(r.revenue), Math.round(r.beforeCost), Math.round(r.logistics), Math.round(r.storage), r.cost == null ? "" : Math.round(r.cost), r.profit == null ? "" : Math.round(r.profit), r.margin == null ? "" : Math.round(r.margin * 1000) / 10]),
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-[12.5px]" style={{ ...hubSans, color: hub.textMuted }}>
        Период: {dayLabel(money.period.from)} — {dayLabel(money.period.to)} ({days} дн.){p ? `, сравнение с предыдущими ${days} днями` : ", предыдущего такого же периода в выгрузке WB за 90 дней нет"}. Данные отчёта реализации WB.
      </p>

      {money.truncated ? <IncompleteNotice what="Отчёт реализации" /> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Выручка" value={formatRub(c.revenue)} change={pctChange(c.revenue, p?.revenue ?? null)} sub={`${c.units} шт. за вычетом возвратов`} hint="По цене продавца, продажи минус возвраты" />
        <Kpi label="К перечислению" value={formatRub(c.pay)} change={pctChange(c.pay, p?.pay ?? null)} sub={`${fmtPct(c.revenue > 0 ? c.pay / c.revenue : null)} выручки`} />
        <Kpi label="Остаётся до себестоимости" value={formatRub(c.beforeCost)} change={pctChange(c.beforeCost, p?.beforeCost ?? null)} sub="после логистики, хранения, приёмки" />
        <Kpi
          label="Прибыль"
          value={c.profit != null ? formatRub(c.profit) : "—"}
          change={c.profit != null && p?.profit != null ? pctChange(c.profit, p.profit) : undefined}
          sub={c.profit != null ? `маржа ${fmtPct(c.margin)}, себестоимость указана у ${fmtPct(c.costCoverage, 0)} выручки` : "укажите себестоимость в «Товарах»"}
          hint="Остаётся до себестоимости минус себестоимость проданного. Только по товарам, где указана себестоимость. Налог, реклама и штрафы не вычтены."
        />
      </div>

      <Card title="Куда уходит выручка" hint={`Выручка продавца за ${days} дн. разложена по статьям. Доли считаются от выручки.`}>
        <div className="flex h-5 overflow-hidden rounded-full" style={{ backgroundColor: hub.canvas }}>
          {parts.map((x) => (
            <div key={x.id} title={`${x.label}: ${formatRub(x.value)}`} style={{ width: `${Math.max(0, Math.min(100, (Math.max(x.value, 0) / base) * 100))}%`, backgroundColor: x.color }} />
          ))}
        </div>
        <ul className="mt-3 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
          {parts.map((x) => (
            <li key={x.id} className="flex items-center justify-between gap-3 text-[13px]" style={hubSans}>
              <span className="flex min-w-0 items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: x.color }} />
                <span className="truncate" style={{ color: hub.text }}>
                  {x.label}
                  {x.note ? <span style={{ color: hub.textSubtle }}> · {x.note}</span> : null}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2 tabular-nums">
                <span style={{ color: hub.text }}>{formatRub(x.value)}</span>
                <span style={{ color: hub.textMuted }}>{fmtPct(c.revenue > 0 ? x.value / c.revenue : null)}</span>
                <DeltaChip change={pctChange(x.value, x.past ?? null)} good={x.id === "left" ? "up" : "down"} />
              </span>
            </li>
          ))}
        </ul>
        {c.penalties !== 0 ? (
          <p className="mt-3 text-[12.5px]" style={{ ...hubSans, color: hub.textMuted }}>
            Штрафы и удержания за период: {formatRub(c.penalties)}. В «Остаётся до себестоимости» и в прибыль они не входят.
          </p>
        ) : null}
        <SourceNote>
          «Удержано WB» = выручка минус перечисление: комиссия, эквайринг и другие удержания, которые WB включает в расчёт. Хранение и приёмка — из строк отчёта реализации. Платное хранение FBO из отдельного отчёта может отличаться.
        </SourceNote>
      </Card>

      <Card
        title="Деньги по товарам"
        hint="Что остаётся с каждого товара. Прибыль считается там, где указана себестоимость."
        action={
          <HubButton size="sm" variant="secondary" onClick={exportCsv}>
            Скачать CSV
          </HubButton>
        }
      >
        <div className="mb-3">
          <HubInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Найти товар" className="w-56" />
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-left">
            <thead style={{ backgroundColor: hub.surfaceMuted }}>
              <tr>
                {["Товар", "Продано", "Выручка", "Логистика + хранение", "Остаётся до себестоимости", "Прибыль", "Маржа"].map((label) => (
                  <th key={label} className="whitespace-nowrap border-b px-3 py-2.5 text-[11.5px] font-bold uppercase tracking-[0.06em]" style={{ ...hubSans, color: hub.textSubtle, borderColor: hub.borderSoft }}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 150).map((r) => (
                <tr key={r.nmId} className="border-b" style={{ borderColor: hub.borderSoft }}>
                  <td className="max-w-[260px] px-3 py-2.5">
                    <p className="truncate text-[13px] font-medium" style={{ ...hubSans, color: hub.text }}>
                      {r.title}
                    </p>
                    <p className="text-[11.5px]" style={{ ...hubSans, color: hub.textSubtle }}>
                      {r.nmId}
                    </p>
                  </td>
                  <td className="px-3 py-2.5 text-[13px] tabular-nums">{r.units}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[13px] tabular-nums">{formatRub(r.revenue)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[13px] tabular-nums" style={{ color: r.serviceShare != null && r.serviceShare > 0.3 ? hub.danger : hub.text }}>
                    {formatRub(r.logistics + r.storage)}
                    <span style={{ color: hub.textSubtle }}> · {fmtPct(r.serviceShare, 0)}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[13px] tabular-nums" style={{ color: r.beforeCost < 0 ? hub.danger : hub.text }}>
                    {formatRub(r.beforeCost)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[13px] font-semibold tabular-nums" style={{ color: r.profit == null ? hub.textSubtle : r.profit < 0 ? hub.danger : hub.green }}>
                    {r.profit == null ? "нет себестоимости" : formatRub(r.profit)}
                  </td>
                  <td className="px-3 py-2.5 text-[13px] tabular-nums">{fmtPct(r.margin)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <SourceNote>Красным выделены товары, где логистика и хранение съедают больше 30% выручки, и отрицательные суммы.</SourceNote>
      </Card>
    </div>
  );
}
