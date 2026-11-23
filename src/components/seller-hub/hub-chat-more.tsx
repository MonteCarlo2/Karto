"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Check, MessagesSquare, Percent, PackageCheck, TriangleAlert, Undo2 } from "lucide-react";
import type { AgentAction } from "@/lib/seller-hub/ads-agent-engine";
import { describeAgentAction, executeAgentAction } from "@/lib/seller-hub/agent-exec";
import type { SellerCatalogItem, SellerCatalogSnapshot } from "@/lib/seller-hub/types";
import { Frame } from "./hub-chat-analytics";
import { Empty, List, MoreNote, Row } from "./hub-chat-data";
import { formatInt, hub, hubNumeric, hubSans } from "./hub-ui";

/**
 * Отзывы, акции, поставки и действия в рекламе прямо в переписке. Данные из снимка кабинета, ничего не выдумывается.
 * Действия: карточка «что изменится», подтверждение, результат и возврат как было (там, где он возможен).
 */
const MAX = 5;
const date = (s?: string | null) => (s ? new Date(s).toLocaleDateString("ru-RU", { day: "numeric", month: "short" }) : "");
const short = (t: string, n = 140) => {
  const one = (t ?? "").replace(/\s+/g, " ").trim();
  return one.length <= n ? one : `${one.slice(0, n).replace(/\s+\S*$/, "")}…`;
};

/* ───────────── Отзывы ───────────── */

export function ChatReviews({ snapshot, itemByNm, onOpen, onAsk }: { snapshot?: SellerCatalogSnapshot; itemByNm?: Map<string, SellerCatalogItem>; onOpen?: () => void; /** Отправить сообщение агенту: «Подготовь ответ на отзыв…». */ onAsk?: (message: string) => void }) {
  const fb = snapshot?.feedbacks;
  const rows = Object.entries(fb?.byNm ?? {})
    .flatMap(([nm, st]) => st.staleNegatives.map((r) => ({ ...r, nmId: r.nmId || nm })))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const shown = rows.slice(0, MAX);
  const comms = snapshot?.comms;
  return (
    <Frame title="Отзывы и вопросы" icon={<MessagesSquare className="h-4 w-4" aria-hidden />} hint={comms ? `Без ответа: отзывов ${formatInt(comms.unansweredFeedbacks)}, вопросов ${formatInt(comms.unansweredQuestions)}.` : undefined} onOpenLabel="Открыть отзывы" onOpen={onOpen}>
      {!snapshot ? (
        <Empty>Данные кабинета ещё не загружены.</Empty>
      ) : shown.length === 0 ? (
        <Empty>{comms && comms.unansweredFeedbacks + comms.unansweredQuestions > 0 ? "Негативных отзывов без ответа старше суток нет. Остальные без ответа смотрите в разделе." : "Неотвеченных негативных отзывов нет."}</Empty>
      ) : (
        <>
          <p className="mb-1 text-[13.5px]" style={{ ...hubSans, color: hub.textSubtle }}>
            Негативные отзывы (1–3 звезды) без ответа дольше суток:
          </p>
          <ul className="space-y-1.5">
            {shown.map((r, i) => {
              const title = itemByNm?.get(r.nmId)?.title ?? `Товар ${r.nmId}`;
              const body = short(r.cons || r.text || "Оценка без текста", 220);
              return (
                <motion.li key={r.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i, duration: 0.3 }} className="rounded-[14px] px-3.5 py-3.5" style={{ backgroundColor: "rgba(1, 20, 8, 0.035)" }}>
                  <div className="flex items-start gap-3.5">
                    <span className="flex h-[60px] w-[60px] shrink-0 items-center justify-center overflow-hidden rounded-[6px]" style={{ backgroundColor: "rgba(1, 20, 8, 0.05)" }} aria-hidden>
                      {itemByNm?.get(r.nmId)?.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={itemByNm.get(r.nmId)!.imageUrl} alt="" className="h-full w-full object-contain" loading="lazy" />
                      ) : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="text-[14px] font-semibold tracking-[0.1em]" style={{ color: "#F59E0B" }} aria-label={`Оценка ${r.rating} из 5`}>
                          {"★".repeat(r.rating)}
                          <span style={{ color: "rgba(1, 20, 8, 0.2)" }}>{"★".repeat(Math.max(0, 5 - r.rating))}</span>
                        </span>
                        <span className="text-[12.5px]" style={{ ...hubSans, color: hub.textSubtle }}>
                          {date(r.createdAt)}
                        </span>
                      </span>
                      <span className="mt-0.5 line-clamp-1 block text-[13.5px] font-medium [overflow-wrap:anywhere]" style={{ ...hubSans, color: hub.textSubtle }}>
                        {title}
                      </span>
                      <span className="mt-1.5 block text-[15px] leading-[1.5] [overflow-wrap:anywhere]" style={{ ...hubSans, color: hub.text }}>
                        «{body}»
                      </span>
                      {onAsk ? (
                        <button type="button" onClick={() => onAsk(`Подготовь ответ на отзыв про «${title}» (оценка ${r.rating}): «${body}»`)} className="mt-2.5 inline-flex h-9 items-center rounded-full border px-4 text-[13.5px] font-medium outline-none transition-colors hover:bg-white focus-visible:shadow-[0_0_0_2px_var(--hub-lime-ring)]" style={{ ...hubSans, borderColor: "rgba(1, 20, 8, 0.16)", color: hub.text }}>
                          Подготовить ответ
                        </button>
                      ) : null}
                    </span>
                  </div>
                </motion.li>
              );
            })}
          </ul>
          <p className="mt-3 text-[13px] leading-[1.5]" style={{ ...hubSans, color: hub.textSubtle }}>
            Готовый ответ агент напишет здесь, а отправляется он через раздел «Автоответы», там же настройки тона и подписи.
          </p>
          <MoreNote shown={shown.length} total={rows.length} />
        </>
      )}
    </Frame>
  );
}

/* ───────────── Акции ───────────── */

export function ChatPromos({ snapshot, onOpen }: { snapshot?: SellerCatalogSnapshot; onOpen?: () => void }) {
  const [now] = useState(() => Date.now());
  const promos = [...(snapshot?.promotions ?? [])].sort((a, b) => Date.parse(a.startAt ?? "") - Date.parse(b.startAt ?? ""));
  const shown = promos.slice(0, MAX);
  const state = (p: { startAt?: string; endAt?: string }) => {
    const s = Date.parse(p.startAt ?? "");
    const e = Date.parse(p.endAt ?? "");
    if (Number.isFinite(s) && s > now) return `начнётся ${date(p.startAt)}`;
    if (Number.isFinite(e) && e < now) return `закончилась ${date(p.endAt)}`;
    return p.endAt ? `идёт до ${date(p.endAt)}` : "идёт сейчас";
  };
  return (
    <Frame title="Акции Wildberries" icon={<Percent className="h-4 w-4" aria-hidden />} hint={promos.length > 0 ? `Активные и ближайшие: ${promos.length}.` : undefined} onOpenLabel="Открыть акции" onOpen={onOpen}>
      {!snapshot ? (
        <Empty>Данные кабинета ещё не загружены.</Empty>
      ) : shown.length === 0 ? (
        <Empty>Активных и ближайших акций в кабинете нет.</Empty>
      ) : (
        <>
          <ul className="space-y-1.5">
            {shown.map((p, i) => {
              const st = state(p);
              const live = st.startsWith("идёт");
              const soon = st.startsWith("начнётся");
              return (
                <motion.li key={p.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i, duration: 0.3 }} className="flex items-start gap-3 rounded-[14px] px-3 py-3" style={{ backgroundColor: "rgba(1, 20, 8, 0.035)" }}>
                  <span className="mt-0.5 h-12 w-1 shrink-0 rounded-full" style={{ backgroundColor: live ? "#2E5A43" : soon ? "#F59E0B" : "rgba(1, 20, 8, 0.2)" }} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold leading-[1.35] [overflow-wrap:anywhere]" style={{ ...hubSans, color: hub.text }}>
                      {p.name}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span className="rounded-full px-2.5 py-0.5 text-[12px] font-semibold" style={{ ...hubSans, backgroundColor: live ? "rgba(46, 90, 67, 0.14)" : soon ? "rgba(245, 158, 11, 0.18)" : "rgba(1, 20, 8, 0.08)", color: live ? hub.greenDark : soon ? "#8A5A00" : hub.textSubtle }}>
                        {st.charAt(0).toUpperCase() + st.slice(1)}
                      </span>
                      {p.participatingSkuCount != null ? (
                        <span className="rounded-full px-2.5 py-0.5 text-[12px] font-medium" style={{ ...hubSans, backgroundColor: "rgba(1, 20, 8, 0.06)", color: hub.text }}>
                          Участвуют товары: {formatInt(p.participatingSkuCount)}
                        </span>
                      ) : null}
                    </span>
                    {p.advantages?.[0] ? (
                      <span className="mt-1.5 block text-[13px] leading-[1.4]" style={{ ...hubSans, color: hub.textSubtle }}>
                        {short(p.advantages[0], 110)}
                      </span>
                    ) : null}
                  </span>
                </motion.li>
              );
            })}
          </ul>
          <MoreNote shown={shown.length} total={promos.length} />
        </>
      )}
    </Frame>
  );
}

/* ───────────── Поставки ───────────── */

export function ChatSupplies({ snapshot, onOpen }: { snapshot?: SellerCatalogSnapshot; onOpen?: () => void }) {
  const sup = snapshot?.supplies;
  const open = (sup?.supplies ?? []).filter((s) => !s.done).sort((a, b) => Date.parse(b.plannedAt ?? b.createdAt ?? "") - Date.parse(a.plannedAt ?? a.createdAt ?? ""));
  const shown = open.slice(0, MAX);
  const orders = snapshot?.orders;
  return (
    <Frame title="Поставки и заказы на сборку" icon={<PackageCheck className="h-4 w-4" aria-hidden />} hint={sup ? `Открытых поставок: ${sup.openCount}, закрытых: ${sup.closedCount}.${orders ? ` Заданий: новых ${orders.newCount}, на сборке ${orders.inAssembly}, в доставке ${orders.inDelivery}.` : ""}` : undefined} onOpenLabel="Открыть поставки" onOpen={onOpen}>
      {!snapshot ? (
        <Empty>Данные кабинета ещё не загружены.</Empty>
      ) : !sup ? (
        <Empty>Данных о поставках пока нет.</Empty>
      ) : shown.length === 0 ? (
        <Empty>Открытых поставок нет.</Empty>
      ) : (
        <>
          <List>
            {shown.map((s, i) => (
              <Row key={s.id} index={i} photo={null} tone="#B7791F" title={s.name || `Поставка ${s.id}`} sub={`${s.type === "fbs" ? "FBS" : "FBW"}${s.status ? ` · ${s.status}` : ""}${s.warehouseName ? ` · ${s.warehouseName}` : ""}${s.plannedAt ? ` · плановая дата ${date(s.plannedAt)}` : ""}`} right={s.quantity != null ? `${formatInt(s.quantity)} шт.` : undefined} />
            ))}
          </List>
          <MoreNote shown={shown.length} total={open.length} />
        </>
      )}
    </Frame>
  );
}

/* ───────────── Действие в рекламе ───────────── */

/** Обратное действие для возврата «как было». null — вернуть автоматически нельзя (например, пополнение). */
function inverse(a: AgentAction): AgentAction | null {
  switch (a.type) {
    case "pause":
      return { type: "resume", campaignId: a.campaignId };
    case "resume":
      return { type: "pause", campaignId: a.campaignId };
    case "add_nm":
      return { type: "remove_nm", campaignId: a.campaignId, nmId: a.nmId };
    case "remove_nm":
      return { type: "add_nm", campaignId: a.campaignId, nmId: a.nmId };
    case "bid":
      return a.previousBidRub != null ? { type: "bid", advertId: a.advertId, nmId: a.nmId, bidRub: a.previousBidRub, previousBidRub: a.bidRub } : null;
    case "content":
      return a.previousText.trim() ? { type: "content", nmId: a.nmId, field: a.field, text: a.previousText, previousText: a.text } : null;
    case "placements":
      return a.previousSearch != null && a.previousRecommendations != null ? { type: "placements", advertId: a.advertId, search: a.previousSearch, recommendations: a.previousRecommendations, previousSearch: a.search, previousRecommendations: a.recommendations } : null;
    case "price":
      return a.currentBaseRub != null ? { type: "price", nmId: a.nmId, targetRub: a.currentRub, baseRub: a.currentBaseRub, discount: a.discount, currentRub: a.targetRub, currentBaseRub: a.baseRub } : null;
    case "club_discount":
      return a.previousPercent != null ? { type: "club_discount", nmId: a.nmId, clubPercent: a.previousPercent, previousPercent: a.clubPercent } : null;
    case "daily_limit":
      return a.previous ? { type: "daily_limit", campaignId: a.campaignId, enabled: a.previous.enabled, limitRub: a.previous.limitRub ?? 0, carryOver: a.previous.carryOver, previous: { enabled: a.enabled, limitRub: a.enabled ? a.limitRub : null, carryOver: a.carryOver } } : null;
    default:
      return null;
  }
}

const rubFmt = (v: number | null | undefined) => (v == null ? "неизвестно" : `${Math.round(v * 100) / 100 === Math.round(v) ? Math.round(v).toLocaleString("ru-RU") : v.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ₽`);
const pct = (from: number | null | undefined, to: number | null | undefined) => (from != null && to != null && from > 0 ? Math.round(((to - from) / from) * 1000) / 10 : null);

type Diff = { label: string; from: string; to: string; change?: number | null };

/** Что именно изменится, цифрами: было → станет. null — для действия есть только текстовое описание. */
function actionDiff(a: AgentAction, campaigns: SellerCatalogSnapshot["ads"] extends infer T ? (T extends { campaigns: infer C } ? C : never) : never, item?: SellerCatalogItem): Diff | null {
  const camp = (id: string) => (campaigns as Array<{ id: string; budget?: number | null; statusLabel?: string }>).find((c) => c.id === id);
  switch (a.type) {
    case "pause":
      return { label: "Показы кампании", from: camp(a.campaignId)?.statusLabel || "Идут показы", to: "На паузе" };
    case "resume":
      return { label: "Показы кампании", from: camp(a.campaignId)?.statusLabel || "На паузе", to: "Идут показы" };
    case "deposit": {
      const b = camp(a.campaignId)?.budget ?? null;
      return { label: "Бюджет кампании", from: rubFmt(b), to: b != null ? rubFmt(b + a.sumRub) : `+${rubFmt(a.sumRub)}` };
    }
    case "bid":
      return { label: "Ставка за 1000 показов", from: rubFmt(a.previousBidRub), to: rubFmt(a.bidRub), change: pct(a.previousBidRub, a.bidRub) };
    case "daily_limit":
      return { label: "Дневной лимит расхода", from: a.previous?.enabled ? rubFmt(a.previous.limitRub) : "не задан", to: a.enabled ? rubFmt(a.limitRub) : "выключен", change: a.previous?.enabled && a.enabled ? pct(a.previous.limitRub, a.limitRub) : null };
    case "club_discount":
      return { label: "Скидка WB Клуба", from: a.previousPercent != null ? `${a.previousPercent}%` : "не задана", to: `${a.clubPercent}%` };
    case "price":
      return { label: "Цена для покупателя", from: rubFmt(a.currentRub), to: rubFmt(a.targetRub), change: pct(a.currentRub, a.targetRub) };
    case "placements":
      return { label: "Места показа", from: `${a.previousSearch === false ? "без поиска" : "поиск"} · ${a.previousRecommendations === false ? "без рекомендаций" : "рекомендации"}`, to: `${a.search ? "поиск" : "без поиска"} · ${a.recommendations ? "рекомендации" : "без рекомендаций"}` };
    case "remove_nm":
      return { label: item?.title ? "Товар в кампании" : "Товар", from: "в кампании", to: "убран из кампании" };
    case "add_nm":
      return { label: "Товар", from: "не в кампании", to: "добавлен в кампанию" };
    default:
      return null;
  }
}

function DiffBox({ diff }: { diff: Diff }) {
  const up = diff.change != null && diff.change > 0;
  return (
    <div className="mt-3 rounded-[14px] bg-white/75 px-4 py-3.5 sm:max-w-[520px]">
      <p className="text-[12px] font-semibold uppercase tracking-[0.06em]" style={{ ...hubSans, color: hub.textSubtle }}>
        {diff.label}
      </p>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-[20px] font-medium" style={{ ...hubSans, ...hubNumeric, color: hub.textSubtle }}>
          {diff.from}
        </span>
        <ArrowRight className="h-5 w-5 shrink-0" style={{ color: hub.textSubtle }} aria-hidden />
        <span className="text-[24px] font-bold tracking-[-0.01em]" style={{ ...hubSans, ...hubNumeric, color: hub.greenDark }}>
          {diff.to}
        </span>
        {diff.change != null ? (
          <span className="rounded-full px-2.5 py-0.5 text-[12.5px] font-semibold" style={{ ...hubSans, backgroundColor: up ? "rgba(46, 90, 67, 0.12)" : "rgba(194, 65, 12, 0.12)", color: up ? hub.greenDark : "#C2410C" }}>
            {up ? "+" : ""}
            {diff.change.toLocaleString("ru-RU")}%
          </span>
        ) : null}
      </div>
    </div>
  );
}

const NOTE: Partial<Record<AgentAction["type"], string>> = {
  pause: "Показы остановятся, пока кампанию не запустят снова.",
  resume: "Кампания снова начнёт показываться и тратить бюджет.",
  deposit: "Деньги спишутся со счёта продвижения. Автоматически вернуть пополнение нельзя.",
  bid: "Новая ставка сразу влияет на позицию и расход кампании.",
  daily_limit: "Лимит только ограничивает расход кампании.",
  club_discount: "Цена для участников Клуба изменится сразу.",
  price: "Цена изменится сразу после подтверждения. Перед записью система сверит её с тем, что сейчас в кабинете.",
};

export function ChatAction({ action, title, facts, effect, risk, snapshot, itemByNm, sandbox }: { action: AgentAction; title?: string; facts?: string[]; effect?: string; risk?: "low" | "medium" | "high"; snapshot?: SellerCatalogSnapshot; itemByNm?: Map<string, SellerCatalogItem>; sandbox: boolean }) {
  const [stage, setStage] = useState<"confirm" | "busy" | "done" | "error" | "undone">("confirm");
  const [message, setMessage] = useState("");
  const campaigns = snapshot?.ads?.campaigns ?? [];
  const text = (title ?? describeAgentAction(action, campaigns)).replace("?%", "прежнее значение неизвестно");
  const undo = inverse(action);
  const diff = actionDiff(action, campaigns as never, itemByNm?.get(("nmId" in action ? action.nmId : "") ?? ""));
  const nmId = "nmId" in action ? action.nmId : null;
  const item = nmId ? itemByNm?.get(nmId) : undefined;

  async function run(a: AgentAction, kind: "apply" | "undo") {
    setStage("busy");
    try {
      const res = await executeAgentAction(a);
      if (res.simulated) {
        setMessage("Тестовый режим: в кабинет ничего не отправлено. В рабочем режиме действие ушло бы в Wildberries.");
        setStage(kind === "apply" ? "done" : "undone");
      } else if (res.ok) {
        setMessage(kind === "apply" ? "Готово: Wildberries принял изменение." : "Вернул как было.");
        setStage(kind === "apply" ? "done" : "undone");
      } else {
        setMessage(res.error || "Не удалось выполнить действие. Ничего не изменилось.");
        setStage("error");
      }
    } catch {
      setMessage("Не удалось выполнить действие. Ничего не изменилось.");
      setStage("error");
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }} className="rounded-[18px] p-4" style={{ backgroundColor: "rgba(46, 90, 67, 0.045)", boxShadow: "inset 0 0 0 1px rgba(1, 20, 8, 0.07)" }}>
      <p className="text-[12.5px] font-semibold uppercase tracking-[0.06em]" style={{ ...hubSans, color: hub.textSubtle }}>
        Что изменится
      </p>
      {item ? (
        <p className="mt-2 text-[14px] font-semibold [overflow-wrap:anywhere]" style={{ ...hubSans, color: hub.text }}>
          {item.title}
        </p>
      ) : null}
      <p className="mt-1.5 text-[16px] font-medium leading-[1.5] [overflow-wrap:anywhere]" style={{ ...hubSans, color: hub.text }}>
        {text.charAt(0).toUpperCase() + text.slice(1)}
        {title ? "" : "."}
      </p>
      {diff ? <DiffBox diff={diff} /> : null}
      {facts && facts.length > 0 ? (
        <ul className="mt-2 space-y-1 rounded-[12px] bg-white/70 px-3.5 py-2.5">
          {facts.slice(0, 6).map((f) => (
            <li key={f} className="text-[14px] leading-[1.5] [overflow-wrap:anywhere]" style={{ ...hubSans, color: hub.text }}>
              {f}
            </li>
          ))}
        </ul>
      ) : null}
      {effect || NOTE[action.type] ? (
        <p className="mt-1.5 text-[13.5px] leading-[1.5]" style={{ ...hubSans, color: hub.textSubtle }}>
          {effect ?? NOTE[action.type]}
          {risk === "high" ? " Это заметно влияет на цену, проверьте внимательно." : ""}
        </p>
      ) : null}
      {stage === "confirm" || stage === "busy" ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" disabled={stage === "busy"} onClick={() => void run(action, "apply")} className="inline-flex h-10 items-center rounded-full px-5 text-[14px] font-semibold outline-none transition-[filter] hover:brightness-95 disabled:opacity-60 focus-visible:shadow-[0_0_0_2px_var(--hub-lime-ring)]" style={{ ...hubSans, backgroundColor: hub.lime, color: "#011408" }}>
            {stage === "busy" ? "Выполняю…" : sandbox ? "Подтвердить (тест)" : "Подтвердить"}
          </button>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <p className="flex items-start gap-2 text-[14px] leading-[1.45]" role="status" style={{ ...hubSans, color: stage === "error" ? "#C2410C" : hub.text }}>
            {stage === "error" ? <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> : <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: hub.greenDark }} aria-hidden />}
            <span>{message}</span>
          </p>
          {stage === "done" && undo ? (
            <button type="button" onClick={() => void run(undo, "undo")} className="inline-flex h-9 items-center gap-1.5 rounded-full border px-4 text-[13.5px] font-medium outline-none transition-colors hover:bg-white focus-visible:shadow-[0_0_0_2px_var(--hub-lime-ring)]" style={{ ...hubSans, borderColor: "rgba(1, 20, 8, 0.16)", color: hub.text }}>
              <Undo2 className="h-3.5 w-3.5" aria-hidden />
              Вернуть как было
            </button>
          ) : null}
          {stage === "error" ? (
            <button type="button" onClick={() => setStage("confirm")} className="inline-flex h-9 items-center rounded-full border px-4 text-[13.5px] font-medium outline-none transition-colors hover:bg-white" style={{ ...hubSans, borderColor: "rgba(1, 20, 8, 0.16)", color: hub.text }}>
              Повторить
            </button>
          ) : null}
        </div>
      )}
    </motion.div>
  );
}

