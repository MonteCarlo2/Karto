import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Для Timeweb (Node.js) — только standalone. НЕ использовать output: 'export'
  // (export = статический /out, тогда статика не отдаётся нашим сервером).
  output: "standalone",

  async rewrites() {
    return [
      // Не делаем редирект с /favicon.ico — Яндекс считает это ошибкой («Файл перенаправляет на другой адрес»). Отдаём реальный favicon.ico из public (создаётся в prebuild).
      { source: "/sitemap.xml", destination: "/api/sitemap-xml" },
    ];
  },

  // Без оптимизации на лету: в standalone на Timeweb/Docker нет прав на запись в
  // .next/cache/images → EACCES, SIGTERM, «вечная загрузка» и таймауты API.
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "replicate.delivery",
      },
      {
        protocol: "https",
        hostname: "pbxt.replicate.delivery",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },

  // Увеличиваем лимит для API routes (для загрузки изображений)
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
