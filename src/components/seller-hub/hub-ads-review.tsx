"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AUTO_AI_DEBOUNCE_MS, useAutoAi } from "./use-auto-ai";
import { compareBids } from "@/lib/seller-hub/ads-bids";
import {
  actionForOption,
  buildCampaignFacts,
  OPTION_LABEL,
  type CampaignFacts,
  type CampaignReview,
  type ReviewOption,
  type ReviewVerdict,
} from "@/lib/seller-hub/ads-review";
import { applyActionToCampaigns, describeAgentAction, executeAgentAction } from "@/lib/seller-hub/agent-exec";
import { loadSellerHubAdBidRecommendations, reviewSellerHubCampaigns } from "@/lib/seller-hub/client-api";
import type { SellerAdBidRecommendation, SellerAdCampaignRow } from "@/lib/seller-hub/types";
import type { AdsData } from "./hub-ads-data";
import { hub, HubButton, HubPanel, HubPanelHeader, hubSans } from "./hub-ui";

const VERDICT: Record<ReviewVerdict, { label: string; bg: string; fg: string }> = {
  good: { label: "Работает хорошо", bg: hub.greenSoft, fg: hub.green },
  improve: { label: "Можно улучшить", bg: hub.blueSoft, fg: hub.blue },
  bad: { label: "Невыгодна", bg: hub.dangerSoft, fg: hub.danger },
  no_data: { label: "Мало данных", bg: hub.surfaceMuted, fg: hub.textMuted },
};

const COST_USD = 0.0025;

/** Разбор кампаний: нейросеть оценивает каждую кампанию по цифрам и предлагает варианты действий; исполняет их агент после подтверждения. */
export function HubAdsReview({
  data,
  campaigns,
  onCampaignsUpdate,
  onGoTab,
}: {
  data: AdsData;
  campaigns: SellerAdCampaignRow[];
  onCampaignsUpdate: (rows: SellerAdCampaignRow[]) => void;
  onGoTab: (tab: "cards" | "promotions") => void;
}) {
  const [recs, setRecs] = useState<SellerAdBidRecommendation[]>([]);
  /** Рекомендованные ставки догрузились (или их нет): до этого факты неполные, платный разбор по ним не запускаем. */
  const [recsSettled, setRecsSettled] = useState(false);
  /** Для какого набора цифр уже проверили сохранённый разбор. */
  const [savedFor, setSavedFor] = useState<string | null>(null);
  const attempted = useRef<Set<string>>(new Set());
  const auto = useAutoAi();
  const [reviews, setReviews] = useState<CampaignReview[] | null>(null);
  const [asking, setAsking] = useState(false);
  const [confirming, setConfirming] = useState(false);
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

  const facts = useMemo<CampaignFacts[]>(
    () =>
      data.current.stats
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
    [campaigns, data.current.stats, data.previous.stats, data.advisorProducts, recs, data.days, data.summary],
  );
  const factsKey = useMemo(() => JSON.stringify(facts), [facts]);

  // Уже готовый разбор того же набора цифр показываем бесплатно.
  useEffect(() => {
    if (facts.length === 0) return;
    let cancelled = false;
    void reviewSellerHubCampaigns({ facts, saved: true }).then((res) => {
      if (cancelled) return;
      // Цифры изменились и готового разбора для них нет: старый разбор устарел, убираем его, чтобы не вводить в заблуждение.
      setReviews(res.ok && res.reviews ? res.reviews : null);
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
    if (!auto.enabled || !auto.ready || !recsSettled || asking || reviews || facts.length === 0) return;
    if (savedFor !== factsKey || attempted.current.has(factsKey)) return;
    const timer = setTimeout(() => {
      attempted.current.add(factsKey);
      void ask();
    }, AUTO_AI_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // ask использует актуальные facts через замыкание текущего рендера; запуск привязан к ключу цифр
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto.enabled, auto.ready, recsSettled, asking, reviews, savedFor, factsKey]);

  if (facts.length === 0) return null;

  async function ask() {
    setAsking(true);
    setConfirming(false);
    setError(null);
    const res = await reviewSellerHubCampaigns({ facts });
    setAsking(false);
    if (res.ok && res.reviews) setReviews(res.reviews);
    else setError(res.error ?? "Разбор не получился");
  }

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

  return (
    <HubPanel>
      <HubPanelHeader
        title="Разбор кампаний"
        hint="Нейросеть смотрит на цифры каждой кампании (расход, заказы, ДРР против маржи, ставки, бюджет) и подсказывает, что с ней делать. Если всё хорошо, она так и скажет."
        action={
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex cursor-pointer items-center gap-1.5 text-[12.5px]" style={{ ...hubSans, color: hub.textMuted }} title="Разбор запускается сам, когда меняются цифры. Тот же набор цифр повторно не оплачивается.">
              <input type="checkbox" className="h-3.5 w-3.5" checked={auto.enabled} disabled={!auto.ready} onChange={(e) => auto.setEnabled(e.target.checked)} />
              Автоматически
            </label>
            {reviews && !asking ? (
              <HubButton size="sm" variant="secondary" onClick={() => setConfirming(true)}>
                Разобрать заново
              </HubButton>
            ) : null}
          </div>
        }
      />
      {!reviews ? (
        <div className="space-y-3 px-5 py-4 sm:px-6">
          <p className="text-[13.5px] leading-5" style={{ ...hubSans, color: hub.textMuted }}>
            Кампаний к разбору: {facts.length}. Разбор делается по цифрам за выбранный период и хранится, пока цифры не изменились.
          </p>
          {confirming || asking ? null : (
            <HubButton onClick={() => setConfirming(true)}>Разобрать кампании нейросетью</HubButton>
          )}
        </div>
      ) : null}
      {confirming && !asking ? (
        <div className="mx-5 mb-4 mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3 sm:mx-6" style={{ backgroundColor: hub.warnSoft }}>
          <p className="text-[13px] leading-5" style={{ ...hubSans, color: hub.warn }}>
            Платный вызов вашего ключа OpenRouter: около ${COST_USD.toLocaleString("ru-RU")} за весь разбор. Тот же набор цифр повторно не оплачивается.
          </p>
          <div className="flex gap-2">
            <HubButton onClick={() => void ask()}>Запустить</HubButton>
            <HubButton variant="secondary" onClick={() => setConfirming(false)}>
              Отмена
            </HubButton>
          </div>
        </div>
      ) : null}
      {asking ? (
        <p className="px-5 py-4 text-[13px] sm:px-6" style={{ ...hubSans, color: hub.textMuted }}>
          Разбираю кампании…
        </p>
      ) : null}
      {error ? (
        <p className="px-5 pb-3 text-[12.5px] sm:px-6" style={{ ...hubSans, color: hub.danger }}>
          {error}
        </p>
      ) : null}

      {reviews ? (
        <ul className="divide-y" style={{ borderColor: hub.borderSoft }}>
          {reviews.map((r) => {
            const fact = facts.find((f) => f.id === r.id);
            if (!fact) return null;
            const v = VERDICT[r.verdict];
            return (
              <li key={r.id} className="space-y-2.5 px-5 py-4 sm:px-6">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-semibold" style={{ ...hubSans, color: hub.text }}>
                      {fact.name}
                    </p>
                    <p className="text-[12px] tabular-nums" style={{ ...hubSans, color: hub.textMuted }}>
                      расход {fact.spend.toLocaleString("ru-RU")} ₽ · заказов {fact.orders} · ДРР {fact.drr != null ? `${fact.drr.toLocaleString("ru-RU")}%` : "—"}
                    </p>
                  </div>
                  <span className="rounded-md px-2.5 py-1 text-[12px] font-semibold" style={{ ...hubSans, backgroundColor: v.bg, color: v.fg }}>
                    {v.label}
                  </span>
                </div>
                {r.headline ? (
                  <p className="text-[13.5px] font-semibold" style={{ ...hubSans, color: hub.text }}>
                    {r.headline}
                  </p>
                ) : null}
                {r.summary ? (
                  <p className="text-[13px] leading-5" style={{ ...hubSans, color: hub.textMuted }}>
                    {r.summary}
                  </p>
                ) : null}
                {r.options.length > 0 ? (
                  <ul className="space-y-2">
                    {r.options.map((o, i) => {
                      const key = `${r.id}:${o.kind}:${o.nmId ?? ""}:${i}`;
                      const action = actionForOption(o, fact);
                      return (
                        <li key={key} className="rounded-lg border px-3 py-2.5" style={{ borderColor: hub.border }}>
                          <p className="text-[13px] font-semibold" style={{ ...hubSans, color: hub.text }}>
                            {OPTION_LABEL[o.kind]}
                            {o.nmId ? <span style={{ color: hub.textMuted }}> · {fact.products.find((p) => p.nmId === o.nmId)?.title ?? o.nmId}</span> : null}
                          </p>
                          {o.reason ? (
                            <p className="mt-0.5 text-[12.5px] leading-5" style={{ ...hubSans, color: hub.textMuted }}>
                              {o.reason}
                            </p>
                          ) : null}
                          {failed[key] ? (
                            <p className="mt-1 text-[12.5px]" style={{ ...hubSans, color: hub.danger }}>
                              {failed[key]}
                            </p>
                          ) : null}
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            {done[key] ? (
                              <span className="text-[12.5px] font-semibold" style={{ ...hubSans, color: hub.green }}>
                                {done[key]}
                              </span>
                            ) : action ? (
                              confirmKey === key ? (
                                <>
                                  <span className="text-[12.5px]" style={{ ...hubSans, color: hub.warn }}>
                                    Подтвердите: {describeAgentAction(action, campaigns)}.
                                  </span>
                                  <HubButton size="sm" loading={running === key} onClick={() => void run(key, fact, o)}>
                                    Подтвердить
                                  </HubButton>
                                  <HubButton size="sm" variant="secondary" disabled={running === key} onClick={() => setConfirmKey(null)}>
                                    Отмена
                                  </HubButton>
                                </>
                              ) : (
                                <HubButton size="sm" onClick={() => setConfirmKey(key)}>
                                  Выполнить
                                </HubButton>
                              )
                            ) : o.kind === "improve_card" ? (
                              <HubButton size="sm" variant="secondary" onClick={() => onGoTab("cards")}>
                                Открыть оценку карточки
                              </HubButton>
                            ) : o.kind === "join_promo" ? (
                              <HubButton size="sm" variant="secondary" onClick={() => onGoTab("promotions")}>
                                Открыть акции
                              </HubButton>
                            ) : o.kind === "lower_price" ? (
                              <span className="text-[12px]" style={{ ...hubSans, color: hub.textMuted }}>
                                Цену меняют в разделе «Товары», вкладка цен.
                              </span>
                            ) : o.kind === "new_campaign_cpc" ? (
                              <span className="text-[12px]" style={{ ...hubSans, color: hub.textMuted }}>
                                Тип оплаты у существующей кампании WB сменить не даёт: создайте новую кампанию с оплатой за клик в кабинете WB.
                              </span>
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </HubPanel>
  );
}
