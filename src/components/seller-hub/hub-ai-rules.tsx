"use client";

import { useEffect, useState } from "react";
import { FORBID_AREAS, FORBID_LABEL, PRICE_GUARD_LIMITS, parseForbid } from "@/lib/seller-hub/agent/owner-rules";
import { HubButton, HubPanel, hub } from "./hub-ui";
import { useUserSetting } from "./use-user-setting";

/**
 * Постоянные правила для ИИ-менеджера: что ему менять нельзя никогда и какая нижняя маржа. Действуют на все планы.
 * Программа проверяет соблюдение сама: запрещённые шаги вычёркиваются из плана, нижняя маржа становится ограничителем плана.
 */
/** Числовое поле: пока человек печатает, значение не обрезается; в настройку попадает при выходе из поля. */
function NumberField({ value, min, max, onCommit, className }: { value: number; min: number; max: number; onCommit: (v: number) => void; className: string }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <input
      type="number"
      min={min}
      max={max}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const v = Math.min(max, Math.max(min, Math.round(Number(draft)) || min));
        setDraft(String(v));
        if (v !== value) onCommit(v);
      }}
      className={className}
      style={{ borderColor: hub.borderSoft, color: hub.text, background: "transparent" }}
    />
  );
}

export function HubAiRules() {
  const [forbidRaw, setForbidRaw] = useUserSetting<string>("ai.forbid", "");
  const [minMargin, setMinMargin] = useUserSetting<number>("ai.minMarginPct", 0);
  const [cushion, setCushion] = useUserSetting<number>("ai.priceCushionPct", PRICE_GUARD_LIMITS.cushionPct.def);
  const [step, setStep] = useUserSetting<number>("ai.priceStepPct", PRICE_GUARD_LIMITS.stepPct.def);
  const [cooldown, setCooldown] = useUserSetting<number>("ai.priceCooldownHours", PRICE_GUARD_LIMITS.cooldownHours.def);
  const [open, setOpen] = useState(false);
  const forbid = parseForbid(forbidRaw);
  const toggle = (area: string) => setForbidRaw(forbid.includes(area as never) ? forbid.filter((a) => a !== area).join(",") : [...forbid, area].join(","));
  const summary = [forbid.length > 0 ? `не трогать: ${forbid.map((a) => FORBID_LABEL[a].split(" (")[0]!.toLowerCase()).join(", ")}` : "ограничений нет", minMargin > 0 ? `нижняя маржа ${minMargin}%` : null].filter(Boolean).join(" · ");

  return (
    <HubPanel className="px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[14px] font-semibold" style={{ color: hub.text }}>Правила для ИИ-менеджера</p>
          <p className="text-[13px] leading-5" style={{ color: hub.textMuted }}>Действуют на все планы: {summary}.</p>
        </div>
        <HubButton variant="secondary" onClick={() => setOpen((v) => !v)}>{open ? "Свернуть" : "Настроить"}</HubButton>
      </div>
      {open ? (
        <div className="mt-3 space-y-3">
          <div>
            <p className="text-[12px] font-semibold" style={{ color: hub.text }}>Что ИИ не должен менять никогда</p>
            <div className="mt-1 space-y-1">
              {FORBID_AREAS.map((area) => (
                <label key={area} className="flex items-center gap-2 text-[13px]" style={{ color: hub.text }}>
                  <input type="checkbox" checked={forbid.includes(area)} onChange={() => toggle(area)} />
                  {FORBID_LABEL[area]}
                </label>
              ))}
            </div>
          </div>
          <label className="block text-[12px]" style={{ color: hub.textMuted }}>
            Нижняя маржа для планов, % (0 — только безубыточность)
            <NumberField value={minMargin} min={0} max={60} onCommit={setMinMargin} className="mt-0.5 block w-32 rounded-lg border px-2 py-1 text-[13px]" />
          </label>
          <div>
            <p className="text-[12px] font-semibold" style={{ color: hub.text }}>Ограничители цены (можно только строже стандартных)</p>
            <div className="mt-1 grid gap-2 sm:grid-cols-3">
              <label className="text-[12px]" style={{ color: hub.textMuted }}>
                Запас над безубыточностью, % (от 5)
                <NumberField value={cushion} min={5} max={30} onCommit={setCushion} className="mt-0.5 block w-full rounded-lg border px-2 py-1 text-[13px]" />
              </label>
              <label className="text-[12px]" style={{ color: hub.textMuted }}>
                Шаг цены за раз, % (до 5)
                <NumberField value={step} min={1} max={5} onCommit={setStep} className="mt-0.5 block w-full rounded-lg border px-2 py-1 text-[13px]" />
              </label>
              <label className="text-[12px]" style={{ color: hub.textMuted }}>
                Пауза между изменениями, часов (от 24)
                <NumberField value={cooldown} min={24} max={168} onCommit={setCooldown} className="mt-0.5 block w-full rounded-lg border px-2 py-1 text-[13px]" />
              </label>
            </div>
          </div>
          <p className="text-[12px] leading-4" style={{ color: hub.textMuted }}>Правила применяются к новым планам. Уже принятые планы идут как были.</p>
        </div>
      ) : null}
    </HubPanel>
  );
}
