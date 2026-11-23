"use client";

import { useMemo, useState, type ReactNode } from "react";
import { changePercent, dailyAdsSeries } from "@/lib/seller-hub/ads-metrics";
import { CompareChart } from "./hub-analytics-charts";
import { Card, chartColors, DeltaChip, EmptyNote, Segmented, StatBlock, StatStrip } from "./hub-analytics-ui";
import type { AdsData } from "./hub-ads-data";
import { percent } from "./hub-ads-stats";
import { Formula, HelpTip } from "./hub-help-tip";
import { formatInt, formatRub, hub, hubSans } from "./hub-ui";

type ChartMetric = "orders" | "spend";

/**
 * Вкладка «Обзор»: четыре главных показателя периода (у каждого «?» с понятным объяснением), разбор кампаний сразу под ними,
 * быстрые действия и динамика по дням тем же графиком, что в «Аналитике».
 */
export function HubAdsOverview({ data, review }: { data: AdsData; /** Разбор кампаний: стоит сразу под показателями. */ review?: ReactNode }) {
  const { summary, prevSummary, series } = data;
  const [metric, setMetric] = useState<ChartMetric>("orders");
  const prevSeries = useMemo(() => (data.previous.stats ? dailyAdsSeries(data.previous.stats.campaigns) : []), [data.previous.stats]);
  const points = useMemo(
    () =>
      series.map((day, i) => {
        const prev = prevSeries[i];
        return {
          date: day.date,
          value: Math.round(metric === "orders" ? day.orderSum : day.spend),
          prevDate: prev?.date,
          prev: prev ? Math.round(metric === "orders" ? prev.orderSum : prev.spend) : null,
        };
      }),
    [series, prevSeries, metric],
  );
  if (!summary) return null;
  const change = (cur: number | null, prev: number | null) => (prevSummary ? changePercent(cur, prev) : null);
  const drrBad = summary.drr != null && summary.drr > 100;
  const overall = data.overallDrr;

  const tile = (index: number, help: { title: string; body: ReactNode }, block: ReactNode) => (
    <div key={index} className="relative h-full">
      {block}
      <div className="absolute bottom-4 right-4">
        <HelpTip title={help.title} align={index % 2 === 0 ? "left" : "right"}>
          {help.body}
        </HelpTip>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {data.compare && data.previous.error ? (
        <p className="text-[14px]" style={{ ...hubSans, color: hub.danger }}>
          Прошлый период не загрузился: {data.previous.error}
        </p>
      ) : null}
      {data.compare && data.previous.loading ? (
        <p className="text-[14px]" style={{ ...hubSans, color: hub.textMuted }}>
          Загружаю прошлый период ({data.prevRange.dateFrom} — {data.prevRange.dateTo})…
        </p>
      ) : null}

      <StatStrip cols={4}>
        {tile(
          0,
          { title: "Расход на рекламу", body: <p>Сколько WB списал с вас за показы и клики по кампаниям за выбранный период. Это деньги, которые реклама уже потратила.</p> },
          <StatBlock className="h-full" label="Расход на рекламу" value={formatRub(summary.spend)} color={chartColors.amber} delta={prevSummary ? <DeltaChip change={change(summary.spend, prevSummary.spend)} good="down" /> : undefined} sub={`${formatInt(summary.views)} показов`} />,
        )}
        {tile(
          1,
          {
            title: "Заказы по рекламе",
            body: (
              <>
                <p>Сумма заказов, которые WB отнёс к рекламе. В неё входят и ассоциированные заказы: когда человек увидел рекламу одного товара, а купил другой из вашего магазина.</p>
                <p>Это именно заказы, а не обязательно выкупы.</p>
              </>
            ),
          },
          <StatBlock className="h-full" label="Заказы по рекламе" value={formatRub(summary.orderSum)} color={chartColors.blue} delta={prevSummary ? <DeltaChip change={change(summary.orderSum, prevSummary.orderSum)} /> : undefined} sub={`${formatInt(summary.orders)} шт.`} />,
        )}
        {tile(
          2,
          {
            title: "CTR: кликабельность",
            body: (
              <>
                <p>Какая доля увидевших рекламу нажала на неё. Чем выше, тем привлекательнее карточка в выдаче.</p>
                <Formula example={`${formatInt(summary.clicks)} кликов ÷ ${formatInt(summary.views)} показов = ${percent(summary.ctr)}`}>клики ÷ показы</Formula>
              </>
            ),
          },
          <StatBlock className="h-full" label="CTR" value={percent(summary.ctr)} color={chartColors.green} delta={prevSummary ? <DeltaChip change={change(summary.ctr, prevSummary.ctr)} /> : undefined} sub={`${formatInt(summary.clicks)} кликов`} />,
        )}
        {tile(
          3,
          {
            title: "ДРР: доля рекламных расходов",
            body: (
              <>
                <p>Сколько копеек рекламы приходится на каждый рубль заказов с неё. Если ДРР выше вашей маржи, реклама работает в минус.</p>
                <Formula example={`${formatRub(summary.spend)} ÷ ${formatRub(summary.orderSum)} = ${percent(summary.drr)}`}>расход ÷ сумма заказов по рекламе</Formula>
                {summary.cpo != null ? <Formula example={`${formatRub(summary.spend)} ÷ ${formatInt(summary.orders)} шт. = ${formatRub(summary.cpo)}`}>CPO: расход ÷ число заказов</Formula> : null}
                {summary.romi != null ? <Formula example={`ROMI сейчас ${percent(summary.romi)}`}>ROMI: (заказы − расход) ÷ расход</Formula> : null}
                {overall ? <Formula example={`${formatRub(overall.spend)} ÷ ${formatRub(overall.orders)} = ${percent(overall.percent)} за ${overall.days} общих дн.`}>ДРР общий: расход ÷ все заказы магазина</Formula> : null}
              </>
            ),
          },
          <StatBlock className="h-full" label="ДРР" value={percent(summary.drr)} color={drrBad ? hub.danger : "#8B5CF6"} delta={prevSummary ? <DeltaChip change={change(summary.drr, prevSummary.drr)} good="down" /> : undefined} sub={overall ? `общий ${percent(overall.percent)}` : summary.cpo != null ? `CPO ${formatRub(summary.cpo)}` : "заказов по рекламе нет"} />,
        )}
      </StatStrip>

      {review}

      <Card
        title="Динамика по дням"
        hint={data.compare && prevSeries.length > 0 ? "Сплошная линия — этот период, пунктир — предыдущий такой же" : "Включите «Сравнить с прошлым периодом», чтобы увидеть пунктир предыдущего"}
        action={
          <Segmented<ChartMetric>
            size="sm"
            label="Показатель графика"
            layoutId="ads-chart-metric"
            value={metric}
            onChange={setMetric}
            options={[
              { id: "orders", label: "Заказы по рекламе" },
              { id: "spend", label: "Расход" },
            ]}
          />
        }
      >
        {points.length > 1 ? (
          <CompareChart points={points} label={metric === "orders" ? "Заказы по рекламе" : "Расход на рекламу"} fmt={formatRub} color={metric === "orders" ? chartColors.blue : chartColors.amber} height={300} />
        ) : (
          <EmptyNote title="Разбивки по дням нет">WB не вернул разбивку по дням за этот период.</EmptyNote>
        )}
      </Card>
    </div>
  );
}
