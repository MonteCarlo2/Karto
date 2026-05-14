import { NextRequest, NextResponse } from "next/server";
import { generateBrandNameOptions } from "@/lib/services/brand-name-openrouter";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_NICHE = 200;
const MAX_DESC = 8000;
const MAX_HINTS = 600;

export async function POST(request: NextRequest) {
  try {
    let body: { niche?: string; description?: string; hints?: string };
    try {
      body = (await request.json()) as { niche?: string; description?: string; hints?: string };
    } catch {
      return NextResponse.json({ error: "Нужен JSON с полями niche и description" }, { status: 400 });
    }
    const niche = String(body.niche ?? "").trim();
    const description = String(body.description ?? "").trim();
    const hints = String(body.hints ?? "").trim().slice(0, MAX_HINTS);
    if (!niche || niche.length > MAX_NICHE) {
      return NextResponse.json({ error: "Укажите нишу" }, { status: 400 });
    }
    if (description.length < 20 || description.length > MAX_DESC) {
      return NextResponse.json(
        { error: "Описание должно быть от 20 символов" },
        { status: 400 }
      );
    }
    const result = await generateBrandNameOptions(niche, description, hints);
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[brand/generate-names]", msg);
    return NextResponse.json(
      { error: msg || "Не удалось сгенерировать названия" },
      { status: 503 }
    );
  }
}
