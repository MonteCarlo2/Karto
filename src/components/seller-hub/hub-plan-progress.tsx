"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, Minus, Pause, TrendingDown, TrendingUp, XCircle } from "lucide-react";
import { effectReport, stepCompliance, type CriteriaMetric, type Strategy, type StrategyState } from "@/lib/seller-hub/agent/strategy";
import { hub, hubNumeric, hubSans } from "./hub-ui";

/**
 * Короткий итог принятого плана для карточки и окна плана: одна строка вывода и до трёх показателей «было → стало».
 * Идущий план: промежуточный итог. Завершённый: «Выполнено. Результат: …» простыми словами.
 * Все числа из данных плана (исходные на момент принятия и текущие).
 */

const DAY = 24 * 3_600_000;
const GOOD = "#2E8B3E";
const BAD = "#C2410C";

type Unit = { name: string; unit: string; space?: boolean };
const UNITS: Partial<Record<CriteriaMetric, Unit>> = {
  margin_pct: { name: "Маржа", unit: "%" },
  orders_28d: { name: "Заказы за 28 дней", unit: "" },
  cart_pct: { name: "Просмотр → корзина", unit: "%" },
  cart_to_order_pct: { name: "Корзина → заказ", unit: "%" },
  turnover_days: { name: "Оборачиваемость", unit: " дн." },
  stock: { name: "Остаток", unit: " шт." },
  opens_28d: { name: "Просмотры за 28 дней", unit: "" },
  rating: { name: "Рейтинг", unit: "" },
  oos_days: { name: "Дней без остатка", unit: " дн." },
  price_buyer: { name: "Цена для покупателя", unit: " ₽" },
  ads_drr: { name: "ДРР", unit: "%" },
  ads_cpo: { name: "Цена заказа с рекламы", unit: " ₽" },
  ads_orders: { name: "Заказы с рекламы", unit: "" },
};
const fmt = (m: CriteriaMetric, v: number): string => `${(Number.isInteger(v) ? String(v) : String(Math.round(v * 10) / 10).replace(".", ",")).replace("-", "−")}${UNITS[m]?.unit ?? ""}`;
const lower = (s: string): string => s.charAt(0).toLowerCase() + s.slice(1);

export function PlanResult({ strategy, state, className = "" }: { strategy: Strategy; state: StrategyState; className?: string }) {
  const [now] = useState(() => Date.now());
  const finished = state.status === "worked" || state.status === "not_worked" || state.status === "observed";
  const notStarted = state.status === "scheduled";
  if (notStarted) return null;

  const rows = effectReport(strategy, state, state.finalMetrics ?? state.current ?? {}).filter((r) => r.before != null && r.after != null);
  const improved = rows.filter((r) => r.better === true);
  const worsened = rows.filter((r) => r.better === false);
  const same = rows.filter((r) => r.better == null);
  const acceptedMs = state.acceptedAt ? Date.parse(state.acceptedAt) : NaN;
  const elapsed = Number.isFinite(acceptedMs) ? Math.max(0, Math.floor((now - acceptedMs) / DAY)) : null;
  const review = strategy.reviewAfterDays ?? null;
  const comp = stepCompliance(strategy, state, now);
  const current = state.finalMetrics ?? state.current ?? {};
  const guardBroken = strategy.guards.some((g) => current[g.metric] != null && (g.op === ">=" ? (current[g.metric] as number) < g.value : (current[g.metric] as number) > g.value));

  let tone: "good" | "bad" | "neutral" = "neutral";
  let Icon = Clock;
  let head: string;
  let tail = "";
  if (state.status === "worked") {
    tone = "good";
    Icon = CheckCircle2;
    head = "Выполнено. Результат: цель достигнута.";
  } else if (state.status === "not_worked") {
    tone = "bad";
    Icon = XCircle;
    head = `Завершено. Результат: цель не достигнута${state.reason ? ` (${state.reason})` : ""}.`;
  } else if (state.status === "observed") {
    head = "Наблюдение завершено. Результат: чёткого вывода нет.";
  } else if (state.pausedAt) {
    Icon = Pause;
    head = "План на паузе.";
  } else if (guardBroken) {
    tone = "bad";
    Icon = AlertTriangle;
    head = "Промежуточный итог: нарушен ограничитель плана.";
  } else if (rows.length === 0) {
    head = "Промежуточный итог: данные появятся после первых дней.";
  } else if (improved.length > 0 && worsened.length === 0) {
    tone = "good";
    Icon = TrendingUp;
    head = "Промежуточный итог: план помогает.";
  } else if (worsened.length > 0 && improved.length === 0) {
    tone = "bad";
    Icon = TrendingDown;
    head = review != null && elapsed != null && elapsed < review ? "Промежуточный итог: пока пользы нет, но срок ещё не вышел." : "Промежуточный итог: пока пользы нет.";
  } else if (improved.length > 0) {
    Icon = Minus;
    head = "Промежуточный итог: результат смешанный.";
  } else {
    Icon = Minus;
    head = "Промежуточный итог: показатели пока на прежнем уровне.";
  }

  if (finished) {
    const part = (label: string, list: typeof rows) => (list.length > 0 ? `${label}: ${list.map((r) => lower(UNITS[r.metric]?.name ?? r.label)).join(", ")}. ` : "");
    tail = (part("Лучше", improved) + part("Хуже", worsened) + part("Без изменений", same)).trim();
  } else if (state.pausedAt) {
    tail = `Шаги, проверки и итог остановлены. После «Продолжить план» срок сдвинется на время паузы. Шагов выполнено ${comp.done} из ${comp.total}.`;
  } else {
    tail = `Шагов выполнено ${comp.done} из ${comp.total}${comp.waiting > 0 ? `, ${comp.waiting} ${comp.waiting === 1 ? "ждёт" : "ждут"} вашей отметки` : ""}${review != null && elapsed != null ? ` · день ${Math.min(elapsed + 1, review)} из ${review}` : ""}.`;
  }

  const color = tone === "good" ? GOOD : tone === "bad" ? BAD : hub.text;
  const bg = tone === "good" ? "rgba(111,194,29,0.11)" : tone === "bad" ? "rgba(194,65,12,0.07)" : "rgba(1,20,8,0.04)";

  const many = rows.length > 3;
  const metrics = rows.map((r) => (
    <div key={r.metric} className={many ? "rounded-[12px] bg-white/70 px-3.5 py-2.5" : undefined}>
      <dt className="text-[12px] leading-4" style={{ ...hubSans, color: hub.textSubtle }}>
        {UNITS[r.metric]?.name ?? r.label}
      </dt>
      <dd className="mt-0.5 flex items-baseline gap-1.5 whitespace-nowrap tabular-nums" style={{ ...hubSans, ...hubNumeric }}>
        <span className="text-[14px]" style={{ color: hub.textSubtle }}>
          {fmt(r.metric, r.before as number)}
        </span>
        <span className="text-[13px]" style={{ color: hub.textSubtle }} aria-hidden>
          →
        </span>
        <span className="text-[18px] font-bold" style={{ color: r.better === true ? GOOD : r.better === false ? BAD : hub.text }}>
          {fmt(r.metric, r.after as number)}
        </span>
      </dd>
    </div>
  ));

  return (
    <div className={`rounded-[14px] px-4 py-3.5 ${className}`} style={{ backgroundColor: bg }}>
      <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3">
        <div className="flex min-w-0 flex-1 basis-[300px] items-start gap-3">
          <Icon className="mt-0.5 h-5 w-5 shrink-0" strokeWidth={2} style={{ color }} aria-hidden />
          <div className="min-w-0">
            <p className="text-[15px] font-semibold leading-[1.4]" style={{ ...hubSans, color }}>
              {head}
            </p>
            {tail ? (
              <p className="mt-0.5 text-[14px] leading-[1.5]" style={{ ...hubSans, color: hub.textMuted }}>
                {tail}
              </p>
            ) : null}
          </div>
        </div>
        {rows.length > 0 && !many ? <dl className="flex flex-wrap gap-x-7 gap-y-2">{metrics}</dl> : null}
      </div>
      {many ? <dl className="mt-3 grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(168px,1fr))]">{metrics}</dl> : null}
    </div>
  );
}
