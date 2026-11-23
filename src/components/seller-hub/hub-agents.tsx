"use client";

import type { SellerProductEvent } from "@/lib/seller-hub/event-engine/types";
import type { TaskFocus } from "./task-focus";
import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Megaphone, Pause, Play, ShieldCheck, Tag, Truck, Zap } from "lucide-react";
import { readHubJournal } from "@/lib/seller-hub/journal";
import { readHubScenarios, writeHubScenarios, type HubScenario } from "@/lib/seller-hub/scenarios";
import { hub, HubButton, hubSans } from "./hub-ui";
import { HubActionJournal } from "./hub-action-journal";
import { HubAgentsAds } from "./hub-agents-ads";
import { HubAiActivity } from "./hub-ai-activity";
import { HubAutopilot } from "./hub-autopilot";
import { HubAgentReport } from "./hub-agent-report";
import { HubAiRules } from "./hub-ai-rules";
import { HubAgentsLogistics } from "./hub-agents-logistics";
import { HubAgentsOverview, type AgentsTab } from "./hub-agents-overview";
import { AgentTabs, agentDateTime } from "./hub-agents-ui";
import { PanelGroup, PanelRow, PanelSection, PanelStat } from "./hub-agents-panel";
import { AgentDrawer } from "./hub-agents-drawer";
import { AgentSwitch } from "./hub-agents-ui";
import { useUserSetting } from "./use-user-setting";
import { AccessSwitches } from "./hub-agents-settings";
import { SettingsWindow, type SettingsNavItem } from "./hub-settings-window";
import { useAutoAi } from "./use-auto-ai";
import type { FulfillmentTab } from "@/lib/seller-hub/fulfillment-center";
import type { SellerAdCampaignRow, SellerCatalogSnapshot } from "@/lib/seller-hub/types";

/**
 * Раздел «Агенты»: один агент с несколькими направлениями работы. Здесь и только здесь он настраивается (правила, автопилот, пределы) и отчитывается (журнал).
 * В остальных разделах кабинета видны только его предложения с кнопкой «Выполнить».
 */

type ScenarioAgent = HubScenario["agent"];

type Panel = "setup" | "journal" | null;
type Direction = "comms" | "rules" | "proposals";
type Area = "access" | "autopilot" | "prices" | "ads" | "logistics";

const DIRECTIONS: Array<{ id: Direction; label: string; hint: string }> = [
  { id: "comms", label: "Отзывы и автоответы", hint: "Ответы на отзывы и вопросы покупателей" },
  { id: "proposals", label: "Ждёт решения", hint: "Предложения агента по рекламе" },
];

const RULES_NAV: Array<SettingsNavItem<Area>> = [
  { id: "access", label: "Доступ", icon: ShieldCheck, hint: "Что агенту можно", description: "Где агент может действовать и в каком режиме он работает." },
  { id: "autopilot", label: "Автопилот", icon: Zap, hint: "Что делает сам", description: "Что агент выполняет сам, пока вы заняты." },
  { id: "prices", label: "Цены", icon: Tag, hint: "Границы изменений", description: "Пределы, за которые агент не выйдет, меняя цены и скидки." },
  { id: "ads", label: "Реклама", icon: Megaphone, hint: "Правила агента", description: "Когда агент предлагает действия по рекламе и сколько ему можно тратить." },
  { id: "logistics", label: "Логистика", icon: Truck, hint: "Напоминания", description: "О чём и когда агент напоминает по заказам и поставкам." },
];

/** Старые адреса из других разделов («Настроить агента») открывают нужное место. Цены, реклама и логистика теперь вкладки в «Правилах агента»; очередь рекламных предложений открывается как «Ждёт решения». */
function resolveTab(value: string | null): { panel: Panel; open: Direction | null; area: Area } {
  if (value === "journal") return { panel: "journal", open: null, area: "access" };
  if (value === "ads" || value === "logistics" || value === "prices") return { panel: "setup", open: "rules", area: value };
  if (value === "rules") return { panel: "setup", open: "rules", area: "access" };
  if (value === "comms" || value === "proposals") return { panel: "setup", open: value, area: "access" };
  return { panel: null, open: null, area: "access" };
}

const AGENT_NOTE: Record<"prices" | "comms", string> = {
  prices: "В WB уходит только тот список, который вы подтвердили.",
  comms: "Агент не заменяет автоответы, а подсказывает, где отзывы мешают продажам.",
};

const AGENT_TASKS: Record<"prices" | "comms", string[]> = {
  prices: ["Чуть увеличь скидку на товары с запасом", "Покажи товары без цены"],
  comms: ["Что с отзывами без ответа?", "Открой автоответы по этому магазину"],
};

const JOURNAL_WORD: Record<"prices" | "comms", string> = { prices: "скид", comms: "отзыв" };

const SCHEDULE_LABEL = {
  once: "один раз",
  regular: "регулярно",
  manual: "вручную",
} as const;

export function HubAgents({ onAsk, snapshot, connected, onAdsUpdate, onOpenFulfillment, onOpenTasks, onOpenKb, onOpenSection, events }: { events?: SellerProductEvent[]; onAsk: (prompt?: string) => void; snapshot?: SellerCatalogSnapshot; connected?: boolean; onAdsUpdate?: (campaigns: SellerAdCampaignRow[]) => void; onOpenFulfillment?: (tab: FulfillmentTab) => void; onOpenTasks?: (focus?: TaskFocus) => void; onOpenKb?: (id: string) => void; onOpenSection?: (id: string) => void }) {
  const [state, setState] = useState<{ panel: Panel; open: Direction | null; area: Area }>(() => {
    if (typeof window === "undefined") return { panel: null, open: null, area: "access" };
    try {
      const wanted = sessionStorage.getItem("karto-hub-agents-tab");
      sessionStorage.removeItem("karto-hub-agents-tab");
      return resolveTab(wanted);
    } catch {
      return { panel: null, open: null, area: "access" };
    }
  });
  const [prefill, setPrefill] = useState<{ text: string; n: number } | null>(null);
  const [sandbox, setSandbox] = useUserSetting<boolean>("agent.sandbox", true);
  const autoAi = useAutoAi();
  const [journalTab, setJournalTab] = useState<"actions" | "plans" | "week">("actions");

  const goTab = (tab: AgentsTab) => setState(tab === "overview" ? { panel: null, open: null, area: "access" } : resolveTab(tab));
  const close = () => setState((prev) => ({ ...prev, panel: null }));

  return (
    <>
      <HubAgentsOverview snapshot={snapshot} onTab={goTab} onAsk={onAsk} prefill={prefill} onOpenTasks={onOpenTasks} onOpenKb={onOpenKb} onOpenSection={onOpenSection} events={events} />

      <SettingsWindow open={state.panel === "setup" && state.open === "rules"} onClose={close} title="Правила агента" subtitle="Что агент может делать и в каких границах" items={RULES_NAV} active={state.area} onSelect={(area) => setState((prev) => ({ ...prev, area }))}>
        {state.area === "access" ? (
          <div className="space-y-9">
            <PanelSection title="Режим работы">
              <PanelGroup>
                <PanelRow title="Тестовый режим" hint={sandbox ? "Агент работает как обычно, но в Wildberries ничего не отправляет" : "Боевой режим: подтверждённые действия уходят в Wildberries"} control={<AgentSwitch checked={sandbox} onChange={setSandbox} label="Тестовый режим" />} />
                <PanelRow title="Анализ по изменению данных" hint="Агент сам пересматривает карточки и кампании, когда меняются данные кабинета" control={<AgentSwitch checked={autoAi.enabled} onChange={autoAi.setEnabled} label="Анализ по изменению данных" />} />
              </PanelGroup>
            </PanelSection>
            <AccessSwitches />
          </div>
        ) : null}
        {state.area === "autopilot" ? <HubAutopilot /> : null}
        {state.area === "prices" ? <HubAiRules part="limits" /> : null}
        {state.area === "ads" ? <HubAgentsAds snapshot={snapshot} connected={connected} onAdsUpdate={onAdsUpdate} rulesOnly /> : null}
        {state.area === "logistics" ? <HubAgentsLogistics snapshot={snapshot} connected={connected} onOpenFulfillment={(t) => onOpenFulfillment?.(t)} remindersOnly /> : null}
      </SettingsWindow>

      {DIRECTIONS.map((d) => (
        <AgentDrawer key={d.id} modal open={state.panel === "setup" && state.open === d.id} title={d.label} subtitle={d.hint} onClose={close}>
          {d.id === "proposals" ? <HubAgentsAds snapshot={snapshot} connected={connected} onAdsUpdate={onAdsUpdate} /> : null}
          {d.id === "comms" ? (
            <ScenarioDirection
              agent="comms"
              onAsk={(prompt) => {
                close();
                if (prompt) setPrefill({ text: prompt, n: Date.now() });
              }}
            />
          ) : null}
        </AgentDrawer>
      ))}

      <AgentDrawer modal open={state.panel === "journal"} title="Журнал" subtitle="Что агент и вы делали в кабинете" onClose={close}>
        <div className="space-y-7">
          <AgentTabs
            label="Журнал"
            value={journalTab}
            onChange={setJournalTab}
            options={[
              { id: "actions", label: "Действия" },
              { id: "plans", label: "Планы" },
              { id: "week", label: "Неделя" },
            ]}
          />
          {journalTab === "actions" ? <HubActionJournal /> : journalTab === "plans" ? <HubAiActivity /> : <HubAgentReport />}
        </div>
      </AgentDrawer>
    </>
  );
}

/** Направления «Цены» и «Отзывы»: сводка, быстрые задачи для чата и расписание сценариев. */
function ScenarioDirection({ agent, onAsk }: { agent: Extract<ScenarioAgent, "prices" | "comms">; onAsk: (prompt?: string) => void }) {
  const [rows, setRows] = useState<HubScenario[]>(() => readHubScenarios());
  const [now] = useState(() => Date.now());
  const mine = rows.filter((row) => row.agent === agent);
  const planned = mine.filter((row) => row.status !== "done");
  const doneWeek = mine.filter((row) => row.status === "done" && now - new Date(row.createdAt).getTime() < 7 * 24 * 60 * 60 * 1000).length;
  const lastRun = [...mine].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const journalCount = readHubJournal().filter((row) => row.title.toLowerCase().includes(JOURNAL_WORD[agent])).length;

  function patch(id: string, status: HubScenario["status"]) {
    const next = rows.map((row) => (row.id === id ? { ...row, status } : row));
    writeHubScenarios(next);
    setRows(next);
  }

  return (
    <div className="space-y-9">
      {agent === "comms" ? (
        <PanelGroup>
          <PanelRow
            title="Автоответы на отзывы"
            hint="Правила ответов, стиль бренда, проверка перед отправкой"
            control={
              <Link href="/studio/auto-replies/workspace" className="inline-flex">
                <HubButton variant="dark" size="sm">
                  Открыть
                  <ArrowUpRight className="h-4 w-4" />
                </HubButton>
              </Link>
            }
          />
        </PanelGroup>
      ) : null}

      <dl className="grid grid-cols-3 gap-x-6 rounded-[18px] px-5 py-5" style={{ backgroundColor: "rgba(46, 90, 67, 0.045)" }}>
        <PanelStat value={doneWeek} label="выполнено за 7 дней" />
        <PanelStat value={journalCount} label="записей в журнале" />
        <PanelStat value={lastRun ? agentDateTime(lastRun.createdAt) : "—"} label="последний запуск" />
      </dl>

      <PanelSection title="Быстрые задачи" hint="Нажмите, и текст появится в поле задачи агента.">
        <PanelGroup>
          {AGENT_TASKS[agent].map((task) => (
            <div key={task} style={{ borderColor: "rgba(1, 20, 8, 0.08)" }}>
              <button type="button" onClick={() => onAsk(task)} className="group/row flex w-full items-center justify-between gap-4 rounded-lg py-3.5 text-left text-[14.5px] font-medium outline-none transition-colors duration-150 focus-visible:shadow-[0_0_0_2px_var(--hub-lime-ring)]" style={{ ...hubSans, color: hub.text }}>
                <span className="min-w-0 [overflow-wrap:anywhere]">{task}</span>
                <ArrowUpRight className="h-4 w-4 shrink-0 transition-transform duration-150 group-hover/row:-translate-y-0.5 group-hover/row:translate-x-0.5" style={{ color: hub.textSubtle }} aria-hidden />
              </button>
            </div>
          ))}
        </PanelGroup>
      </PanelSection>

      <PanelSection title={planned.length > 0 ? `По расписанию · ${planned.length}` : "По расписанию"}>
        {planned.length === 0 ? (
          <p className="px-0.5 text-[13.5px] leading-5" style={{ ...hubSans, color: hub.textSubtle }}>
            Пока пусто. Поставьте задачу агенту в чате, и она появится здесь, если оставить её регулярной.
          </p>
        ) : (
          <ul>
            {planned.map((row) => (
              <li key={row.id} className="border-t py-4 first:border-t-0" style={{ borderColor: "rgba(1, 20, 8, 0.08)" }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[14.5px] font-semibold leading-5 [overflow-wrap:anywhere]" style={{ ...hubSans, color: hub.text }}>
                      {row.title}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-[12.5px]" style={{ ...hubSans, color: hub.textSubtle }}>
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: row.status === "paused" ? "#F59E0B" : "#10B981" }} aria-hidden />
                      {row.status === "paused" ? "на паузе" : "активен"} · {SCHEDULE_LABEL[row.schedule]}
                    </p>
                  </div>
                  {row.status === "active" ? (
                    <HubButton size="sm" variant="secondary" onClick={() => patch(row.id, "paused")}>
                      <Pause className="h-3.5 w-3.5" />
                      Пауза
                    </HubButton>
                  ) : (
                    <HubButton size="sm" variant="secondary" onClick={() => patch(row.id, "active")}>
                      <Play className="h-3.5 w-3.5" />
                      Включить
                    </HubButton>
                  )}
                </div>
                <ol className="mt-2.5 space-y-1">
                  {row.steps.map((step, i) => (
                    <li key={step} className="flex gap-2.5 text-[13.5px] leading-5 [overflow-wrap:anywhere]" style={{ ...hubSans, color: hub.textMuted }}>
                      <span className="w-4 shrink-0 text-right tabular-nums" style={{ color: hub.textSubtle }}>
                        {i + 1}
                      </span>
                      {step}
                    </li>
                  ))}
                </ol>
                <p className="mt-2 text-[12.5px] leading-5" style={{ ...hubSans, color: hub.textSubtle }}>
                  Стоп-лосс: маржа не ниже {row.stopLossMarginPct}% без отдельного подтверждения.
                </p>
              </li>
            ))}
          </ul>
        )}
      </PanelSection>

      <p className="px-0.5 text-[12.5px] leading-5" style={{ ...hubSans, color: hub.textSubtle }}>
        {AGENT_NOTE[agent]}
      </p>
    </div>
  );
}
