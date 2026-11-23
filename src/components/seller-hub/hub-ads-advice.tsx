"use client";

import { ConfirmPanel } from "./hub-confirm-panel";
import { useState } from "react";
import type { AdAdvice } from "@/lib/seller-hub/ads-advisor";
import { defaultAdCampaignName } from "@/lib/seller-hub/ads-create";
import { createSellerHubAdCampaign } from "@/lib/seller-hub/client-api";
import type { SellerAdCampaignRow } from "@/lib/seller-hub/types";
import { formatRub, hub, HubButton, hubSans } from "./hub-ui";

const KIND: Record<AdAdvice["kind"], { label: string; color: string }> = {
  budget_low: { label: "Бюджет кампании", color: "#D9912B" },
  no_orders: { label: "Расход без отдачи", color: "#C8453F" },
  margin_eaten: { label: "Реклама в минус", color: "#C8453F" },
  candidate: { label: "Точка роста", color: "#2E9E6B" },
};

/** Порядок важности для общего списка с задачами. */
export const ADVICE_RANK: Record<AdAdvice["level"], number> = { critical: 0, important: 1, opportunity: 2 };

export type AdviceActions = {
  /** Создана новая кампания: добавить её в список. */
  onCreated?: (row: SellerAdCampaignRow) => void;
  /** Открыть пополнение бюджета кампании с подставленной суммой (подтверждение там). */
  onDeposit?: (campaignId: string, sumRub: number) => void;
  /** Поставить кампанию на паузу (подтверждение в самой плитке). */
  onPause?: (campaignId: string) => Promise<void>;
  /** Убрать товар из кампании (подтверждение в самой плитке). */
  onRemoveNm?: (campaignId: string, nmId: string) => Promise<void>;
};

/** «Что сделать» разбирается на шаги по предложениям: длинный абзац превращается в короткий нумерованный список. */
function steps(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[А-ЯЁA-Z«"])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Совет по рекламе как плитка в колонке задач: метка, суть, цифры, шаги и одна кнопка.
 * Всё, что трогает кампании в WB, исполняется только после подтверждения прямо в плитке.
 */
export function AdviceTile({ item, titles, onCreated, onDeposit, onPause, onRemoveNm }: { item: AdAdvice; titles: Map<string, string> } & AdviceActions) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const style = KIND[item.kind];
  const fix = item.fix;
  const list = steps(item.action);

  /** Запись в WB: создаёт кампанию без запуска и без списания денег, только после подтверждения. */
  async function create() {
    if (busy || !item.nmId) return;
    setBusy(true);
    try {
      const name = defaultAdCampaignName(titles.get(item.nmId) ?? "");
      const res = await createSellerHubAdCampaign({ nmId: Number(item.nmId), name });
      if (res.ok) {
        setResult(`Кампания${res.campaignId ? ` №${res.campaignId}` : ""} создана и не запущена. Дальше: в «Кампании → Ставки и запросы» задайте ставку, в списке кампаний пополните бюджет и запустите.`);
        if (res.campaignId) onCreated?.({ id: String(res.campaignId), name, status: 4, statusLabel: "Готова к запуску", paymentType: "cpm", budget: 0, bidType: "manual", bids: [] });
        setConfirming(false);
      } else {
        setResult(res.error ?? "Не удалось создать кампанию");
      }
    } catch {
      setResult("Не удалось создать кампанию");
    } finally {
      setBusy(false);
    }
  }

  function confirm() {
    if (fix?.type === "pause" && onPause) {
      setBusy(true);
      void onPause(fix.campaignId).finally(() => {
        setBusy(false);
        setConfirming(false);
      });
    } else if (fix?.type === "remove_nm" && onRemoveNm) {
      setBusy(true);
      void onRemoveNm(fix.campaignId, fix.nmId).finally(() => {
        setBusy(false);
        setConfirming(false);
      });
    } else {
      void create();
    }
  }

  const buttonLabel =
    fix?.type === "deposit" && onDeposit
      ? `Пополнить на ${formatRub(fix.sumRub)}`
      : fix?.type === "pause" && onPause
        ? "Поставить на паузу"
        : fix?.type === "remove_nm" && onRemoveNm
          ? "Убрать товар из кампании"
          : item.kind === "candidate" && item.nmId
            ? "Создать тестовую кампанию"
            : null;

  return (
    <li className="mb-3 rounded-[20px] border p-4" style={{ borderColor: `color-mix(in srgb, ${style.color} 38%, white)`, background: `linear-gradient(160deg, color-mix(in srgb, ${style.color} 12%, white), ${hub.canvas} 75%)` }}>
      <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-semibold" style={{ ...hubSans, color: style.color, backgroundColor: `color-mix(in srgb, ${style.color} 14%, white)` }}>
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: style.color }} aria-hidden />
        {style.label}
      </span>
      <p className="mt-2.5 text-[16.5px] font-semibold leading-[1.35] [overflow-wrap:anywhere]" style={{ ...hubSans, color: hub.text }}>
        {item.title}
      </p>

      {item.facts.length > 0 ? (
        <ul className="mt-2.5 space-y-1.5">
          {item.facts.map((line) => (
            <li key={line} className="flex gap-2.5 text-[14px] leading-[1.5]" style={{ ...hubSans, color: hub.textMuted }}>
              <span className="mt-[8px] h-1 w-1 shrink-0 rounded-full" style={{ backgroundColor: hub.textSubtle }} aria-hidden />
              {line}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-3.5 rounded-[14px] p-3.5" style={{ backgroundColor: "rgba(1, 20, 8, 0.045)" }}>
        <p className="text-[12.5px] font-semibold" style={{ ...hubSans, color: hub.textSubtle }}>
          Что сделать
        </p>
        {list.length > 1 ? (
          <ol className="mt-2 space-y-2">
            {list.map((line, i) => (
              <li key={line} className="flex gap-2.5 text-[14px] leading-[1.5]" style={{ ...hubSans, color: hub.text }}>
                <span className="mt-[2px] flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-[11px] font-bold" style={{ backgroundColor: `color-mix(in srgb, ${style.color} 16%, white)`, color: style.color }}>
                  {i + 1}
                </span>
                {line}
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-1.5 text-[14px] leading-[1.5]" style={{ ...hubSans, color: hub.text }}>
            {item.action}
          </p>
        )}
      </div>

      {result ? (
        <p className="mt-3 rounded-[12px] px-3.5 py-2.5 text-[14px] font-semibold leading-[1.5]" style={{ ...hubSans, color: "#067A55", backgroundColor: "rgba(16, 185, 129, 0.1)" }}>
          {result}
        </p>
      ) : null}

      {confirming ? (
        <ConfirmPanel
          title={fix?.type === "pause" ? "Поставить на паузу?" : fix?.type === "remove_nm" ? "Убрать товар из кампании?" : "Создать кампанию?"}
          confirmLabel={fix?.type === "pause" ? "Поставить на паузу" : fix?.type === "remove_nm" ? "Убрать из кампании" : "Создать кампанию"}
          busy={busy}
          onConfirm={confirm}
          onCancel={() => setConfirming(false)}
          note={fix?.type === "pause" || fix?.type === "remove_nm" ? null : "Кампанию можно удалить или настроить в кабинете WB."}
        >
          {
            fix?.type === "pause"
              ? `Поставить кампанию «${fix.campaignName}» на паузу? Показы остановятся, бюджет сохранится. Запустить снова можно во вкладке «Кампании».`
              : fix?.type === "remove_nm"
                ? `Убрать этот товар из кампании «${fix.campaignName}»? Остальные товары кампании продолжат показываться. Вернуть товар можно в кабинете WB.`
                : `Будет создана кампания «${defaultAdCampaignName(titles.get(item.nmId ?? "") ?? "")}»: один товар, ручная ставка, оплата за показы, размещение в поиске. Деньги не спишутся, показы не начнутся, пока вы не пополните бюджет и не запустите кампанию.`
          }
        </ConfirmPanel>
      ) : buttonLabel && !result ? (
        <div className="mt-3.5">
          <HubButton
            variant="secondary"
            onClick={() => {
              if (fix?.type === "deposit" && onDeposit) onDeposit(fix.campaignId, fix.sumRub);
              else setConfirming(true);
            }}
          >
            {buttonLabel}
          </HubButton>
        </div>
      ) : null}
    </li>
  );
}
