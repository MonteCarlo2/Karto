"use client";

import { useEffect, useState } from "react";
import { loadSellerHubAutopilot, saveSellerHubAutopilot, type AutopilotSettingsView, type AutopilotView } from "@/lib/seller-hub/client-api";
import { HubBadge, HubButton, HubPanel, hub } from "./hub-ui";

/**
 * Автопилот: правила владельца. По умолчанию выключен. Выполняет только безопасные шаги принятых планов, у которых автопилот включён отдельно,
 * в рамках суточных пределов. Цена, акции, карточка и ставки автопилотом не выполняются: только по кнопке «Выполнить».
 */

const TYPE_LABEL: Record<string, string> = {
  pause: "Ставить на паузу рекламные кампании",
  remove_nm: "Убирать товар из рекламной кампании",
  minus_phrases: "Добавлять минус-фразы (запросы без заказов)",
  deposit: "Пополнять бюджет кампании (500–2000 ₽ за шаг)",
};

export function HubAutopilot() {
  const [view, setView] = useState<AutopilotView | null>(null);
  const [draft, setDraft] = useState<AutopilotSettingsView | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function load() {
    const res = await loadSellerHubAutopilot();
    if (res.ok && res.data) {
      setView(res.data);
      setDraft(res.data.settings);
    } else setNote(res.error ?? "Не удалось прочитать правила");
  }

  useEffect(() => {
    void load();
  }, []);

  async function save(next: AutopilotSettingsView) {
    setBusy(true);
    setNote(null);
    const res = await saveSellerHubAutopilot(next);
    setBusy(false);
    if (res.ok) {
      setDraft(next);
      setNote("Сохранено");
      await load();
    } else setNote(res.error ?? "Не удалось сохранить");
  }

  if (!draft) return null;
  const toggleType = (t: string) => setDraft({ ...draft, allowedTypes: draft.allowedTypes.includes(t) ? draft.allowedTypes.filter((x) => x !== t) : [...draft.allowedTypes, t] });

  return (
    <HubPanel className="px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <HubBadge tone={view?.settings.enabled ? "ok" : "muted"}>{view?.settings.enabled ? "включён" : "выключен"}</HubBadge>
          <p className="text-[14px] font-semibold" style={{ color: hub.text }}>Автопилот</p>
        </div>
        <HubButton variant="secondary" onClick={() => setOpen((v) => !v)}>{open ? "Свернуть" : "Настроить"}</HubButton>
      </div>
      <p className="mt-1 text-[13px] leading-5" style={{ color: hub.textMuted }}>
        Выполняет безопасные шаги ваших планов сам, без кнопки. Включается в два этапа: здесь общие правила, а у каждого принятого плана своя кнопка «Включить автопилот». Цена, акции, карточка и ставки автопилотом не меняются.
      </p>
      {open ? (
        <div className="mt-3 space-y-3">
          <label className="flex items-center gap-2 text-[13px]" style={{ color: hub.text }}>
            <input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} />
            Включить автопилот
          </label>
          <div>
            <p className="text-[12px] font-semibold" style={{ color: hub.text }}>Что разрешено выполнять без кнопки</p>
            <div className="mt-1 space-y-1">
              {(view?.types ?? []).map((t) => (
                <label key={t} className="flex items-center gap-2 text-[13px]" style={{ color: hub.text }}>
                  <input type="checkbox" checked={draft.allowedTypes.includes(t)} onChange={() => toggleType(t)} />
                  {TYPE_LABEL[t] ?? t}
                </label>
              ))}
            </div>
          </div>
          {(view?.routines ?? []).length > 0 ? (
            <div>
              <p className="text-[12px] font-semibold" style={{ color: hub.text }}>Регулярные задачи (сами, без планов)</p>
              <div className="mt-1 space-y-1">
                {view!.routines.map((r) => (
                  <label key={r.id} className="flex items-center gap-2 text-[13px]" style={{ color: hub.text }}>
                    <input type="checkbox" checked={draft.routines.includes(r.id)} onChange={() => setDraft({ ...draft, routines: draft.routines.includes(r.id) ? draft.routines.filter((x) => x !== r.id) : [...draft.routines, r.id] })} />
                    {r.label}
                  </label>
                ))}
              </div>
              <p className="text-[12px] leading-4" style={{ color: hub.textMuted }}>Задачи, которые меняют кабинет (минус-фразы, защита бюджета, автопополнение), работают только при включённом автопилоте и в пределах действий в сутки. Проверка акций и отчёт кабинет не меняют и работают, когда отмечены. Минус-фразы можно убрать вручную в разделе «Продвижение».</p>
            </div>
          ) : null}
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-[12px]" style={{ color: hub.textMuted }}>
              Не больше действий в сутки
              <input type="number" min={1} max={50} value={draft.maxActionsPerDay} onChange={(e) => setDraft({ ...draft, maxActionsPerDay: Number(e.target.value) })} className="mt-0.5 block w-full rounded-lg border px-2 py-1 text-[13px]" style={{ borderColor: hub.borderSoft, color: hub.text, background: "transparent" }} />
            </label>
            <label className="text-[12px]" style={{ color: hub.textMuted }}>
              Пополнение бюджета, ₽ в сутки не больше
              <input type="number" min={0} max={20000} step={500} value={draft.maxDepositPerDayRub} onChange={(e) => setDraft({ ...draft, maxDepositPerDayRub: Number(e.target.value) })} className="mt-0.5 block w-full rounded-lg border px-2 py-1 text-[13px]" style={{ borderColor: hub.borderSoft, color: hub.text, background: "transparent" }} />
            </label>
          </div>
          <div className="flex items-center gap-2">
            <HubButton variant="primary" disabled={busy} onClick={() => void save(draft)}>Сохранить правила</HubButton>
            {note ? <span className="text-[12px]" style={{ color: hub.textMuted }}>{note}</span> : null}
          </div>
          <div>
            <p className="text-[12px] font-semibold" style={{ color: hub.text }}>Что автопилот уже сделал</p>
            {(view?.recent ?? []).length === 0 ? (
              <p className="text-[12px]" style={{ color: hub.textMuted }}>Пока ничего.</p>
            ) : (
              <ul className="mt-1 space-y-1">
                {view!.recent.map((r) => (
                  <li key={r.id} className="text-[12px] leading-4" style={{ color: hub.text }}>
                    <span style={{ color: hub.textMuted }}>{r.at ? new Date(r.at).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : ""} · </span>
                    {r.title} <span style={{ color: r.status === "done" ? hub.greenDark : hub.danger }}>{r.status === "done" ? "выполнено" : "не вышло"}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </HubPanel>
  );
}
