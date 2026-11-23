"use client";

import type { TaskFocus } from "./task-focus";
import { ChatOrder } from "./hub-chat-order";
import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowUpRight, BookOpen, Check, Compass, ListChecks } from "lucide-react";
import type { AiChatBlock } from "@/lib/seller-hub/client-api";
import type { SellerCatalogItem, SellerCatalogSnapshot } from "@/lib/seller-hub/types";
import type { TaskCategory } from "@/lib/seller-hub/task-engine/types";
import { ChatTaskCards } from "./hub-chat-tasks";
import type { SellerProductEvent } from "@/lib/seller-hub/event-engine/types";
import { ChatAction, ChatPromos, ChatReviews, ChatSupplies } from "./hub-chat-more";
import { ChatEvents } from "./hub-chat-data";
import { ChatPriceEdit } from "./hub-chat-price";
import { ChatAnalytics } from "./hub-chat-analytics";
import { FolderFrame } from "./hub-chat-folder";
import { hub, hubNumeric, hubSans } from "./hub-ui";

/**
 * Живые элементы в переписке: выбор товара из списка, строка товара с ценой и остатком, ссылка на существующую задачу, карточка статьи базы знаний.
 * Все данные берутся из кабинета и базы знаний, а не из текста ИИ: ИИ называет только идентификаторы.
 */

const rub = (v: number | null | undefined) => (v == null ? "нет данных" : `${Math.round(v).toLocaleString("ru-RU")} ₽`);
const EASE = [0.22, 1, 0.36, 1] as const;

function Photo({ src, size }: { src?: string; size: number }) {
  return (
    <span className="flex shrink-0 items-center justify-center overflow-hidden rounded-[6px]" style={{ width: size, height: size, backgroundColor: "rgba(1, 20, 8, 0.05)" }} aria-hidden>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-contain" loading="lazy" />
      ) : null}
    </span>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex flex-col">
      <span className="text-[11.5px] leading-4" style={{ ...hubSans, color: hub.textSubtle }}>
        {label}
      </span>
      <span className="text-[14px] font-semibold leading-5" style={{ ...hubSans, ...hubNumeric, color: hub.text }}>
        {value}
      </span>
    </span>
  );
}

/** Строка товара: фото, название, артикул и цифры из кабинета. */
function ProductRow({ item, compact = false }: { item: SellerCatalogItem; compact?: boolean }) {
  const final = item.clubPrice ?? item.discountedPrice ?? item.price;
  return (
    <div className="flex min-w-0 items-center gap-3.5">
      <Photo src={item.imageUrl} size={compact ? 60 : 76} />
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 block text-[14.5px] font-semibold leading-[1.35] [overflow-wrap:anywhere]" style={{ ...hubSans, color: hub.text }}>
          {item.title}
        </span>
        <span className="mt-0.5 block truncate text-[12.5px]" style={{ ...hubSans, ...hubNumeric, color: hub.textSubtle }}>
          {item.vendorCode ? `${item.vendorCode} · ` : ""}nm {item.externalId}
        </span>
      </span>
      {!compact ? (
        <span className="hidden shrink-0 items-center gap-5 sm:flex">
          <Fact label="Цена" value={rub(final)} />
          <Fact label="Остаток" value={item.totalStock == null ? "нет данных" : `${item.totalStock.toLocaleString("ru-RU")} шт`} />
        </span>
      ) : null}
    </div>
  );
}

type Props = {
  blocks: AiChatBlock[];
  itemByNm?: Map<string, SellerCatalogItem>;
  /** Нажатие на товар в списке выбора: в чат уходит ответ владельца. */
  onPick: (message: string) => void;
  onOpenTasks?: (focus?: TaskFocus) => void;
  onOpenKb?: (id: string) => void;
  onOpenSection?: (id: string) => void;
  snapshot?: Pick<SellerCatalogSnapshot, "marketplaceId">;
  /** Полный снимок кабинета: нужен живым экранам «Аналитики» в чате. */
  fullSnapshot?: SellerCatalogSnapshot;
  /** Тестовый режим агента: изменения в кабинет не уходят. */
  sandbox?: boolean;
  /** События магазина из приложения: для ленты в переписке. */
  events?: SellerProductEvent[];
};

const PAGE = 6;

/** Список товаров для выбора. Длинный список показывает по шесть, остальные раскрываются кнопкой. */
function ProductPicker({ title, items, delay, onPick }: { title: string; items: SellerCatalogItem[]; delay: number; onPick: (message: string) => void }) {
  const [shown, setShown] = useState(PAGE);
  const visible = items.slice(0, shown);
  return (
    <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay, duration: 0.4, ease: EASE }} aria-label={title}>
      <p className="mb-2 px-0.5 text-[13px] font-medium" style={{ ...hubSans, color: hub.textSubtle }}>
        {title}
      </p>
      <ul className="overflow-hidden rounded-[18px]" style={{ backgroundColor: "rgba(46, 90, 67, 0.045)", boxShadow: "inset 0 0 0 1px rgba(1, 20, 8, 0.07)" }}>
        {visible.map((item, i) => (
          <motion.li key={item.externalId} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: delay + 0.05 * Math.min(i, 8), duration: 0.35, ease: EASE }} className="border-t first:border-t-0" style={{ borderColor: "rgba(1, 20, 8, 0.07)" }}>
            <button
              type="button"
              onClick={() => onPick(`Беру этот товар: ${item.title} (артикул ${item.vendorCode || "без артикула"}, nm ${item.externalId})`)}
              className="group/pick flex w-full items-center gap-3 px-3.5 py-3 text-left outline-none transition-colors duration-150 hover:bg-white/70 focus-visible:shadow-[inset_0_0_0_2px_var(--hub-lime-ring)]"
            >
              <span className="min-w-0 flex-1">
                <ProductRow item={item} />
              </span>
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full opacity-0 transition-opacity duration-150 group-hover/pick:opacity-100 group-focus-visible/pick:opacity-100" style={{ backgroundColor: hub.lime, color: "#011408" }} aria-hidden>
                <Check className="h-4 w-4" strokeWidth={2.6} />
              </span>
            </button>
          </motion.li>
        ))}
      </ul>
      <div className="mt-2 flex flex-wrap items-center gap-1">
        {items.length > shown ? (
          <button type="button" onClick={() => setShown((v) => v + PAGE)} className="rounded-lg px-2 py-1 text-[13px] font-semibold outline-none transition-colors hover:bg-[rgba(1,20,8,0.06)] focus-visible:shadow-[0_0_0_2px_var(--hub-lime-ring)]" style={{ ...hubSans, color: hub.text }}>
            Показать ещё {Math.min(PAGE, items.length - shown)} из {items.length - shown}
          </button>
        ) : null}
        <button type="button" onClick={() => onPick("Ни один из этих, другой товар")} className="rounded-lg px-2 py-1 text-[13px] font-medium outline-none transition-colors hover:bg-[rgba(1,20,8,0.06)] focus-visible:shadow-[0_0_0_2px_var(--hub-lime-ring)]" style={{ ...hubSans, color: hub.textSubtle }}>
          Другой товар
        </button>
      </div>
    </motion.section>
  );
}

export function ChatBlocks({ blocks, itemByNm, onPick, onOpenTasks, onOpenKb, onOpenSection, snapshot, fullSnapshot, sandbox, events }: Props) {
  return (
    <div className="space-y-3">
      {blocks.map((b, bi) => {
        const delay = 0.12 + bi * 0.1;
        if (b.type === "products") {
          const items = b.nmIds.map((id) => itemByNm?.get(id)).filter((x): x is SellerCatalogItem => Boolean(x));
          if (items.length === 0) return null;
          return <ProductPicker key={bi} title={b.title} items={items} delay={delay} onPick={onPick} />;
        }
        if (b.type === "product") {
          const item = itemByNm?.get(b.nmId);
          if (!item) return null;
          return (
            <motion.div key={bi} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay, duration: 0.4, ease: EASE }} className="rounded-[18px] p-3.5" style={{ backgroundColor: "rgba(46, 90, 67, 0.045)", boxShadow: "inset 0 0 0 1px rgba(1, 20, 8, 0.07)" }}>
              <ProductRow item={item} compact />
              <dl className="mt-3 grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-4">
                <Fact label="Цена для покупателя" value={rub(item.clubPrice ?? item.discountedPrice ?? item.price)} />
                <Fact label="Цена до скидки" value={rub(item.price)} />
                <Fact label="Скидка продавца" value={item.discountPercent == null ? "нет данных" : `${item.discountPercent}%`} />
                <Fact label="Остаток" value={item.totalStock == null ? "нет данных" : `${item.totalStock.toLocaleString("ru-RU")} шт`} />
              </dl>
            </motion.div>
          );
        }
        if (b.type === "task") {
          const item = b.nmId ? itemByNm?.get(b.nmId) : undefined;
          return (
            <motion.div key={bi} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay, duration: 0.4, ease: EASE }} className="flex items-center gap-3.5 rounded-[18px] p-3.5" style={{ backgroundColor: "rgba(46, 90, 67, 0.045)", boxShadow: "inset 0 0 0 1px rgba(1, 20, 8, 0.07)" }}>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px]" style={{ backgroundColor: "rgba(185, 255, 75, 0.4)", color: "#1B3A12" }} aria-hidden>
                <ListChecks className="h-5 w-5" strokeWidth={1.9} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] font-medium" style={{ ...hubSans, color: hub.textSubtle }}>
                  Задача уже есть
                </span>
                <span className="block text-[14.5px] font-semibold leading-[1.35] [overflow-wrap:anywhere]" style={{ ...hubSans, color: hub.text }}>
                  {b.title}
                </span>
                {item ? (
                  <span className="mt-0.5 block truncate text-[12.5px]" style={{ ...hubSans, color: hub.textSubtle }}>
                    {item.title}
                  </span>
                ) : null}
              </span>
              {onOpenTasks ? (
                <button type="button" onClick={() => onOpenTasks(b.taskId && b.category ? { category: b.category as TaskCategory, id: b.taskId, nmId: b.nmId } : undefined)} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-[13.5px] font-semibold outline-none transition-[filter] hover:brightness-95 focus-visible:shadow-[0_0_0_2px_var(--hub-lime-ring)]" style={{ ...hubSans, backgroundColor: hub.lime, color: "#011408" }}>
                  Открыть
                  <ArrowUpRight className="h-4 w-4" aria-hidden />
                </button>
              ) : null}
            </motion.div>
          );
        }
        if (b.type === "tasks") {
          return (
            <motion.div key={bi} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay, duration: 0.4, ease: EASE }}>
              <ChatTaskCards title={b.title} ids={b.items.map((t) => t.id)} total={b.total} snapshot={snapshot} itemByNm={itemByNm} onOpenTasks={onOpenTasks} fullSnapshot={fullSnapshot} sandbox={sandbox ?? true} />
            </motion.div>
          );
        }
        if (b.type === "price_edit") {
          const item = itemByNm?.get(b.nmId);
          if (!item) return null;
          return <ChatPriceEdit key={`${bi}-${b.nmId}`} item={item} field={b.field} value={b.value} pct={b.pct} sandbox={sandbox ?? true} />;
        }
        if (b.type === "info") {
          if (b.kind === "reviews") return <ChatReviews key={bi} snapshot={fullSnapshot} itemByNm={itemByNm} onAsk={onPick} onOpen={onOpenSection ? () => onOpenSection("agents") : undefined} />;
          if (b.kind === "promos") return <ChatPromos key={bi} snapshot={fullSnapshot} onOpen={onOpenSection ? () => onOpenSection("promotions") : undefined} />;
          return <ChatSupplies key={bi} snapshot={fullSnapshot} onOpen={onOpenSection ? () => onOpenSection("deliveries") : undefined} />;
        }
        if (b.type === "action") {
          return <ChatAction key={bi} action={b.action} title={b.title} facts={b.facts} effect={b.effect} risk={b.risk} snapshot={fullSnapshot} itemByNm={itemByNm} sandbox={sandbox ?? true} />;
        }
        if (b.type === "order") {
          return <ChatOrder key={bi} input={b.input} replaceId={b.replaceId} sandbox={sandbox ?? true} campaignName={(id) => fullSnapshot?.ads?.campaigns.find((c) => String(c.id) === id)?.name} productTitle={(id) => itemByNm?.get(id)?.title} />;
        }
        if (b.type === "events") {
          return <ChatEvents key={bi} events={events} days={b.days} group={b.group} itemByNm={itemByNm} onOpen={onOpenSection ? () => onOpenSection("events") : undefined} />;
        }
        if (b.type === "analytics") {
          return <ChatAnalytics key={bi} view={b.view} days={b.days} nmId={b.nmId} part={b.part} itemByNm={itemByNm} snapshot={fullSnapshot} connected={Boolean(fullSnapshot)} onOpenSection={onOpenSection} />;
        }
        if (b.type === "section") {
          return (
            <motion.div key={bi} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay, duration: 0.4, ease: EASE }} className="flex items-center gap-3.5 rounded-[18px] p-3.5" style={{ backgroundColor: "rgba(46, 90, 67, 0.045)", boxShadow: "inset 0 0 0 1px rgba(1, 20, 8, 0.07)" }}>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px]" style={{ backgroundColor: "rgba(185, 255, 75, 0.4)", color: "#1B3A12" }} aria-hidden>
                <Compass className="h-5 w-5" strokeWidth={1.9} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14.5px] font-semibold leading-[1.35]" style={{ ...hubSans, color: hub.text }}>
                  {b.title}
                </span>
                <span className="block text-[13px] leading-[1.4]" style={{ ...hubSans, color: hub.textSubtle }}>
                  {b.note}
                </span>
              </span>
              {onOpenSection ? (
                <button type="button" onClick={() => onOpenSection(b.id)} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-[13.5px] font-semibold outline-none transition-[filter] hover:brightness-95 focus-visible:shadow-[0_0_0_2px_var(--hub-lime-ring)]" style={{ ...hubSans, backgroundColor: hub.lime, color: "#011408" }}>
                  Открыть раздел
                  <ArrowUpRight className="h-4 w-4" aria-hidden />
                </button>
              ) : null}
            </motion.div>
          );
        }
        return (
          <FolderFrame key={bi} tab="База знаний" palette={b.branch === "wb" ? "wb" : "karto"}>
            <div className="flex items-start gap-3.5 p-2">
              <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px]" style={{ backgroundColor: "rgba(1, 20, 8, 0.07)", color: "#011408" }} aria-hidden>
                <BookOpen className="h-5 w-5" strokeWidth={1.9} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[16px] font-semibold leading-[1.35]" style={{ ...hubSans, color: "#011408" }}>
                  {b.title}
                </span>
                <span className="mt-1 line-clamp-3 block text-[13.5px] leading-[1.5]" style={{ ...hubSans, color: "rgba(1, 20, 8, 0.76)" }}>
                  {b.summary}
                </span>
                {onOpenKb ? (
                  <button type="button" onClick={() => onOpenKb(b.id)} className="mt-3 inline-flex items-center gap-1 rounded-lg text-[13.5px] font-semibold underline-offset-4 outline-none hover:underline focus-visible:shadow-[0_0_0_2px_var(--hub-lime-ring)]" style={{ ...hubSans, color: "#011408" }}>
                    Читать статью
                    <ArrowUpRight className="h-4 w-4" aria-hidden />
                  </button>
                ) : null}
              </span>
            </div>
          </FolderFrame>
        );
      })}
    </div>
  );
}
