"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, CornerDownLeft, Search, Sparkles } from "lucide-react";
import { KB_ARTICLES, kbArticle } from "@/lib/seller-hub/knowledge";
import { askSellerHubKnowledge } from "@/lib/seller-hub/client-api";
import { searchArticles, searchSections, stem, tokens, type KbSectionHit } from "@/lib/seller-hub/knowledge/search";
import { hubSans } from "./hub-ui";

const INK = "#011408";
const MUTED = "rgba(1, 20, 8, 0.76)";
const SUBTLE = "rgba(1, 20, 8, 0.6)";

/** Подсвечивает в тексте слова, которые совпали с запросом (по основам слов). */
export function Highlight({ text, query }: { text: string; query: string }) {
  const stems = useMemo(() => new Set(tokens(query).map(stem)), [query]);
  const parts = text.split(/([a-zа-яё0-9]+)/gi);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 && stems.has(stem(p)) ? (
          <mark key={i} className="rounded-[4px] px-0.5" style={{ backgroundColor: "rgba(1, 20, 8, 0.1)", color: INK, fontWeight: 600 }}>
            {p}
          </mark>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  );
}

/** Строка результата поиска: название статьи, раздел и фрагмент с подсветкой. */
export function KbSnippetRow({ hit, query, active, onOpen, onHover }: { hit: KbSectionHit; query: string; active?: boolean; onOpen: () => void; onHover?: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      onMouseMove={onHover}
      className="group flex w-full items-start gap-4 rounded-[14px] px-4 py-3.5 text-left outline-none transition-colors focus-visible:shadow-[0_0_0_3px_rgba(1,20,8,0.25)]"
      style={{ backgroundColor: active ? "rgba(1, 20, 8, 0.06)" : "transparent" }}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[16.5px] font-semibold leading-[1.3]" style={{ ...hubSans, color: INK }}>
          <Highlight text={hit.article.title} query={query} />
        </span>
        {hit.heading ? (
          <span className="mt-0.5 block text-[13.5px] font-medium" style={{ ...hubSans, color: SUBTLE }}>
            {hit.article.branch === "karto" ? "KARTO" : "Wildberries"} · {hit.heading}
          </span>
        ) : null}
        <span className="mt-1.5 line-clamp-2 block text-[15px] leading-[1.5]" style={{ ...hubSans, color: MUTED }}>
          <Highlight text={hit.snippet} query={query} />
        </span>
      </span>
      <ArrowRight className="mt-2 h-4 w-4 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" style={{ color: INK }} aria-hidden />
    </button>
  );
}

type PaletteAnswer = { q: string; text: string | null; sources: string[]; notice?: string };

/**
 * Окно поиска и помощника (Ctrl+K / ⌘K), доступно на главной и внутри статьи.
 * Два режима: «Найти в статьях» (умный поиск по разделам) и «Спросить помощника» (ответ своими словами со ссылками на статьи).
 */
export function KbPalette({ open, onClose, suggestions, onPick, }: { open: boolean; onClose: () => void; suggestions: string[]; onPick: (articleId: string, heading: string | null) => void }) {
    const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState<PaletteAnswer | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const hits = useMemo(() => searchSections(KB_ARTICLES, q, 7), [q]);
  const canAsk = q.trim().length >= 3;
  // Первая строка списка всегда «Спросить помощника», дальше найденные разделы статей.
  const total = hits.length + (canAsk ? 1 : 0);
  const answering = asking || answer != null;

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(t);
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  const close = () => {
    setQ("");
    setCursor(0);
    setAnswer(null);
    onClose();
  };

  async function ask(question: string) {
    const text = question.trim();
    if (text.length < 3 || asking) return;
    setQ(text);
    setAsking(true);
    setAnswer(null);
    const res = await askSellerHubKnowledge(text);
    setAsking(false);
    if (res.ok) setAnswer({ q: text, text: res.answer ?? null, sources: res.sources ?? [], notice: res.notice });
    else setAnswer({ q: text, text: null, sources: searchArticles(KB_ARTICLES, text, { limit: 3 }).map((r) => r.article.id), notice: "Помощник сейчас недоступен, ниже подходящие статьи." });
  }

  const pick = (id: string, heading: string | null) => {
    onPick(id, heading);
    close();
  };

  const run = (i: number) => {
    if (canAsk && i === 0) {
      void ask(q);
      return;
    }
    const hit = hits[canAsk ? i - 1 : i];
    if (hit) pick(hit.article.id, hit.heading);
  };

  const back = () => {
    setAnswer(null);
    setAsking(false);
    inputRef.current?.focus();
  };

  return createPortal(
    <div className="hub-fade-in fixed inset-0 z-[200] flex items-start justify-center px-4 pt-[10vh]" style={{ backgroundColor: "rgba(1, 20, 8, 0.45)", backdropFilter: "blur(3px)" }} onMouseDown={close} role="dialog" aria-modal="true" aria-label="Поиск и помощник по базе знаний">
      <div className="hub-pop w-full max-w-[680px] overflow-hidden rounded-[22px] bg-white shadow-[0_40px_90px_-30px_rgba(1,20,8,0.7)]" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b px-5" style={{ borderColor: "rgba(1, 20, 8, 0.1)" }}>
          <Search className="h-5 w-5 shrink-0" style={{ color: SUBTLE }} aria-hidden />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setCursor(0);
              if (answer) setAnswer(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") close();
              else if (e.key === "ArrowDown" && !answering) {
                e.preventDefault();
                setCursor((c) => (total ? (c + 1) % total : 0));
              } else if (e.key === "ArrowUp" && !answering) {
                e.preventDefault();
                setCursor((c) => (total ? (c - 1 + total) % total : 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                if (answering) void ask(q);
                else if (total) run(cursor);
              }
            }}
            placeholder="Что вас интересует? Например: ДРР, комиссия, токен"
            className="h-[64px] w-full bg-transparent text-[18px] outline-none placeholder:text-[rgba(1,20,8,0.45)]"
            style={{ ...hubSans, color: INK }}
            aria-label="Запрос"
          />
          <kbd className="hidden rounded-[8px] border px-2 py-1 text-[12px] font-medium sm:block" style={{ ...hubSans, borderColor: "rgba(1, 20, 8, 0.18)", color: SUBTLE }}>
            Esc
          </kbd>
        </div>
        <div className="max-h-[52vh] overflow-y-auto p-2.5" aria-live="polite">
          {answering ? (
            <div className="px-3 py-3">
              {asking ? (
                <p className="py-3 text-[16px]" style={{ ...hubSans, color: MUTED }}>
                  Думаю…
                </p>
              ) : answer ? (
                <>
                  {answer.text ? (
                    <p className="whitespace-pre-line text-[17px] leading-[1.65]" style={{ ...hubSans, color: INK }}>
                      {answer.text.replace(/\*\*/g, "")}
                    </p>
                  ) : (
                    <p className="text-[16px] leading-[1.6]" style={{ ...hubSans, color: MUTED }}>
                      {answer.notice ?? "Подходящие статьи ниже."}
                    </p>
                  )}
                  {answer.sources.length > 0 ? (
                    <div className="mt-4">
                      <p className="mb-1.5 text-[13px] font-semibold uppercase tracking-[0.08em]" style={{ ...hubSans, color: SUBTLE }}>
                        Читайте подробнее
                      </p>
                      {answer.sources.map((id) => {
                        const a = kbArticle(id);
                        return a ? (
                          <button key={id} type="button" onClick={() => pick(id, null)} className="group flex w-full items-center gap-3 rounded-[12px] px-3 py-2.5 text-left text-[16px] font-semibold outline-none transition-colors hover:bg-black/[0.05] focus-visible:shadow-[0_0_0_3px_rgba(1,20,8,0.25)]" style={{ ...hubSans, color: INK }}>
                            <span className="min-w-0 flex-1">{a.title}</span>
                            <ArrowRight className="h-4 w-4 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
                          </button>
                        ) : null;
                      })}
                    </div>
                  ) : null}
                </>
              ) : null}
              <button type="button" onClick={back} className="mt-3 rounded-full border px-4 py-1.5 text-[14px] font-medium outline-none transition-colors hover:bg-black/[0.04] focus-visible:shadow-[0_0_0_3px_rgba(1,20,8,0.25)]" style={{ ...hubSans, borderColor: "rgba(1, 20, 8, 0.2)", color: INK }}>
                Назад к результатам
              </button>
            </div>
          ) : q.trim().length < 2 ? (
            <div className="px-3 py-3">
              <p className="mb-2 text-[13px] font-semibold uppercase tracking-[0.08em]" style={{ ...hubSans, color: SUBTLE }}>
                Частые вопросы
              </p>
              <div className="flex flex-wrap gap-2.5">
                {suggestions.map((sg) => (
                  <button key={sg} type="button" onClick={() => setQ(sg)} className="rounded-full border px-4 py-2 text-[15px] font-medium outline-none transition-colors hover:bg-black/[0.04] focus-visible:shadow-[0_0_0_3px_rgba(1,20,8,0.25)]" style={{ ...hubSans, borderColor: "rgba(1, 20, 8, 0.18)", color: INK }}>
                    {sg}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {canAsk ? (
                <button type="button" onClick={() => run(0)} onMouseMove={() => setCursor(0)} className="mb-1 flex w-full items-center gap-4 rounded-[14px] px-4 py-3.5 text-left outline-none transition-colors focus-visible:shadow-[0_0_0_3px_rgba(1,20,8,0.25)]" style={{ backgroundColor: cursor === 0 ? "rgba(1, 20, 8, 0.06)" : "transparent" }}>
                  <Sparkles className="h-4 w-4 shrink-0" style={{ color: INK }} aria-hidden />
                  <span className="min-w-0 flex-1 text-[16.5px] font-semibold" style={{ ...hubSans, color: INK }}>
                    Спросить помощника: «{q.trim()}»
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0" style={{ color: SUBTLE }} aria-hidden />
                </button>
              ) : null}
              {hits.length === 0 ? (
                <p className="px-4 py-4 text-[16px]" style={{ ...hubSans, color: MUTED }}>
                  В статьях точных совпадений нет. Спросите помощника: он поймёт вопрос своими словами.
                </p>
              ) : null}
              {hits.map((h, i) => {
                const idx = canAsk ? i + 1 : i;
                return <KbSnippetRow key={h.article.id} hit={h} query={q} active={cursor === idx} onHover={() => setCursor(idx)} onOpen={() => run(idx)} />;
              })}
            </>
          )}
        </div>
        <div className="flex items-center justify-between border-t px-5 py-3 text-[13px]" style={{ ...hubSans, borderColor: "rgba(1, 20, 8, 0.1)", color: SUBTLE }}>
          <span>Стрелки: выбрать</span>
          <span className="inline-flex items-center gap-1.5">
            <CornerDownLeft className="h-3.5 w-3.5" aria-hidden />
            открыть
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
