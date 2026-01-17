"use client";

import { useEffect, useRef } from "react";

interface VideoBackgroundProps {
  src: string;
  className?: string;
}

export function VideoBackground({ src, className = "" }: VideoBackgroundProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Когда видео заканчивается, останавливаем его на последнем кадре
    const handleEnded = () => {
      video.pause();
      // Устанавливаем время на самый последний кадр
      if (video.duration && !isNaN(video.duration)) {
        video.currentTime = video.duration;
      }
    };

    video.addEventListener("ended", handleEnded);

    return () => {
      video.removeEventListener("ended", handleEnded);
    };
  }, []);

  return (
    <video
      ref={videoRef}
      autoPlay
      muted
      playsInline
      className={className}
      style={{
        objectFit: "cover",
        objectPosition: "center",
        width: "100%",
        height: "100%",
        maxWidth: "100%",
        maxHeight: "100%",
      }}
    >
      <source src={src} type="video/mp4" />
    </video>
  );
}
