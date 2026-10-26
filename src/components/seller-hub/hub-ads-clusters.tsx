"use client";

import { useEffect, useMemo, useState } from "react";
import { summarizeAds } from "@/lib/seller-hub/ads-metrics";
import { analyzeClusters, type ClusterRow } from "@/lib/seller-hub/ads-clusters";
import { addSellerHubAdMinusPhrases, checkSellerHubQueryRelevance, loadSellerHubAdClusters, loadSellerHubClusterBids, resetSellerHubClusterBid, setSellerHubClusterBid } from "@/lib/seller-hub/client-api";
import { clusterBidKey } from "@/lib/seller-hub/ads-cluster-bid";
import { keepKey, parseKeepQueries, serializeKeepQueries } from "@/lib/seller-hub/ads-keep-queries";
import type { QueryRelevance } from "@/lib/seller-hub/ads-query-relevance";
import type { SellerAdClusters, SellerAdsStats } from "@/lib/seller-hub/types";
import { formatInt, hub, HubButton, hubNumeric, hubSans } from "./hub-ui";
import { useUserSetting } from "./use-user-setting";

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
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="text-[13px] font-semibold" style={{ ...hubSans, color: hub.text }}>
          Поисковые запросы рекламы
        </p>
        <p className="text-[12px] leading-5" style={{ ...hubSans, color: hub.textSubtle }}>
          Какие запросы приводят заказы, а на каких уходят клики впустую. Данные WB, период как в сводке.
        </p>
      </div>
      <HubButton variant="secondary" size="sm" loading={loading} onClick={() => void load(clusters != null)} disabled={pairs.length === 0}>
        {clusters ? "Обновить" : "Загрузить запросы"}
      </HubButton>
    </div>
  );

  if (!analysis) {
    return (
      <div>
        {header}
        {error ? (
          <p className="mt-2 text-[13px]" style={{ ...hubSans, color: hub.danger }}>
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  const label = (row: ClusterRow) => `${titles.get(row.nmId) ?? row.nmId} · ${campaignNames.get(row.advertId) ?? row.advertId}`;
  const table = (rows: ClusterRow[], max: number) => (
    <div className="overflow-x-auto">
      <table className="min-w-full border-collapse text-left">
        <thead style={{ backgroundColor: hub.surfaceMuted }}>
          <tr>
            {["Запрос", "Товар и кампания", "Показы", "Клики", "CTR", "Заказы", "Позиция", "Ставка кластера"].map((name) => (
              <th
                key={name}
                className="border-b px-3 py-2 text-[11.5px] font-bold uppercase tracking-[0.06em]"
                style={{ ...hubSans, color: hub.textSubtle, borderColor: hub.borderSoft }}
              >
                {name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, max).map((row) => (
            <tr key={`${row.advertId}-${row.nmId}-${row.query}`} className="border-b" style={{ borderColor: hub.borderSoft }}>
              <td className="px-3 py-2 text-[13px] font-medium" style={hubSans}>
                {row.query}
              </td>
              <td className="max-w-[260px] truncate px-3 py-2 text-[12.5px]" style={{ ...hubSans, color: hub.textMuted }}>
                {label(row)}
              </td>
              {[
                formatInt(row.views),
                formatInt(row.clicks),
                percent(row.ctr),
                formatInt(row.orders),
                row.avgPos != null ? row.avgPos.toLocaleString("ru-RU", { maximumFractionDigits: 1 }) : "—",
              ].map((cell, index) => (
                <td key={index} className="whitespace-nowrap px-3 py-2 text-[13px]" style={{ ...hubSans, ...hubNumeric, color: hub.text }}>
                  {cell}
                </td>
              ))}
              <td className="px-3 py-2 text-[12.5px]" style={hubSans}>
                {(() => {
                  const key = clusterBidKey(row.advertId, row.nmId, row.query);
                  const own = clusterBids[key];
                  const editing = bidEdit?.key === key ? bidEdit : null;
                  if (editing) {
                    return (
                      <div className="space-y-1.5">
                        {editing.step === "edit" ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              inputMode="numeric"
                              value={editing.value}
                              onChange={(e) => setBidEdit({ ...editing, value: e.target.value.replace(/\D/g, "") })}
                              className="w-20 rounded-md border px-2 py-1 text-[13px]"
                              style={{ borderColor: hub.border }}
                              placeholder="₽"
                              aria-label="Ставка кластера, ₽ за 1000 показов"
                            />
                            <HubButton size="sm" disabled={!editing.value || Number(editing.value) <= 0} onClick={() => setBidEdit({ ...editing, step: "confirm" })}>
                              Далее
                            </HubButton>
                            <HubButton size="sm" variant="secondary" onClick={() => setBidEdit(null)}>
                              Отмена
                            </HubButton>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <p style={{ color: hub.text }}>
                              {editing.step === "reset"
                                ? `Сбросить ставку кластера «${row.query}»? Он вернётся к ставке кампании.`
                                : `Поставить на кластер «${row.query}» ставку ${Number(editing.value).toLocaleString("ru-RU")} ₽ за 1000 показов?`}
                            </p>
                            <div className="flex gap-1.5">
                              <HubButton size="sm" loading={bidBusy} onClick={() => void applyBid()}>
                                Подтвердить
                              </HubButton>
                              <HubButton size="sm" variant="secondary" disabled={bidBusy} onClick={() => setBidEdit(null)}>
                                Отмена
                              </HubButton>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  }
                  return (
                    <div className="flex flex-wrap items-center gap-2 whitespace-nowrap">
                      <span style={{ color: hub.text }}>{own != null ? `${own.toLocaleString("ru-RU")} ₽` : "как у кампании"}</span>
                      <button
                        type="button"
                        className="underline"
                        style={{ color: hub.textMuted }}
                        onClick={() => setBidEdit({ key, advertId: row.advertId, nmId: row.nmId, query: row.query, value: own != null ? String(Math.round(own)) : "", step: "edit" })}
                      >
                        {own != null ? "Изменить" : "Задать"}
                      </button>
                      {own != null ? (
                        <button type="button" className="underline" style={{ color: hub.textMuted }} onClick={() => setBidEdit({ key, advertId: row.advertId, nmId: row.nmId, query: row.query, value: String(Math.round(own)), step: "reset" })}>
                          Сбросить
                        </button>
                      ) : null}
                    </div>
                  );
                })()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-3">
      {header}
      {bidMessage ? (
        <p className="text-[12.5px] font-semibold" style={{ ...hubSans, color: bidMessage.startsWith("Ставка") ? hub.greenDark : hub.danger }}>
          {bidMessage}
        </p>
      ) : null}
      {analysis.rows.length === 0 ? (
        <p className="text-[13px]" style={{ ...hubSans, color: hub.textMuted }}>
          WB не вернул запросов за этот период (в список попадают запросы минимум со 100 показами).
        </p>
      ) : (
        <>
          <p className="text-[12px] leading-5" style={{ ...hubSans, color: hub.textMuted }}>
            Всего запросов: {formatInt(analysis.rows.length)}. Конверсия клика в заказ по рекламе магазина:{" "}
            {percent(analysis.storeCr)}
            {analysis.wasteClicks != null
              ? `, то есть в среднем ${formatInt(Math.round(analysis.wasteClicks / 2))} кликов на заказ. «Пустыми» считаем запросы с ${formatInt(analysis.wasteClicks)} и более кликами без заказов.`
              : ". Заказов по рекламе за период нет, поэтому «пустые» запросы не определяем."}
          </p>
          {analysis.wasted.length > 0 ? (
            <div
              className="rounded-xl border px-4 py-3"
              style={{ borderColor: hub.border, backgroundColor: hub.dangerSoft }}
            >
              <p className="mb-2 text-[13.5px] font-semibold" style={{ ...hubSans, color: hub.danger }}>
                Кандидаты в минус-фразы: {formatInt(analysis.wasted.length)}
              </p>
              <p className="mb-2 text-[13px] leading-5" style={{ ...hubSans, color: hub.text }}>
                <strong>Что сделать:</strong> добавьте эти запросы в минус-фразы: кнопкой ниже или в кабинете WB (кампания →
                товар → «Минус-фразы»). Сначала проверьте, что запрос действительно нерелевантен товару, а не просто мало
                времени в выдаче.
              </p>
              {relError ? (
                <p className="mb-2 text-[12.5px]" style={{ ...hubSans, color: hub.danger }}>
                  {relError}
                </p>
              ) : null}
              {table(analysis.wasted.filter((r) => !keep.has(keepKey(r.nmId, r.query))), 10)}
              <div className="mt-3 space-y-2">
                {wastedGroups.map(([key, group]) => (
                  <div key={key} className="rounded-lg px-3 py-2" style={{ backgroundColor: hub.surface }}>
                    <p className="text-[13px] font-medium" style={{ ...hubSans, color: hub.text }}>
                      {titles.get(group.nmId) ?? group.nmId} · {campaignNames.get(group.advertId) ?? group.advertId}
                    </p>
                    <ul className="mt-1 space-y-1">
                      {group.queries.map((q) => {
                        const r = relevance[key]?.[q.toLowerCase()];
                        const tone = r?.verdict === "irrelevant" ? hub.danger : r?.verdict === "relevant" ? hub.green : hub.textMuted;
                        return (
                          <li key={q} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12.5px]" style={hubSans}>
                            <span className="font-medium" style={{ color: hub.text }}>
                              {q}
                            </span>
                            {r ? (
                              <span style={{ color: tone }}>
                                {r.verdict === "irrelevant" ? "не подходит товару" : r.verdict === "relevant" ? "подходит товару, в минус не добавлять" : "неясно, решайте сами"}
                                {r.reason ? `: ${r.reason}` : ""}
                              </span>
                            ) : null}
                            <button type="button" onClick={() => keepQuery(group.nmId, q)} className="text-[12px] underline" style={{ color: hub.textMuted }}>
                              Оставить, не предлагать больше
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                    {!relevance[key] ? (
                      <div className="mt-2">
                        <HubButton size="sm" variant="secondary" loading={checking === key} onClick={() => void checkRelevance(key, group)}>
                          Проверить смысл нейросетью (около $0,001)
                        </HubButton>
                      </div>
                    ) : null}
                    {minusDone[key] ? (
                      <p className="mt-1 text-[12.5px] font-semibold" style={{ ...hubSans, color: hub.greenDark }}>
                        {minusDone[key]}
                      </p>
                    ) : confirmKey === key ? (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="text-[12.5px]" style={{ ...hubSans, color: hub.text }}>
                          Добавить {activeQueries(key, group).length} фраз в минус-фразы этой кампании для товара? Уже стоящие фразы сохранятся.
                        </span>
                        <HubButton size="sm" loading={minusBusy} onClick={() => void addMinus(key, group)}>
                          Подтвердить
                        </HubButton>
                        <HubButton size="sm" variant="secondary" disabled={minusBusy} onClick={() => setConfirmKey(null)}>
                          Отмена
                        </HubButton>
                      </div>
                    ) : (
                      <div className="mt-2">
                        {activeQueries(key, group).length > 0 ? (
                          <HubButton size="sm" variant="secondary" onClick={() => setConfirmKey(key)}>
                            Добавить в минус-фразы ({activeQueries(key, group).length})
                          </HubButton>
                        ) : (
                          <p className="text-[12.5px]" style={{ ...hubSans, color: hub.textMuted }}>
                            Нейросеть не нашла нерелевантных запросов: в минус-фразы добавлять нечего. Если заказов нет, смотрите цену, ставку и карточку.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {analysis.working.length > 0 ? (
            <div>
              <p className="mb-1 text-[13px] font-semibold" style={{ ...hubSans, color: hub.text }}>
                Запросы, которые приводят заказы
              </p>
              {table(analysis.working, 10)}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
