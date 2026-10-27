import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AgentProposal } from "@/lib/seller-hub/ads-agent-engine";
import { DISMISS_COOLDOWN_MS, DONE_COOLDOWN_MS, reconcileProposals, type StoredProposal } from "./reconcile";
import { proposalKey } from "./server-proposals";

const pause = (id: string): AgentProposal => ({ id: `waste-${id}`, rule: "waste_guard", title: `Пауза ${id}`, facts: [], effect: "", risk: "low", action: { type: "pause", campaignId: id } });
const NOW = Date.parse("2026-10-26T12:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe("предложения агента: сверка с базой", () => {
  it("новое предложение вставляется, повторное только обновляется", () => {
    const first = reconcileProposals([], [pause("1")], NOW);
    assert.equal(first.insert.length, 1);
    const stored: StoredProposal[] = [{ key: "pause:1", status: "open", resolvedAt: null }];
    const second = reconcileProposals(stored, [pause("1")], NOW);
    assert.equal(second.insert.length, 0);
    assert.equal(second.touch.length, 1);
  });

  it("открытое предложение, которое движок больше не видит, закрывается как устаревшее", () => {
    const ops = reconcileProposals([{ key: "pause:1", status: "open", resolvedAt: null }], [], NOW);
    assert.deepEqual(ops.expire, ["pause:1"]);
  });

  it("отклонённое не возвращается неделю, потом возвращается", () => {
    const fresh = [pause("1")];
    const early = reconcileProposals([{ key: "pause:1", status: "dismissed", resolvedAt: ago(DISMISS_COOLDOWN_MS - 60_000) }], fresh, NOW);
    assert.equal(early.reopen.length, 0);
    const late = reconcileProposals([{ key: "pause:1", status: "dismissed", resolvedAt: ago(DISMISS_COOLDOWN_MS + 60_000) }], fresh, NOW);
    assert.equal(late.reopen.length, 1);
  });

  it("выполненное не возвращается, пока данные кабинета могут отставать", () => {
    const fresh = [pause("1")];
    assert.equal(reconcileProposals([{ key: "pause:1", status: "done", resolvedAt: ago(60_000) }], fresh, NOW).reopen.length, 0);
    assert.equal(reconcileProposals([{ key: "pause:1", status: "done", resolvedAt: ago(DONE_COOLDOWN_MS + 60_000) }], fresh, NOW).reopen.length, 1);
  });

  it("закрытые предложения, которых нет в расчёте, не трогаются", () => {
    const ops = reconcileProposals([{ key: "pause:1", status: "dismissed", resolvedAt: ago(1000) }], [], NOW);
    assert.deepEqual(ops, { insert: [], touch: [], reopen: [], expire: [] });
  });

  it("ключ различает действие, кампанию и товар", () => {
    assert.equal(proposalKey({ type: "remove_nm", campaignId: "5", nmId: "9" }), "remove_nm:5:9");
    assert.equal(proposalKey({ type: "bid", advertId: "5", nmId: "9", bidRub: 10 }), "bid:5:9");
    assert.notEqual(proposalKey({ type: "pause", campaignId: "5" }), proposalKey({ type: "deposit", campaignId: "5", sumRub: 100 }));
  });
});
