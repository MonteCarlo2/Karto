"use client";

import type { SellerProductEvent } from "@/lib/seller-hub/event-engine/types";
import { quickAnswers, stripLinks } from "@/lib/seller-hub/agent/chat";
import type { TaskFocus } from "./task-focus";
import { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useRef, useState } from "react";
import { AlertCircle, ArrowUp, ArrowUpRight, Check, CircleDollarSign, Copy, Megaphone, MessageSquare, PackageOpen, Tag, TrendingDown, type LucideIcon } from "lucide-react";
import { motion } from "framer-motion";
import { HubVoiceButton } from "./hub-voice-button";
import { chartColors } from "./hub-analytics-ui";
import { loadSellerHubAiChat, waitSellerHubAiChatReply, sendSellerHubAiChat, type AiChat } from "@/lib/seller-hub/client-api";
import { ChatBlocks } from "./hub-chat-blocks";
import { WorkSummary, ThinkingPanel, stepsFor, type WorkKind, type WorkLog } from "./hub-chat-thinking";
import { ChatPlanCards } from "./hub-chat-plan";
import type { SellerCatalogItem, SellerCatalogSnapshot } from "@/lib/seller-hub/types";
import { hub, hubSans, hubSerif } from "./hub-ui";

/**
 * «Поставить задачу агенту»: владелец пишет, чего хочет, своими словами. ИИ при необходимости задаёт уточняющие вопросы (до двух раундов), затем составляет планы
 * по подходящим товарам: шаги по дням, контрольные точки, критерии успеха. Планы показываются карточками, их можно принять: дальше программа ведёт план по дням
 * и показывает «было → стало». Деньги не трогаются: цены меняет только кнопка «Выполнить» в этом же разделе.
 *
 * Вид: лёгкое светлое поле ввода (по образцу «AI Input with Suggestions» с 21st.dev, переработано под токены KARTO): тонкая рамка, мягкая заливка, лаймовое кольцо
 * при фокусе, подсказки-чипы под полем, этапы работы агента, пока он думает.
 */

const STORAGE_KEY = "karto-hub-ai-chat-id";

const HINTS = ["Увеличить продажи, не меняя карточки", "Освободить деньги из залежавшегося товара без убытка", "Разобраться, почему падают заказы", "Поднять маржу, не потеряв заказы"];

/** Готовые запросы: нажатие подставляет текст в поле. */
const QUICK: ReadonlyArray<{ icon: LucideIcon; title: string; text: string; color: string }> = [
  { icon: Megaphone, title: "Реклама без заказов", text: "Поставить на паузу рекламу, которая тратит бюджет и не приносит заказов", color: chartColors.violet },
  { icon: Tag, title: "Скидка на запас", text: "Чуть увеличить скидку на товары с большим запасом, не уходя в убыток", color: chartColors.blue },
  { icon: PackageOpen, title: "Залежавшийся товар", text: "Освободить деньги из залежавшегося товара без убытка", color: chartColors.amber },
  { icon: TrendingDown, title: "Падение заказов", text: "Разобраться, почему падают заказы, и предложить, что исправить", color: chartColors.magenta },
  { icon: CircleDollarSign, title: "Маржа", text: "Поднять маржу, не потеряв заказы", color: chartColors.green },
  { icon: MessageSquare, title: "Отзывы без ответа", text: "Что с отзывами без ответа? Покажи самые важные", color: chartColors.teal },
];


const readStoredId = () => {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};
const writeStoredId = (id: string | null) => {
  try {
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* хранилище недоступно: диалог просто не запомнится */
  }
};

/** Подсказка в поле: примеры задач сменяют друг друга печатью. Без анимации при prefers-reduced-motion. */
function useTypedHint(active: boolean): string {
  const [shown, setShown] = useState<string>(HINTS[0]!);
  useEffect(() => {
    if (!active || typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let i = 0;
    let n = 0;
    let dir = 1;
    let t: number;
    const tick = () => {
      const full = HINTS[i]!;
      n += dir;
      setShown(full.slice(0, Math.max(0, n)));
      if (dir === 1 && n >= full.length) {
        dir = -1;
        t = window.setTimeout(tick, 1800);
        return;
      }
      if (dir === -1 && n <= 0) {
        dir = 1;
        i = (i + 1) % HINTS.length;
      }
      t = window.setTimeout(tick, dir === 1 ? 38 : 16);
    };
    t = window.setTimeout(tick, 600);
    return () => window.clearTimeout(t);
  }, [active]);
  return shown;
}

/** Цвета знака: тёмное ядро KARTO, светлый лаймовый обод. Слои и пропорции по образцу «AI Orb Avatar» с 21st.dev. */
const ORB_GRADIENT = "linear-gradient(160deg, #58c27a 0%, #46ad66 100%)";
const ORB_GLOW = "0 0 4px 0 rgba(70,173,102,.35), 0 0 16px 6px rgba(70,173,102,.2), inset 0 0 0 1px rgba(255,255,255,.08)";
const ORB_SHINE = "radial-gradient(ellipse at 30% 24%, rgba(255,255,255,.55) 0%, rgba(255,255,255,.08) 50%, transparent 70%)";

/**
 * Знак агента: шар с зернистой текстурой, бликом и двумя белыми глазами. Моргает, глаза следят за курсором, на нажатие шар «приплющивается»;
 * пока агент думает, глаза осматриваются, шар пульсирует. Свечение только у большого знака. Без движения при prefers-reduced-motion (стили в globals.css).
 */
function AgentOrb({ size, active = false, still = false, shared = false, className = "" }: { size: number; active?: boolean; still?: boolean; shared?: boolean; className?: string }) {
  const uid = useId().replace(/\W/g, "");
  const ref = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || still || active || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const box = el.getBoundingClientRect();
        const dx = e.clientX - (box.left + box.width / 2);
        const dy = e.clientY - (box.top + box.height / 2);
        const dist = Math.max(1, Math.hypot(dx, dy));
        const reach = Math.min(1, dist / 260) * size * 0.07;
        el.style.setProperty("--lx", `${(dx / dist) * reach}px`);
        el.style.setProperty("--ly", `${(dy / dist) * reach}px`);
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
    };
  }, [size, still, active]);

  const noise = (id: string, freq: string, octaves: string) => (
    <svg aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.12] mix-blend-overlay" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id={id} x="0%" y="0%" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency={freq} numOctaves={octaves} stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
      </defs>
      <rect width="100%" height="100%" filter={`url(#${id})`} />
    </svg>
  );

  const orb = (
    <motion.span
      ref={ref}
      role="img"
      aria-label="Агент"
      whileTap={{ scaleX: 1.12, scaleY: 1.25 }}
      transition={{ type: "tween", duration: 0.8, ease: [0.34, 1.56, 0.64, 1] }}
      className={`hub-av ${active ? "hub-av--active" : ""} ${className}`}
      style={{ width: size, height: size, background: ORB_GRADIENT, boxShadow: size >= 64 ? ORB_GLOW : "none", ["--s" as string]: `${size}px` }}
    >
      {noise(`n${uid}`, "0.72", "4")}
      {noise(`g${uid}`, "3.2", "1")}
      <span aria-hidden className="pointer-events-none absolute inset-0" style={{ background: ORB_SHINE }} />
      <span className="hub-av__eyes" style={{ gap: size * 0.21 }}>
        <i className="hub-av__eye" />
        <i className="hub-av__eye" style={{ animationDelay: "60ms" }} />
      </span>
    </motion.span>
  );
  // Общий элемент: знак из центра стартового экрана плавно перелетает в диалог, к первому ответу агента.
  return shared ? (
    <motion.span layoutId="agent-orb" transition={{ type: "spring", stiffness: 120, damping: 20, mass: 0.9 }} style={{ display: "inline-flex", flexShrink: 0 }}>
      {orb}
    </motion.span>
  ) : (
    orb
  );
}

const countWords = (text: string) => text.replace(/\*\*/g, "").split(/\s+/).filter(Boolean).length;

/** Слова строки; при step > 0 каждое проявляется со своей задержкой (start: номер первого слова во всём ответе). Жирный **так**. */
function Inline({ text, start, step }: { text: string; start: number; step: number }) {
  let w = start;
  const words = (str: string) =>
    step !== 0
      ? str.split(/(\s+)/).map((tok, j) => (tok === "" || /^\s+$/.test(tok) ? tok : <span key={j} className={step < 0 ? "hub-word-soft" : "hub-word"} style={step > 0 ? { animationDelay: `${(w++ * step).toFixed(3)}s` } : undefined}>{tok}</span>))
      : str;
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.length > 4 && part.startsWith("**") && part.endsWith("**") ? <strong key={i} className="font-semibold">{words(part.slice(2, -2))}</strong> : <span key={i}>{words(part)}</span>))}
    </>
  );
}

/** Оформление ответа: абзацы, маркированные и нумерованные списки (в том числе сразу после вводной строки), жирный. */
function RichText({ text, step = 0 }: { text: string; step?: number }) {
  const bullet = /^\s*[-•*]\s+/;
  const numbered = /^\s*\d+[.)]\s+/;
  const NL = String.fromCharCode(10);
  const blocks = text.split(NL + NL).map((b) => b.trim()).filter(Boolean);
  const parts: React.ReactNode[] = [];
  let offset = 0;
  blocks.forEach((block, bi) => {
    const lines = block.split(NL);
    let i = 0;
    while (i < lines.length) {
      const kind = bullet.test(lines[i]!) ? "ul" : numbered.test(lines[i]!) ? "ol" : "p";
      let j = i;
      while (j < lines.length && (kind === "ul" ? bullet.test(lines[j]!) : kind === "ol" ? numbered.test(lines[j]!) : !bullet.test(lines[j]!) && !numbered.test(lines[j]!))) j += 1;
      const chunk = lines.slice(i, j);
      const key = `${bi}-${i}`;
      if (kind === "p") {
        const body = chunk.join(NL);
        // Строка только из жирного текста («**Что мешает продажам**») — подзаголовок.
        const heading = /^\*\*[^*]+\*\*:?$/.test(body.trim());
        parts.push(
          <p key={key} className={heading ? "mt-1.5 whitespace-pre-wrap text-[18px] font-semibold leading-[1.4] tracking-[-0.01em]" : "whitespace-pre-wrap"}>
            <Inline text={heading ? body.trim().replace(/:$/, "") : body} start={offset} step={step} />
          </p>,
        );
        offset += countWords(body);
      } else {
        const strip = kind === "ul" ? bullet : numbered;
        const items = chunk.map((l) => {
          const body = l.replace(strip, "");
          const at = offset;
          offset += countWords(body);
          return { body, at };
        });
        parts.push(
          kind === "ul" ? (
            <ul key={key} className="space-y-2.5">
              {items.map((it, n) => (
                <li key={n} className="flex gap-3">
                  {items.every((x) => x.body.length <= 90) ? <span className="mt-[12px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: "#8FD92B" }} aria-hidden /> : <span className="mt-[14px] h-px w-3 shrink-0" style={{ backgroundColor: "rgba(1, 20, 8, 0.35)" }} aria-hidden />}
                  <span className="min-w-0">
                    <Inline text={it.body} start={it.at} step={step} />
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <ol key={key} className="space-y-2">
              {items.map((it, n) => (
                <li key={n} className="flex gap-2.5">
                  <span className="w-5 shrink-0 text-right tabular-nums opacity-50">{n + 1}.</span>
                  <span className="min-w-0">
                    <Inline text={it.body} start={it.at} step={step} />
                  </span>
                </li>
              ))}
            </ol>
          ),
        );
      }
      i = j;
    }
  });
  return <div className="space-y-4">{parts}</div>;
}

/**
 * Ответ агента: новый ответ проявляется по словам из пустоты (как в ChatGPT), чем длиннее ответ, тем быстрее; ответ из истории показывается сразу.
 * Пока слова проявляются, страница мягко прокручивается к концу. Без движения при prefers-reduced-motion.
 */
/** Первые n слов ответа с сохранением разметки: маркеры списков и «**» не считаются словами, незакрытый жирный закрывается. */
function takeWords(text: string, n: number): string {
  let count = 0;
  let out = "";
  const parts = text.split(/(\s+)/);
  for (let k = 0; k < parts.length; k += 1) {
    const tok = parts[k]!;
    if (tok === "" || /^\s+$/.test(tok)) {
      out += tok;
      continue;
    }
    const isMarker = /^([-•*]|\d+[.)])$/.test(tok);
    const isWord = tok.replace(/\*\*/g, "").length > 0 && !isMarker;
    if (isWord) {
      if (count >= n) break;
      count += 1;
    }
    out += tok;
  }
  out = out.replace(/\s+$/, "").replace(/(^|\n)[ \t]*([-•*]|\d+[.)])$/, "$1");
  if ((out.match(/\*\*/g) ?? []).length % 2 === 1) out += "**";
  return out;
}

/**
 * Ответ агента: новый ответ «печатается» слово за словом: текст растёт, абзацы и списки появляются по мере набора, каждое слово мягко проявляется. Длинный ответ печатается быстрее (не дольше 4 секунд).
 * Пока идёт печать, страница мягко прокручивается к концу. Без движения при prefers-reduced-motion.
 */
function Reveal({ text, run, onTyping }: { text: string; run: boolean; /** Печать началась (true) или закончилась (false): по ней страница плавно следует за концом текста. */ onTyping?: (on: boolean) => void }) {
  const words = countWords(text);
  const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const animate = run && !reduce;
  const [shown, setShown] = useState(animate ? 0 : words);
  useEffect(() => {
    if (!animate) {
      setShown(words);
      return;
    }
    const total = Math.min(6000, Math.max(1000, words * 48));
    const t0 = performance.now();
    onTyping?.(true);
    const id = window.setInterval(() => {
      const k = Math.min(words, Math.ceil((words * (performance.now() - t0)) / total));
      setShown(k);
      if (k >= words) {
        window.clearInterval(id);
        window.setTimeout(() => onTyping?.(false), 700);
      }
    }, 40);
    return () => {
      window.clearInterval(id);
      onTyping?.(false);
    };
    // onTyping — управление прокруткой, перезапуск не нужен
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animate, words, text]);
  const typing = animate && shown < words;
  return <RichText text={typing ? takeWords(text, shown) : text} step={animate ? -1 : 0} />;
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          window.setTimeout(() => setDone(false), 1600);
        } catch {
          /* буфер недоступен */
        }
      }}
      className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[12.5px] font-medium opacity-0 outline-none transition-[opacity,background-color] duration-150 hover:bg-[rgba(1,20,8,0.06)] focus-visible:opacity-100 focus-visible:shadow-[0_0_0_2px_var(--hub-lime-ring)] group-hover/msg:opacity-100"
      style={{ ...hubSans, color: hub.textSubtle }}
    >
      {done ? <Check className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
      {done ? "Скопировано" : "Копировать"}
    </button>
  );
}

const money = (v: number | null | undefined) => (v == null ? null : `${Math.round(v).toLocaleString("ru-RU")} ₽`);

export type HubAiChatHandle = { fill: (text: string) => void; startNew: () => void; open: (id: string) => void; /** Начать новый диалог и сразу отправить это сообщение. */ sendNew: (text: string) => void };

export const HubAiChat = forwardRef<HubAiChatHandle, { titleByNm?: Map<string, string>; cardByNm?: Map<string, { title: string; vendorCode: string; description: string }>; onAsk?: (prompt?: string) => void; onChatChange?: (id: string | null) => void; onOpenTasks?: (focus?: TaskFocus) => void; onOpenKb?: (id: string) => void; onOpenSection?: (id: string) => void; itemByNm?: Map<string, SellerCatalogItem>; sandbox?: boolean; snapshot?: SellerCatalogSnapshot; events?: SellerProductEvent[] }>(function HubAiChat({ titleByNm, cardByNm, onChatChange, onOpenTasks, onOpenKb, onOpenSection, itemByNm, snapshot, sandbox, events }, ref) {
  const [chat, setChat] = useState<AiChat | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [startedAt, setStartedAt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  /** Индекс ответа, который только что пришёл: он печатается по словам. */
  const [fresh, setFresh] = useState(-1);
  /** Как агент работал над последним ответом (для свёрнутой записи «Работал N с»). */
  const [workLog, setWorkLog] = useState<WorkLog | null>(null);
  /** Вид текущего запроса: от него зависят фразы и анимация «агент думает». */
  const [workKind, setWorkKind] = useState<WorkKind>("think");
  const [workQuery, setWorkQuery] = useState<string | undefined>(undefined);
  /** Живые шаги работы с настоящими словами и цифрами (товар, цена, остаток). */
  const [workSteps, setWorkSteps] = useState<Array<{ at: number; text: string }> | undefined>(undefined);
  /** Незакрытый прошлый диалог: сам не открывается, его можно продолжить по ссылке под полем. */
  const [pending, setPending] = useState<AiChat | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  useImperativeHandle(ref, () => ({
    fill: (value: string) => {
      setText(value);
      inputRef.current?.focus();
    },
    startNew: () => void startNew(),
    open: (id: string) => void openChat(id),
    sendNew: (value: string) => {
      void startNew();
      setQueued(value);
    },
  }));

  // Сообщение из других экранов («Поручения»): ждём, пока диалог сбросится, и отправляем.
  const [queued, setQueued] = useState<string | null>(null);
  useEffect(() => {
    if (queued && !chat && !busy) {
      const t = queued;
      setQueued(null);
      void send(t);
    }
    // send зависит от состояния диалога; здесь важны только момент и текст
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queued, chat, busy]);

  const chatId = chat?.id || null;
  useEffect(() => {
    onChatChange?.(chatId);
    // onChatChange — сеттер родителя
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId]);

  useEffect(() => {
    // Прошлый диалог подхватываем, пока он не закрыт. Список старых диалогов нужен только для будущей истории.
    let alive = true;
    const id = readStoredId();
    if (id) {
      void loadSellerHubAiChat(id).then((res) => {
        if (!alive) return;
        if (res.ok && res.chat && res.chat.state !== "closed" && res.chat.messages.length > 0) setPending(res.chat);
        else writeStoredId(null);
      });
    }
      return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [chat?.messages.length, busy]);

  // Пока ответ печатается, страница плавно «подтягивается» к концу текста: каждый кадр небольшой шаг, без рывков по целой строке.
  const followOn = useRef(false);
  const stopFollow = useCallback(() => {
    followOn.current = false;
  }, []);
  const startFollow = useCallback(() => {
    if (followOn.current) return;
    followOn.current = true;
    let last = 0;
    const step = () => {
      if (!followOn.current) return;
      const now = performance.now();
      if (now - last >= 12) {
        last = now;
        const end = endRef.current;
        let sc: HTMLElement | null = end?.parentElement ?? null;
        // Настоящий контейнер прокрутки: с overflow auto и не выше окна (внешние обёртки выше окна не прокручиваются).
        while (sc && !(/(auto|scroll)/.test(getComputedStyle(sc).overflowY) && sc.clientHeight <= window.innerHeight + 2)) sc = sc.parentElement;
        if (end && sc) {
          const delta = end.getBoundingClientRect().bottom - (sc.getBoundingClientRect().bottom - 184);
          if (delta > 1) sc.scrollTop += Math.min(14, Math.max(0.8, delta * 0.12));
        }
      }
      // Следующий шаг по кадру; если вкладка скрыта и кадры не приходят, срабатывает запасной таймер. Сработал один, второй отменяется.
      let raf = 0;
      let timer = 0;
      const next = () => {
        window.cancelAnimationFrame(raf);
        window.clearTimeout(timer);
        step();
      };
      raf = window.requestAnimationFrame(next);
      timer = window.setTimeout(next, 80);
    };
    step();
  }, []);

  const hasChat = chat !== null;
  // Пока агент отвечает, поле заблокировано; когда ответ пришёл, курсор возвращается в поле.
  useEffect(() => {
    // На телефоне поле само не фокусируется: иначе при открытии раздела выезжала бы клавиатура.
    if (!busy && window.matchMedia("(pointer: fine)").matches) inputRef.current?.focus({ preventScroll: true });
  }, [busy]);
  // Поле растёт вместе с текстом, но не выше 220 px.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [text, hasChat]);

  async function send(message: string) {
    const typed = message.trim();
    if (!typed || busy) return;
    const msg = typed;
    if (!chat && pending) setPending(null);
    // Что именно делает агент, заранее неизвестно: он сам решает (интернет, база знаний, цифры кабинета). Начинаем с «думаю», дальше анимации ведёт сервер по реальным этапам.
    let kind: WorkKind = "think";
    const live: Array<{ at: number; text: string }> | undefined = undefined;
    setWorkKind("think");
    setWorkQuery(typed);
    setWorkSteps(undefined);
    setBusy(true);
    setStartedAt(Date.now());
    setError(null);
    // Сообщение показывается сразу, пока ИИ думает.
    setChat((prev) => (prev ? { ...prev, messages: [...prev.messages, { role: "user", text: msg, at: new Date().toISOString() }] } : { id: "", title: msg.slice(0, 80), state: "asking", rounds: 0, messages: [{ role: "user", text: msg, at: new Date().toISOString() }], updatedAt: "" }));
    setText("");
    const started = Date.now();
    // Этапы приходят от сервера. Быстрые этапы (поиск по базе знаний, подбор данных) показываем не короче 1,5 с, чтобы их было видно.
    const MIN_SHOW_MS = 1500;
    const queue: WorkKind[] = [];
    let shownKind: WorkKind = "think";
    let shownAt = Date.now();
    let primary: WorkKind | null = null;
    const show = (k: WorkKind) => {
      shownKind = k;
      shownAt = Date.now();
      if (!primary && k !== "think") primary = k;
      setWorkKind(k);
      setStartedAt(Date.now());
      setWorkSteps(undefined);
    };
    const pump = () => {
      if (queue.length === 0) return;
      const wait = Math.max(0, shownAt + MIN_SHOW_MS - Date.now());
      window.setTimeout(() => {
        const k = queue.shift();
        if (k) show(k);
        pump();
      }, wait + 20);
    };
    let res = await sendSellerHubAiChat(chat?.id || null, msg, (phase) => {
      if (phase === shownKind && queue.length === 0) return;
      const wasIdle = queue.length === 0;
      queue.push(phase);
      if (wasIdle) pump();
    });
    // Ответ готов: дожидаемся, пока покажутся этапы, которые не успели.
    while (queue.length > 0) await new Promise((r) => window.setTimeout(r, 120));
    if (shownKind !== "think") await new Promise((r) => window.setTimeout(r, Math.max(0, shownAt + MIN_SHOW_MS - Date.now())));
    kind = primary ?? kind;
    if ((!res.ok || !res.chat) && res.lost) {
      // Долгий запрос могла оборвать сеть или шлюз, а сервер дорабатывает план: ждём ответ ИИ в диалоге.
      const recovered = await waitSellerHubAiChatReply(chat?.id || null, started);
      if (recovered) res = { ok: true, chat: recovered };
    }
    setBusy(false);
    if (!res.ok || !res.chat) {
      setError(res.error ?? "Не удалось отправить задачу");
      setText(msg);
      return;
    }
    setFresh(res.chat.messages[res.chat.messages.length - 1]?.role === "assistant" ? res.chat.messages.length - 1 : -1);
    const spent = Math.max(1, Math.round((Date.now() - started) / 1000));
    setWorkLog(res.chat.messages[res.chat.messages.length - 1]?.role === "assistant" ? { index: res.chat.messages.length - 1, sec: spent, kind, steps: stepsFor(kind, spent, live) } : null);
    setChat(res.chat);
    writeStoredId(res.chat.id);
    setReloadKey((k) => k + 1);
  }

  async function openChat(id: string) {
    setError(null);
    const res = await loadSellerHubAiChat(id);
    if (!res.ok || !res.chat) {
      setError(res.error ?? "Не удалось открыть задачу");
      return;
    }
    setPending(null);
    setFresh(-1);
    setText("");
    setChat(res.chat);
    writeStoredId(res.chat.id);
    setReloadKey((k) => k + 1);
  }

  /** Новая задача: прежний диалог не закрывается, он остаётся в истории слева. */
  async function startNew() {
    writeStoredId(null);
    setChat(null);
    setFresh(-1);
    setPending(null);
    setText("");
    setError(null);
    inputRef.current?.focus();
  }

  const hasDialog = Boolean(chat && chat.messages.length > 0);
  const lastMessage = chat?.messages[chat.messages.length - 1];
  const answering = chat?.state === "asking" && hasDialog && Boolean(lastMessage?.role === "assistant" && lastMessage.questions && lastMessage.questions.length > 0);
  const suggestions = lastMessage?.role === "assistant" && !busy ? (lastMessage.suggestions ?? []) : [];
  // Планы привязаны к ответу, в котором они появились. Старые диалоги без привязки показывают планы под последним ответом агента.
  const lastAssistantIdx = chat ? chat.messages.map((m) => m.role).lastIndexOf("assistant") : -1;
  const legacyPlans = Boolean(chat && chat.state === "planned" && !chat.messages.some((m) => m.planIds && m.planIds.length > 0));
  const planned = Boolean(lastMessage?.role === "assistant" && ((lastMessage.planIds && lastMessage.planIds.length > 0) || (legacyPlans && chat && chat.messages.length - 1 === lastAssistantIdx)));
  const hint = useTypedHint(!hasDialog && !text);
  const started = hasDialog;

  return (
    <section aria-label="Задача агенту" className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 pt-6 sm:px-8 xl:px-14 xl:pt-8">
      {/* Пока диалога нет, шар, заголовок и поле стоят по центру. После первого сообщения поле плавно уезжает вниз, а над ним появляется переписка. */}
      <div className={`mx-auto flex w-full max-w-[800px] flex-1 flex-col ${started ? "" : "justify-center"}`}>
        {started ? (
          <motion.div key="messages" layout="position" className="mb-5 flex-1 space-y-8 pb-2 pt-6" aria-live="polite">
            {chat!.messages.map((m, i) =>
              m.role === "user" ? (
                <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }} className="flex justify-end">
                  <p className="max-w-[82%] whitespace-pre-wrap rounded-[22px] px-4.5 py-3 text-[16px] leading-[1.55] [overflow-wrap:anywhere]" style={{ ...hubSans, backgroundColor: "rgba(1, 20, 8, 0.06)", color: hub.text }}>
                    {m.text}
                  </p>
                </motion.div>
              ) : (
                <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }} className="group/msg flex gap-4">
                  <AgentOrb size={40} still shared={i === 1} className="-mt-1" />
                  <div className="min-w-0 flex-1">
                    {workLog && workLog.index === i ? <WorkSummary log={workLog} /> : null}
                    <div className="text-[16.5px] leading-[1.72] [overflow-wrap:anywhere]" style={{ ...hubSans, color: hub.text }}>
                      <Reveal text={stripLinks(m.questions && m.questions.length > 0 ? `${m.text}\n\n${m.questions.map((q, n) => `${n + 1}. ${q}`).join("\n")}` : m.text)} run={i === fresh} onTyping={(on) => (on ? startFollow() : stopFollow())} />
                    </div>
                    {(() => {
                      const own = m.planIds && m.planIds.length > 0 ? m.planIds : legacyPlans && i === lastAssistantIdx ? [] : null;
                      if (!own || !chat?.id) return null;
                      // Если позже план по тому же товару составлен заново (после правки), здесь остаётся короткая заметка, а карточка живёт в новом ответе.
                      const replaced = own.length > 0 && own.every((id) => chat.messages.slice(i + 1).some((x) => x.planIds?.includes(id)));
                      return replaced ? (
                        <p className="mt-3 text-[13px]" style={{ ...hubSans, color: hub.textSubtle }}>
                          План обновлён, свежая версия ниже.
                        </p>
                      ) : (
                        <div className="mt-4">
                          <ChatPlanCards chatId={chat.id} ids={own.length > 0 ? own : undefined} titleByNm={titleByNm} cardByNm={cardByNm} reloadKey={reloadKey} onOpenTasks={onOpenTasks} trailing={<CopyButton text={m.questions && m.questions.length > 0 ? `${m.text}\n\n${m.questions.map((q, n) => `${n + 1}. ${q}`).join("\n")}` : m.text} />} onEdit={(title) => { setText(`Отредактируй план «${title}»: `); window.setTimeout(() => inputRef.current?.focus(), 30); }} />
                        </div>
                      );
                    })()}
                    {m.sources && m.sources.length > 0 ? (
                      <div className="mt-3 flex flex-wrap items-center gap-2" aria-label="Источники">
                        <span className="text-[12.5px]" style={{ ...hubSans, color: hub.textSubtle }}>
                          Источники
                        </span>
                        {m.sources.map((src) => {
                          let host = src.url;
                          try {
                            host = new URL(src.url).hostname.replace(/^www\./, "");
                          } catch {
                            // оставляем адрес как есть
                          }
                          return (
                            <a key={src.url} href={src.url} target="_blank" rel="noopener noreferrer" title={src.title} className="inline-flex h-8 max-w-[240px] items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-medium outline-none transition-colors hover:bg-white focus-visible:shadow-[0_0_0_2px_var(--hub-lime-ring)]" style={{ ...hubSans, borderColor: "rgba(1, 20, 8, 0.16)", color: hub.text }}>
                              <span className="truncate">{host}</span>
                              <ArrowUpRight className="h-3 w-3 shrink-0 opacity-60" aria-hidden />
                            </a>
                          );
                        })}
                      </div>
                    ) : null}
                    {m.blocks && m.blocks.length > 0 ? (
                      <div className="mt-4">
                        <ChatBlocks blocks={m.blocks} itemByNm={itemByNm} onPick={(msg) => void send(msg)} onOpenTasks={onOpenTasks} onOpenKb={onOpenKb} onOpenSection={onOpenSection} snapshot={snapshot} fullSnapshot={snapshot} sandbox={sandbox ?? true} events={events} />
                      </div>
                    ) : null}
                    {(m.planIds && m.planIds.length > 0) || (legacyPlans && i === lastAssistantIdx) ? null : (
                      <div className="-ml-2 mt-1">
                        <CopyButton text={m.questions && m.questions.length > 0 ? `${m.text}\n\n${m.questions.map((q, n) => `${n + 1}. ${q}`).join("\n")}` : m.text} />
                      </div>
                    )}
                  </div>
                </motion.div>
              ),
            )}
            {busy ? (
              <div className="flex items-start gap-4">
                <AgentOrb size={40} active shared={chat!.messages.length === 1} />
                <ThinkingPanel startedAt={startedAt} kind={workKind} steps={workSteps} query={workQuery} />
              </div>
            ) : null}
            {answering && !busy && lastMessage?.questions ? (
              <div className="-mt-5 space-y-2.5 pl-[56px]" aria-label="Быстрые ответы">
                {lastMessage.questions.map((q, qi) => {
                  const given = lastMessage.questionOptions?.[qi];
                  const opts = given && given.length > 0 ? given : lastMessage.questionOptions ? [] : quickAnswers(q);
                  if (opts.length === 0) return null;
                  return (
                    <motion.div key={q} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + qi * 0.08, duration: 0.35, ease: [0.22, 1, 0.36, 1] }} className="flex flex-wrap items-center gap-2">
                      <span className="mr-1 max-w-[44ch] truncate text-[12.5px]" style={{ ...hubSans, color: hub.textSubtle }}>
                        {lastMessage.questions!.length > 1 ? `Вопрос ${qi + 1}` : "Быстрый ответ"}
                      </span>
                      {opts.map((o) => (
                        <button key={o} type="button" onClick={() => void send(`На вопрос «${q.replace(/\?$/, "")}»: ${o}`)} className="inline-flex h-9 items-center rounded-full border px-4 text-[14px] font-semibold outline-none transition-[background-color,transform] duration-150 hover:-translate-y-px hover:bg-white focus-visible:shadow-[0_0_0_2px_var(--hub-canvas),0_0_0_4px_var(--hub-lime-ring)]" style={{ ...hubSans, borderColor: "rgba(1, 20, 8, 0.2)", color: hub.text }}>
                          {o}
                        </button>
                      ))}
                    </motion.div>
                  );
                })}
              </div>
            ) : null}
            {suggestions.length > 0 ? (
              <ul className="-mt-5 flex flex-wrap gap-2 pl-[56px]" aria-label="Что сделать дальше">
                {suggestions.map((q, qi) => (
                  <motion.li key={q} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + qi * 0.07, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}>
                    <button
                      type="button"
                      onClick={() => void send(q)}
                      className="inline-flex min-h-9 items-center gap-2 rounded-full border px-4 py-1.5 text-left text-[14px] font-medium outline-none transition-[background-color,transform] duration-150 hover:-translate-y-px hover:bg-white focus-visible:shadow-[0_0_0_2px_var(--hub-canvas),0_0_0_4px_var(--hub-lime-ring)]"
                      style={{ ...hubSans, borderColor: "rgba(1, 20, 8, 0.16)", color: hub.text }}
                    >
                      {q}
                      <ArrowUp className="h-3.5 w-3.5 rotate-45 opacity-55" aria-hidden />
                    </button>
                  </motion.li>
                ))}
              </ul>
            ) : null}
            <div ref={endRef} className="scroll-mb-44" />
          </motion.div>
        ) : (
          <motion.div key="intro" layout="position" className="mb-10 text-center" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}>
            <AgentOrb size={112} shared className="mx-auto mb-9" />
            <h1 className="text-balance text-[44px] font-normal leading-[1.08] tracking-[-0.03em] sm:text-[68px]" style={{ ...hubSerif, color: hub.text }}>
              Чем помочь{" "}
              <span className="relative inline-block pb-2.5">
                магазину
                <svg className="absolute -bottom-1 -left-[4%] h-[20px] w-[108%]" viewBox="0 0 140 24" fill="none" preserveAspectRatio="none" aria-hidden>
                  <path d="M6 16 Q 70 24, 134 12" stroke="#8FD92B" strokeWidth="4" strokeLinecap="round" fill="none" />
                </svg>
              </span>
              ?
            </h1>
            <p className="mx-auto mt-6 max-w-[48ch] text-[17px] leading-[1.6]" style={{ ...hubSans, color: hub.textSubtle }}>
              Поставьте задачу или задайте вопрос своими словами. Агент уточнит детали и предложит план.
            </p>
          </motion.div>
        )}

        <motion.div layout transition={{ type: "spring", stiffness: 260, damping: 30 }} className={`w-full ${started ? "sticky bottom-0 z-10 pb-1 pt-4" : ""}`} style={started ? { background: "linear-gradient(to top, var(--hub-canvas) 80%, transparent)" } : undefined}>
          <div className="group/field relative">
            <div className="relative rounded-[24px] bg-white shadow-[0_0_0_1px_rgba(1,20,8,0.1),0_2px_4px_rgba(1,20,8,0.04),0_14px_36px_-14px_rgba(1,20,8,0.2)] transition-shadow duration-200 group-focus-within/field:shadow-[0_0_0_1.5px_rgba(46,90,67,0.55),0_2px_4px_rgba(1,20,8,0.04),0_18px_44px_-14px_rgba(1,20,8,0.28)]">
              <textarea
                ref={inputRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    void send(text);
                  }
                }}
                rows={started ? 1 : 3}
                aria-label="Сообщение агенту"
                placeholder={busy ? "Агент работает над ответом…" : answering ? "Ответьте на вопросы или допишите условия" : planned ? "Поправьте план словами, например: без снижения цены" : started ? "Напишите сообщение агенту" : hint}
                className={`block ${started ? "min-h-[80px]" : "min-h-[120px]"} w-full resize-none bg-transparent py-4 pl-5.5 pr-28 text-[17px] leading-[1.55] outline-none placeholder:text-[#7C857A]`}
                style={{ ...hubSans, color: hub.text }}
                disabled={busy}
              />
              <HubVoiceButton value={text} onChange={setText} disabled={busy} maxLength={2000} className="absolute bottom-2.5 right-14" />
              <button
                type="button"
                disabled={!text.trim() || busy}
                onClick={() => void send(text)}
                aria-label="Отправить"
                className="absolute bottom-2.5 right-2.5 flex h-10 w-10 items-center justify-center rounded-[14px] outline-none transition-[transform,opacity] duration-150 hover:-translate-y-px focus-visible:shadow-[0_0_0_2px_#fff,0_0_0_4px_var(--hub-lime-ring)] active:translate-y-0 disabled:translate-y-0 disabled:opacity-35"
                style={{ backgroundColor: chartColors.lime, color: "#011408" }}
              >
                <ArrowUp className="h-5 w-5" strokeWidth={2.75} aria-hidden />
              </button>
            </div>
          </div>

          {error ? (
            <div className="mt-3 flex items-center gap-3 rounded-[14px] px-3.5 py-2.5" style={{ backgroundColor: hub.dangerSoft }} role="alert">
              <AlertCircle className="h-[18px] w-[18px] shrink-0" style={{ color: hub.danger }} strokeWidth={2.2} aria-hidden />
              <p className="min-w-0 flex-1 text-[14px] leading-5 [overflow-wrap:anywhere]" style={{ ...hubSans, color: hub.text }}>
                {/[A-Za-z]{4,}/.test(error) ? "Не получилось отправить. Ваш текст сохранён." : `${error.replace(/[.\s]+$/, "")}. Ваш текст сохранён.`}
              </p>
              {text.trim() ? (
                <button type="button" onClick={() => void send(text)} className="h-8 shrink-0 rounded-full border px-3.5 text-[13px] font-medium outline-none transition-colors hover:bg-white focus-visible:shadow-[0_0_0_2px_var(--hub-lime-ring)]" style={{ ...hubSans, borderColor: "rgba(1, 20, 8, 0.18)", color: hub.text }}>
                  Повторить
                </button>
              ) : null}
            </div>
          ) : null}

          {!started ? (
            <ul className="mt-6 flex flex-wrap justify-center gap-2.5">
              {QUICK.map((q, qi) => (
                <motion.li key={q.title} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 + qi * 0.05, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}>
                  <button
                    type="button"
                    onClick={() => {
                      setText(q.text);
                      inputRef.current?.focus();
                    }}
                    className="inline-flex h-10 items-center gap-2 rounded-full border px-4 text-[14px] font-medium outline-none transition-[background-color,transform] duration-150 hover:-translate-y-px hover:bg-white focus-visible:shadow-[0_0_0_2px_var(--hub-canvas),0_0_0_4px_var(--hub-lime-ring)]"
                    style={{ ...hubSans, borderColor: "rgba(1, 20, 8, 0.14)", color: hub.text }}
                  >
                    <q.icon className="h-4 w-4" style={{ color: hub.textSubtle }} strokeWidth={1.9} aria-hidden />
                    {q.title}
                  </button>
                </motion.li>
              ))}
            </ul>
          ) : null}
          {started ? (
            <p className="pb-2 pt-2.5 text-center text-[12.5px]" style={{ ...hubSans, color: hub.textSubtle }}>
              Агент ничего не меняет в кабинете без вашего подтверждения.
            </p>
          ) : null}
        </motion.div>
      </div>
      {!started ? (
        <p className="pb-3 pt-2.5 text-center text-[12.5px]" style={{ ...hubSans, color: hub.textSubtle }}>
          Агент ничего не меняет в кабинете без вашего подтверждения.
        </p>
      ) : null}
    </section>
  );
});
