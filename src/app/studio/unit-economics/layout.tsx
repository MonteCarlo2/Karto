import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Юнит-экономика — Мастерская KARTO",
  description: "Расчёт маржинальности и прибыли для Ozon и Wildberries.",
};

export default function UnitEconomicsLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-screen antialiased">{children}</div>;
}
