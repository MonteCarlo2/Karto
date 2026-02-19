import type { Metadata } from "next";
import { Geist, Geist_Mono, Playfair_Display } from "next/font/google";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { ToastProvider } from "@/components/ui/toast";
import { AbortErrorSuppressor } from "@/components/ui/abort-error-suppressor";
import { PreconnectLinks } from "@/components/ui/preconnect-links";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

const playfairDisplay = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
});

const siteTitle = "KARTO — Создание карточек товара для маркетплейсов";
const siteDescription =
  "Профессиональный инструмент для продавцов. Создавайте идеальные карточки товаров с правильным описанием, ценой и изображениями.";
const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://karto.pro";

export const metadata: Metadata = {
  title: siteTitle,
  description: siteDescription,
  metadataBase: new URL(siteUrl),
  icons: {
    icon: [
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: "/favicon-32x32.png",
  },
  openGraph: {
    type: "website",
    url: siteUrl,
    title: siteTitle,
    description: siteDescription,
    siteName: "KARTO",
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: siteDescription,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" className="scroll-smooth">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${playfairDisplay.variable} antialiased min-h-screen flex flex-col bg-background text-foreground`}
        suppressHydrationWarning
      >
        <PreconnectLinks />
        <ToastProvider>
          <AbortErrorSuppressor />
          <Navbar />
          <main
            className="flex-grow flex flex-col w-full overflow-x-hidden"
            style={{ maxWidth: "100vw" }}
          >
            {children}
          </main>
          <Footer />
        </ToastProvider>
      </body>
    </html>
  );
}
