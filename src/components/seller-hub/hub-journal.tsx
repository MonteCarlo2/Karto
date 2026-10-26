"use client";

import { useState } from "react";
import { readHubJournal, type HubJournalEntry } from "@/lib/seller-hub/journal";
import { hub, HubEmptyState, HubPanel, hubSans } from "./hub-ui";
import { ScrollText } from "lucide-react";

export function HubJournal() {
  const [rows] = useState<HubJournalEntry[]>(() => readHubJournal());

  if (rows.length === 0) {
    return (
      <HubPanel className="min-h-[320px]">
        <HubEmptyState
          icon={<ScrollText className="h-7 w-7" />}
          title="Журнал пуст"
          description="Здесь появятся изменения, которые вы подтвердили в карточке превью. Без подтверждения KARTO в кабинет ничего не пишет."
        />
      </HubPanel>
    );
  }

  return (
    <HubPanel>
      <div className="border-b px-5 py-4" style={{ borderColor: hub.borderSoft }}>
        <h2 className="text-[16px] font-semibold" style={hubSans}>
          Что уже применено
        </h2>
      </div>
      <ul>
        {rows.map((row) => (
          <li key={row.id} className="border-b px-5 py-4 last:border-b-0" style={{ borderColor: hub.borderSoft }}>
            <p className="text-[12px]" style={{ color: hub.textSubtle }}>
              {new Date(row.at).toLocaleString("ru-RU")} · {row.actor === "user" ? "вы подтвердили" : "сценарий"}
            </p>
            <p className="mt-1 text-[15px] font-semibold" style={{ color: hub.text }}>
              {row.title}
            </p>
            <p className="mt-1 text-[13.5px] leading-relaxed" style={{ color: hub.textMuted }}>
              {row.detail}
            </p>
          </li>
        ))}
      </ul>
    </HubPanel>
  );
}
