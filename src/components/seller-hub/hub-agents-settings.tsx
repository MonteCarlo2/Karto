"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Bell, CalendarClock, MessageSquare, Send, Sparkles } from "lucide-react";
import { FORBID_AREAS, FORBID_LABEL, parseForbid, type ForbidArea } from "@/lib/seller-hub/agent/owner-rules";
import { useUserSetting } from "./use-user-setting";
import { readHubScenarios, type HubScenario } from "@/lib/seller-hub/scenarios";
import { hub, hubSans } from "./hub-ui";
import { AgentSwitch } from "./hub-agents-ui";
import { PanelGroup, PanelRow, PanelSection } from "./hub-agents-panel";

/**
 * Настройки агента: «Что агенту можно менять» и страница «Запланированные действия».
 * Переключатели «Куда присылать» пока хранятся только в этом браузере.
 */

/** Значение в localStorage браузера: без сети, с безопасным откатом на значение по умолчанию. */
function useLocalPref<T extends string | boolean>(key: string, fallback: T): [T, (next: T) => void] {
  const [value, setValue] = useState<T>(fallback);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(`karto.hub.pref.${key}`);
      if (raw != null) setValue((typeof fallback === "boolean" ? raw === "1" : raw) as T);
    } catch {
      /* без localStorage остаётся значение по умолчанию */
    }
    // fallback — константа
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return [
    value,
    (next) => {
      setValue(next);
      try {
        window.localStorage.setItem(`karto.hub.pref.${key}`, typeof next === "boolean" ? (next ? "1" : "0") : String(next));
      } catch {
        /* не сохранилось: значение живёт до перезагрузки */
      }
    },
  ];
}

/** «Что агенту можно менять»: три области. Выключено = запрет (то же, что раньше «Что менять нельзя»), агент не предлагает и не делает ничего в этой области. */
export function AccessSwitches() {
  const [forbidRaw, setForbidRaw] = useUserSetting<string>("ai.forbid", "");
  const forbid = parseForbid(forbidRaw);
  const toggle = (area: ForbidArea) => setForbidRaw(forbid.includes(area) ? forbid.filter((a) => a !== area).join(",") : [...forbid, area].join(","));
  const HINT: Record<ForbidArea, string> = {
    prices: "Базовая цена, скидка, вход и выход из акций",
    ads: "Ставки, кампании, минус-фразы, бюджет",
    cards: "Название, описание, характеристики",
  };
  return (
    <PanelSection title="Что агенту можно менять" hint="Если выключено, агент не предлагает и не делает ничего в этой области. Включённое он всё равно выполняет только по вашему «Да» (кроме автопилота).">
      <PanelGroup>
        {FORBID_AREAS.map((area) => {
          const name = FORBID_LABEL[area].split(" (")[0]!;
          const allowed = !forbid.includes(area);
          return <PanelRow key={area} title={name} hint={allowed ? HINT[area] : "Запрещено: агент эту область не трогает"} control={<AgentSwitch label={name} checked={allowed} onChange={() => toggle(area)} />} />;
        })}
      </PanelGroup>
    </PanelSection>
  );
}

/** Подсказка-пример: нажатие кладёт текст в поле задачи агента. */
function ExampleChip({ text, onAsk }: { text: string; onAsk: (text: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onAsk(text)}
      className="group/ex flex w-full items-center gap-3 rounded-[14px] px-3.5 py-3 text-left outline-none transition-colors duration-150 hover:bg-[rgba(1,20,8,0.05)] focus-visible:shadow-[0_0_0_2px_var(--hub-lime-ring)]"
      style={{ backgroundColor: "rgba(1, 20, 8, 0.035)" }}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: "rgba(185,255,75,0.35)" }} aria-hidden>
        <Sparkles className="h-4 w-4" style={{ color: "#2E5A43" }} strokeWidth={1.9} />
      </span>
      <span className="min-w-0 flex-1 text-[14.5px] leading-5 [overflow-wrap:anywhere]" style={{ ...hubSans, color: hub.text }}>
        {text}
      </span>
    </button>
  );
}

const WHEN_LABEL: Record<HubScenario["schedule"], string> = { once: "Один раз", regular: "Регулярно", manual: "Вручную" };

/**
 * «Запланированные действия»: регулярные и разовые задачи без цели. Создаются здесь или фразой в чате; выполняются по правилам и границам.
 */
export function HubAgentsSchedule({ onAsk }: { onAsk: (text: string) => void }) {
  // Страница живёт в выдвижной панели и рисуется только в браузере, поэтому читаем сохранённое сразу.
  const [rows] = useState<HubScenario[]>(() => readHubScenarios().filter((r) => r.status !== "done"));
  const [inCabinet, setInCabinet] = useLocalPref<boolean>("notify.cabinet", true);
  const [digest, setDigest] = useLocalPref<boolean>("notify.digest", true);

  return (
    <div className="space-y-9">
      <p className="text-[14.5px] leading-[1.55]" style={{ ...hubSans, color: hub.textMuted }}>
        Действия, которые агент выполняет сам по расписанию: регулярно или один раз. Он не выходит за границы из «Правил и автопилота», а каждый запуск попадает в журнал.
      </p>

      <PanelSection title="Создать" hint="Опишите словами, агент покажет карточку: что, когда и до какой границы. Подтверждаете вы.">
        <div className="space-y-2">
          <ExampleChip text="Каждый день 7 дней снижай цену на 5%, не ниже безубыточной" onAsk={onAsk} />
          <ExampleChip text="По пятницам напоминай мне про поставку" onAsk={onAsk} />
          <ExampleChip text="Каждый понедельник присылай сводку по продажам и рекламе" onAsk={onAsk} />
          <ExampleChip text="Через 3 дня проверь, окупилась ли реклама по новому товару" onAsk={onAsk} />
        </div>
      </PanelSection>

      <PanelSection title={rows.length > 0 ? `Активные · ${rows.length}` : "Активные"}>
        {rows.length === 0 ? (
          <div className="flex items-center gap-4 rounded-[18px] px-5 py-6" style={{ backgroundColor: "rgba(46, 90, 67, 0.045)" }}>
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: "rgba(185,255,75,0.35)" }} aria-hidden>
              <CalendarClock className="h-5 w-5" style={{ color: "#2E5A43" }} strokeWidth={1.8} />
            </span>
            <div className="min-w-0">
              <p className="text-[15px] font-semibold leading-5" style={{ ...hubSans, color: hub.text }}>
                Пока ничего не запланировано
              </p>
              <p className="mt-0.5 text-[13.5px] leading-[1.45]" style={{ ...hubSans, color: hub.textSubtle }}>
                Выберите пример выше или напишите агенту свою просьбу.
              </p>
            </div>
          </div>
        ) : (
          <PanelGroup>
            {rows.map((row) => (
              <PanelRow key={row.id} title={row.title} hint={`${WHEN_LABEL[row.schedule]} · ${row.status === "paused" ? "на паузе" : "активно"}`} />
            ))}
          </PanelGroup>
        )}
      </PanelSection>

      <PanelSection title="Куда присылать" hint="Напоминания и итоги от агента.">
        <PanelGroup>
          <PanelRow title="Уведомления в кабинете" hint="Колокольчик и отметка в разделе «Задачи»" control={<AgentSwitch checked={inCabinet} onChange={setInCabinet} label="Уведомления в кабинете" />} />
          <PanelRow title="Итог дня" hint="Короткая сводка в конце дня: что сделано и что ждёт вас" control={<AgentSwitch checked={digest} onChange={setDigest} label="Итог дня" />} />
          <PanelRow
            title="Telegram"
            hint="Напоминания и срочные события прямо в мессенджер"
            control={
              <span className="inline-flex h-7 items-center rounded-full px-3 text-[12.5px] font-medium" style={{ ...hubSans, backgroundColor: "rgba(1,20,8,0.06)", color: hub.textSubtle }}>
                Скоро
              </span>
            }
          />
        </PanelGroup>
      </PanelSection>

      <PanelSection title="Как это работает">
        <ol className="space-y-3">
          {[
            { icon: MessageSquare, text: "Вы описываете действие своими словами или выбираете пример." },
            { icon: Bell, text: "Агент показывает карточку: что сделает, когда и до какой границы. Вы подтверждаете." },
            { icon: Send, text: "Действие выполняется по расписанию, а если шаг выйдет за границы правил, агент остановится и сообщит." },
          ].map((s, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: "rgba(1,20,8,0.05)" }} aria-hidden>
                <s.icon className="h-3.5 w-3.5" style={{ color: hub.textSubtle }} strokeWidth={1.9} />
              </span>
              <p className="text-[14px] leading-[1.5]" style={{ ...hubSans, color: hub.textMuted }}>
                {s.text}
              </p>
            </li>
          ))}
        </ol>
      </PanelSection>
    </div>
  );
}

export function SettingsNote({ children }: { children: ReactNode }) {
  return (
    <p className="px-0.5 text-[12.5px] leading-5" style={{ ...hubSans, color: hub.textSubtle }}>
      {children}
    </p>
  );
}
