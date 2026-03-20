"use client";

import React from "react";
import { Camera, Video } from "lucide-react";

type ToggleSwitchProps = {
  /** false = Фото (левая), true = Видео (правая) */
  checked: boolean;
  onChange: (value: boolean) => void;
};

/**
 * Переключатель-пилюля с иконками Camera / Video.
 * Лаймовый блик плавно скользит под нужной иконкой.
 * Анимация с пружинным отскоком (cubic-bezier 1.6).
 */
export function ToggleSwitch({ checked, onChange }: ToggleSwitchProps) {
  return (
    <div
      style={{
        position: "relative",
        // ~2x size for better tap targets
        width: 168,
        height: 56,
        borderRadius: 28,
        background: "#EEEEF0",
        boxShadow: [
          "0 1px 4px rgba(0,0,0,0.09)",
          "inset 0 1px 2px rgba(0,0,0,0.06)",
        ].join(", "),
        border: "1px solid #DDDFE4",
        overflow: "hidden",
        userSelect: "none",
        flexShrink: 0,
      }}
    >
      {/* ─── Лаймовый блик — скользит от левого к правому ─── */}
      <div
        style={{
          position: "absolute",
          top: 6,
          bottom: 6,
          width: "calc(50% - 4px)",
          borderRadius: 22,
          background: "linear-gradient(135deg, #E2FF72 0%, #A6EE00 100%)",
          boxShadow: [
            "0 0 16px rgba(160,230,0,0.55)",
            "0 0 6px rgba(160,230,0,0.35)",
            "0 2px 5px rgba(0,0,0,0.08)",
          ].join(", "),
          left: checked ? "calc(50% + 2px)" : "6px",
          transition: "left 0.30s cubic-bezier(0.34, 1.6, 0.64, 1)",
          zIndex: 0,
        }}
      />

      {/* ─── Левая половина: Camera ─── */}
      <button
        type="button"
        aria-label="Фото"
        onClick={() => onChange(false)}
        style={{
          position: "absolute",
          left: 0, top: 0,
          width: "50%", height: "100%",
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "transparent", border: "none",
          cursor: "pointer", zIndex: 1, padding: 0,
        }}
      >
        <Camera
          size={24}
          strokeWidth={2.2}
          style={{
            color: !checked ? "#1C1C1C" : "#B8BAC0",
            transition: "color 0.20s ease",
          }}
        />
      </button>

      {/* ─── Правая половина: Video ─── */}
      <button
        type="button"
        aria-label="Видео"
        onClick={() => onChange(true)}
        style={{
          position: "absolute",
          right: 0, top: 0,
          width: "50%", height: "100%",
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "transparent", border: "none",
          cursor: "pointer", zIndex: 1, padding: 0,
        }}
      >
        <Video
          size={24}
          strokeWidth={2.2}
          style={{
            color: checked ? "#1C1C1C" : "#B8BAC0",
            transition: "color 0.20s ease",
          }}
        />
      </button>
    </div>
  );
}
