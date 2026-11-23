"use client";

import { useState } from "react";
import { usePagedLimit } from "./use-paged-limit";
import { AlertTriangle, CheckCircle2, Clock, ListChecks, TrendingUp, type LucideIcon } from "lucide-react";
import { actionForOption, OPTION_LABEL, type ReviewVerdict } from "@/lib/seller-hub/ads-review";
import { irreversibleWarning } from "@/lib/seller-hub/agent/actions";
import { describeAgentAction } from "@/lib/seller-hub/agent-exec";
import type { SellerAdCampaignRow } from "@/lib/seller-hub/types";
import { Card, LoadingBlock } from "./hub-analytics-ui";
import { Thumb } from "./hub-fulfillment-ui";
import { ConfirmPanel, sentence } from "./hub-confirm-panel";
import { hub, HubButton, hubSans } from "./hub-ui";
import type { AdsReviewState } from "./use-ads-review";

export const VERDICT: Record<ReviewVerdict, { label: string; color: string; Icon: LucideIcon }> = {
  good: { label: "Работает хорошо", color: "#2E9E6B", Icon: CheckCircle2 },
  improve: { label: "Можно улучшить", color: "#4F5BEA", Icon: TrendingUp },
  bad: { label: "Невыгодна", color: "#C8453F", Icon: AlertTriangle },
  no_data: { label: "Мало данных", color: "#7C877D", Icon: Clock },
};

/** Вердикт прямоугольной плашкой с округлыми краями: главное, что должно бросаться в глаза. */
export function VerdictBadge({ verdict }: { verdict: ReviewVerdict }) {
  const v = VERDICT[verdict];
  return (
    <span className="inline-flex shrink-0 items-center gap-2 rounded-[12px] border px-3.5 py-2 text-[14px] font-semibold" style={{ ...hubSans, color: v.color, backgroundColor: `color-mix(in srgb, ${v.color} 13%, white)`, borderColor: `color-mix(in srgb, ${v.color} 32%, white)` }}>
      <v.Icon className="h-[17px] w-[17px]" aria-hidden />
      {v.label}
    </span>
  );
}

/** Товары кампании: крупное фото и название, без лишних подписей и не на белом фоне. */
export function ProductChips({ products, photos, limit = 6 }: { products: Array<{ nmId: string; title: string }>; photos?: Map<string, string | undefined>; limit?: number }) {
  const [all, setAll] = useState(false);
  if (products.length === 0) return null;
  const shown = all ? products : products.slice(0, limit);
  return (
    <ul className="flex flex-wrap items-center gap-3">
      {shown.map((p) => (
        <li key={p.nmId} className="flex max-w-full items-center gap-3.5 rounded-[18px] p-2 pr-4" style={{ backgroundColor: "rgba(1, 20, 8, 0.055)" }}>
          <Thumb src={photos?.get(p.nmId)} className="h-[72px] w-[54px]" />
          <span className="line-clamp-3 text-[15px] font-semibold leading-[1.3]" style={{ ...hubSans, color: hub.text, maxWidth: 210 }}>
            {p.title}
          </span>
        </li>
      ))}
      {products.length > limit ? (
        <li>
          <button type="button" onClick={() => setAll((v) => !v)} className="rounded-full px-4 py-2.5 text-[14.5px] font-semibold outline-none transition-colors hover:bg-black/[0.06] focus-visible:shadow-[0_0_0_2px_var(--hub-canvas),0_0_0_4px_var(--hub-lime-ring)]" style={{ ...hubSans, color: hub.text, backgroundColor: "rgba(1, 20, 8, 0.045)" }}>
            {all ? "Свернуть" : `Показать все (${products.length})`}
          </button>
        </li>
      ) : null}
    </ul>
  );
}

/** Пояснение нейросети режем на короткие тезисы: читается быстрее, чем сплошной абзац. */
const points = (text: string) =>
  text
    .split(/(?<=[.!?])\s+(?=[А-ЯЁA-Z«"])/)
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, 2);

const pct = (v: number | null) => (v != null ? `${v.toLocaleString("ru-RU")}%` : "—");

/**
 * Разбор кампаний: у каждой кампании плитка как у задачи. Название и вердикт, товары, главный вывод нейросети выделенным блоком,
 * три главные цифры одной строкой и варианты действий. Если данных мало, просто так и сказано.
 */
/** Сначала те, где есть что исправить. */
const VERDICT_RANK: Record<ReviewVerdict, number> = { bad: 0, improve: 1, no_data: 3, good: 2 };

export function HubAdsReview({ review, campaigns, photos, onGoTab, promoOk }: { review: AdsReviewState; campaigns: SellerAdCampaignRow[]; photos?: Map<string, string | undefined>; onGoTab: (tab: "cards" | "promotions") => void; /** Артикулы, для которых вход в акцию выгоден по тому же правилу, что и в задачах. Без этого «войти в акцию» не предлагаем. */ promoOk?: Set<string> }) {
  const { facts, ready, reviews, asking, error, ask, run, confirmKey, setConfirmKey, running, done, failed, auto } = review;
  const paged = usePagedLimit("reviews", 5, 5);
  const sortedReviews = [...(reviews ?? [])].sort((a, b) => VERDICT_RANK[a.verdict] - VERDICT_RANK[b.verdict]);
  if (!ready) {
    return (
      <Card title="Разбор кампаний" hint="Что работает, что нет и что сделать. Считается сама, когда меняются цифры.">
        <LoadingBlock title="Готовлю данные для разбора" height={160} />
      </Card>
    );
  }
  if (facts.length === 0) return null;

  return (
    <Card
      title="Разбор кампаний"
      hint="Что работает, что нет и что сделать. Считается сама, когда меняются цифры."
      action={
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2.5 text-[14px] font-medium" style={{ ...hubSans, color: hub.textMuted }} title="Разбор запускается сам, когда меняются цифры. Тот же набор цифр повторно не считается.">
            <span className="relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors" style={{ backgroundColor: auto.enabled ? "#2E9E6B" : "rgba(1, 20, 8, 0.18)", opacity: auto.ready ? 1 : 0.5 }}>
              <input type="checkbox" className="absolute inset-0 h-full w-full cursor-pointer opacity-0" checked={auto.enabled} disabled={!auto.ready} onChange={(e) => auto.setEnabled(e.target.checked)} aria-label="Разбирать автоматически" />
              <span className="pointer-events-none h-[18px] w-[18px] rounded-full bg-white shadow transition-transform" style={{ transform: auto.enabled ? "translateX(19px)" : "translateX(3px)" }} />
            </span>
            Автоматически
          </label>
          {reviews && !asking ? (
            <HubButton size="sm" variant="secondary" onClick={() => void ask()}>
              Разобрать заново
            </HubButton>
          ) : null}
        </div>
      }
    >
      {asking ? <LoadingBlock title="Разбираю кампании" height={180} /> : null}

      {!reviews && !asking ? (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-[18px] p-5" style={{ backgroundColor: "rgba(1, 20, 8, 0.045)" }}>
          <p className="max-w-[60ch] text-[15.5px] leading-[1.5]" style={{ ...hubSans, color: hub.textMuted }}>
            {error ? (
              <>
                <strong style={{ color: hub.text }}>Разбор временно недоступен.</strong> Нейросеть сейчас не отвечает, повторим автоматически, когда обновятся цифры. Можно попробовать сразу.
              </>
            ) : (
              <>
                Кампаний к разбору: <strong style={{ color: hub.text }}>{facts.length}</strong>
              </>
            )}
          </p>
          <HubButton onClick={() => void ask()}>{error ? "Разобрать снова" : "Разобрать кампании"}</HubButton>
        </div>
      ) : null}



      {reviews && !asking ? (
        <ul className="space-y-4">
          {sortedReviews.slice(0, paged.limit).map((r) => {
            const fact = facts.find((f) => f.id === r.id);
            if (!fact) return null;
            const v = VERDICT[r.verdict];
            const noData = r.verdict === "no_data";
            const bullets = r.summary ? points(r.summary) : [];
            const options = noData ? [] : r.options.filter((o) => o.kind !== "join_promo" || (o.nmId != null && promoOk?.has(String(o.nmId))));
            return (
              <li key={r.id} className="rounded-[22px] border p-5 sm:p-6" style={{ borderColor: `color-mix(in srgb, ${v.color} 34%, white)`, background: `linear-gradient(160deg, color-mix(in srgb, ${v.color} 9%, white), ${hub.canvas} 70%)` }}>
                <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3">
                  <p className="min-w-0 text-[19px] font-semibold leading-[1.3] [overflow-wrap:anywhere]" style={{ ...hubSans, color: hub.text }}>
                    {fact.name}
                  </p>
                  <VerdictBadge verdict={r.verdict} />
                </div>

                {fact.products.length > 0 ? (
                  <div className="mt-4">
                    <ProductChips products={fact.products} photos={photos} />
                  </div>
                ) : null}

                {noData ? (
                  <p className="mt-4 text-[15.5px] leading-[1.5]" style={{ ...hubSans, color: hub.textMuted }}>
                    По кампании пока недостаточно данных для анализа.
                    <span className="mt-3 block text-[17px] font-semibold" style={{ color: hub.text }}>
                      Что можно сделать: <span className="font-medium" style={{ color: hub.textMuted }}>подождать данных</span>
                    </span>
                  </p>
                ) : (
                  <>
                    {r.headline ? (
                      <div className="mt-5">
                        <p className="text-[22px] font-semibold leading-[1.3] tracking-[-0.015em]" style={{ ...hubSans, color: hub.text }}>
                          {r.headline}
                        </p>
                        {bullets.length > 0 ? (
                          <ul className="mt-3 space-y-2">
                            {bullets.map((b) => (
                              <li key={b} className="flex gap-3 text-[16px] leading-[1.55]" style={{ ...hubSans, color: hub.textMuted }}>
                                <span className="mt-[11px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: v.color }} aria-hidden />
                                {b}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="mt-6 flex flex-wrap items-baseline gap-x-10 gap-y-3 border-t pt-5" style={{ ...hubSans, borderColor: "rgba(1, 20, 8, 0.1)" }}>
                      {[
                        ["Расход", `${fact.spend.toLocaleString("ru-RU")} ₽`],
                        ["Заказов", String(fact.orders)],
                        ["ДРР", pct(fact.drr)],
                      ].map(([label, value]) => (
                        <span key={label} className="inline-flex items-baseline gap-2">
                          <span className="text-[14.5px]" style={{ color: hub.textSubtle }}>
                            {label}
                          </span>
                          <span className="text-[24px] font-semibold" style={{ color: hub.text, fontFamily: "var(--font-geist-mono), ui-monospace, monospace", letterSpacing: "-0.04em" }}>
                            {value}
                          </span>
                        </span>
                      ))}
                    </div>
                  </>
                )}

                {options.length > 0 && options.every((o) => o.kind === "keep" || o.kind === "wait") ? (
                  <p className="mt-6 flex items-center gap-3 border-t pt-5 text-[17px] font-semibold" style={{ ...hubSans, color: hub.text, borderColor: "rgba(1, 20, 8, 0.1)" }}>
                    <CheckCircle2 className="h-6 w-6" style={{ color: "#2E9E6B" }} aria-hidden />
                    {options.some((o) => o.kind === "wait") ? "Сейчас лучше подождать и посмотреть цифры" : "Ничего менять не нужно"}
                  </p>
                ) : options.length > 0 ? (
                  <div className="mt-7 rounded-[22px] p-5 sm:p-6" style={{ backgroundColor: "rgba(1, 20, 8, 0.045)" }}>
                    <p className="flex items-center gap-3 text-[21px] font-semibold tracking-[-0.015em]" style={{ ...hubSans, color: hub.text }}>
                      <span className="flex h-9 w-9 items-center justify-center rounded-full" style={{ backgroundColor: "#B9FF4B" }} aria-hidden>
                        <ListChecks className="h-[19px] w-[19px]" style={{ color: hub.text }} />
                      </span>
                      Что можно сделать
                    </p>
                    <ul className="mt-3 divide-y" style={{ borderColor: "rgba(1, 20, 8, 0.1)" }}>
                      {options.map((o, i) => {
                        const key = `${r.id}:${o.kind}:${o.nmId ?? ""}:${i}`;
                        const action = actionForOption(o, fact);
                        return (
                          <li key={key} className="py-3.5 first:pt-2 last:pb-0" style={{ borderColor: "rgba(1, 20, 8, 0.08)" }}>
                            <div className="grid gap-x-5 gap-y-2.5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                              <div className="min-w-0">
                                <p className="text-[15.5px] font-semibold leading-[1.35]" style={{ ...hubSans, color: hub.text }}>
                                  {OPTION_LABEL[o.kind]}
                                  {o.nmId ? <span className="font-medium" style={{ color: hub.textMuted }}> · {fact.products.find((p) => p.nmId === o.nmId)?.title ?? o.nmId}</span> : null}
                                </p>
                                {o.reason && o.kind !== "keep" && o.kind !== "wait" ? (
                                  <p className="mt-0.5 text-[14px] leading-[1.5]" style={{ ...hubSans, color: hub.textMuted }}>
                                    {o.reason}
                                  </p>
                                ) : null}
                                {failed[key] ? (
                                  <p className="mt-1 text-[13.5px]" style={{ ...hubSans, color: hub.textMuted }}>
                                    Не получилось выполнить, попробуйте ещё раз.
                                  </p>
                                ) : null}
                              </div>
                              <div className="flex flex-wrap items-center gap-2 md:justify-end">
                                {done[key] ? (
                                  <span className="text-[14px] font-semibold" style={{ ...hubSans, color: "#067A55" }}>
                                    {done[key]}
                                  </span>
                                ) : action ? (
                                  confirmKey === key ? null : (
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
                                  <span className="text-[13.5px]" style={{ ...hubSans, color: hub.textMuted }}>
                                    Цену меняют в разделе «Товары», вкладка цен.
                                  </span>
                                ) : null}
                              </div>
                            </div>
                            {action && confirmKey === key ? (
                              <ConfirmPanel
                                busy={running === key}
                                onConfirm={() => void run(key, fact, o)}
                                onCancel={() => setConfirmKey(null)}
                                note={irreversibleWarning(action)}
                              >
                                {sentence(describeAgentAction(action, campaigns))}.
                              </ConfirmPanel>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
      {reviews && !asking && sortedReviews.length > paged.limit ? (
        <div className="mt-4 flex justify-center">
          <HubButton size="sm" variant="secondary" onClick={paged.more}>
            Показать ещё {Math.min(paged.step, sortedReviews.length - paged.limit)} из {sortedReviews.length - paged.limit}
          </HubButton>
        </div>
      ) : null}
    </Card>
  );
}
