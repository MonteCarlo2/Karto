"use client";

import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";

const VIDEOS = [
  "/hero-video-1.mp4",
  "/hero-video-2.mp4",
  "/hero-video-3.mp4",
  "/hero-video-4.mp4",
];

export function VideoHero() {
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
  const [nextVideoIndex, setNextVideoIndex] = useState(1);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const currentVideoRef = useRef<HTMLVideoElement>(null);
  const nextVideoRef = useRef<HTMLVideoElement>(null);

  // Случайный выбор первого видео при загрузке
  useEffect(() => {
    const randomIndex = Math.floor(Math.random() * VIDEOS.length);
    setCurrentVideoIndex(randomIndex);
    setNextVideoIndex((randomIndex + 1) % VIDEOS.length);
  }, []);

  // Обработка окончания текущего видео
  useEffect(() => {
    const currentVideo = currentVideoRef.current;
    const nextVideo = nextVideoRef.current;
    
    if (!currentVideo || !nextVideo) return;

    const handleEnded = () => {
      // Начинаем плавный переход
      setIsTransitioning(true);
      
      // Запускаем следующее видео
      nextVideo.currentTime = 0;
      nextVideo.play().catch(() => {});
      
      // После завершения перехода меняем индексы
      setTimeout(() => {
        setCurrentVideoIndex(nextVideoIndex);
        setNextVideoIndex((nextVideoIndex + 1) % VIDEOS.length);
        setIsTransitioning(false);
        
        // Сбрасываем текущее видео для следующего цикла
        currentVideo.currentTime = 0;
        currentVideo.load();
      }, 1000); // 1 секунда на переход
    };

    currentVideo.addEventListener("ended", handleEnded);
    
    // Предзагрузка следующего видео
    nextVideo.preload = "auto";
    nextVideo.src = VIDEOS[nextVideoIndex];

    return () => {
      currentVideo.removeEventListener("ended", handleEnded);
    };
  }, [currentVideoIndex, nextVideoIndex]);

  return (
    <div className="relative w-full h-full overflow-hidden">
      {/* Текущее видео */}
      <motion.video
        ref={currentVideoRef}
        autoPlay
        loop={false}
        muted
        playsInline
        preload="auto"
        className="absolute inset-0 w-full h-full object-cover video-sharp"
        initial={{ opacity: 1 }}
        animate={{ opacity: isTransitioning ? 0 : 1 }}
        transition={{ duration: 1, ease: "easeInOut" }}
        style={{
          willChange: "opacity",
          transform: "translateZ(0) scale(1)",
          backfaceVisibility: "hidden",
          WebkitTransform: "translateZ(0) scale(1)",
        }}
      >
        <source src={VIDEOS[currentVideoIndex]} type="video/mp4" />
      </motion.video>

      {/* Следующее видео (для плавного перехода) */}
      <motion.video
        ref={nextVideoRef}
        muted
        playsInline
        loop={false}
        preload="auto"
        className="absolute inset-0 w-full h-full object-cover video-sharp"
        initial={{ opacity: 0 }}
        animate={{ opacity: isTransitioning ? 1 : 0 }}
        transition={{ duration: 1, ease: "easeInOut" }}
        style={{
          willChange: "opacity",
          transform: "translateZ(0) scale(1)",
          backfaceVisibility: "hidden",
          WebkitTransform: "translateZ(0) scale(1)",
        }}
      >
        <source src={VIDEOS[nextVideoIndex]} type="video/mp4" />
      </motion.video>

      {/* Overlay для затемнения */}
      <div className="absolute inset-0 bg-black/20"></div>
    </div>
  );
}
