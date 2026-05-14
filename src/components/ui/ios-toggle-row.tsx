"use client";

import { motion } from "framer-motion";

type Props = {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  dense?: boolean;
  /** Ещё компактнее — для узких панелей/второстепенных списков. */
  compact?: boolean;
};

export function IosToggleRow({ label, checked, onChange, dense, compact }: Props) {
  if (compact) {
    return (
      <div className="flex items-center justify-between gap-1 py-0">
        <span className="min-w-0 text-[10px] font-medium leading-tight tracking-[-0.02em] text-[#070907] md:text-[11px]">
          {label}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          onClick={() => onChange(!checked)}
          className={`relative h-[16px] w-[28px] shrink-0 rounded-full transition-colors duration-200 ${
            checked ? "bg-[#34C759]" : "bg-neutral-300/90"
          }`}
        >
          <motion.span
            transition={{ type: "spring", stiffness: 520, damping: 34 }}
            className="pointer-events-none absolute left-[2px] top-[2px] h-[12px] w-[12px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.18)]"
            animate={{ x: checked ? 12 : 0 }}
          />
        </button>
      </div>
    );
  }

  return (
    <div className={`flex items-center justify-between gap-2 ${dense ? "py-0.5" : "py-1"}`}>
      <span className="min-w-0 text-[12px] font-medium leading-tight tracking-[-0.02em] text-[#070907] md:text-[13px]">
        {label}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors duration-200 ${
          checked ? "bg-[#34C759]" : "bg-neutral-300/90"
        }`}
      >
        <motion.span
          transition={{ type: "spring", stiffness: 480, damping: 32 }}
          className="pointer-events-none absolute left-[2px] top-[2px] h-[18px] w-[18px] rounded-full bg-white shadow-[0_1px_4px_rgba(0,0,0,0.2)]"
          animate={{ x: checked ? 16 : 0 }}
        />
      </button>
    </div>
  );
}
