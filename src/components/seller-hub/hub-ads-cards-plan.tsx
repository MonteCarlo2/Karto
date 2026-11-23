"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AUTO_AI_DEBOUNCE_MS, useAutoAi } from "./use-auto-ai";
import type { CardVerdict } from "@/lib/seller-hub/card-verdict";
import { applyActionToCampaigns, describeAgentAction, executeAgentAction } from "@/lib/seller-hub/agent-exec";
import { adviseSellerHubProducts } from "@/lib/seller-hub/client-api";
import { actionForProductOption, PRODUCT_OPTION_LABEL, type ProductAdvice, type ProductFacts, type ProductOption } from "@/lib/seller-hub/product-advice";
import type { SellerAdCampaignRow } from "@/lib/seller-hub/types";
import { ConfirmPanel, sentence } from "./hub-confirm-panel";
import { irreversibleWarning } from "@/lib/seller-hub/agent/actions";
import { hub, HubButton, hubSans } from "./hub-ui";
import { ListChecks } from "lucide-react";


/**
 * План действий по проблемным карточкам: нейросеть определяет вероятную причину и предлагает варианты (реклама, цена, акция, фото, текст, запас).
 * Исполняет агент после подтверждения; всё, что нельзя выполнить кнопкой, ведёт в нужное место.
 */
export function useCardsPlan({
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
  const [, setConfirming] = useState(false);
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

  const hasAdvice = (nmId: string) => Boolean(advice?.some((x) => x.nmId === nmId));
  const adviceFor = (nmId: string) => advice?.find((x) => x.nmId === nmId) ?? null;

  /** Блок «Что можно сделать» внутри плитки карточки: варианты нейросети, которые программа умеет выполнить сама или куда ведёт. */
  function renderOptions(nmId: string) {
    const a = adviceFor(nmId);
    const fact = problem.find((f) => f.nmId === nmId);
    if (!a || !fact || a.options.length === 0) return null;
    return (
      <div className="mt-6 rounded-[22px] p-5 sm:p-6" style={{ backgroundColor: "rgba(1, 20, 8, 0.045)" }}>
        <p className="flex items-center gap-3 text-[21px] font-semibold tracking-[-0.015em]" style={{ ...hubSans, color: hub.text }}>
          <span className="flex h-9 w-9 items-center justify-center rounded-full" style={{ backgroundColor: "#B9FF4B" }} aria-hidden>
            <ListChecks className="h-[19px] w-[19px]" style={{ color: hub.text }} />
          </span>
          Что можно сделать
        </p>
        <ul className="mt-3 divide-y" style={{ borderColor: "rgba(1, 20, 8, 0.1)" }}>
          {a.options.map((o, i) => {
            const k = `${a.nmId}:${o.kind}:${i}`;
            const action = actionForProductOption(o.kind, fact);
            return (
              <li key={k} className="py-3.5" style={{ borderColor: "rgba(1, 20, 8, 0.1)" }}>
                <div className="grid gap-x-5 gap-y-2.5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                  <div className="min-w-0">
                    <p className="text-[16px] font-semibold leading-[1.35]" style={{ ...hubSans, color: hub.text }}>
                      {PRODUCT_OPTION_LABEL[o.kind]}
                    </p>
                    {o.reason ? (
                      <p className="mt-0.5 text-[15px] leading-[1.5]" style={{ ...hubSans, color: hub.textMuted }}>
                        {o.reason}
                      </p>
                    ) : null}
                    {failed[k] ? (
                      <p className="mt-1 text-[14.5px]" style={{ ...hubSans, color: hub.danger }}>
                        {failed[k]}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2.5 md:justify-end">
                    {done[k] ? (
                      <span className="text-[15px] font-semibold" style={{ ...hubSans, color: "#067A55" }}>
                        {done[k]}
                      </span>
                    ) : action ? (
                      confirmKey === k ? null : <HubButton onClick={() => setConfirmKey(k)}>Выполнить</HubButton>
                    ) : o.kind === "join_promo" ? (
                      <HubButton variant="secondary" onClick={() => onGoTab("promotions")}>
                        Открыть акции
                      </HubButton>
                    ) : o.kind === "improve_photo" ? (
                      <HubButton variant="secondary" onClick={() => onOpenFlow(a.nmId, "/studio/visual")}>
                        Создать карточку в Потоке
                      </HubButton>
                    ) : o.kind === "improve_text" ? (
                      <HubButton variant="secondary" onClick={() => onOpenFlow(a.nmId, "/studio/descriptions")}>
                        Собрать SEO-описание
                      </HubButton>
                    ) : o.kind === "enter_cost" ? (
                      <span className="max-w-[44ch] text-[14.5px] leading-[1.45]" style={{ ...hubSans, color: hub.textMuted }}>
                        Себестоимость вводится в разделе «Товары»: без неё маржа не считается.
                      </span>
                    ) : o.kind === "restock" ? (
                      <span className="max-w-[44ch] text-[14.5px] leading-[1.45]" style={{ ...hubSans, color: hub.textMuted }}>
                        Поставку оформляют в кабинете WB; план смотрите в «Заказы и логистика».
                      </span>
                    ) : null}
                  </div>
                </div>
                {confirmKey === k && action ? (
                  <ConfirmPanel busy={running === k} onConfirm={() => void run(k, fact, o)} onCancel={() => setConfirmKey(null)} note={irreversibleWarning(action)}>
                    {sentence(describeAgentAction(action, campaigns))}.
                  </ConfirmPanel>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  return { advice, asking, error, ask, auto, problemCount: problem.length, hasAdvice, adviceFor, renderOptions };
}
