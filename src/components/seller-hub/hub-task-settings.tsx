"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { loadSellerHubTaskSettings, muteSellerHubTask, saveSellerHubTaskSettings, type TaskSettingsPayload } from "@/lib/seller-hub/client-api";
import { GROUP_TITLE, SETTING_FIELDS, TASK_TYPE_INFO, defaultValues, validateValues, type SettingKey } from "@/lib/seller-hub/task-engine/settings-form";
import type { SellerCatalogItem } from "@/lib/seller-hub/types";
import { HubButton, hub, hubSans } from "./hub-ui";

const GROUPS = ["stock", "sales", "economics", "content"] as const;
const TYPE_GROUP_TITLE: Record<string, string> = { ...GROUP_TITLE, reviews: "Отзывы и вопросы" };

/**
 * Настройки задач: какие рычаги реально меняют правила (с пояснением, что именно), какие типы задач создавать и по каким товарам они отключены.
 * Сохранение пересчитывает задачи: отключённые типы закрываются сразу, пороги применяются при пересчёте.
 */
export function HubTaskSettings({ marketplaceId, items, onClose, onSaved }: { marketplaceId: string; items: SellerCatalogItem[]; onClose: () => void; onSaved: () => void }) {
  const [state, setState] = useState<{ status: "loading" } | { status: "error"; error: string } | { status: "ready"; data: TaskSettingsPayload }>({ status: "loading" });
  const [text, setText] = useState<Record<string, string>>({});
  const [disabled, setDisabled] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Partial<Record<SettingKey, string>>>({});
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [muted, setMuted] = useState<Array<{ nmId: string; type: string }>>([]);

  useEffect(() => {
    let cancelled = false;
    void loadSellerHubTaskSettings(marketplaceId)
      .then((res) => {
        if (cancelled) return;
        if (!res.ok) {
          setState({ status: "error", error: res.error });
          return;
        }
        setState({ status: "ready", data: res.data });
        setText(Object.fromEntries(Object.entries(res.data.values).map(([k, v]) => [k, v == null ? "" : String(v)])));
        setDisabled(new Set(res.data.disabledTypes));
        setMuted(res.data.mutedProducts);
      })
      .catch((e: unknown) => {
        if (!cancelled) setState({ status: "error", error: e instanceof Error ? e.message : "Настройки не загрузились" });
      });
    return () => {
      cancelled = true;
    };
  }, [marketplaceId]);

  const titleOf = useMemo(() => new Map(items.map((i) => [i.externalId, i.title || i.vendorCode || i.externalId])), [items]);
  const typeLabel = useMemo(() => new Map(TASK_TYPE_INFO.map((t) => [t.type as string, t.label])), []);
  const defaults = defaultValues();

  const save = () => {
    const checked = validateValues(Object.fromEntries(SETTING_FIELDS.map((f) => [f.key, text[f.key] === "" || text[f.key] === undefined ? (f.optional ? null : undefined) : Number(text[f.key])])));
    if (!checked.ok) {
      setErrors(checked.errors);
      setNote({ ok: false, text: "Проверьте выделенные поля." });
      return;
    }
    setErrors({});
    setBusy(true);
    setNote(null);
    void saveSellerHubTaskSettings(marketplaceId, checked.values, [...disabled])
      .then((res) => {
        if (!res.ok) {
          if (res.errors) setErrors(res.errors);
          setNote({ ok: false, text: res.error });
          return;
        }
        setNote({ ok: true, text: "Сохранено. Задачи пересчитываются." });
        onSaved();
      })
      .catch((e: unknown) => setNote({ ok: false, text: e instanceof Error ? e.message : "Не удалось сохранить" }))
      .finally(() => setBusy(false));
  };

  const reset = () => {
    setText(Object.fromEntries(Object.entries(defaults).map(([k, v]) => [k, v == null ? "" : String(v)])));
    setDisabled(new Set());
    setErrors({});
    setNote({ ok: true, text: "Стандартные значения подставлены. Нажмите «Сохранить», чтобы применить." });
  };

  const unmute = (nmId: string, type: string) => {
    void muteSellerHubTask(nmId, type, false, marketplaceId)
      .then((res) => {
        if (res.ok) {
          setMuted((prev) => prev.filter((m) => !(m.nmId === nmId && m.type === type)));
          onSaved();
        } else setNote({ ok: false, text: res.error });
      })
      .catch(() => setNote({ ok: false, text: "Не удалось вернуть задачи" }));
  };

  return (
    <div className="fixed inset-0 z-30">
      <button type="button" aria-label="Закрыть настройки" className="absolute inset-0 bg-black/35" onClick={onClose} />
      <aside role="dialog" aria-modal="true" aria-labelledby="task-settings-title" className="absolute inset-y-0 right-0 flex w-full max-w-[560px] flex-col border-l bg-white" style={{ borderColor: hub.border }}>
        <div className="flex items-start justify-between gap-3 border-b px-5 py-4" style={{ borderColor: hub.border }}>
          <div>
            <h2 id="task-settings-title" className="text-[18px] font-semibold" style={{ ...hubSans, color: hub.text }}>
              Настройки задач
            </h2>
            <p className="mt-1 text-[13px] leading-5" style={{ ...hubSans, color: hub.textMuted }}>
              Здесь только то, что реально меняет правила. У каждого значения написано, что оно меняет.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 hover:bg-[#F4F6F8]" aria-label="Закрыть">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          {state.status === "loading" ? <p className="text-[13px]" style={{ ...hubSans, color: hub.textMuted }}>Загружаю настройки…</p> : null}
          {state.status === "error" ? <p className="text-[13px]" style={{ ...hubSans, color: hub.danger }}>{state.error}</p> : null}

          {state.status === "ready" ? (
            <>
              {GROUPS.map((group) => (
                <section key={group}>
                  <h3 className="text-[14px] font-semibold" style={{ ...hubSans, color: hub.text }}>{GROUP_TITLE[group]}</h3>
                  <div className="mt-2 space-y-3">
                    {SETTING_FIELDS.filter((f) => f.group === group).map((f) => (
                      <div key={f.key}>
                        <label className="flex items-center justify-between gap-3 text-[13px]" style={{ ...hubSans, color: hub.text }}>
                          <span className="font-medium">{f.label}</span>
                          <span className="flex items-center gap-1.5">
                            <input
                              type="number"
                              inputMode="numeric"
                              min={f.min}
                              max={f.max}
                              value={text[f.key] ?? ""}
                              placeholder={f.optional ? "выкл." : undefined}
                              onChange={(e) => setText((prev) => ({ ...prev, [f.key]: e.target.value }))}
                              className="w-24 rounded-lg border px-2.5 py-1.5 text-right text-[13px] tabular-nums"
                              style={{ borderColor: errors[f.key] ? hub.danger : hub.border }}
                              aria-invalid={Boolean(errors[f.key])}
                            />
                            <span className="w-10 text-[12px]" style={{ color: hub.textSubtle }}>{f.unit}</span>
                          </span>
                        </label>
                        <p className="mt-0.5 text-[12px] leading-4" style={{ ...hubSans, color: hub.textMuted }}>{f.hint}</p>
                        <p className="text-[11.5px] leading-4" style={{ ...hubSans, color: errors[f.key] ? hub.danger : hub.textSubtle }}>
                          {errors[f.key] ?? `По умолчанию: ${f.defaultValue == null ? "выключено" : `${f.defaultValue} ${f.unit}`}. Допустимо: ${f.min}–${f.max}.`}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              ))}

              <section>
                <h3 className="text-[14px] font-semibold" style={{ ...hubSans, color: hub.text }}>Какие задачи создавать</h3>
                <p className="mt-0.5 text-[12px] leading-4" style={{ ...hubSans, color: hub.textMuted }}>Снимите галочку, и такие задачи перестанут создаваться, открытые закроются сразу.</p>
                <div className="mt-2 space-y-3">
                  {(["stock", "sales", "economics", "content", "reviews"] as const).map((group) => (
                    <div key={group}>
                      <p className="text-[12px] font-semibold uppercase tracking-[0.06em]" style={{ ...hubSans, color: hub.textSubtle }}>{TYPE_GROUP_TITLE[group]}</p>
                      <ul className="mt-1 space-y-1">
                        {TASK_TYPE_INFO.filter((t) => t.group === group).map((t) => (
                          <li key={t.type}>
                            <label className="flex cursor-pointer items-start gap-2 text-[13px] leading-5" style={{ ...hubSans, color: hub.text }}>
                              <input
                                type="checkbox"
                                className="mt-1 h-3.5 w-3.5 shrink-0"
                                checked={!disabled.has(t.type)}
                                onChange={(e) =>
                                  setDisabled((prev) => {
                                    const next = new Set(prev);
                                    if (e.target.checked) next.delete(t.type);
                                    else next.add(t.type);
                                    return next;
                                  })
                                }
                              />
                              <span>
                                {t.label}
                                <span className="block text-[11.5px] leading-4" style={{ color: hub.textSubtle }}>{t.hint}</span>
                              </span>
                            </label>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <h3 className="text-[14px] font-semibold" style={{ ...hubSans, color: hub.text }}>Отключено по товарам</h3>
                {muted.length === 0 ? (
                  <p className="mt-1 text-[12.5px] leading-5" style={{ ...hubSans, color: hub.textMuted }}>Таких товаров нет. Отключить задачи по одному товару можно в карточке задачи.</p>
                ) : (
                  <ul className="mt-2 space-y-1.5">
                    {muted.map((m) => (
                      <li key={`${m.nmId}:${m.type}`} className="flex items-center justify-between gap-3 text-[13px]" style={{ ...hubSans, color: hub.text }}>
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{titleOf.get(m.nmId) ?? `Артикул ${m.nmId}`}</span>
                          <span className="block text-[12px]" style={{ color: hub.textMuted }}>{typeLabel.get(m.type) ?? m.type}</span>
                        </span>
                        <HubButton variant="secondary" size="sm" onClick={() => unmute(m.nmId, m.type)}>Вернуть</HubButton>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          ) : null}
        </div>

        <div className="space-y-2 border-t px-5 py-4" style={{ borderColor: hub.border }}>
          <div className="flex flex-wrap gap-2">
            <HubButton loading={busy} disabled={state.status !== "ready"} onClick={save}>Сохранить</HubButton>
            <HubButton variant="secondary" disabled={state.status !== "ready" || busy} onClick={reset}>Сбросить к стандартным</HubButton>
          </div>
          {note ? <p className="text-[13px] leading-5" role="status" style={{ ...hubSans, color: note.ok ? hub.greenDark : hub.danger }}>{note.text}</p> : null}
        </div>
      </aside>
    </div>
  );
}
