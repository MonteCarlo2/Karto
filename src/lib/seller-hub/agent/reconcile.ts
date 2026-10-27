import type { AgentProposal } from "@/lib/seller-hub/ads-agent-engine";
import { proposalKey } from "./server-proposals";

/**
 * Сверка свежих предложений агента с теми, что уже лежат в базе. Чистая функция: что вставить, обновить, закрыть.
 * Правила, чтобы лента не мигала и не раздражала:
 * - предложение живёт, пока его видит движок; пропало из расчёта — «устарело» (expired);
 * - отклонённое не возвращается неделю: человек уже сказал «не надо»;
 * - выполненное не возвращается 6 часов: данные кабинета обновляются с задержкой, и свежий снимок ещё может показывать старое.
 */

export type ProposalStatus = "open" | "done" | "dismissed" | "expired" | "failed";

export type StoredProposal = {
  key: string;
  status: ProposalStatus;
  /** Когда предложение закрыли (ISO), для открытых null. */
  resolvedAt: string | null;
};

export const DISMISS_COOLDOWN_MS = 7 * 24 * 3_600_000;
export const DONE_COOLDOWN_MS = 6 * 3_600_000;
/** Сорвавшееся действие снова можно предложить через час: причина (лимит, сеть) могла уйти. */
export const FAILED_COOLDOWN_MS = 3_600_000;

export type ProposalOps = {
  /** Новые: вставить. */
  insert: Array<{ key: string; proposal: AgentProposal }>;
  /** Уже открытые и снова увиденные: обновить текст и время. */
  touch: Array<{ key: string; proposal: AgentProposal }>;
  /** Закрытые раньше и снова нужные (прошёл срок ожидания): открыть заново. */
  reopen: Array<{ key: string; proposal: AgentProposal }>;
  /** Открытые, которых движок больше не видит: пометить «устарело». */
  expire: string[];
};

export function reconcileProposals(stored: StoredProposal[], fresh: AgentProposal[], nowMs: number): ProposalOps {
  const byKey = new Map(stored.map((row) => [row.key, row]));
  const freshByKey = new Map<string, AgentProposal>();
  for (const proposal of fresh) freshByKey.set(proposalKey(proposal.action), proposal);

  const ops: ProposalOps = { insert: [], touch: [], reopen: [], expire: [] };
  for (const [key, proposal] of freshByKey) {
    const row = byKey.get(key);
    if (!row) {
      ops.insert.push({ key, proposal });
      continue;
    }
    if (row.status === "open") {
      ops.touch.push({ key, proposal });
      continue;
    }
    const resolved = row.resolvedAt ? Date.parse(row.resolvedAt) : NaN;
    const age = Number.isFinite(resolved) ? nowMs - resolved : Number.POSITIVE_INFINITY;
    const cooldown = row.status === "dismissed" ? DISMISS_COOLDOWN_MS : row.status === "done" ? DONE_COOLDOWN_MS : row.status === "failed" ? FAILED_COOLDOWN_MS : 0;
    if (age >= cooldown) ops.reopen.push({ key, proposal });
  }
  for (const row of stored) {
    if (row.status === "open" && !freshByKey.has(row.key)) ops.expire.push(row.key);
  }
  return ops;
}
