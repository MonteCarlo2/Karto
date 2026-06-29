"use client";

/**
 * Раньше preconnect к fonts.googleapis.com — в РФ без VPN это тормозило первую отрисовку.
 * Шрифты теперь self-hosted через next/font в layout.tsx.
 */
export function PreconnectLinks() {
  return null;
}
