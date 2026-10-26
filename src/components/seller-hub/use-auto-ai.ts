"use client";

import { useUserSettingLoaded } from "./use-user-setting";

/** Автоматический анализ нейросетью при изменении данных. По умолчанию выключен (деньги не тратятся без команды); включённый режим ограничен кэшем, паузой и суточным лимитом. */
export function useAutoAi(): { enabled: boolean; setEnabled: (next: boolean) => void; ready: boolean } {
  const [enabled, setEnabled, ready] = useUserSettingLoaded<boolean>("ai.auto", false);
  return { enabled, setEnabled, ready };
}

/** Пауза после последнего изменения данных перед автоматическим платным вызовом: данные догружаются по частям, не платим за промежуточные. */
export const AUTO_AI_DEBOUNCE_MS = 5000;