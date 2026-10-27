"use client";

import { useEffect, useState } from "react";
import { loadSellerHubAgentReports, type AgentReportView } from "@/lib/seller-hub/client-api";
import { HubButton, HubPanel, hub } from "./hub-ui";

const OUTCOME: Record<string, string> = { worked: "сработало", not_worked: "не сработало", observed: "наблюдение завершено" };
const fmt = (key: string) => new Date(`${key}T12:00:00+03:00`).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });

/** Недельный отчёт о работе агентов. Появляется после первой закончившейся недели, если задача включена в правилах автопилота. */
export function HubAgentReport() {
  const [reports, setReports] = useState<AgentReportView[] | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    void loadSellerHubAgentReports().then((r) => setReports(r.ok ? r.reports : []));
  }, []);
  const latest = reports?.[0];
  if (!latest) return null;
  const p = latest.payload;
  return (
    <HubPanel className="px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[14px] font-semibold" style={{ color: hub.text }}>Отчёт агентов за {fmt(p.period.start)} – {fmt(p.period.end)}</p>
          <p className="text-[13px] leading-5" style={{ color: hub.textMuted }}>
            Выполнено действий: {p.actions.total} (вами {p.actions.byUser}, автопилотом {p.actions.byAgent}), ошибок: {p.actions.errors}. Планов закончилось: {p.plans.worked + p.plans.notWorked + p.plans.observed}, идёт: {p.plans.running}. Ждут решения: {p.openProposals}.
          </p>
        </div>
        <HubButton variant="secondary" onClick={() => setOpen((v) => !v)}>{open ? "Свернуть" : "Подробнее"}</HubButton>
      </div>
      {open ? (
        <div className="mt-2 space-y-2">
          {p.actions.list.length > 0 ? <ul className="text-[13px]" style={{ color: hub.text }}>{p.actions.list.map((a) => <li key={a.label}>{a.label}: {a.count}</li>)}</ul> : <p className="text-[13px]" style={{ color: hub.textMuted }}>Действий в кабинете за неделю не было.</p>}
          {p.finished.map((f) => (
            <p key={f.title} className="text-[13px] leading-5" style={{ color: hub.text }}>{f.title}: {OUTCOME[f.outcome]}{f.reason ? `. ${f.reason}` : ""}</p>
          ))}
          <p className="text-[12px] leading-4" style={{ color: hub.textMuted }}>Деньги и прибыль смотрите в разделе «Финансы»: здесь только работа агентов.</p>
        </div>
      ) : null}
    </HubPanel>
  );
}
