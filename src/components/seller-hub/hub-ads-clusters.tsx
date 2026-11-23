"use client";

import { useEffect, useMemo, useState } from "react";
import { summarizeAds } from "@/lib/seller-hub/ads-metrics";
import { analyzeClusters, type ClusterRow } from "@/lib/seller-hub/ads-clusters";
import { addSellerHubAdMinusPhrases, checkSellerHubQueryRelevance, loadSellerHubAdClusters, loadSellerHubClusterBids, resetSellerHubClusterBid, setSellerHubClusterBid } from "@/lib/seller-hub/client-api";
import { clusterBidKey } from "@/lib/seller-hub/ads-cluster-bid";
import { keepKey, parseKeepQueries, serializeKeepQueries } from "@/lib/seller-hub/ads-keep-queries";
import type { QueryRelevance } from "@/lib/seller-hub/ads-query-relevance";
import type { SellerAdClusters, SellerAdsStats } from "@/lib/seller-hub/types";
import { HelpTip } from "./hub-help-tip";
import { formatInt, hub, HubButton, hubSans } from "./hub-ui";
import { useUserSetting } from "./use-user-setting";

const MONO = { fontFamily: "var(--font-geist-mono), ui-monospace, monospace", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.04em" } as const;
const GRID = "md:grid-cols-[minmax(0,2.4fr)_repeat(5,minmax(64px,0.7fr))_minmax(150px,1.3fr)]";
const DIVIDER = "rgba(1, 20, 8, 0.1)";

function percent(value: number | null): string {
  return value == null ? "—" : `${value.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}%`;
}

/** Поисковые запросы рекламы: какие приводят заказы, а какие тратят клики впустую. Только чтение, грузится по кнопке (лимиты WB). */
export function HubAdsClusters({
  stats,
  titles,
  campaignNames,
  details,
}: {
  stats: SellerAdsStats;
  titles: Map<string, string>;
  campaignNames: Map<string, string>;
  /** Категория и описание товара для проверки смысла запросов нейросетью. */
  details?: Map<string, { category?: string | null; description?: string | null }>;
}) {
  const [keepRaw, setKeepRaw] = useUserSetting<string>("ads.keepQueries", "[]");
  const keep = useMemo(() => new Set(parseKeepQueries(keepRaw)), [keepRaw]);
  const [relevance, setRelevance] = useState<Record<string, Record<string, QueryRelevance>>>({});
  const [checking, setChecking] = useState<string | null>(null);
  const [relError, setRelError] = useState<string | null>(null);
  /** Ставки кластеров (₽ за 1000 показов), которые уже заданы вручную. Нет ключа — кластер идёт по ставке кампании. */
  const [clusterBids, setClusterBids] = useState<Record<string, number>>({});
  const [bidEdit, setBidEdit] = useState<{ key: string; advertId: string; nmId: string; query: string; value: string; step: "edit" | "confirm" | "reset" } | null>(null);
  const [bidBusy, setBidBusy] = useState(false);
  const [bidMessage, setBidMessage] = useState<string | null>(null);
  const [clusters, setClusters] = useState<SellerAdClusters | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const [minusBusy, setMinusBusy] = useState(false);
  const [minusDone, setMinusDone] = useState<Record<string, string>>({});
  const [wastedLimit, setWastedLimit] = useState(10);
  const [workingLimit, setWorkingLimit] = useState(10);

  const pairs = useMemo(
    () =>
      stats.campaigns.flatMap((campaign) =>
        Object.entries(campaign.byNm)
          .filter(([, row]) => row.views > 0 || row.spend > 0)
          .map(([nmId]) => ({ advertId: Number(campaign.advertId), nmId: Number(nmId) })),
      ),
    [stats],
  );
  const baseline = useMemo(() => {
    const total = summarizeAds(stats.campaigns);
    return { clicks: total.clicks, orders: total.orders };
  }, [stats]);
  const analysis = useMemo(() => (clusters ? analyzeClusters(clusters.rows, baseline) : null), [clusters, baseline]);

  async function load(refresh = false) {
    if (loading || pairs.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const result = await loadSellerHubAdClusters({ pairs, dateFrom: stats.dateFrom, dateTo: stats.dateTo, refresh });
      if (result.ok && result.clusters) setClusters(result.clusters);
      else setError(result.error ?? "Не удалось загрузить поисковые запросы");
    } catch {
      setError("Не удалось загрузить поисковые запросы");
    } finally {
      setLoading(false);
    }
  }

  /** Данные кэшируются на сервере, поэтому подгружаем при открытии вкладки и при смене периода. */
  useEffect(() => {
    setClusters(null);
    setError(null);
    if (pairs.length > 0) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stats.dateFrom, stats.dateTo, pairs.length]);

  const wastedGroups = useMemo(() => {
    const groups = new Map<string, { advertId: string; nmId: string; queries: string[] }>();
    for (const row of (analysis?.wasted ?? []).filter((r) => !keep.has(keepKey(r.nmId, r.query))).slice(0, 10)) {
      const key = `${row.advertId}:${row.nmId}`;
      const group = groups.get(key) ?? { advertId: row.advertId, nmId: row.nmId, queries: [] };
      group.queries.push(row.query);
      groups.set(key, group);
    }
    return [...groups.entries()];
  }, [analysis, keep]);

  /** Платная проверка смысла запросов нейросетью. Только по клику; результат хранится, повторно не оплачивается. */
  async function checkRelevance(key: string, group: { advertId: string; nmId: string; queries: string[] }) {
    if (checking) return;
    setChecking(key);
    setRelError(null);
    const info = details?.get(group.nmId);
    const res = await checkSellerHubQueryRelevance({
      nmId: Number(group.nmId),
      title: titles.get(group.nmId) ?? group.nmId,
      category: info?.category ?? null,
      description: info?.description ?? null,
      queries: group.queries,
    });
    if (res.ok && res.results) {
      setRelevance((prev) => ({ ...prev, [key]: Object.fromEntries(res.results!.map((r) => [r.query.toLowerCase(), r])) }));
    } else {
      setRelError(res.error ?? "Проверка не получилась");
    }
    setChecking(null);
  }

  /** Ставки кластеров читаем сразу после запросов: чтение дешёвое, а без них ставку нельзя показать в таблице. */
  useEffect(() => {
    if (!clusters) return;
    const uniquePairs = [...new Map(clusters.rows.map((r) => [`${r.advertId}:${r.nmId}`, { advertId: Number(r.advertId), nmId: Number(r.nmId) }])).values()].slice(0, 300);
    if (uniquePairs.length === 0) return;
    let cancelled = false;
    void loadSellerHubClusterBids(uniquePairs).then((res) => {
      if (!cancelled && res.ok) setClusterBids(res.bids);
    });
    return () => {
      cancelled = true;
    };
  }, [clusters]);

  /** Запись в WB: только после подтверждения с видимой ставкой. */
  async function applyBid() {
    if (!bidEdit || bidBusy) return;
    setBidBusy(true);
    setBidMessage(null);
    const base = { advertId: Number(bidEdit.advertId), nmId: Number(bidEdit.nmId), query: bidEdit.query };
    const res = bidEdit.step === "reset" ? await resetSellerHubClusterBid(base) : await setSellerHubClusterBid({ ...base, bidRub: Number(bidEdit.value) });
    if (res.ok) {
      setClusterBids((prev) => {
        const next = { ...prev };
        if (bidEdit.step === "reset") delete next[bidEdit.key];
        else next[bidEdit.key] = Number(bidEdit.value);
        return next;
      });
      setBidMessage(bidEdit.step === "reset" ? `Ставка кластера «${bidEdit.query}» сброшена: он идёт по ставке кампании.` : `Ставка кластера «${bidEdit.query}»: ${Number(bidEdit.value).toLocaleString("ru-RU")} ₽ за 1000 показов.`);
      setBidEdit(null);
    } else {
      setBidMessage(res.error ?? "Не удалось изменить ставку кластера");
    }
    setBidBusy(false);
  }

  const keepQuery = (nmId: string, query: string) => setKeepRaw(serializeKeepQueries([...keep, keepKey(nmId, query)]));

  /** После проверки нейросетью в минус идут только нерелевантные запросы; до проверки — все кандидаты. */
  const activeQueries = (key: string, group: { queries: string[] }) =>
    relevance[key] ? group.queries.filter((q) => relevance[key]![q.toLowerCase()]?.verdict === "irrelevant") : group.queries;

  /** Запись в WB: только по кнопке подтверждения со списком фраз на экране. */
  async function addMinus(key: string, group: { advertId: string; nmId: string; queries: string[] }) {
    if (minusBusy) return;
    setMinusBusy(true);
    try {
      const result = await addSellerHubAdMinusPhrases({
        advertId: Number(group.advertId),
        nmId: Number(group.nmId),
        queries: activeQueries(key, group),
      });
      setMinusDone((prev) => ({
        ...prev,
        [key]: result.ok
          ? result.added && result.added.length > 0
            ? `Добавлено минус-фраз: ${result.added.length}`
            : "Эти фразы уже стоят в минус-фразах"
          : (result.error ?? "Не удалось добавить минус-фразы"),
      }));
      setConfirmKey(null);
    } catch {
      setMinusDone((prev) => ({ ...prev, [key]: "Не удалось добавить минус-фразы" }));
    } finally {
      setMinusBusy(false);
    }
  }

  const header = (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-[22px] font-semibold leading-7 tracking-[-0.02em]" style={{ ...hubSans, color: hub.text }}>
          Поисковые запросы рекламы
          <HelpTip title="Что это за запросы" align="left">
            <p>Фразы, которые вводили покупатели, когда увидели вашу рекламу. По каждой видно показы, клики и заказы за выбранный период.</p>
            <p className="mt-2">В список попадают запросы минимум со 100 показами. Запросы с кликами, но без заказов можно добавить в минус-фразы.</p>
          </HelpTip>
        </div>
        <p className="mt-1 text-[15.5px] leading-[1.5]" style={{ ...hubSans, color: hub.textMuted }}>
          Какие запросы приводят заказы, а какие тратят деньги впустую.
        </p>
      </div>
      <HubButton variant="secondary" loading={loading} onClick={() => void load(clusters != null)} disabled={pairs.length === 0}>
        {clusters ? "Обновить" : "Загрузить запросы"}
      </HubButton>
    </div>
  );

  if (!analysis) {
    return (
      <div>
        {header}
        {error ? (
          <p className="mt-3 text-[15px]" style={{ ...hubSans, color: hub.danger }}>
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  const label = (row: ClusterRow) => `${titles.get(row.nmId) ?? row.nmId} · ${campaignNames.get(row.advertId) ?? row.advertId}`;
  const table = (rows: ClusterRow[], max: number, more: () => void) => (
    <div>
      <div className={`hidden gap-x-4 border-b pb-3 text-[14px] md:grid ${GRID}`} style={{ ...hubSans, color: hub.textSubtle, borderColor: "rgba(1, 20, 8, 0.14)" }}>
        <span>Запрос</span>
        <span className="text-right">Показы</span>
        <span className="text-right">Клики</span>
        <span className="text-right">CTR</span>
        <span className="text-right">Заказы</span>
        <span className="text-right">Позиция</span>
        <span>Ставка кластера</span>
      </div>
      <ul className="divide-y" style={{ borderColor: DIVIDER }}>
        {rows.slice(0, max).map((row) => {
          const key = clusterBidKey(row.advertId, row.nmId, row.query);
          const own = clusterBids[key];
          const editing = bidEdit?.key === key ? bidEdit : null;
          return (
            <li key={`${row.advertId}-${row.nmId}-${row.query}`} className="py-3.5" style={{ borderColor: DIVIDER }}>
              <div className={`grid items-center gap-x-4 gap-y-2 ${GRID}`}>
                <div className="min-w-0">
                  <p className="text-[16.5px] font-semibold leading-[1.3] [overflow-wrap:anywhere]" style={{ ...hubSans, color: hub.text }}>
                    {row.query}
                  </p>
                  <p className="mt-0.5 truncate text-[13.5px]" style={{ ...hubSans, color: hub.textSubtle }}>
                    {label(row)}
                  </p>
                </div>
                {[
                  ["Показы", formatInt(row.views)],
                  ["Клики", formatInt(row.clicks)],
                  ["CTR", percent(row.ctr)],
                  ["Заказы", formatInt(row.orders)],
                  ["Позиция", row.avgPos != null ? row.avgPos.toLocaleString("ru-RU", { maximumFractionDigits: 1 }) : "—"],
                ].map(([name, value]) => (
                  <p key={name} className="flex items-baseline justify-between gap-3 md:justify-end" style={MONO}>
                    <span className="text-[13.5px] md:hidden" style={{ ...hubSans, letterSpacing: 0, color: hub.textSubtle }}>
                      {name}
                    </span>
                    <span className="text-[17px] font-medium" style={{ color: name === "Заказы" && row.orders > 0 ? "#067A55" : hub.text }}>
                      {value}
                    </span>
                  </p>
                ))}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="text-[15px]" style={{ ...hubSans, color: own != null ? hub.text : hub.textSubtle, fontWeight: own != null ? 600 : 400 }}>
                    {own != null ? `${own.toLocaleString("ru-RU")} ₽` : "как у кампании"}
                  </span>
                  {!editing ? (
                    <>
                      <button type="button" className="rounded-full px-3 py-1 text-[14px] font-semibold outline-none transition-colors hover:bg-black/[0.06]" style={{ ...hubSans, color: hub.text, backgroundColor: "rgba(1, 20, 8, 0.045)" }} onClick={() => setBidEdit({ key, advertId: row.advertId, nmId: row.nmId, query: row.query, value: own != null ? String(Math.round(own)) : "", step: "edit" })}>
                        {own != null ? "Изменить" : "Задать"}
                      </button>
                      {own != null ? (
                        <button type="button" className="text-[14px] underline underline-offset-2" style={{ ...hubSans, color: hub.textMuted }} onClick={() => setBidEdit({ key, advertId: row.advertId, nmId: row.nmId, query: row.query, value: String(Math.round(own)), step: "reset" })}>
                          Сбросить
                        </button>
                      ) : null}
                    </>
                  ) : null}
                </div>
              </div>
              {editing ? (
                <div className="mt-3 rounded-[16px] p-4" style={{ backgroundColor: "rgba(1, 20, 8, 0.045)" }}>
                  {editing.step === "edit" ? (
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="text-[15px] font-semibold" style={{ ...hubSans, color: hub.text }}>
                        Ставка кластера, ₽ за 1000 показов
                      </span>
                      <input inputMode="numeric" value={editing.value} onChange={(e) => setBidEdit({ ...editing, value: e.target.value.replace(/\D/g, "") })} className="h-10 w-28 rounded-full border bg-transparent px-4 text-[15px] outline-none focus-visible:shadow-[0_0_0_3px_var(--hub-lime-ring)]" style={{ borderColor: "rgba(1, 20, 8, 0.25)", color: hub.text }} placeholder="₽" aria-label="Ставка кластера, ₽ за 1000 показов" />
                      <HubButton size="sm" disabled={!editing.value || Number(editing.value) <= 0} onClick={() => setBidEdit({ ...editing, step: "confirm" })}>
                        Далее
                      </HubButton>
                      <HubButton size="sm" variant="ghost" onClick={() => setBidEdit(null)}>
                        Отмена
                      </HubButton>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-[15.5px] leading-[1.5]" style={{ ...hubSans, color: hub.text }}>
                        {editing.step === "reset"
                          ? `Сбросить ставку кластера «${row.query}»? Он вернётся к ставке кампании.`
                          : `Поставить на кластер «${row.query}» ставку ${Number(editing.value).toLocaleString("ru-RU")} ₽ за 1000 показов?`}
                      </p>
                      <div className="flex flex-wrap gap-2.5">
                        <HubButton size="sm" loading={bidBusy} onClick={() => void applyBid()}>
                          Подтвердить
                        </HubButton>
                        <HubButton size="sm" variant="ghost" disabled={bidBusy} onClick={() => setBidEdit(null)}>
                          Отмена
                        </HubButton>
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {rows.length > max ? (
        <div className="mt-3 flex justify-center">
          <HubButton size="sm" variant="secondary" onClick={more}>
            Показать ещё {Math.min(10, rows.length - max)} из {formatInt(rows.length - max)}
          </HubButton>
        </div>
      ) : null}
    </div>
  );

  const wastedRows = analysis.wasted.filter((r) => !keep.has(keepKey(r.nmId, r.query)));

  return (
    <div className="space-y-7">
      {header}
      {bidMessage ? (
        <p className="text-[15px] font-semibold" style={{ ...hubSans, color: bidMessage.startsWith("Ставка") ? "#067A55" : hub.danger }}>
          {bidMessage}
        </p>
      ) : null}
      {analysis.rows.length === 0 ? (
        <p className="text-[15.5px]" style={{ ...hubSans, color: hub.textMuted }}>
          WB не вернул запросов за этот период (в список попадают запросы минимум со 100 показами).
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-x-10 gap-y-4">
            <div>
              <p className="text-[14.5px]" style={{ ...hubSans, color: hub.textSubtle }}>Запросов</p>
              <p className="mt-2 text-[28px] font-medium leading-none" style={{ ...MONO, color: hub.text }}>{formatInt(analysis.rows.length)}</p>
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-[14.5px]" style={{ ...hubSans, color: hub.textSubtle }}>
                Клик в заказ по рекламе
                <HelpTip title="Как считаем пустые запросы" align="left">
                  <p>Конверсия клика в заказ посчитана по всей рекламе магазина за период.</p>
                  <p className="mt-2">
                    {analysis.wasteClicks != null
                      ? `В среднем нужно около ${formatInt(Math.round(analysis.wasteClicks / 2))} кликов на заказ. Пустыми считаем запросы с ${formatInt(analysis.wasteClicks)} и более кликами без заказов.`
                      : "Заказов по рекламе за период нет, поэтому пустые запросы не определяем."}
                  </p>
                </HelpTip>
              </div>
              <p className="mt-2 text-[28px] font-medium leading-none" style={{ ...MONO, color: hub.text }}>{percent(analysis.storeCr)}</p>
            </div>
            {analysis.wasteClicks != null ? (
              <div>
                <p className="text-[14.5px]" style={{ ...hubSans, color: hub.textSubtle }}>Пустой запрос</p>
                <p className="mt-2 text-[28px] font-medium leading-none" style={{ ...MONO, color: hub.text }}>
                  от {formatInt(analysis.wasteClicks)} <span className="text-[16px]" style={{ ...hubSans, letterSpacing: 0, color: hub.textSubtle }}>кликов без заказа</span>
                </p>
              </div>
            ) : null}
          </div>

          {analysis.wasted.length > 0 ? (
            <section>
              <p className="text-[19px] font-semibold tracking-[-0.01em]" style={{ ...hubSans, color: hub.text }}>
                Запросы, которые тратят деньги впустую: {formatInt(wastedRows.length)}
              </p>
              <p className="mt-1 max-w-[78ch] text-[15.5px] leading-[1.5]" style={{ ...hubSans, color: hub.textMuted }}>
                Клики есть, заказов нет. Добавьте нерелевантные в минус-фразы, чтобы не платить за них. Сначала убедитесь, что запрос не подходит товару.
              </p>
              {relError ? (
                <p className="mt-2 text-[15px]" style={{ ...hubSans, color: hub.danger }}>
                  {relError}
                </p>
              ) : null}
              <div className="mt-4">{table(wastedRows, wastedLimit, () => setWastedLimit((n) => n + 10))}</div>

              <p className="mt-8 text-[17px] font-semibold" style={{ ...hubSans, color: hub.text }}>
                Что сделать с этими запросами
              </p>
              <ul className="mt-2 divide-y" style={{ borderColor: DIVIDER }}>
                {wastedGroups.map(([key, group]) => (
                  <li key={key} className="py-4" style={{ borderColor: DIVIDER }}>
                    <p className="text-[16px] font-semibold" style={{ ...hubSans, color: hub.text }}>
                      {titles.get(group.nmId) ?? group.nmId}
                      <span className="font-normal" style={{ color: hub.textSubtle }}> · {campaignNames.get(group.advertId) ?? group.advertId}</span>
                    </p>
                    <ul className="mt-2 space-y-2">
                      {group.queries.map((q) => {
                        const r = relevance[key]?.[q.toLowerCase()];
                        const tone = r?.verdict === "irrelevant" ? hub.danger : r?.verdict === "relevant" ? "#067A55" : hub.textMuted;
                        return (
                          <li key={q} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[15.5px]" style={hubSans}>
                            <span className="font-semibold" style={{ color: hub.text }}>
                              {q}
                            </span>
                            {r ? (
                              <span style={{ color: tone }}>
                                {r.verdict === "irrelevant" ? "не подходит товару" : r.verdict === "relevant" ? "подходит товару, в минус не добавлять" : "неясно, решайте сами"}
                                {r.reason ? `: ${r.reason}` : ""}
                              </span>
                            ) : null}
                            <button type="button" onClick={() => keepQuery(group.nmId, q)} className="text-[14px] underline underline-offset-2" style={{ color: hub.textMuted }}>
                              Оставить, не предлагать больше
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                    {!relevance[key] ? (
                      <div className="mt-3">
                        <HubButton size="sm" variant="secondary" loading={checking === key} onClick={() => void checkRelevance(key, group)}>
                          Проверить, подходят ли запросы товару
                        </HubButton>
                      </div>
                    ) : null}
                    {minusDone[key] ? (
                      <p className="mt-3 text-[15px] font-semibold" style={{ ...hubSans, color: "#067A55" }}>
                        {minusDone[key]}
                      </p>
                    ) : confirmKey === key ? (
                      <div className="mt-3 flex flex-wrap items-center gap-2.5">
                        <span className="text-[15px]" style={{ ...hubSans, color: hub.text }}>
                          Добавить {activeQueries(key, group).length} фраз в минус-фразы этой кампании для товара? Уже стоящие фразы сохранятся.
                        </span>
                        <HubButton size="sm" loading={minusBusy} onClick={() => void addMinus(key, group)}>
                          Подтвердить
                        </HubButton>
                        <HubButton size="sm" variant="ghost" disabled={minusBusy} onClick={() => setConfirmKey(null)}>
                          Отмена
                        </HubButton>
                      </div>
                    ) : (
                      <div className="mt-3">
                        {activeQueries(key, group).length > 0 ? (
                          <HubButton size="sm" onClick={() => setConfirmKey(key)}>
                            Добавить в минус-фразы ({activeQueries(key, group).length})
                          </HubButton>
                        ) : (
                          <p className="text-[15px]" style={{ ...hubSans, color: hub.textMuted }}>
                            Нерелевантных запросов не нашлось: в минус-фразы добавлять нечего. Если заказов нет, смотрите цену, ставку и карточку.
                          </p>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {analysis.working.length > 0 ? (
            <section>
              <p className="text-[19px] font-semibold tracking-[-0.01em]" style={{ ...hubSans, color: hub.text }}>
                Запросы, которые приводят заказы
              </p>
              <div className="mt-4">{table(analysis.working, workingLimit, () => setWorkingLimit((n) => n + 10))}</div>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
