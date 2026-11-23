"use client";

import type React from "react";
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BarChart3,
  Bot,
  Boxes,
  ChevronRight,
  Check,
  Clock,
  Copy,
  ThumbsDown,
  ThumbsUp,
  ExternalLink,
  Flag,
  FlaskConical,
  Image as ImageIcon,
  Info,
  Lightbulb,
  ListChecks,
  Megaphone,
  Percent,
  Plug,
  Rocket,
  Search,
  ShieldCheck,
  Star,
  Truck,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { askSellerHubKnowledge } from "@/lib/seller-hub/client-api";
import { searchSections } from "@/lib/seller-hub/knowledge/search";
import { KB_ARTICLES, kbArticle, kbArticlesOf, kbBranchArticles, kbCategories, kbReadMinutes, searchArticles, type KbBranch, type KbCategory } from "@/lib/seller-hub/knowledge";
import { KB_FEATURED } from "@/lib/seller-hub/knowledge";
import { applyKbUpdates, kbCheckedAt } from "@/lib/seller-hub/knowledge/updates";
import { loadSellerHubKnowledgeUpdates } from "@/lib/seller-hub/client-api";
import { KbMock } from "./hub-knowledge-mocks";
import { KbPalette, KbSnippetRow } from "./hub-knowledge-search";
import { hub, hubSans } from "./hub-ui";


const LINE = "rgba(1, 20, 8, 0.12)";
const MUTED = "rgba(1, 20, 8, 0.76)";
const SUBTLE = "rgba(1, 20, 8, 0.62)";
const INK = "#011408";
const SERIF = { fontFamily: "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif", letterSpacing: "-0.035em" } as const;
/** Все папки одного цвета: бежевая бумага с салатовой окантовкой, в цвет нашего интерфейса. */
const BEIGE = "var(--kb-fill)";
const BEIGE_DEEP = "var(--kb-deep)";
const LIME = "var(--kb-outline)";
/** Цвета ветки: KARTO бежевое с салатовой окантовкой, Wildberries сиреневое с фирменным фиолетовым. */
const BRANCH_THEME: Record<KbBranch, Record<string, string>> = {
  karto: { "--kb-outline": "#B9FF4B", "--kb-fill": "#F7F3E7", "--kb-deep": "#E6E0CC", "--kb-soft": "rgba(1, 20, 8, 0.06)", "--kb-bar": "#2E5A43", "--kb-text": "#2E5A43", "--kb-link": "#14503A", "--kb-corner": "#E3F7B8", "--kb-border": "rgba(1, 20, 8, 0.14)" },
  wb: { "--kb-outline": "#B02FC9", "--kb-fill": "#F8F1FB", "--kb-deep": "#E8D8F1", "--kb-soft": "rgba(176, 47, 201, 0.09)", "--kb-bar": "#8A1FAE", "--kb-text": "#8A1FAE", "--kb-link": "#6A1B8F", "--kb-corner": "#EBCDF7", "--kb-border": "rgba(176, 47, 201, 0.28)" },
};
function catAccent() {
  return { front: BEIGE, back: BEIGE_DEEP, to: "#2E5A43" };
}
const MONO = { fontFamily: "var(--font-geist-mono), ui-monospace, monospace", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.03em" } as const;

const BRANCHES: Array<{ id: KbBranch; title: string; icon: LucideIcon }> = [
  { id: "karto", title: "KARTO", icon: Rocket },
  { id: "wb", title: "Wildberries", icon: Boxes },
];

/** Оформление и фразы каждой ветки: заголовок, подсказки в строке, цвет излучения и значки на фоне. */
const BRANCH_UI: Record<KbBranch, { title: string; lead: string; brand: string; sub: string; subtitle: string; questions: string[]; glow: string; glow2: string; icons: LucideIcon[] }> = {
  karto: {
    title: "Что подсказать по KARTO?",
    lead: "Что подсказать по ",
    brand: "KARTO",
    sub: "Спросите про любую вкладку, показатель или кнопку своими словами.",
    subtitle: "Как пользоваться сервисом",
    questions: ["Что такое ДРР", "Как подключить токен", "Почему цифры не сходятся", "Как создать кампанию", "Что значит «мало данных»", "Как внести себестоимость"],
    glow: "rgba(46, 158, 107, 0.2)",
    glow2: "rgba(185, 255, 75, 0.3)",
    icons: [Megaphone, BarChart3, Truck, ListChecks, Bot, Rocket, ShieldCheck, Star],
  },
  wb: {
    title: "Что вам непонятно в Wildberries?",
    lead: "Что вам непонятно в ",
    brand: "Wildberries",
    sub: "Правила, деньги, карточки и реклама маркетплейса: объясним простыми словами.",
    subtitle: "Справка Wildberries простым языком",
    questions: ["Как вывести деньги", "FBS или FBW", "Упали продажи", "Из чего складывается комиссия", "Что такое карантин цен", "Как выбрать цену"],
    glow: "rgba(176, 47, 201, 0.18)",
    glow2: "rgba(214, 120, 236, 0.28)",
    icons: [Boxes, Percent, Wallet, Star, Flag, Plug, AlertTriangle, ImageIcon],
  },
};


/** Фон главной: излучение из центра, расходящиеся кольца и тихо плавающие значки по теме ветки. */
function KbBackdrop({ branch }: { branch: KbBranch }) {
  const ui = BRANCH_UI[branch];
  return (
    <div key={branch} className="hub-fade-in pointer-events-none absolute inset-x-[-20px] top-[-28px] h-[1250px] overflow-hidden" style={{ WebkitMaskImage: "linear-gradient(to bottom, #000 55%, transparent 100%)", maskImage: "linear-gradient(to bottom, #000 55%, transparent 100%)" }} aria-hidden>
      <div className="absolute inset-0" style={{ background: `radial-gradient(60% 520px at 50% 300px, ${ui.glow2}, transparent 100%), radial-gradient(100% 900px at 50% 320px, ${ui.glow}, transparent 100%)` }} />
      {[0, 3.6, 7.2].map((d) => (
        <span key={d} className="kb-ring absolute left-1/2 top-[300px] block h-[1100px] w-[1100px] rounded-full border" style={{ borderColor: ui.glow, animationDelay: `${-d}s` }} />
      ))}
          </div>
  );
}


type View = { kind: "home" } | { kind: "category"; id: string } | { kind: "article"; id: string };

// ───────────── разметка статьи ─────────────
type ListBlock = { t: "ul"; items: string[] } | { t: "ol"; items: string[] };
type Block =
  | { t: "h"; text: string }
  | { t: "h3"; text: string }
  | { t: "p"; text: string }
  | ListBlock
  | { t: "formula"; lines: string[] }
  | { t: "table"; rows: string[][] }
  | { t: "mock"; name: string }
  | { t: "shot"; file: string; caption: string }
  | { t: "callout"; tone: "tip" | "note" | "warn" | "example"; text: string };

function parseBody(body: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  let list: ListBlock | null = null;
  let formula: string[] = [];
  let table: string[][] = [];
  const flush = () => {
    if (para.length) blocks.push({ t: "p", text: para.join(" ") });
    if (list) blocks.push(list);
    if (formula.length) blocks.push({ t: "formula", lines: formula });
    if (table.length) blocks.push({ t: "table", rows: table });
    para = [];
    list = null;
    formula = [];
    table = [];
  };
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    if (line.startsWith("## ")) {
      flush();
      blocks.push({ t: "h", text: line.slice(3) });
    } else if (line.startsWith("### ")) {
      flush();
      blocks.push({ t: "h3", text: line.slice(4) });
    } else if (line.startsWith("[[mock:")) {
      flush();
      blocks.push({ t: "mock", name: line.replace(/^\[\[mock:|\]\]$/g, "") });
    } else if (line.startsWith("[[shot:")) {
      flush();
      const [file = "", caption = ""] = line.replace(/^\[\[shot:|\]\]$/g, "").split("|");
      blocks.push({ t: "shot", file: file.trim(), caption: caption.trim() });
    } else if (line.startsWith("= ")) {
      if (!formula.length) flush();
      formula.push(line.slice(2));
    } else if (line.startsWith("|")) {
      if (!table.length) flush();
      table.push(line.split("|").slice(1, -1).map((c) => c.trim()));
    } else if (line.startsWith("> ")) {
      flush();
      const text = line.slice(2);
      const tone = /^Совет(?: \([^)]*\))?:/.test(text) ? "tip" : /^Осторожно(?: \([^)]*\))?:/.test(text) ? "warn" : /^Пример(?: \([^)]*\))?:/.test(text) ? "example" : "note";
      const fictional = /^Пример \(вымышленн/.test(text);
      const clean0 = text.replace(/^(Совет|Важно|Осторожно|Пример)(?: \([^)]*\))?:\s*/, "");
      const clean = fictional ? `Цифры вымышленные. ${clean0}` : clean0;
      blocks.push({ t: "callout", tone, text: clean ? `${clean[0]!.toUpperCase()}${clean.slice(1)}` : clean });
    } else if (/^- /.test(line)) {
      if (list?.t !== "ul") {
        flush();
        list = { t: "ul", items: [] };
      }
      list!.items.push(line.slice(2));
    } else if (/^\d+\.\s/.test(line)) {
      if (list?.t !== "ol") {
        flush();
        list = { t: "ol", items: [] };
      }
      list!.items.push(line.replace(/^\d+\.\s/, ""));
    } else {
      if (list || formula.length || table.length) flush();
      para.push(line);
    }
  }
  flush();
  return blocks;
}

/** Жирный текст **так** и ссылки на статьи [текст](id статьи) внутри абзацев и пунктов. */
function Inline({ text, onOpen }: { text: string; onOpen: (id: string) => void }): ReactNode {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\((?:[a-z0-9-]+|https?:\/\/[^)\s]+|\/kb\/[^)\s]+)\))/g).map((part, i) => {
        if (part.startsWith("**")) {
          return (
            <strong key={i} className="font-semibold" style={{ color: hub.text }}>
              {part.slice(2, -2)}
            </strong>
          );
        }
        const ext = /^\[([^\]]+)\]\((https?:\/\/[^)\s]+|\/kb\/[^)\s]+)\)$/.exec(part);
        if (ext) {
          return (
            <a key={i} href={ext[2]} target="_blank" rel="noopener noreferrer" className="rounded-[3px] font-medium underline decoration-[rgba(1,20,8,0.35)] decoration-1 underline-offset-[4px] transition-colors hover:bg-[var(--kb-soft)] hover:decoration-[var(--kb-bar)]" style={{ color: INK }}>
              {ext[1]}
              <ExternalLink className="mb-[3px] ml-1 inline h-[15px] w-[15px]" aria-hidden />
            </a>
          );
        }
        const link = /^\[([^\]]+)\]\(([a-z0-9-]+)\)$/.exec(part);
        if (link && kbArticle(link[2]!)) {
          return (
            <button key={i} type="button" onClick={() => onOpen(link[2]!)} className="cursor-pointer rounded-[3px] font-medium underline decoration-[rgba(1,20,8,0.35)] decoration-1 underline-offset-[4px] transition-colors hover:bg-[var(--kb-soft)] hover:decoration-[var(--kb-bar)]" style={{ color: INK }}>
              {link[1]}
            </button>
          );
        }
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </>
  );
}

const CALLOUT = {
  tip: { icon: <Lightbulb className="h-[18px] w-[18px]" />, title: "Совет", bar: "#2E5A43", bg: "rgba(46, 90, 67, 0.06)", border: "rgba(46, 90, 67, 0.24)" },
  note: { icon: <Info className="h-[18px] w-[18px]" />, title: "Важно", bar: "#011408", bg: "#F7F3E7", border: "rgba(1, 20, 8, 0.14)" },
  warn: { icon: <AlertTriangle className="h-[18px] w-[18px]" />, title: "Осторожно", bar: "#A8680C", bg: "rgba(217, 145, 43, 0.1)", border: "rgba(217, 145, 43, 0.38)" },
  example: { icon: <FlaskConical className="h-[18px] w-[18px]" />, title: "Пример", bar: "#3E64A8", bg: "rgba(79, 124, 196, 0.07)", border: "rgba(79, 124, 196, 0.3)" },
} as const;

const TEXT = "text-[19.5px] leading-[1.75]";

/** Формулы в виде настоящей математической записи: дроби с чертой, корни, скобки, знаки × и −. */
type MNode = { k: "t"; s: string } | { k: "op"; s: string } | { k: "frac"; n: MNode[]; d: MNode[] } | { k: "paren"; n: MNode[] } | { k: "sqrt"; n: MNode[] };

function splitTop(str: string, ops: string[]): Array<{ op: string | null; text: string }> {
  const out: Array<{ op: string | null; text: string }> = [];
  let depth = 0;
  let cur = "";
  let op: string | null = null;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i]!;
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    const hit = depth === 0 ? ops.find((o) => str.startsWith(` ${o} `, i)) : undefined;
    if (hit) {
      out.push({ op, text: cur.trim() });
      op = hit;
      cur = "";
      i += hit.length + 1;
      continue;
    }
    cur += ch;
  }
  out.push({ op, text: cur.trim() });
  return out;
}

function wrapped(str: string, open: string): boolean {
  if (!str.startsWith(open) || !str.endsWith(")")) return false;
  let depth = 0;
  for (let i = open.length - 1; i < str.length; i++) {
    if (str[i] === "(") depth++;
    if (str[i] === ")") depth--;
    if (depth === 0 && i < str.length - 1) return false;
  }
  return true;
}

function factorNodes(f: string): MNode[] {
  if (wrapped(f, "(")) return [{ k: "paren", n: parseExpr(f.slice(1, -1)) }];
  if (wrapped(f, "√(")) return [{ k: "sqrt", n: parseExpr(f.slice(2, -1)) }];
  return [{ k: "t", s: f }];
}

function parseExpr(str: string): MNode[] {
  const out: MNode[] = [];
  for (const part of splitTop(str, ["+", "−"])) {
    if (part.op) out.push({ k: "op", s: part.op });
    const mult = splitTop(part.text, ["×", "÷"]);
    let cur: MNode[] = factorNodes(mult[0]!.text);
    for (const m of mult.slice(1)) {
      if (m.op === "÷") cur = [{ k: "frac", n: cur, d: factorNodes(m.text) }];
      else cur = [...cur, { k: "op", s: "×" }, ...factorNodes(m.text)];
    }
    out.push(...cur);
  }
  return out;
}

function MathNodes({ nodes }: { nodes: MNode[] }) {
  return (
    <>
      {nodes.map((n, i) => {
        if (n.k === "op") {
          return (
            <span key={i} className="mx-[0.35em]">
              {n.s}
            </span>
          );
        }
        if (n.k === "frac") {
          return (
            <span key={i} className="mx-1.5 inline-flex flex-col items-center align-middle">
              <span className="px-2 pb-1.5 text-center">
                <MathNodes nodes={n.n} />
              </span>
              <span className="h-0 w-full border-t-[1.5px]" style={{ borderColor: INK }} />
              <span className="px-2 pt-1.5 text-center">
                <MathNodes nodes={n.d} />
              </span>
            </span>
          );
        }
        if (n.k === "paren") {
          return (
            <span key={i} className="whitespace-nowrap">
              <span className="text-[1.25em] font-light">(</span>
              <MathNodes nodes={n.n} />
              <span className="text-[1.25em] font-light">)</span>
            </span>
          );
        }
        if (n.k === "sqrt") {
          return (
            <span key={i} className="inline-flex items-stretch whitespace-nowrap">
              <span className="text-[1.3em] leading-none">√</span>
              <span className="border-t-[1.5px] px-1" style={{ borderColor: INK }}>
                <MathNodes nodes={n.n} />
              </span>
            </span>
          );
        }
        const numeric = /^[\d\s.,%]+$/.test(n.s);
        return (
          <span key={i} style={{ fontStyle: numeric ? "normal" : "italic" }}>
            {n.s}
          </span>
        );
      })}
    </>
  );
}

function FormulaLine({ line }: { line: string }) {
  const at = line.indexOf(" = ");
  const lhs = at > 0 ? line.slice(0, at) : null;
  const rhs = at > 0 ? line.slice(at + 3) : line;
  return (
    <div className="flex flex-wrap items-center justify-center gap-y-3 text-[23px] leading-[1.35]" style={{ fontFamily: '"Cambria Math", "STIX Two Math", "Latin Modern Math", "Times New Roman", Georgia, serif', color: INK }}>
      {lhs ? (
        <>
          <span style={{ fontStyle: "italic" }}>{lhs}</span>
          <span className="mx-[0.5em]">=</span>
        </>
      ) : null}
      <MathNodes nodes={parseExpr(rhs)} />
    </div>
  );
}

/** Файлы скриншотов, которые уже лежат в public/kb. Пока файла нет в списке, блок не показывается и браузер его не запрашивает. */
const KB_SHOT_FILES = new Set<string>(["wb-sizes-official.png", "wb-balance-official.png", "wb-promo-calendar.png", "wb-promo-window.png", "wb-wbp-finance.png", "wb-supply-add.png", "ads-bids.png", "ads-campaigns.png", "ads-overview.png", "ads-promotions.png", "ads-review-actions.png", "ads-review.png", "ads-seo.png", "ads-sources.png", "agents-page.png", "analytics-funnel.png", "analytics-money.png", "analytics-stocks.png", "analytics-summary.png", "cards-pillars.png", "cards-plan.png", "catalog.png", "events.png", "logistics-overview.png", "orders-list.png", "orders-overview.png", "orders-supplies.png", "overview.png", "stocks-edit.png", "tasks.png"]);

/** Скриншот в рамке окна с подписью; по клику открывается крупно. Если файла нет, блок не показывается. */
function KbShot({ file, caption }: { file: string; caption: string }) {
  const [failed, setFailed] = useState(false);
  const [zoom, setZoom] = useState(false);
  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setZoom(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoom]);
  if (failed || !KB_SHOT_FILES.has(file)) return null;
  return (
    <figure className="my-3">
      <button type="button" onClick={() => setZoom(true)} className="group mx-auto block w-fit max-w-full cursor-zoom-in overflow-hidden rounded-[14px] text-left outline-none ring-1 ring-black/10 transition-shadow duration-300 hover:shadow-[0_28px_50px_-30px_rgba(1,20,8,0.55)] focus-visible:shadow-[0_0_0_3px_rgba(1,20,8,0.3)]" aria-label={`Увеличить: ${caption || "скриншот"}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/kb/${file}`} alt={caption} loading="lazy" onError={() => setFailed(true)} className="block h-auto w-full max-w-[720px]" />
      </button>
      {caption ? (
        <figcaption className="mt-3 text-center text-[15px]" style={{ ...hubSans, color: MUTED }}>
          {caption}
        </figcaption>
      ) : null}
      {zoom
        ? createPortal(
            <div className="hub-fade-in fixed inset-0 z-[200] flex cursor-zoom-out items-center justify-center p-6" style={{ backgroundColor: "rgba(1, 20, 8, 0.82)" }} onClick={() => setZoom(false)} role="dialog" aria-label={caption || "Скриншот"}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/kb/${file}`} alt={caption} className="max-h-full max-w-full rounded-[14px] bg-white shadow-2xl" />
            </div>,
            document.body,
          )
        : null}
    </figure>
  );
}

function Body({ body, onOpen, accent }: { body: string; onOpen: (id: string) => void; accent: string }) {
  const blocks = useMemo(() => parseBody(body), [body]);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState<string | null>(null);
  return (
    <div className="space-y-7">
      {blocks.map((b, i) => {
        switch (b.t) {
          case "h":
            return (
              <h2 key={i} id={`h-${i}`} className="scroll-mt-24 pt-16 text-[34px] font-semibold leading-[1.2]" style={{ ...SERIF, color: INK }}>
                <span>{b.text}</span>
              </h2>
            );
          case "h3":
            return (
              <h3 key={i} className="pt-6 text-[25px] font-semibold" style={{ ...SERIF, color: hub.text }}>
                {b.text}
              </h3>
            );
          case "p":
            return (
              <p key={i} className={TEXT} style={{ ...hubSans, color: INK }}>
                <Inline text={b.text} onOpen={onOpen} />
              </p>
            );
          case "ul":
            return (
              <ul key={i} className="space-y-3">
                {b.items.map((it) => (
                  <li key={it} className={`flex gap-4 ${TEXT}`} style={{ ...hubSans, color: INK }}>
                    <span className="mt-[12px] h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: accent }} aria-hidden />
                    <span>
                      <Inline text={it} onOpen={onOpen} />
                    </span>
                  </li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={i} className="rounded-[20px] border bg-white/60 p-2 sm:p-3" style={{ borderColor: LINE }}>
                {b.items.map((it, n) => {
                  const key = `${i}-${n}`;
                  const on = !!done[key];
                  return (
                    <li key={key} className="flex items-start gap-4 rounded-[14px] px-3 py-3.5 sm:px-4">
                      <button type="button" onClick={() => setDone((d) => ({ ...d, [key]: !d[key] }))} aria-pressed={on} aria-label={on ? `Шаг ${n + 1}: отмечен, снять отметку` : `Шаг ${n + 1}: отметить выполненным`} className="mt-[1px] flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[14px] font-semibold outline-none transition-colors duration-300 hover:ring-2 hover:ring-[rgba(46,125,79,0.35)] focus-visible:shadow-[0_0_0_3px_rgba(1,20,8,0.25)]" style={{ ...MONO, backgroundColor: on ? "#2E5A43" : "rgba(1, 20, 8, 0.07)", color: on ? "#FFFFFF" : hub.text }}>
                        {on ? <Check className="h-4 w-4" aria-hidden /> : n + 1}
                      </button>
                      <span className={`${TEXT} transition-opacity duration-300`} style={{ ...hubSans, color: INK, opacity: on ? 0.55 : 1 }}>
                        <Inline text={it} onOpen={onOpen} />
                      </span>
                    </li>
                  );
                })}
              </ol>
            );
          case "formula":
            return (
              <div key={i} className="relative rounded-[22px] border px-6 py-7 sm:px-10" style={{ borderColor: "rgba(1, 20, 8, 0.14)", backgroundColor: "#FFFFFF" }}>
                <div className="mb-5 flex items-center justify-between">
                  <p className="text-[13px] font-semibold uppercase tracking-[0.12em]" style={{ ...hubSans, color: "var(--kb-link)" }}>
                    Как считается
                  </p>
                  <button
                    type="button"
                    aria-label="Скопировать формулу"
                    onClick={() => {
                      void navigator.clipboard?.writeText(b.lines.join("\n")).catch(() => undefined);
                      setCopied(String(i));
                      window.setTimeout(() => setCopied(null), 1400);
                    }}
                    className="inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[13.5px] font-medium outline-none transition-colors hover:bg-black/[0.04] focus-visible:shadow-[0_0_0_3px_rgba(1,20,8,0.25)]"
                    style={{ ...hubSans, borderColor: "rgba(1, 20, 8, 0.2)", color: INK }}
                  >
                    {copied === String(i) ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    {copied === String(i) ? "Скопировано" : "Копировать"}
                  </button>
                </div>
                <div className="space-y-6 overflow-x-auto py-1">
                  {b.lines.map((l) => (
                    <FormulaLine key={l} line={l} />
                  ))}
                </div>
              </div>
            );
          case "table": {
            const [head, ...rows] = b.rows;
            return (
              <div key={i} className="overflow-x-auto rounded-[18px] border bg-white" style={{ borderColor: "rgba(1, 20, 8, 0.16)", boxShadow: "0 18px 36px -30px rgba(1, 20, 8, 0.4)" }}>
                <table className="w-full min-w-[600px] border-collapse text-left">
                  <thead>
                    <tr>
                      {head?.map((c) => (
                        <th key={c} className="px-7 py-4 text-[13px] font-semibold uppercase tracking-[0.1em]" style={{ ...hubSans, color: "rgba(1, 20, 8, 0.7)", backgroundColor: "#F7F3E7", borderBottom: "1px solid rgba(1, 20, 8, 0.14)" }}>
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, ri) => (
                      <tr key={ri} className="border-t transition-colors hover:bg-black/[0.025]" style={{ borderColor: LINE }}>
                        {r.map((c, ci) => (
                          <td key={ci} className="px-7 py-[18px] align-top text-[18px] leading-[1.55]" style={{ ...hubSans, color: INK, fontWeight: ci === 0 ? 600 : 400 }}>
                            <Inline text={c} onOpen={onOpen} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          }
          case "mock":
            return <KbMock key={i} name={b.name} />;
          case "shot":
            return <KbShot key={i} file={b.file} caption={b.caption} />;
          default: {
            const c = CALLOUT[b.tone];
            return (
              <aside key={i} className="flex gap-3.5 rounded-[14px] border px-6 py-5" style={{ backgroundColor: c.bg, borderColor: c.border }}>
                <span className="mt-[3px] shrink-0" style={{ color: c.bar }} aria-hidden>
                  {c.icon}
                </span>
                <p className="text-[18px] leading-[1.7]" style={{ ...hubSans, color: INK }}>
                  <strong className="font-semibold" style={{ color: c.bar }}>
                    {c.title}.{" "}
                  </strong>
                  <Inline text={b.text} onOpen={onOpen} />
                </p>
              </aside>
            );
          }
        }
      })}
    </div>
  );
}

// ───────────── карточка папки ─────────────
/**
 * Папка раздела: бежевая задняя стенка с язычком, из неё торчат листы с названиями статей, спереди лицевая сторона с салатовой окантовкой.
 * При наведении лицевая сторона приоткрывается, листы поднимаются. Все папки одного цвета.
 */
function Folder({ category, onOpen, delay }: { category: KbCategory; onOpen: () => void; delay: number }) {
  const list = kbArticlesOf(category.id);
  const papers = list.slice(0, 3);
  const word = list.length === 1 ? "статья" : list.length < 5 ? "статьи" : "статей";
  return (
    <li className="hub-rise" style={{ animationDelay: `${delay}ms` }}>
      <button type="button" onClick={onOpen} className="group relative block h-[262px] w-full text-left outline-none [perspective:1100px]" aria-label={`${category.title}: ${list.length} ${word}`}>
        <span className="absolute left-0 top-0 h-10 w-[46%] rounded-t-[16px]" style={{ backgroundColor: BEIGE_DEEP }} aria-hidden />
        <span className="absolute inset-x-0 bottom-0 top-[30px] rounded-[22px] rounded-tl-none" style={{ backgroundColor: BEIGE_DEEP }} aria-hidden />
        <span className="absolute inset-0 transition-transform duration-500 ease-out group-hover:-translate-y-9 group-focus-visible:-translate-y-9 motion-reduce:transition-none" aria-hidden>
          {papers.map((a, i) => (
            <span key={a.id} className="absolute inset-x-5 rounded-[12px] px-4 pt-3.5 text-[13.5px] font-semibold leading-[1.3]" style={{ top: 46, height: 160, backgroundColor: "#FFFFFF", color: INK, transform: `translateY(${12 - i * 4}px) rotate(${(i - 1) * 1.6}deg)`, zIndex: i + 1, boxShadow: "0 -2px 10px -4px rgba(1,20,8,0.3), 0 0 0 1px rgba(1,20,8,0.08)", ...hubSans }}>
              <span className="line-clamp-2 block">{a.title}</span>
              <span className="mt-3 block h-1.5 w-full rounded-full" style={{ backgroundColor: "rgba(1, 20, 8, 0.08)" }} />
              <span className="mt-1.5 block h-1.5 w-4/5 rounded-full" style={{ backgroundColor: "rgba(1, 20, 8, 0.08)" }} />
            </span>
          ))}
        </span>
        <span className="absolute inset-x-0 bottom-0 top-[98px] z-10 flex origin-bottom flex-col rounded-[22px] border-2 p-5 transition-transform duration-500 ease-out group-hover:[transform:rotateX(-22deg)] group-focus-visible:[transform:rotateX(-22deg)] motion-reduce:transition-none" style={{ backgroundColor: BEIGE, borderColor: LIME, boxShadow: "0 22px 34px -24px rgba(1, 20, 8, 0.55)" }}>
          <span className="block text-[23px] font-semibold leading-[1.18] tracking-[-0.02em]" style={{ ...hubSans, color: INK }}>
            {category.title}
          </span>
          <span className="mt-auto flex items-center justify-between text-[14px] font-medium" style={{ ...hubSans, color: MUTED }}>
            {list.length} {word}
            <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" style={{ color: INK }} aria-hidden />
          </span>
        </span>
      </button>
    </li>
  );
}

/** Бегущая подсказка в строке поиска: показывает, как можно спросить. */
function useTypedPlaceholder(active: boolean, questions: string[]): string {
  const [text, setText] = useState(questions[0]!);
  useEffect(() => {
    if (!active || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    let q = 0;
    let n = 0;
    let dir = 1;
    const timer = setInterval(() => {
      const full = questions[q]!;
      n += dir;
      if (n >= full.length + 14) dir = -1;
      if (n <= 0) {
        dir = 1;
        q = (q + 1) % questions.length;
      }
      setText(full.slice(0, Math.max(0, Math.min(n, full.length))));
    }, 60);
    return () => clearInterval(timer);
  }, [active, questions]);
  return text;
}

/**
 * База знаний на всю ширину. Главная: заголовок, строка вопроса и интерактивные папки разделов.
 * Статья: дерево разделов слева, широкий читаемый текст по центру, оглавление с подсветкой справа.
 */
export function HubKnowledge() {
  const [branch, setBranch] = useState<KbBranch>("karto");
  const [view, setView] = useState<View>({ kind: "home" });
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState<{ q: string; text: string | null; sources: string[]; notice?: string } | null>(null);
  const [activeH, setActiveH] = useState<string | null>(null);
  const [navBranch, setNavBranch] = useState<KbBranch>("karto");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [rated, setRated] = useState<Record<string, "up" | "down">>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const topRef = useRef<HTMLDivElement>(null);
  // Счётчик нужен только для перерисовки: обновления накладываются на общий список статей в памяти.
  const [, setKbVersion] = useState(0);
  useEffect(() => {
    let alive = true;
    void loadSellerHubKnowledgeUpdates().then((u) => {
      if (!alive || !u) return;
      if (applyKbUpdates(u)) setKbVersion((v) => v + 1);
    });
    return () => {
      alive = false;
    };
  }, []);
  const placeholder = useTypedPlaceholder(!focused && !query, BRANCH_UI[branch].questions);

  // Ссылка вида #kb=id открывает статью сразу (адрес читаем один раз при открытии).
  useEffect(() => {
    const id = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("kb");
    const a = id ? kbArticle(id) : null;
    if (a) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setBranch(a.branch);
      setNavBranch(a.branch);
      setView({ kind: "article", id: a.id });
    }
  }, []);

  const open = (next: View, nextBranch?: KbBranch) => {
    if (nextBranch) setBranch(nextBranch);
    if (next.kind === "article") setNavBranch(kbArticle(next.id)?.branch ?? nextBranch ?? branch);
    setView(next);
    setAnswer(null);
    setQuery("");
    setActiveH(null);
    try {
      const hash = next.kind === "article" ? `#kb=${next.id}` : "";
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${hash}`);
    } catch {
      /* адресная строка недоступна */
    }
    topRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  };
  const openArticle = (id: string) => {
    const a = kbArticle(id);
    if (a) open({ kind: "article", id }, a.branch);
  };

  const sectionHits = useMemo(() => (query.trim().length >= 2 ? searchSections(KB_ARTICLES, query, 8) : []), [query]);
  const pickHit = (id: string, heading: string | null) => {
    openArticle(id);
    if (heading) {
      window.setTimeout(() => {
        const el = [...document.querySelectorAll("h2")].find((h) => h.textContent?.includes(heading));
        el?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 650);
    }
  };
  const searching = query.trim().length >= 2;

  async function ask(q = query) {
    const question = q.trim();
    if (question.length < 3 || asking) return;
    setAsking(true);
    setAnswer(null);
    const res = await askSellerHubKnowledge(question);
    setAsking(false);
    if (res.ok) setAnswer({ q: question, text: res.answer ?? null, sources: res.sources ?? [], notice: res.notice });
    else setAnswer({ q: question, text: null, sources: searchArticles(KB_ARTICLES, question, { limit: 3 }).map((r) => r.article.id), notice: "Помощник сейчас недоступен, ниже подходящие статьи." });
  }

  const article = view.kind === "article" ? kbArticle(view.id) : null;
  const activeBranch: KbBranch = article ? article.branch : branch;
  const categories = kbCategories(activeBranch);
  const navCategories = kbCategories(navBranch);
  const category = view.kind === "category" ? categories.find((c) => c.id === view.id) ?? null : article ? categories.find((c) => c.id === article.category) ?? null : null;
  const siblings = category ? kbArticlesOf(category.id) : [];
  const idx = article ? siblings.findIndex((a) => a.id === article.id) : -1;
  const prev = idx > 0 ? siblings[idx - 1] : null;
  const next = idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null;
  const accentColor = catAccent();
  const toc = article ? parseBody(article.body).map((b, i) => (b.t === "h" ? { id: `h-${i}`, text: b.text } : null)).filter((x): x is { id: string; text: string } => Boolean(x)) : [];


  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Подсветка текущего раздела в оглавлении при прокрутке.
  useEffect(() => {
    if (!article) return;
    const els = [...document.querySelectorAll<HTMLElement>("h2[id^='h-']")];
    if (els.length === 0) return;
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActiveH(visible.target.id);
      },
      { rootMargin: "-80px 0px -65% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [article]);

  const inArticle = Boolean(article) && !searching;

  const searchBox = (big: boolean) => (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void ask();
      }}
      className="relative"
    >
      <label className="relative block">
        <span className="sr-only">Поиск по базе знаний</span>
        <Search className={`pointer-events-none absolute top-1/2 -translate-y-1/2 ${big ? "left-6 h-6 w-6" : "left-5 h-5 w-5"}`} style={{ color: SUBTLE }} aria-hidden />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setAnswer(null);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={big ? placeholder + (placeholder ? "│" : "") : "Спросите или найдите"}
          className={`w-full rounded-full border bg-white/80 outline-none transition-[box-shadow,border-color] duration-200 focus:border-[#011408] focus:shadow-[0_0_0_6px_rgba(1,20,8,0.07)] ${big ? "h-[72px] pl-[62px] pr-[190px] text-[20px]" : "h-[52px] pl-[50px] pr-[150px] text-[16.5px]"}`}
          style={{ ...hubSans, borderColor: "rgba(1, 20, 8, 0.2)", color: hub.text, boxShadow: big ? "0 18px 40px -26px rgba(1, 20, 8, 0.45)" : undefined }}
        />
        {query ? (
          <button type="button" onClick={() => { setQuery(""); setAnswer(null); }} aria-label="Очистить" className={`absolute top-1/2 -translate-y-1/2 rounded-full p-2 hover:bg-black/[0.06] ${big ? "right-[162px]" : "right-[122px]"}`} style={{ color: MUTED }}>
            <X className="h-5 w-5" />
          </button>
        ) : null}
      </label>
      <button
        type="submit"
        disabled={query.trim().length < 3 || asking}
        className={`absolute top-1/2 inline-flex -translate-y-1/2 items-center gap-2 rounded-full font-semibold outline-none transition-[background-color,opacity,transform] duration-200 hover:scale-[1.02] focus-visible:shadow-[0_0_0_3px_rgba(1,20,8,0.4)] disabled:opacity-40 ${big ? "right-2.5 h-[48px] px-5 text-[16px]" : "right-2 h-[38px] px-4 text-[14.5px]"}`}
        style={{ ...hubSans, backgroundColor: "#011408", color: "#FFFFFF" }}
      >
        {asking ? "Думаю…" : "Спросить"}
        <ArrowRight className="h-4 w-4" aria-hidden />
      </button>
    </form>
  );

  const answerBlock = (
    <>
      {asking ? (
        <div className="hub-fade-in mt-6 rounded-[20px] border bg-white p-6" style={{ borderColor: LINE }} aria-busy>
          <div className="h-4 w-2/3 animate-pulse rounded-full" style={{ backgroundColor: "rgba(1, 20, 8, 0.1)" }} />
          <div className="mt-3 h-4 w-1/2 animate-pulse rounded-full" style={{ backgroundColor: "rgba(1, 20, 8, 0.08)" }} />
        </div>
      ) : null}
      {answer ? (
        <section className="hub-pop mt-6 rounded-[20px] border bg-white p-7 text-left shadow-[0_24px_48px_-36px_rgba(1,20,8,0.5)]" style={{ borderColor: "rgba(1, 20, 8, 0.18)" }}>
          <p className="flex items-center gap-2.5 text-[14.5px] font-semibold" style={{ ...hubSans, color: MUTED }}>
            <Bot className="h-[18px] w-[18px]" aria-hidden />
            Ответ помощника
          </p>
          {answer.text ? (
            <p className="mt-3 whitespace-pre-line text-[19px] leading-[1.75]" style={{ ...hubSans, color: hub.text }}>
              {answer.text}
            </p>
          ) : (
            <p className="mt-3 text-[17px] leading-[1.6]" style={{ ...hubSans, color: MUTED }}>
              {answer.notice ?? "Подходящие статьи ниже."}
            </p>
          )}
          {answer.sources.length > 0 ? (
            <div className="mt-4 flex flex-wrap items-center gap-2.5">
              <span className="text-[14.5px]" style={{ ...hubSans, color: SUBTLE }}>
                Подробнее:
              </span>
              {answer.sources.map((id) => {
                const a = kbArticle(id);
                return a ? (
                  <button key={id} type="button" onClick={() => openArticle(id)} className="rounded-full border px-4 py-2 text-[14.5px] font-medium outline-none transition-colors hover:bg-white focus-visible:shadow-[0_0_0_3px_var(--hub-lime-ring)]" style={{ ...hubSans, color: hub.text, borderColor: "rgba(1, 20, 8, 0.2)" }}>
                    {a.title}
                  </button>
                ) : null;
              })}
            </div>
          ) : null}
        </section>
      ) : null}
    </>
  );

  const resultsBlock = searching ? (
    <section className="hub-fade-in mt-8 text-left">
      <p className="text-[15px] font-semibold" style={{ ...hubSans, color: SUBTLE }}>
        {sectionHits.length > 0 ? `Найдено: ${sectionHits.length}` : "Ничего не нашлось"}
      </p>
      {sectionHits.length === 0 ? (
        <p className="mt-3 text-[17px] leading-[1.6]" style={{ ...hubSans, color: MUTED }}>
          Попробуйте другие слова или нажмите «Спросить»: помощник поймёт вопрос, даже если в статьях другие слова.
        </p>
      ) : (
        <div className="mt-2 rounded-[20px] border bg-white/85 p-2 backdrop-blur" style={{ borderColor: LINE }}>
          {sectionHits.map((h) => (
            <KbSnippetRow key={h.article.id} hit={h} query={query} onOpen={() => pickHit(h.article.id, h.heading)} />
          ))}
        </div>
      )}
    </section>
  ) : null;

  /** Название ветки текстом: KARTO нашим шрифтом, Wildberries фирменным градиентом. */
function BranchWord({ id, small }: { id: KbBranch; small?: boolean }) {
  if (id === "karto") {
    return (
      <span className={small ? "text-[17px]" : "text-[30px]"} style={{ ...SERIF, fontWeight: 700, letterSpacing: "0.04em", color: "#14503A" }}>
        KARTO
      </span>
    );
  }
  return (
    <span className={small ? "text-[16px]" : "text-[27px]"} style={{ fontFamily: "var(--font-geist-sans), sans-serif", fontWeight: 800, letterSpacing: "-0.04em", backgroundImage: "linear-gradient(100deg, #D6168F 0%, #8F2BD0 100%)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>
      Wildberries
    </span>
  );
}

/** Переключатель веток. large — крупный на главной; иначе компактный в левой панели статьи. onPick решает, что менять. */
  const branchSwitch = (large: boolean, current: KbBranch, onPick: (b: KbBranch) => void) =>
    large ? (
      <div role="tablist" aria-label="Ветка базы знаний" className="relative inline-grid grid-cols-2 rounded-full p-1" style={{ backgroundColor: "rgba(1, 20, 8, 0.07)" }}>
        <span className="absolute rounded-full bg-white transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]" style={{ width: "calc(50% - 4px)", height: "calc(100% - 8px)", top: 4, left: 4, transform: current === "wb" ? "translateX(100%)" : "translateX(0)", boxShadow: "0 1px 3px rgba(1, 20, 8, 0.18)" }} aria-hidden />
        {BRANCHES.map((b) => (
          <button key={b.id} type="button" role="tab" aria-selected={current === b.id} onClick={() => onPick(b.id)} className="relative z-[1] inline-flex items-center justify-center gap-2 rounded-full px-5 py-1.5 text-[14.5px] font-semibold outline-none transition-colors duration-300 focus-visible:shadow-[0_0_0_3px_rgba(1,20,8,0.25)] sm:px-6" style={{ ...hubSans, color: current === b.id ? INK : MUTED }}>
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: b.id === "karto" ? "#B9FF4B" : "#B02FC9", boxShadow: b.id === "karto" ? "0 0 0 1px rgba(1,20,8,0.25)" : undefined }} aria-hidden />
            {b.title}
          </button>
        ))}
      </div>
    ) : (
      <div role="tablist" aria-label="Ветка базы знаний" className="flex gap-6 border-b" style={{ borderColor: LINE }}>
        {BRANCHES.map((b) => (
          <button key={b.id} type="button" role="tab" aria-selected={current === b.id} onClick={() => onPick(b.id)} className="-mb-px border-b-2 pb-2.5 outline-none transition-opacity focus-visible:opacity-100" style={{ borderColor: current === b.id ? INK : "transparent", opacity: current === b.id ? 1 : 0.5 }}>
            <BranchWord id={b.id} small />
          </button>
        ))}
      </div>
    );
  const pickHome = (b: KbBranch) => {
    setBranch(b);
    setNavBranch(b);
    setView({ kind: "home" });
    setQuery("");
    setAnswer(null);
  };

  return (
    <div ref={topRef} className="pb-16" style={BRANCH_THEME[activeBranch] as React.CSSProperties}>
      {!inArticle ? (
        /* ───── Главная и раздел ───── */
        <div className="relative w-full">
          <KbBackdrop branch={branch} />
          <div className="relative">
            <div className="flex justify-center pt-0 sm:pt-1">{branchSwitch(true, branch, pickHome)}</div>
            <section className="mx-auto max-w-[980px] pt-9 text-center sm:pt-12">
              <h1 key={branch} className="hub-fade-in mx-auto max-w-[15ch] text-[46px] font-semibold leading-[1.02] sm:text-[84px]" style={{ ...SERIF, letterSpacing: "-0.045em", color: INK }}>
                {BRANCH_UI[branch].lead}
                {BRANCH_UI[branch].brand}
                ?
              </h1>
              <p key={`${branch}-s`} className="hub-fade-in mx-auto mt-7 max-w-[52ch] text-[19px] leading-[1.55] sm:text-[23px]" style={{ ...hubSans, color: MUTED }}>
                {BRANCH_UI[branch].sub}
              </p>
              <div className="mt-11 text-left">{searchBox(true)}</div>
              {!searching && !answer && !asking ? (
                <div className="mt-5 flex flex-wrap justify-center gap-2.5">
                  {BRANCH_UI[branch].questions.slice(0, 4).map((q) => (
                    <button key={q} type="button" onClick={() => { setQuery(q); void ask(q); }} className="rounded-full border bg-white/70 px-4 py-2 text-[15px] font-medium outline-none backdrop-blur transition-colors hover:bg-white focus-visible:shadow-[0_0_0_3px_rgba(1,20,8,0.25)]" style={{ ...hubSans, color: MUTED, borderColor: "rgba(1, 20, 8, 0.14)" }}>
                      {q}
                    </button>
                  ))}
                </div>
              ) : null}
              {answerBlock}
              {resultsBlock}
            </section>

            {!searching ? (
              view.kind === "category" && category ? (
                <section key={category.id} className="mx-auto mt-10 max-w-[1240px]">
                  <div className="hub-fade-in flex flex-wrap items-center gap-4">
                    <button type="button" onClick={() => open({ kind: "home" })} className="inline-flex items-center gap-2.5 rounded-full border px-5 py-2.5 text-[15px] font-semibold outline-none transition-colors hover:bg-black/[0.04] focus-visible:shadow-[0_0_0_3px_rgba(1,20,8,0.25)]" style={{ ...hubSans, borderColor: "rgba(1, 20, 8, 0.28)", color: INK }}>
                      <ArrowLeft className="h-4 w-4" aria-hidden />
                      Все папки
                    </button>
                    <p className="text-[15px] font-medium" style={{ ...hubSans, color: MUTED }}>
                      {activeBranch === "karto" ? "KARTO" : "Wildberries"} / {category.title}
                    </p>
                  </div>
                  <div className="hub-fade-in relative mt-14">
                    <span className="absolute -top-[38px] left-9 z-10 flex h-[40px] items-center rounded-t-[16px] border-2 border-b-0 px-6 text-[14px] font-semibold" style={{ ...hubSans, borderColor: LIME, backgroundColor: BEIGE, color: INK }}>
                      {kbArticlesOf(category.id).length} {kbArticlesOf(category.id).length === 1 ? "статья" : kbArticlesOf(category.id).length < 5 ? "статьи" : "статей"} · около {kbArticlesOf(category.id).reduce((n, x) => n + kbReadMinutes(x), 0)} мин
                    </span>
                    <div className="rounded-[28px] border-2 p-6 sm:p-9" style={{ borderColor: LIME, backgroundColor: BEIGE, boxShadow: "0 30px 50px -38px rgba(1, 20, 8, 0.5)" }}>
                      <div className="flex items-center gap-5 border-b pb-8" style={{ borderColor: LINE }}>
                        <div className="min-w-0">
                          <h2 className="text-[38px] font-semibold leading-[1.08] sm:text-[54px]" style={{ ...SERIF, color: INK }}>
                            {category.title}
                          </h2>
                          <p className="mt-1.5 text-[17px] leading-[1.45]" style={{ ...hubSans, color: MUTED }}>
                            {category.hint}
                          </p>
                        </div>
                      </div>
                      <ul className="mt-7 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                        {kbArticlesOf(category.id).map((a, i) => (
                          <li key={a.id} className="hub-rise" style={{ animationDelay: `${100 + i * 60}ms` }}>
                            <button type="button" onClick={() => open({ kind: "article", id: a.id })} className="group relative flex h-full min-h-[210px] w-full flex-col rounded-[14px] rounded-tr-[36px] border bg-white p-6 text-left outline-none transition-[transform,box-shadow] duration-300 hover:-translate-y-1.5 hover:shadow-[0_24px_36px_-26px_rgba(1,20,8,0.55)] focus-visible:-translate-y-1.5 focus-visible:shadow-[0_0_0_3px_rgba(1,20,8,0.3)]" style={{ borderColor: "rgba(1, 20, 8, 0.14)" }}>
                              <span className="absolute right-0 top-0 h-9 w-9 rounded-bl-[12px] rounded-tr-[36px]" style={{ backgroundColor: "var(--kb-corner)", boxShadow: "-2px 2px 4px -2px rgba(1, 20, 8, 0.25)" }} aria-hidden />
                              <span className="block pr-7 text-[20px] font-semibold leading-[1.28] tracking-[-0.01em]" style={{ ...hubSans, color: INK }}>
                                {a.title}
                              </span>
                              <span className="mt-2.5 line-clamp-3 block text-[15.5px] leading-[1.55]" style={{ ...hubSans, color: MUTED }}>
                                {a.summary}
                              </span>
                              <span className="mt-auto flex items-center justify-between pt-5 text-[14px] font-medium" style={{ ...hubSans, color: MUTED }}>
                                <span className="inline-flex items-center gap-1.5">
                                  <Clock className="h-4 w-4" aria-hidden />
                                  {kbReadMinutes(a)} мин
                                </span>
                                <ArrowRight className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-1" style={{ color: INK }} aria-hidden />
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </section>
              ) : (
                <section key={branch} className="hub-fade-in mt-16">
                  <ul className="grid gap-x-7 gap-y-8 sm:grid-cols-2 xl:grid-cols-4">
                    {categories.map((c, i) => (
                      <Folder key={c.id} category={c} delay={i * 45} onOpen={() => open({ kind: "category", id: c.id })} />
                    ))}
                  </ul>
                  <p className="mt-10 text-center text-[15px] font-medium" style={{ ...hubSans, color: SUBTLE }}>
                    {BRANCH_UI[branch].subtitle} · {kbBranchArticles(branch).length} статей
                  </p>
                  <div className="mx-auto mt-16 max-w-[1240px]">
                    <h2 className="text-[34px] font-semibold tracking-[-0.02em]" style={{ ...SERIF, color: hub.text }}>
                      С чего начать
                    </h2>
                    <ul className="mt-6 grid gap-x-10 sm:grid-cols-2">
                      {KB_FEATURED[branch].map((id, i) => {
                        const a = kbArticle(id);
                        return a ? (
                          <li key={id} className="border-t" style={{ borderColor: LINE }}>
                            <button type="button" onClick={() => open({ kind: "article", id })} className="group flex w-full items-start gap-5 py-6 text-left outline-none focus-visible:bg-black/[0.03]">
                              <span className="w-8 shrink-0 pt-1 text-[15px] font-semibold" style={{ ...MONO, color: SUBTLE }}>
                                {String(i + 1).padStart(2, "0")}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block text-[20px] font-semibold leading-[1.3] transition-transform duration-300 group-hover:translate-x-1" style={{ ...hubSans, color: hub.text }}>
                                  {a.title}
                                </span>
                                <span className="mt-1.5 line-clamp-2 block text-[16px] leading-[1.55]" style={{ ...hubSans, color: MUTED }}>
                                  {a.summary}
                                </span>
                              </span>
                              <ArrowRight className="mt-1.5 h-5 w-5 shrink-0 transition-transform duration-300 group-hover:translate-x-1" style={{ color: SUBTLE }} aria-hidden />
                            </button>
                          </li>
                        ) : null;
                      })}
                    </ul>
                  </div>
                </section>
              )
            ) : null}
          </div>
        </div>
      ) : article ? (
        /* ───── Статья ───── */
        <div key={article.id} className="hub-fade-in grid items-start gap-x-10 xl:grid-cols-[280px_minmax(0,1fr)_210px]">
          <aside className="hidden self-stretch xl:block">
            <nav aria-label="Разделы" className="sticky top-4 max-h-[calc(100vh-40px)] overflow-y-auto border-r pb-6 pr-7" style={{ borderColor: "rgba(1, 20, 8, 0.16)" }}>
              <button type="button" onClick={() => open({ kind: "home" }, navBranch)} className="mb-5 inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[14.5px] font-semibold outline-none transition-colors hover:bg-black/[0.04] focus-visible:shadow-[0_0_0_3px_rgba(1,20,8,0.25)]" style={{ ...hubSans, borderColor: "rgba(1, 20, 8, 0.22)", color: INK }}>
                <ArrowLeft className="h-4 w-4" aria-hidden />
                На главную
              </button>
              <div className="mb-6">{branchSwitch(false, navBranch, setNavBranch)}</div>
              <ul key={navBranch} className="hub-fade-in space-y-3">
                {navCategories.map((c) => {
                  const list = kbArticlesOf(c.id);
                  const here = article ? c.id === article.category : false;
                  const isOpen = expanded[c.id] ?? here;
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => setExpanded((prev) => ({ ...prev, [c.id]: !isOpen }))}
                        aria-expanded={isOpen}
                        className="flex w-full items-center gap-2 rounded-[8px] py-2.5 text-left text-[16px] font-semibold leading-[1.3] outline-none transition-colors hover:text-[#14503A] focus-visible:shadow-[0_0_0_3px_rgba(1,20,8,0.25)]"
                        style={{ ...hubSans, color: INK }}
                      >
                        <span className="min-w-0 flex-1">{c.title}</span>
                        <ChevronRight className={`h-4 w-4 shrink-0 transition-transform duration-300 ${isOpen ? "rotate-90" : ""}`} style={{ color: SUBTLE }} aria-hidden />
                      </button>
                      <div className="grid transition-[grid-template-rows] duration-300 ease-out" style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}>
                        <ul className="ml-1 min-h-0 overflow-hidden border-l" style={{ borderColor: LINE }}>
                          {list.map((a) => {
                            const on = article ? a.id === article.id : false;
                            return (
                              <li key={a.id}>
                                <button
                                  type="button"
                                  onClick={() => open({ kind: "article", id: a.id })}
                                  className="-ml-px block w-full rounded-r-[8px] border-l-2 py-2.5 pl-4 pr-2 text-left text-[15px] leading-[1.4] outline-none transition-colors hover:text-[#14503A] focus-visible:shadow-[0_0_0_3px_rgba(1,20,8,0.25)]"
                                  style={{ ...hubSans, borderColor: on ? "var(--kb-bar)" : "transparent", backgroundColor: on ? "var(--kb-soft)" : undefined, color: on ? INK : "rgba(1, 20, 8, 0.8)", fontWeight: on ? 600 : 400 }}
                                >
                                  {a.title}
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </aside>

          <article className="mx-auto min-w-0 w-full max-w-[880px]">
            {answerBlock}
            <header className="rounded-[28px] border px-6 py-7 sm:px-10 sm:py-9" style={{ backgroundColor: "var(--kb-fill)", borderColor: "var(--kb-border)" }}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <nav aria-label="Путь" className="flex flex-wrap items-center gap-2 text-[14.5px]" style={{ ...hubSans, color: MUTED }}>
                  <button type="button" onClick={() => open({ kind: "home" }, article.branch)} className="inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 font-semibold outline-none transition-colors hover:bg-black/[0.04] focus-visible:shadow-[0_0_0_3px_rgba(1,20,8,0.25)]" style={{ borderColor: "rgba(1, 20, 8, 0.24)", color: INK }}>
                    <ArrowLeft className="h-4 w-4" aria-hidden />
                    Главная
                  </button>
                  <span>{article.branch === "karto" ? "KARTO" : "Wildberries"}</span>
                  <ChevronRight className="h-4 w-4" aria-hidden />
                  {category ? (
                    <button type="button" onClick={() => open({ kind: "category", id: category.id }, article.branch)} className="font-medium underline-offset-4 hover:underline" style={{ color: INK }}>
                      {category.title}
                    </button>
                  ) : null}
                </nav>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setPaletteOpen(true)} className="inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[14px] font-medium outline-none transition-colors hover:bg-black/[0.04] focus-visible:shadow-[0_0_0_3px_rgba(1,20,8,0.25)]" style={{ ...hubSans, borderColor: "rgba(1, 20, 8, 0.24)", color: INK }}>
                    <Search className="h-4 w-4" aria-hidden />
                    Поиск
                    <kbd className="rounded-[6px] border px-1.5 text-[11.5px]" style={{ borderColor: "rgba(1, 20, 8, 0.2)", color: SUBTLE }}>
                      Ctrl K
                    </kbd>
                  </button>
                </div>
              </div>
              <p className="mt-9 text-[13.5px] font-semibold uppercase tracking-[0.12em]" style={{ ...hubSans, color: "var(--kb-text)" }}>
                {category?.title ?? "База знаний"}
              </p>
              <h1 className="mt-3 text-[38px] font-semibold leading-[1.1] sm:text-[54px]" style={{ ...SERIF, color: INK }}>
                {article.title}
              </h1>
              <p className="mt-4 text-[20px] leading-[1.55]" style={{ ...hubSans, color: MUTED }}>
                {article.summary}
              </p>
              <p className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[14.5px]" style={{ ...hubSans, color: SUBTLE }}>
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="h-4 w-4" aria-hidden />
                  {kbReadMinutes(article)} мин чтения
                </span>
                {article.branch === "wb" && kbCheckedAt() ? <span>Обновлено {new Date(kbCheckedAt()!).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}</span> : null}
                {article.source ? (
                  <a href={article.source} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 font-medium underline-offset-4 hover:underline" style={{ color: INK }}>
                    Официальная справка WB
                    <ExternalLink className="h-4 w-4" aria-hidden />
                  </a>
                ) : null}
              </p>
            </header>
            {toc.length > 1 ? (
              <nav aria-label="Содержание статьи" className="mt-6 flex flex-wrap items-center gap-2.5 xl:hidden">
                <span className="text-[14px] font-semibold" style={{ ...hubSans, color: MUTED }}>
                  В статье:
                </span>
                {toc.map((t, n) => (
                  <button key={t.id} type="button" onClick={() => document.getElementById(t.id)?.scrollIntoView({ behavior: "smooth", block: "start" })} className="inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[14.5px] font-medium outline-none transition-colors hover:bg-black/[0.04] focus-visible:shadow-[0_0_0_3px_rgba(1,20,8,0.25)]" style={{ ...hubSans, borderColor: "rgba(1, 20, 8, 0.18)", color: INK }}>
                    <span className="text-[12.5px] font-semibold" style={{ ...MONO, color: accentColor.to }}>
                      {String(n + 1).padStart(2, "0")}
                    </span>
                    {t.text}
                  </button>
                ))}
              </nav>
            ) : null}
            <div className="mt-4">
              <Body body={article.body} onOpen={openArticle} accent={accentColor.to} />

              <div className="mt-16 flex flex-wrap items-center justify-between gap-4 rounded-[18px] border px-6 py-5" style={{ borderColor: LINE, backgroundColor: BEIGE }}>
                <p className="text-[17px] font-semibold" style={{ ...hubSans, color: INK }}>
                  {rated[article.id] === "up" ? "Спасибо, рады, что помогло." : rated[article.id] === "down" ? "Спасибо. Задайте вопрос помощнику ниже, он поможет разобраться." : "Статья помогла?"}
                </p>
                {rated[article.id] ? null : (
                  <div className="flex gap-2.5">
                    <button type="button" onClick={() => setRated((r) => ({ ...r, [article.id]: "up" }))} className="inline-flex items-center gap-2 rounded-full border bg-white px-4 py-2 text-[15px] font-medium outline-none transition-colors hover:bg-[var(--kb-soft)] focus-visible:shadow-[0_0_0_3px_rgba(1,20,8,0.25)]" style={{ ...hubSans, borderColor: "rgba(1, 20, 8, 0.2)", color: INK }}>
                      <ThumbsUp className="h-4 w-4" aria-hidden />
                      Да
                    </button>
                    <button type="button" onClick={() => setRated((r) => ({ ...r, [article.id]: "down" }))} className="inline-flex items-center gap-2 rounded-full border bg-white px-4 py-2 text-[15px] font-medium outline-none transition-colors hover:bg-black/[0.05] focus-visible:shadow-[0_0_0_3px_rgba(1,20,8,0.25)]" style={{ ...hubSans, borderColor: "rgba(1, 20, 8, 0.2)", color: INK }}>
                      <ThumbsDown className="h-4 w-4" aria-hidden />
                      Нет
                    </button>
                  </div>
                )}
              </div>

              {article.related && article.related.length > 0 ? (
                <div className="mt-28 border-t pt-14" style={{ borderColor: LINE }}>
                  <p className="text-[28px] font-semibold" style={{ ...SERIF, color: hub.text }}>
                    Читайте также
                  </p>
                  <ul className="mt-5 grid gap-4 sm:grid-cols-2">
                    {article.related.map((id) => {
                      const a = kbArticle(id);
                      return a ? (
                        <li key={id}>
                          <button type="button" onClick={() => openArticle(id)} className="group flex h-full w-full flex-col rounded-[20px] border bg-white/70 p-5 text-left outline-none transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-[0_22px_36px_-26px_rgba(1,20,8,0.5)] focus-visible:shadow-[0_0_0_3px_rgba(1,20,8,0.25)]" style={{ borderColor: LINE }}>
                            <span className="text-[17.5px] font-semibold leading-[1.3]" style={{ ...hubSans, color: hub.text }}>
                              {a.title}
                            </span>
                            <span className="mt-2 line-clamp-2 text-[15px] leading-[1.5]" style={{ ...hubSans, color: MUTED }}>
                              {a.summary}
                            </span>
                            <span className="mt-auto inline-flex items-center gap-1.5 pt-4 text-[14px] font-medium" style={{ ...hubSans, color: "var(--kb-link)" }}>
                              Читать
                              <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden />
                            </span>
                          </button>
                        </li>
                      ) : null;
                    })}
                  </ul>
                </div>
              ) : null}

              {prev || next ? (
                <div className="mt-24 grid gap-4 border-t pt-14 sm:grid-cols-2" style={{ borderColor: LINE }}>
                  {prev ? (
                    <button type="button" onClick={() => open({ kind: "article", id: prev.id })} className="rounded-[16px] border p-5 text-left outline-none transition-colors hover:bg-black/[0.03] focus-visible:shadow-[0_0_0_3px_var(--hub-lime-ring)]" style={{ borderColor: "rgba(1, 20, 8, 0.16)" }}>
                      <span className="text-[13.5px]" style={{ ...hubSans, color: SUBTLE }}>
                        ← Назад
                      </span>
                      <span className="mt-1 block text-[17px] font-semibold" style={{ ...hubSans, color: hub.text }}>
                        {prev.title}
                      </span>
                    </button>
                  ) : <span />}
                  {next ? (
                    <button type="button" onClick={() => open({ kind: "article", id: next.id })} className="rounded-[16px] border p-5 text-right outline-none transition-colors hover:bg-black/[0.04] focus-visible:shadow-[0_0_0_3px_rgba(1,20,8,0.25)]" style={{ borderColor: "#011408" }}>
                      <span className="text-[13.5px]" style={{ ...hubSans, color: SUBTLE }}>
                        Дальше →
                      </span>
                      <span className="mt-1 block text-[17px] font-semibold" style={{ ...hubSans, color: hub.text }}>
                        {next.title}
                      </span>
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </article>

          <aside className="hidden self-stretch xl:block">
            <div className="sticky top-[calc(50vh-120px)] flex justify-end">
              <nav aria-label="Разделы статьи" className="flex flex-col items-end gap-0.5">
                {toc.length > 1
                  ? toc.map((t) => {
                      const on = activeH === t.id || (!activeH && t.id === toc[0]!.id);
                      return (
                        <a
                          key={t.id}
                          href={`#${t.id}`}
                          aria-label={t.text}
                          onClick={(e) => {
                            e.preventDefault();
                            document.getElementById(t.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
                          }}
                          className="group relative flex h-7 items-center justify-end pl-8 outline-none"
                        >
                          <span className="pointer-events-none absolute right-full z-30 mr-2 max-w-[260px] whitespace-normal rounded-[10px] px-3 py-2 text-[13.5px] font-medium leading-[1.3] text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100" style={{ ...hubSans, backgroundColor: INK, width: "max-content" }}>
                            {t.text}
                          </span>
                          <span className="block h-[3px] rounded-full transition-all duration-300 group-hover:w-8" style={{ width: on ? 32 : 18, backgroundColor: on ? "var(--kb-bar)" : "rgba(1, 20, 8, 0.28)" }} />
                        </a>
                      );
                    })
                  : null}
                <button type="button" onClick={() => topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })} aria-label="Наверх" className="mt-5 flex h-9 w-9 items-center justify-center rounded-full border outline-none transition-colors hover:bg-black/[0.05] focus-visible:shadow-[0_0_0_3px_rgba(1,20,8,0.25)]" style={{ borderColor: "rgba(1, 20, 8, 0.25)", color: INK }}>
                  <ArrowUp className="h-4 w-4" aria-hidden />
                </button>
              </nav>
            </div>
          </aside>
        </div>
      ) : null}
      {paletteOpen ? <KbPalette open onClose={() => setPaletteOpen(false)} suggestions={BRANCH_UI.karto.questions.slice(0, 3).concat(BRANCH_UI.wb.questions.slice(0, 3))} onPick={pickHit} /> : null}
    </div>
  );
}
