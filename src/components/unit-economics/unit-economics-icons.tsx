"use client";

import { Package, Truck, MapPin, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export function OzonMiniLogo({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      aria-hidden
    >
      <rect width="18" height="18" rx="5" fill="white" fillOpacity="0.22" />
      <path
        d="M4.5 9.2c0-2.8 1.8-4.6 4.5-4.6s4.5 1.8 4.5 4.6-1.8 4.6-4.5 4.6S4.5 12 4.5 9.2z"
        stroke="white"
        strokeWidth="1.6"
      />
      <path d="M9 6.2v6" stroke="white" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function WBMiniLogo({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      aria-hidden
    >
      <rect width="18" height="18" rx="5" fill="white" fillOpacity="0.22" />
      <path
        d="M5 12.5l1.6-7.2h1.8l1 4.8 1-4.8h1.7L13 12.5h-1.6l-.9-4.5-.95 4.5H6.55L5 12.5z"
        fill="white"
      />
    </svg>
  );
}

const SECTION_ICONS: Record<string, LucideIcon> = {
  product: Package,
  delivery: Truck,
  shipment: MapPin,
  profit: Wallet,
};

export function SectionIcon({ name }: { name: keyof typeof SECTION_ICONS }) {
  const Icon = SECTION_ICONS[name];
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#B9FF4B]/28 ring-1 ring-[#B9FF4B]/45">
      <Icon className="h-[18px] w-[18px] text-[#070907]" strokeWidth={2.15} />
    </span>
  );
}
