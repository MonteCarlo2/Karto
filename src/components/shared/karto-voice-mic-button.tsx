"use client";

import { motion } from "framer-motion";
import { Mic } from "lucide-react";
import { KARTO_VOICE_LIME } from "@/lib/voice/karto-voice-shared";

type KartoVoiceMicButtonProps = {
  voiceLabel: string;
  voiceBusy: boolean;
  recording: boolean;
  isRecordingMedia: boolean;
  showRecordingWaves: boolean;
  micProcessingPulse: boolean;
  pulseSmooth: ReturnType<typeof import("framer-motion").useSpring>;
  onClick: () => void;
  /** Компактнее для полей 16px, lg — как в опросе бренда */
  size?: "md" | "lg";
};

export function KartoVoiceMicButton({
  voiceLabel,
  voiceBusy,
  recording,
  isRecordingMedia,
  showRecordingWaves,
  micProcessingPulse,
  pulseSmooth,
  onClick,
  size = "lg",
}: KartoVoiceMicButtonProps) {
  const shell = size === "lg" ? "h-[5.75rem] w-[5.75rem]" : "h-[4.5rem] w-[4.5rem]";
  const btn = size === "lg" ? "h-[3.65rem] w-[3.65rem]" : "h-[3rem] w-[3rem]";
  const wave = size === "lg" ? "size-[3.65rem]" : "size-[3rem]";
  const icon = size === "lg" ? "size-[1.78rem]" : "size-[1.45rem]";

  return (
    <div className={`pointer-events-none absolute bottom-3 right-3 z-20 flex ${shell} items-center justify-center overflow-visible`}>
      {showRecordingWaves
        ? [0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className={`pointer-events-none absolute left-1/2 top-1/2 ${wave} -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px]`}
              style={{ borderColor: `${KARTO_VOICE_LIME}40` }}
              initial={{ scale: 1, opacity: 0.38 }}
              animate={{ scale: [1, 2.38], opacity: [0.32, 0] }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: [0.22, 0.64, 0.36, 1],
                delay: i * 0.52,
              }}
            />
          ))
        : null}
      <motion.div
        className="relative z-10 flex items-center justify-center"
        style={{ scale: isRecordingMedia ? pulseSmooth : 1 }}
      >
        <motion.button
          type="button"
          onClick={() => void onClick()}
          disabled={voiceBusy && !recording}
          title={voiceLabel}
          aria-label={voiceLabel}
          aria-pressed={recording}
          whileHover={isRecordingMedia ? undefined : { scale: 1.04 }}
          whileTap={isRecordingMedia ? undefined : { scale: 0.93 }}
          transition={{ type: "spring", stiffness: 520, damping: 28 }}
          className={`pointer-events-auto relative isolate flex ${btn} shrink-0 items-center justify-center overflow-hidden rounded-full border-[1.5px] border-[#B9FF4B]/72 bg-[rgba(255,255,255,0.032)] shadow-[inset_0_3px_28px_rgba(255,255,255,0.52),inset_0_-20px_36px_rgba(255,255,255,0.06),inset_0_0_0_1px_rgba(255,255,255,0.14),0_14px_48px_rgba(7,9,7,0.13)] outline-none backdrop-blur-[42px] backdrop-saturate-[1.85] backdrop-brightness-[1.06] transition-[box-shadow,transform,filter,border-color] duration-300 hover:border-[#B9FF4B]/95 hover:shadow-[inset_0_3px_30px_rgba(255,255,255,0.6),inset_0_-14px_32px_rgba(185,255,75,0.05),0_18px_52px_rgba(46,90,67,0.18),0_0_36px_rgba(185,255,75,0.26)] disabled:pointer-events-none disabled:opacity-45 ${
            recording && isRecordingMedia
              ? "border-[#c9ff6b]/95 shadow-[inset_0_2px_22px_rgba(255,255,255,0.48),inset_0_-18px_34px_rgba(185,255,75,0.06),0_0_52px_rgba(185,255,75,0.52),0_16px_50px_rgba(46,90,67,0.15)]"
              : ""
          } ${recording && !isRecordingMedia ? "border-[#B9FF4B]/85 shadow-[inset_0_2px_18px_rgba(255,255,255,0.46),0_0_38px_rgba(185,255,75,0.36)]" : ""}`}
        >
          <span
            className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-br from-white/[0.34] via-white/[0.06] to-transparent"
            aria-hidden
          />
          <span
            className="pointer-events-none absolute inset-0 rounded-full bg-[linear-gradient(165deg,rgba(255,255,255,0.42)_0%,transparent_42%,rgba(255,255,255,0.08)_78%,rgba(255,255,255,0.02)_100%)] opacity-95"
            aria-hidden
          />
          <span
            className="pointer-events-none absolute inset-[4px] rounded-full border border-white/30 opacity-95 shadow-[inset_0_2px_14px_rgba(255,255,255,0.42),inset_0_-8px_18px_rgba(255,255,255,0.07)]"
            aria-hidden
          />
          <span
            className="pointer-events-none absolute -inset-10 rounded-full bg-[radial-gradient(circle_at_28%_14%,rgba(255,255,255,0.62),transparent_46%)] opacity-[0.78] mix-blend-overlay"
            aria-hidden
          />
          <motion.div
            className="relative z-[1] flex items-center justify-center"
            animate={micProcessingPulse ? { opacity: [1, 0.52, 1] } : { opacity: 1 }}
            transition={
              micProcessingPulse
                ? { duration: 0.82, repeat: Infinity, ease: "easeInOut" }
                : { duration: 0.2 }
            }
          >
            <Mic
              className={`relative z-[1] ${icon} shrink-0 drop-shadow-[0_1px_3px_rgba(7,9,7,0.22)]`}
              stroke="#152018"
              strokeWidth={2.45}
              aria-hidden
            />
          </motion.div>
        </motion.button>
      </motion.div>
    </div>
  );
}
