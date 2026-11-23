"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Copy } from "lucide-react";
import { evaluateSellerHubCardText, loadSavedCardText } from "@/lib/seller-hub/client-api";
import { SELLABILITY_LABEL } from "@/lib/seller-hub/card-vision-score";
import { TEXT_BAND_LABEL, TEXT_CRITERIA, TEXT_PROTOCOL_VERSION, textContentHash, type TextBand, type TextResult } from "@/lib/seller-hub/card-text-score";
import { ruPlural } from "@/lib/seller-hub/task-engine/ru-plural";
import { AnalysisPanel } from "./hub-ads-analysis";
import { hub, HubButton, hubSans } from "./hub-ui";

export type TextTarget = {
  nmId: number;
  title: string;
  description: string | null;
  category?: string | null;
  brand?: string | null;
  characteristicNames?: string[] | null;
};

const BAND_TONE: Record<TextBand, { bg: string; fg: string }> = {
  strong: { bg: hub.greenSoft, fg: hub.green },
  good: { bg: hub.blueSoft, fg: hub.blue },
  average: { bg: hub.warnSoft, fg: hub.warn },
  weak: { bg: hub.dangerSoft, fg: hub.danger },
};

/** Оценка актуальна, если текст и протокол не менялись с момента оценки. */
export function isTextCurrent(result: TextResult | undefined, target: TextTarget): boolean {
  return Boolean(result && result.protocol === TEXT_PROTOCOL_VERSION && result.contentHash === textContentHash(target.title, target.description));
}

const WORKERS = 4;
/** Замер по 44 карточкам: около $0,0033 за оценку текста (длинный протокол и подробный ответ). */


export function useCardText(targets: TextTarget[]) {
  const [results, setResults] = useState<Record<string, TextResult>>({});
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, failed: 0 });
  const [lastError, setLastError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const stopRef = useRef(false);
  const key = targets.map((t) => t.nmId).join(",");

  useEffect(() => {
    if (targets.length === 0) return;
    let cancelled = false;
    void loadSavedCardText(targets.map((t) => t.nmId)).then((res) => {
      if (cancelled) return;
      if (res.ok) setResults((prev) => ({ ...res.saved, ...prev }));
      setLoaded(res.ok);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const start = useCallback(
    async (list: TextTarget[]) => {
      if (running || list.length === 0) return;
      stopRef.current = false;
      setRunning(true);
      setLastError(null);
      setProgress({ done: 0, total: list.length, failed: 0 });
      let cursor = 0;
      let streak = 0;
      const worker = async () => {
        while (!stopRef.current) {
          const index = cursor++;
          if (index >= list.length) return;
          const t = list[index]!;
          const res = await evaluateSellerHubCardText({ nmId: t.nmId, title: t.title, description: t.description, category: t.category, brand: t.brand, characteristicNames: t.characteristicNames });
          if (res.ok && res.result) {
            streak = 0;
            setResults((prev) => ({ ...prev, [String(t.nmId)]: res.result! }));
            setProgress((p) => ({ ...p, done: p.done + 1 }));
          } else {
            streak += 1;
            setLastError(res.error ?? "Оценка не получилась");
            setProgress((p) => ({ ...p, done: p.done + 1, failed: p.failed + 1 }));
            if (streak >= 3 || /лимит|ключ|OpenRouter 40[123]/i.test(res.error ?? "")) stopRef.current = true;
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(WORKERS, list.length) }, worker));
      setRunning(false);
    },
    [running],
  );

  return { results, running, progress, lastError, loaded, start, stop: () => (stopRef.current = true) };
}

export function TextControls({ targets, text }: { targets: TextTarget[]; text: ReturnType<typeof useCardText> }) {
  const pending = targets.filter((t) => !isTextCurrent(text.results[String(t.nmId)], t));
  const evaluated = targets.length - pending.length;
  const noun = ruPlural(pending.length, "карточку", "карточки", "карточек");

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2 py-3">
      <p className="text-[16px]" style={{ ...hubSans, color: hub.text }}>
        <strong className="font-semibold">Название и описание</strong>
        <span style={{ color: hub.textMuted }}> · оценено {evaluated} из {targets.length}</span>
      </p>
      {text.running ? (
        <div className="flex items-center gap-3">
          <span className="text-[15px] tabular-nums" style={{ ...hubSans, color: hub.textMuted }}>
            {text.progress.done} из {text.progress.total}
          </span>
          <HubButton type="button" size="sm" variant="secondary" onClick={text.stop}>
            Остановить
          </HubButton>
        </div>
      ) : pending.length > 0 ? (
        <HubButton type="button" size="sm" variant="secondary" onClick={() => void text.start(pending)}>
          Оценить {pending.length} {noun}
        </HubButton>
      ) : null}
      {text.progress.failed > 0 || text.lastError ? (
        <p className="w-full text-[14.5px]" style={{ ...hubSans, color: hub.textMuted }}>
          Часть карточек оценить не удалось, это повторится само при следующем обновлении.
        </p>
      ) : null}
    </div>
  );
}

export function TextBadge({ result, outdated }: { result: TextResult; outdated: boolean }) {
  const tone = BAND_TONE[result.band];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[14px] font-semibold" style={{ ...hubSans, backgroundColor: tone.bg, color: tone.fg }}>
      Текст: {result.score} · {TEXT_BAND_LABEL[result.band]}
      {result.sellability ? ` · продаваемость: ${SELLABILITY_LABEL[result.sellability.level].toLowerCase()}` : ""}
      {outdated ? " · текст изменён, оценка устарела" : ""}
    </span>
  );
}

const TEXT_BAND_COLOR: Record<TextBand, string> = { strong: "#2E9E6B", good: "#4F7CC4", average: "#D9912B", weak: "#C8453F" };

export function TextDetails({ result, outdated }: { result: TextResult; outdated?: boolean }) {
  const [copied, setCopied] = useState<string | null>(null);
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(value);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* буфер обмена недоступен: пользователь скопирует вручную */
    }
  }
  const m = result.metrics;
  return (
    <AnalysisPanel
      title="Разбор названия и описания нейросетью"
      score={result.score}
      bandLabel={`${TEXT_BAND_LABEL[result.band]}${outdated ? " · текст изменён, оценка устарела" : ""}`}
      bandColor={TEXT_BAND_COLOR[result.band]}
      sellability={result.sellability ? { label: SELLABILITY_LABEL[result.sellability.level].toLowerCase(), reason: result.sellability.reason } : null}
      notes={[
        {
          label: "Замеры программы",
          text: `Название ${m.titleLength} знаков, описание ${m.descriptionLength} знаков (норма WB 1000–5000), абзацев ${m.paragraphs}, пунктов списка ${m.bullets}${m.forbidden.length > 0 ? `, запрещённое: ${m.forbidden.join(", ")}` : ""}.`,
        },
      ]}
      criteria={TEXT_CRITERIA.map((c) => ({ label: c.label, score: result.criteria[c.id].score, evidence: result.criteria[c.id].evidence }))}
      strengths={result.strengths}
      defects={result.defects}
      lowConfidence={result.confidence === "low" ? "Уверенность оценки низкая: текста слишком мало для уверенного вывода." : null}
      extra={
        <>
          {result.titleSuggestion ? (
            <div className="rounded-[16px] px-4 py-3.5" style={{ backgroundColor: "rgba(1, 20, 8, 0.045)" }}>
              <p className="text-[14px]" style={{ ...hubSans, color: hub.textSubtle }}>
                Вариант названия
              </p>
              <div className="mt-1 flex items-start justify-between gap-3">
                <span className="text-[16.5px] font-medium leading-[1.4]" style={{ ...hubSans, color: hub.text }}>
                  {result.titleSuggestion}
                </span>
                <button type="button" onClick={() => void copy(result.titleSuggestion!)} className="shrink-0 rounded-full p-2 outline-none transition-colors hover:bg-black/[0.06]" style={{ color: hub.textMuted }} aria-label="Скопировать название">
                  <Copy className="h-[18px] w-[18px]" />
                </button>
              </div>
              {copied === result.titleSuggestion ? (
                <p className="mt-1 text-[14px]" style={{ ...hubSans, color: "#067A55" }}>
                  Скопировано. Название меняется в карточке WB.
                </p>
              ) : null}
            </div>
          ) : null}
          {result.missingKeywords.length > 0 ? (
            <div>
              <p className="text-[16px] font-semibold" style={{ ...hubSans, color: hub.text }}>
                Каких слов не хватает
              </p>
              <ul className="mt-2.5 flex flex-wrap gap-2">
                {result.missingKeywords.map((k) => (
                  <li key={k.word} title={k.why} className="rounded-full px-3.5 py-2 text-[14.5px] font-medium" style={{ ...hubSans, color: hub.text, backgroundColor: "rgba(1, 20, 8, 0.06)" }}>
                    {k.word}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[14px] leading-[1.45]" style={{ ...hubSans, color: hub.textSubtle }}>
                Это предложения нейросети по смыслу товара. Точные запросы покупателей смотрите во вкладке «Поиск и SEO».
              </p>
            </div>
          ) : null}
        </>
      }
    />
  );
}
