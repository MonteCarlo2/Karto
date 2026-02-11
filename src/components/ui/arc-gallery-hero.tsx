"use client";

import React, { useEffect, useState } from 'react';
import { useInView } from "framer-motion"
import { cn } from "@/lib/utils";

type ArcGalleryHeroProps = {
  images?: string[];
  startAngle?: number;
  endAngle?: number;
  radiusLg?: number;
  radiusMd?: number;
  radiusSm?: number;
  cardSizeLg?: number;
  cardSizeMd?: number;
  cardSizeSm?: number;
  className?: string;
  children?: React.ReactNode;
};

function seededUnit(value: string, salt: number) {
  let hash = 2166136261 ^ salt
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return ((hash >>> 0) % 10000) / 10000
}

export const ArcGalleryHero: React.FC<ArcGalleryHeroProps> = ({
  images = [],
  // Start from Left (160) to Right (20) so items are ordered naturally
  startAngle = 160, 
  endAngle = 20,
  radiusLg = 520, // Increased radius for flatter arc
  radiusMd = 380,
  radiusSm = 280,
  cardSizeLg = 160, 
  cardSizeMd = 130,
  cardSizeSm = 100,
  className = '',
  children,
}) => {
  const containerRef = React.useRef<HTMLDivElement>(null)
  const isInView = useInView(containerRef, { amount: 0.3, once: true })
  const [mounted, setMounted] = useState(false)
  const [dimensions, setDimensions] = useState({
    radius: radiusLg,
    cardSize: cardSizeLg,
  });

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      if (width < 640) {
        setDimensions({ radius: radiusSm, cardSize: cardSizeSm });
      } else if (width < 1024) {
        setDimensions({ radius: radiusMd, cardSize: cardSizeMd });
      } else {
        setDimensions({ radius: radiusLg, cardSize: cardSizeLg });
      }
    };

    handleResize(); // Set initial size
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [radiusLg, radiusMd, radiusSm, cardSizeLg, cardSizeMd, cardSizeSm]);

  // Ensure at least 2 points to distribute angles for the arc calculation
  const count = Math.max(images.length, 2);
  const step = (endAngle - startAngle) / (count - 1);
  const shuffledImages = React.useMemo(() => {
    return [...images].sort((a, b) => seededUnit(a, 11) - seededUnit(b, 11))
  }, [images])

  return (
    <div ref={containerRef} className={cn("relative overflow-hidden flex flex-col", className)}>
      {/* Background ring container that controls geometry */}
      <div
        className="relative mx-auto pointer-events-none"
        style={{
          width: '100%',
          // Give it a bit more height to prevent clipping
          height: dimensions.radius * 1.25, 
        }}
      >
        {/* Center pivot for transforms - positioned at bottom center */}
        <div className="absolute left-1/2 bottom-0 -translate-x-1/2">
          {mounted && shuffledImages.map((src, i) => {
            const angle = startAngle + step * i; // degrees
            const angleRad = (angle * Math.PI) / 180;
            
            // Calculate x and y positions on the arc
            const jitterX = (seededUnit(src, 1) - 0.5) * 42
            const jitterY = (seededUnit(src, 2) - 0.5) * 36
            const sizeFactor = 0.92 + seededUnit(src, 3) * 0.18
            const x = Math.cos(angleRad) * dimensions.radius + jitterX;
            const y = Math.sin(angleRad) * dimensions.radius + jitterY;
            
            // Calculate rotation to make cards face the center (fan effect)
            // 90 is top/center. <90 tilts right, >90 tilts left.
            // We want 160 (left) to tilt left (-70deg from upright)
            const rotation = 90 - angle + (seededUnit(src, 4) - 0.5) * 14;

            return (
              <div
                key={i}
                className={cn(
                  "absolute opacity-0",
                  isInView && "animate-fade-in-up"
                )}
                style={{
                  width: dimensions.cardSize * sizeFactor,
                  height: dimensions.cardSize * 1.33 * sizeFactor, // Aspect ratio 3:4
                  left: `calc(50% + ${x}px)`,
                  bottom: `${y}px`,
                  transform: `translate(-50%, ${isInView ? "50%" : "58%"})`,
                  animationDelay: `${i * 100}ms`,
                  animationFillMode: 'forwards',
                  zIndex: count - Math.abs(i - count/2), // Center items on top
                }}
              >
                <div 
                  className="rounded-xl shadow-2xl overflow-hidden ring-4 ring-white bg-white transition-all duration-500 hover:scale-110 hover:z-50 hover:ring-white w-full h-full"
                  style={{ 
                    transform: `rotate(${rotation}deg)`, 
                  }}
                >
                  <img
                    src={src}
                    alt={`Gallery ${i + 1}`}
                    className="block w-full h-full object-cover"
                    draggable={false}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Content positioned below the arc */}
      <div className="relative z-10 flex-1 flex items-center justify-center px-4 -mt-40 sm:-mt-48 md:-mt-56 lg:-mt-64 pb-10">
        <div
          className={cn(
            "w-full max-w-4xl opacity-0",
            isInView && "animate-fade-in"
          )}
          style={{ animationDelay: '800ms', animationFillMode: 'forwards' }}
        >
          {children}
        </div>
      </div>
      
      {/* CSS for animations */}
      <style>{`
        @keyframes fade-in-up {
          from {
            opacity: 0;
            transform: translate(-50%, 60%) scale(0.8);
          }
          to {
            opacity: 1;
            transform: translate(-50%, 50%) scale(1);
          }
        }
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fade-in-up {
          animation-name: fade-in-up;
          animation-duration: 0.8s;
          animation-timing-function: cubic-bezier(0.2, 0.8, 0.2, 1);
        }
        .animate-fade-in {
          animation-name: fade-in;
          animation-duration: 0.8s;
          animation-timing-function: ease-out;
        }
      `}</style>
    </div>
  );
};
