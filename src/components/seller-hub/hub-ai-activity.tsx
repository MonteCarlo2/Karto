"use client";

import { useState } from "react";
import { loadSellerHubAiActivity, type AiActivity } from "@/lib/seller-hub/client-api";
import { effectReport, stepCompliance } from "@/lib/seller-hub/agent/strategy";
import { HubBadge, HubButton, HubPanel, hub } from "./hub-ui";

/**
 * История работы ИИ: что стало с принятыми планами (идёт, сработало, не сработало) с измеренным эффектом «было → стало».
 * Расходы на ИИ клиенту не показываются. Раскрывается по кнопке, данные читаются из нашей базы.
 */

const STATUS: Record<string, { text: string; tone: "ok" | "warn" | "danger" | "muted" }> = {
  running: { text: "Ведётся", tone: "muted" },
  worked: { text: "Сработало", tone: "ok" },
  not_worked: { text: "Не сработало", tone: "danger" },
  observed: { text: "Наблюдение завершено", tone: "warn" },
};

const fmtDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long" }) : "");

export function HubAiActivity() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<AiActivity | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next) {
      setBusy(true);
      const res = await loadSellerHubAiActivity();
      setBusy(false);
      if (res.ok && res.data) {
        setData(res.data);
        setError(null);
      } else setError(res.error ?? "Не удалось прочитать историю");
    }
  }

  return (
    <HubPanel className="px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <HubBadge tone="accent">ИИ</HubBadge>
          <p className="text-[14px] font-semibold" style={{ color: hub.text }}>История работы ИИ</p>
        </div>
        <HubButton variant="secondary" onClick={() => void toggle()}>{open ? "Свернуть" : "Показать"}</HubButton>
      </div>
      {open ? (
        <div className="mt-3 space-y-3">
          {busy ? <p className="text-[13px]" style={{ color: hub.textMuted }}>Читаю историю…</p> : null}
          {error ? <p className="text-[13px]" style={{ color: hub.danger }}>{error}</p> : null}
          {data ? (
            <div>
              <p className="text-[13px] font-semibold" style={{ color: hub.text }}>Принятые планы и что с ними стало</p>
              {data.plans.length === 0 ? (
                <p className="mt-1 text-[12px]" style={{ color: hub.textMuted }}>Принятых планов пока нет. Когда вы примете план в «Задачах» или в чате выше, он появится здесь с измеренным эффектом.</p>
              ) : (
                <ul className="mt-1 space-y-2">
                  {data.plans.map((p) => {
                    const st = STATUS[p.state.status ?? "running"] ?? STATUS.running!;
                    const rows = p.strategy ? effectReport(p.strategy, p.state, p.state.finalMetrics ?? p.state.current ?? {}).filter((r) => r.change != null && r.change !== 0) : [];
                    return (
                      <li key={p.id} className="rounded-md border px-3 py-2" style={{ borderColor: hub.borderSoft }}>
                        <div className="flex flex-wrap items-center gap-2">
                          <HubBadge tone={st.tone}>{st.text}</HubBadge>
                          <span className="text-[13px] font-semibold" style={{ color: hub.text }}>{p.title}</span>
                          {!p.accepted && p.state.status !== "running" ? null : null}
                        </div>
                        <p className="mt-0.5 text-[12px]" style={{ color: hub.textMuted }}>
                          {p.state.acceptedAt ? `Принято ${fmtDate(p.state.acceptedAt)}` : ""}{p.state.resolvedAt ? ` · итог ${fmtDate(p.state.resolvedAt)}` : ""}{p.state.doneSteps?.length ? ` · выполнено шагов: ${p.state.doneSteps.length}` : ""}
                        </p>
                        {p.strategy ? <p className="text-[12px]" style={{ color: hub.textMuted }}>План: {stepCompliance(p.strategy, p.state, Date.now()).text}</p> : null}
                        {p.state.reason ? <p className="text-[12px]" style={{ color: hub.textMuted }}>{p.state.reason}</p> : null}
                        {rows.length > 0 ? (
                          <p className="mt-0.5 text-[12px]" style={{ color: hub.text }}>
                            {rows.map((r) => `${r.label}: ${r.before ?? "—"} → ${r.after ?? "—"}`).join(" · ")}
                          </p>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </HubPanel>
  );
}
