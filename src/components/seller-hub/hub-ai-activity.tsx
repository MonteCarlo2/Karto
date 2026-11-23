"use client";

import { useEffect, useState } from "react";
import { loadSellerHubAiActivity, type AiActivity } from "@/lib/seller-hub/client-api";
import { effectReport, stepCompliance } from "@/lib/seller-hub/agent/strategy";
import { AgentLoadError, AgentSkeleton } from "./hub-agents-ui";
import { PanelEmpty } from "./hub-agents-panel";
import { HubButton, hub, hubNumeric, hubSans } from "./hub-ui";

/**
 * История работы ИИ: что стало с принятыми планами (идёт, сработало, не сработало) с измеренным эффектом «было → стало».
 * Расходы на ИИ клиенту не показываются. Данные читаются из нашей базы.
 */

const STATUS: Record<string, { text: string; color: string }> = {
  running: { text: "Ведётся", color: "#8F948C" },
  worked: { text: "Сработало", color: "#10B981" },
  not_worked: { text: "Не сработало", color: "#EF4444" },
  observed: { text: "Наблюдение завершено", color: "#F59E0B" },
};

const fmtDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long" }) : "");
const PAGE = 8;

export function HubAiActivity() {
  const [data, setData] = useState<AiActivity | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState(PAGE);
  const [reload, setReload] = useState(0);
  // Для расчёта «выполнено шагов» нужен момент времени; берём один раз при открытии, а не при каждой отрисовке.
  const [now] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    void loadSellerHubAiActivity().then((res) => {
      if (cancelled) return;
      if (res.ok && res.data) {
        setError(null);
        setData(res.data);
      } else setError(res.error ?? "Не удалось прочитать историю");
    });
    return () => {
      cancelled = true;
    };
  }, [reload]);

  const plans = data?.plans ?? [];

  if (error) return <AgentLoadError text="История планов сейчас не открылась." onRetry={() => setReload((n) => n + 1)} />;
  if (!data) return <AgentSkeleton rows={4} className="max-w-xl" />;
  if (plans.length === 0) return <PanelEmpty>Принятых планов пока нет. Когда вы примете план, он появится здесь с измеренным результатом: что было и что стало.</PanelEmpty>;

  return (
    <div>
      <ul>
        {plans.slice(0, shown).map((p) => {
          const st = STATUS[p.state.status ?? "running"] ?? STATUS.running!;
          const rows = p.strategy ? effectReport(p.strategy, p.state, p.state.finalMetrics ?? p.state.current ?? {}).filter((r) => r.change != null && r.change !== 0) : [];
          const meta = [p.state.acceptedAt ? `принято ${fmtDate(p.state.acceptedAt)}` : "", p.state.resolvedAt ? `итог ${fmtDate(p.state.resolvedAt)}` : "", p.state.doneSteps?.length ? `шагов: ${p.state.doneSteps.length}` : ""].filter(Boolean).join(" · ");
          return (
            <li key={p.id} className="border-t py-4 first:border-t-0" style={{ borderColor: "rgba(1, 20, 8, 0.08)" }}>
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 text-[14.5px] font-semibold leading-5 [overflow-wrap:anywhere]" style={{ ...hubSans, color: hub.text }}>
                  {p.title}
                </p>
                <span className="flex shrink-0 items-center gap-1.5 text-[12.5px]" style={{ ...hubSans, color: hub.textSubtle }}>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: st.color }} aria-hidden />
                  {st.text}
                </span>
              </div>
              {meta ? (
                <p className="mt-0.5 text-[12.5px] leading-5" style={{ ...hubSans, color: hub.textSubtle }}>
                  {meta}
                </p>
              ) : null}
              {p.strategy ? (
                <p className="mt-1 text-[13.5px] leading-5" style={{ ...hubSans, color: hub.textMuted }}>
                  {stepCompliance(p.strategy, p.state, now).text}
                </p>
              ) : null}
              {p.state.reason ? (
                <p className="mt-1 text-[13.5px] leading-5 [overflow-wrap:anywhere]" style={{ ...hubSans, color: hub.textMuted }}>
                  {p.state.reason}
                </p>
              ) : null}
              {rows.length > 0 ? (
                <dl className="mt-2.5 rounded-[12px] px-3.5 py-2" style={{ backgroundColor: "rgba(46, 90, 67, 0.045)" }}>
                  {rows.map((r) => (
                    <div key={r.label} className="flex items-baseline justify-between gap-4 py-1">
                      <dt className="text-[13px] leading-5" style={{ ...hubSans, color: hub.textSubtle }}>
                        {r.label}
                      </dt>
                      <dd className="whitespace-nowrap text-[13px] leading-5" style={{ ...hubSans, ...hubNumeric, color: hub.textMuted }}>
                        {r.before ?? "нет данных"} → <strong style={{ color: hub.text }}>{r.after ?? "нет данных"}</strong>
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </li>
          );
        })}
      </ul>
      {plans.length > shown ? (
        <div className="mt-3">
          <HubButton variant="secondary" size="sm" onClick={() => setShown((n) => n + PAGE)}>
            Показать ещё {Math.min(PAGE, plans.length - shown)} из {plans.length - shown}
          </HubButton>
        </div>
      ) : null}
    </div>
  );
}
