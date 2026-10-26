"use client";

import { useMemo, useState } from "react";
import { defaultAdCampaignName } from "@/lib/seller-hub/ads-create";
import { createSellerHubAdCampaign } from "@/lib/seller-hub/client-api";
import type { AdvisorProduct } from "@/lib/seller-hub/ads-advisor";
import type { SellerAdCampaignRow } from "@/lib/seller-hub/types";
import { formatInt, formatRub, hub, HubButton, hubNumeric, hubSans } from "./hub-ui";

/** Максимум кампаний за один раз: каждая создаётся отдельным запросом к WB. */
const MAX_BULK = 100;

/** Пауза между созданиями, чтобы не упереться в лимит WB на частоту запросов. */
const PAUSE_MS = 800;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Result = { nmId: string; ok: boolean; message: string };

/**
 * Массовое создание «1 товар = 1 кампания»: кампании создаются без запуска и без списания денег.
 * Ставка, бюджет и запуск выставляются потом, по каждой кампании отдельно и с подтверждением.
 */
export function HubAdsBulk({
  campaigns,
  products,
  onCreated,
}: {
  campaigns: SellerAdCampaignRow[];
  products: AdvisorProduct[];
  onCreated: (rows: SellerAdCampaignRow[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Result[]>([]);

  /** Товары, которых ещё нет ни в одной живой кампании, с маржой и остатком: для них реклама имеет смысл. */
  const candidates = useMemo(() => {
    const advertised = new Set(
      campaigns.filter((c) => c.status === 4 || c.status === 9 || c.status === 11).flatMap((c) => (c.bids ?? []).map((b) => b.nmId)),
    );
    return products
      .filter((p) => !advertised.has(p.nmId) && p.marginRub != null && p.marginRub > 0 && p.stock != null && p.stock > 0)
      .sort((a, b) => (b.marginRub ?? 0) - (a.marginRub ?? 0));
  }, [campaigns, products]);

  const titles = useMemo(() => new Map(products.map((p) => [p.nmId, p.title])), [products]);

  function toggle(nmId: string) {
    setConfirm(false);
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(nmId)) next.delete(nmId);
      else if (next.size < MAX_BULK) next.add(nmId);
      return next;
    });
  }

  /** Запись в WB: создаёт по кампании на каждый выбранный товар, только после подтверждения. Ошибка одной не останавливает остальные. */
  async function run() {
    if (busy || picked.size === 0) return;
    setBusy(true);
    setResults([]);
    const created: SellerAdCampaignRow[] = [];
    const out: Result[] = [];
    let limited = 0;
    for (const nmId of picked) {
      const name = defaultAdCampaignName(titles.get(nmId) ?? "");
      try {
        const result = await createSellerHubAdCampaign({ nmId: Number(nmId), name });
        if (result.ok && result.campaignId) {
          created.push({
            id: String(result.campaignId),
            name,
            status: 4,
            statusLabel: "Готова к запуску",
            paymentType: "cpm",
            budget: 0,
            bidType: "manual",
            bids: [],
          });
          out.push({ nmId, ok: true, message: `Кампания №${result.campaignId}` });
        } else {
          out.push({ nmId, ok: result.ok, message: result.error ?? "Кампания создана" });
        }
      } catch {
        out.push({ nmId, ok: false, message: "Не удалось создать кампанию" });
      }
      setResults([...out]);
      // Лимит WB: после трёх подряд отказов по частоте останавливаемся, остальные можно создать позже.
      limited = /ограничил|лимит|429/i.test(out[out.length - 1]?.message ?? "") && !out[out.length - 1]?.ok ? limited + 1 : 0;
      if (limited >= 3) {
        out.push({ nmId: "", ok: false, message: "WB ограничил частоту запросов: остальные кампании создайте позже, выбор сохранится" });
        setResults([...out]);
        break;
      }
      await sleep(PAUSE_MS);
    }
    if (created.length > 0) onCreated(created);
    setPicked(new Set());
    setConfirm(false);
    setBusy(false);
  }

  return (
    <div className="rounded-2xl p-4" style={{ backgroundColor: hub.surface }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[13.5px] font-semibold" style={{ ...hubSans, color: hub.text }}>
            Создать кампании для нескольких товаров
          </p>
          <p className="text-[12px] leading-5" style={{ ...hubSans, color: hub.textSubtle }}>
            Один товар = одна кампания. Кампании создаются без запуска и без списания денег: ставку, бюджет и запуск вы
            задаёте потом по каждой отдельно.
          </p>
        </div>
        <HubButton variant="secondary" size="sm" onClick={() => setOpen((v) => !v)}>
          {open ? "Скрыть" : "Выбрать товары"}
        </HubButton>
      </div>

      {open ? (
        <div className="mt-3 space-y-3">
          {candidates.length === 0 ? (
            <p className="text-[13px]" style={{ ...hubSans, color: hub.textMuted }}>
              Нет товаров, подходящих для новой кампании: у всех уже есть реклама, нет остатка или нет положительной маржи.
            </p>
          ) : (
            <div className="max-h-[360px] overflow-auto">
              <table className="min-w-full border-collapse text-left">
                <thead style={{ backgroundColor: hub.surfaceMuted }}>
                  <tr>
                    {["", "Товар", "Маржа с продажи", "Остаток", "Заказов за 28 дн."].map((label) => (
                      <th
                        key={label}
                        className="border-b px-3 py-2 text-[11.5px] font-bold uppercase tracking-[0.06em]"
                        style={{ ...hubSans, color: hub.textSubtle, borderColor: hub.borderSoft }}
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((p) => (
                    <tr key={p.nmId} className="border-b" style={{ borderColor: hub.borderSoft }}>
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={picked.has(p.nmId)}
                          disabled={busy || (!picked.has(p.nmId) && picked.size >= MAX_BULK)}
                          onChange={() => toggle(p.nmId)}
                          aria-label={`Выбрать ${p.title}`}
                        />
                      </td>
                      <td className="max-w-[320px] truncate px-3 py-2 text-[13px] font-medium" style={hubSans}>
                        {p.title}
                      </td>
                      {[
                        p.marginRub != null ? formatRub(p.marginRub) : "—",
                        p.stock != null ? `${formatInt(p.stock)} шт.` : "—",
                        p.orders28 != null ? formatInt(p.orders28) : "—",
                      ].map((cell, index) => (
                        <td key={index} className="whitespace-nowrap px-3 py-2 text-[13px]" style={{ ...hubSans, ...hubNumeric, color: hub.text }}>
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {picked.size > 0 ? (
            confirm ? (
              <div className="space-y-2">
                <p className="text-[12.5px] leading-5" style={{ ...hubSans, color: hub.text }}>
                  Будет создано кампаний: {picked.size}. Каждая: один товар, ручная ставка, оплата за показы, размещение в
                  поиске. Деньги не спишутся, показы не начнутся, пока вы не пополните бюджет и не запустите кампанию.
                </p>
                <div className="flex flex-wrap gap-2">
                  <HubButton size="sm" loading={busy} onClick={() => void run()}>
                    Создать {picked.size}
                  </HubButton>
                  <HubButton size="sm" variant="secondary" disabled={busy} onClick={() => setConfirm(false)}>
                    Отмена
                  </HubButton>
                </div>
              </div>
            ) : (
              <HubButton size="sm" onClick={() => setConfirm(true)}>
                Создать кампании ({picked.size})
              </HubButton>
            )
          ) : null}
          {candidates.length > 0 ? (
            <p className="text-[12px]" style={{ ...hubSans, color: hub.textSubtle }}>
              Выбрано {picked.size} из {MAX_BULK} возможных за раз.
            </p>
          ) : null}
          {results.length > 0 ? (
            <ul className="space-y-0.5 text-[12.5px]" style={hubSans}>
              {results.map((row) => (
                <li key={row.nmId} style={{ color: row.ok ? hub.greenDark : hub.danger }}>
                  {titles.get(row.nmId) ?? row.nmId}: {row.message}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
