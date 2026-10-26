export type HubJournalEntry = {
  id: string;
  at: string;
  title: string;
  detail: string;
  actor: "user" | "scenario";
};

const KEY = "karto-seller-hub-journal-v1";

export function readHubJournal(): HubJournalEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as HubJournalEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function appendHubJournal(entry: Omit<HubJournalEntry, "id" | "at">): HubJournalEntry[] {
  const next: HubJournalEntry = {
    ...entry,
    id: `${Date.now()}`,
    at: new Date().toISOString(),
  };
  const all = [next, ...readHubJournal()].slice(0, 200);
  localStorage.setItem(KEY, JSON.stringify(all));
  return all;
}
