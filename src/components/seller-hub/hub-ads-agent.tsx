"use client";

import { useEffect, useMemo, useState } from "react";
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
  loadSellerHubAdBidRecommendations,
  loadSellerHubAgentProposals,
  loadSellerHubAgentRules,
  resolveSellerHubAgentProposal,
  saveSellerHubAgentRule,
} from "@/lib/seller-hub/client-api";
import type { SellerAdBidRecommendation, SellerAdCampaignRow } from "@/lib/seller-hub/types";
import type { AdsData } from "./hub-ads-data";
import type { ReactNode } from "react";
import { hub, HubButton, hubSans } from "./hub-ui";
import { HubPanel as FramedPanel, HubPanelHeader as FramedHeader } from "./hub-fulfillment-ui";
import { AgentSkeleton, AgentSwitch, AgentTabs } from "./hub-agents-ui";
import { PanelEmpty, PanelGroup, PanelNumber, PanelRow, PanelSegmented } from "./hub-agents-panel";
import { useSellerHubSyncMode } from "./sync-mode-context";

/** Вид для раздела «Агенты»: блок без рамки и белой плашки, лежит на полотне и отделён линией. Внутренние боковые поля рамочного вида обнуляются. */
function FlatPanel({ children }: { children: ReactNode; className?: string }) {
  return (
    <section className="min-w-0 border-t pt-7 first:border-t-0 first:pt-0 [&_[class*='px-5']]:!px-0" style={{ borderColor: hub.border }}>
      {children}
    </section>
  );
}
function FlatHeader({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-1">
      <h2 className="text-balance text-[18px] font-semibold leading-6 tracking-[-0.01em]" style={{ ...hubSans, color: hub.text }}>
        {title}
      </h2>
      {hint ? (
        <p className="mt-1 max-w-[68ch] text-pretty text-[13px] leading-5" style={{ ...hubSans, color: hub.textSubtle }}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Агент рекламы: правила и очередь предложений. В режиме «предлагать» ничего не меняется без вашего подтверждения. */
export function HubAdsAgent({
  data,
  campaigns,
  accountRub,
  onCampaignsUpdate,
  variant = "full",
  onOpenAgents,
  rulesOnly = false,
}: {
  data: AdsData;
  campaigns: SellerAdCampaignRow[];
  accountRub: number | null;
  onCampaignsUpdate: (rows: SellerAdCampaignRow[]) => void;
  /** full — раздел «Агенты»: правила, очередь, журнал. compact — полоса в «Продвижении»: только ближайшие предложения. */
  variant?: "full" | "compact";
  onOpenAgents?: () => void;
  /** Только вкладка правил: для окна настроек. */
  rulesOnly?: boolean;
}) {
  const full = variant === "full";
  const HubPanel = full ? FlatPanel : FramedPanel;
  const HubPanelHeader = full ? FlatHeader : FramedHeader;
  const syncMode = useSellerHubSyncMode();
  // При фоновом сборе предложения насчитывает сервер и они копятся в базе; экран их только показывает.
  const serverMode = syncMode === "background";
  const [serverProposals, setServerProposals] = useState<AgentProposal[] | null>(null);
  const [serverReload, setServerReload] = useState(0);
  const [rules, setRules] = useState<AgentRule[]>(defaultRules());
  const [rulesLoaded, setRulesLoaded] = useState(false);
  const [rulesError, setRulesError] = useState<string | null>(null);
  const [depositedToday, setDepositedToday] = useState<Record<string, number>>({});
  const [recs, setRecs] = useState<SellerAdBidRecommendation[]>([]);
  const [drafts, setDrafts] = useState<Record<string, AgentRule>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [ruleMessage, setRuleMessage] = useState<Record<string, string>>({});
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [adsTab, setAdsTab] = useState<"proposals" | "rules">(rulesOnly ? "rules" : "proposals");
  const [running, setRunning] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState<Record<string, string>>({});

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
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!serverMode) return;
    let cancelled = false;
    const load = () =>
      void loadSellerHubAgentProposals().then((res) => {
        if (cancelled || !res.ok) return;
        setServerProposals(res.proposals.filter((p) => p.status === "open" && p.rule !== "playbook").map((p) => ({ id: p.id, rule: p.rule as AgentProposal["rule"], title: p.title, facts: p.facts, effect: p.effect, risk: p.risk, action: p.action })));
      });
    load();
    const timer = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [serverMode, serverReload]);

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
  // Серверные предложения плюс те, что сервер не считает сам (подъём ставки читает рекомендации WB по конкретным парам).
  const localProposals = serverMode && serverProposals ? result.proposals.filter((p) => p.rule === "bid_climb") : result.proposals;
  const allProposals = [...(serverMode && serverProposals ? serverProposals : []), ...localProposals].filter((p) => !done[p.id]);
  const isServerRow = (id: string) => Boolean(serverProposals?.some((p) => p.id === id));
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
    if (res.simulated) {
      // Тестовый режим: показываем сообщение, предложение остаётся открытым и не помечается неудачным.
      setFailed((prev) => ({ ...prev, [p.id]: res.error ?? "Тестовый режим" }));
      return;
    }
    if (!res.ok) {
      setFailed((prev) => ({ ...prev, [p.id]: res.error ?? "Не удалось выполнить" }));
      if (isServerRow(p.id)) void resolveSellerHubAgentProposal(p.id, "failed", res.error ?? "Не удалось выполнить").then(() => setServerReload((n) => n + 1));
      return;
    }
    if (isServerRow(p.id)) void resolveSellerHubAgentProposal(p.id, "done", "Выполнено из раздела «Агенты»").then(() => setServerReload((n) => n + 1));
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

  if (full) {
    const SHORT: Record<string, string> = {
      autopay: "Пополняет кампанию, когда остаток упал ниже порога",
      waste_guard: "Пауза или удаление товара, где расход выше маржи, а заказов нет",
      drr_guard: "Снижает ставку, если ДРР выше маржи",
      test_ads: "Тестовая кампания для товаров без продвижения, без запуска и списаний",
      bid_climb: "Поднимает ставку, где есть запас по марже",
    };
    return (
      <div className="space-y-7">
        {rulesOnly ? null : (
        <AgentTabs
          label="Реклама"
          value={adsTab}
          onChange={setAdsTab}
          options={[
            { id: "proposals", label: "Предложения", count: allProposals.length },
            { id: "rules", label: `Правила · ${enabledCount} из ${AGENT_RULE_KINDS.length}` },
          ]}
        />
        )}

        {adsTab === "proposals" ? (
          !rulesLoaded ? (
            <AgentSkeleton rows={4} className="max-w-xl" />
          ) : allProposals.length === 0 ? (
            <PanelEmpty>
              {enabledCount === 0 ? "Все правила выключены. Включите нужные на вкладке «Правила», и агент начнёт предлагать действия." : "Предложений нет: по включённым правилам всё в порядке."}
              {result.skipped.length > 0 ? ` Не сделано: ${result.skipped.map((s) => s.text).join("; ")}.` : ""}
            </PanelEmpty>
          ) : (
            <ul className="space-y-3">
              {allProposals.map((p) => (
                <li key={p.id} className="rounded-[18px] p-4" style={{ backgroundColor: "rgba(46, 90, 67, 0.045)" }}>
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 text-[14.5px] font-semibold leading-5 [overflow-wrap:anywhere]" style={{ ...hubSans, color: hub.text }}>
                      {p.title}
                    </p>
                    <span className="flex shrink-0 items-center gap-1.5 text-[12.5px]" style={{ ...hubSans, color: hub.textSubtle }}>
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: p.risk === "low" ? "#10B981" : p.risk === "medium" ? "#F59E0B" : "#EF4444" }} aria-hidden />
                      {p.risk === "low" ? "низкий риск" : p.risk === "medium" ? "средний риск" : "высокий риск"}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[12.5px]" style={{ ...hubSans, color: hub.textSubtle }}>
                    {p.rule === "playbook" ? "Сценарий цен" : RULE_META[p.rule].title}
                  </p>
                  <ul className="mt-3 space-y-1">
                    {p.facts.map((f) => (
                      <li key={f} className="text-[13.5px] leading-5" style={{ ...hubSans, color: hub.textMuted }}>
                        {f}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 text-[13.5px] leading-5" style={{ ...hubSans, color: hub.text }}>
                    <span style={{ color: hub.textSubtle }}>Изменится: </span>
                    {p.effect}
                  </p>
                  {failed[p.id] ? (
                    <p className="mt-2 text-[13.5px]" style={{ ...hubSans, color: hub.danger }}>
                      {failed[p.id]}
                    </p>
                  ) : null}
                  {confirmId === p.id ? (
                    <div className="hub-fade-in mt-3 flex flex-wrap items-center gap-2 rounded-[12px] px-3 py-2.5" style={{ backgroundColor: hub.warnSoft }}>
                      <span className="min-w-0 flex-1 text-[13.5px]" style={{ ...hubSans, color: hub.warn }}>
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
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <HubButton size="sm" onClick={() => setConfirmId(p.id)}>
                        Выполнить
                      </HubButton>
                      {isServerRow(p.id) ? (
                        <HubButton
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setDone((prev) => ({ ...prev, [p.id]: "Отклонено" }));
                            void resolveSellerHubAgentProposal(p.id, "dismissed").then(() => setServerReload((n) => n + 1));
                          }}
                        >
                          Не надо
                        </HubButton>
                      ) : null}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )
        ) : (
          <div className="space-y-3">
            {rulesError ? (
              <p className="text-[13.5px]" style={{ ...hubSans, color: hub.danger }}>
                {rulesError}
              </p>
            ) : null}
            <PanelGroup>
              {rules.map((rule) => {
                const d = draftOf(rule);
                const meta = RULE_META[rule.kind];
                const dirty = Boolean(drafts[rule.kind]);
                const hasBody = d.enabled && (meta.params.length > 0 || rule.kind === "autopay" || dirty || Boolean(ruleMessage[rule.kind]));
                return (
                  <PanelRow key={rule.kind} title={meta.title} hint={SHORT[rule.kind] ?? meta.description} control={<AgentSwitch label={meta.title} checked={d.enabled} onChange={(v) => setDraft({ ...d, enabled: v })} />}>
                    {hasBody || dirty || ruleMessage[rule.kind] ? (
                      <div className="hub-fade-in space-y-2.5">
                        {d.enabled
                          ? meta.params.map((param) => (
                              <div key={param.key} className="flex items-center justify-between gap-4">
                                <span className="min-w-0 text-[13.5px] leading-5" style={{ ...hubSans, color: hub.textMuted }}>
                                  {param.label}
                                </span>
                                <PanelNumber label={param.label} unit={param.unit} min={param.min} max={param.max} step={param.step} value={d.params[param.key] ?? param.default} onCommit={(v) => setDraft({ ...d, params: { ...d.params, [param.key]: v } })} />
                              </div>
                            ))
                          : null}
                        {d.enabled && rule.kind === "autopay" ? (
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-[13.5px]" style={{ ...hubSans, color: hub.textMuted }}>
                              Режим
                            </span>
                            <PanelSegmented
                              label="Режим автопополнения"
                              value={d.mode}
                              onChange={(m) => setDraft({ ...d, mode: m })}
                              options={[
                                { id: "suggest", label: "Предлагать" },
                                { id: "auto", label: "Автопилот" },
                              ]}
                            />
                          </div>
                        ) : null}
                        {d.enabled && rule.kind === "autopay" && d.mode === "auto" ? (
                          <p className="text-[12.5px] leading-[1.45]" style={{ ...hubSans, color: hub.warn }}>
                            Пополняет без подтверждения, но в пределах порога, суммы и суточного лимита и не больше, чем на счёте.
                          </p>
                        ) : null}
                        {dirty || ruleMessage[rule.kind] ? (
                          <div className="flex items-center justify-end gap-3">
                            {ruleMessage[rule.kind] ? (
                              <span className="text-[13px]" style={{ ...hubSans, color: ruleMessage[rule.kind] === "Сохранено" ? hub.greenDark : hub.danger }}>
                                {ruleMessage[rule.kind]}
                              </span>
                            ) : null}
                            {dirty ? (
                              <HubButton size="sm" loading={saving === rule.kind} onClick={() => void saveRule(rule.kind)}>
                                Сохранить правило
                              </HubButton>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </PanelRow>
                );
              })}
            </PanelGroup>
            <p className="px-0.5 text-[12.5px] leading-5" style={{ ...hubSans, color: hub.textSubtle }}>
              Суточные лимиты и подтверждение на деньги действуют всегда.
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={full ? "space-y-8" : "space-y-5"}>
      <HubPanel>
        <HubPanelHeader title={`${full ? "Предложения агента" : "Агент рекламы предлагает"}${allProposals.length > 0 ? ` · ${allProposals.length}` : ""}`} hint={full ? "Каждое предложение — факты, что изменится и чем рискуем. Выполняется после вашего подтверждения." : "Агент считает по правилам, которые вы настроили в разделе «Агенты», и выполняет после вашего подтверждения."} />
        {!rulesLoaded ? (
          <p className="px-5 py-5 text-[14.5px] sm:px-6" style={{ ...hubSans, color: hub.textMuted }}>
            Загружаю правила…
          </p>
        ) : proposals.length === 0 ? (
          <p className="px-5 py-5 text-[15px] leading-5 sm:px-6" style={{ ...hubSans, color: hub.textMuted }}>
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
                  <span className="rounded-md px-2 py-0.5 text-[14px] font-semibold" style={{ ...hubSans, backgroundColor: p.risk === "low" ? hub.greenSoft : hub.warnSoft, color: p.risk === "low" ? hub.green : hub.warn }}>
                    {p.risk === "low" ? "низкий риск" : p.risk === "medium" ? "средний риск" : "высокий риск"} · {p.rule === "playbook" ? "Сценарий цен" : RULE_META[p.rule].title}
                  </span>
                </div>
                <ul className="list-disc space-y-0.5 pl-5 text-[14.5px] leading-5" style={{ ...hubSans, color: hub.textMuted }}>
                  {p.facts.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
                <p className="text-[14.5px] leading-5" style={{ ...hubSans, color: hub.text }}>
                  <strong>Что изменится:</strong> {p.effect}
                </p>
                {failed[p.id] ? (
                  <p className="text-[14px]" style={{ ...hubSans, color: hub.danger }}>
                    {failed[p.id]}
                  </p>
                ) : null}
                {confirmId === p.id ? (
                  <div className="flex flex-wrap items-center gap-2 rounded-lg px-3 py-2" style={{ backgroundColor: hub.warnSoft }}>
                    <span className="text-[14.5px]" style={{ ...hubSans, color: hub.warn }}>
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
                  <div className="flex flex-wrap items-center gap-2">
                    <HubButton size="sm" onClick={() => setConfirmId(p.id)}>
                      Выполнить
                    </HubButton>
                    {isServerRow(p.id) ? (
                      <HubButton
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setDone((prev) => ({ ...prev, [p.id]: "Отклонено" }));
                          void resolveSellerHubAgentProposal(p.id, "dismissed").then(() => setServerReload((n) => n + 1));
                        }}
                      >
                        Не надо
                      </HubButton>
                    ) : null}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {!full ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t px-5 py-3 text-[14px] sm:px-6" style={{ ...hubSans, borderColor: hub.borderSoft, color: hub.textMuted }}>
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
        {Object.values(done).some((v) => v === "Выполнено") ? (
          <p className="border-t px-5 py-3 text-[14px] sm:px-6" style={{ ...hubSans, borderColor: hub.borderSoft, color: hub.green }}>
            Выполнено в этой сессии: {Object.values(done).filter((v) => v === "Выполнено").length}. Подробности в журнале действий (раздел «Агенты»).
          </p>
        ) : null}
      </HubPanel>

    </div>
  );
}
