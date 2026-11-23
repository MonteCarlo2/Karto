"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Mic, Square } from "lucide-react";
import { useKartoVoiceInput } from "@/hooks/use-karto-voice-input";
import { hub, hubSans } from "./hub-ui";

/**
 * Кнопка голосового ввода для полей Seller Hub. Состояния показывает сама кнопка: запись (красная, пульсирует по громкости), распознавание (мигает), текст печатается в поле.
 * Отдельных надписей нет; сообщение появляется только при проблеме: не расслышали, запись слишком короткая или длинная, нет доступа к микрофону.
 */
export function HubVoiceButton({ value, onChange, disabled = false, maxLength, className = "", size = 40, hintAlign = "right" }: { value: string; onChange: (next: string) => void; disabled?: boolean; maxLength?: number; className?: string; size?: number; hintAlign?: "left" | "right" }) {
  const voice = useKartoVoiceInput({ value, onChange, isActive: !disabled, maxLength });
  // Сообщение живёт несколько секунд и скрывается само: скрытое запоминаем по тексту, новое сообщение показывается снова.
  const [hidden, setHidden] = useState<string | null>(null);
  const shown = voice.voiceHint && !voice.recording && !voice.voiceBusy && hidden !== voice.voiceHint ? voice.voiceHint : null;

  useEffect(() => {
    if (!shown) return;
    const t = window.setTimeout(() => setHidden(shown), 7_000);
    return () => window.clearTimeout(t);
  }, [shown]);

  return (
    <span className={`${/\b(absolute|fixed)\b/.test(className) ? "" : "relative"} inline-flex ${className}`}>
      <motion.button
        type="button"
        onClick={() => void voice.onVoiceButtonClick()}
        disabled={disabled || (voice.voiceBusy && !voice.recording)}
        aria-label={voice.voiceLabel}
        title={voice.voiceLabel}
        aria-pressed={voice.recording}
        style={{ width: size, height: size, scale: voice.isRecordingMedia ? voice.pulseSmooth : 1, backgroundColor: voice.recording ? "#FF5A47" : "rgba(1,20,8,0.06)", color: voice.recording ? "#fff" : hub.text }}
        whileTap={{ scale: 0.92 }}
        className="flex items-center justify-center rounded-[14px] outline-none transition-colors duration-150 hover:bg-[rgba(1,20,8,0.1)] focus-visible:shadow-[0_0_0_2px_#fff,0_0_0_4px_rgba(185,255,75,0.9)] disabled:opacity-40"
      >
        {voice.voiceBusy ? (
          <motion.span animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 0.9, repeat: Infinity }} className="flex">
            <Mic className="h-5 w-5" strokeWidth={2.2} aria-hidden />
          </motion.span>
        ) : voice.recording ? (
          <Square className="h-4 w-4" fill="currentColor" strokeWidth={0} aria-hidden />
        ) : (
          <Mic className="h-5 w-5" strokeWidth={2.2} aria-hidden />
        )}
      </motion.button>
      <AnimatePresence>
        {shown ? (
          <motion.span
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.18 }}
            role="alert"
            className={`absolute bottom-full z-20 mb-2 w-max max-w-[260px] rounded-[12px] px-3 py-2 text-[13px] leading-[1.4] shadow-[0_8px_24px_-10px_rgba(1,20,8,0.35)] ${hintAlign === "right" ? "right-0" : "left-0"}`}
            style={{ ...hubSans, backgroundColor: hub.text, color: "#fff" }}
          >
            {shown}
          </motion.span>
        ) : null}
      </AnimatePresence>
    </span>
  );
}
