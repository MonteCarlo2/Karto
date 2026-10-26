"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { VISION_PROTOCOL_VERSION } from "@/lib/seller-hub/card-vision-score";
import { useAutoAi } from "./use-auto-ai";
import { useRouter } from "next/navigation";
import { LayoutGrid } from "lucide-react";
import { buildCardVerdicts, VERDICT_LABEL, type CardVerdictId, type Pillar, type PillarStatus } from "@/lib/seller-hub/card-verdict";
import { diagnoseProducts } from "@/lib/seller-hub/product-diagnosis";
import { taskFactsFromSnapshot } from "@/lib/seller-hub/task-engine/facts";
import type { SellerAdCampaignRow, SellerCatalogSnapshot } from "@/lib/seller-hub/types";
import { buildProductFacts } from "@/lib/seller-hub/product-advice";
import { snapshotTimeMs } from "@/lib/seller-hub/complete-days";
import { HubAdsCardsPlan } from "./hub-ads-cards-plan";
import { spearman } from "@/lib/seller-hub/card-vision-score";
import { hub, HubEmptyState, HubPanel, HubPanelHeader, hubSans } from "./hub-ui";
import { useCardVision, VisionBadge, VisionControls, VisionDetails, type VisionTarget } from "./hub-ads-cards-vision";
import { isTextCurrent, TextBadge, TextControls, TextDetails, useCardText, type TextTarget } from "./hub-ads-cards-text";
import { writeHubCardSeed } from "@/lib/seller-hub/card-seed";

const VERDICT_TONE: Record<CardVerdictId, { bg: string; fg: string }> = {
  works: { bg: hub.greenSoft, fg: hub.green },
  great_hidden: { bg: hub.blueSoft, fg: hub.blue },
  hidden: { bg: hub.warnSoft, fg: hub.warn },
  leaky: { bg: hub.dangerSoft, fg: hub.danger },
  returns: { bg: hub.dangerSoft, fg: hub.danger },
  polish: { bg: hub.warnSoft, fg: hub.warn },
  no_data: { bg: hub.surfaceMuted, fg: hub.textMuted },
};

const STATUS_COLOR: Record<PillarStatus, string> = {
  good: hub.green,
  ok: hub.green,
  warn: hub.warn,
  bad: hub.danger,
  na: hub.textSubtle,
};

const FILTER_ORDER: CardVerdictId[] = ["leaky", "returns", "hidden", "great_hidden", "polish", "works", "no_data"];

function PillarCell({ label, pillar }: { label: string; pillar: Pillar }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: STATUS_COLOR[pillar.status] }} />
        <span className="text-[11.5px] font-semibold uppercase tracking-[0.05em]" style={{ ...hubSans, color: hub.textSubtle }}>
          {label}
        </span>
      </div>
      <p className="mt-0.5 text-[12.5px] leading-4" style={{ ...hubSans, color: pillar.status === "bad" ? hub.danger : hub.textMuted }}>
        {pillar.note}
      </p>
    </div>
  );
}

export function HubAdsCards({ snapshot, adsByNm, campaigns, onCampaignsUpdate, onGoTab }: { snapshot?: SellerCatalogSnapshot; adsByNm?: Map<string, { spend: number; orders: number; orderSum: number }>; campaigns?: SellerAdCampaignRow[]; onCampaignsUpdate?: (rows: SellerAdCampaignRow[]) => void; onGoTab?: (tab: "promotions") => void }) {
  const router = useRouter();
  const [filter, setFilter] = useState<CardVerdictId | "all">("all");
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

  const shown = filter === "all" ? verdicts : verdicts.filter((v) => v.verdict === filter);

  return (
    <div className="space-y-4">
      <p className="rounded-xl px-4 py-2.5 text-[13px] leading-5" style={{ ...hubSans, backgroundColor: hub.surfaceMuted, color: hub.textMuted }}>
        Фото и текст карточки — один из факторов продаж, но не единственный: на покупку влияют ещё цена, отзывы, срок доставки и позиции в поиске. Хорошая подача помогает, плохая мешает,
        поэтому её стоит улучшать, если вы хотите больше продаж.
      </p>
      <VisionControls targets={targets} vision={vision} />
      <TextControls targets={textTargets} text={text} />
      <HubAdsCardsPlan aiSettled={vision.loaded && text.loaded && !vision.running && !text.running} facts={planFacts} verdicts={verdicts} campaigns={campaigns ?? []} onCampaignsUpdate={(rows) => onCampaignsUpdate?.(rows)} onGoTab={(tab) => onGoTab?.(tab)} onOpenFlow={openFlow} />
      {agreement ? (
        <p className="rounded-xl px-4 py-2.5 text-[13px] leading-5" style={{ ...hubSans, backgroundColor: hub.blueSoft, color: hub.text }}>
          Согласованность оценки нейросети с вашими продажами: {agreement.rho.toLocaleString("ru-RU")} по {agreement.n} карточкам.{" "}
          {Math.abs(agreement.rho) < 2 / Math.sqrt(agreement.n - 1) ? "Статистически связи не видно: у ваших карточек конверсию определяет не качество фото (цена, фасовка, срок доставки), поэтому оценку фото смотрите как отдельный показатель." : agreement.rho > 0 ? "Оценка совпадает с тем, как карточки конвертируют в вашем магазине." : "Оценка расходится с продажами: доверяйте продажам, а причину ищите вне фото."}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {([["all", "Все", verdicts.length], ...FILTER_ORDER.filter((id) => counts.has(id)).map((id) => [id, VERDICT_LABEL[id], counts.get(id) ?? 0] as const)] as Array<readonly [CardVerdictId | "all", string, number]>).map(
          ([id, label, count]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className="rounded-full border px-3 py-1.5 text-[13px] font-semibold"
              style={{
                ...hubSans,
                borderColor: filter === id ? hub.ink : hub.border,
                backgroundColor: filter === id ? hub.ink : hub.surface,
                color: filter === id ? "#fff" : hub.text,
              }}
            >
              {label} · {count}
            </button>
          ),
        )}
      </div>

      <HubPanel>
        <HubPanelHeader
          title="Покупают ли ваши карточки"
          hint="Пять опор: трафик, конверсия, выкуп, контент, рейтинг. Всё сравнивается с остальными карточками вашего магазина, а не с придуманной нормой. Сверху те, где разобраться важнее."
        />
        <ul className="divide-y" style={{ borderColor: hub.borderSoft }}>
          {shown.slice(0, 60).map((v) => {
            const tone = VERDICT_TONE[v.verdict];
            return (
              <li key={v.nmId} className="space-y-3 px-5 py-4 sm:px-6">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-[14px] font-semibold" style={{ ...hubSans, color: hub.text }}>
                      {v.title}
                    </div>
                    <div className="text-[12px]" style={{ ...hubSans, color: hub.textMuted }}>
                      {v.nmId}
                    </div>
                  </div>
                  <span className="rounded-md px-2.5 py-1 text-[12px] font-semibold" style={{ ...hubSans, backgroundColor: tone.bg, color: tone.fg }}>
                    {v.headline}
                  </span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  <PillarCell label="Трафик" pillar={v.traffic} />
                  <PillarCell label="Конверсия" pillar={v.conversion} />
                  <PillarCell label="Выкуп" pillar={v.buyout} />
                  <PillarCell label="Контент" pillar={v.content} />
                  <PillarCell label="Рейтинг" pillar={v.rating} />
                </div>
                {vision.results[v.nmId] ? (
                  <div className="space-y-2">
                    <VisionBadge result={vision.results[v.nmId]!} />
                    <VisionDetails
                      result={vision.results[v.nmId]!}
                      onRecheck={(() => { const target = targets.find((t) => String(t.nmId) === v.nmId); return target ? (force: boolean) => vision.recheck(target, force) : undefined; })()}
                      sales={{ convertsBetter: v.conversion.status === "good", convertsWorse: v.conversion.status === "bad", orders: v.orders }}
                    />
                  </div>
                ) : null}
                {(() => {
                  const tr = text.results[v.nmId];
                  const tt = textTargets.find((t) => String(t.nmId) === v.nmId);
                  return tr && tt ? (
                    <div className="space-y-2">
                      <TextBadge result={tr} outdated={!isTextCurrent(tr, tt)} />
                      <TextDetails result={tr} />
                    </div>
                  ) : null;
                })()}
                {(() => {
                  const vr = vision.results[v.nmId];
                  const tr = text.results[v.nmId];
                  const photoWeak = vr != null && (vr.band === "weak" || vr.band === "average") && v.conversion.status !== "good";
                  const textWeak = tr != null && (tr.band === "weak" || tr.band === "average");
                  if (!photoWeak && !textWeak) return null;
                  return (
                    <div className="rounded-lg border px-3 py-2.5" style={{ borderColor: hub.border }}>
                      <p className="text-[13px] leading-5" style={{ ...hubSans, color: hub.text }}>
                        <strong>Подачу карточки стоит улучшить.</strong>{" "}
                        <span style={{ color: hub.textMuted }}>
                          {photoWeak && textWeak ? "И фото, и текст ниже уровня, который помогает продавать." : photoWeak ? "Фото ниже уровня, который помогает продавать." : "Текст ниже уровня, который помогает находиться в поиске и убеждать."} Это один из факторов продаж, а не гарантия роста.
                        </span>
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {photoWeak ? (
                          <button type="button" onClick={() => openFlow(v.nmId, "/studio/visual")} className="inline-flex min-h-[34px] items-center rounded-[4px] border bg-white px-3 text-[13px] font-semibold" style={{ borderColor: hub.ink, color: hub.ink }}>
                            Создать новую карточку в Потоке
                          </button>
                        ) : null}
                        {textWeak ? (
                          <button type="button" onClick={() => openFlow(v.nmId, "/studio/descriptions", { missingKeywords: tr?.missingKeywords.map((k) => k.word), notes: tr?.defects.map((x) => x.what) })} className="inline-flex min-h-[34px] items-center rounded-[4px] border bg-white px-3 text-[13px] font-semibold" style={{ borderColor: hub.ink, color: hub.ink }}>
                            Собрать SEO-описание
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })()}
                {v.verdict !== "works" && v.verdict !== "no_data" ? (
                  <p className="rounded-lg px-3 py-2 text-[13px] leading-5" style={{ ...hubSans, backgroundColor: hub.surfaceMuted, color: hub.text }}>
                    <strong>Что сделать:</strong> {v.action}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      </HubPanel>
    </div>
  );
}
