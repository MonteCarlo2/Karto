"use client"

import Link from "next/link"
import { Sparkles, Wand2 } from "lucide-react"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { ArcGalleryHero } from "@/components/ui/arc-gallery-hero"

const GALLERY_ITEMS = [
  // Оставили 3 выбранных из старой галереи (без картинки с рукой)
  "/temp/028101ff-bfc7-40c5-aa1d-d1e01f02c5ba.png",
  "/temp/0fe5822e-bb1c-4d5c-bfa4-7479f2f79121.png",
  "/temp/17de21b7-0973-4c70-b0c0-45b4806f9465.png",
  // Добавили 7 новых изображений
  "/gallery/neuroblogger-cats.jpg",
  "/gallery/for-gallery.jpg",
  "/gallery/mountain-landscape.jpg",
  "/gallery/karto-slide.png",
  "/gallery/embrace-nature.jpg",
  "/gallery/lindoo.jpg",
  "/gallery/untitled-1.jpg",
]

export function FreeGenSection() {
  return (
    <section className="relative min-h-[900px] w-full bg-[#F5F5F0] overflow-hidden pt-10 pb-20">
      {/* Soft Green Glow - Magic MCP Style */}
      <div
        className="absolute inset-0 z-0"
        style={{
          backgroundImage: `
            radial-gradient(circle at center, #84CC16 0%, transparent 60%)
          `,
          opacity: 0.15,
          mixBlendMode: "multiply",
        }}
      />
      
      <ArcGalleryHero 
        images={GALLERY_ITEMS}
        className="bg-transparent"
        radiusLg={650} 
        radiusMd={450}
        radiusSm={320}
        startAngle={170} 
        endAngle={10}
        cardSizeLg={230} // Increased size as requested
        cardSizeMd={180}
        cardSizeSm={130}
      >
        <div className="text-center flex flex-col items-center relative z-20">
          <div className="mb-6 flex items-center justify-center md:mb-8">
            <div className="relative h-36 w-36 md:h-40 md:w-40">
              <motion.div
                className="absolute inset-0"
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, ease: "linear", duration: 18 }}
              >
                {Array.from("KARTO • CREATIVE • STUDIO • AI • ").map((char, i, arr) => {
                  const angle = (360 / arr.length) * i
                  return (
                    <span
                      key={`${char}-${i}`}
                      className="absolute left-1/2 top-1/2 text-[9px] font-semibold tracking-[0.04em] text-[#1F4E3D] md:text-[10px]"
                      style={{
                        transform: `translate(-50%, -50%) rotate(${angle}deg) translateY(-73px)`,
                        transformOrigin: "center",
                      }}
                    >
                      {char}
                    </span>
                  )
                })}
              </motion.div>

              <div className="absolute inset-[27px] rounded-full border border-[#84CC16]/30 bg-white/85 shadow-[0_10px_30px_rgba(31,78,61,0.16)] backdrop-blur-sm md:inset-[29px]" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-[#ECF7DB] text-[#1F4E3D] ring-1 ring-[#84CC16]/50 md:h-[72px] md:w-[72px]">
                  <Wand2 className="h-7 w-7 md:h-8 md:w-8" />
                  <Sparkles className="absolute -right-1 -top-1 h-4.5 w-4.5 text-[#84CC16]" />
                </div>
              </div>
            </div>
          </div>

          <h2
            className="text-4xl font-bold leading-[1.1] tracking-tight text-foreground md:text-5xl lg:text-7xl"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Свободное{" "}
            <span className="text-[#84CC16]">творчество.</span>
          </h2>

          <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-muted-foreground md:text-xl">
            Пространство для чистого творчества. Генерируйте любые изображения,
            ищите вдохновение и создавайте уникальный стиль.
          </p>

          <div className="mt-8 md:mt-10">
            <Button
              size="lg"
              asChild
              className="h-14 rounded-xl bg-[#1F4E3D] px-10 text-lg shadow-xl shadow-[#1F4E3D]/20 hover:bg-[#16382c] transition-all hover:scale-105"
            >
              <Link href="/studio/free">
                Начать творить <Wand2 className="ml-2 h-5 w-5" />
              </Link>
            </Button>
          </div>
        </div>
      </ArcGalleryHero>
    </section>
  )
}
