"use client";

import { useEffect, useMemo, useState } from "react";
import { ScrollText } from "lucide-react";
import { ACTION_LABEL } from "@/lib/seller-hub/action-labels";
import { loadSellerHubActionLog, type ActionLogRow } from "@/lib/seller-hub/client-api";
import { readHubJournal } from "@/lib/seller-hub/journal";
import { hub, HubBadge, HubEmptyState, HubPanel, HubPanelHeader, hubSans } from "./hub-ui";

type Row = { id: string; at: string; title: string; detail: string; tone: "ok" | "danger" | "neutral"; who: string };

/** Кратко о запросе: только понятные поля, без технических деталей. */
function requestDetail(row: ActionLogRow): string {
  const r = (row.request && typeof row.request === "object" ? row.request : {}) as Record<string, unknown>;
  const parts: string[] = [];
  if (row.target_id != null) parts.push(`кампания ${row.target_id}`);
  if (row.nm_id != null) parts.push(`артикул ${row.nm_id}`);
  if (typeof r.sum === "number") parts.push(`${r.sum.toLocaleString("ru-RU")} ₽`);
  if (typeof r.count === "number") parts.push(`позиций: ${r.count}`);
  if (typeof r.bid === "number") parts.push(`ставка ${r.bid.toLocaleString("ru-RU")} ₽`);
  return parts.join(" · ");
}

function fromServer(row: ActionLogRow): Row {
  const label = ACTION_LABEL[row.action] ?? row.action;
  return {
    id: row.id,
    at: row.created_at,
    title: label,
    detail: [requestDetail(row), row.result === "error" && row.message ? `Ошибка: ${row.message}` : row.message ?? ""].filter(Boolean).join(". "),
    tone: row.result === "ok" ? "ok" : row.result === "error" ? "danger" : "neutral",
    who: row.initiator === "agent" ? "агент" : "вы",
  };
}

/** Журнал действий: всё, что менялось в кабинете через KARTO, с результатом. Хранится в базе и виден с любого устройства. */
export function HubActionJournal() {
  const [server, setServer] = useState<ActionLogRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadSellerHubActionLog().then((res) => {
      if (cancelled) return;
      if (res.ok) setServer(res.entries);
      else setError(res.error ?? "Журнал не загрузился");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const rows = useMemo<Row[]>(() => {
    const local = readHubJournal().map(
      (entry): Row => ({ id: `local-${entry.id}`, at: entry.at, title: entry.title, detail: entry.detail, tone: "neutral", who: entry.actor === "user" ? "вы" : "сценарий" }),
    );
    return [...(server ?? []).map(fromServer), ...local].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 100);
  }, [server]);

  if (server == null && !error) {
    return (
      <HubPanel>
        <HubPanelHeader title="Журнал действий" hint="Загружаю…" />
      </HubPanel>
    );
  }

  if (rows.length === 0) {
    return (
      <HubPanel className="min-h-[240px]">
        <HubEmptyState
          icon={<ScrollText className="h-7 w-7" />}
          title="Журнал пока пуст"
          description={error ?? "Здесь появится каждое действие, которое вы подтвердили: пополнение, пауза, ставка, цена, минус-фразы. С временем, результатом и ошибкой, если она была."}
        />
      </HubPanel>
    );
  }

  return (
    <HubPanel>
      <HubPanelHeader title="Журнал действий" hint="Что менялось в кабинете через KARTO: когда, кем и с каким результатом." />
      <ul>
        {rows.map((row) => (
          <li key={row.id} className="border-b px-5 py-3.5 last:border-b-0 sm:px-6" style={{ borderColor: hub.borderSoft }}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[14px] font-semibold" style={{ ...hubSans, color: hub.text }}>
                {row.title}
              </p>
              <div className="flex items-center gap-2">
                {row.tone !== "neutral" ? <HubBadge tone={row.tone === "ok" ? "ok" : "danger"}>{row.tone === "ok" ? "выполнено" : "ошибка"}</HubBadge> : null}
                <span className="text-[12px]" style={{ ...hubSans, color: hub.textSubtle }}>
                  {new Date(row.at).toLocaleString("ru-RU")} · {row.who}
                </span>
              </div>
            </div>
            {row.detail ? (
              <p className="mt-1 text-[13px] leading-5" style={{ ...hubSans, color: hub.textMuted }}>
                {row.detail}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </HubPanel>
  );
}
