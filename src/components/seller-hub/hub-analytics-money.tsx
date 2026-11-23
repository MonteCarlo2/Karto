"use client";

import { useMemo, useState } from "react";
import { buildMoneyAnalytics } from "@/lib/seller-hub/money-analytics";
import { pctChange } from "@/lib/seller-hub/analytics-core";
import type { SellerCatalogSnapshot } from "@/lib/seller-hub/types";
import { downloadCsv } from "./download-file";
import { formatRub, hub, HubButton, HubSearch, hubSans } from "./hub-ui";
import { CompareBar, DivergingBars } from "./hub-analytics-charts";
import { TreemapChart } from "./hub-analytics-viz";
import { Card, chartColors, DataTable, dayLabel, DeltaChip, EmptyNote, fmtPct, IncompleteNotice, ProductCell, ShownCount, SourceNote, StatBlock, Td, Th } from "./hub-analytics-ui";

const ROW_LIMIT = 150;

/** Деньги магазина: куда уходит выручка и что остаётся. По отчёту реализации WB (нужна категория «Финансы» в токене). */
export function HubAnalyticsMoney({ snapshot, days, only }: { snapshot?: SellerCatalogSnapshot; days: number; /** Из чата: только «Куда уходит выручка» и «Из чего состоит». */ only?: "where" }) {
  const money = useMemo(() => buildMoneyAnalytics(snapshot?.realization, snapshot?.items ?? [], days), [snapshot?.realization, snapshot?.items, days]);
  const photos = useMemo(() => new Map((snapshot?.items ?? []).map((i) => [i.externalId, i.imageUrl ?? undefined])), [snapshot?.items]);
  const [search, setSearch] = useState("");
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (money?.products ?? []).filter((p) => !q || `${p.title} ${p.nmId}`.toLowerCase().includes(q));
  }, [money, search]);

  if (!money) {
    return (
      <Card title="Отчёта реализации пока нет">
        <EmptyNote title="Деньги считаются по отчёту реализации WB">
          {snapshot?.realization && !snapshot.realization.error && days !== 28
            ? `Данные за ${days} дн. появятся после обновления данных кабинета (кнопка «Обновить данные»): отчёт реализации нужно прочитать заново, чтобы разложить его по периодам.`
            : `${snapshot?.realization?.error ?? "Деньги считаются по отчёту реализации WB."} Нужна категория «Финансы» в API-токене и выгрузка данных кабинета.`}
        </EmptyNote>
      </Card>
    );
  }
  const { current: c, past: p } = money;
  const withProfit = money.products.filter((r) => r.profit != null);
  const profitItems = [...withProfit.sort((a, b) => (b.profit ?? 0) - (a.profit ?? 0)).slice(0, 6), ...withProfit.filter((r) => (r.profit ?? 0) < 0).slice(-4)]
    .filter((r, i, arr) => arr.findIndex((x) => x.nmId === r.nmId) === i)
    .map((r) => ({ id: r.nmId, title: r.title, value: r.profit ?? 0 }));

  function exportCsv() {
    downloadCsv(
      `karto-analitika-dengi-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Артикул WB", "Товар", "Продано, шт.", "Выручка, ₽", "Остаётся до себестоимости, ₽", "Логистика, ₽", "Хранение, ₽", "Себестоимость, ₽", "Прибыль, ₽", "Маржа, %"],
      rows.map((r) => [r.nmId, r.title, r.units, Math.round(r.revenue), Math.round(r.beforeCost), Math.round(r.logistics), Math.round(r.storage), r.cost == null ? "" : Math.round(r.cost), r.profit == null ? "" : Math.round(r.profit), r.margin == null ? "" : Math.round(r.margin * 1000) / 10]),
    );
  }

  return (
    <div className="space-y-3">
      <div className={only ? "hidden" : undefined}>
        <p className="text-[14px] leading-6" style={{ ...hubSans, color: hub.textMuted }}>
          <span className="font-semibold" style={{ color: hub.text }}>
            {dayLabel(money.period.from)} — {dayLabel(money.period.to)} ({days} дн.)
          </span>
          {p ? `, сравнение с предыдущими ${days} днями` : ", предыдущего такого же периода в выгрузке WB за 90 дней нет"}. Данные отчёта реализации WB.
        </p>
        {money.truncated ? (
          <div className="mt-4">
            <IncompleteNotice what="Отчёт реализации" />
          </div>
        ) : null}
      </div>

      <div className={only ? "hidden" : "grid gap-3 sm:grid-cols-2 xl:grid-cols-4"}>
        <StatBlock label="Выручка" color={chartColors.blue} value={formatRub(c.revenue)} delta={<DeltaChip change={pctChange(c.revenue, p?.revenue ?? null)} />} sub={`${c.units} шт. за вычетом возвратов`} hint="По цене продавца, продажи минус возвраты">
          <CompareBar cur={c.revenue} past={p?.revenue ?? null} color={chartColors.blue} fmt={formatRub} />
        </StatBlock>
        <StatBlock label="К перечислению" color={chartColors.teal} value={formatRub(c.pay)} delta={<DeltaChip change={pctChange(c.pay, p?.pay ?? null)} />} sub={`${fmtPct(c.revenue > 0 ? c.pay / c.revenue : null)} выручки`}>
          <CompareBar cur={c.pay} past={p?.pay ?? null} color={chartColors.teal} fmt={formatRub} />
        </StatBlock>
        <StatBlock label="Остаётся до себестоимости" color={chartColors.green} value={formatRub(c.beforeCost)} delta={<DeltaChip change={pctChange(c.beforeCost, p?.beforeCost ?? null)} />} sub="после логистики, хранения, приёмки">
          <CompareBar cur={c.beforeCost} past={p?.beforeCost ?? null} color={chartColors.green} fmt={formatRub} />
        </StatBlock>
        <StatBlock
          label="Прибыль" color={chartColors.green}
          value={c.profit != null ? formatRub(c.profit) : "—"}
          delta={c.profit != null && p?.profit != null ? <DeltaChip change={pctChange(c.profit, p.profit)} /> : undefined}
          sub={c.profit != null ? `маржа ${fmtPct(c.margin)}, себестоимость у ${fmtPct(c.costCoverage, 0)} выручки` : "укажите себестоимость в «Товарах»"}
          hint="Остаётся до себестоимости минус себестоимость проданного. Только по товарам, где указана себестоимость. Налог, реклама и штрафы не вычтены."
        >
          {c.profit != null ? <CompareBar cur={c.profit} past={p?.profit ?? null} color={chartColors.green} fmt={formatRub} /> : null}
        </StatBlock>
      </div>

      <div className="grid gap-3 xl:grid-cols-12">
        <Card className="xl:col-span-7" title="Куда уходит выручка" hint={`Выручка за ${days} дн. по статьям. Чем больше плитка, тем больше доля`}>
          <TreemapChart
            height={380}
            format={formatRub}
            items={[
              { id: "left", title: "Остаётся", value: Math.max(c.beforeCost, 0), color: chartColors.green },
              { id: "hold", title: "Удержано WB", value: c.wbHold, color: chartColors.magenta, hint: "Комиссия, эквайринг и другие удержания WB" },
              { id: "log", title: "Логистика", value: c.logistics, color: chartColors.amber },
              { id: "stor", title: "Хранение", value: c.storage, color: chartColors.teal },
              { id: "acc", title: "Приёмка", value: c.acceptance, color: chartColors.violet },
            ]}
          />
          {c.penalties !== 0 ? (
            <p className="mt-4 text-[15px]" style={{ ...hubSans, color: hub.textMuted }}>
              Штрафы и удержания за период: <span className="font-semibold" style={{ color: hub.text }}>{formatRub(c.penalties)}</span>
            </p>
          ) : null}
        </Card>

        <Card fill className="xl:col-span-5" title="Из чего состоит выручка" hint="Доля выручки и изменение к прошлому периоду">
          <ul className="flex flex-1 flex-col gap-2.5">
            {[
              { id: "left", label: "Остаётся", value: Math.max(c.beforeCost, 0), prev: p?.beforeCost ?? null, color: chartColors.green, good: "up" as const },
              { id: "hold", label: "Удержано WB", value: c.wbHold, prev: p?.wbHold ?? null, color: chartColors.magenta, good: "down" as const },
              { id: "log", label: "Логистика", value: c.logistics, prev: p?.logistics ?? null, color: chartColors.amber, good: "down" as const },
              { id: "stor", label: "Хранение", value: c.storage, prev: p?.storage ?? null, color: chartColors.teal, good: "down" as const },
              { id: "acc", label: "Приёмка", value: c.acceptance, prev: p?.acceptance ?? null, color: chartColors.violet, good: "down" as const },
            ].map((r) => (
              <li key={r.id} className="flex flex-1 items-center gap-3 rounded-[16px] px-4 py-3.5" style={{ backgroundColor: `${r.color}14`, borderLeft: `5px solid ${r.color}` }}>
                <span className="min-w-0 flex-1 text-[19px] font-medium" style={{ ...hubSans, color: hub.text }}>{r.label}</span>
                <span className="text-[24px] font-medium" style={{ fontFamily: "var(--font-geist-mono), ui-monospace, monospace", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.05em", color: hub.text }}>{formatRub(r.value)}</span>
                <span className="w-[52px] text-right text-[15px]" style={{ ...hubSans, color: hub.textSubtle }}>{fmtPct(c.revenue > 0 ? r.value / c.revenue : null, 0)}</span>
                <DeltaChip change={pctChange(r.value, r.prev)} good={r.good} />
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card className={only ? "hidden" : undefined} title="Прибыль по товарам" hint="Кто приносит деньги и кто уводит в минус: прибыль за вычетом себестоимости, там где она указана.">
        {profitItems.length === 0 ? (
          <EmptyNote title="Прибыль пока не посчитать">Укажите себестоимость в «Товарах»: без неё прибыль по товару не определить.</EmptyNote>
        ) : (
          <div className="grid gap-x-8 gap-y-6 xl:grid-cols-2">
            {[
              { title: "Приносят деньги", list: profitItems.filter((i) => i.value >= 0) },
              { title: "Уводят в минус", list: profitItems.filter((i) => i.value < 0) },
            ]
              .filter((g) => g.list.length > 0)
              .map((g) => (
                <div key={g.title}>
                  <p className="mb-3 text-[15px] font-semibold" style={{ ...hubSans, color: hub.textMuted }}>{g.title}</p>
                  <DivergingBars items={g.list} />
                </div>
              ))}
          </div>
        )}
      </Card>

      <Card
        className={only ? "hidden" : undefined}
        title="Деньги по товарам"
        hint="Что остаётся с каждого товара. Прибыль считается там, где указана себестоимость."
        action={
          <HubButton size="sm" variant="secondary" onClick={exportCsv}>
            Скачать CSV
          </HubButton>
        }
      >
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <HubSearch value={search} onChange={setSearch} placeholder="Найти товар" label="Поиск по товарам" className="w-full sm:w-[320px]" />
          <ShownCount shown={Math.min(rows.length, ROW_LIMIT)} total={money.products.length} />
        </div>
        {rows.length === 0 ? (
          <EmptyNote title="Такого товара нет в отчёте">Проверьте название или артикул.</EmptyNote>
        ) : (
          <DataTable minWidth={880}>
            <thead>
              <tr>
                <Th>Товар</Th>
                <Th align="right">Продано</Th>
                <Th align="right">Выручка</Th>
                <Th align="right">Логистика + хранение</Th>
                <Th align="right">Остаётся до себестоимости</Th>
                <Th align="right">Прибыль</Th>
                <Th align="right">Маржа</Th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, ROW_LIMIT).map((r) => (
                <tr key={r.nmId} className="transition-colors duration-150 hover:bg-[#011408]/[0.025]">
                  <Td className="max-w-[280px]">
                    <ProductCell photo={photos.get(r.nmId)} title={r.title} sub={r.nmId} />
                  </Td>
                  <Td align="right">{r.units}</Td>
                  <Td align="right" className="whitespace-nowrap">
                    {formatRub(r.revenue)}
                  </Td>
                  <Td align="right" className="whitespace-nowrap" style={{ color: r.serviceShare != null && r.serviceShare > 0.3 ? hub.danger : hub.text }}>
                    {formatRub(r.logistics + r.storage)}
                    <span className="block text-[13px]" style={{ color: r.serviceShare != null && r.serviceShare > 0.3 ? hub.danger : hub.textSubtle }}>
                      {fmtPct(r.serviceShare, 0)} выручки
                    </span>
                  </Td>
                  <Td align="right" className="whitespace-nowrap" style={{ color: r.beforeCost < 0 ? hub.danger : hub.text }}>
                    {formatRub(r.beforeCost)}
                  </Td>
                  <Td align="right" className="whitespace-nowrap font-semibold" style={{ color: r.profit == null ? hub.textSubtle : r.profit < 0 ? hub.danger : hub.greenDark, fontWeight: r.profit == null ? 400 : 600 }}>
                    {r.profit == null ? "нет себестоимости" : formatRub(r.profit)}
                  </Td>
                  <Td align="right">{fmtPct(r.margin)}</Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
        <SourceNote>Красным выделены товары, где логистика и хранение съедают больше 30% выручки, и отрицательные суммы.</SourceNote>
      </Card>
    </div>
  );
}
