"use client";

import { useEffect, useRef, useState } from "react";
import { Play } from "lucide-react";
import Hls from "hls.js";

function isStream(src: string): boolean {
  return /\.m3u8(\?|$)/i.test(src);
}

export function CardVideo({ src, mode }: { src: string; mode: "thumb" | "stage" }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    setPlaying(false);

    if (!isStream(src) || video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
      return;
    }

    if (!Hls.isSupported()) {
      video.src = src;
      return;
    }

    const hls = new Hls();
    hls.loadSource(src);
    hls.attachMedia(video);
    return () => {
      hls.destroy();
    };
  }, [src]);

  return (
    <div className={mode === "thumb" ? "relative h-full w-full" : "relative mx-auto w-fit max-w-full"}>
      <video
        ref={ref}
        controls={mode === "stage" && playing}
        playsInline
        muted={mode === "thumb"}
        preload="metadata"
        className={
          mode === "thumb"
            ? "pointer-events-none h-full w-full object-contain"
            : "max-h-[480px] w-auto max-w-full bg-black object-contain"
        }
      />
      {mode === "stage" && !playing ? (
        <button
          type="button"
          className="absolute inset-0 flex items-center justify-center"
          aria-label="Смотреть видео"
          onClick={() => {
            const video = ref.current;
            if (!video) return;
            video.muted = false;
            void video.play();
            setPlaying(true);
          }}
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-full border bg-white" style={{ borderColor: "#0E1116" }}>
            <Play className="ml-0.5 h-6 w-6" fill="#0E1116" />
          </span>
        </button>
      ) : null}
    </div>
  );
}
