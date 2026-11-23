"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ACTION_LABEL } from "@/lib/seller-hub/action-labels";
import { loadSellerHubActionLog, type ActionLogRow } from "@/lib/seller-hub/client-api";
import { readHubJournal } from "@/lib/seller-hub/journal";
import { AgentLoadError, AgentSkeleton } from "./hub-agents-ui";
import { PanelEmpty, PanelSegmented } from "./hub-agents-panel";
import { hub, HubButton, hubNumeric, hubSans } from "./hub-ui";

export type JournalRow = { id: string; at: string; title: string; detail: string; tone: "ok" | "danger" | "neutral"; who: "вы" | "агент" | "сценарий" };

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

/** Сетевой сбой показываем словами, а не техническим текстом. */
const friendly = (message: string) => (/fetch failed|network|timeout|ECONN/i.test(message) ? "связь оборвалась, действие не выполнено" : message);

export function journalRowFromServer(row: ActionLogRow): JournalRow {
  const label = ACTION_LABEL[row.action] ?? row.action;
  return {
    id: row.id,
    at: row.created_at,
    title: label,
    detail: [requestDetail(row), row.result === "error" && row.message ? `Ошибка: ${friendly(row.message)}` : row.message ?? ""].filter(Boolean).join(". "),
    tone: row.result === "ok" ? "ok" : row.result === "error" ? "danger" : "neutral",
    who: row.initiator === "agent" ? "агент" : "вы",
  };
}

/** Записи по дням: «Сегодня», «Вчера», дальше дата. */
function groupByDay(rows: JournalRow[], now: number): Array<{ key: string; label: string; rows: JournalRow[] }> {
  const dayKey = (t: number) => new Date(t).toLocaleDateString("sv-SE");
  const today = dayKey(now);
  const yesterday = dayKey(now - 24 * 60 * 60 * 1000);
  const out: Array<{ key: string; label: string; rows: JournalRow[] }> = [];
  for (const row of rows) {
    const t = Date.parse(row.at);
    const key = Number.isFinite(t) ? dayKey(t) : "none";
    let g = out[out.length - 1];
    if (!g || g.key !== key) {
      g = { key, label: key === today ? "Сегодня" : key === yesterday ? "Вчера" : Number.isFinite(t) ? new Date(t).toLocaleDateString("ru-RU", { day: "numeric", month: "long" }) : "Без даты", rows: [] };
      out.push(g);
    }
    g.rows.push(row);
  }
  return out;
}

type Filter = "all" | "agent" | "user" | "errors";
const PAGE = 20;

/** Журнал действий: всё, что менялось в кабинете через KARTO, с результатом. Хранится в базе и виден с любого устройства. */
export function HubActionJournal() {
  const [server, setServer] = useState<ActionLogRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [shown, setShown] = useState(PAGE);
  const [now] = useState(() => Date.now());

  const load = useCallback(async () => {
    setError(null);
    const res = await loadSellerHubActionLog();
    if (res.ok) setServer(res.entries);
    else setError(res.error ?? "Журнал не загрузился");
  }, []);

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

  const rows = useMemo<JournalRow[]>(() => {
    const local = readHubJournal().map((entry): JournalRow => ({ id: `local-${entry.id}`, at: entry.at, title: entry.title, detail: entry.detail, tone: "neutral", who: entry.actor === "user" ? "вы" : "сценарий" }));
    return [...(server ?? []).map(journalRowFromServer), ...local].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 100);
  }, [server]);

  const visible = rows.filter((r) => (filter === "agent" ? r.who !== "вы" : filter === "user" ? r.who === "вы" : filter === "errors" ? r.tone === "danger" : true));
  if (server == null && !error) return <AgentSkeleton rows={5} className="max-w-xl" />;

  if (rows.length === 0) {
    return error ? <AgentLoadError text="Журнал сейчас не открылся." onRetry={() => void load()} /> : <PanelEmpty>Журнал пока пуст. Здесь появится каждое действие, которое вы подтвердили или сделал автопилот: пополнение, пауза, ставка, цена, минус-фразы, с временем и результатом.</PanelEmpty>;
  }

  return (
    <div className="space-y-6">
      <PanelSegmented
        label="Кто делал"
        value={filter}
        onChange={(id) => {
          setFilter(id);
          setShown(PAGE);
        }}
        options={[
          { id: "all", label: "Все" },
          { id: "agent", label: "Агент" },
          { id: "user", label: "Вы" },
          { id: "errors", label: "Ошибки" },
        ]}
      />
      {error ? <AgentLoadError text="Свежие записи не загрузились, показаны сохранённые." onRetry={() => void load()} /> : null}
      {visible.length === 0 ? (
        <p className="py-2 text-[14px]" style={{ ...hubSans, color: hub.textSubtle }}>
          {filter === "errors" ? "Ошибок нет: все действия выполнены." : "По этому отбору записей нет."}
        </p>
      ) : (
        <div className="space-y-7">
          {groupByDay(visible.slice(0, shown), now).map((group) => (
            <section key={group.key}>
              <h3 className="mb-3 text-[12.5px] font-semibold uppercase tracking-[0.05em]" style={{ ...hubSans, color: hub.textSubtle }}>
                {group.label}
              </h3>
              <ol className="relative ml-[5px] border-l" style={{ borderColor: "rgba(1, 20, 8, 0.12)" }}>
                {group.rows.map((row) => (
                  <li key={row.id} className="hub-fade-in relative pb-5 pl-6 last:pb-0">
                    <span className="absolute -left-[5.5px] top-[7px] h-[10px] w-[10px] rounded-full ring-4 ring-[var(--hub-canvas)]" style={{ backgroundColor: row.tone === "danger" ? "#EF4444" : row.tone === "ok" ? "#10B981" : "#A3AAA0" }} aria-hidden />
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
                      <p className="min-w-0 text-[14.5px] font-semibold leading-6 [overflow-wrap:anywhere]" style={{ ...hubSans, color: hub.text }}>
                        {row.title}
                      </p>
                      <p className="shrink-0 text-[12.5px] leading-5" style={{ ...hubSans, ...hubNumeric, color: hub.textSubtle }}>
                        {new Date(row.at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })} · {row.who}
                        {row.tone === "danger" ? <span style={{ color: "#B91C1C" }}> · ошибка</span> : null}
                      </p>
                    </div>
                    {row.detail ? (
                      <p className="mt-0.5 max-w-[78ch] text-[13.5px] leading-[1.5] [overflow-wrap:anywhere]" style={{ ...hubSans, color: hub.textMuted }}>
                        {row.detail}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}
      {visible.length > shown ? (
        <div className="mt-3">
          <HubButton variant="secondary" size="sm" onClick={() => setShown((n) => n + PAGE)}>
            Показать ещё {Math.min(PAGE, visible.length - shown)} из {visible.length - shown}
          </HubButton>
        </div>
      ) : null}
    </div>
  );
}
