"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { X, Send, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/toast";

interface ContactQuestionModalProps {
  isOpen: boolean;
  onClose: () => void;
  user?: { id: string; email?: string; user_metadata?: { name?: string; full_name?: string } } | null;
}

export function ContactQuestionModal({ isOpen, onClose, user }: ContactQuestionModalProps) {
  const [question, setQuestion] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { showToast } = useToast();

  useEffect(() => {
    if (!isOpen) {
      setQuestion("");
    }
  }, [isOpen]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 240)}px`;
    }
  }, [question]);

  const handleSubmit = async () => {
    const trimmed = question.trim();
    if (!trimmed) {
      showToast({ type: "error", message: "Напишите ваш вопрос" });
      return;
    }
    setIsSubmitting(true);
    try {
      const { createBrowserClient } = await import("@/lib/supabase/client");
      const supabase = createBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (session?.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token}`;
      }
      const res = await fetch("/api/contact-question", {
        method: "POST",
        headers,
        body: JSON.stringify({ question: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Не удалось отправить вопрос");
      }
      showToast({ type: "success", message: "Вопрос отправлен. Мы ответим вам на почту." });
      setQuestion("");
      onClose();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Ошибка отправки. Попробуйте позже.";
      showToast({ type: "error", message: msg });
    } finally {
      setIsSubmitting(false);
    }
  };

  const contactEmail = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "aiora.help@mail.ru";

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 bg-[#F5F5F0] shadow-2xl rounded-2xl border border-neutral-200 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col">
              <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-300/80">
                <h2
                  className="text-lg font-semibold text-neutral-900"
                  style={{ fontFamily: "var(--font-serif)" }}
                >
                  Напишите нам
                </h2>
                <button
                  type="button"
                  onClick={onClose}
                  className="p-2 hover:bg-neutral-200/80 rounded-lg transition-colors text-neutral-600"
                  disabled={isSubmitting}
                  aria-label="Закрыть"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-5">
                {!user ? (
                  <div className="flex flex-col gap-4">
                    <p
                      className="text-neutral-600 leading-relaxed text-sm"
                      style={{ fontFamily: "var(--font-serif)" }}
                    >
                      Чтобы задать вопрос через форму, войдите в аккаунт.
                    </p>
                    <Link
                      href="/login"
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#2E5A43] hover:bg-[#1F4E3D] text-white font-medium px-5 py-3 transition-colors"
                      style={{ fontFamily: "var(--font-serif)" }}
                    >
                      Войти
                    </Link>
                    <p className="text-neutral-500 text-sm pt-2 border-t border-neutral-200/80" style={{ fontFamily: "var(--font-serif)" }}>
                      Или напишите нам на{" "}
                      <a href={`mailto:${contactEmail}`} className="text-[#2E5A43] underline hover:no-underline">
                        {contactEmail}
                      </a>
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <label
                        htmlFor="contact-question-field"
                        className="block text-sm font-medium text-neutral-700 mb-2"
                        style={{ fontFamily: "var(--font-serif)" }}
                      >
                        Ваш вопрос
                      </label>
                      <textarea
                        id="contact-question-field"
                        ref={textareaRef}
                        value={question}
                        onChange={(e) => setQuestion(e.target.value)}
                        placeholder="Опишите вопрос или пожелание..."
                        className="w-full min-h-[100px] max-h-[200px] p-4 border border-neutral-300 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-[#2E5A43]/40 focus:border-[#2E5A43] bg-white text-neutral-900 placeholder:text-neutral-400 transition-colors disabled:opacity-60 text-sm"
                        style={{ fontFamily: "var(--font-serif)" }}
                        disabled={isSubmitting}
                      />
                      <p className="mt-1 text-xs text-neutral-500">До 2000 символов</p>
                    </div>
                    <button
                      type="button"
                      onClick={handleSubmit}
                      disabled={isSubmitting || !question.trim()}
                      className="w-full flex items-center justify-center gap-2 px-5 py-2.5 bg-[#2E5A43] hover:bg-[#1F4E3D] text-white font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                      style={{ fontFamily: "var(--font-serif)" }}
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Отправка...</span>
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4" />
                          <span>Отправить</span>
                        </>
                      )}
                    </button>
                    <p className="text-neutral-500 text-xs pt-1" style={{ fontFamily: "var(--font-serif)" }}>
                      Или напишите на{" "}
                      <a href={`mailto:${contactEmail}`} className="text-[#2E5A43] underline hover:no-underline">
                        {contactEmail}
                      </a>
                    </p>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
