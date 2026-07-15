"use client";

import type { CSSProperties, ReactNode } from "react";
import {
  normalizeDescriptionLayout,
  lightSanitizeDescriptionStream,
} from "@/lib/utils/marketplace-formatter";
import { stripDescriptionMarkup } from "@/lib/utils/description-markup";

export type StopWordIssue = { word: string; category: string; index: number };

const sans = "var(--font-sans), Inter, sans-serif" as const;

export type DescriptionTone = "flow" | "editorial";

type ToneStyles = {
  heading: CSSProperties;
  paragraph: CSSProperties;
  list: CSSProperties;
  bullet: CSSProperties;
  headingWrapClass: string;
  paragraphClass: string;
};

const TONE: Record<DescriptionTone, ToneStyles> = {
  flow: {
    heading: { color: "#2E5A43", fontFamily: sans },
    paragraph: {
      color: "#1a1a1a",
      fontSize: "16px",
      lineHeight: "1.5",
      fontFamily: sans,
    },
    list: {
      color: "#1a1a1a",
      lineHeight: "1.8",
      fontFamily: sans,
    },
    bullet: { color: "#2E5A43", fontWeight: "bold" },
    headingWrapClass: "mt-6 mb-3 first:mt-0",
    paragraphClass: "mb-4",
  },
  editorial: {
    heading: {
      color: "#0a0a0a",
      fontFamily: sans,
      fontSize: "22px",
      fontWeight: 700,
      lineHeight: 1.35,
    },
    paragraph: {
      color: "#1a1a1a",
      fontSize: "16px",
      lineHeight: "1.7",
      fontFamily: sans,
    },
    list: {
      color: "#1a1a1a",
      fontSize: "16px",
      lineHeight: "1.75",
      fontFamily: sans,
    },
    bullet: { color: "#0a0a0a", fontWeight: "bold" },
    headingWrapClass: "mt-8 mb-3 first:mt-0",
    paragraphClass: "mb-5",
  },
};

/** Разбор ⟦highlight⟧ и **bold** внутри строки. */
function renderInlineMarkup(text: string, highlightTriggers: boolean): ReactNode {
  const source = highlightTriggers ? text : stripDescriptionMarkup(text);
  const pattern = highlightTriggers
    ? /(⟦[^⟧]+⟧|\*\*[^*]+\*\*)/g
    : /(\*\*[^*]+\*\*)/g;
  const parts = source.split(pattern);

  return parts.map((part, i) => {
    if (!part) return null;
    if (highlightTriggers && part.startsWith("⟦") && part.endsWith("⟧")) {
      const inner = part.slice(1, -1);
      // Внутри подсветки тоже может быть жирный
      if (inner.includes("**")) {
        return (
          <span key={i} className="ai-highlight">
            {renderInlineMarkup(inner, false)}
          </span>
        );
      }
      return (
        <span key={i} className="ai-highlight">
          {inner}
        </span>
      );
    }
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <b key={i} className="seo-desc-bold" style={{ fontWeight: 700 }}>
          {part.slice(2, -2)}
        </b>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

function renderStructuredLines(
  lines: string[],
  tone: DescriptionTone,
  highlightTriggers: boolean
): ReactNode[] {
  const t = TONE[tone];
  const inline = (s: string) => renderInlineMarkup(s, highlightTriggers);

  return lines.map((line, index) => {
    const trimmed = line.trim();
    const headingMatch = trimmed.match(/^#+\s*(.+)$/);
    const nextTrimmed = (lines[index + 1] || "").trim();

    if (trimmed.endsWith(":") && trimmed.length < 50 && trimmed.length > 3) {
      return (
        <div key={index} className={t.headingWrapClass}>
          <h4 className="font-bold" style={t.heading}>
            {inline(trimmed)}
          </h4>
        </div>
      );
    }

    const inlineHeadingMatch = trimmed.match(
      /^([A-Za-zА-Яа-яЁё0-9\s/()«»"'-]{3,60}:)\s+(.+)$/
    );
    if (inlineHeadingMatch) {
      return (
        <div key={index} className={t.headingWrapClass}>
          <h4 className="font-bold" style={t.heading}>
            {inline(inlineHeadingMatch[1])}
          </h4>
          <p className="mt-2 mb-0" style={t.paragraph}>
            {inline(inlineHeadingMatch[2])}
          </p>
        </div>
      );
    }

    if (
      trimmed.length >= 6 &&
      trimmed.length <= 60 &&
      !/[.:!?]$/.test(trimmed) &&
      /^[A-Za-zА-Яа-яЁё]/.test(trimmed) &&
      nextTrimmed.length > 0 &&
      !/^[-•→—–*\d]/.test(nextTrimmed)
    ) {
      return (
        <div key={index} className={t.headingWrapClass}>
          <h4 className="font-bold" style={t.heading}>
            {inline(trimmed)}
          </h4>
        </div>
      );
    }

    if (headingMatch && headingMatch[1]) {
      return (
        <div key={index} className={t.headingWrapClass}>
          <h4 className="font-bold" style={t.heading}>
            {inline(headingMatch[1].trim())}
          </h4>
        </div>
      );
    }

    if (/^[-•→—–*\d]/.test(trimmed)) {
      const listContent = trimmed.replace(/^[-•→—–*\d.\s]+/, "").trim();
      let listSymbol = "•";
      if (trimmed.startsWith("•")) listSymbol = "•";
      else if (trimmed.startsWith("-")) listSymbol = "—";
      else if (trimmed.startsWith("—") || trimmed.startsWith("–")) listSymbol = "—";
      else if (/^\d/.test(trimmed)) listSymbol = "•";

      return (
        <div key={index} className="mb-2.5 ml-2 flex items-start gap-3">
          <span className="mt-0.5 flex-shrink-0 text-lg" style={t.bullet}>
            {listSymbol}
          </span>
          <span className="flex-1 text-base" style={t.list}>
            {inline(listContent)}
          </span>
        </div>
      );
    }

    if (trimmed) {
      return (
        <p key={index} className={t.paragraphClass} style={t.paragraph}>
          {inline(trimmed)}
        </p>
      );
    }

    return <div key={index} className="mb-2" />;
  });
}

/**
 * Экран «Описание» в студии / SEO-описания.
 * `tone="editorial"` — крупнее типографика для SEO-страницы.
 * `highlightTriggers` — рендер маркеров ⟦…⟧ как .ai-highlight (и сохранение **жирного**).
 */
export function FlowProductDescription({
  text,
  tone = "flow",
  highlightTriggers = false,
}: {
  text: string;
  tone?: DescriptionTone;
  highlightTriggers?: boolean;
}) {
  const clean = highlightTriggers
    ? text
        .replace(/^\s{0,3}#{1,6}\s+/gm, "")
        .replace(/`([^`]+)`/g, "$1")
        .replace(/\r\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim()
    : lightSanitizeDescriptionStream(text);
  const lines = clean.split("\n");
  return <div>{renderStructuredLines(lines, tone, highlightTriggers)}</div>;
}

/** Карточка «Результаты»: нормализация «простыни» и структурированные списки. */
export function ResultsProductDescription({ text }: { text: string }) {
  const normalized = normalizeDescriptionLayout(text);
  const lines = normalized.split("\n");
  return <div>{renderStructuredLines(lines, "flow", false)}</div>;
}
