import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone-сборка: один сервер отдаёт и HTML, и /_next/static (JS/CSS).
  // На хостинге после сборки запускать: npm run start (или node .next/standalone/server.js).
  output: "standalone",

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
