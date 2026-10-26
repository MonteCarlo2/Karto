import { NextRequest, NextResponse } from "next/server";
import { requireSellerHubUser } from "@/lib/seller-hub/access";
import { readCardSellability } from "@/lib/seller-hub/card-sellability";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const auth = await requireSellerHubUser(request);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  let body: {
    title?: string;
    description?: string;
    brand?: string | null;
    category?: string | null;
    photos?: number;
    hasVideo?: boolean;
    dimensions?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Нужен JSON" }, { status: 400 });
  }

  const title = body.title?.trim() ?? "";
  if (!title) {
    return NextResponse.json({ ok: false, error: "Нет названия карточки" }, { status: 400 });
  }

  try {
    const text = await readCardSellability({
      title,
      description: body.description ?? "",
      brand: body.brand,
      category: body.category,
      photos: Number.isFinite(body.photos) ? Number(body.photos) : 0,
      hasVideo: Boolean(body.hasVideo),
      dimensions: body.dimensions,
    });
    return NextResponse.json({ ok: true, text });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Разбор не собрался";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
