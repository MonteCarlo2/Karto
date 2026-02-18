# KARTO in search (Yandex and Google)

To have KARTO appear when users search for "KARTO":

## Yandex
1. **Webmaster:** https://webmaster.yandex.ru/ — add site, verify (HTML file or DNS).
2. **Sitemap:** Submit sitemap URL (e.g. https://karto.pro/sitemap.xml).
3. **Re-crawl:** Request re-indexing of the main page.

## Google
1. **Search Console:** https://search.google.com/search-console — add property, verify.
2. **Sitemap:** Add sitemap in the Sitemaps section.
3. **URL inspection:** Request indexing for the homepage.

## On the site
- Homepage `<title>` and `description` should contain "KARTO" (already in layout.tsx).
- Add sitemap.xml if missing; allow crawling in robots.txt.

Indexing usually takes a few days to 1–2 weeks.
