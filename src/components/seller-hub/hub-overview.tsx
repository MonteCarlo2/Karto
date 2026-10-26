"use client";

import { Plug, RefreshCw } from "lucide-react";
import type { SellerHubAreaId } from "@/lib/seller-hub/nav";
import type { SellerCatalogSnapshot, SellerHubConnection } from "@/lib/seller-hub/types";
import { HubButton, HubEmptyState, HubPanel } from "./hub-ui";
import { HubHealthBoard } from "./hub-health";

export function HubOverview({
  snapshot,
  connection,
  syncing,
  onSync,
  onNavigate,
  onOpenReviews,
}: {
  snapshot?: SellerCatalogSnapshot;
  connection: SellerHubConnection;
  syncing: boolean;
  onSync: () => void;
  onNavigate: (area: SellerHubAreaId) => void;
  onOpenReviews: () => void;
}) {
  const items = snapshot?.items ?? [];
  const isConnected = connection.status === "active" && Boolean(connection.verifiedAt);
  const hasStaleSnapshot = !isConnected && items.length > 0;

  if (!isConnected || items.length === 0) {
    return (
      <HubPanel className="flex min-h-[calc(100dvh-220px)] flex-col">
        <HubEmptyState
          icon={isConnected ? <RefreshCw className="h-7 w-7" /> : <Plug className="h-7 w-7" />}
          title={
            isConnected
              ? "Кабинет подключён — осталась выгрузка"
              : hasStaleSnapshot
                ? "Кабинет не подключён"
                : "Подключите личный кабинет"
          }
          description={
            isConnected
              ? "Запустите выгрузку: KARTO соберёт заказы, продажи, остатки, рекламу и отзывы в один обзор."
              : hasStaleSnapshot
                ? "В браузере лежит прошлая выгрузка. Пока кабинет не подключён, эти цифры скрыты — иначе они выглядят как живые данные магазина."
                : "Вставьте персональный API-токен в разделе «Кабинет и API». После выгрузки здесь появятся заказы, продажи и баланс."
          }
          action={
            isConnected ? (
              <HubButton onClick={onSync} loading={syncing}>
                <RefreshCw className="h-4 w-4" />
                Выгрузить каталог
              </HubButton>
            ) : (
              <HubButton onClick={() => onNavigate("integration")}>
                <Plug className="h-4 w-4" />
                Перейти к подключению
              </HubButton>
            )
          }
        />
      </HubPanel>
    );
  }

  return (
    <HubHealthBoard snapshot={snapshot} onNavigate={onNavigate} onOpenReviews={onOpenReviews} />
  );
}
