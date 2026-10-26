"use client";

import { useState } from "react";
import { Truck } from "lucide-react";
import type { FulfillmentTab } from "@/lib/seller-hub/fulfillment-center";
import type { SellerCatalogSnapshot } from "@/lib/seller-hub/types";
import { HubActionJournal } from "./hub-action-journal";
import { ProposalRow } from "./hub-fulfillment";
import { HubToast, useHubToast, type HubToastState } from "./hub-toast";
import { hub, HubButton, HubEmptyState, HubPanel, hubSans } from "./hub-ui";
import { SUPPLY_WRITE_ENABLED } from "@/lib/seller-hub/feature-flags";
import { useFulfillment } from "./use-fulfillment";
import { HubFulfillmentThresholds } from "./hub-fulfillment-thresholds";

/**
 * Агент логистики в разделе «Агенты»: следит за заказами, поставками и остатком на своём складе.
 * Агент только предлагает; единственное действие, которое он умеет исполнять, — собрать новые заказы в поставку, и то по вашему «Да».
 * Нейросеть не используется, расходов нет.
 */
export function HubAgentsLogistics({
  snapshot,
  connected,
  onOpenFulfillment,
}: {
  snapshot?: SellerCatalogSnapshot;
  connected?: boolean;
  onOpenFulfillment: (tab: FulfillmentTab) => void;
}) {
  const data = useFulfillment(snapshot, connected);
  const [toast, setToast] = useState<HubToastState | null>(null);
  const { makeToast } = useHubToast();

  // Пока запись поставок в WB выключена (feature-flags.ts), агент только подсказывает: исполнять ему нечего.
  const doable = SUPPLY_WRITE_ENABLED ? data.proposals.filter((p) => p.buildSupply) : [];
  const advice = data.proposals.filter((p) => !doable.includes(p));

  if (!snapshot?.orders && !snapshot?.supplies) {
    return (
      <HubPanel>
        <HubEmptyState
          icon={<Truck className="h-7 w-7" />}
          title="Заказы и поставки не загружены"
          description="Агент логистики работает с заказами FBS, поставками и остатками вашего склада. Нужна категория «Маркетплейс» в API-токене и выгрузка данных."
        />
      </HubPanel>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(260px,0.7fr)]">
        <HubPanel>
          <div className="border-b px-5 py-4" style={{ borderColor: hub.borderSoft }}>
            <h2 className="text-[18px] font-semibold" style={hubSans}>
              Что агент предлагает сейчас
            </h2>
            <p className="mt-1 text-[13px]" style={{ ...hubSans, color: hub.textMuted }}>
              Он следит за заказами, поставками, остатком своего склада, скоростью отгрузки и расходами на логистику и подсказывает, на что обратить внимание. В кабинете WB он ничего не меняет.
            </p>
          </div>
          {data.proposals.length === 0 ? (
            <p className="px-5 py-5 text-[14px]" style={{ ...hubSans, color: hub.green }}>
              Сейчас предложений нет: срочного по логистике не видно.
            </p>
          ) : (
            <>
              {doable.length > 0 ? (
                <>
                  <p className="px-5 pt-3 text-[12px] font-semibold uppercase tracking-[0.06em]" style={{ ...hubSans, color: hub.textSubtle }}>
                    Агент может сделать сам, по вашему «Да»
                  </p>
                  <ul className="divide-y" style={{ borderColor: hub.borderSoft }}>
                    {doable.map((p) => (
                      <ProposalRow key={p.id} proposal={p} connected={Boolean(connected)} onOpen={onOpenFulfillment} onBuilt={(message, ok) => setToast(makeToast(message, ok ? "ok" : "error"))} />
                    ))}
                  </ul>
                </>
              ) : null}
              {advice.length > 0 ? (
                <>
                  <p className="border-t px-5 pt-3 text-[12px] font-semibold uppercase tracking-[0.06em]" style={{ ...hubSans, color: hub.textSubtle, borderColor: hub.borderSoft }}>
                    Рекомендации вам
                  </p>
                  <ul className="divide-y" style={{ borderColor: hub.borderSoft }}>
                    {advice.map((p) => (
                      <ProposalRow key={p.id} proposal={p} connected={Boolean(connected)} onOpen={onOpenFulfillment} onBuilt={(message, ok) => setToast(makeToast(message, ok ? "ok" : "error"))} />
                    ))}
                  </ul>
                </>
              ) : null}
            </>
          )}
        </HubPanel>

        <HubPanel>
          <div className="space-y-4 px-5 py-4">
            <h2 className="text-[18px] font-semibold" style={hubSans}>
              Правила агента
            </h2>
            <HubFulfillmentThresholds data={data} />
            <ul className="space-y-1.5 text-[12.5px] leading-5" style={{ ...hubSans, color: hub.textMuted }}>
              <li>Режим: только подсказки. Поставки, QR, стикеры и отмены вы делаете в кабинете Wildberries.</li>
            </ul>
            <HubButton size="sm" variant="secondary" onClick={() => onOpenFulfillment("orders")}>
              Открыть «Заказы и логистику»
            </HubButton>
          </div>
        </HubPanel>
      </div>
      <HubActionJournal />
      {toast ? <HubToast toast={toast} onDismiss={() => setToast(null)} /> : null}
    </div>
  );
}
