"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import NumberFlow from "@number-flow/react";
import type { AutoRepliesMarketplaceId, AutoRepliesUsageId } from "@/lib/auto-replies/types";
import type { AutoRepliesMarketplaceSettings, AutoRepliesShopSettings } from "@/lib/auto-replies/settings-types";
import type { AnalyticsDataSource, AnalyticsPeriod } from "@/lib/auto-replies/inbox-analytics";
import {
  ANALYTICS_PERIOD_LABELS,
  computeInboxAnalytics,
  replyHistoryToAnalyticsItems,
} from "@/lib/auto-replies/inbox-analytics";
import {
  demoInboxItemsForMarketplace,
  shouldShowInboxDemo,
  type InboxReviewItem,
} from "@/lib/auto-replies/inbox-demo-data";
import { loadInboxClientCache } from "@/lib/auto-replies/inbox-client-cache";
import { listReplyHistory } from "@/lib/auto-replies/reply-history-store";
import {
  isMarketplaceLiveReady,
  syncMarketplaceInbox,
} from "@/lib/auto-replies/marketplace-live";
import { filterInboxItemsForMarketplace } from "@/lib/auto-replies/inbox-item-merge";
import { wsSans } from "./settings-ui";
import {
  A,
  BentoCell,
  BentoGrid,
  CellLabel,
  FullDonut,
  ProductLines,
  ReplyPills,
  StatRow,
  SummaryHero,
  TextRatio,
  TrendChart,
  AnalyticsSourceToggle,
} from "./analytics-bento";

const PERIODS: AnalyticsPeriod[] = ["day", "month", "quarter", "all"];

const MP_LOGO: Record<AutoRepliesMarketplaceId, string> = {
  wildberries: "/logos/marketplace-wildberries-app.png",
  ozon: "/logos/marketplace-ozon-app.png",
  yandex: "/logos/marketplace-yandex-market-app.png",
};

export function WorkspaceAnalytics({
  marketplaceId,
  marketplaceLabel,
  connectionOk,
  shopId,
  usage,
  mpSettings,
  shopSettings,
  brandName,
  active,
}: {
  marketplaceId: AutoRepliesMarketplaceId;
  marketplaceLabel: string;
  connectionOk: boolean;
  shopId: string;
  usage: AutoRepliesUsageId;
  mpSettings: AutoRepliesMarketplaceSettings;
  shopSettings: AutoRepliesShopSettings;
  brandName?: string | null;
  active?: boolean;
}) {
  const [period, setPeriod] = useState<AnalyticsPeriod>("month");
  const [dataSource, setDataSource] = useState<AnalyticsDataSource>("cabinet");
  const [items, setItems] = useState<InboxReviewItem[]>([]);
  const [isDemo, setIsDemo] = useState(false);
  const [historyTick, setHistoryTick] = useState(0);

  const liveReady = isMarketplaceLiveReady(marketplaceId, usage, mpSettings.connection);
  const showDemo = shouldShowInboxDemo(usage) || !liveReady;
  const textMode = dataSource === "text";

  const manualHistory = useMemo(() => {
    void historyTick;
    return listReplyHistory(shopId, marketplaceId);
  }, [shopId, marketplaceId, historyTick]);

  const manualItems = useMemo(
    () => replyHistoryToAnalyticsItems(manualHistory, marketplaceId),
    [manualHistory, marketplaceId]
  );

  const loadFromCache = useCallback(() => {
    const cached = loadInboxClientCache(shopId, marketplaceId, mpSettings.connection.apiKey);
    if (cached?.items.length) {
      setItems(filterInboxItemsForMarketplace(cached.items, marketplaceId));
      return true;
    }
    return false;
  }, [shopId, marketplaceId, mpSettings.connection.apiKey]);

  const refreshLive = useCallback(async () => {
    if (showDemo || !connectionOk) return;
    try {
      const result = await syncMarketplaceInbox({
        marketplaceId,
        connection: mpSettings.connection,
        tab: "semi",
        usage,
        shopSettings,
        mpSettings,
        brandName,
        sellerName: mpSettings.connection.sellerName ?? null,
      });
      setItems(filterInboxItemsForMarketplace(result.items, marketplaceId));
      setIsDemo(false);
    } catch {
      loadFromCache();
    }
  }, [marketplaceId, showDemo, connectionOk, mpSettings, shopSettings, usage, brandName, loadFromCache]);

  useEffect(() => {
    if (showDemo) {
      setItems(demoInboxItemsForMarketplace(marketplaceId));
      setIsDemo(true);
      return;
    }
    if (!loadFromCache()) setItems([]);
    setIsDemo(false);
  }, [marketplaceId, showDemo, loadFromCache]);

  useEffect(() => {
    if (!active || showDemo || !connectionOk) return;
    void refreshLive();
    const id = window.setInterval(() => void refreshLive(), 60_000);
    return () => window.clearInterval(id);
  }, [active, marketplaceId, showDemo, connectionOk, refreshLive]);

  useEffect(() => {
    if (!active) return;
    const bump = () => setHistoryTick((t) => t + 1);
    bump();
    window.addEventListener("focus", bump);
    return () => window.removeEventListener("focus", bump);
  }, [active, shopId, marketplaceId]);

  const analyticsItems = textMode ? manualItems : items;
  const analyticsDemo = textMode ? false : isDemo;

  const s = useMemo(
    () =>
      computeInboxAnalytics({
        items: analyticsItems,
        marketplaceId,
        period,
        isDemo: analyticsDemo,
      }),
    [analyticsItems, marketplaceId, period, analyticsDemo]
  );

  const toneSegments = [
    {
      label: "5★",
      value: s.stars["5"],
      fill: A.lime,
      pct: s.starsPct["5"],
      hint: "Отличные отзывы — максимальная оценка",
    },
    {
      label: "4★",
      value: s.stars["4"],
      fill: A.black,
      pct: s.starsPct["4"],
      hint: "Хорошие отзывы — не «идеал», но позитив",
    },
    {
      label: "3★",
      value: s.stars["3"],
      fill: "rgba(7, 9, 7, 0.35)",
      pct: s.starsPct["3"],
      hint: "Нейтральные — средняя оценка",
    },
    {
      label: "1–2★",
      value: s.stars["1"] + s.stars["2"],
      fill: "rgba(7, 9, 7, 0.18)",
      pct: s.starsPct["1"] + s.starsPct["2"],
      hint: "Негативные — требуют внимания",
    },
  ];

  return (
    <div className="pb-4">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <img src={MP_LOGO[marketplaceId]} alt="" className="h-12 w-12 shrink-0 object-contain sm:h-14 sm:w-14" />
          <h2
            className="text-[1.55rem] font-bold tracking-[-0.03em] sm:text-[1.75rem]"
            style={{ ...wsSans, color: A.black }}
          >
            Анализ отзывов
          </h2>
          {isDemo && !textMode ? (
            <span
              className="rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest"
              style={{ backgroundColor: A.lime, color: A.black }}
            >
              demo
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <AnalyticsSourceToggle
            value={dataSource}
            onChange={setDataSource}
            manualCount={manualHistory.length}
          />
          <div
            className="inline-flex rounded-xl border p-1"
            style={{ borderColor: A.border, backgroundColor: A.white }}
          >
            {PERIODS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className="relative rounded-lg px-3.5 py-2 text-[11px] font-bold uppercase tracking-[0.06em]"
                style={{ ...wsSans, color: period === p ? A.black : A.muted }}
              >
                {period === p ? (
                  <motion.span
                    layoutId="analytics-period"
                    className="absolute inset-0 rounded-lg"
                    style={{ backgroundColor: A.lime }}
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  />
                ) : null}
                <span className="relative z-10">{ANALYTICS_PERIOD_LABELS[p]}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {textMode ? (
        <p className="mb-4 text-[13px] leading-[1.55]" style={{ ...wsSans, color: A.muted }}>
          Анализ по ручным генерациям: звёзды, текст отзыва и динамика. Без данных кабинета маркетплейса.
        </p>
      ) : null}

      {!connectionOk && !showDemo && !textMode ? (
        <div
          className="mb-4 rounded-xl border px-4 py-3 text-[14px]"
          style={{ borderColor: A.border, backgroundColor: A.white, color: A.black, ...wsSans }}
        >
          Подключите кабинет — статистика обновится сама.
        </div>
      ) : null}

      {!s.hasData ? (
        <EmptyState
          marketplaceLabel={marketplaceLabel}
          connectionOk={connectionOk || showDemo}
          textMode={textMode}
        />
      ) : (
        <BentoGrid>
          <BentoCell span={5} tone="beige" delay={0} className="!p-3 sm:!p-4">
            <SummaryHero
              rating={s.averageRating}
              total={s.totalReviews}
              delta={s.ratingDelta}
              dominantStar={s.dominantStar}
              stars={s.stars}
              starsPct={s.starsPct}
            />
          </BentoCell>

          <BentoCell span={7} tone="white" delay={0.05} className="flex flex-col justify-center">
            <StatRow
              horizontal
              items={[
                ...(textMode
                  ? []
                  : [
                      {
                        label: "Ответили",
                        value: `${s.responseRate}%`,
                        hint: `${s.repliesSent} из ${s.totalReviews}`,
                      },
                    ]),
                {
                  label: "5★",
                  value: (
                    <>
                      <NumberFlow value={s.stars["5"]} />
                      <span className="ml-1 text-[14px] font-semibold" style={{ color: A.muted }}>
                        ({s.starsPct["5"]}%)
                      </span>
                    </>
                  ),
                  hint: "Идеальные оценки",
                  accent: true,
                },
                {
                  label: "4★",
                  value: (
                    <>
                      <NumberFlow value={s.stars["4"]} />
                      <span className="ml-1 text-[14px] font-semibold" style={{ color: A.muted }}>
                        ({s.starsPct["4"]}%)
                      </span>
                    </>
                  ),
                  hint: "Хорошие, но не 5★",
                },
              ]}
            />
          </BentoCell>

          <BentoCell span={4} tone="white" delay={0.08}>
            <CellLabel>Динамика отзывов</CellLabel>
            {s.timeline.length > 1 ? (
              <TrendChart points={s.timeline} />
            ) : (
              <p className="py-10 text-center text-[14px] leading-[1.55]" style={{ color: A.muted }}>
                {s.totalReviews > 0
                  ? "Пока все отзывы за один день — график появится, когда накопятся данные за несколько дней."
                  : "Мало точек — выберите более длинный период"}
              </p>
            )}
          </BentoCell>

          <BentoCell span={4} tone="lime" delay={0.1}>
            <CellLabel>Текст отзыва</CellLabel>
            <TextRatio withText={s.withText} withoutText={s.withoutText} />
          </BentoCell>

          {!textMode ? (
            <BentoCell span={4} tone="white" delay={0.12}>
              <CellLabel>Ожидают ответа</CellLabel>
              <p className="text-[3rem] font-bold tabular-nums leading-none sm:text-[3.25rem]" style={{ ...wsSans, color: A.black }}>
                <NumberFlow value={s.repliesPending} />
              </p>
              <p className="mt-2 text-[13px]" style={{ color: A.muted }}>
                отзыв{s.repliesPending === 1 ? "" : "ов"} без ответа на площадке
              </p>
            </BentoCell>
          ) : null}

          <BentoCell span={textMode ? 12 : 6} tone="beige" delay={0.14}>
            <CellLabel>Распределение по звёздам</CellLabel>
            <FullDonut segments={toneSegments} />
          </BentoCell>

          {!textMode ? (
            <BentoCell span={6} tone="white" delay={0.16}>
              <CellLabel>Типы ответов</CellLabel>
              <ReplyPills
                auto={s.autoReplies}
                manual={s.manualReplies}
                pending={s.repliesPending}
                sent={s.repliesSent}
              />
            </BentoCell>
          ) : null}

          {!textMode && s.topProducts.length > 0 ? (
            <BentoCell span={12} tone="beige" delay={0.18}>
              <CellLabel>Топ товаров по отзывам</CellLabel>
              <ProductLines items={s.topProducts} />
            </BentoCell>
          ) : null}
        </BentoGrid>
      )}
    </div>
  );
}

function EmptyState({
  marketplaceLabel,
  connectionOk,
  textMode,
}: {
  marketplaceLabel: string;
  connectionOk: boolean;
  textMode?: boolean;
}) {
  return (
    <div
      className="rounded-2xl border px-6 py-16 text-center"
      style={{ borderColor: A.border, backgroundColor: A.beige }}
    >
      <p className="text-[16px] font-bold" style={{ ...wsSans, color: A.black }}>
        Нет данных за период
      </p>
      <p className="mx-auto mt-2 max-w-sm text-[14px]" style={{ color: A.muted }}>
        {textMode
          ? "Сгенерируйте ответы в ручном режиме — они попадут в анализ по тексту."
          : connectionOk
            ? `Откройте «Ответы» — ${marketplaceLabel} подтянется автоматически.`
            : `Подключите ${marketplaceLabel}.`}
      </p>
    </div>
  );
}
