"use client";

import { useState, useEffect, useRef, useMemo, useLayoutEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  Loader2,
  Sparkles,
  Info,
  X,
  Copy,
  ImagePlus,
  FileText as FileTextIcon,
  Pencil,
  Bold,
  SmilePlus,
} from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  checkStopWords,
  getStopWordMessage,
  formatForCopy,
  lightSanitizeDescriptionStream,
} from "@/lib/utils/marketplace-formatter";
import {
  descriptionToEditableHtml,
  editableHtmlToDescription,
  stripDescriptionMarkup,
} from "@/lib/utils/description-markup";
import { FlowProductDescription } from "@/components/studio/ProductDescriptionDisplay";
import { KartoVoiceTextarea } from "@/components/shared/karto-voice-textarea";
import { KartoAiOrb } from "@/components/auto-replies/workspace/karto-ai-orb";

type DescriptionTextLength = "shorter" | "medium" | "longer";

const C = {
  beige: "#f5f3ef",
  ink: "#0a0a0a",
  white: "#ffffff",
  lime: "#B9FF4B",
  green: "#1F4E3D",
  greenMid: "#2E5A43",
  border: "#E2E1DA",
  field: "#FDFDFB",
  muted: "#6b6b66",
  softBeige: "#faf8f5",
} as const;

const PAPER_SHADOW =
  "0 4px 6px rgba(0,0,0,0.02), 0 20px 40px rgba(0,0,0,0.04)";
const PANEL_SHADOW = "0 4px 30px rgba(0,0,0,0.02)";

const TEXT_LENGTH_OPTIONS: { id: DescriptionTextLength; label: string }[] = [
  { id: "shorter", label: "Короче" },
  { id: "medium", label: "Авто" },
  { id: "longer", label: "Длиннее" },
];

const EDITOR_STICKERS = [
  "✓",
  "★",
  "✨",
  "🔥",
  "❤️",
  "🎁",
  "👍",
  "⚡",
  "🌿",
  "💎",
  "📦",
  "🛡️",
  "🚀",
  "💯",
  "🎯",
  "🌟",
  "💪",
  "🛒",
  "📌",
  "🍀",
] as const;

const WB_CHAR_LIMIT = 2000;
const OZON_CHAR_LIMIT = 5500;
const OZON_CHAR_SOFT = 5000;

interface DescriptionVariant {
  id: number;
  style: string;
  description: string;
  preview: string;
}

const STYLE_CONFIG = {
  1: { label: "Официальный", emoji: "👔" },
  2: { label: "Продающий", emoji: "🔥" },
  3: { label: "Структура", emoji: "📋" },
  4: { label: "Баланс", emoji: "⚖️" },
};

const PREFERENCE_CHIPS = [
  "С юмором",
  "Строго",
  "Для мам",
  "Стикеры/эмодзи",
  "Более официально",
  "С акцентами и списками",
  "Кратко, но с характеристиками",
  "Сделай упор на подарок",
  "Для подарка",
  "Универсально",
];

function computeQuality(text: string) {
  const plain = stripDescriptionMarkup(text);
  const issues = checkStopWords(lightSanitizeDescriptionStream(plain));
  const charCount = plain.length;
  const exceedsOzon = charCount > OZON_CHAR_LIMIT;
  const nearOzon = charCount > OZON_CHAR_SOFT && charCount <= OZON_CHAR_LIMIT;
  const exceedsWb = charCount > WB_CHAR_LIMIT;
  const lengthPenalty = exceedsOzon ? 35 : nearOzon ? 12 : exceedsWb ? 18 : 0;
  const stopWordsPenalty = Math.min(issues.length * 5, 30);
  const qualityScore = Math.max(0, 100 - lengthPenalty - stopWordsPenalty);

  let lengthLabel: string;
  let lengthTone: "ok" | "warn" | "bad";
  if (exceedsOzon) {
    lengthLabel = `Слишком длинно для Ozon (>${OZON_CHAR_LIMIT})`;
    lengthTone = "bad";
  } else if (exceedsWb) {
    lengthLabel = "Для Wildberries длина неудовлетворительная";
    lengthTone = "warn";
  } else if (nearOzon) {
    lengthLabel = "Близко к лимиту Ozon";
    lengthTone = "warn";
  } else {
    lengthLabel = `${charCount} зн.`;
    lengthTone = "ok";
  }

  return {
    issues,
    charCount,
    exceedsOzon,
    nearOzon,
    exceedsWb,
    lengthLabel,
    lengthTone,
    qualityScore,
  };
}

function lengthStatusForPaper(charCount: number): { label: string; color: string } | null {
  if (charCount > OZON_CHAR_LIMIT) {
    return { label: `Превышен лимит Ozon (${OZON_CHAR_LIMIT})`, color: "#dc2626" };
  }
  if (charCount > WB_CHAR_LIMIT) {
    return {
      label: "Для Wildberries длина неудовлетворительная",
      color: "#d97706",
    };
  }
  return null;
}

const GEN_LOADING_PHRASES = [
  "Пишем официальный стиль…",
  "Собираем продающий вариант…",
  "Выстраиваем структуру…",
  "Балансируем тон…",
] as const;

function DescriptionGeneratingPanel() {
  const [phraseIdx, setPhraseIdx] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setPhraseIdx((i) => (i + 1) % GEN_LOADING_PHRASES.length);
    }, 2200);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div
      className="relative flex min-h-[460px] flex-col items-center justify-center overflow-hidden px-8 py-12"
      style={{
        borderRadius: 16,
        background: C.white,
        boxShadow: PAPER_SHADOW,
      }}
    >
      <motion.div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 90% 60% at 50% 0%, rgba(185,255,75,0.14) 0%, transparent 55%), radial-gradient(ellipse 70% 50% at 80% 100%, rgba(31,78,61,0.06) 0%, transparent 50%)",
        }}
        animate={{ opacity: [0.45, 0.75, 0.5, 0.7, 0.48] }}
        transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut" }}
        aria-hidden
      />
      <div className="karto-ai-scan-line pointer-events-none absolute inset-y-0 left-0 w-[38%] opacity-60" />

      <div className="relative z-[1] flex flex-col items-center">
        <KartoAiOrb size={78} durationSec={14} />
        <p className="mt-5 text-[15px] font-semibold" style={{ color: C.ink }}>
          Генерируем 4 варианта описания
        </p>
        <AnimatePresence mode="wait">
          <motion.p
            key={phraseIdx}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.28 }}
            className="mt-1.5 text-sm"
            style={{ color: C.muted }}
          >
            {GEN_LOADING_PHRASES[phraseIdx]}
          </motion.p>
        </AnimatePresence>
      </div>

      <div className="relative z-[1] mt-10 w-full max-w-md space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <motion.div
            key={i}
            className="relative h-3.5 overflow-hidden rounded-full"
            style={{
              background: "rgba(0,0,0,0.05)",
              width: `${88 - i * 8}%`,
              marginLeft: i % 2 === 0 ? 0 : "6%",
            }}
            initial={{ opacity: 0.35 }}
            animate={{ opacity: [0.35, 0.7, 0.4, 0.65, 0.38] }}
            transition={{
              duration: 2.1 + i * 0.15,
              delay: i * 0.12,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          >
            <motion.span
              className="pointer-events-none absolute inset-y-0 w-[45%] rounded-full"
              style={{
                background:
                  "linear-gradient(90deg, transparent, rgba(185,255,75,0.55), transparent)",
              }}
              animate={{ left: ["-45%", "110%"] }}
              transition={{
                duration: 2.4,
                repeat: Infinity,
                ease: "linear",
                delay: i * 0.2,
              }}
            />
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function chipIsActive(preferences: string, chip: string): boolean {
  return preferences.toLowerCase().includes(chip.toLowerCase());
}

export default function SeoDescriptionsPage() {
  const router = useRouter();
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const styleTabsRef = useRef<HTMLDivElement | null>(null);
  const styleTabBtnRefs = useRef<Record<number, HTMLButtonElement | null>>({});

  const [productName, setProductName] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [userPreferences, setUserPreferences] = useState("");
  const [textLength, setTextLength] = useState<DescriptionTextLength>("medium");
  const [showHowItWorks, setShowHowItWorks] = useState(false);

  const [isGenerating, setIsGenerating] = useState(false);
  const [variants, setVariants] = useState<DescriptionVariant[]>([]);
  const [selectedVariantId, setSelectedVariantId] = useState<number | null>(null);
  const [expandedVariantId, setExpandedVariantId] = useState<number | null>(null);

  const [editInstructions, setEditInstructions] = useState("");
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [finalDescription, setFinalDescription] = useState<string | null>(null);
  const [copiedVariantId, setCopiedVariantId] = useState<number | null>(null);
  const [acceptDone, setAcceptDone] = useState(false);
  const [genHovered, setGenHovered] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showStickerPicker, setShowStickerPicker] = useState(false);
  const [tabCaret, setTabCaret] = useState({ left: 0, width: 0 });
  const [showCopyOzonHint, setShowCopyOzonHint] = useState(false);
  const [editorHtmlSeed, setEditorHtmlSeed] = useState("");
  const [editorEpoch, setEditorEpoch] = useState(0);

  useEffect(() => {
    const navbar = document.querySelector("header");
    const footer = document.querySelector("footer");
    if (navbar) navbar.style.display = "none";
    if (footer) footer.style.display = "none";
    return () => {
      if (navbar) navbar.style.display = "";
      if (footer) footer.style.display = "";
    };
  }, []);

  const handlePhotoChange = (file: File | null) => {
    if (!file) {
      setPhotoUrl(null);
      return;
    }
    if (!file.type.startsWith("image/")) {
      alert("Выберите изображение");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") setPhotoUrl(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const togglePreferenceChip = (chip: string) => {
    const lower = chip.toLowerCase();
    const current = userPreferences.trim();
    if (chipIsActive(current, chip)) {
      const parts = current
        .split(/,\s*/)
        .map((p) => p.trim())
        .filter((p) => p && p.toLowerCase() !== lower);
      setUserPreferences(parts.join(", "));
      return;
    }
    if (current && !current.endsWith(".") && !current.endsWith(",")) {
      setUserPreferences(current + ", " + lower);
    } else {
      setUserPreferences(current + (current ? " " : "") + lower);
    }
  };

  const handleGenerate = async () => {
    if (!productName.trim()) {
      alert("Название товара обязательно");
      return;
    }

    setIsGenerating(true);
    setIsEditing(false);
    setShowStickerPicker(false);
    setVariants([]);
    setSelectedVariantId(null);
    setExpandedVariantId(null);
    setFinalDescription(null);
    setAcceptDone(false);
    setEditInstructions("");

    try {
      const wantsStickers =
        userPreferences.toLowerCase().includes("стикеры/эмодзи") ||
        userPreferences.toLowerCase().includes("стикеры") ||
        userPreferences.toLowerCase().includes("эмодзи");

      const response = await fetch("/api/generate-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_name: productName.trim(),
          photo_url: photoUrl?.startsWith("http") ? photoUrl : null,
          user_preferences: userPreferences.trim(),
          selected_blocks: [],
          wants_stickers: wantsStickers,
          text_length: textLength,
          mark_highlights: true,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Неизвестная ошибка" }));
        const hint = errorData.hint ? `\n\n${errorData.hint}` : "";
        alert(
          `Ошибка генерации описаний: ${errorData.error || errorData.details || "Попробуйте еще раз"}${hint}`
        );
        return;
      }

      const data = await response.json();

      if (data.success && data.variants && Array.isArray(data.variants) && data.variants.length > 0) {
        setVariants(data.variants);
        setExpandedVariantId(1);
        setSelectedVariantId(1);
      } else {
        alert("Ошибка: описания не были сгенерированы. Попробуйте еще раз.");
      }
    } catch (error: unknown) {
      if (error instanceof Error && error.name === "AbortError") return;
      alert(
        `Ошибка соединения: ${error instanceof Error ? error.message : "Проверьте подключение к интернету и попробуйте еще раз"}`
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const selectTab = (variantId: number) => {
    if (isEditing && editorRef.current) {
      const next = editableHtmlToDescription(editorRef.current.innerHTML);
      if (next.trim()) {
        setVariants((prev) =>
          prev.map((v) =>
            v.id === (expandedVariantId ?? selectedVariantId)
              ? {
                  ...v,
                  description: next,
                  preview: next.slice(0, 150) + (next.length > 150 ? "…" : ""),
                }
              : v
          )
        );
        if (finalDescription !== null) setFinalDescription(next);
      }
    }
    setExpandedVariantId(variantId);
    setSelectedVariantId(variantId);
    setFinalDescription(null);
    setIsEditing(false);
    setShowStickerPicker(false);
  };

  const handleRegenerate = async () => {
    const targetId = selectedVariantId ?? expandedVariantId;
    if (!editInstructions.trim() || !targetId) {
      alert("Укажите, что нужно изменить");
      return;
    }

    const selectedVariant = variants.find((v) => v.id === targetId);
    if (!selectedVariant) return;

    // Берём актуальный текст: правки с листа / финал / исходный вариант
    let currentText = selectedVariant.description;
    if (isEditing && editorRef.current) {
      const fromEditor = editableHtmlToDescription(editorRef.current.innerHTML);
      if (fromEditor.trim()) currentText = fromEditor;
    } else if (finalDescription) {
      currentText = finalDescription;
    }

    setIsEditing(false);
    setShowStickerPicker(false);
    setIsRegenerating(true);

    try {
      const wantsStickers =
        userPreferences.toLowerCase().includes("стикеры/эмодзи") ||
        userPreferences.toLowerCase().includes("стикеры") ||
        userPreferences.toLowerCase().includes("эмодзи");

      const response = await fetch("/api/generate-description", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_name: productName.trim(),
          photo_url: photoUrl?.startsWith("http") ? photoUrl : null,
          user_preferences: userPreferences.trim(),
          selected_blocks: [],
          current_description: currentText,
          edit_instructions: editInstructions.trim(),
          wants_stickers: wantsStickers,
          selected_style: selectedVariant.id,
          text_length: textLength,
          mark_highlights: true,
        }),
      });

      const data = await response.json();

      if (data.success && data.description) {
        const next = String(data.description);
        setVariants((prev) =>
          prev.map((v) =>
            v.id === targetId
              ? {
                  ...v,
                  description: next,
                  preview: next.slice(0, 150) + (next.length > 150 ? "…" : ""),
                }
              : v
          )
        );
        setFinalDescription(null);
        setEditInstructions("");
        setAcceptDone(false);
        setExpandedVariantId(targetId);
        setSelectedVariantId(targetId);
      } else {
        alert("Ошибка перегенерации. Попробуйте еще раз.");
      }
    } catch {
      alert("Ошибка соединения. Попробуйте еще раз.");
    } finally {
      setIsRegenerating(false);
    }
  };

  const applySavedText = (next: string) => {
    const targetId = expandedVariantId ?? selectedVariantId;
    if (targetId) {
      setVariants((prev) =>
        prev.map((v) =>
          v.id === targetId
            ? {
                ...v,
                description: next,
                preview: next.slice(0, 150) + (next.length > 150 ? "…" : ""),
              }
            : v
        )
      );
    }
    if (finalDescription !== null) {
      setFinalDescription(next);
    }
  };

  const flushEditorIfNeeded = (): string | null => {
    if (!isEditing || !editorRef.current) return null;
    const next = editableHtmlToDescription(editorRef.current.innerHTML);
    if (!next.trim()) return null;
    return next;
  };

  const copyText = async (text: string, variantId: number) => {
    // Если идёт правка — сначала сохраняем в состояние, копируем уже сохранённый текст
    let source = text;
    const flushed = flushEditorIfNeeded();
    if (flushed) {
      applySavedText(flushed);
      setIsEditing(false);
      setShowStickerPicker(false);
      source = flushed;
    }

    const textToCopy = formatForCopy(source);
    let copied = false;
    try {
      await navigator.clipboard.writeText(textToCopy);
      copied = true;
    } catch {
      try {
        const textArea = document.createElement("textarea");
        textArea.value = textToCopy;
        textArea.setAttribute("readonly", "");
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        textArea.style.top = "0";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        copied = document.execCommand("copy");
        document.body.removeChild(textArea);
      } catch {
        copied = false;
      }
    }

    if (!copied) {
      alert("Не удалось скопировать. Выделите текст вручную.");
      return;
    }

    setCopiedVariantId(variantId);
    setAcceptDone(true);
    setShowCopyOzonHint(true);
    setTimeout(() => {
      setCopiedVariantId(null);
      setAcceptDone(false);
    }, 1800);
    setTimeout(() => setShowCopyOzonHint(false), 7000);
  };

  const handleConfirm = async () => {
    const descriptionToSave =
      finalDescription ||
      variants.find((v) => v.id === (selectedVariantId ?? expandedVariantId ?? 1))
        ?.description;

    if (!descriptionToSave) {
      alert("Выберите или сгенерируйте описание");
      return;
    }

    await copyText(
      descriptionToSave,
      selectedVariantId ?? expandedVariantId ?? -1
    );
  };

  const activeDescriptionText = useMemo(() => {
    if (finalDescription) return finalDescription;
    if (variants.length === 0) return "";
    const active =
      variants.find((v) => v.id === expandedVariantId) ||
      variants.find((v) => v.id === 1) ||
      variants[0];
    return active?.description || "";
  }, [finalDescription, variants, expandedVariantId]);

  const quality = useMemo(
    () => (activeDescriptionText ? computeQuality(activeDescriptionText) : null),
    [activeDescriptionText]
  );

  const hasResults = variants.length > 0 || Boolean(finalDescription);
  const activeTabId = expandedVariantId ?? (variants.length > 0 ? 1 : null);
  const showFloatingPrompt = variants.length > 0 && !isGenerating && !isEditing;

  const startInlineEdit = () => {
    const seed = descriptionToEditableHtml(activeDescriptionText);
    setEditorHtmlSeed(seed);
    setEditorEpoch((n) => n + 1);
    setShowStickerPicker(false);
    setIsEditing(true);
  };

  const saveInlineEdit = () => {
    if (!editorRef.current) {
      setIsEditing(false);
      setShowStickerPicker(false);
      return;
    }
    const next = editableHtmlToDescription(editorRef.current.innerHTML);
    if (next.trim()) {
      applySavedText(next);
    }
    setIsEditing(false);
    setShowStickerPicker(false);
  };

  const applyBoldToSelection = () => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    // execCommand сохраняет <b>/<strong>; при сохранении конвертируем в **
    document.execCommand("bold", false);
  };

  const insertSticker = (sticker: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    const inserted = document.execCommand("insertText", false, sticker);
    if (!inserted) {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) {
        editor.append(document.createTextNode(sticker));
        return;
      }
      const range = selection.getRangeAt(0);
      range.deleteContents();
      const node = document.createTextNode(sticker);
      range.insertNode(node);
      range.setStartAfter(node);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    }
  };

  useLayoutEffect(() => {
    if (!activeTabId || variants.length === 0) return;
    const container = styleTabsRef.current;
    const btn = styleTabBtnRefs.current[activeTabId];
    if (!container || !btn) return;
    const cRect = container.getBoundingClientRect();
    const bRect = btn.getBoundingClientRect();
    setTabCaret({
      left: bRect.left - cRect.left,
      width: bRect.width,
    });
  }, [activeTabId, variants.length, finalDescription]);

  const CopyButton = ({
    onClick,
    copied,
    large,
  }: {
    onClick: () => void;
    copied: boolean;
    large?: boolean;
  }) => (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl font-semibold transition-[background-color,box-shadow,transform,color] duration-200 active:scale-[0.96] ${
        large ? "w-full px-5 py-3.5 text-sm" : "px-3.5 py-2 text-xs"
      }`}
      style={{
        background: copied ? C.lime : C.green,
        color: copied ? C.ink : C.white,
        boxShadow: copied
          ? "0 0 0 2px rgba(185,255,75,0.35), 0 4px 14px rgba(185,255,75,0.35)"
          : "0 4px 14px rgba(31, 78, 61, 0.25)",
      }}
    >
      {copied ? (
        <>
          <Check className={large ? "h-5 w-5" : "h-3.5 w-3.5"} strokeWidth={2.5} />
          ✓ Скопировано!
        </>
      ) : (
        <>
          <Copy className={large ? "h-5 w-5" : "h-3.5 w-3.5"} />
          Копировать
        </>
      )}
    </button>
  );

  const EditSaveButton = () => (
    <button
      type="button"
      onClick={() => {
        if (isEditing) saveInlineEdit();
        else startInlineEdit();
      }}
      className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition-[background-color,color,transform] duration-200 active:scale-[0.96]"
      style={{
        background: isEditing ? C.ink : C.white,
        color: isEditing ? C.white : C.ink,
        border: `1px solid ${C.ink}`,
      }}
    >
      {isEditing ? (
        <>
          <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
          Сохранить
        </>
      ) : (
        <>
          <Pencil className="h-3.5 w-3.5" />
          Редактировать
        </>
      )}
    </button>
  );

  return (
    <div
      className="relative flex min-h-screen flex-col"
      style={{ background: C.beige, WebkitFontSmoothing: "antialiased" }}
    >
      <div
        className="relative z-[1] mx-auto flex w-[95vw] max-w-[1400px] flex-1 flex-col py-5 md:py-6"
      >
        {/* Header */}
        <div className="mb-5 flex items-start gap-4 md:mb-6">
          <button
            type="button"
            onClick={() => router.push("/")}
            className="flex shrink-0 items-center transition-opacity hover:opacity-80"
          >
            <Image
              src="/logo-flow.png"
              alt="KARTO"
              width={64}
              height={64}
              className="object-contain"
              priority
              unoptimized
              style={{ width: "auto", height: "3.25rem", maxHeight: "52px" }}
            />
          </button>
          <div className="min-w-0 flex-1 pt-0.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1
                className="text-2xl font-bold md:text-3xl"
                style={{
                  fontFamily: "var(--font-serif), Georgia, serif",
                  color: C.ink,
                  lineHeight: 1.15,
                  textWrap: "balance",
                }}
              >
                SEO-описания
              </h1>
              <span
                className="rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide"
                style={{ background: C.lime, color: C.ink }}
              >
                Бесплатно
              </span>
            </div>
            <p
              className="mt-1 text-sm md:text-[15px]"
              style={{ color: C.muted, lineHeight: 1.5 }}
            >
              Соберём описание с учётом ваших пожеланий — так, чтобы оно подошло маркетплейсу.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowHowItWorks((v) => !v)}
            className="hidden shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium sm:inline-flex"
            style={{
              background: showHowItWorks ? C.white : "transparent",
              border: `1px solid ${C.border}`,
              color: C.ink,
            }}
          >
            <Info className="h-4 w-4" />
            Как это работает?
          </button>
        </div>

        <AnimatePresence initial={false}>
          {showHowItWorks && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
              className="mb-5 rounded-[20px] p-4"
              style={{
                background: C.white,
                border: `1px solid ${C.border}`,
                boxShadow: PANEL_SHADOW,
              }}
            >
              <div className="mb-2 flex items-start justify-between gap-3">
                <h2
                  className="text-base font-semibold"
                  style={{ fontFamily: "var(--font-serif), Georgia, serif", color: C.ink }}
                >
                  Как это работает?
                </h2>
                <button
                  type="button"
                  onClick={() => setShowHowItWorks(false)}
                  className="rounded-lg p-1"
                  style={{ color: C.muted }}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="space-y-1 text-sm" style={{ color: C.muted, lineHeight: 1.55 }}>
                <p>• Товар, пожелания и длина — Короче / Авто / Длиннее</p>
                <p>• ИИ даст 4 стиля описания; выберите подходящий</p>
                <p>• Правки на листе или через «Что изменить», затем копируйте в карточку</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Workspace: широкая панель настроек + лист по ширине текста */}
        <div className="flex flex-col items-stretch gap-8 lg:flex-row lg:items-start">
          {/* LEFT — шире, комфортный ввод */}
          <aside
            className="flex h-fit w-full shrink-0 flex-col lg:w-[540px] lg:max-w-[540px]"
            style={{
              borderRadius: 20,
              background: C.white,
              boxShadow: PANEL_SHADOW,
              border: `1px solid ${C.border}`,
            }}
          >
            <div className="flex flex-col gap-4 p-6 pb-3">
              {/* Product — compact */}
              <section>
                <label
                  className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.06em]"
                  style={{ color: C.muted }}
                >
                  Товар
                </label>
                <div className="flex items-center gap-3.5">
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handlePhotoChange(e.target.files?.[0] ?? null)}
                  />
                  <button
                    type="button"
                    onClick={() => photoInputRef.current?.click()}
                    className="relative flex h-[96px] w-[96px] shrink-0 items-center justify-center overflow-hidden transition-transform active:scale-[0.96]"
                    style={{
                      borderRadius: 12,
                      background: C.softBeige,
                      border: `1px solid ${C.border}`,
                      outline: photoUrl ? "1px solid rgba(0,0,0,0.1)" : undefined,
                      outlineOffset: "-1px",
                    }}
                  >
                    {photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={photoUrl}
                        alt="Товар"
                        className="h-full w-full object-cover"
                        style={{ borderRadius: 12 }}
                      />
                    ) : (
                      <ImagePlus className="h-5 w-5" style={{ color: C.ink }} />
                    )}
                  </button>
                  <div className="min-w-0 flex-1">
                    <input
                      type="text"
                      value={productName}
                      onChange={(e) => setProductName(e.target.value)}
                      placeholder="Название для маркетплейса"
                      className="w-full rounded-[10px] px-3.5 py-2.5 text-[15px] outline-none transition-[border-color,box-shadow]"
                      style={{
                        background: C.white,
                        border: `1px solid ${C.border}`,
                        color: C.ink,
                      }}
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = C.ink;
                        e.currentTarget.style.boxShadow =
                          "0 0 0 3px rgba(185, 255, 75, 0.35)";
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = C.border;
                        e.currentTarget.style.boxShadow = "none";
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => photoInputRef.current?.click()}
                      className="mt-1.5 text-xs font-semibold"
                      style={{ color: C.ink }}
                    >
                      {photoUrl ? "Заменить фото" : "Фото (необяз.)"}
                    </button>
                  </div>
                </div>
              </section>

              {/* Preferences — compact */}
              <section>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <label
                    className="block text-[11px] font-semibold uppercase tracking-[0.06em]"
                    style={{ color: C.muted }}
                  >
                    Пожелания
                  </label>
                  <div
                    className="relative inline-flex rounded-[12px] p-1"
                    style={{ background: "rgba(0,0,0,0.06)" }}
                    role="group"
                    aria-label="Длина текста"
                  >
                    {TEXT_LENGTH_OPTIONS.map((opt) => {
                      const active = textLength === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setTextLength(opt.id)}
                          className="relative z-[1] rounded-[9px] px-3.5 py-1.5 text-[13px] font-semibold transition-[color,background-color] duration-200"
                          style={{
                            background: active ? C.ink : "transparent",
                            color: active ? C.white : C.muted,
                          }}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <KartoVoiceTextarea
                  value={userPreferences}
                  onChange={setUserPreferences}
                  placeholder="Стиль, акценты, аудитория… Можно надиктовать голосом."
                  ariaLabel="Пожелания к описанию"
                  micSize="md"
                  minHeightClass="min-h-[120px]"
                  textareaClassName="rounded-[10px] px-3.5 py-2.5 text-[15px] leading-[1.5] sm:text-[15px]"
                  textareaStyle={{
                    background: C.field,
                    border: `1px solid ${C.border}`,
                    color: C.ink,
                    resize: "none",
                  }}
                  hintClassName="text-xs"
                  hintStyle={{ color: C.muted }}
                />
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {PREFERENCE_CHIPS.map((chip) => {
                    const active = chipIsActive(userPreferences, chip);
                    return (
                      <button
                        key={chip}
                        type="button"
                        onClick={() => togglePreferenceChip(chip)}
                        className="rounded-lg px-2.5 py-1 text-[11px] font-semibold tracking-tight transition-[background-color,color,border-color,transform] duration-200 active:scale-[0.96]"
                        style={{
                          background: active ? C.ink : C.white,
                          color: active ? C.white : C.ink,
                          border: `1px solid ${active ? C.ink : "#C8C6BC"}`,
                        }}
                      >
                        + {chip}
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Quality — beige widget */}
              {quality && (
                <section
                  className="rounded-2xl p-4"
                  style={{
                    background: C.softBeige,
                    color: C.ink,
                    border: `1px solid ${C.border}`,
                    boxShadow: "0 4px 16px rgba(0,0,0,0.04)",
                  }}
                >
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p
                      className="text-[12px] font-semibold uppercase tracking-[0.08em]"
                      style={{ color: C.muted }}
                    >
                      Качество текста
                    </p>
                    <div className="relative h-14 w-14 shrink-0">
                      <svg width="56" height="56" viewBox="0 0 56 56">
                        <circle
                          cx="28"
                          cy="28"
                          r="21"
                          stroke="rgba(0,0,0,0.08)"
                          strokeWidth="4"
                          fill="none"
                        />
                        <circle
                          cx="28"
                          cy="28"
                          r="21"
                          stroke={C.greenMid}
                          strokeWidth="4"
                          fill="none"
                          strokeDasharray={`${quality.qualityScore * 1.32} 999`}
                          strokeLinecap="round"
                          transform="rotate(-90 28 28)"
                        />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span
                          className="text-[13px] font-bold tabular-nums"
                          style={{ color: C.ink }}
                        >
                          {quality.qualityScore}%
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2 text-[13px]">
                    <div className="flex justify-between gap-2">
                      <span style={{ color: C.muted }}>Длина</span>
                      <span
                        className="max-w-[62%] text-right font-semibold leading-snug"
                        style={{
                          color:
                            quality.lengthTone === "bad"
                              ? "#dc2626"
                              : quality.lengthTone === "warn"
                                ? "#d97706"
                                : C.greenMid,
                        }}
                      >
                        {quality.lengthLabel}
                      </span>
                    </div>
                    <div className="flex justify-between gap-2 text-[11px]" style={{ color: C.muted }}>
                      <span>WB ≤ {WB_CHAR_LIMIT}</span>
                      <span>Ozon ≤ {OZON_CHAR_LIMIT}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span style={{ color: C.muted }}>Стоп-слова</span>
                      <span
                        className="inline-flex items-center gap-1.5 font-semibold"
                        style={{
                          color: quality.issues.length > 0 ? "#dc2626" : C.greenMid,
                        }}
                      >
                        {quality.issues.length > 0 ? `${quality.issues.length}` : "Нет"}
                        {quality.issues.length === 0 && <Check className="h-3.5 w-3.5" />}
                      </span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span style={{ color: C.muted }}>Формат</span>
                      <span
                        className="inline-flex items-center gap-1.5 font-semibold"
                        style={{ color: C.greenMid }}
                      >
                        Plain text
                        <Check className="h-3.5 w-3.5" />
                      </span>
                    </div>
                  </div>
                </section>
              )}
            </div>

            {/* Generate — large black, radius 12 */}
            <div className="px-6 pb-5 pt-1">
              <button
                type="button"
                onClick={handleGenerate}
                disabled={isGenerating || !productName.trim()}
                onMouseEnter={() => setGenHovered(true)}
                onMouseLeave={() => setGenHovered(false)}
                className="inline-flex w-full items-center justify-center gap-2 px-5 py-4 text-base font-semibold transition-[background-color,box-shadow,transform] duration-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45"
                style={{
                  borderRadius: 12,
                  background:
                    !productName.trim() || isGenerating
                      ? "#3a3a3a"
                      : genHovered
                        ? C.green
                        : C.ink,
                  color: C.white,
                  boxShadow: genHovered
                    ? `0 0 0 2px ${C.lime}, 0 8px 24px rgba(31,78,61,0.28)`
                    : "0 6px 20px rgba(0,0,0,0.18)",
                }}
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Генерируем…
                  </>
                ) : hasResults ? (
                  <>
                    <Sparkles className="h-5 w-5" />
                    Перегенерировать
                  </>
                ) : (
                  <>
                    <Sparkles className="h-5 w-5" />
                    Собрать описание
                  </>
                )}
              </button>
            </div>
          </aside>

          {/* RIGHT — лист под текст, чуть шире вправо */}
          <main className="relative w-full max-w-[820px] shrink-0">
            {isGenerating ? (
              <DescriptionGeneratingPanel />
            ) : finalDescription || variants.length > 0 ? (
              <div
                className="relative flex flex-col"
                style={{
                  borderRadius: 16,
                  background: C.white,
                  boxShadow: PAPER_SHADOW,
                }}
              >
                {/* Tabs — segmented control */}
                {variants.length > 0 && (
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-5"
                    style={{ borderColor: "rgba(0,0,0,0.06)" }}
                  >
                    <div
                      ref={styleTabsRef}
                      className="relative flex min-w-0 flex-1 flex-nowrap items-center gap-0 rounded-[12px] p-1"
                      style={{ background: "rgba(0,0,0,0.045)" }}
                    >
                      <motion.div
                        className="absolute top-1 bottom-1 rounded-[9px]"
                        style={{
                          left: tabCaret.left,
                          width: tabCaret.width,
                          background: C.ink,
                        }}
                        animate={{ left: tabCaret.left, width: tabCaret.width }}
                        transition={{ type: "spring", stiffness: 420, damping: 34 }}
                        aria-hidden
                      />
                      {variants.map((variant) => {
                        const config =
                          STYLE_CONFIG[variant.id as keyof typeof STYLE_CONFIG];
                        const isActive = activeTabId === variant.id;

                        return (
                          <button
                            key={variant.id}
                            type="button"
                            ref={(el) => {
                              styleTabBtnRefs.current[variant.id] = el;
                            }}
                            onClick={() => selectTab(variant.id)}
                            className="relative z-[1] inline-flex min-w-0 flex-1 items-center justify-center gap-1 whitespace-nowrap px-2 py-2 text-[12px] font-semibold transition-colors duration-200 sm:px-2.5 sm:text-[13px]"
                            style={{
                              color: isActive ? C.white : C.muted,
                              background: "transparent",
                              border: "none",
                            }}
                          >
                            <span className="text-[13px] leading-none">
                              {config?.emoji}
                            </span>
                            {config?.label || variant.style}
                          </button>
                        );
                      })}
                    </div>
                    <div className="relative flex shrink-0 items-center gap-2">
                      <EditSaveButton />
                      {(() => {
                        const text = finalDescription
                          ? finalDescription
                          : variants.find((v) => v.id === activeTabId)?.description;
                        if (!text) return null;
                        const id = finalDescription ? -1 : activeTabId ?? -1;
                        return (
                          <CopyButton
                            onClick={() => void copyText(text, id)}
                            copied={copiedVariantId === id || (acceptDone && id === -1)}
                          />
                        );
                      })()}
                      <AnimatePresence>
                        {showCopyOzonHint && (
                          <motion.div
                            initial={{ opacity: 0, y: 6, scale: 0.96 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 4, scale: 0.98 }}
                            transition={{ duration: 0.22 }}
                            className="absolute right-0 top-[calc(100%+10px)] z-30 w-[min(320px,78vw)] rounded-xl p-3 text-left shadow-lg"
                            style={{
                              background: C.ink,
                              color: C.white,
                              border: `1px solid rgba(185,255,75,0.35)`,
                            }}
                            role="status"
                          >
                            <p className="text-[12px] font-semibold" style={{ color: C.lime }}>
                              Скопировано
                            </p>
                            <p
                              className="mt-1 text-[11px] leading-snug"
                              style={{ color: "rgba(255,255,255,0.82)" }}
                            >
                              В Ozon в поле аннотации при создании товара форматирование
                              сначала не видно. После «Завершить создание» в превью карточки
                              оно появится. На Wildberries всё отображается сразу.
                            </p>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                )}

                {/* Текст на всю ширину листа — без узкой колонки внутри */}
                <div className="relative">
                  <div
                    className="w-full"
                    style={{
                      padding: "40px 44px 100px",
                    }}
                  >
                    <AnimatePresence>
                      {isEditing && (
                        <motion.div
                          initial={{ opacity: 0, y: -8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -6 }}
                          transition={{ duration: 0.2 }}
                          className="mb-4 flex flex-col gap-2"
                        >
                          <div
                            className="inline-flex w-fit items-center gap-1 rounded-xl px-1.5 py-1"
                            style={{
                              background: "rgba(0,0,0,0.05)",
                              border: `1px solid ${C.border}`,
                            }}
                          >
                            <button
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={applyBoldToSelection}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold transition-colors hover:bg-white"
                              style={{ color: C.ink }}
                              title="Жирный"
                              aria-label="Жирный"
                            >
                              <Bold className="h-4 w-4" strokeWidth={2.5} />
                            </button>
                            <div
                              className="mx-0.5 h-5 w-px"
                              style={{ background: "rgba(0,0,0,0.12)" }}
                            />
                            <button
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => setShowStickerPicker((v) => !v)}
                              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition-colors hover:bg-white"
                              style={{
                                color: C.ink,
                                background: showStickerPicker ? C.white : "transparent",
                              }}
                              title="Стикеры"
                              aria-label="Стикеры"
                              aria-expanded={showStickerPicker}
                            >
                              <SmilePlus className="h-4 w-4" strokeWidth={2.25} />
                              Стикеры
                            </button>
                          </div>

                          <AnimatePresence>
                            {showStickerPicker && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={{ duration: 0.18 }}
                                className="overflow-hidden"
                              >
                                <div
                                  className="rounded-xl p-2.5"
                                  style={{
                                    background: C.softBeige,
                                    border: `1px solid ${C.border}`,
                                  }}
                                >
                                  <div className="mb-0 flex flex-wrap gap-1.5">
                                    {EDITOR_STICKERS.map((sticker) => (
                                      <button
                                        key={sticker}
                                        type="button"
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => insertSticker(sticker)}
                                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-lg transition-[background-color,transform] duration-150 hover:bg-white active:scale-95"
                                        style={{
                                          border: `1px solid ${C.border}`,
                                          background: C.white,
                                        }}
                                        title={`Вставить ${sticker}`}
                                      >
                                        {sticker}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {isEditing ? (
                      <div
                        key={`seo-editor-${editorEpoch}`}
                        ref={editorRef}
                        contentEditable
                        suppressContentEditableWarning
                        dangerouslySetInnerHTML={{ __html: editorHtmlSeed }}
                        className="seo-desc-editor outline-none"
                        style={{
                          color: "#1a1a1a",
                          fontSize: "16px",
                          lineHeight: 1.7,
                          fontWeight: 400,
                          fontFamily: "var(--font-sans), Inter, sans-serif",
                          minHeight: 200,
                        }}
                      />
                    ) : finalDescription ? (
                      <div>
                        <div className="mb-5 flex items-center gap-2">
                          <Check className="h-5 w-5" style={{ color: C.greenMid }} />
                          <span className="text-lg font-semibold" style={{ color: C.ink }}>
                            Финальное описание
                          </span>
                        </div>
                        <FlowProductDescription
                          text={finalDescription}
                          tone="editorial"
                          highlightTriggers
                        />
                        <div className="mt-8 max-w-md">
                          <CopyButton large onClick={handleConfirm} copied={acceptDone} />
                          <button
                            type="button"
                            onClick={() => router.push("/studio?intro=true")}
                            className="mt-2 w-full rounded-xl py-2.5 text-sm font-semibold"
                            style={{
                              background: "transparent",
                              color: C.ink,
                              border: `1.5px solid ${C.ink}`,
                            }}
                          >
                            Сделать полную карточку в Потоке →
                          </button>
                        </div>
                      </div>
                    ) : (
                      variants.map((variant) => {
                        if (variant.id !== activeTabId) return null;
                        const raw = variant.description;
                        const plainLen = stripDescriptionMarkup(raw).length;
                        const charCount = plainLen;
                        const wordCount = stripDescriptionMarkup(raw)
                          .split(/\s+/)
                          .filter((w) => w.length > 0).length;
                        const variantIssues = checkStopWords(
                          lightSanitizeDescriptionStream(raw)
                        );

                        return (
                          <div key={variant.id}>
                            {variantIssues.length > 0 && (
                              <div
                                className="mb-6 rounded-xl p-3"
                                style={{
                                  background: "#FFF8E6",
                                  border: "1px solid #F5D78E",
                                }}
                              >
                                <div
                                  className="mb-1 text-sm font-semibold"
                                  style={{ color: "#8A6D1D" }}
                                >
                                  Внимание!
                                </div>
                                <div className="space-y-1 text-xs" style={{ color: "#8A6D1D" }}>
                                  {variantIssues.slice(0, 3).map((issue, idx) => (
                                    <div key={idx}>
                                      <strong>&quot;{issue.word}&quot;</strong> —{" "}
                                      {getStopWordMessage(issue.category)}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            <FlowProductDescription
                              text={raw}
                              tone="editorial"
                              highlightTriggers
                            />

                            <div
                              className="mt-8 flex items-center justify-between text-xs"
                              style={{ color: C.muted }}
                            >
                              <div className="flex gap-4 tabular-nums">
                                <span>~{charCount} знаков</span>
                                <span>~{wordCount} слов</span>
                              </div>
                              {(() => {
                                const status = lengthStatusForPaper(charCount);
                                if (!status) return <div />;
                                return (
                                  <div className="font-medium" style={{ color: status.color }}>
                                    {status.label}
                                  </div>
                                );
                              })()}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Compact floating search-style prompt */}
                  {showFloatingPrompt && (
                    <div
                      className="pointer-events-none sticky bottom-4 z-20 flex justify-center px-6 pb-4"
                    >
                      <div
                        className="pointer-events-auto flex w-full items-center gap-2 px-3 py-1.5"
                        style={{
                          width: "100%",
                          maxWidth: "100%",
                          borderRadius: 12,
                          background: "rgba(255,255,255,0.92)",
                          backdropFilter: "blur(12px)",
                          WebkitBackdropFilter: "blur(12px)",
                          border: `1px solid ${C.ink}`,
                          boxShadow: "0 8px 28px rgba(0,0,0,0.1)",
                        }}
                      >
                        <div className="min-w-0 flex-1">
                          <input
                            type="text"
                            value={editInstructions}
                            onChange={(e) => setEditInstructions(e.target.value)}
                            placeholder="Что изменить в описании?"
                            className="w-full bg-transparent text-sm outline-none"
                            style={{
                              color: C.ink,
                              lineHeight: 1.4,
                              padding: "6px 2px",
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                void handleRegenerate();
                              }
                            }}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={handleRegenerate}
                          disabled={!editInstructions.trim() || isRegenerating}
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-[10px] px-3.5 py-2 text-sm font-semibold transition-[background-color,transform,opacity] duration-200 active:scale-[0.96] disabled:opacity-40"
                          style={{
                            background:
                              editInstructions.trim() && !isRegenerating
                                ? C.ink
                                : "#3a3a3a",
                            color: C.white,
                          }}
                        >
                          {isRegenerating ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Sparkles className="h-4 w-4" />
                          )}
                          Переделать
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div
                className="flex min-h-[420px] flex-col items-center justify-center px-8 text-center"
                style={{
                  borderRadius: 16,
                  background: C.white,
                  boxShadow: PAPER_SHADOW,
                }}
              >
                <div
                  className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl"
                  style={{ background: C.ink }}
                >
                  <FileTextIcon className="h-6 w-6" style={{ color: C.lime }} />
                </div>
                <p className="mb-1.5 text-[15px] font-semibold" style={{ color: C.ink }}>
                  Здесь появятся 4 варианта описания
                </p>
                <p className="max-w-sm text-sm" style={{ color: C.muted, lineHeight: 1.55 }}>
                  Слева укажите товар и пожелания, затем нажмите «Собрать описание».
                </p>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
