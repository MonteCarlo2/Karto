"use client";

import type { TaskFocus } from "./task-focus";
import { useEffect, type ReactNode } from "react";
import { ArrowUpRight, PencilLine } from "lucide-react";
import { motion } from "framer-motion";
import { AiFindingCard, useAiFindings } from "./hub-ai-findings";
import { hub, hubSans } from "./hub-ui";

/**
 * План агента прямо в переписке: та же карточка, что в разделе «Задачи» (цель, товар, цифры, кнопки).
 * Нажатие на карточку открывает подробный вид с шагами, правками, принятием и автопилотом. План виден и в «Задачах».
 * Без папки: она нужна только статьям базы знаний. Показываются только планы этого ответа (ids): следующие сообщения диалога карточку не двигают. Поправить план можно просто словами в чате.
 */

type Props = {
  chatId: string;
  /** Планы именно этого ответа. Если не заданы (старые диалоги), показываются все планы диалога. */
  ids?: string[];
  titleByNm?: Map<string, string>;
  cardByNm?: Map<string, { title: string; vendorCode: string; description: string; imageUrl?: string }>;
  reloadKey?: number;
  onOpenTasks?: (focus?: TaskFocus) => void;
  /** Заготовка в поле чата: «Отредактируй план …». */
  onEdit?: (title: string) => void;
  /** Кнопка «Копировать» в том же ряду, что и остальные. */
  trailing?: ReactNode;
};

export function ChatPlanCards({ chatId, ids, titleByNm, cardByNm, reloadKey, onOpenTasks, onEdit, trailing }: Props) {
  const ctx = useAiFindings({ chatId, titleByNm, cardByNm, reloadKey });
  const items = ctx.items.filter((item) => !ids || (item.finding && ids.includes(item.finding.id)));
  const missing = ids ? ids.some((id) => !ctx.items.some((item) => item.finding?.id === id)) : false;
  const { load } = ctx;
  // План сохраняется на сервере чуть позже ответа: пока карточки нет, спрашиваем ленту ещё несколько раз.
  useEffect(() => {
    if (!missing) return;
    let n = 0;
    const t = window.setInterval(() => {
      n += 1;
      void load();
      if (n >= 6) window.clearInterval(t);
    }, 2000);
    return () => window.clearInterval(t);
  }, [missing, load]);
  if (items.length === 0) return trailing ? <div className="-ml-2">{trailing}</div> : null;
  return (
    <div className="space-y-4">
      {items.map((item) => {
        // Тот же вид, что в разделе «Задачи»: без обёрток. Папка в чате только у статей базы знаний.
        return (
          <motion.ul key={item.key} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}>
            <AiFindingCard item={item} ctx={ctx} compact />
          </motion.ul>
        );
      })}
      <div className="flex flex-wrap items-center gap-2">
        {onEdit ? (
          <button type="button" onClick={() => onEdit(items[items.length - 1]?.finding?.title ?? "план")} className="inline-flex h-10 items-center gap-1.5 rounded-full border px-5 text-[14px] font-medium outline-none transition-colors hover:bg-white focus-visible:shadow-[0_0_0_2px_var(--hub-lime-ring)]" style={{ ...hubSans, borderColor: "rgba(1, 20, 8, 0.16)", color: hub.text }}>
            <PencilLine className="h-4 w-4" aria-hidden />
            Отредактировать
          </button>
        ) : null}
        {onOpenTasks ? (
          <button type="button" onClick={() => onOpenTasks()} className="inline-flex h-10 items-center gap-1.5 rounded-full px-5 text-[14px] font-semibold outline-none transition-[filter,transform] duration-150 hover:-translate-y-px hover:brightness-95 focus-visible:shadow-[0_0_0_2px_var(--hub-canvas),0_0_0_4px_var(--hub-lime-ring)]" style={{ ...hubSans, backgroundColor: hub.lime, color: "#011408" }}>
            Открыть в Задачах
            <ArrowUpRight className="h-4 w-4" aria-hidden />
          </button>
        ) : null}
        {trailing}
      </div>
    </div>
  );
}
