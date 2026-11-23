"use client";

import { useEffect, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { hub, hubSans } from "./hub-ui";

/**
 * Как агент «думает»: у каждого вида запроса свои фразы (они меняются по ходу работы), свой список шагов и своя маленькая анимация.
 * Вид запроса определяется по тексту владельца ещё до ответа, поэтому анимация подходит к тому, что агент реально делает.
 */

import type { WorkKind } from "@/lib/seller-hub/agent/intent";
export { classifyIntent } from "@/lib/seller-hub/agent/intent";
export type { WorkKind } from "@/lib/seller-hub/agent/intent";

type Script = { headlines: string[]; steps: Array<{ at: number; text: string }>; done: string };

const SCRIPTS: Record<WorkKind, Script> = {
  think: {
    headlines: ["Думаю…", "Размышляю…", "Секунду, соображаю…", "Сопоставляю факты…"],
    steps: [
      { at: 0, text: "Понимаю вопрос" },
      { at: 3, text: "Сверяю с данными кабинета" },
      { at: 8, text: "Собираю ответ" },
    ],
    done: "Подумал",
  },
  plan: {
    headlines: ["Составляю план…", "Раскладываю по дням…", "Продумываю шаги…", "Сверяю с вашими правилами…", "Проверяю риски…"],
    steps: [
      { at: 0, text: "Читаю задачу" },
      { at: 4, text: "Сверяю с данными кабинета" },
      { at: 14, text: "Подбираю товары" },
      { at: 28, text: "Расписываю шаги по дням" },
      { at: 55, text: "Проверяю план вторым взглядом" },
    ],
    done: "Составил план",
  },
  task: {
    headlines: ["Формулирую задачу…", "Подбираю действие…", "Проверяю, не навредит ли…", "Оформляю по правилам…"],
    steps: [
      { at: 0, text: "Читаю просьбу" },
      { at: 4, text: "Смотрю, что можно сделать безопасно" },
      { at: 14, text: "Оформляю задачу" },
      { at: 30, text: "Проверяю результат" },
    ],
    done: "Подготовил задачу",
  },
  search: {
    headlines: ["Ищу в базе знаний…", "Сейчас найду…", "Листаю статьи…", "Выбираю самое полезное…"],
    steps: [
      { at: 0, text: "Понимаю вопрос" },
      { at: 3, text: "Ищу подходящие статьи" },
      { at: 8, text: "Сверяю с официальной справкой" },
    ],
    done: "Нашёл",
  },
  product: {
    headlines: ["Смотрю товары…", "Достаю цифры из кабинета…", "Сверяю цены и остатки…", "Подбираю нужные карточки…"],
    steps: [
      { at: 0, text: "Понимаю, о каком товаре речь" },
      { at: 3, text: "Ищу в каталоге" },
      { at: 8, text: "Сверяю цену и остаток" },
    ],
    done: "Посмотрел товары",
  },
  analyze: {
    headlines: ["Считаю цифры…", "Ищу причину…", "Сравниваю с прошлым периодом…", "Разбираюсь, что происходит…"],
    steps: [
      { at: 0, text: "Читаю вопрос" },
      { at: 3, text: "Поднимаю данные кабинета" },
      { at: 10, text: "Ищу причины в числах" },
      { at: 20, text: "Формулирую вывод" },
    ],
    done: "Разобрался",
  },
  ads: {
    headlines: ["Смотрю рекламные кампании…", "Считаю ДРР и расходы…", "Ищу, где утекает бюджет…", "Сверяю ставки…"],
    steps: [
      { at: 0, text: "Читаю вопрос" },
      { at: 3, text: "Открываю рекламные кампании" },
      { at: 10, text: "Считаю расходы и заказы" },
      { at: 20, text: "Формулирую вывод" },
    ],
    done: "Проверил рекламу",
  },
  events: {
    headlines: ["Читаю ленту событий…", "Смотрю, что изменилось…", "Отбираю важное…"],
    steps: [
      { at: 0, text: "Открываю события магазина" },
      { at: 3, text: "Отбираю важные изменения" },
      { at: 8, text: "Собираю главное за период" },
    ],
    done: "Просмотрел события",
  },
  web: {
    headlines: ["Ищу в интернете…", "Читаю найденные страницы…", "Сверяю источники…", "Готовлю ответ по найденному…"],
    steps: [
      { at: 0, text: "Формулирую поисковый запрос" },
      { at: 4, text: "Ищу в интернете" },
      { at: 12, text: "Читаю найденные страницы" },
      { at: 22, text: "Сверяю источники и готовлю ответ" },
    ],
    done: "Нашёл в интернете",
  },
  reviews: {
    headlines: ["Читаю отзывы…", "Смотрю рейтинг…", "Ищу, что беспокоит покупателей…"],
    steps: [
      { at: 0, text: "Читаю вопрос" },
      { at: 3, text: "Открываю отзывы" },
      { at: 10, text: "Ищу повторяющиеся жалобы" },
    ],
    done: "Прочитал отзывы",
  },
};

export type WorkLog = { index: number; sec: number; kind: WorkKind; steps: Array<{ text: string; sec: number }> };

/** Шаги, которые агент успел пройти за totalSec секунд, и сколько длился каждый. */
export function stepsFor(kind: WorkKind, totalSec: number, override?: Array<{ at: number; text: string }>): Array<{ text: string; sec: number }> {
  const list = (override ?? SCRIPTS[kind].steps).filter((s) => s.at <= totalSec);
  return list.map((s, i) => ({ text: s.text, sec: Math.max(1, (list[i + 1]?.at ?? totalSec) - s.at) }));
}

const plural = (n: number) => (n === 1 ? "шаг" : n < 5 ? "шага" : "шагов");

/** Маленькая анимация под вид запроса. Чистый CSS, без картинок; при prefers-reduced-motion стоит на месте. */
function Visual({ kind }: { kind: WorkKind }) {
  if (kind === "plan" || kind === "task") {
    const rows = kind === "plan" ? 4 : 2;
    return (
      <div className="flex w-[190px] flex-col gap-1.5" aria-hidden>
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="hub-w-tick" style={{ animationDelay: `${i * 0.7}s` }}>
              <Check className="h-2.5 w-2.5" strokeWidth={3.4} />
            </span>
            <span className="hub-w-fill" style={{ width: `${[78, 92, 64, 84][i]}%`, animationDelay: `${i * 0.7}s` }} />
          </div>
        ))}
      </div>
    );
  }
  if (kind === "search") {
    return (
      <div className="relative w-[190px] space-y-1.5" aria-hidden>
        {[88, 100, 72, 94].map((w, i) => (
          <span key={i} className="hub-w-line block" style={{ width: `${w}%`, animationDelay: `${i * 0.2}s` }} />
        ))}
        <span className="hub-w-lens" />
      </div>
    );
  }  if (kind === "product") {
    return (
      <div className="relative w-[190px] space-y-1.5" aria-hidden>
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="hub-w-chip" style={{ animationDelay: `${i * 0.45}s` }} />
            <span className="hub-w-line" style={{ width: `${[70, 56, 64][i]}%`, animationDelay: `${i * 0.45}s` }} />
          </div>
        ))}
      </div>
    );
  }
  if (kind === "analyze") {
    // Цифры кабинета: сетка, линия с мягкой заливкой прорисовывается, на конце пульсирует точка.
    return (
      <svg width="220" height="64" viewBox="0 0 220 64" fill="none" aria-hidden>
        <defs>
          <linearGradient id="hub-an-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#2E5A43" stopOpacity="0.22" />
            <stop offset="1" stopColor="#2E5A43" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[14, 32, 50].map((y) => (
          <path key={y} d={`M0 ${y}H220`} stroke="rgba(1,20,8,0.07)" strokeWidth="1" strokeDasharray="3 5" />
        ))}
        <path className="hub-w-area" d="M2 52C28 50 40 24 70 34S128 12 158 24S202 8 216 10V62H2Z" fill="url(#hub-an-fill)" />
        <path className="hub-w-draw" d="M2 52C28 50 40 24 70 34S128 12 158 24S202 8 216 10" stroke="#2E5A43" strokeWidth="2.4" strokeLinecap="round" />
        <circle className="hub-w-ring" cx="216" cy="10" r="4" stroke="#2E5A43" strokeWidth="1.4" />
        <circle className="hub-w-draw-dot" cx="216" cy="10" r="3.6" fill="#2E5A43" />
      </svg>
    );
  }
  if (kind === "ads") {
    // Реклама: тонкие столбики расхода растут по очереди, один спокойный цвет.
    return (
      <div className="flex h-9 w-[150px] items-end gap-2" aria-hidden>
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <span key={i} className="hub-w-spend" style={{ animationDelay: `${i * 0.14}s`, height: `${[38, 62, 48, 80, 56, 92, 70][i]}%` }} />
        ))}
      </div>
    );
  }
  if (kind === "events") {
    return (
      <div className="w-[190px] space-y-2.5" aria-hidden>
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-2.5">
            <span className="hub-w-chip" style={{ animationDelay: `${i * 0.5}s` }} />
            <span className="flex-1 space-y-1">
              <span className="hub-w-line block" style={{ width: `${[86, 72, 94][i]}%`, animationDelay: `${i * 0.5}s` }} />
              <span className="hub-w-line block" style={{ width: `${[52, 44, 60][i]}%`, height: 5, animationDelay: `${i * 0.5 + 0.2}s` }} />
            </span>
          </div>
        ))}
      </div>
    );
  }
  if (kind === "reviews") {
    return (
      <div className="flex gap-1" aria-hidden>
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} className="hub-w-star" style={{ animationDelay: `${i * 0.25}s` }}>
            ★
          </span>
        ))}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span key={i} className="hub-w-dot" style={{ animationDelay: `${i * 0.18}s` }} />
      ))}
    </div>
  );}

const GLOBE_M = {
  L: "M6.057 11.565 C2.081 11.565 0.371 8.159 0.371 5.964 C0.371 3.642 2.152 0.329 6.05 0.329",
  ML: "M6.012 11.55 C4.575 10.496 3.333 8.116 3.321 5.964 C3.307 3.399 4.974 0.977 6.012 0.329",
  MR: "M6.012 11.55 C7.211 10.781 8.715 8.287 8.715 5.964 C8.715 3.399 7.24 1.233 6.012 0.329",
  R: "M6.012 11.55 C9.677 11.55 11.65 8.487 11.65 5.964 C11.65 3.499 9.748 0.329 6.012 0.329",
};

/** Вращающийся глобус: шесть меридианов со сдвигом фаз читаются как одна сфера (идея компонента «Web Search» с 21st.dev, нарисовано заново). */
function Globe() {
  const values = [GLOBE_M.L, GLOBE_M.ML, GLOBE_M.MR, GLOBE_M.R, GLOBE_M.L].join(";");
  return (
    <svg viewBox="0 0 12 12" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="0.85" strokeLinecap="round" style={{ overflow: "visible" }} aria-hidden>
      <circle cx="6" cy="6" r="5.7" opacity="0.9" />
      <line x1="0.3" y1="6" x2="11.7" y2="6" opacity="0.9" />
      {["0s", "-1.2s", "-2.4s", "-3.6s", "-4.8s", "-6s"].map((begin) => (
        <path key={begin} d={GLOBE_M.L} opacity="0">
          <animate attributeName="d" dur="7.2s" begin={begin} repeatCount="indefinite" calcMode="spline" keyTimes="0;0.25;0.5;0.75;1" keySplines="0.42 0 0.58 1;0.42 0 0.58 1;0.42 0 0.58 1;0.42 0 0.58 1" values={values} />
          <animate attributeName="opacity" dur="7.2s" begin={begin} repeatCount="indefinite" calcMode="linear" keyTimes="0;0.05;0.7;0.75;1" values="0;0.9;0.9;0;0" />
        </path>
      ))}
    </svg>
  );
}

const WEB_STEPS = [
  { at: 0, text: "Составляю поисковый запрос" },
  { at: 3, text: "Ищу страницы в интернете" },
  { at: 9, text: "Читаю найденные источники" },
  { at: 18, text: "Сверяю факты и готовлю ответ" },
];

/** Поиск в интернете: запрос владельца и этапы. Каждый этап проходит путь «ждёт → глобус крутится → готово». Названий сайтов не выдумываем: пока ответа нет, источники неизвестны. */
function WebSearchSteps({ sec, query }: { sec: number; query?: string }) {
  const current = WEB_STEPS.reduce((acc, s, i) => (sec >= s.at ? i : acc), 0);
  return (
    <div className="hub-ws mt-1">
      {query ? (
        <p className="hub-ws__query">
          <span style={{ color: hub.textSubtle }}>Запрос: </span>«{query.length > 90 ? `${query.slice(0, 90)}…` : query}»
        </p>
      ) : null}
      <ul className="hub-ws__list">
        <span className="hub-ws__rail" aria-hidden />
        {WEB_STEPS.map((st, i) => {
          const state = i < current ? "done" : i === current ? "loading" : "pending";
          return (
            <li key={st.text} className="hub-ws__li" data-state={state}>
              <span className="hub-ws__bullet">
                <svg className="hub-ws__dots" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" aria-hidden>
                  <circle cx="12" cy="12" r="9" strokeWidth="1.8" strokeDasharray="1.8 3.6" strokeLinecap="round" />
                </svg>
                <span className="hub-ws__globe">
                  <Globe />
                </span>
                <svg className="hub-ws__check" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
              </span>
              <span className="hub-ws__title">{st.text}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Панель «агент работает»: меняющаяся фраза, анимация по виду запроса и сворачиваемый список шагов со временем. */
/**
 * steps: свои шаги вместо типовых. Для плана и цены в них настоящие слова и цифры: какой товар открыт, какая цена и остаток, что именно сверяется.
 */
export function ThinkingPanel({ startedAt, kind, steps, query }: { startedAt: number; kind: WorkKind; steps?: Array<{ at: number; text: string }>; /** Слова владельца: для поиска в интернете показываем запрос. */ query?: string }) {
  const script = steps ? { ...SCRIPTS[kind], steps } : SCRIPTS[kind];
  const [sec, setSec] = useState(0);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const id = window.setInterval(() => setSec(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => window.clearInterval(id);
  }, [startedAt]);
  const current = script.steps.reduce((acc, s, i) => (sec >= s.at ? i : acc), 0);
  const headline = script.headlines[Math.floor(sec / 3) % script.headlines.length]!;
  return (
    <div className="min-w-0 flex-1" role="status" aria-live="polite">
      <p key={headline} className="hub-fade-in hub-shimmer text-[16px] font-medium leading-7" style={hubSans}>
        {headline}
      </p>
      <div className="mt-2">
        {kind === "web" ? <WebSearchSteps sec={sec} query={query} /> : <Visual kind={kind} />}
      </div>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="mt-3 inline-flex items-center gap-1.5 rounded-lg text-[13px] outline-none focus-visible:shadow-[0_0_0_2px_var(--hub-lime-ring)]" style={{ ...hubSans, color: hub.textSubtle }}>
        {script.steps[current]!.text} · {sec} с
        <ChevronDown className="h-3.5 w-3.5 transition-transform duration-200" style={{ transform: open ? "rotate(180deg)" : "none" }} aria-hidden />
      </button>
      {open ? (
        <ol className="mt-1.5 space-y-1.5 border-l pl-4" style={{ borderColor: "rgba(1, 20, 8, 0.12)" }}>
          {script.steps.slice(0, current + 1).map((s, i) => {
            const done = i < current;
            return (
              <li key={s.text} className="hub-fade-in flex items-center gap-2.5 text-[13.5px] leading-5" style={{ ...hubSans, color: done ? hub.textSubtle : hub.text }}>
                {done ? <Check className="h-3.5 w-3.5 shrink-0" style={{ color: hub.greenDark }} strokeWidth={2.6} aria-hidden /> : <span className="h-2 w-2 shrink-0 animate-pulse rounded-full" style={{ backgroundColor: hub.greenDark }} aria-hidden />}
                <span className="min-w-0 flex-1">{s.text}</span>
                {done ? <span className="shrink-0 text-[12px] tabular-nums">{Math.max(1, (script.steps[i + 1]?.at ?? sec) - s.at)} с</span> : null}
              </li>
            );
          })}
        </ol>
      ) : null}
    </div>
  );
}

/** Свёрнутая запись под ответом: «Составил план за 33 с · 4 шага». Раскрывается по нажатию. */
export function WorkSummary({ log }: { log: WorkLog }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-3">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="inline-flex items-center gap-1.5 rounded-lg text-[13px] outline-none transition-colors hover:text-[var(--hub-text)] focus-visible:shadow-[0_0_0_2px_var(--hub-lime-ring)]" style={{ ...hubSans, color: hub.textSubtle }}>
        {SCRIPTS[log.kind].done} за {log.sec} с · {log.steps.length} {plural(log.steps.length)}
        <ChevronDown className="h-3.5 w-3.5 transition-transform duration-200" style={{ transform: open ? "rotate(180deg)" : "none" }} aria-hidden />
      </button>
      {open ? (
        <ol className="hub-fade-in mt-1.5 space-y-1 border-l pl-4" style={{ borderColor: "rgba(1, 20, 8, 0.12)" }}>
          {log.steps.map((st) => (
            <li key={st.text} className="flex items-center gap-2.5 text-[13px] leading-5" style={{ ...hubSans, color: hub.textSubtle }}>
              <Check className="h-3.5 w-3.5 shrink-0" style={{ color: hub.greenDark }} strokeWidth={2.6} aria-hidden />
              <span className="min-w-0 flex-1">{st.text}</span>
              <span className="shrink-0 tabular-nums">{st.sec} с</span>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
