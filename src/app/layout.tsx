import type { Metadata } from "next";
import { Dancing_Script, Geist, Geist_Mono, Great_Vibes, Manrope, Playfair_Display } from "next/font/google";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { ToastProvider } from "@/components/ui/toast";
import { AbortErrorSuppressor } from "@/components/ui/abort-error-suppressor";
import { PreconnectLinks } from "@/components/ui/preconnect-links";
import { YandexMetrika } from "@/components/analytics/yandex-metrika";
import { CookieConsentBanner } from "@/components/analytics/cookie-consent-banner";
import { Suspense } from "react";
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

/** Основной RU-гротеск: hero, UI, кнопки. */
const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin", "cyrillic"],
  weight: ["300", "400", "500", "600", "700", "800"],
  display: "swap",
});

const playfairDisplay = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
});

const greatVibes = Great_Vibes({
  variable: "--font-great-vibes",
  weight: "400",
  subsets: ["latin"],
  display: "swap",
});

const dancingScript = Dancing_Script({
  variable: "--font-dancing-script",
  subsets: ["latin"],
  display: "swap",
});

const siteTitle =
  "KARTO — ИИ-помощник продавца: карточки, контент и автоотзывы";
const siteDescription =
  "ИИ-помощник для продавцов маркетплейсов: генерация карточек товара, SEO-описаний, фото и видео, автоответы на отзывы Wildberries, Ozon и Яндекс Маркет.";
const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://karto.pro";

export const metadata: Metadata = {
  title: siteTitle,
  description: siteDescription,
  keywords: [
    "KARTO",
    "автоотзывы",
    "автоответы на отзывы",
    "генерация карточек товара",
    "генерация контента для маркетплейсов",
    "Wildberries",
    "Ozon",
    "Яндекс Маркет",
    "ИИ для продавцов",
  ],
  metadataBase: new URL(siteUrl),
  icons: {
    icon: [
      // 120×120 — формат, который Яндекс явно рекомендует для выдачи (чётче в результатах поиска)
      { url: "/favicon-120x120.png", sizes: "120x120", type: "image/png" },
      { url: "/favicon.ico", sizes: "any", type: "image/x-icon" },
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
  const organizationJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "KARTO",
    url: siteUrl,
    logo: `${siteUrl}/favicon-120x120.png`,
    image: `${siteUrl}/favicon-120x120.png`,
    description: siteDescription,
  };

  const websiteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "KARTO",
    alternateName: ["Karto", "KARTO автоотзывы", "KARTO маркетплейсы"],
    url: siteUrl,
    description: siteDescription,
  };

  return (
    <html lang="ru" className="scroll-smooth">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${manrope.variable} ${playfairDisplay.variable} ${greatVibes.variable} ${dancingScript.variable} antialiased min-h-screen flex flex-col bg-background text-foreground`}
        suppressHydrationWarning
      >
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
        />
        <PreconnectLinks />
        <Suspense fallback={null}>
          <YandexMetrika />
        </Suspense>
        <CookieConsentBanner />
        <ToastProvider>
          <AbortErrorSuppressor />
          <Navbar />
          <main
            className="flex min-h-0 flex-grow flex-col w-full overflow-x-hidden"
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
