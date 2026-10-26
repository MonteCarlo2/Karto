"use client";

import { useState } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { SellerHubAreaId } from "@/lib/seller-hub/nav";
import type { SellerCatalogSnapshot, SellerDailySalesPoint, SellerOrderRow } from "@/lib/seller-hub/types";
import { storeBuyoutFromFunnel } from "@/lib/seller-hub/buyout";
import { snapshotTimeMs, withoutIncompleteDay } from "@/lib/seller-hub/complete-days";
import { formatInt, hub, hubSans } from "./hub-ui";

type ChartMetric = "revenue" | "orders";

export function HubHealthBoard({
  snapshot,
  onNavigate,
  onOpenReviews,
}: {
  snapshot?: SellerCatalogSnapshot;
  onNavigate: (area: SellerHubAreaId) => void;
  onOpenReviews: () => void;
}) {
  const analytics = snapshot?.analytics;
  const orders = snapshot?.orders;
  const financeKnown = Boolean(snapshot?.finance?.available && snapshot.finance.balance != null);
  const balance = financeKnown ? `${formatInt(Math.round(snapshot!.finance!.balance!))} ₽` : "—";
  /** Выкуп только по завершённым заказам (выкупы + отмены): деньги приходят после завершения. */
  const buyoutStat = storeBuyoutFromFunnel(snapshot?.funnel);
  const buyout = buyoutStat?.percent ?? null;
  const daily = analytics?.daily ?? [];
  const days = daily.length;
  /** Сегодня набран не целиком: сравниваем последние два полных дня, иначе всегда «падение». */
  const completeDaily = withoutIncompleteDay(daily, snapshotTimeMs(snapshot));
  const revenueDelta = dayChange(completeDaily, "revenue");
  const ordersDelta = dayChange(completeDaily, "orders");
  const checkDelta = rateChange(completeDaily, "revenue");
  const suppliesKnown = Boolean(snapshot?.supplies);
  const adsKnown = Boolean(snapshot?.ads);
  const commsKnown = Boolean(snapshot?.comms);
  const avg = analytics?.avgOrderValue != null ? `${formatInt(Math.round(analytics.avgOrderValue))} ₽` : "—";
  const recent = [...(orders?.orders ?? [])]
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
    .slice(0, 6);

  const pipeline: Array<{ label: string; value: string; tint: string }> = [
    { label: "На сборке", value: orders ? formatInt(orders.inAssembly) : "—", tint: hub.surface },
    { label: "В доставке", value: orders ? formatInt(orders.inDelivery) : "—", tint: hub.blueSoft },
    { label: "Выкуплено", value: orders ? formatInt(orders.delivered) : "—", tint: hub.greenSoft },
    { label: "Отменено", value: orders ? formatInt(orders.canceled) : "—", tint: hub.surface },
  ];

  return (
    <section className="grid grid-cols-12 gap-3" style={hubSans}>
      <div className="col-span-12 flex flex-col rounded-2xl p-4 lg:col-span-8" style={{ backgroundColor: hub.surface }}>
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: hub.textSubtle }}>
            Заказы и продажи
          </p>
          <button
            type="button"
            onClick={() => onNavigate("analytics")}
            className="text-[12px] font-semibold outline-none focus-visible:underline"
            style={{ color: hub.greenDark }}
          >
            Аналитика
          </button>
        </div>
        <p className="mt-2 text-[28px] font-semibold leading-none tabular-nums tracking-[-0.03em]" style={{ color: hub.text }}>
          {analytics ? `${formatInt(Math.round(analytics.revenueTotal))} ₽` : "—"}
          <span className="mx-2 text-[16px] font-medium" style={{ color: hub.textSubtle }}>
            {analytics ? `${formatInt(analytics.ordersTotal)} шт` : ""}
          </span>
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <DeltaChip delta={revenueDelta} suffix="₽" />
          <DeltaChip delta={ordersDelta} suffix="шт" />
          <p className="text-[12px]" style={{ color: hub.textSubtle }}>
            {days > 1
              ? `за ${days} дн. снимка · последний полный день к предыдущему`
              : days > 0
                ? `за ${days} дн. снимка`
                : "за период снимка"}
          </p>
        </div>
        <SalesChart points={analytics?.daily ?? []} />
        <div className="mt-3 grid grid-cols-3 gap-2 border-t pt-3" style={{ borderColor: hub.border }}>
          <Fact
            label="Выкуп"
            value={buyout != null ? `${buyout}%` : "—"}
            hint={
              buyoutStat
                ? `Выкупы ÷ (выкупы + отмены) за ${buyoutStat.dateFrom} — ${buyoutStat.dateTo}: ${buyoutStat.buyouts} из ${buyoutStat.completed} завершённых заказов. Заказы в пути не считаются.`
                : "Нужна воронка WB за период: выкупы ÷ (выкупы + отмены). Пока завершённых заказов нет или воронка не загружена."
            }
          />
          <Fact label="Средний чек" value={analytics ? avg : "—"} delta={checkDelta} hint="Оборот ÷ число заказов за период снимка (Analytics WB)." />
          <Fact label="Позиции" value={snapshot?.syncedAt ? formatInt(snapshot.totalCount ?? 0) : "—"} hint="Все карточки, загруженные из кабинета WB." />
        </div>
      </div>

      <div className="col-span-12 flex flex-col gap-3 lg:col-span-4">
        <div className="grid grid-cols-[118px_minmax(0,1fr)] gap-3">
          <button
            type="button"
            onClick={() => onNavigate("orders")}
            className="flex aspect-square flex-col justify-between rounded-2xl p-3 text-left outline-none transition-[filter] hover:brightness-95 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1F4E3D]"
            style={{ backgroundColor: hub.lime }}
          >
            <p className="text-[11px] font-semibold uppercase leading-tight tracking-[0.04em]" style={{ color: hub.greenDark }}>
              Новые заказы
            </p>
            <p className="text-[32px] font-semibold leading-none tabular-nums" style={{ color: hub.ink }}>
              {orders ? formatInt(orders.newCount) : "—"}
            </p>
          </button>
          <button
            type="button"
            onClick={() => onNavigate("finance")}
            className="flex flex-col justify-between rounded-2xl px-4 py-3 text-left outline-none transition-[filter] hover:brightness-95 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1F4E3D]"
            style={{ backgroundColor: hub.greenSoft }}
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: hub.greenDark }}>
              На счёте
            </p>
            <p className="text-[26px] font-semibold leading-none tabular-nums" style={{ color: hub.text }}>
              {balance}
            </p>
            <p className="text-[12px]" style={{ color: hub.textSubtle }}>
              {financeKnown ? "баланс кабинета" : "нет в выгрузке"}
            </p>
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-1.5">
          {pipeline.map((row) => (
            <button
              key={row.label}
              type="button"
              onClick={() => onNavigate("orders")}
              className="flex flex-1 items-center justify-between rounded-2xl px-3.5 py-2.5 text-left outline-none transition-[filter] hover:brightness-95 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1F4E3D]"
              style={{ backgroundColor: row.tint }}
            >
              <span className="text-[13px]" style={{ color: hub.textMuted }}>
                {row.label}
              </span>
              <span className="text-[18px] font-semibold tabular-nums" style={{ color: hub.text }}>
                {row.value}
              </span>
            </button>
          ))}
        </div>
      </div>

      <MonitorCard
        items={buildAdvice({
          snapshot,
          revenueDelta,
          onNavigate,
          onOpenReviews,
        })}
      />

      <div className="col-span-12 rounded-2xl p-4 lg:col-span-7" style={{ backgroundColor: hub.surface }}>
        <div className="mb-2 flex items-baseline justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: hub.textSubtle }}>
            Последние заказы
          </p>
          <button
            type="button"
            onClick={() => onNavigate("orders")}
            className="text-[12px] font-semibold outline-none focus-visible:underline"
            style={{ color: hub.greenDark }}
          >
            Все заказы
          </button>
        </div>
        {recent.length === 0 ? (
          <p className="py-6 text-[13px]" style={{ color: hub.textSubtle }}>
            В выгрузке нет строк заказов.
          </p>
        ) : (
          <ul>
            {recent.map((row) => (
              <li key={row.id} className="flex items-baseline justify-between gap-3 border-t py-2 first:border-t-0" style={{ borderColor: hub.border }}>
                <span className="min-w-0 truncate text-[13px]" style={{ color: hub.text }}>
                  {row.article || (row.nmId != null ? `nmID ${row.nmId}` : row.id)}
                </span>
                <span className="shrink-0 text-[12px]" style={{ color: hub.textSubtle }}>
                  {orderLabel(row)}
                </span>
                <span className="shrink-0 text-[13px] font-semibold tabular-nums" style={{ color: hub.text }}>
                  {row.price != null ? `${formatInt(Math.round(row.price))} ₽` : "—"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="col-span-12 grid grid-cols-2 gap-3 lg:col-span-5">
        <Mini label="Поставки" value={suppliesKnown ? formatInt(snapshot!.supplies!.openCount) : "—"} hint="открытые" tint={hub.greenSoft} onClick={() => onNavigate("deliveries")} />
        <Mini
          label="Ждут ответа"
          value={commsKnown ? formatInt(snapshot!.comms!.unansweredFeedbacks) : "—"}
          hint="отзывы"
          tint={hub.blueSoft}
          onClick={onOpenReviews}
        />
        <Mini
          label="Вопросы"
          value={commsKnown ? formatInt(snapshot!.comms!.unansweredQuestions) : "—"}
          hint="без ответа"
          tint={hub.surface}
          onClick={onOpenReviews}
        />
        <Mini
          label="Реклама"
          value={adsKnown ? formatInt(snapshot!.ads!.activeCount) : "—"}
          hint="активные кампании"
          tint={hub.surface}
          onClick={() => onNavigate("ads")}
        />
      </div>
    </section>
  );
}

function MonitorCard({ items }: { items: AdviceItem[] }) {
  return (
    <div className="relative col-span-12 overflow-hidden rounded-2xl p-[3px]">
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 h-[220%] w-[220%] -translate-x-1/2 -translate-y-1/2 motion-safe:animate-spin"
        style={{
          background: `conic-gradient(from 0deg, ${hub.lime}, ${hub.blue}, ${hub.green}, ${hub.lime})`,
          animationDuration: "22s",
        }}
        aria-hidden
      />
      <div className="relative rounded-[13px] px-4 py-3.5" style={{ backgroundColor: hub.surface }}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: hub.greenDark }}>
          KARTO следит
        </p>
        <ul className="mt-3 grid gap-2 lg:grid-cols-2">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={item.onClick}
                className="flex w-full items-center justify-between gap-4 rounded-xl px-3 py-2.5 text-left outline-none transition-colors hover:brightness-[0.98] focus-visible:ring-2 focus-visible:ring-[#1F4E3D]"
                style={{ backgroundColor: hub.canvas }}
              >
                <span className="min-w-0">
                  <span className="block text-[14px] font-semibold" style={{ color: hub.text }}>
                    {item.title}
                  </span>
                  <span className="mt-0.5 block truncate text-[12px]" style={{ color: hub.textMuted }}>
                    {item.detail}
                  </span>
                </span>
                <span
                  className="shrink-0 rounded-full px-2.5 py-1 text-[12px] font-semibold"
                  style={{ backgroundColor: hub.greenSoft, color: hub.greenDark }}
                >
                  {item.action}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

type AdviceItem = {
  id: string;
  title: string;
  detail: string;
  action: string;
  onClick: () => void;
};

function buildAdvice({
  snapshot,
  revenueDelta,
  onNavigate,
  onOpenReviews,
}: {
  snapshot?: SellerCatalogSnapshot;
  revenueDelta: number | null;
  onNavigate: (area: SellerHubAreaId) => void;
  onOpenReviews: () => void;
}): AdviceItem[] {
  const items = snapshot?.items ?? [];
  const outOfStock = items.filter((item) => item.totalStock === 0);
  const lowStock = items.filter((item) => item.totalStock != null && item.totalStock > 0 && item.totalStock <= 2);
  const unanswered = snapshot?.comms?.unansweredFeedbacks ?? 0;
  const questions = snapshot?.comms?.unansweredQuestions ?? 0;
  const newOrders = snapshot?.orders?.newCount ?? 0;
  /** Показы идут из бюджета кампании: активная кампания с остатком 0 ₽ не крутится. Баланс и счёт — лишь источники пополнения. */
  const exhaustedAds = (snapshot?.ads?.campaigns ?? []).filter((c) => c.status === 9 && c.budget === 0);
  const openSupplies = snapshot?.supplies?.openCount ?? 0;
  const list: AdviceItem[] = [];

  if (newOrders > 0) {
    list.push({
      id: "new-orders",
      title: "Собрать новые заказы",
      detail: `${formatInt(newOrders)} ждут сборки`,
      action: "К заказам",
      onClick: () => onNavigate("orders"),
    });
  }
  if (unanswered > 0) {
    list.push({
      id: "reviews",
      title: "Ответить на отзывы",
      detail: `${formatInt(unanswered)} без ответа`,
      action: "В автоответы",
      onClick: onOpenReviews,
    });
  }
  if (questions > 0) {
    list.push({
      id: "questions",
      title: "Ответить на вопросы",
      detail: `${formatInt(questions)} без ответа`,
      action: "В автоответы",
      onClick: onOpenReviews,
    });
  }
  if (outOfStock.length > 0) {
    const name = outOfStock[0]?.title || outOfStock[0]?.vendorCode || "товар";
    list.push({
      id: "stock",
      title: "Пополнить нулевой остаток",
      detail: `${formatInt(outOfStock.length)} шт., ближайший: ${name}`,
      action: "К товарам",
      onClick: () => onNavigate("catalog"),
    });
  } else if (lowStock.length > 0) {
    const name = lowStock[0]?.title || lowStock[0]?.vendorCode || "товар";
    list.push({
      id: "low-stock",
      title: "Остаток на исходе",
      detail: `${name}: ${formatInt(lowStock[0]?.totalStock ?? 0)} шт.`,
      action: "К товарам",
      onClick: () => onNavigate("catalog"),
    });
  }
  if (exhaustedAds.length > 0) {
    const account = snapshot?.ads?.accountNet;
    list.push({
      id: "ads",
      title: "У активной кампании закончился бюджет",
      detail:
        account != null && account > 0
          ? `Кампаний без бюджета: ${formatInt(exhaustedAds.length)}. На счёте продвижения ${formatInt(Math.round(account))} ₽: пополните бюджет кампании в кабинете WB.`
          : `Кампаний без бюджета: ${formatInt(exhaustedAds.length)}. Пополните счёт продвижения и бюджет кампании в кабинете WB.`,
      action: "К рекламе",
      onClick: () => onNavigate("ads"),
    });
  }
  if (revenueDelta != null && revenueDelta < 0) {
    list.push({
      id: "revenue",
      title: "Оборот дня ниже предыдущего",
      detail: `${revenueDelta}% за последний полный день к предыдущему`,
      action: "К аналитике",
      onClick: () => onNavigate("analytics"),
    });
  }
  if (openSupplies > 0) {
    list.push({
      id: "supplies",
      title: "Открытые поставки",
      detail: `${formatInt(openSupplies)} в работе`,
      action: "К поставкам",
      onClick: () => onNavigate("deliveries"),
    });
  }

  if (list.length === 0) {
    return [
      {
        id: "calm",
        title: "Срочных действий нет",
        detail: "По текущему снимку очередь, отзывы и остатки спокойны",
        action: "Обзор",
        onClick: () => onNavigate("overview"),
      },
    ];
  }

  return list.slice(0, 4);
}

function Fact({ label, value, delta, hint }: { label: string; value: string; delta?: number | null; hint?: string }) {
  return (
    <div title={hint}>
      <p className="text-[11px]" style={{ color: hub.textSubtle }}>
        {label}
        {hint ? <span aria-hidden className="ml-1 cursor-help">ⓘ</span> : null}
      </p>
      <p className="mt-1 flex items-center gap-1.5 text-[16px] font-semibold tabular-nums" style={{ color: hub.text }}>
        {value}
        <DeltaChip delta={delta ?? null} />
      </p>
    </div>
  );
}

function DeltaChip({ delta, suffix }: { delta: number | null; suffix?: string }) {
  if (delta == null) return null;
  const up = delta >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums"
      style={{ backgroundColor: up ? hub.greenSoft : hub.dangerSoft, color: up ? hub.greenDark : hub.danger }}
    >
      <Icon className="h-3 w-3" strokeWidth={2.4} />
      {up ? "+" : ""}
      {delta}%{suffix ? ` ${suffix}` : ""}
    </span>
  );
}

function dayChange(points: SellerDailySalesPoint[], key: "orders" | "revenue"): number | null {
  if (points.length < 2) return null;
  const prev = points[points.length - 2]?.[key] ?? 0;
  const last = points[points.length - 1]?.[key] ?? 0;
  if (prev <= 0) return null;
  return Math.round(((last - prev) / prev) * 100);
}

function rateChange(points: SellerDailySalesPoint[], numerator: "buyouts" | "revenue"): number | null {
  if (points.length < 2) return null;
  const prev = points[points.length - 2];
  const last = points[points.length - 1];
  if (!prev || !last || prev.orders <= 0 || last.orders <= 0) return null;
  const prevRate = prev[numerator] / prev.orders;
  const lastRate = last[numerator] / last.orders;
  if (prevRate <= 0) return null;
  return Math.round(((lastRate - prevRate) / prevRate) * 100);
}

function Mini({
  label,
  value,
  hint,
  tint,
  onClick,
}: {
  label: string;
  value: string;
  hint: string;
  tint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-2xl px-3.5 py-3 text-left outline-none transition-[filter] hover:brightness-95 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1F4E3D]"
      style={{ backgroundColor: tint }}
    >
      <p className="text-[12px]" style={{ color: hub.textSubtle }}>{label}</p>
      <p className="mt-1 text-[22px] font-semibold leading-none tabular-nums" style={{ color: hub.text }}>{value}</p>
      <p className="mt-1.5 text-[12px]" style={{ color: hub.textSubtle }}>{hint}</p>
    </button>
  );
}

function SalesChart({ points }: { points: SellerDailySalesPoint[] }) {
  const [metric, setMetric] = useState<ChartMetric>("revenue");

  if (points.length === 0) {
    return (
      <p className="py-10 text-[13px]" style={{ color: hub.textSubtle }}>
        Нет дневного ряда в выгрузке.
      </p>
    );
  }

  const data = points.map((point) => ({
    label: axisDay(point.date),
    full: shortDay(point.date),
    orders: point.orders,
    revenue: Math.round(point.revenue),
  }));
  const stroke = metricStroke(metric);
  const fill = metric === "revenue" ? hub.blue : hub.lime;

  return (
    <div className="mt-3">
      <div
        className="relative mb-2 grid h-8 w-[168px] grid-cols-2 rounded-full p-0.5"
        style={{ backgroundColor: hub.canvas }}
        role="group"
        aria-label="Что показывает график"
      >
        <span
          className="pointer-events-none absolute top-0.5 h-7 w-[82px] rounded-full transition-transform duration-200"
          style={{
            backgroundColor: hub.surface,
            transform: metric === "orders" ? "translateX(82px)" : "translateX(0)",
            boxShadow: "0 1px 2px rgba(14,17,22,0.08)",
          }}
          aria-hidden
        />
        <MetricSwitch current={metric} value="revenue" onSelect={setMetric} label="Рубли" />
        <MetricSwitch current={metric} value="orders" onSelect={setMetric} label="Штуки" />
      </div>
      <div className="h-[210px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="hub-sales-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={fill} stopOpacity={0.45} />
                <stop offset="100%" stopColor={fill} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke={hub.border} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              interval={0}
              tick={{ fill: hub.textSubtle, fontSize: 11 }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={48}
              tick={{ fill: hub.textSubtle, fontSize: 11 }}
              tickFormatter={(value: number) => formatInt(value)}
            />
            <Tooltip
              cursor={{ stroke: hub.border, strokeWidth: 1 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const row = payload[0]?.payload as { full: string; orders: number; revenue: number };
                return (
                  <div className="rounded-lg px-2.5 py-1.5 text-[12px] leading-snug" style={{ backgroundColor: hub.ink, color: "#fff" }}>
                    <p>{row.full}</p>
                    <p className="tabular-nums">{formatInt(row.orders)} шт</p>
                    <p className="tabular-nums">{formatInt(row.revenue)} ₽</p>
                  </div>
                );
              }}
            />
            <Area
              type="monotone"
              dataKey={metric}
              stroke={stroke}
              strokeWidth={2}
              fill="url(#hub-sales-fill)"
              dot={{ r: 3, strokeWidth: 0, fill: stroke }}
              activeDot={{ r: 5, strokeWidth: 0 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function MetricSwitch({
  current,
  value,
  label,
  onSelect,
}: {
  current: ChartMetric;
  value: ChartMetric;
  label: string;
  onSelect: (value: ChartMetric) => void;
}) {
  const on = current === value;
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      className="relative z-10 rounded-full text-[12px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-[#1F4E3D]"
      style={{ color: on ? hub.text : hub.textMuted }}
      aria-pressed={on}
    >
      {label}
    </button>
  );
}

function metricStroke(metric: ChartMetric): string {
  switch (metric) {
    case "revenue":
      return hub.blue;
    case "orders":
      return hub.greenDark;
    default: {
      const unreachable: never = metric;
      return unreachable;
    }
  }
}

function orderLabel(row: SellerOrderRow): string {
  const supplier = row.supplierStatus ?? "";
  const wb = row.wbStatus ?? "";
  if (supplier === "cancel" || supplier === "cancel_carrier" || wb.startsWith("cancel") || wb === "declined_by_client") {
    return "Отменён";
  }
  if (wb === "sold") return "Выкуплено";
  if (wb === "sorted") return "Сортируется на складе";
  if (wb === "ready_for_pickup") return "На ПВЗ";
  if (supplier === "complete") return "В доставке";
  if (supplier === "confirm") return "На сборке";
  return "Новый";
}

function axisDay(date: string): string {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date.slice(8, 10);
  return String(parsed.getDate());
}

function shortDay(date: string | undefined): string {
  if (!date) return "";
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date.slice(5);
  return parsed.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}
