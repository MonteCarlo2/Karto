"use client";

import type { SellerProductEvent } from "@/lib/seller-hub/event-engine/types";
import type { TaskFocus } from "./task-focus";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, CalendarClock, Check, Inbox, Lightbulb, Megaphone, MessageSquare, PenLine, Percent, ScrollText, SlidersHorizontal, SquarePen, Tag, Trash2, Truck, UserRound, type LucideIcon } from "lucide-react";
import { capabilityGroups, LEVER_STATUS_LABEL } from "@/lib/seller-hub/agent/capability-labels";
import { closeSellerHubAiChat, listSellerHubAiChats, loadSellerHubAgentProposals, type ServerAgentProposal } from "@/lib/seller-hub/client-api";
import type { SellerCatalogSnapshot } from "@/lib/seller-hub/types";
import { agentDateTime } from "./hub-agents-ui";
import { HubAiChat, type HubAiChatHandle } from "./hub-ai-chat";
import Link from "next/link";
import { HubOrdersPage } from "./hub-orders-page";
import { HubJournalPage } from "./hub-journal-page";
import { HubCommsPage, type CommsBalance } from "./hub-comms-page";
import { hub, hubSans } from "./hub-ui";
import { chartColors } from "./hub-analytics-ui";
import { useSellerHubSyncMode } from "./sync-mode-context";
import { useUserSettingLoaded } from "./use-user-setting";

export type AgentsTab = "overview" | "ads" | "prices" | "logistics" | "comms" | "rules" | "schedule" | "orders" | "proposals" | "journal";

const AREA: Record<string, { icon: LucideIcon; tab?: AgentsTab }> = {
  "Цена и скидки": { icon: Tag, tab: "prices" },
  Карточка: { icon: PenLine },
  Реклама: { icon: Megaphone, tab: "ads" },
  Акции: { icon: Percent },
  "Остатки и поставки": { icon: Truck, tab: "logistics" },
  Покупатели: { icon: MessageSquare, tab: "comms" },
};

/** Возможности агента по областям: что делает сам после подтверждения и что остаётся за вами. Показывается свёрнуто на странице «Направления и правила». */
export function AgentCapabilities({ onTab }: { onTab: (tab: AgentsTab) => void }) {
  const groups = useMemo(() => capabilityGroups(), []);
  return (
    <div>
      <div className="hidden gap-x-8 pb-2 text-[13px] lg:grid lg:grid-cols-[190px_minmax(0,1.25fr)_minmax(0,1fr)]" style={{ ...hubSans, color: hub.textSubtle }} aria-hidden>
        <span />
        <span>{LEVER_STATUS_LABEL.action}</span>
        <span>Остаётся за вами</span>
      </div>
      <ul>
        {groups.map((g) => {
          const meta = AREA[g.area];
          const Icon = meta?.icon ?? Tag;
          return (
            <li key={g.area} className="grid gap-x-8 gap-y-3 border-t py-5 lg:grid-cols-[190px_minmax(0,1.25fr)_minmax(0,1fr)]" style={{ borderColor: hub.border }}>
              <div className="flex items-start gap-3 lg:block">
                <div className="flex min-w-0 flex-1 items-center gap-2.5">
                  <Icon className="h-[18px] w-[18px] shrink-0" style={{ color: hub.text }} strokeWidth={2} aria-hidden />
                  <h3 className="text-[15px] font-semibold leading-5" style={{ ...hubSans, color: hub.text }}>
                    {g.area}
                  </h3>
                </div>
                {meta?.tab ? (
                  <button
                    type="button"
                    onClick={() => onTab(meta.tab!)}
                    className="group/link inline-flex shrink-0 items-center gap-1 text-[13px] font-medium underline-offset-2 outline-none hover:underline focus-visible:shadow-[0_2px_0_0_var(--hub-lime-ring)] lg:ml-[28px] lg:mt-1.5"
                    style={{ ...hubSans, color: hub.textMuted }}
                  >
                    Настроить
                    <ArrowRight className="h-3.5 w-3.5 transition-transform duration-150 group-hover/link:translate-x-0.5" aria-hidden />
                  </button>
                ) : null}
              </div>

              <div className="min-w-0">
                <p className="mb-1.5 text-[13px] lg:hidden" style={{ ...hubSans, color: hub.textSubtle }}>
                  {LEVER_STATUS_LABEL.action}
                </p>
                {g.action.length > 0 ? (
                  <ul className="space-y-1.5">
                    {g.action.map((text) => (
                      <li key={text} className="flex gap-2.5 text-[14px] leading-5" style={{ ...hubSans, color: hub.text }}>
                        <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: hub.greenDark }} strokeWidth={2.5} aria-hidden />
                        <span className="min-w-0 [overflow-wrap:anywhere]">{text}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[14px] leading-5" style={{ ...hubSans, color: hub.textSubtle }}>
                    Сам здесь пока ничего не меняет.
                  </p>
                )}
              </div>

              <div className="min-w-0">
                {g.human.length + g.advice.length > 0 ? (
                  <>
                    <p className="mb-1.5 text-[13px] lg:hidden" style={{ ...hubSans, color: hub.textSubtle }}>
                      Остаётся за вами
                    </p>
                    <ul className="space-y-1.5">
                      {g.human.map((text) => (
                        <li key={text} className="flex gap-2.5 text-[14px] leading-5" style={{ ...hubSans, color: hub.textMuted }}>
                          <UserRound className="mt-0.5 h-4 w-4 shrink-0" style={{ color: hub.textSubtle }} strokeWidth={2} aria-hidden />
                          <span className="min-w-0 [overflow-wrap:anywhere]">{text}</span>
                        </li>
                      ))}
                      {g.advice.map((text) => (
                        <li key={text} className="flex gap-2.5 text-[14px] leading-5" style={{ ...hubSans, color: hub.textMuted }}>
                          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" style={{ color: hub.textSubtle }} strokeWidth={2} aria-hidden />
                          <span className="min-w-0 [overflow-wrap:anywhere]">
                            {text} <span style={{ color: hub.textSubtle }}>({LEVER_STATUS_LABEL.advice.toLowerCase()})</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

type ChatRow = { id: string; title: string; state: "asking" | "planned" | "closed"; updatedAt: string };

/** Пункт левого меню: тонкий значок и название, без цветных плиток. */
function NavItem({ icon: Icon, label, onClick, badge, active, size = "md" }: { icon: LucideIcon; label: string; onClick: () => void; badge?: number; active?: boolean; size?: "lg" | "md" }) {
  const lg = size === "lg";
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        aria-current={active ? "page" : undefined}
        className={`flex w-full items-center text-left outline-none transition-[background-color,box-shadow] duration-150 focus-visible:shadow-[0_0_0_2px_var(--hub-lime-ring)] ${lg ? "h-[40px] gap-2.5 rounded-[11px] px-3 text-[15px] font-semibold" : "h-[36px] gap-2.5 rounded-[10px] px-3 text-[14px] font-medium"} ${active ? "" : "hover:bg-[rgba(1,20,8,0.055)]"}`}
        style={{ ...hubSans, color: hub.text, backgroundColor: active ? "rgba(1,20,8,0.07)" : undefined }}
      >
        <Icon className={`${lg ? "h-[19px] w-[19px]" : "h-[17px] w-[17px]"} shrink-0`} style={{ color: active ? hub.text : hub.textMuted }} strokeWidth={1.8} aria-hidden />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {badge != null && badge > 0 ? (
          <span className="flex h-[20px] min-w-[20px] items-center justify-center rounded-full px-1.5 text-[12px] font-bold tabular-nums" style={{ backgroundColor: chartColors.lime, color: "#011408" }}>
            {badge}
          </span>
        ) : null}
      </button>
    </li>
  );
}

/** История по дням: «Сегодня», «Вчера», «Ранее». */
function groupHistory(rows: ChatRow[], now: number): Array<{ label: string; rows: ChatRow[] }> {
  const dayKey = (t: number) => new Date(t).toLocaleDateString("sv-SE");
  const today = dayKey(now);
  const yesterday = dayKey(now - 24 * 60 * 60 * 1000);
  const groups: Array<{ label: string; rows: ChatRow[] }> = [
    { label: "Сегодня", rows: [] },
    { label: "Вчера", rows: [] },
    { label: "Ранее", rows: [] },
  ];
  for (const row of rows) {
    const key = dayKey(Date.parse(row.updatedAt));
    groups[key === today ? 0 : key === yesterday ? 1 : 2]!.rows.push(row);
  }
  return groups.filter((g) => g.rows.length > 0);
}

/**
 * Главный экран агента, как у ChatGPT и Claude: слева меню (новая задача, разделы, история), по центру большое поле ввода на всю высоту.
 * Всё на одном фоне с кабинетом, без рамок и цветных плиток. План по задаче открывается выдвижной панелью справа. Страница не прокручивается.
 */
export function HubAgentsOverview({ snapshot, onTab, onProposalCount, prefill, onOpenTasks, onOpenKb, onOpenSection, events }: { events?: SellerProductEvent[]; snapshot?: SellerCatalogSnapshot; onTab: (tab: AgentsTab) => void; onAsk?: (prompt?: string) => void; onProposalCount?: (n: number) => void; prefill?: { text: string; n: number } | null; onOpenTasks?: (focus?: TaskFocus) => void; onOpenKb?: (id: string) => void; onOpenSection?: (id: string) => void }) {
  const serverMode = useSellerHubSyncMode() === "background";
  const [proposals, setProposals] = useState<ServerAgentProposal[] | null>(null);
  const [history, setHistory] = useState<ChatRow[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [now] = useState(() => Date.now());
  const chatRef = useRef<HubAiChatHandle | null>(null);
  // Правая часть: чат или страница «Поручения» (чат остаётся в памяти и не теряет диалог).
  const [page, setPage] = useState<"chat" | "orders" | "journal" | "comms">("chat");
  const [focusOrder, setFocusOrder] = useState<string | null>(null);
  const [commsArea, setCommsArea] = useState<"settings" | "inbox">("settings");
  const [commsBadge, setCommsBadge] = useState<number | null>(null);
  const [commsBalance, setCommsBalance] = useState<CommsBalance | null>(null);
  // Тестовый режим агента: по умолчанию включён, в WB ничего не отправляется. Показываем, только когда настройки уже пришли.
  const [sandbox, , sandboxLoaded] = useUserSettingLoaded<boolean>("agent.sandbox", true);

  // Пример задачи из панели направления подставляется в поле чата агента.
  useEffect(() => {
    if (prefill) {
      setPage("chat");
      chatRef.current?.fill(prefill.text);
    }
  }, [prefill]);

  // История задач: обновляется при каждой смене открытого диалога (новая задача, ответ агента, выбор из списка).
  useEffect(() => {
    let cancelled = false;
    void listSellerHubAiChats().then((res) => {
      if (cancelled) return;
      setHistory(res.ok ? res.chats.filter((c) => c.state !== "closed").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 40) : []);
    });
    return () => {
      cancelled = true;
    };
  }, [activeId]);

  useEffect(() => {
    if (!serverMode) return;
    let cancelled = false;
    void loadSellerHubAgentProposals().then((res) => {
      if (cancelled) return;
      // Те же предложения, что исполняются в направлении «Реклама»: только открытые и только с действием.
      const open = res.ok ? res.proposals.filter((p) => p.status === "open" && p.rule !== "playbook") : [];
      setProposals(open);
      onProposalCount?.(open.length);
    });
    return () => {
      cancelled = true;
    };
    // onProposalCount — сеттер родителя, перезапрос при его смене не нужен
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverMode]);

  async function removeChat(id: string) {
    setConfirmId(null);
    setHistory((rows) => (rows ? rows.filter((c) => c.id !== id) : rows));
    // Сначала закрываем на сервере, потом сбрасываем открытый диалог: иначе список истории перечитается раньше и вернёт удалённую задачу.
    await closeSellerHubAiChat(id);
    if (id === activeId) chatRef.current?.startNew();
  }

  const titleByNm = useMemo(() => new Map((snapshot?.items ?? []).map((item) => [String(item.externalId), item.title])), [snapshot?.items]);
  const itemByNm = useMemo(() => new Map((snapshot?.items ?? []).map((item) => [String(item.externalId), item])), [snapshot?.items]);
  const cardByNm = useMemo(() => new Map((snapshot?.items ?? []).map((item) => [String(item.externalId), { title: item.title, vendorCode: item.vendorCode, description: item.description ?? "", imageUrl: item.imageUrl }])), [snapshot?.items]);

  const waiting = proposals?.length ?? 0;
  const shownHistory = history;

  return (
    <div className="hub-agents-frame flex min-h-[640px] flex-col xl:flex-row" style={{ backgroundColor: hub.canvas }}>
      <main className="relative order-1 flex min-h-[560px] min-h-0 min-w-0 flex-1 flex-col xl:order-2" style={{ backgroundImage: "radial-gradient(760px 460px at 50% 30%, rgba(185,255,75,0.05), transparent 70%)" }}>
        {sandboxLoaded && sandbox ? (
        <button type="button" onClick={() => onTab("rules")} className="absolute right-5 top-4 z-10 inline-flex h-8 items-center gap-2 rounded-full px-3.5 text-[12.5px] font-medium outline-none transition-colors duration-150 hover:bg-[rgba(1,20,8,0.06)] focus-visible:shadow-[0_0_0_2px_var(--hub-lime-ring)] sm:right-8 xl:right-14" style={{ ...hubSans, color: hub.textMuted, boxShadow: "0 0 0 1px rgba(1,20,8,0.12)" }} title="Агент работает как обычно, но в Wildberries ничего не отправляет. Боевой режим включается в «Правила и автопилот»">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "#F59E0B" }} aria-hidden />
            Тестовый режим
          </button>
        ) : null}
        {page === "orders" ? (
          <HubOrdersPage focusOrderId={focusOrder} titleByNm={titleByNm} cardByNm={cardByNm}
            snapshot={snapshot}
            onDescribe={(text) => {
              setPage("chat");
              chatRef.current?.sendNew(`Создай поручение: ${text}`);
            }}
            onFill={(text) => {
              setPage("chat");
              chatRef.current?.fill(text);
            }}
            onOpenRules={() => onTab("rules")}
          />
        ) : null}
        {page === "comms" ? <HubCommsPage area={commsArea} onArea={setCommsArea} onBadge={setCommsBadge} onBalance={setCommsBalance} /> : null}
        {page === "journal" ? <HubJournalPage snapshot={snapshot} onOpenOrders={(id) => { setFocusOrder(id ?? null); setPage("orders"); }} /> : null}
        <div className={page === "orders" || page === "journal" || page === "comms" ? "hidden" : "flex min-h-0 flex-1 flex-col"}>
        <HubAiChat ref={chatRef} titleByNm={titleByNm} cardByNm={cardByNm} onChatChange={setActiveId} onOpenTasks={onOpenTasks} onOpenKb={onOpenKb} onOpenSection={onOpenSection} itemByNm={itemByNm} snapshot={snapshot} events={events} sandbox={sandboxLoaded && sandbox} />
        </div>
      </main>

      <aside className="order-2 flex min-h-0 w-full shrink-0 flex-col gap-5 overflow-y-auto border-t p-4 xl:order-1 xl:w-[320px] xl:border-r xl:border-t-0" style={{ borderColor: "rgba(1, 20, 8, 0.09)" }} aria-label="Меню агента">
        <button type="button" onClick={() => { setPage("chat"); chatRef.current?.startNew(); }} className="group/new flex h-10 w-full items-center gap-2.5 rounded-[12px] border px-3 text-[14px] font-medium outline-none transition-[background-color,border-color] duration-150 hover:bg-white hover:border-[rgba(1,20,8,0.22)] focus-visible:shadow-[0_0_0_2px_var(--hub-canvas),0_0_0_4px_var(--hub-lime-ring)]" style={{ ...hubSans, borderColor: "rgba(1, 20, 8, 0.14)", color: hub.text }}>
          <SquarePen className="h-4 w-4 transition-transform duration-200 group-hover/new:-rotate-6" strokeWidth={1.8} aria-hidden />
          Новая задача
        </button>

        <nav aria-label="Разделы агента">
          <ul className="space-y-0.5">
            {waiting > 0 ? <NavItem size="lg" icon={Inbox} label="Ждёт решения" badge={waiting} onClick={() => onTab("proposals")} /> : null}
            <NavItem size="lg" icon={CalendarClock} label="Поручения" active={page === "orders"} onClick={() => { setFocusOrder(null); setPage("orders"); }} />
            <NavItem size="lg" icon={ScrollText} label="Журнал" active={page === "journal"} onClick={() => setPage("journal")} />
            <NavItem size="lg" icon={MessageSquare} label="Отзывы и автоответы" active={page === "comms"} onClick={() => setPage("comms")} />
          </ul>
          {page === "comms" ? (
            <ul className="ml-[17px] mt-0.5 space-y-0.5 border-l pl-2" style={{ borderColor: "rgba(1,20,8,0.12)" }} aria-label="Разделы автоответов">
              <NavItem icon={SlidersHorizontal} label="Основное" active={commsArea === "settings"} onClick={() => setCommsArea("settings")} />
              <NavItem icon={Inbox} label="Ответы" badge={commsBadge ?? undefined} active={commsArea === "inbox"} onClick={() => setCommsArea("inbox")} />
            </ul>
          ) : null}
        </nav>

        <div className="flex min-h-[160px] flex-1 flex-col border-t pt-4" style={{ borderColor: "rgba(1, 20, 8, 0.12)" }}>
          <div className="mb-2.5 flex items-baseline justify-between px-3">
            <p className="text-[12.5px] font-semibold uppercase tracking-[0.1em]" style={{ ...hubSans, color: hub.textMuted }}>
              История чатов
            </p>
            {history && history.length > 0 ? (
              <span className="text-[12.5px] tabular-nums" style={{ ...hubSans, color: hub.textSubtle }}>
                {history.length}
              </span>
            ) : null}
          </div>
          {shownHistory == null ? null : history!.length === 0 ? (
            <p className="px-2.5 text-[13px] leading-5" style={{ ...hubSans, color: hub.textSubtle }}>
              Здесь появятся ваши задачи.
            </p>
          ) : shownHistory.length === 0 ? (
            <p className="px-2.5 text-[13px] leading-5" style={{ ...hubSans, color: hub.textSubtle }}>
              Ничего не нашлось.
            </p>
          ) : (
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-0.5 pb-2">
              {groupHistory(shownHistory, now).map((group) => (
                <section key={group.label}>
                  <h3 className="px-3 pb-1.5 text-[11.5px] font-semibold uppercase tracking-[0.09em]" style={{ ...hubSans, color: hub.textSubtle }}>
                    {group.label}
                  </h3>
                  <ul className="space-y-px">
                    {group.rows.map((c) => {
                      const active = c.id === activeId;
                      const asking = confirmId === c.id;
                      return (
                        <li key={c.id} className="group/row relative">
                          {asking ? (
                            <div className="hub-fade-in flex h-9 items-center justify-between gap-2 rounded-[9px] pl-2.5 pr-1" style={{ backgroundColor: "rgba(239, 68, 68, 0.08)" }}>
                              <span className="text-[13px] font-medium" style={{ ...hubSans, color: hub.text }}>
                                Удалить?
                              </span>
                              <span className="flex gap-0.5">
                                <button type="button" onClick={() => void removeChat(c.id)} className="h-7 rounded-md px-2.5 text-[12.5px] font-semibold outline-none hover:bg-[rgba(239,68,68,0.14)] focus-visible:shadow-[0_0_0_2px_var(--hub-lime-ring)]" style={{ ...hubSans, color: "#B91C1C" }}>
                                  Да
                                </button>
                                <button type="button" onClick={() => setConfirmId(null)} className="h-7 rounded-md px-2.5 text-[12.5px] font-semibold outline-none hover:bg-[rgba(1,20,8,0.06)] focus-visible:shadow-[0_0_0_2px_var(--hub-lime-ring)]" style={{ ...hubSans, color: hub.text }}>
                                  Нет
                                </button>
                              </span>
                            </div>
                          ) : (
                            <>
                              <button type="button" title={`${c.title} · ${agentDateTime(c.updatedAt)}`} onClick={() => { setPage("chat"); chatRef.current?.open(c.id); }} className={`flex h-10 w-full items-center gap-2 rounded-[11px] pl-3 pr-9 text-left outline-none transition-colors duration-150 focus-visible:shadow-[0_0_0_2px_var(--hub-lime-ring)] ${active ? "bg-[rgba(1,20,8,0.07)]" : "hover:bg-[rgba(1,20,8,0.045)]"}`}>
                                <span className="min-w-0 flex-1 truncate text-[14.5px]" style={{ ...hubSans, color: active ? hub.text : "#2B3A31", fontWeight: active ? 600 : 400 }}>
                                  {c.title}
                                </span>
                                {c.state === "planned" ? (
                                  <span className="h-1.5 w-1.5 shrink-0 rounded-full group-hover/row:opacity-0" style={{ backgroundColor: "#8FD92B" }} role="img" aria-label="План готов" />
                                ) : null}
                              </button>
                              <button type="button" onClick={() => setConfirmId(c.id)} aria-label="Удалить задачу" className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-md opacity-0 outline-none transition-[opacity,background-color] duration-150 hover:bg-[rgba(1,20,8,0.08)] focus-visible:opacity-100 focus-visible:shadow-[0_0_0_2px_var(--hub-lime-ring)] group-hover/row:opacity-100" style={{ color: hub.textSubtle }}>
                                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                              </button>
                            </>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
              {shownHistory.some((c) => c.state === "planned") ? (
                <p className="flex items-center gap-1.5 px-2.5 text-[11.5px]" style={{ ...hubSans, color: hub.textSubtle }}>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: "#8FD92B" }} aria-hidden /> план готов
                </p>
              ) : null}
            </div>
          )}
        </div>

        {page === "comms" ? (
          <div className="shrink-0 rounded-[14px] px-3.5 py-3.5" style={{ backgroundColor: "rgba(1,20,8,0.045)" }}>
            <p className="text-[12px] font-medium uppercase tracking-[0.06em]" style={{ ...hubSans, color: hub.textSubtle }}>
              Остаток по тарифу
            </p>
            <p className="mt-1.5 text-[26px] font-semibold leading-none tabular-nums" style={{ ...hubSans, color: hub.text }}>
              {commsBalance?.remaining != null ? commsBalance.remaining.toLocaleString("ru-RU") : "…"}
            </p>
            <p className="mt-1.5 text-[13px] leading-[1.4]" style={{ ...hubSans, color: hub.textMuted }}>
              ответов{commsBalance?.periodEnd ? ` · пакет до ${new Date(commsBalance.periodEnd).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}` : ""}
            </p>
            <Link href="/#pricing" className="mt-2.5 inline-flex text-[13.5px] font-semibold underline underline-offset-4" style={{ ...hubSans, color: hub.text }}>
              Пополнить пакет
            </Link>
          </div>
        ) : null}
      </aside>
    </div>
  );
}
