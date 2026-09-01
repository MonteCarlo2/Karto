"use client";

import * as React from "react";

interface VideoBackgroundProps {
  src: string;
  poster?: string;
  className?: string;
  startAtEnd?: boolean;
}

export const VideoBackground = React.forwardRef<HTMLVideoElement, VideoBackgroundProps>(
  function VideoBackground({ src, poster, className = "", startAtEnd = false }, ref) {
    const videoRef = React.useRef<HTMLVideoElement>(null);

    React.useImperativeHandle(ref, () => videoRef.current as HTMLVideoElement);

    React.useEffect(() => {
      const video = videoRef.current;
      if (!video) return;

      const freezeAtEnd = () => {
        if (video.duration && !Number.isNaN(video.duration)) {
          video.currentTime = video.duration;
        }
        video.pause();
      };

      const handleEnded = () => {
        freezeAtEnd();
      };

      video.addEventListener("ended", handleEnded);

      if (startAtEnd) {
        if (video.readyState >= 1) freezeAtEnd();
        else video.addEventListener("loadedmetadata", freezeAtEnd, { once: true });
      }

      return () => {
        video.removeEventListener("ended", handleEnded);
        video.removeEventListener("loadedmetadata", freezeAtEnd);
      };
    }, [startAtEnd]);

    return (
      <video
        ref={videoRef}
        autoPlay={!startAtEnd}
        muted
        playsInline
        preload="auto"
        poster={poster}
        className={className}
        style={{
          objectFit: "cover",
          objectPosition: "center",
          width: "100%",
          height: "100%",
          maxWidth: "100%",
          maxHeight: "100%",
          transform: "translateZ(0)",
          backfaceVisibility: "hidden",
        }}
      >
        <source src={src} type="video/mp4" />
      </video>
    );
  }
);

VideoBackground.displayName = "VideoBackground";
