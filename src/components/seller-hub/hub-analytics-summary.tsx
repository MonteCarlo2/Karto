"use client";

import { pctChange } from "@/lib/seller-hub/analytics-core";
import { formatInt, formatRub, hub, hubSans } from "./hub-ui";
import { dayLabel, BarRow, Card, fmtPct, IncompleteNotice, Kpi, SourceNote } from "./hub-analytics-ui";
import type { AnalyticsData } from "./use-analytics-data";

const pp = (cur: number | null, past: number | null | undefined) => (cur == null || past == null ? null : (cur - past) * 100);

const SEVERITY = {
  bad: { border: hub.danger, bg: hub.dangerSoft, color: hub.danger },
  warn: { border: hub.warn, bg: hub.warnSoft, color: hub.warn },
  ok: { border: hub.green, bg: hub.greenSoft, color: hub.green },
  unknown: { border: hub.border, bg: hub.canvas, color: hub.textSubtle },
} as const;

/** Группа показателей с подписью: сводка читается блоками, а не одной сеткой. */
function KpiGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em]" style={{ ...hubSans, color: hub.textSubtle }}>
        {title}
      </p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{children}</div>
    </section>
  );
}

const TONE = { good: { bg: hub.greenSoft, color: hub.green }, bad: { bg: hub.dangerSoft, color: hub.danger }, info: { bg: hub.blueSoft, color: hub.blue } } as const;

/** Сводка: главные показатели магазина за выбранный период против предыдущего такого же, выводы словами, ABC и главные изменения. */
export function HubAnalyticsSummary({ data }: { data: AnalyticsData }) {
  const { kpis, insights, abc, movers, money: m } = data;
  if (!kpis) {
    return (
      <Card title="Данных для сводки пока нет">
        <p className="text-[13px] leading-5" style={{ ...hubSans, color: hub.textMuted }}>
          Сводка строится по воронке продаж WB (просмотры, корзина, заказы, выкупы). Выгрузите данные кабинета; нужна категория «Аналитика» в API-токене.
        </p>
      </Card>
    );
  }
  const { current: c, past: p } = kpis;
  const maxAbc = Math.max(...abc.map((x) => x.orderSum), 1);
  const maxMove = Math.max(...[...movers.growing, ...movers.falling].map((r) => Math.abs(r.sumDelta ?? 0)), 1);
  return (
    <div className="space-y-4">
      <p className="text-[12.5px]" style={{ ...hubSans, color: hub.textMuted }}>
        Период: {dayLabel(kpis.period.from)} — {dayLabel(kpis.period.to)}
        {kpis.period.pastFrom && kpis.period.pastTo ? `, сравнение с ${dayLabel(kpis.period.pastFrom)} — ${dayLabel(kpis.period.pastTo)}` : ", прошлого периода нет"}. Данные воронки WB по вашему кабинету.
      </p>

      {kpis.truncated ? <IncompleteNotice what="Воронку и отчёт об остатках" /> : null}

      <KpiGroup title="Продажи">
        <Kpi label="Заказы" value={formatInt(c.orders)} change={pctChange(c.orders, p?.orders ?? null)} sub="шт., с отменёнными" />
        <Kpi
          label="Сумма заказов"
          value={formatRub(c.orderSum)}
          change={pctChange(c.orderSum, p?.orderSum ?? null)}
          sub="с отменёнными"
          hint="Сумма всех оформленных заказов по воронке WB, включая позже отменённые. Сумма без отмен — во вкладке «Динамика»."
        />
        <Kpi label="Средний чек" value={c.avgCheck != null ? formatRub(c.avgCheck) : "—"} change={pctChange(c.avgCheck, p?.avgCheck ?? null)} good="neutral" />
        <Kpi label="Выкуп" value={fmtPct(c.buyoutRate)} pp={pp(c.buyoutRate, p?.buyoutRate)} hint="Выкуплено / (выкуплено + отменено): по заказам, у которых уже есть исход. Как считает WB." sub="по завершённым" />
        <Kpi
          label="Продано по отчёту"
          value={m ? `${formatInt(m.current.units)} шт.` : "—"}
          change={m ? pctChange(m.current.units, m.past?.units ?? null) : undefined}
          sub={m ? `на ${formatRub(m.current.revenue)}` : "нет отчёта реализации"}
          hint="Продажи минус возвраты по отчёту реализации WB, по цене продавца. Считаются по дате продажи, поэтому сюда попадают и заказы, сделанные до начала периода: число не равно выкупам воронки."
        />
      </KpiGroup>

      <KpiGroup title="Воронка">
        <Kpi label="Просмотры карточек" value={formatInt(c.opens)} change={pctChange(c.opens, p?.opens ?? null)} />
        <Kpi label="Просмотр → корзина" value={fmtPct(c.cartRate)} pp={pp(c.cartRate, p?.cartRate)} />
        <Kpi label="Корзина → заказ" value={fmtPct(c.orderRate)} pp={pp(c.orderRate, p?.orderRate)} />
        <Kpi label="Просмотр → заказ" value={fmtPct(c.openToOrder)} pp={pp(c.openToOrder, p?.openToOrder)} hint="Сквозная конверсия: из просмотров карточек в заказы" />
      </KpiGroup>

      <KpiGroup title="Деньги">
        <Kpi label="Выручка" value={m ? formatRub(m.current.revenue) : "—"} change={m ? pctChange(m.current.revenue, m.past?.revenue ?? null) : undefined} sub={m ? "по отчёту реализации" : "нет отчёта реализации"} />
        <Kpi label="Остаётся до себестоимости" value={m ? formatRub(m.current.beforeCost) : "—"} change={m ? pctChange(m.current.beforeCost, m.past?.beforeCost ?? null) : undefined} sub="после WB, логистики, хранения" />
        <Kpi
          label="Прибыль"
          value={m?.current.profit != null ? formatRub(m.current.profit) : "—"}
          change={m?.current.profit != null && m.past?.profit != null ? pctChange(m.current.profit, m.past.profit) : undefined}
          sub={m?.current.profit != null ? `маржа ${fmtPct(m.current.margin)}` : "укажите себестоимость"}
          hint="Остаётся до себестоимости минус себестоимость проданного, по товарам с указанной себестоимостью. Налог, реклама и штрафы не вычтены."
        />
        <Kpi
          label="Логистика и хранение"
          value={m ? fmtPct(m.current.revenue > 0 ? (m.current.logistics + m.current.storage) / m.current.revenue : null) : "—"}
          good="down"
          sub={m ? `${formatRub(m.current.logistics + m.current.storage)} от выручки` : undefined}
        />
      </KpiGroup>

      <KpiGroup title="Склад и каталог">
        <Kpi label="Товаров с заказами" value={`${formatInt(c.activeProducts)} из ${formatInt(kpis.skuCount)}`} change={p ? pctChange(c.activeProducts, p.activeProducts) : undefined} sub="в каталоге" />
        <Kpi
          label="Упущено без товара"
          value={kpis.lost ? formatRub(kpis.lost.sum) : "—"}
          good="down"
          sub={kpis.lost ? `${formatInt(kpis.lost.orders)} заказов, считает WB` : "отчёт WB не загружен"}
          hint="Заказы, которых не случилось из-за отсутствия товара на складах. Считает WB."
        />
        <Kpi label="Закончились и заканчиваются" value={data.stockSummary ? formatInt(data.stockSummary.out + data.stockSummary.low) : "—"} good="down" sub={data.stockSummary ? `закончились: ${data.stockSummary.out}` : "нет отчёта об остатках"} />
        <Kpi label="Деньги в залежавшемся" value={data.stockSummary ? formatRub(data.stockSummary.frozenValue) : "—"} good="down" sub={data.stockSummary && data.stockSummary.frozenWithoutCost > 0 ? "сумма неполная: у части нет себестоимости" : "остаток по себестоимости"} />
      </KpiGroup>

      <Card title="Где теряются деньги" hint="Суммы, которые прямо видны в отчётах WB: упущенное из-за отсутствия товара, убытки, возвраты, штрафы. Ничего не оценено и не спрогнозировано.">
        {data.leaks.length === 0 ? (
          <p className="text-[13px]" style={{ ...hubSans, color: hub.green }}>
            Явных потерь в отчётах не видно: нет упущенных заказов, убыточных товаров, возвратов и штрафов за период.
          </p>
        ) : (
          <ul className="space-y-3">
            {data.leaks.map((l) => (
              <li key={l.id}>
                <BarRow label={l.title} value={l.amount} max={data.leaks[0]!.amount} text={formatRub(l.amount)} color={hub.danger} />
                <p className="mt-0.5 text-[12px] leading-4" style={{ ...hubSans, color: hub.textSubtle }}>
                  {l.source}
                  {l.detail ? ` · ${l.detail}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
        <SourceNote>В потери не входят деньги, замороженные в остатках (это капитал), и расходы на рекламу (они во вкладке «Реклама»). Суммы за разные периоды сложить нельзя: у каждой строки указан свой.</SourceNote>
      </Card>

      <Card title="Мониторинг по направлениям" hint="Сколько товаров затронуто в каждом направлении. Красный — есть серьёзная проблема, оранжевый — нужно присмотреться, зелёный — всё в порядке, серый — не хватает данных.">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data.monitoring.map((d) => {
            const tone = SEVERITY[d.severity];
            return (
              <div key={d.id} className="rounded-xl border px-3.5 py-3" style={{ borderColor: tone.border, backgroundColor: tone.bg }}>
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-[13.5px] font-semibold" style={{ ...hubSans, color: hub.text }}>
                    {d.label}
                  </p>
                  <p className="text-[20px] font-semibold leading-none tabular-nums" style={{ ...hubSans, color: tone.color }}>
                    {d.count == null ? "—" : d.count}
                  </p>
                </div>
                <p className="mt-1 text-[11.5px] leading-4" style={{ ...hubSans, color: hub.textMuted }}>
                  {d.count == null ? `Нет данных. ${d.rule}` : d.rule}
                </p>
                {d.items.length > 0 ? (
                  <ul className="mt-2 space-y-0.5">
                    {d.items.slice(0, 3).map((i) => (
                      <li key={i.nmId} className="flex items-baseline justify-between gap-2 text-[12px]" style={hubSans}>
                        <span className="min-w-0 truncate" style={{ color: hub.text }}>
                          {i.title}
                        </span>
                        <span className="shrink-0" style={{ color: hub.textMuted }}>
                          {i.note}
                        </span>
                      </li>
                    ))}
                    {d.count != null && d.count > 3 ? (
                      <li className="text-[11.5px]" style={{ ...hubSans, color: hub.textSubtle }}>
                        и ещё {d.count - 3}
                      </li>
                    ) : null}
                  </ul>
                ) : null}
              </div>
            );
          })}
        </div>
      </Card>

      {insights.length > 0 ? (
        <Card title="Главные выводы" hint="Строятся из цифр ниже; ничего не додумывается.">
          <ul className="space-y-2">
            {insights.map((i) => (
              <li key={i.id} className="rounded-lg px-3 py-2 text-[13px] leading-5" style={{ ...hubSans, backgroundColor: TONE[i.tone].bg, color: TONE[i.tone].color }}>
                {i.text}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Кто даёт оборот (ABC)" hint="Товары по убыванию суммы заказов. Класс A набирает первые 80% (последний товар, перешагнувший порог, тоже в A), B — до 95%, C — остальное.">
          <div className="space-y-2.5">
            {abc.map((x) => (
              <BarRow key={x.abc} label={`Класс ${x.abc}`} value={x.orderSum} max={maxAbc} text={fmtPct(x.share, 0)} sub={`${x.products} тов.`} color={x.abc === "A" ? hub.green : x.abc === "B" ? hub.blue : hub.textSubtle} />
            ))}
          </div>
          <SourceNote>По сумме заказов за период. Товары без заказов в классы не входят.</SourceNote>
        </Card>

        <Card title="Что изменилось сильнее всего" hint="Вклад товара в изменение суммы заказов к прошлому периоду.">
          {movers.growing.length === 0 && movers.falling.length === 0 ? (
            <p className="text-[13px]" style={{ ...hubSans, color: hub.textMuted }}>
              Нет прошлого периода или изменений для сравнения.
            </p>
          ) : (
            <div className="space-y-2">
              {movers.growing.map((r) => (
                <BarRow key={r.nmId} label={r.title} value={r.sumDelta ?? 0} max={maxMove} text={`+${formatRub(r.sumDelta ?? 0)}`} color={hub.green} />
              ))}
              {movers.falling.map((r) => (
                <BarRow key={r.nmId} label={r.title} value={Math.abs(r.sumDelta ?? 0)} max={maxMove} text={`−${formatRub(Math.abs(r.sumDelta ?? 0))}`} color={hub.danger} />
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
