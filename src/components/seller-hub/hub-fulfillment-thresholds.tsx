"use client";

import type { FulfillmentData } from "./hub-fulfillment";
import { hub, HubInput, hubSans } from "./hub-ui";

function NumberField({ label, value, min, max, onValid }: { label: string; value: number; min: number; max: number; onValid: (n: number) => void }) {
  return (
    <label className="block text-[12.5px]" style={{ ...hubSans, color: hub.textMuted }}>
      {label}
      <HubInput
        inputMode="numeric"
        className="mt-1 w-28"
        value={String(value)}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isInteger(n) && n >= min && n <= max) onValid(n);
        }}
      />
    </label>
  );
}

/** Пороги напоминаний логистики: общие для блока «Что сделать сейчас» и для агента логистики. Сохраняются в настройках пользователя. */
export function HubFulfillmentThresholds({ data }: { data: Pick<FulfillmentData, "remindHours" | "setRemindHours" | "coverDays" | "setCoverDays" | "eveningHour" | "setEveningHour"> }) {
  return (
    <div className="flex flex-wrap items-end gap-4">
      <NumberField label="Напомнить об отгрузке через, часов" value={data.remindHours} min={1} max={168} onValid={data.setRemindHours} />
      <NumberField label="Вечерняя отправка с, часа по Москве (24 — выкл.)" value={data.eveningHour} min={0} max={24} onValid={data.setEveningHour} />
      <NumberField label="Предупреждать, если своего запаса меньше, дней" value={data.coverDays} min={1} max={60} onValid={data.setCoverDays} />
    </div>
  );
}
