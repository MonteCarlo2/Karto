"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Loader2, Sparkles } from "lucide-react";
import { RainbowButton } from "@/components/ui/rainbow-button";

type Props = {
  niche: string;
  description: string;
  selectedName: string | null;
  onSelectedNameChange: (name: string | null) => void;
};

/** Тело запроса: hints до 600 символов на стороне API */
const MAX_HINTS_CLIENT = 600;

const LOADING_PHRASES = ["Придумываем…", "Думаем…"] as const;

/** Минимум времени «экрана генерации» при успешном ответе */
const MIN_SUCCESS_DISPLAY_MS = 4500;

const pillVariants = {
  hidden: {
    opacity: 0,
    y: 32,
    scale: 0.97,
    filter: "blur(16px)",
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    filter: "blur(0px)",
    transition: {
      duration: 1.08,
      ease: [0.2, 0.82, 0.28, 1] as const,
    },
  },
};

/** Лёгкий нейтральный фон во время генерации (без «зелёного салюта») */
function GeneratingBackdrop({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <motion.div
      className="pointer-events-none absolute inset-0 z-[1] bg-[radial-gradient(ellipse_95%_65%_at_50%_8%,rgba(255,255,255,0.75)_0%,transparent_58%),radial-gradient(ellipse_70%_55%_at_85%_90%,rgba(245,243,238,0.55)_0%,transparent_50%)]"
      initial={{ opacity: 0 }}
      animate={{ opacity: [0.35, 0.55, 0.4, 0.52, 0.38] }}
      transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut" }}
      aria-hidden
    />
  );
}

function GeneratingSkeletonPairs() {
  const rows = 8;
  return (
    <div className="mt-12 grid grid-cols-2 gap-x-6 gap-y-4 lg:gap-x-10 xl:gap-x-12">
      {Array.from({ length: rows * 2 }).map((_, i) => (
        <motion.div
          key={i}
          className="relative h-[3.15rem] overflow-hidden rounded-2xl border border-white/50 bg-white/40 shadow-inner sm:h-[3.55rem]"
          initial={{ opacity: 0.25 }}
          animate={{
            opacity: [0.3, 0.65, 0.36, 0.6, 0.34],
          }}
          transition={{
            duration: 2.2 + (i % 5) * 0.12,
            delay: (i % 14) * 0.06,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        >
          <motion.span
            className="pointer-events-none absolute inset-y-0 w-[42%] rounded-full bg-gradient-to-r from-transparent via-[#B9FF4B]/52 to-transparent blur-[0.5px]"
            initial={{ left: "-42%" }}
            animate={{ left: ["-42%", "105%"] }}
            transition={{
              duration: 2.8,
              repeat: Infinity,
              ease: "linear",
              delay: (i % 10) * 0.08,
            }}
          />
        </motion.div>
      ))}
    </div>
  );
}

export function BrandNameGeneration({
  niche,
  description,
  selectedName,
  onSelectedNameChange,
}: Props) {
  const [ru, setRu] = useState<string[]>([]);
  const [en, setEn] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [animCycle, setAnimCycle] = useState(0);
  const [nameHints, setNameHints] = useState("");
  const [loadingPhraseIdx, setLoadingPhraseIdx] = useState(0);
  const bootRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    onSelectedNameChange(null);
    const t0 = Date.now();
    const hintsTrim = nameHints.trim().slice(0, MAX_HINTS_CLIENT);
    try {
      const res = await fetch("/api/brand/generate-names", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          niche,
          description,
          ...(hintsTrim ? { hints: hintsTrim } : {}),
        }),
      });
      const data = (await res.json()) as { ru?: string[]; en?: string[]; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Не удалось сгенерировать");
        return;
      }
      const nextRu = Array.isArray(data.ru) ? data.ru : [];
      const nextEn = Array.isArray(data.en) ? data.en : [];

      const elapsed = Date.now() - t0;
      const remainder = Math.max(0, MIN_SUCCESS_DISPLAY_MS - elapsed);
      if (remainder > 0) await new Promise((resolve) => setTimeout(resolve, remainder));

      setRu(nextRu);
      setEn(nextEn);
      setAnimCycle((c) => c + 1);
    } catch {
      setError("Сеть недоступна. Попробуйте ещё раз.");
    } finally {
      setLoading(false);
    }
  }, [niche, description, nameHints, onSelectedNameChange]);

  useEffect(() => {
    if (bootRef.current) return;
    bootRef.current = true;
    void load();
  }, [load]);

  const hasResults = ru.length > 0 || en.length > 0;
  const rowCount = Math.max(ru.length, en.length);
  const pairs = useMemo(
    () =>
      Array.from({ length: rowCount }, (_, i) => ({
        ru: ru[i] ?? "",
        en: en[i] ?? "",
      })),
    [ru, en, rowCount]
  );

  const stagger = 0.14;

  const subline =
    loading && !hasResults
      ? "Генерируем варианты названия вашего магазина по нише и описанию…"
      : hasResults
        ? "Выберите одно имя — позже его можно изменить."
        : error
          ? ""
          : "";

  const showGeneratingUi = loading && !hasResults;

  useEffect(() => {
    if (!showGeneratingUi) return;
    const id = window.setInterval(() => {
      setLoadingPhraseIdx((i) => (i + 1) % LOADING_PHRASES.length);
    }, 2600);
    return () => window.clearInterval(id);
  }, [showGeneratingUi]);

  const renderNameCell = (label: string) => {
    if (!label) {
      return <div className="min-h-[3.4rem]" />;
    }
    const isSel = selectedName === label;
    return (
      <button
        type="button"
        onClick={() => onSelectedNameChange(label)}
        className={`group relative w-full overflow-hidden rounded-2xl border px-6 py-[1rem] text-left shadow-[0_14px_40px_-34px_rgba(7,9,7,0.45)] backdrop-blur-[2px] transition-[box-shadow,transform,border-color,background-color] duration-300 sm:px-7 sm:py-[1.2rem] ${
          isSel
            ? "border-[#2E5A43]/55 bg-white/95 shadow-[0_20px_50px_-32px_rgba(46,90,67,0.42)] ring-2 ring-[#B9FF4B]/85 ring-offset-2 ring-offset-[#F3F1EA]/90"
            : "border-white/80 bg-gradient-to-br from-white/92 via-[#faf9f5]/92 to-[#eceae3]/95 hover:-translate-y-0.5 hover:border-neutral-300/95 hover:bg-white hover:shadow-[0_18px_48px_-34px_rgba(7,9,7,0.38)]"
        }`}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-[#B9FF4B]/65 to-transparent opacity-75"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-2 right-5 h-1 w-14 rounded-full bg-gradient-to-r from-[#2E5A43]/10 to-transparent opacity-0 transition group-hover:opacity-100"
        />
        <span className={`relative z-[1] text-xl font-semibold tracking-[-0.04em] sm:text-2xl ${isSel ? "text-neutral-900" : "text-neutral-800"}`}>
          {label}
        </span>
      </button>
    );
  };

  return (
    <section
      className={`relative w-full max-w-none overflow-visible pb-6 ${showGeneratingUi ? "min-h-[min(78vh,960px)]" : ""}`}
    >
      <GeneratingBackdrop active={showGeneratingUi} />

      <div className="relative z-20">
        <h1 className="max-w-3xl text-4xl font-semibold tracking-[-0.06em] text-neutral-700 drop-shadow-[0_1px_0_rgba(255,255,255,0.55)] sm:text-5xl">
          Название для вашего бренда
        </h1>

        <div className="mt-5 min-h-[1.75rem]">
          {showGeneratingUi ? (
            <div className="space-y-2">
              <motion.p
                className="text-base font-medium text-neutral-600 sm:text-[1.05rem]"
                animate={{ opacity: [0.55, 1, 0.65, 1, 0.55] }}
                transition={{ duration: 3.8, repeat: Infinity, ease: "easeInOut" }}
              >
                {subline}
              </motion.p>
              <div className="flex items-center gap-2.5 text-xs font-semibold uppercase tracking-[0.2em] text-[#2E5A43]/85">
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                <motion.span
                  key={loadingPhraseIdx}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35 }}
                  className="tabular-nums"
                >
                  {LOADING_PHRASES[loadingPhraseIdx]}
                </motion.span>
              </div>
            </div>
          ) : (
            <p className="max-w-2xl text-base leading-7 text-neutral-500 sm:text-lg">{subline}</p>
          )}
        </div>

        {showGeneratingUi ? <GeneratingSkeletonPairs /> : null}

        {error ? (
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <p className="text-sm font-medium text-red-600/90">{error}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-full border border-neutral-300/80 bg-white/50 px-4 py-2 text-xs font-semibold text-neutral-700 backdrop-blur transition hover:bg-white/80"
            >
              Повторить
            </button>
          </div>
        ) : null}

        {hasResults ? (
          <div className="mt-10 flex w-full max-w-6xl flex-col gap-3 lg:flex-row lg:items-end lg:gap-5">
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className="w-full shrink-0 lg:w-auto lg:min-w-[240px] lg:max-w-sm xl:max-w-md"
            >
              <RainbowButton
                type="button"
                onClick={() => void load()}
                disabled={loading}
                className="h-auto w-full rounded-full border-0 px-8 py-[1.1rem] text-[0.68rem] font-bold uppercase tracking-[0.18em] shadow-none sm:px-10 sm:py-[1.35rem] sm:text-xs sm:tracking-[0.22em]"
              >
                <span className="relative z-10 inline-flex items-center justify-center gap-3 text-white">
                  {loading ? (
                    <Loader2 className="h-5 w-5 shrink-0 animate-spin" />
                  ) : (
                    <Sparkles className="h-5 w-5 shrink-0 opacity-90" />
                  )}
                  Придумать заново
                </span>
              </RainbowButton>
            </motion.div>
            <div className="flex min-h-[52px] min-w-0 flex-1 flex-col gap-1.5 pb-0.5">
              <label
                htmlFor="karto-name-gen-hints"
                className="text-[10px] font-semibold uppercase tracking-[0.22em] text-neutral-400"
              >
                Пожелания к генерации
              </label>
              <input
                id="karto-name-gen-hints"
                type="text"
                value={nameHints}
                maxLength={MAX_HINTS_CLIENT}
                onChange={(e) => setNameHints(e.target.value)}
                placeholder="Например: упоминание «роскошь», только русские имена, фамилия Иванова…"
                disabled={loading}
                className="w-full rounded-2xl border border-neutral-300/75 bg-white/55 px-4 py-3 text-sm text-neutral-800 shadow-inner outline-none backdrop-blur transition placeholder:text-neutral-400/85 focus:border-[#B9FF4B]/75 focus:bg-white/75 disabled:opacity-55 sm:text-[0.9375rem]"
              />
              <p className="text-[11px] font-medium leading-snug text-neutral-400">
                Учитывается при каждом нажатии «Придумать заново» (до {MAX_HINTS_CLIENT} символов).
              </p>
            </div>
          </div>
        ) : null}

        {hasResults ? (
          <div className="mt-14">
            <div className="mb-6 grid grid-cols-2 gap-x-6 lg:gap-x-10 xl:gap-x-12">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.24em] text-neutral-500">
                По-русски
              </h2>
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.24em] text-neutral-500">
                In English
              </h2>
            </div>
            <motion.div
              key={`grid-${animCycle}`}
              className="grid grid-cols-2 gap-x-6 gap-y-4 lg:gap-x-10 xl:gap-x-12 md:gap-y-[1.1rem]"
              initial="hidden"
              animate="visible"
              variants={{
                hidden: {},
                visible: {
                  transition: {
                    delayChildren: 0.22,
                    staggerChildren: stagger,
                  },
                },
              }}
            >
              {pairs.flatMap((pair, i) => [
                <motion.div key={`ru-${animCycle}-${i}`} variants={pillVariants}>
                  {renderNameCell(pair.ru)}
                </motion.div>,
                <motion.div key={`en-${animCycle}-${i}`} variants={pillVariants}>
                  {renderNameCell(pair.en)}
                </motion.div>,
              ])}
            </motion.div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
