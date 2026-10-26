"use client";

import { useEffect, useMemo, useState } from "react";
import { ACTION_LABEL } from "@/lib/seller-hub/action-labels";
import { compareBids } from "@/lib/seller-hub/ads-bids";
import {
  AGENT_RULE_KINDS,
  buildAgentProposals,
  defaultRules,
  RULE_META,
  validateRule,
  type AgentProposal,
  type AgentRule,
} from "@/lib/seller-hub/ads-agent-engine";
import { applyActionToCampaigns, describeAgentAction, executeAgentAction } from "@/lib/seller-hub/agent-exec";
import {
  loadSellerHubActionLog,
  loadSellerHubAdBidRecommendations,
  loadSellerHubAgentRules,
  saveSellerHubAgentRule,
  type ActionLogRow,
} from "@/lib/seller-hub/client-api";
import type { SellerAdBidRecommendation, SellerAdCampaignRow } from "@/lib/seller-hub/types";
import type { AdsData } from "./hub-ads-data";
import { hub, HubButton, HubPanel, HubPanelHeader, hubSans } from "./hub-ui";

/** Агент рекламы: правила и очередь предложений. В режиме «предлагать» ничего не меняется без вашего подтверждения. */
export function HubAdsAgent({
  data,
  campaigns,
  accountRub,
  onCampaignsUpdate,
  variant = "full",
  onOpenAgents,
}: {
  data: AdsData;
  campaigns: SellerAdCampaignRow[];
  accountRub: number | null;
  onCampaignsUpdate: (rows: SellerAdCampaignRow[]) => void;
  /** full — раздел «Агенты»: правила, очередь, журнал. compact — полоса в «Продвижении»: только ближайшие предложения. */
  variant?: "full" | "compact";
  onOpenAgents?: () => void;
}) {
  const full = variant === "full";
  const [rules, setRules] = useState<AgentRule[]>(defaultRules());
  const [rulesLoaded, setRulesLoaded] = useState(false);
  const [rulesError, setRulesError] = useState<string | null>(null);
  const [depositedToday, setDepositedToday] = useState<Record<string, number>>({});
  const [recs, setRecs] = useState<SellerAdBidRecommendation[]>([]);
  const [drafts, setDrafts] = useState<Record<string, AgentRule>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [ruleMessage, setRuleMessage] = useState<Record<string, string>>({});
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState<Record<string, string>>({});
  const [history, setHistory] = useState<ActionLogRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    void loadSellerHubAgentRules().then((res) => {
      if (cancelled) return;
      if (res.ok) {
        setRules(res.rules);
        setDepositedToday(res.depositedToday);
      } else setRulesError(res.error ?? "Правила не загрузились");
      setRulesLoaded(true);
    });
    void loadSellerHubActionLog().then((res) => {
      if (!cancelled && res.ok) setHistory(res.entries.filter((e) => e.agent === "ads").slice(0, 8));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const active = useMemo(() => campaigns.filter((c) => c.status === 9 && c.paymentType === "cpm"), [campaigns]);
  const pairs = useMemo(() => active.flatMap((c) => (c.bids ?? []).map((b) => ({ advertId: Number(c.id), nmId: Number(b.nmId) }))).slice(0, 12), [active]);
  const needsBids = rules.some((r) => r.enabled && r.kind === "bid_climb");

  // Рекомендованные ставки WB нужны только правилу подъёма ставки; читаем, когда оно включено.
  useEffect(() => {
    if (!needsBids || pairs.length === 0) return;
    let cancelled = false;
    void loadSellerHubAdBidRecommendations({ pairs }).then((res) => {
      if (!cancelled && res.ok && res.recommendations) setRecs(res.recommendations);
    });
    return () => {
      cancelled = true;
    };
  }, [needsBids, pairs]);

  const result = useMemo(
    () =>
      buildAgentProposals({
        rules,
        campaigns,
        adsByProduct: data.allProductRows,
        products: data.advisorProducts,
        advice: data.advice,
        bids: compareBids(campaigns, recs),
        accountRub,
        depositedTodayRub: depositedToday,
        titles: data.titles,
      }),
    [rules, campaigns, data.allProductRows, data.advisorProducts, data.advice, recs, accountRub, depositedToday, data.titles],
  );
  const allProposals = result.proposals.filter((p) => !done[p.id]);
  const proposals = full ? allProposals : allProposals.slice(0, 3);

  const draftOf = (rule: AgentRule): AgentRule => drafts[rule.kind] ?? rule;
  const setDraft = (rule: AgentRule) => setDrafts((prev) => ({ ...prev, [rule.kind]: rule }));

  async function saveRule(kind: string) {
    const draft = drafts[kind];
    if (!draft) return;
    const problem = validateRule(draft);
    if (problem) {
      setRuleMessage((prev) => ({ ...prev, [kind]: problem }));
      return;
    }
    setSaving(kind);
    const res = await saveSellerHubAgentRule(draft);
    setSaving(null);
    if (res.ok) {
      setRules((prev) => prev.map((r) => (r.kind === kind ? draft : r)));
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[kind];
        return next;
      });
      setRuleMessage((prev) => ({ ...prev, [kind]: "Сохранено" }));
    } else {
      setRuleMessage((prev) => ({ ...prev, [kind]: res.error ?? "Не сохранилось" }));
    }
  }

  /** Выполнение предложения: те же серверные проверки и границы, что у ручных кнопок; запись попадает в журнал действий. */
  async function execute(p: AgentProposal) {
    if (running) return;
    setRunning(p.id);
    const a = p.action;
    const res = await executeAgentAction(a);
    setRunning(null);
    setConfirmId(null);
    if (!res.ok) {
      setFailed((prev) => ({ ...prev, [p.id]: res.error ?? "Не удалось выполнить" }));
      return;
    }
    setFailed((prev) => {
      const next = { ...prev };
      delete next[p.id];
      return next;
    });
    setDone((prev) => ({ ...prev, [p.id]: "Выполнено" }));
    if (a.type === "deposit") setDepositedToday((prev) => ({ ...prev, [a.campaignId]: (prev[a.campaignId] ?? 0) + a.sumRub }));
    onCampaignsUpdate(applyActionToCampaigns(a, campaigns, res.createdId));
  }

  const enabledCount = rules.filter((r) => r.enabled).length;

  return (
    <div className="space-y-5">
      {full ? (
      <HubPanel>
        <HubPanelHeader
          title="Агент рекламы"
          hint="Следит за кампаниями по вашим правилам и предлагает действия с цифрами. В режиме «предлагать» ничего не меняется, пока вы не нажмёте «Выполнить»."
        />
        <div className="space-y-2 px-5 py-4 text-[13px] leading-5 sm:px-6" style={{ ...hubSans, color: hub.textMuted }}>
          <p>
            Включено правил: <strong style={{ color: hub.text }}>{enabledCount}</strong> из {AGENT_RULE_KINDS.length}. Автопилот (агент действует сам в рамках лимитов) сейчас доступен для автопополнения и работает, когда на сервере подключён планировщик. Остальные правила только предлагают.
          </p>
          {rulesError ? <p style={{ color: hub.danger }}>{rulesError}</p> : null}
        </div>
      </HubPanel>
      ) : null}

      <HubPanel>
        <HubPanelHeader title={`${full ? "Предложения агента" : "Агент рекламы предлагает"}${allProposals.length > 0 ? ` · ${allProposals.length}` : ""}`} hint={full ? "Каждое предложение — факты, что изменится и чем рискуем. Выполняется после вашего подтверждения." : "Агент считает по правилам, которые вы настроили в разделе «Агенты», и выполняет после вашего подтверждения."} />
        {!rulesLoaded ? (
          <p className="px-5 py-5 text-[13px] sm:px-6" style={{ ...hubSans, color: hub.textMuted }}>
            Загружаю правила…
          </p>
        ) : proposals.length === 0 ? (
          <p className="px-5 py-5 text-[13.5px] leading-5 sm:px-6" style={{ ...hubSans, color: hub.textMuted }}>
            {enabledCount === 0
              ? full ? "Все правила выключены. Включите нужные ниже, и агент начнёт предлагать действия." : "Правила агента выключены. Включите нужные в разделе «Агенты», и он начнёт предлагать действия здесь и в других разделах."
              : "Предложений нет: по включённым правилам всё в порядке."}
            {result.skipped.length > 0 ? ` Не сделано: ${result.skipped.map((s) => s.text).join("; ")}.` : ""}
          </p>
        ) : (
          <ul className="divide-y" style={{ borderColor: hub.borderSoft }}>
            {proposals.map((p) => (
              <li key={p.id} className="space-y-2 px-5 py-4 sm:px-6">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="text-[14px] font-semibold" style={{ ...hubSans, color: hub.text }}>
                    {p.title}
                  </p>
                  <span className="rounded-md px-2 py-0.5 text-[11.5px] font-semibold" style={{ ...hubSans, backgroundColor: p.risk === "low" ? hub.greenSoft : hub.warnSoft, color: p.risk === "low" ? hub.green : hub.warn }}>
                    {p.risk === "low" ? "низкий риск" : "средний риск"} · {RULE_META[p.rule].title}
                  </span>
                </div>
                <ul className="list-disc space-y-0.5 pl-5 text-[13px] leading-5" style={{ ...hubSans, color: hub.textMuted }}>
                  {p.facts.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
                <p className="text-[13px] leading-5" style={{ ...hubSans, color: hub.text }}>
                  <strong>Что изменится:</strong> {p.effect}
                </p>
                {failed[p.id] ? (
                  <p className="text-[12.5px]" style={{ ...hubSans, color: hub.danger }}>
                    {failed[p.id]}
                  </p>
                ) : null}
                {confirmId === p.id ? (
                  <div className="flex flex-wrap items-center gap-2 rounded-lg px-3 py-2" style={{ backgroundColor: hub.warnSoft }}>
                    <span className="text-[13px]" style={{ ...hubSans, color: hub.warn }}>
                      Подтвердите: {describeAgentAction(p.action, campaigns)}.
                    </span>
                    <HubButton size="sm" loading={running === p.id} onClick={() => void execute(p)}>
                      Подтвердить
                    </HubButton>
                    <HubButton size="sm" variant="secondary" disabled={running === p.id} onClick={() => setConfirmId(null)}>
                      Отмена
                    </HubButton>
                  </div>
                ) : (
                  <HubButton size="sm" onClick={() => setConfirmId(p.id)}>
                    Выполнить
                  </HubButton>
                )}
              </li>
            ))}
          </ul>
        )}
        {!full ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t px-5 py-3 text-[12.5px] sm:px-6" style={{ ...hubSans, borderColor: hub.borderSoft, color: hub.textMuted }}>
            <span>
              {allProposals.length > proposals.length ? `Ещё предложений: ${allProposals.length - proposals.length}. ` : ""}
              Включено правил: {enabledCount} из {AGENT_RULE_KINDS.length}.
            </span>
            {onOpenAgents ? (
              <button type="button" onClick={onOpenAgents} className="font-semibold underline" style={{ color: hub.text }}>
                Настроить агента в разделе «Агенты»
              </button>
            ) : null}
          </div>
        ) : null}
        {Object.keys(done).length > 0 ? (
          <p className="border-t px-5 py-3 text-[12.5px] sm:px-6" style={{ ...hubSans, borderColor: hub.borderSoft, color: hub.green }}>
            Выполнено в этой сессии: {Object.keys(done).length}. Подробности в журнале действий (раздел «Агенты»).
          </p>
        ) : null}
      </HubPanel>

      {full ? (
      <HubPanel>
        <HubPanelHeader title="Правила" hint="Каждое правило выключено, пока вы его не включите. Параметры задаёте вы; суточные лимиты и подтверждение на деньги действуют всегда." />
        <ul className="divide-y" style={{ borderColor: hub.borderSoft }}>
          {rules.map((rule) => {
            const d = draftOf(rule);
            const meta = RULE_META[rule.kind];
            const dirty = Boolean(drafts[rule.kind]);
            return (
              <li key={rule.kind} className="space-y-3 px-5 py-4 sm:px-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold" style={{ ...hubSans, color: hub.text }}>
                      {meta.title}
                    </p>
                    <p className="mt-0.5 text-[12.5px] leading-5" style={{ ...hubSans, color: hub.textMuted }}>
                      {meta.description}
                    </p>
                  </div>
                  <label className="flex shrink-0 cursor-pointer items-center gap-2 text-[13px] font-semibold" style={{ ...hubSans, color: hub.text }}>
                    <input type="checkbox" checked={d.enabled} onChange={(e) => setDraft({ ...d, enabled: e.target.checked })} className="h-4 w-4" />
                    {d.enabled ? "Включено" : "Выключено"}
                  </label>
                </div>
                {meta.params.length > 0 ? (
                  <div className="grid gap-3 sm:grid-cols-3">
                    {meta.params.map((param) => (
                      <label key={param.key} className="block text-[12.5px]" style={{ ...hubSans, color: hub.textMuted }}>
                        {param.label}
                        <span className="mt-1 flex items-center gap-1.5">
                          <input
                            type="number"
                            min={param.min}
                            max={param.max}
                            step={param.step}
                            value={d.params[param.key] ?? param.default}
                            onChange={(e) => setDraft({ ...d, params: { ...d.params, [param.key]: Number(e.target.value) } })}
                            className="w-24 rounded-md border px-2 py-1 text-[13px]"
                            style={{ borderColor: hub.border, color: hub.text }}
                          />
                          <span>{param.unit}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                ) : null}
                <div className="flex flex-wrap items-center gap-3">
                  {rule.kind === "autopay" ? (
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-4 text-[12.5px]" style={{ ...hubSans, color: hub.text }}>
                        <label className="flex items-center gap-1.5">
                          <input type="radio" name={`mode-${rule.kind}`} checked={d.mode === "suggest"} onChange={() => setDraft({ ...d, mode: "suggest" })} />
                          Предлагать, я подтверждаю
                        </label>
                        <label className="flex items-center gap-1.5">
                          <input type="radio" name={`mode-${rule.kind}`} checked={d.mode === "auto"} onChange={() => setDraft({ ...d, mode: "auto" })} />
                          Автопилот: пополнять самому
                        </label>
                      </div>
                      {d.mode === "auto" ? (
                        <p className="text-[12px] leading-4" style={{ ...hubSans, color: hub.warn }}>
                          Автопилот пополняет кампании без вашего подтверждения, но только в рамках порога, суммы и суточного лимита выше, и не больше, чем на счёте продвижения. Он работает, когда на сервере подключён планировщик (переменная SELLER_HUB_AGENT_SECRET и вызов по расписанию). Пока планировщик не подключён, пополнения предлагаются здесь, и их нужно подтверждать.
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <span className="text-[12.5px]" style={{ ...hubSans, color: hub.textMuted }}>
                      Режим: <strong style={{ color: hub.text }}>предлагать</strong>, вы подтверждаете. Автопилот для этого правила: скоро.
                    </span>
                  )}
                  {dirty ? (
                    <HubButton size="sm" loading={saving === rule.kind} onClick={() => void saveRule(rule.kind)}>
                      Сохранить правило
                    </HubButton>
                  ) : null}
                  {ruleMessage[rule.kind] ? (
                    <span className="text-[12.5px]" style={{ ...hubSans, color: ruleMessage[rule.kind] === "Сохранено" ? hub.green : hub.danger }}>
                      {ruleMessage[rule.kind]}
                    </span>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </HubPanel>
      ) : null}

      {full && history.length > 0 ? (
        <HubPanel>
          <HubPanelHeader title="Последние действия по рекламе" hint="Из журнала: что менялось в кампаниях через KARTO." />
          <ul>
            {history.map((h) => (
              <li key={h.id} className="flex flex-wrap items-baseline justify-between gap-2 border-b px-5 py-2.5 text-[13px] last:border-b-0 sm:px-6" style={{ ...hubSans, borderColor: hub.borderSoft, color: hub.text }}>
                <span>
                  {ACTION_LABEL[h.action] ?? h.action}
                  {h.target_id != null ? ` · кампания ${h.target_id}` : ""}
                </span>
                <span style={{ color: h.result === "ok" ? hub.green : hub.danger }}>
                  {h.result === "ok" ? "выполнено" : "ошибка"} · {new Date(h.created_at).toLocaleString("ru-RU")}
                </span>
              </li>
            ))}
          </ul>
        </HubPanel>
      ) : null}
    </div>
  );
}
