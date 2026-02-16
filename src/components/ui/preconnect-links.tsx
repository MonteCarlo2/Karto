"use client";

import { useEffect } from "react";

/**
 * Добавляет preconnect для внешних ресурсов (шрифты, API), чтобы браузер раньше устанавливал соединения.
 * Не блокирует отрисовку — выполняется после монтирования.
 */
export function PreconnectLinks() {
  useEffect(() => {
    const origins = [
      "https://fonts.googleapis.com",
      "https://fonts.gstatic.com",
    ];
    origins.forEach((href) => {
      const link = document.createElement("link");
      link.rel = "preconnect";
      link.href = href;
      link.crossOrigin = "anonymous";
      if (!document.querySelector(`link[href="${href}"]`)) {
        document.head.appendChild(link);
      }
    });
  }, []);
  return null;
}
