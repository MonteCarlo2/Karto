"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { CalendarClock } from "lucide-react";
import { createSellerHubOrder, patchSellerHubOrder } from "@/lib/seller-hub/client-api";
import { orderDetails } from "@/lib/seller-hub/orders/preview";
import type { OrderInput } from "@/lib/seller-hub/orders/types";
import { hub, hubSans } from "./hub-ui";
import { ScheduleBadge } from "./hub-schedule-badge";

/** Карточка поручения в чате: что агент будет делать, когда и в каких рамках. Создаётся после нажатия «Создать поручение». */
export function ChatOrder({ input, replaceId, sandbox, campaignName, productTitle }: { input: OrderInput; replaceId?: string; sandbox: boolean; campaignName?: (id: string) => string | undefined; productTitle?: (id: string) => string | undefined }) {
  const [stage, setStage] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const reduce = useReducedMotion();
  const acts = input.mode === "act" && input.kind !== "remind";

  async function create() {
    setStage("busy");
    setMessage(null);
    const res = replaceId ? await patchSellerHubOrder(replaceId, { input }) : await createSellerHubOrder(input);
    if (res.ok) {
      setStage("done");
      setMessage(replaceId ? "Готово. Поручение обновлено, расписание пересчитано." : "Готово. Поручение появилось в разделе «Поручения»: там его можно поставить на паузу, изменить или удалить.");
    } else {
      setStage("error");
      setMessage(res.error ?? "Не получилось создать поручение. Попробуйте ещё раз.");
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }} className="rounded-[18px] p-5" style={{ backgroundColor: "rgba(46, 90, 67, 0.05)", boxShadow: "inset 0 0 0 1px rgba(1,20,8,0.07)" }}>
      <p className="flex items-center gap-2 text-[12.5px] font-semibold uppercase tracking-[0.06em]" style={{ ...hubSans, color: hub.textSubtle }}>
        <CalendarClock className="h-4 w-4" strokeWidth={1.8} aria-hidden />
        {replaceId ? "Изменение поручения" : "Поручение"}
      </p>
      <p className="mt-2.5 text-[17px] font-semibold leading-[1.4] [overflow-wrap:anywhere]" style={{ ...hubSans, color: hub.text }}>
        {input.title}
      </p>
      <dl className="mt-5 space-y-5">
        {orderDetails(input, { campaignName, productTitle }).map((r) => (
          <div key={r.label} className="grid gap-x-4 gap-y-1.5 sm:grid-cols-[96px_1fr]">
            <dt className="pt-0.5 text-[12px] font-semibold uppercase leading-[1.8] tracking-[0.06em]" style={{ ...hubSans, color: hub.textSubtle }}>
              {r.label}
            </dt>
            <dd className="text-[15px] leading-[1.55] [overflow-wrap:anywhere]" style={{ ...hubSans, color: hub.text }}>
              {r.label === "Когда" ? <ScheduleBadge schedule={input.schedule} /> : r.text}
            </dd>
          </div>
        ))}
      </dl>
      {acts && sandbox ? (
        <p className="mt-2 text-[13px] leading-[1.45]" style={{ ...hubSans, color: hub.textSubtle }}>
          Сейчас включён тестовый режим: в Wildberries ничего не отправится, поручение только проверится.
        </p>
      ) : null}
      {stage === "done" ? (
        <div className="mt-5 flex items-start gap-3.5 rounded-[14px] px-4 py-3.5" style={{ backgroundColor: "rgba(111,194,29,0.14)" }} role="status">
          <svg viewBox="0 0 40 40" className="mt-0.5 h-9 w-9 shrink-0" aria-hidden>
            <motion.circle cx="20" cy="20" r="17" fill="#6FC21D" initial={reduce ? false : { scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 380, damping: 22 }} style={{ transformOrigin: "20px 20px" }} />
            <motion.path d="M12 20.5l6 6 11-12.5" fill="none" stroke="#0B2A12" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: reduce ? 0 : 0.18, duration: 0.38, ease: [0.22, 1, 0.36, 1] }} />
          </svg>
          <div className="min-w-0">
            <p className="text-[16px] font-semibold leading-[1.35]" style={{ ...hubSans, color: hub.text }}>
              {replaceId ? "Поручение обновлено" : "Поручение создано"}
            </p>
            <p className="mt-0.5 text-[14px] leading-[1.5]" style={{ ...hubSans, color: hub.textMuted }}>
              {replaceId ? "Расписание пересчитано. Оно в разделе «Поручения»: там его можно поставить на паузу, изменить или удалить." : "Оно появилось в разделе «Поручения»: там его можно поставить на паузу, изменить или удалить."}
            </p>
          </div>
        </div>
      ) : (
        <div className="mt-3.5">
          <button type="button" disabled={stage === "busy"} onClick={() => void create()} className="inline-flex h-10 items-center rounded-full px-5 text-[14.5px] font-semibold outline-none transition-[transform,opacity] duration-150 hover:opacity-90 focus-visible:shadow-[0_0_0_2px_var(--hub-lime-ring)] active:scale-[0.98] disabled:opacity-60" style={{ ...hubSans, backgroundColor: hub.lime, color: hub.onLime }}>
            {stage === "busy" ? (replaceId ? "Обновляю…" : "Создаю…") : replaceId ? "Обновить поручение" : "Создать поручение"}
          </button>
          {stage === "error" && message ? (
            <p className="mt-2.5 text-[13.5px] leading-[1.45]" style={{ ...hubSans, color: hub.danger }} role="alert">
              {message}
            </p>
          ) : null}
        </div>
      )}
    </motion.div>
  );
}
