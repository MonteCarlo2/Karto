"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { pctChange } from "@/lib/seller-hub/analytics-core";
import type { SellerCatalogSnapshot } from "@/lib/seller-hub/types";
import { RingMeter } from "./hub-analytics-charts";
import { formatInt, formatRub, hub, HubPhoto, hubNumeric, hubSans } from "./hub-ui";
import { Card, chartColors, DeltaChip, EmptyNote, fmtPct, PpChip } from "./hub-analytics-ui";
import type { AnalyticsData } from "./use-analytics-data";

export type FunnelStage = { id: string; label: string; cur: number; past: number | null; rateLabel?: string; rate?: number | null; pastRate?: number | null };

/**
 * Воронка полосами: длина — число людей на шаге, светлая подложка — предыдущий период.
 * Между шагами конверсия: сколько дошло до следующего. compact — для «Сводки».
 */
export function FunnelBars({ stages, compact = false, showPast = true }: { stages: FunnelStage[]; compact?: boolean; /** Показывать прошлый период (светлая подложка и «было»). */ showPast?: boolean }) {
  // Шкала общая для текущего и прошлого периода: иначе при падении просмотров метка прошлого значения прижималась бы к краю.
  const max = Math.max(...stages.map((s) => Math.max(s.cur, s.past ?? 0)), 1);
  const ramp = ["#3844C9", chartColors.blue, "#7E88F2", "#AEB4F7"];
  return (
    <div className="group/fn">
      {stages.map((s, i) => (
        <div key={s.id}>
          {s.rateLabel ? (
            <div className="flex items-center gap-2.5 py-1.5 pl-1" style={hubSans}>
              <svg width="10" height="14" viewBox="0 0 10 14" aria-hidden className="shrink-0" style={{ color: hub.textSubtle }}>
                <path d="M5 0v11M1.5 7.5 5 11l3.5-3.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className={compact ? "text-[12.5px]" : "text-[13.5px]"} style={{ color: hub.textMuted }}>
                <span className="font-semibold" style={{ ...hubNumeric, color: hub.text }}>
                  {fmtPct(s.rate ?? null)}
                </span>{" "}
                {s.rateLabel}
                {showPast && s.pastRate != null ? <span style={{ color: hub.textSubtle }}>, было {fmtPct(s.pastRate)}</span> : null}
              </span>
            </div>
          ) : null}
          <div className="rounded-xl px-1 py-1.5 transition-opacity duration-150 group-hover/fn:opacity-50 hover:!opacity-100" title={s.past != null ? `Было: ${formatInt(s.past)}` : undefined}>
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <span className={compact ? "text-[13.5px] font-semibold" : "text-[14.5px] font-semibold"} style={{ ...hubSans, color: hub.text }}>
                <span className="mr-2 font-medium" style={{ ...hubNumeric, color: hub.textSubtle }}>
                  {i + 1}
                </span>
                {s.label}
              </span>
              <span className="flex items-center gap-2.5">
                <span className={compact ? "text-[18px] font-semibold tracking-[-0.02em]" : "text-[24px] font-semibold tracking-[-0.025em]"} style={{ ...hubSans, ...hubNumeric, color: hub.text }}>
                  {formatInt(s.cur)}
                </span>
                <DeltaChip change={pctChange(s.cur, s.past)} />
              </span>
            </div>
            <div className="relative overflow-hidden rounded-[7px]" style={{ height: compact ? 16 : 24, backgroundColor: "rgba(1, 20, 8, 0.045)" }}>
              {showPast && s.past != null ? <div className="absolute inset-y-0 left-0 rounded-[7px]" style={{ width: `${Math.max(0.8, (s.past / max) * 100)}%`, backgroundColor: chartColors.mute }} /> : null}
              <div className="absolute inset-y-[3px] left-0 rounded-[5px] transition-[width] duration-700 ease-out" style={{ width: `${Math.max(0.8, (s.cur / max) * 100)}%`, backgroundColor: ramp[Math.min(i, ramp.length - 1)] }} />
            </div>
            {showPast && s.past != null ? (
              <p className="mt-1 text-[12px]" style={{ ...hubSans, ...hubNumeric, color: hub.textSubtle }}>
                было {formatInt(s.past)}
              </p>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Воронка ступенями: у каждого шага номер цвета этапа, название, число и изменение к прошлому периоду. Под шагом полоса показывает,
 * какая доля людей дошла до него с предыдущего шага (у первого полная), рядом сама доля. Так сразу видно, где воронка сужается.
 */
export function FunnelSteps({ stages, compact = false }: { stages: FunnelStage[]; compact?: boolean }) {
  const tones = ["#4A56DD", "#8B4FE0", "#C44FB8", "#E8604F"];
  const first = Math.max(stages[0]?.cur ?? 0, 1);
  const mono = { fontFamily: "var(--font-geist-mono), ui-monospace, monospace", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.05em" } as const;
  return (
    <ol className="my-auto flex flex-col items-center">
      {stages.map((s, i) => {
        const prev = i > 0 ? stages[i - 1]!.cur : null;
        const conv = s.rate ?? (prev != null && prev > 0 ? s.cur / prev : null);
        const tone = tones[Math.min(i, tones.length - 1)]!;
        // Ширина ступени: корень от доли первого шага, чтобы воронка сужалась заметно, но число всегда помещалось.
        const width = 46 + 54 * Math.sqrt(Math.max(0, Math.min(1, s.cur / first)));
        return (
          <li key={s.id} className="flex w-full flex-col items-center">
            {i > 0 ? (
              <div className="flex items-center gap-2 py-2 text-[14px]" style={hubSans}>
                <svg width="12" height="16" viewBox="0 0 10 14" aria-hidden style={{ color: tone }}>
                  <path d="M5 0v11M1.5 7.5 5 11l3.5-3.5" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="text-[20px] font-medium" style={{ ...mono, color: tone }}>
                  {fmtPct(conv)}
                </span>
                <span style={{ color: hub.textMuted }}>{s.rateLabel ?? "от предыдущего шага"}</span>
              </div>
            ) : null}
            <div
              className={cn("flex items-center justify-between gap-3 rounded-[20px] text-white", compact ? "px-4 py-3" : "px-6 py-3.5")}
              style={{ width: `${width}%`, minWidth: 250, background: tone, boxShadow: "none" }}
            >
              <span className="min-w-0">
                <span className={compact ? "block text-[14px] font-medium" : "block text-[16px] font-medium"} style={{ ...hubSans, opacity: 0.92 }}>
                  {s.label}
                </span>
                {s.past != null ? (
                  <span className="block text-[12.5px]" style={{ ...mono, letterSpacing: "-0.02em", opacity: 0.75 }}>
                    было {formatInt(s.past)}
                  </span>
                ) : null}
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                <span className={compact ? "text-[24px] font-medium leading-none" : "text-[32px] font-medium leading-none"} style={mono}>
                  {formatInt(s.cur)}
                </span>
                {s.past != null ? <DeltaChip change={pctChange(s.cur, s.past)} /> : null}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Воронка магазина: просмотр → корзина → заказ → выкуп за выбранный период против предыдущего такого же, и товары с утечками. */
export function HubAnalyticsFunnel({ data, days, snapshot, only }: { data: AnalyticsData; days: number; snapshot?: SellerCatalogSnapshot; /** Из чата: только воронка и конверсии без списка товаров. */ only?: "funnel" }) {
  const { kpis, rows } = data;
  const photos = useMemo(() => new Map((snapshot?.items ?? []).map((i) => [i.externalId, i.imageUrl ?? undefined])), [snapshot?.items]);
  if (!kpis) {
    return (
      <Card title="Воронки пока нет">
        <EmptyNote title="Воронка читается из аналитики WB">Выгрузите данные кабинета; нужна категория «Аналитика» в токене.</EmptyNote>
      </Card>
    );
  }
  const { current: c, past: p } = kpis;
  const stages: FunnelStage[] = [
    { id: "open", label: "Просмотры карточек", cur: c.opens, past: p?.opens ?? null },
    { id: "cart", label: "Добавили в корзину", cur: c.carts, past: p?.carts ?? null, rateLabel: "из просмотров", rate: c.cartRate, pastRate: p?.cartRate },
    { id: "order", label: "Заказали", cur: c.orders, past: p?.orders ?? null, rateLabel: "из корзины", rate: c.orderRate, pastRate: p?.orderRate },
    { id: "buy", label: "Выкупили", cur: c.buyouts, past: p?.buyouts ?? null, rateLabel: "по завершённым заказам", rate: c.buyoutRate, pastRate: p?.buyoutRate },
  ];
  const leaks = rows.filter((r) => r.leak != null).sort((a, b) => b.opens - a.opens).slice(0, 12);
  const ppOf = (cur: number | null, past: number | null | undefined) => (cur == null || past == null ? null : (cur - past) * 100);

  return (
    <div className="space-y-3">
      <div className="grid gap-3 xl:grid-cols-12">
        <Card className="xl:col-span-7" fill title="Воронка магазина" hint={`За ${days} дн. Между шагами — какая доля людей дошла с предыдущего`}>
          <FunnelSteps stages={stages} />
        </Card>
        <Card className="xl:col-span-5" fill title="Конверсии" hint="Две главные доли по магазину">
          <div className="grid flex-1 grid-cols-1 content-center gap-8 sm:grid-cols-2">
            <div>
              <RingMeter stacked size={230} value={c.buyoutRate} label="Выкуп" sub="выкуплено из заказов с известным исходом" color={chartColors.violet} />
              <div className="mt-3 flex justify-center">
                <PpChip pp={ppOf(c.buyoutRate, p?.buyoutRate)} />
              </div>
            </div>
            <div>
              <RingMeter stacked size={230} value={c.openToOrder} label="Просмотр → заказ" sub="сквозная конверсия карточек" color={chartColors.teal} />
              <div className="mt-3 flex justify-center">
                <PpChip pp={ppOf(c.openToOrder, p?.openToOrder)} />
              </div>
            </div>
          </div>
        </Card>
      </div>

      <Card className={only ? "hidden" : undefined} title="Где товары теряют покупателей" hint="Больше 100 просмотров, а доля в корзину или в заказ ниже 60% от среднего по магазину">
        {leaks.length === 0 ? (
          <p className="flex items-center gap-2.5 text-[14px]" style={{ ...hubSans, color: hub.greenDark }}>
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "#2F9E63" }} aria-hidden />
            Явных утечек нет: у товаров с достаточным числом просмотров конверсии не хуже 60% от магазинных.
          </p>
        ) : (
          <ul className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {leaks.map((r) => (
              <li key={r.nmId} className="rounded-[22px] border p-5" style={{ borderColor: "rgba(1, 20, 8, 0.1)", background: "linear-gradient(180deg, #FFFFFF 0%, #FBFAF6 100%)", boxShadow: "0 10px 26px -20px rgba(1, 20, 8, 0.28)" }}>
                <div className="flex items-center gap-3.5">
                  <HubPhoto src={photos.get(r.nmId)} className="h-[64px] w-[48px] shrink-0 rounded-[10px]" iconClassName="h-4 w-4" />
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-[15.5px] font-semibold leading-[1.3] [overflow-wrap:anywhere]" style={{ ...hubSans, color: hub.text }}>
                      {r.title}
                    </p>
                    <p className="mt-1 text-[13px]" style={{ ...hubSans, ...hubNumeric, color: hub.textMuted }}>
                      {formatInt(r.opens)} просмотров · {formatRub(r.orderSum)}
                    </p>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <Conv label="В корзину" value={r.cartRate} shop={c.cartRate} bad={r.leak === "cart"} />
                  <Conv label="Из корзины в заказ" value={r.orderRate} shop={c.orderRate} bad={r.leak === "order"} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/** Конверсия товара против среднего по магазину: крупное число и рядом магазинное. Красная плитка — утечка. */
function Conv({ label, value, shop, bad }: { label: string; value: number | null; shop: number | null; bad: boolean }) {
  const tone = bad ? chartColors.danger : chartColors.green;
  return (
    <div className="rounded-[16px] px-3.5 py-3" style={{ backgroundColor: bad ? "rgba(239,68,68,0.09)" : "rgba(16,185,129,0.08)" }}>
      <p className="text-[12.5px] leading-tight" style={{ ...hubSans, color: hub.textMuted }}>
        {label}
      </p>
      <p className="mt-1.5 text-[26px] font-medium leading-none" style={{ fontFamily: "var(--font-geist-mono), ui-monospace, monospace", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.05em", color: bad ? "#C42B2B" : hub.text }}>
        {fmtPct(value)}
      </p>
      <p className="mt-1.5 text-[12.5px]" style={{ ...hubSans, color: hub.textSubtle }}>
        <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ backgroundColor: tone }} aria-hidden />
        магазин {fmtPct(shop)}
      </p>
    </div>
  );
}
