"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useMotionValue, useSpring } from "framer-motion";
import { Mic } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase/client";

/** Минимальные типы для Web Speech API (в проекте может быть отключён DOM «SpeechRecognition» в TS). */
type SpeechRecognitionAlternativeLike = { readonly transcript: string };
type SpeechRecognitionPhraseLike = {
  readonly length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
};
type SpeechRecognitionResultListLike = {
  readonly length: number;
  [index: number]: SpeechRecognitionPhraseLike;
};
type SpeechRecognitionEventLike = {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultListLike;
};
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
};

/** Салатовый акцент Karto — микрофон */
const KARTO_LIME = "#B9FF4B";

/** Пауза после символа — заметный ритм «печати» */
function typingPauseMs(ch: string): number {
  if (/[.!?…]/.test(ch)) return 62 + Math.floor(Math.random() * 42);
  if (/[,;:—–\-]/.test(ch)) return 30 + Math.floor(Math.random() * 26);
  if (ch === " ") return 14 + Math.floor(Math.random() * 16);
  return 10 + Math.floor(Math.random() * 18);
}

type TranscriptTypingHooks = {
  onStart?: () => void;
  onEnd?: () => void;
};

/** Примеры для поля «Описание» — смена каждые ~5 с, пока поле пустое */
export const BRAND_DESCRIPTION_PLACEHOLDER_VARIANTS = [
  "Натуральная косметика для девушек 25–35. Хочется ощущение чистоты, заботы и спокойной премиальности…",
  "Инженерные решения для малого бизнеса: автоматизация отчётов, склады и маркетплейсы без хаоса в таблицах…",
  "Детская одежда из хлопка: ярко, удобно на каждый день и без лишнего «крича» в принтах…",
  "Кофейня с акцентом на спешелти и дружелюбный сервис — человек приходит за ритуалом, а не только за кофеином…",
  "Онлайн-курсы по дизайну: короткие модули, практика в домашках и разбор портфолио наставником…",
];

function pickRecorderMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  for (const m of candidates) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return undefined;
}

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function appendVoiceChunk(prev: string, chunk: string): string {
  const t = chunk.replace(/\s+/g, " ").trim();
  if (!t) return prev;
  const base = prev.trim();
  if (!base) return t;
  return `${base} ${t}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function typeAppendVoiceChunk(
  prev: string,
  chunk: string,
  apply: (s: string) => void,
  runIdRef: { current: number },
  runId: number,
  hooks?: TranscriptTypingHooks
): Promise<void> {
  const t = chunk.replace(/\s+/g, " ").trim();
  if (!t) return;
  hooks?.onStart?.();
  try {
    const base = prev.trim();
    const prefix = base ? `${base} ` : "";
    const full = appendVoiceChunk(prev, chunk);
    for (let i = 1; i <= t.length; i++) {
      if (runIdRef.current !== runId) {
        apply(full);
        return;
      }
      apply(prefix + t.slice(0, i));
      await sleep(typingPauseMs(t.charAt(i - 1)));
    }
    if (runIdRef.current !== runId) apply(full);
  } finally {
    hooks?.onEnd?.();
  }
}

/** Одна запись на сервер: у Salute синхронный лимит ~2 МБ; при 16 кГц mono WAV это ~60 с. */
const MAX_VOICE_RECORD_MS = 58_000;

type Props = {
  value: string;
  onChange: (next: string) => void;
  /** Сброс записи при уходе со страницы шага */
  isActive: boolean;
};

const DEFAULT_VOICE_BROWSER =
  typeof process.env.NEXT_PUBLIC_DEFAULT_VOICE_BROWSER === "string" &&
  ["1", "true", "yes"].includes(process.env.NEXT_PUBLIC_DEFAULT_VOICE_BROWSER.trim().toLowerCase());

export function BrandDescriptionInput({ value, onChange, isActive }: Props) {
  const valueRef = useRef(value);
  valueRef.current = value;

  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  /** Без облачных ключей STT (например РФ): NEXT_PUBLIC_DEFAULT_VOICE_BROWSER=1 → сразу Web Speech API */
  const [preferBrowserSpeech, setPreferBrowserSpeech] = useState(DEFAULT_VOICE_BROWSER);
  const [isRecordingMedia, setIsRecordingMedia] = useState(false);
  const [isListeningBrowser, setIsListeningBrowser] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [voiceHint, setVoiceHint] = useState<string | null>(null);
  /** Зеркальный слой текста + мигающий курсор во время набора транскрипта */
  const [transcriptTypingVisual, setTranscriptTypingVisual] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const transcriptMirrorRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaChunksRef = useRef<BlobPart[]>([]);
  const mediaMimeRef = useRef<string>("audio/webm");
  const streamRef = useRef<MediaStream | null>(null);
  const maxRecordTimerRef = useRef<number | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const browserBufferRef = useRef("");
  /** Инкремент отменяет предыдущий «набор» транскрипта при уходе со шага или новой вставке */
  const transcriptTypingRunRef = useRef(0);
  const meterRafRef = useRef<number | null>(null);
  const audioMeterRef = useRef<{ ctx: AudioContext; analyser: AnalyserNode } | null>(null);
  const smoothedLevelRef = useRef(0);

  const pulseScale = useMotionValue(1);
  const pulseSmooth = useSpring(pulseScale, { stiffness: 540, damping: 36, mass: 0.48 });

  const stopVoiceMeter = useCallback(() => {
    if (meterRafRef.current != null) {
      cancelAnimationFrame(meterRafRef.current);
      meterRafRef.current = null;
    }
    const m = audioMeterRef.current;
    audioMeterRef.current = null;
    if (m) {
      try {
        m.ctx.close();
      } catch {
        /* ignore */
      }
    }
    smoothedLevelRef.current = 0;
    pulseScale.set(1);
  }, [pulseScale]);

  const startVoiceMeter = useCallback(
    (stream: MediaStream) => {
      stopVoiceMeter();
      try {
        const WinAudio =
          window.AudioContext ||
          (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!WinAudio) return;
        const ctx = new WinAudio();
        void ctx.resume();
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.52;
        source.connect(analyser);
        audioMeterRef.current = { ctx, analyser };
        const buf = new Uint8Array(analyser.frequencyBinCount);
        const loop = () => {
          const meter = audioMeterRef.current;
          if (!meter) return;
          meter.analyser.getByteTimeDomainData(buf);
          let sum = 0;
          for (let i = 0; i < buf.length; i++) {
            const x = (buf[i]! - 128) / 128;
            sum += x * x;
          }
          const rms = Math.sqrt(sum / buf.length);
          const boosted = Math.min(1, rms * 7.5);
          smoothedLevelRef.current = smoothedLevelRef.current * 0.58 + boosted * 0.42;
          pulseScale.set(1 + smoothedLevelRef.current * 0.4);
          meterRafRef.current = requestAnimationFrame(loop);
        };
        meterRafRef.current = requestAnimationFrame(loop);
      } catch {
        pulseScale.set(1);
      }
    },
    [pulseScale, stopVoiceMeter]
  );

  const showPlaceholderOverlay = !value.trim();

  useEffect(() => {
    if (!isActive || !showPlaceholderOverlay) return;
    const id = window.setInterval(() => {
      setPlaceholderIdx((i) => (i + 1) % BRAND_DESCRIPTION_PLACEHOLDER_VARIANTS.length);
    }, 5000);
    return () => window.clearInterval(id);
  }, [isActive, showPlaceholderOverlay]);

  const cleanupStream = useCallback(() => {
    stopVoiceMeter();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, [stopVoiceMeter]);

  const stopMediaRecording = useCallback(() => {
    stopVoiceMeter();
    if (maxRecordTimerRef.current != null) {
      window.clearTimeout(maxRecordTimerRef.current);
      maxRecordTimerRef.current = null;
    }
    try {
      const rec = mediaRecorderRef.current;
      if (rec && rec.state === "recording") {
        try {
          rec.requestData?.();
        } catch {
          /* ignore */
        }
      }
      rec?.stop();
    } catch {
      cleanupStream();
    }
    mediaRecorderRef.current = null;
    setIsRecordingMedia(false);
  }, [cleanupStream, stopVoiceMeter]);

  const requestBrowserRecognitionStop = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!isActive) {
      stopMediaRecording();
      try {
        recognitionRef.current?.stop();
      } catch {
        /* ignore */
      }
      recognitionRef.current = null;
      setIsListeningBrowser(false);
      browserBufferRef.current = "";
      transcriptTypingRunRef.current += 1;
      setTranscriptTypingVisual(false);
      setVoiceHint(null);
    }
  }, [isActive, stopMediaRecording]);

  const sendRecordedAudio = useCallback(
    async (blob: Blob) => {
      setVoiceBusy(true);
      setVoiceHint(null);
      try {
        const supabase = createBrowserClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const bearer = session?.access_token;

        const mime = blob.type || "audio/webm";
        const ext = mime.includes("webm") ? "webm" : mime.includes("mp4") ? "m4a" : "webm";
        /** Всегда ASCII-имя файла: иначе multipart/заголовки на сервере дают TypeError ByteString при кириллице в name. */
        const effectiveType =
          blob instanceof File && blob.type && blob.type.trim() !== ""
            ? blob.type
            : mime;
        const typed = new File([blob], `karto-voice.${ext}`, { type: effectiveType });

        let res: Response | null = null;
        let data: { text?: string; error?: string; saluteNotConfigured?: boolean } = {};
        let fetchError: unknown = null;
        for (let attempt = 1; attempt <= 3; attempt += 1) {
          const fd = new FormData();
          fd.append("audio", typed);
          const headers: HeadersInit = {};
          if (bearer) headers.Authorization = `Bearer ${bearer}`;
          try {
            res = await fetch("/api/brand/transcribe", {
              method: "POST",
              headers,
              body: fd,
            });
            try {
              data = (await res.json()) as typeof data;
            } catch {
              data = {};
            }
            if (res.ok) break;
            if (attempt < 3 && (res.status >= 500 || res.status === 429)) {
              setVoiceHint("Пробуем ещё раз отправить запись...");
              await sleep(500 * attempt);
              continue;
            }
            break;
          } catch (e) {
            fetchError = e;
            if (attempt < 3) {
              setVoiceHint("Сеть нестабильна, повторяем отправку...");
              await sleep(500 * attempt);
              continue;
            }
          }
        }

        if (!res) {
          throw fetchError instanceof Error ? fetchError : new Error("Не удалось отправить запрос");
        }

        if (!res.ok) {
          if (data.saluteNotConfigured) setPreferBrowserSpeech(true);
          if (res.status === 413) {
            setVoiceHint(
              "Запись слишком большая для одной отправки. Остановите чуть раньше и попробуйте снова."
            );
          } else if (res.status === 401) {
            setVoiceHint("Сессия устарела. Обновите страницу или войдите снова.");
          } else {
            setVoiceHint(
              "Извините, голос не распознан — временная ошибка. Попробуйте ещё раз или наберите текст вручную."
            );
          }
          return;
        }

        if (typeof data.text === "string" && data.text.trim()) {
          transcriptTypingRunRef.current += 1;
          const runId = transcriptTypingRunRef.current;
          const snap = valueRef.current;
          await typeAppendVoiceChunk(snap, data.text, onChange, transcriptTypingRunRef, runId, {
            onStart: () => setTranscriptTypingVisual(true),
            onEnd: () => setTranscriptTypingVisual(false),
          });
          if (transcriptTypingRunRef.current === runId) setVoiceHint("Текст добавлен.");
          return;
        }

        setVoiceHint(
          "Извините, голос не распознан — временная ошибка. Попробуйте ещё раз или наберите текст вручную."
        );
      } catch {
        setVoiceHint(
          "Не удалось отправить запись. Проверьте интернет или наберите текст вручную."
        );
      } finally {
        setVoiceBusy(false);
      }
    },
    [onChange]
  );

  const startMediaRecording = useCallback(async () => {
    setVoiceHint(null);
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setVoiceHint("Браузер не даёт доступ к микрофону.");
      return;
    }

    const mime = pickRecorderMime();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;
    mediaChunksRef.current = [];
    mediaMimeRef.current = mime ?? "audio/webm";

    startVoiceMeter(stream);

    const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    mediaRecorderRef.current = rec;
    setVoiceHint("Слушаю… Нажмите ещё раз, чтобы остановить.");

    rec.ondataavailable = (e) => {
      if (e.data.size > 0) mediaChunksRef.current.push(e.data);
    };

    rec.onstop = () => {
      cleanupStream();
      const blob = new Blob(mediaChunksRef.current, { type: mediaMimeRef.current });
      mediaChunksRef.current = [];
      if (blob.size > 800) {
        setVoiceHint("Распознаю речь...");
        void sendRecordedAudio(blob);
      } else {
        setVoiceHint("Запись слишком короткая — задержите запись подольше.");
      }
    };

    rec.start(220);
    setIsRecordingMedia(true);

    maxRecordTimerRef.current = window.setTimeout(() => {
      setVoiceHint("Отправляю запись на распознавание…");
      stopMediaRecording();
    }, MAX_VOICE_RECORD_MS);
  }, [cleanupStream, sendRecordedAudio, startVoiceMeter, stopMediaRecording]);

  const toggleBrowserListening = useCallback(() => {
    setVoiceHint(null);
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setVoiceHint("В этом браузере нет встроенного распознавания речи (попробуйте Chrome или Edge).");
      return;
    }

    if (isListeningBrowser) {
      requestBrowserRecognitionStop();
      return;
    }

    browserBufferRef.current = "";
    const r = new Ctor();
    recognitionRef.current = r;
    r.lang = "ru-RU";
    r.continuous = true;
    r.interimResults = false;

    r.onresult = (event: SpeechRecognitionEventLike) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const phrase = event.results[i];
        const alt = phrase?.[0];
        if (alt?.transcript) browserBufferRef.current += alt.transcript;
      }
    };

    r.onerror = () => {
      setVoiceHint("Ошибка микрофона или распознавания. Проверьте разрешения.");
      recognitionRef.current = null;
      setIsListeningBrowser(false);
      browserBufferRef.current = "";
    };

    r.onend = () => {
      recognitionRef.current = null;
      setIsListeningBrowser(false);
      const text = browserBufferRef.current.trim();
      browserBufferRef.current = "";
      if (text) {
        transcriptTypingRunRef.current += 1;
        const runId = transcriptTypingRunRef.current;
        const snap = valueRef.current;
        void typeAppendVoiceChunk(snap, text, onChange, transcriptTypingRunRef, runId, {
          onStart: () => setTranscriptTypingVisual(true),
          onEnd: () => setTranscriptTypingVisual(false),
        }).then(() => {
          if (transcriptTypingRunRef.current === runId) setVoiceHint("Текст добавлен.");
        });
      } else {
        setVoiceHint("Речь не распознана. Скажите чуть громче и ближе к микрофону.");
      }
    };

    try {
      r.start();
      setIsListeningBrowser(true);
    } catch {
      setVoiceHint("Не удалось запустить распознавание.");
    }
  }, [isListeningBrowser, onChange, requestBrowserRecognitionStop]);

  const onVoiceButtonClick = async () => {
    if (voiceBusy) return;

    if (preferBrowserSpeech) {
      toggleBrowserListening();
      return;
    }

    if (isRecordingMedia) {
      stopMediaRecording();
      return;
    }

    try {
      await startMediaRecording();
    } catch {
      setVoiceHint("Не удалось начать запись. Разрешите доступ к микрофону и попробуйте снова.");
    }
  };

  const recording = isRecordingMedia || isListeningBrowser;
  const voiceLabel = preferBrowserSpeech
    ? isListeningBrowser
      ? "Остановить и вставить текст"
      : "Говорите — распознавание в браузере"
    : isRecordingMedia
      ? "Остановить запись"
      : "Голосовой ввод";

  const showRecordingWaves = recording && !voiceBusy;
  const micProcessingPulse = voiceBusy && !recording;

  return (
    <div className="w-full max-w-4xl">
      <div className="relative w-full overflow-visible">
        <div className="relative w-full">
          {transcriptTypingVisual ? (
            <div
              ref={transcriptMirrorRef}
              className="pointer-events-none absolute inset-0 z-[11] overflow-y-auto overflow-x-hidden rounded-[2rem] px-6 py-5 pb-[4.25rem] pr-[5.5rem] whitespace-pre-wrap break-words text-3xl leading-snug tracking-[-0.045em] text-[#070907] [scrollbar-width:none] md:text-4xl [&::-webkit-scrollbar]:hidden"
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
            onChange={(e) => onChange(e.target.value)}
            placeholder=""
            aria-label="Описание бренда"
            onScroll={(e) => {
              const el = e.currentTarget;
              const mirror = transcriptMirrorRef.current;
              if (mirror) mirror.scrollTop = el.scrollTop;
            }}
            className={`relative z-10 min-h-[18.5rem] w-full resize-none rounded-[2rem] border border-white/60 bg-white/28 px-6 py-5 pb-[4.25rem] pr-[5.5rem] text-3xl leading-snug tracking-[-0.045em] outline-none placeholder:text-transparent focus:border-[#B9FF4B]/80 focus:bg-white/38 md:min-h-[20rem] md:text-4xl ${
              transcriptTypingVisual
                ? "text-transparent caret-transparent selection:bg-transparent"
                : "text-[#070907]"
            }`}
          />
        </div>

        {showPlaceholderOverlay && (
          <div
            className="pointer-events-none absolute left-6 top-5 z-[1] max-h-[min(14rem,calc(100%-5rem))] overflow-hidden pr-[5rem] md:max-h-[min(15.5rem,calc(100%-5rem))]"
            aria-hidden
          >
            <AnimatePresence mode="wait">
              <motion.p
                key={placeholderIdx}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
                className="text-3xl leading-snug tracking-[-0.045em] text-neutral-300 md:text-4xl"
              >
                {BRAND_DESCRIPTION_PLACEHOLDER_VARIANTS[placeholderIdx]}
              </motion.p>
            </AnimatePresence>
          </div>
        )}

        <div className="pointer-events-none absolute bottom-3 right-3 z-20 flex h-[5.75rem] w-[5.75rem] items-center justify-center overflow-visible">
          {showRecordingWaves
            ? [0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    className="pointer-events-none absolute left-1/2 top-1/2 size-[3.65rem] -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px]"
                    style={{ borderColor: `${KARTO_LIME}40` }}
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
                onClick={() => void onVoiceButtonClick()}
                disabled={voiceBusy && !recording}
                title={voiceLabel}
                aria-label={voiceLabel}
                aria-pressed={recording}
                whileHover={isRecordingMedia ? undefined : { scale: 1.04 }}
                whileTap={isRecordingMedia ? undefined : { scale: 0.93 }}
                transition={{ type: "spring", stiffness: 520, damping: 28 }}
                className={`pointer-events-auto relative isolate flex h-[3.65rem] w-[3.65rem] shrink-0 items-center justify-center overflow-hidden rounded-full border-[1.5px] border-[#B9FF4B]/72 bg-[rgba(255,255,255,0.032)] shadow-[inset_0_3px_28px_rgba(255,255,255,0.52),inset_0_-20px_36px_rgba(255,255,255,0.06),inset_0_0_0_1px_rgba(255,255,255,0.14),0_14px_48px_rgba(7,9,7,0.13)] outline-none backdrop-blur-[42px] backdrop-saturate-[1.85] backdrop-brightness-[1.06] transition-[box-shadow,transform,filter,border-color] duration-300 hover:border-[#B9FF4B]/95 hover:shadow-[inset_0_3px_30px_rgba(255,255,255,0.6),inset_0_-14px_32px_rgba(185,255,75,0.05),0_18px_52px_rgba(46,90,67,0.18),0_0_36px_rgba(185,255,75,0.26)] disabled:pointer-events-none disabled:opacity-45 ${
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
                    className="relative z-[1] size-[1.78rem] shrink-0 drop-shadow-[0_1px_3px_rgba(7,9,7,0.22)]"
                    stroke="#152018"
                    strokeWidth={2.45}
                    aria-hidden
                  />
                </motion.div>
              </motion.button>
            </motion.div>
        </div>
      </div>

      <div className="mt-2 min-h-[1.375rem]">
        {voiceHint ? (
          <p className="max-w-4xl text-sm font-medium text-neutral-600">{voiceHint}</p>
        ) : null}
      </div>
    </div>
  );
}
