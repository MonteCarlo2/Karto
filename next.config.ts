import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
