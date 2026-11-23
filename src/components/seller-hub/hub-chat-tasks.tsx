"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowUpRight, ListChecks } from "lucide-react";
import { loadStoredSellerHubTasks, updateSellerHubTaskStatus } from "@/lib/seller-hub/task-engine/client";
import type { SellerTask, TaskCategory } from "@/lib/seller-hub/task-engine/types";
import type { SellerCatalogItem, SellerCatalogSnapshot } from "@/lib/seller-hub/types";
import type { TaskFocus } from "./task-focus";
import { suggestPriceFix } from "@/lib/seller-hub/task-engine/fix";
import { ChatAction } from "./hub-chat-more";
import { TaskDrawer, TaskRow } from "./hub-tasks";
import { muteSellerHubTask } from "@/lib/seller-hub/client-api";
import { hub, hubSans } from "./hub-ui";

/**
 * Задачи прямо в переписке: те же карточки, что в разделе «Задачи» (компактный вид), по 3 штуки.
 * Остальные открываются кнопкой в разделе. Нажатие на карточку ведёт к этой задаче.
 */
const SHOWN = 3;

export function ChatTaskCards({ title, ids, total, snapshot, itemByNm, onOpenTasks, fullSnapshot, sandbox }: { fullSnapshot?: SellerCatalogSnapshot; sandbox?: boolean; title: string; ids: string[]; total: number; snapshot?: Pick<SellerCatalogSnapshot, "marketplaceId">; itemByNm?: Map<string, SellerCatalogItem>; onOpenTasks?: (focus?: TaskFocus) => void }) {
  const [tasks, setTasks] = useState<SellerTask[] | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fixId, setFixId] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    if (!snapshot) return;
    let cancelled = false;
    void loadStoredSellerHubTasks(snapshot)
      .then((rows) => {
        if (!cancelled) setTasks(rows);
      })
      .catch(() => {
        if (!cancelled) setTasks([]);
      });
    return () => {
      cancelled = true;
    };
  }, [snapshot]);
  const shown = (tasks ?? []).filter((t) => ids.includes(t.id)).sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id)).slice(0, SHOWN);
  /** «Выполнено» прямо из чата: меняется только статус задачи в KARTO, кабинет WB не затрагивается. */
  const complete = async (t: SellerTask, status: "completed" | "snoozed" = "completed", snoozeUntil?: string) => {
    if (!snapshot) return;
    setSaving(t.id);
    setNote(null);
    try {
      const saved = await updateSellerHubTaskStatus({ marketplaceId: snapshot.marketplaceId, taskId: t.id, status, snoozeUntil });
      setTasks((rows) => (rows ?? []).map((r) => (r.id === saved.id ? saved : r)));
      setNote(status === "completed" ? "Отметил задачу выполненной." : "Отложил задачу.");
      setSelectedId(null);
    } catch {
      setNote("Не удалось сохранить статус, попробуйте ещё раз.");
    } finally {
      setSaving(null);
    }
  };
  const fixOf = (t: SellerTask) => {
    const item = t.nmId ? itemByNm?.get(t.nmId) : undefined;
    const fix = item ? suggestPriceFix(t.type, t.evidence, item) : null;
    return fix && item ? { fix, item } : null;
  };
  const open = (t?: SellerTask) => onOpenTasks?.(t ? { category: t.category as TaskCategory, id: t.id, type: t.type, nmId: t.nmId } : undefined);
  const selected = (tasks ?? []).find((t) => t.id === selectedId) ?? null;
  const selectedItem = selected?.nmId ? (itemByNm?.get(selected.nmId) ?? null) : null;
  return (
    <div>
      <p className="mb-3 flex items-center gap-2 text-[12.5px] font-semibold uppercase tracking-[0.06em]" style={{ ...hubSans, color: hub.textSubtle }}>
        <ListChecks className="h-4 w-4" aria-hidden />
        {title}
      </p>
      {tasks == null ? (
        <div className="space-y-3" aria-hidden>
          {[0, 1].map((i) => (
            <div key={i} className="h-[150px] animate-pulse rounded-[20px]" style={{ backgroundColor: "rgba(1, 20, 8, 0.05)" }} />
          ))}
        </div>
      ) : (
        <ul className="space-y-3">
          {shown.map((t, i) => (
            <TaskRow key={t.id} compact index={i} task={t} item={(t.nmId ? itemByNm?.get(t.nmId) : undefined) ?? null} repeats={1} saving={saving === t.id} onOpen={() => setSelectedId(t.id)} onOpenProduct={() => setSelectedId(t.id)} onAction={() => open(t)} onComplete={() => void complete(t)} onFix={t.status === "active" && fixOf(t) ? () => setFixId(fixId === t.id ? null : t.id) : undefined} />
          ))}
        </ul>
      )}
      {fixId ? (
        (() => {
          const t = shown.find((x) => x.id === fixId);
          const f = t ? fixOf(t) : null;
          return f && t ? (
            <div className="mt-3">
              <ChatAction key={fixId} action={{ type: "price", nmId: t.nmId!, targetRub: f.fix.targetRub, baseRub: f.fix.baseRub, discount: f.fix.discount, currentRub: f.fix.currentRub, currentBaseRub: f.item.price ?? null }} snapshot={fullSnapshot} itemByNm={itemByNm} sandbox={sandbox ?? true} />
            </div>
          ) : null;
        })()
      ) : null}
      {selected ? (
        <TaskDrawer
          key={selected.id}
          task={selected}
          related={[]}
          item={selectedItem}
          price={selectedItem?.discountedPrice ?? selectedItem?.price ?? null}
          statusNote={null}
          saving={saving === selected.id}
          onClose={() => setSelectedId(null)}
          onOpenProduct={() => open(selected)}
          onAction={() => open(selected)}
          onComplete={() => void complete(selected)}
          onSnooze={(until) => void complete(selected, "snoozed", until)}
          productEvents={[]}
          onMute={
            selected.nmId && snapshot && selected.type !== "TASK_FROM_EVENT"
              ? () => {
                  void muteSellerHubTask(selected.nmId!, selected.type, true, snapshot.marketplaceId).then((res) => {
                    setNote(res.ok ? "Больше не буду создавать такие задачи по этому товару." : res.error);
                    if (res.ok) setSelectedId(null);
                  });
                }
              : undefined
          }
        />
      ) : null}
      {note ? (
        <p className="mt-2 text-[13px]" role="status" style={{ ...hubSans, color: hub.textSubtle }}>
          {note}
        </p>
      ) : null}
      {onOpenTasks ? (
        <motion.button initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} type="button" onClick={() => open()} className="mt-3 inline-flex h-10 items-center gap-1.5 rounded-full px-5 text-[14px] font-semibold outline-none transition-[filter,transform] duration-150 hover:-translate-y-px hover:brightness-95 focus-visible:shadow-[0_0_0_2px_var(--hub-lime-ring)]" style={{ ...hubSans, backgroundColor: hub.lime, color: "#011408" }}>
          {total > SHOWN ? `Ещё ${total - SHOWN} в Задачах` : "Открыть в Задачах"}
          <ArrowUpRight className="h-4 w-4" aria-hidden />
        </motion.button>
      ) : null}
    </div>
  );
}
