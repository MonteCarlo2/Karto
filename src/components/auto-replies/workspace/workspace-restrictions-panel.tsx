"use client";

import { useCallback, useState, type KeyboardEvent } from "react";
import { HelpCircle, Plus, ShieldCheck, X } from "lucide-react";
import type { AutoRepliesShopSettings } from "@/lib/auto-replies/settings-types";
import {
  RESTRICTION_LIMITS,
  addRestrictionWord,
  removeRestrictionWord,
} from "@/lib/auto-replies/restrictions-settings";
import { WsGlassPanel, WsSwitch, glass, panel, wsSans } from "./settings-ui";

type WorkspaceRestrictionsPanelProps = {
  advanced: AutoRepliesShopSettings["advanced"];
  onPatchAdvanced: (patch: Partial<AutoRepliesShopSettings["advanced"]>) => void;
};

function RestrictionSectionHeader({
  title,
  hint,
  enabled,
  onToggle,
  helpTitle,
}: {
  title: string;
  hint: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  helpTitle?: string;
}) {
  return (
    <div
      className="flex flex-col gap-3 border-b px-4 py-3.5 sm:flex-row sm:items-start sm:justify-between sm:px-5"
      style={{ borderColor: glass.borderSoft, backgroundColor: "rgba(185,255,75,0.08)" }}
    >
      <div className="min-w-0 flex-1">
        <p
          className="text-[11px] font-semibold uppercase tracking-[0.14em]"
          style={{ ...wsSans, color: panel.green }}
        >
          Раздел
        </p>
        <div className="mt-1 flex items-center gap-2">
          <p
            className="text-[15px] font-semibold tracking-[-0.02em] sm:text-[16px]"
            style={{ ...wsSans, color: panel.text }}
          >
            {title}
          </p>
          {helpTitle ? (
            <span title={helpTitle}>
              <HelpCircle className="h-4 w-4" style={{ color: panel.textSubtle }} strokeWidth={2} />
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-[12px] leading-[1.55] sm:text-[13px]" style={{ ...wsSans, color: panel.textMuted }}>
          {hint}
        </p>
      </div>
      <div
        className="flex shrink-0 items-center gap-2 rounded-[0.85rem] border px-2.5 py-1.5"
        style={{
          borderColor: enabled ? "rgba(46,90,67,0.18)" : glass.borderSoft,
          backgroundColor: enabled ? "rgba(185,255,75,0.12)" : "rgba(255,255,255,0.25)",
        }}
      >
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ ...wsSans, color: panel.textSubtle }}>
          {enabled ? "Вкл." : "Выкл."}
        </span>
        <WsSwitch label={title} checked={enabled} onChange={onToggle} />
      </div>
    </div>
  );
}

function WordListEditor({
  words,
  onChange,
  max,
  placeholder,
  emptyHint,
  variant,
  disabled,
}: {
  words: string[];
  onChange: (words: string[]) => void;
  max: number;
  placeholder: string;
  emptyHint: string;
  variant: "stop" | "minus";
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const isStop = variant === "stop";

  const tryAdd = useCallback(() => {
    if (disabled) return;
    const result = addRestrictionWord(words, draft, max);
    if (result.added) {
      onChange(result.words);
      setDraft("");
      setFeedback(null);
      return;
    }
    if (result.reason === "limit") setFeedback(`Не больше ${max} слов`);
    else if (result.reason === "duplicate") setFeedback("Такое слово уже есть");
    else if (result.reason === "spaces") setFeedback("Только одно слово без пробелов");
    else if (result.reason === "too_long") setFeedback(`До ${RESTRICTION_LIMITS.wordMaxLength} символов`);
    else setFeedback("Введите слово");
  }, [disabled, draft, max, onChange, words]);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      tryAdd();
    }
  };

  return (
    <div className={`px-4 pb-4 pt-3 sm:px-5 ${disabled ? "pointer-events-none opacity-45" : ""}`}>
      <div className="flex gap-2">
        <input
          type="text"
          value={draft}
          maxLength={RESTRICTION_LIMITS.wordMaxLength}
          onChange={(e) => {
            const next = e.target.value.replace(/\s/g, "");
            setDraft(next);
            if (feedback) setFeedback(null);
          }}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className="min-w-0 flex-1 rounded-[0.85rem] border px-3.5 py-2.5 text-[14px] outline-none transition focus:ring-2 focus:ring-[rgba(46,90,67,0.16)]"
          style={{
            ...wsSans,
            borderColor: glass.borderSoft,
            backgroundColor: "rgba(255,255,255,0.78)",
            color: panel.text,
          }}
        />
        <button
          type="button"
          onClick={tryAdd}
          disabled={disabled || !draft.trim()}
          aria-label="Добавить слово"
          className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[0.85rem] border transition disabled:opacity-40"
          style={{
            borderColor: "rgba(46,90,67,0.18)",
            backgroundColor: panel.green,
            color: "#fff",
            boxShadow: "0 6px 18px -10px rgba(46,90,67,0.5)",
          }}
        >
          <Plus className="h-5 w-5" strokeWidth={2.4} />
        </button>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-[11px] sm:text-[12px]" style={{ ...wsSans, color: feedback ? panel.warn : panel.textSubtle }}>
          {feedback ?? "Одно слово · Enter или + · до 20 символов"}
        </p>
        <p className="text-[11px] font-semibold tabular-nums sm:text-[12px]" style={{ ...wsSans, color: panel.textMuted }}>
          {words.length}/{max}
        </p>
      </div>

      {words.length ? (
        <ul
          className="mt-3 overflow-hidden rounded-[0.9rem] border"
          style={{
            borderColor: isStop ? "rgba(180,83,9,0.16)" : "rgba(46,90,67,0.12)",
            backgroundColor: "rgba(255,255,255,0.72)",
          }}
        >
          {words.map((word, index) => (
            <li
              key={word.toLowerCase()}
              className="flex items-center justify-between gap-3 px-3.5 py-2.5 sm:px-4 sm:py-3"
              style={{
                borderTop: index > 0 ? `1px solid ${isStop ? "rgba(180,83,9,0.1)" : "rgba(46,90,67,0.08)"}` : undefined,
              }}
            >
              <span
                className="min-w-0 flex-1 truncate text-[14px] font-semibold sm:text-[15px]"
                style={{ ...wsSans, color: isStop ? "#7C2D12" : panel.greenDark }}
              >
                {word}
              </span>
              <button
                type="button"
                aria-label={`Удалить «${word}»`}
                onClick={() => onChange(removeRestrictionWord(words, word))}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition hover:bg-black/[0.05]"
              >
                <X className="h-4 w-4" style={{ color: panel.textSubtle }} strokeWidth={2.2} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p
          className="mt-3 rounded-[0.85rem] border border-dashed px-3.5 py-2.5 text-[12px] leading-[1.55] sm:text-[13px]"
          style={{
            ...wsSans,
            borderColor: glass.borderSoft,
            color: panel.textMuted,
            backgroundColor: "rgba(255,255,255,0.35)",
          }}
        >
          {emptyHint}
        </p>
      )}
    </div>
  );
}

export function WorkspaceRestrictionsPanel({
  advanced,
  onPatchAdvanced,
}: WorkspaceRestrictionsPanelProps) {
  const patch = (next: Partial<AutoRepliesShopSettings["advanced"]>) => onPatchAdvanced(next);

  return (
    <div className="w-full max-w-[620px] pb-4">
      <WsGlassPanel>
        <div
          className="border-b px-4 py-3 sm:px-5"
          style={{
            borderColor: glass.borderSoft,
            background:
              "linear-gradient(120deg, rgba(46,90,67,0.05) 0%, rgba(255,255,255,0.5) 50%, rgba(185,255,75,0.08) 100%)",
          }}
        >
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="h-4 w-4 shrink-0" style={{ color: panel.green }} strokeWidth={2} />
            <p className="text-[15px] font-semibold tracking-[-0.02em] sm:text-[16px]" style={{ ...wsSans, color: panel.text }}>
              Контроль формулировок
            </p>
          </div>
        </div>

        <RestrictionSectionHeader
          title="Минус-слова"
          hint="ИИ не будет использовать эти слова при генерации ответа."
          enabled={advanced.minusWordsEnabled}
          onToggle={(minusWordsEnabled) => patch({ minusWordsEnabled })}
        />
        <WordListEditor
          words={advanced.minusWords}
          onChange={(minusWords) => patch({ minusWords })}
          max={RESTRICTION_LIMITS.minusWordsMax}
          placeholder="Введите минус-слово"
          emptyHint="Например: дешёвый, бесплатно, лучший."
          variant="minus"
          disabled={!advanced.minusWordsEnabled}
        />

        <div style={{ borderTop: `1px solid ${glass.borderSoft}` }}>
          <RestrictionSectionHeader
            title="Стоп-слова"
            hint="Если в отзыве есть указанное слово — перед генерацией ответа отзыв уйдёт на ваше подтверждение."
            enabled={advanced.stopWordsEnabled}
            onToggle={(stopWordsEnabled) => patch({ stopWordsEnabled })}
            helpTitle="Если стоп-слово есть в тексте отзыва, ответ не сгенерируется автоматически — сначала потребуется ваше подтверждение."
          />

          <WordListEditor
            words={advanced.stopWords}
            onChange={(stopWords) => patch({ stopWords })}
            max={RESTRICTION_LIMITS.stopWordsMax}
            placeholder="Введите стоп-слово"
            emptyHint="Например: скидка, конкурент, возврат."
            variant="stop"
            disabled={!advanced.stopWordsEnabled}
          />
        </div>
      </WsGlassPanel>
    </div>
  );
}
