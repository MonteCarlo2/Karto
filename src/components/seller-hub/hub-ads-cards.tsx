"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { VISION_PROTOCOL_VERSION } from "@/lib/seller-hub/card-vision-score";
import { useAutoAi } from "./use-auto-ai";
import { useRouter } from "next/navigation";
import { LayoutGrid, Lightbulb } from "lucide-react";
import { buildCardVerdicts, VERDICT_LABEL, type CardVerdictId, type Pillar, type PillarStatus } from "@/lib/seller-hub/card-verdict";
import { diagnoseProducts } from "@/lib/seller-hub/product-diagnosis";
import { taskFactsFromSnapshot } from "@/lib/seller-hub/task-engine/facts";
import type { SellerAdCampaignRow, SellerCatalogSnapshot } from "@/lib/seller-hub/types";
import { buildProductFacts } from "@/lib/seller-hub/product-advice";
import { snapshotTimeMs } from "@/lib/seller-hub/complete-days";
import { useCardsPlan } from "./hub-ads-cards-plan";
import { spearman } from "@/lib/seller-hub/card-vision-score";
import { hub, HubButton, HubEmptyState, hubSans } from "./hub-ui";
import { Card } from "./hub-analytics-ui";
import { FilterTabs, HubPanel, Thumb } from "./hub-fulfillment-ui";
import { HelpTip } from "./hub-help-tip";
import { usePagedLimit } from "./use-paged-limit";
import { useCardVision, VisionControls, VisionDetails, type VisionTarget } from "./hub-ads-cards-vision";
import { isTextCurrent, TextControls, TextDetails, useCardText, type TextTarget } from "./hub-ads-cards-text";
import { writeHubCardSeed } from "@/lib/seller-hub/card-seed";

const VERDICT_COLOR: Record<CardVerdictId, string> = {
  works: "#2E9E6B",
  great_hidden: "#2E9E6B",
  hidden: "#D9912B",
  leaky: "#C8453F",
  returns: "#C8453F",
  polish: "#D9912B",
  no_data: "#9AA0A6",
};

const STATUS_COLOR: Record<PillarStatus, string> = {
  good: "#2E9E6B",
  ok: "#2E9E6B",
  warn: "#D9912B",
  bad: "#C8453F",
  na: "#9AA0A6",
};

const FILTER_ORDER: CardVerdictId[] = ["leaky", "returns", "hidden", "great_hidden", "polish", "works", "no_data"];

function PillarCell({ label, pillar }: { label: string; pillar: Pillar }) {
  const color = STATUS_COLOR[pillar.status];
  return (
    <div className="min-w-0 px-5 py-4" style={{ backgroundColor: "color-mix(in srgb, var(--hub-canvas) 82%, white)" }}>
      <p className="flex items-center gap-2 text-[14px] font-medium" style={{ ...hubSans, color: hub.textSubtle }}>
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden />
        {label}
      </p>
      <p className="mt-2 text-[16.5px] font-medium leading-[1.4] tracking-[-0.005em]" style={{ ...hubSans, color: hub.text }}>
        {pillar.note}
      </p>
    </div>
  );
}

export function HubAdsCards({ snapshot, adsByNm, campaigns, onCampaignsUpdate, onGoTab }: { snapshot?: SellerCatalogSnapshot; adsByNm?: Map<string, { spend: number; orders: number; orderSum: number }>; campaigns?: SellerAdCampaignRow[]; onCampaignsUpdate?: (rows: SellerAdCampaignRow[]) => void; onGoTab?: (tab: "promotions") => void }) {
  const router = useRouter();
  const [filter, setFilter] = useState<CardVerdictId | "all">("all");
  const paged = usePagedLimit(filter, 10, 10);
  const verdicts = useMemo(() => {
    if (!snapshot || snapshot.items.length === 0) return [];
    const facts = taskFactsFromSnapshot(snapshot).products;
    const diagnoses = diagnoseProducts({
      funnel: snapshot.funnel,
      products: facts.map((f) => ({ nmId: f.nmId, marginPercent: f.marginPercent, stock: f.stockFbo != null || f.stockFbs != null ? (f.stockFbo ?? 0) + (f.stockFbs ?? 0) : null })),
      ratings: new Map(
        facts.flatMap((f) => (f.reviewRatingAvg != null && (f.reviewCount180 ?? 0) > 0 ? [[f.nmId, { rating: f.reviewRatingAvg, reviews: f.reviewCount180 ?? 0 }] as const] : [])),
      ),
    });
    return buildCardVerdicts({ facts, diagnoses });
  }, [snapshot]);

  const targets = useMemo<VisionTarget[]>(() => {
    const known = new Set(verdicts.map((v) => v.nmId));
    return (snapshot?.items ?? []).flatMap((item) => {
      const nmId = Number(item.externalId);
      const imageUrls = (item.imageUrls?.length ? item.imageUrls : item.imageUrl ? [item.imageUrl] : []).slice(0, 2);
      return Number.isInteger(nmId) && known.has(item.externalId) && imageUrls.length > 0
        ? [{ nmId, title: item.title, category: item.category, brand: item.brand, imageUrls }]
        : [];
    });
  }, [snapshot?.items, verdicts]);
  const vision = useCardVision(targets);

  const textTargets = useMemo<TextTarget[]>(() => {
    const known = new Set(verdicts.map((v) => v.nmId));
    return (snapshot?.items ?? []).flatMap((item) => {
      const nmId = Number(item.externalId);
      return Number.isInteger(nmId) && known.has(item.externalId) && item.title.trim()
        ? [{ nmId, title: item.title, description: item.description ?? null, category: item.category, brand: item.brand, characteristicNames: item.characteristicNames ?? null }]
        : [];
    });
  }, [snapshot?.items, verdicts]);
  const text = useCardText(textTargets);

  /**
   * Автоматическая оценка новых и изменённых карточек: нейросеть оценивает только то, чего ещё нет или что изменилось.
   * Каждую карточку пробуем один раз за сессию (ошибка не зацикливается), за сессию не больше AUTO_CAP карточек на вид оценки.
   */
  const auto = useAutoAi();
  const autoTried = useRef<{ vision: Set<number>; text: Set<number> }>({ vision: new Set(), text: new Set() });
  const AUTO_CAP = 40;
  const visionStart = vision.start;
  const textStart = text.start;
  useEffect(() => {
    if (!auto.enabled || !auto.ready || !vision.loaded || vision.running) return;
    const pending = targets.filter((t) => vision.results[String(t.nmId)]?.protocol !== VISION_PROTOCOL_VERSION && !autoTried.current.vision.has(t.nmId));
    if (pending.length === 0 || autoTried.current.vision.size >= AUTO_CAP) return;
    const timer = setTimeout(() => {
      const batch = pending.slice(0, 12);
      for (const t of batch) autoTried.current.vision.add(t.nmId);
      void visionStart(batch);
    }, 5000);
    return () => clearTimeout(timer);
  }, [auto.enabled, auto.ready, vision.loaded, vision.running, vision.results, targets, visionStart]);
  useEffect(() => {
    if (!auto.enabled || !auto.ready || !text.loaded || text.running) return;
    const pending = textTargets.filter((t) => !isTextCurrent(text.results[String(t.nmId)], t) && !autoTried.current.text.has(t.nmId));
    if (pending.length === 0 || autoTried.current.text.size >= AUTO_CAP) return;
    const timer = setTimeout(() => {
      const batch = pending.slice(0, 12);
      for (const t of batch) autoTried.current.text.add(t.nmId);
      void textStart(batch);
    }, 5000);
    return () => clearTimeout(timer);
  }, [auto.enabled, auto.ready, text.loaded, text.running, text.results, textTargets, textStart]);
  const itemByNm = useMemo(() => new Map((snapshot?.items ?? []).map((i) => [i.externalId, i])), [snapshot?.items]);
  const photoByNm = useMemo(() => new Map((snapshot?.items ?? []).map((i) => [i.externalId, i.imageUrl ?? i.imageUrls?.[0]] as const)), [snapshot?.items]);

  const planFacts = useMemo(() => {
    if (!snapshot || verdicts.length === 0) return [];
    const taskFacts = taskFactsFromSnapshot(snapshot).products;
    const advertised = new Set((campaigns ?? snapshot.ads?.campaigns ?? []).filter((c) => c.status === 9 || c.status === 4 || c.status === 11).flatMap((c) => (c.bids ?? []).map((b) => b.nmId)));
    return buildProductFacts({
      verdicts,
      facts: taskFacts,
      items: snapshot.items,
      vision: vision.results,
      text: text.results,
      promotions: snapshot.promotions ?? [],
      nowMs: snapshotTimeMs(snapshot),
      adsByNm: adsByNm ?? new Map(),
      advertised,
    });
  }, [snapshot, verdicts, vision.results, text.results, adsByNm, campaigns]);

  function openFlow(nmId: string, href: string, extra?: { missingKeywords?: string[]; notes?: string[] }) {
    const item = itemByNm.get(nmId);
    if (!item) return;
    writeHubCardSeed({ title: item.title, vendorCode: item.vendorCode, externalId: item.externalId, description: item.description ?? "", ...extra });
    router.push(href);
  }

  /** Совпадает ли оценка нейросети с реальной конверсией в корзину вашего магазина (ранговая корреляция). */
  const agreement = useMemo(() => {
    const funnel = snapshot?.funnel?.byNm ?? {};
    const pairs: Array<[number, number]> = [];
    for (const [nm, result] of Object.entries(vision.results)) {
      const row = funnel[nm]?.selected;
      if (row?.openCount != null && row.cartCount != null && row.openCount >= 100) pairs.push([result.score, row.cartCount / row.openCount]);
    }
    const rho = spearman(pairs);
    return rho == null ? null : { rho, n: pairs.length };
  }, [vision.results, snapshot?.funnel]);

  const counts = useMemo(() => {
    const map = new Map<CardVerdictId, number>();
    for (const v of verdicts) map.set(v.verdict, (map.get(v.verdict) ?? 0) + 1);
    return map;
  }, [verdicts]);

  const plan = useCardsPlan({
    aiSettled: vision.loaded && text.loaded && !vision.running && !text.running,
    facts: planFacts,
    verdicts,
    campaigns: campaigns ?? [],
    onCampaignsUpdate: (rows) => onCampaignsUpdate?.(rows),
    onGoTab: (tab) => onGoTab?.(tab),
    onOpenFlow: openFlow,
  });

  if (verdicts.length === 0) {
    return (
      <HubPanel>
        <HubEmptyState
          icon={<LayoutGrid className="h-7 w-7" />}
          title="Пока нечего оценивать"
          description={
            snapshot?.funnel?.status === "jam_required"
              ? "Для сбора этих данных нужна подписка Джем: воронка (переходы, корзина, заказы). Без неё оценить, покупают карточку или нет, нельзя."
              : "Нужна воронка WB по карточкам. Нажмите «Обновить данные» в шапке: она загружается вместе с остальным."
          }
        />
      </HubPanel>
    );
  }

  const filtered = filter === "all" ? verdicts : verdicts.filter((v) => v.verdict === filter);
  const shown = filtered.slice(0, paged.limit);
  const hiddenCount = filtered.length - shown.length;
  const visionDone = targets.filter((t) => vision.results[String(t.nmId)]?.protocol === VISION_PROTOCOL_VERSION).length;
  const textDone = textTargets.filter((t) => isTextCurrent(text.results[String(t.nmId)], t)).length;

  return (
    <div className="space-y-6">
      <Card
        title="Покупают ли ваши карточки"
        hint="Трафик, конверсия, выкуп, контент и рейтинг каждой карточки в сравнении с остальным магазином. Сверху те, где разобраться важнее. Для проблемных нейросеть сама предлагает, что сделать."
        action={
          <HelpTip title="Как читать" align="right">
            <p>Фото и текст — один из факторов продаж. Ещё влияют цена, отзывы, срок доставки и позиции в поиске.</p>
            {agreement ? (
              <p className="mt-2">
                Согласованность оценки с вашими продажами: {agreement.rho.toLocaleString("ru-RU")} по {agreement.n} карточкам.{" "}
                {Math.abs(agreement.rho) < 2 / Math.sqrt(agreement.n - 1) ? "Связи со статистической точки зрения не видно: конверсию определяет не только фото." : agreement.rho > 0 ? "Оценка совпадает с конверсией ваших карточек." : "Оценка расходится с продажами: доверяйте продажам."}
              </p>
            ) : null}
          </HelpTip>
        }
      >
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-[18px] px-5 py-4" style={{ backgroundColor: "rgba(1, 20, 8, 0.045)" }}>
          <p className="text-[16px] leading-[1.5]" style={{ ...hubSans, color: hub.textMuted }}>
            Нейросеть оценила фото <strong style={{ color: hub.text }}>{visionDone} из {targets.length}</strong>, текст <strong style={{ color: hub.text }}>{textDone} из {textTargets.length}</strong>
            {plan.asking ? ". Составляю план действий…" : plan.problemCount > 0 ? `. Проблемных карточек: ${plan.problemCount}.` : "."}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-[15px]" style={{ ...hubSans, color: hub.textMuted }} title="Оценка и план строятся сами, когда меняются цифры.">
              <input type="checkbox" className="h-4 w-4" checked={plan.auto.enabled} disabled={!plan.auto.ready} onChange={(e) => plan.auto.setEnabled(e.target.checked)} />
              Автоматически
            </label>
            {plan.problemCount > 0 ? (
              <HubButton size="sm" variant="secondary" loading={plan.asking} onClick={() => void plan.ask()}>
                {plan.advice ? "Составить план заново" : "Составить план"}
              </HubButton>
            ) : null}
          </div>
          {plan.error ? (
            <p className="w-full text-[14.5px]" style={{ ...hubSans, color: hub.textMuted }}>
              План пока не получился, попробуйте ещё раз чуть позже.
            </p>
          ) : null}
        </div>
        <details className="group mt-3">
          <summary className="cursor-pointer list-none text-[14.5px] font-semibold outline-none [&::-webkit-details-marker]:hidden" style={{ ...hubSans, color: hub.textMuted }}>
            Управление оценкой <span className="font-normal group-open:hidden">· показать</span>
          </summary>
          <div className="mt-1 divide-y" style={{ borderColor: "rgba(1, 20, 8, 0.1)" }}>
            <VisionControls targets={targets} vision={vision} />
            <TextControls targets={textTargets} text={text} />
          </div>
        </details>

        <div className="mt-6">
          <FilterTabs<CardVerdictId | "all">
            label="Фильтр карточек"
            value={filter}
            onChange={setFilter}
            options={[{ id: "all", label: "Все", count: verdicts.length }, ...FILTER_ORDER.filter((id) => counts.has(id)).map((id) => ({ id, label: VERDICT_LABEL[id], count: counts.get(id) ?? 0 }))]}
          />
        </div>

        <ul className="mt-5 space-y-5">
          {shown.map((v, idx) => {
            const color = VERDICT_COLOR[v.verdict];
            const vr = vision.results[v.nmId];
            const tr = text.results[v.nmId];
            const tt = textTargets.find((t) => String(t.nmId) === v.nmId);
            const advice = plan.adviceFor(v.nmId);
            const options = plan.renderOptions(v.nmId);
            const headline = advice?.headline || (v.headline.trim() !== VERDICT_LABEL[v.verdict].trim() ? v.headline : "");
            return (
              <li key={v.nmId} className="hub-rise rounded-[24px] border p-5 sm:p-6" style={{ animationDelay: `${Math.min(idx, 8) * 45}ms`, borderColor: `color-mix(in srgb, ${color} 30%, white)`, background: `linear-gradient(160deg, color-mix(in srgb, ${color} 8%, white), ${hub.canvas} 65%)` }}>
                <div className="flex flex-wrap items-start justify-between gap-x-5 gap-y-3">
                  <div className="flex min-w-0 items-center gap-4">
                    <Thumb src={photoByNm.get(v.nmId)} className="h-[96px] w-[72px]" />
                    <div className="min-w-0">
                      <p className="line-clamp-2 text-[20px] font-semibold leading-[1.3]" style={{ ...hubSans, color: hub.text }}>
                        {v.title}
                      </p>
                      <p className="mt-1 text-[14px]" style={{ ...hubSans, color: hub.textSubtle }}>
                        № {v.nmId}
                      </p>
                    </div>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-2 rounded-[12px] border px-3.5 py-2 text-[14.5px] font-semibold" style={{ ...hubSans, color, backgroundColor: `color-mix(in srgb, ${color} 13%, white)`, borderColor: `color-mix(in srgb, ${color} 32%, white)` }}>
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} aria-hidden />
                    {VERDICT_LABEL[v.verdict]}
                  </span>
                </div>

                {headline ? (
                  <p className="mt-5 text-[20px] font-semibold leading-[1.35] tracking-[-0.01em]" style={{ ...hubSans, color: hub.text }}>
                    {headline}
                  </p>
                ) : null}
                {advice?.summary ? (
                  <p className="mt-2 max-w-[80ch] text-[16px] leading-[1.55]" style={{ ...hubSans, color: hub.textMuted }}>
                    {advice.summary}
                  </p>
                ) : null}

                <div className="mt-6 grid gap-px overflow-hidden rounded-[20px] sm:grid-cols-2 lg:grid-cols-5" style={{ backgroundColor: "rgba(1, 20, 8, 0.1)", boxShadow: "0 0 0 1px rgba(1, 20, 8, 0.1)" }}>
                  <PillarCell label="Трафик" pillar={v.traffic} />
                  <PillarCell label="Конверсия" pillar={v.conversion} />
                  <PillarCell label="Выкуп" pillar={v.buyout} />
                  <PillarCell label="Контент" pillar={v.content} />
                  <PillarCell label="Рейтинг" pillar={v.rating} />
                </div>

                {vr || (tr && tt) ? (
                  <div className="mt-5 grid gap-3 lg:grid-cols-2">
                    {vr ? (
                      <VisionDetails
                        result={vr}
                        onRecheck={(() => { const target = targets.find((t) => String(t.nmId) === v.nmId); return target ? (force: boolean) => vision.recheck(target, force) : undefined; })()}
                        sales={{ convertsBetter: v.conversion.status === "good", convertsWorse: v.conversion.status === "bad", orders: v.orders }}
                      />
                    ) : null}
                    {tr && tt ? <TextDetails result={tr} outdated={!isTextCurrent(tr, tt)} /> : null}
                  </div>
                ) : null}

                {options ?? (
                  v.verdict !== "works" && v.verdict !== "no_data" ? (
                    <div className="mt-6 flex items-start gap-3 border-t pt-5" style={{ borderColor: "rgba(1, 20, 8, 0.1)" }}>
                      <span className="mt-[1px] flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: "rgba(185, 255, 75, 0.55)" }} aria-hidden>
                        <Lightbulb className="h-[18px] w-[18px]" style={{ color: hub.text }} />
                      </span>
                      <p className="text-[16.5px] leading-[1.5]" style={{ ...hubSans, color: hub.text }}>
                        {v.action}
                      </p>
                    </div>
                  ) : null
                )}
              </li>
            );
          })}
        </ul>
        {hiddenCount > 0 ? (
          <div className="mt-4 flex justify-center">
            <HubButton size="sm" variant="secondary" onClick={paged.more}>
              Показать ещё {Math.min(paged.step, hiddenCount)} из {hiddenCount}
            </HubButton>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
