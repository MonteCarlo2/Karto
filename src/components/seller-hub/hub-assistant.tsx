"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUp, Check, Maximize2, Minimize2, X } from "lucide-react";
import { updateSellerHubPrices, toggleSellerHubAd } from "@/lib/seller-hub/client-api";
import { appendHubJournal } from "@/lib/seller-hub/journal";
import { claimPriceSubmit, releasePriceSubmit } from "@/lib/seller-hub/price-write";
import { upsertHubScenario, type HubScenarioSchedule } from "@/lib/seller-hub/scenarios";
import type { SellerCatalogItem, SellerCatalogSnapshot } from "@/lib/seller-hub/types";
import { autoRepliesAuthorizedFetch } from "@/lib/auto-replies/auto-replies-fetch";
import { snapshotTimeMs, withoutIncompleteDay } from "@/lib/seller-hub/complete-days";
import { hub, HubButton, hubSans } from "./hub-ui";

type Draft = {
  agent: "prices" | "ads" | "comms";
  title: string;
  steps: string[];
  rows: { id: string; label: string; before: string; after: string; blocked?: string }[];
  apply?: () => Promise<string>;
};

const STOP_LOSS = 15;

function buildDraft(text: string, snapshot: SellerCatalogSnapshot | undefined, connected?: boolean): Draft {
  if (text.startsWith("АУДИТ\n")) {
    const lines = text
      .slice("АУДИТ\n".length)
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    return {
      agent: "comms",
      title: lines[0] ?? "Аудит карточки",
      steps: lines.slice(1),
      rows: [],
    };
  }

  const normalized = text.toLowerCase();
  const items = snapshot?.items ?? [];
  const asksForAction = /скидк|реклам|кампан|пауз|увелич|постав/.test(normalized);
  const asksQuestion = /что |как |почему |сколько |покажи|важно/.test(normalized);

  if (asksQuestion && !asksForAction) {
    const orders = snapshot?.analytics?.ordersTotal;
    const sku = snapshot?.totalCount ?? items.length;
    return {
      agent: "comms",
      title: "Что видно по снимку",
      steps: [
        sku
          ? `В снимке ${sku} SKU.`
          : "Снимка кабинета ещё нет. Подключите магазин и выгрузите данные, тогда ответ будет по вашим цифрам.",
        orders != null ? `За 7 дней заказов: ${orders}.` : "Заказы за 7 дней в снимке не посчитаны.",
        "Это ответ по уже выгруженным данным. В кабинет ничего не отправляется.",
      ],
      rows: [],
    };
  }

  if (normalized.includes("реклам") || normalized.includes("кампан")) {
    const campaigns = (snapshot?.ads?.campaigns ?? []).filter((row) => row.status === 9).slice(0, 8);
    return {
      agent: "ads",
      title: "Пауза кампаний с пустым или слабым балансом",
      steps: [
        "Беру активные кампании из снимка кабинета.",
        "Если баланс продвижения нулевой, предлагаю паузу, а не новую ставку.",
        "Показываю список до любого запроса в WB.",
        "Пауза уходит только после «Применить».",
      ],
      rows: campaigns.map((row) => ({
        id: row.id,
        label: row.name || `Кампания ${row.id}`,
        before: row.statusLabel || "активна",
        after: "пауза",
      })),
      apply: connected
        ? async () => {
            for (const row of campaigns) {
              const result = await toggleSellerHubAd({ campaignId: Number(row.id),
                action: "pause",
              });
              if (!result.ok) throw new Error(result.error || "Кампания не встала на паузу");
            }
            return `На паузу отправлено кампаний: ${campaigns.length}`;
          }
        : undefined,
    };
  }

  const candidates = items
    .filter((item) => (item.discountedPrice ?? item.price) != null && (item.totalStock ?? 0) > 3)
    .slice(0, 8);

  return {
    agent: "prices",
    title: "Мягкое увеличение скидки на товары с запасом",
    steps: [
      "Беру товары из снимка, у которых есть цена и остаток больше 3 штук.",
      "Предлагаю скидку на 5 п.п. выше текущей, но не выше 40%.",
      `Не трогаю позицию, если скидка уже близка к стоп-лоссу ${STOP_LOSS}% без отдельного решения — порог здесь про скидку, себестоимость вы задаёте в юнит-экономике.`,
      "Показываю было → станет.",
      "В WB уходит только подтверждённый список.",
    ],
    rows: candidates.map((item) => priceRow(item)),
    apply: connected
      ? async () => {
          const updates = candidates
            .map((item) => {
              const row = priceRow(item);
              if (row.blocked) return null;
              const next = nextDiscount(item);
              if (next == null) return null;
              return {
                nmId: Number(item.externalId),
                discount: next,
                expected: { price: item.price ?? null, discount: item.discountPercent ?? null },
              };
            })
            .filter((row): row is NonNullable<typeof row> => row != null);
          if (updates.length === 0) throw new Error("Нет позиций, которые можно применить");
          const result = await updateSellerHubPrices({ updates });
          if (result.outcome !== "confirmed") throw new Error(result.message);
          return result.message;
        }
      : undefined,
  };
}

function nextDiscount(item: SellerCatalogItem): number | null {
  const current = item.discountPercent ?? 0;
  const next = Math.min(40, Math.round(current + 5));
  if (next <= current) return null;
  if (next >= 40 && current >= 35) return null;
  return next;
}

function priceRow(item: SellerCatalogItem) {
  const current = item.discountPercent ?? 0;
  const next = nextDiscount(item);
  return {
    id: item.externalId,
    label: item.title,
    before: `${current}%`,
    after: next == null ? "без изменения" : `${next}%`,
    blocked: next == null ? "Скидка уже у верхней границы сценария" : undefined,
  };
}

function liveQuestions(snapshot?: SellerCatalogSnapshot): string[] {
  const questions: string[] = [];
  const daily = withoutIncompleteDay(snapshot?.analytics?.daily ?? [], snapshotTimeMs(snapshot));
  if (daily.length >= 2) {
    const prev = daily[daily.length - 2]?.revenue ?? 0;
    const last = daily[daily.length - 1]?.revenue ?? 0;
    if (prev > 0) {
      const pct = Math.round(((last - prev) / prev) * 100);
      if (pct <= -1) questions.push(`Почему оборот упал на ${Math.abs(pct)}%?`);
      else if (pct >= 1) questions.push(`Почему оборот вырос на ${pct}%?`);
    }
  }
  const fresh = snapshot?.orders?.newCount ?? 0;
  if (fresh > 0) questions.push("Сколько заказов ждут сборки?");
  if ((snapshot?.comms?.unansweredFeedbacks ?? 0) > 0) questions.push("Что с отзывами без ответа?");
  if ((snapshot?.comms?.unansweredQuestions ?? 0) > 0) questions.push("Какие вопросы ещё без ответа?");
  if (questions.length === 0) questions.push("Что сегодня важно по магазину?");
  return questions.slice(0, 3);
}

function assistantHasSignal(snapshot?: SellerCatalogSnapshot): boolean {
  if ((snapshot?.orders?.newCount ?? 0) > 0) return true;
  if ((snapshot?.comms?.unansweredFeedbacks ?? 0) > 0) return true;
  if ((snapshot?.comms?.unansweredQuestions ?? 0) > 0) return true;
  if (snapshot?.ads?.campaigns.some((c) => c.status === 9 && c.budget === 0)) return true;
  const daily = withoutIncompleteDay(snapshot?.analytics?.daily ?? [], snapshotTimeMs(snapshot));
  if (daily.length >= 2) {
    const prev = daily[daily.length - 2]?.revenue ?? 0;
    const last = daily[daily.length - 1]?.revenue ?? 0;
    if (prev > 0 && last < prev) return true;
  }
  return false;
}

function AssistantMark({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" aria-hidden>
      <circle cx="18" cy="18" r="18" fill="#0E1116" />
      <circle cx="18" cy="16.5" r="8" fill="#B9FF4B" />
      <circle cx="15.2" cy="15.6" r="1.3" fill="#0E1116" />
      <circle cx="20.8" cy="15.6" r="1.3" fill="#0E1116" />
      <path d="M15 19.2c1 .9 2.1 1.3 3 1.3s2-.4 3-1.3" fill="none" stroke="#0E1116" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

type Turn = {
  id: string;
  role: "user" | "assistant";
  text: string;
  draft?: Draft;
};

export function HubAssistant({
  open,
  expanded,
  onOpenChange,
  onExpandedChange,
  seed,
  onSeedConsumed,
  snapshot,
  connected,
}: {
  open: boolean;
  expanded: boolean;
  onOpenChange: (open: boolean) => void;
  onExpandedChange: (expanded: boolean) => void;
  seed?: string | null;
  onSeedConsumed?: () => void;
  snapshot?: SellerCatalogSnapshot;
  connected?: boolean;
}) {
  const [prompt, setPrompt] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [liked, setLiked] = useState<boolean | null>(null);
  const [schedule, setSchedule] = useState<HubScenarioSchedule>("once");
  const [chatId, setChatId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const applyLockRef = useRef(false);
  const questions = useMemo(() => liveQuestions(snapshot), [snapshot]);
  const [hintIndex, setHintIndex] = useState(0);
  const hasSignal = assistantHasSignal(snapshot);
  const hint = questions[hintIndex % Math.max(questions.length, 1)] ?? "Что сегодня важно по магазину?";
  const ready = useMemo(() => Boolean(draft?.apply && liked === true), [draft, liked]);

  useEffect(() => {
    if (questions.length < 2 || prompt.trim()) return;
    const timer = window.setInterval(() => {
      setHintIndex((index) => (index + 1) % questions.length);
    }, 4200);
    return () => window.clearInterval(timer);
  }, [questions, prompt]);

  useEffect(() => {
    const node = threadRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [turns, typing, draft, message, open]);

  const consumedSeed = useRef<string | null>(null);
  useEffect(() => {
    if (!open || !seed || consumedSeed.current === seed) return;
    consumedSeed.current = seed;
    ask(seed);
    onSeedConsumed?.();
  }, [open, seed, onSeedConsumed]);

  function ask(raw?: string) {
    const text = (raw ?? prompt).trim();
    if (!text || typing) return;
    const userTurn: Turn = { id: `${Date.now()}-u`, role: "user", text };
    setTurns((current) => [...current, userTurn]);
    setPrompt("");
    setLiked(null);
    setMessage(null);
    setDraft(null);
    setTyping(true);
    window.setTimeout(() => {
      const next = buildDraft(text, snapshot, connected);
      setDraft(next);
      setTurns((current) => [
        ...current,
        { id: `${Date.now()}-a`, role: "assistant", text: next.title, draft: next },
      ]);
      setTyping(false);
    }, 420);
  }

  async function apply() {
    if (!draft?.apply || !ready || busy || !claimPriceSubmit(applyLockRef)) return;
    setBusy(true);
    setMessage(null);
    try {
      const detail = await draft.apply();
      appendHubJournal({
        title: draft.title,
        detail,
        actor: "user",
      });
      upsertHubScenario({
        id: `${Date.now()}`,
        agent: draft.agent,
        title: draft.title,
        steps: draft.steps,
        schedule,
        status: schedule === "regular" ? "active" : "done",
        liked: true,
        createdAt: new Date().toISOString(),
        stopLossMarginPct: STOP_LOSS,
      });
      if (chatId.trim()) {
        await autoRepliesAuthorizedFetch("/api/seller-hub/notify", {
          method: "POST",
          body: JSON.stringify({ chatId: chatId.trim(), title: draft.title }),
        });
      }
      setMessage(schedule === "regular" ? `${detail}. Регулярный повтор пока только в списке агента: сам он кабинет не меняет.` : detail);
      setDraft(null);
    } catch (e) {
      const detail = e instanceof Error ? e.message : "Не применилось";
      if (draft) appendHubJournal({ title: draft.title, detail, actor: "user" });
      setMessage(detail);
    } finally {
      releasePriceSubmit(applyLockRef);
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => onOpenChange(true)}
        className="absolute bottom-5 right-5 z-40 flex max-w-[min(320px,calc(100%-2.5rem))] items-center gap-2.5 rounded-full border bg-white py-1.5 pl-1.5 pr-4 text-left shadow-[0_8px_28px_rgba(14,17,22,0.12)] outline-none focus-visible:ring-2 focus-visible:ring-[#1F4E3D]"
        style={{ borderColor: hub.border, ...hubSans }}
        aria-label="Открыть помощника"
      >
        <span className="relative shrink-0">
          <AssistantMark size={40} />
          {hasSignal ? (
            <span className="absolute -right-0.5 -top-0.5 h-3 w-3 animate-pulse rounded-full bg-[#B9FF4B] ring-2 ring-white" aria-hidden />
          ) : null}
        </span>
        <span className="min-w-0 truncate text-[13px] font-medium" style={{ color: hub.text }}>
          {hint}
        </span>
      </button>
    );
  }

  return (
    <div
      className={
        expanded
          ? "absolute inset-3 z-40 flex flex-col overflow-hidden rounded-2xl border bg-white shadow-[0_16px_50px_rgba(14,17,22,0.16)]"
          : "absolute bottom-5 right-5 z-40 flex h-[min(640px,calc(100%-6rem))] w-[min(400px,calc(100%-2.5rem))] flex-col overflow-hidden rounded-2xl border bg-white shadow-[0_16px_50px_rgba(14,17,22,0.16)]"
      }
      style={{ borderColor: hub.border, ...hubSans }}
      role="dialog"
      aria-label="Помощник"
    >
      <AnimatePresence>
        {open ? (
          <motion.div
            className="flex min-h-0 flex-1 flex-col"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
          >
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: hub.borderSoft }}>
          <div className="flex min-w-0 items-center gap-3">
            <AssistantMark size={36} />
            <div className="min-w-0">
              <p className="text-[16px] font-semibold" style={{ color: hub.text }}>
                Помощник
              </p>
              <p className="mt-0.5 text-[12.5px] leading-snug" style={{ color: hub.textSubtle }}>
                {typing ? "Печатает…" : "Сначала алгоритм, потом ваше «подходит». В кабинет уходит только «Применить»."}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center">
            <button
              type="button"
              onClick={() => onExpandedChange(!expanded)}
              aria-label={expanded ? "Вернуть к краю" : "Развернуть"}
              className="rounded-lg p-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#B9FF4B]"
              style={{ color: hub.textMuted }}
            >
              {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
            <button type="button" onClick={() => { onExpandedChange(false); onOpenChange(false); }} aria-label="Закрыть" className="rounded-lg p-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#B9FF4B]" style={{ color: hub.textMuted }}>
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div ref={threadRef} className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 py-5">
          <Bubble role="assistant">
            Могу ответить по снимку или собрать действие для цен и рекламы. В кабинет уходит только то, что вы подтвердите.
          </Bubble>
          {turns.length === 0 ? (
            <div className="flex flex-wrap gap-2 pl-10">
              {questions.map((starter) => (
                <button
                  key={starter}
                  type="button"
                  onClick={() => ask(starter)}
                  className="rounded-full border border-[#E3E6EB] bg-[#F4F6F8] px-3 py-1.5 text-left text-[13px] font-medium transition duration-150 hover:-translate-y-px hover:bg-[#B9FF4B]/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#B9FF4B]"
                  style={{ color: hub.text }}
                >
                  {starter}
                </button>
              ))}
            </div>
          ) : null}
          {turns.map((turn) => (
            <div key={turn.id} className="flex flex-col gap-2">
            <Bubble role={turn.role}>
              <p className="text-[14px] leading-snug">{turn.text}</p>
              {turn.draft ? (
                <div className="space-y-3 border-t pt-3" style={{ borderColor: hub.borderSoft }}>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: hub.textSubtle }}>
                    {turn.draft.agent === "comms" ? "По этой карточке" : "Алгоритм"}
                  </p>
                  <ol className="space-y-2">
                    {turn.draft.steps.map((step, index) => (
                      <li key={step} className="flex gap-2.5 text-[13.5px] leading-snug" style={{ color: hub.text }}>
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#B9FF4B]/40 text-[11px] font-bold text-[#1F4E3D]">
                          {index + 1}
                        </span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                  <div className="flex items-center gap-2 text-[13px] font-medium text-[#1F4E3D]">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#B9FF4B] text-[#1F4E3D]">
                      <Check className="h-3 w-3" />
                    </span>
                    Готово к проверке
                  </div>
                  {turn.draft.rows.length > 0 ? (
                    <ul className="space-y-1.5 border-t pt-2" style={{ borderColor: hub.borderSoft }}>
                      {turn.draft.rows.map((row) => (
                        <li key={row.id} className="text-[12.5px]">
                          <span className="font-medium">{row.label}</span>
                          <span style={{ color: hub.textMuted }}>
                            {" "}
                            {row.before} → {row.after}
                            {row.blocked ? ` · ${row.blocked}` : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {turn.draft === draft && turn.draft.agent !== "comms" ? (
                    <div className="space-y-2 border-t pt-2" style={{ borderColor: hub.borderSoft }}>
                      <div className="flex flex-wrap gap-2">
                        <HubButton size="sm" variant={liked === true ? "primary" : "secondary"} onClick={() => setLiked(true)}>
                          Алгоритм подходит
                        </HubButton>
                        <HubButton size="sm" variant="secondary" onClick={() => setLiked(false)}>
                          Не подходит
                        </HubButton>
                      </div>
                      {liked === false ? (
                        <p className="text-[12.5px]" style={{ color: hub.textMuted }}>
                          Перепишите задачу другими словами.
                        </p>
                      ) : null}
                      <div className="flex flex-wrap gap-1.5">
                        {(["once", "regular", "manual"] as const).map((value) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => setSchedule(value)}
                            className="rounded-full px-2.5 py-1 text-[12px] font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#B9FF4B]"
                            style={{
                              backgroundColor: schedule === value ? "rgba(185,255,75,0.45)" : "transparent",
                              color: hub.text,
                              border: `1px solid ${schedule === value ? "#2E5A43" : hub.border}`,
                            }}
                          >
                            {value === "once" ? "Один раз" : value === "regular" ? "Регулярно" : "Вручную"}
                          </button>
                        ))}
                      </div>
                      <label className="block text-[12px]" style={{ color: hub.textMuted }}>
                        Telegram chat id, если нужно напоминание
                        <input
                          value={chatId}
                          onChange={(event) => setChatId(event.target.value)}
                          className="mt-1 w-full rounded-[10px] border px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-[#B9FF4B]"
                          style={{ borderColor: hub.inputBorder, backgroundColor: hub.inputBg, color: hub.text }}
                        />
                      </label>
                      <HubButton size="sm" variant="accent" onClick={() => void apply()} loading={busy} disabled={!ready || !connected}>
                        Применить
                      </HubButton>
                      {!connected ? (
                        <p className="text-[12.5px]" style={{ color: hub.textMuted }}>
                          Применение откроется после подключения кабинета.
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </Bubble>
            </div>
          ))}
          {typing ? (
            <Bubble role="assistant">
              <span className="inline-flex items-center gap-2 text-[13px]" style={{ color: hub.textMuted }} aria-label="KARTO печатает">
                Печатает
                <span className="inline-flex items-center gap-1">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#1F4E3D]" />
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#1F4E3D] [animation-delay:150ms]" />
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#1F4E3D] [animation-delay:300ms]" />
                </span>
              </span>
            </Bubble>
          ) : null}
          {message ? <Bubble role="assistant">{message}</Bubble> : null}
        </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <form
        className="shrink-0 border-t p-3"
        style={{ borderColor: hub.border }}
        onSubmit={(event) => {
          event.preventDefault();
          onOpenChange(true);
          ask();
        }}
      >
        <div className="flex w-full items-end gap-2 rounded-2xl border bg-white p-2" style={{ borderColor: hub.border }}>
          <span className="mb-1 ml-1 shrink-0">
            <AssistantMark size={32} />
          </span>
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={2}
            placeholder={hint}
            aria-label="Сообщение KARTO"
            className="max-h-32 min-h-[40px] flex-1 resize-none bg-transparent px-2 py-1.5 text-[15px] outline-none"
            style={{ color: hub.text }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                onOpenChange(true);
                ask();
              }
            }}
          />
          <button
            type="submit"
            disabled={!prompt.trim() || typing}
            aria-label="Отправить"
            className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#B9FF4B] text-[#0E1116] transition hover:bg-[#C6FF68] disabled:opacity-40"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        </div>
      </form>
    </div>
  );
}

function Bubble({ role, children }: { role: "user" | "assistant"; children: ReactNode }) {
  const mine = role === "user";
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
      className={`flex items-end gap-2 ${mine ? "justify-end" : "justify-start"}`}
    >
      {mine ? null : (
        <span className="shrink-0" aria-hidden>
          <AssistantMark size={32} />
        </span>
      )}
      <div
        className={
          mine
            ? "max-w-[82%] rounded-2xl rounded-br-md bg-[#B9FF4B] px-3.5 py-2.5 text-[#0A0A0A]"
            : "max-w-[82%] rounded-2xl rounded-bl-md bg-[#F4F6F8] px-3.5 py-2.5 text-[#0E1116]"
        }
      >
        {children}
      </div>
    </motion.div>
  );
}
