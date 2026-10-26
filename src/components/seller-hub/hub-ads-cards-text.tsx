"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Copy } from "lucide-react";
import { evaluateSellerHubCardText, loadSavedCardText } from "@/lib/seller-hub/client-api";
import { SELLABILITY_LABEL } from "@/lib/seller-hub/card-vision-score";
import { TEXT_BAND_LABEL, TEXT_CRITERIA, TEXT_PROTOCOL_VERSION, textContentHash, type TextBand, type TextResult } from "@/lib/seller-hub/card-text-score";
import { ruPlural } from "@/lib/seller-hub/task-engine/ru-plural";
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
const COST_PER_CARD_USD = 0.0033;

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
  const [confirming, setConfirming] = useState(false);
  const pending = targets.filter((t) => !isTextCurrent(text.results[String(t.nmId)], t));
  const changed = pending.filter((t) => text.results[String(t.nmId)]).length;
  const evaluated = targets.length - pending.length;
  const spent = Object.values(text.results).reduce((s, r) => s + (r.costUsd ?? 0), 0);
  const cost = Math.round(pending.length * COST_PER_CARD_USD * 1000) / 1000;
  const noun = ruPlural(pending.length, "карточку", "карточки", "карточек");

  return (
    <div className="rounded-2xl border p-4" style={{ borderColor: hub.border, backgroundColor: hub.surface }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[14px] font-semibold" style={{ ...hubSans, color: hub.text }}>
            Оценка названия и описания нейросетью
          </p>
          <p className="mt-0.5 text-[12.5px] leading-5" style={{ ...hubSans, color: hub.textMuted }}>
            Нейросеть проверяет, насколько текст помогает находиться в поиске и убеждает покупателя: ключевые слова, длина по нормам площадки, структура, запрещённое. Оценено {evaluated} из {targets.length}
            {spent > 0 ? `, потрачено $${spent.toLocaleString("ru-RU", { maximumFractionDigits: 3 })}` : ""}. Оценка делается один раз и обновляется, только если вы изменили текст
            {changed > 0 ? `: изменено ${changed} ${ruPlural(changed, "карточка", "карточки", "карточек")}` : ""}.
          </p>
        </div>
        {text.running ? (
          <div className="flex items-center gap-3">
            <span className="text-[13px] tabular-nums" style={{ ...hubSans, color: hub.textMuted }}>
              {text.progress.done} из {text.progress.total}
            </span>
            <HubButton type="button" variant="secondary" onClick={text.stop}>
              Остановить
            </HubButton>
          </div>
        ) : pending.length > 0 && !confirming ? (
          <HubButton type="button" onClick={() => setConfirming(true)}>
            {changed > 0 && changed === pending.length ? "Обновить оценки текста: " : "Оценить текст: "}
            {pending.length} {noun}
          </HubButton>
        ) : null}
      </div>
      {confirming && !text.running ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3" style={{ backgroundColor: hub.warnSoft }}>
          <p className="text-[13px] leading-5" style={{ ...hubSans, color: hub.warn }}>
            Платный вызов вашего ключа OpenRouter: {pending.length} {ruPlural(pending.length, "карточка", "карточки", "карточек")}, примерно ${cost.toLocaleString("ru-RU")}. Готовые оценки хранятся и повторно не оплачиваются.
          </p>
          <div className="flex gap-2">
            <HubButton
              type="button"
              onClick={() => {
                setConfirming(false);
                void text.start(pending);
              }}
            >
              Запустить
            </HubButton>
            <HubButton type="button" variant="secondary" onClick={() => setConfirming(false)}>
              Отмена
            </HubButton>
          </div>
        </div>
      ) : null}
      {text.progress.failed > 0 || text.lastError ? (
        <p className="mt-2 text-[12.5px]" style={{ ...hubSans, color: hub.danger }}>
          {text.progress.failed > 0 ? `Не удалось оценить: ${text.progress.failed}. ` : ""}
          {text.lastError}
        </p>
      ) : null}
    </div>
  );
}

export function TextBadge({ result, outdated }: { result: TextResult; outdated: boolean }) {
  const tone = BAND_TONE[result.band];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[12px] font-semibold" style={{ ...hubSans, backgroundColor: tone.bg, color: tone.fg }}>
      Текст: {result.score} · {TEXT_BAND_LABEL[result.band]}
      {result.sellability ? ` · продаваемость: ${SELLABILITY_LABEL[result.sellability.level].toLowerCase()}` : ""}
      {outdated ? " · текст изменён, оценка устарела" : ""}
    </span>
  );
}

export function TextDetails({ result }: { result: TextResult }) {
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
    <details className="rounded-lg border px-3 py-2" style={{ borderColor: hub.border }}>
      <summary className="cursor-pointer text-[13px] font-semibold" style={{ ...hubSans, color: hub.text }}>
        Что нейросеть увидела в тексте
      </summary>
      <div className="mt-3 space-y-3">
        {result.sellability ? (
          <p className="text-[13px] leading-5" style={{ ...hubSans, color: hub.text }}>
            <strong>Ожидаемая продаваемость текста: {SELLABILITY_LABEL[result.sellability.level].toLowerCase()}.</strong>{" "}
            <span style={{ color: hub.textMuted }}>{result.sellability.reason}</span>
          </p>
        ) : null}
        <p className="text-[12.5px] leading-5" style={{ ...hubSans, color: hub.textMuted }}>
          Замеры программы: название {m.titleLength} знаков, описание {m.descriptionLength} знаков (норма WB 1000–5000), абзацев {m.paragraphs}, пунктов списка {m.bullets}
          {m.forbidden.length > 0 ? `, запрещённое: ${m.forbidden.join(", ")}` : ""}.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {TEXT_CRITERIA.map((c) => {
            const v = result.criteria[c.id];
            return (
              <div key={c.id}>
                <div className="flex items-baseline justify-between gap-2 text-[12.5px]" style={{ ...hubSans, color: hub.text }}>
                  <span>{c.label}</span>
                  <span className="tabular-nums font-semibold">{v.score.toLocaleString("ru-RU")}/10</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: hub.border }}>
                  <div className="h-full rounded-full" style={{ width: `${v.score * 10}%`, backgroundColor: v.score >= 7 ? hub.green : v.score >= 5 ? hub.blue : hub.warn }} />
                </div>
                {v.evidence && v.score < 6 ? (
                  <p className="mt-0.5 text-[12px] leading-4" style={{ ...hubSans, color: hub.textMuted }}>
                    {v.evidence}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
        {result.strengths.length > 0 ? (
          <p className="text-[13px] leading-5" style={{ ...hubSans, color: hub.textMuted }}>
            <strong style={{ color: hub.green }}>Хорошо:</strong> {result.strengths.join("; ")}.
          </p>
        ) : null}
        {result.defects.length > 0 ? (
          <ul className="space-y-1">
            {result.defects.map((d) => (
              <li key={d.what} className="text-[13px] leading-5" style={{ ...hubSans, color: hub.text }}>
                <strong>{d.what}</strong>
                {d.fix ? <span style={{ color: hub.textMuted }}>. Как исправить: {d.fix}</span> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px]" style={{ ...hubSans, color: hub.textMuted }}>
            Существенных недостатков нейросеть не нашла.
          </p>
        )}
        {result.titleSuggestion ? (
          <div className="rounded-lg px-3 py-2" style={{ backgroundColor: hub.surfaceMuted }}>
            <p className="text-[12px] font-semibold uppercase tracking-[0.05em]" style={{ ...hubSans, color: hub.textSubtle }}>
              Вариант названия
            </p>
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className="text-[13.5px]" style={{ ...hubSans, color: hub.text }}>
                {result.titleSuggestion}
              </span>
              <button type="button" onClick={() => void copy(result.titleSuggestion!)} className="shrink-0 rounded-md p-1.5" style={{ color: hub.textMuted }} aria-label="Скопировать название">
                <Copy className="h-4 w-4" />
              </button>
            </div>
            {copied === result.titleSuggestion ? (
              <p className="text-[12px]" style={{ ...hubSans, color: hub.green }}>
                Скопировано. Название меняется в карточке WB.
              </p>
            ) : null}
          </div>
        ) : null}
        {result.missingKeywords.length > 0 ? (
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.05em]" style={{ ...hubSans, color: hub.textSubtle }}>
              Каких слов не хватает
            </p>
            <ul className="mt-1 flex flex-wrap gap-1.5">
              {result.missingKeywords.map((k) => (
                <li key={k.word} title={k.why} className="rounded-full border px-2.5 py-1 text-[12.5px]" style={{ ...hubSans, borderColor: hub.border, color: hub.text }}>
                  {k.word}
                </li>
              ))}
            </ul>
            <p className="mt-1 text-[11.5px] leading-4" style={{ ...hubSans, color: hub.textMuted }}>
              Это предложения нейросети по смыслу товара, не частотность запросов WB. Точные поисковые запросы покупателей показывает вкладка «Поиск и SEO» (нужна подписка Джем).
            </p>
          </div>
        ) : null}
        {result.confidence === "low" ? (
          <p className="text-[12px]" style={{ ...hubSans, color: hub.warn }}>
            Уверенность оценки низкая: текста слишком мало для уверенного вывода.
          </p>
        ) : null}
      </div>
    </details>
  );
}
