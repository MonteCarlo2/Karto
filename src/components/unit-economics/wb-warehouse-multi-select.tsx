"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { FieldLabel, UE } from "@/components/unit-economics/unit-economics-ui";
import type { WbWarehouseOption } from "@/lib/unit-economics/wb-meta";
import { cn } from "@/lib/utils";

type Props = {
  label: string;
  placeholder?: string;
  warehouses: WbWarehouseOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
};

function HighlightMatch({ text, query }: { text: string; query: string }) {
  const q = query.trim().toLowerCase();
  if (!q || !text.toLowerCase().includes(q)) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(q);
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded-[2px] bg-[rgba(185,255,75,0.55)] px-0.5 font-semibold text-inherit">
        {text.slice(idx, idx + q.length)}
      </mark>
      {text.slice(idx + q.length)}
    </>
  );
}

export function WbWarehouseMultiSelect({
  label,
  placeholder = "Выберите склад",
  warehouses,
  selectedIds,
  onChange,
  disabled = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(
    () =>
      selectedIds
        .map((id) => warehouses.find((w) => w.id === id))
        .filter(Boolean) as WbWarehouseOption[],
    [selectedIds, warehouses]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return warehouses;
    return warehouses.filter(
      (w) =>
        w.label.toLowerCase().includes(q) ||
        w.shortLabel.toLowerCase().includes(q) ||
        w.id.toLowerCase().includes(q)
    );
  }, [query, warehouses]);

  useEffect(() => {
    if (!open) return;
    const channel = "karto:unit-economics:warehouse-select-open";
    window.dispatchEvent(new CustomEvent(channel, { detail: rootRef.current }));
    const onOtherOpen = (e: Event) => {
      const detail = (e as CustomEvent<HTMLElement | null>).detail;
      if (detail !== rootRef.current) setOpen(false);
    };
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener(channel, onOtherOpen);
    document.addEventListener("mousedown", onDoc);
    return () => {
      window.removeEventListener(channel, onOtherOpen);
      document.removeEventListener("mousedown", onDoc);
    };
  }, [open]);

  const toggle = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((x) => x !== id));
      return;
    }
    onChange([...selectedIds, id]);
  };

  return (
    <div
      ref={rootRef}
      className={cn("relative", open ? "z-[80]" : "z-0", disabled && "pointer-events-none opacity-50")}
    >
      <FieldLabel>{label}</FieldLabel>

      {selected.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {selected.map((w) => (
            <span
              key={w.id}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#CB11AB]/25 bg-[#CB11AB]/8 px-3 py-1 text-sm font-medium"
              style={{ color: UE.text }}
            >
              {w.shortLabel}
              <button
                type="button"
                onClick={() => onChange(selectedIds.filter((x) => x !== w.id))}
                className="flex h-5 w-5 items-center justify-center rounded-full text-black/45 transition hover:bg-black/[0.06] hover:text-black/75"
                aria-label={`Убрать ${w.shortLabel}`}
              >
                <X className="h-3.5 w-3.5" strokeWidth={2.5} />
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={() => onChange([])}
            className="self-center text-xs font-semibold transition hover:opacity-80"
            style={{ color: UE.textMuted }}
          >
            Сбросить всё
          </button>
        </div>
      ) : null}

      <div className="relative mt-2">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
          style={{ color: UE.textMuted }}
        />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="h-11 w-full rounded-[12px] border border-black/10 bg-white pl-9 pr-10 text-sm outline-none transition focus:border-black/20"
        />
        <button
          type="button"
          onClick={() => {
            setOpen((v) => !v);
            if (!open) inputRef.current?.focus();
          }}
          className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-black/40 transition hover:bg-black/[0.05]"
          aria-label={open ? "Свернуть" : "Открыть список"}
        >
          <ChevronDown
            className={cn("h-4 w-4 transition-transform", open && "rotate-180")}
            strokeWidth={2.25}
          />
        </button>

        <AnimatePresence initial={false}>
          {open ? (
          <motion.div
            key="warehouse-dropdown"
            initial={{ opacity: 0, y: -6, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -4, filter: "blur(4px)" }}
            transition={{ type: "spring", duration: 0.22, bounce: 0 }}
            className="absolute z-[90] mt-2 w-full overflow-hidden rounded-[14px] border border-black/[0.08] bg-white shadow-[0_16px_48px_-12px_rgba(0,0,0,0.22),0_0_0_1px_rgba(255,255,255,0.9)]"
          >
            <ul className="max-h-[min(320px,45vh)] overflow-auto py-1.5" role="listbox" aria-multiselectable>
              {filtered.length === 0 ? (
                <li className="px-4 py-3 text-sm" style={{ color: UE.textMuted }}>
                  Склады не найдены
                </li>
              ) : (
                filtered.map((w) => {
                  const checked = selectedIds.includes(w.id);
                  return (
                    <li key={w.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={checked}
                        onClick={() => toggle(w.id)}
                        className={cn(
                          "flex w-full items-start gap-3 px-4 py-2.5 text-left text-sm transition hover:bg-black/[0.03]",
                          checked && "bg-[#CB11AB]/5"
                        )}
                      >
                        <span
                          className={cn(
                            "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                            checked
                              ? "border-[#CB11AB] bg-[#CB11AB] text-white"
                              : "border-black/20 bg-white"
                          )}
                        >
                          {checked ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium leading-snug" style={{ color: UE.text }}>
                            <HighlightMatch text={w.shortLabel} query={query} />
                          </span>
                          {w.shortLabel !== w.label ? (
                            <span
                              className="mt-0.5 block text-xs leading-relaxed"
                              style={{ color: UE.textMuted }}
                            >
                              <HighlightMatch text={w.label} query={query} />
                            </span>
                          ) : null}
                        </span>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}

type SupplyTypeProps = {
  selected: ("box" | "monopallet")[];
  onChange: (types: ("box" | "monopallet")[]) => void;
  disabled?: boolean;
};

export function WbSupplyTypeCheckboxes({ selected, onChange, disabled }: SupplyTypeProps) {
  const toggle = (type: "box" | "monopallet") => {
    if (selected.includes(type)) {
      onChange(selected.filter((t) => t !== type));
      return;
    }
    onChange([...selected, type]);
  };

  return (
    <div className={cn("flex flex-wrap gap-4", disabled && "pointer-events-none opacity-50")}>
      {(
        [
          { id: "box" as const, label: "Короб" },
          { id: "monopallet" as const, label: "Монопаллета" },
        ] as const
      ).map(({ id, label: typeLabel }) => (
        <label key={id} className="flex cursor-pointer items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={selected.includes(id)}
            onChange={() => toggle(id)}
            className="h-4 w-4 rounded border-black/20 accent-[#CB11AB]"
          />
          <span style={{ color: UE.text }}>{typeLabel}</span>
        </label>
      ))}
    </div>
  );
}
