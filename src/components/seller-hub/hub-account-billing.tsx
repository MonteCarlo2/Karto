"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { autoRepliesAuthorizedFetch } from "@/lib/auto-replies/auto-replies-fetch";
import { AUTO_REPLY_PACKAGES, autoReplyPricePerUnit } from "@/lib/auto-replies-pricing";
import { CREDIT_PACKAGES } from "@/lib/credits-pricing";
import { formatInt, hub, HubButton, hubSans } from "./hub-ui";
import { AgentSwitch } from "./hub-agents-ui";
import { Segmented } from "./hub-analytics-ui";
import { Group, Row, type AccountCtx } from "./hub-account";

type Kind = "auto_replies" | "credits";

const fmtDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" }) : "—");

/** Раздел «Тариф и оплата»: баланс, пополнение пакетом, автопродление. Оплата идёт через ЮKassa, пакет автоответов действует месяц. */
export function HubAccountBilling({ ctx }: { ctx: AccountCtx }) {
  const { sub, credits, subReady, reloadSub } = ctx;
  const [kind, setKind] = useState<Kind>("auto_replies");
  const [pick, setPick] = useState(2);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [renewBusy, setRenewBusy] = useState(false);
  const [confirmCard, setConfirmCard] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const balance = sub?.autoReplyBalance;
  const periodActive = Boolean(sub?.autoReplyPeriodEnd) && !sub?.autoReplyPackExpired;
  const count = kind === "auto_replies" ? AUTO_REPLY_PACKAGES.length : CREDIT_PACKAGES.length;
  const chosen = Math.min(pick, count - 1);
  const price = kind === "auto_replies" ? AUTO_REPLY_PACKAGES[chosen]!.priceRub : CREDIT_PACKAGES[chosen]!.priceRub;

  const pay = async () => {
    setPaying(true);
    setPayError(null);
    try {
      const res = await autoRepliesAuthorizedFetch("/api/payment/create", { method: "POST", body: JSON.stringify({ paymentKind: kind, tariffIndex: chosen }), timeoutMs: 30_000 });
      const data = (await res.json().catch(() => ({}))) as { success?: boolean; confirmation_url?: string; error?: string };
      if (!data.success || !data.confirmation_url) {
        setPayError(data.error ?? "Не удалось создать платёж. Попробуйте ещё раз.");
        return;
      }
      window.location.href = data.confirmation_url;
    } catch {
      setPayError("Нет связи с платёжной системой. Попробуйте ещё раз.");
    } finally {
      setPaying(false);
    }
  };

  const call = async (url: string, method: "PATCH" | "DELETE", body: unknown, okText: string) => {
    setRenewBusy(true);
    setMsg(null);
    try {
      const res = await autoRepliesAuthorizedFetch(url, { method, ...(body ? { body: JSON.stringify(body) } : {}), timeoutMs: 20_000 });
      const data = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string; message?: string };
      setMsg(data.success ? (data.message ?? okText) : (data.error ?? "Не удалось выполнить действие."));
      setConfirmCard(false);
      await reloadSub();
    } catch {
      setMsg("Нет связи. Попробуйте ещё раз.");
    } finally {
      setRenewBusy(false);
    }
  };

  return (
    <>
      <Group title="Баланс" hint="Каждый автоответ на отзыв списывает один ответ. Пробные ответы даются один раз, оплаченный пакет действует месяц.">
        <Row title="Ответов в пакете" hint={sub ? `Пробных ${formatInt(sub.autoReplyWelcomeRemaining ?? 0)}, оплаченных ${formatInt(sub.autoReplyPaidRemaining ?? 0)}` : undefined}>
          <span className="text-[22px] font-semibold tabular-nums tracking-[-0.02em]" style={{ ...hubSans, color: hub.text }}>
            {balance != null ? formatInt(balance) : subReady ? "—" : "…"}
          </span>
        </Row>
        <Row title="Пакет действует" hint={periodActive ? `До ${fmtDate(sub?.autoReplyPeriodEnd)}` : "Платного пакета сейчас нет"} />
        <Row title="Кредиты KARTO" hint="Единые кредиты для генерации карточек и видео">
          <span className="text-[22px] font-semibold tabular-nums tracking-[-0.02em]" style={{ ...hubSans, color: hub.text }}>
            {credits != null ? formatInt(credits) : subReady ? "—" : "…"}
          </span>
        </Row>
      </Group>

      <Group
        title="Пополнить"
        hint={kind === "auto_replies" ? "Один ответ списывается за один автоответ. Пакет действует календарный месяц с момента оплаты." : "Кредиты не сгорают."}
        action={<Segmented<Kind> size="sm" layoutId="billing-kind" label="Что оплачиваем" value={kind} onChange={(k) => { setKind(k); setPick(2); setPayError(null); }} options={[{ id: "auto_replies", label: "Автоответы" }, { id: "credits", label: "Кредиты" }]} />}
      >
        <div role="radiogroup" aria-label="Пакет">
          {(kind === "auto_replies" ? AUTO_REPLY_PACKAGES : CREDIT_PACKAGES).map((p, i) => {
            const on = i === chosen;
            const title = kind === "auto_replies" ? `${formatInt((p as (typeof AUTO_REPLY_PACKAGES)[number]).replies)} ответов` : `${(p as (typeof CREDIT_PACKAGES)[number]).name}, ${formatInt((p as (typeof CREDIT_PACKAGES)[number]).credits)} кредитов`;
            const hint = kind === "auto_replies" ? `${autoReplyPricePerUnit((p as (typeof AUTO_REPLY_PACKAGES)[number]).replies, p.priceRub)} ₽ за ответ` : `≈ ${(p as (typeof CREDIT_PACKAGES)[number]).photosEquiv} фото`;
            return (
              <button key={`${kind}-${i}`} type="button" role="radio" aria-checked={on} onClick={() => setPick(i)} className="flex w-full items-center gap-4 border-t px-5 py-3.5 text-left outline-none transition-colors first:border-t-0 hover:bg-[rgba(1,20,8,0.03)] focus-visible:bg-[rgba(1,20,8,0.04)]" style={{ borderColor: "rgba(1,20,8,0.1)", backgroundColor: on ? "rgba(185,255,75,0.16)" : undefined }}>
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border" style={{ borderColor: on ? hub.ink : "rgba(1,20,8,0.3)", backgroundColor: on ? hub.ink : undefined }}>
                  {on ? <Check className="h-3 w-3 text-white" strokeWidth={3} aria-hidden /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="text-[15.5px] font-semibold" style={{ ...hubSans, color: hub.text }}>
                    {title}
                  </span>
                  <span className="ml-3 text-[13.5px]" style={{ ...hubSans, color: hub.textMuted }}>
                    {hint}
                  </span>
                </span>
                <span className="shrink-0 text-[16px] font-semibold tabular-nums" style={{ ...hubSans, color: hub.text }}>
                  {formatInt(p.priceRub)} ₽
                </span>
              </button>
            );
          })}
        </div>
        <Row title={`К оплате ${formatInt(price)} ₽`} hint={payError ? <span style={{ color: hub.danger }}>{payError}</span> : "Оплата картой через ЮKassa, чек придёт на почту. После оплаты вы вернётесь на страницу профиля, баланс там обновится."}>
          <HubButton onClick={() => void pay()} loading={paying}>
            Оплатить
          </HubButton>
        </Row>
      </Group>

      <Group title="Автопродление" hint="Пакет автоответов продлевается сам, чтобы ответы не прерывались.">
        <Row title="Продлевать пакет автоматически" hint={sub?.autoReplyAutoRenew ? `Следующее списание ${fmtDate(sub.autoReplyNextRenewAt)}${sub.autoReplyMonthlyPriceRub ? `, ${formatInt(sub.autoReplyMonthlyPriceRub)} ₽` : ""}` : sub?.autoReplyHasSavedCard ? "Выключено: пакет закончится в срок, и ответы остановятся" : "Станет доступно после первой оплаты с сохранением карты"}>
          <AgentSwitch label="Продлевать пакет автоматически" checked={Boolean(sub?.autoReplyAutoRenew)} disabled={renewBusy || !sub?.autoReplyHasSavedCard} onChange={(v) => void call("/api/auto-replies/billing/auto-renew", "PATCH", { autoRenew: v }, v ? "Автопродление включено." : "Автопродление выключено.")} />
        </Row>
        <Row title="Сохранённая карта" hint={sub?.autoReplyHasSavedCard ? `${sub.autoReplyCardBrand ?? "Карта"} •••• ${sub.autoReplyCardLast4 ?? ""}` : "Карты нет"}>
          {sub?.autoReplyHasSavedCard ? (
            confirmCard ? (
              <span className="flex items-center gap-2">
                <HubButton variant="danger" size="sm" onClick={() => void call("/api/auto-replies/billing/saved-card", "DELETE", null, "Карта удалена.")} loading={renewBusy}>
                  Удалить
                </HubButton>
                <HubButton variant="ghost" size="sm" onClick={() => setConfirmCard(false)}>
                  Отмена
                </HubButton>
              </span>
            ) : (
              <HubButton variant="secondary" size="sm" onClick={() => setConfirmCard(true)}>
                Удалить карту
              </HubButton>
            )
          ) : null}
        </Row>
        {msg ? (
          <p className="px-5 py-3 text-[14px]" style={{ ...hubSans, color: hub.textMuted }}>
            {msg}
          </p>
        ) : null}
      </Group>
    </>
  );
}
