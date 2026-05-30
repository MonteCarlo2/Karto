import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Автоответы — панель управления — KARTO",
  description:
    "Настройка режимов ответов на отзывы, шаблоны, подключение кабинета маркетплейса.",
};

export default function AutoRepliesWorkspaceLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
