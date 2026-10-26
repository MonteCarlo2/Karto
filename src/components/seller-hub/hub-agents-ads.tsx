"use client";

import { useMemo } from "react";
import type { SellerAdCampaignRow, SellerCatalogSnapshot } from "@/lib/seller-hub/types";
import { useAdsData } from "./hub-ads-data";
import { HubAdsAgent } from "./hub-ads-agent";
import { HubEmptyState, HubPanel } from "./hub-ui";
import { Megaphone } from "lucide-react";

/**
 * Агент рекламы внутри раздела «Агенты»: правила, очередь предложений и журнал.
 * Данные рекламы читаются так же, как в «Продвижении», поэтому цифры в предложениях совпадают с теми, что видны в разделе рекламы.
 */
export function HubAgentsAds({
  snapshot,
  connected,
  onAdsUpdate,
}: {
  snapshot?: SellerCatalogSnapshot;
  connected?: boolean;
  onAdsUpdate?: (campaigns: SellerAdCampaignRow[]) => void;
}) {
  const campaigns = useMemo(() => snapshot?.ads?.campaigns ?? [], [snapshot?.ads]);
  const data = useAdsData({ campaigns, snapshot, connected });

  if (!snapshot?.ads || campaigns.length === 0) {
    return (
      <HubPanel>
        <HubEmptyState
          icon={<Megaphone className="h-7 w-7" />}
          title="Рекламные кампании не загружены"
          description="Агент рекламы работает с кампаниями вашего кабинета. После выгрузки данных здесь появятся правила и предложения. Нужна категория «Продвижение» в API-токене."
        />
      </HubPanel>
    );
  }

  return <HubAdsAgent data={data} campaigns={campaigns} accountRub={snapshot.ads.accountNet ?? null} onCampaignsUpdate={(rows) => onAdsUpdate?.(rows)} variant="full" />;
}
