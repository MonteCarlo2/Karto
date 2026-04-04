"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { createBrowserClient } from "@/lib/supabase/client";
import { triggerDownloadFromRemoteUrl } from "@/lib/client/media-download";
import { useToast } from "@/components/ui/toast";
import { 
  Download,
  Loader2,
  Sparkles,
  X,
  Box,
  Home,
  ZoomIn,
  Hand,
  ArrowRight,
  Image as ImageIcon,
  User,
  LogOut,
  Heart,
  Upload,
  ChevronDown,
  Plus,
  Wrench,
  Copy,
  Camera,
  Layers,
  Video,
} from "lucide-react";
import { BugReportModal } from "@/components/ui/bug-report-modal";
import {
  VideoGenerationGuideModal,
  VideoGenerationGuideTrigger,
} from "@/components/studio/video-generation-guide-modal";
import {
  PhotoGenerationGuideModal,
  PhotoGenerationGuideTrigger,
} from "@/components/studio/photo-generation-guide-modal";
import { GuidePointerOverlay } from "@/components/studio/guide-pointer-overlay";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import {
  computeFreeVideoTokenCost,
  computeProductVideoTokenCost,
} from "@/lib/video-token-pricing";

/** Для галереи: превью с нашего API — запрашиваем уменьшенную версию для быстрой загрузки. */
function galleryImageUrl(url: string): string {
  if (typeof url !== "string" || !url.includes("/api/serve-file")) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}w=400`;
}

const LS_VIDEO_GUIDE_POINTER = "karto_dismiss_video_guide_pointer_v1";
const LS_PHOTO_GUIDE_POINTER = "karto_dismiss_photo_guide_pointer_v1";

/** Анимация генерации — органические пятна как краска (без мерцания) */
function VideoGeneratingCard({
  aspectRatio = "9:16",
  cardWidth = 320,
}: {
  aspectRatio?: string;
  cardWidth?: number;
}) {
  const fontPx = Math.max(11, Math.round((cardWidth || 320) / 28));
  return (
    <div className="w-full h-full rounded-xl overflow-hidden relative flex flex-col items-end justify-end"
      style={{ background: "#2e2e30" }}>
      <style>{`
        /* Пятна медленно двигаются — БЕЗ изменения opacity (нет мерцания!) */
        @keyframes cowA {
          0%   { transform: translate(0%,   0%)   rotate(0deg)   scale(1.0); }
          20%  { transform: translate(22%,  -18%) rotate(25deg)  scale(1.2); }
          40%  { transform: translate(-8%,  30%)  rotate(-15deg) scale(0.85);}
          60%  { transform: translate(35%,  15%)  rotate(40deg)  scale(1.15);}
          80%  { transform: translate(-20%, -5%)  rotate(-10deg) scale(1.05);}
          100% { transform: translate(0%,   0%)   rotate(0deg)   scale(1.0); }
        }
        @keyframes cowB {
          0%   { transform: translate(0%,   0%)   rotate(0deg)   scale(1.1); }
          25%  { transform: translate(-28%, 20%)  rotate(-30deg) scale(0.9); }
          50%  { transform: translate(18%,  -25%) rotate(20deg)  scale(1.25);}
          75%  { transform: translate(-10%, 35%)  rotate(-5deg)  scale(0.95);}
          100% { transform: translate(0%,   0%)   rotate(0deg)   scale(1.1); }
        }
        @keyframes cowC {
          0%   { transform: translate(0%,   0%)   rotate(0deg)   scale(0.9); }
          30%  { transform: translate(30%,  25%)  rotate(35deg)  scale(1.2); }
          55%  { transform: translate(-15%, -20%) rotate(-20deg) scale(1.0); }
          80%  { transform: translate(20%,  -10%) rotate(15deg)  scale(1.15);}
          100% { transform: translate(0%,   0%)   rotate(0deg)   scale(0.9); }
        }
        @keyframes cowD {
          0%   { transform: translate(0%,   0%)   rotate(0deg)   scale(1.3); }
          35%  { transform: translate(-25%, -30%) rotate(-40deg) scale(0.8); }
          65%  { transform: translate(15%,  20%)  rotate(30deg)  scale(1.1); }
          100% { transform: translate(0%,   0%)   rotate(0deg)   scale(1.3); }
        }
        @keyframes cowE {
          0%   { transform: translate(0%,   0%)   rotate(0deg)   scale(1.0); }
          28%  { transform: translate(20%,  30%)  rotate(-25deg) scale(1.2); }
          56%  { transform: translate(-30%, 5%)   rotate(15deg)  scale(0.85);}
          84%  { transform: translate(10%,  -28%) rotate(-35deg) scale(1.1); }
          100% { transform: translate(0%,   0%)   rotate(0deg)   scale(1.0); }
        }
      `}</style>

      {/* Органические пятна: 2 тёмных + 3 светлых → ~40% белый / 60% серый */}
      <div className="absolute inset-0 pointer-events-none" style={{ overflow: "hidden" }}>
        {/* Белое пятно 1 — верх-лево, крупное */}
        <div style={{
          position:"absolute", top:"-20%", left:"-10%",
          width:"80%", height:"80%",
          background:"radial-gradient(ellipse 65% 55% at 50% 50%, rgba(255,255,255,0.72) 0%, rgba(220,220,220,0.28) 45%, transparent 70%)",
          filter:"blur(40px)",
          animation:"cowA 14.3s ease-in-out infinite",
          animationDelay:"0s",
        }}/>
        {/* Белое пятно 2 — нижний центр */}
        <div style={{
          position:"absolute", bottom:"-15%", left:"5%",
          width:"85%", height:"70%",
          background:"radial-gradient(ellipse 70% 55% at 50% 45%, rgba(255,255,255,0.65) 0%, rgba(210,210,210,0.22) 50%, transparent 70%)",
          filter:"blur(44px)",
          animation:"cowC 17.1s ease-in-out infinite",
          animationDelay:"0.9s",
        }}/>
        {/* Белое пятно 3 — нижний-право */}
        <div style={{
          position:"absolute", bottom:"-10%", right:"-5%",
          width:"65%", height:"60%",
          background:"radial-gradient(ellipse 60% 50% at 50% 50%, rgba(255,255,255,0.6) 0%, rgba(200,200,200,0.18) 50%, transparent 70%)",
          filter:"blur(42px)",
          animation:"cowE 9.8s ease-in-out infinite",
          animationDelay:"1.5s",
        }}/>
        {/* Тёмное пятно 1 — центр-право */}
        <div style={{
          position:"absolute", top:"15%", right:"-15%",
          width:"65%", height:"65%",
          background:"radial-gradient(ellipse 60% 65% at 45% 50%, rgba(28,28,30,0.75) 0%, rgba(46,46,48,0.32) 40%, transparent 70%)",
          filter:"blur(38px)",
          animation:"cowB 11.7s ease-in-out infinite",
          animationDelay:"2.1s",
        }}/>
        {/* Тёмное пятно 2 — верх-право */}
        <div style={{
          position:"absolute", top:"-10%", right:"-5%",
          width:"50%", height:"55%",
          background:"radial-gradient(ellipse 55% 60% at 50% 50%, rgba(20,20,22,0.7) 0%, rgba(38,38,40,0.22) 45%, transparent 70%)",
          filter:"blur(36px)",
          animation:"cowD 13.5s ease-in-out infinite",
          animationDelay:"4.3s",
        }}/>
      </div>

      {/* Текст снизу */}
      <div className="relative z-10 p-4 w-full">
        <p
          className="font-semibold text-white/40 tracking-widest uppercase"
          style={{ fontSize: `${fontPx}px` }}
        >
          Генерация видео...
        </p>
      </div>
    </div>
  );
}

/** Минималистичный стеклянный видеоплеер */
function VideoPlayer({ src, className }: { src: string; className?: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const progressRef = useRef<HTMLDivElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fmt = (s: number) => {
    if (!isFinite(s) || isNaN(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const resetHideTimer = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setHovered(true);
    hideTimer.current = setTimeout(() => setHovered(false), 2500);
  };

  const togglePlay = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play(); setPlaying(true); }
    else { v.pause(); setPlaying(false); }
    resetHideTimer();
  };

  const handleTimeUpdate = () => {
    const v = videoRef.current;
    if (!v) return;
    setCurrentTime(v.currentTime);
    setProgress(v.duration ? (v.currentTime / v.duration) * 100 : 0);
  };

  const seekTo = (e: React.MouseEvent<HTMLDivElement>) => {
    const v = videoRef.current;
    const bar = progressRef.current;
    if (!v || !bar) return;
    const rect = bar.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    v.currentTime = pct * v.duration;
    setProgress(pct * 100);
    resetHideTimer();
  };

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  };

  const changeSpeed = (e: React.MouseEvent, s: number) => {
    e.stopPropagation();
    const v = videoRef.current;
    if (!v) return;
    v.playbackRate = s;
    setSpeed(s);
  };

  const handleFullscreen = (e: React.MouseEvent) => {
    e.stopPropagation();
    const container = containerRef.current;
    if (!container) return;
    document.fullscreenElement ? document.exitFullscreen() : container.requestFullscreen();
  };

  // Контролы видны ТОЛЬКО при наведении мыши
  const showControls = hovered;
  const speeds = [0.5, 1, 1.5, 2];

  return (
    <div
      ref={containerRef}
      className={`relative bg-black rounded-xl overflow-hidden select-none cursor-pointer ${className ?? ""}`}
      style={isFullscreen ? { display: "flex", alignItems: "center", justifyContent: "center" } : {}}
      onMouseMove={resetHideTimer}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { if (playing) setHovered(false); }}
      onClick={togglePlay}
    >
      {/* Видео */}
      <video
        ref={videoRef}
        src={src}
        className="w-full h-full block"
        style={{ objectFit: isFullscreen ? "contain" : "cover" }}
        onTimeUpdate={handleTimeUpdate}
        onEnded={() => { setPlaying(false); setHovered(true); }}
        playsInline
        preload="metadata"
      />

      {/* Центральная кнопка play (только при паузе/остановке) */}
      {!playing && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <svg className="w-14 h-14 text-white drop-shadow-2xl" viewBox="0 0 24 24" fill="currentColor"
            style={{ filter: "drop-shadow(0 2px 12px rgba(0,0,0,0.7))" }}>
            <path d="M8 5v14l11-7z"/>
          </svg>
        </div>
      )}

      {/* Нижняя стеклянная панель (показывается при hover или при паузе+hover) */}
      <div
        className={`absolute bottom-0 left-0 right-0 px-3 pb-3 pt-8 transition-all duration-300 group/prog ${showControls ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        style={{ background: "linear-gradient(to top, rgba(0,0,0,0.65) 0%, transparent 100%)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Прогресс-бар — широкая кликабельная зона поверх тонкой линии */}
        <div
          ref={progressRef}
          className="w-full cursor-pointer mb-2 relative flex items-center"
          style={{ height: "16px" }}
          onClick={seekTo}
        >
          {/* Визуальная линия */}
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1 bg-white/25 rounded-full">
            <div className="h-full bg-white rounded-full" style={{ width: `${progress}%` }} />
          </div>
          {/* Ручка */}
          <div
            className="absolute top-1/2 w-3.5 h-3.5 -translate-y-1/2 bg-white rounded-full shadow-md z-10 opacity-0 group-hover/prog:opacity-100 transition-opacity"
            style={{ left: `calc(${progress}% - 7px)` }}
          />
        </div>

        {/* Стеклянная панель контролов */}
        <div
          className="flex items-center gap-1 px-2 py-1.5 rounded-xl"
          style={{
            background: "rgba(255,255,255,0.1)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            border: "1px solid rgba(255,255,255,0.18)",
            boxShadow: "0 2px 16px rgba(0,0,0,0.25)",
          }}
        >
          {/* Play/Pause */}
          <button
            onClick={togglePlay}
            className="w-6 h-6 flex items-center justify-center text-white hover:text-white/70 transition-colors"
          >
            {playing ? (
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z"/>
              </svg>
            )}
          </button>

          {/* Текущее время */}
          <span className="text-[10px] text-white/70 font-mono tabular-nums min-w-[30px] text-center">{fmt(currentTime)}</span>

          <div className="flex-1" />

          {/* Скорость */}
          <div className="flex items-center gap-0.5">
            {speeds.map((s) => (
              <button
                key={s}
                onClick={(e) => changeSpeed(e, s)}
                className={`px-1 py-0.5 text-[9px] font-bold rounded transition-all ${
                  speed === s ? "text-white" : "text-white/35 hover:text-white/70"
                }`}
              >
                {s}x
              </button>
            ))}
          </div>

          {/* Mute */}
          <button
            onClick={toggleMute}
            className="w-6 h-6 flex items-center justify-center text-white/60 hover:text-white transition-colors"
          >
            {muted ? (
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3.63 3.63a1 1 0 000 1.41L7.29 8.7 7 9H4a1 1 0 00-1 1v4a1 1 0 001 1h3l3.29 3.29c.63.63 1.71.18 1.71-.71v-4.17l4.18 4.18c-.49.37-1.02.68-1.6.91-.36.15-.58.53-.58.92 0 .72.73 1.18 1.39.91a7.98 7.98 0 002.19-1.25l1.85 1.85a1 1 0 001.41-1.41L5.05 3.63a1 1 0 00-1.42 0zM12 4L9.91 6.09 12 8.18V4z"/>
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
              </svg>
            )}
          </button>

          {/* Fullscreen */}
          <button
            onClick={handleFullscreen}
            className="w-6 h-6 flex items-center justify-center text-white/60 hover:text-white transition-colors"
          >
            {isFullscreen ? (
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/>
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// Анимация загрузки для слайдов
function LoadingDotsCardSlide({ aspectRatio }: { aspectRatio: "3:4" | "4:3" | "9:16" | "1:1" }) {
  const gridCols = 12;
  const gridRows = aspectRatio === "3:4" ? 16 
    : aspectRatio === "4:3" ? 12
    : aspectRatio === "9:16" ? 20
    : 12;
  const totalDots = gridCols * gridRows;
  const cardColor = "#000000";

  const aspectRatioValue = aspectRatio === "3:4" ? "3 / 4" 
    : aspectRatio === "4:3" ? "4 / 3"
    : aspectRatio === "9:16" ? "9 / 16" 
    : "1 / 1";
  
  return (
    <div
      className="relative rounded-lg overflow-hidden bg-white flex items-center justify-center border-2 border-gray-200 w-full h-full"
      style={{ 
        aspectRatio: aspectRatioValue,
        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.08)",
      }}
    >
      <div 
        className="absolute inset-0 grid p-4"
        style={{
          gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
          gridTemplateRows: `repeat(${gridRows}, 1fr)`,
          gap: "4px",
        }}
      >
        {Array.from({ length: totalDots }).map((_, index) => {
          const delay = (index * 0.05) % 2;
          const duration = 1 + (index % 3) * 0.3;
          
          return (
            <div
              key={index}
              className="rounded-full"
              style={{
                backgroundColor: cardColor,
                width: "4px",
                height: "4px",
                justifySelf: "center",
                alignSelf: "center",
                animation: `pulse-dot ${duration}s ease-in-out ${delay}s infinite`,
                willChange: "opacity, transform",
              }}
            />
          );
        })}
      </div>
      
      <style jsx>{`
        @keyframes pulse-dot {
          0%, 100% {
            opacity: 0.2;
            transform: scale(0.7);
          }
          50% {
            opacity: 1;
            transform: scale(1.3);
          }
        }
      `}</style>
    </div>
  );
}

export default function FreeGeneration() {
  const router = useRouter();
  const { showToast } = useToast();
  
  // Состояние для слайдов
  // Варианты теперь хранят и URL, и aspectRatio, и исходный промпт для каждого изображения
  type Variant = {
    url: string;
    aspectRatio: "3:4" | "4:3" | "9:16" | "1:1" | "16:9" | "21:9";
    prompt?: string | null;
    mediaType?: "image" | "video";
  };
  type Slide = {
    id: number;
    imageUrl: string | null;
    variants: Variant[];
    prompt: string | null;
    scenario: string | null;
    aspectRatio: "3:4" | "4:3" | "9:16" | "1:1" | "16:9" | "21:9";
    pendingVideoTaskId?: string;
    pendingVideoError?: string;
    pendingVideoAspect?: string;
    pendingVideoGenerationMode?: "free" | "for-product";
  };
  const [slides, setSlides] = useState<Slide[]>([]);
  const [activeSlideId, setActiveSlideId] = useState<number | null>(null);
  const [slidePrompt, setSlidePrompt] = useState("");
  const [selectedScenario, setSelectedScenario] = useState<string | null>(null);
  const [slideAspectRatio, setSlideAspectRatio] = useState<"3:4" | "4:3" | "9:16" | "1:1">("3:4");
  const [isGeneratingSlide, setIsGeneratingSlide] = useState(false);
  // Отдельный флаг для запуска видео-задачи (не блокирует ленту)
  const [isVideoStarting, setIsVideoStarting] = useState(false);
  const [viewingImage, setViewingImage] = useState<string | null>(null);
  const [viewingPrompt, setViewingPrompt] = useState<string | null>(null);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  
  // Состояние для левой панели и режимов
  const [activeLibraryTab, setActiveLibraryTab] = useState<"my-creativity" | "favorites">("my-creativity");
  const [favoriteImages, setFavoriteImages] = useState<string[]>([]);
  // Инициализируем из localStorage — чтобы режим сохранялся после перезагрузки
  // Важно: не читаем localStorage во время SSR/первого рендера, чтобы не ловить hydration-mismatch.
  // Читаем localStorage после mount.
  const [generationMode, setGenerationModeRaw] = useState<"free" | "for-product">("free");
  const [mediaMode, setMediaModeRaw] = useState<"photo" | "video">("photo");

  // Обёртки, сохраняющие в localStorage при каждом изменении
  const setGenerationMode = (v: "free" | "for-product") => {
    localStorage.setItem("karto_generationMode", v);
    setGenerationModeRaw(v);
  };
  const setMediaMode = (v: "photo" | "video") => {
    localStorage.setItem("karto_mediaMode", v);
    setMediaModeRaw(v);
  };

  // Загрузка persisted режимов после первого mount (без SSR mismatch)
  useEffect(() => {
    try {
      const savedGen = localStorage.getItem("karto_generationMode");
      setGenerationModeRaw(savedGen === "for-product" ? "for-product" : "free");

      const savedMedia = localStorage.getItem("karto_mediaMode");
      setMediaModeRaw(savedMedia === "video" ? "video" : "photo");
    } catch {
      // no-op: localStorage может быть недоступен
    }
  }, []);

  // Видео-настройки (только UI, без подключения к генерации)
  const [videoMode, setVideoMode] = useState<"standard" | "pro" | "sync">("standard");
  const [videoParamsOpen, setVideoParamsOpen] = useState(false);
  const [videoModeOpen, setVideoModeOpen] = useState(false);
  const [videoModelSubmenuOpen, setVideoModelSubmenuOpen] = useState(false);
  const [videoDuration, setVideoDuration] = useState<"4s" | "5s" | "8s" | "10s" | "12s" | null>("4s");
  const [videoQuality, setVideoQuality] = useState<"480p" | "720p" | "1080p">("720p");
  const [videoAspect, setVideoAspect] = useState<"1:1" | "21:9" | "4:3" | "3:4" | "16:9" | "9:16">("9:16");
  const [videoSoundOn, setVideoSoundOn] = useState(false);
  const [videoFixedLens, setVideoFixedLens] = useState(false);
  const [videoInfographicsOn, setVideoInfographicsOn] = useState(false);
  const [videoStaticCameraOn, setVideoStaticCameraOn] = useState(true);

  // Референсные изображения для режима "Свободная" (до 14 штук)
  const [referenceImages, setReferenceImages] = useState<string[]>([]);

  // Motion Control (Синхрон) — reference image + reference video обязательны
  const [motionControlVideoDataUrl, setMotionControlVideoDataUrl] = useState<string | null>(null);
  const [motionControlVideoPreviewUrl, setMotionControlVideoPreviewUrl] = useState<string | null>(null);
  const [motionControlVideoDurationSec, setMotionControlVideoDurationSec] = useState<number | null>(null);
  const [syncCharacterOrientation, setSyncCharacterOrientation] = useState<"image" | "video">("video");

  const freeVideoTokenEstimate = useMemo(() => {
    if (generationMode !== "free" || mediaMode !== "video") return null;
    const durationMapStandard: Record<string, number> = { "4s": 4, "8s": 8, "12s": 12 };
    const durationMapPro: Record<string, number> = { "5s": 5, "10s": 10 };
    const durationNum =
      videoMode === "pro"
        ? (videoDuration && durationMapPro[videoDuration]) || 5
        : (videoDuration && durationMapStandard[videoDuration || "4s"]) || 4;
    return computeFreeVideoTokenCost({
      videoMode,
      resolution: videoQuality,
      durationSec: videoMode === "sync" ? 0 : durationNum,
      generateAudio: videoSoundOn,
      referenceVideoDurationSec:
        videoMode === "sync" ? motionControlVideoDurationSec ?? 0 : undefined,
    });
  }, [
    generationMode,
    mediaMode,
    videoMode,
    videoQuality,
    videoDuration,
    videoSoundOn,
    motionControlVideoDurationSec,
  ]);

  const productVideoTokenEstimate = useMemo(() => {
    if (generationMode !== "for-product" || mediaMode !== "video") return null;
    const d = videoDuration === "10s" ? 10 : 5;
    return computeProductVideoTokenCost({
      resolution: "1080p",
      durationSec: d,
      generateAudio: false,
    });
  }, [generationMode, mediaMode, videoDuration]);

  // Persist settings + references for Free Video mode.
  // - reference images: localStorage
  // - reference video (sync/motion-control): IndexedDB (base64 слишком большой для localStorage)
  const LOCAL_KEYS = {
    videoMode: "karto_videoMode",
    videoDuration: "karto_videoDuration",
    videoQuality: "karto_videoQuality",
    videoAspect: "karto_videoAspect",
    videoSoundOn: "karto_videoSoundOn",
    videoFixedLens: "karto_videoFixedLens",
    videoInfographicsOn: "karto_videoInfographicsOn",
    videoStaticCameraOn: "karto_videoStaticCameraOn",
    syncCharacterOrientation: "karto_syncCharacterOrientation",
    referenceImages: "karto_referenceImages",
    motionControlVideoDurationSec: "karto_motionControlVideoDurationSec",
  } as const;

  const MOTION_DB = "karto_motion_control_db";
  const MOTION_STORE = "motion_refs";
  const MOTION_KEY = "motionControlReferenceVideo";

  const openMotionDb = async (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
      try {
        const req = indexedDB.open(MOTION_DB, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(MOTION_STORE)) {
            db.createObjectStore(MOTION_STORE);
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      } catch (e) {
        reject(e);
      }
    });
  };

  const motionDbPut = async (blob: Blob): Promise<void> => {
    const db = await openMotionDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(MOTION_STORE, "readwrite");
      tx.objectStore(MOTION_STORE).put(blob, MOTION_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  };

  const motionDbGet = async (): Promise<Blob | null> => {
    const db = await openMotionDb();
    return await new Promise<Blob | null>((resolve, reject) => {
      const tx = db.transaction(MOTION_STORE, "readonly");
      const req = tx.objectStore(MOTION_STORE).get(MOTION_KEY);
      req.onsuccess = () => resolve((req.result as Blob) ?? null);
      req.onerror = () => reject(req.error);
    });
  };

  const motionDbDelete = async (): Promise<void> => {
    const db = await openMotionDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(MOTION_STORE, "readwrite");
      tx.objectStore(MOTION_STORE).delete(MOTION_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  };

  // Restore persisted Free-Video settings/references (no SSR mismatch).
  useEffect(() => {
    try {
      const savedVideoMode = localStorage.getItem(LOCAL_KEYS.videoMode);
      if (savedVideoMode === "avatar") {
        // Режим «Аватар» убран из продукта — мигрируем на Стандарт.
        setVideoMode("standard");
        try {
          localStorage.setItem(LOCAL_KEYS.videoMode, "standard");
        } catch {
          /* ignore */
        }
      } else if (
        savedVideoMode === "standard" ||
        savedVideoMode === "pro" ||
        savedVideoMode === "sync"
      ) {
        setVideoMode(savedVideoMode);
      }

      const savedVideoDuration = localStorage.getItem(LOCAL_KEYS.videoDuration);
      if (savedVideoDuration === "null") {
        setVideoDuration(null);
      } else if (
        savedVideoDuration === "4s" ||
        savedVideoDuration === "5s" ||
        savedVideoDuration === "8s" ||
        savedVideoDuration === "10s" ||
        savedVideoDuration === "12s"
      ) {
        setVideoDuration(savedVideoDuration);
      }

      const savedVideoQuality = localStorage.getItem(LOCAL_KEYS.videoQuality);
      if (
        savedVideoQuality === "480p" ||
        savedVideoQuality === "720p" ||
        savedVideoQuality === "1080p"
      ) {
        setVideoQuality(savedVideoQuality);
      }

      const savedVideoAspect = localStorage.getItem(LOCAL_KEYS.videoAspect);
      if (
        savedVideoAspect === "1:1" ||
        savedVideoAspect === "21:9" ||
        savedVideoAspect === "4:3" ||
        savedVideoAspect === "3:4" ||
        savedVideoAspect === "16:9" ||
        savedVideoAspect === "9:16"
      ) {
        setVideoAspect(savedVideoAspect);
      }

      const savedVideoSoundOn = localStorage.getItem(LOCAL_KEYS.videoSoundOn);
      if (savedVideoSoundOn === "true") setVideoSoundOn(true);
      if (savedVideoSoundOn === "false") setVideoSoundOn(false);

      const savedVideoFixedLens = localStorage.getItem(LOCAL_KEYS.videoFixedLens);
      if (savedVideoFixedLens === "true") setVideoFixedLens(true);
      if (savedVideoFixedLens === "false") setVideoFixedLens(false);

      const savedVideoInfographicsOn = localStorage.getItem(
        LOCAL_KEYS.videoInfographicsOn
      );
      if (savedVideoInfographicsOn === "true") setVideoInfographicsOn(true);
      if (savedVideoInfographicsOn === "false") setVideoInfographicsOn(false);

      const savedVideoStaticCameraOn = localStorage.getItem(
        LOCAL_KEYS.videoStaticCameraOn
      );
      if (savedVideoStaticCameraOn === "true") setVideoStaticCameraOn(true);
      if (savedVideoStaticCameraOn === "false") setVideoStaticCameraOn(false);

      const savedSyncOrientation = localStorage.getItem(
        LOCAL_KEYS.syncCharacterOrientation
      );
      if (savedSyncOrientation === "image") {
        setSyncCharacterOrientation("image");
      } else if (savedSyncOrientation === "video") {
        setSyncCharacterOrientation("video");
      }

      const savedRefsRaw = localStorage.getItem(LOCAL_KEYS.referenceImages);
      if (savedRefsRaw) {
        const parsed = JSON.parse(savedRefsRaw);
        if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string")) {
          setReferenceImages(parsed);
        }
      }

      const savedMotionDurRaw = localStorage.getItem(
        LOCAL_KEYS.motionControlVideoDurationSec
      );
      if (savedMotionDurRaw) {
        const n = Number(savedMotionDurRaw);
        if (Number.isFinite(n)) setMotionControlVideoDurationSec(n);
      }
    } catch {
      // no-op
    }

    // Restore sync/motion reference video (if stored).
    void (async () => {
      try {
        const blob = await motionDbGet();
        if (!blob) return;
        const previewUrl = URL.createObjectURL(blob);
        setMotionControlVideoPreviewUrl(previewUrl);

        const reader = new FileReader();
        reader.onload = () => {
          setMotionControlVideoDataUrl(String(reader.result ?? ""));
        };
        reader.onerror = () => {
          setMotionControlVideoDataUrl(null);
        };
        reader.readAsDataURL(blob);
      } catch {
        // no-op
      }
    })();
  }, []);

  // Autosave settings + reference images.
  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_KEYS.videoMode, videoMode);
      localStorage.setItem(
        LOCAL_KEYS.videoDuration,
        videoDuration === null ? "null" : videoDuration
      );
      localStorage.setItem(LOCAL_KEYS.videoQuality, videoQuality);
      localStorage.setItem(LOCAL_KEYS.videoAspect, videoAspect);
      localStorage.setItem(
        LOCAL_KEYS.videoSoundOn,
        videoSoundOn ? "true" : "false"
      );
      localStorage.setItem(
        LOCAL_KEYS.videoFixedLens,
        videoFixedLens ? "true" : "false"
      );
      localStorage.setItem(
        LOCAL_KEYS.videoInfographicsOn,
        videoInfographicsOn ? "true" : "false"
      );
      localStorage.setItem(
        LOCAL_KEYS.videoStaticCameraOn,
        videoStaticCameraOn ? "true" : "false"
      );
      localStorage.setItem(
        LOCAL_KEYS.syncCharacterOrientation,
        syncCharacterOrientation
      );
      localStorage.setItem(
        LOCAL_KEYS.referenceImages,
        JSON.stringify(referenceImages)
      );
      localStorage.setItem(
        LOCAL_KEYS.motionControlVideoDurationSec,
        motionControlVideoDurationSec === null
          ? ""
          : String(motionControlVideoDurationSec)
      );
    } catch {
      // localStorage can fail (quota/private mode). In that case we still
      // preserve the reference video via IndexedDB and don't block UI.
    }
  }, [
    videoMode,
    videoDuration,
    videoQuality,
    videoAspect,
    videoSoundOn,
    videoFixedLens,
    videoInfographicsOn,
    videoStaticCameraOn,
    syncCharacterOrientation,
    referenceImages,
    motionControlVideoDurationSec,
  ]);
  
  // Состояние для загрузки фото товара
  const [productPhoto, setProductPhoto] = useState<File | null>(null);
  const [productPhotoPreview, setProductPhotoPreview] = useState<string | null>(null);
  
  // Состояние для профиля
  const [user, setUser] = useState<any>(null);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [creativeQuota, setCreativeQuota] = useState<{
    used: number;
    remaining: number;
    limit: number;
  } | null>(null);
  /** Видео-токены (только списание на видео) */
  const [videoTokenBalance, setVideoTokenBalance] = useState<number>(0);
  /** «Потолок» капсулы: сумма начисленных покупками токенов (как лимит у фото); для высоты fill */
  const [videoTokenCap, setVideoTokenCap] = useState<number>(0);
  const [hasLoadedFeed, setHasLoadedFeed] = useState(false);
  const [isBugReportOpen, setIsBugReportOpen] = useState(false);
  const [isVideoGuideOpen, setIsVideoGuideOpen] = useState(false);
  const [isPhotoGuideOpen, setIsPhotoGuideOpen] = useState(false);
  /** null — до чтения localStorage (не показываем подсказку, чтобы не мигать для вернувшихся пользователей). */
  const [videoGuidePointerDismissed, setVideoGuidePointerDismissed] = useState<boolean | null>(null);
  const [photoGuidePointerDismissed, setPhotoGuidePointerDismissed] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      setVideoGuidePointerDismissed(localStorage.getItem(LS_VIDEO_GUIDE_POINTER) === "1");
      setPhotoGuidePointerDismissed(localStorage.getItem(LS_PHOTO_GUIDE_POINTER) === "1");
    } catch {
      setVideoGuidePointerDismissed(false);
      setPhotoGuidePointerDismissed(false);
    }
  }, []);

  const dismissVideoGuidePointer = () => {
    try {
      localStorage.setItem(LS_VIDEO_GUIDE_POINTER, "1");
    } catch {
      /* ignore */
    }
    setVideoGuidePointerDismissed(true);
  };
  const dismissPhotoGuidePointer = () => {
    try {
      localStorage.setItem(LS_PHOTO_GUIDE_POINTER, "1");
    } catch {
      /* ignore */
    }
    setPhotoGuidePointerDismissed(true);
  };

  /** Только dev: в консоли вызовите `__kartoResetGuideHints()` чтобы снова увидеть стрелку к инструкции. */
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const w = window as Window & { __kartoResetGuideHints?: () => void };
    w.__kartoResetGuideHints = () => {
      try {
        localStorage.removeItem(LS_VIDEO_GUIDE_POINTER);
        localStorage.removeItem(LS_PHOTO_GUIDE_POINTER);
      } catch {
        /* ignore */
      }
      setVideoGuidePointerDismissed(false);
      setPhotoGuidePointerDismissed(false);
    };
    return () => {
      delete w.__kartoResetGuideHints;
    };
  }, []);

  const feedStorageKey = user?.id ? `karto-feed-${user.id}` : "karto-feed-anon";
  const hasLoadedFeedRef = useRef(false);
  const videoMenuRef = useRef<HTMLDivElement | null>(null);
  // Защита от дублирования: множество уже обработанных taskId
  const processedTaskIdsRef = useRef<Set<string>>(new Set());

  // Сохранение изображения в Supabase через API (service_role на сервере)
  const saveImageToSupabase = async (params: {
    imageUrl: string;
    prompt: string | null;
    aspectRatio: "3:4" | "4:3" | "9:16" | "1:1";
    generationMode: "free" | "for-product";
    scenario: string | null;
  }) => {
    try {
      if (!user?.id) {
        console.warn("⚠️ Пользователь не авторизован, пропускаем сохранение в Supabase");
        return;
      }

      const response = await fetch("/api/free-feed/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          imageUrl: params.imageUrl,
          prompt: params.prompt,
          aspectRatio: params.aspectRatio,
          generationMode: params.generationMode,
          scenario: params.scenario,
          isFavorite: false,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        // Тихая обработка ошибок - не логируем в консоль
      }
    } catch (error: any) {
      // Тихая обработка ошибок - не логируем в консоль
    }
  };

  // Сохранение видео в Supabase через API
  const saveVideoToSupabaseFeed = async (params: {
    videoUrl: string;
    prompt: string | null;
    aspectRatio: string;
    generationMode: "free" | "for-product";
  }) => {
    if (!user?.id) return;
    // Нормализуем aspectRatio — только допустимые значения
    const validRatios = ["3:4", "4:3", "9:16", "1:1", "16:9", "21:9"];
    const safeRatio = validRatios.includes(params.aspectRatio) ? params.aspectRatio : "9:16";
    try {
      const res = await fetch("/api/free-feed/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          imageUrl: null,
          videoUrl: params.videoUrl,
          mediaType: "video",
          prompt: params.prompt,
          aspectRatio: safeRatio,
          generationMode: params.generationMode,
          scenario: null,
          isFavorite: false,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error("[saveVideoToSupabaseFeed] ошибка сохранения:", err);
      }
    } catch (e) {
      console.error("[saveVideoToSupabaseFeed] network error:", e);
    }
  };

  // Поллинг статуса видео-задач — каждые 7 секунд, одна задача = один интервал
  useEffect(() => {
    const pending = slides.filter((s) => s.pendingVideoTaskId);
    if (pending.length === 0) return;

    // Запускаем поллинг только для НОВЫХ задач (ещё не обрабатываемых)
    const timers: { taskId: string; intervalId: ReturnType<typeof setInterval> }[] = [];

    for (const slide of pending) {
      const taskId = slide.pendingVideoTaskId!;

      // Пропускаем уже завершённые
      if (processedTaskIdsRef.current.has(taskId)) continue;

      const slideId = slide.id;

      const intervalId = setInterval(async () => {
        // Двойная проверка — предотвращает race condition
        if (processedTaskIdsRef.current.has(taskId)) {
          clearInterval(intervalId);
          return;
        }

        try {
          const { data: { session } } = await createBrowserClient().auth.getSession();
          const headers: Record<string, string> = { "Content-Type": "application/json" };
          if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`;

          const res = await fetch(`/api/video-status/${taskId}`, { headers });
          const data = await res.json();

          if (data.status === "success" && data.videoUrl) {
            clearInterval(intervalId);
            // Атомарно помечаем как обработанный
            if (processedTaskIdsRef.current.has(taskId)) return;
            processedTaskIdsRef.current.add(taskId);

            // Сохраняем в Supabase — используем свежий userId из сессии (не из замыкания!)
            // Это важно: user из компонентного замыкания может быть null (stale closure)
            const freshUserId = session?.user?.id;
            if (freshUserId) {
              const validRatios = ["3:4", "4:3", "9:16", "1:1", "16:9", "21:9"];
              const safeRatio = slide.pendingVideoAspect && validRatios.includes(slide.pendingVideoAspect)
                ? slide.pendingVideoAspect
                : validRatios.includes(slide.aspectRatio)
                  ? slide.aspectRatio
                  : "9:16";
              const saveGenMode = slide.pendingVideoGenerationMode || "for-product";
              try {
                const saveRes = await fetch("/api/free-feed/save", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    userId: freshUserId,
                    imageUrl: null,
                    videoUrl: data.videoUrl,
                    mediaType: "video",
                    prompt: slide.prompt,
                    aspectRatio: safeRatio,
                    generationMode: saveGenMode,
                    scenario: null,
                    isFavorite: false,
                  }),
                });
                if (!saveRes.ok) {
                    const saveText = await saveRes.text().catch(() => "");
                    let saveJson: any = null;
                    try {
                      saveJson = saveText ? JSON.parse(saveText) : null;
                    } catch {
                      saveJson = null;
                    }
                    // Для воспроизводимости логируем, но НЕ используем console.error,
                    // чтобы Next Dev overlay не подсвечивал это как "Console Error".
                    console.warn("[polling] Ошибка сохранения видео в Supabase:", {
                      status: saveRes.status,
                      body: saveJson ?? saveText,
                    });
                }
              } catch (saveErr) {
                  console.warn("[polling] Network error при сохранении видео:", saveErr);
              }
            } else {
                console.warn("[polling] freshUserId пустой — не удалось сохранить видео");
            }

            // Добавляем видео — только если URL ещё не в вариантах
            setSlides((prev) =>
              prev.map((s) => {
                if (s.id !== slideId) return s;
                // Дедупликация по URL
                if (s.variants.some((v) => v.url === data.videoUrl)) {
                  return { ...s, pendingVideoTaskId: undefined, pendingVideoError: undefined, pendingVideoAspect: undefined, pendingVideoGenerationMode: undefined };
                }
                const validARs: Variant["aspectRatio"][] = ["1:1", "3:4", "4:3", "9:16", "16:9", "21:9"];
                const rawAR = s.pendingVideoAspect || s.aspectRatio;
                const videoVariantAspect: Variant["aspectRatio"] = validARs.includes(rawAR as Variant["aspectRatio"])
                  ? (rawAR as Variant["aspectRatio"])
                  : "9:16";
                return {
                  ...s,
                  pendingVideoTaskId: undefined,
                  pendingVideoError: undefined,
                  pendingVideoAspect: undefined,
                  pendingVideoGenerationMode: undefined,
                  variants: [
                    { url: data.videoUrl, aspectRatio: videoVariantAspect, prompt: s.prompt ?? "", mediaType: "video" as const },
                    ...s.variants,
                  ],
                };
              })
            );

            showToast({ type: "success", message: "Видео сгенерировано и добавлено в ленту!" });
          } else if (data.status === "failed") {
            clearInterval(intervalId);
            processedTaskIdsRef.current.add(taskId);
            setSlides((prev) =>
              prev.map((s) =>
                s.id === slideId
                  ? { ...s, pendingVideoTaskId: undefined, pendingVideoError: data.error || "Не удалось сгенерировать видео" }
                  : s
              )
            );
            showToast({
              type: "error",
              title: "Ошибка видео-генерации",
              message: data.error || "Не удалось сгенерировать видео. Попробуйте ещё раз.",
            });
          }
        } catch (e) {
          console.warn("[polling] Ошибка:", e);
        }
      }, 7000);

      timers.push({ taskId, intervalId });
    }

    return () => timers.forEach(({ intervalId }) => clearInterval(intervalId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slides.map((s) => s.pendingVideoTaskId).join("|")]);

  // Проверка авторизации
  useEffect(() => {
    const checkUser = async () => {
      try {
        const supabase = createBrowserClient();
        const { data: { session } } = await supabase.auth.getSession();
        setUser(session?.user || null);
      } catch (error: any) {
        console.warn("Ошибка проверки сессии:", error);
      }
    };
    checkUser();

    // Подписка на изменения авторизации
    try {
      const supabase = createBrowserClient();
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        setUser(session?.user || null);
      });
      return () => subscription.unsubscribe();
    } catch (error) {
      return () => {};
    }
  }, []);

  // Закрытие меню профиля при клике вне его
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showProfileMenu && !(event.target as Element).closest('.profile-menu-container')) {
        setShowProfileMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showProfileMenu]);

  // Загружаем остаток генераций для "Свободного творчества"
  useEffect(() => {
    if (!user?.id) {
      setCreativeQuota(null);
      return;
    }

    let mounted = true;
    (async () => {
      try {
        const supabase = createBrowserClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token || !mounted) return;

        const response = await fetch("/api/subscription", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!response.ok || !mounted) return;

        const payload = await response.json();
        if (!mounted) return;
        const subscription = payload?.subscription;
        const vt = Number(
          subscription?.videoTokenBalance ?? payload?.videoTokenBalance ?? 0
        );
        setVideoTokenBalance(Number.isFinite(vt) ? Math.max(0, vt) : 0);
        const life = Number(subscription?.videoTokensLifetimePurchased ?? 0);
        const capBase = Number.isFinite(life) && life > 0 ? life : Math.max(0, vt);
        setVideoTokenCap(Math.max(1, capBase, vt));

        if (!subscription || subscription.creativeLimit <= 0) {
          setCreativeQuota({
            used: 0,
            remaining: 0,
            limit: Number(subscription?.creativeLimit || 0),
          });
          return;
        }

        const limit = Math.max(0, Number(subscription.creativeLimit || 0));
        const used = Math.max(0, Math.min(limit, Number(subscription.creativeUsed || 0)));
        setCreativeQuota({
          used,
          remaining: Math.max(0, limit - used),
          limit,
        });
      } catch {
        // Тихая обработка: при ошибке просто не обновляем квоту
      }
    })();

    return () => {
      mounted = false;
    };
  }, [user?.id]);

  const consumeCreativeGeneration = () => {
    setCreativeQuota((prev) => {
      if (!prev || prev.remaining <= 0) return prev;
      const nextRemaining = Math.max(0, prev.remaining - 1);
      const nextUsed = Math.min(prev.limit, prev.used + 1);
      if (prev.remaining > 0 && nextRemaining === 0) {
        setTimeout(() => {
          showToast({
            type: "error",
            title: "Генерации закончились",
            message:
              "Вы израсходовали все доступные генерации в тарифе «Свободное творчество».",
          });
        }, 0);
      }
      return {
        ...prev,
        used: nextUsed,
        remaining: nextRemaining,
      };
    });
  };

  const markCreativeQuotaExhausted = () => {
    setCreativeQuota((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        used: prev.limit,
        remaining: 0,
      };
    });
  };

  // Выход из аккаунта
  const handleLogout = async () => {
    try {
      const supabase = createBrowserClient();
      await supabase.auth.signOut();
      setShowProfileMenu(false);
      router.push("/");
    } catch (error: any) {
      console.error("Ошибка выхода:", error);
    }
  };

  // Обработчик загрузки фото товара
  const handleProductPhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setProductPhoto(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setProductPhotoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Сжимаем референс на клиенте (max 1200px, JPEG), чтобы KIE upload не падал по таймауту
  const compressReferenceFile = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = document.createElement("img");
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const maxW = 1200;
        let w = img.width;
        let h = img.height;
        if (w > maxW) {
          h = Math.round((h * maxW) / w);
          w = maxW;
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas not available"));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        try {
          const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
          resolve(dataUrl);
        } catch (e) {
          reject(e);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Failed to load image"));
      };
      img.src = url;
    });
  };

  // Обработчик загрузки референсных изображений (для режима "Свободная")
  const handleReferenceImagesUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    // Лимит reference-images зависит от режима:
    // - Standard (seedance): максимум 2
    // - Pro (kling): максимум 1
    // - Sync (motion-control): максимум 1
    let maxRef = 4;
    if (generationMode === "free" && mediaMode === "video") {
      maxRef = videoMode === "standard" ? 2 : 1;
    }
    const remainingSlots = maxRef - referenceImages.length;
    if (remainingSlots <= 0) {
      showToast({
        type: "info",
        message:
          maxRef === 2
            ? "Модель поддерживает только 2 изображения!"
            : maxRef === 1
              ? "Модель поддерживает только 1 изображение!"
              : "В этом режиме референсы недоступны.",
      });
      return;
    }

    // Если пользователь выбрал больше допустимого — покажем предупреждение
    if (files.length > remainingSlots) {
      showToast({
        type: "info",
        message:
          maxRef === 2
            ? "Модель поддерживает только 2 изображения!"
            : maxRef === 1
              ? "Модель поддерживает только 1 изображение!"
              : "В этом режиме референсы недоступны.",
      });
    }

    const filesToProcess = files.slice(0, remainingSlots);

    filesToProcess.forEach(async (file) => {
      try {
        const dataUrl = await compressReferenceFile(file);
        setReferenceImages((prev) => {
          if (prev.length >= maxRef) return prev;
          return [...prev, dataUrl];
        });
        showToast({ type: "success", message: "Изображение добавлено в запрос" });
      } catch (err) {
        console.error("Ошибка сжатия референса:", err);
        showToast({ type: "error", message: "Не удалось обработать изображение" });
      }
    });

    e.target.value = "";
  };

  const nearestAspectRatio = (w: number, h: number): typeof videoAspect => {
    const ratio = w / h;
    const candidates: Array<{ ar: typeof videoAspect; val: number }> = [
      { ar: "1:1", val: 1 / 1 },
      { ar: "4:3", val: 4 / 3 },
      { ar: "3:4", val: 3 / 4 },
      { ar: "16:9", val: 16 / 9 },
      { ar: "9:16", val: 9 / 16 },
      { ar: "21:9", val: 21 / 9 },
    ];
    let best = candidates[0].ar;
    let bestDiff = Math.abs(ratio - candidates[0].val);
    for (const c of candidates) {
      const diff = Math.abs(ratio - c.val);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = c.ar;
      }
    }
    return best;
  };

  // Обработчик загрузки reference video (для sync/motion-control)
  const handleMotionControlVideoUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const maxBytes = 100 * 1024 * 1024; // 100MB
    if (file.size > maxBytes) {
      showToast({
        type: "info",
        message: "Максимальный размер video — 100MB.",
      });
      return;
    }

    // Persist reference video across refreshes (without localStorage quotas).
    try {
      await motionDbPut(file);
    } catch {
      // no-op: we still keep in-memory state for current session
    }

    // Сбрасываем прошлое
    if (motionControlVideoPreviewUrl) {
      try {
        URL.revokeObjectURL(motionControlVideoPreviewUrl);
      } catch {
        // ignore
      }
    }
    setMotionControlVideoPreviewUrl(null);
    setMotionControlVideoDataUrl(null);
    setMotionControlVideoDurationSec(null);

    const blobUrl = URL.createObjectURL(file);
    setMotionControlVideoPreviewUrl(blobUrl);

    // 1) Достаём размеры видео и автоматически ставим aspect ratio
    const vid = document.createElement("video");
    vid.src = blobUrl;
    vid.muted = true;
    vid.preload = "metadata";
    vid.onloadedmetadata = () => {
      try {
        const vw = vid.videoWidth;
        const vh = vid.videoHeight;
        if (vw && vh) setVideoAspect(nearestAspectRatio(vw, vh));
        if (typeof vid.duration === "number" && Number.isFinite(vid.duration)) {
          setMotionControlVideoDurationSec(Math.max(0, Math.round(vid.duration)));
        }
      } catch {
        // ignore
      }
    };

    // 2) Читаем видео в dataURL (для бэкенда)
    const reader = new FileReader();
    reader.onload = () => {
      const res = reader.result;
      if (!res || typeof res !== "string") {
        showToast({ type: "error", message: "Видео не удалось прочитать (пустой result)." });
        return;
      }
      // Должен быть data URL: data:<mime>;base64,<...>
      if (!res.startsWith("data:") || !res.includes(";base64,")) {
        showToast({ type: "error", message: "Видео формат не dataURL base64. Попробуйте ещё раз." });
        return;
      }
      setMotionControlVideoDataUrl(res);
    };
    reader.onerror = () => {
      showToast({
        type: "error",
        message: "Не удалось прочитать видео файл.",
      });
    };
    reader.readAsDataURL(file);

    e.target.value = "";
  };

  const handleMotionControlVideoRemove = () => {
    if (motionControlVideoPreviewUrl) {
      try {
        URL.revokeObjectURL(motionControlVideoPreviewUrl);
      } catch {
        // ignore
      }
    }
    void (async () => {
      try {
        await motionDbDelete();
      } catch {
        // no-op
      }
    })();
    setMotionControlVideoPreviewUrl(null);
    setMotionControlVideoDataUrl(null);
    setMotionControlVideoDurationSec(null);
  };

  // Скрываем Footer на этой странице
  useEffect(() => {
    const footer = document.querySelector('footer');
    if (footer) {
      footer.style.display = 'none';
    }
    return () => {
      if (footer) {
        footer.style.display = '';
      }
    };
  }, []);

  // Загружаем ленту из Supabase (основной источник) и localStorage (fallback)
  useEffect(() => {
    if (typeof window === "undefined") return;
    setHasLoadedFeed(false);
    hasLoadedFeedRef.current = false;
    
    const loadFeed = async () => {
      try {
        // Пытаемся загрузить из Supabase, если пользователь авторизован
        // Сначала проверяем, что сессия действительно валидна
        if (user?.id) {
          try {
            // Дополнительная проверка сессии перед запросом
            const supabase = createBrowserClient();
            const { data: { session }, error: sessionError } = await supabase.auth.getSession();
            
            // Если сессия недействительна или отсутствует, НЕ ДЕЛАЕМ ЗАПРОС - используем localStorage
            if (sessionError || !session?.user || !session.user.id || session.user.id !== user.id) {
              // Сессия невалидна - просто переходим к localStorage без запроса
              } else {
              // Делаем запрос только если сессия валидна
              const response = await fetch(`/api/free-feed/list?userId=${user.id}`);
              
              if (response.ok) {
                const result = await response.json();
                // Проверяем, что данные есть и не пустые
                if (result.success && Array.isArray(result.data) && result.data.length > 0) {
                  // Преобразуем данные из Supabase в формат slides
                  const feedItems = result.data;
                  const favoriteUrls: string[] = [];
                  
                  // Группируем по слайдам (один слайд со всеми вариантами)
                  const variants: Variant[] = feedItems
                    .filter((item: any) => item.image_url || item.video_url)
                    .map((item: any) => {
                      // Определяем тип: через media_type или по расширению URL (fallback когда миграция не применена)
                      const rawUrl: string = item.video_url || item.image_url || "";
                      const isVideo =
                        item.media_type === "video" ||
                        /\.(mp4|webm|mov)(\?|$)/i.test(rawUrl) ||
                        rawUrl.includes("/videos/") ||
                        rawUrl.includes("video_url");
                      const url = isVideo ? (item.video_url || item.image_url) : item.image_url;
                      if (item.is_favorite && url) favoriteUrls.push(url);
                      return {
                        url,
                        aspectRatio: item.aspect_ratio || "3:4",
                        prompt: item.prompt || null,
                        mediaType: isVideo ? "video" as const : "image" as const,
                      };
                    });
                  
                  if (variants.length > 0) {
                    const slide = {
                      id: 1,
                      imageUrl: variants[0].url,
                      variants, // Все варианты из Supabase
                      prompt: variants[0].prompt || null,
                      scenario: feedItems[0]?.scenario || null,
                      aspectRatio: variants[0].aspectRatio,
                    };
                    // Устанавливаем данные синхронно
                    setSlides([slide]);
                    setActiveSlideId(1);
                    setFavoriteImages(favoriteUrls);
                    // Устанавливаем hasLoadedFeed после установки всех данных
                    setHasLoadedFeed(true);
                    hasLoadedFeedRef.current = true;
                    return; // Успешно загрузили из Supabase
                  }
                }
              }
            }
          } catch (supabaseError: any) {
            // Тихая обработка ошибок - не логируем в консоль, просто используем localStorage
            // Игнорируем все ошибки при загрузке из Supabase
          }
        }
        
        // Fallback: загружаем из localStorage
        const raw = localStorage.getItem(feedStorageKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed.slides) && parsed.slides.length > 0) {
            setSlides(parsed.slides);
            if (parsed.activeSlideId !== undefined && parsed.activeSlideId !== null) {
              setActiveSlideId(parsed.activeSlideId);
            } else if (parsed.slides[0]?.id) {
              setActiveSlideId(parsed.slides[0].id);
            }
            if (Array.isArray(parsed.favoriteImages)) {
              setFavoriteImages(parsed.favoriteImages);
            }
            setHasLoadedFeed(true);
            hasLoadedFeedRef.current = true;
            return; // Успешно загрузили из localStorage
          }
        }
      } catch (error) {
        console.warn("Не удалось загрузить ленту:", error);
        // Fallback на localStorage при ошибке
        try {
          const raw = localStorage.getItem(feedStorageKey);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed.slides)) {
              setSlides(parsed.slides);
              if (parsed.activeSlideId !== undefined && parsed.activeSlideId !== null) {
                setActiveSlideId(parsed.activeSlideId);
              } else if (parsed.slides[0]?.id) {
                setActiveSlideId(parsed.slides[0].id);
              }
            }
            if (Array.isArray(parsed.favoriteImages)) {
              setFavoriteImages(parsed.favoriteImages);
            }
          }
        } catch (localError) {
          console.warn("Не удалось загрузить из localStorage:", localError);
        }
      } finally {
        setHasLoadedFeed(true);
        hasLoadedFeedRef.current = true;
      }
    };
    
    loadFeed();
  }, [feedStorageKey, user?.id]);

  // Сохраняем ленту и избранное в localStorage
  useEffect(() => {
    if (!hasLoadedFeedRef.current || typeof window === "undefined") return;
    try {
      const payload = {
        slides,
        favoriteImages,
        activeSlideId,
      };
      localStorage.setItem(feedStorageKey, JSON.stringify(payload));
    } catch (error) {
      console.warn("Не удалось сохранить ленту в localStorage:", error);
    }
  }, [slides, favoriteImages, activeSlideId, feedStorageKey]);

  // Создаем первый слайд после загрузки, если лента пустая
  useEffect(() => {
    if (!hasLoadedFeed) return;
    if (slides.length === 0) {
      const firstSlide = {
        id: 1,
        imageUrl: null,
        variants: [],
        prompt: "",
        scenario: null,
        aspectRatio: slideAspectRatio,
      };
      setSlides([firstSlide]);
      setActiveSlideId(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasLoadedFeed]);

  // Закрытие видео-меню по клику вне него
  useEffect(() => {
    if (!videoModeOpen) return;

    const handleOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (videoMenuRef.current && target && !videoMenuRef.current.contains(target)) {
        setVideoModeOpen(false);
        setVideoModelSubmenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside);

    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
    };
  }, [videoModeOpen]);

  // Нормализуем длительность при переключении режимов
  useEffect(() => {
    if (generationMode === "for-product" && mediaMode === "video") {
      if (videoDuration !== "5s" && videoDuration !== "10s") {
        setVideoDuration("5s");
      }
    } else if (generationMode === "free" && mediaMode === "video") {
      // В "Свободной" длительность зависит от видео-модели:
      // - Standard (seedance) => 4/8/12
      // - Pro (kling)      => 5/10
      if (videoMode === "standard") {
        if (videoDuration !== "4s" && videoDuration !== "8s" && videoDuration !== "12s") {
          setVideoDuration("4s");
        }
      } else if (videoMode === "pro") {
        if (videoDuration !== "5s" && videoDuration !== "10s") {
          setVideoDuration("5s");
        }
      } else {
        // sync: длительность не выбирается
      }
    }
  }, [generationMode, mediaMode, videoMode, videoDuration]);

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        backgroundImage: `
          linear-gradient(rgba(0, 0, 0, 0.02) 1px, transparent 1px),
          linear-gradient(90deg, rgba(0, 0, 0, 0.02) 1px, transparent 1px)
        `,
        backgroundSize: "40px 40px",
        backgroundPosition: "0 0",
        backgroundColor: "#F5F5F7",
      }}
      suppressHydrationWarning
    >
      {/* Левая панель */}
      <div className="fixed left-0 top-0 bottom-0 w-72 bg-[#f5f3ef] z-40 flex flex-col border-r border-gray-200">
        {/* Логотип вверху */}
        <Link
          href="/"
          className="px-6 py-6 border-b border-gray-200/50 flex items-center justify-center"
          aria-label="На главную"
        >
          <Image
            src="/logo-flow.png"
            alt="KARTO"
            width={200}
            height={130}
            priority
            unoptimized
            className="h-24 w-auto object-contain"
          />
        </Link>

        {/* Кнопки библиотеки - подняты выше */}
        <div className="px-6 py-6 space-y-2">
          <button
            onClick={() => setActiveLibraryTab("my-creativity")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
              activeLibraryTab === "my-creativity"
                ? "bg-[#1F4E3D] text-white shadow-md"
                : "bg-white text-gray-700 hover:bg-gray-50 border border-gray-200"
            }`}
          >
            <ImageIcon className={`w-5 h-5 ${activeLibraryTab === "my-creativity" ? "text-white" : "text-[#1F4E3D]"}`} />
            <span className="font-medium">Моё творчество</span>
          </button>
          
          <button
            onClick={() => setActiveLibraryTab("favorites")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
              activeLibraryTab === "favorites"
                ? "bg-[#1F4E3D] text-white shadow-md"
                : "bg-white text-gray-700 hover:bg-gray-50 border border-gray-200"
            }`}
          >
            <Heart className={`w-5 h-5 ${activeLibraryTab === "favorites" ? "text-white" : "text-[#1F4E3D]"}`} />
            <span className="font-medium">Избранные</span>
          </button>
        </div>

        {/* Переключатель Формата: Фото / Видео */}
        <div className="px-6 pb-4">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-3 font-semibold">
            Формат
          </div>
          {/* Переключатель с иконками внутри */}
          <div className="flex items-center justify-center">
            <ToggleSwitch
              checked={mediaMode === "video"}
              onChange={(v) => setMediaMode(v ? "video" : "photo")}
            />
          </div>
        </div>

        {/* Заметный разделитель */}
        <div className="px-6 py-4">
          <div className="h-[2px] bg-gradient-to-r from-transparent via-gray-300 to-transparent" />
        </div>

        {/* Режим генерации */}
          <div className="px-6 py-4 flex-1 flex flex-col">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-4 font-semibold">
            Режим генерации
          </div>
          
          {/* Полноценный переключатель с вертикальным toggle */}
          <div className="space-y-3 mb-4">
            <button
              onClick={() => setGenerationMode("free")}
              className={`w-full flex items-center justify-center px-4 py-3 rounded-xl transition-all border-2 ${
                generationMode === "free"
                  ? "bg-[#1F4E3D] text-white border-[#1F4E3D] shadow-md"
                  : "bg-white text-gray-700 border-gray-200 hover:border-gray-300"
              }`}
            >
              <span className="font-medium">Свободная</span>
            </button>
            
            {/* Вертикальный переключатель */}
            <div className="flex items-center justify-center py-2">
              <button
                onClick={() => setGenerationMode(generationMode === "free" ? "for-product" : "free")}
                className={`relative w-6 h-18 rounded-full transition-colors duration-300 shadow-inner overflow-hidden border-0 focus:outline-none focus:ring-0 ${
                  generationMode === "free"
                    ? "bg-[#1F4E3D]"
                    : "bg-[#D1F85A]"
                }`}
                style={{ height: '4.5rem' }}
                role="switch"
                aria-checked={generationMode === "for-product"}
                onMouseDown={(e) => e.preventDefault()}
                suppressHydrationWarning
              >
                <motion.div
                  className="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow-lg"
                  animate={{
                    y: generationMode === "free" ? 0 : 48
                  }}
                  transition={{
                    type: "spring",
                    stiffness: 400,
                    damping: 25
                  }}
                  suppressHydrationWarning
                />
              </button>
            </div>
            
            <button
              onClick={() => setGenerationMode("for-product")}
              className={`w-full flex items-center justify-center px-4 py-3 rounded-xl transition-all border-2 ${
                generationMode === "for-product"
                  ? "bg-[#D1F85A] text-gray-900 border-[#D1F85A] shadow-md"
                  : "bg-white text-gray-700 border-gray-200 hover:border-gray-300"
              }`}
            >
              <span className="font-medium">Для товара</span>
            </button>
          </div>

          {/* Загрузка фото товара - всегда видна, но disabled когда не выбрано */}
          <div className={`bg-white rounded-xl border-2 p-4 transition-all ${
            generationMode === "for-product"
              ? "border-gray-200"
              : "border-gray-200 opacity-50 pointer-events-none"
          }`}>
            {productPhotoPreview ? (
              <div className="space-y-3">
                <div className="relative rounded-lg overflow-hidden bg-gray-50">
                  <img
                    src={productPhotoPreview}
                    alt="Фото товара"
                    className="w-full h-40 object-contain"
                  />
                  <button
                    onClick={() => {
                      setProductPhoto(null);
                      setProductPhotoPreview(null);
                    }}
                    disabled={generationMode !== "for-product"}
                    className="absolute top-2 right-2 p-1.5 bg-white/90 hover:bg-white rounded-lg shadow-md transition-colors disabled:opacity-50"
                  >
                    <X className="w-4 h-4 text-gray-900" />
                  </button>
                </div>
                <p className="text-xs text-gray-500 text-center">Фото товара загружено</p>
              </div>
            ) : (
              <div className="space-y-3">
                <label
                  htmlFor="product-photo-upload-sidebar"
                  className={`flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-lg transition-colors ${
                    generationMode === "for-product"
                      ? "border-gray-300 cursor-pointer hover:border-[#1F4E3D] bg-gray-50"
                      : "border-gray-200 bg-gray-50 cursor-not-allowed"
                  }`}
                >
                  <Upload className={`w-8 h-8 mb-2 ${generationMode === "for-product" ? "text-gray-400" : "text-gray-300"}`} />
                  <span className={`text-sm font-medium ${generationMode === "for-product" ? "text-gray-600" : "text-gray-400"}`}>
                    Загрузить фото
                  </span>
                  <span className={`text-xs mt-1 ${generationMode === "for-product" ? "text-gray-400" : "text-gray-300"}`}>
                    PNG, JPG до 10MB
                  </span>
                </label>
                <input
                  id="product-photo-upload-sidebar"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleProductPhotoUpload}
                  disabled={generationMode !== "for-product"}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {user ? (
        <div className="fixed top-6 right-6 z-50 profile-menu-container flex flex-col items-center gap-3">
          <button
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            className="flex items-center justify-center w-10 h-10 rounded-full border-2 border-[#2E5A43] hover:bg-gray-100 transition-colors"
            aria-label="Профиль"
          >
            <User className="w-5 h-5 text-foreground" />
          </button>
          <AnimatePresence>
            {showProfileMenu && (
              <motion.div
                initial={{ opacity: 0, y: -10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.95 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="absolute right-0 top-full mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50"
              >
                  <Link
                    href="/profile"
                    className="w-full flex items-center gap-2 px-4 py-2 text-left text-gray-700 hover:bg-gray-100 transition-colors"
                    onClick={() => setShowProfileMenu(false)}
                  >
                    <User className="w-4 h-4" />
                    Профиль
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2 px-4 py-2 text-left text-gray-700 hover:bg-gray-100 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    Выйти
                  </button>
              </motion.div>
            )}
          </AnimatePresence>
          <div className="flex flex-row items-end gap-3">
            {creativeQuota && (
              <div
                className="w-fit px-1 py-1"
                style={{
                  background: "transparent",
                  border: "none",
                  boxShadow: "none",
                }}
              >
                <div className="flex flex-col items-center gap-1">
                  <span className="text-[10px] font-semibold tracking-wide uppercase" style={{ color: "rgba(0, 0, 0, 0.55)" }}>
                    Генерации
                  </span>
                  <div
                    className="relative w-7 h-24 rounded-full overflow-hidden"
                    style={{
                      background: "linear-gradient(180deg, rgba(226,232,240,0.9) 0%, rgba(203,213,225,0.65) 100%)",
                      border: "1px solid rgba(15, 23, 42, 0.15)",
                      boxShadow: "inset 0 2px 6px rgba(255,255,255,0.6), inset 0 -4px 10px rgba(15,23,42,0.12)",
                    }}
                  >
                    <div
                      className="absolute inset-x-0 bottom-0 transition-all duration-500"
                      style={{
                        height: `${Math.max(0, Math.min(100, (creativeQuota.remaining / Math.max(1, creativeQuota.limit || 1)) * 100))}%`,
                        background:
                          creativeQuota.remaining > 0
                            ? "linear-gradient(180deg, rgba(74,222,128,0.95) 0%, rgba(46,90,67,0.95) 100%)"
                            : "linear-gradient(180deg, rgba(248,113,113,0.9) 0%, rgba(239,68,68,0.95) 100%)",
                        boxShadow: "inset 0 1px 6px rgba(255,255,255,0.35), 0 0 8px rgba(46,90,67,0.25)",
                      }}
                    />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-[11px] font-bold leading-none" style={{ color: creativeQuota.remaining > 0 ? "#0f172a" : "#7f1d1d" }}>
                        {creativeQuota.remaining}
                      </span>
                    </div>
                  </div>
                  <span className="text-[10px] font-semibold leading-none" style={{ color: "#2E5A43", opacity: 0.9 }}>
                    из {creativeQuota.limit}
                  </span>
                </div>
              </div>
            )}

            <div
              className="w-fit px-1 py-1"
              style={{
                background: "transparent",
                border: "none",
                boxShadow: "none",
              }}
            >
              <div className="flex flex-col items-center gap-1">
                <span className="text-[10px] font-semibold tracking-wide uppercase" style={{ color: "rgba(0, 0, 0, 0.55)" }}>
                  Видео
                </span>
                <div
                  className="relative w-7 h-24 rounded-full overflow-hidden"
                  style={{
                    background: "linear-gradient(180deg, rgba(226,232,240,0.9) 0%, rgba(203,213,225,0.65) 100%)",
                    border: "1px solid rgba(163, 230, 53, 0.35)",
                    boxShadow: "inset 0 2px 6px rgba(255,255,255,0.6), inset 0 -4px 10px rgba(101,163,13,0.15)",
                  }}
                >
                  <div
                    className="absolute inset-x-0 bottom-0 transition-all duration-500"
                    style={{
                      /* Доля от «пакета» (lifetime / текущий баланс как максимум) — полная капсула при полном балансе */
                      height: `${videoTokenBalance <= 0 ? 0 : Math.min(100, Math.round((videoTokenBalance / Math.max(1, videoTokenCap)) * 100))}%`,
                      background:
                        videoTokenBalance > 0
                          ? "linear-gradient(180deg, #D9F99D 0%, #84CC16 55%, #65A30D 100%)"
                          : "linear-gradient(180deg, rgba(248,113,113,0.35) 0%, rgba(239,68,68,0.5) 100%)",
                      boxShadow: "inset 0 1px 6px rgba(255,255,255,0.45), 0 0 10px rgba(132,204,22,0.35)",
                    }}
                  />
                  <div className="absolute inset-0 flex items-center justify-center px-0.5">
                    <span
                      className="text-[10px] font-bold leading-none text-center"
                      style={{ color: videoTokenBalance > 0 ? "#14532d" : "#7f1d1d" }}
                    >
                      {videoTokenBalance > 9999
                        ? `${Math.round(videoTokenBalance / 100) / 10}k`
                        : videoTokenBalance}
                    </span>
                  </div>
                </div>
                <span className="text-[9px] font-semibold leading-none text-center max-w-[4.5rem]" style={{ color: "#4d7c0f", opacity: 0.95 }}>
                  {videoTokenCap > 0
                    ? `из ${videoTokenCap > 9999 ? `${Math.round(videoTokenCap / 100) / 10}k` : videoTokenCap}`
                    : "токены"}
                </span>
              </div>
            </div>
          </div>
          {mediaMode === "video" && (
            <div className="relative flex flex-col items-center">
              <VideoGenerationGuideTrigger
                onOpen={() => {
                  dismissVideoGuidePointer();
                  setIsVideoGuideOpen(true);
                }}
              />
              {videoGuidePointerDismissed === false && (
                <GuidePointerOverlay onDismiss={dismissVideoGuidePointer} />
              )}
            </div>
          )}
          {mediaMode === "photo" && (
            <div className="relative flex flex-col items-center">
              <PhotoGenerationGuideTrigger
                onOpen={() => {
                  dismissPhotoGuidePointer();
                  setIsPhotoGuideOpen(true);
                }}
              />
              {photoGuidePointerDismissed === false && (
                <GuidePointerOverlay onDismiss={dismissPhotoGuidePointer} />
              )}
            </div>
          )}
        </div>
      ) : (
        <Link
          href="/login"
          className="fixed top-6 right-6 z-50 flex items-center justify-center w-10 h-10 rounded-full border-2 border-[#2E5A43] hover:bg-gray-100 transition-colors"
          aria-label="Войти"
        >
          <User className="w-5 h-5 text-foreground" />
        </Link>
      )}

      {/* Центральная область: Canvas с сетчатым фоном */}
      <div
        className="flex-1 flex items-start pt-8 pl-80 pr-10 pb-40 relative overflow-y-auto"
        style={{ background: "transparent" }}
      >
        {activeSlideId !== null && hasLoadedFeed && (() => {
          const activeSlide = slides.find(s => s.id === activeSlideId);
          if (!activeSlide) return null;
          
          // Нормализуем варианты: каждый вариант должен иметь url и aspectRatio
          const allVariants: Variant[] = activeSlide.variants && activeSlide.variants.length > 0
            ? activeSlide.variants.map(v => {
                if (typeof v === 'object' && 'url' in v && 'aspectRatio' in v) {
                  return {
                    url: (v as Variant).url,
                    aspectRatio: (v as Variant).aspectRatio,
                    prompt: (v as Variant).prompt ?? activeSlide.prompt ?? "",
                    mediaType: (v as Variant).mediaType ?? "image",
                  };
                }
                if (typeof v === 'string') {
                  return { url: v, aspectRatio: activeSlide.aspectRatio, prompt: activeSlide.prompt ?? "", mediaType: "image" as const };
                }
                return { url: String(v), aspectRatio: activeSlide.aspectRatio, prompt: activeSlide.prompt ?? "", mediaType: "image" as const };
              })
            : [];
          
          // Фильтруем по избранным, если выбран режим "Избранные"
          const sortedVariants = activeLibraryTab === "favorites"
            ? allVariants.filter(variant => favoriteImages.includes(variant.url))
            : allVariants;
          
          // Плейсхолдерная пропорция для пустого состояния (используем текущий выбор)
          const placeholderAspectRatioValue = slideAspectRatio === "3:4" ? "3 / 4" 
            : slideAspectRatio === "4:3" ? "4 / 3"
            : slideAspectRatio === "9:16" ? "9 / 16" 
            : "1 / 1";

                // Под размер "в ленте" для видео (чтобы разные aspect ratio занимали одинаковую площадь)
                const getVideoCardWidth = (ar: string): number => {
                  const [w, h] = ar.split(":").map(Number);
                  if (!w || !h || Number.isNaN(w) || Number.isNaN(h)) return 400;
                  // Целевую площадь берем из текущего "эталона": 9:16 с шириной 320px
                  // area = width^2 * (H/W) = 320^2 * 16/9
                  const targetArea = 182_044;
                  return Math.max(280, Math.round(Math.sqrt(targetArea * (w / h))));
                };
          
          return (
            <div className="w-full py-8 pl-8">
              <div className="flex flex-wrap gap-4" style={{ maxWidth: '1400px' }}>
                {/* Анимация загрузки показывается ПЕРВОЙ (сверху), так как новое изображение будет первым */}
                {/* Точки-анимация только для фото (не для видео-режима) */}
                {isGeneratingSlide && !(mediaMode === "video" && generationMode === "for-product") && (() => {
                  // Используем текущий выбранный формат для нового генерируемого изображения
                  const loadingAspectRatioValue = slideAspectRatio === "3:4" ? "3 / 4" 
                    : slideAspectRatio === "4:3" ? "4 / 3"
                    : slideAspectRatio === "9:16" ? "9 / 16" 
                    : "1 / 1";
                  
                  // Адаптивные размеры в зависимости от соотношения сторон (как у обычных изображений)
                  let loadingWidth: number;
                  if (slideAspectRatio === "4:3") {
                    loadingWidth = 520; // Горизонтальные - шире
                  } else if (slideAspectRatio === "9:16") {
                    loadingWidth = 320; // Вертикальные - уже, но выше
                  } else if (slideAspectRatio === "3:4") {
                    loadingWidth = 400; // Вертикальные средние
                  } else {
                    loadingWidth = 400; // Квадратные
                  }
                  
                  return (
                    <motion.div
                      key="loading"
                      initial={{ opacity: 0, y: 20, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ 
                        duration: 0.4, 
                        ease: [0.25, 0.1, 0.25, 1],
                        opacity: { duration: 0.3 },
                        scale: { duration: 0.3 }
                      }}
                      className="relative"
                      style={{ 
                        width: `${loadingWidth}px`,
                        aspectRatio: loadingAspectRatioValue
                      }}
                    >
                      <LoadingDotsCardSlide aspectRatio={slideAspectRatio} />
                    </motion.div>
                  );
                })()}
                
                {/* Карточка ожидания видео — шиммер-анимация */}
                {activeSlide.pendingVideoTaskId && (() => {
                  const pendingAR = activeSlide.pendingVideoAspect || "9:16";
                  const [arW, arH] = pendingAR.split(":").map(Number);
                  const videoWidth = getVideoCardWidth(pendingAR);
                  const videoHeight =
                    arW && arH && !Number.isNaN(arW) && !Number.isNaN(arH)
                      ? Math.round(videoWidth * (arH / arW))
                      : Math.round(videoWidth * (16 / 9));
                  return (
                    <motion.div
                      key="video-generating"
                      initial={{ opacity: 0, y: 20, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
                      className="relative flex-shrink-0"
                      style={{ width: `${videoWidth}px`, height: `${videoHeight}px` }}
                    >
                      <VideoGeneratingCard aspectRatio={pendingAR} cardWidth={videoWidth} />
                    </motion.div>
                  );
                })()}

                {/* Карточка ошибки видео-генерации */}
                {activeSlide.pendingVideoError && (
                  <motion.div
                    key="video-error"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="relative flex-shrink-0"
                    style={(() => {
                      const errAR = activeSlide.pendingVideoAspect || "9:16";
                      const [arW, arH] = errAR.split(":").map(Number);
                      const videoWidth = getVideoCardWidth(errAR);
                      const videoHeight =
                        arW && arH && !Number.isNaN(arW) && !Number.isNaN(arH)
                          ? Math.round(videoWidth * (arH / arW))
                          : Math.round(videoWidth * (16 / 9));
                      return { width: `${videoWidth}px`, height: `${videoHeight}px` };
                    })()}
                  >
                    <div className="w-full h-full rounded-xl bg-red-950/30 border border-red-500/20 flex flex-col items-center justify-center gap-3 p-4">
                      <div className="w-12 h-12 rounded-xl bg-red-500/10 flex items-center justify-center">
                        <svg className="w-6 h-6 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                        </svg>
                      </div>
                      <div className="text-center">
                        <p className="text-[12px] font-semibold text-red-400">Ошибка генерации</p>
                        <p className="text-[10px] text-white/30 mt-1">{activeSlide.pendingVideoError}</p>
                      </div>
                      <button
                        className="text-[11px] text-white/40 hover:text-white/70 underline transition-colors"
                        onClick={() => setSlides(prev => prev.map(s => s.id === activeSlide.id ? { ...s, pendingVideoError: undefined } : s))}
                      >
                        Скрыть
                      </button>
                    </div>
                  </motion.div>
                )}

                {sortedVariants.map((variant, index) => {
                  // Универсальный расчёт CSS aspect-ratio из строки "W:H"
                  const arParts = variant.aspectRatio?.split(":").map(Number);
                  const variantAspectRatioValue = (arParts && arParts.length === 2 && !isNaN(arParts[0]) && !isNaN(arParts[1]))
                    ? `${arParts[0]} / ${arParts[1]}`
                    : "1 / 1";
                  
                  // Адаптивные размеры в зависимости от соотношения сторон для компактной мозаики
                  let baseWidth: number;
                  if (variant.mediaType === "video") {
                    baseWidth = getVideoCardWidth(variant.aspectRatio);
                  } else if (variant.aspectRatio === "4:3" || variant.aspectRatio === "16:9") {
                    baseWidth = 520; // Горизонтальные - шире
                  } else if (variant.aspectRatio === "21:9") {
                    baseWidth = 600; // Ультраширокие
                  } else if (variant.aspectRatio === "9:16") {
                    baseWidth = 320; // Вертикальные - уже, но выше
                  } else if (variant.aspectRatio === "3:4") {
                    baseWidth = 400; // Вертикальные средние
                  } else {
                    baseWidth = 400; // Квадратные и прочие
                  }
                  
                  const isFavorite = favoriteImages.includes(variant.url);
                  return (
                    <motion.div
                      key={`${variant.url}-${index}`}
                      initial={{ opacity: 0, y: 20, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ 
                        duration: 0.4, 
                        ease: [0.25, 0.1, 0.25, 1],
                        opacity: { duration: 0.3 },
                        scale: { duration: 0.3 }
                      }}
                      layout
                      className="flex flex-col"
                      style={{ width: `${baseWidth}px` }}
                    >
                      <div
                        className={`relative group ${variant.mediaType === "video" ? "" : "cursor-pointer"}`}
                        style={{ 
                          width: `${baseWidth}px`,
                          aspectRatio: variantAspectRatioValue
                        }}
                        onClick={() => {
                          // Для видео клик обрабатывается внутри VideoPlayer (play/pause)
                          if (variant.mediaType !== "video") {
                            setViewingImage(variant.url);
                            setViewingPrompt(variant.prompt ?? null);
                          }
                        }}
                      >
                      {variant.mediaType === "video" ? (
                        <VideoPlayer src={variant.url} className="w-full h-full rounded-lg" />
                      ) : (
                        <img
                          src={galleryImageUrl(variant.url)}
                          alt={`Вариант ${index + 1}`}
                          className="w-full h-full object-cover rounded-lg"
                          width={baseWidth}
                          height={variant.aspectRatio === "3:4" ? Math.round(baseWidth * 4 / 3) : variant.aspectRatio === "4:3" ? Math.round(baseWidth * 3 / 4) : variant.aspectRatio === "9:16" ? Math.round(baseWidth * 16 / 9) : baseWidth}
                          loading="lazy"
                          decoding="async"
                        />
                      )}
                      
                      {/* Кнопки в правом верхнем углу */}
                      <div className="absolute top-3 right-3 flex items-center gap-2 z-20 opacity-0 group-hover:opacity-100 transition-opacity">
                        {/* Кнопка "Добавить в запрос" - только для режима свободной генерации и изображений */}
                        {generationMode === "free" &&
                          (() => {
                            const maxRef =
                              mediaMode === "video"
                                ? videoMode === "standard"
                                  ? 2
                                  : 1
                                : 4;
                            return referenceImages.length < maxRef && maxRef > 0;
                          })() &&
                          variant.mediaType !== "video" && (
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              // Проверяем, не добавлено ли уже это изображение
                              const isAlreadyAdded = referenceImages.some(img => 
                                img === variant.url || img.includes(variant.url.split('/').pop() || '')
                              );
                              
                              if (isAlreadyAdded) {
                                showToast({
                                  type: "info",
                                  message: "Изображение уже добавлено в запрос",
                                });
                                return;
                              }
                              
                              try {
                                // Для KIE передаем прямой URL референса (без лишней конвертации в base64)
                                setReferenceImages(prev => {
                                  const maxRef =
                                    mediaMode === "video"
                                      ? videoMode === "standard"
                                        ? 2
                                        : 1
                                      : 4;
                                  if (prev.length >= maxRef) return prev;
                                  return [...prev, variant.url];
                                });
                                showToast({
                                  type: "success",
                                  message: "Изображение добавлено в запрос",
                                });
                              } catch (error) {
                                console.error("Ошибка добавления изображения:", error);
                                showToast({
                                  type: "error",
                                  message: "Не удалось добавить изображение",
                                });
                              }
                            }}
                            className="p-2 hover:opacity-80 transition-opacity"
                            title="Добавить в запрос"
                          >
                            <div className="relative">
                              <Plus className="w-5 h-5 text-white drop-shadow-lg" />
                              <ArrowRight className="w-3 h-3 text-white drop-shadow-lg absolute -bottom-0.5 -right-0.5" />
                            </div>
                          </button>
                        )}
                        
                        {/* Кнопка избранного */}
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            const newFavoriteState = !isFavorite;
                            
                            // Обновляем локальное состояние
                            if (newFavoriteState) {
                              setFavoriteImages(prev => [...prev, variant.url]);
                            } else {
                              setFavoriteImages(prev => prev.filter(img => img !== variant.url));
                            }
                            
                            // Обновляем избранное в Supabase через API (service_role на сервере)
                            if (user?.id) {
                              try {
                                await fetch("/api/free-feed/update-favorite", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({
                                    imageUrl: variant.url,
                                    isFavorite: newFavoriteState,
                                    userId: user.id,
                                  }),
                                });
                              } catch {
                                // Сетевые ошибки игнорируем — локальное состояние уже обновлено
                              }
                            }
                          }}
                          className="p-2 hover:opacity-80 transition-opacity"
                          title={isFavorite ? "Убрать из избранного" : "Добавить в избранное"}
                        >
                          <Heart className={`w-5 h-5 ${isFavorite ? "fill-pink-500 text-pink-500" : "text-white drop-shadow-lg"}`} />
                        </button>
                        
                        {/* Кнопка скачивания */}
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            const base = `karto-${variant.mediaType === "video" ? "video" : "slide"}-${Date.now()}`;
                            try {
                              await triggerDownloadFromRemoteUrl({
                                url: variant.url,
                                mediaType: variant.mediaType === "video" ? "video" : "image",
                                filenameBase: base,
                              });
                            } catch (error: unknown) {
                              console.warn("Ошибка скачивания:", error);
                              showToast({
                                type: "error",
                                message:
                                  error instanceof Error
                                    ? error.message
                                    : "Не удалось скачать. Проверьте соединение и попробуйте снова.",
                              });
                            }
                          }}
                          className="p-2 hover:opacity-80 transition-opacity"
                          title={variant.mediaType === "video" ? "Скачать видео" : "Скачать изображение"}
                        >
                          <Download className="w-5 h-5 text-white drop-shadow-lg" />
                        </button>
                      </div>
                    </div>
                    {variant.prompt && variant.prompt.length > 0 && (
                      <div className="mt-3 px-2 group/prompt relative">
                        <p
                          className="text-sm font-semibold text-gray-800 leading-tight line-clamp-2 pr-8 cursor-pointer hover:text-gray-600 transition-colors"
                          style={{
                            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                            letterSpacing: '-0.01em',
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setViewingPrompt(variant.prompt ?? null);
                            if (variant.mediaType !== "video") {
                              setViewingImage(variant.url);
                            }
                          }}
                          title="Нажмите, чтобы читать полностью"
                        >
                          {variant.prompt}
                        </p>
                        {/* Кнопка скопировать */}
                        <button
                          type="button"
                          onClick={async (e) => {
                            e.stopPropagation();
                            try {
                              await navigator.clipboard.writeText(variant.prompt ?? "");
                              showToast({ type: "success", message: "Промпт скопирован" });
                            } catch {
                              showToast({ type: "error", message: "Не удалось скопировать" });
                            }
                          }}
                          className="absolute right-0 top-0 w-7 h-7 rounded-md bg-gray-200/80 hover:bg-gray-300 text-gray-600 flex items-center justify-center opacity-0 group-hover/prompt:opacity-100 transition-opacity"
                          title="Копировать промпт"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                    </motion.div>
                  );
                })}
              </div>
              
              {/* Заглушка показывается ТОЛЬКО если:
                  1. Данные загружены (hasLoadedFeed === true)
                  2. Есть активный слайд
                  3. У активного слайда НЕТ вариантов (variants пустой или не существует)
                  4. НЕ идет генерация
                  ВАЖНО: НЕ показываем заглушку, если есть данные в activeSlide.variants!
              */}
              {hasLoadedFeed && 
               activeSlide && 
               (!activeSlide.variants || activeSlide.variants.length === 0) && 
               !isGeneratingSlide && 
               (() => {
                // Определяем размер для пустого состояния на основе текущего формата
                let emptyStateWidth: number;
                if (slideAspectRatio === "4:3") {
                  emptyStateWidth = 520;
                } else if (slideAspectRatio === "9:16") {
                  emptyStateWidth = 320;
                } else if (slideAspectRatio === "3:4") {
                  emptyStateWidth = 400;
                } else {
                  emptyStateWidth = 400;
                }
                
                return (
                  <div
                    className="relative bg-gray-100 flex items-center justify-center rounded-lg"
                    style={{ 
                      width: `${emptyStateWidth}px`,
                      aspectRatio: placeholderAspectRatioValue
                    }}
                  >
                    <div className="text-center p-8">
                      <Sparkles className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                      <p className="text-gray-400 text-lg font-semibold">Готов к генерации</p>
                      <p className="text-gray-300 text-sm mt-2">Опишите слайд ниже и выберите сценарий</p>
                    </div>
                  </div>
                );
              })()}
            </div>
          );
        })()}
      </div>
      
      {/* Нижняя панель: Unified Command Capsule - всегда на месте */}
      <div className="fixed bottom-8 left-80 right-0 px-8 flex flex-col items-center justify-end gap-3 z-20">

        <motion.div
          layout
          transition={{ type: "spring", stiffness: 260, damping: 26 }}
          className={`bg-white rounded-[24px] shadow-2xl border border-gray-200 flex items-center gap-4 relative w-full ${
            mediaMode === "video"
              ? generationMode === "for-product"
                ? "max-w-[930px]"
                : "max-w-[730px]"
              : generationMode === "free"
                ? "max-w-3xl"
                : "max-w-5xl"
          } py-3 px-4`}
        >
          {/* ── (параметры перенесены в model selector) ── */}
          {mediaMode === "video" && false && (
            <div className="absolute bottom-full right-4 mb-2.5 flex flex-col items-end gap-1.5 z-20">
              <AnimatePresence>
                {videoParamsOpen && (
                  <motion.div
                    key="vp-panel"
                    initial={{ opacity: 0, y: 10, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.97 }}
                    transition={{ type: "spring", stiffness: 360, damping: 30 }}
                    className="w-[310px] rounded-2xl bg-white border border-black/[0.06] shadow-[0_12px_48px_rgba(0,0,0,0.14)] overflow-hidden"
                  >
                    <div className="p-3.5 space-y-3">

                      {/* ── Соотношение сторон ── */}
                      <AnimatePresence mode="wait">
                        <motion.div
                          key={`ar-${videoMode}`}
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          transition={{ duration: 0.18 }}
                          className={`flex items-end justify-start gap-2 ${videoMode === "sync" ? "opacity-25 pointer-events-none" : ""}`}
                        >
                          {((): {val: string; w: number; h: number}[] => {
                            if (videoMode === "standard") return [
                              {val:"9:16",w:19,h:34},{val:"3:4",w:24,h:32},{val:"1:1",w:28,h:28},{val:"4:3",w:32,h:24},{val:"16:9",w:34,h:19},{val:"21:9",w:40,h:17},
                            ];
                            if (videoMode === "pro") return [
                              {val:"9:16",w:19,h:34},{val:"1:1",w:28,h:28},{val:"16:9",w:34,h:19},
                            ];
                            return [{val:"9:16",w:19,h:34},{val:"16:9",w:34,h:19}];
                          })().map(({val, w, h}) => {
                            const active = videoAspect === val;
                            return (
                              <motion.button
                                key={val}
                                type="button"
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.92 }}
                                title={val}
                                onClick={() => setVideoAspect(val as typeof videoAspect)}
                                style={{ width: w, height: h, minWidth: w, minHeight: h }}
                                className={`rounded-[5px] flex items-center justify-center text-[7px] font-bold flex-shrink-0 transition-all ${
                                  active
                                    ? "bg-black text-white shadow-md"
                                    : "bg-gray-100 text-gray-400 hover:bg-gray-200"
                                }`}
                              >{val}</motion.button>
                            );
                          })}
                        </motion.div>
                      </AnimatePresence>

                      <div className="h-px bg-gray-100" />

                      {/* ── Продолжительность — iOS-сегмент ── */}
                      <AnimatePresence mode="wait">
                        <motion.div
                          key={`dur-${videoMode}`}
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          transition={{ duration: 0.16 }}
                          className={`${videoMode === "sync" ? "opacity-25 pointer-events-none" : ""}`}
                        >
                          <div className="flex bg-gray-100 rounded-xl p-0.5 gap-0.5">
                            {(videoMode === "standard" ? ["4s","8s","12s"] : videoMode === "pro" ? ["5s","10s"] : ["—"]).map((d) => {
                              const active = videoDuration === d;
                              return (
                                <button
                                  key={d}
                                  type="button"
                                  onClick={() => d !== "—" && setVideoDuration(d as typeof videoDuration)}
                                  className={`flex-1 py-1.5 rounded-[10px] text-[12px] font-semibold transition-all ${
                                    active ? "bg-white text-black shadow-sm" : "text-gray-500 hover:text-gray-700"
                                  }`}
                                >{d}</button>
                              );
                            })}
                          </div>
                        </motion.div>
                      </AnimatePresence>

                      {/* ── Качество — iOS-сегмент ── */}
                      <AnimatePresence mode="wait">
                        <motion.div
                          key={`q-${videoMode}`}
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          transition={{ duration: 0.16 }}
                        >
                          <div className="flex bg-gray-100 rounded-xl p-0.5 gap-0.5">
                            {(videoMode === "standard" ? ["480p","720p","1080p"] : videoMode === "pro" ? ["1080p"] : ["720p","1080p"]).map((q) => {
                              const active = videoQuality === q;
                              return (
                                <button
                                  key={q}
                                  type="button"
                                  onClick={() => setVideoQuality(q as typeof videoQuality)}
                                  className={`flex-1 py-1.5 rounded-[10px] text-[12px] font-semibold transition-all whitespace-nowrap ${
                                    active ? "bg-white text-black shadow-sm" : "text-gray-500 hover:text-gray-700"
                                  }`}
                                >{q}</button>
                              );
                            })}
                          </div>
                        </motion.div>
                      </AnimatePresence>

                      {/* ── Звук — компактный тоггл ── */}
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-medium text-gray-400">Звук</span>
                        <button
                          type="button"
                          onClick={() => setVideoSoundOn((v) => !v)}
                          className={`relative h-[22px] w-[38px] rounded-full transition-colors duration-200 ${
                            videoSoundOn ? "bg-emerald-400" : "bg-gray-200"
                          }`}
                        >
                          <motion.span
                            layout
                            transition={{ type: "spring", stiffness: 500, damping: 30 }}
                            className="absolute top-[3px] w-4 h-4 rounded-full bg-white shadow"
                            style={{ left: videoSoundOn ? "calc(100% - 19px)" : "3px" }}
                          />
                        </button>
                      </div>

                      {/* ── Статичная камера (fixed_lens) — только для Стандарт ── */}
                      {videoMode === "standard" && (
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-medium text-gray-400">Статичная камера</span>
                          <button
                            type="button"
                            onClick={() => setVideoFixedLens((v) => !v)}
                            className={`relative h-[22px] w-[38px] rounded-full transition-colors duration-200 ${
                              videoFixedLens ? "bg-emerald-400" : "bg-gray-200"
                            }`}
                          >
                            <motion.span
                              layout
                              transition={{ type: "spring", stiffness: 500, damping: 30 }}
                              className="absolute top-[3px] w-4 h-4 rounded-full bg-white shadow"
                              style={{ left: videoFixedLens ? "calc(100% - 19px)" : "3px" }}
                            />
                          </button>
                        </div>
                      )}

                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ── Кнопка-триггер ── */}
              <motion.button
                type="button"
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                onClick={() => setVideoParamsOpen((v) => !v)}
                className="inline-flex items-center gap-2 px-4 h-9 rounded-full bg-black text-white text-[12px] font-semibold shadow-md hover:shadow-lg transition-shadow"
              >
                <span>Параметры</span>
                <motion.span
                  animate={{ rotate: videoParamsOpen ? 180 : 0 }}
                  transition={{ type: "spring", stiffness: 400, damping: 25 }}
                  className="inline-flex"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </motion.span>
              </motion.button>
            </div>
          )}

          {/* Зона 1: Input Area + референсы */}
          <div
            className={`bg-gray-100 rounded-2xl flex ${
              generationMode === "free" || mediaMode === "video" ? "flex-1" : ""
            }`}
            style={
              mediaMode === "video"
                ? generationMode === "for-product"
                  ? { width: "52%", padding: "12px", minHeight: "110px" }
                  : { padding: "12px", minHeight: "100px" }
                : generationMode === "free"
                  ? { padding: "12px", minHeight: "80px" }
                  : { width: "50%", padding: "12px", minHeight: "80px" }
            }
          >
            <div className="flex-1 flex flex-col gap-2">
              <textarea
                value={slidePrompt}
                onChange={(e) => {
                  setSlidePrompt(e.target.value);
                  const textarea = e.target;
                  const maxHeight = 200;

                  // Сбрасываем высоту для пересчета
                  textarea.style.height = "auto";
                  const scrollHeight = textarea.scrollHeight;

                  if (scrollHeight <= maxHeight) {
                    textarea.style.height = `${scrollHeight}px`;
                    textarea.style.overflowY = "hidden";
                  } else {
                    textarea.style.height = `${maxHeight}px`;
                    textarea.style.overflowY = "auto";
                  }
                }}
                placeholder={
                  mediaMode === "video"
                    ? "Опишите, какую анимацию вы хотите (например: товар мягко поворачивается, фон слегка оживает)..."
                    : "Опишите, что должно быть на этом слайде (например: товар на кухонном столе)..."
                }
                className="w-full bg-transparent text-gray-900 placeholder:text-gray-400 text-base font-medium border-none outline-none resize-none"
                rows={1}
                style={{
                  height: "48px",
                  minHeight: "48px",
                  maxHeight: "200px",
                  paddingRight: referenceImages.length === 0 ? "60px" : "0px",
                }}
                ref={(textarea) => {
                  if (textarea && !slidePrompt) {
                    // Сбрасываем высоту когда поле пустое
                    textarea.style.height = "48px";
                  }
                }}
              />

              {generationMode === "free" && (
                <div
                  className={`flex items-center gap-3 ${
                    referenceImages.length > 0 ? "mt-2" : "mt-1"
                  }`}
                >
                  {/* Model selector — только в видео-режиме, слева от референсов */}
                  {mediaMode === "video" && (
                    <div ref={videoMenuRef} className="relative flex-shrink-0">
                      <motion.button
                        type="button"
                        whileHover={{ scale: 1.04 }}
                        whileTap={{ scale: 0.96 }}
                        onClick={() => setVideoModeOpen((v) => !v)}
                        className="inline-flex items-center gap-2 pl-2.5 pr-2 py-1.5 rounded-full bg-[#18181A] text-white border border-white/[0.1] shadow-md transition-all hover:border-white/[0.18]"
                      >
                        <div className="w-1.5 h-1.5 rounded-full bg-[#4ADE80] flex-shrink-0 shadow-[0_0_6px_rgba(74,222,128,0.8)]" />
                        <span className="text-[10px] font-bold uppercase tracking-widest">
                          {{ standard: "Стандарт", pro: "Про", sync: "Синхрон" }[videoMode]}
                        </span>
                        <motion.span
                          animate={{ rotate: videoModeOpen ? 180 : 0 }}
                          transition={{ type: "spring", stiffness: 400, damping: 25 }}
                          className="inline-flex"
                        >
                          <ChevronDown className="w-3 h-3 text-white/40" />
                        </motion.span>
                      </motion.button>
                      <AnimatePresence>
                        {videoModeOpen && (
                          <motion.div
                            key="model-panel"
                            initial={{ opacity: 0, y: 10, scale: 0.96 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 10, scale: 0.96 }}
                            transition={{ type: "spring", stiffness: 380, damping: 28 }}
                            className="absolute bottom-full left-0 mb-2 w-[260px] rounded-2xl bg-[#111113] border border-white/[0.07] shadow-[0_24px_64px_rgba(0,0,0,0.6)] z-30 overflow-hidden"
                          >
                            <div className="p-3 space-y-2.5">

                              {/* ── Соотношение сторон ── */}
                              <AnimatePresence mode="wait">
                                <motion.div
                                  key={`ar-${videoMode}`}
                                  initial={{ opacity: 0 }}
                                  animate={{ opacity: 1 }}
                                  exit={{ opacity: 0 }}
                                  transition={{ duration: 0.18 }}
                                  className="flex items-end gap-1.5 min-h-[34px]"
                                >
                                  {videoMode === "sync" ? (
                                    <span className="text-[11px] text-white/35 font-medium self-center italic">Автоматически</span>
                                  ) : (
                                    ((): {val: string; w: number; h: number}[] => {
                                      if (videoMode === "standard") return [
                                        {val:"9:16",w:18,h:32},{val:"3:4",w:22,h:29},{val:"1:1",w:26,h:26},
                                        {val:"4:3",w:29,h:22},{val:"16:9",w:32,h:18},{val:"21:9",w:38,h:16},
                                      ];
                                      return [{val:"9:16",w:18,h:32},{val:"1:1",w:26,h:26},{val:"16:9",w:32,h:18}];
                                    })().map(({val, w, h}) => {
                                      const active = videoAspect === val;
                                      return (
                                        <motion.button
                                          key={val}
                                          type="button"
                                          whileHover={{ scale: 1.14, y: -1 }}
                                          whileTap={{ scale: 0.9 }}
                                          title={val}
                                          onClick={() => setVideoAspect(val as typeof videoAspect)}
                                          style={{ width: w, height: h, minWidth: w, minHeight: h }}
                                          className={`rounded-[4px] flex-shrink-0 transition-all duration-200 ${
                                            active
                                              ? "bg-white shadow-[0_0_10px_rgba(74,222,128,0.35)]"
                                              : "bg-white/[0.1] hover:bg-white/[0.2]"
                                          }`}
                                        />
                                      );
                                    })
                                  )}
                                </motion.div>
                              </AnimatePresence>

                              <div className="h-px bg-white/[0.07]" />

                              {/* ── Продолжительность ── */}
                              <AnimatePresence mode="wait">
                                <motion.div
                                  key={`dur-${videoMode}`}
                                  initial={{ opacity: 0, y: 3 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  exit={{ opacity: 0, y: -3 }}
                                  transition={{ duration: 0.15 }}
                                >
                                  {videoMode === "sync" ? (
                                    <div className="text-[11px] text-white/35 font-medium italic py-[7px]">Автоматически</div>
                                  ) : (
                                    <div className="flex bg-white/[0.06] rounded-[11px] p-[3px] gap-[2px]">
                                      {(videoMode === "standard" ? ["4s","8s","12s"] : ["5s","10s"]).map((d) => {
                                        const active = videoDuration === d;
                                        return (
                                          <motion.button
                                            key={d}
                                            type="button"
                                            whileTap={{ scale: 0.93 }}
                                            onClick={() => setVideoDuration(d as typeof videoDuration)}
                                            className={`flex-1 py-[7px] rounded-[9px] text-[12px] font-bold transition-all duration-200 ${
                                              active
                                                ? "bg-white text-black shadow-md"
                                                : "text-white/45 hover:text-white/80"
                                            }`}
                                          >{d}</motion.button>
                                        );
                                      })}
                                    </div>
                                  )}
                                </motion.div>
                              </AnimatePresence>

                              {/* ── Качество ── */}
                              <AnimatePresence mode="wait">
                                <motion.div
                                  key={`q-${videoMode}`}
                                  initial={{ opacity: 0, y: 3 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  exit={{ opacity: 0, y: -3 }}
                                  transition={{ duration: 0.15 }}
                                >
                                  <div className="flex bg-white/[0.06] rounded-[11px] p-[3px] gap-[2px]">
                                    {(videoMode === "standard" ? ["480p","720p","1080p"] : videoMode === "pro" ? ["1080p"] : ["720p","1080p"]).map((q) => {
                                      const active = videoQuality === q;
                                      return (
                                        <motion.button
                                          key={q}
                                          type="button"
                                          whileTap={{ scale: 0.93 }}
                                          onClick={() => setVideoQuality(q as typeof videoQuality)}
                                          className={`flex-1 py-[7px] rounded-[9px] text-[12px] font-bold transition-all duration-200 whitespace-nowrap ${
                                            active
                                              ? "bg-white text-black shadow-md"
                                              : "text-white/45 hover:text-white/80"
                                          }`}
                                        >{q}</motion.button>
                                      );
                                    })}
                                  </div>
                                </motion.div>
                              </AnimatePresence>

                              {/* ── Звук ── */}
                              <div className="flex items-center justify-between py-0.5">
                                <span className="text-[11px] font-medium text-white/45">Звук</span>
                                <button
                                  type="button"
                                  onClick={() => setVideoSoundOn((v) => !v)}
                                  className={`relative h-[22px] w-[38px] rounded-full transition-colors duration-300 ${
                                    videoSoundOn ? "bg-[#4ADE80]" : "bg-white/[0.12]"
                                  }`}
                                >
                                  <motion.span
                                    layout
                                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                                    className="absolute top-[3px] w-4 h-4 rounded-full bg-white shadow-sm"
                                    style={{ left: videoSoundOn ? "calc(100% - 19px)" : "3px" }}
                                  />
                                </button>
                              </div>

                              {/* ── Motion Control: character_orientation ── */}
                              {videoMode === "sync" && (
                                <div className="py-0.5">
                                  <div className="flex items-center justify-between">
                                    <span className="text-[11px] font-medium text-white/45">Ориентация</span>
                                  </div>
                                  <div className="flex bg-white/[0.06] rounded-[11px] p-[3px] gap-[2px] mt-1">
                                    {(["image", "video"] as const).map((v) => {
                                      const active = syncCharacterOrientation === v;
                                      const title =
                                        v === "image"
                                          ? "По фото: ориентация как на картинке (обычно короче)"
                                          : "По видео: ориентация как на reference-видео (обычно дольше)";
                                      return (
                                        <motion.button
                                          key={v}
                                          type="button"
                                          whileTap={{ scale: 0.93 }}
                                          onClick={() => setSyncCharacterOrientation(v)}
                                          title={title}
                                          className={`flex-1 py-[7px] rounded-[9px] text-[12px] font-bold transition-all duration-200 ${
                                            active
                                              ? "bg-white text-black shadow-md"
                                              : "text-white/45 hover:text-white/80"
                                          }`}
                                        >
                                          {v === "image" ? "По фото" : "По видео"}
                                        </motion.button>
                                      );
                                    })}
                                  </div>
                                  <div className="text-[10px] text-white/35 mt-1 px-1">
                                    По фото = ориентация от картинки, по видео = от reference-видео.
                                  </div>
                                </div>
                              )}

                              {/* ── Статичная камера (fixed_lens) — только для Стандарт ── */}
                              {videoMode === "standard" && (
                                <div className="flex items-center justify-between py-0.5">
                                  <span className="text-[11px] font-medium text-white/45">Статичная камера</span>
                                  <button
                                    type="button"
                                    onClick={() => setVideoFixedLens((v) => !v)}
                                    className={`relative h-[22px] w-[38px] rounded-full transition-colors duration-300 ${
                                      videoFixedLens ? "bg-[#4ADE80]" : "bg-white/[0.12]"
                                    }`}
                                  >
                                    <motion.span
                                      layout
                                      transition={{ type: "spring", stiffness: 500, damping: 30 }}
                                      className="absolute top-[3px] w-4 h-4 rounded-full bg-white shadow-sm"
                                      style={{ left: videoFixedLens ? "calc(100% - 19px)" : "3px" }}
                                    />
                                  </button>
                                </div>
                              )}

                              <div className="h-px bg-white/[0.07]" />

                              {/* ── Модель — сабменю ── */}
                              <div>
                                <motion.button
                                  type="button"
                                  whileTap={{ scale: 0.98 }}
                                  onClick={() => setVideoModelSubmenuOpen((v) => !v)}
                                  className="w-full flex items-center justify-between px-2 py-1.5 rounded-xl hover:bg-white/[0.05] transition-all group"
                                >
                                  <div className="flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-[#4ADE80] shadow-[0_0_6px_rgba(74,222,128,0.7)]" />
                                    <span className="text-[13px] font-semibold text-white">
                                      {{ standard: "Стандарт", pro: "Про", sync: "Синхрон" }[videoMode]}
                                    </span>
                                  </div>
                                  <motion.span
                                    animate={{ rotate: videoModelSubmenuOpen ? 180 : 0 }}
                                    transition={{ type: "spring", stiffness: 400, damping: 25 }}
                                    className="inline-flex"
                                  >
                                    <ChevronDown className="w-3.5 h-3.5 text-white/30 group-hover:text-white/60 transition-colors" />
                                  </motion.span>
                                </motion.button>
                                <AnimatePresence>
                                  {videoModelSubmenuOpen && (
                                    <motion.div
                                      initial={{ opacity: 0, height: 0 }}
                                      animate={{ opacity: 1, height: "auto" }}
                                      exit={{ opacity: 0, height: 0 }}
                                      transition={{ duration: 0.18, ease: "easeOut" }}
                                      className="overflow-hidden"
                                    >
                                      <div className="pt-1.5 space-y-[3px]">
                                        {[
                                          { id: "standard", label: "Стандарт" },
                                          { id: "pro",      label: "Про" },
                                          { id: "sync",     label: "Синхрон" },
                                        ].map((m) => {
                                          const active = videoMode === m.id;
                                          return (
                                            <motion.button
                                              key={m.id}
                                              type="button"
                                              whileHover={{ x: 2 }}
                                              whileTap={{ scale: 0.97 }}
                                              onClick={() => {
                                                setVideoMode(m.id as typeof videoMode);
                                                setVideoModelSubmenuOpen(false);
                                                if (m.id === "standard") { setVideoDuration("4s"); setVideoQuality("720p"); setVideoAspect("9:16"); }
                                                else if (m.id === "pro")  { setVideoDuration("5s"); setVideoQuality("1080p"); setVideoAspect("9:16"); }
                                                else { setVideoDuration(null); setVideoQuality("1080p"); }
                                              }}
                                              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-[12px] font-semibold transition-all duration-200 ${
                                                active
                                                  ? "bg-white text-black"
                                                  : "text-white/45 hover:text-white hover:bg-white/[0.06]"
                                              }`}
                                            >
                                              <span>{m.label}</span>
                                              {active && (
                                                <div className="w-2 h-2 rounded-full bg-[#4ADE80] shadow-[0_0_6px_rgba(74,222,128,0.8)] flex-shrink-0" />
                                              )}
                                            </motion.button>
                                          );
                                        })}
                                      </div>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>

                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}

                  {/* Sync / Motion Control: reference video (tile слева рядом с фоткой) */}
                  {generationMode === "free" && mediaMode === "video" && videoMode === "sync" && (
                    <>
                      {motionControlVideoPreviewUrl ? (
                        <div className="relative group flex-shrink-0 w-24 h-16">
                          <div className="relative w-full h-full rounded-2xl overflow-hidden border border-gray-300 bg-white">
                            <video
                              src={motionControlVideoPreviewUrl}
                              className="w-full h-full object-cover"
                              muted
                              controls={false}
                              playsInline
                              preload="metadata"
                            />

                            {/* Бейдж: что это видео + длительность */}
                            <div className="absolute top-1 left-1 bg-black/60 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded">
                              {`Видео${motionControlVideoDurationSec !== null ? ` • ${motionControlVideoDurationSec}с` : ""}`}
                            </div>

                            {/* Крест на маленьком превью при наведении */}
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleMotionControlVideoRemove();
                                }}
                                className="text-white text-5xl font-bold leading-none hover:text-gray-200 transition-colors flex items-center justify-center"
                                style={{
                                  lineHeight: "1",
                                  margin: 0,
                                  padding: 0,
                                  transform: "translateY(-2px)",
                                }}
                              >
                                ×
                              </button>
                            </div>
                          </div>

                          {/* Увеличенная версия — при hover проигрывает видео */}
                          <div className="absolute bottom-full left-0 mb-2 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity duration-200 z-50">
                            <div className="relative rounded-2xl overflow-hidden border-2 border-gray-300 bg-gray-100 shadow-2xl">
                              <video
                                src={motionControlVideoPreviewUrl}
                                className="block max-w-[320px] max-h-[384px] w-auto h-auto object-contain bg-black"
                                muted
                                controls={false}
                                playsInline
                                autoPlay
                                loop
                                preload="metadata"
                              />
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleMotionControlVideoRemove();
                                }}
                                className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors"
                                aria-label="Удалить видео"
                              >
                                ×
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <label className="inline-flex items-center justify-center w-24 h-16 rounded-2xl border-2 border-dashed border-gray-400 bg-gray-50 text-gray-600 cursor-pointer hover:border-[#1F4E3D] hover:bg-gray-100 hover:text-[#1F4E3D] transition-all">
                          <Video className="w-5 h-5" />
                          <input
                            type="file"
                            accept="video/*"
                            onChange={handleMotionControlVideoUpload}
                            className="hidden"
                          />
                        </label>
                      )}
                    </>
                  )}

                  <div className="flex items-center gap-2 flex-1 min-w-0" suppressHydrationWarning>
                    {referenceImages.map((img, index) => {
                      return (
                        <div key={`${img}-${index}`} className="relative group flex-shrink-0 w-24 h-16">
                          {/* Маленькое превью - всегда видимо */}
                          <div className="relative w-full h-full rounded-2xl overflow-hidden border border-gray-300 bg-white">
                            <img src={img} alt={`Референс ${index + 1}`} className="w-full h-full object-cover" />
                            {/* Крест на маленьком превью при наведении */}
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setReferenceImages((prev) => prev.filter((_, i) => i !== index));
                                }}
                                className="text-white text-5xl font-bold leading-none hover:text-gray-200 transition-colors flex items-center justify-center"
                                style={{
                                  lineHeight: "1",
                                  margin: 0,
                                  padding: 0,
                                  transform: "translateY(-2px)",
                                }}
                              >
                                ×
                              </button>
                            </div>
                          </div>

                          {/* Увеличенная версия (как у фото) */}
                          <div className="absolute bottom-full left-0 mb-2 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity duration-200 z-50">
                            <div className="relative rounded-2xl overflow-hidden border-2 border-gray-300 bg-gray-100 shadow-2xl">
                              <img
                                src={img}
                                alt={`Референс ${index + 1} увеличенный`}
                                className="block max-w-[320px] max-h-[384px] w-auto h-auto"
                                style={{ display: "block" }}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <label className="inline-flex items-center justify-center w-12 h-12 rounded-xl border-2 border-dashed border-gray-400 bg-gray-50 text-gray-600 text-2xl font-medium cursor-pointer hover:border-[#1F4E3D] hover:bg-gray-100 hover:text-[#1F4E3D] transition-all">
                      <span className="flex items-center justify-center w-full h-full leading-none">+</span>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleReferenceImagesUpload}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>
              )}
            </div>
          </div>
          
          {/* Разделитель - только в режиме "Для товара" */}
          {generationMode === "for-product" && (
            <div className="w-[1px] bg-gray-200 h-10" />
          )}
          
          {/* Зона 2: Settings / Aspect ratio / Generate */}
          <motion.div
            layout
            transition={{ type: "spring", stiffness: 260, damping: 26 }}
            className={`flex items-center gap-3 ${
              generationMode === "for-product" && mediaMode === "photo" ? "flex-1" : "flex-shrink-0"
            }`}
            style={{ width: generationMode === "for-product" && mediaMode === "photo" ? "50%" : "auto" }}
          >
            <AnimatePresence initial={false}>
              {/* Сценарии отображаем только для режима "Для товара" */}
              {generationMode === "for-product" && mediaMode === "photo" && (
                <motion.div
                  key="scenarios"
                  initial={{ opacity: 0, y: 10, height: 0 }}
                  animate={{ opacity: 1, y: 0, height: "auto" }}
                  exit={{ opacity: 0, y: 10, height: 0 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                  className="grid grid-cols-2 gap-2 flex-1"
                >
                  {[
                    { id: "studio", name: "Студийный подиум", icon: Box },
                    { id: "lifestyle", name: "Жилое пространство", icon: Home },
                    { id: "macro", name: "Макро-деталь", icon: ZoomIn },
                    { id: "with-person", name: "С человеком", icon: Hand },
                  ].map((scenario) => {
                    const Icon = scenario.icon;
                    const isSelected = selectedScenario === scenario.id;
                    return (
                      <motion.button
                        key={scenario.id}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => {
                          setSelectedScenario(
                            selectedScenario === scenario.id ? null : scenario.id
                          );
                        }}
                        className={`p-2 rounded-lg flex flex-col items-center justify-center gap-1 transition-all ${
                          isSelected
                            ? "bg-black text-white shadow-md"
                            : "bg-gray-50 text-gray-700 hover:bg-gray-100"
                        }`}
                        title={scenario.name}
                      >
                        <Icon className="w-4 h-4" />
                        <span className="text-xs font-semibold text-center leading-tight">
                          {scenario.name}
                        </span>
                      </motion.button>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Переключатель формата / Видео-настройки */}
            {mediaMode === "photo" ? (
              <motion.div
                key="aspect-ratio"
                layout
                transition={{ type: "spring", stiffness: 260, damping: 26 }}
                className="grid grid-cols-2 gap-2 flex-shrink-0 place-items-center"
                style={{ width: generationMode === "free" ? "140px" : "120px" }}
              >
                {[
                  { value: "9:16", label: "9:16", width: 32, height: 56 },
                  { value: "3:4",  label: "3:4",  width: 42, height: 56 },
                  { value: "1:1",  label: "1:1",  width: 56, height: 56 },
                  { value: "4:3",  label: "4:3",  width: 56, height: 42 },
                ].map((format) => (
                  <div key={format.value} className="flex items-center justify-center w-full h-full" style={{ minHeight: "60px" }}>
                    <button
                      onClick={() => setSlideAspectRatio(format.value as "3:4" | "4:3" | "9:16" | "1:1")}
                      className="rounded-lg text-xs font-bold transition-all flex items-center justify-center flex-shrink-0 border-2"
                      style={{
                        width: `${format.width}px`, height: `${format.height}px`,
                        minWidth: `${format.width}px`, minHeight: `${format.height}px`,
                        maxWidth: `${format.width}px`, maxHeight: `${format.height}px`,
                        backgroundColor: slideAspectRatio === format.value ? "#000000" : "#F3F4F6",
                        color: slideAspectRatio === format.value ? "#FFFFFF" : "#4B5563",
                        borderColor: slideAspectRatio === format.value ? "#000000" : "#D1D5DB",
                      }}
                    >{format.label}</button>
                  </div>
                ))}
              </motion.div>
            ) : null}

            {generationMode === "for-product" && mediaMode === "video" && (
              <motion.div
                key="for-product-video-settings"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                transition={{ duration: 0.18 }}
                className="flex items-center gap-4"
              >
                {/* ── Длительность: единый контейнер + плавающий активный pill ── */}
                <div className="flex flex-col items-center gap-1">
                  <span className="text-[9px] font-medium uppercase tracking-[0.16em] text-gray-400/80">
                    Длительность
                  </span>
                  {(() => {
                    const selectedDuration: "5s" | "10s" = videoDuration === "10s" ? "10s" : "5s";
                    return (
                      <div className="relative w-[62px] h-[80px] rounded-[14px] bg-[#DDE1E8] p-[4px] flex flex-col gap-[3px]">
                        <motion.div
                          layout
                          transition={{ type: "spring", stiffness: 420, damping: 32 }}
                          className="absolute left-[4px] w-[54px] h-[34px] rounded-[10px] bg-black shadow-[0_3px_8px_rgba(0,0,0,0.28)]"
                          style={{ top: selectedDuration === "5s" ? 4 : 41 }}
                        />
                        {(["5s", "10s"] as const).map((d) => {
                          const active = selectedDuration === d;
                          return (
                            <motion.button
                              key={d}
                              type="button"
                              whileTap={{ scale: 0.96 }}
                              onClick={() => setVideoDuration(d)}
                              className={`relative z-10 w-full h-[34px] rounded-[10px] flex items-center justify-center text-[13px] leading-none font-bold transition-colors ${
                                active ? "text-white" : "text-gray-600"
                              }`}
                            >
                              {d}
                            </motion.button>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>

                {/* разделитель */}
                <div className="w-px self-stretch bg-gray-200 mx-0.5" />

                {/* ── Инфографика + Камера ── */}
                <div className="flex flex-col gap-[8px] min-w-[172px]">
                  {/* Инфографика */}
                  <div className="flex flex-col gap-[3px]">
                    <span className="text-[9px] font-medium uppercase tracking-[0.16em] text-gray-400/80">
                      Инфографика
                    </span>
                    <button
                      type="button"
                      onClick={() => setVideoInfographicsOn((v) => !v)}
                      className={`h-[38px] w-full rounded-[12px] px-3 flex items-center justify-between text-[13px] font-semibold transition-all border ${
                        videoInfographicsOn
                          ? "bg-black text-white border-black shadow-[0_4px_12px_rgba(0,0,0,0.28)]"
                          : "bg-[#F1F3F6] text-gray-700 border-gray-300 hover:bg-[#E9EDF2]"
                      }`}
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <Layers className="w-3 h-3 opacity-80" />
                        Сохранить
                      </span>
                      {/* тумблер */}
                      <span
                        className={`relative inline-flex h-[14px] w-[26px] rounded-full transition-colors flex-shrink-0 ${
                          videoInfographicsOn ? "bg-[#555]" : "bg-gray-300"
                        }`}
                      >
                        <span
                          className={`absolute top-[2px] h-[10px] w-[10px] rounded-full bg-white shadow-sm transition-all duration-200 ${
                            videoInfographicsOn ? "left-[14px]" : "left-[2px]"
                          }`}
                        />
                      </span>
                    </button>
                  </div>

                  {/* Камера */}
                  <div className="flex flex-col gap-[3px]">
                    <span className="text-[9px] font-medium uppercase tracking-[0.16em] text-gray-400/80">
                      Камера
                    </span>
                    <button
                      type="button"
                      onClick={() => setVideoStaticCameraOn((v) => !v)}
                      className={`h-[38px] w-full rounded-[12px] px-3 flex items-center justify-between text-[13px] font-semibold transition-all border ${
                        videoStaticCameraOn
                          ? "bg-black text-white border-black shadow-[0_4px_12px_rgba(0,0,0,0.28)]"
                          : "bg-[#F1F3F6] text-gray-700 border-gray-300 hover:bg-[#E9EDF2]"
                      }`}
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <Video className="w-3 h-3 opacity-80" />
                        Статичная
                      </span>
                      {/* тумблер */}
                      <span
                        className={`relative inline-flex h-[14px] w-[26px] rounded-full transition-colors flex-shrink-0 ${
                          videoStaticCameraOn ? "bg-[#555]" : "bg-gray-300"
                        }`}
                      >
                        <span
                          className={`absolute top-[2px] h-[10px] w-[10px] rounded-full bg-white shadow-sm transition-all duration-200 ${
                            videoStaticCameraOn ? "left-[14px]" : "left-[2px]"
                          }`}
                        />
                      </span>
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

              {mediaMode === "video" && (
                <div
                  className="shrink-0 pr-0.5"
                  title="Списание видео-кредитов за этот запуск по выбранным настройкам"
                >
                  <div className="flex flex-col items-end justify-center gap-0.5 rounded-2xl border border-lime-200/70 bg-gradient-to-br from-lime-50 via-white to-emerald-50/80 px-3 py-2 shadow-[0_2px_12px_rgba(22,101,52,0.08)] ring-1 ring-lime-100/50 min-w-[5.25rem]">
                    <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-lime-800/65">
                      Стоимость
                    </span>
                    <span className="text-sm font-bold leading-none text-right text-[#14532d] tabular-nums tracking-tight">
                      {generationMode === "for-product"
                        ? productVideoTokenEstimate != null && productVideoTokenEstimate > 0
                          ? String(productVideoTokenEstimate)
                          : "—"
                        : freeVideoTokenEstimate != null && freeVideoTokenEstimate > 0
                          ? String(freeVideoTokenEstimate)
                          : videoMode === "sync"
                            ? "по эталону"
                            : "—"}
                    </span>
                    {(generationMode === "for-product"
                      ? productVideoTokenEstimate != null && productVideoTokenEstimate > 0
                      : freeVideoTokenEstimate != null && freeVideoTokenEstimate > 0) && (
                      <span className="text-[10px] font-medium text-lime-800/55 leading-none mt-0.5">
                        токенов
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Кнопка запуска генерации */}
              <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={async () => {
                if (activeSlideId === null) {
                  showToast({
                    type: "info",
                    message: "Сначала выберите слайд для генерации.",
                  });
                  return;
                }
                const isVideoRun = mediaMode === "video";
                if (!isVideoRun && creativeQuota && creativeQuota.remaining <= 0) {
                  showToast({
                    type: "error",
                    title: "Нет доступных генераций",
                    message:
                      "У вас закончились генерации в «Свободном творчестве». Выберите тариф на главной странице.",
                  });
                  return;
                }

                if (isVideoRun && generationMode === "free") {
                  const need = freeVideoTokenEstimate ?? 0;
                  if (need < 1 || (videoMode === "sync" && (!motionControlVideoDurationSec || motionControlVideoDurationSec < 1))) {
                    showToast({
                      type: "info",
                      message:
                        videoMode === "sync"
                          ? "Загрузите эталонное видео — по нему считается стоимость (секунды × тариф)."
                          : "Проверьте настройки видео (режим, длительность, качество).",
                    });
                    return;
                  }
                  if (videoTokenBalance < need) {
                    showToast({
                      type: "error",
                      title: "Недостаточно видео-кредитов",
                      message: `Нужно ${need} ток., на балансе ${videoTokenBalance}. Пополните на главной (#pricing → свободное творчество → Видео → пакет токенов).`,
                    });
                    return;
                  }
                }

                if (isVideoRun && generationMode === "for-product") {
                  const need = productVideoTokenEstimate ?? 0;
                  if (videoTokenBalance < need) {
                    showToast({
                      type: "error",
                      title: "Недостаточно видео-кредитов",
                      message: `Нужно ${need} ток., на балансе ${videoTokenBalance}. Пополните на главной (#pricing → свободное творчество → Видео → пакет токенов).`,
                    });
                    return;
                  }
                }

                // Валидация: промпт обязателен только если не выбран сценарий (для режима "Для товара")
                if (generationMode === "for-product") {
                  if (!selectedScenario && !slidePrompt.trim()) {
                    showToast({
                      type: "info",
                      message: "Выберите сценарий или введите описание для генерации.",
                    });
                    return;
                  }
                } else {
                  // Для режима "Свободная" промпт обязателен
                  if (!slidePrompt.trim()) {
                    showToast({
                      type: "info",
                      message: "Введите описание для генерации в поле слева.",
                    });
                    return;
                  }
                }
                
                // Для видео-режима используем isVideoStarting, не isGeneratingSlide
                const isVideoMode = mediaMode === "video";
                if (isVideoMode) {
                  setIsVideoStarting(true);
                } else {
                  setIsGeneratingSlide(true);
                }
                try {
                  const { data: { session } } = await createBrowserClient().auth.getSession();
                  const authHeaders: Record<string, string> = { "Content-Type": "application/json" };
                  if (session?.access_token) authHeaders["Authorization"] = `Bearer ${session.access_token}`;

                  if (generationMode === "free" && mediaMode === "video") {
                    // ── СВОБОДНАЯ ГЕНЕРАЦИЯ ВИДЕО (Standard=seedance, Pro=kling) ──
                    const durationMapStandard: Record<string, number> = { "4s": 4, "8s": 8, "12s": 12 };
                    const durationMapPro: Record<string, number> = { "5s": 5, "10s": 10 };
                    const durationNum =
                      videoMode === "pro"
                        ? (videoDuration && durationMapPro[videoDuration]) || 5
                        : (videoDuration && durationMapStandard[videoDuration || "4s"]) || 4;

                    const referenceSlice =
                      videoMode === "pro" || videoMode === "sync"
                        ? referenceImages.slice(0, 1)
                        : referenceImages.slice(0, 2);

                    // Для sync обязательно нужно reference video
                    if (videoMode === "sync" && referenceImages.length < 1) {
                      showToast({
                        type: "info",
                        message: "Загрузите reference image для режима Синхрон.",
                      });
                      setIsVideoStarting(false);
                      return;
                    }
                    if (videoMode === "sync" && !motionControlVideoDataUrl) {
                      showToast({
                        type: "info",
                        message: "Загрузите reference video для режима Синхрон.",
                      });
                      setIsVideoStarting(false);
                      return;
                    }

                    const payload: any = {
                      prompt: slidePrompt.trim(),
                      aspectRatio: videoAspect,
                      resolution: videoQuality,
                      videoMode,
                      fixedLens: videoMode === "standard" ? videoFixedLens : false,
                      generateAudio: videoSoundOn,
                      referenceImageDataUrls: referenceSlice,
                    };

                    if (videoMode === "standard" || videoMode === "pro") {
                      payload.duration = durationNum;
                    }
                    if (videoMode === "sync") {
                      payload.referenceVideoDataUrl = motionControlVideoDataUrl;
                      payload.characterOrientation = syncCharacterOrientation;
                      payload.referenceVideoDurationSec = motionControlVideoDurationSec ?? 0;
                    }

                    const freeVideoRes = await fetch("/api/generate-video-free", {
                      method: "POST",
                      headers: authHeaders,
                      body: JSON.stringify(payload),
                    });

                    const freeVideoData = await freeVideoRes.json().catch(() => ({}));
                    if (!freeVideoRes.ok || !freeVideoData.success) {
                      if (freeVideoData.code === "INSUFFICIENT_VIDEO_TOKENS") {
                        showToast({
                          type: "error",
                          title: "Недостаточно видео-кредитов",
                          message: freeVideoData.error || "Пополните баланс на главной странице.",
                        });
                        setIsVideoStarting(false);
                        return;
                      }
                      throw new Error(freeVideoData.error || "Ошибка запуска видео-генерации");
                    }

                    if (typeof freeVideoData.tokensCharged === "number") {
                      setVideoTokenBalance((b) =>
                        Math.max(0, b - freeVideoData.tokensCharged)
                      );
                    }

                    // Задача запущена — ставим pendingVideoTaskId + сохраняем параметры анимации
                    setSlides((prev) =>
                      prev.map((s) =>
                        s.id === activeSlideId
                          ? {
                              ...s,
                              pendingVideoTaskId: freeVideoData.taskId,
                              pendingVideoAspect: videoAspect,
                              pendingVideoGenerationMode: "free",
                              pendingVideoError: undefined,
                              prompt: slidePrompt.trim() || null,
                            }
                          : s
                      )
                    );

                    // Уведомление при старте генерации скрываем: оно мешает интерфейсу

                    setIsVideoStarting(false);
                    return;
                  }

                  if (generationMode === "free") {
                    // Свободная генерация - просто промпт без системных промптов
                    const response = await fetch("/api/generate-free", {
                      method: "POST",
                      headers: authHeaders,
                      body: JSON.stringify({
                        prompt: slidePrompt.trim(),
                        aspectRatio: slideAspectRatio,
                        referenceImages,
                      }),
                    });

                    const errorData = await response.json().catch(() => ({}));
                    if (!response.ok) {
                      if (response.status === 403) {
                        markCreativeQuotaExhausted();
                        showToast({
                          type: "error",
                          title: "Нет доступных генераций",
                          message: errorData.error || "У вас не куплены генерации или число доступных генераций равно 0. Выберите тариф «Свободное творчество» на главной странице.",
                        });
                        return;
                      }
                      throw new Error(errorData.error || "Ошибка при запросе к серверу");
                    }

                    const data = errorData;
                    if (!data.success) {
                      if (data.code === "NO_GENERATIONS_LEFT" || data.code === "NO_CREATIVE_PLAN") {
                        markCreativeQuotaExhausted();
                        showToast({
                          type: "error",
                          title: "Нет доступных генераций",
                          message: data.error || "У вас не куплены генерации. Выберите тариф на главной странице.",
                        });
                        return;
                      }
                      throw new Error(data.error || "Ошибка генерации");
                    }

                    const generatedImageUrl = data.imageUrl;
                    consumeCreativeGeneration();
                    if (data.referenceUsed === false && referenceImages.length > 0) {
                      showToast({
                        type: "info",
                        title: "Референс не загрузился",
                        message: "Изображение сгенерировано только по описанию. Попробуйте фото меньшего размера или повторите позже.",
                      });
                    }

                    await saveImageToSupabase({
                      imageUrl: generatedImageUrl,
                      prompt: slidePrompt.trim() || null,
                      aspectRatio: slideAspectRatio,
                      generationMode: "free",
                      scenario: null,
                    });

                    setSlides(slides.map(s => {
                      if (s.id === activeSlideId) {
                        // Нормализуем существующие варианты перед добавлением нового
                        const existingVariants: Variant[] = (s.variants || []).map(v => {
                          if (typeof v === 'object' && 'url' in v && 'aspectRatio' in v) {
                            return {
                              url: (v as Variant).url,
                              aspectRatio: (v as Variant).aspectRatio,
                              prompt: (v as Variant).prompt ?? s.prompt ?? "",
                              mediaType: (v as Variant).mediaType ?? "image" as const,
                            };
                          }
                          if (typeof v === 'string') {
                            return { url: v, aspectRatio: s.aspectRatio, prompt: s.prompt ?? "", mediaType: "image" as const };
                          }
                          return { url: String(v), aspectRatio: s.aspectRatio, prompt: s.prompt ?? "", mediaType: "image" as const };
                        });
                        
                        // Новые изображения добавляем в начало (сверху)
                        const newVariants = [{ 
                          url: generatedImageUrl, 
                          aspectRatio: slideAspectRatio,
                          prompt: slidePrompt.trim() || "",
                          mediaType: "image" as const,
                        }, ...existingVariants];
                        
                        return {
                          ...s,
                          variants: newVariants,
                          imageUrl: s.imageUrl || generatedImageUrl,
                          prompt: slidePrompt.trim(),
                          scenario: null,
                          aspectRatio: slideAspectRatio, // Оставляем для обратной совместимости
                        };
                      }
                      return s;
                    }));

                    setSlidePrompt("");
                    // Сбрасываем высоту textarea после небольшой задержки
                    setTimeout(() => {
                      const textarea = document.querySelector('textarea[placeholder*="Опишите"]') as HTMLTextAreaElement;
                      if (textarea) {
                        textarea.style.height = "48px";
                        textarea.style.overflowY = "hidden";
                      }
                    }, 100);
                  } else {
                    // Режим "Для товара"
                    if (!productPhotoPreview) {
                      showToast({
                        type: "info",
                        message: "Пожалуйста, загрузите фото товара в левой панели.",
                      });
                      setIsGeneratingSlide(false);
                      setIsVideoStarting(false);
                      return;
                    }

                    // ── ВИДЕО ─────────────────────────────────────────────────
                    if (mediaMode === "video") {
                      const durationNum = videoDuration === "10s" ? 10 : 5;

                      const videoRes = await fetch("/api/generate-video-product", {
                        method: "POST",
                        headers: authHeaders,
                        body: JSON.stringify({
                          productImageDataUrl: productPhotoPreview,
                          prompt: slidePrompt.trim() || "",
                          resolution: "1080p",
                          duration: durationNum,
                          staticCamera: videoStaticCameraOn,
                          saveInfographics: videoInfographicsOn,
                        }),
                      });

                      const videoData = await videoRes.json().catch(() => ({}));
                      if (!videoRes.ok || !videoData.success) {
                        if (videoData.code === "INSUFFICIENT_VIDEO_TOKENS") {
                          showToast({
                            type: "error",
                            title: "Недостаточно видео-кредитов",
                            message: videoData.error || "Пополните баланс на главной странице.",
                          });
                          setIsVideoStarting(false);
                          return;
                        }
                        throw new Error(videoData.error || "Ошибка запуска видео-генерации");
                      }

                      if (typeof videoData.tokensCharged === "number") {
                        setVideoTokenBalance((b) =>
                          Math.max(0, b - videoData.tokensCharged)
                        );
                      }

                      // Задача запущена — ставим pendingVideoTaskId на слайд
                      setSlides((prev) =>
                        prev.map((s) =>
                          s.id === activeSlideId
                            ? {
                                ...s,
                                pendingVideoTaskId: videoData.taskId,
                                pendingVideoAspect: "9:16",
                                pendingVideoGenerationMode: "for-product",
                                pendingVideoError: undefined,
                                prompt: slidePrompt.trim() || null,
                              }
                            : s
                        )
                      );

                      // Уведомление при старте генерации скрываем: оно мешает интерфейсу

                      setIsVideoStarting(false);
                      return; // Выходим — дальше поллинг сам всё сделает
                    }

                    // ── ФОТО ──────────────────────────────────────────────────
                    const response = await fetch("/api/generate-for-product", {
                      method: "POST",
                      headers: authHeaders,
                      body: JSON.stringify({
                        prompt: slidePrompt.trim() || null,
                        aspectRatio: slideAspectRatio,
                        scenario: selectedScenario,
                        productImage: productPhotoPreview,
                      }),
                    });

                    const errorDataForProduct = await response.json().catch(() => ({}));
                    if (!response.ok) {
                      if (response.status === 403) {
                        markCreativeQuotaExhausted();
                        showToast({
                          type: "error",
                          title: "Нет доступных генераций",
                          message: errorDataForProduct.error || "У вас не куплены генерации или число доступных генераций равно 0. Выберите тариф «Свободное творчество» на главной странице.",
                        });
                        return;
                      }
                      throw new Error(errorDataForProduct.error || "Ошибка при запросе к серверу");
                    }

                    const data = errorDataForProduct;
                    if (!data.success) {
                      if (data.code === "NO_GENERATIONS_LEFT" || data.code === "NO_CREATIVE_PLAN") {
                        markCreativeQuotaExhausted();
                        showToast({
                          type: "error",
                          title: "Нет доступных генераций",
                          message: data.error || "У вас не куплены генерации. Выберите тариф на главной странице.",
                        });
                        return;
                      }
                      throw new Error(data.error || "Ошибка генерации");
                    }

                    const generatedImageUrl = data.imageUrl;
                    consumeCreativeGeneration();

                    // Сохраняем в Supabase напрямую с клиента (если пользователь авторизован)
                    await saveImageToSupabase({
                      imageUrl: generatedImageUrl,
                      prompt: slidePrompt.trim() || null,
                      aspectRatio: slideAspectRatio,
                      generationMode: "for-product",
                      scenario: selectedScenario,
                    });

                    setSlides(
                      slides.map((s) => {
                        if (s.id === activeSlideId) {
                          // Нормализуем существующие варианты перед добавлением нового
                          const existingVariants: Variant[] = (s.variants || []).map(v => {
                            if (typeof v === 'object' && 'url' in v && 'aspectRatio' in v) {
                              return {
                                url: (v as Variant).url,
                                aspectRatio: (v as Variant).aspectRatio,
                                prompt: (v as Variant).prompt ?? s.prompt ?? "",
                                mediaType: (v as Variant).mediaType ?? "image" as const,
                              };
                            }
                            if (typeof v === 'string') {
                              return { url: v, aspectRatio: s.aspectRatio, prompt: s.prompt ?? "", mediaType: "image" as const };
                            }
                            return { url: String(v), aspectRatio: s.aspectRatio, prompt: s.prompt ?? "", mediaType: "image" as const };
                          });
                          
                          // Новые изображения добавляем в начало (сверху)
                          const newVariants = [
                            { url: generatedImageUrl, aspectRatio: slideAspectRatio, prompt: slidePrompt.trim() || "", mediaType: "image" as const },
                            ...existingVariants,
                          ];

                          return {
                            ...s,
                            variants: newVariants,
                            imageUrl: s.imageUrl || generatedImageUrl,
                            prompt: slidePrompt.trim() || null,
                            scenario: selectedScenario,
                            aspectRatio: slideAspectRatio, // Оставляем для обратной совместимости
                          };
                        }
                        return s;
                      })
                    );

                    setSlidePrompt("");
                    setSelectedScenario(null);
                    // Сбрасываем высоту textarea после небольшой задержки
                    setTimeout(() => {
                      const textarea = document.querySelector('textarea[placeholder*="Опишите"]') as HTMLTextAreaElement;
                      if (textarea) {
                        textarea.style.height = "48px";
                        textarea.style.overflowY = "hidden";
                      }
                    }, 100);
                  }
                } catch (error: unknown) {
                  if (error instanceof Error && error.name === "AbortError") return;
                  let message =
                    "Не удалось сгенерировать изображение. Пожалуйста, попробуйте ещё раз чуть позже.";
                  if (error instanceof Error && error.message?.trim()) {
                    message = error.message;
                  }
                  const contentFilter =
                    message.includes("фильтром безопасности") ||
                    message.includes("отклонён фильтром");
                  showToast({
                    type: "error",
                    title: contentFilter ? "Запрос не прошёл проверку" : "Ошибка генерации",
                    message,
                    ...(contentFilter ? { durationMs: 7000 } : {}),
                  });
                  setSlidePrompt("");
                  setTimeout(() => {
                    const textarea = document.querySelector('textarea[placeholder*="Опишите"]') as HTMLTextAreaElement;
                    if (textarea) {
                      textarea.style.height = "48px";
                      textarea.style.overflowY = "hidden";
                    }
                  }, 100);
                } finally {
                  setIsGeneratingSlide(false);
                  setIsVideoStarting(false);
                }
              }}
              disabled={isGeneratingSlide || isVideoStarting || activeSlideId === null}
              className="aspect-square h-full rounded-xl bg-[#4ADE80] flex items-center justify-center shadow-lg hover:shadow-xl transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              style={{ minHeight: "48px", minWidth: "48px" }}
            >
              {isGeneratingSlide || isVideoStarting ? (
                <Loader2 className="w-5 h-5 animate-spin text-white" />
              ) : (
                <ArrowRight className="w-5 h-5 text-white" />
              )}
            </motion.button>
          </motion.div>
        </motion.div>
      </div>

      {/* Промпт-модал для видео (без картинки) */}
      <AnimatePresence>
        {viewingPrompt && !viewingImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setViewingPrompt(null)}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-8"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              onClick={(e) => e.stopPropagation()}
              className="relative bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6"
            >
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Промпт</p>
              <p
                className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap break-words"
                style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
              >
                {viewingPrompt}
              </p>
              <div className="flex items-center gap-2 mt-5">
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    try {
                      await navigator.clipboard.writeText(viewingPrompt ?? "");
                      showToast({ type: "success", message: "Промпт скопирован" });
                    } catch {
                      showToast({ type: "error", message: "Не удалось скопировать" });
                    }
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium rounded-lg transition-colors"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Скопировать
                </button>
              </div>
              <button
                onClick={() => setViewingPrompt(null)}
                className="absolute top-4 right-4 w-8 h-8 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-full flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Модальное окно для просмотра изображения */}
      <AnimatePresence>
        {viewingImage && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setViewingImage(null);
                setViewingPrompt(null);
              }}
              className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[200] flex items-center justify-center p-8"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                onClick={(e) => e.stopPropagation()}
                className="relative max-w-[95vw] max-h-[95vh] flex flex-col"
              >
                <div className="flex-1 flex items-center justify-center min-h-0">
                  <img
                    src={viewingImage}
                    alt="Просмотр изображения"
                    className="max-w-full max-h-[85vh] w-auto h-auto object-contain"
                  />
                </div>
                {viewingPrompt && (
                  <div 
                    className="mt-4 px-4 pb-2 max-w-2xl mx-auto group/prompt relative"
                  >
                    <p 
                      className="text-xs font-semibold text-white/90 mb-1.5 uppercase tracking-wide"
                      style={{
                        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                        letterSpacing: '0.1em',
                      }}
                    >
                      Промпт
                    </p>
                    <p 
                      className="text-sm text-white leading-relaxed whitespace-pre-wrap break-words line-clamp-3"
                      style={{
                        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                        letterSpacing: '-0.01em',
                      }}
                    >
                      {viewingPrompt}
                    </p>
                    {/* Микро-окно при наведении: открывается ВВЕРХ над промптом, чтобы было видно */}
                    <div className="absolute left-0 right-0 bottom-full mb-1 opacity-0 pointer-events-none group-hover/prompt:opacity-100 group-hover/prompt:pointer-events-auto transition-opacity duration-150 z-10">
                      <div className="rounded-xl shadow-2xl bg-white/95 backdrop-blur-sm py-3 px-4 max-h-72 overflow-y-auto">
                        <p 
                          className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap break-words pr-10"
                          style={{
                            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                            letterSpacing: '-0.01em',
                          }}
                        >
                          {viewingPrompt}
                        </p>
                        <button
                          type="button"
                          onClick={async (e) => {
                            e.stopPropagation();
                            try {
                              await navigator.clipboard.writeText(viewingPrompt ?? "");
                              showToast({ type: "success", message: "Промпт скопирован" });
                            } catch {
                              showToast({ type: "error", message: "Не удалось скопировать" });
                            }
                          }}
                          className="absolute top-3 right-3 w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 flex items-center justify-center"
                          title="Копировать промпт"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                <button
                  onClick={() => {
                    setViewingImage(null);
                    setViewingPrompt(null);
                  }}
                  className="absolute top-4 right-4 w-10 h-10 bg-black/60 hover:bg-black/80 text-white rounded-full flex items-center justify-center transition-all backdrop-blur-sm"
                >
                  <X className="w-5 h-5" />
                </button>
              </motion.div>
            </motion.div>
          </>
        )}
      </AnimatePresence>


      {/* Кнопка "Сообщить о проблеме" - фиксированная в правом нижнем углу, маленькая и неприметная */}
      <motion.button
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.5, type: "spring", stiffness: 200 }}
        onClick={() => setIsBugReportOpen(true)}
        className="fixed bottom-6 right-6 z-40 p-2.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg shadow-md hover:shadow-lg transition-all flex items-center justify-center group border border-gray-300"
        title="Сообщить о проблеме"
      >
        <Wrench className="w-4 h-4 group-hover:rotate-12 transition-transform" />
      </motion.button>

      {/* Модальное окно отчета о неполадке */}
      <BugReportModal
        isOpen={isBugReportOpen}
        onClose={() => setIsBugReportOpen(false)}
        user={user}
      />

      <VideoGenerationGuideModal
        isOpen={isVideoGuideOpen}
        onClose={() => setIsVideoGuideOpen(false)}
        contextLabel={
          generationMode === "for-product" ? "Для товара · Видео" : "Свободное творчество · Видео"
        }
      />
      <PhotoGenerationGuideModal
        isOpen={isPhotoGuideOpen}
        onClose={() => setIsPhotoGuideOpen(false)}
      />
    </div>
  );
}
