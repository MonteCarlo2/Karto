"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { compareBids } from "@/lib/seller-hub/ads-bids";
import { actionForOption, buildCampaignFacts, type CampaignFacts, type CampaignReview, type ReviewOption } from "@/lib/seller-hub/ads-review";
import { applyActionToCampaigns, executeAgentAction } from "@/lib/seller-hub/agent-exec";
import { loadSellerHubAdBidRecommendations, reviewSellerHubCampaigns } from "@/lib/seller-hub/client-api";
import type { SellerAdBidRecommendation, SellerAdCampaignRow } from "@/lib/seller-hub/types";
import type { AdsData } from "./hub-ads-data";
import { AUTO_AI_DEBOUNCE_MS, useAutoAi } from "./use-auto-ai";

/**
 * Разбор кампаний нейросетью: состояние и действия живут здесь, чтобы один и тот же разбор видели и «Обзор», и список кампаний.
 * Разбор запускается сам, когда меняются цифры (если включено «Автоматически»), и хранится, пока цифры те же.
 */
const REVIEW_CHUNK = 12;
const REVIEW_MAX = 48;

export function useAdsReview({
  data,
  campaigns,
  onCampaignsUpdate,
  previewFacts,
  previewReviews,
}: {
  data: AdsData;
  campaigns: SellerAdCampaignRow[];
  onCampaignsUpdate: (rows: SellerAdCampaignRow[]) => void;
  /** Только для страницы предпросмотра: готовые факты и разбор вместо загрузки. */
  previewFacts?: CampaignFacts[];
  previewReviews?: CampaignReview[];
}) {
  const [recs, setRecs] = useState<SellerAdBidRecommendation[]>([]);
  /** Рекомендованные ставки догрузились (или их нет): до этого факты неполные, разбор по ним не запускаем. */
  const [recsSettled, setRecsSettled] = useState(false);
  /** Для какого набора цифр уже проверили сохранённый разбор. */
  const [savedFor, setSavedFor] = useState<string | null>(null);
  const attempted = useRef<Set<string>>(new Set());
  const auto = useAutoAi();
  const [reviews, setReviews] = useState<CampaignReview[] | null>(previewReviews ?? null);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState<Record<string, string>>({});

  const pairs = useMemo(
    () => campaigns.filter((c) => c.status === 9 && c.paymentType === "cpm").flatMap((c) => (c.bids ?? []).map((b) => ({ advertId: Number(c.id), nmId: Number(b.nmId) }))).slice(0, 12),
    [campaigns],
  );
  useEffect(() => {
    if (pairs.length === 0) {
      let cancelledEmpty = false;
      void Promise.resolve().then(() => {
        if (!cancelledEmpty) setRecsSettled(true);
      });
      return () => {
        cancelledEmpty = true;
      };
    }
    let cancelled = false;
    void loadSellerHubAdBidRecommendations({ pairs }).then((res) => {
      if (cancelled) return;
      if (res.ok && res.recommendations) setRecs(res.recommendations);
      setRecsSettled(true);
    });
    return () => {
      cancelled = true;
    };
  }, [pairs]);

  const computedFacts = useMemo<CampaignFacts[]>(
    () =>
      previewFacts
        ? []
        : data.current.stats && recsSettled
          ? buildCampaignFacts({
              campaigns,
              stats: data.current.stats.campaigns,
              prevStats: data.previous.stats?.campaigns ?? null,
              products: data.advisorProducts,
              bids: compareBids(campaigns, recs),
              days: Number(data.days),
              storeCpo: data.summary?.cpo ?? null,
            })
          : [],
    [previewFacts, recsSettled, campaigns, data.current.stats, data.previous.stats, data.advisorProducts, recs, data.days, data.summary],
  );
  const facts = previewFacts ?? computedFacts;
  const factsKey = useMemo(() => JSON.stringify(facts), [facts]);
  /** Кампании идут на разбор пачками по REVIEW_CHUNK, самые затратные первыми: у крупного магазина их десятки, а модель и сервер берут ограниченное число за раз. */
  const chunks = useMemo(() => {
    const ordered = [...facts].sort((a, b) => b.spend - a.spend).slice(0, REVIEW_MAX);
    const out: CampaignFacts[][] = [];
    for (let i = 0; i < ordered.length; i += REVIEW_CHUNK) out.push(ordered.slice(i, i + REVIEW_CHUNK));
    return out;
  }, [facts]);

  /**
   * Разбор: до трёх попыток подряд, пока на экране обычная загрузка. Сбой провайдера нейросети не должен доходить до человека
   * после первого же отказа, а повторный запрос с теми же цифрами сервер отдаёт из сохранённого.
   */
  async function ask() {
    setAsking(true);
    setError(null);
    let lastError: string | null = null;
    let gotAny = false;
    const have = new Set((reviews ?? []).map((r) => r.id));
    for (const chunk of chunks) {
      if (chunk.every((f) => have.has(f.id))) continue;
      let done = false;
      for (let attempt = 0; attempt < 3 && !done; attempt += 1) {
        if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 2500 * attempt));
        try {
          const res = await reviewSellerHubCampaigns({ facts: chunk });
          if (res.ok && res.reviews) {
            const got = res.reviews;
            setReviews((prev) => [...(prev ?? []).filter((r) => !got.some((g) => g.id === r.id)), ...got]);
            got.forEach((r) => have.add(r.id));
            gotAny = true;
            done = true;
          } else {
            lastError = res.error ?? "Разбор не получился";
          }
        } catch (e) {
          lastError = e instanceof Error ? e.message : "Разбор не получился";
        }
      }
    }
    setAsking(false);
    // Часть кампаний разобрана: ошибку не показываем, остальное доберётся при следующем обновлении цифр.
    setError(gotAny ? null : lastError);
  }

  // Уже готовый разбор того же набора цифр показываем бесплатно.
  useEffect(() => {
    if (facts.length === 0 || previewReviews) return;
    let cancelled = false;
    void Promise.all(chunks.map((chunk) => reviewSellerHubCampaigns({ facts: chunk, saved: true }).catch(() => ({ ok: false as const, reviews: null })))).then((results) => {
      if (cancelled) return;
      // Цифры изменились и готового разбора для них нет: старый разбор устарел, убираем его, чтобы не вводить в заблуждение.
      const found = results.flatMap((res) => (res.ok && res.reviews ? res.reviews : []));
      setReviews(found.length > 0 ? found : null);
      setSavedFor(factsKey);
    });
    return () => {
      cancelled = true;
    };
    // facts меняется вместе с factsKey; ключ стабилен, пока цифры те же
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [factsKey]);

  // Автоматический разбор: цифры изменились, готового разбора нет, данные догружены. Пауза гасит промежуточные состояния;
  // один набор цифр запускаем не больше одного раза за сессию, повторы и ошибки не зацикливаются.
  useEffect(() => {
    const have = new Set((reviews ?? []).map((r) => r.id));
    const missing = chunks.some((chunk) => chunk.some((f) => !have.has(f.id)));
    if (!auto.enabled || !auto.ready || !recsSettled || asking || !missing || facts.length === 0) return;
    if (savedFor !== factsKey || attempted.current.has(factsKey)) return;
    const timer = setTimeout(() => {
      attempted.current.add(factsKey);
      void ask();
    }, AUTO_AI_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // ask использует актуальные facts через замыкание текущего рендера; запуск привязан к ключу цифр
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto.enabled, auto.ready, recsSettled, asking, reviews, savedFor, factsKey]);

  async function run(key: string, fact: CampaignFacts, option: ReviewOption) {
    const action = actionForOption(option, fact);
    if (!action || running) return;
    setRunning(key);
    const res = await executeAgentAction(action);
    setRunning(null);
    setConfirmKey(null);
    if (!res.ok) {
      setFailed((prev) => ({ ...prev, [key]: res.error ?? "Не удалось выполнить" }));
      return;
    }
    setDone((prev) => ({ ...prev, [key]: "Выполнено" }));
    onCampaignsUpdate(applyActionToCampaigns(action, campaigns, res.createdId));
  }

  /** Вывод по каждой кампании по её номеру: нужен и списку кампаний. */
  const reviewById = useMemo(() => new Map((reviews ?? []).map((r) => [r.id, r])), [reviews]);

  /** Факты собраны: до этого разбор показывает загрузку, а не пустое место. */
  const ready = Boolean(previewFacts) || recsSettled;

  return { facts, ready, reviews, reviewById, asking, error, ask, run, confirmKey, setConfirmKey, running, done, failed, auto };
}

export type AdsReviewState = ReturnType<typeof useAdsReview>;
