export type HubScenarioSchedule = "once" | "regular" | "manual";

export type HubScenario = {
  id: string;
  agent: "prices" | "ads" | "comms";
  title: string;
  steps: string[];
  schedule: HubScenarioSchedule;
  status: "active" | "paused" | "done";
  liked: boolean | null;
  createdAt: string;
  stopLossMarginPct: number;
};

const KEY = "karto-seller-hub-scenarios-v1";

export function readHubScenarios(): HubScenario[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as HubScenario[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeHubScenarios(items: HubScenario[]) {
  localStorage.setItem(KEY, JSON.stringify(items));
}

export function upsertHubScenario(item: HubScenario) {
  const all = readHubScenarios().filter((row) => row.id !== item.id);
  writeHubScenarios([item, ...all]);
}
