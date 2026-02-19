import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://karto.pro").replace(/\/$/, "");
  const now = new Date();

  const urls: MetadataRoute.Sitemap = [
    { url: `${baseUrl}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${baseUrl}/pricing`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${baseUrl}/studio`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${baseUrl}/studio/understanding`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${baseUrl}/studio/description`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${baseUrl}/studio/visual`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${baseUrl}/studio/price`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${baseUrl}/studio/free`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${baseUrl}/login`, lastModified: now, changeFrequency: "monthly", priority: 0.3 },
    { url: `${baseUrl}/profile`, lastModified: now, changeFrequency: "monthly", priority: 0.3 },
    { url: `${baseUrl}/ai-policy`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: `${baseUrl}/payments-policy`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: `${baseUrl}/policy-and-terms`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: `${baseUrl}/data-processing`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: `${baseUrl}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: `${baseUrl}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
  ];

  return urls;
}

