"use client";

import * as React from "react";

interface VideoBackgroundProps {
  src: string;
  poster?: string;
  className?: string;
}

export const VideoBackground = React.forwardRef<HTMLVideoElement, VideoBackgroundProps>(
  function VideoBackground({ src, poster, className = "" }, ref) {
    const videoRef = React.useRef<HTMLVideoElement>(null);

    React.useImperativeHandle(ref, () => videoRef.current as HTMLVideoElement);

    React.useEffect(() => {
      const video = videoRef.current;
      if (!video) return;

      const handleEnded = () => {
        video.pause();
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
