"use client";

import { useEffect } from "react";

/** Последняя страховка: сбой в самом каркасе сайта тоже не показывает человеку технический текст. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[app] сбой каркаса:", error);
    const timer = setTimeout(reset, 2500);
    return () => clearTimeout(timer);
  }, [error, reset]);
  return (
    <html lang="ru">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#FDFDFB", color: "#011408" }}>
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, textAlign: "center", padding: 24 }}>
          <p style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>Обновляем страницу</p>
          <p style={{ fontSize: 15, margin: 0, color: "#3E4C3F" }}>Это займёт несколько секунд.</p>
          <button type="button" onClick={reset} style={{ border: "1px solid #7DB36A", borderRadius: 999, padding: "8px 20px", background: "#fff", fontWeight: 600, cursor: "pointer" }}>
            Обновить
          </button>
        </div>
      </body>
    </html>
  );
}
