import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Seller Hub — Мастерская KARTO",
  description: "Единый каталог SKU и API-хаб для Wildberries, Ozon и Яндекс Маркета.",
};

export default function SellerHubLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-screen antialiased">{children}</div>;
}
