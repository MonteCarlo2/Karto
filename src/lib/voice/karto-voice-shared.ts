/** Минимальные типы для Web Speech API. */
export type SpeechRecognitionAlternativeLike = { readonly transcript: string };
export type SpeechRecognitionPhraseLike = {
  readonly length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
};
export type SpeechRecognitionResultListLike = {
  readonly length: number;
  [index: number]: SpeechRecognitionPhraseLike;
};
export type SpeechRecognitionEventLike = {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultListLike;
};
export type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
};

export const KARTO_VOICE_LIME = "#B9FF4B";
export const MAX_VOICE_RECORD_MS = 58_000;

export const DEFAULT_VOICE_BROWSER =
  typeof process.env.NEXT_PUBLIC_DEFAULT_VOICE_BROWSER === "string" &&
  ["1", "true", "yes"].includes(process.env.NEXT_PUBLIC_DEFAULT_VOICE_BROWSER.trim().toLowerCase());

export function pickRecorderMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  for (const m of candidates) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return undefined;
}

export function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function appendVoiceChunk(prev: string, chunk: string): string {
  const t = chunk.replace(/\s+/g, " ").trim();
  if (!t) return prev;
  const base = prev.trim();
  if (!base) return t;
  return `${base} ${t}`;
}

export function typingPauseMs(ch: string): number {
  if (/[.!?…]/.test(ch)) return 62 + Math.floor(Math.random() * 42);
  if (/[,;:—–\-]/.test(ch)) return 30 + Math.floor(Math.random() * 26);
  if (ch === " ") return 14 + Math.floor(Math.random() * 16);
  return 10 + Math.floor(Math.random() * 18);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function typeAppendVoiceChunk(
  prev: string,
  chunk: string,
  apply: (s: string) => void,
  runIdRef: { current: number },
  runId: number,
  hooks?: { onStart?: () => void; onEnd?: () => void }
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
