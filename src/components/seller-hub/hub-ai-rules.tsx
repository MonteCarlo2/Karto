"use client";

import { FORBID_AREAS, FORBID_LABEL, PRICE_GUARD_LIMITS, parseForbid, type ForbidArea } from "@/lib/seller-hub/agent/owner-rules";
import { AgentSwitch } from "./hub-agents-ui";
import { PanelGroup, PanelNumber, PanelRow, PanelSection } from "./hub-agents-panel";
import { hub, hubSans } from "./hub-ui";
import { useUserSetting } from "./use-user-setting";

/**
 * Постоянные правила для агента: что ему менять нельзя никогда и какая нижняя маржа. Действуют на все планы.
 * Программа проверяет соблюдение сама: запрещённые шаги вычёркиваются из плана, нижняя маржа становится ограничителем плана.
 */

const shortArea = (area: ForbidArea) => FORBID_LABEL[area].split(" (")[0]!.toLowerCase();
const areaNote = (area: ForbidArea) => {
  const m = FORBID_LABEL[area].match(/\((.+)\)/);
  return m ? m[1]![0]!.toUpperCase() + m[1]!.slice(1) : undefined;
};

/** Короткая сводка правил одной строкой: для обзора раздела. */
export function useAiRulesSummary(): { forbid: string; margin: string } {
  const [forbidRaw] = useUserSetting<string>("ai.forbid", "");
  const [minMargin] = useUserSetting<number>("ai.minMarginPct", 0);
  const forbid = parseForbid(forbidRaw);
  return {
    forbid: forbid.length > 0 ? forbid.map(shortArea).join(", ") : "запретов нет",
    margin: minMargin > 0 ? `${minMargin}%` : "безубыточность",
  };
}

export function HubAiRules({ part = "all" }: { part?: "all" | "forbid" | "limits" }) {
  const [forbidRaw, setForbidRaw] = useUserSetting<string>("ai.forbid", "");
  const [minMargin, setMinMargin] = useUserSetting<number>("ai.minMarginPct", 0);
  const [cushion, setCushion] = useUserSetting<number>("ai.priceCushionPct", PRICE_GUARD_LIMITS.cushionPct.def);
  const [step, setStep] = useUserSetting<number>("ai.priceStepPct", PRICE_GUARD_LIMITS.stepPct.def);
  const [cooldown, setCooldown] = useUserSetting<number>("ai.priceCooldownHours", PRICE_GUARD_LIMITS.cooldownHours.def);
  const forbid = parseForbid(forbidRaw);
  const toggle = (area: ForbidArea) => setForbidRaw(forbid.includes(area) ? forbid.filter((a) => a !== area).join(",") : [...forbid, area].join(","));

  return (
    <div className="space-y-9">
      {part !== "limits" ? (
      <PanelSection title="Что менять нельзя" hint="Включённый запрет вычёркивает такие шаги из любого плана. Сохраняется сразу.">
        <PanelGroup>
          {FORBID_AREAS.map((area) => (
            <PanelRow
              key={area}
              title={FORBID_LABEL[area].split(" (")[0]!}
              hint={areaNote(area) ?? "Базовая цена, скидка, вход и выход из акций"}
              control={<AgentSwitch label={FORBID_LABEL[area].split(" (")[0]!} checked={forbid.includes(area)} onChange={() => toggle(area)} />}
            />
          ))}
        </PanelGroup>
      </PanelSection>

      ) : null}

      {part !== "forbid" ? (
      <PanelSection title={part === "limits" ? undefined : "Границы цены"} hint="Агент не выйдет за эти границы, даже если план это предлагает.">
        <PanelGroup>
          <PanelRow title="Минимальная маржа" hint="Ниже этой маржи цену не опустит. 0 значит: не ниже безубыточности" control={<PanelNumber label="Нижняя маржа" unit="%" value={minMargin} min={0} max={60} onCommit={setMinMargin} />} />
          <PanelRow title="Страховка над безубыточной ценой" hint={`Цена не ниже безубыточной плюс столько процентов (от ${PRICE_GUARD_LIMITS.cushionPct.min} до ${PRICE_GUARD_LIMITS.cushionPct.max}): защита от ошибок в себестоимости`} control={<PanelNumber label="Запас над безубыточностью" unit="%" value={cushion} min={PRICE_GUARD_LIMITS.cushionPct.min} max={PRICE_GUARD_LIMITS.cushionPct.max} onCommit={setCushion} />} />
          <PanelRow title="Максимальный шаг цены" hint={`На сколько процентов агент меняет цену за один раз (от ${PRICE_GUARD_LIMITS.stepPct.min} до ${PRICE_GUARD_LIMITS.stepPct.max})`} control={<PanelNumber label="Шаг цены за раз" unit="%" value={step} min={PRICE_GUARD_LIMITS.stepPct.min} max={PRICE_GUARD_LIMITS.stepPct.max} onCommit={setStep} />} />
          <PanelRow title="Пауза между изменениями" hint={`Сколько часов ждать, прежде чем менять цену товара снова (от ${PRICE_GUARD_LIMITS.cooldownHours.min} до ${PRICE_GUARD_LIMITS.cooldownHours.max})`} control={<PanelNumber label="Пауза между изменениями" unit="ч" value={cooldown} min={PRICE_GUARD_LIMITS.cooldownHours.min} max={PRICE_GUARD_LIMITS.cooldownHours.max} onCommit={setCooldown} />} />
        </PanelGroup>
        <p className="px-0.5 text-[12.5px] leading-5" style={{ ...hubSans, color: hub.textSubtle }}>
          Действует на новые планы; уже принятые идут как были.
        </p>
      </PanelSection>
      ) : null}
    </div>
  );
}
