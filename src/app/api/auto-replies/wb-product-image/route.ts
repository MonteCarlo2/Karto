import { NextRequest, NextResponse } from "next/server";
import {
  buildWbProductImageCandidates,
  fetchWbBasketRoutes,
  resolveWbProductImageUrl,
} from "@/lib/auto-replies/wb-basket-routes";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const nmId = Number(request.nextUrl.searchParams.get("nmId"));
  if (!Number.isFinite(nmId) || nmId <= 0) {
    return new NextResponse(null, { status: 400 });
  }

  const routes = await fetchWbBasketRoutes();
  const resolved = await resolveWbProductImageUrl(nmId);
  const candidates = resolved ? [resolved, ...buildWbProductImageCandidates(nmId, routes)] : buildWbProductImageCandidates(nmId, routes);
  const unique = [...new Set(candidates)];

  for (const url of unique) {
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "image/*",
          "User-Agent": "Mozilla/5.0 (compatible; KARTO/1.0)",
        },
        cache: "force-cache",
        next: { revalidate: 86400 },
      });
      if (!res.ok) continue;

      const contentType = res.headers.get("content-type") ?? "image/webp";
      const body = await res.arrayBuffer();

      return new NextResponse(body, {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
        },
      });
    } catch {
      continue;
    }
  }

  return new NextResponse(null, { status: 404 });
}
