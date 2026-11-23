"use client";

import { useEffect, useMemo, useState } from "react";
import { compareBids, type BidRow } from "@/lib/seller-hub/ads-bids";
import { changeSellerHubAdBid, loadSellerHubAdBidRecommendations } from "@/lib/seller-hub/client-api";
import { AD_BID_MAX_RAISE } from "@/lib/seller-hub/ads-bid";
import type { SellerAdBidRecommendation, SellerAdCampaignRow } from "@/lib/seller-hub/types";
import { Thumb } from "./hub-fulfillment-ui";
import { HelpTip } from "./hub-help-tip";
import { formatRub, hub, HubButton, HubInput, hubSans } from "./hub-ui";

const VERDICT_STYLE: Record<BidRow["verdict"], { label: string; color: string }> = {
  below_competitive: { label: "Ниже конкурентной", color: "#B8741A" },
  between: { label: "В норме", color: "#067A55" },
  above_leaders: { label: "Выше лидеров", color: "#B8741A" },
  no_data: { label: "Нет данных", color: hub.textSubtle },
};

/** Максимум пар «кампания — артикул» за один запрос рекомендаций (лимит WB 5 запросов в минуту). */
const MAX_PAIRS = 12;

const MONO = { fontFamily: "var(--font-geist-mono), ui-monospace, monospace", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.04em" } as const;
const GRID = "md:grid-cols-[minmax(0,2.2fr)_repeat(3,minmax(96px,1fr))_minmax(150px,1.1fr)_auto]";

/** Ставки по товарам: текущая и рекомендованные WB. Строки с разделителями, подписанные колонки; запись в WB только после ввода и нажатия. */
export function HubAdsBids({
  campaigns,
  titles,
  photos,
}: {
  campaigns: SellerAdCampaignRow[];
  titles: Map<string, string>;
  photos?: Map<string, string | undefined>;
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
    <div>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[22px] font-semibold leading-7 tracking-[-0.02em]" style={{ ...hubSans, color: hub.text }}>
            Ставки по товарам
            <HelpTip title="Как читать ставки" align="left">
              <p>Ставка — сколько вы платите за 1000 показов в поиске. «Конкурентная» и «Лидеров» — ориентиры WB.</p>
              <p className="mt-2">Ниже конкурентной: показов будет меньше. Выше лидеров: показов больше, но вы платите больше, чем нужно для первых мест.</p>
            </HelpTip>
          </div>
          <p className="mt-1 text-[15.5px] leading-[1.5]" style={{ ...hubSans, color: hub.textMuted }}>
            Что вы платите и что советует WB.
            {allPairs.length > MAX_PAIRS ? ` Показаны первые ${MAX_PAIRS} из ${allPairs.length}: так ограничивает WB.` : ""}
          </p>
        </div>
        <HubButton variant="secondary" loading={loading} onClick={() => void load(recommendations != null)}>
          {recommendations ? "Обновить" : "Загрузить ставки"}
        </HubButton>
      </div>
      {error ? (
        <p className="mt-3 text-[15px]" style={{ ...hubSans, color: hub.danger }}>
          {error}
        </p>
      ) : null}
      {editNote ? (
        <p className="mt-3 text-[15px] font-semibold" style={{ ...hubSans, color: hub.text }}>
          {editNote}
        </p>
      ) : null}
      {rows.length > 0 ? (
        <div className="mt-5">
          <div className={`hidden gap-x-4 border-b pb-3 text-[14px] md:grid ${GRID}`} style={{ ...hubSans, color: hub.textSubtle, borderColor: "rgba(1, 20, 8, 0.14)" }}>
            <span>Товар и кампания</span>
            <span>Ставка сейчас</span>
            <span>Конкурентная</span>
            <span>Лидеров</span>
            <span>Оценка</span>
            <span aria-hidden className="w-[120px]" />
          </div>
          <ul className="divide-y" style={{ borderColor: "rgba(1, 20, 8, 0.1)" }}>
            {rows.map((row) => {
              const style = VERDICT_STYLE[row.verdict];
              const rowKey = `${row.advertId}:${row.nmId}`;
              const open = editKey === rowKey;
              const flagged = row.verdict === "below_competitive" || row.verdict === "above_leaders";
              return (
                <li key={rowKey} className="py-4" style={{ borderColor: "rgba(1, 20, 8, 0.1)" }}>
                  <div className={`grid items-center gap-x-4 gap-y-3 ${GRID}`}>
                    <div className="flex min-w-0 items-center gap-3.5">
                      <Thumb src={photos?.get(row.nmId)} className="h-[60px] w-[45px]" />
                      <div className="min-w-0">
                        <p className="line-clamp-2 text-[16px] font-semibold leading-[1.3]" style={{ ...hubSans, color: hub.text }}>
                          {titles.get(row.nmId) ?? row.nmId}
                        </p>
                        <p className="mt-0.5 truncate text-[14px]" style={{ ...hubSans, color: hub.textSubtle }}>
                          {row.campaignName}
                        </p>
                      </div>
                    </div>
                    {[
                      ["Ставка сейчас", row.currentRub, true],
                      ["Конкурентная", row.competitiveRub, false],
                      ["Лидеров", row.leadersRub, false],
                    ].map(([label, value, strong]) => (
                      <p key={String(label)} className="flex items-baseline justify-between gap-3 md:block" style={MONO}>
                        <span className="text-[13.5px] md:hidden" style={{ ...hubSans, letterSpacing: 0, color: hub.textSubtle }}>
                          {String(label)}
                        </span>
                        <span className="text-[19px]" style={{ color: strong ? hub.text : hub.textMuted, fontWeight: strong ? 600 : 500 }}>
                          {typeof value === "number" ? formatRub(value) : "—"}
                        </span>
                      </p>
                    ))}
                    <p className="flex items-center gap-2 text-[15.5px] font-semibold" style={{ ...hubSans, color: style.color }}>
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: style.color }} aria-hidden />
                      {style.label}
                    </p>
                    <div className="md:w-[120px] md:text-right">
                      <HubButton
                        size="sm"
                        variant={open ? "ghost" : "secondary"}
                        onClick={() => {
                          setEditKey(open ? null : rowKey);
                          setEditValue(row.competitiveRub != null ? String(row.competitiveRub) : row.currentRub != null ? String(row.currentRub) : "");
                          setEditNote(null);
                        }}
                      >
                        {open ? "Закрыть" : "Изменить"}
                      </HubButton>
                    </div>
                  </div>
                  {flagged ? (
                    <p className="mt-2 max-w-[78ch] text-[14.5px] leading-[1.5]" style={{ ...hubSans, color: hub.textMuted }}>
                      {row.note}
                    </p>
                  ) : null}
                  {open ? (
                    <div className="mt-4 rounded-[18px] p-5" style={{ backgroundColor: "rgba(1, 20, 8, 0.045)" }}>
                      <p className="text-[15.5px] font-semibold" style={{ ...hubSans, color: hub.text }}>
                        Новая ставка в поиске, ₽ за 1000 показов
                      </p>
                      <p className="mt-1 max-w-[70ch] text-[14.5px] leading-[1.5]" style={{ ...hubSans, color: hub.textMuted }}>
                        Сейчас {row.currentRub != null ? formatRub(row.currentRub) : "не задана"}. WB проверит минимальную ставку; за один шаг можно поднять не больше чем в {AD_BID_MAX_RAISE} раза.
                      </p>
                      <div className="mt-4 flex flex-wrap items-center gap-2.5">
                        <HubInput value={editValue} onChange={(e) => setEditValue(e.target.value)} inputMode="decimal" className="w-36" aria-label="Новая ставка, рублей" />
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
                      </div>
                      <div className="mt-4 flex flex-wrap items-center gap-2.5">
                        <HubButton loading={saving} disabled={!editValid || saving} onClick={() => void saveBid(row)}>
                          {editValid ? `Установить ${formatRub(editValueNumber)}` : "Введите ставку"}
                        </HubButton>
                        <HubButton variant="ghost" disabled={saving} onClick={() => setEditKey(null)}>
                          Отмена
                        </HubButton>
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
