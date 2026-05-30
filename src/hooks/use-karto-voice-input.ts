"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMotionValue, useSpring } from "framer-motion";
import { createBrowserClient } from "@/lib/supabase/client";
import {
  DEFAULT_VOICE_BROWSER,
  MAX_VOICE_RECORD_MS,
  type SpeechRecognitionEventLike,
  type SpeechRecognitionLike,
  appendVoiceChunk,
  getSpeechRecognitionCtor,
  pickRecorderMime,
  sleep,
  typeAppendVoiceChunk,
} from "@/lib/voice/karto-voice-shared";

type UseKartoVoiceInputOptions = {
  value: string;
  onChange: (next: string) => void;
  isActive?: boolean;
  maxLength?: number;
};

export function useKartoVoiceInput({
  value,
  onChange,
  isActive = true,
  maxLength,
}: UseKartoVoiceInputOptions) {
  const valueRef = useRef(value);
  valueRef.current = value;

  const [preferBrowserSpeech, setPreferBrowserSpeech] = useState(DEFAULT_VOICE_BROWSER);
  const [isRecordingMedia, setIsRecordingMedia] = useState(false);
  const [isListeningBrowser, setIsListeningBrowser] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [voiceHint, setVoiceHint] = useState<string | null>(null);
  const [transcriptTypingVisual, setTranscriptTypingVisual] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaChunksRef = useRef<BlobPart[]>([]);
  const mediaMimeRef = useRef<string>("audio/webm");
  const streamRef = useRef<MediaStream | null>(null);
  const maxRecordTimerRef = useRef<number | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const browserBufferRef = useRef("");
  const transcriptTypingRunRef = useRef(0);
  const meterRafRef = useRef<number | null>(null);
  const audioMeterRef = useRef<{ ctx: AudioContext; analyser: AnalyserNode } | null>(null);
  const smoothedLevelRef = useRef(0);

  const pulseScale = useMotionValue(1);
  const pulseSmooth = useSpring(pulseScale, { stiffness: 540, damping: 36, mass: 0.48 });

  const applyChange = useCallback(
    (next: string) => {
      onChange(maxLength != null ? next.slice(0, maxLength) : next);
    },
    [maxLength, onChange]
  );

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
        const effectiveType =
          blob instanceof File && blob.type && blob.type.trim() !== "" ? blob.type : mime;
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
          await typeAppendVoiceChunk(snap, data.text, applyChange, transcriptTypingRunRef, runId, {
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
        setVoiceHint("Не удалось отправить запись. Проверьте интернет или наберите текст вручную.");
      } finally {
        setVoiceBusy(false);
      }
    },
    [applyChange]
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
        void typeAppendVoiceChunk(snap, text, applyChange, transcriptTypingRunRef, runId, {
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
  }, [applyChange, isListeningBrowser, requestBrowserRecognitionStop]);

  const onVoiceButtonClick = useCallback(async () => {
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
  }, [
    isRecordingMedia,
    preferBrowserSpeech,
    startMediaRecording,
    stopMediaRecording,
    toggleBrowserListening,
    voiceBusy,
  ]);

  const recording = isRecordingMedia || isListeningBrowser;
  const voiceLabel = preferBrowserSpeech
    ? isListeningBrowser
      ? "Остановить и вставить текст"
      : "Говорите — распознавание в браузере"
    : isRecordingMedia
      ? "Остановить запись"
      : "Голосовой ввод";

  return {
    voiceHint,
    voiceLabel,
    voiceBusy,
    recording,
    isRecordingMedia,
    transcriptTypingVisual,
    pulseSmooth,
    showRecordingWaves: recording && !voiceBusy,
    micProcessingPulse: voiceBusy && !recording,
    onVoiceButtonClick,
  };
}
