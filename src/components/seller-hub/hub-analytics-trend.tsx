"use client";

import { useEffect, useMemo, useState } from "react";
import { loadSellerHubRegionOrders } from "@/lib/seller-hub/client-api";
import { buildDailyTrend } from "@/lib/seller-hub/daily-trend";
import { moscowDateKey } from "@/lib/seller-hub/complete-days";
import type { SellerRegionOrders } from "@/lib/seller-hub/types";
import { formatInt, formatRub, hub, hubSans } from "./hub-ui";
import { HubWeekdayProfile } from "./hub-weekday-profile";
import { HubAnalyticsHistory } from "./hub-analytics-history";
import { dayLabel, Card, DeltaChip, fmtPct, Kpi, SourceNote } from "./hub-analytics-ui";


/** Заказы по дням за 30/60/90 дней: итоги, динамика половин периода, лучший день, заказы по дням недели. Отчёт «Заказы» WB. */
export function HubAnalyticsTrend({ connected, days }: { connected?: boolean; days: number }) {
  const [loaded, setLoaded] = useState<{ key: string; data: SellerRegionOrders | null; error?: string } | null>(null);
  const key = `${days}`;

  useEffect(() => {
    if (!connected) return;
    let cancelled = false;
    void loadSellerHubRegionOrders({ days })
      .then((res) => {
        if (cancelled) return;
        setLoaded({ key, data: res.ok && res.regions ? res.regions : null, error: res.ok ? undefined : res.error });
      })
      .catch((e: unknown) => {
        // Таймаут или сеть: без этого вкладка зависала бы на «Загружаю…».
        if (!cancelled) setLoaded({ key, data: null, error: e instanceof Error ? e.message : "Не удалось загрузить заказы" });
      });
    return () => {
      cancelled = true;
    };
  }, [connected, days, key]);

  const ready = loaded != null && loaded.key === key;
  const data = ready ? loaded.data : null;
  const todayKey = moscowDateKey(data ? Date.parse(data.loadedAt) : 0);
  const trend = useMemo(() => buildDailyTrend(data?.daily, todayKey, data?.dateFrom), [data, todayKey]);
  const max = Math.max(1, ...(trend?.days.map((d) => d.orders) ?? [1]));

  return (
    <div className="space-y-4">
      <p className="text-[12.5px]" style={{ ...hubSans, color: hub.textMuted }}>
        Заказы по дням за последние {days} дн. из отчёта WB «Заказы». Сумма — по цене продавца, без отменённых.
      </p>

      {!connected ? (
        <Card title="Нужно подключение кабинета">
          <p className="text-[13px]" style={{ ...hubSans, color: hub.textMuted }}>
            Подключите кабинет WB, чтобы увидеть динамику заказов по дням.
          </p>
        </Card>
      ) : !ready ? (
        <Card title="Загружаю заказы…">
          <p className="text-[13px]" style={{ ...hubSans, color: hub.textMuted }}>
            WB отдаёт этот отчёт не чаще раза в минуту, первая загрузка может занять до двух минут. Дальше данные берутся из кэша.
          </p>
        </Card>
      ) : !trend || !data ? (
        <Card title="Данных за период нет">
          <p className="text-[13px]" style={{ ...hubSans, color: hub.danger }}>
            {loaded?.error ?? "В отчёте WB нет заказов за выбранный период."} Попробуйте позже: WB ограничивает частоту запросов.
          </p>
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi label="Заказов без отмен" value={formatInt(trend.totals.net)} sub={`${trend.totals.avgPerDay.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} в день`} change={trend.halves?.netChange} />
            <Kpi label="Сумма заказов" value={formatRub(trend.totals.sum)} sub={trend.halves ? "вторая половина против первой" : undefined} change={trend.halves?.sumChange} />
            <Kpi label="Средний чек" value={trend.totals.avgCheck != null ? formatRub(trend.totals.avgCheck) : "—"} good="neutral" />
            <Kpi label="Доля отмен" value={fmtPct(trend.totals.cancelShare)} good="down" sub={`${formatInt(trend.totals.cancelled)} из ${formatInt(trend.totals.orders)}`} />
          </div>

          <Card title="Заказы по дням" hint={`${dayLabel(trend.days[0]!.date)} — ${dayLabel(trend.days.at(-1)!.date)}. Синий — заказы без отмен, красный — отменённые. Сегодняшний неполный день бледнее.`}>
            <div className="flex h-28 items-end gap-[2px]">
              {trend.days.map((d) => (
                <div key={d.date} className="flex h-full min-w-0 flex-1 flex-col justify-end" title={`${dayLabel(d.date)}: ${d.net} заказов, отменено ${d.cancelled}, ${formatRub(d.sum)}${d.partial ? " (день не закончен)" : ""}`}>
                  <div className="w-full" style={{ height: `${(d.cancelled / max) * 100}%`, backgroundColor: hub.danger, opacity: d.partial ? 0.5 : 1 }} />
                  <div className="w-full rounded-t-[2px]" style={{ height: `${Math.max(2, (d.net / max) * 100)}%`, backgroundColor: hub.blue, opacity: d.partial ? 0.45 : 1 }} />
                </div>
              ))}
            </div>
            <div className="mt-1 flex justify-between text-[11px]" style={{ ...hubSans, color: hub.textSubtle }}>
              <span>{dayLabel(trend.days[0]!.date)}</span>
              <span>{dayLabel(trend.days.at(-1)!.date)}</span>
            </div>
            {trend.best && trend.worst ? (
              <p className="mt-3 text-[12.5px] leading-5" style={{ ...hubSans, color: hub.textMuted }}>
                Лучший день по сумме — {dayLabel(trend.best.date)} ({formatRub(trend.best.sum)}, {trend.best.net} заказов). Самый слабый из законченных — {dayLabel(trend.worst.date)} ({formatRub(trend.worst.sum)}, {trend.worst.net} заказов).
                {trend.halves ? (
                  <>
                    {" "}
                    Вторая половина периода против первой: заказы <DeltaChip change={trend.halves.netChange} />, сумма <DeltaChip change={trend.halves.sumChange} />.
                  </>
                ) : null}
              </p>
            ) : null}
            <SourceNote>Если в выгрузке заказов больше лимита WB, цифры занижены{data.truncated ? ": такое случилось сейчас, выберите период короче" : " (сейчас такого нет)"}.</SourceNote>
          </Card>

          <HubWeekdayProfile orders={data} days={days} />
          <HubAnalyticsHistory connected={connected} />
        </>
      )}
    </div>
  );
}
