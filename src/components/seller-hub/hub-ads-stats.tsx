"use client";

import { useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { AdAdvice } from "@/lib/seller-hub/ads-advisor";
import { changePercent } from "@/lib/seller-hub/ads-metrics";
import { defaultAdCampaignName } from "@/lib/seller-hub/ads-create";
import { createSellerHubAdCampaign } from "@/lib/seller-hub/client-api";
import type { SellerAdCampaignRow } from "@/lib/seller-hub/types";
import { ruPlural } from "@/lib/seller-hub/task-engine/ru-plural";
import type { AdsData, AdsPeriodDays } from "./hub-ads-data";
import {
  formatInt,
  formatRub,
  hub,
  HubButton,
  HubSegmented,
  hubNumeric,
  hubSans,
} from "./hub-ui";

export function percent(value: number | null): string {
  return value == null ? "—" : `${value.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}%`;
}

function dayLabel(iso: string): string {
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
}

/** Период анализа и сравнение с прошлым периодом: общие для всех вкладок раздела. */
export function AdsPeriodControls({ data }: { data: AdsData }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        aria-pressed={data.compare}
        onClick={() => data.setCompare(!data.compare)}
        className="rounded-full border px-3 py-1.5 text-[13px] font-semibold"
        style={{
          ...hubSans,
          borderColor: data.compare ? hub.ink : hub.border,
          backgroundColor: data.compare ? hub.ink : hub.surface,
          color: data.compare ? "#fff" : hub.text,
        }}
      >
        Сравнить с прошлым периодом
      </button>
      <HubSegmented<AdsPeriodDays>
        layoutId="ads-stats-period"
        value={data.days}
        onChange={data.setDays}
        options={[
          { id: "7", label: "7 дн." },
          { id: "14", label: "14 дн." },
          { id: "30", label: "30 дн." },
        ]}
      />
    </div>
  );
}

/** Подпись под панелью управления: за какие даты данные и откуда они. */
export function AdsPeriodCaption({ data }: { data: AdsData }) {
  const stats = data.current.stats;
  const at = data.current.loadedAt ? new Date(data.current.loadedAt) : null;
  const time = at && !Number.isNaN(at.getTime()) ? at.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) : null;
  return (
    <p className="text-[12.5px]" style={{ ...hubSans, color: hub.textMuted }}>
      {stats
        ? `Данные WB за ${stats.dateFrom} — ${stats.dateTo} (полные дни), только чтение${time ? `, получены в ${time}` : ""}.`
        : "Данные WB за выбранный период, только чтение."}
      {data.current.stale ? (
        <span style={{ color: hub.warn }}>
          {" "}WB сейчас не ответил, показаны последние сохранённые данные.
        </span>
      ) : null}
      {stats ? (
        <button type="button" onClick={data.retry} className="ml-2 font-semibold underline" style={{ color: hub.textMuted }}>
          Обновить
        </button>
      ) : null}
    </p>
  );
}

function Delta({ value, inverse = false }: { value: number | null; inverse?: boolean }) {
  if (value == null) return null;
  const good = inverse ? value <= 0 : value >= 0;
  return (
    <span className="ml-1.5 text-[12px] font-semibold" style={{ color: good ? hub.greenDark : hub.danger }}>
      {value > 0 ? "+" : ""}
      {value.toLocaleString("ru-RU")}%
    </span>
  );
}

/** Состояние загрузки статистики; null — данные есть, можно рисовать вкладку. */
export function AdsStatsGate({ data }: { data: AdsData }) {
  if (data.current.error) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl px-5 py-4" style={{ backgroundColor: hub.surface }}>
        <p className="text-[13px]" style={{ ...hubSans, color: hub.textMuted }}>
          {data.current.error}
        </p>
        <HubButton variant="secondary" size="sm" onClick={data.retry}>
          Повторить
        </HubButton>
      </div>
    );
  }
  if (data.current.loading && !data.current.stats) {
    return (
      <p className="rounded-2xl px-5 py-6 text-[13px]" style={{ ...hubSans, color: hub.textMuted, backgroundColor: hub.surface }}>
        Загружаю статистику рекламы…
      </p>
    );
  }
  if (!data.summary || !data.current.stats) {
    return (
      <p className="rounded-2xl px-5 py-6 text-[13px]" style={{ ...hubSans, color: hub.textMuted, backgroundColor: hub.surface }}>
        За этот период статистики по кампаниям нет.
      </p>
    );
  }
  return null;
}

const KIND_STYLE: Record<AdAdvice["kind"], { label: string; accent: string; soft: string }> = {
  budget_low: { label: "Бюджет кампании", accent: hub.warn, soft: hub.warnSoft },
  no_orders: { label: "Расход без отдачи", accent: hub.danger, soft: hub.dangerSoft },
  margin_eaten: { label: "Реклама в минус", accent: hub.danger, soft: hub.dangerSoft },
  candidate: { label: "Точка роста", accent: hub.green, soft: hub.greenSoft },
};

export type AdviceActions = {
  /** Создана новая кампания: добавить её в список. */
  onCreated?: (row: SellerAdCampaignRow) => void;
  /** Открыть пополнение бюджета кампании с подставленной суммой (подтверждение там). */
  onDeposit?: (campaignId: string, sumRub: number) => void;
  /** Поставить кампанию на паузу (подтверждение в карточке совета). */
  onPause?: (campaignId: string) => Promise<void>;
  /** Убрать товар из кампании (подтверждение в карточке совета). */
  onRemoveNm?: (campaignId: string, nmId: string) => Promise<void>;
};

export function AdviceList({
  advice,
  titles,
  onCreated,
  onDeposit,
  onPause,
  onRemoveNm,
}: { advice: AdAdvice[]; titles: Map<string, string> } & AdviceActions) {
  const [confirmPause, setConfirmPause] = useState<string | null>(null);
  const [pausing, setPausing] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Record<string, string>>({});

  /** Запись в WB: создаёт кампанию без запуска и без списания денег, только после подтверждения. */
  async function create(item: AdAdvice) {
    if (busy || !item.nmId) return;
    setBusy(true);
    try {
      const name = defaultAdCampaignName(titles.get(item.nmId) ?? "");
      const result = await createSellerHubAdCampaign({ nmId: Number(item.nmId), name });
      if (result.ok) {
        setResults((prev) => ({
          ...prev,
          [item.id]: `Кампания${result.campaignId ? ` №${result.campaignId}` : ""} создана и не запущена. Дальше: на вкладке «Запросы и ставки» задайте ставку, на вкладке «Кампании» пополните бюджет и запустите.`,
        }));
        if (result.campaignId) {
          onCreated?.({
            id: String(result.campaignId),
            name,
            status: 4,
            statusLabel: "Готова к запуску",
            paymentType: "cpm",
            budget: 0,
            bidType: "manual",
            bids: [],
          });
        }
        setConfirmId(null);
      } else {
        setResults((prev) => ({ ...prev, [item.id]: result.error ?? "Не удалось создать кампанию" }));
      }
    } catch {
      setResults((prev) => ({ ...prev, [item.id]: "Не удалось создать кампанию" }));
    } finally {
      setBusy(false);
    }
  }

  if (advice.length === 0) {
    return (
      <p className="text-[13px]" style={{ ...hubSans, color: hub.textMuted }}>
        Советов по рекламе нет: бюджеты в порядке, расходов без отдачи и рекламы в минус не найдено.
      </p>
    );
  }
  return (
    <div>
      <p className="mb-2 text-[13px] font-semibold" style={{ ...hubSans, color: hub.text }}>
        Что стоит сделать с рекламой
      </p>
      <ul className="grid gap-3 lg:grid-cols-2">
        {advice.map((item) => {
          const style = KIND_STYLE[item.kind];
          return (
            <li
              key={item.id}
              className="flex flex-col overflow-hidden rounded-2xl border"
              style={{ borderColor: hub.border, backgroundColor: hub.surface }}
            >
              <div className="h-1" style={{ backgroundColor: style.accent }} />
              <div className="flex flex-1 flex-col items-start gap-2 px-4 py-3">
                <span
                  className="w-fit rounded-md px-2 py-0.5 text-[11px] font-semibold"
                  style={{ ...hubSans, backgroundColor: style.soft, color: style.accent }}
                >
                  {style.label}
                </span>
                <p className="text-[14px] font-semibold leading-5" style={{ ...hubSans, color: hub.text }}>
                  {item.title}
                </p>
                <ul className="list-disc space-y-0.5 pl-5 text-[13px] leading-5" style={{ ...hubSans, color: hub.textMuted }}>
                  {item.facts.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                <p
                  className="mt-auto w-full rounded-lg px-3 py-2 text-[13px] leading-5"
                  style={{ ...hubSans, backgroundColor: hub.canvas, color: hub.text }}
                >
                  <strong>Что сделать:</strong> {item.action}
                </p>
                {item.fix?.type === "deposit" && onDeposit ? (
                  <HubButton size="sm" variant="secondary" onClick={() => onDeposit(item.fix!.campaignId, (item.fix as { sumRub: number }).sumRub)}>
                    Пополнить на {formatRub((item.fix as { sumRub: number }).sumRub)}
                  </HubButton>
                ) : null}
                {item.fix?.type === "pause" && onPause ? (
                  confirmPause === item.id ? (
                    <div className="space-y-2">
                      <p className="text-[12.5px] leading-5" style={{ ...hubSans, color: hub.text }}>
                        Поставить кампанию «{item.fix.campaignName}» на паузу? Показы остановятся, бюджет сохранится. Запустить
                        снова можно на вкладке «Кампании».
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <HubButton
                          size="sm"
                          loading={pausing}
                          onClick={() => {
                            setPausing(true);
                            void onPause(item.fix!.campaignId).finally(() => {
                              setPausing(false);
                              setConfirmPause(null);
                            });
                          }}
                        >
                          Поставить на паузу
                        </HubButton>
                        <HubButton size="sm" variant="secondary" disabled={pausing} onClick={() => setConfirmPause(null)}>
                          Отмена
                        </HubButton>
                      </div>
                    </div>
                  ) : (
                    <HubButton size="sm" variant="secondary" onClick={() => setConfirmPause(item.id)}>
                      Поставить кампанию на паузу
                    </HubButton>
                  )
                ) : null}
                {item.fix?.type === "remove_nm" && onRemoveNm ? (
                  confirmPause === item.id ? (
                    <div className="space-y-2">
                      <p className="text-[12.5px] leading-5" style={{ ...hubSans, color: hub.text }}>
                        Убрать этот товар из кампании «{item.fix.campaignName}»? Остальные товары кампании продолжат
                        показываться. Вернуть товар можно в кабинете WB.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <HubButton
                          size="sm"
                          loading={pausing}
                          onClick={() => {
                            const fix = item.fix as { campaignId: string; nmId: string };
                            setPausing(true);
                            void onRemoveNm(fix.campaignId, fix.nmId).finally(() => {
                              setPausing(false);
                              setConfirmPause(null);
                            });
                          }}
                        >
                          Убрать из кампании
                        </HubButton>
                        <HubButton size="sm" variant="secondary" disabled={pausing} onClick={() => setConfirmPause(null)}>
                          Отмена
                        </HubButton>
                      </div>
                    </div>
                  ) : (
                    <HubButton size="sm" variant="secondary" onClick={() => setConfirmPause(item.id)}>
                      Убрать товар из кампании
                    </HubButton>
                  )
                ) : null}
                {item.kind === "candidate" && item.nmId ? (
                  results[item.id] ? (
                    <p className="text-[12.5px] font-semibold leading-5" style={{ ...hubSans, color: hub.greenDark }}>
                      {results[item.id]}
                    </p>
                  ) : confirmId === item.id ? (
                    <div className="space-y-2">
                      <p className="text-[12.5px] leading-5" style={{ ...hubSans, color: hub.text }}>
                        Будет создана кампания «{defaultAdCampaignName(titles.get(item.nmId) ?? "")}»: один товар, ручная
                        ставка, оплата за показы, размещение в поиске. Деньги не спишутся, показы не начнутся, пока вы не
                        пополните бюджет и не запустите кампанию.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <HubButton size="sm" loading={busy} onClick={() => void create(item)}>
                          Создать кампанию
                        </HubButton>
                        <HubButton size="sm" variant="secondary" disabled={busy} onClick={() => setConfirmId(null)}>
                          Отмена
                        </HubButton>
                      </div>
                    </div>
                  ) : (
                    <HubButton size="sm" variant="secondary" onClick={() => setConfirmId(item.id)}>
                      Создать тестовую кампанию
                    </HubButton>
                  )
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Вкладка «Обзор»: итоги периода, сравнение, советы и динамика по дням. */
export function AdsKpi({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "good" | "warn" | "danger";
}) {
  const color = tone === "good" ? hub.green : tone === "warn" ? hub.warn : tone === "danger" ? hub.danger : hub.text;
  return (
    <div className="rounded-2xl border px-4 py-3.5" style={{ borderColor: hub.border, backgroundColor: hub.surface }}>
      <p className="text-[11.5px] font-semibold uppercase tracking-[0.06em]" style={{ ...hubSans, color: hub.textSubtle }}>
        {label}
      </p>
      <p className="mt-1.5 text-[26px] font-semibold leading-none tracking-[-0.02em]" style={{ ...hubSans, ...hubNumeric, color }}>
        {value}
      </p>
      {sub ? (
        <p className="mt-1.5 text-[12.5px] leading-4" style={{ ...hubSans, color: hub.textMuted }}>
          {sub}
        </p>
      ) : null}
    </div>
  );
}
export function AdsOverview({
  data,
  onCampaignCreated,
  onDeposit,
  onPause,
  onRemoveNm,
}: {
  data: AdsData;
  onCampaignCreated?: (row: SellerAdCampaignRow) => void;
  onDeposit?: AdviceActions["onDeposit"];
  onPause?: AdviceActions["onPause"];
  onRemoveNm?: AdviceActions["onRemoveNm"];
}) {
  const { summary, prevSummary, series } = data;
  if (!summary) return null;
  const dRub = (cur: number | null, prev: number | null) => (prevSummary ? changePercent(cur, prev) : null);
  const chartData = series.map((day) => ({
    label: dayLabel(day.date),
    spend: Math.round(day.spend),
    orderSum: Math.round(day.orderSum),
  }));

  return (
    <div className="space-y-4">
      {data.compare && data.previous.error ? (
        <p className="text-[12px]" style={{ ...hubSans, color: hub.danger }}>
          Прошлый период не загрузился: {data.previous.error}
        </p>
      ) : null}
      {data.compare && data.previous.loading ? (
        <p className="text-[12px]" style={{ ...hubSans, color: hub.textMuted }}>
          Загружаю прошлый период ({data.prevRange.dateFrom} — {data.prevRange.dateTo})…
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AdsKpi
          label="Расход на рекламу"
          value={formatRub(summary.spend)}
          sub={`${formatInt(summary.views)} показов${prevSummary ? ` · раньше ${formatRub(prevSummary.spend)}` : ""}`}
        />
        <AdsKpi
          label="CTR"
          value={percent(summary.ctr)}
          sub={`${formatInt(summary.clicks)} кликов${prevSummary ? ` · раньше ${percent(prevSummary.ctr)}` : ""}`}
        />
        <AdsKpi
          label="Заказы по рекламе"
          value={formatRub(summary.orderSum)}
          sub={`${formatInt(summary.orders)} шт.${prevSummary ? ` · раньше ${formatRub(prevSummary.orderSum)}` : ""}`}
        />
        <AdsKpi
          label="ДРР"
          value={percent(summary.drr)}
          sub={
            summary.cpo != null
              ? `CPO ${formatRub(summary.cpo)}${prevSummary ? ` · раньше ${percent(prevSummary.drr)}` : ""}`
              : "заказов по рекламе нет"
          }
          tone={summary.drr != null && summary.drr > 100 ? "danger" : "default"}
        />
      </div>
      {data.overallDrr ? (
        <p className="rounded-xl px-4 py-2.5 text-[13px] leading-5" style={{ ...hubSans, color: hub.textMuted, backgroundColor: hub.blueSoft }}>
          ДРР общий: <strong style={{ color: hub.text }}>{percent(data.overallDrr.percent)}</strong> — расход на рекламу{" "}
          {formatRub(data.overallDrr.spend)} к сумме всех заказов магазина {formatRub(data.overallDrr.orders)} за{" "}
          {data.overallDrr.days} {ruPlural(data.overallDrr.days, "общий день", "общих дня", "общих дней")} с Analytics WB.
        </p>
      ) : null}
      {prevSummary ? (
        <p className="text-[12px]" style={{ ...hubSans, color: hub.textMuted }}>
          К прошлому периоду ({data.prevRange.dateFrom} — {data.prevRange.dateTo}): расход
          <Delta value={dRub(summary.spend, prevSummary.spend)} inverse />
          {" · "}заказы по рекламе
          <Delta value={dRub(summary.orderSum, prevSummary.orderSum)} />
          {" · "}показы
          <Delta value={dRub(summary.views, prevSummary.views)} />
        </p>
      ) : null}

      <AdviceList advice={data.advice} titles={data.titles} onCreated={onCampaignCreated} onDeposit={onDeposit} onPause={onPause} onRemoveNm={onRemoveNm} />

      {chartData.length > 1 ? (
        <div className="rounded-2xl border p-4" style={{ borderColor: hub.border, backgroundColor: hub.surface }}>
          <p className="mb-1 text-[13px] font-semibold" style={{ ...hubSans, color: hub.text }}>
            Динамика по дням: расход и заказы по рекламе, ₽
          </p>
          <div style={{ width: "100%", height: 200 }}>
            <ResponsiveContainer>
              <AreaChart data={chartData} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={hub.border} vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: hub.textSubtle }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: hub.textSubtle }} tickLine={false} axisLine={false} width={48} />
                <Tooltip formatter={(value, name) => [formatRub(Number(value)), name === "spend" ? "Расход" : "Заказы по рекламе"]} />
                <Area type="monotone" dataKey="orderSum" stroke={hub.blue} fill={hub.blue} fillOpacity={0.12} strokeWidth={2} />
                <Area type="monotone" dataKey="spend" stroke={hub.danger} fill={hub.danger} fillOpacity={0.1} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
        <p className="text-[12px]" style={{ ...hubSans, color: hub.textSubtle }}>
          WB не вернул разбивку по дням за этот период.
        </p>
      )}

      <details className="rounded-2xl border px-4 py-3" style={{ borderColor: hub.border, backgroundColor: hub.surface }}>
        <summary className="cursor-pointer text-[13px] font-semibold" style={{ ...hubSans, color: hub.text }}>
          Как считаются показатели
        </summary>
        <p className="mt-2 text-[12.5px] leading-5" style={{ ...hubSans, color: hub.textMuted }}>
          CTR = клики ÷ показы. ДРР = расход ÷ сумма заказов по рекламе. CPO = расход ÷ число заказов по рекламе. ROMI =
          (сумма заказов − расход) ÷ расход{summary.romi != null ? `: ${percent(summary.romi)}` : ""}. ДРР общий = расход ÷
          сумма всех заказов магазина за те же дни. Заказы по рекламе — как их считает WB, вместе с ассоциированными.
        </p>
      </details>
    </div>
  );
}

/** Вкладка «Товары»: расход и ДРР по артикулам, запас по марже, ассоциированные заказы. */
export function AdsProducts({ data }: { data: AdsData }) {
  const { productRows, associated } = data;
  if (productRows.length === 0) {
    return (
      <p className="rounded-2xl px-5 py-6 text-[13px]" style={{ ...hubSans, color: hub.textMuted, backgroundColor: hub.surface }}>
        За этот период ни на один товар реклама не тратила деньги.
      </p>
    );
  }
  return (
    <div className="space-y-2 rounded-2xl p-4" style={{ backgroundColor: hub.surface }}>
      {associated ? (
        <p className="text-[12.5px] leading-5" style={{ ...hubSans, color: hub.textMuted }}>
          Ещё {formatInt(associated.orders)} шт. на {formatRub(associated.orderSum)} WB отнёс к рекламе по товарам без
          расхода ({formatInt(associated.products)} арт.): это ассоциированные заказы, их ДРР не считаем.
        </p>
      ) : null}
      <p className="text-[12px] leading-5" style={{ ...hubSans, color: hub.textSubtle }}>
        «Запас по марже» = маржа на 1 продажу минус ДРР, в п. п. Минус значит, что реклама съедает прибыль с этого товара.
        Маржа считается без рекламы, заказы WB в рекламе — это заказы, а не обязательно выкупы.
      </p>
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-left">
          <thead style={{ backgroundColor: hub.surfaceMuted }}>
            <tr>
              {["Артикул", "Расход", "Показы", "CTR", "Заказы", "ДРР", "Маржа", "Запас по марже"].map((label) => (
                <th
                  key={label}
                  className="border-b px-3 py-2.5 text-[11.5px] font-bold uppercase tracking-[0.06em]"
                  style={{ ...hubSans, color: hub.textSubtle, borderColor: hub.borderSoft }}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {productRows.slice(0, 40).map((row) => {
              const marginPercent = data.marginByNm.get(row.nmId) ?? null;
              const drr = row.summary.drr;
              const headroom = marginPercent != null && drr != null ? Math.round((marginPercent - drr) * 10) / 10 : null;
              return (
                <tr key={row.nmId} className="border-b" style={{ borderColor: hub.borderSoft }}>
                  <td className="max-w-[260px] truncate px-3 py-2.5 text-[13px] font-medium" style={hubSans}>
                    {data.titles.get(row.nmId) || row.name || row.nmId}
                    <span className="ml-1.5 font-mono text-[11px]" style={{ color: hub.textSubtle }}>
                      {row.nmId}
                    </span>
                  </td>
                  {[
                    formatRub(row.summary.spend),
                    formatInt(row.summary.views),
                    percent(row.summary.ctr),
                    formatInt(row.summary.orders),
                    percent(drr),
                    percent(marginPercent),
                  ].map((cell, index) => (
                    <td key={index} className="whitespace-nowrap px-3 py-2.5 text-[13px]" style={{ ...hubSans, ...hubNumeric, color: hub.text }}>
                      {cell}
                    </td>
                  ))}
                  <td
                    className="whitespace-nowrap px-3 py-2.5 text-[13px] font-semibold"
                    style={{
                      ...hubSans,
                      ...hubNumeric,
                      color: headroom == null ? hub.textSubtle : headroom < 0 ? hub.danger : hub.greenDark,
                    }}
                  >
                    {headroom == null ? "—" : `${headroom > 0 ? "+" : ""}${headroom.toLocaleString("ru-RU")} п. п.`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
