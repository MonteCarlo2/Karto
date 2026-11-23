"use client";

import { useEffect, useState } from "react";
import { loadSellerHubAgentReports, type AgentReportView } from "@/lib/seller-hub/client-api";
import { AgentSkeleton } from "./hub-agents-ui";
import { PanelEmpty, PanelSection, PanelStat } from "./hub-agents-panel";
import { hub, hubNumeric, hubSans } from "./hub-ui";

const OUTCOME: Record<string, string> = { worked: "сработало", not_worked: "не сработало", observed: "наблюдение завершено" };
export const reportDay = (key: string) => new Date(`${key}T12:00:00+03:00`).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });

/** Недельный отчёт о работе агента. Появляется после первой закончившейся недели, если задача включена в правилах автопилота. */
export function HubAgentReport() {
  const [reports, setReports] = useState<AgentReportView[] | null>(null);
  useEffect(() => {
    void loadSellerHubAgentReports().then((r) => setReports(r.ok ? r.reports : []));
  }, []);
  if (reports == null) return <AgentSkeleton rows={4} className="max-w-xl" />;
  const latest = reports[0];
  if (!latest) return <PanelEmpty>Первый недельный отчёт появится после закончившейся недели. Он включается в правилах автопилота.</PanelEmpty>;
  const p = latest.payload;
  const finishedCount = p.plans.worked + p.plans.notWorked + p.plans.observed;
  return (
    <div className="space-y-9">
      <PanelSection title={`${reportDay(p.period.start)} – ${reportDay(p.period.end)}`} hint="Только работа агента. Деньги и прибыль смотрите в разделе «Финансы».">
        <dl className="grid grid-cols-3 gap-x-6 gap-y-7 rounded-[18px] px-5 py-5" style={{ backgroundColor: "rgba(46, 90, 67, 0.045)" }}>
          <PanelStat value={p.actions.total} label="действий в кабинете" />
          <PanelStat value={p.actions.byUser} label="подтвердили вы" />
          <PanelStat value={p.actions.byAgent} label="сделал автопилот" />
          <PanelStat value={p.actions.errors} label="ошибок" tone={p.actions.errors > 0 ? "danger" : undefined} />
          <PanelStat value={p.plans.running} label="планов идёт" />
          <PanelStat value={p.openProposals} label="ждут решения" />
        </dl>
      </PanelSection>

      <PanelSection title="Что сделано">
        {p.actions.list.length > 0 ? (
          <ul>
            {p.actions.list.map((a) => (
              <li key={a.label} className="flex items-baseline justify-between gap-4 border-t py-2.5 first:border-t-0" style={{ ...hubSans, borderColor: "rgba(1, 20, 8, 0.08)", color: hub.text }}>
                <span className="min-w-0 text-[14px] [overflow-wrap:anywhere]">{a.label}</span>
                <span className="text-[14px] font-semibold" style={hubNumeric}>
                  {a.count}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-0.5 text-[13.5px]" style={{ ...hubSans, color: hub.textSubtle }}>
            Действий в кабинете за неделю не было.
          </p>
        )}
      </PanelSection>

      <PanelSection title={`Закончившиеся планы · ${finishedCount}`}>
        {p.finished.length > 0 ? (
          <ul>
            {p.finished.map((f) => (
              <li key={f.title} className="border-t py-2.5 text-[14px] leading-5 first:border-t-0 [overflow-wrap:anywhere]" style={{ ...hubSans, borderColor: "rgba(1, 20, 8, 0.08)", color: hub.text }}>
                {f.title}: {OUTCOME[f.outcome]}
                {f.reason ? <span style={{ color: hub.textSubtle }}>. {f.reason}</span> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-0.5 text-[13.5px]" style={{ ...hubSans, color: hub.textSubtle }}>
            За эту неделю ни один план не дошёл до итога.
          </p>
        )}
      </PanelSection>
    </div>
  );
}
