"use client";

import { useState, type ReactNode } from "react";
import { ArrowRight, Bot, Package } from "lucide-react";
import { SUPPLY_WRITE_ENABLED } from "@/lib/seller-hub/feature-flags";
import { buildSupplyFromOrders } from "@/lib/seller-hub/fbs-exec";
import { ruPlural } from "@/lib/seller-hub/task-engine/ru-plural";
import type { FulfillmentProposal, FulfillmentTab } from "@/lib/seller-hub/fulfillment-center";
import type { SellerCatalogSnapshot } from "@/lib/seller-hub/types";
import { hub, HubButton, HubPanel, HubSegmented, hubSans } from "./hub-ui";
import { HubToast, useHubToast, type HubToastState } from "./hub-toast";
import { useFulfillment } from "./use-fulfillment";
import { HubFulfillmentThresholds } from "./hub-fulfillment-thresholds";

export type { FulfillmentTab };
export type FulfillmentData = ReturnType<typeof useFulfillment>;

const LEVEL_TONE = {
  action: { bar: "#E5484D", label: "Сделать", color: hub.danger, bg: hub.dangerSoft },
  watch: { bar: "#E6A23C", label: "Присмотреться", color: hub.warn, bg: hub.warnSoft },
  info: { bar: "#2F6FED", label: "К сведению", color: hub.blue, bg: hub.blueSoft },
} as const;

const SHOWN = 4;

export function ProposalRow({
  proposal,
  connected,
  onOpen,
  onBuilt,
}: {
  proposal: FulfillmentProposal;
  connected: boolean;
  onOpen: (tab: FulfillmentTab) => void;
  onBuilt: (message: string, ok: boolean) => void;
}) {
  const tone = LEVEL_TONE[proposal.level];
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  /** Поставка уже создана отсюда: повторное нажатие создало бы вторую поставку с теми же заказами, пока снимок не обновился. */
  const [createdId, setCreatedId] = useState<string | null>(null);
  const build = proposal.buildSupply && proposal.buildSupply.orderIds.length > 0 ? proposal.buildSupply : null;

  async function run() {
    if (!build || busy || createdId) return;
    setBusy(true);
    try {
      const res = await buildSupplyFromOrders(build.orderIds);
      // Даже при частичной неудаче поставка в WB уже есть: блокируем повтор, номер указан в сообщении.
      if (res.supplyId) setCreatedId(res.supplyId);
      onBuilt(res.ok ? `Поставка ${res.supplyId} создана, заказов в ней: ${res.added}. Передайте её в доставку во вкладке «Поставки».` : (res.error ?? "Не удалось создать поставку"), res.ok);
    } catch (e) {
      onBuilt(e instanceof Error ? e.message : "Не удалось создать поставку", false);
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  }

  return (
    <li className="flex gap-3 px-5 py-3 sm:px-6">
      <span className="mt-1 h-auto w-1 shrink-0 rounded-full" style={{ backgroundColor: tone.bar }} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[14px] font-semibold leading-5" style={{ ...hubSans, color: hub.text }}>
            {proposal.title}
          </p>
          <span className="rounded-full px-2 py-px text-[11px] font-semibold" style={{ ...hubSans, color: tone.color, backgroundColor: tone.bg }}>
            {tone.label}
          </span>
        </div>
        <p className="mt-0.5 text-[13px] leading-5" style={{ ...hubSans, color: hub.textMuted }}>
          {proposal.detail}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {build && connected && SUPPLY_WRITE_ENABLED && createdId ? (
            <span className="text-[12.5px] font-medium" style={{ ...hubSans, color: hub.green }}>
              Поставка {createdId} создана. Обновите данные, чтобы список заказов пересчитался.
            </span>
          ) : build && connected && SUPPLY_WRITE_ENABLED ? (
            confirm ? (
              <>
                <span className="text-[12.5px]" style={{ ...hubSans, color: hub.text }}>
                  Создать поставку и добавить {build.orderIds.length} {ruPlural(build.orderIds.length, "заказ", "заказа", "заказов")}?
                </span>
                <HubButton size="sm" loading={busy} onClick={() => void run()}>
                  Да, создать
                </HubButton>
                <HubButton size="sm" variant="ghost" onClick={() => setConfirm(false)}>
                  Нет
                </HubButton>
              </>
            ) : (
              <HubButton size="sm" onClick={() => setConfirm(true)}>
                <Package className="h-3.5 w-3.5" />
                Собрать поставку ({build.orderIds.length})
              </HubButton>
            )
          ) : null}
          {proposal.tab ? (
            <HubButton size="sm" variant="ghost" onClick={() => onOpen(proposal.tab!)}>
              Открыть
              <ArrowRight className="h-3.5 w-3.5" />
            </HubButton>
          ) : null}
        </div>
      </div>
    </li>
  );
}

/** Объединённый раздел «Заказы и логистика»: сверху что сделать сейчас, ниже вкладки (заказы, поставки, склады и регионы). */
export function HubFulfillment({
  tab,
  onTab,
  snapshot,
  connected,
  onOpenAgents,
  children,
}: {
  tab: FulfillmentTab;
  onTab: (tab: FulfillmentTab) => void;
  snapshot?: SellerCatalogSnapshot;
  connected?: boolean;
  onOpenAgents?: () => void;
  children: (data: FulfillmentData) => ReactNode;
}) {
  const data = useFulfillment(snapshot, connected);
  const [showAll, setShowAll] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toast, setToast] = useState<HubToastState | null>(null);
  const { makeToast } = useHubToast();
  const proposals = showAll ? data.proposals : data.proposals.slice(0, SHOWN);
  const hasData = Boolean(snapshot?.orders || snapshot?.supplies);

  return (
    <div className="space-y-4">
      {hasData ? (
        <HubPanel>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3 sm:px-6" style={{ borderColor: hub.borderSoft }}>
            <div>
              <h2 className="text-[16px] font-semibold" style={{ ...hubSans, color: hub.text }}>
                Что сделать сейчас
              </h2>
              <p className="text-[12px]" style={{ ...hubSans, color: hub.textSubtle }}>
                По заказам, поставкам и остаткам вашего кабинета. Сроков WB здесь нет: пороги ваши.
              </p>
            </div>
            <div className="flex items-center gap-1">
              <HubButton size="sm" variant="ghost" onClick={() => setSettingsOpen((v) => !v)}>
                Пороги
              </HubButton>
              {onOpenAgents ? (
                <HubButton size="sm" variant="ghost" onClick={onOpenAgents}>
                  <Bot className="h-3.5 w-3.5" />
                  Настроить агента в разделе Агенты
                </HubButton>
              ) : null}
            </div>
          </div>
          {settingsOpen ? (
            <div className="flex flex-wrap items-end gap-4 border-b px-5 py-3 sm:px-6" style={{ borderColor: hub.borderSoft, backgroundColor: hub.surfaceMuted }}>
              <HubFulfillmentThresholds data={data} />
            </div>
          ) : null}
          {data.proposals.length === 0 ? (
            <p className="px-5 py-4 text-[13.5px] sm:px-6" style={{ ...hubSans, color: hub.green }}>
              Срочного нет: неотгруженных заказов, забытых поставок и рисков по своему складу не видно.
            </p>
          ) : (
            <ul className="divide-y" style={{ borderColor: hub.borderSoft }}>
              {proposals.map((p) => (
                <ProposalRow
                  key={p.id}
                  proposal={p}
                  connected={Boolean(connected)}
                  onOpen={onTab}
                  onBuilt={(message, ok) => setToast(makeToast(message, ok ? "ok" : "error"))}
                />
              ))}
            </ul>
          )}
          {data.proposals.length > SHOWN ? (
            <div className="border-t px-5 py-2 sm:px-6" style={{ borderColor: hub.borderSoft }}>
              <HubButton size="sm" variant="ghost" onClick={() => setShowAll((v) => !v)}>
                {showAll ? "Свернуть" : `Показать все (${data.proposals.length})`}
              </HubButton>
            </div>
          ) : null}
        </HubPanel>
      ) : null}

      <div className="rounded-2xl border px-3 py-2.5" style={{ borderColor: hub.border, backgroundColor: hub.surface }}>
        <HubSegmented<FulfillmentTab>
          layoutId="fulfillment-tabs"
          value={tab}
          onChange={onTab}
          options={[
            { id: "orders", label: "Заказы и сборка" },
            { id: "deliveries", label: "Поставки" },
            { id: "logistics", label: "Склады и регионы" },
          ]}
        />
      </div>
      {children(data)}
      {toast ? <HubToast toast={toast} onDismiss={() => setToast(null)} /> : null}
    </div>
  );
}
