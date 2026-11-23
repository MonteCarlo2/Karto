"use client";

import { useMemo } from "react";
import { PolarCurve } from "./hub-analytics-viz";
import { formatInt, formatRub, hub, hubSans } from "./hub-ui";
import { HubAnalyticsHistory } from "./hub-analytics-history";
import { CompareChart } from "./hub-analytics-charts";
import { dayLabel, Card, chartColors, DeltaChip, EmptyNote, fmtPct, IncompleteNotice, LoadingBlock, StatBlock } from "./hub-analytics-ui";
import { pctChange } from "@/lib/seller-hub/analytics-core";
import { useDailyOrdersCompare } from "./use-daily-orders";

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"] as const;
const WEEKDAYS_FULL = ["понедельник", "вторник", "среда", "четверг", "пятница", "суббота", "воскресенье"] as const;

type Day = { date: string; net: number; cancelled: number; sum: number; partial: boolean };

const totalsOf = (days: Day[]) => {
  const done = days.filter((d) => !d.partial);
  const net = done.reduce((s, d) => s + d.net, 0);
  const cancelled = done.reduce((s, d) => s + d.cancelled, 0);
  const sum = done.reduce((s, d) => s + d.sum, 0);
  const all = net + cancelled;
  return { net, cancelled, sum, avgCheck: net > 0 ? sum / net : null, cancelShare: all > 0 ? cancelled / all : null, perDay: done.length > 0 ? net / done.length : 0, all };
};

export const MONO_STYLE = { fontFamily: "var(--font-geist-mono), ui-monospace, monospace", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.05em" } as const;

/** Динамика: заказы и сумма по дням с прошлым периодом, дни недели и история в базе. Отчёт «Заказы» WB; сегодняшний неоконченный день не считается. */
export function HubAnalyticsTrend({ connected, days, only }: { connected?: boolean; days: number; /** Из чата: показать один график вместо всей страницы. */ only?: "orders" | "sum" | "weekdays" }) {
  const { ready, current, previous, data, error } = useDailyOrdersCompare(connected, days);

  const cur = useMemo(() => (current ? totalsOf(current as Day[]) : null), [current]);
  const prev = useMemo(() => (previous ? totalsOf(previous as Day[]) : null), [previous]);

  const orderPoints = useMemo(
    () =>
      (current ?? []).map((d, i) => {
        const pd = previous?.[i];
        return { date: d.date, value: d.net, partial: d.partial, prevDate: pd?.date, prev: pd ? pd.net : null, note: d.cancelled > 0 ? `Отменено: ${formatInt(d.cancelled)}` : undefined };
      }),
    [current, previous],
  );
  const sumPoints = useMemo(
    () =>
      (current ?? []).map((d, i) => {
        const pd = previous?.[i];
        return { date: d.date, value: d.sum, partial: d.partial, prevDate: pd?.date, prev: pd ? pd.sum : null, note: `Заказов без отмен: ${formatInt(d.net)}` };
      }),
    [current, previous],
  );

  /** Среднее число заказов в каждый день недели по законченным дням периода. */
  const weekdays = useMemo(() => {
    const done = (current ?? []).filter((d) => !d.partial);
    if (done.length < 14) return null;
    const sums = Array<number>(7).fill(0);
    const counts = Array<number>(7).fill(0);
    for (const d of done) {
      const idx = (new Date(`${d.date}T00:00:00Z`).getUTCDay() + 6) % 7;
      sums[idx] = (sums[idx] ?? 0) + d.net;
      counts[idx] = (counts[idx] ?? 0) + 1;
    }
    const avgs = sums.map((v, i) => (counts[i]! > 0 ? v / counts[i]! : 0));
    const top = avgs.indexOf(Math.max(...avgs));
    const low = avgs.indexOf(Math.min(...avgs));
    return { avgs, top, low, counts };
  }, [current]);

  const best = useMemo(() => (current ?? []).filter((d) => !d.partial).reduce<Day | null>((a, d) => (a == null || d.sum > a.sum ? (d as Day) : a), null), [current]);
  const worst = useMemo(() => (current ?? []).filter((d) => !d.partial).reduce<Day | null>((a, d) => (a == null || d.sum < a.sum ? (d as Day) : a), null), [current]);

  const was = (n: number | null | undefined, f: (v: number) => string) => (n == null ? undefined : `прошлый период: ${f(n)}`);

  if (!connected || !ready || !current || !cur) {
    return (
      <div className="space-y-3">
        <Card title="Заказы по дням" hint={`Последние ${days} дн. из отчёта WB «Заказы»`}>
          {!connected ? (
            <EmptyNote title="Нужно подключение кабинета">Подключите кабинет WB, чтобы увидеть динамику заказов по дням.</EmptyNote>
          ) : !ready ? (
            <LoadingBlock title="Загружаю заказы" height={300} />
          ) : (
            <EmptyNote title="Данных за период нет" tone="danger">
              {error ?? "В отчёте WB нет заказов за выбранный период."} Попробуйте позже: WB ограничивает частоту запросов.
            </EmptyNote>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {data?.truncated ? <IncompleteNotice what="Отчёт «Заказы»" /> : null}

      <div className={only ? "hidden" : "grid grid-cols-2 gap-3 xl:grid-cols-4"}>
        <StatBlock label="Заказы без отмен" color={chartColors.teal} value={formatInt(cur.net)} delta={prev ? <DeltaChip change={pctChange(cur.net, prev.net)} /> : undefined} sub={prev ? was(prev.net, formatInt) : `${cur.perDay.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} в день`} />
        <StatBlock label="Сумма заказов" color={chartColors.blue} value={formatRub(cur.sum)} delta={prev ? <DeltaChip change={pctChange(cur.sum, prev.sum)} /> : undefined} sub={prev ? was(prev.sum, formatRub) : undefined} />
        <StatBlock label="Средний чек" color={chartColors.amber} value={cur.avgCheck != null ? formatRub(cur.avgCheck) : "—"} delta={prev ? <DeltaChip change={pctChange(cur.avgCheck, prev.avgCheck)} good="neutral" /> : undefined} sub={prev ? was(prev.avgCheck, formatRub) : undefined} />
        <StatBlock label="Доля отмен" color={chartColors.danger} value={fmtPct(cur.cancelShare)} sub={`${formatInt(cur.cancelled)} из ${formatInt(cur.all)} заказов`} hint="Отменённые заказы от всех оформленных за период" />
      </div>

      <Card className={only && only !== "orders" ? "hidden" : undefined} title="Заказы по дням" hint={previous ? "Сплошная линия — этот период, пунктир — предыдущий такой же" : "Последние дни периода"}>
        <CompareChart points={orderPoints} height={300} color={chartColors.teal} label="Заказы без отмен" fmt={(n) => `${formatInt(n)} шт.`} />
      </Card>

      <Card className={only && only !== "sum" ? "hidden" : undefined} title="Сумма заказов по дням" hint="По цене продавца, без отменённых">
        <CompareChart points={sumPoints} height={300} color={chartColors.blue} label="Сумма без отмен" fmt={formatRub} yFormat={(n) => (n >= 1000 ? `${Math.round(n / 1000)} тыс` : `${n}`)} />
        {best && worst ? (
          <p className="mt-6 max-w-[90ch] text-[16px] leading-[1.65]" style={{ ...hubSans, color: hub.textMuted }}>
            Лучший день по сумме — <span className="font-semibold" style={{ color: hub.text }}>{dayLabel(best.date)}</span> ({formatRub(best.sum)}, {best.net} заказов). Самый слабый из законченных — <span className="font-semibold" style={{ color: hub.text }}>{dayLabel(worst.date)}</span> ({formatRub(worst.sum)}, {worst.net} заказов).
          </p>
        ) : null}
      </Card>

      <div className={only && only !== "weekdays" ? "hidden" : only ? "grid gap-3" : "grid gap-3 xl:grid-cols-2"}>
        <Card title="Заказы по дням недели" hint="В среднем за день, без отмен. Наведите на круг, чтобы увидеть день">
          {weekdays ? (
            <PolarCurve
              size={760}
              color={chartColors.teal}
              format={(n) => n.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}
              items={weekdays.avgs.map((v, i) => ({ id: String(i), label: WEEKDAYS[i]!, value: Math.round(v * 10) / 10, hint: `${WEEKDAYS_FULL[i]}, заказов в день` }))}
            />
          ) : (
            <EmptyNote title="Дней пока мало">Выберите период 28 дней или больше.</EmptyNote>
          )}
        </Card>
        {only ? null : <HubAnalyticsHistory connected={connected} />}
      </div>
    </div>
  );
}
