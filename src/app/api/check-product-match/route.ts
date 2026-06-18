import { NextRequest, NextResponse } from "next/server";
import {
  getProductNamesWithVisionFallback,
  isOpenRouterConfigured,
  productNamesMatch,
} from "@/lib/services/openrouter-product-vision";

/**
 * Проверка соответствия товара на фото и названия товара
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { productName, photoUrl } = body;

    if (!productName || !photoUrl) {
      return NextResponse.json(
        {
          success: false,
          error: "Требуется название товара и фото",
        },
        { status: 400 }
      );
    }

    if (!isOpenRouterConfigured()) {
      return NextResponse.json({
        success: true,
        mismatch: false,
        message: "Проверка пропущена: OPENROUTER_API_KEY не настроен",
      });
    }

    try {
      console.log("🔍 [CHECK] Проверяю соответствие товара (OpenRouter)...");
      const recognizedNames = await getProductNamesWithVisionFallback(photoUrl);

      if (recognizedNames.length > 0) {
        if (!productNamesMatch(productName, recognizedNames)) {
          return NextResponse.json({
            success: false,
            mismatch: true,
            recognizedProduct: recognizedNames[0],
            currentProduct: productName,
            message: `На фотографии распознан товар: "${recognizedNames[0]}", а указано название: "${productName}"`,
          });
        }

        return NextResponse.json({
          success: true,
          mismatch: false,
          message: "Товар соответствует названию",
        });
      }

      return NextResponse.json({
        success: true,
        mismatch: false,
        message: "Не удалось распознать товар, но продолжаем",
      });
    } catch (error) {
      console.warn("⚠️ [CHECK] Ошибка проверки:", (error as Error).message);
      return NextResponse.json({
        success: true,
        mismatch: false,
        message: "Проверка не удалась, но продолжаем",
      });
    }
  } catch (error) {
    console.error("❌ [CHECK] Ошибка API:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Ошибка проверки товара",
        details: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
