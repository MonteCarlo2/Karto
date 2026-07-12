"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Loader2 } from "lucide-react";

type DeleteAccountConfirmDialogProps = {
  open: boolean;
  email: string;
  deleting: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (confirmPhrase: string) => void | Promise<void>;
};

const CONFIRM_PHRASE = "УДАЛИТЬ";

export function DeleteAccountConfirmDialog({
  open,
  email,
  deleting,
  error,
  onClose,
  onConfirm,
}: DeleteAccountConfirmDialogProps) {
  const [confirmPhrase, setConfirmPhrase] = useState("");

  useEffect(() => {
    if (open) setConfirmPhrase("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !deleting) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, deleting, onClose]);

  const phraseOk = confirmPhrase.trim().toUpperCase() === CONFIRM_PHRASE;

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !deleting) onClose();
          }}
        >
          <motion.div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-account-title"
            initial={{ scale: 0.96, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 10 }}
            transition={{ type: "spring", damping: 34, stiffness: 420 }}
            className="w-full max-w-[440px] overflow-hidden rounded-[1.25rem] border border-red-200/80 bg-white p-6 shadow-[0_28px_64px_-20px_rgba(15,23,42,0.35)]"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h3 id="delete-account-title" className="text-lg font-semibold tracking-tight text-neutral-950">
                  Удалить профиль навсегда?
                </h3>
                <p className="mt-2 text-[14px] leading-relaxed text-neutral-600">
                  Будут удалены все данные аккаунта: проекты, бренд, подписки, баланс ответов, настройки
                  автоответов и история. После удаления можно зарегистрироваться снова на{" "}
                  <span className="font-medium text-neutral-900">{email || "этот email"}</span>.
                </p>
              </div>
            </div>

            <label className="block">
              <span className="mb-2 block text-[13px] font-medium text-neutral-700">
                Введите <span className="font-semibold text-red-700">{CONFIRM_PHRASE}</span> для подтверждения
              </span>
              <input
                type="text"
                value={confirmPhrase}
                disabled={deleting}
                onChange={(event) => setConfirmPhrase(event.target.value)}
                className="w-full rounded-xl border border-neutral-200 px-4 py-3 text-[14px] text-neutral-900 outline-none transition focus:border-red-400 focus:ring-2 focus:ring-red-100 disabled:opacity-60"
                placeholder={CONFIRM_PHRASE}
                autoComplete="off"
                spellCheck={false}
              />
            </label>

            {error ? (
              <p className="mt-3 text-[13px] font-medium text-red-600" role="alert">
                {error}
              </p>
            ) : null}

            <div className="mt-6 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end sm:gap-3">
              <button
                type="button"
                disabled={deleting}
                onClick={onClose}
                className="rounded-xl border border-neutral-200 bg-white px-5 py-3 text-[14px] font-medium text-neutral-800 transition hover:border-[#1F4E3D]/30 hover:bg-[#1F4E3D]/[0.04] hover:text-[#1F4E3D] disabled:opacity-40"
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={deleting || !phraseOk}
                onClick={() => void onConfirm(confirmPhrase.trim().toUpperCase())}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-700/85 bg-red-700 px-5 py-3 text-[14px] font-semibold text-white shadow-[0_10px_28px_-14px_rgba(185,28,28,0.55)] transition hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {deleting ? "Удаляем профиль…" : "Удалить профиль"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
