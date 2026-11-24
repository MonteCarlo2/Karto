import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Мастерская — KARTO",
  description: "Дополнительные инструменты: Поток, Креатив, Автоответы, Юнит-экономика, SEO-описания, ваши потоки и создание бренда.",
};

export default function WorkshopLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
