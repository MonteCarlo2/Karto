"use client";

import { AlertTriangle } from "lucide-react";
import type { SellerBlockedCards } from "@/lib/seller-hub/types";
import { formatInt, hub, HubPanel, hubSans } from "./hub-ui";

/**
 * Риски, о которых сообщает сам WB: заблокированные карточки. Пока карточка заблокирована, она не продаёт совсем,
 * поэтому такое сообщение стоит выше любых задач. Исправить блокировку через API нельзя: показываем причину и что делать.
 */
export function HubTasksRisks({ blocked }: { blocked: SellerBlockedCards | null }) {
  if (!blocked || blocked.cards.length === 0) return null;
  const shown = blocked.cards.slice(0, 5);
  return (
    <HubPanel className="px-5 py-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" style={{ color: hub.danger }} />
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold" style={{ ...hubSans, color: hub.text }}>
            WB заблокировал карточек: {formatInt(blocked.cards.length)}
          </h2>
          <p className="mt-1 text-[13px] leading-5" style={{ ...hubSans, color: hub.textMuted }}>
            Пока карточка заблокирована, она не продаётся. Исправьте причину и отправьте карточку на повторную проверку в
            кабинете WB (в API такого действия нет).
          </p>
          <ul className="mt-3 space-y-2">
            {shown.map((card) => (
              <li key={card.nmId} className="text-[13px] leading-5" style={hubSans}>
                <span className="font-medium" style={{ color: hub.text }}>
                  {card.title || card.vendorCode || card.nmId}
                </span>
                <span style={{ color: hub.textSubtle }}> · {card.nmId}</span>
                <br />
                <span style={{ color: hub.danger }}>{card.reason ?? "Причина не указана"}</span>
              </li>
            ))}
          </ul>
          {blocked.cards.length > shown.length ? (
            <p className="mt-2 text-[12.5px]" style={{ ...hubSans, color: hub.textSubtle }}>
              И ещё {formatInt(blocked.cards.length - shown.length)} в отчёте WB.
            </p>
          ) : null}
        </div>
      </div>
    </HubPanel>
  );
}
