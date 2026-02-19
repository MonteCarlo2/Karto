import { NextResponse } from "next/server";

const BASE_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://karto.pro").replace(/\/$/, "");

const URLS = [
  { loc: `${BASE_URL}/`, changefreq: "daily", priority: "1" },
  { loc: `${BASE_URL}/pricing`, changefreq: "weekly", priority: "0.9" },
  { loc: `${BASE_URL}/studio`, changefreq: "weekly", priority: "0.8" },
  { loc: `${BASE_URL}/studio/understanding`, changefreq: "weekly", priority: "0.7" },
  { loc: `${BASE_URL}/studio/description`, changefreq: "weekly", priority: "0.7" },
  { loc: `${BASE_URL}/studio/visual`, changefreq: "weekly", priority: "0.7" },
  { loc: `${BASE_URL}/studio/price`, changefreq: "weekly", priority: "0.7" },
  { loc: `${BASE_URL}/studio/free`, changefreq: "weekly", priority: "0.7" },
  { loc: `${BASE_URL}/login`, changefreq: "monthly", priority: "0.3" },
  { loc: `${BASE_URL}/profile`, changefreq: "monthly", priority: "0.3" },
  { loc: `${BASE_URL}/ai-policy`, changefreq: "yearly", priority: "0.2" },
  { loc: `${BASE_URL}/payments-policy`, changefreq: "yearly", priority: "0.2" },
  { loc: `${BASE_URL}/policy-and-terms`, changefreq: "yearly", priority: "0.2" },
  { loc: `${BASE_URL}/data-processing`, changefreq: "yearly", priority: "0.2" },
  { loc: `${BASE_URL}/privacy`, changefreq: "yearly", priority: "0.2" },
  { loc: `${BASE_URL}/terms`, changefreq: "yearly", priority: "0.2" },
];

function buildSitemapXml(): string {
  const urlEntries = URLS.map(
    (u) =>
      `  <url><loc>${escapeXml(u.loc)}</loc><changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`
  ).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlEntries}
</urlset>`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * GET /api/sitemap-xml — отдаёт sitemap для роботов (rewrite с /sitemap.xml).
 * Google и Яндекс должны получать 200 OK и application/xml.
 */
export async function GET() {
  const xml = buildSitemapXml();
  return new NextResponse(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
