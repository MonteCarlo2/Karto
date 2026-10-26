"use client";

import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink, X } from "lucide-react";
import type { CheckState, ContentAction, ContentBlock, ReadoutSection, ReadoutSectionId, ReceiptRole } from "@/lib/seller-hub/product-signal";
import { ReadoutManual } from "./hub-readout-manual";
import { hub, HubButton, HubInput, hubNumeric, hubSans } from "./hub-ui";

function receiptColor(role: ReceiptRole): string {
  switch (role) {
    case "line":
      return hub.text;
    case "gain":
      return hub.green;
    case "loss":
      return hub.danger;
    case "warn":
      return hub.warn;
    default: {
      const unexpected: never = role;
      return unexpected;
    }
  }
}

type ReadoutTopic = "index" | "card" | "logistics" | "money" | "status";

function topicOf(id: ReadoutSectionId): ReadoutTopic {
  switch (id) {
    case "index":
      return "index";
    case "card":
      return "card";
    case "stock":
    case "capital":
      return "logistics";
    case "margin":
      return "money";
    case "status":
      return "status";
    default: {
      const unexpected: never = id;
      return unexpected;
    }
  }
}

function checkMark(state: CheckState): { text: string; color: string } {
  switch (state) {
    case "ok":
      return { text: "есть", color: hub.green };
    case "warn":
      return { text: "мало", color: hub.warn };
    case "missing":
      return { text: "нет", color: hub.danger };
    case "unknown":
      return { text: "нет данных", color: hub.textMuted };
    default: {
      const unexpected: never = state;
      return unexpected;
    }
  }
}

type SegmentTone = "lime" | "blue" | "ink";

function segmentTone(ratio: number): SegmentTone {
  if (ratio >= 0.75) return "lime";
  if (ratio >= 0.45) return "blue";
  return "ink";
}

function segmentFill(tone: SegmentTone, filled: boolean): string {
  if (!filled) return "#E6E8EC";
  switch (tone) {
    case "lime":
      return hub.lime;
    case "blue":
      return hub.blue;
    case "ink":
      return hub.ink;
    default: {
      const unexpected: never = tone;
      return unexpected;
    }
  }
}

function wbCardUrl(externalId: string | undefined): string | null {
  if (!externalId) return null;
  const nm = Number(externalId);
  if (!Number.isFinite(nm) || nm <= 0) return null;
  return `https://www.wildberries.ru/catalog/${nm}/detail.aspx`;
}

function Receipt({ rows }: { rows: ReadoutSection["receipt"] }) {
  if (rows.length === 0) return null;
  return (
    <div className="rounded-[12px] px-3 py-1" style={{ backgroundColor: hub.canvas }}>
      {rows.map((row) => (
        <div
          key={row.label}
          className="flex items-baseline justify-between gap-4 py-1.5"
          style={{
            borderTop: row.role === "gain" || row.role === "loss" || row.role === "warn" ? `1px solid ${hub.border}` : undefined,
          }}
        >
          <span className="text-[15px]" style={{ ...hubSans, color: hub.text }}>
            {row.label}
          </span>
          <span className="text-right text-[16px] font-semibold" style={{ ...hubNumeric, color: receiptColor(row.role) }}>
            {row.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function MoneyFields({
  money,
}: {
  money: {
    price: string;
    discount: string;
    cost: string;
    onSave: (next: { price: string; discount: string; cost: string }) => Promise<string | null>;
  };
}) {
  const [price, setPrice] = useState(money.price);
  const [discount, setDiscount] = useState(money.discount);
  const [cost, setCost] = useState(money.cost);
  const [note, setNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setPrice(money.price);
    setDiscount(money.discount);
    setCost(money.cost);
  }, [money.price, money.discount, money.cost]);

  return (
    <form
      className="rounded-[12px] border px-4 py-3"
      style={{ borderColor: hub.border, backgroundColor: hub.surface }}
      onSubmit={(event) => {
        event.preventDefault();
        setSaving(true);
        setNote(null);
        void money
          .onSave({ price, discount, cost })
          .then((result) => {
            setNote(result);
            setSaving(false);
          })
          .catch(() => {
            setNote("Не сохранилось.");
            setSaving(false);
          });
      }}
    >
      <p className="text-[11px] font-bold uppercase tracking-[0.06em]" style={{ color: hub.textSubtle }}>
        Цена на WB и закупка
      </p>
      <p className="mt-1 text-[12px] leading-[1.45]" style={{ ...hubSans, color: hub.textMuted }}>
        «Сохранить» пишет цену и скидку в кабинет. Закупка остаётся в снимке KARTO.
      </p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <label className="block">
          <span className="text-[11px] font-semibold" style={{ color: hub.textMuted }}>
            Цена
          </span>
          <HubInput value={price} inputMode="decimal" onChange={(event) => setPrice(event.target.value)} className="mt-1" />
        </label>
        <label className="block">
          <span className="text-[11px] font-semibold" style={{ color: hub.textMuted }}>
            Скидка %
          </span>
          <HubInput
            value={discount}
            inputMode="decimal"
            onChange={(event) => setDiscount(event.target.value)}
            className="mt-1"
          />
        </label>
        <label className="block">
          <span className="text-[11px] font-semibold" style={{ color: hub.textMuted }}>
            Закупка
          </span>
          <HubInput value={cost} inputMode="decimal" onChange={(event) => setCost(event.target.value)} className="mt-1" />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <HubButton type="submit" loading={saving}>
          Сохранить
        </HubButton>
        {note ? (
          <p className="text-[12px] leading-[1.4]" style={{ ...hubSans, color: hub.text }}>
            {note}
          </p>
        ) : null}
      </div>
    </form>
  );
}

type ReadoutAction = { href?: string; label: string; onClick: () => void };

function BlockAction({ action }: { action: ReadoutAction }) {
  const className =
    "inline-flex min-h-[36px] items-center rounded-[11px] border bg-white px-3.5 text-[13px] font-semibold transition duration-200 hover:bg-[#F4F6F8] active:scale-[0.98]";
  const style = { borderColor: hub.ink, color: hub.ink };
  if (action.href) {
    return (
      <a href={action.href} onClick={action.onClick} className={className} style={style}>
        {action.label}
      </a>
    );
  }
  return (
    <button type="button" onClick={action.onClick} className={className} style={style}>
      {action.label}
    </button>
  );
}

function Segments({ ratio, tone, count = 12 }: { ratio: number; tone?: SegmentTone; count?: number }) {
  const filled = Math.round(Math.max(0, Math.min(1, ratio)) * count);
  const paint = tone ?? segmentTone(ratio);
  return (
    <span className="flex gap-[3px]" aria-hidden>
      {Array.from({ length: count }, (_, index) => (
        <span
          key={index}
          className="h-2.5 flex-1 rounded-[3px]"
          style={{ backgroundColor: segmentFill(paint, index < filled) }}
        />
      ))}
    </span>
  );
}

function Axis({
  block,
  action,
}: {
  block: ContentBlock;
  action?: ReadoutAction;
}) {
  const ratio = block.max > 0 ? block.points / block.max : 0;
  return (
    <div className="border-b py-3 last:border-b-0" style={{ borderColor: hub.borderSoft }}>
      <div className="flex items-baseline justify-between gap-4">
        <p className="min-w-0 text-[17px] font-semibold" style={{ ...hubSans, color: hub.text }}>
          {block.title}
        </p>
        {block.max > 0 ? (
          <span className="shrink-0 text-[17px] font-semibold" style={{ ...hubNumeric, color: hub.ink }}>
            {block.points.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}
            <span style={{ color: hub.textMuted }}> / {block.max}</span>
          </span>
        ) : null}
      </div>
      {block.max > 0 ? (
        <div className="mt-2.5">
          <Segments ratio={ratio} />
        </div>
      ) : null}
      <ul className="mt-2.5 space-y-1">
        {block.lines.map((line) => (
          <li key={line} className="text-[15px] leading-[1.5]" style={{ ...hubSans, color: hub.text }}>
            {line}
          </li>
        ))}
      </ul>
      {block.advice ? (
        <p
          className="mt-2 text-[15px] leading-[1.5]"
          style={{ ...hubSans, color: block.adviceTone === "danger" ? hub.danger : hub.text }}
        >
          {block.advice}
        </p>
      ) : null}
      {action ? (
        <div className="mt-2">
          <BlockAction action={action} />
        </div>
      ) : null}
    </div>
  );
}

function splitFigure(figure: string): { word: string | null; value: string } {
  const parts = figure.split(" · ");
  if (parts.length === 2 && parts[0] && parts[1]) return { word: parts[0], value: parts[1] };
  return { word: null, value: figure };
}

function wordChip(word: string): { backgroundColor: string; color: string } {
  if (word === "Отлично" || word === "Норма" || word === "В норме") {
    return { backgroundColor: hub.lime, color: hub.ink };
  }
  if (word === "Внимание") return { backgroundColor: hub.blueSoft, color: hub.blue };
  if (word === "Риск") return { backgroundColor: hub.ink, color: "#FFFFFF" };
  return { backgroundColor: hub.blueSoft, color: hub.ink };
}

function ScoreValue({ value }: { value: string }) {
  const match = value.match(/^(\d+(?:[.,]\d+)?)\s*\/\s*100$/);
  if (!match?.[1]) {
    return (
      <p
        className={`font-semibold leading-none tracking-[-0.04em] ${value.length > 16 ? "text-[40px]" : "text-[56px]"}`}
        style={{ ...hubNumeric, color: hub.ink }}
      >
        {value}
      </p>
    );
  }
  return (
    <p className="flex items-baseline gap-2" style={{ ...hubNumeric, color: hub.ink }}>
      <span className="text-[64px] font-semibold leading-none tracking-[-0.04em]">{match[1]}</span>
      <span className="text-[28px] font-semibold tracking-[-0.03em]" style={{ color: hub.textMuted }}>
        / 100
      </span>
    </p>
  );
}

function HeroScore({ figure, note }: { figure: string; note?: string | null }) {
  const { word, value } = splitFigure(figure);
  return (
    <div className="rounded-[20px] px-6 py-6" style={{ backgroundColor: hub.canvas }}>
      {word ? (
        <span className="inline-flex rounded-full px-3 py-1 text-[15px] font-semibold" style={{ ...hubSans, ...wordChip(word) }}>
          {word}
        </span>
      ) : null}
      <div className={word ? "mt-3" : undefined}>
        <ScoreValue value={value} />
      </div>
      {note ? (
        <p className="mt-4 max-w-[38rem] text-[16px] leading-[1.55]" style={{ ...hubSans, color: hub.text }}>
          {note}
        </p>
      ) : null}
    </div>
  );
}

function CopyIcon({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      aria-label={done ? "Артикул скопирован" : "Скопировать артикул WB"}
      className="absolute left-full top-1/2 ml-1 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md opacity-0 outline-none transition duration-150 group-hover/article:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-[#1F4E3D]"
      style={{ color: done ? hub.green : hub.textMuted }}
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setDone(true);
          window.setTimeout(() => setDone(false), 1200);
        });
      }}
    >
      {done ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

const PILLAR_TONES: SegmentTone[] = ["blue", "lime", "ink", "blue"];

function IndexComposition({ blocks }: { blocks: ContentBlock[] }) {
  const parts = blocks.filter((block) => block.max > 0);
  if (parts.length === 0) return null;
  const slots: Array<{ filled: boolean; tone: SegmentTone }> = [];
  parts.forEach((block, index) => {
    const tone = PILLAR_TONES[index] ?? "ink";
    const slotCount = Math.max(1, Math.round(block.max / 5));
    const filledCount = Math.round((block.points / block.max) * slotCount);
    for (let slot = 0; slot < slotCount; slot += 1) slots.push({ filled: slot < filledCount, tone });
  });
  return (
    <div>
      <div className="flex gap-[3px]" aria-hidden>
        {slots.map((slot, index) => (
          <span
            key={index}
            className="h-3 flex-1 rounded-[3px]"
            style={{ backgroundColor: segmentFill(slot.tone, slot.filled) }}
          />
        ))}
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
        {parts.map((block, index) => (
          <li key={block.title} className="flex items-center gap-2 text-[14px]" style={{ ...hubSans, color: hub.text }}>
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
              style={{ backgroundColor: segmentFill(PILLAR_TONES[index] ?? "ink", true) }}
            />
            <span className="min-w-0 truncate">{block.title}</span>
            <span className="ml-auto font-semibold" style={{ ...hubNumeric }}>
              {block.points.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function readAmount(rows: ReadoutSection["receipt"], label: string): number | null {
  const value = rows.find((row) => row.label === label)?.value;
  if (!value) return null;
  const match = value.replace(/[\s\u00a0]/g, "").replace(",", ".").match(/-?[\d.]+/);
  if (!match) return null;
  const amount = Number(match[0]);
  return Number.isFinite(amount) ? amount : null;
}

function UnitSplit({ moving, excess }: { moving: number; excess: number }) {
  const total = moving + excess;
  if (total <= 0) return null;
  const cells = 16;
  const movingCells = Math.min(cells, Math.round((moving / total) * cells));
  const excessCells = Math.min(cells - movingCells, Math.round((excess / total) * cells));
  return (
    <div>
      <div className="flex gap-[3px]" aria-hidden>
        {Array.from({ length: cells }, (_, index) => {
          const tone: SegmentTone = index < movingCells ? "blue" : "ink";
          const filled = index < movingCells + excessCells;
          return <span key={index} className="h-3 flex-1 rounded-[3px]" style={{ backgroundColor: segmentFill(tone, filled) }} />;
        })}
      </div>
      <p className="mt-2 text-[15px] leading-[1.5]" style={{ ...hubSans, color: hub.text }}>
        Синие клетки — штуки, которые уйдут за 28 дней. Чёрные — сверх темпа, на них сидит закупка.
      </p>
    </div>
  );
}

function Checklist({ items }: { items: ReadoutSection["checklist"] }) {
  if (items.length === 0) return null;
  return (
    <ul className="space-y-2">
      {items.map((item) => {
        const mark = checkMark(item.state);
        return (
          <li key={item.label}>
            <p className="text-[13px] font-semibold" style={{ color: hub.text }}>
              <span style={{ color: mark.color }}>{mark.text}</span>
              {" · "}
              {item.label}
            </p>
            <p className="text-[12px] leading-[1.45]" style={{ ...hubSans, color: hub.textMuted }}>
              {item.note}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

export function HubProductReadout({
  title,
  vendorCode,
  externalId,
  sections,
  focus,
  canEdit,
  onEdit,
  onClose,
  actions,
  money,
}: {
  title: string;
  vendorCode?: string;
  externalId?: string;
  sections: ReadoutSection[];
  focus: ReadoutSectionId;
  canEdit: boolean;
  onEdit: (() => void) | null;
  onClose: () => void;
  actions?: Partial<Record<ContentAction, ReadoutAction>>;
  money?: {
    price: string;
    discount: string;
    cost: string;
    onSave: (next: { price: string; discount: string; cost: string }) => Promise<string | null>;
  };
}) {
  const product = Boolean(vendorCode || externalId);
  const shown = product
    ? sections.filter((section) => topicOf(section.id) === topicOf(focus))
    : sections.filter((section) => section.id === focus);
  const topic = topicOf(focus);
  const storeUrl = wbCardUrl(externalId);
  const lead = shown.find((section) => section.id === focus) ?? shown[0] ?? null;

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[70] flex justify-end"
      style={{ backgroundColor: "rgba(14,17,22,0.28)" }}
      onClick={onClose}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="readout-title"
        className="flex h-full w-full max-w-[640px] flex-col border-l bg-white"
        style={{ borderColor: hub.border, boxShadow: "-16px 0 48px -28px rgba(14,17,22,0.5)" }}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="border-b px-6 py-5" style={{ borderColor: hub.borderSoft }}>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 id="readout-title" className="text-[30px] font-semibold leading-none tracking-[-0.03em]" style={{ ...hubSans, color: hub.ink }}>
                {lead?.title ?? title}
              </h2>
              {product ? (
                <p className="mt-2 text-[16px] leading-snug" style={{ ...hubSans, color: hub.textMuted }}>
                  {title}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-[10px] px-2 py-1.5 text-[14px] font-semibold outline-none hover:bg-[#F4F6F8] focus-visible:ring-2 focus-visible:ring-[#1F4E3D]"
              style={{ ...hubSans, color: hub.text }}
              onClick={onClose}
            >
              <X className="h-4 w-4" />
              Закрыть
            </button>
          </div>
          {product && externalId ? (
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
              <p className="group/article relative inline-flex items-center text-[14px]" style={{ ...hubSans, color: hub.textMuted }}>
                Артикул WB: <span className="ml-1 font-semibold" style={{ ...hubNumeric, color: hub.text }}>{externalId}</span>
                <CopyIcon text={externalId} />
              </p>
              {storeUrl ? (
                <a
                  href={storeUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-7 items-center gap-1 rounded-full px-2 text-[13px] font-semibold outline-none hover:bg-[#F4F6F8] focus-visible:ring-2 focus-visible:ring-[#1F4E3D]"
                  style={{ color: hub.blue }}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Открыть на WB
                </a>
              ) : null}
            </div>
          ) : null}
          {vendorCode ? (
            <p className="mt-1 font-mono text-[12px]" style={{ color: hub.textSubtle }}>
              Артикул продавца {vendorCode}
            </p>
          ) : null}
        </header>
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-6">
          {lead ? (
            <TopicBody
              lead={lead}
              shown={shown}
              topic={topic}
              focus={focus}
              actions={actions}
              money={product ? money : undefined}
            />
          ) : null}
        </div>
        {product && canEdit && onEdit && topic === "status" ? (
          <footer className="border-t px-5 py-3" style={{ borderColor: hub.borderSoft }}>
            <HubButton onClick={onEdit}>Открыть правку</HubButton>
          </footer>
        ) : null}
      </aside>
    </div>
  );
}

function TopicBody({
  lead,
  shown,
  topic,
  focus,
  actions,
  money,
}: {
  lead: ReadoutSection;
  shown: ReadoutSection[];
  topic: ReadoutTopic;
  focus: ReadoutSectionId;
  actions?: Partial<Record<ContentAction, ReadoutAction>>;
  money?: {
    price: string;
    discount: string;
    cost: string;
    onSave: (next: { price: string; discount: string; cost: string }) => Promise<string | null>;
  };
}) {
  if (topic === "logistics") {
    return <LogisticsBody shown={shown} focus={focus} />;
  }
  if (topic === "money") {
    return <MoneyBody section={lead} money={money} />;
  }
  return <SingleBody section={lead} actions={actions} />;
}

function FactList({ facts, skip }: { facts: string[]; skip?: string | null }) {
  const rows = facts.filter((fact) => fact !== skip);
  if (rows.length === 0) return null;
  return (
    <ul className="space-y-2">
      {rows.map((fact) => (
        <li key={fact} className="text-[15px] leading-[1.55]" style={{ ...hubSans, color: hub.text }}>
          {fact}
        </li>
      ))}
    </ul>
  );
}

function SingleBody({
  section,
  actions,
}: {
  section: ReadoutSection;
  actions?: Partial<Record<ContentAction, ReadoutAction>>;
}) {
  const axes = section.blocks.filter((block) => block.max > 0);
  const notes = section.blocks.filter((block) => block.max === 0 && block.advice);
  return (
    <>
      {section.figure ? <HeroScore figure={section.figure} note={section.next} /> : null}
      {!section.figure && section.next ? (
        <p className="text-[16px] leading-[1.55]" style={{ ...hubSans, color: hub.text }}>
          {section.next}
        </p>
      ) : null}
      {section.id === "index" ? <IndexComposition blocks={axes} /> : null}
      {notes.map((block) => (
        <p
          key={block.title}
          className="text-[16px] leading-[1.5]"
          style={{ ...hubSans, color: block.adviceTone === "danger" ? hub.danger : hub.text }}
        >
          {block.advice}
        </p>
      ))}
      {axes.length > 0 ? (
        <div>
          {axes.map((block) => (
            <Axis key={block.title} block={block} action={block.action ? actions?.[block.action] : undefined} />
          ))}
        </div>
      ) : null}
      {section.receipt.length > 0 ? <Receipt rows={section.receipt} /> : null}
      <Checklist items={section.checklist} />
      <FactList facts={section.facts} skip={section.next} />
      {section.blocks.length === 0 && section.receipt.length === 0 && !section.figure ? (
        <p className="text-[16px] leading-[1.55]" style={{ ...hubSans, color: hub.text }}>
          {section.about}
        </p>
      ) : null}
      <ReadoutManual id={section.id} />
    </>
  );
}

function LogisticsBody({ shown, focus }: { shown: ReadoutSection[]; focus: ReadoutSectionId }) {
  const lead = shown.find((section) => section.id === focus) ?? shown[0] ?? null;
  const rest = shown.filter((section) => section.id !== lead?.id);
  const stock = shown.find((section) => section.id === "stock");
  const capital = shown.find((section) => section.id === "capital");
  const moving = readAmount(stock?.receipt ?? capital?.receipt ?? [], "Уйдёт за 28 дней");
  const excess = readAmount(capital?.receipt ?? [], "Сверх темпа");
  if (!lead) return null;
  return (
    <>
      <HeroScore figure={lead.figure ?? "—"} note={lead.next} />
      {moving != null && excess != null ? <UnitSplit moving={moving} excess={excess} /> : null}
      <Receipt rows={lead.receipt} />
      <FactList facts={lead.facts} skip={lead.next} />
      {rest.map((section) => (
        <div key={section.id} className="rounded-[16px] border px-5 py-4" style={{ borderColor: hub.border }}>
          <p className="text-[13px] font-bold uppercase tracking-[0.06em]" style={{ color: hub.textSubtle }}>
            {section.title}
          </p>
          <p className="mt-2 text-[32px] font-semibold leading-none tracking-[-0.03em]" style={{ ...hubNumeric, color: hub.ink }}>
            {section.figure ?? "—"}
          </p>
          {section.next ? (
            <p className="mt-3 text-[15px] leading-[1.5]" style={{ ...hubSans, color: hub.text }}>
              {section.next}
            </p>
          ) : null}
          <div className="mt-3">
            <Receipt rows={section.receipt} />
          </div>
        </div>
      ))}
      <ReadoutManual id={lead.id} />
      {rest.map((section) => (
        <ReadoutManual key={section.id} id={section.id} />
      ))}
    </>
  );
}

function MoneyBody({
  section,
  money,
}: {
  section: ReadoutSection;
  money?: {
    price: string;
    discount: string;
    cost: string;
    onSave: (next: { price: string; discount: string; cost: string }) => Promise<string | null>;
  };
}) {
  const perPiece = section.receipt.find((row) => row.label === "С штуки");
  const floor = section.receipt.find((row) => row.label === "Убыток ниже");
  const hero = perPiece?.value ?? section.figure ?? "—";
  const floorNote = floor ? `Порог убытка ${floor.value}. На нём после списаний прибыль ноль.` : null;
  return (
    <>
      <HeroScore figure={hero} note={section.next ?? floorNote} />
      {floor && section.next ? (
        <p className="text-[18px] font-semibold" style={{ ...hubNumeric, color: hub.blue }}>
          Порог убытка {floor.value}
        </p>
      ) : null}
      <Receipt rows={section.receipt} />
      {money ? <MoneyFields money={money} /> : null}
      <FactList facts={section.facts} />
      <ReadoutManual id={section.id} />
    </>
  );
}
