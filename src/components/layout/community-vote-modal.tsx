"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  CheckCircle2,
  Vote,
  Sparkles,
  Zap,
  ThumbsUp,
  Star,
  CircleSlash,
  PencilLine,
} from "lucide-react";
import Image from "next/image";
import { createBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  COMMUNITY_SURVEY_FEATURE_OPTIONS,
  COMMUNITY_SURVEY_PROBLEM_OPTIONS,
  COMMUNITY_SURVEY_VERSION,
  DEFAULT_FEATURE_ORDER,
  rankFeatureIdsFromSwipeVotes,
  type FeatureSwipeVote,
} from "@/lib/community-survey/options";

type Step = 1 | 2 | "thanks" | "done";
type CardPhase = "intro" | "cards" | "summary";

function swipeVoteLabel(v: FeatureSwipeVote | undefined): string {
  if (v === "very") return "Очень нужно!";
  if (v === "need") return "Нужно!";
  return "Пока не актуально";
}

function swipeVoteSummaryClass(v: FeatureSwipeVote | undefined): string {
  if (v === "very") return "text-[#143028]";
  if (v === "need") return "text-[#234d3a]";
  return "text-[#0a0a0a]/72";
}

const VOTE_REWARD_COPY =
  "За участие мы начислим вам 3 бесплатные генерации в свободном творчестве — сразу после успешного сохранения голоса.";

const VOTE_REWARD_COPY_THANKS =
  "Мы уже начислили вам 3 бесплатные генерации в свободном творчестве — удачных идей и сильных карточек!";

const listVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.04, delayChildren: 0.04 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 8 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, damping: 26, stiffness: 340 },
  },
};

const playfair = { fontFamily: "var(--font-playfair), Georgia, serif" } as const;

const kickerClass =
  "text-[12px] font-bold uppercase tracking-[0.2em] text-[#0a0a0a]/42";

type VoteIntroCta = "start" | "login";

/** Общее превью голосования: для гостей — только ознакомление + вход; для авторизованных — «Начать». */
function VoteIntroPanel({
  cta,
  onStart,
  onOpenChange,
}: {
  cta: VoteIntroCta;
  onStart?: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
      className="space-y-5"
    >
      <div className="rounded-2xl border border-[#84CC16]/40 bg-gradient-to-br from-[#e8f5e0] via-[#ECF7DB] to-[#d8ead4] px-4 py-3.5 shadow-[0_12px_40px_-20px_rgba(46,90,67,0.35)] sm:px-5 sm:py-4">
        <p className="flex items-start gap-2 text-[14px] font-bold leading-snug text-[#1a3c2f] sm:text-[15px]">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[#84CC16]" aria-hidden />
          {VOTE_REWARD_COPY}
        </p>
      </div>
      {cta === "login" ? (
        <p className="text-center text-[14px] font-semibold text-[#2E5A43]">
          Голосовать могут только авторизованные пользователи — один голос на аккаунт.
        </p>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2 md:gap-5">
        <div className="rounded-2xl border border-[#2E5A43]/18 bg-gradient-to-br from-[#e2f0dc] via-[#ECF7DB] to-[#ddebd7] p-5 shadow-[0_18px_48px_-26px_rgba(46,90,67,0.4)] sm:p-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#2E5A43]">Смысл голосования</p>
          <p className="mt-3 text-[15px] font-semibold leading-relaxed text-[#0a0a0a]/72 sm:text-[16px]">
            Мы не просим заполнять анкету: вы по очереди смотрите идеи и отмечаете, насколько каждая важна{" "}
            <span className="font-bold text-[#0a0a0a]">именно для вас</span>. Так мы честно расставим приоритеты в разработке.
          </p>
        </div>
        <div className="rounded-2xl border border-[#2E5A43]/14 bg-gradient-to-br from-[#e4ebe6] via-[#dce6df] to-[#d2ddd4] p-5 shadow-[0_18px_48px_-28px_rgba(10,10,10,0.12)] sm:p-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#2E5A43]">Три варианта ответа</p>
          <p className="mt-2 text-[13px] font-semibold text-[#0a0a0a]/55">На каждой карточке — один клик по смыслу:</p>
          <ul className="mt-4 space-y-3.5 text-[15px] font-semibold leading-snug text-[#0a0a0a]/68">
            <li className="flex gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#2E5A43] text-[11px] font-bold text-white shadow-md shadow-[#2E5A43]/35">
                A
              </span>
              <span>
                <strong className="text-[#0a0a0a]">Очень нужно!</strong> — в топе запроса, в продукте как можно раньше.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-[3px] border-[#2E5A43] bg-[#f4faf4] text-[11px] font-bold text-[#2E5A43] shadow-sm">
                B
              </span>
              <span>
                <strong className="text-[#0a0a0a]">Нужно!</strong> — важно, но не обязательно первым релизом.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-[#2E5A43]/45 bg-[#eef4ef] text-[11px] font-bold text-[#2E5A43] shadow-sm">
                C
              </span>
              <span>
                <strong className="text-[#0a0a0a]">Пока не актуально</strong> — сейчас не приоритет; голос всё равно учитывается.
              </span>
            </li>
          </ul>
        </div>
      </div>
      <div className="rounded-2xl border border-[#84CC16]/35 bg-[#ECF7DB]/55 px-4 py-3.5 text-center shadow-sm ring-1 ring-[#2E5A43]/10">
        <p className="flex items-center justify-center gap-2 text-[13px] font-bold text-[#2E5A43]/95">
          <Sparkles className="h-4 w-4 shrink-0 text-[#84CC16]" aria-hidden />
          Ориентир: около минуты на все карточки
        </p>
      </div>
      {cta === "start" ? (
        <Button
          type="button"
          className="group h-[3.5rem] w-full rounded-full border border-[#1f3d30]/40 bg-gradient-to-b from-[#3a6b52] via-[#2E5A43] to-[#234536] text-[16px] font-bold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_14px_40px_-12px_rgba(46,90,67,0.55)] transition-all duration-300 ease-out hover:brightness-[1.05] active:scale-[0.99] active:brightness-[0.97]"
          onClick={onStart}
        >
          Начать голосование
        </Button>
      ) : (
        <Button
          asChild
          className="h-[3.5rem] w-full rounded-full bg-[#2E5A43] text-[16px] font-bold shadow-[0_10px_32px_-8px_rgba(46,90,67,0.45)] hover:bg-[#234d3a]"
        >
          <a href="/login" onClick={() => onOpenChange(false)}>
            ВОЙТИ / РЕГИСТРАЦИЯ
          </a>
        </Button>
      )}
    </motion.div>
  );
}

/** Фон модалки: спокойный тон KARTO без «инфографичной» сетки — лёгкий градиент и блики. */
function VoteModalAtmosphere() {
  return (
    <>
      <div
        className="pointer-events-none absolute inset-0 z-0 bg-gradient-to-b from-[#eef4ec] via-[#f3f7f1] to-[#e8f0e6]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -left-32 top-0 z-0 h-80 w-80 rounded-full bg-[#84CC16]/14 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-24 bottom-0 z-0 h-72 w-72 rounded-full bg-[#2E5A43]/10 blur-3xl"
        aria-hidden
      />
    </>
  );
}

function FeatureCardMedia({
  imageSrc,
  imageAlt,
  imageSrc2,
  imageAlt2,
  priority,
  compactSingle,
}: {
  imageSrc: string;
  imageAlt: string;
  imageSrc2?: string;
  imageAlt2?: string;
  priority?: boolean;
  /** Укороченный блок фото, чтобы карточка помещалась без внутреннего скролла. */
  compactSingle?: boolean;
}) {
  const [failed1, setFailed1] = React.useState(false);
  const [failed2, setFailed2] = React.useState(false);

  const singleShell =
    "overflow-hidden rounded-2xl shadow-[0_14px_44px_-24px_rgba(46,90,67,0.35)] ring-1 ring-[#2E5A43]/15";

  if (!imageSrc2) {
    if (failed1) {
      return (
        <div
          className={cn(
            "w-full rounded-2xl bg-[#dce8df]/80",
            compactSingle ? "h-[min(30vh,268px)] sm:h-[min(32vh,300px)]" : "aspect-[16/11] sm:aspect-[16/9]"
          )}
        />
      );
    }
    if (compactSingle) {
      /* Нативный img + фиксированная min-height: без скачка вёрстки при смене карточки. */
      return (
        <div className="flex min-h-[min(30vh,268px)] w-full items-center justify-center overflow-hidden rounded-2xl sm:min-h-[min(32vh,300px)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageSrc}
            alt={imageAlt}
            className="max-h-[min(30vh,268px)] w-full rounded-2xl object-contain object-center sm:max-h-[min(32vh,300px)]"
            loading={priority ? "eager" : "lazy"}
            decoding="async"
            onError={() => setFailed1(true)}
          />
        </div>
      );
    }
    return (
      <div className={cn("relative aspect-[16/11] w-full sm:aspect-[16/9]", singleShell)}>
        <Image
          src={imageSrc}
          alt={imageAlt}
          fill
          className="rounded-2xl object-cover [clip-path:inset(0_round_1rem)]"
          sizes="(max-width: 640px) 96vw, (max-width: 1024px) 640px, 720px"
          priority={priority}
          onError={() => setFailed1(true)}
        />
      </div>
    );
  }

  if (failed1 && failed2) {
    return <div className="flex min-h-[200px] w-full flex-col gap-2.5 rounded-2xl bg-neutral-200/80" />;
  }

  const tile =
    "relative aspect-[16/10] w-full overflow-hidden rounded-2xl bg-[#e5ebe7] shadow-[0_14px_40px_-24px_rgba(46,90,67,0.2)] ring-1 ring-[#2E5A43]/10";

  return (
    <div className="flex w-full flex-col gap-3">
      <div className={tile}>
        {!failed1 ? (
          <Image
            src={imageSrc}
            alt={imageAlt}
            fill
            className="rounded-2xl object-cover [clip-path:inset(0_round_1rem)]"
            sizes="(max-width: 640px) 96vw, 720px"
            priority={priority}
            onError={() => setFailed1(true)}
          />
        ) : (
          <div className="absolute inset-0 bg-neutral-200/80" />
        )}
      </div>
      <div className={tile}>
        {!failed2 ? (
          <Image
            src={imageSrc2}
            alt={imageAlt2 ?? ""}
            fill
            className="rounded-2xl object-cover [clip-path:inset(0_round_1rem)]"
            sizes="(max-width: 640px) 96vw, 720px"
            onError={() => setFailed2(true)}
          />
        ) : (
          <div className="absolute inset-0 bg-neutral-200/80" />
        )}
      </div>
    </div>
  );
}

export function CommunityVoteModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [step, setStep] = React.useState<Step>(1);
  const [cardPhase, setCardPhase] = React.useState<CardPhase>("intro");
  const [cardIndex, setCardIndex] = React.useState(0);
  const [editingFromSummary, setEditingFromSummary] = React.useState(false);
  const [swipeVotes, setSwipeVotes] = React.useState<Partial<Record<string, FeatureSwipeVote>>>({});
  const [userId, setUserId] = React.useState<string | null>(null);
  const [authChecked, setAuthChecked] = React.useState(false);
  const [alreadySubmitted, setAlreadySubmitted] = React.useState(false);
  const [featureOrder, setFeatureOrder] = React.useState<string[]>(() => [...DEFAULT_FEATURE_ORDER]);
  const [problems, setProblems] = React.useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  /** Пока false — не показываем превью/шаги (убирает мигание для уже проголосовавших). */
  const [bootstrapDone, setBootstrapDone] = React.useState(false);

  const resetLocal = React.useCallback(() => {
    setStep(1);
    setCardPhase("intro");
    setCardIndex(0);
    setEditingFromSummary(false);
    setSwipeVotes({});
    setFeatureOrder([...DEFAULT_FEATURE_ORDER]);
    setProblems(new Set());
    setError(null);
    setSubmitting(false);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setBootstrapDone(false);
    (async () => {
      try {
        const supabase = createBrowserClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (cancelled) return;
        setUserId(session?.user?.id ?? null);
        setAuthChecked(true);
        if (!session?.access_token) {
          resetLocal();
          if (!cancelled) setBootstrapDone(true);
          return;
        }
        const res = await fetch("/api/community-survey", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          resetLocal();
          setAlreadySubmitted(false);
          setBootstrapDone(true);
          return;
        }
        if (data.submitted && Array.isArray(data.featureOptionIds) && Array.isArray(data.problemOptionIds)) {
          setAlreadySubmitted(true);
          if (data.featureOptionIds.length === DEFAULT_FEATURE_ORDER.length) {
            setFeatureOrder([...data.featureOptionIds]);
          }
          setProblems(new Set(data.problemOptionIds));
          setStep("done");
        } else {
          resetLocal();
          setAlreadySubmitted(false);
        }
        setBootstrapDone(true);
      } catch {
        if (!cancelled) {
          setAuthChecked(true);
          resetLocal();
          setAlreadySubmitted(false);
          setBootstrapDone(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, resetLocal]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  React.useEffect(() => {
    if (!open) return;
    const html = document.documentElement;
    const body = document.body;
    const prevHtml = html.style.overflow;
    const prevBody = body.style.overflow;
    const prevTouch = body.style.touchAction;
    const prevOverscroll = body.style.overscrollBehavior;
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    body.style.touchAction = "none";
    body.style.overscrollBehavior = "none";
    return () => {
      html.style.overflow = prevHtml;
      body.style.overflow = prevBody;
      body.style.touchAction = prevTouch;
      body.style.overscrollBehavior = prevOverscroll;
    };
  }, [open]);

  const currentOption = COMMUNITY_SURVEY_FEATURE_OPTIONS[cardIndex];
  const totalCards = COMMUNITY_SURVEY_FEATURE_OPTIONS.length;
  const avoidInnerScrollVoteCard =
    Boolean(userId) &&
    step === 1 &&
    cardPhase === "cards" &&
    currentOption != null &&
    !currentOption.imageSrc2;

  const allFeatureVotesComplete = COMMUNITY_SURVEY_FEATURE_OPTIONS.every((o) => swipeVotes[o.id] != null);

  const recordVote = (level: FeatureSwipeVote) => {
    if (!currentOption) return;
    const id = currentOption.id;
    const nextVotes = { ...swipeVotes, [id]: level };
    setSwipeVotes(nextVotes);
    const ranked = rankFeatureIdsFromSwipeVotes(nextVotes);
    if (editingFromSummary) {
      setFeatureOrder(ranked);
      setEditingFromSummary(false);
      setCardPhase("summary");
      return;
    }
    if (cardIndex < totalCards - 1) {
      setCardIndex((i) => i + 1);
    } else {
      setFeatureOrder(ranked);
      setCardPhase("summary");
    }
  };

  const toggleProblem = (id: string) => {
    setProblems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const canSubmit = problems.size > 0;

  const handleSubmit = async () => {
    setError(null);
    try {
      if (!allFeatureVotesComplete) {
        setError("Сначала отметьте все 7 функций на карточках.");
        return;
      }
      const featureSwipeVotes = COMMUNITY_SURVEY_FEATURE_OPTIONS.reduce(
        (acc, o) => {
          const v = swipeVotes[o.id];
          if (v) acc[o.id] = v;
          return acc;
        },
        {} as Record<string, FeatureSwipeVote>
      );
      if (Object.keys(featureSwipeVotes).length !== COMMUNITY_SURVEY_FEATURE_OPTIONS.length) {
        setError("Не хватает ответов по функциям — вернитесь к итогам.");
        return;
      }
      const supabase = createBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError("Войдите в аккаунт, чтобы отправить голос.");
        return;
      }
      setSubmitting(true);
      const res = await fetch("/api/community-survey", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          featureOptionIds: featureOrder,
          featureSwipeVotes,
          problemOptionIds: [...problems],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Не удалось отправить. Попробуйте позже.");
        setSubmitting(false);
        return;
      }
      setAlreadySubmitted(true);
      setStep("thanks");
    } catch {
      setError("Сеть недоступна или сервер не ответил.");
    } finally {
      setSubmitting(false);
    }
  };

  React.useEffect(() => {
    if (!open || step !== "thanks") return;
    let cancelled = false;
    void import("canvas-confetti").then(({ default: confetti }) => {
      if (cancelled) return;
      const colors = ["#2E5A43", "#3d6b52", "#84CC16", "#b8e86a", "#ECF7DB", "#f6faf4", "#1a3c2f", "#ffffff"];
      const burst = (opts: NonNullable<Parameters<typeof confetti>[0]>) => {
        if (cancelled) return;
        void confetti({
          ...opts,
          colors: opts.colors ?? colors,
          disableForReducedMotion: true,
        });
      };
      burst({
        particleCount: 130,
        spread: 86,
        startVelocity: 40,
        ticks: 320,
        gravity: 1.02,
        scalar: 1.05,
        origin: { x: 0.5, y: 0.64 },
      });
      window.setTimeout(() => {
        burst({
          particleCount: 75,
          angle: 58,
          spread: 52,
          startVelocity: 52,
          origin: { x: 0.02, y: 0.74 },
        });
        burst({
          particleCount: 75,
          angle: 122,
          spread: 52,
          startVelocity: 52,
          origin: { x: 0.98, y: 0.74 },
        });
      }, 160);
      window.setTimeout(() => {
        burst({
          particleCount: 95,
          spread: 360,
          startVelocity: 26,
          ticks: 260,
          scalar: 0.92,
          origin: { x: 0.5, y: 0.38 },
        });
      }, 400);
      window.setTimeout(() => {
        burst({ particleCount: 40, angle: 65, spread: 58, origin: { x: 0.18, y: 0.76 } });
        burst({ particleCount: 40, angle: 115, spread: 58, origin: { x: 0.82, y: 0.76 } });
      }, 620);
    });
    return () => {
      cancelled = true;
    };
  }, [open, step]);

  const summaryTitleId = "community-vote-summary-title";
  const thanksTitleId = "community-vote-thanks-title";

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center overscroll-none p-3 sm:p-5 md:p-8"
        role="dialog"
        aria-modal="true"
        aria-labelledby={
          step === "thanks"
            ? thanksTitleId
            : !bootstrapDone
              ? "community-vote-loading-title"
              : step === 2
                ? "community-vote-step2-title"
                : step === 1 && cardPhase === "summary"
                  ? summaryTitleId
                  : "community-vote-title"
        }
      >
        <button
          type="button"
          className="absolute inset-0 touch-none bg-[#0a0a0a]/55 backdrop-blur-[6px]"
          aria-label="Закрыть"
          onClick={() => onOpenChange(false)}
        />
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.98 }}
          transition={{ type: "spring", damping: 36, stiffness: 300 }}
          className="relative z-10 flex max-h-[min(98dvh,960px)] w-full max-w-[min(96vw,36rem)] touch-auto flex-col overflow-hidden rounded-[1.85rem] border border-[#2E5A43]/18 bg-[#eef4ec] shadow-[0_36px_120px_-32px_rgba(10,10,10,0.28)] ring-1 ring-[#ECF7DB]/40 sm:max-w-[min(94vw,40rem)] md:max-w-[min(90vw,42rem)]"
        >
          <VoteModalAtmosphere />
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="absolute right-3 top-3 z-30 rounded-full border border-[#2E5A43]/20 bg-[#ECF7DB]/85 p-2.5 text-[#2E5A43]/70 shadow-md shadow-[#2E5A43]/10 backdrop-blur-sm transition hover:border-[#2E5A43]/35 hover:bg-[#ECF7DB] hover:text-[#2E5A43] sm:right-4 sm:top-4"
            aria-label="Закрыть"
          >
            <X className="h-5 w-5" strokeWidth={1.75} />
          </button>

          {step === "thanks" ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: "spring", damping: 28, stiffness: 320 }}
              className="relative z-10 flex min-h-[min(72dvh,520px)] flex-1 flex-col items-center justify-center px-6 py-12 text-center sm:px-12 sm:py-14"
            >
              <h2
                id={thanksTitleId}
                style={playfair}
                className="w-full bg-gradient-to-br from-[#1a3c2f] via-[#2E5A43] to-[#5a8f6f] bg-clip-text text-center text-[2.75rem] font-extrabold leading-[1.02] tracking-[-0.035em] text-transparent sm:text-[3.35rem] md:text-[3.65rem]"
              >
                Спасибо!
              </h2>
              <p className="mt-3 text-[15px] font-bold uppercase tracking-[0.18em] text-[#84CC16]/90">За отзывчивость</p>
              <p className="mt-8 max-w-[26rem] text-[16px] font-semibold leading-relaxed text-[#0a0a0a]/72 sm:text-[17px]">
                Спасибо, что поделились мнением — так мы понимаем, что для вас важно в первую очередь. Будем развивать KARTO с опорой на ваши голоса:{" "}
                <span className="font-bold text-[#2E5A43]">наши пользователи — главные соавторы платформы.</span>
              </p>
              <p className="mt-5 max-w-[26rem] text-[15px] font-bold leading-relaxed text-[#1a3c2f] sm:text-[16px]">{VOTE_REWARD_COPY_THANKS}</p>
              <p className="mt-4 max-w-[26rem] text-[14px] font-semibold leading-relaxed text-[#0a0a0a]/58 sm:text-[15px]">
                Совсем скоро подведём итоги голосования и покажем, какие приоритеты выбрало сообщество — следите за новостями KARTO.
              </p>
              <Button
                type="button"
                className="mt-10 h-[3.35rem] min-w-[200px] rounded-full bg-[#0a0a0a] px-10 text-[16px] font-bold text-white shadow-[0_12px_36px_-12px_rgba(10,10,10,0.45)] transition-colors hover:bg-[#1f1f1f]"
                onClick={() => onOpenChange(false)}
              >
                Закрыть
              </Button>
            </motion.div>
          ) : !bootstrapDone ? (
            <div
              className="relative z-10 flex min-h-[min(72dvh,420px)] flex-1 flex-col items-center justify-center px-6 py-16"
              role="status"
              aria-live="polite"
            >
              <div className="h-10 w-10 animate-pulse rounded-full bg-[#2E5A43]/15" />
              <p id="community-vote-loading-title" className="mt-4 text-[15px] font-semibold text-neutral-600">
                Загрузка…
              </p>
            </div>
          ) : (
            <>
              {/* Шапка */}
              <div className="relative z-10 shrink-0 border-b border-[#2E5A43]/10 bg-transparent px-6 pb-5 pt-7 sm:px-10 sm:pb-6 sm:pt-8">
                {step === "done" ? (
                  <div className="flex items-center gap-3 pr-10 sm:pr-12">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#84CC16]/40 bg-[#ECF7DB] text-[#2E5A43]">
                      <CheckCircle2 className="h-5 w-5" strokeWidth={2} />
                    </div>
                    <p style={playfair} className="text-xl font-bold text-[#0a0a0a] sm:text-2xl">
                      Голосование завершено
                    </p>
                  </div>
                ) : step === 2 ? (
                  <div className="pr-10 sm:pr-14">
                    <p className={kickerClass}>Шаг 2 · Обратная связь</p>
                    <h2
                      style={playfair}
                      id="community-vote-step2-title"
                      className="mt-3 text-[1.625rem] font-bold leading-[1.18] tracking-[-0.02em] text-[#0a0a0a] sm:text-[1.85rem] md:text-[2rem]"
                    >
                      Что мешает пользоваться KARTO комфортно?
                    </h2>
                    <p className="mt-3 text-[16px] font-medium leading-relaxed text-[#0a0a0a]/62 sm:text-[17px]">
                      Отметьте всё актуальное — так мы поймём, что улучшать после приоритетов по функциям.
                    </p>
                    {authChecked && userId && problems.size > 0 ? (
                      <span className="mt-4 inline-flex w-fit rounded-full bg-[#ECF7DB] px-3.5 py-1.5 text-[12px] font-bold text-[#2E5A43] ring-1 ring-[#84CC16]/40">
                        Выбрано: {problems.size}
                      </span>
                    ) : null}
                  </div>
                ) : cardPhase === "intro" ? (
                  <div className="pr-10 sm:pr-14">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-[0.28em] text-[#2E5A43]/75">KARTO</span>
                      <span className="text-[#2E5A43]/25" aria-hidden>
                        ·
                      </span>
                      <div className="inline-flex items-center gap-1.5 rounded-full border border-[#84CC16]/40 bg-[#ECF7DB]/80 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#2E5A43]">
                        <Zap className="h-3 w-3 text-[#84CC16]" aria-hidden />
                        Быстрый формат
                      </div>
                    </div>
                    <h2
                      style={playfair}
                      id="community-vote-title"
                      className="mt-4 text-[1.625rem] font-bold leading-[1.2] tracking-[-0.02em] text-[#0a0a0a] sm:text-[1.85rem] md:text-[2rem]"
                    >
                  Сначала — о чём это голосование
                </h2>
                <p className="mt-3 text-[16px] font-semibold leading-relaxed text-[#0a0a0a]/68 sm:text-[17px]">
                  Дальше вы увидите <span className="font-bold text-[#2E5A43]">7 карточек</span> с идеями развития KARTO. На каждой — один выбор из трёх вариантов, без лишних экранов.
                </p>
                  </div>
                ) : cardPhase === "summary" ? (
                  <div className="pr-10 sm:pr-14">
                    <p className={kickerClass}>Итог по функциям</p>
                    <h2
                      style={playfair}
                      id={summaryTitleId}
                      className="mt-3 text-[1.625rem] font-bold leading-[1.18] tracking-[-0.02em] text-[#0a0a0a] sm:text-[1.85rem] md:text-[2rem]"
                    >
                      Проверьте ответы перед следующим шагом
                    </h2>
                    <p className="mt-3 text-[16px] font-medium leading-relaxed text-[#0a0a0a]/62 sm:text-[17px]">
                      Нажмите «Изменить, если нужно» — откроется карточка, после выбора вы снова вернётесь сюда.
                    </p>
                    <div className="mt-5 flex items-center gap-4">
                      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[#2E5A43]/12 ring-1 ring-[#2E5A43]/10">
                        <motion.div
                          className="h-full rounded-full bg-gradient-to-r from-[#2E5A43] to-[#3d6b52] shadow-[0_0_14px_-2px_rgba(46,90,67,0.55)]"
                          initial={false}
                          animate={{ width: "100%" }}
                          transition={{ type: "tween", duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                        />
                      </div>
                      <span className="shrink-0 text-[13px] font-bold tabular-nums text-[#0a0a0a]/48">
                        {totalCards} / {totalCards}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="pr-10 sm:pr-14">
                    {editingFromSummary ? (
                      <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-[#2E5A43]">Редактирование ответа</p>
                    ) : null}
                    <h2
                      style={playfair}
                      id="community-vote-title"
                      className="text-[1.625rem] font-bold leading-[1.2] tracking-[-0.02em] text-[#0a0a0a] sm:text-[1.85rem] md:text-[2rem]"
                    >
                      Куда направить разработку — <span className="text-[#2E5A43]">решайте вы</span>
                    </h2>
                    <div className="mt-5 flex items-center gap-4">
                      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[#2E5A43]/12 ring-1 ring-[#2E5A43]/10">
                        <motion.div
                          className="h-full rounded-full bg-gradient-to-r from-[#2E5A43] to-[#3d6b52] shadow-[0_0_14px_-2px_rgba(46,90,67,0.55)]"
                          initial={false}
                          animate={{ width: `${((cardIndex + 1) / totalCards) * 100}%` }}
                          transition={{ type: "tween", duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                        />
                      </div>
                      <span className="shrink-0 text-[13px] font-bold tabular-nums text-[#0a0a0a]/48">
                        {cardIndex + 1} / {totalCards}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div
                className={cn(
                  "relative z-10 min-h-0 flex-1 bg-transparent px-5 pb-6 pt-3 sm:px-10 sm:pb-8 sm:pt-2",
                  avoidInnerScrollVoteCard
                    ? "flex min-h-0 flex-col overflow-hidden"
                    : "overflow-y-auto overscroll-contain"
                )}
              >
            {!userId ? (
              <VoteIntroPanel cta="login" onOpenChange={onOpenChange} />
            ) : step === "done" ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center py-8 text-center"
              >
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-[#84CC16]/50 bg-[#ECF7DB] text-[#2E5A43]">
                  <CheckCircle2 className="h-8 w-8" strokeWidth={1.5} />
                </div>
                <p style={playfair} className="mt-5 text-2xl font-bold text-[#0a0a0a]">
                  {alreadySubmitted ? "Спасибо за участие" : "Готово"}
                </p>
                <p className="mt-2 max-w-md text-[15px] font-medium text-[#0a0a0a]/65">
                  {alreadySubmitted
                    ? "Приоритеты и обратная связь сохранены."
                    : "Ответ записан."}
                </p>
                <p className="mt-3 text-[12px] font-semibold text-[#0a0a0a]/42">Версия голосования · {COMMUNITY_SURVEY_VERSION}</p>
                <Button
                  type="button"
                  className="mt-6 h-12 rounded-full bg-[#0a0a0a] px-10 text-[15px] font-bold text-white shadow-[0_10px_28px_-10px_rgba(10,10,10,0.4)] transition-colors hover:bg-[#1f1f1f]"
                  onClick={() => onOpenChange(false)}
                >
                  Закрыть
                </Button>
              </motion.div>
            ) : step === 1 && cardPhase === "intro" ? (
              <VoteIntroPanel
                cta="start"
                onStart={() => setCardPhase("cards")}
                onOpenChange={onOpenChange}
              />
            ) : step === 1 && cardPhase === "summary" ? (
              <motion.ul
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
                className="space-y-3 pb-1"
              >
                {COMMUNITY_SURVEY_FEATURE_OPTIONS.map((opt, idx) => (
                  <motion.li
                    key={opt.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.32, delay: idx * 0.04, ease: [0.22, 1, 0.36, 1] }}
                    className="flex flex-col gap-3 rounded-2xl border border-[#2E5A43]/14 bg-gradient-to-r from-[#f0f5ef] to-[#e4ebe6] px-4 py-4 shadow-[0_8px_28px_-16px_rgba(46,90,67,0.2)] sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-5 sm:py-4"
                  >
                    <div className="min-w-0 flex-1">
                      <p style={playfair} className="text-[16px] font-bold leading-snug text-[#0a0a0a] sm:text-[17px]">
                        {opt.title}
                      </p>
                    </div>
                    <div className="flex min-w-0 flex-col gap-2 border-t border-[#2E5A43]/10 pt-3 sm:w-[min(48%,280px)] sm:border-t-0 sm:pt-0">
                      <p
                        className={cn(
                          "text-[1.35rem] font-extrabold leading-[1.12] tracking-[-0.03em] sm:text-[1.5rem] sm:text-right",
                          swipeVoteSummaryClass(swipeVotes[opt.id])
                        )}
                      >
                        {swipeVoteLabel(swipeVotes[opt.id])}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setCardIndex(idx);
                          setEditingFromSummary(true);
                          setCardPhase("cards");
                        }}
                        className="inline-flex w-fit items-center gap-1.5 self-start text-[13px] font-semibold text-[#0a0a0a]/48 underline decoration-[#2E5A43]/35 underline-offset-[3px] transition-colors duration-200 hover:text-[#2E5A43] sm:self-end"
                      >
                        <PencilLine className="h-3.5 w-3.5 shrink-0 opacity-80" strokeWidth={2.25} aria-hidden />
                        Изменить, если нужно
                      </button>
                    </div>
                  </motion.li>
                ))}
              </motion.ul>
            ) : step === 1 && cardPhase === "cards" && currentOption ? (
              <div
                className={cn(
                  "flex min-h-0 flex-1 flex-col",
                  !currentOption.imageSrc2 && "justify-between gap-4"
                )}
              >
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={currentOption.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
                    className="flex shrink-0 flex-col"
                  >
                    <FeatureCardMedia
                      imageSrc={currentOption.imageSrc}
                      imageAlt={currentOption.imageAlt}
                      imageSrc2={currentOption.imageSrc2}
                      imageAlt2={currentOption.imageAlt2}
                      priority={cardIndex === 0}
                      compactSingle={!currentOption.imageSrc2}
                    />
                    <div
                      className={cn(
                        "mt-3 transition-[box-shadow,opacity] duration-300 ease-out sm:mt-4",
                        currentOption.imageSrc2 && "mt-5 sm:mt-6",
                        !currentOption.imageSrc2 &&
                          "rounded-2xl border border-[#2E5A43]/16 bg-gradient-to-b from-[#ECF7DB]/55 to-[#dfead8]/65 px-4 py-3 shadow-[0_10px_36px_-22px_rgba(46,90,67,0.28)] ring-1 ring-[#84CC16]/15 backdrop-blur-[1px] sm:px-5 sm:py-3.5"
                      )}
                    >
                      {currentOption.titleParts ? (
                        <p
                          style={playfair}
                          className="text-[1.3rem] font-bold leading-snug tracking-[-0.02em] text-[#0a0a0a] sm:text-[1.45rem] md:text-[1.55rem]"
                        >
                          <span className="text-[#2E5A43] drop-shadow-sm">{currentOption.titleParts.emphasis}</span>
                          {currentOption.titleParts.remainder}
                        </p>
                      ) : (
                        <p
                          style={playfair}
                          className="text-[1.3rem] font-bold leading-snug tracking-[-0.02em] text-[#0a0a0a] sm:text-[1.45rem] md:text-[1.55rem]"
                        >
                          {currentOption.title}
                        </p>
                      )}
                      <p
                        className={cn(
                          "mt-2 font-semibold text-[#0a0a0a]/68 sm:mt-2.5",
                          currentOption.imageSrc2
                            ? "text-[16px] leading-relaxed sm:text-[17px]"
                            : "text-[15px] leading-[1.45] sm:text-[15px]"
                        )}
                      >
                        {currentOption.description}
                      </p>
                      {currentOption.learnMore ? (
                        <a
                          href={currentOption.learnMore.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={cn(
                            "mt-2.5 inline-flex max-w-full font-bold leading-snug text-[#2E5A43] underline decoration-[#84CC16]/80 underline-offset-[3px] transition hover:text-[#234d3a]",
                            currentOption.imageSrc2 ? "text-[15px]" : "text-[14px]"
                          )}
                        >
                          {currentOption.learnMore.label}
                        </a>
                      ) : null}
                    </div>
                  </motion.div>
                </AnimatePresence>

                <div className="flex shrink-0 flex-col gap-2.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1 sm:gap-3 sm:pt-2">
                  <button
                    type="button"
                    onClick={() => recordVote("very")}
                    className="flex min-h-[3.35rem] w-full items-center justify-center gap-2 rounded-full border border-[#1a3328]/35 bg-gradient-to-b from-[#3d6d54] via-[#2E5A43] to-[#1e3c2f] px-5 text-[16px] font-bold tracking-[-0.01em] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_12px_36px_-10px_rgba(46,90,67,0.5)] transition-[transform,filter,box-shadow] duration-200 ease-out hover:brightness-[1.06] active:scale-[0.985] active:brightness-[0.97]"
                  >
                    <ThumbsUp className="h-5 w-5 shrink-0 opacity-95" strokeWidth={2.2} aria-hidden />
                    Очень нужно!
                  </button>
                  <button
                    type="button"
                    onClick={() => recordVote("need")}
                    className="flex min-h-[3.35rem] w-full items-center justify-center gap-2 rounded-full border-[3px] border-[#2E5A43] bg-gradient-to-b from-[#f6fbf4] to-[#e2efe4] px-5 text-[16px] font-bold tracking-[-0.01em] text-[#234d3a] shadow-[inset_0_1px_0_rgba(255,255,255,0.65),0_8px_28px_-12px_rgba(46,90,67,0.22)] transition-[transform,filter,box-shadow] duration-200 ease-out hover:from-[#ECF7DB] hover:to-[#dcebd8] active:scale-[0.985]"
                  >
                    <Star className="h-5 w-5 shrink-0" strokeWidth={2.2} aria-hidden />
                    Нужно!
                  </button>
                  <button
                    type="button"
                    onClick={() => recordVote("later")}
                    className="flex min-h-[3.35rem] w-full items-center justify-center gap-2 rounded-full border border-[#2E5A43]/28 bg-gradient-to-b from-[#d8e5d9] to-[#c9d8cc] px-5 text-[16px] font-bold tracking-[-0.01em] text-[#0a0a0a] shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_6px_22px_-10px_rgba(10,10,10,0.12)] transition-[transform,filter,box-shadow,border-color] duration-200 ease-out hover:border-[#2E5A43]/40 hover:brightness-[1.03] active:scale-[0.985]"
                  >
                    <CircleSlash className="h-5 w-5 shrink-0 text-[#2E5A43]" strokeWidth={2.2} aria-hidden />
                    Пока не актуально
                  </button>
                </div>
              </div>
            ) : step === 2 ? (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
              >
                <motion.ul
                  className="grid grid-cols-1 gap-3.5"
                  variants={listVariants}
                  initial="hidden"
                  animate="show"
                  key="step2"
                >
                  {COMMUNITY_SURVEY_PROBLEM_OPTIONS.map((opt) => {
                    const selected = problems.has(opt.id);
                    const Icon = opt.Icon;
                    return (
                      <motion.li key={opt.id} variants={itemVariants} className="min-w-0">
                        <button
                          type="button"
                          onClick={() => toggleProblem(opt.id)}
                          className={cn(
                            "flex w-full gap-4 rounded-2xl border bg-gradient-to-r from-[#f0f5ef] to-[#e6eee7] px-5 py-4 text-left shadow-[0_2px_16px_-4px_rgba(46,90,67,0.1)] transition-all duration-300 ease-out",
                            selected
                              ? "border-[#2E5A43] ring-2 ring-[#84CC16]/25"
                              : "border-[#2E5A43]/12 hover:border-[#2E5A43]/28 hover:shadow-[0_8px_28px_-12px_rgba(46,90,67,0.15)]"
                          )}
                        >
                          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#2E5A43]/12 bg-[#ECF7DB]/50 text-[#2E5A43]">
                            <Icon className="h-5 w-5" strokeWidth={1.65} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="text-[16px] font-bold leading-snug text-[#0a0a0a]">{opt.title}</span>
                            <p className="mt-1 text-[14px] font-medium leading-relaxed text-[#0a0a0a]/55">{opt.description}</p>
                          </span>
                          <span
                            className={cn(
                              "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center self-start rounded-full border-2 transition-colors",
                              selected ? "border-[#2E5A43] bg-[#2E5A43] text-white" : "border-neutral-200 bg-white"
                            )}
                            aria-hidden
                          >
                            {selected ? (
                              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            ) : null}
                          </span>
                        </button>
                      </motion.li>
                    );
                  })}
                </motion.ul>
              </motion.div>
            ) : null}
            {error ? (
              <p className="mt-4 rounded-2xl border border-red-200/80 bg-red-50/90 px-4 py-3 text-[15px] font-semibold text-red-900" role="alert">
                {error}
              </p>
            ) : null}
          </div>

          {userId && step === 1 && cardPhase === "summary" && (
            <div className="relative z-10 shrink-0 border-t border-[#2E5A43]/[0.1] bg-[#F5F9F4]/95 px-5 py-6 backdrop-blur-sm sm:px-10">
              <Button
                type="button"
                className="h-[3.5rem] w-full rounded-full bg-gradient-to-b from-[#2E5A43] to-[#264d3a] px-8 text-[16px] font-bold text-white shadow-[0_14px_40px_-12px_rgba(46,90,67,0.5)] ring-1 ring-[#84CC16]/20 transition-[filter,transform] duration-200 ease-out hover:brightness-[1.05] disabled:opacity-45 active:scale-[0.99]"
                disabled={!allFeatureVotesComplete}
                onClick={() => {
                  setFeatureOrder(rankFeatureIdsFromSwipeVotes(swipeVotes));
                  setStep(2);
                }}
              >
                Далее: вопросы о сервисе
              </Button>
            </div>
          )}

          {userId && step === 2 && (
            <div className="relative z-10 shrink-0 border-t border-[#2E5A43]/[0.1] bg-[#F5F9F4]/95 px-5 py-6 backdrop-blur-sm sm:px-10">
              <Button
                type="button"
                className="h-[3.5rem] w-full rounded-full bg-gradient-to-b from-[#2E5A43] to-[#264d3a] px-8 text-[16px] font-bold text-white shadow-[0_14px_40px_-12px_rgba(46,90,67,0.5)] ring-1 ring-[#84CC16]/20 transition-[filter,transform] duration-200 ease-out hover:brightness-[1.05] active:scale-[0.99]"
                disabled={!canSubmit || submitting}
                onClick={handleSubmit}
              >
                {submitting ? "Отправка…" : "Отправить голос"}
              </Button>
            </div>
          )}
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

const voteNavLabel = "Что внедрим следующим?";

export function CommunityVoteNavButton({
  onClick,
  compact,
}: {
  onClick: () => void;
  /** Узкая полоска (мобильный хедер): только иконка, подпись в aria-label */
  compact?: boolean;
}) {
  if (compact) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="vote-nav-shimmer-btn inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#2E5A43]/18 bg-gradient-to-br from-[#e2f5d4] via-[#ECF7DB] to-[#cde8c4] text-[#1a3c2f] shadow-[0_4px_16px_-6px_rgba(46,90,67,0.45),inset_0_1px_0_rgba(255,255,255,0.55)] transition hover:brightness-[1.04] hover:shadow-[0_6px_20px_-6px_rgba(46,90,67,0.5),inset_0_1px_0_rgba(255,255,255,0.65)] active:scale-[0.98]"
        aria-label={`${voteNavLabel} Открыть голосование`}
      >
        <Vote className="relative z-[1] h-4 w-4 text-[#2E5A43]" strokeWidth={2} />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="vote-nav-shimmer-btn inline-flex h-10 items-center gap-2 rounded-full border border-[#2E5A43]/18 bg-gradient-to-r from-[#e2f5d4] via-[#ECF7DB] to-[#d4edc4] px-5 text-base font-semibold text-[#1a3c2f] shadow-[0_4px_18px_-8px_rgba(46,90,67,0.42),inset_0_1px_0_rgba(255,255,255,0.55)] transition hover:brightness-[1.03] hover:shadow-[0_6px_22px_-8px_rgba(46,90,67,0.48),inset_0_1px_0_rgba(255,255,255,0.65)] active:scale-[0.99]"
      aria-label={`${voteNavLabel} Открыть голосование`}
    >
      <Vote className="relative z-[1] h-4 w-4 shrink-0 text-[#2E5A43]" strokeWidth={2} />
      <span className="relative z-[1]">{voteNavLabel}</span>
    </button>
  );
}
