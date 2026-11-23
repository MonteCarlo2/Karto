"use client";

import { useMemo, useState } from "react";
import { pctChange } from "@/lib/seller-hub/analytics-core";
import { CompareBar, CompareChart, DivergingBars, RankedBars, Spark, StackBar } from "./hub-analytics-charts";
import { FunnelSteps, type FunnelStage } from "./hub-analytics-funnel";
import { TreemapChart } from "./hub-analytics-viz";
import { formatInt, formatRub, hub, hubNumeric, hubSans } from "./hub-ui";
import { dayLabel, Card, chartColors, DeltaChip, EmptyNote, fmtPct, IncompleteNotice, LoadingBlock, PpChip, Segmented, StatBlock } from "./hub-analytics-ui";
import { useDailyOrdersCompare } from "./use-daily-orders";
import type { AnalyticsData } from "./use-analytics-data";

const pp = (cur: number | null, past: number | null | undefined) => (cur == null || past == null ? null : (cur - past) * 100);

/** Состояние направления: цвет точки и числа, без залитых плашек. */
const SEVERITY = {
  bad: { color: chartColors.danger, label: "Есть проблема" },
  warn: { color: chartColors.amber, label: "Присмотреться" },
  ok: { color: chartColors.green, label: "В порядке" },
  unknown: { color: "#B4B8AF", label: "Нет данных" },
} as const;

const TONE_DOT = { good: chartColors.green, bad: chartColors.danger, info: chartColors.blue } as const;

type Metric = "orders" | "sum";

const was = (n: number | null | undefined, fmt: (v: number) => string) => (n == null ? undefined : `прошлый период: ${fmt(n)}`);

/**
 * Сводка. Ряд цветных плиток-показателей (первые две переключают график), график заказов с прошлым периодом, воронка,
 * кто даёт оборот, куда уходят деньги, мониторинг направлений и выводы. Каждая диаграмма в своей рамке; подробности лежат во вкладках.
 */
export function HubAnalyticsSummary({ data, connected, days }: { data: AnalyticsData; connected?: boolean; days: number }) {
  const { kpis, insights, abc, movers, money: m, rows } = data;
  const daily = useDailyOrdersCompare(connected, days);
  const { current: dailyNow, previous: dailyPrev } = daily;
  const [metric, setMetric] = useState<Metric>("orders");
  const [openMon, setOpenMon] = useState<string | null>(null);
  const [topView, setTopView] = useState<"mosaic" | "list">("mosaic");

  const points = useMemo(() => {
    if (!dailyNow) return [];
    return dailyNow.map((d, i) => {
      const pd = dailyPrev?.[i];
      return {
        date: d.date,
        value: metric === "orders" ? d.net : d.sum,
        partial: d.partial,
        prevDate: pd?.date,
        prev: pd ? (metric === "orders" ? pd.net : pd.sum) : null,
      };
    });
  }, [dailyNow, dailyPrev, metric]);
  const sparkOrders = useMemo(() => (dailyNow ?? []).filter((d) => !d.partial).map((d) => d.net), [dailyNow]);
  const sparkSum = useMemo(() => (dailyNow ?? []).filter((d) => !d.partial).map((d) => d.sum), [dailyNow]);

  if (!kpis) {
    return (
      <Card title="Данных для сводки пока нет">
        <EmptyNote title="Сводка строится по воронке продаж WB">Просмотры, корзина, заказы, выкупы. Выгрузите данные кабинета; нужна категория «Аналитика» в API-токене.</EmptyNote>
      </Card>
    );
  }
  const { current: c, past: p } = kpis;
  const stages: FunnelStage[] = [
    { id: "open", label: "Просмотры", cur: c.opens, past: p?.opens ?? null },
    { id: "cart", label: "Корзина", cur: c.carts, past: p?.carts ?? null, rateLabel: "из просмотров", rate: c.cartRate, pastRate: p?.cartRate },
    { id: "order", label: "Заказы", cur: c.orders, past: p?.orders ?? null, rateLabel: "из корзины", rate: c.orderRate, pastRate: p?.orderRate },
    { id: "buy", label: "Выкупы", cur: c.buyouts, past: p?.buyouts ?? null, rateLabel: "по завершённым заказам", rate: c.buyoutRate, pastRate: p?.buyoutRate },
  ];
  const abcShade = { A: chartColors.blue, B: chartColors.amber, C: chartColors.inkSoft } as const;
  const topItems = [...rows].filter((r) => r.orderSum > 0).sort((a, b) => b.orderSum - a.orderSum).slice(0, 7).map((r) => ({ id: r.nmId, title: r.title, value: r.orderSum, share: r.share, abc: r.abc }));
  const cur = m?.current;
  const money = m?.current.profit ?? null;
  const moneyPast = m?.past ? (m.current.profit != null ? (m.past.profit ?? null) : m.past.beforeCost) : null;
  const moneyNow = m ? (money ?? m.current.beforeCost) : null;
  const split = cur
    ? [
        { id: "left", label: "Остаётся", value: Math.max(cur.beforeCost, 0), color: chartColors.green },
        { id: "hold", label: "Удержано WB", value: cur.wbHold, color: chartColors.magenta, hint: "Комиссия, эквайринг и другие удержания WB" },
        { id: "log", label: "Логистика", value: cur.logistics, color: chartColors.amber },
        { id: "stor", label: "Хранение и приёмка", value: cur.storage + cur.acceptance, color: chartColors.teal },
      ]
    : null;
  const abcTotal = abc.reduce((s, x) => s + x.products, 0);
  const lineColor = metric === "orders" ? chartColors.teal : chartColors.blue;

  return (
    <div className="space-y-3">
      <div className="px-1 pb-1">
        <p className="text-[14px] leading-6" style={{ ...hubSans, color: hub.textMuted }}>
          <span className="font-semibold" style={{ color: hub.text }}>
            {dayLabel(kpis.period.from)} — {dayLabel(kpis.period.to)}
          </span>
          {kpis.period.pastFrom && kpis.period.pastTo ? <span style={{ color: hub.textMuted }}> · сравниваем с предыдущими {days} днями ({dayLabel(kpis.period.pastFrom)} — {dayLabel(kpis.period.pastTo)})</span> : <span style={{ color: hub.textMuted }}> · прошлого периода нет</span>}
        </p>
        {kpis.truncated ? (
          <div className="mt-3">
            <IncompleteNotice what="Воронку и отчёт об остатках" />
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-6">
        <StatBlock
          hero
          className="col-span-2"
          label="Сумма заказов"
          color={chartColors.blue}
          selected={metric === "sum"}
          onClick={() => setMetric("sum")}
          value={formatRub(c.orderSum)}
          delta={<DeltaChip change={pctChange(c.orderSum, p?.orderSum ?? null)} />}
          sub={was(p?.orderSum, formatRub)}
          hint="Сумма всех оформленных заказов по воронке WB, включая позже отменённые. Нажмите, чтобы показать на графике."
          spark={<Spark values={sparkSum} color="#FFFFFF" height={64} />}
        />
        <StatBlock
          label="Заказы"
          color={chartColors.teal}
          selected={metric === "orders"}
          onClick={() => setMetric("orders")}
          value={formatInt(c.orders)}
          delta={<DeltaChip change={pctChange(c.orders, p?.orders ?? null)} />}
          sub={was(p?.orders, formatInt)}
          hint="Все оформленные заказы по воронке WB, включая позже отменённые. Нажмите, чтобы показать на графике."
          spark={<Spark values={sparkOrders} color={chartColors.teal} />}
        />
        <StatBlock label="Выкуп" color={chartColors.violet} value={fmtPct(c.buyoutRate)} delta={<PpChip pp={pp(c.buyoutRate, p?.buyoutRate)} />} sub={was(p?.buyoutRate, (v) => fmtPct(v))} hint="Выкуплено / (выкуплено + отменено): по заказам, у которых уже есть исход. Как считает WB.">
          <CompareBar cur={c.buyoutRate} past={p?.buyoutRate ?? null} color={chartColors.violet} fmt={(v) => fmtPct(v)} />
        </StatBlock>
        <StatBlock label="Средний чек" color={chartColors.amber} value={c.avgCheck != null ? formatRub(c.avgCheck) : "—"} delta={<DeltaChip change={pctChange(c.avgCheck, p?.avgCheck ?? null)} good="neutral" />} sub={was(p?.avgCheck, formatRub)}>
          <CompareBar cur={c.avgCheck} past={p?.avgCheck ?? null} color={chartColors.amber} fmt={formatRub} />
        </StatBlock>
        <StatBlock
          label={money != null ? "Прибыль" : "Остаётся до себестоимости"}
          color={chartColors.green}
          value={moneyNow != null ? formatRub(moneyNow) : "—"}
          delta={moneyNow != null && moneyPast != null ? <DeltaChip change={pctChange(moneyNow, moneyPast)} /> : undefined}
          sub={m ? (money != null ? `маржа ${fmtPct(m.current.margin)}` : "укажите себестоимость — увидите прибыль") : "нет отчёта реализации"}
          hint="Прибыль: остаётся до себестоимости минус себестоимость проданного, по товарам с указанной себестоимостью. Налог, реклама и штрафы не вычтены."
        >
          <CompareBar cur={moneyNow} past={moneyPast} color={chartColors.green} fmt={formatRub} />
        </StatBlock>
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card
          title={metric === "orders" ? "Заказы по дням" : "Сумма заказов по дням"}
          hint={daily.previous ? "Сплошная линия — этот период, пунктир — предыдущий такой же" : "Динамика за выбранный период"}
          action={
            <Segmented<Metric>
              size="sm"
              layoutId="summary-metric"
              label="Что показывать на графике"
              value={metric}
              onChange={setMetric}
              options={[
                { id: "orders", label: "Заказы" },
                { id: "sum", label: "Сумма" },
              ]}
            />
          }
        >
          {!connected ? (
            <EmptyNote title="Нужно подключение кабинета">Подключите кабинет WB, чтобы увидеть заказы по дням.</EmptyNote>
          ) : !daily.ready ? (
            <LoadingBlock title="Загружаю заказы по дням" height={300} />
          ) : !dailyNow ? (
            <EmptyNote title="Заказов по дням нет" tone="danger">
              {daily.error ?? "В отчёте WB нет заказов за выбранный период."} Попробуйте позже: WB ограничивает частоту запросов.
            </EmptyNote>
          ) : (
            <div key={metric} className="hub-fade-in">
              <CompareChart
                points={points}
                height={300}
                color={lineColor}
                label={metric === "orders" ? "Заказы без отмен" : "Сумма без отмен"}
                fmt={metric === "orders" ? (n) => `${formatInt(n)} шт.` : formatRub}
                yFormat={metric === "sum" ? (n) => (n >= 1000 ? `${Math.round(n / 1000)} тыс` : `${n}`) : undefined}
              />
            </div>
          )}
        </Card>

        <Card title="Воронка" hint="Сколько людей доходит до каждого шага">
          <FunnelSteps stages={stages} compact />
        </Card>
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <Card
          title="Кто даёт оборот"
          hint={`${formatInt(abcTotal)} из ${formatInt(kpis.skuCount)} товаров получили заказы. Цвет — класс товара`}
          action={
            <Segmented<"mosaic" | "list">
              size="sm"
              layoutId="summary-top-view"
              label="Вид списка товаров"
              value={topView}
              onChange={setTopView}
              options={[
                { id: "mosaic", label: "Мозаика" },
                { id: "list", label: "Список" },
              ]}
            />
          }
        >
          {topItems.length > 0 ? (
            <>
              <div className="mb-6">
                <StackBar
                  height={14}
                  valueFmt={formatRub}
                  parts={abc.map((x) => ({ id: x.abc, label: `Класс ${x.abc} · ${formatInt(x.products)} тов.`, value: x.orderSum, color: abcShade[x.abc], hint: x.abc === "A" ? "Первые 80% суммы заказов" : x.abc === "B" ? "До 95%" : "Остальное" }))}
                />
              </div>
              {topView === "mosaic" ? (
                <TreemapChart
                  height={300}
                  format={formatRub}
                  items={topItems.map((t) => ({ id: String(t.id), title: t.title, value: t.value, color: abcShade[t.abc === "none" ? "C" : t.abc], hint: `Класс ${t.abc}` }))}
                />
              ) : (
                <RankedBars items={topItems} />
              )}
            </>
          ) : (
            <EmptyNote title="Заказов за период нет" />
          )}
        </Card>

        <Card title="Что изменилось сильнее всего" hint="Вклад товара в изменение суммы заказов к прошлому периоду">
          {movers.growing.length === 0 && movers.falling.length === 0 ? (
            <EmptyNote title="Сравнивать пока не с чем">Нет прошлого периода или изменений для сравнения.</EmptyNote>
          ) : (
            <DivergingBars items={[...movers.growing.slice(0, 3), ...movers.falling.slice(0, 3)].map((r) => ({ id: r.nmId, title: r.title, value: r.sumDelta ?? 0 }))} />
          )}
        </Card>
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <Card title="Куда уходит выручка" hint="После WB, логистики, хранения и приёмки. Подробнее — во вкладке «Деньги»">
          {split ? <TreemapChart height={230} format={formatRub} items={split.map((p) => ({ id: p.id, title: p.label, value: p.value, color: p.color, hint: p.hint }))} /> : <EmptyNote title="Отчёта реализации пока нет">Деньги считаются по отчёту реализации WB: нужна категория «Финансы» в API-токене.</EmptyNote>}
        </Card>

        <Card title="Где теряются деньги" hint="Суммы, которые прямо видны в отчётах WB, без оценок и прогнозов">
          {data.leaks.length === 0 ? (
            <p className="flex items-center gap-2.5 text-[14px]" style={{ ...hubSans, color: hub.greenDark }}>
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: chartColors.green }} aria-hidden />
              Явных потерь не видно: нет упущенных заказов, убыточных товаров, возвратов и штрафов.
            </p>
          ) : (
            <DivergingBars items={data.leaks.map((l) => ({ id: l.id, title: l.title, value: -l.amount, sub: l.source }))} />
          )}
        </Card>
      </div>

      <div className="pt-2">
        <div className="mb-3 px-1">
          <h3 className="text-[20px] font-semibold tracking-[-0.02em]" style={{ ...hubSans, color: hub.text }}>
            Мониторинг по направлениям
          </h3>
          <p className="mt-1 text-[13.5px]" style={{ ...hubSans, color: hub.textSubtle }}>
            Сколько товаров затронуто в каждом направлении
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
          {data.monitoring.map((d) => {
            const tone = SEVERITY[d.severity];
            const first = d.items[0];
            const canOpen = d.items.length > 0;
            return (
              <StatBlock key={d.id} label={d.label} color={tone.color} value={d.count == null ? "—" : String(d.count)} sub={tone.label} hint={d.count == null ? `Нет данных. ${d.rule}` : d.rule} selected={openMon === d.id} onClick={canOpen ? () => setOpenMon((cur) => (cur === d.id ? null : d.id)) : undefined}>
                {first ? (
                  <p className="border-t pt-3 text-[14px] leading-[1.4]" style={{ ...hubSans, borderColor: hub.borderSoft, color: hub.textMuted }}>
                    <span className="block font-medium [overflow-wrap:anywhere]" style={{ color: hub.text }}>
                      {first.title}
                    </span>
                    <span style={hubNumeric}>{first.note}</span>
                    <span className="mt-1.5 block font-semibold" style={{ color: tone.color }}>
                      {openMon === d.id ? "Свернуть список" : d.count != null && d.count > 1 ? `Показать все ${d.count}` : "Подробнее"}
                    </span>
                  </p>
                ) : null}
              </StatBlock>
            );
          })}
        </div>
        {(() => {
          const open = data.monitoring.find((d) => d.id === openMon);
          if (!open || open.items.length === 0) return null;
          return (
            <Card className="mt-3" title={open.label} hint={open.rule}>
              <ul className="grid gap-2.5 md:grid-cols-2">
                {open.items.map((it) => (
                  <li key={it.nmId} className="rounded-[16px] px-4 py-3" style={{ backgroundColor: `${SEVERITY[open.severity].color}12` }}>
                    <p className="text-[16px] font-medium leading-[1.3] [overflow-wrap:anywhere]" style={{ ...hubSans, color: hub.text }}>{it.title}</p>
                    <p className="mt-1 text-[14.5px]" style={{ ...hubSans, color: hub.textMuted }}>{it.note}</p>
                  </li>
                ))}
              </ul>
              {open.count != null && open.count > open.items.length ? (
                <p className="mt-3 text-[14.5px]" style={{ ...hubSans, color: hub.textMuted }}>
                  Показаны первые {open.items.length} из {open.count}. Остальные смотрите во вкладке «Товары».
                </p>
              ) : null}
            </Card>
          );
        })()}
      </div>

      {insights.length > 0 ? (
        <Card title="Главные выводы" hint="Строятся из цифр на экране, ничего не додумывается">
          <ul className="grid gap-3 lg:grid-cols-2">
            {insights.map((i) => (
              <li key={i.id} className="flex gap-3.5 rounded-[18px] px-5 py-4 text-[16px] leading-[1.5]" style={{ ...hubSans, color: hub.text, backgroundColor: `${TONE_DOT[i.tone]}12`, borderLeft: `4px solid ${TONE_DOT[i.tone]}` }}>
                <span className="text-pretty">{i.text}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
