/** Ключи localStorage для этапов Потока (по session_id). */

export function flowPriceCacheKey(sessionId: string): string {
  return `karto_price_analysis_v2_${sessionId}`;
}

export function flowVisualSlidesKey(sessionId: string): string {
  return `karto_visual_slides_${sessionId}`;
}

export function flowVisualStateKey(sessionId: string): string {
  return `karto_visual_state_${sessionId}`;
}

export type PersistedVisualFormSettings = {
  aspectRatio?: "3:4" | "1:1";
  addText?: boolean;
  title?: string;
  bullets?: string[];
  customPrompt?: string;
  selectedStyle?: string;
  selectedColor?: string | null;
};

export type PersistedVisualPageState = {
  generatedCards?: (string | null)[];
  selectedCardIndex?: number | null;
  isSeriesMode?: boolean;
  formSettings?: PersistedVisualFormSettings;
  generation_used?: number;
  generation_limit?: number;
};

export function readVisualPageStateFromLs(sessionId: string): PersistedVisualPageState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(flowVisualStateKey(sessionId));
    if (!raw) return null;
    return JSON.parse(raw) as PersistedVisualPageState;
  } catch {
    return null;
  }
}

export function writeVisualPageStateToLs(sessionId: string, state: PersistedVisualPageState): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(flowVisualStateKey(sessionId), JSON.stringify(state));
  } catch {
    /* quota */
  }
}
