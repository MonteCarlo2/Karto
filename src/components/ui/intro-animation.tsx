"use client";

import { useEffect, useState, useRef } from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

interface IntroAnimationProps {
  onComplete: () => void;
}

// Статичный эффект рельефной бумаги (без анимации)
function CanvasTexture({ patternAlpha = 15 }: { patternAlpha?: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const canvasSize = 512; // Высокое разрешение для качества

    const resize = () => {
      if (!canvas) return;
      canvas.width = canvasSize;
      canvas.height = canvasSize;
      canvas.style.width = "100vw";
      canvas.style.height = "100vh";
    };

    // Генерируем статичный шум один раз (как рельефная бумага)
    const drawTexture = () => {
      const imageData = ctx.createImageData(canvasSize, canvasSize);
      const data = imageData.data;
      
      // Создаём более органичный, бумажный шум
      for (let y = 0; y < canvasSize; y++) {
        for (let x = 0; x < canvasSize; x++) {
          const index = (y * canvasSize + x) * 4;
          
          // Более мягкий, бумажный шум с небольшими вариациями
          const noise = Math.random() * 0.4 + 0.6; // 0.6 - 1.0 (более контрастный)
          const value = Math.floor(noise * 255);
          
          data[index] = value;
          data[index + 1] = value;
          data[index + 2] = value;
          data[index + 3] = patternAlpha;
        }
      }
      
      ctx.putImageData(imageData, 0, 0);
    };

    resize();
    drawTexture(); // Генерируем один раз, без анимации

    const handleResize = () => {
      resize();
      drawTexture(); // Перерисовываем при изменении размера
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [patternAlpha]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0"
      style={{ 
        imageRendering: "crisp-edges",
        mixBlendMode: "overlay",
        opacity: 1
      }}
    />
  );
}

export function IntroAnimation({ onComplete }: IntroAnimationProps) {
  const router = useRouter();
  const [showContent, setShowContent] = useState(false);

  const handleOpenFlow = () => {
    // Переходим на страницу "Понимание"
    router.push("/studio/understanding");
  };

  useEffect(() => {
    // Небольшая задержка перед появлением контента
    const timer = setTimeout(() => {
      setShowContent(true);
    }, 300);

    return () => clearTimeout(timer);
  }, []);


  useEffect(() => {
    // Блокируем скролл когда интро показывается
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[9999] flex items-center overflow-hidden"
      style={{ 
        backgroundColor: "#2E5A43",
        width: "100vw",
        height: "100vh",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
      }}
    >
      {/* Статичный эффект рельефной бумаги (без анимации) */}
      <CanvasTexture patternAlpha={12} />
      
      {/* Кнопка "Назад" - стеклянная, в левом верхнем углу */}
      <motion.button
        initial={{ opacity: 0, x: -20 }}
        animate={showContent ? { opacity: 1, x: 0 } : { opacity: 0, x: -20 }}
        transition={{ duration: 0.6, delay: 0.2 }}
        onClick={() => router.push("/")}
        className="absolute top-8 left-8 lg:top-12 lg:left-12 z-10 p-3 transition-all duration-300 hover:scale-105 active:scale-95"
        style={{
          background: "rgba(255, 255, 255, 0.12)",
          backdropFilter: "blur(30px)",
          WebkitBackdropFilter: "blur(30px)",
          border: "1px solid rgba(255, 255, 255, 0.25)",
          borderRadius: "12px",
          boxShadow: `
            0 4px 16px rgba(0, 0, 0, 0.2),
            0 0 0 1px rgba(255, 255, 255, 0.1) inset,
            0 1px 0 rgba(255, 255, 255, 0.3) inset
          `,
        }}
        aria-label="Назад"
      >
        <ArrowLeft className="w-6 h-6" style={{ color: "rgba(255, 255, 255, 0.95)" }} />
      </motion.button>
      
      <div className="w-full h-full flex items-center relative" style={{ zIndex: 1 }}>
        {/* Левая часть - Текст */}
        <div className="flex-1 flex items-center pl-8 lg:pl-16 xl:pl-24">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={showContent ? { opacity: 1, x: 0 } : { opacity: 0, x: -30 }}
            transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="space-y-6"
          >
            {/* Заголовок - белый текст */}
            <h1
              className="text-5xl md:text-6xl lg:text-7xl font-bold leading-tight"
              style={{ 
                fontFamily: "var(--font-serif), Georgia, serif",
                color: "#ffffff",
                textShadow: "0 2px 8px rgba(0, 0, 0, 0.3)",
              }}
            >
              Добро пожаловать
              <br />
              <span className="block mt-2">в Мастерскую</span>
            </h1>

            {/* Подзаголовок - серый */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={showContent ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
              transition={{ duration: 0.8, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="mt-6"
            >
              <p
                className="text-xl md:text-2xl"
                style={{
                  fontFamily: "var(--font-sans), Inter, sans-serif",
                  color: "rgba(255, 255, 255, 0.7)",
                  fontWeight: 400,
                }}
              >
                Запустим Поток: от идеи до готовой карточки.
              </p>
            </motion.div>

            {/* Список этапов - растянутые буквы, серый */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={showContent ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
              transition={{ duration: 0.8, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="mt-4"
            >
              <p
                className="text-lg md:text-xl"
                style={{
                  fontFamily: "var(--font-sans), Inter, sans-serif",
                  color: "rgba(255, 255, 255, 0.65)",
                  fontWeight: 400,
                  letterSpacing: "0.15em",
                }}
              >
                • Понимание • Описание • Визуал • Цена
              </p>
            </motion.div>
          </motion.div>
        </div>

        {/* Правая часть - Символ (увеличен в 2 раза, выше) */}
        <div className="flex-1 flex items-start justify-end pr-8 lg:pr-16 xl:pr-24 pt-8 lg:pt-12">
          <motion.div
            initial={{ scale: 0.8, opacity: 0, y: -30 }}
            animate={showContent ? { scale: 1, opacity: 1, y: 0 } : { scale: 0.8, opacity: 0, y: -30 }}
            transition={{ duration: 0.8, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          >
            <Image
              src="/intro-symbol.png"
              alt="Символ"
              width={1000}
              height={1000}
              className="object-contain"
              priority
              unoptimized
              style={{ maxWidth: "1200px", maxHeight: "1200px", filter: "drop-shadow(0 8px 16px rgba(255,255,255,0.2))" }}
            />
          </motion.div>
        </div>

        {/* Кнопка - стеклянная капсула (как на скриншоте) */}
        <motion.div
          initial={{ y: 50, opacity: 0 }}
          animate={showContent ? { y: 0, opacity: 1 } : { y: 50, opacity: 0 }}
          transition={{ duration: 0.8, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="absolute bottom-8 right-8 lg:bottom-12 lg:right-12"
        >
          <button
            onClick={handleOpenFlow}
            className="px-10 py-5 text-xl md:text-2xl font-semibold transition-all duration-300 hover:scale-105 active:scale-95 flex items-center gap-3 relative overflow-hidden"
            style={{
              background: "rgba(255, 255, 255, 0.12)",
              backdropFilter: "blur(30px)",
              WebkitBackdropFilter: "blur(30px)",
              border: "1px solid rgba(255, 255, 255, 0.25)",
              color: "rgba(255, 255, 255, 0.95)",
              borderRadius: "9999px",
              boxShadow: `
                0 4px 16px rgba(0, 0, 0, 0.2),
                0 0 0 1px rgba(255, 255, 255, 0.1) inset,
                0 1px 0 rgba(255, 255, 255, 0.3) inset
              `,
            }}
          >
            {/* Блик сверху (как на скриншоте) */}
            <div
              style={{
                position: "absolute",
                top: "-20%",
                left: "10%",
                width: "60%",
                height: "40%",
                background: "linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, transparent 100%)",
                borderRadius: "50%",
                filter: "blur(15px)",
                pointerEvents: "none",
              }}
            />
            <span>Запустить Поток</span>
            <svg
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              style={{ flexShrink: 0 }}
            >
              <path
                d="M7.5 15L12.5 10L7.5 5"
                stroke="rgba(255, 255, 255, 0.95)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </motion.div>
      </div>
    </motion.div>
  );
}
