import { NextRequest, NextResponse } from "next/server";
import {
  isOpenRouterConfigured,
  suggestProductNameCompletionsOpenRouter,
} from "@/lib/services/openrouter-product-vision";

export async function POST(request: NextRequest) {
  try {
    const { text } = await request.json();

    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "Текст не предоставлен" }, { status: 400 });
    }

    const words = text.trim().split(/\s+/).filter((w) => w.length > 0);
    if (words.length === 0 || words.length > 4) {
      return NextResponse.json({ suggestions: [] });
    }

    if (!isOpenRouterConfigured()) {
      return NextResponse.json({ suggestions: [] });
    }

    console.log("🔄 Генерируем подсказки для:", text);

    try {
      const suggestions = await suggestProductNameCompletionsOpenRouter(text);
      console.log("✅ Подсказки сгенерированы:", suggestions);
      return NextResponse.json({ suggestions });
    } catch (error) {
      console.error("❌ Ошибка генерации подсказок:", error);
      return NextResponse.json({ suggestions: [] });
    }
  } catch (error) {
    console.error("❌ Ошибка API:", error);
    return NextResponse.json({ error: "Ошибка при генерации подсказок" }, { status: 500 });
  }
}
