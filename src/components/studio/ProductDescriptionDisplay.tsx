"use client";

import type { ReactNode } from "react";
import {
  normalizeDescriptionLayout,
  lightSanitizeDescriptionStream,
} from "@/lib/utils/marketplace-formatter";

export type StopWordIssue = { word: string; category: string; index: number };

const sans =
  'var(--font-sans), Inter, sans-serif' as const;

function renderStructuredLines(lines: string[]): ReactNode[] {
  return lines.map((line, index) => {
    const trimmed = line.trim();
    const headingMatch = trimmed.match(/^#+\s*(.+)$/);
    const nextTrimmed = (lines[index + 1] || "").trim();

    if (trimmed.endsWith(":") && trimmed.length < 50 && trimmed.length > 3) {
      return (
        <div key={index} className="mt-6 mb-3 first:mt-0">
          <h4
            className="font-semibold text-lg"
            style={{ color: "#2E5A43", fontFamily: sans }}
          >
            {trimmed}
          </h4>
        </div>
      );
    }

    const inlineHeadingMatch = trimmed.match(
      /^([A-Za-zА-Яа-яЁё0-9\s/()«»"'-]{3,60}:)\s+(.+)$/
    );
    if (inlineHeadingMatch) {
      return (
        <div key={index} className="mt-6 mb-3 first:mt-0">
          <h4
            className="font-semibold text-lg"
            style={{ color: "#2E5A43", fontFamily: sans }}
          >
            {inlineHeadingMatch[1]}
          </h4>
          <p
            className="mt-2 mb-0"
            style={{
              color: "#1a1a1a",
              fontSize: "16px",
              lineHeight: "1.5",
              fontFamily: sans,
            }}
          >
            {inlineHeadingMatch[2]}
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
        <div key={index} className="mt-6 mb-3 first:mt-0">
          <h4
            className="font-semibold text-lg"
            style={{ color: "#2E5A43", fontFamily: sans }}
          >
            {trimmed}
          </h4>
        </div>
      );
    }

    if (headingMatch && headingMatch[1]) {
      return (
        <div key={index} className="mt-6 mb-3 first:mt-0">
          <h4
            className="font-semibold text-lg"
            style={{ color: "#2E5A43", fontFamily: sans }}
          >
            {headingMatch[1].trim()}
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
        <div key={index} className="ml-2 mb-2.5 flex items-start gap-3">
          <span
            className="text-lg flex-shrink-0 mt-0.5"
            style={{ color: "#2E5A43", fontWeight: "bold" }}
          >
            {listSymbol}
          </span>
          <span
            className="flex-1 text-base"
            style={{
              color: "#1a1a1a",
              lineHeight: "1.8",
              fontFamily: sans,
            }}
          >
            {listContent}
          </span>
        </div>
      );
    }

    if (trimmed) {
      return (
        <p
          key={index}
          className="mb-4"
          style={{
            color: "#1a1a1a",
            fontSize: "16px",
            lineHeight: "1.5",
            fontFamily: sans,
          }}
        >
          {trimmed}
        </p>
      );
    }

    return <div key={index} className="mb-2" />;
  });
}

/**
 * Экран «Описание» в студии: зелёные заголовки, списки, отступы — как раньше,
 * но без {@link normalizeDescriptionLayout} (чтобы не раздувать тире и лишние переносы).
 */
export function FlowProductDescription({ text }: { text: string }) {
  const clean = lightSanitizeDescriptionStream(text);
  const lines = clean.split("\n");
  return <div>{renderStructuredLines(lines)}</div>;
}

/** Карточка «Результаты»: нормализация «простыни» и структурированные списки. */
export function ResultsProductDescription({ text }: { text: string }) {
  const normalized = normalizeDescriptionLayout(text);
  const lines = normalized.split("\n");
  return <div>{renderStructuredLines(lines)}</div>;
}
