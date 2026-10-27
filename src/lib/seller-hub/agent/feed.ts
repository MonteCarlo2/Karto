import { algorithmView, FINDING_KIND_LABEL, type FindingKind, type FindingSeverity, type ObserverAction, type ObserverTask } from "./ai-observer";
import type { ProblemNote } from "./ai-solver";
import type { Strategy, StrategyState } from "./strategy";

/**
 * Единая лента «что не так и что делать»: задачи алгоритмов и находки ИИ собираются в общие карточки по товару и вопросу.
 * Если алгоритм и ИИ говорят об одном, это одна карточка с двумя подписями («алгоритм и ИИ согласны»); если только один, карточка помечена источником.
 * Слияние делает программа, а не ИИ.
 */

export type FeedFinding = {
  id: string;
  nmId: string | null;
  kind: FindingKind;
  severity: FindingSeverity;
  title: string;
  what: string;
  whyNow: string;
  humanAdvice: string;
  evidence: Array<{ key: string; value: number }>;
  second: string;
  secondReason: string;
  action: ObserverAction | null;
  /** Если ИИ решал сигналы алгоритмов: идентификаторы задач, вердикт, оценка каждого сигнала и стратегия решения с ходом выполнения. */
  taskIds?: string[];
  /** signal: решение по сигналу алгоритма; scan: находка свободного просмотра; chat: план по задаче владельца. */
  origin?: string;
  /** Ключ решения (для плана из диалога: chat:<id>:<товар>). */
  taskKey?: string;
  ownerAccepted?: boolean;
  /** Автопилот включён у плана. */
  autopilot?: boolean;
  actionNote?: string;
  verdict?: string | null;
  problems?: ProblemNote[];
  strategy?: Strategy | null;
  strategyState?: StrategyState | null;
};

export type FeedTask = ObserverTask & { id: string };

export type FeedItem = {
  key: string;
  nmId: string | null;
  /** algorithm — только задача алгоритма; ai — только находка ИИ; both — оба о том же. */
  source: "algorithm" | "ai" | "both";
  title: string;
  severity: "critical" | "important" | "watch";
  taskIds: string[];
  taskTitles: string[];
  finding: FeedFinding | null;
  /** ИИ разобрал сигнал алгоритма и считает, что в контексте магазина это не проблема. */
  aiNotProblem?: { title: string; diagnosis: string } | null;
};

const rank = (s: FeedItem["severity"]) => (s === "critical" ? 0 : s === "important" ? 1 : 2);
const taskSeverity = (s: string): FeedItem["severity"] => (s === "critical" ? "critical" : s === "important" ? "important" : "watch");

export function unifyFeed(tasks: FeedTask[], findings: FeedFinding[], notProblem: Map<string, { title: string; diagnosis: string }> = new Map()): FeedItem[] {
  const usedTasks = new Set<string>();
  const items: FeedItem[] = [];
  for (const f of findings) {
    // Разбор конкретной задачи привязан к ней точно; свободная находка ИИ сопоставляется с задачами по смыслу.
    const view = algorithmView(f, tasks);
    const related = f.taskIds && f.taskIds.length > 0 ? tasks.filter((t) => f.taskIds!.includes(t.id)) : tasks.filter((t) => (f.nmId ? t.nmId === f.nmId : t.nmId == null) && view.tasks.includes(t.title));
    related.forEach((t) => usedTasks.add(t.id));
    const severities = [f.severity === "important" ? "important" : "watch", ...related.map((t) => taskSeverity(t.severity))] as FeedItem["severity"][];
    items.push({
      key: `finding:${f.id}`,
      nmId: f.nmId,
      source: related.length > 0 ? "both" : "ai",
      title: f.title || FINDING_KIND_LABEL[f.kind],
      severity: severities.sort((a, b) => rank(a) - rank(b))[0]!,
      taskIds: related.map((t) => t.id),
      taskTitles: related.map((t) => t.title),
      finding: f,
    });
  }
  for (const t of tasks) {
    if (usedTasks.has(t.id)) continue;
    items.push({ key: `task:${t.id}`, nmId: t.nmId, source: "algorithm", title: t.title, severity: taskSeverity(t.severity), taskIds: [t.id], taskTitles: [t.title], finding: null, aiNotProblem: notProblem.get(t.id) ?? null });
  }
  return items.sort((a, b) => rank(a.severity) - rank(b.severity) || (a.source === "both" ? -1 : 0) - (b.source === "both" ? -1 : 0));
}
