"use client";

import { useCallback, useEffect, useState } from "react";
import { loadSellerHubAutopilot, saveSellerHubAutopilot, type AutopilotSettingsView, type AutopilotView } from "@/lib/seller-hub/client-api";
import { AgentLoadError, AgentSkeleton, AgentSwitch } from "./hub-agents-ui";
import { PanelGroup, PanelNumber, PanelRow, PanelSaveBar, PanelSection } from "./hub-agents-panel";
import { hub, hubSans } from "./hub-ui";

/**
 * Автопилот: правила владельца. По умолчанию выключен. Выполняет только безопасные шаги принятых планов, у которых автопилот включён отдельно,
 * в рамках суточных пределов. Цена, акции, карточка и ставки автопилотом не выполняются: только по кнопке «Выполнить».
 */

const TYPE_LABEL: Record<string, string> = {
  pause: "Ставить кампании на паузу",
  remove_nm: "Убирать товар из кампании",
  minus_phrases: "Добавлять минус-фразы",
  deposit: "Пополнять бюджет кампании",
};

const TYPE_HINT: Record<string, string> = {
  pause: "Если расход идёт без заказов",
  remove_nm: "Если товар тратит деньги без заказов",
  minus_phrases: "Запросы без заказов",
  deposit: "1000–5000 ₽ за шаг",
};

const same = (a: AutopilotSettingsView, b: AutopilotSettingsView) =>
  a.enabled === b.enabled && a.maxActionsPerDay === b.maxActionsPerDay && a.maxDepositPerDayRub === b.maxDepositPerDayRub && [...a.allowedTypes].sort().join() === [...b.allowedTypes].sort().join() && [...a.routines].sort().join() === [...b.routines].sort().join();

export function HubAutopilot() {
  const [view, setView] = useState<AutopilotView | null>(null);
  const [draft, setDraft] = useState<AutopilotSettingsView | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; ok: boolean } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    const res = await loadSellerHubAutopilot();
    if (res.ok && res.data) {
      setView(res.data);
      setDraft(res.data.settings);
    } else setLoadError(res.error ?? "Не удалось прочитать правила автопилота");
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadSellerHubAutopilot().then((res) => {
      if (cancelled) return;
      if (res.ok && res.data) {
        setView(res.data);
        setDraft(res.data.settings);
      } else setLoadError(res.error ?? "Не удалось прочитать правила автопилота");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function save(next: AutopilotSettingsView) {
    setBusy(true);
    setNote(null);
    const res = await saveSellerHubAutopilot(next);
    setBusy(false);
    if (res.ok) {
      setNote({ text: "Сохранено", ok: true });
      await load();
    } else setNote({ text: res.error ?? "Не удалось сохранить, попробуйте ещё раз", ok: false });
  }

  if (!draft || !view) {
    return loadError ? <AgentLoadError text="Правила автопилота сейчас не открылись." onRetry={() => void load()} /> : <AgentSkeleton rows={4} className="max-w-xl" />;
  }

  const patch = (next: Partial<AutopilotSettingsView>) => {
    setNote(null);
    setDraft({ ...draft, ...next });
  };
  const flip = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const dirty = !same(draft, view.settings);

  const off = !draft.enabled;
  return (
    <div className="space-y-9">
      <div className="flex items-center justify-between gap-6 rounded-[18px] px-6 py-5 transition-colors duration-300" style={{ backgroundColor: draft.enabled ? "rgba(185, 255, 75, 0.14)" : "rgba(1, 20, 8, 0.03)", boxShadow: "inset 0 0 0 1px rgba(1, 20, 8, 0.08)" }}>
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[17px] font-semibold leading-6" style={{ ...hubSans, color: hub.text }}>
            Автопилот
            <span className="inline-flex items-center gap-1.5 text-[13px] font-medium" style={{ color: draft.enabled ? "#2E5A43" : hub.textSubtle }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: draft.enabled ? "#6FC21D" : "#A9B3AC" }} aria-hidden />
              {draft.enabled ? "включён" : "выключен"}
            </span>
          </p>
          <p className="mt-1 max-w-[52ch] text-[14px] leading-[1.5]" style={{ ...hubSans, color: hub.textSubtle }}>
            {draft.enabled ? "Безопасные шаги рекламы выполняются сами, в пределах суток. Всё записывается в журнал." : "Агент только предлагает, а все действия вы подтверждаете сами."}
          </p>
        </div>
        <AgentSwitch label="Автопилот" checked={draft.enabled} onChange={(v) => patch({ enabled: v })} />
      </div>

      <div className={`space-y-9 transition-opacity duration-300 ${off ? "pointer-events-none opacity-45" : ""}`} aria-disabled={off}>
        <PanelSection title="Что делает сам" hint="Цены, акции и карточки автопилот не меняет никогда: только по вашей кнопке.">
          <PanelGroup>
            {view.types.map((t) => (
              <PanelRow key={t} title={TYPE_LABEL[t] ?? t} hint={TYPE_HINT[t]} control={<AgentSwitch label={TYPE_LABEL[t] ?? t} checked={draft.allowedTypes.includes(t)} disabled={off} onChange={() => patch({ allowedTypes: flip(draft.allowedTypes, t) })} />} />
            ))}
          </PanelGroup>
        </PanelSection>

        {view.routines.length > 0 ? (
          <PanelSection title="Ежедневные проверки" hint="Выполняются раз в сутки без вашего участия.">
            <PanelGroup>
              {view.routines.map((r) => {
                // «Защита бюджета: ставить на паузу…» → название и короткая подсказка отдельно.
                const [name, ...rest] = r.label.split(": ");
                return <PanelRow key={r.id} title={name} hint={rest.join(": ") || undefined} control={<AgentSwitch label={r.label} checked={draft.routines.includes(r.id)} disabled={off} onChange={() => patch({ routines: flip(draft.routines, r.id) })} />} />;
              })}
            </PanelGroup>
          </PanelSection>
        ) : null}

        <PanelSection title="Не больше за сутки" hint="Когда предел исчерпан, автопилот останавливается до утра.">
          <PanelGroup>
            <PanelRow title="Действий" hint="Все виды вместе" control={<PanelNumber label="Действий в сутки" unit="шт." value={draft.maxActionsPerDay} min={1} max={50} onCommit={(v) => patch({ maxActionsPerDay: v })} />} />
            <PanelRow title="Пополнение бюджета" hint="Сумма за сутки по всем кампаниям, шаг 500" control={<PanelNumber label="Пополнение бюджета в сутки" unit="₽" value={draft.maxDepositPerDayRub} min={0} max={20000} step={500} onCommit={(v) => patch({ maxDepositPerDayRub: v })} />} />
          </PanelGroup>
        </PanelSection>
      </div>

      <PanelSaveBar dirty={dirty} busy={busy} note={note} onSave={() => void save(draft)} onReset={() => patch(view.settings)} />
    </div>
  );
}
