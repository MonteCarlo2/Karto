"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { SellerTask, TaskCategory } from "@/lib/seller-hub/task-engine/types";
import { taskDisplayTitle, taskStory } from "@/lib/seller-hub/task-engine/story";
import { useSectionTasks } from "./use-section-tasks";
import { setEvidenceFocus } from "./evidence-focus";
import { ArrowRight, Menu, Package, ShoppingBag, Truck, Warehouse, X } from "lucide-react";
import { SUPPLY_WRITE_ENABLED } from "@/lib/seller-hub/feature-flags";
import { buildSupplyFromOrders } from "@/lib/seller-hub/fbs-exec";
import { ruPlural } from "@/lib/seller-hub/task-engine/ru-plural";
import type { FulfillmentProposal, FulfillmentTab } from "@/lib/seller-hub/fulfillment-center";
import type { SellerCatalogSnapshot } from "@/lib/seller-hub/types";
import { hub, HubButton, hubSans, hubSerif, hubType } from "./hub-ui";
import { AnalyticsMotion } from "./hub-analytics-ui";
import { PrimaryTabs, SideCard } from "./hub-fulfillment-ui";
import { HubToast, useHubToast, type HubToastState } from "./hub-toast";
import { useFulfillment } from "./use-fulfillment";
import { HubFulfillmentThresholds } from "./hub-fulfillment-thresholds";

export type { FulfillmentTab };
export type FulfillmentData = ReturnType<typeof useFulfillment>;

const LEVEL_TONE = {
  action: { bar: "#E5484D", label: "Сделать", color: hub.danger, bg: hub.dangerSoft },
  watch: { bar: "#E6A23C", label: "Присмотреться", color: hub.warn, bg: hub.warnSoft },
  info: { bar: "#2F6FED", label: "К сведению", color: hub.blue, bg: hub.blueSoft },
} as const;

const SHOWN = 3;

/** Рекомендации: человек сам меняет что-то в жизни (раньше отгружать, упаковку), платформа тут ничего не исполнит. В «Задачи» они не попадают. */
const ADVICE_KINDS = new Set<string>(["slow_shipping", "late_orders", "no_ship_days", "returns_high", "cost_growth"]);
const ADVICE_TONE = { bar: "#7C877D", label: "Совет", color: "#3E4C3F", bg: "#ECEFE9" } as const;

/** Конспект для плитки: первое предложение целиком, без обрезки и многоточий. Длинное предложение режем по запятой или тире. */
function shortText(text: string): string {
  const first = (text.split(/(?<=[.!?])\s+/)[0] ?? text).trim();
  if (first.length <= 170) return first;
  const cut = Math.max(first.lastIndexOf(", ", 150), first.lastIndexOf("; ", 150), first.lastIndexOf(" — ", 150), first.lastIndexOf(": ", 150));
  return cut > 60 ? `${first.slice(0, cut)}.` : first;
}

const SEVERITY_TONE = { critical: LEVEL_TONE.action, important: LEVEL_TONE.watch, opportunity: LEVEL_TONE.info } as const;

/** Настоящая задача платформы: коротко, что случилось, и переход в «Задачи» на нужную категорию. */
export function TaskTile({ task, onOpen }: { task: SellerTask; onOpen: (task: SellerTask) => void }) {
  const tone = SEVERITY_TONE[task.severity];
  const story = taskStory(task);
  const detail = story?.action ?? story?.fact ?? task.description;
  const label = task.severity === "critical" ? "Срочно" : task.severity === "important" ? "Важно" : "Возможность";
  return (
    <li className="mb-3 rounded-[20px] border p-4" style={{ borderColor: `color-mix(in srgb, ${tone.bar} 38%, white)`, background: `linear-gradient(160deg, color-mix(in srgb, ${tone.bar} 12%, white), ${hub.canvas} 75%)` }}>
      <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-semibold" style={{ ...hubSans, color: tone.color, backgroundColor: tone.bg }}>
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: tone.bar }} aria-hidden />
        {label}
      </span>
      <p className="mt-2.5 text-[16.5px] font-semibold leading-[1.35] [overflow-wrap:anywhere]" style={{ ...hubSans, color: hub.text }}>
        {taskDisplayTitle(task)}
      </p>
      {task.productTitle ? (
        <p className="mt-1 text-[13.5px] font-medium leading-[1.4] [overflow-wrap:anywhere]" style={{ ...hubSans, color: hub.textSubtle }}>
          {task.productTitle}
        </p>
      ) : null}
      <p className="mt-2 text-[14.5px] leading-[1.55]" style={{ ...hubSans, color: hub.textMuted }}>
        {shortText(detail)}
      </p>
      <div className="mt-4">
        <HubButton size="sm" variant="secondary" onClick={() => onOpen(task)}>
          Открыть задачу
          <ArrowRight className="h-3.5 w-3.5" />
        </HubButton>
      </div>
    </li>
  );
}

export function ProposalRow({
  proposal,
  connected,
  onOpen,
  onBuilt,
}: {
  proposal: FulfillmentProposal;
  connected: boolean;
  onOpen: (tab: FulfillmentTab) => void;
  onBuilt: (message: string, ok: boolean) => void;
}) {
  const advice = ADVICE_KINDS.has(proposal.kind);
  const tone = advice ? ADVICE_TONE : LEVEL_TONE[proposal.level];
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  /** Поставка уже создана отсюда: повторное нажатие создало бы вторую поставку с теми же заказами, пока снимок не обновился. */
  const [createdId, setCreatedId] = useState<string | null>(null);
  const build = proposal.buildSupply && proposal.buildSupply.orderIds.length > 0 ? proposal.buildSupply : null;

  async function run() {
    if (!build || busy || createdId) return;
    setBusy(true);
    try {
      const res = await buildSupplyFromOrders(build.orderIds);
      // Даже при частичной неудаче поставка в WB уже есть: блокируем повтор, номер указан в сообщении.
      if (res.supplyId) setCreatedId(res.supplyId);
      onBuilt(res.ok ? `Поставка ${res.supplyId} создана, заказов в ней: ${res.added}. Передайте её в доставку во вкладке «Поставки».` : (res.error ?? "Не удалось создать поставку"), res.ok);
    } catch (e) {
      onBuilt(e instanceof Error ? e.message : "Не удалось создать поставку", false);
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  }

  return (
    <li className="mb-3 rounded-[20px] border p-4" style={{ borderColor: `color-mix(in srgb, ${tone.bar} 38%, white)`, background: `linear-gradient(160deg, color-mix(in srgb, ${tone.bar} 12%, white), ${hub.canvas} 75%)` }}>
      <div>
        <div className="min-w-0 flex-1">
          <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-semibold" style={{ ...hubSans, color: tone.color, backgroundColor: tone.bg }}>
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: tone.bar }} aria-hidden />
            {tone.label}
          </span>
          <p className="mt-2.5 text-[16.5px] font-semibold leading-[1.35] [overflow-wrap:anywhere]" style={{ ...hubSans, color: hub.text }}>
            {advice && proposal.advice ? proposal.advice : proposal.title}
          </p>
          <p className="mt-2 text-[14.5px] leading-[1.55]" style={{ ...hubSans, color: hub.textMuted }}>
            {advice && proposal.why ? proposal.why : shortText(proposal.detail)}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {build && connected && SUPPLY_WRITE_ENABLED && createdId ? (
              <span className="text-[14px] font-medium" style={{ ...hubSans, color: hub.green }}>
                Поставка {createdId} создана. Обновите данные, чтобы список заказов пересчитался.
              </span>
            ) : build && connected && SUPPLY_WRITE_ENABLED ? (
              confirm ? (
                <>
                  <span className="text-[14px]" style={{ ...hubSans, color: hub.text }}>
                    Создать поставку и добавить {build.orderIds.length} {ruPlural(build.orderIds.length, "заказ", "заказа", "заказов")}?
                  </span>
                  <HubButton size="sm" loading={busy} onClick={() => void run()}>
                    Да, создать
                  </HubButton>
                  <HubButton size="sm" variant="ghost" onClick={() => setConfirm(false)}>
                    Нет
                  </HubButton>
                </>
              ) : (
                <HubButton size="sm" variant="dark" onClick={() => setConfirm(true)}>
                  <Package className="h-3.5 w-3.5" />
                  Собрать поставку ({build.orderIds.length})
                </HubButton>
              )
            ) : null}
            {proposal.tab ? (
              <HubButton
                size="sm"
                variant="secondary"
                onClick={() => {
                  if (proposal.evidence) setEvidenceFocus({ sub: proposal.evidence.sub, anchor: proposal.evidence.anchor });
                  onOpen(proposal.tab!);
                }}
              >
                {advice ? "Показать расчёт" : "Открыть"}
                <ArrowRight className="h-3.5 w-3.5" />
              </HubButton>
            ) : null}
          </div>
        </div>
      </div>
    </li>
  );
}

/** Объединённый раздел «Заказы и логистика»: сверху что сделать сейчас, ниже вкладки (заказы, поставки, склады и регионы). */
export function HubFulfillment({
  tab,
  onTab,
  snapshot,
  connected,
  onOpenMenu,
  onOpenTasks,
  children,
}: {
  tab: FulfillmentTab;
  onTab: (tab: FulfillmentTab) => void;
  snapshot?: SellerCatalogSnapshot;
  connected?: boolean;
  /** Больше не используется: кнопка «Агент» убрана из панели задач. */
  onOpenAgents?: () => void;
  onOpenMenu?: () => void;
  /** Открыть раздел «Задачи»: на категории или сразу на конкретной задаче. */
  onOpenTasks?: (category: TaskCategory, task?: SellerTask) => void;
  children: (data: FulfillmentData) => ReactNode;
}) {
  const data = useFulfillment(snapshot, connected);
  const [allOpen, setAllOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toast, setToast] = useState<HubToastState | null>(null);
  const { makeToast } = useHubToast();
  const section = useSectionTasks(snapshot, connected, ["stock"]);
  /** Собственные предложения (заказы, поставки) и задачи платформы по складу в одном списке. */
  /** Задачи и советы в одном списке, по важности: ничего не вынесено отдельно. */
  const TASK_RANK = { critical: 0, important: 1, opportunity: 2 } as const;
  const PROPOSAL_RANK = { action: 0, watch: 1, info: 2 } as const;
  const rows = [
    ...data.proposals.map((p) => ({ kind: "proposal" as const, id: `p:${p.id}`, proposal: p, rank: PROPOSAL_RANK[p.level] })),
    ...section.tasks.map((t) => ({ kind: "task" as const, id: `t:${t.id}`, task: t, rank: TASK_RANK[t.severity] })),
  ].sort((a, b) => a.rank - b.rank);
  const shownRows = rows.slice(0, SHOWN);
  const hiddenCount = rows.length - shownRows.length;
  const stillLoading = data.speedLoading || section.loading;
  useEffect(() => {
    if (!allOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setAllOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [allOpen]);
  const hasData = Boolean(snapshot?.orders || snapshot?.supplies);

  return (
    <div className="space-y-3">
      <AnalyticsMotion />
      <header className="flex items-center gap-3">
        {onOpenMenu ? (
          <button type="button" onClick={onOpenMenu} className="rounded-[10px] p-2 transition-colors hover:bg-[#161814]/[0.05] lg:hidden" style={{ color: hub.textMuted }} aria-label="Открыть меню">
            <Menu className="h-5 w-5" />
          </button>
        ) : null}
        <h1 className={hubType.h1} style={{ ...hubSerif, color: hub.text }}>
          Заказы и логистика
        </h1>
      </header>

      <PrimaryTabs<FulfillmentTab>
        label="Разделы заказов и логистики"
        value={tab}
        onChange={onTab}
        options={[
          { id: "orders", label: "Заказы и сборка", icon: <ShoppingBag className="h-[18px] w-[18px]" />, count: snapshot?.orders?.total },
          { id: "deliveries", label: "Поставки", icon: <Truck className="h-[18px] w-[18px]" />, count: snapshot?.supplies?.supplies.length },
          { id: "logistics", label: "Склады и регионы", icon: <Warehouse className="h-[18px] w-[18px]" /> },
        ]}
      />

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,4fr)_minmax(400px,1fr)]">
        <div className="min-w-0 space-y-4">{children(data)}</div>

        <aside className="min-w-0 space-y-4 xl:sticky xl:top-2">
          {hasData ? (
            <SideCard>
              {rows.length === 0 && !stillLoading ? (
                <p className="flex items-start gap-2.5 text-[15px] leading-[1.5]" style={{ ...hubSans, color: "#067A55" }}>
                  <span className="mt-[7px] h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: "#10B981" }} aria-hidden />
                  Срочного нет: неотгруженных заказов, забытых поставок и рисков по складу не видно.
                </p>
              ) : (
                <ul>
                  {shownRows.map((r) =>
                    r.kind === "proposal" ? (
                      <ProposalRow key={r.id} proposal={r.proposal} connected={Boolean(connected)} onOpen={onTab} onBuilt={(message, ok) => setToast(makeToast(message, ok ? "ok" : "error"))} />
                    ) : (
                      <TaskTile key={r.id} task={r.task} onOpen={(t) => onOpenTasks?.(t.category, t)} />
                    ),
                  )}
                </ul>
              )}
              {stillLoading
                ? Array.from({ length: Math.max(1, SHOWN - shownRows.length + (shownRows.length < SHOWN ? 0 : 1)) }).slice(0, shownRows.length < SHOWN ? SHOWN - shownRows.length : 1).map((_, i) => (
                    <div key={`sk-${i}`} role="status" aria-label="Проверяю данные" className="hub-skel mb-3 h-[132px] rounded-[20px]" style={{ animationDelay: `${i * 0.15}s` }} />
                  ))
                : null}
              {hiddenCount > 0 ? (
                <div className="flex justify-end">
                  <HubButton size="sm" variant="secondary" onClick={() => setAllOpen(true)}>
                    Показать ещё {hiddenCount}
                  </HubButton>
                </div>
              ) : null}
            </SideCard>
          ) : null}
        </aside>
      </div>
      {allOpen ? (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Все задачи">
          <button type="button" aria-label="Закрыть" className="absolute inset-0 cursor-default bg-[#011408]/30" onClick={() => setAllOpen(false)} />
          <div className="hub-drawer-in absolute inset-y-0 right-0 flex w-full max-w-[540px] flex-col border-l bg-[var(--hub-canvas)]" style={{ borderColor: "rgba(1, 20, 8, 0.12)" }}>
            <div className="flex items-center justify-between gap-4 border-b px-7 py-5" style={{ borderColor: "rgba(1, 20, 8, 0.1)" }}>
              <h2 className="text-[22px] font-semibold tracking-[-0.02em]" style={{ ...hubSans, color: hub.text }}>
                Все задачи · {rows.length}
              </h2>
              <button type="button" aria-label="Закрыть" onClick={() => setAllOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-[var(--hub-surface-muted)]" style={{ color: hub.textMuted }}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-7 py-6">
              <div className="mb-4">
                <HubButton size="sm" variant="ghost" onClick={() => setSettingsOpen((v) => !v)}>
                  Настроить напоминания
                </HubButton>
              </div>
              {settingsOpen ? (
                <div className="mb-4 flex flex-wrap items-end gap-4 rounded-[14px] px-4 py-3" style={{ backgroundColor: "rgba(1, 20, 8, 0.04)" }}>
                  <HubFulfillmentThresholds data={data} />
                </div>
              ) : null}
              <ul>
                {rows.map((r) =>
                  r.kind === "proposal" ? (
                    <ProposalRow key={r.id} proposal={r.proposal} connected={Boolean(connected)} onOpen={(t) => { setAllOpen(false); onTab(t); }} onBuilt={(message, ok) => setToast(makeToast(message, ok ? "ok" : "error"))} />
                  ) : (
                    <TaskTile key={r.id} task={r.task} onOpen={(t) => { setAllOpen(false); onOpenTasks?.(t.category, t); }} />
                  ),
                )}
              </ul>
            </div>
          </div>
        </div>
      ) : null}
      {toast ? <HubToast toast={toast} onDismiss={() => setToast(null)} /> : null}
    </div>
  );
}
