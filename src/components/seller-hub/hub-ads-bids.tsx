"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { compareBids, type BidRow } from "@/lib/seller-hub/ads-bids";
import { changeSellerHubAdBid, loadSellerHubAdBidRecommendations } from "@/lib/seller-hub/client-api";
import { AD_BID_MAX_RAISE } from "@/lib/seller-hub/ads-bid";
import type { SellerAdBidRecommendation, SellerAdCampaignRow } from "@/lib/seller-hub/types";
import { formatRub, hub, HubButton, HubInput, hubNumeric, hubSans } from "./hub-ui";

const VERDICT_STYLE: Record<BidRow["verdict"], { label: string; color: string }> = {
  below_competitive: { label: "Ниже конкурентной", color: hub.warn },
  between: { label: "В норме", color: hub.greenDark },
  above_leaders: { label: "Выше лидеров", color: hub.warn },
  no_data: { label: "Нет данных", color: hub.textSubtle },
};

/** Максимум пар «кампания — артикул» за один запрос рекомендаций (лимит WB 5 запросов в минуту). */
const MAX_PAIRS = 12;

/** Ставки по товарам: текущая и рекомендованные WB. Только чтение, грузится по кнопке. */
export function HubAdsBids({
  campaigns,
  titles,
}: {
  campaigns: SellerAdCampaignRow[];
  titles: Map<string, string>;
}) {
  const [recommendations, setRecommendations] = useState<SellerAdBidRecommendation[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editKey, setEditKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [applied, setApplied] = useState<Record<string, number>>({});
  const [editNote, setEditNote] = useState<string | null>(null);

  const active = useMemo(() => campaigns.filter((c) => c.status === 9 && c.paymentType === "cpm"), [campaigns]);
  const allPairs = useMemo(
    () => active.flatMap((c) => (c.bids ?? []).map((b) => ({ advertId: Number(c.id), nmId: Number(b.nmId) }))),
    [active],
  );
  const pairs = allPairs.slice(0, MAX_PAIRS);
  /** После успешной смены показываем новую ставку, пока не обновлены данные кабинета. */
  const rows = useMemo(() => {
    const withApplied = active.map((campaign) => ({
      ...campaign,
      bids: (campaign.bids ?? []).map((bid) => {
        const next = applied[`${campaign.id}:${bid.nmId}`];
        return next == null ? bid : { ...bid, searchRub: next };
      }),
    }));
    return recommendations ? compareBids(withApplied, recommendations) : [];
  }, [active, recommendations, applied]);
  const editValueNumber = Number(editValue.replace(",", "."));
  const editValid = Number.isFinite(editValueNumber) && editValueNumber > 0 && Math.abs(editValueNumber * 100 - Math.round(editValueNumber * 100)) < 1e-6;

  /** Запись в WB: только по кнопке подтверждения с видимой ставкой. */
  async function saveBid(row: BidRow) {
    if (!editValid || saving) return;
    setSaving(true);
    setEditNote(null);
    try {
      const result = await changeSellerHubAdBid({
        advertId: Number(row.advertId),
        nmId: Number(row.nmId),
        bidRub: editValueNumber,
      });
      if (result.ok) {
        setApplied((prev) => ({ ...prev, [`${row.advertId}:${row.nmId}`]: result.bidRub ?? editValueNumber }));
        setEditNote(`Ставка изменена: ${formatRub(result.bidRub ?? editValueNumber)}. WB применяет ставки с задержкой до нескольких минут.`);
        setEditKey(null);
      } else {
        setEditNote(result.error ?? "Не удалось изменить ставку");
      }
    } catch {
      setEditNote("Не удалось изменить ставку");
    } finally {
      setSaving(false);
    }
  }


  /** Данные кэшируются на сервере, поэтому подгружаем при открытии вкладки: пустого экрана с кнопкой не должно быть. */
  useEffect(() => {
    if (allPairs.length > 0 && recommendations == null && !loading && !error) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allPairs.length]);

  if (allPairs.length === 0) return null;

  async function load(refresh = false) {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const result = await loadSellerHubAdBidRecommendations({ pairs, refresh });
      if (result.ok && result.recommendations) setRecommendations(result.recommendations);
      else setError(result.error ?? "Не удалось загрузить рекомендованные ставки");
    } catch {
      setError("Не удалось загрузить рекомендованные ставки");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[13px] font-semibold" style={{ ...hubSans, color: hub.text }}>
            Ставки по товарам
          </p>
          <p className="text-[12px] leading-5" style={{ ...hubSans, color: hub.textSubtle }}>
            Текущая ставка в поиске (₽ за 1000 показов) и ставки, которые WB рекомендует для этого товара.
            {allPairs.length > MAX_PAIRS ? ` Показаны первые ${MAX_PAIRS} из ${allPairs.length} из-за лимита WB.` : ""}
          </p>
        </div>
        <HubButton variant="secondary" size="sm" loading={loading} onClick={() => void load(recommendations != null)}>
          {recommendations ? "Обновить" : "Загрузить ставки"}
        </HubButton>
      </div>
      {error ? (
        <p className="text-[13px]" style={{ ...hubSans, color: hub.danger }}>
          {error}
        </p>
      ) : null}
      {rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-left">
            <thead style={{ backgroundColor: hub.surfaceMuted }}>
              <tr>
                {["Товар", "Кампания", "Ставка сейчас", "Конкурентная", "Лидеров", "Оценка", ""].map((name) => (
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
              {rows.map((row) => {
                const style = VERDICT_STYLE[row.verdict];
                const rowKey = `${row.advertId}:${row.nmId}`;
                return (
                  <Fragment key={rowKey}>
                  <tr className="border-b" style={{ borderColor: hub.borderSoft }} title={row.note}>
                    <td className="max-w-[240px] truncate px-3 py-2 text-[13px] font-medium" style={hubSans}>
                      {titles.get(row.nmId) ?? row.nmId}
                    </td>
                    <td className="max-w-[180px] truncate px-3 py-2 text-[12.5px]" style={{ ...hubSans, color: hub.textMuted }}>
                      {row.campaignName}
                    </td>
                    {[row.currentRub, row.competitiveRub, row.leadersRub].map((value, index) => (
                      <td key={index} className="whitespace-nowrap px-3 py-2 text-[13px]" style={{ ...hubSans, ...hubNumeric, color: hub.text }}>
                        {value != null ? formatRub(value) : "—"}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-[13px] font-semibold" style={{ ...hubSans, color: style.color }}>
                      {style.label}
                    </td>
                    <td className="px-3 py-2">
                      <HubButton
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setEditKey(editKey === rowKey ? null : rowKey);
                          setEditValue(row.competitiveRub != null ? String(row.competitiveRub) : row.currentRub != null ? String(row.currentRub) : "");
                          setEditNote(null);
                        }}
                      >
                        Изменить ставку
                      </HubButton>
                    </td>
                  </tr>
                  {editKey === rowKey ? (
                    <tr style={{ backgroundColor: hub.surfaceMuted }}>
                      <td colSpan={7} className="px-4 py-3">
                        <p className="text-[13px] leading-5" style={{ ...hubSans, color: hub.textMuted }}>
                          Новая ставка в поиске, ₽ за 1000 показов. Сейчас {row.currentRub != null ? formatRub(row.currentRub) : "не задана"}.
                          Сервер проверит минимальную ставку WB; за один шаг можно поднять не больше чем в {AD_BID_MAX_RAISE} раза.
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <HubInput
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            inputMode="decimal"
                            className="max-w-[140px]"
                            aria-label="Новая ставка, рублей"
                          />
                          {row.competitiveRub != null ? (
                            <HubButton size="sm" variant="secondary" onClick={() => setEditValue(String(row.competitiveRub))}>
                              Конкурентная {formatRub(row.competitiveRub)}
                            </HubButton>
                          ) : null}
                          {row.leadersRub != null ? (
                            <HubButton size="sm" variant="secondary" onClick={() => setEditValue(String(row.leadersRub))}>
                              Лидеров {formatRub(row.leadersRub)}
                            </HubButton>
                          ) : null}
                          <HubButton size="sm" loading={saving} disabled={!editValid || saving} onClick={() => void saveBid(row)}>
                            {editValid ? `Установить ${formatRub(editValueNumber)}` : "Введите ставку"}
                          </HubButton>
                          <HubButton size="sm" variant="secondary" disabled={saving} onClick={() => setEditKey(null)}>
                            Отмена
                          </HubButton>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          {editNote ? (
            <p className="mt-2 text-[13px] font-semibold" style={{ ...hubSans, color: hub.text }}>
              {editNote}
            </p>
          ) : null}
          <ul className="mt-2 space-y-0.5 text-[12px] leading-5" style={{ ...hubSans, color: hub.textMuted }}>
            {rows
              .filter((row) => row.verdict === "below_competitive" || row.verdict === "above_leaders")
              .map((row) => (
                <li key={`${row.advertId}-${row.nmId}-n`}>
                  {titles.get(row.nmId) ?? row.nmId}: {row.note}
                </li>
              ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
