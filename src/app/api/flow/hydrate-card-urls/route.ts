import { NextRequest, NextResponse } from "next/server";
import { ensureFlowCardDisplayUrl } from "@/lib/flow/cache-flow-card-image";

export const maxDuration = 120;

/**
 * Без WaveSpeed: скачиваем уже готовые CDN-URL в /api/serve-file для отображения в UI.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const raw = body?.urls;
    if (!Array.isArray(raw)) {
      return NextResponse.json({ error: "urls обязателен (массив)" }, { status: 400 });
    }

    const urls = await Promise.all(
      raw.map(async (item: unknown) => {
        if (item === null || item === undefined) return null;
        if (typeof item !== "string" || !item.trim()) return null;
        return ensureFlowCardDisplayUrl(item);
      })
    );

    return NextResponse.json({ success: true, urls });
  } catch (e) {
    console.error("[hydrate-card-urls]", e);
    return NextResponse.json({ success: false, error: "Ошибка подготовки URL" }, { status: 500 });
  }
}
