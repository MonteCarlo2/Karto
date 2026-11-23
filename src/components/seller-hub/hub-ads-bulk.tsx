"use client";

import { useMemo, useState } from "react";
import { defaultAdCampaignName } from "@/lib/seller-hub/ads-create";
import { createSellerHubAdCampaign } from "@/lib/seller-hub/client-api";
import type { AdvisorProduct } from "@/lib/seller-hub/ads-advisor";
import type { SellerAdCampaignRow } from "@/lib/seller-hub/types";
import { Card } from "./hub-analytics-ui";
import { isRecommended, ProductPicker } from "./hub-ads-product-picker";
import { formatInt, hub, HubButton, hubSans } from "./hub-ui";

/** Максимум кампаний за один раз: каждая создаётся отдельным запросом к WB. */
const MAX_BULK = 100;

/** Пауза между созданиями, чтобы не упереться в лимит WB на частоту запросов. */
const PAUSE_MS = 800;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Result = { nmId: string; ok: boolean; message: string };

/**
 * Массовое создание «1 товар = 1 кампания»: товары показаны плитками с фото, самые выгодные для рекламы первыми.
 * Кампании создаются без запуска и без списания денег: ставку, бюджет и запуск выставляют потом, по каждой отдельно.
 */
export function HubAdsBulk({
  campaigns,
  products,
  photos,
  onCreated,
}: {
  campaigns: SellerAdCampaignRow[];
  products: AdvisorProduct[];
  photos?: Map<string, string | undefined>;
  onCreated: (rows: SellerAdCampaignRow[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Result[]>([]);

  /** Товары, которых ещё нет ни в одной живой кампании: все, а рекомендуемые (с остатком и маржой) в подборщике идут первыми. */
  const candidates = useMemo(() => {
    const advertised = new Set(campaigns.filter((c) => c.status === 4 || c.status === 9 || c.status === 11).flatMap((c) => (c.bids ?? []).map((b) => b.nmId)));
    return products.filter((p) => !advertised.has(p.nmId));
  }, [campaigns, products]);
  const recommendedCount = useMemo(() => candidates.filter(isRecommended).length, [candidates]);
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
          created.push({ id: String(result.campaignId), name, status: 4, statusLabel: "Готова к запуску", paymentType: "cpm", budget: 0, bidType: "manual", bids: [] });
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
    <Card
      title="Новые кампании"
      hint="Один товар — одна кампания. Создаются без запуска и без списания денег: ставку, бюджет и запуск вы задаёте потом."
      action={
        <HubButton variant={open ? "secondary" : "primary"} size="sm" onClick={() => setOpen((v) => !v)}>
          {open ? "Скрыть" : "Выбрать товары"}
        </HubButton>
      }
    >
      {!open ? (
        <p className="text-[15.5px] leading-[1.5]" style={{ ...hubSans, color: hub.textMuted }}>
          {candidates.length > 0 ? (
            <>
              Рекомендуем <strong style={{ color: hub.text }}>{formatInt(recommendedCount)}</strong> из {formatInt(candidates.length)} товаров без рекламы: у них есть остаток и положительная маржа. Остальные тоже можно выбрать.
            </>
          ) : (
            "У всех товаров уже есть реклама."
          )}
        </p>
      ) : (
        <div className="space-y-5">
          <ProductPicker
            products={candidates}
            photos={photos}
            selected={picked}
            onToggle={toggle}
            onSelectMany={(ids) => {
              setConfirm(false);
              setPicked(new Set(ids.slice(0, MAX_BULK)));
            }}
            disabled={busy}
            max={MAX_BULK}
          />
          <p className="text-[14px]" style={{ ...hubSans, color: hub.textSubtle }}>
            Выбрано {picked.size} из {MAX_BULK} возможных за раз
          </p>

          {picked.size > 0 ? (
            confirm ? (
              <div className="rounded-[18px] p-5" style={{ backgroundColor: "rgba(1, 20, 8, 0.045)" }}>
                <p className="max-w-[72ch] text-[15px] leading-[1.55]" style={{ ...hubSans, color: hub.text }}>
                  Будет создано кампаний: <strong>{picked.size}</strong>. Каждая: один товар, ручная ставка, оплата за показы, размещение в поиске. Деньги не спишутся, показы не начнутся, пока вы не пополните бюджет и не запустите кампанию.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <HubButton size="sm" loading={busy} onClick={() => void run()}>
                    Создать {picked.size}
                  </HubButton>
                  <HubButton size="sm" variant="ghost" disabled={busy} onClick={() => setConfirm(false)}>
                    Отмена
                  </HubButton>
                </div>
              </div>
            ) : (
              <HubButton onClick={() => setConfirm(true)}>Создать кампании ({picked.size})</HubButton>
            )
          ) : null}

          {results.length > 0 ? (
            <ul className="space-y-1 text-[14px]" style={hubSans}>
              {results.map((row) => (
                <li key={`${row.nmId}-${row.message}`} style={{ color: row.ok ? "#067A55" : hub.textMuted }}>
                  {titles.get(row.nmId) ?? row.nmId}: {row.message}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </Card>
  );
}
