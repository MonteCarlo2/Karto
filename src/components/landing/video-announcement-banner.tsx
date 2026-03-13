"use client";

import { useEffect, useRef, useState } from "react";

const STORAGE_KEY = "karto_video_announcement_seen_v1";

export function VideoAnnouncementBanner() {
  const [visible, setVisible] = useState(false);
  const videoCardRef = useRef<HTMLVideoElement>(null);
  const videoFreeRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) {
        setVisible(true);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (!visible) return;
    videoCardRef.current?.play().catch(() => {});
    videoFreeRef.current?.play().catch(() => {});
  }, [visible]);

  const close = () => {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {}
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6"
      style={{ background: "rgba(0,0,0,0.72)", backdropFilter: "blur(8px)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      {/* Card — wide landscape */}
      <div
        className="relative w-full max-w-3xl rounded-3xl overflow-hidden shadow-2xl"
        style={{
          background: "linear-gradient(145deg, #0b1410 0%, #0f2018 60%, #0a1a12 100%)",
          border: "1px solid rgba(74,222,128,0.2)",
          boxShadow: "0 0 60px rgba(74,222,128,0.07), 0 32px 80px rgba(0,0,0,0.6)",
        }}
      >
        {/* Top glow line */}
        <div className="absolute top-0 inset-x-0 h-px"
          style={{ background: "linear-gradient(90deg,transparent,rgba(74,222,128,0.55),transparent)" }} />

        {/* Close button */}
        <button
          onClick={close}
          className="absolute top-4 right-4 z-20 w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-all"
          aria-label="Закрыть"
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M1 1l11 11M12 1L1 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </button>

        <div className="p-5 sm:p-7">
          {/* Header row */}
          <div className="flex items-start justify-between gap-4 mb-5">
            <div>
              {/* Badge */}
              <div className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 mb-3 text-xs font-semibold tracking-widest uppercase"
                style={{ background: "rgba(74,222,128,0.1)", border: "1px solid rgba(74,222,128,0.25)", color: "#4ADE80" }}
              >
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-400" />
                </span>
                Скоро на KARTO
              </div>

              <h2 className="text-xl sm:text-2xl font-bold text-white leading-tight">
                Продолжение следует<span style={{ color: "#4ADE80" }}>...</span>
              </h2>
              <p className="mt-1 text-sm text-gray-400">
                Уже скоро в разделе{" "}
                <span className="text-green-400 font-medium">Свободное творчество</span>
              </p>
            </div>
          </div>

          {/* Two videos side by side */}
          <div className="grid grid-cols-2 gap-3">
            {/* Video 1 — animated card */}
            <div className="relative rounded-2xl overflow-hidden group" style={{ aspectRatio: "9/16" }}>
              <video
                ref={videoCardRef}
                src="/fed43aba167d0c1b1398a0b84feb5295_1773418511_8b66ag6q.mp4"
                className="absolute inset-0 w-full h-full object-cover"
                loop
                muted
                playsInline
                autoPlay
              />
              {/* Bottom label */}
              <div className="absolute bottom-0 inset-x-0 p-3 pointer-events-none"
                style={{ background: "linear-gradient(to top,rgba(0,0,0,0.65) 0%,transparent 100%)" }}
              >
                <p className="text-xs font-medium text-white">Анимация карточек</p>
                <p className="text-xs text-gray-400 mt-0.5">Оживите товар одним кликом</p>
              </div>
            </div>

            {/* Video 2 — free generation */}
            <div className="relative rounded-2xl overflow-hidden group" style={{ aspectRatio: "9/16" }}>
              <video
                ref={videoFreeRef}
                src="/Video_Vapor_Removal_HVNV8Pd.mp4"
                className="absolute inset-0 w-full h-full object-cover"
                loop
                muted
                playsInline
                autoPlay
              />
              <div className="absolute bottom-0 inset-x-0 p-3 pointer-events-none"
                style={{ background: "linear-gradient(to top,rgba(0,0,0,0.65) 0%,transparent 100%)" }}
              >
                <p className="text-xs font-medium text-white">Свободная генерация</p>
                <p className="text-xs text-gray-400 mt-0.5">Любая идея — в видео</p>
              </div>
            </div>
          </div>

          {/* Bottom row */}
          <div className="mt-4 flex items-center justify-end">
            <button
              onClick={close}
              className="rounded-xl px-5 py-2 text-sm font-semibold text-black transition-all hover:brightness-110 active:scale-95"
              style={{ background: "#4ADE80" }}
            >
              Понятно
            </button>
          </div>
        </div>

        {/* Bottom glow */}
        <div className="absolute bottom-0 inset-x-0 h-px"
          style={{ background: "linear-gradient(90deg,transparent,rgba(74,222,128,0.2),transparent)" }} />
      </div>
    </div>
  );
}
