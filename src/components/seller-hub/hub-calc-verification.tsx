"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { autoRepliesAuthorizedFetch } from "@/lib/auto-replies/auto-replies-fetch";
import {
  buildCalcVerification,
  type CalcVerificationReport,
  type VerifyCheckRow,
  type VerifySourceStatus,
  type VerifyTone,
} from "@/lib/seller-hub/calc-verification";
import type { MonthReconcileDiagnostics } from "@/lib/seller-hub/diagnostics";
import { loadSellerHubTasks } from "@/lib/seller-hub/task-engine/client";
import type { SellerTask } from "@/lib/seller-hub/task-engine/types";
import type { SellerCatalogSnapshot } from "@/lib/seller-hub/types";
import {
  hub,
  HubBadge,
  HubButton,
  HubPanel,
  HubPanelHeader,
  hubSans,
  hubSerif,
} from "./hub-ui";

function toneColor(tone: VerifyTone): string {
  switch (tone) {
    case "ok":
      return hub.green;
    case "fail":
      return hub.danger;
    case "na":
      return hub.textSubtle;
    default: {
      const _exhaustive: never = tone;
      return _exhaustive;
    }
  }
}

function toneLabel(tone: VerifyTone): string {
  switch (tone) {
    case "ok":
      return "Ок";
    case "fail":
      return "Расхождение";
    case "na":
      return "Нет данных";
    default: {
      const _exhaustive: never = tone;
      return _exhaustive;
    }
  }
}

function sourceStatusLabel(status: VerifySourceStatus["status"]): string {
  switch (status) {
    case "ok":
      return "ok";
    case "pending":
      return "pending";
    case "error":
      return "error";
    case "not_loaded":
      return "не загружен";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

function CheckRowView({ row }: { row: VerifyCheckRow }) {
  const [open, setOpen] = useState(row.tone === "fail");
  return (
    <div
      className="border-b last:border-b-0"
      style={{ borderColor: hub.border }}
    >
      <button
        type="button"
        className="flex w-full items-start gap-3 px-4 py-3 text-left"
        onClick={() => setOpen((v) => !v)}
        style={hubSans}
      >
        <span
          className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: toneColor(row.tone) }}
          aria-hidden
        />
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold" style={{ color: hub.text }}>
            {row.title}
          </span>
          <span className="mt-0.5 block text-[13px]" style={{ color: hub.textMuted }}>
            {row.summary}
          </span>
        </span>
        <HubBadge tone={row.tone === "ok" ? "ok" : row.tone === "fail" ? "danger" : "muted"}>
          {toneLabel(row.tone)}
        </HubBadge>
      </button>
      {open && row.details.length > 0 ? (
        <ul className="space-y-1 px-4 pb-3 pl-10 text-[13px]" style={{ color: hub.textMuted, ...hubSans }}>
          {row.details.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function HubCalcVerification({
  snapshot,
  connected,
}: {
  snapshot: SellerCatalogSnapshot | null;
  connected: boolean;
}) {
  const [tasks, setTasks] = useState<SellerTask[]>([]);
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [tasksLoaded, setTasksLoaded] = useState(false);
  const [month, setMonth] = useState<MonthReconcileDiagnostics | null>(null);
  const [monthLoading, setMonthLoading] = useState(false);
  const [monthError, setMonthError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!connected || !snapshot) {
      setTasks([]);
      setTasksLoaded(false);
      return;
    }
    let cancelled = false;
    void loadSellerHubTasks(snapshot)
      .then((rows) => {
        if (cancelled) return;
        setTasks(rows);
        setTasksLoaded(true);
        setTasksError(null);
        setTick((n) => n + 1);
      })
      .catch(() => {
        if (cancelled) return;
        setTasksError("Не удалось загрузить задачи для проверки");
      });
    return () => {
      cancelled = true;
    };
  }, [
    connected,
    snapshot,
    snapshot?.syncedAt,
    snapshot?.realization?.loadedAt,
    snapshot?.funnel?.loadedAt,
    snapshot?.paidStorage?.loadedAt,
    snapshot?.feedbacks?.loadedAt,
  ]);

  const report: CalcVerificationReport = useMemo(
    () =>
      buildCalcVerification({
        snapshot,
        tasks,
        tasksLoaded,
        monthReconcile: month,
      }),
    [snapshot, tasks, tasksLoaded, month, tick],
  );

  const loadMonth = useCallback(async () => {
    if (!connected) return;
    setMonthLoading(true);
    setMonthError(null);
    try {
      const res = await autoRepliesAuthorizedFetch("/api/seller-hub/calc-verification/month", {
        method: "POST",
        body: JSON.stringify({ snapshot }),
        timeoutMs: 180_000,
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        month?: MonthReconcileDiagnostics;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.month) {
        setMonthError(data.error ?? `Ошибка ${res.status}`);
        return;
      }
      setMonth(data.month);
      setTick((n) => n + 1);
    } catch (e) {
      setMonthError(e instanceof Error ? e.message : "Не удалось загрузить сверку месяца");
    } finally {
      setMonthLoading(false);
    }
  }, [connected, snapshot]);

  useEffect(() => {
    setTick((n) => n + 1);
  }, [snapshot?.syncedAt, snapshot?.realization?.loadedAt, snapshot?.funnel?.loadedAt, tasks.length]);

  const failCount = report.checks.filter((c) => c.tone === "fail").length;
  const okCount = report.checks.filter((c) => c.tone === "ok").length;

  return (
    <div className="space-y-4" style={hubSans}>
      <div>
        <h1 className="text-[28px] font-bold tracking-[-0.03em]" style={{ color: hub.text, ...hubSerif }}>
          Проверка расчётов
        </h1>
        <p className="mt-1 max-w-2xl text-[15px]" style={{ color: hub.textMuted }}>
          Сверка источников и формул этапа «Задачи» на данных вашего кабинета. Пересчитывается при синхронизации.
          Сверка месяца — отдельный запрос к WB (лимит finance).
        </p>
      </div>

      <HubPanel>
        <HubPanelHeader
          title="Источники"
          action={
            <span className="text-[12px]" style={{ color: hub.textSubtle }}>
              обновлено {new Date(report.builtAt).toLocaleString("ru-RU")}
            </span>
          }
        />
        <div className="divide-y" style={{ borderColor: hub.border }}>
          {report.sources.map((source) => (
            <div key={source.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
              <span
                className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
                style={{
                  backgroundColor:
                    source.status === "ok"
                      ? hub.green
                      : source.status === "error"
                        ? hub.danger
                        : source.status === "pending"
                          ? hub.warn
                          : hub.textSubtle,
                }}
              />
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-semibold" style={{ color: hub.text }}>
                  {source.label}
                </div>
                <div className="mt-0.5 text-[12px]" style={{ color: hub.textMuted }}>
                  {sourceStatusLabel(source.status)}
                  {source.loadedAt
                    ? ` · ${new Date(source.loadedAt).toLocaleString("ru-RU")}`
                    : ""}
                  {source.period ? ` · ${source.period}` : ""}
                  {source.fresh24h === false ? " · старше 24 ч" : ""}
                  {source.fresh24h === true ? " · свежий" : ""}
                </div>
                {source.error ? (
                  <div className="mt-1 text-[12px]" style={{ color: hub.danger }}>
                    {source.error}
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </HubPanel>

      <HubPanel>
        <HubPanelHeader
          title="Проверки"
          action={
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12px]" style={{ color: hub.textMuted }}>
                {okCount} ок · {failCount} красных · {report.checks.length - okCount - failCount} без данных
              </span>
              <HubButton
                size="sm"
                variant="secondary"
                disabled={!connected || monthLoading}
                onClick={() => void loadMonth()}
              >
                <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${monthLoading ? "animate-spin" : ""}`} />
                Сверка месяца
              </HubButton>
            </div>
          }
        />
        {tasksError ? (
          <div className="px-4 py-2 text-[13px]" style={{ color: hub.danger }}>
            {tasksError}
          </div>
        ) : null}
        {monthError ? (
          <div className="px-4 py-2 text-[13px]" style={{ color: hub.danger }}>
            {monthError}
          </div>
        ) : null}
        <div>
          {report.checks.map((row) => (
            <CheckRowView key={row.id} row={row} />
          ))}
        </div>
      </HubPanel>
    </div>
  );
}
