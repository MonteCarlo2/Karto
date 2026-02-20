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

  // Разрешаем внешние изображения для отображения результатов
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "replicate.delivery",
      },
      {
        protocol: "https",
        hostname: "pbxt.replicate.delivery",
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
