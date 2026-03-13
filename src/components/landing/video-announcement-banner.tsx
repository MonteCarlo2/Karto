"use client";

import { useEffect, useRef, useState } from "react";

const STORAGE_KEY = "karto_video_announcement_seen_v1";

export function VideoAnnouncementBanner() {
  const [visible, setVisible] = useState(false);
  const [activeTab, setActiveTab] = useState<"animate" | "free">("animate");
  const animateVideoRef = useRef<HTMLVideoElement>(null);
  const freeVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) {
        setVisible(true);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (!visible) return;
    const v = activeTab === "animate" ? animateVideoRef.current : freeVideoRef.current;
    if (v) {
      v.currentTime = 0;
      v.play().catch(() => {});
    }
  }, [activeTab, visible]);

  const close = () => {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {}
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      {/* Main card */}
      <div
        className="relative w-full max-w-2xl rounded-3xl overflow-hidden shadow-2xl"
        style={{
          background: "linear-gradient(145deg, #0a0f0d 0%, #0e1c16 50%, #0a1a12 100%)",
          border: "1px solid rgba(74,222,128,0.18)",
        }}
      >
        {/* Top glow */}
        <div
          className="absolute top-0 inset-x-0 h-px"
          style={{
            background: "linear-gradient(90deg, transparent, rgba(74,222,128,0.6), transparent)",
          }}
        />

        {/* Close */}
        <button
          onClick={close}
          className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-all"
          aria-label="Закрыть"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </button>

        <div className="p-6 pb-5 sm:p-8 sm:pb-6">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 mb-4 text-xs font-semibold tracking-widest uppercase"
            style={{ background: "rgba(74,222,128,0.1)", border: "1px solid rgba(74,222,128,0.25)", color: "#4ADE80" }}
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400" />
            </span>
            Скоро на KARTO
          </div>

          {/* Headline */}
          <h2 className="text-2xl sm:text-3xl font-bold text-white leading-tight mb-2">
            Генерация видео — <br className="hidden sm:block" />
            <span style={{ color: "#4ADE80" }}>новая эра контента</span>
          </h2>

          <p className="text-sm sm:text-base text-gray-400 mb-6 max-w-lg leading-relaxed">
            Мы добавляем в KARTO видеогенерацию. Анимируйте карточки товаров или создавайте любые видео силой AI — 
            прямо из вашего браузера.
          </p>

          {/* Tabs */}
          <div className="flex gap-1 p-1 rounded-2xl mb-5"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.06)" }}
          >
            <button
              onClick={() => setActiveTab("animate")}
              className="flex-1 py-2 px-3 rounded-xl text-sm font-semibold transition-all"
              style={
                activeTab === "animate"
                  ? { background: "rgba(74,222,128,0.15)", color: "#4ADE80", border: "1px solid rgba(74,222,128,0.3)" }
                  : { color: "rgba(255,255,255,0.45)", border: "1px solid transparent" }
              }
            >
              Анимация карточки
            </button>
            <button
              onClick={() => setActiveTab("free")}
              className="flex-1 py-2 px-3 rounded-xl text-sm font-semibold transition-all"
              style={
                activeTab === "free"
                  ? { background: "rgba(74,222,128,0.15)", color: "#4ADE80", border: "1px solid rgba(74,222,128,0.3)" }
                  : { color: "rgba(255,255,255,0.45)", border: "1px solid transparent" }
              }
            >
              Свободная генерация
            </button>
          </div>

          {/* Video area */}
          <div className="relative rounded-2xl overflow-hidden" style={{ aspectRatio: "16/9", background: "#000" }}>
            {/* Animate tab */}
            <div
              className="absolute inset-0 transition-opacity duration-300"
              style={{ opacity: activeTab === "animate" ? 1 : 0, pointerEvents: activeTab === "animate" ? "auto" : "none" }}
            >
              {/* Side-by-side: still card → animated card */}
              <div className="flex h-full">
                {/* Still card */}
                <div className="relative flex-1 flex items-center justify-center overflow-hidden"
                  style={{ background: "linear-gradient(135deg,#0d2018,#0a1a12)" }}
                >
                  <div className="relative w-full h-full">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/card-3.png"
                      alt="Карточка товара"
                      className="absolute inset-0 w-full h-full object-contain p-4"
                    />
                  </div>
                  {/* Label */}
                  <div className="absolute bottom-3 inset-x-0 flex justify-center">
                    <span className="text-xs text-gray-400 bg-black/40 px-2 py-0.5 rounded-full backdrop-blur-sm">
                      Исходная карточка
                    </span>
                  </div>
                </div>

                {/* Divider arrow */}
                <div className="flex items-center z-10 px-1.5">
                  <div className="flex flex-col items-center gap-1">
                    <div className="w-px h-8 bg-green-400/30" />
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-green-400"
                      style={{ background: "rgba(74,222,128,0.12)", border: "1px solid rgba(74,222,128,0.3)" }}
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M3 6h6M7 4l2 2-2 2" stroke="#4ADE80" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                    <div className="w-px h-8 bg-green-400/30" />
                  </div>
                </div>

                {/* Animated video */}
                <div className="relative flex-1 flex items-center justify-center overflow-hidden"
                  style={{ background: "#000" }}
                >
                  <video
                    ref={animateVideoRef}
                    src="/fed43aba167d0c1b1398a0b84feb5295_1773418511_8b66ag6q.mp4"
                    className="absolute inset-0 w-full h-full object-cover"
                    loop
                    muted
                    playsInline
                    autoPlay
                  />
                  <div className="absolute bottom-3 inset-x-0 flex justify-center pointer-events-none">
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full backdrop-blur-sm"
                      style={{ background: "rgba(74,222,128,0.15)", color: "#4ADE80", border: "1px solid rgba(74,222,128,0.3)" }}
                    >
                      Анимированная версия
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Free generation tab */}
            <div
              className="absolute inset-0 transition-opacity duration-300"
              style={{ opacity: activeTab === "free" ? 1 : 0, pointerEvents: activeTab === "free" ? "auto" : "none" }}
            >
              <video
                ref={freeVideoRef}
                src="/Video_Vapor_Removal_HVNV8Pd.mp4"
                className="absolute inset-0 w-full h-full object-cover"
                loop
                muted
                playsInline
              />
              {/* Overlay text */}
              <div className="absolute inset-0 flex flex-col justify-end p-4 pointer-events-none"
                style={{ background: "linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 55%)" }}
              >
                <p className="text-sm font-medium text-white leading-snug">
                  Космос, фантастика, продукты — любая идея.<br/>
                  <span className="text-green-400">Просто напишите промпт.</span>
                </p>
              </div>
            </div>
          </div>

          {/* Feature pills */}
          <div className="mt-5 flex flex-wrap gap-2">
            {[
              { icon: "✨", text: "Анимация товарных карточек" },
              { icon: "🎬", text: "Свободная видеогенерация" },
              { icon: "⚡", text: "AI в несколько кликов" },
            ].map((pill) => (
              <div
                key={pill.text}
                className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs text-gray-300"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.09)" }}
              >
                <span>{pill.icon}</span>
                <span>{pill.text}</span>
              </div>
            ))}
          </div>

          {/* CTA row */}
          <div className="mt-5 flex items-center justify-between">
            <p className="text-xs text-gray-500">
              Уже скоро в разделе&nbsp;
              <span className="text-green-400 font-medium">Свободное творчество</span>
            </p>
            <button
              onClick={close}
              className="rounded-xl px-4 py-2 text-sm font-semibold text-black transition-all hover:brightness-110 active:scale-95"
              style={{ background: "#4ADE80" }}
            >
              Понятно
            </button>
          </div>
        </div>

        {/* Bottom glow */}
        <div
          className="absolute bottom-0 inset-x-0 h-px"
          style={{
            background: "linear-gradient(90deg, transparent, rgba(74,222,128,0.25), transparent)",
          }}
        />
      </div>
    </div>
  );
}
