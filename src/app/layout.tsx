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

const siteTitle = "KARTO — Генерация карточек товара для маркетплейсов";
const siteDescription =
  "Генерация карточек товара для маркетплейсов: идеальное описание, цена и изображения. Профессиональный инструмент для продавцов Wildberries, Ozon и др.";
const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://karto.pro";

export const metadata: Metadata = {
  title: siteTitle,
  description: siteDescription,
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
    alternateName: "Karto",
    url: siteUrl,
    description: siteDescription,
  };

  return (
    <html lang="ru" className="scroll-smooth">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${playfairDisplay.variable} antialiased min-h-screen flex flex-col bg-background text-foreground`}
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
