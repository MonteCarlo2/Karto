"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AUTO_AI_DEBOUNCE_MS, useAutoAi } from "./use-auto-ai";
import type { CardVerdict } from "@/lib/seller-hub/card-verdict";
import { applyActionToCampaigns, describeAgentAction, executeAgentAction } from "@/lib/seller-hub/agent-exec";
import { adviseSellerHubProducts } from "@/lib/seller-hub/client-api";
import { actionForProductOption, PRODUCT_OPTION_LABEL, type ProductAdvice, type ProductFacts, type ProductOption } from "@/lib/seller-hub/product-advice";
import type { SellerAdCampaignRow } from "@/lib/seller-hub/types";
import { hub, HubButton, HubPanel, HubPanelHeader, hubSans } from "./hub-ui";

const COST_PER_PRODUCT_USD = 0.0007;

/**
 * План действий по проблемным карточкам: нейросеть определяет вероятную причину и предлагает варианты (реклама, цена, акция, фото, текст, запас).
 * Исполняет агент после подтверждения; всё, что нельзя выполнить кнопкой, ведёт в нужное место.
 */
export function HubAdsCardsPlan({
  aiSettled,
  facts,
  verdicts,
  campaigns,
  onCampaignsUpdate,
  onGoTab,
  onOpenFlow,
}: {
  /** Оценки фото и текста догружены и не идут сейчас: факты по товарам полные, план можно строить. */
  aiSettled: boolean;
  facts: ProductFacts[];
  verdicts: CardVerdict[];
  campaigns: SellerAdCampaignRow[];
  onCampaignsUpdate: (rows: SellerAdCampaignRow[]) => void;
  onGoTab: (tab: "promotions") => void;
  onOpenFlow: (nmId: string, href: string, extra?: { missingKeywords?: string[]; notes?: string[] }) => void;
}) {
  const [advice, setAdvice] = useState<ProductAdvice[] | null>(null);
  const [savedFor, setSavedFor] = useState<string | null>(null);
  const attempted = useRef<Set<string>>(new Set());
  const auto = useAutoAi();
  const [asking, setAsking] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState<Record<string, string>>({});

  // Проблемные карточки: те, где разбираться важнее всего (вердикты уже отсортированы по важности).
  const problem = useMemo(() => {
    const ids = verdicts.filter((v) => v.verdict !== "works" && v.verdict !== "no_data").slice(0, 10).map((v) => v.nmId);
    const byNm = new Map(facts.map((f) => [f.nmId, f]));
    return ids.flatMap((id) => (byNm.has(id) ? [byNm.get(id)!] : []));
  }, [verdicts, facts]);
  const key = useMemo(() => JSON.stringify(problem), [problem]);

  useEffect(() => {
    if (problem.length === 0) return;
    let cancelled = false;
    void adviseSellerHubProducts({ facts: problem, saved: true }).then((res) => {
      if (cancelled) return;
      // Цифры изменились и готового плана для них нет: прежний план устарел.
      setAdvice(res.ok && res.advice ? res.advice : null);
      setSavedFor(key);
    });
    return () => {
      cancelled = true;
    };
    // problem меняется вместе с key; ключ стабилен, пока цифры те же
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Автоматический план: цифры изменились, готового плана нет, оценки карточек догружены. Один набор цифр за сессию один раз.
  useEffect(() => {
    if (!auto.enabled || !auto.ready || !aiSettled || asking || advice || problem.length === 0) return;
    if (savedFor !== key || attempted.current.has(key)) return;
    const timer = setTimeout(() => {
      attempted.current.add(key);
      void ask();
    }, AUTO_AI_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // ask берёт актуальные факты текущего рендера; запуск привязан к ключу цифр
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto.enabled, auto.ready, aiSettled, asking, advice, savedFor, key]);

  if (problem.length === 0) return null;
  const cost = Math.round(problem.length * COST_PER_PRODUCT_USD * 10000) / 10000;

  async function ask() {
    setAsking(true);
    setConfirming(false);
    setError(null);
    const res = await adviseSellerHubProducts({ facts: problem });
    setAsking(false);
    if (res.ok && res.advice) setAdvice(res.advice);
    else setError(res.error ?? "План не получился");
  }

  async function run(k: string, fact: ProductFacts, option: ProductOption) {
    const action = actionForProductOption(option.kind, fact);
    if (!action || running) return;
    setRunning(k);
    const res = await executeAgentAction(action);
    setRunning(null);
    setConfirmKey(null);
    if (!res.ok) {
      setFailed((prev) => ({ ...prev, [k]: res.error ?? "Не удалось выполнить" }));
      return;
    }
    setDone((prev) => ({ ...prev, [k]: action.type === "price" ? "Цена отправлена в WB. Новая цена появится после обновления данных кабинета." : "Выполнено" }));
    onCampaignsUpdate(applyActionToCampaigns(action, campaigns, res.createdId));
  }

  return (
    <HubPanel>
      <HubPanelHeader
        title="План действий по проблемным карточкам"
        hint="Нейросеть смотрит на воронку, цену и маржу, остаток, рекламу, оценку фото и текста, акции и предлагает варианты, что сделать с каждым товаром. Выбираете один вариант или несколько."
        action={
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex cursor-pointer items-center gap-1.5 text-[12.5px]" style={{ ...hubSans, color: hub.textMuted }} title="План строится сам, когда меняются цифры. Тот же набор цифр повторно не оплачивается.">
              <input type="checkbox" className="h-3.5 w-3.5" checked={auto.enabled} disabled={!auto.ready} onChange={(e) => auto.setEnabled(e.target.checked)} />
              Автоматически
            </label>
            {advice && !asking ? (
              <HubButton size="sm" variant="secondary" onClick={() => setConfirming(true)}>
                Составить заново
              </HubButton>
            ) : null}
          </div>
        }
      />
      {!advice ? (
        <div className="space-y-3 px-5 py-4 sm:px-6">
          <p className="text-[13.5px] leading-5" style={{ ...hubSans, color: hub.textMuted }}>
            Проблемных карточек: {problem.length}. План хранится, пока цифры не изменились.
          </p>
          {confirming || asking ? null : <HubButton onClick={() => setConfirming(true)}>Составить план нейросетью</HubButton>}
        </div>
      ) : null}
      {confirming && !asking ? (
        <div className="mx-5 mb-4 mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3 sm:mx-6" style={{ backgroundColor: hub.warnSoft }}>
          <p className="text-[13px] leading-5" style={{ ...hubSans, color: hub.warn }}>
            Платный вызов вашего ключа OpenRouter: {problem.length} карточек, около ${cost.toLocaleString("ru-RU")}. Тот же набор цифр повторно не оплачивается.
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
          Составляю план…
        </p>
      ) : null}
      {error ? (
        <p className="px-5 pb-3 text-[12.5px] sm:px-6" style={{ ...hubSans, color: hub.danger }}>
          {error}
        </p>
      ) : null}

      {advice ? (
        <ul className="divide-y" style={{ borderColor: hub.borderSoft }}>
          {advice.map((a) => {
            const fact = problem.find((f) => f.nmId === a.nmId);
            if (!fact) return null;
            return (
              <li key={a.nmId} className="space-y-2.5 px-5 py-4 sm:px-6">
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-semibold" style={{ ...hubSans, color: hub.text }}>
                    {fact.title}
                  </p>
                  <p className="text-[12px]" style={{ ...hubSans, color: hub.textMuted }}>
                    {fact.nmId}
                  </p>
                </div>
                {a.headline ? (
                  <p className="text-[13.5px] font-semibold" style={{ ...hubSans, color: hub.text }}>
                    {a.headline}
                  </p>
                ) : null}
                {a.summary ? (
                  <p className="text-[13px] leading-5" style={{ ...hubSans, color: hub.textMuted }}>
                    {a.summary}
                  </p>
                ) : null}
                <ul className="space-y-2">
                  {a.options.map((o, i) => {
                    const k = `${a.nmId}:${o.kind}:${i}`;
                    const action = actionForProductOption(o.kind, fact);
                    return (
                      <li key={k} className="rounded-lg border px-3 py-2.5" style={{ borderColor: hub.border }}>
                        <p className="text-[13px] font-semibold" style={{ ...hubSans, color: hub.text }}>
                          {PRODUCT_OPTION_LABEL[o.kind]}
                        </p>
                        {o.reason ? (
                          <p className="mt-0.5 text-[12.5px] leading-5" style={{ ...hubSans, color: hub.textMuted }}>
                            {o.reason}
                          </p>
                        ) : null}
                        {failed[k] ? (
                          <p className="mt-1 text-[12.5px]" style={{ ...hubSans, color: hub.danger }}>
                            {failed[k]}
                          </p>
                        ) : null}
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          {done[k] ? (
                            <span className="text-[12.5px] font-semibold" style={{ ...hubSans, color: hub.green }}>
                              {done[k]}
                            </span>
                          ) : action ? (
                            confirmKey === k ? (
                              <>
                                <span className="text-[12.5px]" style={{ ...hubSans, color: hub.warn }}>
                                  Подтвердите: {describeAgentAction(action, campaigns)}.
                                </span>
                                <HubButton size="sm" loading={running === k} onClick={() => void run(k, fact, o)}>
                                  Подтвердить
                                </HubButton>
                                <HubButton size="sm" variant="secondary" disabled={running === k} onClick={() => setConfirmKey(null)}>
                                  Отмена
                                </HubButton>
                              </>
                            ) : (
                              <HubButton size="sm" onClick={() => setConfirmKey(k)}>
                                Выполнить
                              </HubButton>
                            )
                          ) : o.kind === "join_promo" ? (
                            <HubButton size="sm" variant="secondary" onClick={() => onGoTab("promotions")}>
                              Открыть акции
                            </HubButton>
                          ) : o.kind === "improve_photo" ? (
                            <HubButton size="sm" variant="secondary" onClick={() => onOpenFlow(a.nmId, "/studio/visual")}>
                              Создать новую карточку в Потоке
                            </HubButton>
                          ) : o.kind === "improve_text" ? (
                            <HubButton size="sm" variant="secondary" onClick={() => onOpenFlow(a.nmId, "/studio/descriptions")}>
                              Собрать SEO-описание
                            </HubButton>
                          ) : o.kind === "enter_cost" ? (
                            <span className="text-[12px]" style={{ ...hubSans, color: hub.textMuted }}>
                              Себестоимость вводится в разделе «Товары» (карточка товара или таблица). Её не знает WB, и без неё маржа и безопасная цена не считаются.
                            </span>
                          ) : o.kind === "restock" ? (
                            <span className="text-[12px]" style={{ ...hubSans, color: hub.textMuted }}>
                              Поставку оформляют в кабинете WB; план отгрузки смотрите в разделе «Заказы и логистика».
                            </span>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ul>
      ) : null}
    </HubPanel>
  );
}
