"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { panel, wsSans } from "./settings-ui";

type WorkspaceConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirming?: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
};

export function WorkspaceConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Подтвердить",
  cancelLabel = "Отмена",
  confirming = false,
  onClose,
  onConfirm,
}: WorkspaceConfirmDialogProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !confirming) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, confirming]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            type="button"
            aria-label="Закрыть"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            disabled={confirming}
            onClick={() => {
              if (!confirming) onClose();
            }}
            className="fixed inset-0 z-[200] cursor-default border-0 bg-[#0A0A0A]/58 backdrop-blur-[3px]"
          />
          <motion.div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="workspace-confirm-title"
            aria-describedby="workspace-confirm-desc"
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 420, damping: 34 }}
            className="fixed left-1/2 top-1/2 z-[201] w-[min(460px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[1.25rem] border px-6 py-6 shadow-[0_24px_70px_-20px_rgba(10,10,10,0.55)]"
            style={{
              borderColor: panel.borderStrong,
              backgroundColor: panel.canvas,
              isolation: "isolate",
            }}
          >
            <h3
              id="workspace-confirm-title"
              className="relative z-[1] text-[18px] font-semibold tracking-[-0.02em]"
              style={{ ...wsSans, color: panel.text }}
            >
              {title}
            </h3>
            <p
              id="workspace-confirm-desc"
              className="relative z-[1] mt-2 text-[14px] leading-[1.65]"
              style={{ ...wsSans, color: panel.textMuted }}
            >
              {description}
            </p>
            <div className="relative z-[1] mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                disabled={confirming}
                onClick={onClose}
                className="rounded-xl border px-5 py-2.5 text-[14px] font-semibold transition hover:bg-[#0a0a0a]/[0.03] disabled:opacity-50"
                style={{ ...wsSans, borderColor: panel.borderStrong, color: panel.text }}
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                disabled={confirming}
                onClick={() => void onConfirm()}
                className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-[14px] font-semibold transition disabled:opacity-70"
                style={{ ...wsSans, backgroundColor: "#991B1B", color: "#FFF7F7" }}
              >
                {confirming ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {confirming ? "Удаляем…" : confirmLabel}
              </button>
            </div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}
