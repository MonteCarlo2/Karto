"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { evaluateSellerHubCardPhotos, loadSavedCardVision } from "@/lib/seller-hub/client-api";
import {
  BAND_LABEL,
  SELLABILITY_LABEL,
  VISION_PROTOCOL_VERSION,
  reconcileWithSales,
  VISION_CRITERIA,
  type SalesEvidence,
  type VisionBand,
  type VisionResult,
} from "@/lib/seller-hub/card-vision-score";
import { ruPlural } from "@/lib/seller-hub/task-engine/ru-plural";
import { AnalysisPanel } from "./hub-ads-analysis";
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
  const isCurrent = (nmId: number) => vision.results[String(nmId)]?.protocol === VISION_PROTOCOL_VERSION;
  const pending = targets.filter((t) => !isCurrent(t.nmId));
  const evaluated = targets.length - pending.length;

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2 py-3">
      <p className="text-[16px]" style={{ ...hubSans, color: hub.text }}>
        <strong className="font-semibold">Фото</strong>
        <span style={{ color: hub.textMuted }}> · оценено {evaluated} из {targets.length}</span>
      </p>
      {vision.running ? (
        <div className="flex items-center gap-3">
          <span className="text-[15px] tabular-nums" style={{ ...hubSans, color: hub.textMuted }}>
            {vision.progress.done} из {vision.progress.total}
          </span>
          <HubButton type="button" size="sm" variant="secondary" onClick={vision.stop}>
            Остановить
          </HubButton>
        </div>
      ) : pending.length > 0 ? (
        <HubButton type="button" size="sm" variant="secondary" onClick={() => void vision.start(pending)}>
          Оценить {pending.length} {ruPlural(pending.length, "карточку", "карточки", "карточек")}
        </HubButton>
      ) : targets.length > 0 ? (
        <HubButton type="button" size="sm" variant="ghost" onClick={() => void vision.start(targets)}>
          Проверить, не менялись ли фото
        </HubButton>
      ) : null}
      {vision.progress.failed > 0 || vision.lastError ? (
        <p className="w-full text-[14.5px]" style={{ ...hubSans, color: hub.textMuted }}>
          Часть карточек оценить не удалось, это повторится само при следующем обновлении.
        </p>
      ) : null}
    </div>
  );
}

export function VisionBadge({ result }: { result: VisionResult }) {
  const tone = BAND_TONE[result.band];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[14px] font-semibold" style={{ ...hubSans, backgroundColor: tone.bg, color: tone.fg }}>
      Фото: {result.score} · {BAND_LABEL[result.band]}
      {result.sellability ? ` · продаваемость: ${SELLABILITY_LABEL[result.sellability.level].toLowerCase()}` : ""}
    </span>
  );
}

const BAND_COLOR: Record<VisionBand, string> = { strong: "#2E9E6B", good: "#4F7CC4", average: "#D9912B", weak: "#C8453F" };

export function VisionDetails({ result, sales, onRecheck }: { result: VisionResult; sales: SalesEvidence | null; onRecheck?: (force: boolean) => Promise<boolean> }) {
  const [checking, setChecking] = useState(false);
  const reconciled = reconcileWithSales(result, sales);
  return (
    <AnalysisPanel
      title="Разбор фото нейросетью"
      score={result.score}
      bandLabel={BAND_LABEL[result.band]}
      bandColor={BAND_COLOR[result.band]}
      sellability={result.sellability ? { label: SELLABILITY_LABEL[result.sellability.level].toLowerCase(), reason: result.sellability.reason } : null}
      saleNote={reconciled.note}
      notes={[
        ...(result.observations ? [{ label: "Обложка", text: result.observations.cover }, { label: "Второе фото", text: result.observations.second }] : []),
        ...(result.observations && result.categoryNorm ? [{ label: `Что важно в категории «${result.category}»`, text: result.categoryNorm }] : []),
      ]}
      criteria={VISION_CRITERIA.map((c) => ({ label: c.label, score: result.criteria[c.id].score, evidence: result.criteria[c.id].evidence }))}
      strengths={result.strengths}
      defects={result.defects}
      lowConfidence={result.confidence === "low" ? "Уверенность оценки низкая: фото могли плохо открыться или товар на них не виден." : null}
      footer={
        onRecheck ? (
          <div className="flex flex-wrap items-center gap-3 border-t pt-4" style={{ borderColor: "rgba(1, 20, 8, 0.1)" }}>
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
            {result.doubleChecked ? (
              <span className="text-[14px]" style={{ ...hubSans, color: hub.textSubtle }}>
                Проверено двумя моделями
              </span>
            ) : null}
          </div>
        ) : null
      }
    />
  );
}
