"use client"

import { InfiniteSlider } from "@/components/ui/infinite-slider"

const MARKETPLACE_LOGOS = [
  { src: "/logos/ozon.png", alt: "Ozon" },
  { src: "/logos/wildberries.png", alt: "Wildberries" },
  { src: "/logos/yandex-market.png", alt: "Yandex Market" },
  { src: "/logos/sbermegamarket.png", alt: "SberMegaMarket" },
  { src: "/logos/avito.png", alt: "Avito" },
]

export function MarketplaceLogoTicker() {
  // Intentionally pre-repeat sequence to keep track visually continuous
  // even on very wide screens without visible "end/start" perception.
  const track = [...MARKETPLACE_LOGOS, ...MARKETPLACE_LOGOS, ...MARKETPLACE_LOGOS]

  return (
    <section className="relative overflow-hidden border-y border-black/5 bg-[#F5F5F0] py-3">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-20 bg-gradient-to-r from-[#F5F5F0] to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-20 bg-gradient-to-l from-[#F5F5F0] to-transparent" />

      <InfiniteSlider
        gap={160}
        duration={44}
        className="w-full"
      >
        {track.map((logo, idx) => (
          <img
            key={`${logo.alt}-${idx}`}
            src={logo.src}
            alt={logo.alt}
            className="h-7 w-[140px] object-contain opacity-88"
            draggable={false}
          />
        ))}
      </InfiniteSlider>
    </section>
  )
}

