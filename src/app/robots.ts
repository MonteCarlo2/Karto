import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://karto.pro";

  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: `${baseUrl.replace(/\/$/, "")}/sitemap.xml`,
    host: baseUrl.replace(/^https?:\/\//, "").replace(/\/$/, ""),
  };
}

