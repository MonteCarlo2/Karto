import { computeNextRun, firstRun } from "./schedule";
import { scheduleText, type AdsDepositParams, type OrderInput, type OrderSchedule, type PriceStepParams, type RemindParams, type WhenOrdersParams } from "./types";

/** Человеческое описание поручения и ближайшие запуски: для карточки в чате и для редактора. */

const MSK = 3 * 3_600_000;
const pad = (n: number) => String(n).padStart(2, "0");
const DAY_NAMES = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];

export const formatRun = (iso: string): string => {
  const d = new Date(Date.parse(iso) + MSK);
  return `${DAY_NAMES[d.getUTCDay()]} ${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)} в ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
};

/** Ближайшие запуски по расписанию («чт 19.11 в 10:00»). Для проверки по условию возвращает пусто. */
export function upcomingRuns(schedule: OrderSchedule, nowMs = Date.now(), count = 3): string[] {
  if (schedule.type === "check") return [];
  // Разовое поручение, время которого прошло, ближайших запусков не имеет.
  if (schedule.type === "once" && Date.parse(schedule.at) <= nowMs) return [];
  const out: string[] = [];
  let at = firstRun(schedule, nowMs);
  let runs = 0;
  while (at && out.length < count) {
    out.push(formatRun(at));
    runs += 1;
    at = computeNextRun(schedule, Date.parse(at), runs);
  }
  return out;
}

const rub = (n: number) => `${Math.round(n).toLocaleString("ru-RU")} ₽`;

export type OrderDetailCtx = { campaignName?: (id: string) => string | undefined; productTitle?: (id: string) => string | undefined };

/** Полное описание: что сделает, когда, в каких рамках и как. Строки «название: текст». */
export function orderDetails(input: OrderInput, ctx: OrderDetailCtx = {}, nowMs = Date.now()): Array<{ label: string; text: string }> {
  const rows: Array<{ label: string; text: string }> = [];
  const acts = input.mode === "act" && input.kind !== "remind";

  if (input.kind === "remind") {
    rows.push({ label: "Что сделает", text: `Пришлёт напоминание: «${(input.params as RemindParams).text}».` });
  } else if (input.kind === "ads_deposit") {
    const p = input.params as AdsDepositParams;
    const name = ctx.campaignName?.(p.campaignId) ?? `кампания ${p.campaignId}`;
    rows.push({ label: "Что сделает", text: `Будет следить за остатком рекламы «${name}». Когда он станет ниже ${rub(p.belowRub)}, ${acts ? "пополнит" : "напомнит пополнить"} на ${rub(p.topUpRub)}.` });
    rows.push({ label: "Рамки", text: `Не больше ${rub(input.limits.maxPerDayRub ?? 0)} в сутки. Когда лимит исчерпан, пополнения до утра не будет.` });
  } else if (input.kind === "when_orders") {
    const w = input.params as WhenOrdersParams;
    const dayWord = w.days === 1 ? "день" : w.days < 5 ? "дня" : "дней";
    rows.push({ label: "Условие", text: `Заказов за сутки меньше ${w.belowOrders} подряд ${w.days} ${dayWord}. Считаются полные сутки, без отменённых.` });
    if (w.then === "deposit") {
      const name = ctx.campaignName?.(w.campaignId ?? "") ?? `кампания ${w.campaignId}`;
      const acts = input.mode === "act";
      rows.push({ label: "Что сделает", text: `${acts ? "Пополнит" : "Напомнит пополнить"} рекламу «${name}» на ${rub(w.topUpRub ?? 0)}. Не чаще раза в сутки.` });
      rows.push({ label: "Рамки", text: `Не больше ${rub(input.limits.maxPerDayRub ?? 0)} в сутки.` });
    } else {
      rows.push({ label: "Что сделает", text: `Сообщит: «${w.text ?? ""}». Не чаще раза в сутки.` });
    }
  } else {
    const p = input.params as PriceStepParams;
    const names = p.nmIds.map((id) => ctx.productTitle?.(id) ?? `товар ${id}`);
    const list = names.length <= 3 ? names.join(", ") : `${names.slice(0, 3).join(", ")} и ещё ${names.length - 3}`;
    const verb = p.direction === "down" ? "снизит" : "повысит";
    rows.push({ label: "Что сделает", text: `${acts ? "Каждый запуск" : "Каждый запуск напомнит, что нужно"} ${acts ? verb : verb.replace("ит", "ить")} цену на ${p.pct}%: ${list}.` });
    const bound = p.direction === "down" ? input.limits.minBuyerPriceRub : input.limits.maxBuyerPriceRub;
    rows.push({ label: "Рамки", text: `Цена для покупателя ${p.direction === "down" ? "не ниже" : "не выше"} ${rub(bound ?? 0)}. Дойдя до границы, агент остановится и не будет менять цену дальше.` });
    const s = input.schedule;
    if ("maxRuns" in s && s.maxRuns) rows.push({ label: "Итого", text: `${s.maxRuns} ${s.maxRuns % 10 === 1 && s.maxRuns % 100 !== 11 ? "шаг" : s.maxRuns % 10 >= 2 && s.maxRuns % 10 <= 4 && (s.maxRuns % 100 < 10 || s.maxRuns % 100 >= 20) ? "шага" : "шагов"} по ${p.pct}%, если граница раньше не остановит.` });
  }

  const next = upcomingRuns(input.schedule, nowMs, 3);
  rows.splice(input.kind === "remind" ? 1 : 1, 0, {
    label: "Когда",
    text: input.schedule.type === "check" ? `${scheduleText(input.schedule)[0]!.toUpperCase()}${scheduleText(input.schedule).slice(1)}.` : input.kind === "when_orders" ? `Проверяет ${scheduleText(input.schedule)}.` : `${scheduleText(input.schedule)[0]!.toUpperCase()}${scheduleText(input.schedule).slice(1)}.${next.length > 0 ? ` Ближайшие запуски: ${next.join(", ")}.` : ""}`,
  });
  const sch = input.schedule;
  if (sch.type !== "once") {
    const end = "until" in sch && sch.until ? new Date(Date.parse(sch.until) - 1 + MSK) : null;
    const text = "maxRuns" in sch && sch.maxRuns ? `${sch.maxRuns} ${sch.maxRuns % 10 === 1 && sch.maxRuns % 100 !== 11 ? "запуск" : sch.maxRuns % 10 >= 2 && sch.maxRuns % 10 <= 4 && (sch.maxRuns % 100 < 10 || sch.maxRuns % 100 >= 20) ? "запуска" : "запусков"}, потом поручение завершится само.` : end ? `До ${pad(end.getUTCDate())}.${pad(end.getUTCMonth() + 1)} включительно, потом завершится само.` : "Пока вы сами не поставите его на паузу или не удалите.";
    rows.splice(2, 0, { label: "Срок", text });
  }
  if (input.kind !== "remind" && !(input.kind === "when_orders" && (input.params as WhenOrdersParams).then === "notify")) rows.push({ label: "Как", text: acts ? "Сделает сам и запишет в журнал." : "Ничего не меняет сам: только напоминает, когда пора." });
  return rows;
}
