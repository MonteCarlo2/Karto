"use client";

import { useRef, type CSSProperties } from "react";
import { motion } from "framer-motion";
import { useKartoVoiceInput } from "@/hooks/use-karto-voice-input";
import { KartoVoiceMicButton } from "@/components/shared/karto-voice-mic-button";

type KartoVoiceTextareaProps = {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  ariaLabel: string;
  maxLength?: number;
  isActive?: boolean;
  minHeightClass?: string;
  textareaClassName?: string;
  textareaStyle?: CSSProperties;
  hintClassName?: string;
  hintStyle?: CSSProperties;
  micSize?: "md" | "lg";
};

export function KartoVoiceTextarea({
  value,
  onChange,
  placeholder,
  ariaLabel,
  maxLength,
  isActive = true,
  minHeightClass = "min-h-[240px]",
  textareaClassName = "",
  textareaStyle,
  hintClassName = "text-sm font-medium text-neutral-600",
  hintStyle,
  micSize = "lg",
}: KartoVoiceTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);

  const voice = useKartoVoiceInput({ value, onChange, isActive, maxLength });

  const padRight = micSize === "lg" ? "pr-[5.5rem] pb-[4.25rem]" : "pr-[4.75rem] pb-[3.75rem]";

  return (
    <div className="w-full">
      <div className="relative w-full overflow-visible">
        <div className="relative w-full">
          {voice.transcriptTypingVisual ? (
            <div
              ref={mirrorRef}
              className={`pointer-events-none absolute inset-0 z-[11] overflow-y-auto overflow-x-hidden rounded-[1.05rem] border border-transparent px-5 py-5 whitespace-pre-wrap break-words text-[16px] leading-[1.8] text-[#070907] [scrollbar-width:none] sm:text-[17px] ${padRight} [&::-webkit-scrollbar]:hidden ${minHeightClass} ${textareaClassName}`}
              aria-hidden
            >
              {value}
              <motion.span
                aria-hidden
                className="ml-[2px] inline-block w-[3px] rounded-[1px] bg-[#B9FF4B] align-text-bottom shadow-[0_0_16px_rgba(185,255,75,0.75)]"
                style={{ height: "1.05em", verticalAlign: "text-bottom" }}
                animate={{ opacity: [1, 0.22, 1] }}
                transition={{ duration: 0.78, repeat: Infinity, ease: "easeInOut" }}
              />
            </div>
          ) : null}
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(maxLength != null ? e.target.value.slice(0, maxLength) : e.target.value)}
            placeholder={placeholder}
            aria-label={ariaLabel}
            onScroll={(e) => {
              const el = e.currentTarget;
              const mirror = mirrorRef.current;
              if (mirror) mirror.scrollTop = el.scrollTop;
            }}
            className={`relative z-10 w-full resize-y rounded-[1.05rem] border px-5 py-5 text-[16px] leading-[1.8] outline-none transition focus:ring-2 focus:ring-[rgba(46,90,67,0.18)] sm:text-[17px] ${padRight} ${minHeightClass} ${
              voice.transcriptTypingVisual
                ? "text-transparent caret-transparent selection:bg-transparent"
                : ""
            } ${textareaClassName}`}
            style={textareaStyle}
          />
        </div>

        <KartoVoiceMicButton
          size={micSize}
          voiceLabel={voice.voiceLabel}
          voiceBusy={voice.voiceBusy}
          recording={voice.recording}
          isRecordingMedia={voice.isRecordingMedia}
          showRecordingWaves={voice.showRecordingWaves}
          micProcessingPulse={voice.micProcessingPulse}
          pulseSmooth={voice.pulseSmooth}
          onClick={() => void voice.onVoiceButtonClick()}
        />
      </div>

      <div className="mt-2 min-h-[1.375rem]">
        {voice.voiceHint ? (
          <p className={hintClassName} style={hintStyle}>
            {voice.voiceHint}
          </p>
        ) : null}
      </div>
    </div>
  );
}
