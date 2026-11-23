"use client";

import { useEffect, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { SideCard } from "./hub-fulfillment-ui";
import { HubButton, hub, hubSans } from "./hub-ui";

const SHOWN = 3;

/** Строка колонки справа: что угодно (задача платформы, совет), важность для сортировки и способ нарисовать. */
export type PanelItem = { id: string; rank: number; render: (close: () => void) => ReactNode };

/**
 * Колонка «что делать» раздела: три самых важных плиткой, остальные в боковом окне по кнопке «Показать ещё».
 * Задачи платформы и советы по цифрам лежат вперемешку, по важности. Список любой длины выглядит одинаково.
 */
export function SectionTasksPanel({ items, loading, emptyText }: { items: PanelItem[]; loading: boolean; emptyText: string }) {
  const [open, setOpen] = useState(false);
  const sorted = [...items].sort((a, b) => a.rank - b.rank);
  const shown = sorted.slice(0, SHOWN);
  const hidden = sorted.length - shown.length;
  const close = () => setOpen(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <SideCard>
      {sorted.length === 0 && !loading ? (
        <p className="flex items-start gap-2.5 text-[15px] leading-[1.5]" style={{ ...hubSans, color: "#067A55" }}>
          <span className="mt-[7px] h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: "#10B981" }} aria-hidden />
          {emptyText}
        </p>
      ) : (
        <ul>{shown.map((it) => <span key={it.id} className="contents">{it.render(close)}</span>)}</ul>
      )}
      {loading
        ? Array.from({ length: Math.max(1, SHOWN - shown.length) }).map((_, i) => (
            <div key={`sk-${i}`} role="status" aria-label="Проверяю данные" className="hub-skel mb-3 h-[132px] rounded-[20px]" style={{ animationDelay: `${i * 0.15}s` }} />
          ))
        : null}
      {hidden > 0 ? (
        <div className="flex justify-end">
          <HubButton size="sm" variant="secondary" onClick={() => setOpen(true)}>
            Показать ещё {hidden}
          </HubButton>
        </div>
      ) : null}
      {open ? (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Все задачи">
          <button type="button" aria-label="Закрыть" className="absolute inset-0 cursor-default bg-[#011408]/30" onClick={close} />
          <div className="hub-drawer-in absolute inset-y-0 right-0 flex w-full max-w-[540px] flex-col border-l bg-[var(--hub-canvas)]" style={{ borderColor: "rgba(1, 20, 8, 0.12)" }}>
            <div className="flex items-center justify-between gap-4 border-b px-7 py-5" style={{ borderColor: "rgba(1, 20, 8, 0.1)" }}>
              <h2 className="text-[22px] font-semibold tracking-[-0.02em]" style={{ ...hubSans, color: hub.text }}>
                Все задачи · {sorted.length}
              </h2>
              <button type="button" aria-label="Закрыть" onClick={close} className="flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-[var(--hub-surface-muted)]" style={{ color: hub.textMuted }}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <ul className="min-h-0 flex-1 overflow-y-auto px-7 py-6">
              {sorted.map((it) => (
                <span key={it.id} className="contents">
                  {it.render(close)}
                </span>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </SideCard>
  );
}
