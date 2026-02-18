import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Для Timeweb (Node.js) — только standalone. НЕ использовать output: 'export'
  // (export = статический /out, тогда статика не отдаётся нашим сервером).
  output: "standalone",

  // Браузер по умолчанию запрашивает /favicon.ico — отдаём наш логотип, чтобы не было мелькания
  async rewrites() {
    return [{ source: "/favicon.ico", destination: "/favicon-32x32.png" }];
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
