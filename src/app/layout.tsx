import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "KARTO — Создание карточек товара для маркетплейсов",
  description: "Профессиональный инструмент для продавцов. Создавайте идеальные карточки товаров с правильным описанием, ценой и изображениями.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" className="scroll-smooth">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen flex flex-col bg-background text-foreground`}
        suppressHydrationWarning
      >
        <Navbar />
        <main className="flex-grow flex flex-col w-full overflow-x-hidden" style={{ maxWidth: '100vw' }}>
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
