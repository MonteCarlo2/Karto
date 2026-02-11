import { NextRequest, NextResponse } from "next/server";
import { getProductNamesFromReplicateGPT4oMini } from "@/lib/services/replicate";

/**
 * Проверка соответствия товара на фото и названия товара
 * Используется на фронтенде после загрузки фото
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const { productName, photoUrl } = body;

    if (!productName || !photoUrl) {
      return NextResponse.json({
        success: false,
        error: "Требуется название товара и фото",
      }, { status: 400 });
    }

    // Для base64 пропускаем проверку (Replicate требует URL)
    if (photoUrl.startsWith("data:")) {
      return NextResponse.json({
        success: true,
        mismatch: false,
        message: "Проверка пропущена для base64 изображения",
      });
    }

    try {
      console.log("🔍 [CHECK] Проверяю соответствие товара...");
      const recognizedNames = await getProductNamesFromReplicateGPT4oMini(photoUrl);
      
      if (recognizedNames.length > 0) {
        // Нормализуем названия для сравнения
        const normalize = (str: string) => str.toLowerCase().replace(/[^\w\s]/g, '').trim();
        const normalizedProductName = normalize(productName);
        
        // Проверяем совпадение
        const hasMatch = recognizedNames.some(recognized => {
          const normalizedRecognized = normalize(recognized);
          const productWords = normalizedProductName.split(/\s+/).filter(w => w.length > 2);
          const recognizedWords = normalizedRecognized.split(/\s+/).filter(w => w.length > 2);
          const commonWords = productWords.filter(w => recognizedWords.includes(w));
          
          return commonWords.length >= 2 || 
                 normalizedProductName.includes(normalizedRecognized.substring(0, 10)) ||
                 normalizedRecognized.includes(normalizedProductName.substring(0, 10));
        });
        
        if (!hasMatch) {
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
    } catch (error: any) {
      console.warn("⚠️ [CHECK] Ошибка проверки:", error.message);
      // Не блокируем пользователя, если проверка не удалась
      return NextResponse.json({
        success: true,
        mismatch: false,
        message: "Проверка не удалась, но продолжаем",
      });
    }
  } catch (error: any) {
    console.error("❌ [CHECK] Ошибка API:", error);
    return NextResponse.json({
      success: false,
      error: "Ошибка проверки товара",
      details: error.message,
    }, { status: 500 });
  }
}
