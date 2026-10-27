"use client";

import { useState } from "react";
import Link from "next/link";
import { Megaphone, MessageSquare, Tag, Truck, type LucideIcon } from "lucide-react";
import { readHubJournal } from "@/lib/seller-hub/journal";
import { readHubScenarios, writeHubScenarios, type HubScenario } from "@/lib/seller-hub/scenarios";
import { hub, HubButton, HubPanel, hubSans } from "./hub-ui";
import { HubActionJournal } from "./hub-action-journal";
import { HubAgentsAds } from "./hub-agents-ads";
import { HubAiActivity } from "./hub-ai-activity";
import { HubAutopilot } from "./hub-autopilot";
import { HubAgentReport } from "./hub-agent-report";
import { HubAiRules } from "./hub-ai-rules";
import { HubAiChat } from "./hub-ai-chat";
import { HubAgentsLogistics } from "./hub-agents-logistics";
import type { FulfillmentTab } from "@/lib/seller-hub/fulfillment-center";
import type { SellerAdCampaignRow, SellerCatalogSnapshot } from "@/lib/seller-hub/types";

const AGENT_FACE: Record<HubScenario["agent"], { icon: LucideIcon; wash: string; mark: string; ink: string }> = {
  prices: { icon: Tag, wash: "#F3FFE0", mark: "#B9FF4B", ink: "#0E1116" },
  ads: { icon: Megaphone, wash: "#E8F0FE", mark: "#2F6FED", ink: "#FFFFFF" },
  comms: { icon: MessageSquare, wash: "#E7F6C9", mark: "#1F4E3D", ink: "#B9FF4B" },
};

const AGENT_LABEL = {
  prices: "Агент цен",
  ads: "Агент рекламы",
  comms: "Агент коммуникаций",
} as const;

const AGENT_DUTY: Record<HubScenario["agent"], string> = {
  prices: "Предлагает скидку на товары с запасом и держит стоп-лосс. В WB уходит только список, который вы подтвердили.",
  ads: "Смотрит активные кампании и предлагает паузу, если баланс продвижения пустой. Ставки сам не поднимает.",
  comms: "Ответы на отзывы живут в уже готовых автоответах. Здесь агент только напоминает, что отправка идёт оттуда.",
};

const AGENT_TASKS: Record<HubScenario["agent"], string[]> = {
  prices: ["Чуть увеличь скидку на товары с запасом", "Покажи товары без цены"],
  ads: ["Поставь на паузу рекламу с пустым балансом", "Какие кампании сейчас активны?"],
  comms: ["Что с отзывами без ответа?", "Открой автоответы по этому магазину"],
};

const SCHEDULE_LABEL = {
  once: "один раз",
  regular: "регулярно",
  manual: "вручную",
} as const;

export function HubAgents({ onAsk, snapshot, connected, onAdsUpdate, onOpenFulfillment }: { onAsk: (prompt?: string) => void; snapshot?: SellerCatalogSnapshot; connected?: boolean; onAdsUpdate?: (campaigns: SellerAdCampaignRow[]) => void; onOpenFulfillment?: (tab: FulfillmentTab) => void }) {
  const [rows, setRows] = useState<HubScenario[]>(() => readHubScenarios());
  const [tab, setTab] = useState<HubScenario["agent"] | "logistics">(() => {
    // Переход из других разделов («Настроить агента») открывает нужного агента.
    if (typeof window === "undefined") return "prices";
    try {
      const wanted = sessionStorage.getItem("karto-hub-agents-tab");
      sessionStorage.removeItem("karto-hub-agents-tab");
      return wanted === "ads" || wanted === "comms" || wanted === "prices" || wanted === "logistics" ? wanted : "prices";
    } catch {
      return "prices";
    }
  });
  const visible = rows.filter((row) => row.agent === tab);
  const planned = visible.filter((row) => row.status !== "done");
  const doneWeek = rows.filter((row) => {
    if (row.agent !== tab || row.status !== "done") return false;
    return Date.now() - new Date(row.createdAt).getTime() < 7 * 24 * 60 * 60 * 1000;
  }).length;
  const lastRun = [...rows.filter((row) => row.agent === tab)].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const journalCount = readHubJournal().filter((row) => row.title.toLowerCase().includes(tab === "prices" ? "скид" : tab === "ads" ? "реклам" : "отзыв")).length;

  function patch(id: string, status: HubScenario["status"]) {
    const next = rows.map((row) => (row.id === id ? { ...row, status } : row));
    writeHubScenarios(next);
    setRows(next);
  }

  return (
    <div className="space-y-4">
      <HubAiChat titleByNm={new Map((snapshot?.items ?? []).map((item) => [String(item.externalId), item.title]))} cardByNm={new Map((snapshot?.items ?? []).map((item) => [String(item.externalId), { title: item.title, vendorCode: item.vendorCode, description: item.description ?? "" }]))} />
      <HubAiActivity />
      <HubAiRules />
      <HubAutopilot />
      <HubAgentReport />
      <HubPanel className="px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[14px] font-semibold" style={{ color: hub.text }}>Автоответы на отзывы и вопросы</p>
            <p className="text-[13px] leading-5" style={{ color: hub.textMuted }}>Работают отдельным модулем: правила ответов, стиль бренда, проверка перед отправкой. Здесь агенты их не заменяют, а подсказывают, где отзывы мешают продажам.</p>
          </div>
          <Link href="/studio/auto-replies/workspace" className="inline-flex">
            <HubButton variant="secondary">Открыть автоответы</HubButton>
          </Link>
        </div>
      </HubPanel>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {(Object.keys(AGENT_LABEL) as HubScenario["agent"][]).map((id) => {
          const face = AGENT_FACE[id];
          const Icon = face.icon;
          const activeCount = rows.filter((row) => row.agent === id && row.status === "active").length;
          const selected = tab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className="flex items-center gap-3 rounded-2xl border px-4 py-4 text-left transition duration-150 hover:-translate-y-0.5"
              style={{
                backgroundColor: selected ? face.wash : "#FFFFFF",
                borderColor: selected ? face.mark : hub.border,
              }}
            >
              <span
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                style={{ backgroundColor: face.mark, color: face.ink }}
              >
                <Icon className="h-5 w-5" strokeWidth={2.25} />
              </span>
              <span className="min-w-0">
                <span className="block text-[15px] font-semibold" style={{ color: hub.text }}>
                  {AGENT_LABEL[id]}
                </span>
                <span className="mt-1 block text-[12px]" style={{ color: hub.textSubtle }}>
                  {activeCount > 0 ? `${activeCount} в расписании` : "в расписании пусто"}
                </span>
              </span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setTab("logistics")}
          className="flex items-center gap-3 rounded-2xl border px-4 py-4 text-left transition duration-150 hover:-translate-y-0.5"
          style={{ backgroundColor: tab === "logistics" ? "#FFF4E0" : "#FFFFFF", borderColor: tab === "logistics" ? "#E6A23C" : hub.border }}
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: "#E6A23C", color: "#FFFFFF" }}>
            <Truck className="h-5 w-5" strokeWidth={2.25} />
          </span>
          <span className="min-w-0">
            <span className="block text-[15px] font-semibold" style={{ color: hub.text }}>
              Агент логистики
            </span>
            <span className="mt-1 block text-[12px]" style={{ color: hub.textSubtle }}>
              заказы, поставки, склад
            </span>
          </span>
        </button>
      </div>

      {tab === "logistics" ? (
        <HubAgentsLogistics snapshot={snapshot} connected={connected} onOpenFulfillment={(t) => onOpenFulfillment?.(t)} />
      ) : tab === "ads" ? (
        <HubAgentsAds snapshot={snapshot} connected={connected} onAdsUpdate={onAdsUpdate} />
      ) : (
      <>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(260px,0.8fr)]">
      <HubPanel>
        <div className="space-y-3 px-5 py-4">
          <h2 className="text-[18px] font-semibold" style={hubSans}>
            Что умеет {AGENT_LABEL[tab].toLowerCase()}
          </h2>
          <p className="text-[14px] leading-relaxed" style={{ color: hub.textMuted }}>
            {AGENT_DUTY[tab]}
          </p>
          {tab === "comms" ? (
            <Link href="/studio/auto-replies/workspace" className="inline-flex">
              <HubButton size="sm">Открыть автоответы</HubButton>
            </Link>
          ) : null}
          <div className="flex flex-col gap-2">
            {AGENT_TASKS[tab].map((task) => (
              <button
                key={task}
                type="button"
                onClick={() => onAsk(task)}
                className="rounded-xl border px-3 py-2.5 text-left text-[14px] font-medium transition hover:bg-[#B9FF4B]/30"
                style={{ color: hub.text, borderColor: hub.border }}
              >
                {task}
              </button>
            ))}
          </div>
          <p className="text-[13px] leading-relaxed" style={{ color: hub.textMuted }}>
            Регулярная задача остаётся в расписании. Сама она кабинет не меняет: каждое применение всё равно через «Применить».
          </p>
          <ExampleStepper agent={tab} />
        </div>
      </HubPanel>
      <HubPanel>
        <div className="space-y-4 px-5 py-4">
          <h2 className="text-[18px] font-semibold" style={hubSans}>Сейчас по этому агенту</h2>
          <Metric label="Выполнено за 7 дней" value={String(doneWeek)} hint="сценарии со статусом «завершён»" />
          <Metric label="Записей в журнале" value={String(journalCount)} hint="по словам этого агента, без оценки денег" />
          <Metric
            label="Последний запуск"
            value={lastRun ? new Date(lastRun.createdAt).toLocaleString("ru-RU") : "ещё не было"}
            hint="Деньги и время не считаем: в снимке нет такой величины."
          />
        </div>
      </HubPanel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
      <HubPanel>
        <div className="border-b px-5 py-4" style={{ borderColor: hub.borderSoft }}>
          <h2 className="text-[18px] font-semibold" style={hubSans}>
            Запланировано
          </h2>
        </div>
        {planned.length === 0 ? (
          <p className="px-5 py-6 text-[14px]" style={{ color: hub.textMuted }}>
            У {AGENT_LABEL[tab].toLowerCase()} нет задач в расписании. Пример сверху откроет KARTO с готовым текстом.
          </p>
        ) : (
          <ul>
            {planned.map((row) => (
              <li key={row.id} className="border-b px-5 py-4 last:border-b-0" style={{ borderColor: hub.borderSoft }}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-[15px] font-semibold" style={{ color: hub.text }}>
                    {row.title}
                  </h3>
                  <span className="text-[12px] font-semibold" style={{ color: hub.textMuted }}>
                    {row.status === "paused" ? "на паузе" : "активен"} · {SCHEDULE_LABEL[row.schedule]}
                  </span>
                </div>
                <ol className="mt-2 list-decimal space-y-1 pl-5 text-[14px]" style={{ color: hub.text }}>
                  {row.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
                <p className="mt-2 text-[13px]" style={{ color: hub.textMuted }}>
                  Стоп-лосс: не опускать ориентир маржи ниже {row.stopLossMarginPct}% без отдельного подтверждения.
                </p>
                <div className="mt-3">
                  {row.status === "active" ? (
                    <HubButton size="sm" variant="secondary" onClick={() => patch(row.id, "paused")}>
                      Пауза
                    </HubButton>
                  ) : (
                    <HubButton size="sm" variant="secondary" onClick={() => patch(row.id, "active")}>
                      Снять с паузы
                    </HubButton>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </HubPanel>
      <HubActionJournal />
      </div>
      </>
      )}
    </div>
  );
}

const EXAMPLE: Record<HubScenario["agent"], Array<{ title: string; text: string }>> = {
  prices: [
    { title: "Задача", text: "Чуть увеличь скидку на товары с запасом." },
    { title: "Отбор", text: "Беру SKU с ценой и остатком больше 3." },
    { title: "Превью", text: "Скидка +5 п.п., не выше 40%. Было → станет по каждой строке." },
    { title: "Применить", text: "В WB уходит только после «подходит» и «Применить»." },
  ],
  ads: [
    { title: "Задача", text: "Поставь на паузу рекламу с пустым балансом." },
    { title: "Отбор", text: "Активные кампании из снимка, баланс продвижения равен нулю." },
    { title: "Превью", text: "Список: название, статус сейчас → пауза." },
    { title: "Применить", text: "Пауза уходит только по кнопке. Ставки агент не поднимает." },
  ],
  comms: [
    { title: "Задача", text: "Что с отзывами без ответа?" },
    { title: "Ответ", text: "Цифра из снимка, без отправки в WB." },
    { title: "Черновик", text: "Текст ответа живёт в автоответах, не здесь." },
    { title: "Отправка", text: "Режим отправки задаётся в рабочем пространстве отзывов." },
  ],
};

function ExampleStepper({ agent }: { agent: HubScenario["agent"] }) {
  return (
    <ol className="rounded-2xl border px-4 py-4" style={{ borderColor: hub.border }}>
      {EXAMPLE[agent].map((step, index) => (
        <li key={step.title} className="relative flex gap-3 pb-4 last:pb-0">
          {index < EXAMPLE[agent].length - 1 ? (
            <span className="absolute bottom-0 left-[13px] top-7 w-px bg-[#E3E6EB]" aria-hidden />
          ) : null}
          <span className="relative z-[1] flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#B9FF4B] text-[12px] font-bold text-[#0E1116]">
            {index + 1}
          </span>
          <span>
            <span className="block text-[14px] font-semibold" style={{ color: hub.text }}>{step.title}</span>
            <span className="mt-0.5 block text-[13px]" style={{ color: hub.textMuted }}>{step.text}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div>
      <p className="text-[12px] font-semibold uppercase tracking-[0.06em]" style={{ color: hub.textSubtle }}>{label}</p>
      <p className="mt-1 text-[22px] font-semibold leading-none" style={{ color: hub.text }}>{value}</p>
      <p className="mt-1 text-[12px]" style={{ color: hub.textMuted }}>{hint}</p>
    </div>
  );
}
