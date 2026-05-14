"use client";

import { startTransition, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronLeft,
  Download,
  Loader2,
  Plus,
  Upload,
} from "lucide-react";
import { createBrowserClient } from "@/lib/supabase/client";
import { triggerDownloadFromRemoteUrl } from "@/lib/client/media-download";
import { useToast } from "@/components/ui/toast";
import { IosToggleRow } from "@/components/ui/ios-toggle-row";

export type BrandLogoDraftPatch = {
  logoMode: "" | "upload" | "generate" | "later";
  logoFileName: string;
  logoGeneratedUrls: string[];
  logoChosenUrl: string;
  logoApprovedUrl: string;
};

type Props = {
  draftName: string;
  draftNiche: string;
  draftDescription: string;
  paletteTitle: string;
  paletteColors: string[];
  visualStyleSummary: string;
  toneTitle: string;
  logoMode: BrandLogoDraftPatch["logoMode"];
  logoFileName: string;
  logoGeneratedUrls: string[];
  logoChosenUrl: string;
  logoApprovedUrl: string;
  onPatch: (patch: Partial<BrandLogoDraftPatch>) => void;
};

/** Слот референса: JPEG data URL с загрузки или HTTPS URL карточки (как в свободном творчестве). */
type LogoReferenceSlot = {
  /** data URL с клиента или прямой URL превью (как в свободном творчестве) для KIE */
  input: string;
  fromLogoUrl?: string;
};

function resolveImgSrc(url: string): string {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (typeof window !== "undefined") {
    const path = url.startsWith("/") ? url : `/${url}`;
    return `${window.location.origin}${path}`;
  }
  return url;
}

type SlotPhase = "idle" | "pair";
type ContextToggleKey = "name" | "niche" | "description" | "colors" | "style" | "tone";

const LOGO_SLOT_CLASS =
  "relative aspect-square w-full max-w-[min(94vw,720px)] lg:max-w-[min(calc(50vw-2rem),720px)] overflow-hidden rounded-[2.25rem] shadow-[0_28px_80px_-52px_rgba(7,9,7,0.55)] ring-1 ring-[#070907]/10";

const CONTEXT_ROWS: Array<{ key: ContextToggleKey; label: string }> = [
  { key: "name", label: "Название" },
  { key: "niche", label: "Ниша" },
  { key: "description", label: "Описание" },
  { key: "colors", label: "Цвета" },
  { key: "style", label: "Стиль" },
  { key: "tone", label: "Тон" },
];

/** Как в «Свободном творчестве»: сжатие JPEG до загрузки в KIE */
function compressLogoReferenceFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = document.createElement("img");
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const maxW = 1200;
      let w = img.width;
      let h = img.height;
      if (w > maxW) {
        h = Math.round((h * maxW) / w);
        w = maxW;
      }
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas not available"));
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      try {
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };
    img.src = url;
  });
}

function SquareGenSlot({
  label,
  loading,
  tone = "light",
  size = "hero",
  pairCompact,
  children,
}: {
  label: string;
  loading: boolean;
  tone?: "light" | "dark";
  /** hero — крупные слоты первого экрана; grid — ячейка сетки ленты */
  size?: "hero" | "grid";
  /** Два параллельных слота первичной генерации — компактнее и с подсказкой по времени */
  pairCompact?: boolean;
  children?: ReactNode;
}) {
  const shell =
    size === "grid"
      ? "relative aspect-square w-full overflow-hidden rounded-2xl shadow-[0_18px_48px_-38px_rgba(7,9,7,0.55)] ring-1 ring-[#070907]/10"
      : LOGO_SLOT_CLASS;
  return (
    <div
      className={`${shell} ${
        loading ? (tone === "dark" ? "karto-logo-gen-slot karto-logo-gen-slot-dark" : "karto-logo-gen-slot") : "bg-[#F3F1EA]"
      }`}
    >
      {loading ? (
        <div
          className={`absolute inset-0 z-10 flex flex-col items-center justify-center text-center ${
            pairCompact ? "gap-3 px-3 py-4" : "gap-6 px-8"
          }`}
        >
          <Loader2
            className={`animate-spin text-[#2E5A43] ${pairCompact ? "h-10 w-10 md:h-11 md:w-11" : "h-16 w-16"}`}
            strokeWidth={2}
          />
          <div>
            <p
              className={`font-bold uppercase tracking-[0.28em] text-[#070907]/55 ${
                pairCompact ? "text-[10px] md:text-[11px]" : "text-xs md:text-[13px]"
              }`}
            >
              {label}
            </p>
            <p
              className={`max-w-[28ch] font-medium leading-snug text-[#070907]/48 ${
                pairCompact ? "mt-2 text-[13px] md:text-sm" : "mt-3 text-base md:text-lg"
              }`}
            >
              Собираем логотип под ваш бренд…
            </p>
            {pairCompact ? (
              <p className="mt-2 max-w-[34ch] text-[11px] font-medium leading-snug text-[#070907]/38 md:text-xs">
                Обычно это занимает около 2 минут.
              </p>
            ) : null}
          </div>
        </div>
      ) : (
        children
      )}
    </div>
  );
}

export function BrandLogoStep({
  draftName,
  draftNiche,
  draftDescription,
  paletteTitle,
  paletteColors,
  visualStyleSummary,
  toneTitle,
  logoMode,
  logoFileName,
  logoGeneratedUrls,
  logoChosenUrl,
  logoApprovedUrl,
  onPatch,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logoReferenceInputRef = useRef<HTMLInputElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const [uploadPreviewUrl, setUploadPreviewUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [slotPhase, setSlotPhase] = useState<SlotPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [promptInput, setPromptInput] = useState("");
  const [referenceSlots, setReferenceSlots] = useState<LogoReferenceSlot[]>([]);
  const [downloadingLogoIdx, setDownloadingLogoIdx] = useState<number | null>(null);
  const [uploadRemoteBusy, setUploadRemoteBusy] = useState(false);
  const [imgBust, setImgBust] = useState<Record<string, number>>({});
  const [contextEnabled, setContextEnabled] = useState<Record<ContextToggleKey, boolean>>({
    name: true,
    niche: true,
    description: true,
    colors: true,
    style: true,
    tone: true,
  });

  const immersive = logoMode === "upload" || logoMode === "generate";
  const uploadDisplaySrc =
    uploadPreviewUrl ||
    (logoApprovedUrl.startsWith("http://") || logoApprovedUrl.startsWith("https://")
      ? logoApprovedUrl
      : logoApprovedUrl.startsWith("data:")
        ? logoApprovedUrl
        : "");

  const [dockPortalReady, setDockPortalReady] = useState(false);
  const [contextPanelOpen, setContextPanelOpen] = useState(false);
  const logoDockRef = useRef<HTMLDivElement>(null);
  const { showToast } = useToast();

  useEffect(() => setDockPortalReady(true), []);

  /** Тост справа внизу (ToastProvider в layout): задержка дольше порога при парной генерации. */
  const LOGO_SLOW_TOAST_AFTER_MS = 160_000;

  useEffect(() => {
    const activePairGen = logoMode === "generate" && slotPhase === "pair";
    if (!activePairGen) return;
    const timerId = window.setTimeout(() => {
      showToast({
        type: "info",
        title: "Генерация задерживается",
        message:
          "Обычно это занимает меньше времени. Сервер всё ещё обрабатывает запрос — не закрывайте страницу.",
        durationMs: 7000,
      });
    }, LOGO_SLOW_TOAST_AFTER_MS);
    return () => window.clearTimeout(timerId);
  }, [logoMode, slotPhase, showToast]);

  useEffect(() => {
    if (!contextPanelOpen) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const root = logoDockRef.current;
      if (root && !root.contains(e.target as Node)) {
        setContextPanelOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [contextPanelOpen]);

  useEffect(() => {
    return () => {
      if (uploadPreviewUrl) URL.revokeObjectURL(uploadPreviewUrl);
    };
  }, [uploadPreviewUrl]);

  useEffect(() => {
    if (logoMode !== "upload") {
      setUploadPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    }
  }, [logoMode]);

  const parseGenerateResponse = async (response: Response) => {
    const raw = await response.text();
    if (!raw.trim()) {
      if (response.status === 504 || response.status === 408) {
        throw new Error("Генерация заняла слишком много времени. Попробуйте ещё раз.");
      }
      throw new Error(
        response.ok ? "Пустой ответ сервера" : "Соединение прервалось — попробуйте ещё раз."
      );
    }
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      throw new Error("Не удалось разобрать ответ сервера.");
    }
  };

  const resetToChooser = () => {
    setPromptInput("");
    setReferenceSlots([]);
    onPatch({
      logoMode: "",
      logoFileName: "",
      logoGeneratedUrls: [],
      logoChosenUrl: "",
      logoApprovedUrl: "",
    });
  };

  const handleLogoReferenceUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const files = Array.from(input.files || []);
    input.value = "";
    if (!files.length) return;
    const remaining = 2 - referenceSlots.length;
    if (remaining <= 0) {
      setError("Можно не больше двух референсов.");
      return;
    }
    const toAdd = files.slice(0, remaining);
    try {
      const compressed = await Promise.all(toAdd.map((f) => compressLogoReferenceFile(f)));
      setReferenceSlots((prev) =>
        [...prev, ...compressed.map((input) => ({ input }))].slice(0, 2)
      );
      setError(null);
    } catch {
      setError("Не удалось обработать изображение. Попробуйте другой файл.");
    }
  };

  const addGeneratedLogoAsReference = (logoUrl: string) => {
    const key = resolveImgSrc(logoUrl);
    if (referenceSlots.length >= 2) {
      setError("Сначала уберите один из референсов — максимум два.");
      return;
    }
    if (referenceSlots.some((s) => s.fromLogoUrl === key)) {
      setError("Этот логотип уже в запросе.");
      return;
    }
    setError(null);
    setReferenceSlots((prev) => [...prev, { input: key, fromLogoUrl: key }].slice(0, 2));
    promptRef.current?.focus();
  };

  const callGenerate = async (mode: "pair" | "single", source: "initial" | "custom") => {
    setError(null);
    const initialPayload = {
      brandName: draftName.trim(),
      niche: draftNiche.trim(),
      description: draftDescription.trim(),
      paletteColors,
      paletteTitle,
      visualStyleSummary,
      toneTitle,
      paletteOptOut: false,
    };
    const customPayload = {
      brandName: contextEnabled.name ? draftName.trim() : "",
      niche: contextEnabled.niche ? draftNiche.trim() : "",
      description: contextEnabled.description ? draftDescription.trim() : "",
      paletteColors: contextEnabled.colors ? paletteColors : [],
      paletteTitle: contextEnabled.colors ? paletteTitle : "",
      visualStyleSummary: contextEnabled.style ? visualStyleSummary : "",
      toneTitle: contextEnabled.tone ? toneTitle : "",
      paletteOptOut: !contextEnabled.colors,
    };
    const brandPayload = source === "initial" ? initialPayload : customPayload;
    const trimmedPrompt = source === "custom" ? promptInput.trim() : "";
    if (source === "custom") {
      const hasContext = Object.values(contextEnabled).some(Boolean);
      const hasRefs = referenceSlots.length > 0;
      if (!hasContext && !trimmedPrompt && !hasRefs) {
        setError("Включите переключатель, добавьте референс или коротко опишите идею.");
        return;
      }
    }

    const supabase = createBrowserClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) {
      setError("Войдите в аккаунт, чтобы сгенерировать логотип.");
      return;
    }

    setSlotPhase("pair");
    setGenerating(true);
    try {
      const response = await fetch("/api/brand/generate-logo", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode,
          brand: brandPayload,
          refinement: trimmedPrompt,
          referenceImageDataUrls:
            source === "custom" && referenceSlots.length > 0
              ? referenceSlots.map((s) => s.input)
              : undefined,
          singleVariant: mode === "single" ? "alternate" : undefined,
        }),
      });

      const data = await parseGenerateResponse(response);
      if (!response.ok || data.success !== true) {
        const msg =
          typeof data.error === "string"
            ? data.error
            : !response.ok
              ? "Запрос не выполнен"
              : "Не удалось сгенерировать";
        throw new Error(msg);
      }
      const urls: string[] = Array.isArray(data.imageUrls) ? (data.imageUrls as string[]) : [];
      if (urls.length === 0) throw new Error("Пустой ответ генерации");

      if (mode === "pair") {
        const nextUrls = logoGeneratedUrls.length > 0 ? [...urls, ...logoGeneratedUrls] : urls;
        onPatch({
          logoGeneratedUrls: nextUrls,
          logoChosenUrl: urls[0] ?? "",
          logoApprovedUrl: "",
        });
      } else {
        onPatch({
          logoGeneratedUrls: [...urls, ...logoGeneratedUrls],
          logoChosenUrl: urls[0] ?? logoChosenUrl,
        });
      }
    } catch (e: unknown) {
      let msg = e instanceof Error ? e.message : "Ошибка генерации";
      if (/abort|terminated|Failed to fetch|NetworkError/i.test(msg)) {
        msg = "Сеть прервала запрос. Повторите попытку.";
      }
      setError(msg);
    } finally {
      setGenerating(false);
      setSlotPhase("idle");
    }
  };

  const downloadLogo = async (url: string, idx: number) => {
    const resolved = resolveImgSrc(url);
    setError(null);
    setDownloadingLogoIdx(idx);
    try {
      await triggerDownloadFromRemoteUrl({
        url,
        mediaType: "image",
        filenameBase: `karto-logo-${Date.now()}-${idx + 1}`,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Не удалось скачать файл.";
      setError(`${msg} Открываем оригинал в новой вкладке…`);
      try {
        window.open(resolved, "_blank", "noopener,noreferrer");
      } catch {
        /* ignore */
      }
    } finally {
      setDownloadingLogoIdx(null);
    }
  };

  const persistUploadedLogoRemote = async (file: File) => {
    setUploadRemoteBusy(true);
    try {
      const supabase = createBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        const msg = "Войдите в аккаунт, чтобы сохранить логотип.";
        setError(msg);
        showToast({ type: "error", message: msg });
        return;
      }

      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/brand/upload-logo", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: fd,
      });
      const data = (await res.json().catch(() => ({}))) as {
        url?: unknown;
        error?: unknown;
      };
      if (!res.ok || typeof data.url !== "string") {
        const detail =
          typeof data.error === "string"
            ? data.error
            : !res.ok
              ? "Запрос не выполнен"
              : "Неверный ответ сервера";
        throw new Error(detail);
      }
      onPatch({ logoApprovedUrl: data.url, logoFileName: file.name });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Не удалось загрузить логотип.";
      setError(msg);
      showToast({ type: "error", message: msg });
    } finally {
      setUploadRemoteBusy(false);
    }
  };

  const setupUploadPreview = (file: File) => {
    const blobUrl = URL.createObjectURL(file);
    setUploadPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return blobUrl;
    });
    setError(null);
    startTransition(() =>
      onPatch({
        logoMode: "upload",
        logoFileName: file.name,
        logoGeneratedUrls: [],
        logoChosenUrl: "",
        logoApprovedUrl: "",
      })
    );
    void persistUploadedLogoRemote(file);
  };

  const showChooser = logoMode === "";
  const brandLabel = draftName.trim() || "Ваш бренд";

  const immersiveBar = immersive && (
    <header className="mb-4 flex shrink-0 items-center justify-between gap-3 border-b border-[#070907]/10 pb-4 md:mb-5 md:pb-5">
      <button
        type="button"
        onClick={() => resetToChooser()}
        className="inline-flex items-center gap-2 rounded-full px-2 py-2 text-sm font-semibold text-neutral-500 transition hover:bg-white/55 hover:text-[#070907]"
      >
        <ChevronLeft className="h-4 w-4 shrink-0" />
        <span className="hidden sm:inline">К выбору способа</span>
        <span className="sm:hidden">Назад</span>
      </button>
      <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-neutral-400 md:text-[11px]">
        {logoMode === "generate" ? "Логотип · генерация" : "Логотип · файл"}
      </p>
      <div className="w-[5.5rem] shrink-0 sm:w-[8.5rem]" aria-hidden />
    </header>
  );

  const showPairShimmer = logoMode === "generate" && slotPhase === "pair";
  const hasGeneratedLogos = logoGeneratedUrls.length > 0;

  return (
    <div className={`flex flex-col ${immersive ? "min-h-0 flex-1" : "gap-14 md:gap-16"}`}>
      {immersiveBar}

      {showChooser && (
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.52, ease: [0.22, 1, 0.36, 1] }}
          className="grid grid-cols-1 gap-7 lg:grid-cols-2 lg:gap-10 lg:items-stretch"
        >
          <motion.button
            type="button"
            whileHover={{ y: -4 }}
            whileTap={{ scale: 0.992 }}
            transition={{ type: "spring", stiffness: 420, damping: 28 }}
            onClick={() => {
              startTransition(() =>
                onPatch({
                  logoMode: "upload",
                  logoFileName: "",
                  logoGeneratedUrls: [],
                  logoChosenUrl: "",
                  logoApprovedUrl: "",
                })
              );
              fileInputRef.current?.click();
            }}
            className="group relative flex min-h-[300px] flex-col overflow-hidden rounded-[2rem] border border-[#070907]/10 bg-gradient-to-br from-white/75 via-[#faf9f6] to-[#ebe6dc]/95 p-10 text-left shadow-[0_32px_95px_-58px_rgba(7,9,7,0.55)] ring-1 ring-white/50 backdrop-blur-md lg:min-h-[360px]"
          >
            <div className="pointer-events-none absolute inset-0 opacity-[0.4] [background-image:radial-gradient(circle_at_15%_12%,rgba(185,255,75,0.16),transparent_45%),radial-gradient(circle_at_92%_88%,rgba(46,90,67,0.08),transparent_40%)]" />
            <div className="relative flex flex-1 flex-col">
              <div className="mb-8 flex h-[4.25rem] w-[4.25rem] items-center justify-center rounded-[1.35rem] bg-white/85 shadow-[0_14px_42px_-32px_rgba(7,9,7,0.45)] ring-1 ring-[#070907]/6">
                <Upload className="h-8 w-8 text-[#2E5A43]" strokeWidth={2} />
              </div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-neutral-400">Уже есть макет</p>
              <h3 className="mt-3 text-[clamp(1.55rem,3vw,2.25rem)] font-semibold tracking-[-0.055em] text-[#070907]">
                Загрузить логотип
              </h3>
              <p className="mt-4 max-w-[34ch] text-[15px] leading-relaxed text-neutral-600">
                Прозрачный или на светлом фоне — PNG, JPG, SVG или WebP. На следующем экране покажем логотип.
              </p>
              <div className="mt-auto flex items-center gap-2 pt-12 text-sm font-semibold text-[#2E5A43] opacity-0 transition group-hover:opacity-100">
                Открыть проводник <ArrowRight className="h-4 w-4" />
              </div>
            </div>
          </motion.button>

          <motion.button
            type="button"
            whileHover={{ y: -4 }}
            whileTap={{ scale: 0.992 }}
            transition={{ type: "spring", stiffness: 420, damping: 28 }}
            onClick={() =>
              startTransition(() =>
                onPatch({
                  logoMode: "generate",
                  logoApprovedUrl: "",
                  logoChosenUrl: "",
                  logoGeneratedUrls: [],
                })
              )
            }
            className="vote-nav-shimmer-btn group relative flex min-h-[300px] flex-col overflow-hidden rounded-[2rem] border border-[#2E5A43]/22 bg-gradient-to-br from-[#f5fce8] via-[#ecfccb] to-[#daf6a8] p-10 text-left shadow-[0_34px_100px_-54px_rgba(46,90,67,0.58)] ring-1 ring-white/45 lg:min-h-[360px]"
          >
            <div className="pointer-events-none absolute inset-0 opacity-[0.35] [background-image:radial-gradient(circle_at_82%_18%,rgba(255,255,255,0.65),transparent_42%)]" />
            <div className="relative flex flex-1 flex-col text-[#070907]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-[#2E5A43]/75">Собрать знак</p>
              <h3 className="mt-5 text-[clamp(1.55rem,3vw,2.25rem)] font-semibold tracking-[-0.055em]">
                Сгенерировать сейчас
              </h3>
              <p className="mt-4 max-w-[36ch] text-[15px] leading-relaxed text-[#070907]/72">
                Два направления по вашим ответам в онбординге: форма знака и акцент на типографике. Логотипы сразу готовы для маркетплейсов и соцсетей.
              </p>
              <div className="mt-8 rounded-2xl border border-[#070907]/10 bg-white/45 px-5 py-4 backdrop-blur-sm">
                <p className="text-[13px] leading-relaxed text-[#070907]/68">
                  <span className="font-semibold text-[#070907]">{brandLabel}</span>
                  {draftNiche.trim() ? (
                    <>
                      {" "}
                      <span className="text-neutral-500">·</span> {draftNiche.trim()}
                    </>
                  ) : null}
                </p>
              </div>
              <div className="mt-auto flex items-center gap-2 pt-12 text-sm font-bold text-[#1a3d2e] opacity-95 transition group-hover:gap-3">
                Открыть студию <ArrowRight className="h-4 w-4" />
              </div>
            </div>
          </motion.button>
        </motion.div>
      )}

      {!showChooser && logoMode === "later" && (
        <div className="rounded-[1.5rem] border border-[#070907]/10 bg-[#E3DCC8]/35 px-6 py-7 text-base leading-relaxed text-neutral-600 md:px-9 md:text-lg">
          Логотип можно добавить позже в продукте. Нажмите «Готово» или{" "}
          <button
            type="button"
            className="font-semibold text-[#2E5A43] underline decoration-[#B9FF4B]/75 underline-offset-[5px] hover:text-[#070907]"
            onClick={() => resetToChooser()}
          >
            вернуться к выбору
          </button>
          .
        </div>
      )}

      {!showChooser && logoMode === "upload" && (
        <div className="flex min-h-0 flex-1 flex-col justify-center gap-10 lg:flex-row lg:items-center lg:gap-14 lg:py-4">
          <div className="relative mx-auto flex aspect-square w-full max-w-[min(92vw,440px)] items-center justify-center rounded-[2rem] border border-[#070907]/10 bg-gradient-to-b from-white/55 to-[#e8e3d8]/65 p-10 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] ring-1 ring-white/40 lg:mx-0 lg:max-w-[min(48vw,520px)]">
            {uploadDisplaySrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={uploadDisplaySrc}
                alt="Загруженный логотип"
                className="max-h-full max-w-full object-contain drop-shadow-[0_28px_60px_-42px_rgba(7,9,7,0.45)]"
              />
            ) : (
              <p className="text-center text-neutral-500">Выберите файл — логотип появится здесь.</p>
            )}
            {uploadRemoteBusy ? (
              <div
                className="absolute inset-0 flex items-center justify-center rounded-[inherit] bg-white/45 backdrop-blur-[2px]"
                aria-live="polite"
                aria-busy
              >
                <Loader2
                  className="h-10 w-10 animate-spin text-[#2E5A43]"
                  strokeWidth={2}
                  aria-hidden
                />
              </div>
            ) : null}
          </div>
          <div className="flex max-w-md flex-col gap-8 lg:py-6">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-neutral-400">Файл</p>
              <p className="mt-3 text-3xl font-semibold tracking-[-0.045em] text-[#070907] md:text-4xl">
                {logoFileName || "Не выбран"}
              </p>
              <p className="mt-4 text-sm leading-relaxed text-neutral-500">
                Показываем логотип на чистом фоне, чтобы удобно оценить читаемость и форму.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="vote-nav-shimmer-btn inline-flex items-center gap-2 rounded-full border border-[#2E5A43]/22 bg-[#070907] px-8 py-3.5 text-sm font-bold text-white shadow-[0_14px_44px_-30px_rgba(7,9,7,0.92)] transition hover:bg-[#2E5A43]"
              >
                <Upload className="h-4 w-4" />
                Выбрать файл
              </button>
              <button
                type="button"
                onClick={() => resetToChooser()}
                className="rounded-full border border-[#070907]/14 bg-white/50 px-6 py-3.5 text-sm font-semibold text-neutral-700 transition hover:bg-white/75"
              >
                Другой способ
              </button>
            </div>
          </div>
        </div>
      )}

      {!showChooser && logoMode === "generate" && (
        <div className="relative flex min-h-0 flex-1 flex-col">
          <div
            className={`mx-auto w-full max-w-[min(100vw,1420px)] px-3 md:px-8 ${
              hasGeneratedLogos
                ? "pb-[min(42vh,15rem)] pt-2 md:pb-[min(38vh,14rem)]"
                : "pb-10 pt-2"
            }`}
          >
            {logoGeneratedUrls.length === 0 && !showPairShimmer && (
              <div className="flex min-h-[min(42vh,440px)] flex-col items-center justify-center gap-10 px-2 py-12">
                <p className="max-w-2xl text-center text-[15px] leading-relaxed text-neutral-600 md:text-lg">
                  Сначала подготовим два логотипа по вашим ответам в онбординге. Новые варианты будут появляться сверху ленты.
                </p>
                <motion.div layout>
                  <button
                    type="button"
                    disabled={generating}
                    onClick={() => void callGenerate("pair", "initial")}
                    className="logo-generate-cta inline-flex items-center justify-center rounded-full border border-white/20 bg-[#0f1112] px-14 py-6 text-xl font-extrabold tracking-[-0.03em] text-white shadow-[0_28px_72px_-42px_rgba(7,9,7,0.95),inset_0_1px_0_rgba(255,255,255,0.12)] ring-1 ring-[#070907]/12 transition hover:-translate-y-0.5 hover:brightness-[1.02] disabled:translate-y-0 disabled:opacity-45 md:px-20 md:py-8 md:text-2xl"
                  >
                    Сгенерировать первые два варианта
                  </button>
                </motion.div>
              </div>
            )}

            {logoGeneratedUrls.length === 0 && showPairShimmer && (
              <div className="mx-auto grid w-full max-w-[min(100vw-1.5rem,680px)] grid-cols-2 gap-3 px-2 py-8 md:max-w-[760px] md:gap-5 md:py-12">
                <SquareGenSlot label="Логотип 1" tone="light" size="grid" pairCompact loading />
                <SquareGenSlot label="Логотип 2" tone="dark" size="grid" pairCompact loading />
              </div>
            )}

            {logoGeneratedUrls.length > 0 ? (
              <div className="mx-auto grid max-w-[min(100vw,860px)] grid-cols-2 gap-4 md:max-w-[min(100vw,920px)] md:gap-7">
                {showPairShimmer &&
                  logoGeneratedUrls.length > 0 &&
                  [0, 1].map((k) => (
                    <div key={`shimmer-${k}`} className="flex flex-col gap-2">
                      <SquareGenSlot
                        label="Новый логотип"
                        tone={k === 0 ? "light" : "dark"}
                        size="grid"
                        pairCompact
                        loading
                      />
                    </div>
                  ))}
                {logoGeneratedUrls.map((url, idx) => {
                  const picked = logoChosenUrl === url;
                  const v = imgBust[url] ?? 0;
                  const src = `${resolveImgSrc(url)}${v ? `?v=${v}` : ""}`;
                  return (
                    <div key={`${url}-${idx}`} className="flex flex-col gap-2.5">
                      <div
                        role="button"
                        tabIndex={0}
                        aria-pressed={picked}
                        aria-label={`Выбрать логотип ${idx + 1}`}
                        onClick={() => onPatch({ logoChosenUrl: url, logoApprovedUrl: "" })}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onPatch({ logoChosenUrl: url, logoApprovedUrl: "" });
                          }
                        }}
                        className={`group/logo-card relative block w-full cursor-pointer overflow-hidden rounded-[1.45rem] bg-transparent text-left outline-none transition-[transform,box-shadow] duration-200 focus-visible:ring-2 focus-visible:ring-[#070907]/35 focus-visible:ring-offset-2 focus-visible:ring-offset-[#FDFCF9] ${
                          picked
                            ? "shadow-[0_18px_48px_-36px_rgba(7,9,7,0.42)] ring-2 ring-[#070907]/88"
                            : "shadow-[0_12px_40px_-40px_rgba(7,9,7,0.28)] ring-1 ring-[#070907]/10 hover:-translate-y-0.5 hover:ring-[#070907]/16"
                        }`}
                      >
                        <span className="relative block aspect-square w-full bg-transparent">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={src}
                            alt={`Логотип ${idx + 1}`}
                            className="h-full w-full bg-transparent object-contain p-0"
                            loading="lazy"
                            decoding="async"
                            onError={() =>
                              setImgBust((prev) => ({
                                ...prev,
                                [url]: (prev[url] ?? 0) + 1,
                              }))
                            }
                          />
                        </span>
                        {/* Как в «Свободном творчестве»: в запрос как референс (плюс + стрелка) */}
                        {referenceSlots.length < 2 ? (
                          <div className="pointer-events-none absolute left-2 top-2 z-20 opacity-80 transition-opacity duration-200 md:opacity-0 md:group-hover/logo-card:opacity-100 sm:left-3 sm:top-3">
                            <button
                              type="button"
                              title="В запрос как референс (как в свободном творчестве)"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                addGeneratedLogoAsReference(url);
                              }}
                              className="pointer-events-auto rounded-full bg-black/45 p-2 ring-1 ring-white/25 backdrop-blur-[2px] transition hover:bg-black/60 hover:ring-white/35"
                            >
                              <span className="relative inline-flex drop-shadow-[0_1px_3px_rgba(0,0,0,0.55)]">
                                <Plus className="h-5 w-5 text-white" strokeWidth={2.5} />
                                <ArrowRight className="absolute -bottom-0.5 -right-0.5 h-3 w-3 text-white/95" strokeWidth={2.5} />
                              </span>
                            </button>
                          </div>
                        ) : null}
                        {picked ? (
                          <span className="absolute right-3 top-3 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-[#070907]/90 text-[#B9FF4B] shadow-md backdrop-blur-[2px]">
                            <Check className="h-4 w-4" strokeWidth={3} />
                          </span>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => onPatch({ logoChosenUrl: url, logoApprovedUrl: "" })}
                          className={`rounded-full px-5 py-2 text-[11px] font-bold uppercase tracking-wide md:text-xs ${
                            picked ? "bg-[#070907] text-white" : "bg-white/70 text-[#070907] ring-1 ring-[#070907]/10 hover:bg-white/90"
                          }`}
                        >
                          {picked ? "Выбран" : "Выбрать"}
                        </button>
                        <button
                          type="button"
                          disabled={downloadingLogoIdx !== null}
                          onClick={() => void downloadLogo(url, idx)}
                          className={`inline-flex items-center gap-1.5 rounded-full px-5 py-2 text-[11px] font-bold uppercase tracking-wide ring-1 ring-[#070907]/10 md:text-xs ${
                            downloadingLogoIdx === idx
                              ? "bg-[#2E5A43]/15 text-[#070907] ring-[#2E5A43]/25"
                              : "bg-white/70 text-[#070907] hover:bg-white/90"
                          } disabled:cursor-wait disabled:opacity-55`}
                        >
                          {downloadingLogoIdx === idx ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
                          ) : (
                            <Download className="h-3.5 w-3.5" />
                          )}
                          {downloadingLogoIdx === idx ? "Качаем…" : "Скачать"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>

          {dockPortalReady &&
            hasGeneratedLogos &&
            createPortal(
              <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[35] flex justify-center px-2 pb-[max(3.75rem,calc(3.5rem+env(safe-area-inset-bottom,0px)))] md:px-5 md:pb-[max(4rem,calc(3.85rem+env(safe-area-inset-bottom,0px)))]">
                <div
                  ref={logoDockRef}
                  className="pointer-events-auto relative w-full max-w-[min(96vw,920px)] rounded-[2rem] border border-white/60 bg-white/25 p-4 shadow-[0_28px_80px_-42px_rgba(7,9,7,0.42)] backdrop-blur-xl ring-1 ring-[#070907]/[0.05] md:p-5"
                >
                  <div className="flex flex-col gap-2 md:gap-2.5">
                    <div className="relative">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                        <button
                          type="button"
                          onClick={() => setContextPanelOpen((v) => !v)}
                          title="Какие данные онбординга попадают в промпт"
                          className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-1.5 text-left transition md:px-4 md:py-2 ${
                            contextPanelOpen
                              ? "border-[#2E5A43]/35 bg-[#B9FF4B]/25 text-[#070907]"
                              : "border-[#070907]/12 bg-white/35 text-[#070907] hover:bg-white/45"
                          }`}
                        >
                          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-neutral-500 md:text-[11px]">
                            Учитывать
                          </span>
                          <ChevronDown
                            className={`h-3.5 w-3.5 shrink-0 text-neutral-400 transition-transform md:h-4 md:w-4 ${contextPanelOpen ? "rotate-180" : ""}`}
                          />
                        </button>
                        <p className="min-w-0 max-w-[520px] flex-1 text-[10px] leading-snug text-neutral-500 md:text-[11px]">
                          Включённые пункты попадают в промпт; выключенные — нет. Если всё выкл., остаются ваша идея ниже и референсы справа.
                        </p>
                      </div>
                      {contextPanelOpen ? (
                        <div className="pointer-events-auto absolute bottom-[calc(100%+8px)] left-0 z-[50] w-full max-w-[340px] rounded-[1.35rem] border border-[#070907]/12 bg-[#FDFCF9]/98 p-3 shadow-[0_24px_64px_-28px_rgba(7,9,7,0.45)] backdrop-blur-lg">
                          <p className="border-b border-[#070907]/8 pb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">
                            Из онбординга в промпт
                          </p>
                          <div className="mt-2 grid max-h-[min(55vh,260px)] grid-cols-2 gap-x-4 gap-y-0 overflow-y-auto overscroll-contain pr-0.5 [-webkit-overflow-scrolling:touch]">
                            {CONTEXT_ROWS.map((item) => (
                              <IosToggleRow
                                key={item.key}
                                dense
                                label={item.label}
                                checked={contextEnabled[item.key]}
                                onChange={(next) =>
                                  setContextEnabled((prev) => ({ ...prev, [item.key]: next }))
                                }
                              />
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>

                    <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-end sm:gap-3">
                      <div className="min-h-0 min-w-0 flex-1">
                        <label htmlFor="logo-prompt" className="sr-only">
                          Идея для следующей генерации
                        </label>
                        <textarea
                          ref={promptRef}
                          id="logo-prompt"
                          value={promptInput}
                          onChange={(e) => setPromptInput(e.target.value)}
                          placeholder="Опишите идею логотипа и правки. «Учитывать» — блок из онбординга; справа — до двух референсов."
                          rows={3}
                          className="min-h-[6.125rem] w-full max-h-[13rem] resize-none rounded-[2rem] border border-white/60 bg-white/28 px-5 py-4 text-lg font-semibold leading-snug tracking-[-0.035em] text-[#070907] outline-none placeholder:font-medium placeholder:text-neutral-400 focus:border-[#B9FF4B]/80 focus:bg-white/38 md:min-h-[6.75rem] md:px-6 md:py-5 md:text-xl"
                        />
                      </div>

                      <div className="flex shrink-0 flex-nowrap items-end justify-end gap-1.5 self-end sm:gap-2">
                        <span className="sr-only">Референсы для генерации</span>
                        {referenceSlots.map((slot, refIdx) => (
                          <div
                            key={`ref-${refIdx}-${slot.input.slice(0, 48)}`}
                            className="group relative h-11 w-11 shrink-0 sm:h-[3.15rem] sm:w-[3.15rem]"
                          >
                            <div className="relative h-full w-full overflow-hidden rounded-2xl border border-[#070907]/16 bg-white/55 ring-1 ring-[#070907]/8 sm:rounded-[1.05rem]">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={slot.input}
                                alt={`Референс ${refIdx + 1}`}
                                className="h-full w-full object-cover"
                              />
                            </div>
                            <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/45 opacity-0 transition-opacity duration-200 group-hover:opacity-100 sm:rounded-[1.05rem]">
                              <button
                                type="button"
                                title="Убрать референс"
                                onClick={() =>
                                  setReferenceSlots((prev) => prev.filter((_, i) => i !== refIdx))
                                }
                                className="text-[26px] font-bold leading-none text-white hover:text-white/90"
                                style={{ lineHeight: 1 }}
                              >
                                ×
                              </button>
                            </div>
                            <div className="pointer-events-none absolute bottom-full left-1/2 z-[55] mb-1.5 -translate-x-1/2 opacity-0 transition-opacity duration-200 group-hover:pointer-events-auto group-hover:opacity-100">
                              <div className="relative overflow-hidden rounded-2xl border-2 border-[#070907]/14 bg-[#F3F1EA] shadow-2xl">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={slot.input}
                                  alt=""
                                  className="block max-h-[200px] max-w-[min(72vw,260px)] object-contain"
                                />
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setReferenceSlots((prev) => prev.filter((_, i) => i !== refIdx));
                                  }}
                                  className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-lg leading-none text-white transition-colors hover:bg-black/70"
                                  aria-label="Удалить референс"
                                >
                                  ×
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                        {referenceSlots.length < 2 ? (
                          <button
                            type="button"
                            title="Добавить изображение-референс (до 2)"
                            onClick={() => logoReferenceInputRef.current?.click()}
                            className="mb-0.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border-2 border-dashed border-[#070907]/22 bg-white/35 text-[#070907]/50 shadow-[0_8px_24px_-18px_rgba(7,9,7,0.35)] transition hover:border-[#2E5A43]/35 hover:bg-white/48 hover:text-[#070907] sm:h-[3.15rem] sm:w-[3.15rem] sm:rounded-[1.05rem]"
                          >
                            <Plus className="h-5 w-5" strokeWidth={2} />
                          </button>
                        ) : null}
                        <input
                          ref={logoReferenceInputRef}
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          onChange={(ev) => void handleLogoReferenceUpload(ev)}
                        />

                        <motion.button
                          type="button"
                          whileHover={{ scale: 1.04 }}
                          whileTap={{ scale: 0.96 }}
                          disabled={generating}
                          onClick={() => void callGenerate("pair", "custom")}
                          title="Сгенерировать ещё два варианта"
                          className="mb-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#4ADE80] text-white shadow-[0_14px_36px_-22px_rgba(46,90,67,0.55)] transition-all disabled:cursor-not-allowed disabled:opacity-35 sm:h-[3.15rem] sm:w-[3.15rem] sm:rounded-[1.05rem]"
                        >
                          {generating ? (
                            <Loader2 className="h-5 w-5 animate-spin" strokeWidth={2} />
                          ) : (
                            <ArrowRight className="h-5 w-5" strokeWidth={2.5} />
                          )}
                        </motion.button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>,
              document.body
            )}

          {error ? (
            <div className="rounded-2xl border border-red-200/90 bg-red-50/95 px-5 py-4 text-sm font-medium leading-relaxed text-red-900">
              {error}
            </div>
          ) : null}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/svg+xml,image/webp"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          setupUploadPreview(file);
          event.target.value = "";
        }}
      />
    </div>
  );
}
