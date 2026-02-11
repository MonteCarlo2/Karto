"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";

type ToastType = "info" | "success" | "error";

type Toast = {
  id: number;
  type: ToastType;
  title?: string;
  message: string;
};

type ToastContextValue = {
  showToast: (opts: { type?: ToastType; title?: string; message: string }) => void;
};

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

let idCounter = 1;

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback(
    ({ type = "info", title, message }: { type?: ToastType; title?: string; message: string }) => {
      const id = idCounter++;
      setToasts((prev) => [...prev, { id, type, title, message }]);

      // Авто‑скрытие через 4 секунды
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4000);
    },
    []
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[300] flex flex-col gap-3 pointer-events-none">
        <AnimatePresence initial={false}>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className={cn(
                "pointer-events-auto w-80 rounded-2xl px-4 py-3 shadow-xl border text-sm bg-white",
                toast.type === "error" && "border-red-200 bg-red-50",
                toast.type === "success" && "border-emerald-200 bg-emerald-50",
                toast.type === "info" && "border-gray-200 bg-white"
              )}
            >
              {toast.title && (
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {toast.title}
                </div>
              )}
              <div className="text-[13px] leading-relaxed text-gray-900">
                {toast.message}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx;
};

