"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { evaluateSellerHubCardPhotos, loadSavedCardVision } from "@/lib/seller-hub/client-api";
import {
  BAND_LABEL,
  SELLABILITY_LABEL,
  VISION_PROTOCOL_VERSION,
  estimateBatchCostUsd,
  reconcileWithSales,
  VISION_CRITERIA,
  type SalesEvidence,
  type VisionBand,
  type VisionResult,
} from "@/lib/seller-hub/card-vision-score";
import { ruPlural } from "@/lib/seller-hub/task-engine/ru-plural";
import { hub, HubButton, hubSans } from "./hub-ui";

export type VisionTarget = { nmId: number; title: string; category?: string | null; brand?: string | null; imageUrls: string[] };

const BAND_TONE: Record<VisionBand, { bg: string; fg: string }> = {
  strong: { bg: hub.greenSoft, fg: hub.green },
  good: { bg: hub.blueSoft, fg: hub.blue },
  average: { bg: hub.warnSoft, fg: hub.warn },
  weak: { bg: hub.dangerSoft, fg: hub.danger },
};

const WORKERS = 3;

export function useCardVision(targets: VisionTarget[]) {
  const [results, setResults] = useState<Record<string, VisionResult>>({});
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, failed: 0 });
  const [lastError, setLastError] = useState<string | null>(null);
  /** Сохранённые оценки прочитаны (или читать нечего): можно решать, каких карточек не хватает. */
  const [loaded, setLoaded] = useState(false);
  const stopRef = useRef(false);
  const key = targets.map((t) => t.nmId).join(",");

  useEffect(() => {
    if (targets.length === 0) return;
    let cancelled = false;
    void loadSavedCardVision(targets.map((t) => ({ nmId: t.nmId, imageUrls: t.imageUrls }))).then((res) => {
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
    async (list: VisionTarget[]) => {
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
          const target = list[index]!;
          const res = await evaluateSellerHubCardPhotos({
            nmId: target.nmId,
            imageUrls: target.imageUrls,
            title: target.title,
            category: target.category,
            brand: target.brand,
          });
          if (res.ok && res.result) {
            streak = 0;
            setResults((prev) => ({ ...prev, [String(target.nmId)]: res.result! }));
            setProgress((p) => ({ ...p, done: p.done + 1 }));
          } else {
            streak += 1;
            setLastError(res.error ?? "Оценка не получилась");
            // Три сбоя подряд — не продолжаем: причина общая (сеть, ключ, лимит), повтор только тратит время.
            if (streak >= 3) stopRef.current = true;
            setProgress((p) => ({ ...p, done: p.done + 1, failed: p.failed + 1 }));
            // Лимит и ошибки ключа не лечатся повтором: останавливаем пакет, чтобы не тратить впустую.
            if (/лимит|ключ|OpenRouter 40[123]|OpenRouter 402/i.test(res.error ?? "")) stopRef.current = true;
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(WORKERS, list.length) }, worker));
      setRunning(false);
    },
    [running],
  );

  /** Перепроверка одной карточки: платный вызов только если фото изменились (force — в любом случае). */
  const recheck = useCallback(async (target: VisionTarget, force: boolean) => {
    const res = await evaluateSellerHubCardPhotos({ nmId: target.nmId, imageUrls: target.imageUrls, title: target.title, category: target.category, brand: target.brand, force });
    if (res.ok && res.result) setResults((prev) => ({ ...prev, [String(target.nmId)]: res.result! }));
    else setLastError(res.error ?? "Оценка не получилась");
    return res.ok;
  }, []);

  return { results, running, progress, lastError, loaded, start, recheck, stop: () => (stopRef.current = true) };
}

export function VisionControls({
  targets,
  vision,
}: {
  targets: VisionTarget[];
  vision: ReturnType<typeof useCardVision>;
}) {
  const [confirming, setConfirming] = useState(false);
  const isCurrent = (nmId: number) => vision.results[String(nmId)]?.protocol === VISION_PROTOCOL_VERSION;
  const pending = targets.filter((t) => !isCurrent(t.nmId));
  const outdated = pending.filter((t) => vision.results[String(t.nmId)]).length;
  const evaluated = targets.length - pending.length;
  const cost = estimateBatchCostUsd(pending.length);
  const spentUsd = Object.values(vision.results).reduce((sum, r) => sum + (r.costUsd ?? 0), 0);

  return (
    <div className="rounded-2xl border p-4" style={{ borderColor: hub.border, backgroundColor: hub.surface }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[14px] font-semibold" style={{ ...hubSans, color: hub.text }}>
            Оценка фото нейросетью
          </p>
          <p className="mt-0.5 text-[12.5px] leading-5" style={{ ...hubSans, color: hub.textMuted }}>
            Нейросеть смотрит обложку и второе фото и оценивает, насколько они помогают продавать. Оценено {evaluated} из {targets.length}{spentUsd > 0 ? `, потрачено $${spentUsd.toLocaleString("ru-RU", { maximumFractionDigits: 3 })}` : ""}. Оценка справедливая:
            хорошая карточка получает высокий балл, а продажи всегда важнее мнения нейросети.
          </p>
        </div>
        {vision.running ? (
          <div className="flex items-center gap-3">
            <span className="text-[13px] tabular-nums" style={{ ...hubSans, color: hub.textMuted }}>
              {vision.progress.done} из {vision.progress.total}
            </span>
            <HubButton type="button" variant="secondary" onClick={vision.stop}>
              Остановить
            </HubButton>
          </div>
        ) : pending.length > 0 && !confirming ? (
          <HubButton type="button" onClick={() => setConfirming(true)}>
            {outdated > 0 && outdated === pending.length ? "Обновить оценки по новому протоколу: " : "Оценить "}{pending.length} {ruPlural(pending.length, "карточку", "карточки", "карточек")}
          </HubButton>
        ) : pending.length === 0 && targets.length > 0 ? (
          // Все оценки свежие: проверяем, не заменили ли вы фото. Для неизменённых фото оплаты нет, платная оценка только по изменённым.
          <HubButton type="button" variant="secondary" onClick={() => void vision.start(targets)}>
            Проверить, не менялись ли фото
          </HubButton>
        ) : null}
      </div>

      {confirming && !vision.running ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3" style={{ backgroundColor: hub.warnSoft }}>
          <p className="text-[13px] leading-5" style={{ ...hubSans, color: hub.warn }}>
            Это платный вызов вашего ключа OpenRouter: {pending.length} {ruPlural(pending.length, "карточка", "карточки", "карточек")}, примерно ${cost.toLocaleString("ru-RU")}. Готовые оценки хранятся месяц и повторно не оплачиваются.
          </p>
          <div className="flex gap-2">
            <HubButton
              type="button"
              onClick={() => {
                setConfirming(false);
                void vision.start(pending);
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

      {vision.progress.failed > 0 || vision.lastError ? (
        <p className="mt-2 text-[12.5px]" style={{ ...hubSans, color: hub.danger }}>
          {vision.progress.failed > 0 ? `Не удалось оценить: ${vision.progress.failed}. ` : ""}
          {vision.lastError}
        </p>
      ) : null}
    </div>
  );
}

export function VisionBadge({ result }: { result: VisionResult }) {
  const tone = BAND_TONE[result.band];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[12px] font-semibold" style={{ ...hubSans, backgroundColor: tone.bg, color: tone.fg }}>
      Фото: {result.score} · {BAND_LABEL[result.band]}
      {result.sellability ? ` · продаваемость: ${SELLABILITY_LABEL[result.sellability.level].toLowerCase()}` : ""}
    </span>
  );
}

export function VisionDetails({ result, sales, onRecheck }: { result: VisionResult; sales: SalesEvidence | null; onRecheck?: (force: boolean) => Promise<boolean> }) {
  const [checking, setChecking] = useState(false);
  const reconciled = reconcileWithSales(result, sales);
  return (
    <details className="rounded-lg border px-3 py-2" style={{ borderColor: hub.border }}>
      <summary className="cursor-pointer text-[13px] font-semibold" style={{ ...hubSans, color: hub.text }}>
        Что нейросеть увидела на фото
        {result.doubleChecked ? <span style={{ color: hub.textMuted }}> · проверено двумя моделями</span> : null}
      </summary>
      <div className="mt-3 space-y-3">
        {result.sellability ? (
          <p className="text-[13px] leading-5" style={{ ...hubSans, color: hub.text }}>
            <strong>Ожидаемая продаваемость фото: {SELLABILITY_LABEL[result.sellability.level].toLowerCase()}.</strong>{" "}
            <span style={{ color: hub.textMuted }}>{result.sellability.reason}</span>
          </p>
        ) : null}
        {result.observations ? (
          <div className="space-y-1 text-[12.5px] leading-5" style={{ ...hubSans, color: hub.textMuted }}>
            <p><strong style={{ color: hub.text }}>Обложка:</strong> {result.observations.cover}</p>
            <p><strong style={{ color: hub.text }}>Второе фото:</strong> {result.observations.second}</p>
            {result.categoryNorm ? <p><strong style={{ color: hub.text }}>Что важно в категории «{result.category}»:</strong> {result.categoryNorm}</p> : null}
          </div>
        ) : null}
        {reconciled.note ? (
          <p className="rounded-lg px-3 py-2 text-[13px] leading-5" style={{ ...hubSans, backgroundColor: hub.blueSoft, color: hub.text }}>
            {reconciled.note}
          </p>
        ) : null}
        <div className="grid gap-2 sm:grid-cols-2">
          {VISION_CRITERIA.map((c) => {
            const value = result.criteria[c.id];
            return (
              <div key={c.id}>
                <div className="flex items-baseline justify-between gap-2 text-[12.5px]" style={{ ...hubSans, color: hub.text }}>
                  <span>{c.label}</span>
                  <span className="tabular-nums font-semibold">{value.score.toLocaleString("ru-RU")}/10</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: hub.border }}>
                  <div className="h-full rounded-full" style={{ width: `${value.score * 10}%`, backgroundColor: value.score >= 7 ? hub.green : value.score >= 5 ? hub.blue : hub.warn }} />
                </div>
                {value.evidence && value.score < 6 ? (
                  <p className="mt-0.5 text-[12px] leading-4" style={{ ...hubSans, color: hub.textMuted }}>
                    {value.evidence}
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
        {onRecheck ? (
          <div className="flex flex-wrap gap-2 pt-1">
            <HubButton
              type="button"
              variant="secondary"
              size="sm"
              disabled={checking}
              onClick={() => {
                setChecking(true);
                void onRecheck(false).finally(() => setChecking(false));
              }}
            >
              {checking ? "Проверяю…" : "Проверить, не изменились ли фото"}
            </HubButton>
          </div>
        ) : null}
        {result.confidence === "low" ? (
          <p className="text-[12px]" style={{ ...hubSans, color: hub.warn }}>
            Уверенность оценки низкая: фото могли плохо открыться или товар на них не виден.
          </p>
        ) : null}
      </div>
    </details>
  );
}
