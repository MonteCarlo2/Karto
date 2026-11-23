import { ACTION_SPECS } from "@/lib/seller-hub/agent/actions";
import type { SellerCatalogSnapshot } from "@/lib/seller-hub/types";
import { inverseAction, type PriceEditAction, type TgAction } from "./action-exec";
import { orderDetails } from "@/lib/seller-hub/orders/preview";
import { bold, clip, escapeHtml, fmtInt, fmtPct, fmtRub, italic, quote } from "./format";

const ORDER_SPEC = { risk: "low" as const, note: "Поручение работает само по расписанию и только в заданных рамках. Остановить или удалить его можно кнопкой ниже или в разделе «Агенты» на сайте." };

/**
 * Карточка действия для Telegram: что именно изменится («было → станет»), чем это рискованно и можно ли вернуть.
 * Показывается до подтверждения, поэтому все цифры берутся из настоящих данных кабинета, а тексты экранируются.
 */

export type CardCtx = { campaignName: (id: string) => string; productTitle: (nmId: string) => string | null };

export function cardCtx(snapshot: SellerCatalogSnapshot | null): CardCtx {
  return {
    campaignName: (id) => {
      const all = snapshot?.ads?.campaigns ?? [];
      const c = all.find((x) => String(x.id) === String(id));
      const name = c?.name || `кампания ${id}`;
      return all.filter((x) => x.name === c?.name).length > 1 ? `${name} №${String(id).slice(-4)}` : name;
    },
    productTitle: (nm) => snapshot?.items.find((i) => String(i.externalId) === String(nm))?.title ?? null,
  };
}

const arrow = (from: string, to: string) => `${escapeHtml(from)} → ${bold(to)}`;
const rub = (v: number) => fmtRub(v);

const campaign = (ctx: CardCtx, id: string) => `📣 ${bold(clip(ctx.campaignName(id), 70))}`;
const product = (ctx: CardCtx, nm: string, fallback?: string) => {
  const title = ctx.productTitle(nm) ?? fallback;
  return `🛍 ${bold(clip(title ?? `Артикул ${nm}`, 80))}`;
};

export function actionLabel(a: TgAction): string {
  if (a.type === "price_edit") return a.field === "discount" ? "Изменить скидку продавца" : "Изменить цену";
  if (a.type === "order_create") return a.replaceId ? "Изменить поручение" : "Создать поручение";
  if (a.type === "order_delete") return "Удалить поручение";
  return ACTION_SPECS[a.type].label;
}

/** Подробности действия: заголовок объекта и строки «было → станет». */
function facts(a: TgAction, ctx: CardCtx): { subject: string; lines: string[] } {
  switch (a.type) {
    case "price": {
      const lines = [`Цена для покупателя: ${arrow(rub(a.currentRub), rub(a.targetRub))}`];
      if (a.currentBaseRub != null) lines.push(`Цена до скидки: ${arrow(rub(a.currentBaseRub), rub(a.baseRub))}`);
      lines.push(`Скидка продавца ${fmtPct(a.discount)} остаётся`);
      return { subject: product(ctx, a.nmId), lines };
    }
    case "price_edit": {
      const price = a.field === "price" ? a.value : a.prevPrice;
      const discount = a.field === "discount" ? a.value : a.prevDiscount;
      const lines: string[] = [];
      if (a.field === "price") lines.push(`Цена до скидки: ${a.prevPrice != null ? arrow(rub(a.prevPrice), rub(a.value)) : bold(rub(a.value))}`);
      else lines.push(`Скидка продавца: ${a.prevDiscount != null ? arrow(fmtPct(a.prevDiscount), fmtPct(a.value)) : bold(fmtPct(a.value))}`);
      if (price != null && discount != null) lines.push(`Покупатель увидит примерно ${bold(rub(Math.round(price * (1 - discount / 100))))}`);
      return { subject: product(ctx, a.nmId, a.title), lines };
    }
    case "order_create": {
      const rows = orderDetails(a.input, { campaignName: (id) => ctx.campaignName(id), productTitle: (id) => ctx.productTitle(id) ?? undefined });
      const lines = [...rows.map((r) => `${bold(r.label)}: ${escapeHtml(r.text)}`)];
      return { subject: `🤖 ${bold(clip(a.input.title, 90))}`, lines };
    }
    case "order_delete":
      return { subject: `🤖 ${bold(clip(a.title, 90))}`, lines: ["Поручение будет удалено, повторы прекратятся"] };
    case "pause":
      return { subject: campaign(ctx, a.campaignId), lines: ["Реклама остановится, расход прекратится"] };
    case "resume":
      return { subject: campaign(ctx, a.campaignId), lines: ["Реклама снова пойдёт, бюджет начнёт тратиться"] };
    case "deposit":
      return { subject: campaign(ctx, a.campaignId), lines: [`Пополнить на ${bold(rub(a.sumRub))} со счёта продвижения`] };
    case "bid":
      return { subject: `${campaign(ctx, a.advertId)}\n${product(ctx, a.nmId)}`, lines: [`Ставка за 1000 показов: ${a.previousBidRub != null ? arrow(rub(a.previousBidRub), rub(a.bidRub)) : bold(rub(a.bidRub))}`] };
    case "daily_limit":
      return { subject: campaign(ctx, a.campaignId), lines: [a.enabled ? `Дневной лимит: ${bold(rub(a.limitRub))} в сутки` : "Дневной лимит будет отключён"] };
    case "club_discount":
      return { subject: product(ctx, a.nmId), lines: [`Скидка WB Клуба: ${a.previousPercent != null ? arrow(fmtPct(a.previousPercent), fmtPct(a.clubPercent)) : bold(fmtPct(a.clubPercent))}`] };
    case "remove_nm":
      return { subject: `${campaign(ctx, a.campaignId)}\n${product(ctx, a.nmId)}`, lines: ["Товар уйдёт из кампании"] };
    case "add_nm":
      return { subject: `${campaign(ctx, a.campaignId)}\n${product(ctx, a.nmId)}`, lines: ["Товар вернётся в кампанию со стандартной ставкой"] };
    case "minus_phrases":
      return { subject: `${campaign(ctx, a.advertId)}\n${product(ctx, a.nmId)}`, lines: [`Минус-фраз: ${bold(fmtInt(a.queries.length))}`, ...a.queries.slice(0, 5).map((q) => `· ${escapeHtml(clip(q, 60))}`)] };
    default:
      return { subject: "", lines: [] };
  }
}

/** Карточка целиком: заголовок, объект, «было → станет», риск и признак «можно вернуть». extra: пояснение агента (зачем это делаем). */
export function actionCardHtml(a: TgAction, ctx: CardCtx, opts: { sandbox?: boolean; why?: string | null } = {}): string {
  const spec = a.type === "price_edit" ? ACTION_SPECS.price : a.type === "order_create" || a.type === "order_delete" ? ORDER_SPEC : ACTION_SPECS[a.type];
  const f = facts(a, ctx);
  const parts = [`⚡ ${bold(actionLabel(a))}\n${italic("Нужно ваше подтверждение")}`];
  if (f.subject) parts.push(f.subject);
  if (f.lines.length) parts.push(quote(f.lines.join("\n\n")));
  if (opts.why) parts.push(`💡 ${escapeHtml(clip(opts.why, 260))}`);
  parts.push(`${spec.risk === "high" ? "⚠️" : "ℹ️"} ${escapeHtml(clip(spec.note, 220))}`);
  parts.push(italic(inverseAction(a) || a.type === "order_create" ? "↩ Это можно будет отменить кнопкой" : "Отменить это действие кнопкой нельзя"));
  if (opts.sandbox) parts.push(`🧪 ${italic("Тестовый режим: в кабинет ничего не уйдёт, это проверка")}`);
  return parts.join("\n\n");
}

/** Правка цены или скидки из ответа агента: считает новое значение от текущего и проверяет границы. null: не получилось, показываем отказом. */
export function priceEditFromBlock(snapshot: SellerCatalogSnapshot | null, b: { nmId: string; field: "discount" | "price"; value: number | null; pct?: number | null }): PriceEditAction | null {
  const item = snapshot?.items.find((i) => String(i.externalId) === String(b.nmId));
  if (!item) return null;
  const price = item.price ?? null;
  let value = b.value;
  if (value == null && b.field === "price" && b.pct != null && price != null) value = Math.round(price * (1 + b.pct / 100));
  if (value == null || !Number.isFinite(value)) return null;
  if (b.field === "discount" ? !(Number.isInteger(value) && value >= 0 && value <= 99) : !(value > 0 && value < 10_000_000)) return null;
  return { type: "price_edit", nmId: String(b.nmId), field: b.field, value, prevPrice: price, prevDiscount: item.discountPercent ?? null, title: item.title };
}
