"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { MarketplaceSwitch, UE } from "@/components/unit-economics/unit-economics-ui";
import type { UnitEconMarketplace } from "@/lib/unit-economics";

const backLinkClass =
  "inline-flex items-center gap-1.5 rounded-[10px] bg-white px-3.5 py-2 text-sm font-semibold text-[#070907] shadow-[0_2px_8px_rgba(7,9,7,0.08)] ring-1 ring-[#070907]/10 transition-all duration-200 hover:bg-[#FAFAF8] hover:shadow-[0_4px_14px_rgba(7,9,7,0.12)] hover:ring-[#070907]/20 active:scale-[0.98]";

export function UnitEconomicsHeader({
  marketplace,
  onMarketplaceChange,
}: {
  marketplace: UnitEconMarketplace;
  onMarketplaceChange: (v: UnitEconMarketplace) => void;
}) {
  return (
    <div className="mb-8">
      <Link href="/" className={`${backLinkClass} mb-5`}>
        <ArrowLeft className="h-4 w-4 shrink-0" strokeWidth={2.25} />
        Назад
      </Link>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[1fr_1.1fr] lg:gap-8">
        <div className="min-w-0">
          <h1
            className="text-[clamp(1.875rem,2.6vw,2.5rem)] font-bold leading-[1.12] tracking-tight"
            style={{ color: UE.text }}
          >
            Юнит-экономика
          </h1>
          <p
            className="mt-2.5 max-w-xl text-[0.9375rem] leading-[1.65] sm:text-[15px]"
            style={{ color: UE.textMuted }}
          >
            Рассчитайте примерные затраты и прибыль на Ozon и Wildberries — сразу для схем{" "}
            <span className="font-semibold text-[#070907]">FBO</span> и{" "}
            <span className="font-semibold text-[#070907]">FBS</span>
          </p>
        </div>

        <div className="flex items-center justify-start lg:justify-end lg:self-start lg:pt-0.5">
          <MarketplaceSwitch value={marketplace} onChange={onMarketplaceChange} />
        </div>
      </div>
    </div>
  );
}
