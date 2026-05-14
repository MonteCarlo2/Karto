import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Нативный ffmpeg-installer тянет platform-пакеты через относительные пути —
  // Turbopack/Webpack не должны их бандлить (иначе «Can't resolve … package.json»).
  serverExternalPackages: [
    "@ffmpeg-installer/ffmpeg",
    "@ffmpeg-installer/win32-x64",
    "@ffmpeg-installer/win32-ia32",
    "@ffmpeg-installer/linux-x64",
    "@ffmpeg-installer/linux-arm64",
    "@ffmpeg-installer/linux-arm",
    "@ffmpeg-installer/linux-ia32",
    "@ffmpeg-installer/darwin-x64",
    "@ffmpeg-installer/darwin-arm64",
  ],

  // Для Timeweb (Node.js) — только standalone. НЕ использовать output: 'export'
  // (export = статический /out, тогда статика не отдаётся нашим сервером).
  output: "standalone",

  // Меньше размер .next и образа Docker, быстрее пуш в реестр (без карт в браузере).
  productionBrowserSourceMaps: false,

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
