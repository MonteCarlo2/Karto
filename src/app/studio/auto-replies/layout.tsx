import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Spectral } from "next/font/google";

/** Спокойный editorial-шрифт с кириллицей для мастера автоответов (заголовки и читабельный текст). */
const autoRepliesSerif = Spectral({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-auto-replies-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Автоответы на отзывы — Мастерская KARTO",
  description:
    "Ручной, полуавтоматический и автоматический режим ответов на отзывы. Выбор маркетплейса.",
};

export default function AutoRepliesLayout({ children }: { children: ReactNode }) {
  return <div className={`${autoRepliesSerif.variable} min-h-screen`}>{children}</div>;
}
