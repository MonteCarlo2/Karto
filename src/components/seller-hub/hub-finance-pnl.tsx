"use client";

import { useEffect, useMemo, useState } from "react";
import { ANALYTICS_PERIODS } from "@/lib/seller-hub/analytics-periods";
import { loadSellerHubAdsStats } from "@/lib/seller-hub/client-api";
import { summarizeAds } from "@/lib/seller-hub/ads-metrics";
import { buildMoneyAnalytics } from "@/lib/seller-hub/money-analytics";
import { buildPnl, MAX_ADS_DAYS, TAX_BASE_LABEL, type TaxBase } from "@/lib/seller-hub/pnl";
import type { SellerCatalogSnapshot } from "@/lib/seller-hub/types";
import { formatRub, hub, HubPanel, HubSegmented, hubNumeric, hubSans } from "./hub-ui";
import { useUserSetting } from "./use-user-setting";

type AdsState = { key: string; spend: number | null; note: string };

const fmtDay = (key: string) => new Date(`${key}T00:00:00Z`).toLocaleDateString("ru-RU", { day: "numeric", month: "long", timeZone: "UTC" });
const pct = (v: number | null) => (v == null ? "" : `${(v * 100).toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%`);

/**
 * Прибыли и убытки магазина за период: от выручки до чистой прибыли. Строки из отчёта реализации WB, реклама из статистики WB
 * (только до 30 дней), налог по ставке пользователя. Чего нет в данных, помечено, а не заменено нулём.
 */
export function HubFinancePnl({ snapshot, connected }: { snapshot?: SellerCatalogSnapshot; connected?: boolean }) {
  const [days, setDays] = useUserSetting<number>("finance.period", 28);
  const [taxRate, setTaxRate] = useUserSetting<number>("finance.taxRate", 0);
  const [taxBase, setTaxBase] = useUserSetting<string>("finance.taxBase", "revenue");
  const [rateText, setRateText] = useState<string | null>(null);
  const [ads, setAds] = useState<AdsState | null>(null);

  const realization = snapshot?.realization;
  const items = snapshot?.items;
  const money = useMemo(() => buildMoneyAnalytics(realization, items ?? [], days), [realization, items, days]);
  const campaignIds = useMemo(() => (snapshot?.ads?.campaigns ?? []).map((c) => Number(c.id)).filter((id) => Number.isInteger(id) && id > 0), [snapshot?.ads]);
  const adsKey = money ? `${campaignIds.join(",")}|${money.period.from}|${money.period.to}` : "";

  // Расход на рекламу берём за тот же период, что и отчёт реализации (WB отдаёт статистику рекламы не больше чем за 30 дней).
  useEffect(() => {
    if (!money || !connected || days > MAX_ADS_DAYS || campaignIds.length === 0) return;
    let cancelled = false;
    void loadSellerHubAdsStats({ campaignIds, dateFrom: money.period.from, dateTo: money.period.to })
      .then((res) => {
        if (cancelled) return;
        if (res.ok && res.stats) setAds({ key: adsKey, spend: summarizeAds(res.stats.campaigns).spend, note: "" });
        else setAds({ key: adsKey, spend: null, note: res.error ?? "Статистика рекламы не загрузилась" });
      })
      .catch((e: unknown) => {
        if (!cancelled) setAds({ key: adsKey, spend: null, note: e instanceof Error ? e.message : "Статистика рекламы не загрузилась" });
      });
    return () => {
      cancelled = true;
    };
  }, [money, connected, days, campaignIds, adsKey]);

  const adsReady = ads != null && ads.key === adsKey;
  let adSpend: number | null = null;
  let adsNote = "Нет данных";
  if (days > MAX_ADS_DAYS) adsNote = "WB отдаёт статистику рекламы не больше чем за 30 дней: за этот период расход не показан";
  else if (campaignIds.length === 0) {
    // Кампаний нет: расход на рекламу действительно ноль.
    adSpend = snapshot?.ads ? 0 : null;
    adsNote = snapshot?.ads ? "" : "Реклама не загружена: выгрузите данные кабинета";
  } else if (!adsReady) adsNote = "Загружаю статистику рекламы…";
  else if (ads.spend != null) adSpend = ads.spend;
  else adsNote = ads.note;

  const pnl = useMemo(() => {
    const tax = taxRate > 0 && (taxBase === "revenue" || taxBase === "pay" || taxBase === "profit") ? { ratePercent: taxRate, base: taxBase as TaxBase } : null;
    return buildPnl({ money, adSpend, adsNote, tax });
  }, [money, adSpend, adsNote, taxRate, taxBase]);

  const options = ANALYTICS_PERIODS.map((d) => ({ id: String(d), label: `${d} дн.` }));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-[13px] leading-5" style={{ ...hubSans, color: hub.textMuted }}>
          От выручки до чистой прибыли. Строки из отчёта реализации WB, реклама из статистики WB, налог по вашей ставке. Чего нет в данных, помечено, а не заменено нулём.
        </p>
        <HubSegmented<string> layoutId="finance-period" value={String(days)} onChange={(v) => setDays(Number(v))} options={options} />
      </div>

      {!pnl ? (
        <HubPanel className="px-5 py-8">
          <p className="text-[14px]" style={{ ...hubSans, color: hub.textMuted }}>
            {realization?.error ?? "Отчёт реализации за этот период не загружен. Выгрузите данные кабинета: без него расходы WB не посчитать."}
          </p>
        </HubPanel>
      ) : (
        <>
          <HubPanel>
            <div className="border-b px-5 py-3" style={{ borderColor: hub.borderSoft }}>
              <h2 className="text-[15px] font-semibold" style={{ ...hubSans, color: hub.text }}>
                Отчёт за {pnl.period.days} дн.: {fmtDay(pnl.period.from)} — {fmtDay(pnl.period.to)}
              </h2>
            </div>
            <ul>
              {pnl.lines.map((l) => {
                const strong = l.kind === "subtotal" || l.kind === "result";
                const negative = l.kind === "expense" && l.amount != null && l.amount > 0;
                return (
                  <li key={l.id} className="flex items-start justify-between gap-4 border-b px-5 py-2.5 last:border-b-0" style={{ borderColor: hub.borderSoft, backgroundColor: l.kind === "result" ? hub.surfaceMuted : undefined }}>
                    <div className="min-w-0">
                      <p className={`text-[14px] ${strong ? "font-semibold" : "font-medium"}`} style={{ ...hubSans, color: hub.text }}>
                        {l.label}
                      </p>
                      <p className="text-[12px] leading-4" style={{ ...hubSans, color: hub.textSubtle }}>
                        {l.note}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className={`text-[14px] tabular-nums ${strong ? "font-semibold" : ""}`} style={{ ...hubNumeric, color: l.amount != null && l.amount < 0 ? hub.danger : hub.text }}>
                        {l.amount == null ? "нет данных" : `${negative ? "−" : ""}${formatRub(Math.abs(l.amount))}`}
                      </p>
                      <p className="text-[11.5px] tabular-nums" style={{ ...hubNumeric, color: hub.textSubtle }}>
                        {l.share != null && l.id !== "revenue" ? `${pct(l.share)} выручки` : ""}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </HubPanel>

          {pnl.missing.length > 0 ? (
            <HubPanel className="px-5 py-3">
              <p className="text-[13px] leading-5" style={{ ...hubSans, color: hub.textMuted }}>
                Не учтено в чистой прибыли: {pnl.missing.join(", ")}.
                {pnl.net == null ? " Чистая прибыль не посчитана, чтобы не показать завышенное число." : " Итог без этих расходов выше реального."}
              </p>
            </HubPanel>
          ) : null}
          {pnl.truncated ? (
            <HubPanel className="px-5 py-3">
              <p className="text-[13px] leading-5" style={{ ...hubSans, color: hub.danger }}>
                Отчёт реализации WB выгружен не полностью (лимит выгрузки), суммы занижены.
              </p>
            </HubPanel>
          ) : null}
        </>
      )}

      <HubPanel className="px-5 py-4">
        <h3 className="text-[14px] font-semibold" style={{ ...hubSans, color: hub.text }}>
          Налог
        </h3>
        <p className="mt-0.5 text-[12.5px] leading-5" style={{ ...hubSans, color: hub.textMuted }}>
          Укажите ставку, и налог появится в отчёте. Это расчёт для оценки по вашей ставке, он не заменяет бухгалтерию. 0 — налог не показывать.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px]" style={{ ...hubSans, color: hub.text }}>
          <label className="flex items-center gap-1.5">
            Ставка
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={40}
              value={rateText ?? String(taxRate)}
              onChange={(e) => {
                setRateText(e.target.value);
                const n = Number(e.target.value);
                if (e.target.value !== "" && Number.isInteger(n) && n >= 0 && n <= 40) setTaxRate(n);
              }}
              onBlur={() => setRateText(null)}
              className="w-20 rounded-lg border px-2.5 py-1.5 text-right tabular-nums"
              style={{ borderColor: hub.border }}
            />
            %
          </label>
          <label className="flex items-center gap-1.5">
            от
            <select value={taxBase} onChange={(e) => setTaxBase(e.target.value)} className="rounded-lg border px-2.5 py-1.5" style={{ borderColor: hub.border }}>
              {(Object.keys(TAX_BASE_LABEL) as TaxBase[]).map((b) => (
                <option key={b} value={b}>
                  {TAX_BASE_LABEL[b]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </HubPanel>
    </div>
  );
}
