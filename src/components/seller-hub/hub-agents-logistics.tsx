"use client";

import { useState } from "react";
import { ArrowUpRight, Check, Truck } from "lucide-react";
import type { FulfillmentTab } from "@/lib/seller-hub/fulfillment-center";
import type { SellerCatalogSnapshot } from "@/lib/seller-hub/types";
import { ProposalRow } from "./hub-fulfillment";
import { PanelEmpty, PanelGroup, PanelNumber, PanelRow, PanelSection } from "./hub-agents-panel";
import { HubToast, useHubToast, type HubToastState } from "./hub-toast";
import { hub, HubEmptyState, hubSans } from "./hub-ui";
import { SUPPLY_WRITE_ENABLED } from "@/lib/seller-hub/feature-flags";
import { useFulfillment } from "./use-fulfillment";

/**
 * Агент логистики в разделе «Агенты»: следит за заказами, поставками и остатком на своём складе.
 * Агент только предлагает; единственное действие, которое он умеет исполнять, — собрать новые заказы в поставку, и то по вашему «Да».
 * Нейросеть не используется, расходов нет.
 */
export function HubAgentsLogistics({
  snapshot,
  connected,
  onOpenFulfillment,
  remindersOnly,
}: {
  snapshot?: SellerCatalogSnapshot;
  connected?: boolean;
  onOpenFulfillment: (tab: FulfillmentTab) => void;
  /** Только настройки напоминаний (без списка предложений): для окна настроек. */
  remindersOnly?: boolean;
}) {
  const data = useFulfillment(snapshot, connected);
  const [toast, setToast] = useState<HubToastState | null>(null);
  const { makeToast } = useHubToast();

  // Пока запись поставок в WB выключена (feature-flags.ts), агент только подсказывает: исполнять ему нечего.
  const doable = SUPPLY_WRITE_ENABLED ? data.proposals.filter((p) => p.buildSupply) : [];
  const advice = data.proposals.filter((p) => !doable.includes(p));

  if (!remindersOnly && !snapshot?.orders && !snapshot?.supplies) {
    return (
      <HubEmptyState
        icon={<Truck className="h-6 w-6" />}
        title="Заказы и поставки не загружены"
        description="Агент работает с заказами FBS, поставками и остатками вашего склада. Нужна категория «Маркетплейс» в API-токене и выгрузка данных."
      />
    );
  }

  const rows = (list: typeof data.proposals) => (
    <ul>
      {list.map((p) => (
        <ProposalRow key={p.id} proposal={p} connected={Boolean(connected)} onOpen={onOpenFulfillment} onBuilt={(message, ok) => setToast(makeToast(message, ok ? "ok" : "error"))} />
      ))}
    </ul>
  );

  return (
    <div className="space-y-9">
      {!remindersOnly && data.proposals.length === 0 ? (
        <PanelEmpty>
          <span className="flex items-center gap-2">
            <Check className="h-4 w-4 shrink-0" style={{ color: hub.greenDark }} strokeWidth={2.5} aria-hidden />
            Срочного по логистике не видно.
          </span>
        </PanelEmpty>
      ) : null}

      {!remindersOnly && doable.length > 0 ? (
        <PanelSection title="Можно сделать по вашему «Да»">{rows(doable)}</PanelSection>
      ) : null}
      {!remindersOnly && advice.length > 0 ? (
        <PanelSection title="Рекомендации вам" hint="Агент это сделать не может: решение остаётся за вами.">
          {rows(advice)}
        </PanelSection>
      ) : null}

      <PanelSection title="Когда напоминать">
        <PanelGroup>
          <PanelRow title="Об отгрузке через" hint="Сколько часов ждать до напоминания" control={<PanelNumber label="Напомнить об отгрузке через, часов" unit="ч" value={data.remindHours} min={1} max={168} onCommit={data.setRemindHours} />} />
          <PanelRow title="Вечерняя отправка с" hint="Час по Москве, 24 — выключено" control={<PanelNumber label="Вечерняя отправка с, часа" unit="ч" value={data.eveningHour} min={0} max={24} onCommit={data.setEveningHour} />} />
          <PanelRow title="Мало своего запаса" hint="Предупредить, если запаса меньше" control={<PanelNumber label="Предупреждать, если запаса меньше, дней" unit="дн." value={data.coverDays} min={1} max={60} onCommit={data.setCoverDays} />} />
        </PanelGroup>
        <p className="px-0.5 text-[12.5px] leading-5" style={{ ...hubSans, color: hub.textSubtle }}>
          Только подсказки: поставки, QR, стикеры и отмены вы делаете в кабинете Wildberries.
        </p>
      </PanelSection>

      {remindersOnly ? null : (
      <button type="button" onClick={() => onOpenFulfillment("orders")} className="group/link inline-flex items-center gap-1.5 rounded-lg text-[14px] font-medium underline-offset-4 outline-none hover:underline focus-visible:shadow-[0_0_0_2px_var(--hub-lime-ring)]" style={{ ...hubSans, color: hub.text }}>
        Открыть «Заказы и логистику»
        <ArrowUpRight className="h-4 w-4 transition-transform duration-150 group-hover/link:-translate-y-px group-hover/link:translate-x-px" aria-hidden />
      </button>
      )}
      {toast ? <HubToast toast={toast} onDismiss={() => setToast(null)} /> : null}
    </div>
  );
}
