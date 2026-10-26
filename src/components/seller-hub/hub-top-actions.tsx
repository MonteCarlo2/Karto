"use client";

import { actionLabel, severityLabel } from "@/components/seller-hub/hub-task-present";
import type { TopAction } from "@/components/seller-hub/top-actions";
import { DEFAULT_TASK_THRESHOLDS } from "@/lib/seller-hub/task-engine/config";
import { severityTooltipLines } from "@/lib/seller-hub/task-engine/severity";
import { HubBadge, HubButton, hub, hubNumeric, hubSans } from "@/components/seller-hub/hub-ui";

export function HubTopActions({
  actions,
  canAct,
  onOpen,
  onAct,
}: {
  actions: TopAction[];
  canAct: (action: TopAction) => boolean;
  onOpen: (action: TopAction) => void;
  onAct: (action: TopAction) => void;
}) {
  if (actions.length === 0) return null;
  return (
    <section aria-labelledby="top-actions-title" className="rounded-2xl border bg-white" style={{ borderColor: hub.border }}>
      <div className="border-b px-4 py-3 sm:px-5" style={{ borderColor: hub.border }}>
        <h2 id="top-actions-title" className="text-balance text-[18px] font-semibold leading-6" style={{ ...hubSans, color: hub.text }}>
          Главное сейчас
        </h2>
        <p className="mt-1 text-pretty text-[13px] leading-5" style={{ ...hubSans, color: hub.textMuted }}>
          Несколько действий, которые сейчас имеют наибольшее значение для магазина
        </p>
      </div>
      <ul>
        {actions.map((action, index) => {
          const label = actionLabel(action.actionType);
          const enabled = label != null && canAct(action);
          return (
            <li key={action.id} className="border-b px-4 py-3 last:border-b-0 sm:px-5" style={{ borderColor: hub.border }}>
              <div className="flex gap-3">
                <span className="w-5 shrink-0 pt-0.5 text-[14px] font-semibold" style={{ ...hubNumeric, color: hub.textSubtle }}>
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => onOpen(action)}
                    className="w-full rounded-lg text-left outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1F4E3D]"
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      <HubBadge
                        tone={
                          action.primary.severity === "critical"
                            ? "danger"
                            : action.primary.severity === "important"
                              ? "warn"
                              : "accent"
                        }
                        title={severityTooltipLines({
                          severity: action.primary.severity,
                          basis:
                            typeof action.primary.evidence.severity_basis === "string"
                              ? action.primary.evidence.severity_basis
                              : null,
                          turnoverRub:
                            typeof action.primary.evidence.turnover_base_rub === "number"
                              ? action.primary.evidence.turnover_base_rub
                              : typeof action.primary.evidence.store_order_sum_28d === "number"
                                ? action.primary.evidence.store_order_sum_28d
                                : null,
                          thresholds: DEFAULT_TASK_THRESHOLDS,
                        }).detail}
                      >
                        {severityLabel(action.primary.severity)}
                      </HubBadge>
                      <span className="text-pretty text-[15px] font-semibold leading-5" style={{ ...hubSans, color: hub.text }}>
                        {action.title}
                      </span>
                    </span>
                    <span className="mt-1 block text-pretty text-[13px] leading-5" style={{ ...hubSans, color: hub.textMuted }}>
                      {action.why}
                    </span>
                  </button>
                  {action.proofs.length > 0 ? (
                    <ul className="mt-2 space-y-0.5">
                      {action.proofs.map((proof) => (
                        <li key={proof} className="text-[13px] font-medium leading-5" style={{ ...hubNumeric, ...hubSans, color: hub.text }}>
                          {proof}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {action.supportNote ? (
                    <p className="mt-2 text-[13px] leading-5" style={{ ...hubSans, color: hub.textMuted }}>
                      {action.supportNote}
                    </p>
                  ) : null}
                  <p className="mt-2 text-pretty text-[13px] leading-5" style={{ ...hubSans, color: hub.textMuted }}>
                    Эффект: {action.effect}
                  </p>
                  {enabled && label ? (
                    <div className="mt-2.5">
                      <HubButton size="sm" onClick={() => onAct(action)}>
                        {label}
                      </HubButton>
                    </div>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
