/** Хосты для референсов логотипа (совпадают по духу с media/download + KIE CDN). */

export function isLogoReferenceRemoteHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h.includes("aiquickdraw.com")) return true;
  if (h.includes("redpandaai.co")) return true;
  if (h === "kie.ai" || h.endsWith(".kie.ai")) return true;
  if (h.endsWith(".supabase.co") || h.endsWith(".supabase.in")) return true;
  if (h.endsWith(".blob.vercel-storage.com")) return true;
  if (h === "replicate.delivery" || h.endsWith(".replicate.delivery")) return true;
  if (h === "localhost" || h.startsWith("localhost:")) return true;
  if (h === "127.0.0.1" || h.startsWith("127.0.0.1:")) return true;

  const site = process.env.NEXT_PUBLIC_SITE_URL;
  try {
    if (site?.trim()) {
      const sh = new URL(site.trim()).hostname.toLowerCase();
      if (sh && sh === h) return true;
    }
  } catch {
    /* ignore */
  }

  try {
    const vercel = process.env.VERCEL_URL;
    if (vercel?.trim()) {
      const vh = new URL(`https://${vercel.trim().replace(/^https?:\/\//, "")}`).hostname.toLowerCase();
      if (vh && vh === h) return true;
    }
  } catch {
    /* ignore */
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  try {
    if (appUrl?.trim()) {
      const ah = new URL(appUrl.startsWith("http") ? appUrl : `https://${appUrl}`).hostname.toLowerCase();
      if (ah && ah === h) return true;
    }
  } catch {
    /* ignore */
  }

  return false;
}

export function sanitizeLogoReferenceInputs(raw: unknown[]): string[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: string[] = [];
  for (const item of list) {
    if (typeof item !== "string") continue;
    const u = item.trim();
    if (!u) continue;
    if (/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(u)) {
      out.push(u);
      continue;
    }
    if (u.startsWith("https://")) {
      try {
        const parsed = new URL(u);
        if (isLogoReferenceRemoteHost(parsed.hostname)) out.push(u);
      } catch {
        /* ignore */
      }
      continue;
    }
    if (u.startsWith("http://")) {
      try {
        const parsed = new URL(u);
        if (isLogoReferenceRemoteHost(parsed.hostname)) out.push(u);
      } catch {
        /* ignore */
      }
    }
  }
  return out.slice(0, 2);
}
